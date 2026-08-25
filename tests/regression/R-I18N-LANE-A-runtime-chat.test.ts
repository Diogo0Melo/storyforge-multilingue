/**
 * R-I18N-LANE-A · runtime categories through the REAL client metadata/network boundary.
 *
 * Oracle remediation for committed bf09b91:
 * - RUNTIME_CATEGORY_POLICIES is authoritative: caller-supplied
 *   languagePolicy/outputKind cannot override a registered runtime policy.
 * - Public chat(..., { category, projectId }) outbound requests prove:
 *   creative runtime injects the resolved project contentLanguage;
 *   structured runtime injects none;
 *   unknown runtime categories keep approved D3/D12 PRODUCTION semantics
 *   (console.error, no inheritance, no injection, user call preserved) —
 *   dev/test additionally throws (covered in output-language-gate.test.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db/schema'
import type { AIConfig, AIConfigPreset } from '../../src/lib/types'
import {
  buildStoryForgeOutputPolicyBlock,
  STORYFORGE_OUTPUT_POLICY_START,
} from '../../src/lib/ai/adapters/prompt-guards'
import {
  ENGLISH_OUTPUT_CONSTRAINT,
  PORTUGUESE_OUTPUT_CONSTRAINT,
} from '../../src/lib/ai/output-language'

const now = 1_900_000_000_000

const globalConfig: AIConfig = {
  provider: 'deepseek',
  apiKey: 'global-key',
  model: 'global-model',
  baseUrl: 'https://global.example/v1',
  temperature: 0.7,
  maxTokens: 0,
}

function routedPreset(): AIConfigPreset {
  return {
    id: 'runtime-lane',
    name: 'runtime-lane',
    config: {
      ...globalConfig,
      provider: 'ollama',
      apiKey: '',
      model: 'qwen-local',
      baseUrl: 'http://localhost:11434/v1',
      maxTokens: 2_048,
      contextWindow: 131_072,
    },
  }
}

async function addProject(contentLanguage?: string): Promise<number> {
  return await db.projects.add({
    name: 'LANE-A',
    genre: '',
    description: '',
    targetWordCount: 0,
    enableMultiWorld: false,
    createdAt: now,
    updatedAt: now,
    ...(contentLanguage !== undefined ? { contentLanguage } : {}),
  } as never) as number
}

interface CapturedRequest {
  url: string
  body: { model: string; messages: Array<{ role: string; content: string }> }
}

function stubChatFetch(captured: CapturedRequest[]): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({
      url: String(url),
      body: JSON.parse(String(init?.body)),
    })
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    }), { status: 200 })
  })
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  vi.resetModules()
  await db.delete()
  await db.open()
})

afterEach(async () => {
  consoleErrorSpy?.mockRestore()
  consoleErrorSpy = undefined
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  await db.delete()
  db.close()
})

describe('R-I18N-LANE-A · public chat() metadata boundary for runtime categories', () => {
  it('creative runtime category reaches the wire with the resolved project contentLanguage, and explicit meta cannot strip it', async () => {
    const projectId = await addProject('pt-BR')
    const captured: CapturedRequest[] = []
    vi.stubGlobal('fetch', stubChatFetch(captured))

    const { useAIConfigStore } = await import('../../src/stores/ai-config')
    const preset = routedPreset()
    useAIConfigStore.setState({
      config: globalConfig,
      presets: [preset],
      taskRoutes: { creation: preset.id, extraction: preset.id },
    })
    const { chat } = await import('../../src/lib/ai/client')

    const expectedBlock = buildStoryForgeOutputPolicyBlock(PORTUGUESE_OUTPUT_CONSTRAINT)

    // Plain call through the real metadata path.
    await expect(chat(
      [{ role: 'user', content: 'narate o resultado' }],
      globalConfig,
      { category: 'runtime.prose.adventure-result-narrator', projectId },
    )).resolves.toBe('ok')

    // Caller-supplied overrides cannot override the authoritative registry policy.
    await expect(chat(
      [{ role: 'user', content: 'narate o resultado' }],
      globalConfig,
      {
        category: 'runtime.prose.adventure-result-narrator',
        projectId,
        outputKind: 'functional-structured',
        languagePolicy: 'none',
      },
    )).resolves.toBe('ok')

    expect(captured).toHaveLength(2)
    for (const request of captured) {
      expect(request.url).toBe('http://localhost:11434/v1/chat/completions')
      // Routing consumed the category through the same metadata path.
      expect(request.body.model).toBe('qwen-local')
      const user = [...request.body.messages].reverse().find(message => message.role === 'user')!
      expect(user.content.endsWith(expectedBlock)).toBe(true)
    }
  })

  it('structured runtime category reaches the wire without any output-language constraint, even under explicit creative meta', async () => {
    const projectId = await addProject('en')
    const captured: CapturedRequest[] = []
    vi.stubGlobal('fetch', stubChatFetch(captured))

    const { useAIConfigStore } = await import('../../src/stores/ai-config')
    const preset = routedPreset()
    useAIConfigStore.setState({
      config: globalConfig,
      presets: [preset],
      taskRoutes: { creation: preset.id, extraction: preset.id },
    })
    const { chat } = await import('../../src/lib/ai/client')

    await expect(chat(
      [{ role: 'user', content: 'parse intent' }],
      globalConfig,
      { category: 'runtime.prose.adventure-intent-parser', projectId },
    )).resolves.toBe('ok')

    await expect(chat(
      [{ role: 'user', content: 'parse intent' }],
      globalConfig,
      {
        category: 'runtime.prose.adventure-intent-parser',
        projectId,
        outputKind: 'creative',
        languagePolicy: 'project',
      },
    )).resolves.toBe('ok')

    expect(captured).toHaveLength(2)
    for (const request of captured) {
      expect(request.body.model).toBe('qwen-local')
      expect(request.body.messages.every(message => !message.content.includes(STORYFORGE_OUTPUT_POLICY_START))).toBe(true)
      expect(request.body.messages.every(message => !message.content.includes(ENGLISH_OUTPUT_CONSTRAINT))).toBe(true)
    }
  })

  it('unknown runtime categories fail closed in dev/test before any network call', async () => {
    const captured: CapturedRequest[] = []
    const fetchMock = stubChatFetch(captured)
    vi.stubGlobal('fetch', fetchMock)

    const { useAIConfigStore } = await import('../../src/stores/ai-config')
    const preset = routedPreset()
    useAIConfigStore.setState({
      config: globalConfig,
      presets: [preset],
      taskRoutes: { creation: preset.id, extraction: preset.id },
    })
    const { chat } = await import('../../src/lib/ai/client')

    for (const category of ['runtime.unknown.fake-skill', 'runtime.prose.unknown']) {
      await expect(chat(
        [{ role: 'user', content: 'x' }],
        globalConfig,
        { category, projectId: 1 },
      )).rejects.toThrow(/unregistered runtime category/)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('unknown runtime categories keep approved D3/D12 PRODUCTION semantics: log, no inheritance, no injection, call preserved', async () => {
    const projectId = await addProject('pt-BR')
    const captured: CapturedRequest[] = []
    const fetchMock = stubChatFetch(captured)
    vi.stubGlobal('fetch', fetchMock)
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('PROD', true)

    const { useAIConfigStore } = await import('../../src/stores/ai-config')
    const preset = routedPreset()
    useAIConfigStore.setState({
      config: globalConfig,
      presets: [preset],
      taskRoutes: { creation: preset.id, extraction: preset.id },
    })
    const { chat } = await import('../../src/lib/ai/client')

    for (const category of ['runtime.unknown.fake-skill', 'runtime.prose.unknown']) {
      // Production never breaks the user call...
      await expect(chat(
        [{ role: 'user', content: 'preserve me' }],
        globalConfig,
        { category, projectId },
      )).resolves.toBe('ok')
      // ...and never inherits a policy: no prefix fallback, no injected constraint.
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('unregistered runtime category'))
    }

    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const request of captured) {
      expect(request.body.messages.every(message => !message.content.includes(STORYFORGE_OUTPUT_POLICY_START))).toBe(true)
      expect(request.body.messages.every(message => !message.content.includes(PORTUGUESE_OUTPUT_CONSTRAINT))).toBe(true)
    }
  })
})
