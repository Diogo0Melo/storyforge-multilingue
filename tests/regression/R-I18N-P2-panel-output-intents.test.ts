/**
 * I18N Phase 2 · fix-5a lane：面板调用点显式声明 outputKind（源码锚定回归）。
 *
 * 契约（orchestrator 批准的字段级决策）：
 * - character.generate → mixed：结构化角色信封内含作者面向的角色散文，
 *   client gate 注入项目 resolved contentLanguage；JSON/schema 标识符保持规范形。
 * - rules.generate → creative：读者面向的创作规则散文。
 * - scene.verify → functional-prose：UI 展示的审校/验证散文，注入当前 UI 语言。
 * - prompt.examples → language-neutral：显式记录的例外——示例是模板受控/源保留的
 *   提示词数据，不是 StoryForge 内容散文；gate 不注入文本语言约束，
 *   规范示例元数据（id/text/source/rating/createdAt 与 ===EXAMPLE=== 协议）保持稳定。
 *
 * 约束：
 * - 不依赖前缀推导：每个自有作者面向调用点必须显式挂 outputKind，
 *   client gate 不再走 classifyAITask 过渡推导路径。
 * - category/projectId 字面量与转发形状其余部分保持不变。
 * - 解析器、提示词协议标记、持久化形状与输出语言架构不变；
 *   禁止对解析后的 JSON 做后置翻译。
 * - PromptExamplesEditor 中 resolveRequestConfig 的出现点是配置解析（非 AI 调用 meta），
 *   沿用 R-WS3B2 story-support lane 先例，保持原形状（不挂 outputKind）。
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

/** 自有文件中每个 ai.start 调用点窗口内都必须显式声明合法 outputKind（禁止依赖前缀推导）。 */
function expectAllAiStartCallsDeclareOutputKind(source: string, file: string): void {
  const needle = 'ai.start('
  let index = source.indexOf(needle)
  expect(index, `${file} 应包含 ai.start 调用点`).toBeGreaterThanOrEqual(0)
  while (index >= 0) {
    const callSite = source.slice(index, index + 400)
    expect(
      callSite,
      `${file} @${index} 处的 ai.start 调用未显式声明 outputKind`,
    ).toMatch(/outputKind: '(creative|functional-prose|functional-structured|mixed|language-neutral)'/)
    index = source.indexOf(needle, index + needle.length)
  }
}

describe('I18N P2 fix-5a · 面板 outputKind 源码锚定', () => {
  it('character.generate 声明 mixed（结构化信封内含作者面向角色散文），保留 projectId', () => {
    const source = readSource('src/components/character/CharacterPanel.tsx')
    expectAllOccurrencesDeclare(source, 'category: \'character.generate\'', 'CharacterPanel.tsx', 'mixed')
    expect(source).toContain(
      '{ category: \'character.generate\', projectId: project.id!, outputKind: \'mixed\' }',
    )
    expectAllAiStartCallsDeclareOutputKind(source, 'CharacterPanel.tsx')
  })

  it('rules.generate 声明 creative（读者面向创作规则散文），保留 projectId', () => {
    const source = readSource('src/components/rules/CreativeRulesPanel.tsx')
    expectAllOccurrencesDeclare(source, 'category: \'rules.generate\'', 'CreativeRulesPanel.tsx', 'creative')
    expect(source).toContain(
      '{ category: \'rules.generate\', projectId: project.id!, outputKind: \'creative\' }',
    )
    expectAllAiStartCallsDeclareOutputKind(source, 'CreativeRulesPanel.tsx')
  })

  it('scene.verify 声明 functional-prose（UI 展示的审校/验证散文），保留 projectId', () => {
    const source = readSource('src/components/scene/SceneVerifyPanel.tsx')
    expectAllOccurrencesDeclare(source, 'category: \'scene.verify\'', 'SceneVerifyPanel.tsx', 'functional-prose')
    expect(source).toContain(
      '{ category: \'scene.verify\', projectId: project.id!, outputKind: \'functional-prose\' }',
    )
    expectAllAiStartCallsDeclareOutputKind(source, 'SceneVerifyPanel.tsx')
  })

  it('prompt.examples 的 ai.start 调用声明 language-neutral（显式例外：模板受控提示词数据）', () => {
    const source = readSource('src/components/settings/prompt/PromptExamplesEditor.tsx')
    expect(source).toContain(
      '{ category: \'prompt.examples\', outputKind: \'language-neutral\' }',
    )
    // 非 AI 调用的配置解析出现点保持原形状（不挂 outputKind）
    expect(source).toContain('resolveRequestConfig(aiConfig, { category: \'prompt.examples\' })')
    // 出现点恰好两处：ai.start 调用（带 outputKind）+ 配置解析（不带），无旁路第三处
    expect(source.split('category: \'prompt.examples\'').length - 1).toBe(2)
    expectAllAiStartCallsDeclareOutputKind(source, 'PromptExamplesEditor.tsx')
  })

  it('prompt.examples 的协议标记与规范示例元数据保持稳定（不做后置翻译）', () => {
    const source = readSource('src/components/settings/prompt/PromptExamplesEditor.tsx')
    // ===EXAMPLE=== 分隔协议标记不变（解析器按原样切分）
    expect(source).toContain('===EXAMPLE===')
    // 规范示例元数据的 source 枚举不变
    expect(source).toContain('source: \'ai-generated\'')
    expect(source).toContain('source: \'system\'')
  })
})
