import {
  getMasterWorkflowV1,
  selectMasterWorkflowV1,
  classifyRequestedDomainIdsV1,
  type MasterWorkflowIdV1,
} from './workflow-catalog'
import {
  resolveAgentTeamBudgetPolicy,
  type AgentTeamBudgetProfile,
} from './team-budget'
import {
  resolveCreativeQualityPolicyV1,
  type CreativeQualityModeV1,
} from './creative-reliability'
import type { DomainAgentId } from './skill-registry'
import { getT } from '../../i18n'

const DOMAIN_LABEL_KEYS = {
  'world-origin': 'agent:preview.domain.worldOrigin',
  character: 'agent:preview.domain.character',
  inspiration: 'agent:preview.domain.inspiration',
  outline: 'agent:preview.domain.outline',
  prose: 'agent:preview.domain.prose',
} as const satisfies Record<DomainAgentId, string>

export interface CreativeRunPreviewV1 {
  version: 1
  workflowId: MasterWorkflowIdV1
  artifactLabels: string[]
  artifactCount: number
  deferredArtifactLabels: string[]
  plannerCalls: 0 | 1
  requiredReviewCalls: number
  usualModelCalls: number
  hardMaxModelCalls: number
  hardMaxTokens: number
  qualityMode: CreativeQualityModeV1
  automaticRepairCallsPerArtifact: 0 | 1
}

/**
 * Gives the author a conservative, non-billing preview before any model call.
 * Exact token and currency cost cannot be known until registered context and
 * provider usage are available, so this deliberately exposes the usual call
 * shape plus the already-enforced team hard limits.
 */
export function estimateCreativeRunPreviewV1(input: {
  request: string
  qualityMode: CreativeQualityModeV1
  teamBudgetProfile: AgentTeamBudgetProfile
  locale?: string
}): CreativeRunPreviewV1 {
  const requested = [...classifyRequestedDomainIdsV1(input.request)]
  const workflowSelection = selectMasterWorkflowV1(input.request)
  const workflow = getMasterWorkflowV1(workflowSelection)
  const activeDomains: DomainAgentId[] = requested.length
    ? [...requested]
    : ['character']
  const deferredDomains: DomainAgentId[] = []

  // Outline + prose is an explicit author-confirmation barrier. The first run
  // may produce the outline, never an unconfirmed prose draft hidden behind it.
  if (activeDomains.includes('outline') && activeDomains.includes('prose')) {
    activeDomains.splice(activeDomains.indexOf('prose'), 1)
    deferredDomains.push('prose')
  }

  const plannerCalls = workflow.planner === 'required' ? 1 : 0
  const requiredReviewCalls = workflow.strategy === 'fan-out'
    ? activeDomains.filter(domain => domain === 'world-origin' || domain === 'inspiration').length
    : 0
  const teamPolicy = resolveAgentTeamBudgetPolicy(input.teamBudgetProfile)
  const qualityPolicy = resolveCreativeQualityPolicyV1(input.qualityMode)
  const t = getT()
  const labelOptions = input.locale ? { lng: input.locale } : {}
  const localizedDomainLabel = (domain: DomainAgentId): string => {
    const key = DOMAIN_LABEL_KEYS[domain]
    return t(key, { ...labelOptions, defaultValue: key })
  }

  return {
    version: 1,
    workflowId: workflowSelection.workflowId,
    artifactLabels: activeDomains.map(localizedDomainLabel),
    artifactCount: activeDomains.length,
    deferredArtifactLabels: deferredDomains.map(localizedDomainLabel),
    plannerCalls,
    requiredReviewCalls,
    usualModelCalls: plannerCalls + activeDomains.length + requiredReviewCalls,
    hardMaxModelCalls: teamPolicy.maxCalls,
    hardMaxTokens: teamPolicy.maxTokens,
    qualityMode: qualityPolicy.mode,
    automaticRepairCallsPerArtifact: qualityPolicy.allowAutomaticRepair ? 1 : 0,
  }
}
