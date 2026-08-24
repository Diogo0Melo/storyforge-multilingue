import { useState, useEffect } from 'react'
import { useDomainT } from '../../i18n'
import { useWorldviewStore } from '../../stores/worldview'
import { useWorldGroupStore } from '../../stores/world-group'
import WorldGroupSwitcher from '../world-group/WorldGroupSwitcher'
import CodexPanel from '../codex/CodexPanel'
import CodexSearchBar from '../codex/CodexSearchBar'
import { InlineTextarea } from '../shared/InlineEdit'
import { useMasterCopilot, type PendingMasterCandidate } from '../agent/useMasterCopilot'
import WorldviewAgentControls from './WorldviewAgentControls'
import type { Project, NaturalResources } from '../../lib/types'
import type { WorldviewAgentField } from '../../lib/agent/worldview-field-copilot'

interface Props { project: Project }

// ── 字段定义（统一标签，兼容幻想与历史） ─────────────────────────

/** Static key map for natural fields — no computed keys. */
const NATURAL_FIELD_KEYS = {
  worldStructure:   { labelKey: 'natural.fields.worldStructure.label' as const, descKey: 'natural.fields.worldStructure.desc' as const },
  worldDimensions:  { labelKey: 'natural.fields.worldDimensions.label' as const, descKey: 'natural.fields.worldDimensions.desc' as const },
  continentLayout:  { labelKey: 'natural.fields.continentLayout.label' as const, descKey: 'natural.fields.continentLayout.desc' as const },
  mountainsRivers:  { labelKey: 'natural.fields.mountainsRivers.label' as const, descKey: 'natural.fields.mountainsRivers.desc' as const },
  climateByRegion:  { labelKey: 'natural.fields.climateByRegion.label' as const, descKey: 'natural.fields.climateByRegion.desc' as const },
}

type FieldKey = keyof typeof NATURAL_FIELD_KEYS | 'naturalResources'

const FIELDS = [
  { key: 'worldStructure' as const,   emoji: '🌐', ctxKey: 'structure' },
  { key: 'worldDimensions' as const,  emoji: '📐', ctxKey: 'dim' },
  { key: 'continentLayout' as const,  emoji: '🗺', ctxKey: 'continent' },
  { key: 'mountainsRivers' as const,  emoji: '⛰', ctxKey: 'mountains' },
  { key: 'climateByRegion' as const,  emoji: '🌦', ctxKey: 'climate' },
] as const

const NATURAL_PANEL_KEY_BY_AGENT_FIELD: Partial<Record<WorldviewAgentField, FieldKey>> = {
  worldStructure: 'worldStructure',
  worldDimensions: 'worldDimensions',
  continentLayout: 'continentLayout',
  mountainsRivers: 'mountainsRivers',
  climateByRegion: 'climateByRegion',
  naturalResourceOverview: 'naturalResources',
}

// 每个方面(子页) → 其专属词条分类(builtInKey)。(重镇/城池已移到人文环境;自然资源单独处理)
const NATURAL_CODEX_KEYS: Record<string, string[] | undefined> = {
  worldStructure: ['natStructure'],
  worldDimensions: ['natDimension'],
  continentLayout: ['natTerrain'],
  mountainsRivers: ['natWater'],
  climateByRegion: ['natClimate'],
}

// ── 主面板 ─────────────────────────────────────────────────────

export default function WorldviewNaturalPanel({ project }: Props) {
  const { t } = useDomainT('worldview')
  const { worldview, saveWorldview, loadAll } = useWorldviewStore()
  const activeGroupId = useWorldGroupStore(s => s.activeGroupId)
  const copilot = useMasterCopilot({
    project,
    worldGroupId: project.enableMultiWorld ? activeGroupId : null,
  })

  const [values, setValues] = useState<Record<string, string>>({})
  const [naturalResources, setNaturalResources] = useState<NaturalResources>({
    rareCreatures: '', herbs: '', minerals: '', others: '',
  })
  const [activeKey, setActiveKey] = useState<FieldKey>('worldStructure')
  const [runningField, setRunningField] = useState<WorldviewAgentField | null>(null)

  useEffect(() => {
    loadAll(project.id!, project.enableMultiWorld ? activeGroupId : null)
  }, [project.id, project.enableMultiWorld, activeGroupId, loadAll])

  useEffect(() => {
    if (!worldview) return
    setValues({
      worldStructure:   worldview.worldStructure || '',
      worldDimensions:  worldview.worldDimensions || '',
      continentLayout:  worldview.continentLayout || '',
      regionDimensions: worldview.regionDimensions || '',
      mountainsRivers:  worldview.mountainsRivers || '',
      climateByRegion:  worldview.climateByRegion || '',
      naturalResourceOverview: worldview.naturalResourceOverview || '',
    })
    setNaturalResources(worldview.naturalResources || {
      rareCreatures: '', herbs: '', minerals: '', others: '',
    })
  }, [worldview])

  const save = (patch: Partial<typeof worldview>) =>
    saveWorldview({ projectId: project.id!, ...patch })

  const pendingWorldviewCandidates = copilot.pendingCandidates.filter(candidate => (
    candidate.payload.skillId === 'world-origin.worldview-field'
  ))
  const pendingWorldviewField = pendingWorldviewCandidates[0]?.payload.worldviewField
  const pendingPanelKey = pendingWorldviewField
    ? NATURAL_PANEL_KEY_BY_AGENT_FIELD[pendingWorldviewField]
    : undefined
  const hasOtherPendingCandidates = copilot.pendingCandidates.some(candidate => (
    candidate.payload.skillId !== 'world-origin.worldview-field'
  ))
  const streamingKeys = new Set<string>()
  const runningPanelKey = runningField ? NATURAL_PANEL_KEY_BY_AGENT_FIELD[runningField] : undefined
  if (copilot.busy && runningPanelKey) streamingKeys.add(runningPanelKey)

  useEffect(() => {
    if (pendingPanelKey) setActiveKey(pendingPanelKey)
  }, [pendingPanelKey])

  return (
    <div className="flex flex-col w-full h-full space-y-4">
      {/* 顶部 */}
      <div className="pb-4 border-b border-border/40 px-6 pt-4 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            {t('natural.title')}
          </h2>
          {project.enableMultiWorld && <WorldGroupSwitcher />}
        </div>
        <p className="text-xs text-text-muted mt-0.5">
          {t('natural.subtitle')}
        </p>
        {copilot.recoveryAvailable && !copilot.busy && (
          <div className="mt-3 rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-secondary">
            {t('agent:chat.recoveryAvailable')}
            <button type="button" onClick={() => { void copilot.resume() }} className="ml-2 text-accent hover:underline">
              {t('agent:chat.resumeButton')}
            </button>
          </div>
        )}
        <div className="mt-3 max-w-xl">
          <CodexSearchBar
            categoryKeys={[...Object.values(NATURAL_CODEX_KEYS).flat().filter(Boolean) as string[], 'mineral', 'herb', 'beast']}
            onJump={(catKey) => {
              if (['mineral', 'herb', 'beast'].includes(catKey)) { setActiveKey('naturalResources'); return }
              const sub = Object.keys(NATURAL_CODEX_KEYS).find(k => NATURAL_CODEX_KEYS[k]?.includes(catKey))
              if (sub) setActiveKey(sub as FieldKey)
            }}
          />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── 左侧边栏 ── */}
        <nav className="w-max min-w-32 max-w-44 flex-shrink-0 border-r border-border bg-bg-surface/50 overflow-y-auto">
          {[...FIELDS.map(f => ({ key: f.key, emoji: f.emoji })),
            { key: 'naturalResources' as const, emoji: '🌿' },
          ].map(f => {
            const isActive = activeKey === f.key
            const isFieldStreaming = streamingKeys.has(f.key)
            const label = f.key === 'naturalResources'
              ? t('natural.fields.naturalResources.label')
              : t(NATURAL_FIELD_KEYS[f.key as keyof typeof NATURAL_FIELD_KEYS].labelKey)
            const hasPendingCandidate = pendingPanelKey === f.key
            return (
              <button
                key={f.key}
                onClick={() => setActiveKey(f.key)}
                className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-l-2 flex items-center gap-1 ${
                  isActive
                    ? 'border-accent bg-accent/10 text-text-primary font-medium'
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-elevated/50'
                }`}
              >
                <span className="flex-1">{f.emoji} {label}</span>
                {isFieldStreaming && !isActive && (
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
                )}
                {hasPendingCandidate && !isFieldStreaming && (
                  <span
                    aria-label={`${label}有待确认候选`}
                    title="有待确认候选"
                    className="w-2 h-2 rounded-full bg-warning shrink-0"
                  />
                )}
              </button>
            )
          })}
        </nav>

        {/* ── 右侧：所有字段同时渲染，hidden 控制显示 ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {FIELDS.map(f => {
            const label = t(NATURAL_FIELD_KEYS[f.key].labelKey)
            return (
              <div key={f.key} className={activeKey === f.key ? '' : 'hidden'}>
                <SimpleFieldEditor
                  fieldKey={f.key}
                  value={values[f.key] || ''}
                  onChange={v => {
                    setValues(prev => ({ ...prev, [f.key]: v }))
                    save({ [f.key]: v })
                  }}
                  project={project}
                  agentField={f.key}
                  activeGroupId={activeGroupId}
                  copilot={copilot}
                  candidate={pendingWorldviewCandidates.find(candidate => candidate.payload.worldviewField === f.key)}
                  otherPendingWorldviewLabel={pendingWorldviewCandidates.find(candidate => candidate.payload.worldviewField !== f.key)?.payload.label}
                  hasOtherPendingCandidates={hasOtherPendingCandidates}
                  onRunningChange={running => setRunningField(running ? f.key : null)}
                  onAdopted={async candidate => {
                    await copilot.adoptCandidate(candidate)
                    await loadAll(project.id!, project.enableMultiWorld ? activeGroupId : null)
                  }}
                />
                {/* 全貌之下:本方面的专属词条(只显示对应那一类) */}
                {NATURAL_CODEX_KEYS[f.key] && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-text-primary mb-1">{t('natural.codexHeading', { label })}</h3>
                    <p className="text-xs text-text-muted mb-3">{t('natural.codexHint', { label })}</p>
                    <CodexPanel
                      project={project}
                      fixedCategoryKeys={NATURAL_CODEX_KEYS[f.key]}
                      extractionSourceText={values[f.key] || ''}
                      embedded
                    />
                  </div>
                )}
              </div>
            )
          })}
          <div className={activeKey === 'naturalResources' ? 'space-y-4' : 'hidden'}>
            {/* 全貌(上):自然资源整体概述,带 AI 生成,与其它方面一致 */}
            <SimpleFieldEditor
              fieldKey="naturalResources"
              value={values.naturalResourceOverview || ''}
              onChange={v => {
                setValues(prev => ({ ...prev, naturalResourceOverview: v }))
                save({ naturalResourceOverview: v })
              }}
              project={project}
              agentField="naturalResourceOverview"
              activeGroupId={activeGroupId}
              copilot={copilot}
              candidate={pendingWorldviewCandidates.find(candidate => candidate.payload.worldviewField === 'naturalResourceOverview')}
              otherPendingWorldviewLabel={pendingWorldviewCandidates.find(candidate => candidate.payload.worldviewField !== 'naturalResourceOverview')?.payload.label}
              hasOtherPendingCandidates={hasOtherPendingCandidates}
              onRunningChange={running => setRunningField(running ? 'naturalResourceOverview' : null)}
              onAdopted={async candidate => {
                await copilot.adoptCandidate(candidate)
                await loadAll(project.id!, project.enableMultiWorld ? activeGroupId : null)
              }}
            />
            {/* 自然资源:矿物/草药/异兽 三类词条 */}
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">{t('natural.resourcesCodexHeading')}</h3>
              <p className="text-xs text-text-muted mb-2">{t('natural.resourcesCodexHint')}</p>
              <CodexPanel
                project={project}
                fixedCategoryKeys={['mineral', 'herb', 'beast']}
                extractionSourceText={[
                  values.naturalResourceOverview,
                  naturalResources.minerals,
                  naturalResources.herbs,
                  naturalResources.rareCreatures,
                  naturalResources.others,
                ].filter(Boolean).join('\n\n')}
                embedded
              />
            </div>
            {/* 旧版自然资源(纯文本)——保留兼容 */}
            <details className="border-t border-border/60 pt-3">
              <summary className="text-xs text-text-muted cursor-pointer hover:text-text-secondary">{t('natural.legacyResourcesSummary')}</summary>
              <div className="mt-2">
                <NaturalResourcesEditor
                  naturalResources={naturalResources}
                  setNaturalResources={setNaturalResources}
                  save={save}
                />
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 单字段 Agent 控件（候选仅在作者确认后进入正式数据） ──────────────
function SimpleFieldEditor({
  fieldKey, value, onChange, project, agentField, activeGroupId, copilot,
  candidate, otherPendingWorldviewLabel, hasOtherPendingCandidates,
  onRunningChange, onAdopted,
}: {
  fieldKey: FieldKey
  value: string
  onChange: (v: string) => void
  project: Project
  agentField: WorldviewAgentField
  activeGroupId: number | null
  copilot: ReturnType<typeof useMasterCopilot>
  candidate?: PendingMasterCandidate
  otherPendingWorldviewLabel?: string
  hasOtherPendingCandidates: boolean
  onRunningChange: (running: boolean) => void
  onAdopted: (candidate: PendingMasterCandidate) => Promise<void>
}) {
  const { t } = useDomainT('worldview')
  const label = fieldKey === 'naturalResources'
    ? t('natural.fields.naturalResources.label')
    : t(NATURAL_FIELD_KEYS[fieldKey as keyof typeof NATURAL_FIELD_KEYS].labelKey)
  const desc = fieldKey === 'naturalResources'
    ? t('natural.fields.naturalResources.desc')
    : t(NATURAL_FIELD_KEYS[fieldKey as keyof typeof NATURAL_FIELD_KEYS].descKey)
  const emoji = fieldKey === 'naturalResources' ? '🌿' : FIELDS.find(f => f.key === fieldKey)?.emoji ?? ''
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">{emoji} {label}</h3>
        <p className="mt-1 text-sm text-text-muted">{desc}</p>
      </div>

      <div className="bg-bg-surface border border-border rounded-lg p-4">
        <InlineTextarea value={value} onChange={onChange} placeholder={desc} />
      </div>
      <WorldviewAgentControls
        field={agentField}
        project={project}
        activeGroupId={activeGroupId}
        copilot={copilot}
        candidate={candidate}
        otherPendingWorldviewLabel={otherPendingWorldviewLabel}
        hasOtherPendingCandidates={hasOtherPendingCandidates}
        onRunningChange={onRunningChange}
        onAdopted={onAdopted}
      />
    </div>
  )
}

// ── 自然资源编辑器 ─────────────────────────────────────────────

/** Static key map for resource rows — no computed keys. */
const RESOURCE_ROW_KEYS = {
  rareCreatures: { labelKey: 'natural.resourceRows.rareCreatures.label' as const, placeholderKey: 'natural.resourceRows.rareCreatures.placeholder' as const },
  herbs:         { labelKey: 'natural.resourceRows.herbs.label' as const,         placeholderKey: 'natural.resourceRows.herbs.placeholder' as const },
  minerals:      { labelKey: 'natural.resourceRows.minerals.label' as const,      placeholderKey: 'natural.resourceRows.minerals.placeholder' as const },
  others:        { labelKey: 'natural.resourceRows.others.label' as const,        placeholderKey: 'natural.resourceRows.others.placeholder' as const },
} satisfies Record<keyof NaturalResources, { labelKey: string; placeholderKey: string }>

function NaturalResourcesEditor({ naturalResources, setNaturalResources, save }: {
  naturalResources: NaturalResources
  setNaturalResources: React.Dispatch<React.SetStateAction<NaturalResources>>
  save: (patch: Record<string, unknown>) => void
}) {
  const { t } = useDomainT('worldview')

  const update = (key: keyof NaturalResources, v: string) => {
    const next = { ...naturalResources, [key]: v }
    setNaturalResources(next)
    save({ naturalResources: next })
  }

  const rowKeys = ['rareCreatures', 'herbs', 'minerals', 'others'] as const

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">{t('natural.resourcesTitle')}</h3>
        <p className="mt-1 text-sm text-text-muted">{t('natural.resourcesSubtitle')}</p>
      </div>
      <div className="bg-bg-surface border border-border rounded-lg p-4 space-y-4">
        {rowKeys.map(r => (
          <div key={r} className="flex items-start gap-3">
            <span className="text-sm text-text-secondary w-28 flex-shrink-0 pt-0.5">{t(RESOURCE_ROW_KEYS[r].labelKey)}</span>
            <div className="flex-1">
              <InlineTextarea value={naturalResources[r]} onChange={v => update(r, v)} placeholder={t(RESOURCE_ROW_KEYS[r].placeholderKey)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
