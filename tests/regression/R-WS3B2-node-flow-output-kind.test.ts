/**
 * WS-3B Phase 2 · P2-E lane — node-flow freeform outputKind regression
 *
 * Contract: the node-flow generation.freeform call site (category
 * 'node.creation') produces reader-facing freeform creative text and must
 * explicitly declare `outputKind: 'creative'` in AICallMeta so the
 * output-language gate injects the project contentLanguage constraint.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

describe('WS-3B Phase 2 · P2-E node-flow generation.freeform outputKind: creative', () => {
  it("src/lib/node-flow/executor.ts — 'node.creation' declares outputKind creative", () => {
    const source = readSource('src/lib/node-flow/executor.ts')
    const index = source.indexOf("category: 'node.creation'")
    expect(index, "executor.ts should contain category 'node.creation'").toBeGreaterThanOrEqual(0)

    // Grab a window around the call site (enough to capture the meta object,
    // including the WS-3B decision comment preceding outputKind)
    const windowStart = Math.max(0, index - 50)
    const windowEnd = Math.min(source.length, index + 320)
    const callSite = source.slice(windowStart, windowEnd)

    expect(callSite, "'node.creation' call must declare outputKind creative")
      .toContain("outputKind: 'creative'")
    expect(callSite, "'node.creation' call must carry projectId")
      .toMatch(/projectId/)
  })
})
