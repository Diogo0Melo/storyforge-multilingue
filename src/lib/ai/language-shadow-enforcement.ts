import type { SupportedLang } from '../../i18n'
import type { OutputKind } from './output-language'
import { runLanguageShadow } from './language-shadow-runner'
import type {
  LanguageShadowReport,
  SanitizedShadowField,
  ShadowFamily,
} from './language-shadow-validator'
import type { GenerationGateIssue } from '../generation/generation-node'

export type LanguageShadowMode = 'shadow' | 'enforce'

export type LanguageShadowPolicy = Record<ShadowFamily, LanguageShadowMode>

/** Phase 6 stays completely advisory until an explicit test policy is supplied. */
export const DEFAULT_LANGUAGE_SHADOW_POLICY: Readonly<LanguageShadowPolicy> = Object.freeze({
  codex: 'shadow',
  reverse: 'shadow',
  agents: 'shadow',
})

export const LANGUAGE_SHADOW_POLICY = DEFAULT_LANGUAGE_SHADOW_POLICY

export function normalizeLanguageShadowMode(value: unknown): LanguageShadowMode {
  return value === 'enforce' ? 'enforce' : 'shadow'
}

export function resolveLanguageShadowPolicy(
  policy?: Partial<Record<ShadowFamily, unknown>>,
): LanguageShadowPolicy {
  return {
    codex: normalizeLanguageShadowMode(policy?.codex ?? DEFAULT_LANGUAGE_SHADOW_POLICY.codex),
    reverse: normalizeLanguageShadowMode(policy?.reverse ?? DEFAULT_LANGUAGE_SHADOW_POLICY.reverse),
    agents: normalizeLanguageShadowMode(policy?.agents ?? DEFAULT_LANGUAGE_SHADOW_POLICY.agents),
  }
}

function retryIssue(family: ShadowFamily): GenerationGateIssue {
  return {
    code: `language-shadow:${family}:possibleNonTargetLanguage`,
    message: '候选可能未遵循目标语言；请重新生成完整候选。',
  }
}

/**
 * Convert a sanitized report into one generic issue per candidate. Reports are
 * deliberately not copied into the issue, so values, paths and field IDs can
 * never cross the shadow boundary.
 */
export function adaptLanguageShadowReportToIssues(input: {
  family: ShadowFamily
  report: LanguageShadowReport
  mode?: LanguageShadowMode
  outputKind?: OutputKind
  languagePolicy?: 'project' | 'ui' | 'none'
}): GenerationGateIssue[] {
  if (input.outputKind === 'language-neutral' || input.languagePolicy === 'none') return []
  if (normalizeLanguageShadowMode(input.mode) !== 'enforce') return []
  if (input.report.family !== input.family || input.report.status !== 'signal') return []
  if ((input.report.codes.possibleNonTargetLanguage ?? 0) < 1) return []
  return [retryIssue(input.family)]
}

/** Compatibility-friendly alias for callers that name the adapter directly. */
export const languageShadowReportToGenerationGateIssues = adaptLanguageShadowReportToIssues
export const toLanguageShadowIssues = adaptLanguageShadowReportToIssues
export const languageShadowIssues = adaptLanguageShadowReportToIssues

export function getLanguageShadowMode(
  family: ShadowFamily,
  policy?: Partial<Record<ShadowFamily, unknown>>,
): LanguageShadowMode {
  return resolveLanguageShadowPolicy(policy)[family]
}

export interface LanguageShadowCandidateInput {
  family: ShadowFamily
  targetLanguage: SupportedLang
  fields: readonly SanitizedShadowField[]
  mode?: LanguageShadowMode
  policy?: Partial<Record<ShadowFamily, unknown>>
  /** Structured/neutral outputs have no reader-facing language contract. */
  outputKind?: OutputKind
  languagePolicy?: 'project' | 'ui' | 'none'
}

/** Run the fail-open shadow and optionally expose its future enforcement issue. */
export function validateLanguage(input: LanguageShadowCandidateInput): GenerationGateIssue[] {
  if (input.outputKind === 'language-neutral' || input.languagePolicy === 'none') return []
  const fields = input.fields
  const report = runLanguageShadow({
    family: input.family,
    targetLanguage: input.targetLanguage,
    fields,
  })
  const mode = input.mode ?? resolveLanguageShadowPolicy(input.policy)[input.family]
  return adaptLanguageShadowReportToIssues({
    family: input.family,
    report,
    mode,
    outputKind: input.outputKind,
    languagePolicy: input.languagePolicy,
  })
}

/** Candidate-oriented name retained for registry tests and future adapters. */
export const adaptLanguageShadowCandidate = validateLanguage
