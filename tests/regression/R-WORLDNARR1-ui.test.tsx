/**
 * R-WORLDNARR1 · WorldNarrativeReleasePanel canonical projection & persisted-data
 * locale guard（Oracle NO-GO 审计整改回归）。
 *
 * 覆盖三个整改点：
 *  1. Canonical projection ownership：叙事模块 kind / 互动实例 kind 的下拉 label
 *     由 src/i18n/display-projection.ts 的 simulation 命名空间共享投影解析
 *     （NARRATIVE_MODULE_KIND_LABEL_KEYS / SIMULATION_SESSION_KIND_LABEL_KEYS），
 *     不再存在 worldview 平行字典；期望值全部取自 simulation locale JSON。
 *  2. Locale 不进入持久化数据：creativeBrief 初始为空、作者输入后切换 UI locale
 *     值不变；创建实例在标题留空时回退为作者化模块标题本身，持久化 title 不含
 *     任何 UI locale 文案（旧实现会写入 `${t(kind)} · ${title}`）。
 *
 * 仅挂载真实面板与真实 lib 生命周期（fake-indexeddb 每例重置），不 mock 内部服务。
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WorldNarrativeReleasePanel from '../../src/components/world-engine/WorldNarrativeReleasePanel'
import { DialogProvider } from '../../src/components/shared/Dialog'
import { createStarterNarrativeModule } from '../../src/lib/narrative/blueprint'
import {
  WORLD_RELEASE_SECTIONS,
  createWorldRevision,
  publishWorldRevision,
} from '../../src/lib/world-engine/releases'
import { db } from '../../src/lib/db/schema'
import type { Project, WorkspaceScope } from '../../src/lib/types'
import { ensureWorkspaceOwnership } from '../../src/lib/world-engine/ownership'
import i18n from '../../src/i18n'
import enSimulation from '../../src/i18n/locales/en/simulation.json'
import ptSimulation from '../../src/i18n/locales/pt-BR/simulation.json'
import zhSimulation from '../../src/i18n/locales/zh-CN/simulation.json'
import enWorldview from '../../src/i18n/locales/en/worldview.json'
import ptWorldview from '../../src/i18n/locales/pt-BR/worldview.json'
import zhWorldview from '../../src/i18n/locales/zh-CN/worldview.json'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

type UiLang = 'zh-CN' | 'en' | 'pt-BR'

/** simulation ns 的 kind 投影期望值（与 display-projection 键位一致）。 */
const simulationCopy = {
  'zh-CN': zhSimulation,
  en: enSimulation,
  'pt-BR': ptSimulation,
} as const

/** worldview ns 的面板自身 UI 文案。 */
const worldviewCopy = {
  'zh-CN': zhWorldview.worldNarrative,
  en: enWorldview.worldNarrative,
  'pt-BR': ptWorldview.worldNarrative,
} as const

const MODULE_TITLE = 'R-WORLDNARR 冻结叙事'

async function fixture(name: string): Promise<{ project: Project; scope: WorkspaceScope }> {
  const now = Date.now()
  const projectId = await db.projects.add({
    name, genre: 'fantasy', genres: ['fantasy'], status: 'drafting', description: '',
    targetWordCount: 20_000, createdAt: now, updatedAt: now,
  } as any) as number
  const owned = await ensureWorkspaceOwnership(projectId)
  return { project: owned.project, scope: owned.scope }
}

/** 冻结并发布一个包含单个叙事模块的 WorldRelease，返回该模块行。 */
async function seedRelease(scope: WorkspaceScope) {
  const moduleRow = await createStarterNarrativeModule({
    scope, owner: 'work', kind: 'quest', title: MODULE_TITLE,
  })
  const revision = await createWorldRevision({
    scope,
    label: 'r1',
    parentRevisionId: null,
    selectedNarrativeModuleIds: [moduleRow.id!],
  })
  await publishWorldRevision(revision.id!)
  return moduleRow
}

async function waitFor(assertion: () => void | Promise<void>) {
  const started = Date.now(); let last: unknown
  while (Date.now() - started < 12_000) {
    try { await act(async () => { await assertion() }); return }
    catch (reason) { last = reason; await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) }) }
  }
  throw last
}

async function changeLanguage(lang: UiLang) {
  await act(async () => { await i18n.changeLanguage(lang); await new Promise(resolve => setTimeout(resolve, 0)) })
}

/** 受控 textarea/input 需要原生 setter 才能触发 React onChange。 */
async function setControlValue(element: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setValue = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!
  await act(async () => {
    setValue.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

describe('WORLDNARR-1 · release panel canonical projection & persisted-data locale guard', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(async () => {
    await db.delete(); await db.open()
    await changeLanguage('zh-CN')
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  })
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); db.close() })

  function mountPanel(project: Project, projectId: number) {
    return act(async () => {
      root.render(createElement(DialogProvider, null, createElement(WorldNarrativeReleasePanel, {
        project,
        projectId,
        worldGroupId: null,
        onChanged: () => undefined,
        onOpenRuntime: () => undefined,
        onOpenGame: () => undefined,
      })))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
  }

  it('creativeBrief 初始为空且不随 UI locale 变化；kind 下拉由 simulation 共享投影驱动', async () => {
    const owned = await fixture('WORLDNARR brief')
    await mountPanel(owned.project, owned.scope.projectId)
    await waitFor(() => expect(host.querySelector('.sf-world-pipeline')).toBeTruthy())

    // ① creativeBrief 必须初始为空：不得用固定 authored prompt（更不得用 UI
    //    locale 文案）预置持久化的创作简报。
    const brief = () => host.querySelector(
      `textarea[aria-label="${worldviewCopy[i18n.language as UiLang].creativeBriefAria}"]`,
    ) as HTMLTextAreaElement
    expect(brief()).toBeTruthy()
    expect(brief().value).toBe('')
    await setControlValue(brief(), '作者简报：设计一个新的当下危机')
    expect(brief().value).toBe('作者简报：设计一个新的当下危机')

    for (const lang of ['en', 'pt-BR'] as UiLang[]) {
      await changeLanguage(lang)
      // ② 作者输入的简报值在语言切换后保持逐字节不变。
      expect(brief().value).toBe('作者简报：设计一个新的当下危机')
      // ③ 叙事模块 kind 下拉来自 simulation ns 共享投影（moduleKind.*），
      //    worldview 平行字典的旧文案不得再出现。
      const kindSelect = host.querySelector(
        `select[aria-label="${worldviewCopy[lang].newModuleKindAria}"]`,
      ) as HTMLSelectElement
      expect(kindSelect).toBeTruthy()
      const kindLabels = Array.from(kindSelect.options).map(option => option.textContent)
      const moduleKind = (simulationCopy[lang] as unknown as { moduleKind: Record<string, string> }).moduleKind
      expect(kindLabels).toContain(moduleKind.main)
      expect(kindLabels).toContain(moduleKind.quest)
      // canonical 全集恰好 5 项（与 NARRATIVE_MODULE_KIND_LABEL_KEYS 一致）。
      expect(kindLabels).toHaveLength(5)
      // ④ 互动实例类型下拉来自 simulation ns 共享投影（kind.*）。
      const instanceSelect = host.querySelector(
        `select[aria-label="${worldviewCopy[lang].instanceKindAria}"]`,
      ) as HTMLSelectElement
      expect(instanceSelect).toBeTruthy()
      const instanceLabels = Array.from(instanceSelect.options).map(option => option.textContent)
      const kinds = (simulationCopy[lang] as unknown as { kind: Record<string, string> }).kind
      expect(instanceLabels).toEqual([kinds.ttrpg, kinds.chatgame, kinds.npcEvolution])
    }
    await changeLanguage('zh-CN')
  }, 30_000)

  it('i18n Unit A · 发布分区标签/描述经 worldview releaseSections 键渲染并跟随 locale；canonical key 不变', async () => {
    const owned = await fixture('WORLDNARR sections')
    await mountPanel(owned.project, owned.scope.projectId)
    await waitFor(() => expect(host.querySelector('.sf-world-release-sections')).toBeTruthy())

    const sectionRows = () => Array.from(
      host.querySelectorAll('.sf-world-release-sections label'),
    ) as HTMLLabelElement[]

    for (const lang of ['zh-CN', 'en', 'pt-BR'] as UiLang[]) {
      await changeLanguage(lang)
      const sections = worldviewCopy[lang].releaseSections
      const rows = sectionRows()
      expect(rows).toHaveLength(WORLD_RELEASE_SECTIONS.length)
      // 四个分区的可见标签与 title 描述都来自 locale JSON，不残留硬编码中文源串。
      expect(rows.map(row => row.querySelector('span')?.textContent)).toEqual([
        sections.foundation.label,
        sections.characters.label,
        sections.narrative.label,
        sections.outline.label,
      ])
      expect(rows.map(row => row.getAttribute('title'))).toEqual([
        sections.foundation.description,
        sections.characters.description,
        sections.narrative.description,
        sections.outline.description,
      ])
    }
    // canonical 契约：分区 key 与 legacy label/description 字段保持稳定，
    // 表清单派生自注册表且不包含翻译文案。
    expect(WORLD_RELEASE_SECTIONS.map(section => section.key)).toEqual([
      'foundation', 'characters', 'narrative', 'outline',
    ])
    expect(WORLD_RELEASE_SECTIONS.map(section => section.label)).toEqual([
      '世界基础', '角色资产', '故事设计', '大纲与细纲',
    ])
    await changeLanguage('zh-CN')
  }, 30_000)

  it('创建实例：空标题回退为作者化模块标题；UI locale 不进入持久化 title', async () => {
    const owned = await fixture('WORLDNARR instance title')
    const moduleRow = await seedRelease(owned.scope)
    await mountPanel(owned.project, owned.scope.projectId)
    // 发布列表加载并自动选中首个 release 与其叙事模块导出。
    const createInstanceLabel = () => worldviewCopy[i18n.language as UiLang].createInstance
    await waitFor(() => {
      const button = Array.from(host.querySelectorAll('button'))
        .find(item => item.textContent?.includes(createInstanceLabel()))
      expect(button && !(button as HTMLButtonElement).disabled).toBeTruthy()
    })
    // 在 en 下点击创建（旧实现会把 "TTRPG Session · <title>" 写入持久化 title）。
    await changeLanguage('en')
    const button = Array.from(host.querySelectorAll('button'))
      .find(item => item.textContent?.includes(createInstanceLabel())) as HTMLButtonElement
    await act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 0)) })
    await waitFor(async () => expect(await db.simulationSessions.count()).toBe(1))
    const session = await db.simulationSessions.toArray()
    // 持久化 title 必须精确等于作者化模块标题——无 locale 前缀、无翻译文案。
    expect(session[0].title).toBe(MODULE_TITLE)
    expect(session[0].title).not.toContain('TTRPG Session')
    expect(moduleRow.title).toBe(MODULE_TITLE)
    await changeLanguage('zh-CN')
  }, 30_000)
})
