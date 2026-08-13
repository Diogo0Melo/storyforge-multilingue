/**
 * WS-3B Phase 2 · lane P2-B1：ChapterEditor 剩余结构化调用点的显式输出意图。
 *
 * 契约（orchestrator 批准）：
 * - chapter.memory 惰性重建 chat 调用 → functional-structured（summary/handoff 结构化信封）
 * - chapter.organize 章节整理 chat 调用 → functional-structured，
 *   且 configOverrides / contextOverflowPolicy / AbortSignal 行为保持不变
 * - chapter.memory memoryAI.start 统一抽取 → functional-structured
 * - state.extract stateAI.start 状态提取 → functional-structured
 *
 * 这些入口只在完整编辑器渲染 + 正文生成接受/整理流程深处触发，
 * 重渲染成本高；按 R-WS3B1 既有模式用调用点源码锚定，
 * 全量扫描 category 出现处，防止新增调用点漏声明意图。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

function allOccurrences(source: string, needle: string): number[] {
  const indexes: number[] = []
  let cursor = 0
  for (;;) {
    const index = source.indexOf(needle, cursor)
    if (index < 0) return indexes
    indexes.push(index)
    cursor = index + needle.length
  }
}

describe('WS-3B Phase 2 · ChapterEditor 结构化调用点显式 outputKind', () => {
  const source = readSource('src/components/editor/ChapterEditor.tsx')

  it('chapter.memory 两个调用点（惰性 chat + memoryAI.start）都声明 functional-structured', () => {
    const indexes = allOccurrences(source, "category: 'chapter.memory'")
    expect(indexes.length).toBe(2)
    const windows = indexes.map(index => source.slice(index - 200, index + 300))
    for (const window of windows) {
      expect(window).toContain("outputKind: 'functional-structured'")
      expect(window).toContain('projectId: project.id!')
    }
    // 两条既有调用路径的形状保持不变：一条走 chat()，一条走 memoryAI.start()
    expect(windows.some(window => window.includes('chat(messages, aiConfig'))).toBe(true)
    expect(windows.some(window => window.includes('memoryAI.start(messages, undefined'))).toBe(true)
  })

  it('chapter.organize chat 调用点声明 functional-structured 且保留既有行为参数', () => {
    const indexes = allOccurrences(source, "category: 'chapter.organize'")
    // 一处是 resolveRequestConfig 就绪检查（非 AI 调用），一处是真实 chat 调用
    expect(indexes.length).toBe(2)
    const chatCallIndex = indexes.find(index => (
      source.slice(index - 200, index).includes('chat(messages, aiConfig')
    ))
    expect(chatCallIndex, 'chapter.organize 应存在 chat() 调用点').toBeDefined()
    const callSite = source.slice(chatCallIndex!, chatCallIndex! + 400)
    expect(callSite).toContain("outputKind: 'functional-structured'")
    expect(callSite).toContain('projectId: project.id!')
    // 行为保留：既有覆盖、溢出策略与中止信号不得被意图登记改动
    expect(callSite).toContain('configOverrides: { maxTokens: 8_000 }')
    expect(callSite).toContain("contextOverflowPolicy: 'reject'")
    expect(callSite).toContain('controller.signal')
  })

  it('state.extract stateAI.start 调用点声明 functional-structured', () => {
    const indexes = allOccurrences(source, "category: 'state.extract'")
    expect(indexes.length).toBe(1)
    const callSite = source.slice(Math.max(0, indexes[0] - 120), indexes[0] + 200)
    expect(callSite).toContain('stateAI.start(messages, undefined')
    expect(callSite).toContain('projectId: project.id!')
    expect(callSite).toContain("outputKind: 'functional-structured'")
  })
})
