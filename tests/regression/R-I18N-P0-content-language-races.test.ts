/**
 * R-I18N-P0 · caracterização de persistência e leitura concorrente.
 *
 * O objetivo é registrar o comportamento atual do Project Store/IndexedDB:
 * ainda não há fila compartilhada, flush aguardado ou fail-closed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../src/i18n'
import { chat } from '../../src/lib/ai/client'
import { applyOutputLanguageGate } from '../../src/lib/ai/output-language'
import { db } from '../../src/lib/db/schema'
import { useProjectStore } from '../../src/stores/project'
import type { AIConfig, ChatMessage } from '../../src/lib/types'

const now = 1_800_000_000_000

function config(): AIConfig {
  return {
    provider: 'kimi',
    model: 'moonshot-v1-8k',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test',
    temperature: 0.2,
    maxTokens: 128,
    contextWindow: 8_192,
  }
}

async function addProject(contentLanguage: string): Promise<number> {
  return await db.projects.add({
    name: 'P0 race',
    genre: 'fantasy',
    description: '',
    targetWordCount: 10_000,
    enableMultiWorld: false,
    worldCode: 'P0-RACE',
    worldVersion: 1,
    contentLanguage,
    createdAt: now,
    updatedAt: now,
  } as never) as number
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function jsonResponse(): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })
}

function lastUser(fetchMock: ReturnType<typeof vi.fn>): string {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit
  const messages = (JSON.parse(String(init.body)) as { messages: ChatMessage[] }).messages
  return messages.at(-1)!.content
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (i18n.language !== 'zh-CN') await i18n.changeLanguage('zh-CN')
  await db.delete()
  await db.open()
})

describe('R-I18N-P0 · update pendente e geração/leitura concorrente', () => {
  it('gate lê o valor anterior enquanto updateProject ainda está pendente', async () => {
    const projectId = await addProject('pt-BR')
    const pending = deferred<unknown>()
    const originalUpdate = db.projects.update.bind(db.projects) as unknown as (key: number, changes: Record<string, unknown>) => Promise<unknown>
    vi.spyOn(db.projects, 'update').mockImplementation((key: any, changes: any) =>
      pending.promise.then(() => originalUpdate(key, changes)) as any)

    const write = useProjectStore.getState().updateProject(projectId, { contentLanguage: 'en' })
    await Promise.resolve()
    const gated = await applyOutputLanguageGate(
      [{ role: 'user', content: 'generate' }],
      { category: 'chapter.content', projectId, outputKind: 'creative' },
    )

    expect(gated.at(-1)!.content).toContain('português brasileiro')
    pending.resolve(undefined)
    await write
    expect((await db.projects.get(projectId))?.contentLanguage).toBe('en')
  })

  it('falha de update não impede a leitura/generation atual e não é fail-closed', async () => {
    const projectId = await addProject('pt-BR')
    vi.spyOn(db.projects, 'update').mockRejectedValue(new Error('write failed'))
    await expect(useProjectStore.getState().updateProject(projectId, { contentLanguage: 'en' }))
      .rejects.toThrow('write failed')

    const fetchMock = vi.fn(async () => jsonResponse())
    vi.stubGlobal('fetch', fetchMock)
    await expect(chat(
      [{ role: 'user', content: 'generate' }],
      config(),
      { category: 'chapter.content', projectId, outputKind: 'creative' },
    )).resolves.toBe('ok')

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(lastUser(fetchMock)).toContain('português brasileiro')
  })

  it('duas escritas rápidas percorrem updateProject genérico sem fila compartilhada', async () => {
    const projectId = await addProject('zh-CN')
    const updateSpy = vi.spyOn(db.projects, 'update')

    await Promise.all([
      useProjectStore.getState().updateProject(projectId, { contentLanguage: 'en' }),
      useProjectStore.getState().updateProject(projectId, { contentLanguage: 'pt-BR' }),
    ])

    expect(updateSpy).toHaveBeenCalledTimes(2)
    expect(updateSpy.mock.calls.map(([, changes]) => (changes as { contentLanguage?: string }).contentLanguage))
      .toEqual(['en', 'pt-BR'])
    expect((await db.projects.get(projectId))?.contentLanguage).toBe('pt-BR')
  })

  it('idioma inválido pode ser persistido pelo caminho real de updateProject e cai no fallback UI', async () => {
    const projectId = await addProject('pt-BR')
    await useProjectStore.getState().updateProject(projectId, { contentLanguage: 'fr-FR' as never })

    expect((await db.projects.get(projectId))?.contentLanguage).toBe('fr-FR')
    await i18n.changeLanguage('en')
    const gated = await applyOutputLanguageGate(
      [{ role: 'user', content: 'generate' }],
      { category: 'chapter.content', projectId, outputKind: 'creative' },
    )
    expect(gated.at(-1)!.content).toContain('natural, fluent English')
  })
})
