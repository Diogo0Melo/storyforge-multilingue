/**
 * WS-2: resolveProjectContentLanguage unit tests
 *
 * Semantics (D1 contract):
 * - project.contentLanguage defined & valid -> returns persisted value
 * - project.contentLanguage undefined (legacy project) -> returns uiLocale
 * - project.contentLanguage invalid (defensive) -> treated as undefined -> uiLocale
 */
import { describe, it, expect } from 'vitest'
import { resolveProjectContentLanguage } from '../../src/lib/ai/content-language'

describe('WS-2 resolveProjectContentLanguage', () => {
  it('returns persisted value when contentLanguage is defined and valid', () => {
    expect(resolveProjectContentLanguage({ contentLanguage: 'pt-BR' }, 'en')).toBe('pt-BR')
    expect(resolveProjectContentLanguage({ contentLanguage: 'en' }, 'zh-CN')).toBe('en')
    expect(resolveProjectContentLanguage({ contentLanguage: 'zh-CN' }, 'pt-BR')).toBe('zh-CN')
  })

  it('returns uiLocale when contentLanguage is undefined (legacy project)', () => {
    expect(resolveProjectContentLanguage({ contentLanguage: undefined }, 'pt-BR')).toBe('pt-BR')
    expect(resolveProjectContentLanguage({ contentLanguage: undefined }, 'en')).toBe('en')
    expect(resolveProjectContentLanguage({ contentLanguage: undefined }, 'zh-CN')).toBe('zh-CN')
  })

  it('returns uiLocale when contentLanguage is missing entirely (spread object)', () => {
    expect(resolveProjectContentLanguage({}, 'en')).toBe('en')
  })

  it('returns uiLocale when contentLanguage is an invalid string (defensive)', () => {
    // Simulate corrupted/invalid persisted value
    const project = { contentLanguage: 'fr-FR' as any }
    expect(resolveProjectContentLanguage(project, 'pt-BR')).toBe('pt-BR')
  })

  it('returns uiLocale when contentLanguage is empty string (defensive)', () => {
    const project = { contentLanguage: '' as any }
    expect(resolveProjectContentLanguage(project, 'zh-CN')).toBe('zh-CN')
  })

  it('returns uiLocale when contentLanguage is null (defensive)', () => {
    const project = { contentLanguage: null as any }
    expect(resolveProjectContentLanguage(project, 'en')).toBe('en')
  })
})
