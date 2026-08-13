/**
 * WS-3B Phase 2 · P2-E Wave 2 · story-support lane：调用点显式声明 outputKind。
 *
 * 契约（orchestrator 批准）：
 * - story-arc.generate / emotion.beat 是严格 JSON 信封但内含读者面向的弧线/节拍散文，
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
  it('story-arc.generate 声明 mixed（JSON 信封内含读者面向弧线散文），保留 projectId', () => {
    const source = readSource('src/components/outline/StoryArcPanel.tsx')
    expectAllOccurrencesDeclare(source, "category: 'story-arc.generate'", 'StoryArcPanel.tsx', 'mixed')
    expect(source).toContain(
      "{ category: 'story-arc.generate', projectId: project.id!, outputKind: 'mixed' }",
    )
  })

  it('emotion.beat 声明 mixed（JSON 信封内含读者面向节拍散文），保留 projectId', () => {
    const source = readSource('src/components/editor/EmotionBeatCard.tsx')
    expectAllOccurrencesDeclare(source, "category: 'emotion.beat'", 'EmotionBeatCard.tsx', 'mixed')
    expect(source).toContain("{ category: 'emotion.beat', projectId, outputKind: 'mixed' }")
  })

  it('foreshadow.suggest 的 ai.start 调用声明 creative（读者面向建议）', () => {
    const source = readSource('src/components/foreshadow/ForeshadowPanel.tsx')
    expect(source).toContain(
      "ai.start(messages, undefined, { category: 'foreshadow.suggest', projectId: project.id!, outputKind: 'creative' })",
    )
    // 非 AI 调用的配置解析出现点保持原形状（不挂 outputKind）
    expect(source).toContain("resolveRequestConfig(config, { category: 'foreshadow.suggest' })")
  })

  it('foreshadow.structure 保持 functional-structured（纯 JSON 采纳，规则 D 不注入）', () => {
    const source = readSource('src/components/foreshadow/ForeshadowPanel.tsx')
    expectAllOccurrencesDeclare(
      source,
      "category: 'foreshadow.structure'",
      'ForeshadowPanel.tsx',
      'functional-structured',
    )
    expect(source).toContain(
      "{ category: 'foreshadow.structure', projectId: project.id!, outputKind: 'functional-structured' }",
    )
  })
})
