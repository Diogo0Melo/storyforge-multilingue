/**
 * WS-3B Phase 1 · agent lane：Agent 调用点的输出语义意图（outputKind）登记。
 *
 * G3B-1 契约：
 * - agent.orchestrator 规划与 agent.readonly 协议 JSON → functional-structured
 *   （client gate 绝不注入自然语言输出约束，协议解析不容污染）
 * - world-origin / prose copilot → creative
 * - character / inspiration / outline copilot → mixed
 *
 * 这里 mock chat() 捕获 AICallMeta，锁定每个实际调用点显式声明的意图，
 * 防止过渡期缺省推导把协议型调用误注入语言约束。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/ai/client', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/ai/client')>('../../src/lib/ai/client')
  return { ...actual, chat: vi.fn() }
})

import { chat } from '../../src/lib/ai/client'
import {
  createCharacterCopilotNode,
  type CharacterCopilotInput,
} from '../../src/lib/agent/character-copilot'
import { runReadOnlyAgentWithClient } from '../../src/lib/agent/client-adapter'
import {
  createInspirationCopilotNode,
  type InspirationCopilotInput,
} from '../../src/lib/agent/inspiration-copilot'
import {
  createOutlineCopilotNode,
  type OutlineCopilotInput,
} from '../../src/lib/agent/outline-copilot'
import { createMasterAgentPlan } from '../../src/lib/agent/orchestrator'
import {
  createProseCopilotNode,
  type ProseCopilotInput,
} from '../../src/lib/agent/prose-copilot'
import {
  createWorldOriginCopilotNode,
  type WorldOriginCopilotInput,
} from '../../src/lib/agent/world-origin-copilot'
import { db } from '../../src/lib/db/schema'
import type { AIConfig, ChatMessage, Project } from '../../src/lib/types'

const config: AIConfig = {
  provider: 'custom',
  apiKey: '',
  model: 'intent-test-model',
  baseUrl: 'https://example.invalid/v1',
  temperature: 0.7,
  maxTokens: 4000,
}

const ping: ChatMessage[] = [{ role: 'user', content: 'ping' }]

function lastChatMeta() {
  const calls = vi.mocked(chat).mock.calls
  expect(calls.length).toBeGreaterThan(0)
  return calls[calls.length - 1][2]
}

describe('WS-3B · agent 调用点输出语义意图', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    vi.mocked(chat).mockReset()
  })

  afterEach(() => db.close())

  it('agent.orchestrator 规划调用声明 functional-structured', async () => {
    const now = Date.now()
    const projectId = await db.projects.add({
      name: '主 Agent 意图测试',
      genre: 'fantasy',
      genres: ['fantasy'],
      status: 'drafting',
      description: '',
      targetWordCount: 100_000,
      enableMultiWorld: false,
      createdAt: now,
      updatedAt: now,
    }) as number
    vi.mocked(chat).mockResolvedValue(JSON.stringify({
      summary: '规划一个角色任务。',
      tasks: [{ id: 'hero', agentId: 'character', instruction: '设计守灯人', dependsOn: [] }],
    }))

    const plan = await createMasterAgentPlan({
      projectId,
      worldGroupId: null,
      request: '设计一个守灯人角色',
    })

    expect(plan.tasks.map(task => task.agentId)).toEqual(['character'])
    expect(lastChatMeta()).toMatchObject({
      category: 'agent.orchestrator',
      projectId,
      outputKind: 'functional-structured',
      contextOverflowPolicy: 'reject',
    })
  })

  it('agent.readonly 协议调用固定 functional-structured，调用方 meta 不能覆盖', async () => {
    vi.mocked(chat).mockResolvedValue('{"type":"final","answer":"只读检查完成"}')

    const result = await runReadOnlyAgentWithClient({
      goal: '只读检查',
      context: { projectId: 42 },
      config,
      meta: { category: 'chapter.content', projectId: 999, outputKind: 'creative' },
    })

    expect(result.status).toBe('completed')
    expect(lastChatMeta()).toMatchObject({
      category: 'agent.readonly',
      projectId: 42,
      outputKind: 'functional-structured',
      contextOverflowPolicy: 'reject',
    })
  })

  it('world-origin copilot 声明 creative', async () => {
    vi.mocked(chat).mockResolvedValue('潮汐退去后，第一座盐城从海床升起。')
    const nodeInput: WorldOriginCopilotInput = {
      projectId: 1,
      projectName: '潮汐纪元',
      genre: 'fantasy',
      worldGroupId: null,
      authorRequest: '补充盐城文明的起点',
      contextText: '【只读项目概况】',
      snapshot: { id: 9, updatedAt: 100, worldOrigin: '旧世界由潮汐孕育。' },
      config,
    }
    const node = createWorldOriginCopilotNode(nodeInput)

    await node.run(ping)

    expect(lastChatMeta()).toMatchObject({
      category: 'worldview.dimension',
      projectId: 1,
      outputKind: 'creative',
      contextOverflowPolicy: 'reject',
    })
  })

  it('character copilot 声明 mixed', async () => {
    vi.mocked(chat).mockResolvedValue(JSON.stringify({
      name: '守灯人',
      roleWeight: 'main',
      moralAxis: 'good',
      orderAxis: 'lawful',
      relationships: '',
      shortDescription: '守着最后一盏灯塔的人。',
    }))
    const nodeInput: CharacterCopilotInput = {
      projectId: 1,
      projectName: '潮汐纪元',
      genres: 'fantasy',
      worldGroupId: null,
      authorRequest: '设计守灯人主角',
      worldContext: '',
      characterContext: '',
      contextSources: [],
      snapshot: { serialized: '[]', visibleNames: [] },
      config,
    }
    const node = createCharacterCopilotNode(nodeInput)

    await node.run(ping)

    expect(lastChatMeta()).toMatchObject({
      category: 'character.generate',
      projectId: 1,
      outputKind: 'mixed',
      contextOverflowPolicy: 'reject',
    })
  })

  it('inspiration copilot 声明 mixed', async () => {
    vi.mocked(chat).mockResolvedValue(JSON.stringify({
      worldview: { worldOrigin: '旧城由一场被遗忘的雨诞生' },
      storyCore: { logline: '守塔人追查被雨抹去的名字' },
      characters: [],
    }))
    const nodeInput: InspirationCopilotInput = {
      projectId: 1,
      projectName: '灵感项目',
      genres: 'fantasy',
      mode: 'single',
      authorRequest: '反推世界观',
      contextText: '【本次参与融合的灵感碎片】',
      selectedFragmentIds: ['idea-1'],
      parentVersionId: null,
      snapshot: { id: 1, updatedAt: 100, fragments: '[]', versions: '[]' },
      config,
    }
    const node = createInspirationCopilotNode(nodeInput)

    await node.run(ping)

    expect(lastChatMeta()).toMatchObject({
      category: 'inspiration.reverse',
      projectId: 1,
      outputKind: 'mixed',
      contextOverflowPolicy: 'reject',
    })
  })

  it('outline copilot 声明 mixed', async () => {
    vi.mocked(chat).mockResolvedValue(JSON.stringify([
      { title: '第一卷：退潮', summary: '守灯人发现退潮后的浮空城。' },
    ]))
    const project: Project = {
      id: 1,
      name: '潮汐纪元',
      genre: 'fantasy',
      genres: ['fantasy'],
      status: 'drafting',
      description: '',
      targetWordCount: 100_000,
      enableMultiWorld: false,
      createdAt: 1,
      updatedAt: 1,
    }
    const nodeInput: OutlineCopilotInput = {
      project,
      worldGroupId: null,
      authorRequest: '规划全书卷纲',
      supplementalContext: '',
      mode: 'volumes',
      parentVolumeId: null,
      nodes: [],
      volumes: [],
      // run 阶段不触碰 assembled 上下文；本测试只断言 chat 调用意图
      assembled: {} as OutlineCopilotInput['assembled'],
      snapshot: { serialized: '[]', existingTitles: [], startingOrder: 1 },
      config,
    }
    const node = createOutlineCopilotNode(nodeInput)

    await node.run(ping)

    expect(lastChatMeta()).toMatchObject({
      category: 'outline.volume',
      projectId: 1,
      outputKind: 'mixed',
      contextOverflowPolicy: 'reject',
    })
  })

  it('prose copilot 声明 creative', async () => {
    vi.mocked(chat).mockResolvedValue(
      '退潮后的盐海露出黑色礁脊，守灯人沿着潮痕走向沉默的钟楼。'
      + '风把旧誓言送回岸边，他意识到这次选择会改变整座港城的命运。'.repeat(3),
    )
    const project: Project = {
      id: 1,
      name: '潮汐正文',
      genre: 'fantasy',
      genres: ['fantasy'],
      status: 'drafting',
      description: '',
      targetWordCount: 100_000,
      enableMultiWorld: false,
      createdAt: 1,
      updatedAt: 1,
    }
    const nodeInput: ProseCopilotInput = {
      project,
      worldGroupId: null,
      authorRequest: '写第一章正文',
      supplementalContext: '',
      operation: 'generate',
      outlineNode: {
        id: 5,
        projectId: 1,
        parentId: 2,
        type: 'chapter',
        title: '第一章：海床之光',
        summary: '退潮后，守灯人第一次看见浮空城投下的影子。',
        order: 0,
        worldGroupId: null,
        createdAt: 1,
        updatedAt: 1,
      },
      chapter: null,
      snapshot: {
        outlineNodeId: 5,
        outlineUpdatedAt: 1,
        chapterId: null,
        chapterUpdatedAt: null,
        chapterContentHash: '0:0:0',
        chapterHadContent: false,
        chapterOrder: 0,
      },
      // run 阶段不触碰 assembled 上下文；本测试只断言 chat 调用意图
      assembled: {} as ProseCopilotInput['assembled'],
      previousTail: '',
      config,
    }
    const node = createProseCopilotNode(nodeInput)

    await node.run(ping)

    expect(lastChatMeta()).toMatchObject({
      category: 'chapter.content',
      projectId: 1,
      outputKind: 'creative',
      contextOverflowPolicy: 'reject',
    })
  })
})
