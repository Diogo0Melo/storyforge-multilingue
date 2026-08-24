import { useEffect, useMemo, useState } from 'react'
import {
  Anchor,
  FileSearch,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import type { CharacterDrivenPlan, Project, WorkspaceScope } from '../../lib/types'
import { parseCharacterDrivenPlanArcs } from '../../lib/types'
import { useCharacterStore } from '../../stores/character'
import { useOutlineStore } from '../../stores/outline'
import {
  buildCharacterRevisionSnapshot,
  effectiveProtectedThrough,
  type CharacterRevisionChangeType,
  type CharacterRevisionPlan,
  type CharacterRevisionScopeInput,
  type CharacterRevisionSnapshot,
  type CharacterRevisionStrategy,
} from '../../lib/story-planning/character-revision'
import {
  decideCharacterRevisionCandidateV1,
  parseCharacterRevisionCandidateDraftV1,
  serializeCharacterRevisionCandidateV1,
  type CharacterRevisionCandidateV1,
  type CharacterRevisionCopilotSnapshotV1,
} from '../../lib/agent/character-revision-copilot'
import type { MasterCopilotController } from '../agent/useMasterCopilot'
import AutoResizeTextarea from '../shared/AutoResizeTextarea'
import { useDialog } from '../shared/Dialog'
import { useDomainT, type DomainTFunction } from '../../i18n'
import CharacterRevisionResult from './CharacterRevisionResult'

interface Props {
  project: Project
  plan: CharacterDrivenPlan | null
  copilot: MasterCopilotController
  onSwitchToPlanning: () => void
}

function getChangeLabels(t: DomainTFunction): Record<CharacterRevisionChangeType, string> {
  return {
    'add-character': t('revision.changeLabels.add-character'),
    'revise-arc': t('revision.changeLabels.revise-arc'),
    'revise-ending': t('revision.changeLabels.revise-ending'),
    'remove-or-demote': t('revision.changeLabels.remove-or-demote'),
  }
}

function getStrategyLabels(t: DomainTFunction): Record<CharacterRevisionStrategy, string> {
  return {
    light: t('revision.strategyLabels.light'),
    balanced: t('revision.strategyLabels.balanced'),
    deep: t('revision.strategyLabels.deep'),
  }
}

export default function CharacterRevisionPanel({
  project,
  plan,
  copilot,
  onSwitchToPlanning,
}: Props) {
  const { t } = useDomainT('outline')
  const characters = useCharacterStore(state => state.characters)
  const loadOutline = useOutlineStore(state => state.loadAll)
  const dialog = useDialog()
  const workspaceScope = useMemo<WorkspaceScope | undefined>(() => (
    project.id != null && project.activeWorldId != null && project.activeWorkId != null
      ? { projectId: project.id, worldId: project.activeWorldId, workId: project.activeWorkId }
      : undefined
  ), [project.activeWorkId, project.activeWorldId, project.id])
  const scopeInput = workspaceScope ?? project.id!

  const [snapshot, setSnapshot] = useState<CharacterRevisionSnapshot | null>(null)
  const [loadingSnapshot, setLoadingSnapshot] = useState(true)
  const [changeType, setChangeType] = useState<CharacterRevisionChangeType>('revise-arc')
  const [characterId, setCharacterId] = useState<number | null>(null)
  const changeLabels = useMemo(() => getChangeLabels(t), [t])
  const strategyLabels = useMemo(() => getStrategyLabels(t), [t])
  const [changeDescription, setChangeDescription] = useState('')
  const [protectedThrough, setProtectedThrough] = useState(0)
  const [transitionCount, setTransitionCount] = useState(10)
  const [strategy, setStrategy] = useState<CharacterRevisionStrategy>('balanced')
  const [anchorNodeIds, setAnchorNodeIds] = useState<Set<number>>(new Set())
  const [extraRequirements, setExtraRequirements] = useState('')
  const [analysis, setAnalysis] = useState<CharacterRevisionPlan | null>(null)
  const [parsedCandidate, setParsedCandidate] = useState<CharacterRevisionCandidateV1 | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [selectedPatchIds, setSelectedPatchIds] = useState<Set<number>>(new Set())
  const [localError, setLocalError] = useState<string | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const pendingRevisionCandidates = copilot.pendingCandidates.filter(candidate => (
    candidate.payload.skillId === 'outline.character-revision'
    && candidate.payload.characterRevisionRequest?.planId === (plan?.id ?? null)
  ))
  const activeCandidate = pendingRevisionCandidates[0] ?? null
  const hasOtherPendingCandidates = copilot.pendingCandidates.some(candidate => candidate !== activeCandidate)

  const refreshSnapshot = async () => {
    setLoadingSnapshot(true)
    try {
      const next = await buildCharacterRevisionSnapshot(scopeInput)
      setSnapshot(next)
      setProtectedThrough(current => Math.max(current, next.lastWrittenOrdinal))
    } finally {
      setLoadingSnapshot(false)
    }
  }

  useEffect(() => {
    setAnalysis(null)
    setParsedCandidate(null)
    setSelectedOptionId(null)
    setSelectedPatchIds(new Set())
    void refreshSnapshot()
  }, [scopeInput]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (characterId != null && characters.some(character => character.id === characterId)) return
    const planArc = parseCharacterDrivenPlanArcs(plan?.arcs).find(arc =>
      arc.characterId != null && characters.some(character => character.id === arc.characterId),
    )
    const fallback = characters.find(character => character.roleWeight === 'main') ?? characters[0]
    setCharacterId(planArc?.characterId ?? fallback?.id ?? null)
  }, [characters, plan?.id, characterId, plan?.arcs])

  const selectedCharacter = characters.find(character => character.id === characterId)
  const effectiveBoundary = snapshot
    ? effectiveProtectedThrough(snapshot, protectedThrough)
    : protectedThrough
  const anchorCandidates = useMemo(
    () => snapshot?.chapters.filter(chapter => chapter.ordinal > effectiveBoundary) ?? [],
    [snapshot, effectiveBoundary],
  )
  const selectedOption = analysis?.options.find(option => option.id === selectedOptionId) ?? null

  useEffect(() => {
    if (!activeCandidate) {
      setAnalysis(null)
      setParsedCandidate(null)
      setSelectedOptionId(null)
      setSelectedPatchIds(new Set())
      return
    }
    try {
      const parsed = parseCharacterRevisionCandidateDraftV1(
        activeCandidate.event.content,
        activeCandidate.payload.baseSnapshot as CharacterRevisionCopilotSnapshotV1,
      )
      setParsedCandidate(parsed)
      setAnalysis(parsed.plan)
      const preferred = parsed.decision
        ? parsed.plan.options.find(option => option.id === parsed.decision!.optionId)
        : parsed.plan.options.find(option => (
            option.intensity === activeCandidate.payload.characterRevisionRequest?.strategy
          )) ?? parsed.plan.options[0]
      setSelectedOptionId(preferred?.id ?? null)
      setSelectedPatchIds(new Set(
        parsed.decision?.outlineNodeIds ?? preferred?.patches.map(patch => patch.outlineNodeId) ?? [],
      ))
      setLocalError(null)
    } catch (error) {
      setAnalysis(null)
      setParsedCandidate(null)
      setLocalError(error instanceof Error ? error.message : t('revision.invalidRecoveredCandidate'))
    }
  }, [activeCandidate, t])

  useEffect(() => {
    if (!selectedOption) return
    setSelectedPatchIds(new Set(selectedOption.patches.map(patch => patch.outlineNodeId)))
  }, [selectedOptionId]) // eslint-disable-line react-hooks/exhaustive-deps

  function currentScope(): CharacterRevisionScopeInput {
    return {
      changeType,
      characterId,
      characterName: selectedCharacter?.name ?? '',
      changeDescription,
      protectedThroughOrdinal: effectiveBoundary,
      transitionChapterCount: transitionCount,
      strategy,
      anchorNodeIds: [...anchorNodeIds],
      extraRequirements,
    }
  }

  const handleAnalyze = async () => {
    if (!snapshot || !changeDescription.trim()) return
    setLocalError(null)
    setResultMessage(null)
    setAnalysis(null)
    setParsedCandidate(null)
    setSelectedOptionId(null)
    setSelectedPatchIds(new Set())
    try {
      const requestedScope = currentScope()
      await copilot.submitTargetedRequest(
        '分析当前角色变更对已写事实、角色状态、故事线和未来大纲的影响，并生成三档可审查方案。',
        {
          agentId: 'outline',
          skillId: 'outline.character-revision',
          instruction: '分析当前角色变更对已写事实、角色状态、故事线和未来大纲的影响，并生成三档可审查方案。',
          characterRevisionRequest: {
            planId: plan?.id ?? null,
            ...requestedScope,
          },
        },
      )
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t('revision.prepareFailed'))
    }
  }

  const handleApply = async () => {
    if (!selectedOption || !parsedCandidate || !activeCandidate) return
    const patches = selectedOption.patches.filter(patch => selectedPatchIds.has(patch.outlineNodeId))
    if (!patches.length) return
    const confirmed = await dialog.confirm({
      title: t('revision.applyConfirmTitle', { count: patches.length }),
      message: t('revision.applyConfirmMessage'),
      confirmText: t('revision.applyConfirmButton'),
    })
    if (!confirmed) return
    setResultMessage(null)
    try {
      const decided = decideCharacterRevisionCandidateV1(
        parsedCandidate,
        selectedOption.id,
        patches.map(patch => patch.outlineNodeId),
      )
      const draft = serializeCharacterRevisionCandidateV1(decided)
      await copilot.updateCandidate(activeCandidate.event.id!, draft)
      const adopted = await copilot.adoptCandidate({
        ...activeCandidate,
        event: { ...activeCandidate.event, content: draft },
        payload: { ...activeCandidate.payload },
      })
      if (!adopted) return
      await loadOutline(scopeInput)
      await refreshSnapshot()
      setResultMessage(t('revision.applyResult', { count: patches.length, applied: patches.length }))
      setSelectedPatchIds(new Set())
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t('revision.applyFailed'))
    }
  }

  const handleCopy = async () => {
    if (!analysis) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(analysis, null, 2))
      setResultMessage(t('revision.copySuccess'))
    } catch {
      setResultMessage(t('revision.copyPermissionError'))
    }
  }

  const handleReject = async () => {
    if (!activeCandidate) return
    const rejected = await copilot.rejectCandidate(activeCandidate)
    if (!rejected) return
    setResultMessage(t('revision.rejectResult'))
  }

  const toggleAnchor = (nodeId: number) => {
    setAnchorNodeIds(current => {
      const next = new Set(current)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  const togglePatch = (nodeId: number) => {
    setSelectedPatchIds(current => {
      const next = new Set(current)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-bg-surface">
        <FileSearch className="w-5 h-5 text-accent" />
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{t('revision.headerTitle')}</h2>
          <p className="text-[11px] text-text-muted">{t('revision.headerSubtitle')}</p>
        </div>
        <div className="ml-auto flex rounded-lg border border-border bg-bg-base p-0.5">
          <button onClick={onSwitchToPlanning} className="px-3 py-1.5 text-xs text-text-muted rounded">
            {t('characterDriven.modePlanning')}
          </button>
          <button className="px-3 py-1.5 text-xs bg-accent text-white rounded">
            {t('characterDriven.modeRevision')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-border bg-bg-surface p-4">
            <h3 className="text-sm font-medium text-text-primary">{t('revision.stepDescribe')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs text-text-muted">
                {t('revision.changeTypeLabel')}
                <select
                  value={changeType}
                  onChange={event => setChangeType(event.target.value as CharacterRevisionChangeType)}
                  className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-2 text-sm text-text-primary"
                  aria-label={t('revision.changeTypeAria')}
                >
                  {Object.entries(changeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-text-muted">
                {t('revision.targetCharacterLabel')}
                <select
                  value={characterId ?? ''}
                  onChange={event => setCharacterId(event.target.value ? Number(event.target.value) : null)}
                  className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-2 text-sm text-text-primary"
                  aria-label={t('revision.targetCharacterAria')}
                >
                  <option value="">{t('revision.unspecifiedCharacter')}</option>
                  {characters.map(character => (
                    <option key={character.id} value={character.id}>{character.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <AutoResizeTextarea
              value={changeDescription}
              onChange={event => setChangeDescription(event.target.value)}
              placeholder={t('revision.changeDescriptionPlaceholder')}
              className="w-full rounded border border-border bg-bg-base px-3 py-2 text-sm text-text-primary"
              minRows={4}
            />
            <AutoResizeTextarea
              value={extraRequirements}
              onChange={event => setExtraRequirements(event.target.value)}
              placeholder={t('revision.extraRequirementsPlaceholder')}
              className="w-full rounded border border-border bg-bg-base px-3 py-2 text-sm text-text-primary"
              minRows={2}
            />
            {plan && (
              <p className="text-xs text-text-muted">
                {t('revision.referencePlan')}<span className="text-text-primary">{plan.name} · v{plan.version}</span>
              </p>
            )}
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-bg-surface p-4">
            <h3 className="text-sm font-medium text-text-primary">{t('revision.stepScope')}</h3>
            {loadingSnapshot ? (
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Loader2 className="w-4 h-4 animate-spin" />{t('revision.readingOrdinals')}
              </div>
            ) : snapshot ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded bg-green-500/10 p-2 text-green-700">
                    <strong className="block text-base">{snapshot.writtenChapterCount}</strong>{t('revision.statWritten')}
                  </div>
                  <div className="rounded bg-accent/10 p-2 text-accent">
                    <strong className="block text-base">{snapshot.plannedChapterCount}</strong>{t('revision.statPlanned')}
                  </div>
                  <div className="rounded bg-amber-500/10 p-2 text-amber-700">
                    <strong className="block text-base">{snapshot.lastWrittenOrdinal}</strong>{t('revision.statLastOrdinal')}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-xs text-text-muted">
                    {t('revision.protectThroughLabel')}
                    <input
                      type="number"
                      min={snapshot.lastWrittenOrdinal}
                      max={snapshot.plannedChapterCount}
                      value={effectiveBoundary}
                      onChange={event => setProtectedThrough(Number(event.target.value))}
                      className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-2 text-sm text-text-primary"
                      aria-label={t('revision.protectThroughAria')}
                    />
                  </label>
                  <label className="text-xs text-text-muted">
                    {t('revision.transitionCountLabel')}
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={transitionCount}
                      onChange={event => setTransitionCount(Math.max(0, Number(event.target.value)))}
                      className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-2 text-sm text-text-primary"
                      aria-label={t('revision.transitionCountAria')}
                    />
                  </label>
                </div>
                <label className="block text-xs text-text-muted">
                  {t('revision.strategyLabel')}
                  <select
                    value={strategy}
                    onChange={event => setStrategy(event.target.value as CharacterRevisionStrategy)}
                    className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-2 text-sm text-text-primary"
                    aria-label={t('revision.strategyAria')}
                  >
                    {Object.entries(strategyLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                {!snapshot.writtenChapterCount && (
                  <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700">
                    {t('revision.noWrittenWarning')}
                  </div>
                )}
                {!snapshot.hasChapterMemory && snapshot.writtenChapterCount > 0 && (
                  <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700">
                    {t('revision.missingMemoryWarning')}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </section>

        {anchorCandidates.length > 0 && (
          <section className="rounded-lg border border-border bg-bg-surface p-4">
            <div className="mb-3 flex items-center gap-2">
              <Anchor className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-medium text-text-primary">{t('revision.anchorsSection')}</h3>
              <span className="text-xs text-text-muted">{t('revision.anchorsHint')}</span>
            </div>
            <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {anchorCandidates.map(chapter => (
                <label key={chapter.outlineNodeId} className="flex items-start gap-2 rounded border border-border p-2 text-xs">
                  <input
                    type="checkbox"
                    checked={anchorNodeIds.has(chapter.outlineNodeId)}
                    onChange={() => toggleAnchor(chapter.outlineNodeId)}
                    className="mt-0.5 accent-accent"
                  />
                  <span>
                    <strong className="text-text-primary">{`${chapter.title}`}</strong>
                    <span className="mt-0.5 block line-clamp-2 text-text-muted">{chapter.summary || t('revision.anchorNoSummary')}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleAnalyze}
            disabled={
              !snapshot
              || !changeDescription.trim()
              || copilot.loading
              || copilot.busy
              || copilot.pendingCandidates.length > 0
            }
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {copilot.busy
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Sparkles className="w-4 h-4" />}
            {copilot.busy ? t('revision.analyzing') : t('revision.analyzeButton')}
          </button>
          {copilot.busy && (
            <button
              onClick={copilot.stop}
              className="rounded border border-border px-3 py-2 text-xs text-text-muted"
            >
              {t('revision.stop')}
            </button>
          )}
          {copilot.recoveryAvailable && !copilot.busy && (
            <button
              onClick={() => { void copilot.resume() }}
              className="rounded border border-border px-3 py-2 text-xs text-text-muted"
            >
              {t('revision.resume')}
            </button>
          )}
          <div className="inline-flex items-center gap-1.5 text-xs text-text-muted">
            <ShieldCheck className="w-4 h-4 text-green-600" />
            {t('revision.analysisSafeNote')}
          </div>
        </div>

        {(localError || copilot.error) && (
          <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
            {localError || copilot.error}
          </div>
        )}

        {hasOtherPendingCandidates && (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
            {t('revision.otherPending')}
          </div>
        )}

        {analysis && (
          <CharacterRevisionResult
            analysis={analysis}
            selectedOptionId={selectedOptionId}
            selectedPatchIds={selectedPatchIds}
            applying={copilot.busy}
            onSelectOption={setSelectedOptionId}
            onTogglePatch={togglePatch}
            onCopy={handleCopy}
            onApply={handleApply}
            onReject={() => { void handleReject() }}
          />
        )}

        {resultMessage && (
          <div className="rounded border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-700">
            {resultMessage}
          </div>
        )}
      </div>
    </div>
  )
}
