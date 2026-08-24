/**
 * 故事线面板 — Phase B2
 * 展示/编辑全局故事线（主线+支线），支持 {t('common:generate')}
 */
import { useEffect, useState } from 'react'
import { useDomainT, type DomainTFunction } from '../../i18n'
import {
  Check,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useStoryArcStore } from '../../stores/story-arc'
import { useMasterCopilot } from '../agent/useMasterCopilot'
import { CInput, CTextarea } from '../shared/CompositionInput'
import { useDialog } from '../shared/Dialog'
import type { Project, StoryArc, StoryArcType } from '../../lib/types'
import { parseStages, type StoryStage } from '../../lib/types/story-arc'
import { nanoid } from 'nanoid'
import StorylineProgressPanel from './StorylineProgressPanel'
import CreativeArtifactSummary from '../agent/CreativeArtifactSummary'
import { creativeArtifactCanAdoptV1 } from '../../lib/agent/creative-reliability'
import {
  INITIAL_RECORD_TARGET_CLASS,
  initialRecordTargetAttributes,
  useInitialRecordTarget,
} from '../shared/initial-record-target'

export interface StoryArcInitialRecordTarget {
  table: 'storyArcs' | 'storylineProgress' | 'storylineCrossings'
  recordId: number
}

interface Props {
  project: Project
  worldGroupId: number | null
  initialRecordTarget?: StoryArcInitialRecordTarget | null
}

type MasterCopilot = ReturnType<typeof useMasterCopilot>
type PendingMasterCandidate = MasterCopilot['pendingCandidates'][number]

function isStoryArcCandidate(candidate: PendingMasterCandidate): boolean {
  return candidate.payload.agentId === 'outline'
    && candidate.payload.skillId === 'outline.story-arcs'
}

function isCandidateUpdateGuarded(status: unknown): boolean {
  return status === 'updating' || status === 'failed'
}

export default function StoryArcPanel({ project, worldGroupId, initialRecordTarget }: Props) {
  const { t } = useDomainT('outline')
  const dialog = useDialog()
  const { arcs, activeArcId, loadAll, setActiveArc, addArc, updateArc, deleteArc, updateStages } = useStoryArcStore()
  const copilot = useMasterCopilot({ project, worldGroupId })
  const [genType, setGenType] = useState<StoryArcType>('main')

  useEffect(() => {
    loadAll(project.id!)
  }, [project.id, loadAll])

  const activeArc = arcs.find(a => a.id === activeArcId)
  const activeStages = activeArc ? parseStages(activeArc.stages) : []
  const initialArcId = initialRecordTarget?.table === 'storyArcs'
    ? initialRecordTarget.recordId
    : null

  useEffect(() => {
    if (initialArcId != null && arcs.some(arc => arc.id === initialArcId)) setActiveArc(initialArcId)
  }, [arcs, initialArcId, setActiveArc])
  useInitialRecordTarget(initialArcId, activeArc?.id === initialArcId)

  const pendingStoryArcCandidates = copilot.pendingCandidates.filter(isStoryArcCandidate)
  const hasOtherPendingCandidates = copilot.pendingCandidates.some(candidate => !isStoryArcCandidate(candidate))
  const quarantinedCandidates = copilot.quarantinedCandidates ?? []
  const hasQuarantinedCandidates = quarantinedCandidates.length > 0
  const arcWriteGuarded = copilot.busy
    || hasQuarantinedCandidates
    || copilot.pendingCandidates.length > 0

  // 新建空故事线。While a Master candidate is staged, keep the snapshot stable
  // so an explicit adoption cannot accidentally merge with a changed baseline.
  const handleAddArc = async (type: StoryArcType) => {
    if (arcWriteGuarded) return
    const name = type === 'main'
      ? t('storyArc.defaultMainName')
      : t('storyArc.defaultSubName', { index: arcs.filter(a => a.type === 'sub').length + 1 })
    const id = await addArc({
      projectId: project.id!,
      name,
      type,
      stages: '[]',
      description: '',
    })
    setActiveArc(id)
  }

  // 生成请求统一进入主 Agent 的 outline.story-arcs Skill。
  const handleGenerate = async () => {
    if (copilot.loading || copilot.busy || copilot.pendingCandidates.length > 0 || hasQuarantinedCandidates) return
    const typeLabel = genType === 'main' ? '主线' : '支线'
    await copilot.submitRequest(`依据当前作品已确认的世界、故事核心、角色和既有规划，生成一条${typeLabel}故事线。`)
  }

  // 删除故事线
  const handleDeleteArc = async (id: number) => {
    if (arcWriteGuarded) return
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

  const handleAdoptedStoryArc = async (candidate: PendingMasterCandidate) => {
    const adopted = await copilot.adoptCandidate(candidate)
    if (adopted !== false) await loadAll(project.id!)
  }

  return (
    <div className="max-w-4xl">
      <h2 className="text-xl font-bold text-text-primary mb-4">{t('storyArc.heading')}</h2>

      {copilot.recoveryAvailable && !copilot.busy && (
        <section
          role="status"
          aria-live="polite"
          className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3"
        >
          <p className="text-xs leading-5 text-text-secondary">{t('storyArc.recoveryAvailable')}</p>
          <button
            type="button"
            disabled={hasQuarantinedCandidates}
            onClick={() => { void copilot.resume() }}
            className="flex shrink-0 items-center gap-1 rounded border border-warning/50 px-2.5 py-1.5 text-xs text-text-primary hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('storyArc.resume')}
          </button>
        </section>
      )}

      {hasQuarantinedCandidates && (
        <section
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/5 p-3 text-xs text-text-secondary"
        >
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <div>
            <p className="font-medium text-text-primary">{t('storyArc.quarantineTitle')}</p>
            <p className="mt-1">{t('storyArc.quarantineNotice')}</p>
          </div>
        </section>
      )}

      {/* 故事线 Tab 切换 */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {arcs.map(arc => (
          <button
            key={arc.id}
            type="button"
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
            type="button"
            disabled={arcWriteGuarded}
            onClick={() => { void handleAddArc('main') }}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-text-muted hover:text-accent transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            title={t('storyArc.addMainTitle')}
          >
            <Plus className="w-3.5 h-3.5" /> {t('storyArc.addMain')}
          </button>
          <button
            type="button"
            disabled={arcWriteGuarded}
            onClick={() => { void handleAddArc('sub') }}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-text-muted hover:text-accent transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            title={t('storyArc.addSubTitle')}
          >
            <Plus className="w-3.5 h-3.5" /> {t('storyArc.addSub')}
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <select
            value={genType}
            disabled={arcWriteGuarded}
            onChange={event => setGenType(event.target.value as StoryArcType)}
            className="px-1 py-1 bg-bg-elevated border border-border rounded text-xs text-text-secondary disabled:opacity-50"
          >
            <option value="main">{t('storyArc.generateMainOption')}</option>
            <option value="sub">{t('storyArc.generateSubOption')}</option>
          </select>
          <button
            type="button"
            onClick={() => { void handleGenerate() }}
            disabled={
              copilot.loading
              || copilot.busy
              || copilot.pendingCandidates.length > 0
              || hasQuarantinedCandidates
              || (project.enableMultiWorld === true && worldGroupId == null)
            }
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {copilot.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {t('storyArc.generateButton')}
          </button>
        </div>
      </div>

      {copilot.error && (
        <p role="alert" className="mb-4 rounded border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">
          {copilot.error}
        </p>
      )}

      {hasOtherPendingCandidates && (
        <p className="mb-4 rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-secondary">
          {t('storyArc.otherPending')}
        </p>
      )}

      {pendingStoryArcCandidates.map(candidate => (
        <StoryArcCandidateCard
          key={candidate.event.id}
          candidate={candidate}
          copilot={copilot}
          quarantined={hasQuarantinedCandidates}
          t={t}
          onAdopted={handleAdoptedStoryArc}
        />
      ))}

      {/* 故事线编辑 */}
      {activeArc ? (
        <>
          <StoryArcEditor
            t={t}
            arc={activeArc}
            stages={activeStages}
            targeted={activeArc.id === initialArcId}
            disabled={arcWriteGuarded}
            onUpdateArc={(data) => updateArc(activeArc.id!, data)}
            onUpdateStages={(stages) => updateStages(activeArc.id!, stages)}
            onDelete={() => { void handleDeleteArc(activeArc.id!) }}
          />
          <StorylineProgressPanel
            projectId={project.id!}
            arcs={arcs}
            copilot={copilot}
            onArcsChanged={() => loadAll(project.id!)}
            initialRecordTarget={initialRecordTarget?.table === 'storylineProgress'
              || initialRecordTarget?.table === 'storylineCrossings'
              ? initialRecordTarget
              : null}
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

function StoryArcCandidateCard({
  candidate,
  copilot,
  quarantined,
  t,
  onAdopted,
}: {
  candidate: PendingMasterCandidate
  copilot: MasterCopilot
  quarantined: boolean
  t: DomainTFunction
  onAdopted: (candidate: PendingMasterCandidate) => Promise<void>
}) {
  const eventId = candidate.event.id
  const updateStatus = eventId == null ? undefined : copilot.candidateUpdateState?.[eventId]
  const candidateGuarded = copilot.busy || quarantined || isCandidateUpdateGuarded(updateStatus)
  const artifactBlocked = candidate.payload.creativeArtifact != null
    && !creativeArtifactCanAdoptV1(candidate.payload.creativeArtifact)

  return (
    <section className="mb-4 border border-accent/30 bg-bg-surface p-4 rounded-lg">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">
          {t('storyArc.candidateTitle', { label: candidate.payload.label })}
        </h3>
        <span className="text-[11px] text-text-muted">
          {candidate.payload.contextEvidence
            ? t('storyArc.contextTokens', { count: candidate.payload.contextEvidence.estimatedInputTokens.toLocaleString() })
            : t('storyArc.contextSources', { count: candidate.payload.contextSources.length })}
        </span>
      </div>
      <CTextarea
        aria-label={t('storyArc.candidateAria', { label: candidate.payload.label })}
        value={candidate.event.content}
        disabled={copilot.busy || quarantined || updateStatus === 'updating'}
        onChange={event => {
          if (eventId != null) void copilot.updateCandidate(eventId, event.target.value)
        }}
        className="min-h-72 w-full resize-y font-mono text-xs leading-5"
      />
      {updateStatus === 'updating' && (
        <p role="status" className="mt-2 flex items-center gap-1.5 text-[11px] text-accent">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('storyArc.candidateSaving')}
        </p>
      )}
      {updateStatus === 'failed' && (
        <p role="alert" className="mt-2 text-[11px] leading-4 text-warning">
          {t('storyArc.candidateSaveFailed')}
        </p>
      )}
      {candidate.payload.creativeArtifact && (
        <CreativeArtifactSummary
          artifact={candidate.payload.creativeArtifact}
          narrativeBrief={candidate.payload.narrativeBrief}
        />
      )}
      {candidate.payload.contextEvidence && (
        <details className="mt-2 border border-border/60 bg-bg-base px-3 py-2 text-[11px] text-text-muted rounded">
          <summary className="cursor-pointer text-text-secondary">{t('storyArc.inputEvidence')}</summary>
          <p className="mt-2 break-words">
            {t('storyArc.evidenceIncluded', {
              items: candidate.payload.contextEvidence.included.join('、') || t('storyArc.none'),
            })}
          </p>
          {candidate.payload.contextEvidence.trimmed.length > 0 && (
            <p className="mt-1 text-warning">
              {t('storyArc.evidenceTrimmed', { items: candidate.payload.contextEvidence.trimmed.join('、') })}
            </p>
          )}
        </details>
      )}
      {quarantined && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-warning">
          <ShieldCheck className="h-3.5 w-3.5" />
          {t('storyArc.quarantineNotice')}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          disabled={candidateGuarded}
          onClick={() => { void copilot.rejectCandidate(candidate) }}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-hover hover:text-text-primary rounded disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('storyArc.reject')}
        </button>
        <button
          type="button"
          disabled={candidateGuarded || artifactBlocked}
          onClick={() => { void onAdopted(candidate) }}
          className="flex items-center gap-1 bg-accent px-3 py-1.5 text-xs text-white hover:opacity-90 rounded disabled:opacity-50"
        >
          {copilot.busy
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Check className="h-3.5 w-3.5" />}
          {candidate.payload.creativeArtifact?.status === 'usable-with-warnings'
            ? t('storyArc.adoptWithWarnings')
            : t('storyArc.adopt')}
        </button>
      </div>
    </section>
  )
}

// ── 故事线编辑器 ──

function StoryArcEditor({ arc, stages, targeted, disabled, onUpdateArc, onUpdateStages, onDelete, t }: {
  arc: NonNullable<ReturnType<typeof useStoryArcStore.getState>['arcs'][0]>
  stages: StoryStage[]
  targeted: boolean
  disabled: boolean
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
    if (disabled) return
    const newStage: StoryStage = {
      id: nanoid(8),
      title: t('storyArc.defaultStageTitle', { index: stages.length + 1 }),
      description: '',
      keyEvents: [],
    }
    onUpdateStages([...stages, newStage])
  }

  const handleUpdateStage = (idx: number, data: Partial<StoryStage>) => {
    if (disabled) return
    const updated = stages.map((s, i) => i === idx ? { ...s, ...data } : s)
    onUpdateStages(updated)
  }

  const handleDeleteStage = (idx: number) => {
    if (disabled) return
    onUpdateStages(stages.filter((_, i) => i !== idx))
  }

  return (
    <div
      {...initialRecordTargetAttributes(targeted, arc.id)}
      className={`space-y-4 rounded-xl ${targeted ? INITIAL_RECORD_TARGET_CLASS : ''}`}
    >
      {/* 故事线基本信息 */}
      <div className="bg-bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <span className={`w-3 h-3 rounded-full ${arc.type === 'main' ? 'bg-amber-400' : 'bg-blue-400'}`} />
          <CInput
            value={editName}
            disabled={disabled}
            onChange={e => setEditName(e.target.value)}
            onBlur={() => { if (!disabled) onUpdateArc({ name: editName }) }}
            className="flex-1 text-lg font-bold bg-transparent text-text-primary border-none focus:outline-none disabled:opacity-60"
          />
          <span className="text-xs px-2 py-0.5 bg-bg-elevated text-text-muted rounded">
            {arc.type === 'main' ? t('storyArc.mainLabel') : t('storyArc.subLabel')}
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={onDelete}
            className="p-1 text-text-muted hover:text-error transition-colors disabled:opacity-50"
            aria-label={t('common:delete')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        <CTextarea
          value={editDesc}
          disabled={disabled}
          onChange={e => setEditDesc(e.target.value)}
          onBlur={() => { if (!disabled) onUpdateArc({ description: editDesc }) }}
          placeholder={t('storyArc.descriptionPlaceholder')}
          className="w-full h-16 p-2 bg-bg-base border border-border rounded text-sm text-text-secondary resize-y focus:outline-none focus:border-accent disabled:opacity-60"
        />
      </div>

      {/* 时间线可视化 + 阶段列表 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-secondary">{t('storyArc.stagesHeading', { count: stages.length })}</h3>
          <button
            type="button"
            disabled={disabled}
            onClick={handleAddStage}
            className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded transition-colors disabled:opacity-50"
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
            disabled={disabled}
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

function StageCard({ stage, index, total, onUpdate, onDelete, disabled, t }: {
  stage: StoryStage
  index: number
  total: number
  onUpdate: (data: Partial<StoryStage>) => void
  onDelete: () => void
  disabled: boolean
  t: DomainTFunction
}) {
  const [expanded, setExpanded] = useState(false)
  const [newEvent, setNewEvent] = useState('')

  const addEvent = () => {
    if (disabled || !newEvent.trim()) return
    onUpdate({ keyEvents: [...stage.keyEvents, newEvent.trim()] })
    setNewEvent('')
  }

  const removeEvent = (i: number) => {
    if (disabled) return
    onUpdate({ keyEvents: stage.keyEvents.filter((_, idx) => idx !== i) })
  }

  const stageColor = `hsl(${30 + index * (300 / total)}, 60%, 50%)`

  return (
    <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
      {/* 头部 */}
      <button
        type="button"
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
            disabled={disabled}
            onChange={e => onUpdate({ title: e.target.value })}
            placeholder={t('storyArc.stageTitlePlaceholder')}
            className="w-full px-2 py-1.5 bg-bg-base border border-border rounded text-sm font-medium text-text-primary focus:outline-none focus:border-accent disabled:opacity-60"
          />

          {/* 描述 */}
          <CTextarea
            value={stage.description}
            disabled={disabled}
            onChange={e => onUpdate({ description: e.target.value })}
            placeholder={t('storyArc.stageDescriptionPlaceholder')}
            className="w-full h-20 p-2 bg-bg-base border border-border rounded text-sm text-text-secondary resize-y focus:outline-none focus:border-accent disabled:opacity-60"
          />

          {/* 转折点 */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">{t('storyArc.turningPointLabel')}</label>
            <CInput
              value={stage.turningPoint || ''}
              disabled={disabled}
              onChange={e => onUpdate({ turningPoint: e.target.value || undefined })}
              placeholder={t('storyArc.turningPointPlaceholder')}
              className="w-full px-2 py-1.5 bg-bg-base border border-border rounded text-xs text-text-secondary focus:outline-none focus:border-accent disabled:opacity-60"
            />
          </div>

          {/* 关键事件 */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">{t('storyArc.keyEventsLabel', { count: stage.keyEvents.length })}</label>
            <div className="space-y-1">
              {stage.keyEvents.map((ev, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-xs text-text-secondary flex-1">{ev}</span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removeEvent(i)}
                    className="p-0.5 text-text-muted hover:text-error disabled:opacity-50"
                    aria-label={t('common:delete')}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <div className="flex gap-1.5">
                <CInput
                  value={newEvent}
                  disabled={disabled}
                  onChange={e => setNewEvent(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addEvent()}
                  placeholder={t('storyArc.addEventPlaceholder')}
                  className="flex-1 px-2 py-1 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={addEvent}
                  disabled={disabled || !newEvent.trim()}
                  className="px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded disabled:opacity-40"
                >
                  {t('storyArc.addEvent')}
                </button>
              </div>
            </div>
          </div>

          {/* 删除按钮 */}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              disabled={disabled}
              onClick={onDelete}
              className="flex items-center gap-1 px-2 py-1 text-xs text-error/60 hover:text-error transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" /> {t('storyArc.deleteStage')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
