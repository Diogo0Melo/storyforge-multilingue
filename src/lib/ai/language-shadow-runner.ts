import type { SupportedLang } from '../../i18n'
import {
  validateLanguageShadow,
  type LanguageShadowReport,
  type ShadowFamily,
  type SanitizedShadowField,
} from './language-shadow-validator'

export interface LanguageShadowInput {
  family: ShadowFamily
  targetLanguage: SupportedLang
  fields: readonly SanitizedShadowField[]
}

export type LanguageShadowObserver = (report: LanguageShadowReport) => void

export interface LanguageShadowRunOptions {
  /** Keep the report pure when an unchanged in-memory candidate is revalidated. */
  observe?: boolean
}

function warnSignal(report: LanguageShadowReport): void {
  console.warn({
    family: report.family,
    targetLanguage: report.targetLanguage,
    status: report.status,
    counts: { ...report.counts },
    codes: { ...report.codes },
  })
}

function errorReport(input: LanguageShadowInput): LanguageShadowReport {
  return {
    version: 1,
    family: input.family,
    targetLanguage: input.targetLanguage,
    status: 'abstain',
    counts: { inspected: 0, skipped: 0, abstained: 0, signaled: 0 },
    codes: { validatorError: 1 },
  }
}

/**
 * Runtime shadow boundary. It is synchronous and intentionally has no
 * adoption, gate, provider, retry, store, event, or persistence knowledge.
 */
export function runLanguageShadow(
  input: LanguageShadowInput,
  onReport?: LanguageShadowObserver,
  options: LanguageShadowRunOptions = {},
): LanguageShadowReport {
  let report: LanguageShadowReport
  try {
    report = validateLanguageShadow(input)
  } catch {
    report = errorReport(input)
  }

  if (onReport) {
    try {
      onReport(report)
    } catch {
      report = {
        ...report,
        codes: {
          ...report.codes,
          validatorError: (report.codes.validatorError ?? 0) + 1,
        },
      }
    }
  } else if (options.observe !== false && report.status === 'signal') {
    warnSignal(report)
  }
  return report
}
