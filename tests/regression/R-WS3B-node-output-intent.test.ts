/**
 * WS-3B Phase 1 · node-authoring lane · 结构化/动态输出意图回归。
 *
 * 契约（orchestrator 批准）：
 * - 'story-timeline.extract' 登记为 extraction（缺省推导 functional-structured）。
 * - 'detail.chapter-planning' / 'chapter.continuity' 的结构化调用显式 functional-structured。
 * - 自由创作 'node.creation' 与语义为创作的动态 generate-field/collection 调用显式 creative。
 * - 未知/自定义 promptModuleKey 绝不静默 creative：outputKind 保持未声明，
 *   交由 client gate 的 classifyAITask 推导/失败保险裁决（单一 gate 不变）。
 *
 * 领域节点结构化调用（detail.chapter-planning）的断言同时落在
 * R-FLOW3C-domain-specialized-execution.test.ts。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/ai/client', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/ai/client')>('../../src/lib/ai/client')
  return { ...actual, chat: vi.fn() }
})

import { chat, type AICallMeta } from '../../src/lib/ai/client'
import { classifyAITask } from '../../src/lib/ai/task-routing'
import { db } from '../../src/lib/db/schema'
import {
  AUTHORING_NODE_BY_ID,
  authoringDynamicOutputKind,
  defaultConfigForTemplate,
} from '../../src/lib/node-authoring/catalog'
import {
  emptyAuthoringGraph,
  type AuthoringNodeInstance,
  type AuthoringNodeTemplate,
} from '../../src/lib/node-authoring/contracts'
import { executeDomainNode } from '../../src/lib/node-authoring/domain-execution'
import { runAuthoringGraph } from '../../src/lib/node-authoring/executor'
import type { AIConfig, NodeFlow, Project } from '../../src/lib/types'
import type { PromptModuleKey } from '../../src/lib/types/prompt'

const project: Project = {
  id: 73101,
  name: 'WS-3B 节点输出意图测试',
  genre: 'fantasy',
  genres: ['fantasy'],
  status: 'drafting',
  description: '',
  targetWordCount: 100_000,
  enableMultiWorld: false,
  createdAt: 1,
  updatedAt: 1,
}

const aiConfig: AIConfig = {
  provider: 'custom',
  apiKey: 'test',
  model: 'test-model',
  baseUrl: 'https://example.test',
  temperature: 0.7,
  maxTokens: 8000,
}

function node(templateId: string, config: Record<string, unknown> = {}): AuthoringNodeInstance {
  const template = AUTHORING_NODE_BY_ID.get(templateId)
  if (!template) throw new Error(`missing template ${templateId}`)
  return {
    id: `node-${templateId}`,
    templateId,
    templateVersion: 1,
    title: template.label,
    x: 0,
    y: 0,
    config: { ...defaultConfigForTemplate(template), ...config },
    inputs: structuredClone(template.inputs),
    outputs: structuredClone(template.outputs),
  }
}

describe('WS-3B · story-timeline.extract 分类登记', () => {
  it('story-timeline.extract 归类为 extraction（点分后代同样命中）', () => {
    expect(classifyAITask('story-timeline.extract')).toBe('extraction')
    expect(classifyAITask('story-timeline.extract.batch')).toBe('extraction')
  })

  it('相似键不误匹配，既有 story.timeline 不受影响', () => {
    expect(classifyAITask('story-timeline.extractor')).toBeNull()
    expect(classifyAITask('story.timeline')).toBe('extraction')
  })
})

describe('WS-3B · 目录动态 outputKind 解析（authoringDynamicOutputKind）', () => {
  it.each([
    ['world.origin', 'creative'],
    ['story.logline', 'creative'],
    ['character.field.motivation', 'creative'],
    ['entity.location', 'creative'],
    ['story.arc', 'creative'],
    ['continuity.foreshadow', 'creative'],
    ['continuity.state', 'functional-structured'],
    ['continuity.knowledge', 'functional-structured'],
  ] as const)('模板 %s 显式声明 %s', (templateId, expected) => {
    const template = AUTHORING_NODE_BY_ID.get(templateId)
    expect(template, templateId).toBeDefined()
    expect(authoringDynamicOutputKind(template!)).toBe(expected)
  })

  it('抽取类键不重复声明，交由 client gate 按 extraction 分类推导', () => {
    for (const templateId of ['continuity.timeline', 'continuity.item', 'character.relation']) {
      const template = AUTHORING_NODE_BY_ID.get(templateId)
      expect(template, templateId).toBeDefined()
      expect(authoringDynamicOutputKind(template!), templateId).toBeUndefined()
    }
  })

  it('未知/自定义 promptModuleKey 返回 undefined，绝不静默 creative', () => {
    const custom: AuthoringNodeTemplate = {
      id: 'custom.node',
      version: 1,
      label: '自定义节点',
      description: '',
      category: '自定义',
      class: 'content',
      capability: 'generate-field',
      inputs: [],
      outputs: [],
      promptModuleKey: 'custom.unknown-module' as unknown as PromptModuleKey,
    }
    expect(authoringDynamicOutputKind(custom)).toBeUndefined()
  })

  it('无 promptModuleKey 的模板按 node.creation 自由创作语义显式 creative', () => {
    const template = AUTHORING_NODE_BY_ID.get('processor.compose')
    expect(template).toBeDefined()
    expect(template!.promptModuleKey).toBeUndefined()
    expect(authoringDynamicOutputKind(template!)).toBe('creative')
  })
})

describe('WS-3B · 动态节点执行在 client 边界声明输出意图', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await db.projects.put(project)
    vi.mocked(chat).mockReset()
  })

  afterEach(() => db.close())

  async function runSingleNodeMeta(graphNode: AuthoringNodeInstance): Promise<AICallMeta | undefined> {
    const flowId = await db.nodeFlows.add({
      projectId: project.id!, worldGroupId: null, name: 'WS-3B 输出意图', description: '',
      graphJson: JSON.stringify({ ...emptyAuthoringGraph(), nodes: [graphNode] }), createdAt: 1, updatedAt: 1,
    }) as number
    const flow = await db.nodeFlows.get(flowId) as NodeFlow
    const result = await runAuthoringGraph({ flow })
    const blocked = Object.values(result.candidates).find(candidate => candidate.status === 'blocked')
    expect(result.run.status, blocked?.errors?.join('；')).toBe('completed')
    expect(chat).toHaveBeenCalled()
    return vi.mocked(chat).mock.calls[0][2]
  }

  it('创作语义模板显式声明 creative（worldview.dimension）', async () => {
    vi.mocked(chat).mockResolvedValue('潮汐退去后，第一座城从海床升起。')
    const meta = await runSingleNodeMeta(node('world.origin'))
    expect(meta).toMatchObject({ category: 'worldview.dimension', outputKind: 'creative' })
  })

  it('continuity.state 显式声明 functional-structured，不受 chapter.* creation 分类影响', async () => {
    vi.mocked(chat).mockResolvedValue('[]')
    const meta = await runSingleNodeMeta(node('continuity.state'))
    expect(meta).toMatchObject({ category: 'chapter.continuity', outputKind: 'functional-structured' })
  })

  it('continuity.timeline 依赖 story-timeline.extract 的 extraction 分类，不挂 outputKind', async () => {
    vi.mocked(chat).mockResolvedValue('[]')
    const meta = await runSingleNodeMeta(node('continuity.timeline'))
    expect(meta?.category).toBe('story-timeline.extract')
    expect(meta).not.toHaveProperty('outputKind')
  })

  it('自由创作节点以 node.creation category 显式声明 creative', async () => {
    vi.mocked(chat).mockResolvedValue('一段自由创作的开场。')
    const meta = await runSingleNodeMeta(node('processor.free-generation', { instruction: '写一段开场' }))
    expect(meta).toMatchObject({ category: 'node.creation', outputKind: 'creative' })
  })

  it('事实节点领域执行以 chapter.continuity 显式声明 functional-structured', async () => {
    const volumeId = await db.outlineNodes.add({
      projectId: project.id!, parentId: null, type: 'volume', title: '第一卷：潮门', summary: '卷摘要', order: 0, worldGroupId: null, createdAt: 1, updatedAt: 1,
    })
    const chapterNodeId = await db.outlineNodes.add({
      projectId: project.id!, parentId: volumeId, type: 'chapter', title: '第一章：退潮', summary: '主角在海岸发现城门。', order: 0, worldGroupId: null, createdAt: 1, updatedAt: 1,
    })
    await db.chapters.add({
      projectId: project.id!, outlineNodeId: chapterNodeId, title: '第一章：退潮', content: '潮声在夜色中持续了很久，城门从海床缓缓升起。',
      wordCount: 20, status: 'draft', order: 0, notes: '', createdAt: 1, updatedAt: 1,
    } as any)
    vi.mocked(chat).mockResolvedValue('{"facts":[]}')
    const result = await executeDomainNode({
      node: node('continuity.fact', { chapterTitle: '第一章：退潮' }),
      inputs: [], projectId: project.id!, worldGroupId: null, aiConfig,
    })
    expect(result?.semantic).toBe('continuity.fact')
    expect(chat).toHaveBeenCalledTimes(1)
    expect(vi.mocked(chat).mock.calls[0][2]).toMatchObject({
      category: 'chapter.continuity',
      outputKind: 'functional-structured',
    })
  })
})
