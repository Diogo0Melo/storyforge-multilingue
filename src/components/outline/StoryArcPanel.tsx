/**
 * 故事线面板 — Phase B2
 * 展示/编辑全局故事线（主线+支线），支持 {t('common:generate')}
 */
import { useState, useEffect } from 'react'
import { useDomainT, type DomainTFunction } from '../../i18n'
import { Plus, Sparkles, Loader2, Trash2, GripVertical, X, ChevronDown, ChevronRight } from 'lucide-react'
import { useStoryArcStore } from '../../stores/story-arc'
import { useWorldviewStore } from '../../stores/worldview'
import { useOutlineStore } from '../../stores/outline'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { buildStoryArcPrompt, parseStoryArcResult } from '../../lib/ai/adapters/story-arc-adapter'
import { assembleContext } from '../../lib/registry/assemble-context'
import { CInput } from '../shared/CompositionInput'
import { CTextarea } from '../shared/CompositionInput'
import AIStreamOutput from '../shared/AIStreamOutput'
import { useDialog } from '../shared/Dialog'
import type { Project, StoryArc, StoryArcType } from '../../lib/types'
import { parseStages, stringifyStages, type StoryStage } from '../../lib/types/story-arc'
import { nanoid } from 'nanoid'
import StorylineProgressPanel from './StorylineProgressPanel'

interface Props {
  project: Project
}

export default function StoryArcPanel({ project }: Props) {
  const { t } = useDomainT('outline')
  const dialog = useDialog()
  const { arcs, activeArcId, loadAll, setActiveArc, addArc, updateArc, deleteArc, updateStages } = useStoryArcStore()
  const { storyCore, loadAll: loadWorldview } = useWorldviewStore()
  const { nodes, loadAll: loadOutline } = useOutlineStore()
  const ai = useAIStream(createAISessionKey(project.id!, 'story-arc.generate'))
  const [genType, setGenType] = useState<StoryArcType>('main')

  useEffect(() => {
    loadAll(project.id!)
    loadWorldview(project.id!)
    loadOutline(project.id!)
  }, [project.id, loadAll, loadWorldview, loadOutline])

  const activeArc = arcs.find(a => a.id === activeArcId)
  const activeStages = activeArc ? parseStages(activeArc.stages) : []

  // 新建空故事线
  const handleAddArc = async (type: StoryArcType) => {
    const name = type === 'main' ? t('storyArc.defaultMainName') : t('storyArc.defaultSubName', { index: arcs.filter(a => a.type === 'sub').length + 1 })
    const id = await addArc({
      projectId: project.id!,
      name,
      type,
      stages: '[]',
      description: '',
    })
    setActiveArc(id)
  }

  // AI 生成故事线
  const handleGenerate = async () => {
    const assembled = await assembleContext({
      projectId: project.id!,
      worldGroupId: null,
      sourceKeys: ['canonAssertions', 'worldview', 'storyCore', 'powerSystem', 'cultivationProgress', 'codex', 'characters', 'creativeRules', 'worldRules', 'historical', 'locations'],
    })
    const worldCtx = assembled.text
    const storyCoreCtx = [
      storyCore?.theme && `主题：${storyCore.theme}`,
      storyCore?.centralConflict && `核心冲突：${storyCore.centralConflict}`,
      storyCore?.logline && `Logline：${storyCore.logline}`,
      storyCore?.mainPlot && `主线：${storyCore.mainPlot}`,
    ].filter(Boolean).join('\n')

    const outlineSummary = nodes
      .filter(n => n.type === 'volume')
      .sort((a, b) => a.order - b.order)
      .map(v => `${v.title}：${v.summary || '(无摘要)'}`)
      .join('\n')

    const existingArcs = arcs.length > 0
      ? arcs.map(a => `[${a.type === 'main' ? '主线' : '支线'}] ${a.name}：${a.description || ''}`).join('\n')
      : undefined

    const messages = buildStoryArcPrompt(
      project.name, project.genre || '', worldCtx, storyCoreCtx, outlineSummary, genType, existingArcs,
    )
    const raw = await ai.start(messages, undefined, { category: 'story-arc.generate', projectId: project.id! })
    if (!raw) return

    const result = parseStoryArcResult(raw)
    if (!result) {
      console.error('[StoryArc] AI 结果解析失败')
      return
    }

    const stages: StoryStage[] = result.stages.map(s => ({
      id: nanoid(8),
      title: s.title,
      description: s.description,
      keyEvents: s.keyEvents || [],
      turningPoint: s.turningPoint,
    }))

    const id = await addArc({
      projectId: project.id!,
      name: result.name,
      type: genType,
      stages: stringifyStages(stages),
      description: result.description,
    })
    setActiveArc(id)
    ai.reset()
  }

  // 删除故事线
  const handleDeleteArc = async (id: number) => {
    const arc = arcs.find(a => a.id === id)
    if (!arc) return
    const ok = await dialog.confirm({
      title: t('storyArc.deleteTitle', { name: arc.name }),
      message: t('storyArc.deleteMessage'),
      confirmText: t('common:delete'),
      tone: 'danger',
    })
    if (!ok) return
    await deleteArc(id)
  }

  return (
    <div className="max-w-4xl">
      <h2 className="text-xl font-bold text-text-primary mb-4">{t('storyArc.heading')}</h2>

      {/* 故事线 Tab 切换 */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {arcs.map(arc => (
          <button
            key={arc.id}
            onClick={() => setActiveArc(arc.id!)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              activeArcId === arc.id
                ? 'bg-accent text-white'
                : 'bg-bg-elevated text-text-secondary hover:text-text-primary'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${arc.type === 'main' ? 'bg-amber-400' : 'bg-blue-400'}`} />
            {arc.name}
          </button>
        ))}

        {/* 新增 / AI 生成 */}
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={() => handleAddArc('main')}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-text-muted hover:text-accent transition-colors"
            title={t('storyArc.addMainTitle')}
          >
            <Plus className="w-3.5 h-3.5" /> {t('storyArc.addMain')}
          </button>
          <button
            onClick={() => handleAddArc('sub')}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-text-muted hover:text-accent transition-colors"
            title={t('storyArc.addSubTitle')}
          >
            <Plus className="w-3.5 h-3.5" /> {t('storyArc.addSub')}
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <select
            value={genType}
            onChange={e => setGenType(e.target.value as StoryArcType)}
            className="px-1 py-1 bg-bg-elevated border border-border rounded text-xs text-text-secondary"
          >
            <option value="main">{t('storyArc.generateMainOption')}</option>
            <option value="sub">{t('storyArc.generateSubOption')}</option>
          </select>
          <button
            onClick={handleGenerate}
            disabled={ai.isStreaming}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {ai.isStreaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {t('common:generate')}
          </button>
        </div>
      </div>

      {/* AI 输出 */}
      {(ai.output || ai.isStreaming || ai.error) && (
        <div className="mb-4">
          <AIStreamOutput
            output={ai.output}
            isStreaming={ai.isStreaming}
            error={ai.error}
            tokenUsage={ai.tokenUsage}
            onStop={ai.stop}
            onAccept={() => ai.reset()}
            onRetry={handleGenerate}
          />
        </div>
      )}

      {/* 故事线编辑 */}
      {activeArc ? (
        <>
          <StoryArcEditor
            t={t}
            arc={activeArc}
            stages={activeStages}
            onUpdateArc={(data) => updateArc(activeArc.id!, data)}
            onUpdateStages={(stages) => updateStages(activeArc.id!, stages)}
            onDelete={() => handleDeleteArc(activeArc.id!)}
          />
          <StorylineProgressPanel
            projectId={project.id!}
            arcs={arcs}
            onArcsChanged={() => loadAll(project.id!)}
          />
        </>
      ) : (
        <div className="text-center py-16 text-text-muted">
          <p className="text-sm mb-3">{t('storyArc.emptyStateLine1')}</p>
          <p className="text-xs">{t('storyArc.emptyStateLine2')}</p>
        </div>
      )}
    </div>
  )
}

// ── 故事线编辑器 ──

function StoryArcEditor({ arc, stages, onUpdateArc, onUpdateStages, onDelete, t }: {
  arc: NonNullable<ReturnType<typeof useStoryArcStore.getState>['arcs'][0]>
  stages: StoryStage[]
  onUpdateArc: (data: Partial<Pick<StoryArc, 'name' | 'description' | 'type'>>) => void
  onUpdateStages: (stages: StoryStage[]) => void
  onDelete: () => void
  t: DomainTFunction
}) {
  const [editName, setEditName] = useState(arc.name)
  const [editDesc, setEditDesc] = useState(arc.description || '')

  // 同步外部数据
  useEffect(() => {
    setEditName(arc.name)
    setEditDesc(arc.description || '')
  }, [arc.id, arc.name, arc.description])

  const handleAddStage = () => {
    const newStage: StoryStage = {
      id: nanoid(8),
      title: t('storyArc.defaultStageTitle', { index: stages.length + 1 }),
      description: '',
      keyEvents: [],
    }
    onUpdateStages([...stages, newStage])
  }

  const handleUpdateStage = (idx: number, data: Partial<StoryStage>) => {
    const updated = stages.map((s, i) => i === idx ? { ...s, ...data } : s)
    onUpdateStages(updated)
  }

  const handleDeleteStage = (idx: number) => {
    onUpdateStages(stages.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-4">
      {/* 故事线基本信息 */}
      <div className="bg-bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <span className={`w-3 h-3 rounded-full ${arc.type === 'main' ? 'bg-amber-400' : 'bg-blue-400'}`} />
          <CInput
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={() => onUpdateArc({ name: editName })}
            className="flex-1 text-lg font-bold bg-transparent text-text-primary border-none focus:outline-none"
          />
          <span className="text-xs px-2 py-0.5 bg-bg-elevated text-text-muted rounded">
            {arc.type === 'main' ? t('storyArc.mainLabel') : t('storyArc.subLabel')}
          </span>
          <button onClick={onDelete} className="p-1 text-text-muted hover:text-error transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        <CTextarea
          value={editDesc}
          onChange={e => setEditDesc(e.target.value)}
          onBlur={() => onUpdateArc({ description: editDesc })}
          placeholder={t('storyArc.descriptionPlaceholder')}
          className="w-full h-16 p-2 bg-bg-base border border-border rounded text-sm text-text-secondary resize-y focus:outline-none focus:border-accent"
        />
      </div>

      {/* 时间线可视化 + 阶段列表 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-secondary">{t('storyArc.stagesHeading', { count: stages.length })}</h3>
          <button
            onClick={handleAddStage}
            className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> {t('storyArc.addStage')}
          </button>
        </div>

        {/* 进度条可视化 */}
        {stages.length > 0 && (
          <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-bg-elevated">
            {stages.map((s, i) => (
              <div
                key={s.id}
                className="flex-1 rounded-full"
                style={{
                  backgroundColor: `hsl(${30 + i * (300 / stages.length)}, 60%, 50%)`,
                }}
                title={s.title}
              />
            ))}
          </div>
        )}

        {/* 阶段编辑卡片 */}
        {stages.map((stage, idx) => (
          <StageCard
            t={t}
            key={stage.id}
            stage={stage}
            index={idx}
            total={stages.length}
            onUpdate={(data) => handleUpdateStage(idx, data)}
            onDelete={() => handleDeleteStage(idx)}
          />
        ))}

        {stages.length === 0 && (
          <div className="text-center py-8 text-text-muted text-sm border border-dashed border-border rounded-lg">
            {t('storyArc.noStages')}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 单个阶段卡片 ──

function StageCard({ stage, index, total, onUpdate, onDelete, t }: {
  stage: StoryStage
  index: number
  total: number
  onUpdate: (data: Partial<StoryStage>) => void
  onDelete: () => void
  t: DomainTFunction
}) {
  const [expanded, setExpanded] = useState(false)
  const [newEvent, setNewEvent] = useState('')

  const addEvent = () => {
    if (!newEvent.trim()) return
    onUpdate({ keyEvents: [...stage.keyEvents, newEvent.trim()] })
    setNewEvent('')
  }

  const removeEvent = (i: number) => {
    onUpdate({ keyEvents: stage.keyEvents.filter((_, idx) => idx !== i) })
  }

  const stageColor = `hsl(${30 + index * (300 / total)}, 60%, 50%)`

  return (
    <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
      {/* 头部 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-bg-hover transition-colors"
      >
        <div className="flex items-center gap-2 shrink-0">
          <GripVertical className="w-3.5 h-3.5 text-text-muted/40" />
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: stageColor }}>
            {index + 1}
          </div>
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{stage.title}</p>
          {!expanded && stage.description && (
            <p className="text-xs text-text-muted truncate">{stage.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {stage.turningPoint && (
            <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/15 text-amber-400 rounded">{t('storyArc.turningPointBadge')}</span>
          )}
          {stage.keyEvents.length > 0 && (
            <span className="text-[10px] text-text-muted">{t('storyArc.eventCount', { count: stage.keyEvents.length })}</span>
          )}
          {expanded ? <ChevronDown className="w-4 h-4 text-text-muted" /> : <ChevronRight className="w-4 h-4 text-text-muted" />}
        </div>
      </button>

      {/* 展开编辑 */}
      {expanded && (
        <div className="p-3 pt-0 space-y-3 border-t border-border">
          {/* 标题 */}
          <CInput
            value={stage.title}
            onChange={e => onUpdate({ title: e.target.value })}
            placeholder={t('storyArc.stageTitlePlaceholder')}
            className="w-full px-2 py-1.5 bg-bg-base border border-border rounded text-sm font-medium text-text-primary focus:outline-none focus:border-accent"
          />

          {/* 描述 */}
          <CTextarea
            value={stage.description}
            onChange={e => onUpdate({ description: e.target.value })}
            placeholder={t('storyArc.stageDescriptionPlaceholder')}
            className="w-full h-20 p-2 bg-bg-base border border-border rounded text-sm text-text-secondary resize-y focus:outline-none focus:border-accent"
          />

          {/* 转折点 */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">{t('storyArc.turningPointLabel')}</label>
            <CInput
              value={stage.turningPoint || ''}
              onChange={e => onUpdate({ turningPoint: e.target.value || undefined })}
              placeholder={t('storyArc.turningPointPlaceholder')}
              className="w-full px-2 py-1.5 bg-bg-base border border-border rounded text-xs text-text-secondary focus:outline-none focus:border-accent"
            />
          </div>

          {/* 关键事件 */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">{t('storyArc.keyEventsLabel', { count: stage.keyEvents.length })}</label>
            <div className="space-y-1">
              {stage.keyEvents.map((ev, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-xs text-text-secondary flex-1">{ev}</span>
                  <button onClick={() => removeEvent(i)} className="p-0.5 text-text-muted hover:text-error">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <div className="flex gap-1.5">
                <CInput
                  value={newEvent}
                  onChange={e => setNewEvent(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addEvent()}
                  placeholder={t('storyArc.addEventPlaceholder')}
                  className="flex-1 px-2 py-1 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
                />
                <button onClick={addEvent} disabled={!newEvent.trim()}
                  className="px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded disabled:opacity-40">
                  {t('storyArc.addEvent')}
                </button>
              </div>
            </div>
          </div>

          {/* 删除按钮 */}
          <div className="flex justify-end pt-1">
            <button onClick={onDelete} className="flex items-center gap-1 px-2 py-1 text-xs text-error/60 hover:text-error transition-colors">
              <Trash2 className="w-3 h-3" /> {t('storyArc.deleteStage')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
