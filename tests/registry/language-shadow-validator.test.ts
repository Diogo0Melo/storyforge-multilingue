import { describe, expect, it } from 'vitest'
import { validateLanguageShadow } from '../../src/lib/ai/language-shadow-validator'

describe('language shadow validator', () => {
  it('only inspects free-text and skips preserve, ids and unregistered fields', () => {
    const report = validateLanguageShadow({
      family: 'codex',
      targetLanguage: 'pt-BR',
      fields: [
        { role: 'preserve', value: 'The ancient kingdom was guarded by a silent order with this world.' },
        { role: 'canonical-id', value: 'id-123' },
        { value: 'The ancient kingdom was guarded by a silent order with this world.' },
        { role: 'free-text', value: 'The ancient kingdom was guarded by a silent order with this world.' },
      ],
    })
    expect(report.counts).toEqual({ inspected: 1, skipped: 3, abstained: 0, signaled: 1 })
    expect(report.status).toBe('signal')
    expect(report.codes).toMatchObject({ preserve: 1, canonicalId: 1, unregistered: 1, possibleNonTargetLanguage: 1 })
  })

  it('does not signal isolated CJK, names, enums, ids, citations or mixed text', () => {
    const fields = [
      { role: 'free-text' as const, value: '東京' },
      { role: 'free-text' as const, value: 'Aurelia Nightfall' },
      { role: 'free-text' as const, value: 'primary' },
      { role: 'free-text' as const, value: 'codex-7f39-02' },
      { role: 'free-text' as const, value: '"The Moon Archive", DOI 10.1000/example' },
      { role: 'free-text' as const, value: 'The quiet river crosses uma cidade antiga and returns to the sea.' },
    ]
    const report = validateLanguageShadow({ family: 'reverse', targetLanguage: 'en', fields })
    expect(report.status).not.toBe('signal')
    expect(report.codes.possibleNonTargetLanguage).toBeUndefined()
  })

  it('accepts target-dominant text and signals only a strong mismatch', () => {
    const clean = validateLanguageShadow({
      family: 'reverse',
      targetLanguage: 'en',
      fields: [{ role: 'free-text', value: 'The ancient river crosses the valley and guides the travelers.' }],
    })
    const signal = validateLanguageShadow({
      family: 'reverse',
      targetLanguage: 'pt-BR',
      fields: [{ role: 'free-text', value: 'The ancient kingdom was guarded by a silent order with a long history.' }],
    })
    expect(clean.status).toBe('clean')
    expect(signal.status).toBe('signal')
    expect(signal.codes).toEqual({ possibleNonTargetLanguage: 1 })
  })

  it('never signals possible mismatch when English and Portuguese evidence coexist', () => {
    const report = validateLanguageShadow({
      family: 'reverse',
      targetLanguage: 'pt-BR',
      fields: [{ role: 'free-text', value: 'The cidade is quiet e a new story begins beside the river.' }],
    })
    expect(report.status).not.toBe('signal')
    expect(report.codes.possibleNonTargetLanguage).toBeUndefined()
  })

  it('signals a strong non-CJK phrase for zh-CN without signaling legitimate CJK', () => {
    const mismatch = validateLanguageShadow({
      family: 'codex',
      targetLanguage: 'zh-CN',
      fields: [{ role: 'free-text', value: 'The ancient kingdom was guarded by a silent order with a long history.' }],
    })
    const legitimate = validateLanguageShadow({
      family: 'codex',
      targetLanguage: 'zh-CN',
      fields: [{ role: 'free-text', value: '古老的月河在群山之间缓缓流淌，守护着城镇与远方的旅人。' }],
    })
    expect(mismatch.status).toBe('signal')
    expect(mismatch.codes).toEqual({ possibleNonTargetLanguage: 1 })
    expect(legitimate.status).not.toBe('signal')
  })

  it('never exposes values and does not mutate frozen input', () => {
    const value = 'The ancient kingdom was guarded by a silent order with a long history.'
    const input = Object.freeze({
      family: 'agents' as const,
      targetLanguage: 'pt-BR' as const,
      fields: Object.freeze([{ role: 'free-text' as const, value }]),
    })
    const before = JSON.stringify(input)
    const report = validateLanguageShadow(input)
    expect(JSON.stringify(input)).toBe(before)
    expect(JSON.stringify(report)).not.toContain(value)
    expect(report).not.toHaveProperty('value')
    expect(report).not.toHaveProperty('path')
    expect(report).not.toHaveProperty('fieldName')
  })
})
