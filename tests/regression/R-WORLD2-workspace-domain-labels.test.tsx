/**
 * R-WORLD2 · WorldEngineWorkspace 领域卡片 display-only i18n 投影回归。
 *
 * i18n Unit A 整改点：DomainCard 的标题/描述不再直读投影里的 legacy 中文字段，
 * 而是经 useDomainT('worldview') 响应式解析 DOMAIN_DEFINITIONS 登记的稳定
 * labelKey/descriptionKey（worldEngine.domainDefinitions.<key>.label/.description）；
 * legacy label/description 仅作缺 key 回退。因此：
 *  1. 切换 UI locale 时，同一份不可变投影的领域标题/描述必须立即跟随 locale；
 *  2. 投影数据本身保持 canonical，任何时刻不得包含翻译文案。
 *
 * 仅挂载真实工作区与真实 lib 生命周期（fake-indexeddb 每例重置），不 mock 内部服务。
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WorldEngineWorkspace from '../../src/components/world-engine/WorldEngineWorkspace'
import { DialogProvider } from '../../src/components/shared/Dialog'
import { db } from '../../src/lib/db/schema'
import { DOMAIN_DEFINITIONS, loadWorldProjection } from '../../src/lib/world-engine/domain'
import { ensureWorkspaceOwnership } from '../../src/lib/world-engine/ownership'
import type { Project, WorkspaceScope } from '../../src/lib/types'
import i18n from '../../src/i18n'
import enWorldview from '../../src/i18n/locales/en/worldview.json'
import ptWorldview from '../../src/i18n/locales/pt-BR/worldview.json'
import zhWorldview from '../../src/i18n/locales/zh-CN/worldview.json'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

type UiLang = 'zh-CN' | 'en' | 'pt-BR'

/** worldview ns 的领域定义显示文案（与 worldEngine.domainDefinitions.* 键位一致）。 */
const domainCopy = {
  'zh-CN': zhWorldview.worldEngine.domainDefinitions,
  en: enWorldview.worldEngine.domainDefinitions,
  'pt-BR': ptWorldview.worldEngine.domainDefinitions,
} as const

async function fixture(name: string): Promise<{ project: Project; scope: WorkspaceScope }> {
  const now = Date.now()
  const projectId = await db.projects.add({
    name, genre: 'fantasy', genres: ['fantasy'], status: 'drafting', description: '',
    targetWordCount: 20_000, createdAt: now, updatedAt: now,
  } as any) as number
  const owned = await ensureWorkspaceOwnership(projectId)
  return { project: owned.project, scope: owned.scope }
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

describe('WORLD-2 · workspace domain card display-only i18n projection', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(async () => {
    await db.delete(); await db.open()
    await changeLanguage('zh-CN')
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  })
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); db.close() })

  it('领域标题/描述经 worldEngine.domainDefinitions.* 键响应式解析并跟随 locale；投影保持 canonical', async () => {
    const owned = await fixture('WORLD-2 workspace labels')
    const projection = await loadWorldProjection(owned.project)

    await act(async () => {
      root.render(createElement(DialogProvider, null, createElement(WorldEngineWorkspace, {
        projection,
        project: owned.project,
        onOpenModule: () => undefined,
        activeWorkId: owned.scope.workId,
        onWorkChanged: () => undefined,
        onOpenGame: () => undefined,
      })))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(host.querySelectorAll('.sf-world-domain-card')).toHaveLength(5))

    const headings = () => Array.from(host.querySelectorAll('.sf-world-domain-card h3')).map(h3 => h3.textContent)
    const descriptions = () => Array.from(host.querySelectorAll('.sf-world-domain-card .sf-feature-copy p')).map(p => p.textContent)

    // ① zh-CN 初渲染：五域标题/描述来自 locale JSON（与 DOMAIN_DEFINITIONS 顺序一致）。
    expect(headings()).toEqual(DOMAIN_DEFINITIONS.map(definition => domainCopy['zh-CN'][definition.key].label))
    expect(descriptions()).toEqual(DOMAIN_DEFINITIONS.map(definition => domainCopy['zh-CN'][definition.key].description))

    for (const lang of ['en', 'pt-BR'] as UiLang[]) {
      // ② 同一份不可变投影：切换 locale 后标题/描述必须立即跟随，证明渲染时解析。
      await changeLanguage(lang)
      expect(headings()).toEqual(DOMAIN_DEFINITIONS.map(definition => domainCopy[lang][definition.key].label))
      expect(descriptions()).toEqual(DOMAIN_DEFINITIONS.map(definition => domainCopy[lang][definition.key].description))
    }

    // ③ 反例：投影数据全程 canonical，不随 locale 携带任何翻译文案。
    for (const definition of DOMAIN_DEFINITIONS) {
      expect(projection.domains[definition.key].label).toBe(definition.label)
      expect(projection.domains[definition.key].description).toBe(definition.description)
    }
    await changeLanguage('zh-CN')
  }, 30_000)
})
