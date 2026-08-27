/**
 * R-I18N-UNIT-B · Workspace impact handoff/banner i18n regression
 *
 * Guards the Oracle-approved display-only contract for Unit B:
 * - All impact handoff strings use stable i18n keys in the pages namespace
 * - Target module labels are resolved via i18n keys, not inline translated strings
 * - Interpolation placeholders are preserved exactly
 * - Error fallback is localized; engine/provider error payloads are preserved
 * - Module IDs, table names, record IDs, plan hashes remain unchanged
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const LOCALES = ['en', 'pt-BR', 'zh-CN'] as const
const WORKTREE_ROOT = resolve(__dirname, '../..')
const LOCALE_ROOT = resolve(WORKTREE_ROOT, 'src/i18n/locales')

function loadPagesJson(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(LOCALE_ROOT, locale, 'pages.json'), 'utf-8'))
}

function getImpactHandoff(data: Record<string, unknown>): Record<string, unknown> {
  const workspace = data.workspace as Record<string, unknown>
  expect(workspace, 'workspace namespace must exist').toBeDefined()
  const ih = workspace.impactHandoff as Record<string, unknown>
  expect(ih, 'workspace.impactHandoff must exist').toBeDefined()
  return ih
}

const EXPECTED_TOP_KEYS = [
  'title',
  'openedTarget',
  'targetRef',
  'targetPending',
  'statusCompleted',
  'statusPending',
  'verifying',
  'verifyAction',
  'returnToSource',
  'dismiss',
  'explanation',
  'errorFallback',
  'targetModule',
] as const

const EXPECTED_MODULE_KEYS = [
  'chaptersList',
  'factLibrary',
  'stateTable',
  'inventory',
  'storyArc',
  'storyTimeline',
  'relations',
  'characters',
  'worldRules',
  'worldviewOrigin',
  'worldviewNatural',
  'worldviewHumanity',
  'powerSystem',
  'storyDesign',
  'outline',
  'detailedOutline',
  'rules',
  'references',
] as const

describe('R-I18N-UNIT-B · Workspace impact handoff banner i18n', () => {
  describe('locale key completeness', () => {
    it.each(LOCALES)('%s/pages.json has all impactHandoff top-level keys', (locale) => {
      const data = loadPagesJson(locale)
      const ih = getImpactHandoff(data)
      for (const key of EXPECTED_TOP_KEYS) {
        expect(ih, `${locale}: missing key "${key}"`).toHaveProperty(key)
      }
    })

    it.each(LOCALES)('%s/pages.json has all targetModule keys', (locale) => {
      const data = loadPagesJson(locale)
      const ih = getImpactHandoff(data)
      const tm = ih.targetModule as Record<string, unknown>
      expect(tm, `${locale}: targetModule must be an object`).toBeDefined()
      for (const mod of EXPECTED_MODULE_KEYS) {
        expect(tm, `${locale}: missing targetModule."${mod}"`).toHaveProperty(mod)
        expect(typeof tm[mod]).toBe('string')
        expect((tm[mod] as string).length).toBeGreaterThan(0)
      }
    })
  })

  describe('interpolation placeholder integrity', () => {
    it('openedTarget uses {{target}} placeholder in all locales', () => {
      for (const locale of LOCALES) {
        const data = loadPagesJson(locale)
        const ih = getImpactHandoff(data)
        const value = ih.openedTarget as string
        expect(value, `${locale}: openedTarget must contain {{target}}`).toContain('{{target}}')
      }
    })

    it('targetRef uses {{table}}, {{recordId}}, {{planHash}} placeholders in all locales', () => {
      for (const locale of LOCALES) {
        const data = loadPagesJson(locale)
        const ih = getImpactHandoff(data)
        const value = ih.targetRef as string
        expect(value, `${locale}: targetRef must contain {{table}}`).toContain('{{table}}')
        expect(value, `${locale}: targetRef must contain {{recordId}}`).toContain('{{recordId}}')
        expect(value, `${locale}: targetRef must contain {{planHash}}`).toContain('{{planHash}}')
      }
    })
  })

  describe('target module labels are i18n keys, not inline translations', () => {
    it('WorkspacePage uses IMPACT_HANDOFF_TARGET_MODULE_KEY map with stable key suffixes', () => {
      const src = readFileSync(
        resolve(__dirname, '../../src/pages/WorkspacePage.tsx'),
        'utf-8',
      )
      // The module map must exist as a const outside the component
      expect(src).toContain('IMPACT_HANDOFF_TARGET_MODULE_KEY')
      // Must NOT contain inline Chinese label strings in the map
      // (the old pattern was: 'chapters-list': '章节与正文', etc.)
      expect(src).not.toContain("'chapters-list': '章节与正文'")
      expect(src).not.toContain("'fact-library': '事实库'")
      expect(src).not.toContain("'state-table': '状态表'")
      // The map must use i18n key suffixes, not translated display strings
      expect(src).toContain("'chapters-list': 'chaptersList'")
      expect(src).toContain("'fact-library': 'factLibrary'")
    })

    it('WorkspacePage resolves target labels via t() with impactHandoff.targetModule prefix', () => {
      const src = readFileSync(
        resolve(__dirname, '../../src/pages/WorkspacePage.tsx'),
        'utf-8',
      )
      expect(src).toContain('workspace.impactHandoff.targetModule.')
      expect(src).toContain('IMPACT_HANDOFF_TARGET_MODULE_KEY[impactHandoff.targetModule]')
    })
  })

  describe('banner strings use i18n keys, not hardcoded Chinese', () => {
    it('WorkspacePage banner uses t() for all display strings', () => {
      const src = readFileSync(
        resolve(__dirname, '../../src/pages/WorkspacePage.tsx'),
        'utf-8',
      )
      // Title
      expect(src).toContain("t('workspace.impactHandoff.title')")
      // Opened target
      expect(src).toContain("t('workspace.impactHandoff.openedTarget'")
      // Target ref
      expect(src).toContain("t('workspace.impactHandoff.targetRef'")
      // Status messages
      expect(src).toContain("t('workspace.impactHandoff.statusCompleted')")
      expect(src).toContain("t('workspace.impactHandoff.statusPending')")
      // Verifying state
      expect(src).toContain("t('workspace.impactHandoff.verifying')")
      expect(src).toContain("t('workspace.impactHandoff.verifyAction')")
      // Actions
      expect(src).toContain("t('workspace.impactHandoff.returnToSource')")
      expect(src).toContain("t('workspace.impactHandoff.dismiss')")
      // Explanation
      expect(src).toContain("t('workspace.impactHandoff.explanation')")
      // Error fallback is stored as a descriptor key, translated at render via t()
      expect(src).toContain("key: 'workspace.impactHandoff.errorFallback'")
    })

    it('WorkspacePage does not contain hardcoded Chinese banner strings', () => {
      const src = readFileSync(
        resolve(__dirname, '../../src/pages/WorkspacePage.tsx'),
        'utf-8',
      )
      // These were the original hardcoded strings that must be replaced
      expect(src).not.toContain('影响项需要人工处理')
      expect(src).not.toContain('已打开：')
      expect(src).not.toContain('修正已验证并重新规划')
      expect(src).not.toContain('等待保存后验证')
      expect(src).not.toContain('正在验证…')
      expect(src).not.toContain('验证已保存修正')
      expect(src).not.toContain('返回来源章节')
      expect(src).not.toContain('关闭交接提示')
      expect(src).not.toContain('人工修正完成验证失败。')
      // The long explanation string
      expect(src).not.toContain('这是受当前正文、影响计划和正式目标 pre-state 约束的人工交接')
    })
  })

  describe('serialization and data identifiers unchanged', () => {
    it('WorkspacePage preserves table, recordId, planHash in targetRef interpolation', () => {
      const src = readFileSync(
        resolve(__dirname, '../../src/pages/WorkspacePage.tsx'),
        'utf-8',
      )
      // The targetRef call must pass table, recordId, and planHash as interpolation params
      expect(src).toContain('table: impactHandoff.table')
      expect(src).toContain('planHash: impactHandoff.planHash.slice(0, 12)')
    })

    it('WorkspacePage preserves handoff serialization identifiers', () => {
      const src = readFileSync(
        resolve(__dirname, '../../src/pages/WorkspacePage.tsx'),
        'utf-8',
      )
      // parseImpactHandoffV2 and buildImpactHandoffUrlV2 must remain unchanged
      expect(src).toContain('parseImpactHandoffV2')
      expect(src).toContain('isImpactHandoffRouteModuleV2')
      expect(src).toContain('beginImpactManualCorrectionV1')
      expect(src).toContain('completeImpactManualCorrectionV1')
      expect(src).toContain('executeImpactPostCorrectionReplanV1')
    })
  })

  describe('error payload preservation', () => {
    it('WorkspacePage preserves engine/provider error messages when canonical', () => {
      const src = readFileSync(
        resolve(__dirname, '../../src/pages/WorkspacePage.tsx'),
        'utf-8',
      )
      // The catch block must still use error.message when error is an Error instance
      expect(src).toContain('error instanceof Error ? error.message')
      // The fallback must reference the i18n key via descriptor, not a hardcoded string
      expect(src).toContain("key: 'workspace.impactHandoff.errorFallback'")
      // The render must translate descriptors at render time via t()
      expect(src).toContain('t(impactCorrectionError.key)')
      // Raw engine/provider text must pass through unchanged
      expect(src).toContain('impactCorrectionError.text')
    })
  })

  describe('locale-switch reactivity for impact correction error', () => {
    it('errorFallback values are distinct across all locales (descriptor produces locale-reactive text)', () => {
      const values = LOCALES.map(locale => {
        const data = loadPagesJson(locale)
        const ih = getImpactHandoff(data)
        return ih.errorFallback as string
      })
      // All three must be non-empty
      for (const v of values) {
        expect(v.length).toBeGreaterThan(0)
      }
      // All three must be distinct — proving locale switch changes visible text
      expect(new Set(values).size).toBe(LOCALES.length)
    })

    it('descriptor key in source resolves to a valid locale path in all locales', () => {
      const src = readFileSync(
        resolve(__dirname, '../../src/pages/WorkspacePage.tsx'),
        'utf-8',
      )
      // Extract the descriptor key used in the catch block
      const keyMatch = src.match(/key:\s*'(workspace\.impactHandoff\.errorFallback)'/)
      expect(keyMatch, 'descriptor key must be present in source').not.toBeNull()
      const fullKey = keyMatch![1]
      // Verify the key path resolves in every locale
      const segments = fullKey.split('.')
      expect(segments[0]).toBe('workspace')
      for (const locale of LOCALES) {
        const data = loadPagesJson(locale)
        let current: unknown = data
        for (const segment of segments) {
          current = (current as Record<string, unknown>)?.[segment]
        }
        expect(current, `${locale}: key path "${fullKey}" must resolve`).toBeDefined()
        expect(typeof current).toBe('string')
      }
    })
  })
})
