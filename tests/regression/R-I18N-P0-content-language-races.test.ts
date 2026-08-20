/**
 * R-I18N-P0 · caracterização de persistência e leitura concorrente.
 *
 * R-I18N-P2: barreira compartilhada entre persistência de projeto e geração.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../src/i18n'
import { chat } from '../../src/lib/ai/client'
import { applyOutputLanguageGate } from '../../src/lib/ai/output-language'
import { db } from '../../src/lib/db/schema'
import { flushPendingProjectWrites, useProjectStore } from '../../src/stores/project'
import type { AIConfig } from '../../src/lib/types'

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

describe('R-I18N-P0/P2 · update pendente e geração/leitura concorrente', () => {
  it('gate aguarda o update pendente e lê o valor final', async () => {
    const projectId = await addProject('pt-BR')
    const pending = deferred<unknown>()
    const originalUpdate = db.projects.update.bind(db.projects) as unknown as (key: number, changes: Record<string, unknown>) => Promise<unknown>
    vi.spyOn(db.projects, 'update').mockImplementation((key: any, changes: any) =>
      pending.promise.then(() => originalUpdate(key, changes)) as any)

    const write = useProjectStore.getState().updateProject(projectId, { contentLanguage: 'en' })
    await Promise.resolve()
    const gatedPromise = applyOutputLanguageGate(
      [{ role: 'user', content: 'generate' }],
      { category: 'chapter.content', projectId, outputKind: 'creative' },
    )

    await Promise.resolve()
    pending.resolve(undefined)
    await write
    const gated = await gatedPromise

    expect(gated.at(-1)!.content).toContain('natural, fluent English')
    expect((await db.projects.get(projectId))?.contentLanguage).toBe('en')
  })

  it('falha de update rejeita a geração antes de chamar provider/fetch', async () => {
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
    )).rejects.toThrow('write failed')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uma falha observada pelo flush não impede uma escrita posterior', async () => {
    const projectId = await addProject('zh-CN')
    const originalUpdate = db.projects.update.bind(db.projects) as unknown as (key: number, changes: Record<string, unknown>) => Promise<unknown>
    let calls = 0
    vi.spyOn(db.projects, 'update').mockImplementation((key: any, changes: any) => {
      calls += 1
      if (calls === 1) return Promise.reject(new Error('first write failed')) as any
      return originalUpdate(key, changes) as any
    })

    await expect(useProjectStore.getState().updateProject(projectId, { contentLanguage: 'en' }))
      .rejects.toThrow('first write failed')
    await expect(flushPendingProjectWrites(projectId)).rejects.toThrow('first write failed')

    await useProjectStore.getState().updateProject(projectId, { contentLanguage: 'pt-BR' })
    expect((await db.projects.get(projectId))?.contentLanguage).toBe('pt-BR')
  })

  it('duas escritas rápidas são serializadas e persistem o último valor', async () => {
    const projectId = await addProject('zh-CN')
    const firstUpdate = deferred<unknown>()
    const originalUpdate = db.projects.update.bind(db.projects) as unknown as (key: number, changes: Record<string, unknown>) => Promise<unknown>
    let calls = 0
    const updateSpy = vi.spyOn(db.projects, 'update').mockImplementation((key: any, changes: any) => {
      calls += 1
      if (calls === 1) return firstUpdate.promise.then(() => originalUpdate(key, changes)) as any
      return originalUpdate(key, changes) as any
    })

    const first = useProjectStore.getState().updateProject(projectId, { contentLanguage: 'en' })
    await Promise.resolve()
    const second = useProjectStore.getState().updateProject(projectId, { contentLanguage: 'pt-BR' })
    await Promise.resolve()

    expect(updateSpy).toHaveBeenCalledOnce()
    firstUpdate.resolve(undefined)
    await Promise.all([first, second])

    expect(updateSpy).toHaveBeenCalledTimes(2)
    expect(updateSpy.mock.calls.map(([, changes]) => (changes as { contentLanguage?: string }).contentLanguage))
      .toEqual(['en', 'pt-BR'])
    expect((await db.projects.get(projectId))?.contentLanguage).toBe('pt-BR')
  })

  it('flush aguarda uma segunda escrita enfileirada enquanto a primeira está pendente', async () => {
    const projectId = await addProject('zh-CN')
    const firstUpdate = deferred<unknown>()
    const secondUpdate = deferred<unknown>()
    const secondStarted = deferred<void>()
    const originalUpdate = db.projects.update.bind(db.projects) as unknown as (key: number, changes: Record<string, unknown>) => Promise<unknown>
    let calls = 0
    const updateSpy = vi.spyOn(db.projects, 'update').mockImplementation((key: any, changes: any) => {
      calls += 1
      if (calls === 1) return firstUpdate.promise.then(() => originalUpdate(key, changes)) as any
      secondStarted.resolve()
      return secondUpdate.promise.then(() => originalUpdate(key, changes)) as any
    })

    const first = useProjectStore.getState().updateProject(projectId, { contentLanguage: 'en' })
    await Promise.resolve()
    let flushSettled = false
    const flush = flushPendingProjectWrites(projectId).then(() => {
      flushSettled = true
    })
    await Promise.resolve()
    const second = useProjectStore.getState().updateProject(projectId, { contentLanguage: 'pt-BR' })
    await Promise.resolve()

    expect(updateSpy).toHaveBeenCalledOnce()
    firstUpdate.resolve(undefined)
    await secondStarted.promise
    expect(flushSettled).toBe(false)

    secondUpdate.resolve(undefined)
    await flush
    await Promise.all([first, second])

    expect((await db.projects.get(projectId))?.contentLanguage).toBe('pt-BR')
  })

  it('idioma inválido usa o fallback UI e nunca é persistido', async () => {
    const projectId = await addProject('pt-BR')
    await i18n.changeLanguage('en')
    await useProjectStore.getState().updateProject(projectId, { contentLanguage: 'fr-FR' as never })

    expect((await db.projects.get(projectId))?.contentLanguage).toBe('en')
    const gated = await applyOutputLanguageGate(
      [{ role: 'user', content: 'generate' }],
      { category: 'chapter.content', projectId, outputKind: 'creative' },
    )
    expect(gated.at(-1)!.content).toContain('natural, fluent English')
  })

  it('ui e none não aguardam a fila de contentLanguage', async () => {
    const projectId = await addProject('pt-BR')
    const pending = deferred<unknown>()
    const originalUpdate = db.projects.update.bind(db.projects) as unknown as (key: number, changes: Record<string, unknown>) => Promise<unknown>
    vi.spyOn(db.projects, 'update').mockImplementation((key: any, changes: any) =>
      pending.promise.then(() => originalUpdate(key, changes)) as any)

    const write = useProjectStore.getState().updateProject(projectId, { contentLanguage: 'en' })
    const ui = await applyOutputLanguageGate(
      [{ role: 'user', content: 'generate' }],
      { projectId, outputKind: 'creative', languagePolicy: 'ui' },
    )
    const none = await applyOutputLanguageGate(
      [{ role: 'user', content: 'generate' }],
      { projectId, outputKind: 'creative', languagePolicy: 'none' },
    )

    expect(ui.at(-1)!.content).toContain('中文')
    expect(none).toEqual([{ role: 'user', content: 'generate' }])
    pending.resolve(undefined)
    await write
  })
})
