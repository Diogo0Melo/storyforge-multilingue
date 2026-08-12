import { describe, expect, it, vi } from 'vitest'
import { createChapterGenerationNode } from '../../src/lib/generation/chapter-generation-node'
import {
  prepareGenerationNode,
  runGenerationNode,
} from '../../src/lib/generation/generation-node'

describe('PIPELINE-1 · 正文生成节点', () => {
  it('正文生成保持原 category/project 元数据并发送装配后的消息', async () => {
    const start = vi.fn(async () => '正文')
    const node = createChapterGenerationNode({
      operation: 'generate',
      category: 'chapter.content',
      projectId: 17,
      chapterIdentity: 31,
      ai: { start },
    })
    const messages = [
      { role: 'system' as const, content: '系统约束' },
      { role: 'user' as const, content: '作品上下文与章纲' },
    ]

    await runGenerationNode(node, prepareGenerationNode(node, messages))

    expect(start).toHaveBeenCalledWith(messages, undefined, {
      category: 'chapter.content',
      projectId: 17,
      // WS-3A：正文创作声明输出语义，gate 注入项目 contentLanguage 约束
      outputKind: 'creative',
    })
  })

  it('续写透明覆盖只改变本次发送内容', async () => {
    const start = vi.fn(async () => '续写')
    const node = createChapterGenerationNode({
      operation: 'continue',
      category: 'chapter.continue',
      projectId: 17,
      chapterIdentity: 31,
      ai: { start },
    })
    const prepared = prepareGenerationNode(node, [
      { role: 'user', content: '原续写提示词' },
    ])
    await runGenerationNode(node, prepared, {
      messages: [{ role: 'user', content: '作者本次调整后的续写提示词' }],
    })

    expect(start.mock.calls[0][0]).toEqual([
      { role: 'user', content: '作者本次调整后的续写提示词' },
    ])
    expect(prepared.messages[0].content).toBe('原续写提示词')
  })
})
