/**
 * WS-3B Codex lane — extraction call-site outputKind/languagePolicy regression
 *
 * Contract: every high-confidence extraction call site whose output is
 * parser-consumed (strict JSON) must explicitly declare
 * `outputKind: 'functional-structured'` in AICallMeta. Codex additionally
 * declares `languagePolicy: 'project'` so structured values use project language.
 *
 * Categories covered (all map to durable extraction Harness entrypoints):
 * - inventory.extract       (inventory-extraction-durable)
 * - location.extract        (location-extraction-durable)
 * - codex.extract           (codex-extraction-durable)
 * - relation.extract        (character-relationship-durable)
 * - canon.setting.extract   (constitution-extraction-durable)
 * - story.timeline          (story-timeline-extraction-durable)
 * - cultivation.progress    (cultivation-progress-extraction-durable)
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

interface CallSiteSpec {
  file: string
  category: string
  /** Extra context expected near the call site (e.g. projectId pattern) */
  expectProjectId?: boolean
  /** Explicit value-language policy required by this call site. */
  expectLanguagePolicy?: 'project' | 'ui' | 'none'
  /** Use lastIndexOf when category appears in both resolveRequestConfig and the AI call */
  useLastIndex?: boolean
}

const CALL_SITES: CallSiteSpec[] = [
  { file: 'src/lib/agent/run/inventory-extraction-durable.ts', category: 'inventory.extract', expectProjectId: true },
  { file: 'src/lib/agent/run/location-extraction-durable.ts', category: 'location.extract', expectProjectId: true },
  {
    file: 'src/lib/agent/run/codex-extraction-durable.ts',
    category: 'codex.extract',
    expectProjectId: true,
    expectLanguagePolicy: 'project',
  },
  { file: 'src/lib/agent/run/character-relationship-durable.ts', category: 'relation.extract', expectProjectId: true },
  { file: 'src/lib/agent/run/constitution-extraction-durable.ts', category: 'canon.setting.extract', expectProjectId: true },
  { file: 'src/lib/agent/run/story-timeline-extraction-durable.ts', category: 'story.timeline', expectProjectId: true },
  { file: 'src/lib/agent/run/cultivation-progress-extraction-durable.ts', category: 'cultivation.progress', expectProjectId: true },
]

describe('WS-3B Codex · extraction outputKind/languagePolicy contract', () => {
  it.each(CALL_SITES)(
    '$file — $category declares outputKind functional-structured',
    ({ file, category, expectProjectId, expectLanguagePolicy, useLastIndex }) => {
      const source = readSource(file)
      const index = useLastIndex
        ? source.lastIndexOf(`category: '${category}'`)
        : source.indexOf(`category: '${category}'`)
      expect(index, `${file} should contain category '${category}'`).toBeGreaterThanOrEqual(0)

      // Grab a window around the call site (enough to capture the meta object)
      const windowStart = Math.max(0, index - 50)
      const windowEnd = Math.min(source.length, index + 250)
      const callSite = source.slice(windowStart, windowEnd)

      expect(callSite, `${file}: '${category}' call must declare outputKind`)
        .toContain("outputKind: 'functional-structured'")

      if (expectProjectId) {
        expect(callSite, `${file}: '${category}' call must carry projectId`)
          .toMatch(/projectId/)
      }

      if (expectLanguagePolicy) {
        expect(callSite, `${file}: '${category}' call must declare languagePolicy '${expectLanguagePolicy}'`)
          .toContain(`languagePolicy: '${expectLanguagePolicy}'`)
      }
    },
  )

  it('foreshadow.suggest does NOT declare functional-structured (creative output)', () => {
    const source = readSource('src/components/foreshadow/ForeshadowPanel.tsx')
    const index = source.indexOf("category: 'foreshadow.suggest'")
    expect(index).toBeGreaterThanOrEqual(0)
    const callSite = source.slice(index, index + 200)
    expect(callSite).not.toContain("outputKind: 'functional-structured'")
  })
})
