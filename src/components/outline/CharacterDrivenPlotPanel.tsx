/**
 * Phase 26.3 — 角色驱动剧情面板
 *
 * 用户为选中的角色设定初始/目标状态 → AI 生成中间情节大纲 → 可批量导入到大纲
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Sparkles, Trash2, Check, ChevronDown, ChevronRight,
  Users, BookOpen, Loader2, ArrowRight, Copy, Plus, Pencil, Power,
} from 'lucide-react'
import { useCharacterStore } from '../../stores/character'
import { useOutlineStore } from '../../stores/outline'
import { useCharacterDrivenPlanStore } from '../../stores/character-driven-plan'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import {
  buildCharacterDrivenPlotPrompt,
  parsePlotOutput,
  type CharacterArcInput,
  type PlotVolume,
} from '../../lib/ai/character-driven-plot'
import AIStreamOutput from '../shared/AIStreamOutput'
import AutoResizeTextarea from '../shared/AutoResizeTextarea'
import { useDialog } from '../shared/Dialog'
import type { Project } from '../../lib/types'
import {
  parseCharacterDrivenPlanArcs,
  parseCharacterDrivenPlotVolumes,
} from '../../lib/types'
import { characterAxesLabel } from '../../lib/character/character-axes'
import { adoptCharacterDrivenVolumes } from '../../lib/story-planning/character-driven-adoption'
import CharacterRevisionPanel from './CharacterRevisionPanel'

interface Props {
  project: Project
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

export default function CharacterDrivenPlotPanel({ project }: Props) {
  const { t } = useTranslation(['outline', 'common'])
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
    saveGenerated,
    markAdopted,
    setActivePlan,
    deletePlan,
  } = useCharacterDrivenPlanStore()
  const ai = useAIStream(createAISessionKey(project.id!, 'character-driven-plot.generate'))
  const dialog = useDialog()
  const generationPlanId = useRef<number | null>(null)

  const [mode, setMode] = useState<'planning' | 'revision'>('planning')
  const [arcs, setArcs] = useState<CharacterArcInput[]>([])
  const [userHint, setUserHint] = useState('')
  const [parsedVolumes, setParsedVolumes] = useState<PlotVolume[] | null>(null)
  const [selectedVolumes, setSelectedVolumes] = useState<Set<number>>(new Set())
  const [expandedVolumes, setExpandedVolumes] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState(false)

  useEffect(() => { loadChars(project.id!) }, [project.id, loadChars])
  useEffect(() => { loadOutline(project.id!) }, [project.id, loadOutline])
  useEffect(() => { loadPlans(project.id!) }, [project.id, loadPlans])

  const currentPlan = useMemo(
    () => plans.find(plan => plan.id === currentPlanId) ?? null,
    [plans, currentPlanId],
  )

  useEffect(() => {
    if (!currentPlan) {
      setArcs([])
      setUserHint('')
      setParsedVolumes(null)
      return
    }
    const nextArcs = parseCharacterDrivenPlanArcs(currentPlan.arcs)
    const nextVolumes = parseCharacterDrivenPlotVolumes(currentPlan.generatedVolumes)
    setArcs(nextArcs)
    setUserHint(currentPlan.userHint)
    setParsedVolumes(nextVolumes.length ? nextVolumes : null)
    setSelectedVolumes(new Set(nextVolumes.map((_, index) => index)))
    setExpandedVolumes(new Set(nextVolumes.map((_, index) => index)))
    setImportDone(currentPlan.status === 'adopted')
  }, [currentPlan?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const persistInputs = (nextArcs: CharacterArcInput[], nextHint = userHint) => {
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
    void saveInputs(currentPlan.id, { arcs: normalized, userHint: nextHint })
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
    setParsedVolumes(null)
    setImportDone(false)
    generationPlanId.current = currentPlan.id
    await saveInputs(currentPlan.id, { arcs, userHint })

    const resolvedArcs = arcs.map(arc => {
      const character = arc.characterId == null
        ? null
        : characters.find(item => item.id === arc.characterId)
      return character
        ? { ...arc, name: character.name, role: characterAxesLabel(character) }
        : arc
    })

    const messages = await buildCharacterDrivenPlotPrompt(
      project.id!,
      project.name,
      project.genres?.join('/') || '',
      resolvedArcs,
      userHint || undefined,
    )

    await ai.start(messages, undefined, { category: 'outline.character-driven', projectId: project.id! })
  }

  // 解析 AI 输出
  useEffect(() => {
    if (!ai.isStreaming && ai.output) {
      const volumes = parsePlotOutput(ai.output)
      if (volumes.length > 0) {
        const targetPlanId = generationPlanId.current ?? currentPlanId
        if (targetPlanId != null) void saveGenerated(targetPlanId, volumes)
        if (targetPlanId === currentPlanId) {
          setParsedVolumes(volumes)
          setSelectedVolumes(new Set(volumes.map((_, i) => i)))
          setExpandedVolumes(new Set(volumes.map((_, i) => i)))
        }
      }
    }
  }, [ai.isStreaming, ai.output, currentPlanId, saveGenerated])

  // 采纳 → 写入大纲
  const handleAcceptToOutline = async () => {
    if (!parsedVolumes || selectedVolumes.size === 0) return
    setImporting(true)
    try {
      const selected = Array.from(selectedVolumes)
        .sort((a, b) => a - b)
        .flatMap(index => parsedVolumes[index] ? [parsedVolumes[index]] : [])
      await adoptCharacterDrivenVolumes({ projectId: project.id!, volumes: selected })
      if (currentPlan?.id != null) await markAdopted(currentPlan.id)
      await loadOutline(project.id!)
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
    && !ai.isStreaming

  const handleCreatePlan = async () => {
    ai.reset()
    await createPlan(project.id!)
  }

  const handleCopyPlan = async () => {
    if (!currentPlan?.id) return
    ai.reset()
    await copyAsNewVersion(currentPlan.id)
  }

  const handleRenamePlan = async () => {
    if (!currentPlan?.id) return
    const name = await dialog.prompt({
      title: t('characterDriven.renameTitle'),
      defaultValue: currentPlan.name,
      placeholder: t('characterDriven.planNamePlaceholder'),
    })
    if (name?.trim()) await renamePlan(currentPlan.id, name)
  }

  const handleDeletePlan = async () => {
    if (!currentPlan?.id || !await dialog.confirm({
      title: t('characterDriven.deleteConfirmTitle', { name: currentPlan.name }),
      message: t('characterDriven.deleteConfirmMessage'),
      confirmText: t('common:delete'),
      tone: 'danger',
    })) return
    ai.reset()
    await deletePlan(currentPlan.id)
  }

  if (mode === 'revision') {
    return (
      <CharacterRevisionPanel
        project={project}
        plan={currentPlan}
        onSwitchToPlanning={() => setMode('planning')}
      />
    )
  }

  if (!currentPlan) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-bg-surface">
          <Users className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">{t('characterDriven.title')}</h2>
          <span className="text-xs text-text-muted ml-2">{t('characterDriven.subtitle')}</span>
          <div className="ml-auto flex rounded-lg border border-border bg-bg-base p-0.5">
            <button className="px-3 py-1.5 text-xs bg-accent text-white rounded">{t('characterDriven.modeBookPlanning')}</button>
            <button onClick={() => setMode('revision')} className="px-3 py-1.5 text-xs text-text-muted rounded">
              {t('characterDriven.modeMidReplan')}
            </button>
          </div>
        </div>
        <div className="flex-1 grid place-items-center p-6">
          <div className="max-w-md text-center border border-dashed border-border rounded-xl p-8">
            <BookOpen className="w-10 h-10 mx-auto mb-3 text-accent opacity-70" />
            <h3 className="text-base font-medium text-text-primary">{t('characterDriven.createFirst')}</h3>
            <p className="text-xs text-text-muted mt-2 mb-4">
              {t('characterDriven.createFirstDesc')}
            </p>
            <button
              onClick={handleCreatePlan}
              disabled={plansLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm disabled:opacity-40"
            >
              {plansLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {t('characterDriven.newPlan')}
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
        <h2 className="text-lg font-semibold text-text-primary">{t('characterDriven.title')}</h2>
        <span className="text-xs text-text-muted ml-2">{t('characterDriven.subtitle')}</span>
        <div className="ml-auto flex rounded-lg border border-border bg-bg-base p-0.5">
          <button className="px-3 py-1.5 text-xs bg-accent text-white rounded">{t('characterDriven.modeBookPlanning')}</button>
          <button onClick={() => setMode('revision')} className="px-3 py-1.5 text-xs text-text-muted rounded">
            {t('characterDriven.modeMidReplan')}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border bg-bg-base">
        <select
          value={currentPlan.id}
          disabled={ai.isStreaming}
          onChange={event => {
            ai.reset()
            selectPlan(Number(event.target.value))
          }}
          className="min-w-48 text-xs bg-bg-surface border border-border rounded px-2 py-1.5 text-text-primary"
          aria-label={t('characterDriven.currentPlanAria')}
        >
          {plans.map(plan => (
            <option key={plan.id} value={plan.id}>
              {plan.name} · v{plan.version} · {plan.status}
            </option>
          ))}
        </select>
        <button onClick={handleCreatePlan} disabled={ai.isStreaming} className="inline-flex items-center gap-1 text-xs text-accent disabled:opacity-40">
          <Plus className="w-3.5 h-3.5" />{t('characterDriven.create')}
        </button>
        <button onClick={handleCopyPlan} disabled={ai.isStreaming} className="inline-flex items-center gap-1 text-xs text-accent disabled:opacity-40">
          <Copy className="w-3.5 h-3.5" />{t('characterDriven.copyNewVersion')}
        </button>
        <button onClick={handleRenamePlan} disabled={ai.isStreaming} className="inline-flex items-center gap-1 text-xs text-text-muted disabled:opacity-40">
          <Pencil className="w-3.5 h-3.5" />{t('characterDriven.rename')}
        </button>
        <button onClick={handleDeletePlan} disabled={ai.isStreaming} className="inline-flex items-center gap-1 text-xs text-red-500 disabled:opacity-40">
          <Trash2 className="w-3.5 h-3.5" />{t('common:delete')}
        </button>
        <button
          onClick={() => setActivePlan(project.id!, activePlanId === currentPlan.id ? null : currentPlan.id!)}
          className={`ml-auto inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
            activePlanId === currentPlan.id
              ? 'bg-green-500/15 text-green-600'
              : 'bg-bg-surface text-text-muted border border-border'
          }`}
          title={t('characterDriven.onlyActiveInjected')}
        >
          <Power className="w-3.5 h-3.5" />
          {activePlanId === currentPlan.id ? t('characterDriven.aiReferencing') : t('characterDriven.setAsReference')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* ── 角色弧光设定区 ─────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-text-primary">{t('characterDriven.arcSettings')}</h3>
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
                  <option value="">{t('characterDriven.addCharacter')}</option>
                  {availableChars.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}（{characterAxesLabel(c)}）
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {arcs.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-sm border border-dashed border-border rounded-lg">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>{t('characterDriven.promptAddFromDropdown')}</p>
              <p className="text-xs mt-1">{t('characterDriven.setStartTarget')}</p>
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
                              <span className="text-[11px] text-text-muted">{t('characterDriven.planSnapshot')}：{arc.name}</span>
                            )}
                            {!current && (
                              <span className="text-[11px] text-amber-600">{t('characterDriven.characterDeletedUseSnapshot')}</span>
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
                        {t('characterDriven.initialState')}
                      </label>
                      <AutoResizeTextarea
                        value={arc.initialState}
                        onChange={e => handleUpdateArc(i, 'initialState', e.target.value)}
                        onBlur={() => persistInputs(arcs)}
                        placeholder={t('characterDriven.initialPlaceholder')}
                        className="w-full text-sm bg-bg-base border border-border rounded px-3 py-2 text-text-primary placeholder:text-text-muted resize-none"
                        minRows={2}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-text-muted mb-1">
                        {t('characterDriven.targetState')}
                      </label>
                      <AutoResizeTextarea
                        value={arc.targetState}
                        onChange={e => handleUpdateArc(i, 'targetState', e.target.value)}
                        onBlur={() => persistInputs(arcs)}
                        placeholder={t('characterDriven.targetPlaceholder')}
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
            <label className="block text-xs text-text-muted mb-1">{t('characterDriven.extraRequirements')}</label>
            <AutoResizeTextarea
              value={userHint}
              onChange={e => {
                const next = e.target.value
                setUserHint(next)
              }}
              onBlur={() => persistInputs(arcs, userHint)}
              placeholder={t('characterDriven.extraPlaceholder')}
              className="w-full text-sm bg-bg-base border border-border rounded px-3 py-2 text-text-primary placeholder:text-text-muted resize-none"
              minRows={2}
            />
          </section>
        )}

        {/* ── 生成按钮 ──────────────────────────────── */}
        {arcs.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {ai.isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {ai.isStreaming ? t('characterDriven.generating') : t('characterDriven.generatePlot')}
            </button>
            {ai.isStreaming && (
              <button
                onClick={ai.stop}
                className="text-xs text-text-muted hover:text-red-500 transition-colors"
              >
                {t('characterDriven.stop')}
              </button>
            )}
          </div>
        )}

        {/* ── AI 输出 ──────────────────────────────── */}
        {(ai.output || ai.isStreaming || ai.error) && (
          <section>
            <AIStreamOutput
              output={ai.output}
              isStreaming={ai.isStreaming}
              error={ai.error}
              tokenUsage={ai.tokenUsage}
              onStop={ai.stop}
              onAccept={() => {
                const vols = parsePlotOutput(ai.output)
                if (vols.length > 0) {
                  void saveGenerated(currentPlan.id!, vols)
                  setParsedVolumes(vols)
                  setSelectedVolumes(new Set(vols.map((_, i) => i)))
                  setExpandedVolumes(new Set(vols.map((_, i) => i)))
                }
              }}
              onRetry={handleGenerate}
              placeholder={t('characterDriven.waitingGenerate')}
              moduleKey="plot.character-driven"
            />
          </section>
        )}

        {/* ── 解析结果预览 ─────────────────────────── */}
        {parsedVolumes && parsedVolumes.length > 0 && !ai.isStreaming && (
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
                    <span className="text-xs text-text-muted">{t('characterDriven.chaptersCount', { count: vol.chapters.length })}</span>
                  </div>

                  {/* 卷摘要 + 角色弧光 */}
                  {expandedVolumes.has(vi) && (
                    <div className="px-4 pb-2">
                      {vol.volumeSummary && (
                        <p className="text-xs text-text-muted mb-1 pl-8">{vol.volumeSummary}</p>
                      )}
                      {vol.characterArcs && (
                        <p className="text-xs text-text-muted mb-2 pl-8 italic">{t('characterDriven.arcLabel')}：{vol.characterArcs}</p>
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
                  {t('characterDriven.importSuccess')}
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
                  {t('characterDriven.importSelected', { count: selectedVolumes.size })}
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
