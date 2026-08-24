import { useEffect, useState } from 'react'
import { useDomainT } from '../../i18n'
import { useWorldviewStore } from '../../stores/worldview'
import { useWorldGroupStore } from '../../stores/world-group'
import WorldGroupSwitcher from '../world-group/WorldGroupSwitcher'
import { InlineTextarea } from '../shared/InlineEdit'
import { useMasterCopilot, type PendingMasterCandidate } from '../agent/useMasterCopilot'
import WorldviewAgentControls from './WorldviewAgentControls'
import WorldviewOriginSidebar, { WORLDVIEW_ORIGIN_FIELDS, type WorldviewOriginFieldKey } from './WorldviewOriginSidebar'
import CultivationSystemsPanel from './CultivationSystemsPanel'
import CodexPanel from '../codex/CodexPanel'
import CodexSearchBar from '../codex/CodexSearchBar'
import type { Project, DivineDesign } from '../../lib/types'
import type { WorldviewAgentField } from '../../lib/agent/worldview-field-copilot'
import { INITIAL_RECORD_TARGET_CLASS, initialRecordTargetAttributes, useInitialRecordTarget } from '../shared/initial-record-target'

const ORIGIN_FIELD_KEYS = {
  origin: { labelKey: 'origin.fields.origin.label' as const, descKey: 'origin.fields.origin.desc' as const },
  power: { labelKey: 'origin.fields.power.label' as const, descKey: 'origin.fields.power.desc' as const },
  divine: { labelKey: 'origin.fields.divine.label' as const, descKey: 'origin.fields.divine.desc' as const },
}
const AGENT_FIELD_BY_ORIGIN_KEY: Record<WorldviewOriginFieldKey, WorldviewAgentField> = {
  origin: 'worldOrigin', power: 'powerHierarchy', divine: 'divineDesign',
}

interface Props { project: Project; initialWorldviewId?: number | null }

export default function WorldviewOriginPanel({ project, initialWorldviewId }: Props) {
  const { t } = useDomainT('worldview')
  const { worldview, saveWorldview, loadAll } = useWorldviewStore()
  const activeGroupId = useWorldGroupStore(state => state.activeGroupId)
  const copilot = useMasterCopilot({ project, worldGroupId: project.enableMultiWorld ? activeGroupId : null })
  const [active, setActive] = useState<WorldviewOriginFieldKey>('origin')
  const [worldOrigin, setWorldOrigin] = useState('')
  const [powerHierarchy, setPowerHierarchy] = useState('')
  const [divineDesign, setDivineDesign] = useState<DivineDesign>({ hasDivinity: false, divineRank: '', divineNames: '', divineRules: '' })
  const [runningField, setRunningField] = useState<WorldviewAgentField | null>(null)

  useInitialRecordTarget(initialWorldviewId, worldview?.id === initialWorldviewId)
  useEffect(() => { loadAll(project.id!, project.enableMultiWorld ? activeGroupId : null) }, [project.id, project.enableMultiWorld, activeGroupId, loadAll])
  useEffect(() => {
    if (!worldview) return
    setWorldOrigin(worldview.worldOrigin || '')
    setPowerHierarchy(worldview.powerHierarchy || '')
    setDivineDesign(worldview.divineDesign || { hasDivinity: false, divineRank: '', divineNames: '', divineRules: '' })
  }, [worldview])

  const pendingCandidates = copilot.pendingCandidates.filter(candidate => candidate.payload.skillId === 'world-origin.worldview-field')
  const pendingOriginKey = (Object.entries(AGENT_FIELD_BY_ORIGIN_KEY) as Array<[WorldviewOriginFieldKey, WorldviewAgentField]>).find(([, field]) => field === pendingCandidates[0]?.payload.worldviewField)?.[0]
  const hasOtherPendingCandidates = copilot.pendingCandidates.some(candidate => candidate.payload.skillId !== 'world-origin.worldview-field')
  const streamingKeys = new Set<string>()
  const pendingKeys = new Set<string>()
  const runningOriginKey = (Object.entries(AGENT_FIELD_BY_ORIGIN_KEY) as Array<[WorldviewOriginFieldKey, WorldviewAgentField]>).find(([, field]) => field === runningField)?.[0]
  if (copilot.busy && runningOriginKey) streamingKeys.add(runningOriginKey)
  if (pendingOriginKey) pendingKeys.add(pendingOriginKey)
  useEffect(() => { if (pendingOriginKey) setActive(pendingOriginKey) }, [pendingOriginKey])

  const adopt = async (candidate: PendingMasterCandidate) => {
    await copilot.adoptCandidate(candidate)
    await loadAll(project.id!, project.enableMultiWorld ? activeGroupId : null)
  }
  const save = (patch: Record<string, unknown>) => { void saveWorldview({ projectId: project.id!, ...patch }) }
  const currentCandidate = (field: WorldviewAgentField) => pendingCandidates.find(candidate => candidate.payload.worldviewField === field)
  const otherPending = (field: WorldviewAgentField) => pendingCandidates.find(candidate => candidate.payload.worldviewField !== field)?.payload.label

  return (
    <div {...initialRecordTargetAttributes(worldview?.id === initialWorldviewId, worldview?.id)} className={`flex flex-col w-full max-w-5xl space-y-4 rounded-xl ${worldview?.id === initialWorldviewId ? INITIAL_RECORD_TARGET_CLASS : ''}`}>
      <div className="pb-4 border-b border-border/40">
        <div className="flex items-start justify-between gap-3"><h2 className="text-xl font-bold text-text-primary">{t('origin.title')}</h2>{project.enableMultiWorld && <WorldGroupSwitcher />}</div>
        <p className="text-xs text-text-muted mt-0.5">{t('origin.subtitle')}</p>
        <div className="mt-3 max-w-xl"><CodexSearchBar categoryKeys={['originPower', 'originDeity']} onJump={category => setActive(category === 'originDeity' ? 'divine' : 'power')} /></div>
        {copilot.recoveryAvailable && !copilot.busy && <div className="mt-3 rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-secondary">{t('agent:chat.recoveryAvailable')}<button type="button" onClick={() => { void copilot.resume() }} className="ml-2 text-accent hover:underline">{t('agent:chat.resumeButton')}</button></div>}
      </div>
      <div className="flex gap-4">
        <WorldviewOriginSidebar active={active} streamingKeys={streamingKeys} pendingKeys={pendingKeys} onSelect={setActive} />
        <div className="flex-1 min-w-0">
          <div className={active === 'origin' ? '' : 'hidden'}><TextFieldEditor fieldKey="origin" value={worldOrigin} onChange={value => { setWorldOrigin(value); save({ worldOrigin: value }) }} project={project} activeGroupId={activeGroupId} copilot={copilot} candidate={currentCandidate('worldOrigin')} otherPendingLabel={otherPending('worldOrigin')} hasOtherPendingCandidates={hasOtherPendingCandidates} onRunningChange={running => setRunningField(running ? 'worldOrigin' : null)} onAdopted={adopt} /></div>
          <div className={active === 'power' ? '' : 'hidden'}><TextFieldEditor fieldKey="power" value={powerHierarchy} onChange={value => { setPowerHierarchy(value); save({ powerHierarchy: value }) }} project={project} activeGroupId={activeGroupId} copilot={copilot} candidate={currentCandidate('powerHierarchy')} otherPendingLabel={otherPending('powerHierarchy')} hasOtherPendingCandidates={hasOtherPendingCandidates} onRunningChange={running => setRunningField(running ? 'powerHierarchy' : null)} onAdopted={adopt} /><CultivationSystemsPanel project={project} /><div className="mt-6"><h3 className="text-sm font-semibold text-text-primary mb-1">{t('origin.powerCodexHeading')}</h3><p className="text-xs text-text-muted mb-3">{t('origin.powerCodexHint')}</p><CodexPanel project={project} fixedCategoryKeys={['originPower']} extractionSourceText={powerHierarchy} embedded /></div></div>
          <div className={active === 'divine' ? '' : 'hidden'}><DivineFieldEditor divineDesign={divineDesign} onDivineChange={next => { setDivineDesign(next); save({ divineDesign: next }) }} project={project} activeGroupId={activeGroupId} copilot={copilot} candidate={currentCandidate('divineDesign')} otherPendingLabel={otherPending('divineDesign')} hasOtherPendingCandidates={hasOtherPendingCandidates} onRunningChange={running => setRunningField(running ? 'divineDesign' : null)} onAdopted={adopt} /><div className="mt-6"><h3 className="text-sm font-semibold text-text-primary mb-1">{t('origin.divineCodexHeading')}</h3><p className="text-xs text-text-muted mb-3">{t('origin.divineCodexHint')}</p><CodexPanel project={project} fixedCategoryKeys={['originDeity']} extractionSourceText={[divineDesign.divineNames, divineDesign.divineRank, divineDesign.divineRules].filter(Boolean).join('\n\n')} embedded /></div></div>
        </div>
      </div>
    </div>
  )
}

function AgentFieldControls({ field, project, activeGroupId, copilot, candidate, otherPendingLabel, hasOtherPendingCandidates, onRunningChange, onAdopted, buttonLabel }: { field: WorldviewAgentField; project: Project; activeGroupId: number | null; copilot: ReturnType<typeof useMasterCopilot>; candidate?: PendingMasterCandidate; otherPendingLabel?: string; hasOtherPendingCandidates: boolean; onRunningChange: (running: boolean) => void; onAdopted: (candidate: PendingMasterCandidate) => Promise<void>; buttonLabel?: string }) {
  return <WorldviewAgentControls field={field} project={project} activeGroupId={activeGroupId} copilot={copilot} candidate={candidate} otherPendingWorldviewLabel={otherPendingLabel} hasOtherPendingCandidates={hasOtherPendingCandidates} onRunningChange={onRunningChange} onAdopted={onAdopted} buttonLabel={buttonLabel} />
}

function TextFieldEditor({ fieldKey, value, onChange, project, activeGroupId, copilot, candidate, otherPendingLabel, hasOtherPendingCandidates, onRunningChange, onAdopted }: { fieldKey: 'origin' | 'power'; value: string; onChange: (value: string) => void; project: Project; activeGroupId: number | null; copilot: ReturnType<typeof useMasterCopilot>; candidate?: PendingMasterCandidate; otherPendingLabel?: string; hasOtherPendingCandidates: boolean; onRunningChange: (running: boolean) => void; onAdopted: (candidate: PendingMasterCandidate) => Promise<void> }) {
  const { t } = useDomainT('worldview')
  const label = t(ORIGIN_FIELD_KEYS[fieldKey].labelKey)
  const description = t(ORIGIN_FIELD_KEYS[fieldKey].descKey)
  const icon = WORLDVIEW_ORIGIN_FIELDS.find(field => field.key === fieldKey)?.icon
  return <div className="space-y-4"><div><h2 className="text-lg font-bold text-text-primary">{icon} {label}</h2><p className="text-xs text-text-muted mt-0.5">{description}</p></div><div className="bg-bg-surface border border-border rounded-lg p-4"><InlineTextarea value={value} onChange={onChange} placeholder={description} /></div><AgentFieldControls field={fieldKey === 'origin' ? 'worldOrigin' : 'powerHierarchy'} project={project} activeGroupId={activeGroupId} copilot={copilot} candidate={candidate} otherPendingLabel={otherPendingLabel} hasOtherPendingCandidates={hasOtherPendingCandidates} onRunningChange={onRunningChange} onAdopted={onAdopted} /></div>
}

function DivineFieldEditor({ divineDesign, onDivineChange, project, activeGroupId, copilot, candidate, otherPendingLabel, hasOtherPendingCandidates, onRunningChange, onAdopted }: { divineDesign: DivineDesign; onDivineChange: (next: DivineDesign) => void; project: Project; activeGroupId: number | null; copilot: ReturnType<typeof useMasterCopilot>; candidate?: PendingMasterCandidate; otherPendingLabel?: string; hasOtherPendingCandidates: boolean; onRunningChange: (running: boolean) => void; onAdopted: (candidate: PendingMasterCandidate) => Promise<void> }) {
  const { t } = useDomainT('worldview')
  return <div className="space-y-4"><div><h2 className="text-lg font-bold text-text-primary">🌟 {t('origin.fields.divine.label')}</h2><p className="text-xs text-text-muted mt-0.5">{t('origin.fields.divine.desc')}</p></div><label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={divineDesign.hasDivinity} onChange={event => onDivineChange({ ...divineDesign, hasDivinity: event.target.checked })} className="accent-accent" /><span className="text-text-secondary">{t('origin.divine.hasDivinity')}</span></label>{divineDesign.hasDivinity && <div className="space-y-0 divide-y divide-border/40"><DivineRow label={t('origin.divine.rankLabel')} value={divineDesign.divineRank} placeholder={t('origin.divine.rankPlaceholder')} onChange={value => onDivineChange({ ...divineDesign, divineRank: value })} /><DivineRow label={t('origin.divine.namesLabel')} value={divineDesign.divineNames} placeholder={t('origin.divine.namesPlaceholder')} onChange={value => onDivineChange({ ...divineDesign, divineNames: value })} /><DivineRow label={t('origin.divine.rulesLabel')} value={divineDesign.divineRules} placeholder={t('origin.divine.rulesPlaceholder')} onChange={value => onDivineChange({ ...divineDesign, divineRules: value })} /></div>}<AgentFieldControls field="divineDesign" project={project} activeGroupId={activeGroupId} copilot={copilot} candidate={candidate} otherPendingLabel={otherPendingLabel} hasOtherPendingCandidates={hasOtherPendingCandidates} onRunningChange={onRunningChange} onAdopted={onAdopted} buttonLabel={t('origin.divine.generateButton')} /></div>
}

function DivineRow({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return <div className="flex gap-4 py-3"><span className="w-24 shrink-0 text-xs text-text-muted pt-0.5 text-right">{label}</span><div className="flex-1 min-w-0"><InlineTextarea value={value} onChange={onChange} placeholder={placeholder} /></div></div>
}
