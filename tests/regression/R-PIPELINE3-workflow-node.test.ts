import { describe, expect, it, vi } from 'vitest'
import {
  prepareGenerationNode,
  runGenerationNode,
} from '../../src/lib/generation/generation-node'
import {
  createWorkflowGenerationNode,
  sanitizeWorkflowOutputKind,
} from '../../src/lib/generation/workflow-generation-node'
import type { AIConfig, ChatMessage } from '../../src/lib/types'
import type { AICallMeta } from '../../src/lib/ai/client'
import type { OutputKind } from '../../src/lib/ai/output-language'

describe('PIPELINE-3 · 既有工作流节点兼容', () => {
  it('PromptWorkflow 步骤经 GenerationNode 执行且不自动写回', async () => {
    const start = vi.fn(async (_messages: ChatMessage[], _override?: Partial<AIConfig>, _meta?: AICallMeta) => '步骤产物')
    const node = createWorkflowGenerationNode({
      workflowId: 8,
      stepId: 'step-2',
      category: 'story.core',
      projectId: 3,
      ai: { start },
    })
    const result = await runGenerationNode(
      node,
      prepareGenerationNode(node, [{ role: 'user', content: '上一步已确认产物' }]),
    )

    expect(node.id).toBe('workflow.8.step-2')
    expect(node.editableInput).toBe(true)
    // WS-3B · Auto/legacy 步骤 meta 精确期望：只有 category + projectId，绝不带 outputKind
    const meta = start.mock.calls[0][2]
    expect(meta).toEqual({ category: 'story.core', projectId: 3 })
    expect(meta).not.toHaveProperty('outputKind')
    expect(result.output).toBe('步骤产物')
    expect(result.adopted).toBe(false)
  })

  it('WS-3B · 显式 step outputKind 经 AICallMeta 原样转发', async () => {
    const start = vi.fn(async (_messages: ChatMessage[], _override?: Partial<AIConfig>, _meta?: AICallMeta) => 'ok')
    const node = createWorkflowGenerationNode({
      workflowId: 'wf',
      stepId: 's1',
      category: 'worldview.field',
      projectId: 7,
      outputKind: 'functional-structured',
      ai: { start },
    })
    await runGenerationNode(node, prepareGenerationNode(node, [{ role: 'user', content: '生成' }]))
    expect(start).toHaveBeenCalledWith(
      [{ role: 'user', content: '生成' }],
      undefined,
      { category: 'worldview.field', projectId: 7, outputKind: 'functional-structured' },
    )
  })

  it('WS-3B · 未知/自定义 category 步骤 Auto 时不挂 outputKind（绝不静默 creative）', async () => {
    const start = vi.fn(async (_messages: ChatMessage[], _override?: Partial<AIConfig>, _meta?: AICallMeta) => 'ok')
    const node = createWorkflowGenerationNode({
      workflowId: 'wf',
      stepId: 's2',
      // 未在 task-routing 登记的自定义模块：classifyAITask 过渡推导会命中失败保险
      category: 'custom.unknown-module',
      ai: { start },
    })
    await runGenerationNode(node, prepareGenerationNode(node, [{ role: 'user', content: 'x' }]))
    const meta = start.mock.calls[0][2]
    expect(meta).not.toHaveProperty('outputKind')
    expect(meta?.category).toBe('custom.unknown-module')
  })

  it('WS-3B · 无效持久化/导入 outputKind 丢弃为 Auto，不静默标记 creative', async () => {
    const start = vi.fn(async (_messages: ChatMessage[], _override?: Partial<AIConfig>, _meta?: AICallMeta) => 'ok')
    const node = createWorkflowGenerationNode({
      workflowId: 'wf',
      stepId: 's3',
      category: 'story.core',
      // 模拟绕过类型检查的持久化/导入 JSON 可能携带的无效值
      outputKind: 'sparkling-prose' as unknown as OutputKind,
      ai: { start },
    })
    await runGenerationNode(node, prepareGenerationNode(node, [{ role: 'user', content: 'x' }]))
    const meta = start.mock.calls[0][2]
    expect(meta).toEqual({ category: 'story.core', projectId: undefined })
    expect(meta).not.toHaveProperty('outputKind')

    // sanitizer 直检：合法值原样放行，非法/缺省一律 undefined（Auto）
    expect(sanitizeWorkflowOutputKind('creative')).toBe('creative')
    expect(sanitizeWorkflowOutputKind('functional-prose')).toBe('functional-prose')
    expect(sanitizeWorkflowOutputKind('functional-structured')).toBe('functional-structured')
    expect(sanitizeWorkflowOutputKind('mixed')).toBe('mixed')
    expect(sanitizeWorkflowOutputKind('language-neutral')).toBe('language-neutral')
    expect(sanitizeWorkflowOutputKind('sparkling-prose')).toBeUndefined()
    expect(sanitizeWorkflowOutputKind('CREATIVE')).toBeUndefined()
    expect(sanitizeWorkflowOutputKind(42)).toBeUndefined()
    expect(sanitizeWorkflowOutputKind(undefined)).toBeUndefined()
  })
})
