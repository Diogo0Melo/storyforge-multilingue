import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { useDomainT } from '../../i18n'
import { useWorldviewStore } from '../../stores/worldview'
import { useWorldGroupStore } from '../../stores/world-group'
import WorldGroupSwitcher from '../world-group/WorldGroupSwitcher'
import { InlineTextarea } from '../shared/InlineEdit'
import { useMasterCopilot, type PendingMasterCandidate } from '../agent/useMasterCopilot'
import WorldviewAgentControls from './WorldviewAgentControls'
import type { Project } from '../../lib/types'
import type { WorldviewAgentField } from '../../lib/agent/worldview-field-copilot'
import CodexPanel from '../codex/CodexPanel'
import CodexSearchBar from '../codex/CodexSearchBar'

const HUMANITY_FIELD_KEYS = {
  races: { labelKey: 'humanity.fields.races.label' as const, descKey: 'humanity.fields.races.description' as const },
  factions: { labelKey: 'humanity.fields.factions.label' as const, descKey: 'humanity.fields.factions.description' as const },
  cities: { labelKey: 'humanity.fields.cities.label' as const, descKey: 'humanity.fields.cities.description' as const },
  politics: { labelKey: 'humanity.fields.politics.label' as const, descKey: 'humanity.fields.politics.description' as const },
  economy: { labelKey: 'humanity.fields.economy.label' as const, descKey: 'humanity.fields.economy.description' as const },
  culture: { labelKey: 'humanity.fields.culture.label' as const, descKey: 'humanity.fields.culture.description' as const },
  conflicts: { labelKey: 'humanity.fields.conflicts.label' as const, descKey: 'humanity.fields.conflicts.description' as const },
  items: { labelKey: 'humanity.fields.items.label' as const, descKey: 'humanity.fields.items.description' as const, hintKey: 'humanity.fields.items.hint' as const },
}
type HumanityFieldKey = keyof typeof HUMANITY_FIELD_KEYS

interface FieldMeta {
  key: HumanityFieldKey
  field: WorldviewAgentField
  emoji: string
}
const FIELDS: FieldMeta[] = [
  { key: 'races', field: 'races', emoji: '🧬' },
  { key: 'factions', field: 'factionLayout', emoji: '⚔' },
  { key: 'cities', field: 'regionDimensions', emoji: '🏰' },
  { key: 'politics', field: 'politicsOverview', emoji: '🏛' },
  { key: 'economy', field: 'economyOverview', emoji: '💰' },
  { key: 'culture', field: 'cultureOverview', emoji: '🎭' },
  { key: 'conflicts', field: 'internalConflicts', emoji: '🔥' },
  { key: 'items', field: 'itemDesign', emoji: '🗡' },
]
const HUMANITY_CODEX_KEYS: Record<string, string[] | undefined> = {
  races: ['race'], factions: ['faction'], cities: ['city'], politics: ['humPolitics'],
  economy: ['humEconomy'], culture: ['humCulture'], conflicts: ['humConflict'], items: ['artifact'],
}

interface Props { project: Project; onOpenHistory: () => void }

export default function WorldviewHumanityPanel({ project, onOpenHistory }: Props) {
  const { t } = useDomainT('worldview')
  const { worldview, saveWorldview, loadAll } = useWorldviewStore()
  const activeGroupId = useWorldGroupStore(state => state.activeGroupId)
  const copilot = useMasterCopilot({ project, worldGroupId: project.enableMultiWorld ? activeGroupId : null })
  const [values, setValues] = useState<Record<string, string>>({})
  const [activeKey, setActiveKey] = useState<string>('history')
  const [runningField, setRunningField] = useState<WorldviewAgentField | null>(null)

  useEffect(() => { loadAll(project.id!, project.enableMultiWorld ? activeGroupId : null) }, [project.id, project.enableMultiWorld, activeGroupId, loadAll])
  useEffect(() => {
    if (!worldview) return
    setValues({
      history: worldview.historyLine || '', events: worldview.worldEvents || '', races: worldview.races || '',
      factions: worldview.factionLayout || '', cities: worldview.regionDimensions || '', politics: worldview.politicsOverview || '',
      economy: worldview.economyOverview || '', culture: worldview.cultureOverview || '',
      legacySociety: worldview.politicsEconomyCulture || '', conflicts: worldview.internalConflicts || '', items: worldview.itemDesign || '',
    })
  }, [worldview])

  const save = (fieldName: string, value: string) => { void saveWorldview({ projectId: project.id!, [fieldName]: value }) }
  const pendingCandidates = copilot.pendingCandidates.filter(candidate => candidate.payload.skillId === 'world-origin.worldview-field')
  const pendingField = pendingCandidates[0]?.payload.worldviewField
  const pendingPanelKey = FIELDS.find(field => field.field === pendingField)?.key
  const hasOtherPendingCandidates = copilot.pendingCandidates.some(candidate => candidate.payload.skillId !== 'world-origin.worldview-field')
  const streamingKeys = new Set<string>()
  const runningPanelKey = FIELDS.find(field => field.field === runningField)?.key
  if (copilot.busy && runningPanelKey) streamingKeys.add(runningPanelKey)

  useEffect(() => { if (pendingPanelKey) setActiveKey(pendingPanelKey) }, [pendingPanelKey])

  return (
    <div className="flex flex-col w-full h-full space-y-4">
      <div className="pb-4 border-b border-border/40 px-6 pt-4 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-text-primary">{t('humanity.title')}</h2>
          {project.enableMultiWorld && <WorldGroupSwitcher />}
        </div>
        <p className="text-xs text-text-muted mt-0.5">{t('humanity.subtitle')}</p>
        <div className="mt-3 max-w-xl">
          <CodexSearchBar
            categoryKeys={[...new Set([...Object.values(HUMANITY_CODEX_KEYS).flat().filter(Boolean), 'humEra', 'humEvent', 'humSociety'] as string[])]}
            onJump={category => {
              if (category === 'humEra' || category === 'humEvent') setActiveKey('history')
              else if (category === 'humSociety') setActiveKey('politics')
              else { const field = Object.keys(HUMANITY_CODEX_KEYS).find(key => HUMANITY_CODEX_KEYS[key]?.includes(category)); if (field) setActiveKey(field) }
            }}
          />
        </div>
        {copilot.recoveryAvailable && !copilot.busy && (
          <div className="mt-3 rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-secondary">
            {t('agent:chat.recoveryAvailable')}
            <button type="button" onClick={() => { void copilot.resume() }} className="ml-2 text-accent hover:underline">{t('agent:chat.resumeButton')}</button>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <nav className="w-max min-w-32 max-w-44 flex-shrink-0 border-r border-border overflow-y-auto py-4 pr-1">
          <NavButton active={activeKey === 'history'} onClick={() => setActiveKey('history')} label={`📜 ${t('humanity.historyNav.label')}`} streaming={streamingKeys.has('history')} />
          {FIELDS.map(field => {
            const label = t(HUMANITY_FIELD_KEYS[field.key].labelKey)
            return <NavButton key={field.key} active={activeKey === field.key} onClick={() => setActiveKey(field.key)} label={`${field.emoji} ${label}`} streaming={streamingKeys.has(field.key)} pending={pendingPanelKey === field.key} pendingLabel={label} />
          })}
        </nav>

        <div className="flex-1 min-w-0 overflow-y-auto p-6">
          {activeKey === 'history' && (
            <div className="max-w-3xl space-y-5">
              <div><h3 className="text-lg font-semibold text-text-primary">{t('humanity.historyTitle')}</h3><p className="mt-1 text-sm text-text-muted">{t('humanity.historyDescription')}</p></div>
              <button type="button" onClick={onOpenHistory} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 text-sm"><BookOpen className="w-4 h-4" />{t('humanity.openHistoryTimeline')}</button>
              <details className="border border-border rounded-xl bg-bg-surface p-4">
                <summary className="cursor-pointer text-sm font-medium text-text-secondary">{t('humanity.legacyHistorySummary')}</summary>
                <div className="mt-4 space-y-4">
                  <label className="block"><span className="block text-xs text-text-muted mb-1">{t('humanity.legacyHistoryLineLabel')}</span><InlineTextarea value={values.history || ''} onChange={value => { setValues(current => ({ ...current, history: value })); save('historyLine', value) }} placeholder={t('humanity.legacyHistoryLinePlaceholder')} /></label>
                  <label className="block"><span className="block text-xs text-text-muted mb-1">{t('humanity.legacyEventsLabel')}</span><InlineTextarea value={values.events || ''} onChange={value => { setValues(current => ({ ...current, events: value })); save('worldEvents', value) }} placeholder={t('humanity.legacyEventsPlaceholder')} /></label>
                  <CodexPanel project={project} fixedCategoryKeys={['humEra', 'humEvent']} extractionSourceText={`${values.history || ''}\n${values.events || ''}`} embedded />
                </div>
              </details>
            </div>
          )}
          {FIELDS.map(field => {
            const label = t(HUMANITY_FIELD_KEYS[field.key].labelKey)
            return <div key={field.key} className={activeKey === field.key ? '' : 'hidden'}>
              <HumanityFieldEditor meta={field} value={values[field.key] || ''} project={project} activeGroupId={activeGroupId} copilot={copilot} candidate={pendingCandidates.find(candidate => candidate.payload.worldviewField === field.field)} otherPendingLabel={pendingCandidates.find(candidate => candidate.payload.worldviewField !== field.field)?.payload.label} hasOtherPendingCandidates={hasOtherPendingCandidates} onRunningChange={running => setRunningField(running ? field.field : null)} onChange={value => { setValues(current => ({ ...current, [field.key]: value })); save(field.field, value) }} onAdopted={async candidate => { await copilot.adoptCandidate(candidate); await loadAll(project.id!, project.enableMultiWorld ? activeGroupId : null) }} />
              {HUMANITY_CODEX_KEYS[field.key] && <div className="mt-6"><h3 className="text-sm font-semibold text-text-primary mb-1">{t('humanity.codexHeading', { label })}</h3><p className="text-xs text-text-muted mb-3">{t('humanity.codexHint', { label })}</p><CodexPanel project={project} fixedCategoryKeys={HUMANITY_CODEX_KEYS[field.key]} extractionSourceText={values[field.key] || ''} embedded /></div>}
              {field.key === 'politics' && <details className="mt-6 border border-border rounded-xl bg-bg-surface p-4"><summary className="cursor-pointer text-sm font-medium text-text-secondary">{t('humanity.legacySocietySummary')}</summary><div className="mt-4 space-y-4"><InlineTextarea value={values.legacySociety || ''} onChange={value => { setValues(current => ({ ...current, legacySociety: value })); save('politicsEconomyCulture', value) }} placeholder={t('humanity.legacySocietyPlaceholder')} /><CodexPanel project={project} fixedCategoryKeys={['humSociety']} extractionSourceText={values.legacySociety || ''} embedded /></div></details>}
            </div>
          })}
        </div>
      </div>
    </div>
  )
}

function NavButton({ active, onClick, label, streaming, pending, pendingLabel }: { active: boolean; onClick: () => void; label: string; streaming?: boolean; pending?: boolean; pendingLabel?: string }) {
  return <button type="button" onClick={onClick} className={`w-full text-left px-4 py-2.5 text-sm transition-colors border-l-2 flex items-center gap-1 ${active ? 'border-accent bg-accent/8 text-accent font-medium' : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-elevated'}`}><span className="flex-1">{label}</span>{streaming && !active && <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />}{pending && !streaming && <span className="w-2 h-2 rounded-full bg-warning shrink-0" aria-label={`${pendingLabel}有待确认候选`} title="有待确认候选" />}</button>
}

function HumanityFieldEditor({ meta, value, onChange, project, activeGroupId, copilot, candidate, otherPendingLabel, hasOtherPendingCandidates, onRunningChange, onAdopted }: { meta: FieldMeta; value: string; onChange: (value: string) => void; project: Project; activeGroupId: number | null; copilot: ReturnType<typeof useMasterCopilot>; candidate?: PendingMasterCandidate; otherPendingLabel?: string; hasOtherPendingCandidates: boolean; onRunningChange: (running: boolean) => void; onAdopted: (candidate: PendingMasterCandidate) => Promise<void> }) {
  const { t } = useDomainT('worldview')
  const fieldDefinition = HUMANITY_FIELD_KEYS[meta.key]
  const label = t(fieldDefinition.labelKey)
  const description = t(fieldDefinition.descKey)
  const hint = 'hintKey' in fieldDefinition ? t(fieldDefinition.hintKey) : undefined
  return <div className="max-w-3xl space-y-4"><div><h3 className="text-lg font-semibold text-text-primary">{meta.emoji} {label}</h3><p className="mt-1 text-sm text-text-muted">{description}</p>{hint && <p className="mt-1.5 text-xs text-accent/80 bg-accent/5 border border-accent/15 rounded px-2 py-1">💡 {hint}</p>}</div><div className="bg-bg-surface border border-border rounded-xl p-4"><InlineTextarea value={value} onChange={onChange} placeholder={description} /></div><WorldviewAgentControls field={meta.field} project={project} activeGroupId={activeGroupId} copilot={copilot} candidate={candidate} otherPendingWorldviewLabel={otherPendingLabel} hasOtherPendingCandidates={hasOtherPendingCandidates} onRunningChange={onRunningChange} onAdopted={onAdopted} /></div>
}
