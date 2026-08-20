import { describe, expect, it } from 'vitest'
import {
  adaptLanguageShadowReportToIssues,
  DEFAULT_LANGUAGE_SHADOW_POLICY,
  resolveLanguageShadowPolicy,
  validateLanguage,
} from '../../src/lib/ai/language-shadow-enforcement'
import { validateLanguageShadow } from '../../src/lib/ai/language-shadow-validator'

const signal = 'The ancient kingdom was guarded by a silent order with a long history.'

describe('language shadow enforcement policy', () => {
  it('defaults every family to shadow and rejects invalid policy values', () => {
    expect(DEFAULT_LANGUAGE_SHADOW_POLICY).toEqual({ codex: 'shadow', reverse: 'shadow', agents: 'shadow' })
    expect(resolveLanguageShadowPolicy({ codex: 'enforce', reverse: 'invalid', agents: null })).toEqual({
      codex: 'enforce', reverse: 'shadow', agents: 'shadow',
    })
    expect(validateLanguage({
      family: 'agents', targetLanguage: 'pt-BR', fields: [{ role: 'free-text', value: signal }],
    })).toEqual([])
  })

  it('converts only the allowed signal into one sanitized issue in enforce mode', () => {
    const report = validateLanguageShadow({
      family: 'agents', targetLanguage: 'pt-BR', fields: [{ role: 'free-text', value: signal }],
    })
    const issues = adaptLanguageShadowReportToIssues({ family: 'agents', report, mode: 'enforce' })
    expect(issues).toHaveLength(1)
    expect(issues[0].code).toBe('language-shadow:agents:possibleNonTargetLanguage')
    expect(JSON.stringify(issues)).not.toContain(signal)
    expect(JSON.stringify(issues)).not.toMatch(/path|field|value|summary|description/i)
  })

  it('does not convert excluded findings, neutral outputs, or non-signal reports', () => {
    for (const code of ['mixedLanguage', 'cjkIsolated', 'validatorError', 'preserve', 'canonicalId', 'unregistered'] as const) {
      const report = {
        version: 1 as const,
        family: 'agents' as const,
        targetLanguage: 'pt-BR' as const,
        status: 'signal' as const,
        counts: { inspected: 1, skipped: 0, abstained: 0, signaled: 1 },
        codes: { [code]: 1 },
      }
      expect(adaptLanguageShadowReportToIssues({ family: 'agents', report, mode: 'enforce' })).toEqual([])
    }
    expect(validateLanguage({
      family: 'agents', targetLanguage: 'pt-BR', outputKind: 'language-neutral',
      fields: [{ role: 'free-text', value: signal }], mode: 'enforce',
    })).toEqual([])
    expect(validateLanguage({
      family: 'agents', targetLanguage: 'pt-BR', languagePolicy: 'none',
      fields: [{ role: 'free-text', value: signal }], mode: 'enforce',
    })).toEqual([])
  })
})
