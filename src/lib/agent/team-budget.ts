import { estimateTokens } from '../ai/context-budget'
import type { ChatMessage } from '../types'
import i18n from '../../i18n/i18n'
import { formatNumber } from '../../i18n/format'

export const AGENT_TEAM_BUDGET_PROFILES = ['economy', 'balanced', 'expanded'] as const
export type AgentTeamBudgetProfile = typeof AGENT_TEAM_BUDGET_PROFILES[number]

export interface AgentTeamBudgetPolicy {
  profile: AgentTeamBudgetProfile
  maxTokens: number
  maxCalls: number
  maxCanonRetries: number
}

export interface AgentTeamBudgetEvidence extends AgentTeamBudgetPolicy {
  usedTokens: number
  calls: number
  canonRetries: number
}

export interface AgentTeamCallReservation {
  label: string
  estimatedInputTokens: number
  reservedOutputTokens: number
}

const POLICIES: Record<AgentTeamBudgetProfile, AgentTeamBudgetPolicy> = {
  economy: { profile: 'economy', maxTokens: 80_000, maxCalls: 7, maxCanonRetries: 1 },
  balanced: { profile: 'balanced', maxTokens: 160_000, maxCalls: 7, maxCanonRetries: 1 },
  expanded: { profile: 'expanded', maxTokens: 240_000, maxCalls: 7, maxCanonRetries: 1 },
}

export class AgentTeamBudgetExceededError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentTeamBudgetExceededError'
  }
}

export function sanitizeAgentTeamBudgetProfile(value: unknown): AgentTeamBudgetProfile {
  return AGENT_TEAM_BUDGET_PROFILES.includes(value as AgentTeamBudgetProfile)
    ? value as AgentTeamBudgetProfile
    : 'balanced'
}

export function resolveAgentTeamBudgetPolicy(
  profile: AgentTeamBudgetProfile,
): AgentTeamBudgetPolicy {
  return { ...POLICIES[profile] }
}

function outputText(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export class AgentTeamBudgetTracker {
  readonly policy: AgentTeamBudgetPolicy
  private usedTokens = 0
  private calls = 0
  private canonRetries = 0

  constructor(profile: AgentTeamBudgetProfile) {
    this.policy = resolveAgentTeamBudgetPolicy(profile)
  }

  reserveCall(input: {
    label: string
    messages: readonly ChatMessage[]
    maxOutputTokens: number
  }): AgentTeamCallReservation {
    const estimatedInputTokens = input.messages
      .reduce((sum, message) => sum + estimateTokens(message.content), 0)
    const reservedOutputTokens = Math.max(1, Math.floor(input.maxOutputTokens))
    if (this.calls + 1 > this.policy.maxCalls) {
      throw new AgentTeamBudgetExceededError(
        i18n.t('common:errors.agent.budgetCallLimit', { max: this.policy.maxCalls, label: input.label }),
      )
    }
    const projected = this.usedTokens + estimatedInputTokens + reservedOutputTokens
    if (projected > this.policy.maxTokens) {
      throw new AgentTeamBudgetExceededError(
        i18n.t('common:errors.agent.budgetTokenLimit', {
          used: formatNumber(this.usedTokens),
          label: input.label,
          needed: formatNumber(estimatedInputTokens + reservedOutputTokens),
          max: formatNumber(this.policy.maxTokens),
        }),
      )
    }
    this.calls += 1
    return { label: input.label, estimatedInputTokens, reservedOutputTokens }
  }

  settleCall(reservation: AgentTeamCallReservation, output: unknown): void {
    this.usedTokens += reservation.estimatedInputTokens + estimateTokens(outputText(output))
  }

  settleFailedCall(reservation: AgentTeamCallReservation): void {
    this.usedTokens += reservation.estimatedInputTokens
  }

  claimCanonRetry(issues: readonly { message: string }[]): void {
    if (this.canonRetries >= this.policy.maxCanonRetries) {
      throw new AgentTeamBudgetExceededError(
        i18n.t('common:errors.agent.budgetCanonRetryExhausted', {
          max: this.policy.maxCanonRetries,
          messages: issues.map(issue => issue.message).join('；'),
        }),
      )
    }
    this.canonRetries += 1
  }

  snapshot(): AgentTeamBudgetEvidence {
    return {
      ...this.policy,
      usedTokens: this.usedTokens,
      calls: this.calls,
      canonRetries: this.canonRetries,
    }
  }
}
