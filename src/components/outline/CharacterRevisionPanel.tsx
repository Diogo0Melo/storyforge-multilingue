import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Anchor,
  FileSearch,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import type { CharacterDrivenPlan, Project } from '../../lib/types'
import { parseCharacterDrivenPlanArcs } from '../../lib/types'
import { useCharacterStore } from '../../stores/character'
import { useOutlineStore } from '../../stores/outline'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { buildCharacterRevisionPrompt } from '../../lib/ai/character-revision'
import {
  applyCharacterRevisionPatches,
  buildCharacterRevisionSnapshot,
  effectiveProtectedThrough,
  parseCharacterRevisionOutput,
  type CharacterRevisionChangeType,
  type CharacterRevisionPlan,
  type CharacterRevisionScopeInput,
  type CharacterRevisionSnapshot,
  type CharacterRevisionStrategy,
} from '../../lib/story-planning/character-revision'
import AutoResizeTextarea from '../shared/AutoResizeTextarea'
import AIStreamOutput from '../shared/AIStreamOutput'
import { useDialog } from '../shared/Dialog'
import CharacterRevisionResult from './CharacterRevisionResult'

interface Props {
  project: Project
  plan: CharacterDrivenPlan | null
  onSwitchToPlanning: () => void
}

const CHANGE_LABEL_KEYS = {
  'add-character': 'panels:characterRevision.changeAddCharacter',
  'revise-arc': 'panels:characterRevision.changeReviseArc',
  'revise-ending': 'panels:characterRevision.changeReviseEnding',
  'remove-or-demote': 'panels:characterRevision.changeRemoveOrDemote',
} as const satisfies Record<CharacterRevisionChangeType, string>

const STRATEGY_LABEL_KEYS = {
  light: 'panels:characterRevision.strategyLight',
  balanced: 'panels:characterRevision.strategyBalanced',
  deep: 'panels:characterRevision.strategyDeep',
} as const satisfies Record<CharacterRevisionStrategy, string>

export default function CharacterRevisionPanel({
  project,
  plan,
  onSwitchToPlanning,
}: Props) {
  const { t } = useTranslation(['outline', 'common', 'panels'])
  const characters = useCharacterStore(state => state.characters)
  const loadOutline = useOutlineStore(state => state.loadAll)
  const dialog = useDialog()
  const ai = useAIStream(createAISessionKey(
    project.id!,
    'character-revision.analyze',
    plan?.id ?? 'no-plan',
  ))
  const analysisSnapshot = useRef<CharacterRevisionSnapshot | null>(null)
  const analysisScope = useRef<CharacterRevisionScopeInput | null>(null)

  const [snapshot, setSnapshot] = useState<CharacterRevisionSnapshot | null>(null)
  const [loadingSnapshot, setLoadingSnapshot] = useState(true)
  const [changeType, setChangeType] = useState<CharacterRevisionChangeType>('revise-arc')
  const [characterId, setCharacterId] = useState<number | null>(null)
  const [changeDescription, setChangeDescription] = useState('')
  const [protectedThrough, setProtectedThrough] = useState(0)
  const [transitionCount, setTransitionCount] = useState(10)
  const [strategy, setStrategy] = useState<CharacterRevisionStrategy>('balanced')
  const [anchorNodeIds, setAnchorNodeIds] = useState<Set<number>>(new Set())
  const [extraRequirements, setExtraRequirements] = useState('')
  const [analysis, setAnalysis] = useState<CharacterRevisionPlan | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [selectedPatchIds, setSelectedPatchIds] = useState<Set<number>>(new Set())
  const [localError, setLocalError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [resultMessage, setResultMessage] = useState<string | null>(null)

  const refreshSnapshot = async () => {
    setLoadingSnapshot(true)
    try {
      const next = await buildCharacterRevisionSnapshot(project.id!)
      setSnapshot(next)
      setProtectedThrough(current => Math.max(current, next.lastWrittenOrdinal))
    } finally {
      setLoadingSnapshot(false)
    }
  }

  useEffect(() => {
    void refreshSnapshot()
  }, [project.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (ai.isStreaming || !ai.output || !analysisSnapshot.current || !analysisScope.current) return
    const parsed = parseCharacterRevisionOutput(ai.output, analysisSnapshot.current, analysisScope.current)
    if (!parsed) {
      setLocalError(t('revision.invalidJson'))
      return
    }
    setAnalysis(parsed)
    const preferred = parsed.options.find(
      option => option.intensity === analysisScope.current?.strategy,
    ) ?? parsed.options[0]
    setSelectedOptionId(preferred?.id ?? null)
    setSelectedPatchIds(new Set(preferred?.patches.map(patch => patch.outlineNodeId) ?? []))
  }, [ai.isStreaming, ai.output])

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
    setSelectedOptionId(null)
    setSelectedPatchIds(new Set())
    try {
      const requestedScope = currentScope()
      const prepared = await buildCharacterRevisionPrompt({
        projectId: project.id!,
        plan,
        scope: requestedScope,
      })
      analysisSnapshot.current = prepared.snapshot
      analysisScope.current = requestedScope
      setSnapshot(prepared.snapshot)
      await ai.start(prepared.messages, undefined, {
        category: 'outline.character-revision',
        projectId: project.id!,
      })
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t('revision.prepareFailed'))
    }
  }

  const handleApply = async () => {
    if (!selectedOption) return
    const patches = selectedOption.patches.filter(patch => selectedPatchIds.has(patch.outlineNodeId))
    if (!patches.length) return
    const confirmed = await dialog.confirm({
      title: t('revision.applyConfirmTitle', { count: patches.length }),
      message: t('revision.applyConfirmMessage'),
      confirmText: t('revision.applyToOutline'),
    })
    if (!confirmed) return
    setApplying(true)
    setResultMessage(null)
    try {
      const capturedScope = analysisScope.current
      const protectedBoundary = Math.max(
        effectiveBoundary,
        capturedScope?.protectedThroughOrdinal ?? 0,
      )
      const protectedAnchors = new Set([
        ...anchorNodeIds,
        ...(capturedScope?.anchorNodeIds ?? []),
      ])
      const result = await applyCharacterRevisionPatches({
        projectId: project.id!,
        protectedThroughOrdinal: protectedBoundary,
        anchorNodeIds: [...protectedAnchors],
        patches,
      })
      await loadOutline(project.id!)
      await refreshSnapshot()
      setResultMessage(
        t('revision.appliedCount', { count: result.appliedOutlineNodeIds.length })
        + (result.skipped.length ? t('revision.skippedCount', { count: result.skipped.length }) : ''),
      )
      if (result.appliedOutlineNodeIds.length) {
        setSelectedPatchIds(current => {
          const next = new Set(current)
          result.appliedOutlineNodeIds.forEach(id => next.delete(id))
          return next
        })
      }
    } finally {
      setApplying(false)
    }
  }

  const handleCopy = async () => {
    if (!analysis) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(analysis, null, 2))
      setResultMessage(t('characterRevision.copySuccess'))
    } catch {
      setResultMessage(t('characterRevision.copyFailed'))
    }
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
          <h2 className="text-lg font-semibold text-text-primary">{t('characterRevision.panelTitle')}</h2>
          <p className="text-[11px] text-text-muted">{t('characterRevision.panelSubtitle')}</p>
        </div>
        <div className="ml-auto flex rounded-lg border border-border bg-bg-base p-0.5">
          <button onClick={onSwitchToPlanning} className="px-3 py-1.5 text-xs text-text-muted rounded">
            {t('characterRevision.planMode')}
          </button>
          <button className="px-3 py-1.5 text-xs bg-accent text-white rounded">
            {t('characterRevision.replanMode')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-border bg-bg-surface p-4">
            <h3 className="text-sm font-medium text-text-primary">{t('characterRevision.step1Title')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs text-text-muted">
                {t('characterRevision.changeTypeLabel')}
                <select
                  value={changeType}
                  onChange={event => setChangeType(event.target.value as CharacterRevisionChangeType)}
                  className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-2 text-sm text-text-primary"
                  aria-label={t('characterRevision.changeTypeAria')}
                >
                  {(Object.keys(CHANGE_LABEL_KEYS) as Array<keyof typeof CHANGE_LABEL_KEYS>).map((value) => (
                    <option key={value} value={value}>{t(CHANGE_LABEL_KEYS[value])}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-text-muted">
                {t('characterRevision.targetCharacter')}
                <select
                  value={characterId ?? ''}
                  onChange={event => setCharacterId(event.target.value ? Number(event.target.value) : null)}
                  className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-2 text-sm text-text-primary"
                  aria-label={t('characterRevision.targetCharacterAria')}
                >
                  <option value="">{t('characterRevision.noCharacterSpecified')}</option>
                  {characters.map(character => (
                    <option key={character.id} value={character.id}>{character.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <AutoResizeTextarea
              value={changeDescription}
              onChange={event => setChangeDescription(event.target.value)}
              placeholder={t('characterRevision.changeDescPlaceholder')}
              className="w-full rounded border border-border bg-bg-base px-3 py-2 text-sm text-text-primary"
              minRows={4}
            />
            <AutoResizeTextarea
              value={extraRequirements}
              onChange={event => setExtraRequirements(event.target.value)}
              placeholder={t('characterRevision.extraReqPlaceholder')}
              className="w-full rounded border border-border bg-bg-base px-3 py-2 text-sm text-text-primary"
              minRows={2}
            />
            {plan && (
              <p className="text-xs text-text-muted">
                {t('characterRevision.referencePlan')}<span className="text-text-primary">{plan.name} · v{plan.version}</span>
              </p>
            )}
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-bg-surface p-4">
            <h3 className="text-sm font-medium text-text-primary">{t('characterRevision.step2Title')}</h3>
            {loadingSnapshot ? (
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Loader2 className="w-4 h-4 animate-spin" />{t('characterRevision.readingChapterOrder')}
              </div>
            ) : snapshot ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded bg-green-500/10 p-2 text-green-700">
                    <strong className="block text-base">{snapshot.writtenChapterCount}</strong>{t('characterRevision.hasText')}
                  </div>
                  <div className="rounded bg-accent/10 p-2 text-accent">
                    <strong className="block text-base">{snapshot.plannedChapterCount}</strong>{t('characterRevision.hasOutline')}
                  </div>
                  <div className="rounded bg-amber-500/10 p-2 text-amber-700">
                    <strong className="block text-base">{snapshot.lastWrittenOrdinal}</strong>{t('characterRevision.writtenToOrdinal')}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-xs text-text-muted">
                    {t('characterRevision.protectUntilChapter')}
                    <input
                      type="number"
                      min={snapshot.lastWrittenOrdinal}
                      max={snapshot.plannedChapterCount}
                      value={effectiveBoundary}
                      onChange={event => setProtectedThrough(Number(event.target.value))}
                      className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-2 text-sm text-text-primary"
                      aria-label={t('characterRevision.protectAria')}
                    />
                  </label>
                  <label className="text-xs text-text-muted">
                    {t('characterRevision.transitionChapters')}
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={transitionCount}
                      onChange={event => setTransitionCount(Math.max(0, Number(event.target.value)))}
                      className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-2 text-sm text-text-primary"
                      aria-label={t('characterRevision.transitionAria')}
                    />
                  </label>
                </div>
                <label className="block text-xs text-text-muted">
                  {t('characterRevision.outlineStrategy')}
                  <select
                    value={strategy}
                    onChange={event => setStrategy(event.target.value as CharacterRevisionStrategy)}
                    className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-2 text-sm text-text-primary"
                    aria-label={t('characterRevision.strategyAria')}
                  >
                    {(Object.keys(STRATEGY_LABEL_KEYS) as Array<keyof typeof STRATEGY_LABEL_KEYS>).map((value) => (
                      <option key={value} value={value}>{t(STRATEGY_LABEL_KEYS[value])}</option>
                    ))}
                  </select>
                </label>
                {!snapshot.writtenChapterCount && (
                  <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700">
                    {t('characterRevision.noTextWarning')}
                  </div>
                )}
                {!snapshot.hasChapterMemory && snapshot.writtenChapterCount > 0 && (
                  <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700">
                    {t('characterRevision.noMemoryWarning')}
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
              <h3 className="text-sm font-medium text-text-primary">{t('characterRevision.step3Title')}</h3>
              <span className="text-xs text-text-muted">{t('characterRevision.anchorHint')}</span>
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
                    <strong className="text-text-primary">{t('characterRevision.chapterOrdinal', { ordinal: chapter.ordinal, title: chapter.title })}</strong>
                    <span className="mt-0.5 block line-clamp-2 text-text-muted">{chapter.summary || t('characterRevision.noSummary')}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleAnalyze}
            disabled={!snapshot || !changeDescription.trim() || ai.isStreaming}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {ai.isStreaming
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Sparkles className="w-4 h-4" />}
            {ai.isStreaming ? t('characterRevision.analyzing') : t('characterRevision.analyzeAndGenerate')}
          </button>
          <div className="inline-flex items-center gap-1.5 text-xs text-text-muted">
            <ShieldCheck className="w-4 h-4 text-green-600" />
            {t('characterRevision.analysisSafe')}
          </div>
        </div>

        {(ai.output || ai.isStreaming || ai.error) && (
          <AIStreamOutput
            output={ai.output}
            isStreaming={ai.isStreaming}
            error={ai.error}
            tokenUsage={ai.tokenUsage}
            onStop={ai.stop}
            onRetry={handleAnalyze}
            placeholder={t('characterRevision.analysisPlaceholder')}
            moduleKey="plot.character-revision"
          />
        )}

        {localError && (
          <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
            {localError}
          </div>
        )}

        {analysis && (
          <CharacterRevisionResult
            analysis={analysis}
            selectedOptionId={selectedOptionId}
            selectedPatchIds={selectedPatchIds}
            applying={applying}
            onSelectOption={setSelectedOptionId}
            onTogglePatch={togglePatch}
            onCopy={handleCopy}
            onApply={handleApply}
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
