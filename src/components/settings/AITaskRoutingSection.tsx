import { useTranslation } from 'react-i18next'
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

interface Props {
  presets: AIConfigPreset[]
  routes: AITaskRoutes
  contextProfiles: AgentContextProfiles
  teamBudgetProfile: AgentTeamBudgetProfile
  onSetRoute: (taskKind: AITaskKind, presetId: string | null) => void
  onSetContextProfile: (taskKind: AgentContextTaskKind, profile: AgentContextProfile) => void
  onSetTeamBudgetProfile: (profile: AgentTeamBudgetProfile) => void
}

const CONTEXT_PROFILES: AgentContextProfile[] = ['lean', 'balanced', 'full']
const TEAM_BUDGETS: AgentTeamBudgetProfile[] = ['economy', 'balanced', 'expanded']

function isContextTaskKind(taskKind: AITaskKind): taskKind is AgentContextTaskKind {
  return AGENT_CONTEXT_TASK_KINDS.includes(taskKind as AgentContextTaskKind)
}

export default function AITaskRoutingSection({
  presets,
  routes,
  contextProfiles,
  teamBudgetProfile,
  onSetRoute,
  onSetContextProfile,
  onSetTeamBudgetProfile,
}: Props) {
  const { t } = useTranslation('settings')

  const renderRoutes = (taskKinds: readonly AITaskKind[]) => (
    <div className="grid gap-2 sm:grid-cols-2">
      {taskKinds.map(taskKind => {
        const selectedPreset = presets.find(preset => preset.id === routes[taskKind])
        const contextTask = isContextTaskKind(taskKind)
        return (
          <label key={taskKind} className="block rounded border border-border bg-bg-base p-2.5">
            <span className="block text-xs font-medium text-text-primary">{t(`taskRouting.tasks.${taskKind}`)}</span>
            <span className="mb-2 block min-h-8 text-[11px] leading-4 text-text-muted">{t(`taskRouting.tasks.${taskKind}Desc`)}</span>
            <select value={selectedPreset?.id ?? ''}
              onChange={event => onSetRoute(taskKind, event.target.value || null)}
              aria-label={`${t(`taskRouting.tasks.${taskKind}`)} ${t('taskRouting.presetLabel')}`}
              className="w-full rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none">
              <option value="">{t('taskRouting.useGlobalModel')}</option>
              {presets.map(preset => (
                <option key={preset.id} value={preset.id}>{preset.name} · {preset.config.provider}/{preset.config.model}</option>
              ))}
            </select>
            {contextTask && (
              <>
                <span className="mb-1 mt-2 block text-[10px] text-text-muted">{t('taskRouting.contextLevel')}</span>
                <select
                  value={contextProfiles[taskKind]}
                  onChange={event => onSetContextProfile(taskKind, event.target.value as AgentContextProfile)}
                  aria-label={`${t(`taskRouting.tasks.${taskKind}`)} ${t('taskRouting.contextLevelLabel')}`}
                  className="w-full rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
                >
                  {CONTEXT_PROFILES.map(profile => (
                    <option key={profile} value={profile}>{t(`taskRouting.contextProfiles.${profile}`)} · {t(`taskRouting.contextProfiles.${profile}Desc`)}</option>
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
        <span className="block text-xs font-medium text-text-primary">{t('taskRouting.teamBudget')}</span>
        <span className="mt-0.5 block text-[10px] text-text-muted">
          {t('taskRouting.teamBudgetDescription')}
        </span>
        <select
          value={teamBudgetProfile}
          onChange={event => onSetTeamBudgetProfile(event.target.value as AgentTeamBudgetProfile)}
          aria-label={t('taskRouting.teamBudgetLabel')}
          className="mt-2 w-full rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
        >
          {TEAM_BUDGETS.map(profile => (
            <option key={profile} value={profile}>{t(`taskRouting.teamBudgets.${profile}`)} · {t(`taskRouting.teamBudgets.${profile}Desc`)}</option>
          ))}
        </select>
      </label>
      {renderRoutes(AGENT_ROLE_TASK_KINDS)}
      {presets.length === 0 && (
        <p className="mt-2 text-[11px] text-amber-400">{t('taskRouting.noPresetHint')}</p>
      )}
    </div>
  )
}
