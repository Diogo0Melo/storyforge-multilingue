/**
 * R-I18N-P0 · caracterização do payload final da borda AI.
 *
 * Estes testes não aprovam o desenho futuro: congelam a política antiga,
 * capturando o JSON entregue a fetch por chat() e streamChat(), sem rede real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../src/i18n'
import { chat, streamChat } from '../../src/lib/ai/client'
import {
  ENGLISH_OUTPUT_CONSTRAINT,
  PORTUGUESE_OUTPUT_CONSTRAINT,
} from '../../src/lib/ai/output-language'
import { SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT } from '../../src/lib/ai/adapters/prompt-guards'
import { db } from '../../src/lib/db/schema'
import { buildOutlineGenerationPlan } from '../../src/lib/outline/generation-plan'
import type { AIConfig, ChatMessage, OutlineNode, Project } from '../../src/lib/types'
import type { AssembleContextResult } from '../../src/lib/registry/types'

const now = 1_800_000_000_000

function config(): AIConfig {
  return {
    provider: 'kimi',
    model: 'moonshot-v1-8k',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test',
    temperature: 0.2,
    maxTokens: 256,
    contextWindow: 8_192,
  }
}

async function addProject(contentLanguage: 'pt-BR' | 'en' | 'zh-CN'): Promise<number> {
  return await db.projects.add({
    name: 'P0 payload',
    genre: 'fantasy',
    description: '',
    targetWordCount: 20_000,
    enableMultiWorld: false,
    contentLanguage,
    createdAt: now,
    updatedAt: now,
  } as never) as number
}

function jsonResponse(): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })
}

function sseResponse(): Response {
  return new Response([
    'data: {"choices":[{"delta":{"content":"ok"}}]}',
    '',
    'data: [DONE]',
    '',
  ].join('\n'), { status: 200 })
}

function sentMessages(fetchMock: ReturnType<typeof vi.fn>): ChatMessage[] {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
  expect(init?.body).toBeTruthy()
  return (JSON.parse(String(init!.body)) as { messages: ChatMessage[] }).messages
}

const baseMessages = (): ChatMessage[] => [
  { role: 'system', content: 'You are a writing assistant.' },
  { role: 'user', content: 'Write the next scene.' },
]

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  if (i18n.language !== 'zh-CN') await i18n.changeLanguage('zh-CN')
  await db.delete()
  await db.open()
})

describe('R-I18N-P0 · payload final da matriz antiga', () => {
  it.each([
    ['creative', 'pt-BR', PORTUGUESE_OUTPUT_CONSTRAINT],
    ['mixed', 'en', ENGLISH_OUTPUT_CONSTRAINT],
  ] as const)('%s resolve contentLanguage de projeto e preserva a constraint no chat()', async (outputKind, language, constraint) => {
    const projectId = await addProject(language)
    const fetchMock = vi.fn(async () => jsonResponse())
    vi.stubGlobal('fetch', fetchMock)

    await expect(chat(baseMessages(), config(), {
      category: outputKind === 'creative' ? 'chapter.content' : 'outline.volume',
      projectId,
      outputKind,
    })).resolves.toBe('ok')

    const messages = sentMessages(fetchMock)
    const user = messages.at(-1)!
    expect(user.content.endsWith(constraint)).toBe(true)
    expect(user.content.split(constraint).length - 1).toBe(1)
  })

  it('functional-prose usa UI, enquanto functional-structured e language-neutral não materializam constraint', async () => {
    const projectId = await addProject('pt-BR')
    const cases = [
      { outputKind: 'functional-prose' as const, category: 'review.quality', suffix: SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT },
      { outputKind: 'functional-structured' as const, category: 'codex.extract', suffix: '' },
      { outputKind: 'language-neutral' as const, category: 'simulation.ttrpg-gm', suffix: '' },
    ]

    for (const testCase of cases) {
      const fetchMock = vi.fn(async () => jsonResponse())
      vi.stubGlobal('fetch', fetchMock)
      await expect(chat(baseMessages(), config(), {
        category: testCase.category,
        projectId,
        outputKind: testCase.outputKind,
      })).resolves.toBe('ok')
      const user = sentMessages(fetchMock).at(-1)!
      if (testCase.suffix) expect(user.content.endsWith(testCase.suffix)).toBe(true)
      else expect(user.content).toBe('Write the next scene.')
    }
  })

  it('streamChat() mantém a mesma matriz antiga no corpo final enviado', async () => {
    const projectId = await addProject('en')
    const fetchMock = vi.fn(async () => sseResponse())
    vi.stubGlobal('fetch', fetchMock)
    const chunks: string[] = []

    for await (const chunk of streamChat(
      baseMessages(),
      config(),
      undefined,
      undefined,
      { category: 'outline.volume', projectId, outputKind: 'mixed' },
    )) chunks.push(chunk)

    expect(chunks.join('')).toBe('ok')
    const user = sentMessages(fetchMock).at(-1)!
    expect(user.content.endsWith(ENGLISH_OUTPUT_CONSTRAINT)).toBe(true)
    expect(user.content.split(ENGLISH_OUTPUT_CONSTRAINT).length - 1).toBe(1)
  })
})

describe('R-I18N-P0 · outline com materializadores atuais', () => {
  function project(id: number, contentLanguage: Project['contentLanguage']): Project {
    return {
      id,
      name: 'Livro P0',
      genre: 'fantasy',
      description: '',
      targetWordCount: 20_000,
      enableMultiWorld: false,
      genres: [],
      status: 'drafting',
      contentLanguage,
      createdAt: now,
      updatedAt: now,
    }
  }

  function context(): AssembleContextResult {
    return {
      text: 'world context',
      included: ['storyCore', 'characters', 'worldRules', 'existingVolumeOutlines'],
      segments: [
        { label: 'story', layer: 'L1', content: 'story core', tokens: 2, trimmable: true },
        { label: 'characters', layer: 'L1', content: 'character', tokens: 2, trimmable: true },
        { label: 'rules', layer: 'L1', content: 'rules', tokens: 2, trimmable: true },
        { label: 'existing', layer: 'L1', content: '', tokens: 0, trimmable: true },
      ],
      omitted: [],
      trimmed: [],
      totalInputTokens: 6,
      inputBudget: 8_000,
      overBudgetBeforeTrim: false,
      overBudgetAfterTrim: false,
    }
  }

  it('captura exemplos do adapter e constraint do gate no mesmo payload, como baseline de dupla materialização', async () => {
    const projectId = await addProject('pt-BR')
    const volume: OutlineNode = {
      id: 1,
      projectId,
      type: 'volume',
      parentId: null,
      title: '第一卷',
      summary: '主角入世',
      order: 0,
      createdAt: now,
      updatedAt: now,
    }
    const plan = buildOutlineGenerationPlan({
      request: { kind: 'volumes' },
      project: project(projectId, 'pt-BR'),
      nodes: [volume],
      volumes: [volume],
      assembled: context(),
      hint: '',
      options: {},
    })
    expect(plan.status).toBe('ready')
    if (plan.status !== 'ready') return

    const fetchMock = vi.fn(async () => jsonResponse())
    vi.stubGlobal('fetch', fetchMock)
    await chat(plan.messages, config(), {
      category: plan.category,
      projectId,
      outputKind: 'mixed',
    })

    const messages = sentMessages(fetchMock)
    const joined = messages.map(message => message.content).join('\n')
    expect(joined).toContain('Volume 1: O Começo')
    expect(messages.at(-1)!.content.endsWith(PORTUGUESE_OUTPUT_CONSTRAINT)).toBe(true)
    // Caracterização, não correção: exemplos do adapter + gate textual coexistem hoje.
    expect(joined.split(PORTUGUESE_OUTPUT_CONSTRAINT).length - 1).toBe(1)
  })
})
