import type {
  GenerationGateIssue,
  GenerationGateResult,
  GenerationNode,
  GenerationNodeRunResult,
  PreparedGenerationNode,
} from '../generation/generation-node'
import { runGenerationNode } from '../generation/generation-node'
import type { ChatMessage } from '../types'
import type { SupportedLang } from '../../i18n'
import {
  validateLanguage,
  type LanguageShadowPolicy,
} from '../ai/language-shadow-enforcement'
import type { SanitizedShadowField, ShadowFamily } from '../ai/language-shadow-validator'
import type { OutputKind } from '../ai/output-language'
import {
  AgentTeamBudgetTracker,
  type AgentTeamCallReservation,
  type AgentTeamRetryCause,
} from './team-budget'

interface CausedIssue {
  issue: GenerationGateIssue
  cause: AgentTeamRetryCause
}

function mergeIssues(
  gate: GenerationGateResult | null,
  canon: readonly GenerationGateIssue[],
  language: readonly GenerationGateIssue[],
): CausedIssue[] {
  const issues: CausedIssue[] = [
    ...(gate?.issues ?? []).map(issue => ({ issue, cause: 'generationGate' as const })),
    ...canon.map(issue => ({ issue, cause: 'canon' as const })),
    ...language.map(issue => ({ issue, cause: 'languageShadow' as const })),
  ]
  return [...new Map(issues.map(entry => [`${entry.issue.code}:${entry.issue.message}`, entry])).values()]
}

function correctionMessage(entries: readonly CausedIssue[]): ChatMessage {
  const grouped = new Map<AgentTeamRetryCause, GenerationGateIssue[]>()
  entries.forEach(({ issue, cause }) => grouped.set(cause, [...(grouped.get(cause) ?? []), issue]))
  const hasCanonCompatibilityCause = entries.some(({ cause }) => cause === 'generationGate' || cause === 'canon')
  return {
    role: 'user',
    content: [
      `${hasCanonCompatibilityCause ? '【候选完整重试/确定性 Canon 校验打回】' : '【候选完整重试】'}上一版不会进入候选，也没有写入项目。`,
      '请重新生成完整候选；禁止输出 patch、增量、合并或解释。',
      ...[...grouped.entries()].map(([cause, issues]) => [
        `原因：${cause}`,
        ...issues.map(issue => `- ${issue.code}: ${issue.message}`),
      ].join('\n')),
      '继续遵守原任务、原输出格式和所有已提供的项目事实。',
    ].join('\n'),
  }
}

export interface LanguageShadowValidation<TOutput> {
  family: ShadowFamily
  targetLanguage: SupportedLang
  project?: (output: TOutput) => readonly SanitizedShadowField[]
  fields?: readonly SanitizedShadowField[]
  policy?: Partial<Record<ShadowFamily, unknown>> | LanguageShadowPolicy
  mode?: 'shadow' | 'enforce'
  outputKind?: OutputKind
  languagePolicy?: 'project' | 'ui' | 'none'
}

async function runOnce<TInput, TOutput, TAdoption>(input: {
  node: GenerationNode<TInput, TOutput, TAdoption>
  prepared: PreparedGenerationNode
  messages: ChatMessage[]
  budget: AgentTeamBudgetTracker
  callLabel: string
  maxOutputTokens: number
  validate?: (output: TOutput) => Promise<GenerationGateIssue[]> | GenerationGateIssue[]
  languageShadow?: LanguageShadowValidation<TOutput>
}): Promise<{
  result: GenerationNodeRunResult<TOutput, TAdoption>
  issues: CausedIssue[]
}> {
  let reservation: AgentTeamCallReservation | null = null
  let settled = false
  try {
    reservation = input.budget.reserveCall({
      label: input.callLabel,
      messages: input.messages,
      maxOutputTokens: input.maxOutputTokens,
    })
    const result = await runGenerationNode(input.node, input.prepared, { messages: input.messages })
    input.budget.settleCall(reservation, result.output)
    settled = true
    const canon = result.gate?.status === 'blocked'
      ? []
      : await input.validate?.(result.output) ?? []
    let language: GenerationGateIssue[] = []
    if (input.languageShadow) {
      const shadow = input.languageShadow
      let fields: readonly SanitizedShadowField[] = []
      try {
        fields = shadow.project ? shadow.project(result.output) : shadow.fields ?? []
      } catch {
        // A projection failure must not turn advisory shadow infrastructure into
        // an operational block or an extra provider call.
        fields = []
      }
      language = validateLanguage({
        family: shadow.family,
        targetLanguage: shadow.targetLanguage,
        fields,
        policy: shadow.policy,
        mode: shadow.mode,
        outputKind: shadow.outputKind,
        languagePolicy: shadow.languagePolicy,
      })
    }
    return { result, issues: mergeIssues(result.gate, canon, language) }
  } catch (error) {
    if (reservation && !settled) input.budget.settleFailedCall(reservation)
    throw error
  }
}

/**
 * 一个领域调用只允许确定性 gate 触发一次受预算打回。
 * 网络错误、解析异常和普通模型错误不会在这里自动重试。
 */
export async function runBudgetedGenerationNode<TInput, TOutput, TAdoption>(input: {
  node: GenerationNode<TInput, TOutput, TAdoption>
  prepared: PreparedGenerationNode
  budget: AgentTeamBudgetTracker
  callLabel: string
  maxOutputTokens: number
  validate?: (output: TOutput) => Promise<GenerationGateIssue[]> | GenerationGateIssue[]
  languageShadow?: LanguageShadowValidation<TOutput>
}): Promise<GenerationNodeRunResult<TOutput, TAdoption>> {
  const first = await runOnce({
    ...input,
    messages: input.prepared.messages,
  })
  if (first.issues.length === 0) return first.result

  input.budget.claimRetry(first.issues.map(entry => entry.cause))
  const retry = await runOnce({
    ...input,
    callLabel: `${input.callLabel}（语义打回）`,
    messages: [...input.prepared.messages, correctionMessage(first.issues)],
  })
  if (retry.issues.length > 0) {
    throw new Error(`完整候选重试后仍未通过：${retry.issues.map(entry => entry.issue.message).join('；')}`)
  }
  return retry.result
}
