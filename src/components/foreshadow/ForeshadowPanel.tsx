import { CInput, CTextarea } from '../shared/CompositionInput'
import { useState, useEffect, useMemo } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { Plus, Trash2, ArrowRight, Sparkles, Loader2, LayoutList, LayoutGrid, Info } from 'lucide-react'
import { useForeshadowStore } from '../../stores/foreshadow'
import { useChapterStore } from '../../stores/chapter'
import { useOutlineStore } from '../../stores/outline'
import { useAIConfigStore } from '../../stores/ai-config'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { buildForeshadowSuggestPrompt, buildForeshadowStructurePrompt, parseForeshadowStructured } from '../../lib/ai/adapters/foreshadow-adapter'
import { chat, resolveRequestConfig } from '../../lib/ai/client'
import { isAIConfigReady } from '../../lib/ai/config-readiness'
import { adopt } from '../../lib/registry/adopt'
import { assembleContext } from '../../lib/registry/assemble-context'
import { resolveCanonicalChapterSequence } from '../../lib/ai/chapter-memory/canonical-chapter-sequence'
import { parseForeshadowEchoChapterIds } from '../../lib/foreshadow/context'
import AIStreamOutput from '../shared/AIStreamOutput'
import PromptRunPanel from '../shared/PromptRunPanel'
import ForeshadowKanban from './ForeshadowKanban'
import type { Project, Foreshadow, ForeshadowStatus, ForeshadowType } from '../../lib/types'

const STATUS_COLORS: Record<ForeshadowStatus, string> = {
  planned: 'text-text-muted',
  planted: 'text-warning',
  echoed: 'text-info',
  resolved: 'text-success',
}

const TYPE_KEYS: Record<ForeshadowType, string> = {
  chekhov: 'foreshadow.type.chekhov',
  prophecy: 'foreshadow.type.prophecy',
  symbol: 'foreshadow.type.symbol',
  character: 'foreshadow.type.character',
  dialogue: 'foreshadow.type.dialogue',
  environment: 'foreshadow.type.environment',
  timeline: 'foreshadow.type.timeline',
  'red-herring': 'foreshadow.type.redHerring',
  parallel: 'foreshadow.type.parallel',
  callback: 'foreshadow.type.callback',
}

const STATUS_KEYS: Record<ForeshadowStatus, string> = {
  planned: 'foreshadow.status.planned',
  planted: 'foreshadow.status.planted',
  echoed: 'foreshadow.status.echoed',
  resolved: 'foreshadow.status.resolved',
}

const STATUS_FLOW: ForeshadowStatus[] = ['planned', 'planted', 'echoed', 'resolved']

interface Props { project: Project }

export default function ForeshadowPanel({ project }: Props) {
  const { t } = useTranslation('panels')
  const { foreshadows, loadAll: loadForeshadows, addForeshadow, updateForeshadow, deleteForeshadow, updateStatus } = useForeshadowStore()
  const { chapters, loadAll: loadChapters } = useChapterStore()
  const { nodes: outlineNodes, loadAll: loadOutline } = useOutlineStore()
  const { config } = useAIConfigStore()
  const ai = useAIStream(createAISessionKey(project.id!, 'foreshadow.suggest'))
  const [filterStatus, setFilterStatus] = useState<ForeshadowStatus | 'all'>('all')
  const [selected, setSelected] = useState<number | null>(null)
  const [showAI, setShowAI] = useState(() => !!(ai.output || ai.isStreaming || ai.error))
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban')
  const [parameterValues, setParameterValues] = useState<Record<string, unknown>>({})
  const [systemOverride, setSystemOverride] = useState<string | null>(null)
  const [userOverride, setUserOverride] = useState<string | null>(null)
  const [adopting, setAdopting] = useState(false)
  const [adoptMsg, setAdoptMsg] = useState<string | null>(null)

  useEffect(() => {
    loadForeshadows(project.id!)
    loadChapters(project.id!)
    loadOutline(project.id!)
  }, [project.id, loadForeshadows, loadChapters, loadOutline])

  // 采纳 AI 伏笔建议：用 AI 把自由文本结构化 → 批量写入伏笔表
  const handleAdoptForeshadows = async (text: string) => {
    if (!text.trim()) return
    setAdopting(true)
    setAdoptMsg(null)
    try {
      const raw = await chat(buildForeshadowStructurePrompt(text), config, { category: 'foreshadow.structure', projectId: project.id! })
      const items = parseForeshadowStructured(raw)
      if (items.length === 0) {
        setAdoptMsg(t('foreshadow.panel.noParsed' as any))
        return
      }
      const result = await adopt({
        projectId: project.id!,
        target: 'foreshadows',
        mode: 'add-many',
        data: items.map(it => ({
          name: it.name,
          type: it.type,
          status: 'planned',
          description: it.description,
          plantChapterId: null,
          echoChapterIds: [],
          resolveChapterId: null,
          notes: '',
        })),
      })
      await loadForeshadows(project.id!)
      setAdoptMsg(t('foreshadow.panel.adopted' as any, { count: result.written.length }) + (result.skipped.length ? t('foreshadow.panel.adoptedSkipped' as any, { count: result.skipped.length }) : ''))
      setShowAI(false)
    } catch (err) {
      setAdoptMsg(err instanceof Error ? t('foreshadow.panel.adoptFailed' as any, { error: err.message }) : t('foreshadow.panel.adoptFailedUnknown' as any))
    } finally {
      setAdopting(false)
    }
  }

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
        const title = (entry.chapter.title || entry.outlineNode?.title || t('foreshadow.panel.chapterInvalidRef' as any, { id: entry.chapter.id! })).trim()
        const outlineTitle = entry.outlineNode?.title?.trim()
        const suffix = outlineTitle && outlineTitle !== title ? t('foreshadow.panel.chapterRefOutline' as any, { title: outlineTitle }) : ''
        return {
          id: entry.chapter.id!,
          label: `${index + 1}. ${title}${suffix}`,
          title,
        }
      })
  }, [projectChapters, projectOutlineNodes])
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
      projectId: project.id!, name: t('foreshadow.panel.newForeshadow' as any), type: 'chekhov', status: 'planned',
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
    if (!ch) return t('foreshadow.panel.chapterInvalidRef' as any, { id: chapterId })
    const node = projectOutlineNodes.find(n => n.id === ch.outlineNodeId)
    const chTitle = ch.title || node?.title || t('foreshadow.panel.chapterInvalidRef' as any, { id: chapterId })
    return t('foreshadow.panel.chapterNonCanonical' as any, { title: chTitle })
  }

  // 解析 echoChapterIds
  const getEchoIds = (f: Foreshadow): number[] => {
    return parseForeshadowEchoChapterIds(f.echoChapterIds)
  }

  const renderChapterOptions = (currentId?: number | null) => (
    <>
      <option value="">{t('foreshadow.panel.notSpecified' as any)}</option>
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
    setShowAI(true)
    const assembled = await assembleContext({
      projectId: project.id!,
      worldGroupId: null,
      provider: config.provider,
      model: config.model,
      sourceKeys: ['canonAssertions', 'worldview', 'storyCore', 'powerSystem', 'cultivationProgress', 'codex', 'characters', 'creativeRules', 'worldRules', 'historical', 'locations'],
    })
    const charIdx = assembled.included.indexOf('characters')
    const worldCtx = assembled.text
    const charCtx = charIdx >= 0 ? assembled.segments[charIdx]?.content ?? '' : ''
    const existingForeshadows = projectForeshadows.map(f => `${f.name}（${t(TYPE_KEYS[f.type] as any)}，${t(STATUS_KEYS[f.status] as any)}）：${f.description.slice(0, 100)}`).join('\n')
    const opts = {
      parameterValues: Object.keys(parameterValues).length > 0 ? parameterValues : undefined,
      overrides: (systemOverride != null || userOverride != null) ? {
        systemPrompt: systemOverride ?? undefined,
        userPromptTemplate: userOverride ?? undefined,
      } : undefined,
    }
    const messages = buildForeshadowSuggestPrompt(project.name, project.genre, worldCtx, charCtx, existingForeshadows, opts)
    ai.start(messages, undefined, { category: 'foreshadow.suggest', projectId: project.id! })
  }

  return (
    <div className="min-h-full bg-bg-base/30 px-8 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
      {/* 顶部工具栏 */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-text-muted">{t('foreshadow.panel.area' as any)}</p>
          <h1 className="mt-3 font-serif text-4xl font-semibold tracking-wide text-text-primary">{t('foreshadow.panel.title' as any)}</h1>
          <p className="mt-3 text-sm text-text-secondary">
            {t('foreshadow.panel.stats' as any, { count: projectForeshadows.length, planted: statusCounts.planted, echoed: statusCounts.echoed, resolved: statusCounts.resolved })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleAISuggest}
            disabled={ai.isStreaming || !isAIConfigReady(resolveRequestConfig(config, { category: 'foreshadow.suggest' }).config)}
            className="flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-secondary transition-colors hover:text-accent disabled:opacity-40"
            title={t('foreshadow.panel.aiSuggestTitle' as any)}>
            {ai.isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {t('foreshadow.panel.aiSuggest' as any)}
          </button>
          <button onClick={handleAdd}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover">
            <Plus className="w-4 h-4" /> {t('foreshadow.panel.addNew' as any)}
          </button>
        </div>
      </div>

      {/* CF-6: 讲清伏笔的作用边界，避免用户以为会自动插入已写正文 */}
      <div className="flex items-start gap-2 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3 text-xs text-text-secondary">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="space-y-0.5">
          <p><Trans i18nKey="foreshadow.panel.infoBox1" ns="panels" components={[<strong />, <strong />]} /></p>
          <p>{t('foreshadow.panel.infoBox2' as any)}</p>
        </div>
      </div>

      <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 text-xs leading-relaxed text-text-secondary">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" />
          <div className="space-y-1">
            <p>
              <strong className="text-text-primary">{t('foreshadow.panel.infoBox3a' as any)}</strong>
              {t('foreshadow.panel.infoBox3b' as any)}
            </p>
            <p>{t('foreshadow.panel.infoBox3c' as any)}</p>
            <p>{t('foreshadow.panel.infoBox3d' as any)}</p>
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
            title={t('foreshadow.panel.listAria' as any)}
          >
            <LayoutList className="w-3.5 h-3.5" /> {t('foreshadow.panel.listView' as any)}
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md transition ${
              viewMode === 'kanban' ? 'bg-bg-surface text-accent shadow-sm' : 'text-text-muted hover:text-text-primary'
            }`}
            title={t('foreshadow.panel.kanbanAria' as any)}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> {t('foreshadow.panel.kanbanView' as any)}
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
            {t('foreshadow.panel.all' as any)}
          </button>
          {STATUS_FLOW.map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-2 py-1 text-xs rounded ${filterStatus === s ? 'bg-accent text-white' : 'bg-bg-elevated text-text-muted'}`}>
              {t(STATUS_KEYS[s] as any)}
            </button>
          ))}
        </div>

        {filtered.map(f => (
          <button key={f.id} onClick={() => { setSelected(f.id!); setShowAI(false) }}
            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
              selected === f.id ? 'bg-accent/10 text-accent border border-accent/30' : 'bg-bg-surface text-text-secondary hover:bg-bg-hover'
            }`}>
            <div className="font-medium truncate">{f.name}</div>
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span>{t(TYPE_KEYS[f.type] as any)?.split(' ')[0]}</span>
              <span className={STATUS_COLORS[f.status]}>{t(STATUS_KEYS[f.status] as any)}</span>
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
              <Sparkles className="w-4 h-4" /> {t('foreshadow.panel.aiTitle' as any)}
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
            {adopting && (
              <div className="flex items-center gap-2 text-xs text-accent">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('foreshadow.panel.aiProcessing' as any)}
              </div>
            )}
            {adoptMsg && <div className="text-xs text-text-muted">{adoptMsg}</div>}
            <AIStreamOutput
              output={ai.output}
              isStreaming={ai.isStreaming}
              error={ai.error} tokenUsage={ai.tokenUsage}
              onStop={ai.stop}
              onRetry={handleAISuggest}
              onAccept={(text: string) => { handleAdoptForeshadows(text) }}
              moduleKey="foreshadow.generate"
            />
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
                  <ArrowRight className="w-3 h-3" /> {t('foreshadow.panel.advanceStatus' as any)}
                </button>
                <button onClick={() => { deleteForeshadow(selectedF.id!); setSelected(null) }}
                  className="text-text-muted hover:text-error"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="flex gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">{t('foreshadow.panel.type' as any)}</label>
                <select value={selectedF.type} onChange={e => handleUpdate('type', e.target.value)}
                  className="px-2 py-1.5 bg-bg-elevated text-text-secondary text-xs rounded border border-border">
                  {Object.entries(TYPE_KEYS).map(([k, key]) => <option key={k} value={k}>{t(key as any)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">{t('foreshadow.panel.status' as any)}</label>
                <span className={`text-sm ${STATUS_COLORS[selectedF.status]}`}>
                  {t(STATUS_KEYS[selectedF.status] as any)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">{t('foreshadow.panel.description' as any)}</label>
              <CTextarea value={selectedF.description} onChange={e => handleUpdate('description', e.target.value)}
                rows={4} className="w-full p-2 bg-bg-base border border-border rounded text-sm text-text-primary resize-y focus:outline-none focus:border-accent" />
            </div>

            {/* 章节关联区域 */}
            <div className="border-t border-border pt-3 space-y-3">
              <h4 className="text-sm font-semibold text-text-primary">{t('foreshadow.panel.chapterLink' as any)}</h4>

              {/* 埋设章节 */}
              <div>
                <label className="block text-xs text-text-muted mb-1">{t('foreshadow.panel.plantChapter' as any)}</label>
                <select
                  value={selectedF.plantChapterId ?? ''}
                  onChange={e => handleUpdate('plantChapterId', e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-2 py-1.5 bg-bg-base border border-border rounded text-sm text-text-primary">
                  {renderChapterOptions(selectedF.plantChapterId)}
                </select>
              </div>

              {/* 呼应章节（多选） */}
              <div>
                <label className="block text-xs text-text-muted mb-1">{t('foreshadow.panel.echoChapter' as any)}</label>
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
                  <p className="text-xs text-text-muted">{t('foreshadow.panel.noChapters' as any)}</p>
                )}
                {getEchoIds(selectedF).some(id => !chapterOptionById.has(id)) && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-warning">
                    {getEchoIds(selectedF).filter(id => !chapterOptionById.has(id)).map(id => (
                      <button
                        key={id}
                        onClick={() => toggleEchoChapter(id)}
                        className="rounded border border-warning/40 bg-warning/10 px-2 py-0.5 hover:bg-warning/20"
                        title={t('foreshadow.panel.removeInvalidRef' as any)}
                      >
                        {t('foreshadow.panel.invalidChapterRef' as any, { label: getChapterLabel(id) })}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 回收章节 */}
              <div>
                <label className="block text-xs text-text-muted mb-1">{t('foreshadow.panel.resolveChapter' as any)}</label>
                <select
                  value={selectedF.resolveChapterId ?? ''}
                  onChange={e => handleUpdate('resolveChapterId', e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-2 py-1.5 bg-bg-base border border-border rounded text-sm text-text-primary">
                  {renderChapterOptions(selectedF.resolveChapterId)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">{t('foreshadow.panel.notes' as any)}</label>
              <CTextarea value={selectedF.notes} onChange={e => handleUpdate('notes', e.target.value)}
                rows={2} className="w-full p-2 bg-bg-base border border-border rounded text-xs text-text-muted resize-y focus:outline-none focus:border-accent" />
            </div>
          </div>
        ) : !showAI ? (
          <div className="flex items-center justify-center h-64 text-text-muted text-sm">
            {t('foreshadow.panel.selectOrAdd' as any)}
          </div>
        ) : null}
      </div>
    </div>
      )}
      </div>
    </div>
  )
}
