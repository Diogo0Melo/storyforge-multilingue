import { useDomainT } from '../../i18n'
import type { AIConfigPreset } from '../../lib/types'
import {
  AGENT_ROLE_TASK_KINDS,
  GENERAL_AI_TASK_KINDS,
  type AITaskKind,
  type AITaskRoutes,
} from '../../lib/ai/task-routing'
import {
  AGENT_CONTEXT_TASK_KINDS,
  type AgentContextProfile,
  type AgentContextProfiles,
  type AgentContextTaskKind,
} from '../../lib/agent/context-policy'
import type { AgentTeamBudgetProfile } from '../../lib/agent/team-budget'
import type { CreativeQualityModeV1 } from '../../lib/agent/creative-reliability'

const TASK_LABEL_KEYS: Record<AITaskKind, 'taskRouting.tasks.creation.label' | 'taskRouting.tasks.extraction.label' | 'taskRouting.tasks.analysis.label' | 'taskRouting.tasks.review.label' | 'taskRouting.tasks.agentOrchestrator.label' | 'taskRouting.tasks.agentWorldOrigin.label' | 'taskRouting.tasks.agentCharacter.label' | 'taskRouting.tasks.agentInspiration.label' | 'taskRouting.tasks.agentOutline.label' | 'taskRouting.tasks.agentProse.label'> = {
  creation: 'taskRouting.tasks.creation.label',
  extraction: 'taskRouting.tasks.extraction.label',
  analysis: 'taskRouting.tasks.analysis.label',
  review: 'taskRouting.tasks.review.label',
  'agent-orchestrator': 'taskRouting.tasks.agentOrchestrator.label',
  'agent-world-origin': 'taskRouting.tasks.agentWorldOrigin.label',
  'agent-character': 'taskRouting.tasks.agentCharacter.label',
  'agent-inspiration': 'taskRouting.tasks.agentInspiration.label',
  'agent-outline': 'taskRouting.tasks.agentOutline.label',
  'agent-prose': 'taskRouting.tasks.agentProse.label',
}

const TASK_DESC_KEYS: Record<AITaskKind, 'taskRouting.tasks.creation.description' | 'taskRouting.tasks.extraction.description' | 'taskRouting.tasks.analysis.description' | 'taskRouting.tasks.review.description' | 'taskRouting.tasks.agentOrchestrator.description' | 'taskRouting.tasks.agentWorldOrigin.description' | 'taskRouting.tasks.agentCharacter.description' | 'taskRouting.tasks.agentInspiration.description' | 'taskRouting.tasks.agentOutline.description' | 'taskRouting.tasks.agentProse.description'> = {
  creation: 'taskRouting.tasks.creation.description',
  extraction: 'taskRouting.tasks.extraction.description',
  analysis: 'taskRouting.tasks.analysis.description',
  review: 'taskRouting.tasks.review.description',
  'agent-orchestrator': 'taskRouting.tasks.agentOrchestrator.description',
  'agent-world-origin': 'taskRouting.tasks.agentWorldOrigin.description',
  'agent-character': 'taskRouting.tasks.agentCharacter.description',
  'agent-inspiration': 'taskRouting.tasks.agentInspiration.description',
  'agent-outline': 'taskRouting.tasks.agentOutline.description',
  'agent-prose': 'taskRouting.tasks.agentProse.description',
}

interface Props {
  presets: AIConfigPreset[]
  routes: AITaskRoutes
  contextProfiles: AgentContextProfiles
  teamBudgetProfile: AgentTeamBudgetProfile
  creativeReliabilityEnabled: boolean
  creativeQualityMode: CreativeQualityModeV1
  onSetRoute: (taskKind: AITaskKind, presetId: string | null) => void
  onSetContextProfile: (taskKind: AgentContextTaskKind, profile: AgentContextProfile) => void
  onSetTeamBudgetProfile: (profile: AgentTeamBudgetProfile) => void
  onSetCreativeReliabilityEnabled: (enabled: boolean) => void
  onSetCreativeQualityMode: (mode: CreativeQualityModeV1) => void
}

const CONTEXT_PROFILE_LABEL_KEYS: Record<AgentContextProfile, 'taskRouting.contextProfiles.lean.label' | 'taskRouting.contextProfiles.balanced.label' | 'taskRouting.contextProfiles.full.label'> = {
  lean: 'taskRouting.contextProfiles.lean.label',
  balanced: 'taskRouting.contextProfiles.balanced.label',
  full: 'taskRouting.contextProfiles.full.label',
}

const CONTEXT_PROFILE_DESC_KEYS: Record<AgentContextProfile, 'taskRouting.contextProfiles.lean.description' | 'taskRouting.contextProfiles.balanced.description' | 'taskRouting.contextProfiles.full.description'> = {
  lean: 'taskRouting.contextProfiles.lean.description',
  balanced: 'taskRouting.contextProfiles.balanced.description',
  full: 'taskRouting.contextProfiles.full.description',
}

const TEAM_BUDGET_LABEL_KEYS: Record<AgentTeamBudgetProfile, 'taskRouting.teamBudgets.economy.label' | 'taskRouting.teamBudgets.balanced.label' | 'taskRouting.teamBudgets.expanded.label'> = {
  economy: 'taskRouting.teamBudgets.economy.label',
  balanced: 'taskRouting.teamBudgets.balanced.label',
  expanded: 'taskRouting.teamBudgets.expanded.label',
}

const TEAM_BUDGET_DESC_KEYS: Record<AgentTeamBudgetProfile, 'taskRouting.teamBudgets.economy.description' | 'taskRouting.teamBudgets.balanced.description' | 'taskRouting.teamBudgets.expanded.description'> = {
  economy: 'taskRouting.teamBudgets.economy.description',
  balanced: 'taskRouting.teamBudgets.balanced.description',
  expanded: 'taskRouting.teamBudgets.expanded.description',
}

type QualityModeLabelKey =
  | 'taskRouting.qualityModes.economy.label'
  | 'taskRouting.qualityModes.balanced.label'
  | 'taskRouting.qualityModes.refine.label'
type QualityModeDescriptionKey =
  | 'taskRouting.qualityModes.economy.description'
  | 'taskRouting.qualityModes.balanced.description'
  | 'taskRouting.qualityModes.refine.description'

const QUALITY_MODE_LABEL_KEYS: Record<CreativeQualityModeV1, QualityModeLabelKey> = {
  economy: 'taskRouting.qualityModes.economy.label',
  balanced: 'taskRouting.qualityModes.balanced.label',
  refine: 'taskRouting.qualityModes.refine.label',
}
const QUALITY_MODE_DESCRIPTION_KEYS: Record<CreativeQualityModeV1, QualityModeDescriptionKey> = {
  economy: 'taskRouting.qualityModes.economy.description',
  balanced: 'taskRouting.qualityModes.balanced.description',
  refine: 'taskRouting.qualityModes.refine.description',
}

function isContextTaskKind(taskKind: AITaskKind): taskKind is AgentContextTaskKind {
  return AGENT_CONTEXT_TASK_KINDS.includes(taskKind as AgentContextTaskKind)
}

export default function AITaskRoutingSection({
  presets,
  routes,
  contextProfiles,
  teamBudgetProfile,
  creativeReliabilityEnabled,
  creativeQualityMode,
  onSetRoute,
  onSetContextProfile,
  onSetTeamBudgetProfile,
  onSetCreativeReliabilityEnabled,
  onSetCreativeQualityMode,
}: Props) {
  const { t } = useDomainT('settings')
  const renderRoutes = (taskKinds: readonly AITaskKind[]) => (
    <div className="grid gap-2 sm:grid-cols-2">
      {taskKinds.map(taskKind => {
        const selectedPreset = presets.find(preset => preset.id === routes[taskKind])
        const label = t(TASK_LABEL_KEYS[taskKind])
        const description = t(TASK_DESC_KEYS[taskKind])
        const contextTask = isContextTaskKind(taskKind)
        return (
          <label key={taskKind} className="block rounded border border-border bg-bg-base p-2.5">
            <span className="block text-xs font-medium text-text-primary">{label}</span>
            <span className="mb-2 block min-h-8 text-[11px] leading-4 text-text-muted">{description}</span>
            <select value={selectedPreset?.id ?? ''}
              onChange={event => onSetRoute(taskKind, event.target.value || null)}
              aria-label={t('taskRouting.routeAria', { label })}
              className="w-full rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none">
              <option value="">{t('taskRouting.useGlobalModel')}</option>
              {presets.map(preset => (
                <option key={preset.id} value={preset.id}>{preset.name} · {preset.config.provider}/{preset.config.model}</option>
              ))}
            </select>
            {contextTask && (
              <>
                <span className="mb-1 mt-2 block text-[10px] text-text-muted">{t('taskRouting.contextTierLabel')}</span>
                <select
                  value={contextProfiles[taskKind]}
                  onChange={event => onSetContextProfile(taskKind, event.target.value as AgentContextProfile)}
                  aria-label={t('taskRouting.contextTierAria', { label })}
                  className="w-full rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
                >
                  {(Object.keys(CONTEXT_PROFILE_LABEL_KEYS) as AgentContextProfile[])
                    .map(profile => (
                      <option key={profile} value={profile}>{t(CONTEXT_PROFILE_LABEL_KEYS[profile])} · {t(CONTEXT_PROFILE_DESC_KEYS[profile])}</option>
                    ))}
                </select>
              </>
            )}
          </label>
        )
      })}
    </div>
  )

  return (
    <div className="mb-4 border-b border-border/50 pb-4">
      <div className="mb-2">
        <h4 className="text-sm font-medium text-text-secondary">{t('taskRouting.title')}</h4>
        <p className="mt-1 text-[11px] text-text-muted">
          {t('taskRouting.description')}
        </p>
      </div>
      {renderRoutes(GENERAL_AI_TASK_KINDS)}
      <div className="mb-2 mt-4">
        <h5 className="text-xs font-medium text-text-secondary">{t('taskRouting.agentTeamTitle')}</h5>
        <p className="mt-1 text-[11px] text-text-muted">
          {t('taskRouting.agentTeamDescription')}
        </p>
      </div>
      <label className="mb-2 block rounded border border-border bg-bg-base p-2.5">
        <span className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={creativeReliabilityEnabled}
            onChange={event => onSetCreativeReliabilityEnabled(event.target.checked)}
            aria-label={t('taskRouting.reliabilityAria')}
            className="mt-0.5"
          />
          <span>
            <span className="block text-xs font-medium text-text-primary">{t('taskRouting.reliabilityLabel')}</span>
            <span className="mt-0.5 block text-[10px] text-text-muted">
              {creativeReliabilityEnabled
                ? t('taskRouting.reliabilityDescriptionEnabled')
                : t('taskRouting.reliabilityDescriptionDisabled')}
            </span>
          </span>
        </span>
      </label>
      <label className="mb-2 block rounded border border-border bg-bg-base p-2.5">
        <span className="block text-xs font-medium text-text-primary">{t('taskRouting.qualityModeLabel')}</span>
        <span className="mt-0.5 block text-[10px] text-text-muted">
          {t('taskRouting.qualityModeDescription')}
        </span>
        <select
          value={creativeQualityMode}
          disabled={!creativeReliabilityEnabled}
          onChange={event => onSetCreativeQualityMode(event.target.value as CreativeQualityModeV1)}
          aria-label={t('taskRouting.qualityModeAria')}
          className="mt-2 w-full rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
        >
          {(Object.keys(QUALITY_MODE_LABEL_KEYS) as CreativeQualityModeV1[])
            .map(mode => (
              <option key={mode} value={mode}>{t(QUALITY_MODE_LABEL_KEYS[mode])} · {t(QUALITY_MODE_DESCRIPTION_KEYS[mode])}</option>
            ))}
        </select>
      </label>
      <label className="mb-2 block rounded border border-border bg-bg-base p-2.5">
        <span className="block text-xs font-medium text-text-primary">{t('taskRouting.teamBudgetLabel')}</span>
        <span className="mt-0.5 block text-[10px] text-text-muted">
          {t('taskRouting.teamBudgetDescription')}
        </span>
        <select
          value={teamBudgetProfile}
          onChange={event => onSetTeamBudgetProfile(event.target.value as AgentTeamBudgetProfile)}
          aria-label={t('taskRouting.teamBudgetAria')}
          className="mt-2 w-full rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
        >
          {(Object.keys(TEAM_BUDGET_LABEL_KEYS) as AgentTeamBudgetProfile[])
            .map(profile => (
              <option key={profile} value={profile}>{t(TEAM_BUDGET_LABEL_KEYS[profile])} · {t(TEAM_BUDGET_DESC_KEYS[profile])}</option>
            ))}
        </select>
      </label>
      {renderRoutes(AGENT_ROLE_TASK_KINDS)}
      {presets.length === 0 && (
        <p className="mt-2 text-[11px] text-amber-400">{t('taskRouting.noPresetsWarning')}</p>
      )}
    </div>
  )
}
