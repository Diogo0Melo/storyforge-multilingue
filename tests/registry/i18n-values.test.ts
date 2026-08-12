/**
 * i18n value translation guard
 *
 * The existing i18n.test.ts ensures key-set parity across locales (every key
 * present in zh-CN is also present in pt-BR and en). This complementary guard
 * checks that the VALUES are actually translated: no string value in pt-BR or
 * en may contain CJK characters, except for intentional exceptions listed in
 * ALLOWED_CJK_VALUES below.
 *
 * Why: a missing translation silently falls back to the Chinese source value,
 * which passes key-parity but renders untranslated text to the user. This test
 * catches that class of regression.
 */
import { describe, it, expect } from 'vitest'

// Vite test environment supports import.meta.glob; eager:true loads all JSONs
// synchronously, matching the pattern used in tests/setup.ts.
const localeModules = import.meta.glob('../../src/i18n/locales/*/*.json', {
  eager: true,
}) as Record<string, { default: unknown }>

/** Regex matching any CJK Unified Ideograph (Chinese characters). */
const CJK_REGEX = /[\u4e00-\u9fff]/

/**
 * Allowlist of `${ns}:${dotted.key}` entries whose values are INTENTIONALLY
 * in Chinese. Each entry must have an explanatory comment.
 *
 * - common:languageName.zh-CN — the display name of the Chinese language
 *   itself ("中文"), which must remain in Chinese by definition.
 */
const ALLOWED_CJK_VALUES = new Set<string>([
  // Display name of the Chinese language — must stay in Chinese
  'common:languageName.zh-CN',
])

interface Violation {
  locale: string
  ns: string
  key: string
  value: string
}

function collectCjkViolations(
  locale: string,
  modules: Record<string, { default: unknown }>,
): Violation[] {
  const violations: Violation[] = []
  const prefix = `../../src/i18n/locales/${locale}/`

  for (const [path, mod] of Object.entries(modules)) {
    if (!path.startsWith(prefix)) continue
    const nsMatch = path.match(/\/([^/]+)\.json$/)
    if (!nsMatch) continue
    const ns = nsMatch[1]

    walkStrings(mod.default, '', (key, value) => {
      if (!CJK_REGEX.test(value)) return
      const qualifiedKey = `${ns}:${key}`
      if (ALLOWED_CJK_VALUES.has(qualifiedKey)) return
      violations.push({ locale, ns, key, value })
    })
  }

  return violations
}

function walkStrings(
  obj: unknown,
  prefix: string,
  callback: (key: string, value: string) => void,
): void {
  if (!obj || typeof obj !== 'object') return
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      walkStrings(v, fullKey, callback)
    } else if (typeof v === 'string') {
      callback(fullKey, v)
    }
  }
}

describe('i18n value translation guard', () => {
  it.each(['pt-BR', 'en'] as const)(
    '%s locale has no untranslated CJK values',
    (locale) => {
      const violations = collectCjkViolations(locale, localeModules)
      if (violations.length > 0) {
        const details = violations
          .map((v) => `  ${v.ns}:${v.key} = "${v.value}"`)
          .join('\n')
        throw new Error(
          `Found ${violations.length} untranslated CJK value(s) in ${locale}:\n${details}\n\n` +
            'Either translate the value or add an explicit allowlist entry in ' +
            'ALLOWED_CJK_VALUES with an explanatory comment.',
        )
      }
      expect(violations).toEqual([])
    },
  )

  it('allowlist entries actually exist in the loaded bundles', () => {
    // Sanity check: every allowlisted key must correspond to a real value,
    // otherwise a stale allowlist entry would mask a renamed/removed key.
    for (const entry of ALLOWED_CJK_VALUES) {
      const [ns, ...keyParts] = entry.split(':')
      const dottedKey = keyParts.join(':')
      let found = false
      for (const [path, mod] of Object.entries(localeModules)) {
        const match = path.match(/locales\/([^/]+)\/([^.]+)\.json$/)
        if (!match || match[2] !== ns) continue
        const resolved = resolveNestedValue(mod.default, dottedKey)
        if (resolved !== undefined) {
          found = true
          break
        }
      }
      expect(found, `Allowlisted key "${entry}" not found in any locale bundle`).toBe(true)
    }
  })
})

function resolveNestedValue(obj: unknown, dottedKey: string): unknown {
  const parts = dottedKey.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}
