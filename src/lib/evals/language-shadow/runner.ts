import { runLanguageShadow } from '../../ai/language-shadow-runner'
import type { LanguageShadowCode, ShadowFamily } from '../../ai/language-shadow-validator'
import { LANGUAGE_SHADOW_FIXTURES } from './fixtures'
import {
  LANGUAGE_SHADOW_BASELINE_ID,
  LANGUAGE_SHADOW_SCHEMA_VERSION,
  LANGUAGE_SHADOW_VALIDATOR_VERSION,
} from './types'
import type {
  LanguageShadowEvalAggregate,
  LanguageShadowEvalAggregatesByFamily,
  LanguageShadowEvalFixture,
  LanguageShadowEvalRun,
} from './types'

const SHADOW_FAMILIES: readonly ShadowFamily[] = ['codex', 'reverse', 'agents']

interface LanguageShadowEvalAccumulator {
  caseCount: number
  positiveCount: number
  predictedSignalCount: number
  falsePositiveCount: number
  falseNegativeCount: number
  codes: Partial<Record<LanguageShadowCode, number>>
}

function addCodes(
  target: Partial<Record<LanguageShadowCode, number>>,
  source: Partial<Record<LanguageShadowCode, number>>,
) {
  for (const [code, count] of Object.entries(source)) {
    const key = code as LanguageShadowCode
    target[key] = (target[key] ?? 0) + (count ?? 0)
  }
}

function emptyAccumulator(): LanguageShadowEvalAccumulator {
  return {
    caseCount: 0,
    positiveCount: 0,
    predictedSignalCount: 0,
    falsePositiveCount: 0,
    falseNegativeCount: 0,
    codes: {},
  }
}

function toAggregate(accumulator: LanguageShadowEvalAccumulator): LanguageShadowEvalAggregate {
  const negativeCount = accumulator.caseCount - accumulator.positiveCount
  return {
    caseCount: accumulator.caseCount,
    positiveCount: accumulator.positiveCount,
    predictedSignalCount: accumulator.predictedSignalCount,
    falsePositiveCount: accumulator.falsePositiveCount,
    falseNegativeCount: accumulator.falseNegativeCount,
    falsePositiveRate: negativeCount ? accumulator.falsePositiveCount / negativeCount : 0,
    falseNegativeRate: accumulator.positiveCount ? accumulator.falseNegativeCount / accumulator.positiveCount : 0,
    signalRate: accumulator.caseCount ? accumulator.predictedSignalCount / accumulator.caseCount : 0,
    codes: { ...accumulator.codes },
  }
}

export function runLanguageShadowEval(
  fixtures: readonly LanguageShadowEvalFixture[] = LANGUAGE_SHADOW_FIXTURES,
): LanguageShadowEvalRun {
  const results: LanguageShadowEvalRun['results'] = []
  const accumulators = Object.fromEntries(
    SHADOW_FAMILIES.map(family => [family, emptyAccumulator()]),
  ) as Record<ShadowFamily, LanguageShadowEvalAccumulator>

  for (const fixture of fixtures) {
    const report = runLanguageShadow({
      family: fixture.family,
      targetLanguage: fixture.targetLanguage,
      fields: fixture.fields,
    }, () => undefined)
    const predictedSignal = report.status === 'signal'
    const accumulator = accumulators[fixture.family]
    accumulator.caseCount += 1
    accumulator.positiveCount += fixture.expectedSignal ? 1 : 0
    accumulator.predictedSignalCount += predictedSignal ? 1 : 0
    accumulator.falsePositiveCount += predictedSignal && !fixture.expectedSignal ? 1 : 0
    accumulator.falseNegativeCount += !predictedSignal && fixture.expectedSignal ? 1 : 0
    addCodes(accumulator.codes, report.codes)
    results.push({
      fixtureId: fixture.id,
      status: report.status,
      codes: { ...report.codes },
      counts: { ...report.counts },
    })
  }

  const aggregate = toAggregate(
    SHADOW_FAMILIES.reduce((total, family) => {
      const current = accumulators[family]
      total.caseCount += current.caseCount
      total.positiveCount += current.positiveCount
      total.predictedSignalCount += current.predictedSignalCount
      total.falsePositiveCount += current.falsePositiveCount
      total.falseNegativeCount += current.falseNegativeCount
      addCodes(total.codes, current.codes)
      return total
    }, emptyAccumulator()),
  )
  const byFamily = Object.fromEntries(
    SHADOW_FAMILIES.map(family => [family, toAggregate(accumulators[family])]),
  ) as LanguageShadowEvalAggregatesByFamily
  return {
    baselineId: LANGUAGE_SHADOW_BASELINE_ID,
    schemaVersion: LANGUAGE_SHADOW_SCHEMA_VERSION,
    validatorVersion: LANGUAGE_SHADOW_VALIDATOR_VERSION,
    results,
    aggregate,
    byFamily,
  }
}
