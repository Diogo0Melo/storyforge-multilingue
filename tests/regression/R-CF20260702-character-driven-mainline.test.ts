import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { buildCharacterDrivenPlotPrompt } from '../../src/lib/ai/character-driven-plot'

const textOf = (messages: { content: string }[]) => messages.map(m => m.content).join('\n\n')

afterEach(async () => {
  await db.delete()
  await db.open()
})

describe('R-CF20260702-character-driven-mainline', () => {
  it('角色驱动剧情 prompt 通过注册表上下文注入故事核心全字段与主线对齐约束', async () => {
    const projectId = await db.projects.add({
      name: '测试书',
      genre: '玄幻',
      genres: ['xuanhuan'],
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any)
    await db.storyCores.add({
      projectId,
      logline: '废柴少年被迫继承天命。',
      theme: '自我选择',
      centralConflict: '天命与自由意志冲突',
      plotPattern: '升级流',
      mainPlot: '少年拒绝被天命操控，联合旧敌推翻天命祭坛。',
      subPlots: '师徒裂痕与家族旧案。',
    } as any)

    const messages = await buildCharacterDrivenPlotPrompt(
      projectId,
      '测试书',
      '玄幻',
      [{
        characterId: 1,
        name: '林砚',
        role: '主角',
        initialState: '相信天命安排。',
        targetState: '主动选择自己的道路。',
      }],
    )
    const text = textOf(messages)
    expect(text).toContain('一句话故事：废柴少年被迫继承天命。')
    expect(text).toContain('主线：少年拒绝被天命操控')
    expect(text).toContain('复线：师徒裂痕与家族旧案。')
    expect(text).toContain('角色驱动与故事主线对齐硬约束')
    expect(text).toContain('不得另起一套主线')
    expect(text).toContain('每一章的 arcProgress')
    // WS-3A seam transfer：语言约束改由 client gate 注入，适配器不再内嵌
    expect(text).not.toContain('语言输出硬约束')
  })
})
