import type { SupportedLang } from '../../i18n'
import type { FieldRole } from '../registry/types'

export type ShadowFamily = 'codex' | 'reverse' | 'agents'

/** The only input accepted by the shadow validator. It is deliberately not a
 * field/path pair: reports must not be able to identify the source of text. */
export interface SanitizedShadowField {
  role?: FieldRole
  value: unknown
}

export type LanguageShadowStatus = 'clean' | 'signal' | 'abstain'

export type LanguageShadowCode =
  | 'possibleNonTargetLanguage'
  | 'shortOrAmbiguous'
  | 'cjkIsolated'
  | 'mixedLanguage'
  | 'targetLanguageDominant'
  | 'preserve'
  | 'canonicalId'
  | 'unregistered'
  | 'validatorError'

export interface LanguageShadowCounts {
  inspected: number
  skipped: number
  abstained: number
  signaled: number
}

export interface LanguageShadowReport {
  version: 1
  family: ShadowFamily
  targetLanguage: SupportedLang
  status: LanguageShadowStatus
  counts: LanguageShadowCounts
  codes: Partial<Record<LanguageShadowCode, number>>
}

const WORDS: Record<'en' | 'pt', ReadonlySet<string>> = {
  en: new Set([
    'the', 'and', 'with', 'this', 'that', 'from', 'into', 'when', 'where', 'was',
    'were', 'have', 'has', 'for', 'not', 'their', 'they', 'story', 'world', 'will',
  ]),
  pt: new Set([
    'o', 'os', 'as', 'e', 'com', 'este', 'esta', 'isso', 'que', 'de', 'do',
    'da', 'dos', 'das', 'para', 'quando', 'onde', 'era', 'foi', 'são', 'seu',
    'sua', 'uma', 'um', 'história', 'mundo', 'não', 'vai',
  ]),
}

const QUOTED_OR_REFERENCE = /[“”"«»]|\[[^\]]*\]|\b(?:doi|isbn|http|www\.)\b/i
const CJK_RUN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/gu
const LATIN = /[A-Za-zÀ-ÖØ-öø-ÿ]/g

function increment(codes: Partial<Record<LanguageShadowCode, number>>, code: LanguageShadowCode) {
  codes[code] = (codes[code] ?? 0) + 1
}

function emptyReport(family: ShadowFamily, targetLanguage: SupportedLang): LanguageShadowReport {
  return {
    version: 1,
    family,
    targetLanguage,
    status: 'abstain',
    counts: { inspected: 0, skipped: 0, abstained: 0, signaled: 0 },
    codes: {},
  }
}

function textSignal(text: string, targetLanguage: SupportedLang): LanguageShadowCode | 'clean' | 'abstain' {
  const value = text.trim()
  const letters = value.match(LATIN) ?? []
  const cjk = value.match(CJK_RUN) ?? []
  const words = value.toLocaleLowerCase().match(/[a-zà-öø-ÿ]+/giu) ?? []
  const lowerWords = words.map(word => word.toLocaleLowerCase())
  const scores = {
    en: lowerWords.reduce((total, word) => total + (WORDS.en.has(word) ? 1 : 0), 0),
    pt: lowerWords.reduce((total, word) => total + (WORDS.pt.has(word) ? 1 : 0), 0),
  }
  // Evidence from both lexicons is inherently mixed. Keep it fail-open even
  // when one language would otherwise look like a strong mismatch.
  const hasBilingualEvidence = scores.en > 0 && scores.pt > 0

  // Names, enum values, IDs and citations are intentionally not language
  // evidence. This also makes short/ambiguous text an explicit abstention.
  const cjkRatio = cjk.length / Math.max(1, letters.length + cjk.length)
  if (cjk.length > 0 && cjk.length <= 6) return 'cjkIsolated'
  if (targetLanguage === 'zh-CN' && cjkRatio >= 0.45) return 'clean'
  if (value.length < 16 || letters.length < 8 || words.length < 3 || QUOTED_OR_REFERENCE.test(value)) {
    return 'abstain'
  }

  if (targetLanguage !== 'zh-CN' && !hasBilingualEvidence && cjkRatio >= 0.65 && cjk.length >= 12) {
    return 'possibleNonTargetLanguage'
  } else if (cjk.length > 0 && cjkRatio > 0.12) {
    return 'mixedLanguage'
  }

  const target = targetLanguage === 'pt-BR' ? 'pt' : targetLanguage === 'en' ? 'en' : null
  if (!target) {
    const aggregateScore = scores.en + scores.pt
    const strongNonCjkPhrase = cjk.length === 0
      && !hasBilingualEvidence
      && value.length >= 32
      && words.length >= 6
      && aggregateScore >= 3
    return strongNonCjkPhrase
      ? 'possibleNonTargetLanguage'
      : aggregateScore > 0 ? 'mixedLanguage' : 'abstain'
  }

  const other = target === 'en' ? 'pt' : 'en'
  const targetScore = scores[target]
  const otherScore = scores[other]
  if (targetScore >= 2 && targetScore >= otherScore) return 'clean'
  if (hasBilingualEvidence) return 'mixedLanguage'
  if (otherScore >= 3 && otherScore >= targetScore + 2) return 'possibleNonTargetLanguage'
  return 'abstain'
}

/**
 * Pure, synchronous, conservative language shadow check. No source identity
 * is accepted and no input object is mutated.
 */
export function validateLanguageShadow(input: {
  family: ShadowFamily
  targetLanguage: SupportedLang
  fields: readonly SanitizedShadowField[]
}): LanguageShadowReport {
  const report = emptyReport(input.family, input.targetLanguage)
  for (const field of input.fields) {
    if (field.role !== 'free-text') {
      report.counts.skipped += 1
      increment(report.codes, field.role === 'preserve'
        ? 'preserve'
        : field.role === 'canonical-id' ? 'canonicalId' : 'unregistered')
      continue
    }

    if (typeof field.value !== 'string' || !field.value.trim()) {
      report.counts.skipped += 1
      increment(report.codes, 'shortOrAmbiguous')
      continue
    }
    report.counts.inspected += 1
    const finding = textSignal(field.value, input.targetLanguage)
    if (finding === 'clean') {
      increment(report.codes, 'targetLanguageDominant')
    } else if (finding === 'abstain') {
      report.counts.abstained += 1
      increment(report.codes, 'shortOrAmbiguous')
    } else if (finding === 'possibleNonTargetLanguage') {
      report.counts.signaled += 1
      increment(report.codes, finding)
    } else {
      report.counts.abstained += 1
      increment(report.codes, finding)
    }
  }

  report.status = report.counts.signaled > 0
    ? 'signal'
    : report.counts.inspected === 0 || report.counts.abstained > 0
      ? 'abstain'
      : 'clean'
  return report
}
