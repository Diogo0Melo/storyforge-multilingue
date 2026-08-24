/**
 * WS-3B Phase 2 · P2-C lane · 高置信结构化调用显式声明 outputKind。
 *
 * 契约（orchestrator 批准）：
 * - reference.analysis / reference.summary / reference.characters / import.parse-chunk /
 *   import.merge-characters / story.timeline 均为纯 JSON 结构化调用，
 *   调用点显式声明 outputKind: 'functional-structured'，client gate 据此不注入
 *   文本语言约束（规则 D），不再依赖过渡期 classifyAITask 推导。
 * - chatWithAbort 的 signal/config/meta 转发、projectId 与 category 字面量本身保持不变。
 * - 各调用点沿用 R-WS3B1 的源码锚定方式（每一处 category 出现都必须声明
 *   functional-structured）。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

/** needle 在源码中的每一处出现，其后 300 字符窗口都必须声明 functional-structured。 */
function expectAllOccurrencesDeclareStructured(source: string, needle: string, file: string): void {
  let index = source.indexOf(needle)
  expect(index, `${file} 应包含 ${needle}`).toBeGreaterThanOrEqual(0)
  while (index >= 0) {
    const callSite = source.slice(index, index + 300)
    expect(
      callSite,
      `${file} @${index} 处的 ${needle} 未声明 functional-structured`,
    ).toContain("outputKind: 'functional-structured'")
    index = source.indexOf(needle, index + needle.length)
  }
}

describe('WS-3B P2-C · 结构化调用点源码锚定', () => {
  it('reference.analysis 声明 functional-structured，保留 projectId 与 signal/meta 转发', () => {
    const source = readSource('src/lib/reference-analysis/pipeline.ts')
    expectAllOccurrencesDeclareStructured(source, "category: 'reference.analysis'", 'reference-analysis/pipeline.ts')
    expect(source).toContain('projectId: args.ref.projectId')
    expect(source).toContain('chatWithAbort(messages, config, args.signal, meta)')
  })

  it('reference.summary / reference.characters durable entrypoint 的 meta 都声明 functional-structured', () => {
    const source = readSource('src/lib/agent/run/reference-derived-durable.ts')
    const chatIndex = source.lastIndexOf('chat(prepared.messages')
    expect(chatIndex).toBeGreaterThanOrEqual(0)
    const callSite = source.slice(chatIndex, chatIndex + 500)
    expect(callSite).toContain("category: input.mode === 'summary' ? 'reference.summary' : 'reference.characters'")
    expect(callSite).toContain("outputKind: 'functional-structured'")
    expect(source).toContain('projectId: input.scope.projectId')
  })

  it('import.parse-chunk 声明 functional-structured，保留 projectId 与 signal/meta 转发', () => {
    const source = readSource('src/lib/import/pipeline.ts')
    expectAllOccurrencesDeclareStructured(source, "category: 'import.parse-chunk'", 'import/pipeline.ts')
    expect(source).toContain('projectId: args.projectId')
    expect(source).toContain('chatWithAbort(messages, config, args.signal, meta)')
  })

  it('import.merge-characters 声明 functional-structured，保留 projectId 与 signal/meta 转发', () => {
    const source = readSource('src/lib/import/character-merge.ts')
    expectAllOccurrencesDeclareStructured(source, "category: 'import.merge-characters'", 'import/character-merge.ts')
    expect(source).toContain('chatWithAbort(messages, config, signal, meta)')
  })

  it('story.timeline durable extraction/regeneration meta 都声明 functional-structured，保留 projectId', () => {
    const extraction = readSource('src/lib/agent/run/story-timeline-extraction-durable.ts')
    const regeneration = readSource('src/lib/agent/run/impact-story-timeline-regeneration-durable.ts')
    expectAllOccurrencesDeclareStructured(extraction, "category: 'story.timeline'", 'story-timeline-extraction-durable.ts')
    const regenerationChatIndex = regeneration.lastIndexOf('chat(prepared.messages')
    expect(regenerationChatIndex).toBeGreaterThanOrEqual(0)
    const regenerationCallSite = regeneration.slice(regenerationChatIndex, regenerationChatIndex + 500)
    expect(regenerationCallSite).toContain("category: 'story.timeline'")
    expect(regenerationCallSite).toContain("outputKind: 'functional-structured'")
    expect(extraction).toContain('projectId: input.scope.projectId')
    expect(regeneration).toContain('projectId: input.scope.projectId')
  })
})
