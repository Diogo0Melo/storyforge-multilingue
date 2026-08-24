/**
 * WS-3B Phase 2 · P2-E Wave 2 · story-support lane：调用点显式声明 outputKind。
 *
 * 契约（orchestrator 批准）：
 * - agent.outline.story-arcs / emotion.beat 是严格 JSON 信封但内含读者面向的弧线/节拍散文，
 *   调用点显式声明 outputKind: 'mixed'（client gate 注入项目 contentLanguage 约束）。
 * - foreshadow.suggest 是读者面向的建议散文，声明 outputKind: 'creative'。
 * - foreshadow.structure 是纯 JSON 结构化采纳调用，保持既有
 *   outputKind: 'functional-structured'（规则 D：不注入文本语言约束）。
 * - category/projectId 字面量与转发形状其余部分保持不变；UI/逻辑/文案不变。
 * - 三个入口均有重渲染/重管线成本，沿用 R-WS3B1/R-WS3B2 的调用点源码锚定方式。
 *   foreshadow.suggest 在 ForeshadowPanel 中另有两处 resolveRequestConfig 配置解析
 *   出现点（非 AI 调用 meta），只锚定 ai.start 调用点本身。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

/** needle 在源码中的每一处出现，其后 300 字符窗口都必须声明期望的 outputKind。 */
function expectAllOccurrencesDeclare(
  source: string,
  needle: string,
  file: string,
  outputKind: string,
): void {
  let index = source.indexOf(needle)
  expect(index, `${file} 应包含 ${needle}`).toBeGreaterThanOrEqual(0)
  while (index >= 0) {
    const callSite = source.slice(index, index + 300)
    expect(
      callSite,
      `${file} @${index} 处的 ${needle} 未声明 ${outputKind}`,
    ).toContain(`outputKind: '${outputKind}'`)
    index = source.indexOf(needle, index + needle.length)
  }
}

describe('WS-3B P2-E Wave 2 · story-support lane outputKind 源码锚定', () => {
  it('agent.outline.story-arcs durable copilot 声明 mixed（JSON 信封内含读者面向弧线散文），保留 projectId', () => {
    const source = readSource('src/lib/agent/story-arc-copilot.ts')
    expect(source).toContain("input.routingCategory ?? 'agent.outline.story-arcs'")
    expect(source.match(/category: (?:routingCategory|input\.routingCategory),[\s\S]{0,100}outputKind: 'mixed'/g)?.length).toBe(2)
  })

  it('emotion.beat 声明 mixed（JSON 信封内含读者面向节拍散文），保留 projectId', () => {
    const source = readSource('src/lib/agent/run/emotion-beat-durable.ts')
    expectAllOccurrencesDeclare(source, "category: 'emotion.beat'", 'emotion-beat-durable.ts', 'mixed')
    expect(source).toContain('projectId: input.scope.projectId')
  })

  it('foreshadow.suggest durable entrypoint 声明 creative（读者面向建议）', () => {
    const source = readSource('src/lib/agent/run/foreshadow-suggestions-durable.ts')
    expectAllOccurrencesDeclare(source, "category: 'foreshadow.suggest'", 'foreshadow-suggestions-durable.ts', 'creative')
    expect(source).toContain('generateForeshadowSuggestionCandidateV1')
  })

  it('foreshadow durable lane 不保留 retired structure 直连调用，建议候选保持 creative', () => {
    const source = readSource('src/lib/agent/run/foreshadow-suggestions-durable.ts')
    expect(source).not.toContain("category: 'foreshadow.structure'")
    expect(source).toContain("outputKind: 'creative'")
  })
})
