/**
 * WS-3B Codex lane — extraction call-site outputKind/languagePolicy regression
 *
 * Contract: every high-confidence extraction call site whose output is
 * parser-consumed (strict JSON) must explicitly declare
 * `outputKind: 'functional-structured'` in AICallMeta. Codex additionally
 * declares `languagePolicy: 'project'` so structured values use project language.
 *
 * Categories covered (all map to task-routing extraction kind):
 * - inventory.extract       (InventoryPanel)
 * - location.extract        (LocationPanel)
 * - codex.extract           (CodexPanel)
 * - relation.extract        (CharacterRelationPanel)
 * - foreshadow.structure    (ForeshadowPanel)
 * - canon.setting.extract   (WorldConstitutionPanel)
 * - storyline-progress.map  (StorylineProgressPanel)
 * - cultivation.progress    (CultivationProgressPanel)
 * - character.structure     (parse-character-output)
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
  // These 4 files have the category string in both resolveRequestConfig (config check)
  // and the actual chat() call; useLastIndex ensures we anchor on the AI call.
  { file: 'src/components/items/InventoryPanel.tsx', category: 'inventory.extract', expectProjectId: true, useLastIndex: true },
  { file: 'src/components/location/LocationPanel.tsx', category: 'location.extract', expectProjectId: true, useLastIndex: true },
  {
    file: 'src/components/codex/CodexPanel.tsx',
    category: 'codex.extract',
    expectProjectId: true,
    expectLanguagePolicy: 'project',
    useLastIndex: true,
  },
  { file: 'src/components/cultivation/CultivationProgressPanel.tsx', category: 'cultivation.progress', expectProjectId: true, useLastIndex: true },
  // These files have the category only at the actual AI call site.
  { file: 'src/components/relations/CharacterRelationPanel.tsx', category: 'relation.extract', expectProjectId: true },
  { file: 'src/components/foreshadow/ForeshadowPanel.tsx', category: 'foreshadow.structure', expectProjectId: true },
  { file: 'src/components/facts/WorldConstitutionPanel.tsx', category: 'canon.setting.extract', expectProjectId: true },
  { file: 'src/components/outline/StorylineProgressPanel.tsx', category: 'storyline-progress.map', expectProjectId: true },
  { file: 'src/lib/ai/parse-character-output.ts', category: 'character.structure', expectProjectId: false },
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
