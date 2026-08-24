import { useEffect, useState } from 'react'
import { Check, Loader2, Sparkles, Trash2 } from 'lucide-react'
import { useDomainT } from '../../i18n'
import { useWorldviewStore } from '../../stores/worldview'
import { useWorldGroupStore } from '../../stores/world-group'
import { useMasterCopilot, type PendingMasterCandidate } from '../agent/useMasterCopilot'
import {
  formatStoryCoreGenerationRequestV1,
  type StoryCoreField,
} from '../../lib/agent/story-core-copilot'
import type { Project } from '../../lib/types'
import type { FieldGenerationMode } from '../../lib/ai/field-generation-context'
import { CTextarea } from '../shared/CompositionInput'
import PromptRunPanel from '../shared/PromptRunPanel'
import { InlineTextarea } from '../shared/InlineEdit'
import AIFieldModeTabs from '../shared/AIFieldModeTabs'
import {
  INITIAL_RECORD_TARGET_CLASS,
  initialRecordTargetAttributes,
} from '../shared/initial-record-target'

const STORY_CORE_FIELD_KEYS = {
  logline:         { labelKey: 'storyCore.fields.logline.label' as const,         descKey: 'storyCore.fields.logline.description' as const },
  concept:         { labelKey: 'storyCore.fields.concept.label' as const,         descKey: 'storyCore.fields.concept.description' as const },
  theme:           { labelKey: 'storyCore.fields.theme.label' as const,           descKey: 'storyCore.fields.theme.description' as const },
  centralConflict: { labelKey: 'storyCore.fields.centralConflict.label' as const, descKey: 'storyCore.fields.centralConflict.description' as const },
  plotPattern:     { labelKey: 'storyCore.fields.plotPattern.label' as const,     descKey: 'storyCore.fields.plotPattern.description' as const },
  mainPlot:        { labelKey: 'storyCore.fields.mainPlot.label' as const,        descKey: 'storyCore.fields.mainPlot.description' as const },
  subPlots:        { labelKey: 'storyCore.fields.subPlots.label' as const,        descKey: 'storyCore.fields.subPlots.description' as const },
} satisfies Record<StoryCoreField, { labelKey: string; descKey: string }>

interface FieldDef {
  key: StoryCoreField
  emoji: string
  /** AI prompt payload, not visible UI copy. The output language is governed by the project. */
  dimension: string
}

const FIELDS: FieldDef[] = [
  { key: 'logline', emoji: '📜', dimension: '一句话故事（logline）' },
  { key: 'concept', emoji: '💡', dimension: '故事概念（high concept）' },
  { key: 'theme', emoji: '🎯', dimension: '故事主题' },
  { key: 'centralConflict', emoji: '⚔️', dimension: '核心冲突' },
  { key: 'plotPattern', emoji: '📊', dimension: '故事模式' },
  { key: 'mainPlot', emoji: '🛤', dimension: '故事主线' },
  { key: 'subPlots', emoji: '🎼', dimension: '故事复线' },
]

interface Props {
  project: Project
  initialStoryCoreId?: number | null
}

export default function StoryCorePanel({ project, initialStoryCoreId }: Props) {
  const { t } = useDomainT('worldview')
  const { storyCore, saveStoryCore, loadAll } = useWorldviewStore()
  const activeGroupId = useWorldGroupStore(state => state.activeGroupId)
  const copilot = useMasterCopilot({
    project,
    worldGroupId: project.enableMultiWorld ? activeGroupId : null,
  })
  const [values, setValues] = useState<Record<string, string>>({})
  const [activeKey, setActiveKey] = useState<StoryCoreField>(FIELDS[0].key)
  const [runningKey, setRunningKey] = useState<StoryCoreField | null>(null)

  useEffect(() => {
    loadAll(project.id!, project.enableMultiWorld ? activeGroupId : null)
  }, [project.id, project.enableMultiWorld, activeGroupId, loadAll])

  useEffect(() => {
    if (!storyCore) return
    setValues({
      logline: storyCore.logline || '',
      concept: storyCore.concept || '',
      theme: storyCore.theme || '',
      centralConflict: storyCore.centralConflict || '',
      plotPattern: storyCore.plotPattern || '',
      mainPlot: storyCore.mainPlot || storyCore.storyLines || '',
      subPlots: storyCore.subPlots || '',
    })
  }, [storyCore])

  const pendingCandidates = copilot.pendingCandidates.filter(candidate => (
    candidate.payload.skillId === 'world-origin.story-core'
  ))
  const pendingField = pendingCandidates[0]?.payload.storyCoreField as StoryCoreField | undefined
  const hasOtherPendingCandidates = copilot.pendingCandidates.some(candidate => (
    candidate.payload.skillId !== 'world-origin.story-core'
  ))

  useEffect(() => {
    if (pendingField) setActiveKey(pendingField)
  }, [pendingField])

  const save = (key: StoryCoreField, value: string) => {
    setValues(current => ({ ...current, [key]: value }))
    void saveStoryCore({ projectId: project.id!, [key]: value })
  }

  return (
    <div
      {...initialRecordTargetAttributes(storyCore?.id === initialStoryCoreId, storyCore?.id)}
      className={`flex gap-4 max-w-5xl rounded-xl ${storyCore?.id === initialStoryCoreId ? INITIAL_RECORD_TARGET_CLASS : ''}`}
    >
      <div className="w-fit min-w-32 max-w-40 shrink-0 space-y-0.5 pt-1">
        {FIELDS.map(field => {
          const active = activeKey === field.key
          const label = t(STORY_CORE_FIELD_KEYS[field.key].labelKey)
          const hasPendingCandidate = pendingField === field.key
          return (
            <button
              key={field.key}
              onClick={() => setActiveKey(field.key)}
              aria-pressed={active}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-all ${active ? 'bg-accent/8 border-l-2 border-accent' : 'hover:bg-bg-hover border-l-2 border-transparent'}`}
            >
              <span className="text-base shrink-0">{field.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${active ? 'text-accent' : 'text-text-primary'}`}>{label}</p>
                {!!values[field.key] && <p className="text-[10px] text-text-muted truncate">{values[field.key].slice(0, 12)}…</p>}
              </div>
              {hasPendingCandidate && (
                <span className="w-2 h-2 rounded-full bg-warning shrink-0" aria-label={`${label}有待确认候选`} />
              )}
            </button>
          )
        })}
      </div>

      <div className="flex-1 min-w-0">
        {FIELDS.map(field => (
          <div key={field.key} className={activeKey === field.key ? '' : 'hidden'}>
            <StoryCoreFieldEditor
              field={field}
              value={values[field.key] || ''}
              project={project}
              activeGroupId={activeGroupId}
              copilot={copilot}
              candidate={pendingCandidates.find(candidate => candidate.payload.storyCoreField === field.key)}
              otherPendingLabel={pendingCandidates.find(candidate => candidate.payload.storyCoreField !== field.key)?.payload.label}
              hasOtherPendingCandidates={hasOtherPendingCandidates}
              running={runningKey === field.key}
              onRunningChange={running => setRunningKey(running ? field.key : null)}
              onChange={value => save(field.key, value)}
              onAdopted={async candidate => {
                await copilot.adoptCandidate(candidate)
                await loadAll(project.id!, project.enableMultiWorld ? activeGroupId : null)
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function StoryCoreFieldEditor({
  field, value, project, activeGroupId, copilot, candidate, otherPendingLabel,
  hasOtherPendingCandidates, running, onRunningChange, onChange, onAdopted,
}: {
  field: FieldDef
  value: string
  project: Project
  activeGroupId: number | null
  copilot: ReturnType<typeof useMasterCopilot>
  candidate?: PendingMasterCandidate
  otherPendingLabel?: string
  hasOtherPendingCandidates: boolean
  running: boolean
  onRunningChange: (running: boolean) => void
  onChange: (value: string) => void
  onAdopted: (candidate: PendingMasterCandidate) => Promise<void>
}) {
  const { t } = useDomainT('worldview')
  const [hint, setHint] = useState('')
  const [parameterValues, setParameterValues] = useState<Record<string, unknown>>({})
  const [systemOverride, setSystemOverride] = useState<string | null>(null)
  const [userOverride, setUserOverride] = useState<string | null>(null)
  const [mode, setMode] = useState<FieldGenerationMode>('expand')
  const label = t(STORY_CORE_FIELD_KEYS[field.key].labelKey)
  const description = t(STORY_CORE_FIELD_KEYS[field.key].descKey)
  const blocked = copilot.loading || copilot.busy || copilot.pendingCandidates.length > 0
    || (project.enableMultiWorld === true && activeGroupId == null)

  const handleGenerate = async () => {
    onRunningChange(true)
    try {
      await copilot.submitRequest(formatStoryCoreGenerationRequestV1({
        field: field.key,
        mode,
        hint,
        parameterValues: Object.keys(parameterValues).length ? parameterValues : undefined,
        systemOverride,
        userOverride,
      }))
    } finally {
      onRunningChange(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-text-primary mb-0.5">{field.emoji} {label}</h2>
        <p className="text-sm text-text-muted">{description}</p>
      </div>
      <div className="bg-bg-surface border border-border rounded-lg p-4">
        <InlineTextarea value={value} onChange={onChange} placeholder={t('storyCore.placeholderFill', { label })} />
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <AIFieldModeTabs value={mode} onChange={setMode} />
          <input
            value={hint}
            onChange={event => setHint(event.target.value)}
            placeholder={t('storyCore.hintPlaceholder')}
            className="flex-1 px-2 py-1.5 bg-bg-surface border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
          />
          <button type="button" onClick={handleGenerate} disabled={blocked} className="flex items-center gap-1.5 px-3 py-2 bg-bg-elevated text-text-secondary text-sm rounded-md hover:text-accent disabled:opacity-50 transition-colors border border-border hover:border-accent/50">
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {t('storyCore.aiGenerate')}
          </button>
        </div>
        <PromptRunPanel moduleKey="story.generate" parameterValues={parameterValues} onParamChange={setParameterValues} systemOverride={systemOverride} onSystemOverrideChange={setSystemOverride} userOverride={userOverride} onUserOverrideChange={setUserOverride} />
        {copilot.recoveryAvailable && !copilot.busy && (
          <div className="rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-secondary">
            <p>{t('agent:chat.recoveryAvailable')}</p>
            <button type="button" onClick={() => { void copilot.resume() }} className="mt-2 text-accent hover:underline">{t('agent:chat.resumeButton')}</button>
          </div>
        )}
        {copilot.error && <p className="rounded border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">{copilot.error}</p>}
        {hasOtherPendingCandidates && <p className="rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-secondary">{t('agent:candidate.dependsOnWarning', { ids: t('agent:candidate.pendingPrefix', { label: '其他任务' }) })}</p>}
        {!candidate && otherPendingLabel && <p className="rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-secondary">{t('agent:candidate.dependsOnWarning', { ids: otherPendingLabel })}</p>}
        {candidate && <CandidateReview candidate={candidate} copilot={copilot} onAdopted={onAdopted} />}
      </div>
    </div>
  )
}

function CandidateReview({ candidate, copilot, onAdopted }: {
  candidate: PendingMasterCandidate
  copilot: ReturnType<typeof useMasterCopilot>
  onAdopted: (candidate: PendingMasterCandidate) => Promise<void>
}) {
  const { t } = useDomainT('worldview')
  const label = candidate.payload.label
  const evidence = candidate.payload.contextEvidence
  return (
    <section className="border border-accent/30 bg-bg-surface p-4 rounded-lg">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">{t('agent:candidate.pendingPrefix', { label })}</h3>
        <span className="text-[11px] text-text-muted">{evidence ? `约 ${evidence.estimatedInputTokens.toLocaleString()} tokens` : t('agent:candidate.inputSources', { count: candidate.payload.contextSources.length })}</span>
      </div>
      <CTextarea aria-label={t('agent:candidate.contentAria', { label })} value={candidate.event.content} disabled={copilot.busy} onChange={event => { void copilot.updateCandidate(candidate.event.id!, event.target.value) }} className="min-h-48 w-full resize-y font-mono text-xs leading-5" />
      {evidence && <details className="mt-2 border border-border/60 bg-bg-base px-3 py-2 text-[11px] text-text-muted rounded"><summary className="cursor-pointer text-text-secondary">{t('agent:candidate.evidenceSummary', { count: evidence.included.length })}</summary><p className="mt-2 break-words">{t('agent:candidate.includedLine', { items: evidence.included.join('、') || t('agent:candidate.includedEmpty') })}</p>{evidence.trimmed.length > 0 && <p className="mt-1 text-warning">因预算移除：{evidence.trimmed.join('、')}</p>}</details>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" disabled={copilot.busy} onClick={() => { void copilot.rejectCandidate(candidate) }} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-hover hover:text-text-primary rounded disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />{t('agent:candidate.rejectButton')}</button>
        <button type="button" disabled={copilot.busy} onClick={() => { void onAdopted(candidate) }} className="flex items-center gap-1 bg-accent px-3 py-1.5 text-xs text-white hover:opacity-90 rounded disabled:opacity-50">{copilot.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{t('agent:candidate.adoptButton')}</button>
      </div>
    </section>
  )
}
