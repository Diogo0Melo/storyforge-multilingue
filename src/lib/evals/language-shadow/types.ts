import type { SupportedLang } from '../../../i18n'
import type {
  LanguageShadowCode,
  LanguageShadowCounts,
  LanguageShadowStatus,
  SanitizedShadowField,
  ShadowFamily,
} from '../../ai/language-shadow-validator'

export const LANGUAGE_SHADOW_BASELINE_ID = 'i18n-p5-language-shadow-v1' as const
export const LANGUAGE_SHADOW_SCHEMA_VERSION = 1 as const
export const LANGUAGE_SHADOW_VALIDATOR_VERSION = 1 as const

export type LanguageShadowFixtureCategory =
  | 'proper-name'
  | 'enum'
  | 'id'
  | 'citation'
  | 'legitimate-cjk'
  | 'isolated-cjk'
  | 'multilingual'
  | 'strong-mismatch'

export interface LanguageShadowEvalFixture {
  id: string
  family: ShadowFamily
  targetLanguage: SupportedLang
  category: LanguageShadowFixtureCategory
  fields: readonly SanitizedShadowField[]
  /** Gold labels live in fixtures/eval code only and never enter reports. */
  expectedSignal: boolean
}

export interface LanguageShadowEvalCaseResult {
  fixtureId: string
  status: LanguageShadowStatus
  codes: Partial<Record<LanguageShadowCode, number>>
  counts: LanguageShadowCounts
}

export interface LanguageShadowEvalAggregate {
  caseCount: number
  positiveCount: number
  predictedSignalCount: number
  falsePositiveCount: number
  falseNegativeCount: number
  falsePositiveRate: number
  falseNegativeRate: number
  signalRate: number
  codes: Partial<Record<LanguageShadowCode, number>>
}

export type LanguageShadowEvalAggregatesByFamily = Record<ShadowFamily, LanguageShadowEvalAggregate>

export interface LanguageShadowEvalRun {
  baselineId: typeof LANGUAGE_SHADOW_BASELINE_ID
  schemaVersion: typeof LANGUAGE_SHADOW_SCHEMA_VERSION
  validatorVersion: typeof LANGUAGE_SHADOW_VALIDATOR_VERSION
  results: LanguageShadowEvalCaseResult[]
  aggregate: LanguageShadowEvalAggregate
  byFamily: LanguageShadowEvalAggregatesByFamily
}
