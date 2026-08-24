/**
 * Phase 26.3 — 角色驱动剧情面板
 *
 * 用户为选中的角色设定初始/目标状态 → AI 生成中间情节大纲 → 可批量导入到大纲
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Sparkles, Trash2, Check, ChevronDown, ChevronRight,
  Users, BookOpen, Loader2, ArrowRight, Copy, Plus, Pencil, Power,
} from 'lucide-react'
import { useCharacterStore } from '../../stores/character'
import { useOutlineStore } from '../../stores/outline'
import { useCharacterDrivenPlanStore } from '../../stores/character-driven-plan'
import AutoResizeTextarea from '../shared/AutoResizeTextarea'
import { useDialog } from '../shared/Dialog'
import type { Project, WorkspaceScope } from '../../lib/types'
import {
  parseCharacterDrivenPlanArcs,
  parseCharacterDrivenPlotVolumes,
  type CharacterDrivenPlanArc,
  type CharacterDrivenPlotVolume,
} from '../../lib/types'
import { characterAxesLabel } from '../../lib/character/character-axes'
import { adoptCharacterDrivenVolumes } from '../../lib/story-planning/character-driven-adoption'
import { useDomainT } from '../../i18n'
import { projectCharacterDrivenPlanStatus } from '../../i18n/display-projection'
import CharacterRevisionPanel from './CharacterRevisionPanel'
import { useMasterCopilot } from '../agent/useMasterCopilot'

type CharacterArcInput = CharacterDrivenPlanArc
type PlotVolume = CharacterDrivenPlotVolume

interface Props {
  project: Project
  worldGroupId: number | null
}

export function applyCharacterArcAutoFill(
  arc: CharacterArcInput,
  character: { background?: string; arc?: string },
): CharacterArcInput {
  return {
    ...arc,
    initialState: arc.initialState || character.background || '',
    targetState: arc.targetState || character.arc || '',
  }
}

export default function CharacterDrivenPlotPanel({ project, worldGroupId }: Props) {
  const { t } = useDomainT('outline')
  const { characters, loadAll: loadChars } = useCharacterStore()
  const { loadAll: loadOutline } = useOutlineStore()
  const {
    plans,
    currentPlanId,
    activePlanId,
    loading: plansLoading,
    loadAll: loadPlans,
    selectPlan,
    createPlan,
    copyAsNewVersion,
    renamePlan,
    saveInputs,
    markAdopted,
    setActivePlan,
    deletePlan,
  } = useCharacterDrivenPlanStore()
  const workspaceScope = useMemo<WorkspaceScope | undefined>(() => (
    project.id != null && project.activeWorldId != null && project.activeWorkId != null
      ? { projectId: project.id, worldId: project.activeWorldId, workId: project.activeWorkId }
      : undefined
  ), [project.activeWorkId, project.activeWorldId, project.id])
  const scopeInput = workspaceScope ?? project.id!
  const copilot = useMasterCopilot({ project, worldGroupId })
  const dialog = useDialog()

  const [mode, setMode] = useState<'planning' | 'revision'>('planning')
  const [arcs, setArcs] = useState<CharacterArcInput[]>([])
  const [userHint, setUserHint] = useState('')
  const [parsedVolumes, setParsedVolumes] = useState<PlotVolume[] | null>(null)
  const [selectedVolumes, setSelectedVolumes] = useState<Set<number>>(new Set())
  const [expandedVolumes, setExpandedVolumes] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState(false)

  useEffect(() => { loadChars(scopeInput) }, [loadChars, scopeInput])
  useEffect(() => { loadOutline(scopeInput) }, [loadOutline, scopeInput])
  useEffect(() => { loadPlans(scopeInput) }, [loadPlans, scopeInput])

  const currentPlan = useMemo(
    () => plans.find(plan => plan.id === currentPlanId) ?? null,
    [plans, currentPlanId],
  )
  const selectedPlanId = currentPlan?.id ?? null
  const selectedPlanCreatedAt = currentPlan?.createdAt ?? null
  const selectedPlanGeneratedVolumes = currentPlan?.generatedVolumes ?? null
  const selectedPlanStatus = currentPlan?.status ?? null
  const selectedPlanInputsRef = useRef<{ arcs: string | null; userHint: string }>({
    arcs: null,
    userHint: '',
  })
  selectedPlanInputsRef.current = {
    arcs: currentPlan?.arcs ?? null,
    userHint: currentPlan?.userHint ?? '',
  }

  // Hydrate author inputs only when selecting/loading a different immutable plan
  // identity. Same-plan async saves update the store object and must not replay an
  // older blur snapshot over newer local typing.
  useEffect(() => {
    const selectedPlanInputs = selectedPlanInputsRef.current
    if (selectedPlanId == null || selectedPlanInputs.arcs == null) {
      setArcs([])
      setUserHint('')
      return
    }
    const nextArcs = parseCharacterDrivenPlanArcs(selectedPlanInputs.arcs)
    setArcs(nextArcs)
    setUserHint(selectedPlanInputs.userHint)
  }, [selectedPlanId, selectedPlanCreatedAt])

  useEffect(() => {
    if (selectedPlanGeneratedVolumes == null) {
      setParsedVolumes(null)
      return
    }
    const nextVolumes = parseCharacterDrivenPlotVolumes(selectedPlanGeneratedVolumes)
    setParsedVolumes(nextVolumes.length ? nextVolumes : null)
    setSelectedVolumes(new Set(nextVolumes.map((_, index) => index)))
    setExpandedVolumes(new Set(nextVolumes.map((_, index) => index)))
    setImportDone(selectedPlanStatus === 'adopted')
  }, [selectedPlanGeneratedVolumes, selectedPlanId, selectedPlanStatus])

  const persistInputs = async (nextArcs: CharacterArcInput[], nextHint = userHint) => {
    if (currentPlan?.id == null) return
    const characterIds = new Set(characters.flatMap(character =>
      character.id == null ? [] : [character.id],
    ))
    const normalized = nextArcs.map(arc => ({
      ...arc,
      characterId: arc.characterId != null && characterIds.has(arc.characterId)
        ? arc.characterId
        : null,
    }))
    if (normalized.some((arc, index) => arc.characterId !== nextArcs[index]?.characterId)) {
      setArcs(normalized)
    }
    await saveInputs(currentPlan.id, { arcs: normalized, userHint: nextHint })
  }

  // 可选角色列表（排除已添加的）
  const availableChars = useMemo(() => {
    const addedIds = new Set(arcs.map(a => a.characterId))
    return characters.filter(c =>
      c.id != null && !addedIds.has(c.id) &&
      (c.roleWeight === 'main' || c.roleWeight === 'secondary'),
    )
  }, [characters, arcs])

  // 添加角色弧光
  const handleAddArc = (charId: number) => {
    const ch = characters.find(c => c.id === charId)
    if (!ch) return
    const next = [...arcs, {
      characterId: charId,
      name: ch.name,
      role: characterAxesLabel(ch),
      initialState: '',
      targetState: '',
    }]
    setArcs(next)
    persistInputs(next)
  }

  // 从角色已有信息预填
  const handleAutoFill = (index: number) => {
    const arc = arcs[index]
    const ch = characters.find(c => c.id === arc.characterId)
    if (!ch) return
    const updates = applyCharacterArcAutoFill(arc, ch)
    const next = arcs.map((a, i) => i === index ? updates : a)
    setArcs(next)
    persistInputs(next)
  }

  // 删除弧光
  const handleRemoveArc = (index: number) => {
    const next = arcs.filter((_, i) => i !== index)
    setArcs(next)
    persistInputs(next)
  }

  // 更新弧光字段
  const handleUpdateArc = (index: number, field: 'initialState' | 'targetState', value: string) => {
    const next = arcs.map((a, i) => i === index ? { ...a, [field]: value } : a)
    setArcs(next)
  }

  // 开始生成
  const handleGenerate = async () => {
    if (!currentPlan?.id || arcs.length === 0 || arcs.some(a => !a.initialState.trim() || !a.targetState.trim())) return
    await saveInputs(currentPlan.id, { arcs, userHint })
    await copilot.submitTargetedRequest(
      '依据当前角色驱动方案的起始状态、目标状态和作者要求，编排与既有主线一致的卷章方案。',
      {
        agentId: 'outline',
        skillId: 'outline.character-driven',
        instruction: '依据当前角色驱动方案的起始状态、目标状态和作者要求，编排与既有主线一致的卷章方案。',
        characterDrivenPlanId: currentPlan.id,
      },
    )
  }

  // 采纳 → 写入大纲
  const handleAcceptToOutline = async () => {
    if (!parsedVolumes || selectedVolumes.size === 0) return
    setImporting(true)
    try {
      const selected = Array.from(selectedVolumes)
        .sort((a, b) => a - b)
        .flatMap(index => parsedVolumes[index] ? [parsedVolumes[index]] : [])
      await adoptCharacterDrivenVolumes({ projectId: project.id!, scope: workspaceScope, volumes: selected })
      if (currentPlan?.id != null) await markAdopted(currentPlan.id)
      await loadOutline(scopeInput)
      setImportDone(true)
    } finally {
      setImporting(false)
    }
  }

  // 切换卷展开
  const toggleExpand = (idx: number) => {
    setExpandedVolumes(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  // 切换卷选中
  const toggleSelect = (idx: number) => {
    setSelectedVolumes(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const canGenerate = currentPlan != null
    && arcs.length > 0
    && arcs.every(a => a.initialState.trim() && a.targetState.trim())
    && !copilot.loading
    && !copilot.busy
    && copilot.pendingCandidates.length === 0
    && (project.enableMultiWorld !== true || worldGroupId != null)

  const pendingCharacterDrivenCandidates = copilot.pendingCandidates.filter(candidate => (
    candidate.payload.skillId === 'outline.character-driven'
    && candidate.payload.characterDrivenPlanId === currentPlan?.id
  ))
  const hasOtherPendingCandidates = copilot.pendingCandidates.some(candidate => (
    candidate.payload.skillId !== 'outline.character-driven'
    || candidate.payload.characterDrivenPlanId !== currentPlan?.id
  ))
  const planSelectionDisabled = copilot.busy
  const planMutationDisabled = copilot.busy || copilot.pendingCandidates.length > 0

  const handleConfirmCandidate = async (
    candidate: typeof pendingCharacterDrivenCandidates[number],
  ) => {
    await copilot.adoptCandidate(candidate)
    await loadPlans(scopeInput)
  }

  const handleCreatePlan = async () => {
    await createPlan(project.id!)
  }

  const handleCopyPlan = async () => {
    if (!currentPlan?.id) return
    await copyAsNewVersion(currentPlan.id)
  }

  const handleRenamePlan = async () => {
    if (!currentPlan?.id) return
    const name = await dialog.prompt({
      title: t('characterDriven.renamePromptTitle'),
      defaultValue: currentPlan.name,
      placeholder: t('characterDriven.renamePromptPlaceholder'),
    })
    if (name?.trim()) await renamePlan(currentPlan.id, name)
  }

  const handleDeletePlan = async () => {
    if (!currentPlan?.id || !await dialog.confirm({
      title: t('characterDriven.deletePlanTitle', { name: currentPlan.name }),
      message: t('characterDriven.deletePlanMessage'),
      confirmText: t('common:delete'),
      tone: 'danger',
    })) return
    await deletePlan(currentPlan.id)
  }

  if (mode === 'revision') {
    return (
      <CharacterRevisionPanel
        project={project}
        plan={currentPlan}
        copilot={copilot}
        onSwitchToPlanning={() => setMode('planning')}
      />
    )
  }

  if (!currentPlan) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-bg-surface">
          <Users className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">{t('characterDriven.headerTitle')}</h2>
          <span className="text-xs text-text-muted ml-2">{t('characterDriven.headerSubtitle')}</span>
          <div className="ml-auto flex rounded-lg border border-border bg-bg-base p-0.5">
            <button className="px-3 py-1.5 text-xs bg-accent text-white rounded">{t('characterDriven.modePlanning')}</button>
            <button onClick={() => setMode('revision')} className="px-3 py-1.5 text-xs text-text-muted rounded">
              {t('characterDriven.modeRevision')}
            </button>
          </div>
        </div>
        <div className="flex-1 grid place-items-center p-6">
          <div className="max-w-md text-center border border-dashed border-border rounded-xl p-8">
            <BookOpen className="w-10 h-10 mx-auto mb-3 text-accent opacity-70" />
            <h3 className="text-base font-medium text-text-primary">{t('characterDriven.createFirstTitle')}</h3>
            <p className="text-xs text-text-muted mt-2 mb-4">
              {t('characterDriven.createFirstBody')}
            </p>
            <button
              onClick={handleCreatePlan}
              disabled={plansLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm disabled:opacity-40"
            >
              {plansLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {t('characterDriven.createPlan')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 顶部标题 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-bg-surface">
        <Users className="w-5 h-5 text-accent" />
        <h2 className="text-lg font-semibold text-text-primary">{t('characterDriven.headerTitle')}</h2>
        <span className="text-xs text-text-muted ml-2">{t('characterDriven.headerSubtitle')}</span>
        <div className="ml-auto flex rounded-lg border border-border bg-bg-base p-0.5">
          <button className="px-3 py-1.5 text-xs bg-accent text-white rounded">{t('characterDriven.modePlanning')}</button>
          <button onClick={() => setMode('revision')} className="px-3 py-1.5 text-xs text-text-muted rounded">
            {t('characterDriven.modeRevision')}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border bg-bg-base">
        <select
          value={currentPlan.id}
          disabled={planSelectionDisabled}
          onChange={event => selectPlan(Number(event.target.value))}
          className="min-w-48 text-xs bg-bg-surface border border-border rounded px-2 py-1.5 text-text-primary"
          aria-label={t('characterDriven.planSelectAria')}
        >
          {plans.map(plan => (
            <option key={plan.id} value={plan.id}>
              {plan.name} · v{plan.version} · {projectCharacterDrivenPlanStatus(t, plan.status)}
            </option>
          ))}
        </select>
        <button onClick={handleCreatePlan} disabled={planMutationDisabled} className="inline-flex items-center gap-1 text-xs text-accent disabled:opacity-40">
          <Plus className="w-3.5 h-3.5" />{t('characterDriven.createPlan')}
        </button>
        <button onClick={handleCopyPlan} disabled={planMutationDisabled} className="inline-flex items-center gap-1 text-xs text-accent disabled:opacity-40">
          <Copy className="w-3.5 h-3.5" />{t('characterDriven.copyAsNewVersion')}
        </button>
        <button onClick={handleRenamePlan} disabled={planMutationDisabled} className="inline-flex items-center gap-1 text-xs text-text-muted disabled:opacity-40">
          <Pencil className="w-3.5 h-3.5" />{t('characterDriven.rename')}
        </button>
        <button onClick={handleDeletePlan} disabled={planMutationDisabled} className="inline-flex items-center gap-1 text-xs text-red-500 disabled:opacity-40">
          <Trash2 className="w-3.5 h-3.5" />{t('common:delete')}
        </button>
        <button
          onClick={() => setActivePlan(project.id!, activePlanId === currentPlan.id ? null : currentPlan.id!)}
          className={`ml-auto inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
            activePlanId === currentPlan.id
              ? 'bg-green-500/15 text-green-600'
              : 'bg-bg-surface text-text-muted border border-border'
          }`}
          title={t('characterDriven.activeReferenceTooltip')}
        >
          <Power className="w-3.5 h-3.5" />
          {activePlanId === currentPlan.id ? t('characterDriven.activeReference') : t('characterDriven.setActive')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* ── 角色弧光设定区 ─────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-text-primary">{t('characterDriven.arcSectionTitle')}</h3>
            {availableChars.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  className="text-xs bg-bg-base border border-border rounded px-2 py-1 text-text-primary"
                  value=""
                  onChange={e => {
                    const id = Number(e.target.value)
                    if (id) handleAddArc(id)
                  }}
                >
                  <option value="">{t('characterDriven.addCharacterPlaceholder')}</option>
                  {availableChars.map(c => (
                    <option key={c.id} value={c.id}>
                      {t('characterDriven.optionFormat', { name: c.name, axes: characterAxesLabel(c) })}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {arcs.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-sm border border-dashed border-border rounded-lg">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>{t('characterDriven.emptyArcsPrompt')}</p>
              <p className="text-xs mt-1">{t('characterDriven.emptyArcsHint')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {arcs.map((arc, i) => (
                <div key={`${arc.characterId ?? 'snapshot'}-${i}`} className="bg-bg-surface border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const current = arc.characterId == null
                          ? null
                          : characters.find(character => character.id === arc.characterId)
                        return (
                          <>
                            <span className="text-sm font-medium text-text-primary">{current?.name ?? arc.name}</span>
                            {current && current.name !== arc.name && (
                              <span className="text-[11px] text-text-muted">{t('characterDriven.snapshotLabel', { name: arc.name })}</span>
                            )}
                            {!current && (
                              <span className="text-[11px] text-amber-600">{t('characterDriven.deletedCharacterNotice')}</span>
                            )}
                          </>
                        )
                      })()}
                      <span className="text-xs px-1.5 py-0.5 bg-bg-hover rounded text-text-muted">{arc.role}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleAutoFill(i)}
                        className="text-xs text-accent hover:underline"
                        title={t('characterDriven.autoFillTitle')}
                      >
                        {t('characterDriven.autoFill')}
                      </button>
                      <button
                        onClick={() => handleRemoveArc(i)}
                        className="p-1 text-text-muted hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-text-muted mb-1">
                        {t('characterDriven.initialStateLabel')}
                      </label>
                      <AutoResizeTextarea
                        value={arc.initialState}
                        onChange={e => handleUpdateArc(i, 'initialState', e.target.value)}
                        onBlur={() => persistInputs(arcs)}
                        placeholder={t('characterDriven.initialStatePlaceholder')}
                        className="w-full text-sm bg-bg-base border border-border rounded px-3 py-2 text-text-primary placeholder:text-text-muted resize-none"
                        minRows={2}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-text-muted mb-1">
                        {t('characterDriven.targetStateLabel')}
                      </label>
                      <AutoResizeTextarea
                        value={arc.targetState}
                        onChange={e => handleUpdateArc(i, 'targetState', e.target.value)}
                        onBlur={() => persistInputs(arcs)}
                        placeholder={t('characterDriven.targetStatePlaceholder')}
                        className="w-full text-sm bg-bg-base border border-border rounded px-3 py-2 text-text-primary placeholder:text-text-muted resize-none"
                        minRows={2}
                      />
                    </div>
                  </div>

                  {/* 弧光方向指示 */}
                  {arc.initialState && arc.targetState && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
                      <span className="truncate max-w-[40%]">{arc.initialState.slice(0, 30)}...</span>
                      <ArrowRight className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                      <span className="truncate max-w-[40%]">{arc.targetState.slice(0, 30)}...</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 额外提示 ─────────────────────────────── */}
        {arcs.length > 0 && (
          <section>
            <label className="block text-xs text-text-muted mb-1">{t('characterDriven.extraRequirementsLabel')}</label>
            <AutoResizeTextarea
              value={userHint}
              onChange={e => {
                const next = e.target.value
                setUserHint(next)
              }}
              onBlur={() => persistInputs(arcs, userHint)}
              placeholder={t('characterDriven.extraRequirementsPlaceholder')}
              className="w-full text-sm bg-bg-base border border-border rounded px-3 py-2 text-text-primary placeholder:text-text-muted resize-none"
              minRows={2}
            />
          </section>
        )}

        {/* ── 生成按钮 ──────────────────────────────── */}
        {arcs.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {copilot.busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {copilot.busy ? t('characterDriven.generating') : t('characterDriven.generatePlot')}
            </button>
            {copilot.busy && (
              <button
                onClick={copilot.stop}
                className="text-xs text-text-muted hover:text-red-500 transition-colors"
              >
                {t('characterDriven.stop')}
              </button>
            )}
            {copilot.recoveryAvailable && !copilot.busy && (
              <button
                onClick={() => { void copilot.resume() }}
                className="text-xs text-accent hover:underline"
              >
                {t('characterDriven.resume')}
              </button>
            )}
          </div>
        )}

        {copilot.error && (
          <p className="rounded border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">
            {copilot.error}
          </p>
        )}

        {hasOtherPendingCandidates && (
          <p className="rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-secondary">
            {t('characterDriven.otherPending')}
          </p>
        )}

        {pendingCharacterDrivenCandidates.map(candidate => (
          <section
            key={candidate.event.id}
            className="border border-accent/30 bg-bg-surface p-4 rounded-lg"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-text-primary">{t('characterDriven.candidateTitle', { label: candidate.payload.label })}</h3>
              <span className="text-[11px] text-text-muted">
                {candidate.payload.contextEvidence
                  ? t('characterDriven.contextTokens', { count: candidate.payload.contextEvidence.estimatedInputTokens.toLocaleString() })
                  : t('characterDriven.contextSources', { count: candidate.payload.contextSources.length })}
              </span>
            </div>
            <AutoResizeTextarea
              aria-label={t('characterDriven.candidateAria')}
              value={candidate.event.content}
              disabled={copilot.busy}
              onChange={event => {
                void copilot.updateCandidate(candidate.event.id!, event.target.value)
              }}
              className="min-h-72 w-full resize-y bg-bg-base border border-border px-3 py-2 font-mono text-xs leading-5 text-text-primary rounded"
              minRows={14}
            />
            {candidate.payload.contextEvidence && (
              <details className="mt-2 border border-border/60 bg-bg-base px-3 py-2 text-[11px] text-text-muted rounded">
                <summary className="cursor-pointer text-text-secondary">{t('characterDriven.inputEvidence')}</summary>
                <p className="mt-2 break-words">
                  {t('characterDriven.evidenceIncluded', { items: candidate.payload.contextEvidence.included.join('、') || t('characterDriven.none') })}
                </p>
                {candidate.payload.contextEvidence.trimmed.length > 0 && (
                  <p className="mt-1 text-warning">
                    {t('characterDriven.evidenceTrimmed', { items: candidate.payload.contextEvidence.trimmed.join('、') })}
                  </p>
                )}
              </details>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                disabled={copilot.busy}
                onClick={() => { void copilot.rejectCandidate(candidate) }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-hover hover:text-text-primary rounded disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('characterDriven.reject')}
              </button>
              <button
                type="button"
                disabled={copilot.busy}
                onClick={() => { void handleConfirmCandidate(candidate) }}
                className="flex items-center gap-1 bg-accent px-3 py-1.5 text-xs text-white hover:opacity-90 rounded disabled:opacity-50"
              >
                {copilot.busy
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Check className="h-3.5 w-3.5" />}
                {t('characterDriven.saveCandidate')}
              </button>
            </div>
          </section>
        ))}

        {/* ── 解析结果预览 ─────────────────────────── */}
        {parsedVolumes && parsedVolumes.length > 0 && (
          <section className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-bg-surface border-b border-border">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-text-primary">
                  {t('characterDriven.resultSummary', { volumes: parsedVolumes.length, chapters: parsedVolumes.reduce((s, v) => s + v.chapters.length, 0) })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedVolumes(
                    selectedVolumes.size === parsedVolumes.length
                      ? new Set()
                      : new Set(parsedVolumes.map((_, i) => i)),
                  )}
                  className="text-xs text-accent hover:underline"
                >
                  {selectedVolumes.size === parsedVolumes.length ? t('characterDriven.deselectAll') : t('characterDriven.selectAll')}
                </button>
              </div>
            </div>

            <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
              {parsedVolumes.map((vol, vi) => (
                <div key={vi}>
                  {/* 卷标题行 */}
                  <div
                    className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-bg-hover transition-colors"
                    onClick={() => toggleExpand(vi)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedVolumes.has(vi)}
                      onChange={() => toggleSelect(vi)}
                      onClick={e => e.stopPropagation()}
                      className="accent-accent"
                    />
                    {expandedVolumes.has(vi) ? (
                      <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
                    )}
                    <span className="text-sm font-medium text-text-primary">{vol.volumeTitle}</span>
                    <span className="text-xs text-text-muted">{t('metaWrapper', { text: t('characterDriven.chapterCount', { count: vol.chapters.length }) })}</span>
                  </div>

                  {/* 卷摘要 + 角色弧光 */}
                  {expandedVolumes.has(vi) && (
                    <div className="px-4 pb-2">
                      {vol.volumeSummary && (
                        <p className="text-xs text-text-muted mb-1 pl-8">{vol.volumeSummary}</p>
                      )}
                      {vol.characterArcs && (
                        <p className="text-xs text-text-muted mb-2 pl-8 italic">{t('characterDriven.arcLabel', { text: vol.characterArcs })}</p>
                      )}
                      {/* 章节列表 */}
                      <div className="pl-8 space-y-1">
                        {vol.chapters.map((ch, ci) => (
                          <div key={ci} className="flex items-start gap-2 text-xs">
                            <span className="text-text-muted w-6 text-right flex-shrink-0">{ci + 1}.</span>
                            <div className="flex-1 min-w-0">
                              <span className="text-text-primary font-medium">{ch.title}</span>
                              {ch.summary && (
                                <span className="text-text-muted ml-1">— {ch.summary}</span>
                              )}
                              {ch.keyCharacters.length > 0 && (
                                <span className="text-accent ml-1">
                                  [{ch.keyCharacters.join(', ')}]
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 导入按钮 */}
            <div className="flex items-center justify-between px-4 py-3 bg-bg-surface border-t border-border">
              {importDone ? (
                <div className="flex items-center gap-1.5 text-green-600 text-sm">
                  <Check className="w-4 h-4" />
                  {t('characterDriven.importedSuccess')}
                </div>
              ) : (
                <button
                  onClick={handleAcceptToOutline}
                  disabled={selectedVolumes.size === 0 || importing}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {importing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  {t('characterDriven.importButton', { count: selectedVolumes.size })}
                </button>
              )}
              <span className="text-xs text-text-muted">
                {t('characterDriven.importHint')}
              </span>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
