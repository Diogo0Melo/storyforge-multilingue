import { describe, expect, it } from 'vitest'
import { runLanguageShadowEval } from '../../src/lib/evals/language-shadow/runner'
import { LANGUAGE_SHADOW_FIXTURES } from '../../src/lib/evals/language-shadow/fixtures'

describe('R-I18N-P5 language shadow eval', () => {
  it('runs the sealed local baseline without values in results', () => {
    const result = runLanguageShadowEval()
    expect(result.baselineId).toBe('i18n-p5-language-shadow-v1')
    expect(result.schemaVersion).toBe(1)
    expect(result.validatorVersion).toBe(1)
    expect(result.aggregate.caseCount).toBe(LANGUAGE_SHADOW_FIXTURES.length)
    expect(result.aggregate.falsePositiveRate).toBe(0)
    expect(result.aggregate.falseNegativeRate).toBe(0)
    expect(result.aggregate.caseCount).toBe(25)
    expect(Object.keys(result.byFamily).sort()).toEqual(['agents', 'codex', 'reverse'])
    for (const family of ['codex', 'reverse', 'agents'] as const) {
      expect(result.byFamily[family].caseCount).toBeGreaterThan(0)
      expect(result.byFamily[family].falsePositiveCount).toBe(0)
      expect(result.byFamily[family].falseNegativeCount).toBe(0)
      expect(result.byFamily[family].falsePositiveRate).toBe(0)
      expect(result.byFamily[family].falseNegativeRate).toBe(0)
    }
    expect(JSON.stringify(result)).not.toContain('ancient kingdom')
    expect(result.results.every(row => Object.keys(row).every(key => !/value|path|field|text/i.test(key)))).toBe(true)
  })
})
