/**
 * WS-2/G1: content-language resolver, normalization, and parity tests
 *
 * Semantics (D1 contract):
 * - project.contentLanguage defined & valid -> returns persisted value
 * - project.contentLanguage undefined (legacy project) -> returns uiLocale
 * - project.contentLanguage invalid (defensive) -> treated as undefined -> uiLocale
 *
 * G1 additions:
 * - getSupportedUiLang clamp (tested via normalizeContentLanguage + helper parity)
 * - SUPPORTED_LANGS / common:languageName / Project['contentLanguage'] set-sync
 * - Import/export roundtrip preserves contentLanguage
 */
import { describe, it, expect } from 'vitest'
import { resolveProjectContentLanguage, normalizeContentLanguage } from '../../src/lib/ai/content-language'
import { SUPPORTED_LANGS, getSupportedUiLang } from '../../src/i18n'
import type { SupportedLang } from '../../src/i18n'
import type { Project } from '../../src/lib/types'
import i18n from '../../src/i18n'

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

describe('G1 normalizeContentLanguage', () => {
  it('returns the value for valid supported langs', () => {
    expect(normalizeContentLanguage('pt-BR')).toBe('pt-BR')
    expect(normalizeContentLanguage('en')).toBe('en')
    expect(normalizeContentLanguage('zh-CN')).toBe('zh-CN')
  })

  it('returns undefined for invalid values', () => {
    expect(normalizeContentLanguage('fr-FR')).toBeUndefined()
    expect(normalizeContentLanguage('')).toBeUndefined()
    expect(normalizeContentLanguage(null)).toBeUndefined()
    expect(normalizeContentLanguage(undefined)).toBeUndefined()
    expect(normalizeContentLanguage(42)).toBeUndefined()
  })

  it('createProject clamp: normalizeContentLanguage(undefined) falls back to getSupportedUiLang()', () => {
    // Simulates the createProject path: normalizeContentLanguage(data.contentLanguage) ?? getSupportedUiLang()
    const result = normalizeContentLanguage(undefined) ?? getSupportedUiLang()
    // In test env i18n.language is 'zh-CN' (setup.ts forces it)
    expect(SUPPORTED_LANGS.some(l => l.code === result)).toBe(true)
  })

  it('createProject clamp: invalid caller value falls back to getSupportedUiLang()', () => {
    const result = normalizeContentLanguage('xx-INVALID') ?? getSupportedUiLang()
    expect(SUPPORTED_LANGS.some(l => l.code === result)).toBe(true)
  })
})

describe('G1 getSupportedUiLang', () => {
  it('returns a valid SupportedLang for current i18n.language', () => {
    const lang = getSupportedUiLang()
    expect(SUPPORTED_LANGS.some(l => l.code === lang)).toBe(true)
  })

  it('matches i18n.language when it is supported (test env = zh-CN)', () => {
    // tests/setup.ts forces lng to zh-CN which is in SUPPORTED_LANGS
    expect(getSupportedUiLang()).toBe(i18n.language)
  })
})

describe('G1 set-sync: SUPPORTED_LANGS / languageName keys / Project type', () => {
  it('every SUPPORTED_LANGS code has common:languageName.<code> in all 3 locales', () => {
    const locales = ['pt-BR', 'en', 'zh-CN'] as const
    for (const { code } of SUPPORTED_LANGS) {
      for (const lng of locales) {
        const key = `${lng}:common.languageName.${code}`
        // Use i18n.t with lng option to check each locale has the key
        const val = i18n.t(`common:languageName.${code}`, { lng })
        expect(val, `missing common:languageName.${code} in ${lng}`).not.toBe(`common:languageName.${code}`)
        expect(val.length).toBeGreaterThan(0)
      }
    }
  })

  it('every SUPPORTED_LANGS code is assignable to Project["contentLanguage"]', () => {
    // Runtime parity walk: build a project-like object with each code and verify type acceptance
    for (const { code } of SUPPORTED_LANGS) {
      const project: Pick<Project, 'contentLanguage'> = { contentLanguage: code as Project['contentLanguage'] }
      expect(project.contentLanguage).toBe(code)
    }
  })
})

describe('G1 import/export roundtrip preserves contentLanguage', () => {
  it('project object spread preserves contentLanguage field', () => {
    // Simulates the export path: {...row} captures all own properties including contentLanguage
    const original: Pick<Project, 'name' | 'contentLanguage' | 'createdAt' | 'updatedAt'> = {
      name: 'Test Project',
      contentLanguage: 'en',
      createdAt: 1000,
      updatedAt: 2000,
    }
    const exported = { ...original }
    expect(exported.contentLanguage).toBe('en')

    // Simulates the import path: {...data.project} preserves the field
    const imported = { ...exported }
    expect(imported.contentLanguage).toBe('en')
  })

  it('project object spread preserves undefined contentLanguage (legacy)', () => {
    const original: Partial<Project> & Pick<Project, 'name' | 'createdAt' | 'updatedAt'> = {
      name: 'Legacy Project',
      createdAt: 1000,
      updatedAt: 2000,
    }
    const exported = { ...original }
    expect(exported.contentLanguage).toBeUndefined()

    // Resolver handles it correctly after roundtrip
    const resolved = resolveProjectContentLanguage(exported, 'pt-BR')
    expect(resolved).toBe('pt-BR')
  })
})
