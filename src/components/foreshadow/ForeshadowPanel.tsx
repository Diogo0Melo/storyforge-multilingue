import { CInput, CTextarea } from '../shared/CompositionInput'
import { useState, useEffect, useMemo } from 'react'
import { Plus, Trash2, ArrowRight, Sparkles, Loader2, LayoutList, LayoutGrid, Info } from 'lucide-react'
import { useDomainT } from '../../i18n'
import { useForeshadowStore } from '../../stores/foreshadow'
import { useChapterStore } from '../../stores/chapter'
import { useOutlineStore } from '../../stores/outline'
import { useAIConfigStore } from '../../stores/ai-config'
import { resolveRequestConfig } from '../../lib/ai/client'
import { isAIConfigReady } from '../../lib/ai/config-readiness'
import {
  abandonForeshadowSuggestionRunV1,
  adoptForeshadowSuggestionCandidateV1,
  generateForeshadowSuggestionCandidateV1,
  readPendingForeshadowSuggestionCandidateV1,
  readRecoverableForeshadowSuggestionRunV1,
  rejectForeshadowSuggestionCandidateV1,
  type ForeshadowSuggestionCandidateV1,
} from '../../lib/agent/run/foreshadow-suggestions-durable'
import { resolveScopeLike } from '../../lib/world-engine/scope'
import { resolveCanonicalChapterSequence } from '../../lib/ai/chapter-memory/canonical-chapter-sequence'
import { parseForeshadowEchoChapterIds } from '../../lib/foreshadow/context'
import PromptRunPanel from '../shared/PromptRunPanel'
import ForeshadowKanban from './ForeshadowKanban'
import type { Project, Foreshadow, ForeshadowStatus, ForeshadowType } from '../../lib/types'

const STATUS_COLORS: Record<ForeshadowStatus, string> = {
  planned: 'text-text-muted',
  planted: 'text-warning',
  echoed: 'text-info',
  resolved: 'text-success',
}

const STATUS_FLOW: ForeshadowStatus[] = ['planned', 'planted', 'echoed', 'resolved']

interface Props { project: Project }

export default function ForeshadowPanel({ project }: Props) {
  const { t } = useDomainT('foreshadow')
  const { foreshadows, loadAll: loadForeshadows, addForeshadow, updateForeshadow, deleteForeshadow, updateStatus } = useForeshadowStore()
  const { chapters, loadAll: loadChapters } = useChapterStore()
  const { nodes: outlineNodes, loadAll: loadOutline } = useOutlineStore()
  const { config } = useAIConfigStore()
  const [filterStatus, setFilterStatus] = useState<ForeshadowStatus | 'all'>('all')
  const [selected, setSelected] = useState<number | null>(null)
  const [showAI, setShowAI] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban')
  const [parameterValues, setParameterValues] = useState<Record<string, unknown>>({})
  const [systemOverride, setSystemOverride] = useState<string | null>(null)
  const [userOverride, setUserOverride] = useState<string | null>(null)
  const [aiCandidate, setAICandidate] = useState<ForeshadowSuggestionCandidateV1 | null>(null)
  const [aiRunId, setAIRunId] = useState<number | null>(null)
  const [selectedCandidates, setSelectedCandidates] = useState<Set<number>>(new Set())
  const [selectionFrozen, setSelectionFrozen] = useState(false)
  const [resumeAdoption, setResumeAdoption] = useState(false)
  const [unsafeRunId, setUnsafeRunId] = useState<number | null>(null)
  const [aiBusy, setAIBusy] = useState(false)
  const [aiMessage, setAIMessage] = useState<string | null>(null)

  const STATUS_LABEL_KEYS = {
    planned: 'status.planned' as const,
    planted: 'status.planted' as const,
    echoed: 'status.echoed' as const,
    resolved: 'status.resolved' as const,
  } satisfies Record<ForeshadowStatus, string>

  const TYPE_LABEL_KEYS = {
    chekhov: 'type.chekhov' as const,
    prophecy: 'type.prophecy' as const,
    symbol: 'type.symbol' as const,
    character: 'type.character' as const,
    dialogue: 'type.dialogue' as const,
    environment: 'type.environment' as const,
    timeline: 'type.timeline' as const,
    'red-herring': 'type.red-herring' as const,
    parallel: 'type.parallel' as const,
    callback: 'type.callback' as const,
  } satisfies Record<ForeshadowType, string>

  useEffect(() => {
    loadForeshadows(project.id!)
    loadChapters(project.id!)
    loadOutline(project.id!)
  }, [project.id, loadForeshadows, loadChapters, loadOutline])

  useEffect(() => {
    if (!project.id) return
    let cancelled = false
    setAICandidate(null)
    setAIRunId(null)
    setSelectedCandidates(new Set())
    setSelectionFrozen(false)
    setResumeAdoption(false)
    setUnsafeRunId(null)
    void (async () => {
      const scope = await resolveScopeLike(project.id!)
      const pending = await readPendingForeshadowSuggestionCandidateV1({ scope })
      if (cancelled) return
      if (pending) {
        setAICandidate(pending.candidate)
        setAIRunId(pending.snapshot.run.id)
        setSelectedCandidates(new Set(pending.candidate.suggestions.map((_, index) => index)))
        setShowAI(true)
        setViewMode('list')
        setAIMessage(`已恢复 ${pending.candidate.suggestions.length} 条待确认伏笔候选；没有重复调用模型。`)
        return
      }
      const recoverable = await readRecoverableForeshadowSuggestionRunV1({ scope })
      if (cancelled || !recoverable) return
      setShowAI(true)
      setViewMode('list')
      if (recoverable.safeToResume && recoverable.candidate && recoverable.adoptionPending) {
        setAICandidate(recoverable.candidate)
        setAIRunId(recoverable.snapshot.run.id)
        setSelectedCandidates(new Set(recoverable.selectedIndexes ?? []))
        setSelectionFrozen(true)
        setResumeAdoption(true)
        setAIMessage('上次选择已冻结但尚未完成写入；继续确认会沿原运行幂等收敛，不会重复调用模型。')
      } else if (!recoverable.safeToResume) {
        setUnsafeRunId(recoverable.snapshot.run.id)
        setAIMessage('上次建议停在模型结果不可判定窗口，系统不会自动重试。请先放弃旧运行。')
      }
    })().catch(error => {
      if (!cancelled) setAIMessage(error instanceof Error ? error.message : String(error))
    })
    return () => { cancelled = true }
  }, [project.id, project.activeWorldId, project.activeWorkId])

  const projectForeshadows = useMemo(
    () => foreshadows.filter(f => f.projectId === project.id),
    [foreshadows, project.id],
  )
  const projectChapters = useMemo(
    () => chapters.filter(ch => ch.projectId === project.id && ch.id != null),
    [chapters, project.id],
  )
  const projectOutlineNodes = useMemo(
    () => outlineNodes.filter(node => node.projectId === project.id),
    [outlineNodes, project.id],
  )
  const chapterOptions = useMemo(() => {
    const { sequence } = resolveCanonicalChapterSequence(projectOutlineNodes, projectChapters)
    return sequence
      .filter(entry => entry.chapter.id != null)
      .map((entry, index) => {
        const title = (entry.chapter.title || entry.outlineNode?.title || t('messages.chapterRefFallback', { id: entry.chapter.id })).trim()
        const outlineTitle = entry.outlineNode?.title?.trim()
        const suffix = outlineTitle && outlineTitle !== title ? t('messages.chapterOutlineSuffix', { outlineTitle }) : ''
        return {
          id: entry.chapter.id!,
          label: `${index + 1}. ${title}${suffix}`,
          title,
        }
      })
  }, [projectChapters, projectOutlineNodes, t])
  const chapterOptionById = useMemo(
    () => new Map(chapterOptions.map(option => [option.id, option] as const)),
    [chapterOptions],
  )

  const filtered = filterStatus === 'all' ? projectForeshadows : projectForeshadows.filter(f => f.status === filterStatus)
  const selectedF = projectForeshadows.find(f => f.id === selected)
  const statusCounts = STATUS_FLOW.reduce<Record<ForeshadowStatus, number>>((acc, status) => {
    acc[status] = projectForeshadows.filter(f => f.status === status).length
    return acc
  }, { planned: 0, planted: 0, echoed: 0, resolved: 0 })

  const handleAdd = async () => {
    const id = await addForeshadow({
      projectId: project.id!, name: t('messages.defaultNewName'), type: 'chekhov', status: 'planned',
      description: '', plantChapterId: null, echoChapterIds: '[]', resolveChapterId: null, notes: '',
    })
    setSelected(id)
  }

  const handleUpdate = (field: keyof Foreshadow, value: string | number | null) => {
    if (selectedF?.id) updateForeshadow(selectedF.id, { [field]: value })
  }

  const handleNextStatus = (f: Foreshadow) => {
    const idx = STATUS_FLOW.indexOf(f.status)
    if (idx < STATUS_FLOW.length - 1 && f.id) {
      updateStatus(f.id, STATUS_FLOW[idx + 1])
    }
  }

  // 获取章节名称
  const getChapterLabel = (chapterId: number) => {
    const option = chapterOptionById.get(chapterId)
    if (option) return option.label
    const ch = projectChapters.find(c => c.id === chapterId)
    if (!ch) return t('messages.staleChapterRef', { id: chapterId })
    const node = projectOutlineNodes.find(n => n.id === ch.outlineNodeId)
    return t('messages.nonCanonicalChapterRef', { title: ch.title || node?.title || t('messages.chapterRefFallback', { id: chapterId }) })
  }

  // 解析 echoChapterIds
  const getEchoIds = (f: Foreshadow): number[] => {
    return parseForeshadowEchoChapterIds(f.echoChapterIds)
  }

  const renderChapterOptions = (currentId?: number | null) => (
    <>
      <option value="">{t('messages.unspecifiedOption')}</option>
      {chapterOptions.map(ch => (
        <option key={ch.id} value={ch.id}>{ch.label}</option>
      ))}
      {currentId != null && !chapterOptionById.has(currentId) && (
        <option value={currentId}>⚠ {getChapterLabel(currentId)}</option>
      )}
    </>
  )

  // 切换呼应章节
  const toggleEchoChapter = (chapterId: number) => {
    if (!selectedF) return
    const ids = getEchoIds(selectedF)
    const newIds = ids.includes(chapterId)
      ? ids.filter(id => id !== chapterId)
      : [...ids, chapterId]
    handleUpdate('echoChapterIds', JSON.stringify(newIds))
  }

  // AI 建议伏笔
  const handleAISuggest = async () => {
    if (!isAIConfigReady(resolveRequestConfig(config, { category: 'foreshadow.suggest' }).config)) return
    if (!project.id || aiCandidate || unsafeRunId != null) return
    setShowAI(true)
    setViewMode('list')
    setAIBusy(true)
    setAIMessage(null)
    try {
      const scope = await resolveScopeLike(project.id)
      const generated = await generateForeshadowSuggestionCandidateV1({
        scope,
        worldGroupId: null,
        aiConfig: config,
        options: {
          parameterValues: Object.keys(parameterValues).length > 0 ? parameterValues : undefined,
          overrides: (systemOverride != null || userOverride != null) ? {
            systemPrompt: systemOverride ?? undefined,
            userPromptTemplate: userOverride ?? undefined,
          } : undefined,
        },
      })
      setAICandidate(generated.candidate)
      setAIRunId(generated.snapshot.run.id)
      setSelectedCandidates(new Set(generated.candidate.suggestions.map((_, index) => index)))
      setSelectionFrozen(false)
      setResumeAdoption(false)
      setAIMessage(generated.candidate.suggestions.length
        ? `生成 ${generated.candidate.suggestions.length} 条严格候选；可取消不采纳项后批次确认。`
        : '没有生成可靠的新伏笔；确认空批次即可留下完整审计回执。')
    } catch (error) {
      setAIMessage(error instanceof Error ? error.message : '伏笔建议失败')
      const scope = await resolveScopeLike(project.id)
      const pending = await readPendingForeshadowSuggestionCandidateV1({ scope }).catch(() => null)
      if (pending) {
        setAICandidate(pending.candidate)
        setAIRunId(pending.snapshot.run.id)
        setSelectedCandidates(new Set(pending.candidate.suggestions.map((_, index) => index)))
        setAIMessage(`已恢复 ${pending.candidate.suggestions.length} 条待确认伏笔候选；没有重复调用模型。`)
      } else {
        const recoverable = await readRecoverableForeshadowSuggestionRunV1({ scope }).catch(() => null)
        if (recoverable?.safeToResume && recoverable.candidate && recoverable.adoptionPending) {
          setAICandidate(recoverable.candidate)
          setAIRunId(recoverable.snapshot.run.id)
          setSelectedCandidates(new Set(recoverable.selectedIndexes ?? []))
          setSelectionFrozen(true)
          setResumeAdoption(true)
        } else if (recoverable && !recoverable.safeToResume) {
          setUnsafeRunId(recoverable.snapshot.run.id)
        }
      }
    } finally {
      setAIBusy(false)
    }
  }

  const handleAcceptSuggestions = async () => {
    if (!project.id || aiRunId == null || !aiCandidate) return
    setAIBusy(true)
    setAIMessage(null)
    try {
      const scope = await resolveScopeLike(project.id)
      const result = await adoptForeshadowSuggestionCandidateV1({
        scope,
        runId: aiRunId,
        ...(resumeAdoption ? {} : { selectedIndexes: [...selectedCandidates] }),
      })
      await loadForeshadows(scope)
      setAICandidate(null)
      setAIRunId(null)
      setSelectedCandidates(new Set())
      setSelectionFrozen(false)
      setResumeAdoption(false)
      setAIMessage(`已原子写入 ${result.written} 条伏笔并完成终验。`)
    } catch (error) {
      setAIMessage(error instanceof Error ? error.message : '确认伏笔失败')
      const scope = await resolveScopeLike(project.id)
      const recoverable = await readRecoverableForeshadowSuggestionRunV1({ scope }).catch(() => null)
      if (recoverable?.safeToResume && recoverable.candidate && recoverable.adoptionPending) {
        setAICandidate(recoverable.candidate)
        setAIRunId(recoverable.snapshot.run.id)
        setSelectedCandidates(new Set(recoverable.selectedIndexes ?? []))
        setSelectionFrozen(true)
        setResumeAdoption(true)
      }
    } finally {
      setAIBusy(false)
    }
  }

  const handleRejectSuggestions = async () => {
    if (!project.id || aiRunId == null || !aiCandidate || selectionFrozen) return
    setAIBusy(true)
    try {
      const scope = await resolveScopeLike(project.id)
      await rejectForeshadowSuggestionCandidateV1({ scope, runId: aiRunId })
      setAICandidate(null)
      setAIRunId(null)
      setSelectedCandidates(new Set())
      setAIMessage('已拒绝本批候选；正式伏笔没有写入。')
    } catch (error) {
      setAIMessage(error instanceof Error ? error.message : '拒绝伏笔失败')
    } finally {
      setAIBusy(false)
    }
  }

  const handleAbandonUnsafeRun = async () => {
    if (!project.id || unsafeRunId == null || aiBusy) return
    setAIBusy(true)
    try {
      const scope = await resolveScopeLike(project.id)
      await abandonForeshadowSuggestionRunV1({ scope, runId: unsafeRunId })
      setUnsafeRunId(null)
      setAIMessage('已放弃结果不可判定的旧运行，可以重新生成。')
    } catch (error) {
      setAIMessage(error instanceof Error ? error.message : '放弃伏笔运行失败')
    } finally {
      setAIBusy(false)
    }
  }

  return (
    <div className="min-h-full bg-bg-base/30 px-8 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
      {/* 顶部工具栏 */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-text-muted">{t('panel.sectionLabel')}</p>
          <h1 className="mt-3 font-serif text-4xl font-semibold tracking-wide text-text-primary">{t('panel.pageTitle')}</h1>
          <p className="mt-3 text-sm text-text-secondary">
            {t('panel.summaryLine', {
              count: projectForeshadows.length,
              plantedCount: statusCounts.planted,
              echoedCount: statusCounts.echoed,
              resolvedCount: statusCounts.resolved,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleAISuggest}
            disabled={aiBusy || aiCandidate != null || unsafeRunId != null || !isAIConfigReady(resolveRequestConfig(config, { category: 'foreshadow.suggest' }).config)}
            className="flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-secondary transition-colors hover:text-accent disabled:opacity-40"
            title={t('panel.aiSuggestButtonTitle')}>
            {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {t('panel.aiSuggestButtonLabel')}
          </button>
          <button onClick={handleAdd}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover">
            <Plus className="w-4 h-4" /> {t('panel.addButtonLabel')}
          </button>
        </div>
      </div>

      {/* CF-6: 讲清伏笔的作用边界，避免用户以为会自动插入已写正文 */}
      <div className="flex items-start gap-2 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3 text-xs text-text-secondary">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="space-y-0.5">
          <p dangerouslySetInnerHTML={{ __html: t('panel.scopeNoticeBody1', { when: t('panel.scopeNoticeWhen') }) }} />
          <p>{t('panel.scopeNoticeBody2')}</p>
        </div>
      </div>

      <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 text-xs leading-relaxed text-text-secondary">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" />
          <div className="space-y-1">
            <p>
              <strong className="text-text-primary">{t('panel.guideStrong')}</strong>
              {t('panel.guideBody1')}
            </p>
            <p>{t('panel.guideBody2')}</p>
            <p>{t('panel.guideBody3')}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        {/* 视图切换 */}
        <div className="flex items-center gap-1 bg-bg-elevated rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md transition ${
              viewMode === 'list' ? 'bg-bg-surface text-accent shadow-sm' : 'text-text-muted hover:text-text-primary'
            }`}
            title={t('panel.viewListTitle')}
          >
            <LayoutList className="w-3.5 h-3.5" /> {t('panel.viewListLabel')}
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md transition ${
              viewMode === 'kanban' ? 'bg-bg-surface text-accent shadow-sm' : 'text-text-muted hover:text-text-primary'
            }`}
            title={t('panel.viewKanbanTitle')}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> {t('panel.viewKanbanLabel')}
          </button>
        </div>
      </div>

      {/* 看板视图 */}
      {viewMode === 'kanban' ? (
        <ForeshadowKanban onSelectForeshadow={(id) => { setSelected(id); setViewMode('list') }} />
      ) : (
      <div className="flex gap-4">
      {/* 左侧列表 */}
      <div className="w-60 shrink-0 space-y-2">

        {/* 状态筛选 */}
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setFilterStatus('all')}
            className={`px-2 py-1 text-xs rounded ${filterStatus === 'all' ? 'bg-accent text-white' : 'bg-bg-elevated text-text-muted'}`}>
            {t('panel.filterAll')}
          </button>
          {STATUS_FLOW.map(s => {
            const statusKey = STATUS_LABEL_KEYS[s]
            return (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-2 py-1 text-xs rounded ${filterStatus === s ? 'bg-accent text-white' : 'bg-bg-elevated text-text-muted'}`}>
                {t(statusKey)}
              </button>
            )
          })}
        </div>

        {filtered.map(f => (
          <button key={f.id} onClick={() => { setSelected(f.id!); setShowAI(false) }}
            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
              selected === f.id ? 'bg-accent/10 text-accent border border-accent/30' : 'bg-bg-surface text-text-secondary hover:bg-bg-hover'
            }`}>
            <div className="font-medium truncate">{f.name}</div>
            <div className="flex items-center gap-2 text-xs text-text-muted">
              {(() => {
                const typeKey = TYPE_LABEL_KEYS[f.type]
                const statusKey = STATUS_LABEL_KEYS[f.status]
                return (
                  <>
                    <span>{String(t(typeKey)).split(' ')[0]}</span>
                    <span className={STATUS_COLORS[f.status]}>{t(statusKey)}</span>
                  </>
                )
              })()}
            </div>
          </button>
        ))}
      </div>

      {/* 右侧编辑 */}
      <div className="flex-1 space-y-4">
        {/* AI 建议区域 */}
        {showAI && (
          <div className="bg-bg-surface border border-accent/20 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-accent mb-2 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> {t('panel.aiSectionTitle')}
            </h3>
            <PromptRunPanel
              moduleKey="foreshadow.generate"
              parameterValues={parameterValues}
              onParamChange={setParameterValues}
              systemOverride={systemOverride}
              onSystemOverrideChange={setSystemOverride}
              userOverride={userOverride}
              onUserOverrideChange={setUserOverride}
            />
            {aiBusy && (
              <div className="flex items-center gap-2 text-xs text-accent">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在处理伏笔候选与 durable 证据…
              </div>
            )}
            {aiMessage && <div className="text-xs text-text-muted">{aiMessage}</div>}
            {unsafeRunId != null && (
              <button onClick={handleAbandonUnsafeRun} disabled={aiBusy}
                className="rounded border border-error/40 px-3 py-1.5 text-xs text-error disabled:opacity-40">
                放弃不可判定运行
              </button>
            )}
            {aiCandidate && (
              <div className="space-y-2">
                {aiCandidate.suggestions.map((candidate, index) => (
                  <label key={`${candidate.name}:${index}`}
                    className={`block rounded-lg border p-3 ${selectedCandidates.has(index) ? 'border-accent/30 bg-accent/5' : 'border-border opacity-60'}`}>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" aria-label={`选择伏笔候选 ${index + 1}`}
                        checked={selectedCandidates.has(index)} disabled={selectionFrozen || aiBusy}
                        onChange={event => setSelectedCandidates(current => {
                          const next = new Set(current)
                          if (event.target.checked) next.add(index)
                          else next.delete(index)
                          return next
                        })} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary">{candidate.name}</p>
                        <p className="mt-0.5 text-xs text-accent">{t(TYPE_LABEL_KEYS[candidate.type])}</p>
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-text-secondary">{candidate.description}</p>
                      </div>
                    </div>
                  </label>
                ))}
                <div className="flex justify-end gap-2 pt-1">
                  {!selectionFrozen && (
                    <button onClick={handleRejectSuggestions} disabled={aiBusy}
                      className="rounded border border-border px-3 py-1.5 text-xs text-text-secondary disabled:opacity-40">
                      拒绝整批
                    </button>
                  )}
                  <button onClick={handleAcceptSuggestions}
                    aria-label="确认所选伏笔候选"
                    disabled={aiBusy || (!resumeAdoption && aiCandidate.suggestions.length > 0 && selectedCandidates.size === 0)}
                    className="rounded bg-accent px-3 py-1.5 text-xs text-white disabled:opacity-40">
                    {resumeAdoption ? '继续已冻结写入' : `确认所选（${selectedCandidates.size}）`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {selectedF ? (
          <div className="bg-bg-surface border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <CInput value={selectedF.name} onChange={e => handleUpdate('name', e.target.value)}
                className="text-lg font-bold bg-transparent text-text-primary border-none outline-none" />
              <div className="flex items-center gap-2">
                <button onClick={() => handleNextStatus(selectedF)}
                  disabled={selectedF.status === 'resolved'}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-bg-elevated text-text-secondary rounded hover:text-accent disabled:opacity-30">
                  <ArrowRight className="w-3 h-3" /> {t('panel.advanceStatusButton')}
                </button>
                <button onClick={() => { deleteForeshadow(selectedF.id!); setSelected(null) }}
                  className="text-text-muted hover:text-error"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="flex gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">{t('panel.typeLabel')}</label>
                <select value={selectedF.type} onChange={e => handleUpdate('type', e.target.value)}
                  className="px-2 py-1.5 bg-bg-elevated text-text-secondary text-xs rounded border border-border">
                  {(Object.keys(TYPE_LABEL_KEYS) as ForeshadowType[]).map(k => {
                    const typeKey = TYPE_LABEL_KEYS[k]
                    return <option key={k} value={k}>{t(typeKey)}</option>
                  })}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">{t('panel.statusLabel')}</label>
                <span className={`text-sm ${STATUS_COLORS[selectedF.status]}`}>
                  {(() => {
                    const statusKey = STATUS_LABEL_KEYS[selectedF.status]
                    return t(statusKey)
                  })()}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">{t('panel.descriptionLabel')}</label>
              <CTextarea value={selectedF.description} onChange={e => handleUpdate('description', e.target.value)}
                rows={4} className="w-full p-2 bg-bg-base border border-border rounded text-sm text-text-primary resize-y focus:outline-none focus:border-accent" />
            </div>

            {/* 章节关联区域 */}
            <div className="border-t border-border pt-3 space-y-3">
              <h4 className="text-sm font-semibold text-text-primary">{t('panel.chapterRelationHeading')}</h4>

              {/* 埋设章节 */}
              <div>
                <label className="block text-xs text-text-muted mb-1">{t('panel.plantChapterLabel')}</label>
                <select
                  value={selectedF.plantChapterId ?? ''}
                  onChange={e => handleUpdate('plantChapterId', e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-2 py-1.5 bg-bg-base border border-border rounded text-sm text-text-primary">
                  {renderChapterOptions(selectedF.plantChapterId)}
                </select>
              </div>

              {/* 呼应章节（多选） */}
              <div>
                <label className="block text-xs text-text-muted mb-1">{t('panel.echoChaptersLabel')}</label>
                {chapterOptions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-bg-base border border-border rounded">
                    {chapterOptions.map(ch => {
                      const isSelected = getEchoIds(selectedF).includes(ch.id)
                      return (
                        <button key={ch.id} onClick={() => toggleEchoChapter(ch.id)}
                          className={`px-2 py-1 text-xs rounded transition-colors ${
                            isSelected ? 'bg-accent text-white' : 'bg-bg-elevated text-text-muted hover:text-text-primary'
                          }`}>
                          {ch.label}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">{t('panel.noChaptersHint')}</p>
                )}
                {getEchoIds(selectedF).some(id => !chapterOptionById.has(id)) && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-warning">
                    {getEchoIds(selectedF).filter(id => !chapterOptionById.has(id)).map(id => (
                      <button
                        key={id}
                        onClick={() => toggleEchoChapter(id)}
                        className="rounded border border-warning/40 bg-warning/10 px-2 py-0.5 hover:bg-warning/20"
                        title={t('panel.removeStaleEchoTitle')}
                      >
                        ⚠ {getChapterLabel(id)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 回收章节 */}
              <div>
                <label className="block text-xs text-text-muted mb-1">{t('panel.resolveChapterLabel')}</label>
                <select
                  value={selectedF.resolveChapterId ?? ''}
                  onChange={e => handleUpdate('resolveChapterId', e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-2 py-1.5 bg-bg-base border border-border rounded text-sm text-text-primary">
                  {renderChapterOptions(selectedF.resolveChapterId)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">{t('panel.notesLabel')}</label>
              <CTextarea value={selectedF.notes} onChange={e => handleUpdate('notes', e.target.value)}
                rows={2} className="w-full p-2 bg-bg-base border border-border rounded text-xs text-text-muted resize-y focus:outline-none focus:border-accent" />
            </div>
          </div>
        ) : !showAI ? (
          <div className="flex items-center justify-center h-64 text-text-muted text-sm">
            {t('panel.emptySelection')}
          </div>
        ) : null}
      </div>
    </div>
      )}
      </div>
    </div>
  )
}
