/**
 * WS-3B Phase 2 · P2-E lane — inspiration.reverse outputKind regression
 *
 * Contract: both inspiration reverse-generation call paths return JSON
 * envelopes whose field values are reader-facing worldview/story/character
 * prose, so they must explicitly declare `outputKind: 'mixed'` in AICallMeta
 * (mixed is intentional: structured envelope, reader-facing values) so the
 * output-language gate injects the project contentLanguage constraint.
 *
 * Call sites covered:
 * - src/hooks/useIncrementalInspiration.ts — useAIStream ai.start call
 *   (category 'inspiration.reverse', projectId).
 * - src/lib/agent/inspiration-copilot.ts — chat call inside
 *   createInspirationCopilotNode (routingCategory fallback to
 *   'inspiration.reverse', projectId, configOverrides,
 *   contextOverflowPolicy).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

describe('WS-3B Phase 2 · P2-E inspiration.reverse outputKind: mixed', () => {
  it("useIncrementalInspiration.ts — ai.start 'inspiration.reverse' declares outputKind mixed", () => {
    const source = readSource('src/hooks/useIncrementalInspiration.ts')
    // Unique occurrence: the createAISessionKey call uses the bare string
    // without a 'category:' prefix, so this anchors the ai.start meta object.
    const index = source.indexOf("category: 'inspiration.reverse'")
    expect(index, "hook should contain category 'inspiration.reverse'").toBeGreaterThanOrEqual(0)

    // Window around the call site (enough to capture the meta object,
    // including the WS-3B decision comment preceding outputKind).
    const windowStart = Math.max(0, index - 60)
    const windowEnd = Math.min(source.length, index + 300)
    const callSite = source.slice(windowStart, windowEnd)

    expect(callSite, "'inspiration.reverse' ai.start call must declare outputKind mixed")
      .toContain("outputKind: 'mixed'")
    expect(callSite, "'inspiration.reverse' ai.start call must carry projectId")
      .toMatch(/projectId/)
  })

  it("inspiration-copilot.ts — chat call declares outputKind mixed, preserving routingCategory fallback", () => {
    const source = readSource('src/lib/agent/inspiration-copilot.ts')
    // Unique occurrence: the prepareInspirationCopilot default assignment has
    // no 'category:' prefix, so this anchors the chat() meta object.
    const index = source.indexOf("category: input.routingCategory ?? 'inspiration.reverse'")
    expect(index, 'copilot chat call should anchor on routingCategory fallback').toBeGreaterThanOrEqual(0)

    const windowStart = Math.max(0, index - 60)
    const windowEnd = Math.min(source.length, index + 350)
    const callSite = source.slice(windowStart, windowEnd)

    expect(callSite, 'copilot chat call must declare outputKind mixed')
      .toContain("outputKind: 'mixed'")
    expect(callSite, 'copilot chat call must carry projectId')
      .toMatch(/projectId/)
    expect(callSite, 'copilot chat call must preserve contextOverflowPolicy')
      .toContain("contextOverflowPolicy: 'reject'")
  })
})
