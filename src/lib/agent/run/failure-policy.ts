import { AIError } from '../../types'
import type {
  AgentRunFailureActionV1,
  AgentRunFailureCategoryV1,
  AnyAgentRunEventV1,
} from '../../types/agent-run'
import { AgentTeamBudgetExceededError } from '../team-budget'
import { hashCanonicalValue } from './hash'

export interface AgentRunFailureEvidenceV1 {
  code: string
  retryable: boolean
  category: AgentRunFailureCategoryV1
  action: AgentRunFailureActionV1
  fingerprint: string
}

export interface AgentRunFailureInitV1 {
  /** Stable internal code; must be locale-independent. */
  code: string
  category: AgentRunFailureCategoryV1
  action: AgentRunFailureActionV1
  retryable: boolean
  /** Localized message for user-facing display only; never drives classification. */
  displayMessage: string
}

/**
 * A failure whose classification and fingerprint identity are carried as stable,
 * locale-independent fields. The `message` is localized purely for user-facing
 * display; `classifyAgentRunFailureV1` derives code/category/action and the
 * fingerprint from the stable fields, so the same logical failure hashes
 * identically regardless of the UI locale active when it was thrown.
 */
export class AgentRunFailureError extends Error {
  readonly failureCode: string
  readonly failureCategory: AgentRunFailureCategoryV1
  readonly failureAction: AgentRunFailureActionV1
  readonly failureRetryable: boolean

  constructor(init: AgentRunFailureInitV1) {
    super(init.displayMessage)
    this.name = 'AgentRunFailureError'
    this.failureCode = init.code
    this.failureCategory = init.category
    this.failureAction = init.action
    this.failureRetryable = init.retryable
  }
}

export function isAgentRunFailureError(error: unknown): error is AgentRunFailureError {
  return error instanceof AgentRunFailureError
}

function normalizedMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .trim()
    .replace(/[a-f0-9]{32,}/gi, '<hash>')
    .replace(/\b\d{3,}\b/g, '<n>')
    .slice(0, 500)
}

function decision(error: unknown): Omit<AgentRunFailureEvidenceV1, 'fingerprint'> {
  // Coded failures carry a stable, locale-independent classification. They are
  // resolved before any message-based heuristic so the same logical failure
  // classifies identically regardless of the UI locale of its display message.
  if (isAgentRunFailureError(error)) {
    return {
      code: error.failureCode,
      retryable: error.failureRetryable,
      category: error.failureCategory,
      action: error.failureAction,
    }
  }
  if (error instanceof AgentTeamBudgetExceededError) {
    return { code: 'team_budget_exhausted', retryable: false, category: 'budget', action: 'fail' }
  }
  if (error instanceof Error && error.name === 'MasterCandidateSemanticReviewBlockedError') {
    return {
      code: 'semantic_review_blocked',
      retryable: false,
      category: 'deterministic',
      action: 'pause-for-author',
    }
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'host_interrupted', retryable: true, category: 'cancelled', action: 'retry' }
  }
  if (error instanceof AIError) {
    if ([408, 409, 425, 429].includes(error.status) || error.status >= 500) {
      return { code: 'provider_transient', retryable: true, category: 'transient', action: 'retry' }
    }
    if (error.status === 401 || error.status === 403) {
      return { code: 'provider_authorization', retryable: false, category: 'deterministic', action: 'pause-for-author' }
    }
    return { code: 'provider_request_rejected', retryable: false, category: 'deterministic', action: 'pause-for-author' }
  }

  const message = normalizedMessage(error)
  if (/stale|过期|已变化|依赖.*不一致|上下文.*不一致|快照.*不匹配/i.test(message)) {
    return { code: 'stale_input', retryable: false, category: 'stale-input', action: 'replan' }
  }
  if (/JSON|协议|解析|格式|schema|结构化/i.test(message) || error instanceof SyntaxError) {
    return { code: 'protocol_error', retryable: true, category: 'protocol', action: 'retry' }
  }
  if (/Canon|确定性.*校验|硬门|gate|违反.*约束/i.test(message)) {
    return { code: 'deterministic_verification_failed', retryable: false, category: 'deterministic', action: 'replan' }
  }
  if (/timeout|timed out|network|fetch|socket|超时|网络|限流|服务暂不可用/i.test(message)) {
    return { code: 'provider_transient', retryable: true, category: 'transient', action: 'retry' }
  }
  return { code: 'execution_unknown', retryable: true, category: 'unknown', action: 'retry' }
}

export async function classifyAgentRunFailureV1(error: unknown): Promise<AgentRunFailureEvidenceV1> {
  const classified = decision(error)
  return {
    ...classified,
    fingerprint: await hashCanonicalValue({
      version: 1,
      category: classified.category,
      code: classified.code,
      name: error instanceof Error ? error.name : typeof error,
      // Locale-stable identity: coded failures hash their stable internal code,
      // never the localized display message, so the same logical failure yields an
      // identical fingerprint across locales. Uncoded errors keep the historical
      // normalized-message behavior (their messages are technical, not localized).
      message: isAgentRunFailureError(error) ? error.failureCode : normalizedMessage(error),
      status: error instanceof AIError ? error.status : null,
    }),
  }
}

export function matchingFailureCountV1(
  events: readonly AnyAgentRunEventV1[],
  input: { generation: number; stepId: string; fingerprint: string },
): number {
  return events.filter(event => (
    event.generation === input.generation
    && event.type === 'step.failed'
    && event.payload.stepId === input.stepId
    && event.payload.fingerprint === input.fingerprint
  )).length
}
