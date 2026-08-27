/**
 * R-ORACLE3 · ChapterEditor application-owned notices use render-time descriptors
 *
 * Guards the Oracle-3 remediation for ChapterEditor:
 * - Application-owned localized messages are stored as `{key, params}` descriptors
 *   (or a descriptor list) and translated at render via useDomainT('editor'), so a
 *   locale switch re-renders them instead of leaving stale translated strings.
 * - Raw provider/engine error text is preserved verbatim (`error.message`).
 * - `manualSaveError` remains raw because it is always the engine error message.
 * - Every descriptor key referenced in the component resolves in all editor locales.
 * - Durable recovery effects keep `t` out of their dependency arrays (no re-run on
 *   locale switch).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const LOCALES = ['en', 'pt-BR', 'zh-CN'] as const
const WORKTREE_ROOT = resolve(__dirname, '../..')
const LOCALE_ROOT = resolve(WORKTREE_ROOT, 'src/i18n/locales')
const SOURCE = resolve(WORKTREE_ROOT, 'src/components/editor/ChapterEditor.tsx')

function loadEditorJson(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(LOCALE_ROOT, locale, 'editor.json'), 'utf-8'))
}

function readSource(): string {
  return readFileSync(SOURCE, 'utf-8')
}

/** States that must be render-time descriptors (application-owned notices). */
const DESCRIPTOR_STATES = [
  'impactInfo',
  'impactRemediationError',
  'impactReviewError',
  'impactPatchError',
  'impactOutlineRegenerationError',
  'impactStoryTimelineRegenerationError',
  'proseGenerationError',
  'organizationError',
  'transitionError',
] as const

describe('R-ORACLE3 · ChapterEditor descriptor storage', () => {
  describe('typed message union and render helper', () => {
    it('defines EditorMessage with descriptor, raw, and list kinds', () => {
      const src = readSource()
      expect(src).toContain('type EditorMessage =')
      expect(src).toContain("{ kind: 'descriptor'; key: string; params?: Record<string, unknown> }")
      expect(src).toContain("{ kind: 'raw'; text: string }")
      expect(src).toContain("{ kind: 'list'; items: EditorMessageListItem[] }")
      // List items support both descriptor and raw shapes.
      expect(src).toContain('type EditorMessageListItem =')
      expect(src).toContain("| { key: string; params?: Record<string, unknown> }")
      expect(src).toContain("| { text: string }")
    })

    it('defines a render-time translator that passes raw text through', () => {
      const src = readSource()
      expect(src).toContain('const renderEditorMessage = (message: EditorMessage | null): string =>')
      // raw text must pass through unchanged; null must collapse to ''
      expect(src).toContain("if (message.kind === 'raw') return message.text")
      expect(src).toContain("if (!message) return ''")
    })
  })

  describe('application-owned states are descriptor-typed', () => {
    it.each(DESCRIPTOR_STATES)('%s is useState<EditorMessage | null>(null)', (name) => {
      const src = readSource()
      const setter = `set${name.charAt(0).toUpperCase()}${name.slice(1)}`
      expect(src, `${name} must be descriptor-typed`).toContain(
        `const [${name}, ${setter}] = useState<EditorMessage | null>(null)`,
      )
    })

    it('no application-owned setter still stores a pre-translated t(...) string', () => {
      const src = readSource()
      for (const name of DESCRIPTOR_STATES) {
        const setter = `set${name.charAt(0).toUpperCase()}${name.slice(1)}`
        // A direct setter call with a bare t(...) argument is the stale pattern.
        const stale = new RegExp(`${setter}\\(t\\(`)
        expect(src, `${setter} must not store t(...) output directly`).not.toMatch(stale)
        const staleRef = new RegExp(`${setter}\\(tRef\\.current\\(`)
        expect(src, `${setter} must not store tRef.current(...) output directly`).not.toMatch(staleRef)
      }
    })
  })

  describe('raw provider/engine errors stay raw', () => {
    it('preserves error.message extraction in catch handlers', () => {
      const src = readSource()
      expect(src).toContain("{ kind: 'raw', text: error.message }")
      expect(src).toContain("{ kind: 'raw', text: err.message }")
      expect(src).toContain("{ kind: 'raw', text: traceError.message }")
    })

    it('manualSaveError remains raw engine text', () => {
      const src = readSource()
      expect(src).toContain("const [manualSaveError, setManualSaveError] = useState('')")
      expect(src).toContain('setManualSaveError(error instanceof Error ? error.message : String(error))')
    })
  })

  describe('descriptor is translated at the render/prop boundary', () => {
    it('child props and JSX consume renderEditorMessage output', () => {
      const src = readSource()
      expect(src).toContain('impactInfo={renderEditorMessage(impactInfo) || null}')
      expect(src).toContain('impactRemediationError={renderEditorMessage(impactRemediationError) || null}')
      expect(src).toContain('impactReviewError={renderEditorMessage(impactReviewError) || null}')
      expect(src).toContain('impactPatchError={renderEditorMessage(impactPatchError) || null}')
      expect(src).toContain('impactOutlineRegenerationError={renderEditorMessage(impactOutlineRegenerationError) || null}')
      expect(src).toContain('impactStoryTimelineRegenerationError={renderEditorMessage(impactStoryTimelineRegenerationError) || null}')
      expect(src).toContain('error={renderEditorMessage(organizationError)}')
      expect(src).toContain('{renderEditorMessage(transitionError)}')
    })
  })

  describe('durable recovery effects are locale-stable', () => {
    it('keeps t out of the durable recovery dependency arrays', () => {
      const src = readSource()
      // The comments documenting the intentional omission must remain, guarding the
      // contract that locale switches must not re-run durable recovery.
      expect(src).toContain('`t` intentionally not a dependency')
      // Recovery effects must not list `t` as a reactive dependency.
      expect(src).not.toContain('}, [currentChapter?.id, project.id, t]')
    })
  })

  describe('every referenced descriptor key resolves in all editor locales', () => {
    it('all chapterEditor.* descriptor keys resolve and are locale-reactive', () => {
      const src = readSource()
      const keySet = new Set<string>()
      const re = /key:\s*'(chapterEditor\.[A-Za-z0-9_]+)'/g
      let match: RegExpExecArray | null
      while ((match = re.exec(src)) !== null) keySet.add(match[1])
      expect(keySet.size, 'expected descriptor keys to be present').toBeGreaterThan(0)

      const byLocale = LOCALES.map(locale => ({ locale, data: loadEditorJson(locale) }))
      for (const key of keySet) {
        const leaf = key.replace(/^chapterEditor\./, '')
        for (const { locale, data } of byLocale) {
          const section = (data as Record<string, unknown>).chapterEditor as Record<string, unknown>
          expect(section, `${locale}: editor.json missing chapterEditor section`).toBeDefined()
          const value = section[leaf]
          expect(value, `${locale}: editor.json missing "chapterEditor.${leaf}"`).toBeDefined()
          expect(typeof value, `${locale}: "chapterEditor.${leaf}" must be a string`).toBe('string')
          expect((value as string).length, `${locale}: "chapterEditor.${leaf}" must be non-empty`).toBeGreaterThan(0)
        }
      }
    })

    it('a representative failure notice differs across locales', () => {
      const values = LOCALES.map(locale => {
        const data = loadEditorJson(locale)
        const section = (data as Record<string, unknown>).chapterEditor as Record<string, unknown>
        return section.impactRemediationFailed as string
      })
      expect(new Set(values).size, 'impactRemediationFailed must be locale-reactive').toBe(LOCALES.length)
    })
  })
})
