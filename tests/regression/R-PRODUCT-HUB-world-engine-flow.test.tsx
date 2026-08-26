/**
 * R-PRODUCT-HUB · 世界引擎公共流回归（Deepwork Phase 2 · lane A）
 *
 * 公开入口 ProductHubPage（挂载于 /product 路由）在 enableMultiWorld=false 与 true
 * 两种项目下必须保持同一条世界引擎体验：
 *  1. 精选卡（.sf-worlds-featured-actions）同时提供本地化的
 *     productHub.engineManageSettings 与 productHub.engineContinueStepWriting 两个 CTA；
 *  2. 点击 engineContinueStepWriting 经公开 handler/router 导航到当前项目的
 *     大纲模块：/workspace/<projectId>?module=outline；
 *  3. #world-engine-editor 内渲染真实 WorldEngineWorkspace 契约
 *     （.sf-world-engine-workspace / 完整世界工作台 / 五领域卡）；旧 WORLD CONTENT
 *     区头已按设计稿移除，工作台是编辑器区块唯一直接子元素，且不得回退渲染
 *     Product-Hub 的 WorldGroupOverview 替代品；
 *  4. engineManageSettings CTA 滚动定位到同一个 #world-engine-editor 元素。
 *
 * 仅 mock 外部 I/O 叶子面板（WorldSharingPanel / WorldWorkManager /
 * WorldNarrativeReleasePanel）；页面装配、世界投影派生与工作台契约保持真实，
 * 项目数据为确定性种子（fake-indexeddb，每例重置）。
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProductHubPage from '../../src/pages/ProductHubPage'
import i18n from '../../src/i18n'
import { db } from '../../src/lib/db/schema'
import { useProjectStore } from '../../src/stores/project'
import type { Project } from '../../src/lib/types'
import enPages from '../../src/i18n/locales/en/pages.json'
import ptPages from '../../src/i18n/locales/pt-BR/pages.json'
import zhPages from '../../src/i18n/locales/zh-CN/pages.json'
import zhWorldGroup from '../../src/i18n/locales/zh-CN/world-group.json'
import enWorldview from '../../src/i18n/locales/en/worldview.json'
import ptWorldview from '../../src/i18n/locales/pt-BR/worldview.json'

// ── 外部 I/O 叶子面板 mock（页面装配与其余组件保持真实）──
vi.mock('../../src/components/product/WorldSharingPanel', () => ({ default: () => null }))
vi.mock('../../src/components/world-engine/WorldWorkManager', () => ({ default: () => null }))
vi.mock('../../src/components/world-engine/WorldNarrativeReleasePanel', () => ({ default: () => null }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

type UiLang = 'zh-CN' | 'en' | 'pt-BR'
type ProductHubCopy = typeof zhPages.productHub

/** 三语精确文案（直接取自 locale JSON，禁止宽泛多语正则）。 */
const copyByLang: Record<UiLang, ProductHubCopy> = {
  'zh-CN': zhPages.productHub,
  en: enPages.productHub as ProductHubCopy,
  'pt-BR': ptPages.productHub as ProductHubCopy,
}

/** WorldGroupOverview 初始视图必然渲染的按钮文案（zh-CN），用作“未回退”反证标记。 */
const groupOverviewMarkers = {
  aiSuggestButton: (zhWorldGroup as { overview: { aiSuggestButton: string } }).overview.aiSuggestButton,
  addWorldButton: (zhWorldGroup as { overview: { addWorldButton: string } }).overview.addWorldButton,
}

const LANGS: UiLang[] = ['zh-CN', 'en', 'pt-BR']

/** 表驱动：单世界分步骤与多世界两条产品形态走完全相同的世界引擎公共流。 */
const VARIANTS: ReadonlyArray<[boolean, string]> = [
  [false, '分步骤项目'],
  [true, '多世界项目'],
]

let nextSeed = 0

async function seedProject(enableMultiWorld: boolean): Promise<{ id: number; name: string }> {
  nextSeed += 1
  const name = `R-PRODUCT-HUB 引擎项目 ${nextSeed}`
  const now = 1_700_000_000_000 + nextSeed
  const id = await db.projects.add({
    name,
    genre: 'fantasy',
    genres: ['fantasy'],
    status: 'drafting',
    description: `${name} 的确定性简介`,
    targetWordCount: 100_000,
    enableMultiWorld,
    worldCode: `W-HUB${String(nextSeed).padStart(2, '0')}-${enableMultiWorld ? 'BBBB' : 'AAAA'}`,
    worldVersion: 1,
    createdAt: now,
    updatedAt: now,
  } as Project) as number
  return { id, name }
}

function WorkspaceProbe() {
  const location = useLocation()
  return createElement('div', { 'data-testid': 'workspace-probe' }, `${location.pathname}${location.search}`)
}

const mounted: Array<{ host: HTMLDivElement; root: ReturnType<typeof createRoot> }> = []

async function mountProductHub(): Promise<HTMLDivElement> {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  mounted.push({ host, root })
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/product'] },
      createElement(Routes, null,
        createElement(Route, { path: '/product', element: createElement(ProductHubPage) }),
        createElement(Route, { path: '/workspace/:projectId', element: createElement(WorkspaceProbe) }),
      ),
    ))
  })
  return host
}

async function openWorldsTab(host: HTMLDivElement, projectName: string): Promise<void> {
  // 等待真实 loadProjects 把种子项目读入首页，再通过公共导航进入世界引擎页，
  // 并确认精选卡展示的正是当前种子项目（而非 store 残留的旧项目）。
  await vi.waitFor(() => expect(host.textContent).toContain(projectName))
  const tab = host.querySelector<HTMLButtonElement>('[data-testid="product-tab-worlds"]')
  expect(tab).toBeTruthy()
  await act(async () => tab!.click())
  await vi.waitFor(() => expect(featuredSection(host).querySelector('h2')?.textContent).toBe(projectName))
}

function featuredSection(host: HTMLElement): HTMLElement {
  const section = host.querySelector('.sf-worlds-featured')
  expect(section).toBeTruthy()
  return section as HTMLElement
}

function featuredActions(host: HTMLElement): HTMLButtonElement[] {
  return Array.from(featuredSection(host).querySelectorAll<HTMLButtonElement>('.sf-worlds-featured-actions button'))
}

/** 等待真实世界投影派生完成，返回已挂载的 WorldEngineWorkspace 根节点。 */
async function waitForWorkspace(host: HTMLElement): Promise<HTMLElement> {
  const editor = host.querySelector('#world-engine-editor')
  expect(editor).toBeTruthy()
  await vi.waitFor(() => expect(editor!.querySelector('.sf-world-engine-workspace')).toBeTruthy())
  return editor!.querySelector('.sf-world-engine-workspace') as HTMLElement
}

interface MountedHub {
  host: HTMLDivElement
  project: { id: number; name: string }
}

async function renderWorldsTab(enableMultiWorld: boolean, lang: UiLang = 'zh-CN'): Promise<MountedHub> {
  await i18n.changeLanguage(lang)
  // 同一测试内的多次挂载共享同一个 zustand store；先复位，避免新挂载把
  // activeProjectId 钉在上一轮残留项目上。
  await act(async () => useProjectStore.setState({ projects: [], currentProjectId: null, loading: false }))
  const project = await seedProject(enableMultiWorld)
  const host = await mountProductHub()
  await openWorldsTab(host, project.name)
  return { host, project }
}

/** 监听 scrollIntoView 调用并记录目标元素；happy-dom 缺失时先补 no-op。 */
function trackScrollIntoView(): { targets: Element[]; spy: ReturnType<typeof vi.spyOn>; restore: () => void } {
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    ;(Element.prototype as unknown as Record<string, () => void>).scrollIntoView = () => undefined
  }
  const targets: Element[] = []
  const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
    targets.push(this)
  })
  return { targets, spy, restore: () => spy.mockRestore() }
}

describe.each(VARIANTS)('R-PRODUCT-HUB · 世界引擎公共流（enableMultiWorld=%s %s）', (enableMultiWorld) => {
  it('精选卡同时提供三语本地化的管理设定与继续分步骤 CTA', async () => {
    for (const lang of LANGS) {
      const copy = copyByLang[lang]
      const { host } = await renderWorldsTab(enableMultiWorld, lang)
      const actions = featuredActions(host)
      expect(actions).toHaveLength(2)
      const labels = actions.map(button => button.textContent)
      expect(labels).toContain(copy.engineManageSettings)
      expect(labels).toContain(copy.engineContinueStepWriting)
      expect(featuredSection(host).querySelector('h2')?.textContent).toBe(`R-PRODUCT-HUB 引擎项目 ${nextSeed}`)
    }
  })

  it('点击继续分步骤 CTA 经公开 router 进入当前项目大纲模块', async () => {
    const { host, project } = await renderWorldsTab(enableMultiWorld)
    const copy = copyByLang['zh-CN']
    const continueButton = featuredActions(host).find(button => button.textContent === copy.engineContinueStepWriting)
    expect(continueButton).toBeTruthy()
    await act(async () => continueButton!.click())
    const probe = document.querySelector('[data-testid="workspace-probe"]')
    expect(probe?.textContent).toBe(`/workspace/${project.id}?module=outline`)
  })

  it('#world-engine-editor 渲染真实工作台契约且不回退到 WorldGroupOverview', async () => {
    const { host } = await renderWorldsTab(enableMultiWorld)
    // 产品作用域门（engineGroups.groupReady）就绪前会先渲染临时 FeaturePanelFallback；
    // 先等工作台真正挂载，再断言严格结构。若 fallback 永久化，此等待将超时失败。
    const workspace = await waitForWorkspace(host)
    const editor = host.querySelector('#world-engine-editor')
    expect(editor).toBeTruthy()
    // 设计稿已移除旧 WORLD CONTENT 区头：编辑器区块直接且仅包含工作台本体。
    expect(editor!.children).toHaveLength(1)
    expect(editor!.firstElementChild).toBe(editor!.querySelector('.sf-world-engine-workspace'))
    expect(editor!.textContent).not.toContain('WORLD CONTENT')

    expect(workspace.textContent).toContain('完整世界工作台')
    expect(workspace.textContent).toContain('WORLD FOUNDATION / CANON')
    for (const domainLabel of ['世界基础 Canon', '世界资产', '叙事设计', '世界结构', '状态与实例']) {
      expect(workspace.textContent).toContain(domainLabel)
    }
    expect(workspace.textContent).toContain('分步骤叙事投影')

    // 反证：Product-Hub 旧替换品 WorldGroupOverview 的初始必渲染标记不得出现。
    expect(groupOverviewMarkers.aiSuggestButton.length).toBeGreaterThan(0)
    expect(editor!.textContent).not.toContain(groupOverviewMarkers.aiSuggestButton)
    expect(editor!.textContent).not.toContain(groupOverviewMarkers.addWorldButton)
  })

  it('工作台标题与桥接文案随语言切换（非默认 locale 渲染证据）', async () => {
    // 非默认语言下，工作台必须渲染对应 locale 的 worldEngine.* 文案，
    // 且不得再出现 zh-CN 源文案——证明真实语言路由而非 key 回显或中文渗透。
    const expectations: ReadonlyArray<[
      'en' | 'pt-BR',
      typeof enWorldview.worldEngine,
      string,
    ]> = [
      ['en', enWorldview.worldEngine, '完整世界工作台'],
      ['pt-BR', ptWorldview.worldEngine, '完整世界工作台'],
    ]
    for (const [lang, copy, zhTitle] of expectations) {
      const { host } = await renderWorldsTab(enableMultiWorld, lang)
      const workspace = await waitForWorkspace(host)
      expect(workspace.textContent).toContain(copy.title)
      expect(workspace.textContent).toContain(copy.bridge.narrativeTitle)
      expect(workspace.textContent).toContain(copy.runtime.openRuntime)
      expect(workspace.textContent).not.toContain(zhTitle)
    }
  })

  it('管理设定 CTA 滚动定位到同一个 #world-engine-editor 元素', async () => {
    const { targets, spy, restore } = trackScrollIntoView()
    try {
      const { host } = await renderWorldsTab(enableMultiWorld)
      const copy = copyByLang['zh-CN']
      const editor = host.querySelector('#world-engine-editor')
      expect(editor).toBeTruthy()
      await waitForWorkspace(host)
      const manageButton = featuredActions(host).find(button => button.textContent === copy.engineManageSettings)
      expect(manageButton).toBeTruthy()
      await act(async () => manageButton!.click())
      expect(targets).toEqual([editor])
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      restore()
    }
  })
})

beforeEach(async () => {
  await i18n.changeLanguage('zh-CN')
  useProjectStore.setState({ projects: [], currentProjectId: null, loading: false })
  await db.delete()
  await db.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  while (mounted.length) {
    const item = mounted.pop()!
    await act(async () => item.root.unmount())
    item.host.remove()
  }
  db.close()
})
