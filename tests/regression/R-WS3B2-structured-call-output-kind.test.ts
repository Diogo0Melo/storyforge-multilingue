/**
 * WS-3B Phase 2 · P2-C lane · 高置信结构化调用显式声明 outputKind。
 *
 * 契约（orchestrator 批准）：
 * - reference.analysis / reference.summary / reference.characters / import.parse-chunk /
 *   import.merge-characters / ai.restructure / story.timeline 均为纯 JSON 结构化调用，
 *   调用点显式声明 outputKind: 'functional-structured'，client gate 据此不注入
 *   文本语言约束（规则 D），不再依赖过渡期 classifyAITask 推导。
 * - chatWithAbort 的 signal/config/meta 转发、projectId 与 category 字面量本身保持不变。
 * - aiRestructure 用 mock chat 做运行时断言；其余重渲染/重管线成本的入口沿用
 *   R-WS3B1 的调用点源码锚定方式（每一处 category 出现都必须声明 functional-structured）。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/ai/client', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/ai/client')>('../../src/lib/ai/client')
  return { ...actual, chat: vi.fn() }
})

import { chat } from '../../src/lib/ai/client'
import { aiRestructure } from '../../src/lib/ai/restructure'
import type { AIConfig } from '../../src/lib/types'

const config: AIConfig = {
  provider: 'custom',
  apiKey: 'test-key',
  model: 'test-model',
  baseUrl: 'https://example.test/v1',
  temperature: 0.7,
  maxTokens: 4096,
}

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

describe('WS-3B P2-C · aiRestructure 运行时元信息', () => {
  it('ai.restructure 显式声明 functional-structured，config 原样转发，parser 行为不变', async () => {
    vi.mocked(chat).mockReset()
    vi.mocked(chat).mockResolvedValue('```json\n[{"title":"第一座城"}]\n```')
    const result = await aiRestructure<Array<{ title: string }>>(
      '第一座城的一些文字',
      '输出包含 title 字段的数组。',
      config,
    )
    expect(chat).toHaveBeenCalledOnce()
    const [messages, passedConfig, meta] = vi.mocked(chat).mock.calls[0]
    expect(meta).toEqual({ category: 'ai.restructure', outputKind: 'functional-structured' })
    expect(passedConfig).toBe(config)
    expect(messages[0].role).toBe('system')
    expect(messages[1]).toEqual({ role: 'user', content: '第一座城的一些文字' })
    // extractJson parser 行为保持：围栏 JSON 也能解析出数组
    expect(result).toEqual([{ title: '第一座城' }])
  })

  it('空输入直接返回 null，不发起调用', async () => {
    vi.mocked(chat).mockReset()
    const result = await aiRestructure('   ', '任意结构说明', config)
    expect(result).toBeNull()
    expect(chat).not.toHaveBeenCalled()
  })
})

describe('WS-3B P2-C · 结构化调用点源码锚定', () => {
  it('reference.analysis 声明 functional-structured，保留 projectId 与 signal/meta 转发', () => {
    const source = readSource('src/lib/reference-analysis/pipeline.ts')
    expectAllOccurrencesDeclareStructured(source, "category: 'reference.analysis'", 'reference-analysis/pipeline.ts')
    expect(source).toContain('projectId: args.ref.projectId')
    expect(source).toContain('chatWithAbort(messages, config, args.signal, meta)')
  })

  it('reference.summary / reference.characters 的每一处 meta（含 chat 调用）都声明 functional-structured', () => {
    const source = readSource('src/components/project/AnalysisReportViewer.tsx')
    expectAllOccurrencesDeclareStructured(source, "category: 'reference.summary'", 'AnalysisReportViewer.tsx')
    expectAllOccurrencesDeclareStructured(source, "category: 'reference.characters'", 'AnalysisReportViewer.tsx')
    expect(source).toContain('projectId: reference.projectId')
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

  it('story.timeline 的每一处 meta 都声明 functional-structured，chat 调用保留 projectId', () => {
    const source = readSource('src/components/timeline/StoryTimelinePanel.tsx')
    expectAllOccurrencesDeclareStructured(source, "category: 'story.timeline'", 'StoryTimelinePanel.tsx')
    expect(source).toContain(
      "{ category: 'story.timeline', outputKind: 'functional-structured', projectId: project.id! }",
    )
  })
})
