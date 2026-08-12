import { describe, expect, it } from 'vitest'
import {
  buildChapterOutlinePrompt,
  buildSingleChapterOutlinePrompt,
  buildVolumeOutlinePrompt,
} from '../../src/lib/ai/adapters/outline-adapter'
import {
  buildChapterContentPrompt,
  buildContinuePrompt,
} from '../../src/lib/ai/adapters/chapter-adapter'

const textOf = (messages: { content: string }[]) => messages.map(m => m.content).join('\n\n')

/**
 * WS-3A seam transfer：语言输出纪律不再由适配器散点注入，而是 client gate
 * （chat()/streamChat() → applyOutputLanguageGate）按 AICallMeta.outputKind 在唯一
 * 网络边界注入。此处反例冻结"适配器不得再内嵌语言约束"；gate 侧矩阵见
 * tests/registry/output-language-gate.test.ts。
 */
function expectNoLanguageGuard(messages: { content: string }[]) {
  const text = textOf(messages)
  expect(text).not.toContain('语言输出硬约束')
  expect(text).not.toContain('禁止中英夹杂')
}

describe('R-CF20260702-language-guard (WS-3A: gate owns injection)', () => {
  it('卷纲 / 章纲 / 单章补全 prompt 不再内嵌语言约束（gate 注入）', () => {
    expectNoLanguageGuard(buildVolumeOutlinePrompt('测试书', '玄幻', '世界观', '故事主线', 1000000))
    expectNoLanguageGuard(buildChapterOutlinePrompt('第一卷', '本卷推进主线', '世界观', '上一卷'))
    expectNoLanguageGuard(buildSingleChapterOutlinePrompt('第一卷', '本卷推进主线', '第一章', '已有第二章', '世界观', '上一卷'))
  })

  it('正文生成 / 续写 prompt 不再内嵌语言约束（gate 注入）', () => {
    expectNoLanguageGuard(buildChapterContentPrompt('第一章', '主角 enters a mysterious world', '世界观', '角色', '上一章'))
    expectNoLanguageGuard(buildContinuePrompt('已有正文', '本章目标 tangledfuture', '世界观'))
  })

  it('既有领域硬约束仍由适配器保留（只移交语言约束）', () => {
    expect(textOf(buildVolumeOutlinePrompt('测试书', '玄幻', '世界观', '故事主线', 1000000)))
      .toContain('本次卷纲生成硬约束')
    expect(textOf(buildChapterOutlinePrompt('第一卷', '本卷推进主线', '世界观', '上一卷')))
      .toContain('主线一致性·硬约束')
  })
})
