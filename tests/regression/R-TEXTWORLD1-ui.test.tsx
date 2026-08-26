import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import TextOpenWorldPlayer from '../../src/components/text-game/TextOpenWorldPlayer'
import TextOpenWorldWorkbench from '../../src/components/text-game/TextOpenWorldWorkbench'
import { DialogProvider } from '../../src/components/shared/Dialog'
import { db } from '../../src/lib/db/schema'
import { loadTextOpenWorldAuthoringSnapshot, publishTextOpenWorldGame, seedTextOpenWorldAcceptanceGame, validateTextOpenWorldGame } from '../../src/lib/open-world/authoring'
import { readSimulationState } from '../../src/lib/simulation/runtime'
import { EMPTY_SIMULATION_STATE, type Project, type WorkspaceScope } from '../../src/lib/types'
import { ensureWorkspaceOwnership } from '../../src/lib/world-engine/ownership'
import { useTextOpenWorldPlayerStore } from '../../src/stores/text-open-world-player'
import i18n from '../../src/i18n'
import zhSimulation from '../../src/i18n/locales/zh-CN/simulation.json'
import ptBrSimulation from '../../src/i18n/locales/pt-BR/simulation.json'

const openWorldZh = zhSimulation.textGame.openWorld
const commonZh = zhSimulation.textGame.common
const openWorldEnumsZh = zhSimulation.openWorld
const openWorldPt = ptBrSimulation.textGame.openWorld
const attentionPt = ptBrSimulation.openWorld.attentionLevel
const knowledgePt = ptBrSimulation.openWorld.regionKnowledge
const triggerPt = ptBrSimulation.openWorld.trigger
const questCategoryPt = ptBrSimulation.openWorld.questCategory

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function button(host: ParentNode, text: string): HTMLButtonElement {
  const result = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.trim() === text)
  if (!result) throw new Error(`找不到按钮:${text}`)
  return result
}

function buttonContaining(host: ParentNode, text: string): HTMLButtonElement {
  const result = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.includes(text))
  if (!result) throw new Error(`找不到包含文本的按钮:${text}`)
  return result
}

async function click(host: ParentNode, text: string, contains = false) {
  await act(async () => {
    ;(contains ? buttonContaining(host, text) : button(host, text)).click()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function typeValue(element: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function waitFor(assertion: () => void | Promise<void>) {
  const started = Date.now(); let last: unknown
  while (Date.now() - started < 12_000) {
    try { await act(async () => { await assertion() }); return }
    catch (reason) {
      last = reason
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
    }
  }
  throw last
}

async function fixture(name: string): Promise<{ project: Project; scope: WorkspaceScope }> {
  const now = Date.now()
  const projectId = await db.projects.add({
    name,
    genre: 'open-world',
    genres: ['open-world'],
    status: 'drafting',
    description: '',
    targetWordCount: 20_000,
    createdAt: now,
    updatedAt: now,
  } as any) as number
  const owned = await ensureWorkspaceOwnership(projectId)
  return { project: owned.project, scope: owned.scope }
}

describe('TEXTWORLD-1 · author and player UI', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  beforeAll(async () => { await db.delete(); await db.open() })
  beforeEach(() => {
    localStorage.clear()
    useTextOpenWorldPlayerStore.setState({
      scope: null,
      worldGroupId: null,
      releases: [],
      sessions: [],
      selectedSessionId: null,
      events: [],
      checkpoints: [],
      runtimeState: structuredClone(EMPTY_SIMULATION_STATE),
      selectedManifest: null,
      generatedCandidate: null,
      loading: false,
      busy: false,
      error: '',
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(async () => { await act(async () => root.unmount()); host.remove() })
  afterAll(() => db.close())

  it.sequential('作者原子维护三个共享模块，检查后冻结发布', async () => {
    const owned = await fixture('TEXTWORLD 作者 UI')
    await act(async () => {
      root.render(createElement(DialogProvider, null, createElement(TextOpenWorldWorkbench, { scope: owned.scope })))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(host.textContent).toContain('创建开放世界草稿'))
    await click(host, '创建验收世界')
    await waitFor(() => expect(host.textContent).toContain('五区长路'))
    const counts = Array.from(host.querySelectorAll('section article strong')).map(item => item.textContent)
    expect(counts).toEqual(expect.arrayContaining(['5', '30', '10', '20']))
    const statLabels = Array.from(host.querySelectorAll('section article small')).map(item => item.textContent)
    expect(statLabels).toEqual([
      openWorldZh.workbench.statRegions,
      openWorldZh.workbench.statFixedTasks,
      openWorldZh.workbench.statTaskTemplates,
      openWorldZh.workbench.statParticipants,
      openWorldZh.workbench.statOrganizations,
    ])
    expect(host.querySelector('textarea[aria-label="OpenWorldContentV1 JSON"]')).toBeTruthy()
    expect(host.querySelector('textarea[aria-label="AdventureContentV1 JSON"]')).toBeTruthy()
    expect(host.querySelector('textarea[aria-label="NarrativeSimulationContentV1 JSON"]')).toBeTruthy()
    await click(host, '解析并保存全部模块')
    await waitFor(() => expect(host.textContent).toContain('三个声明式内容模块已原子保存'))
    await click(host, '检查')
    await waitFor(() => expect(host.textContent).toContain('全部发布校验通过'))
    expect(host.textContent).toContain('发布就绪')
    await click(host, '发布')
    await waitFor(() => expect(host.textContent).toContain('已发布 GameRelease v1'))
    expect(await db.openWorldModules.where('projectId').equals(owned.scope.projectId).count()).toBe(1)
    expect(await db.gameReleases.where('projectId').equals(owned.scope.projectId).count()).toBe(1)
  }, 30_000)

  it.sequential('校验受阻与操作失败只显示本地化计数摘要，不泄漏引擎原文', async () => {
    const owned = await fixture('TEXTWORLD 校验 UI')
    await act(async () => {
      root.render(createElement(DialogProvider, null, createElement(TextOpenWorldWorkbench, { scope: owned.scope })))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(host.textContent).toContain(openWorldZh.workbench.emptyTitle))
    await click(host, openWorldZh.workbench.createAcceptanceButton)
    await waitFor(() => expect(host.textContent).toContain('五区长路'))
    const editor = host.querySelector('textarea[aria-label="OpenWorldContentV1 JSON"]') as HTMLTextAreaElement
    const original = editor.value

    // 操作失败路径：解析器原文（含中文引擎文案）只能进控制台，UI 只显示本地化通用错误
    await typeValue(editor, '{')
    await click(host, openWorldZh.workbench.saveAllModulesButton)
    await waitFor(() => expect(host.querySelector('[role="status"]')?.textContent).toContain(commonZh.errors.operationFailed))
    expect(host.textContent).not.toContain('内容不是合法 JSON')

    // 阻断报告路径：破坏唯一初始焦点区域后保存成功，但校验必须受阻且只显示计数摘要
    const broken = JSON.parse(original) as { regions: Array<{ initialAttention: string }> }
    broken.regions = broken.regions.map(region => ({ ...region, initialAttention: 'background' }))
    await typeValue(editor, JSON.stringify(broken))
    await click(host, openWorldZh.workbench.saveAllModulesButton)
    await waitFor(() => expect(host.textContent).toContain(openWorldZh.workbench.bundleSavedMessage))
    await click(host, openWorldZh.workbench.validateButton)
    const snapshot = await loadTextOpenWorldAuthoringSnapshot(owned.scope)
    const report = await validateTextOpenWorldGame(owned.scope, snapshot.definitions[0]!.id!)
    expect(report.valid).toBe(false)
    expect(report.errors.length).toBeGreaterThan(0)
    const expectedSummary = commonZh.errors.validationSummary
      .replace('{{errors}}', String(report.errors.length))
      .replace('{{warnings}}', String(report.warnings.length))
    await waitFor(() => expect(host.querySelector('[role="status"]')?.textContent).toContain(expectedSummary))
    expect(host.textContent).toContain(openWorldZh.workbench.reportBlocked)
    for (const issue of [...report.errors, ...report.warnings]) expect(host.textContent).not.toContain(issue)
  }, 30_000)

  it.sequential('玩家界面不渲染 store 原始错误，仅显示本地化通用文案并输出控制台', async () => {
    const owned = await fixture('TEXTWORLD 玩家原始错误防护')
    await act(async () => {
      root.render(createElement(DialogProvider, null, createElement(TextOpenWorldPlayer, {
        project: owned.project, scope: owned.scope, worldGroupId: null,
      })))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    // 等真实 load 结束，再注入 store 级错误，避免被加载流程覆盖。
    await waitFor(() => expect(useTextOpenWorldPlayerStore.getState().loading).toBe(false))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await act(async () => useTextOpenWorldPlayerStore.setState({ error: '[engine] raw-store-failure 引擎原始存储错误' }))
      // alert 只显示 locale 驱动的通用文案；localError 优先级不变（此处 localError 为空）。
      await waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain(commonZh.errors.operationFailed))
      expect(host.textContent).not.toContain('raw-store-failure')
      // 原始细节保留在开发者控制台，且带稳定组件前缀。
      expect(errorSpy.mock.calls.some(call => String(call[0]).startsWith('[text-open-world]'))).toBe(true)
    } finally {
      errorSpy.mockRestore()
    }
  }, 30_000)

  it.sequential('玩家离线发现、接受并解决任务，旅行和检查点分支均写入正式实例', async () => {
    const owned = await fixture('TEXTWORLD 玩家 UI')
    const definition = await seedTextOpenWorldAcceptanceGame({ scope: owned.scope })
    await publishTextOpenWorldGame({ scope: owned.scope, gameDefinitionId: definition.id! })
    await act(async () => {
      root.render(createElement(DialogProvider, null, createElement(TextOpenWorldPlayer, {
        project: owned.project,
        scope: owned.scope,
        worldGroupId: null,
      })))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(host.textContent).toContain('五区长路'))
    await click(host, '新旅程')
    await waitFor(() => expect(host.textContent).toContain('TEXTWORLD-1 · REGION FOCUS'))
    const startRegion = useTextOpenWorldPlayerStore.getState().runtimeState.openWorld!.currentRegionKey
    await click(host, openWorldZh.player.discoverAction.replace('{{kind}}', openWorldEnumsZh.trigger.observe))
    await waitFor(() => expect(useTextOpenWorldPlayerStore.getState().busy).toBe(false))
    expect(host.textContent).toContain('动态任务')
    await click(host, '接受')
    await waitFor(() => expect(host.textContent).toContain('进行中'))
    await click(host, '解决任务')
    await waitFor(() => expect(useTextOpenWorldPlayerStore.getState().busy).toBe(false))
    expect(useTextOpenWorldPlayerStore.getState().runtimeState.openWorld?.questInstances.some(item => item.status === 'resolved')).toBe(true)

    const travel = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.includes('前往 ')) as HTMLButtonElement | undefined
    expect(travel).toBeTruthy()
    await act(async () => { travel!.click(); await new Promise(resolve => setTimeout(resolve, 0)) })
    await waitFor(() => expect(useTextOpenWorldPlayerStore.getState().busy).toBe(false))
    while (useTextOpenWorldPlayerStore.getState().runtimeState.openWorld?.travel) {
      await click(host, '推进世界 tick')
      await waitFor(() => expect(useTextOpenWorldPlayerStore.getState().busy).toBe(false))
    }
    expect(useTextOpenWorldPlayerStore.getState().runtimeState.openWorld?.currentRegionKey).not.toBe(startRegion)

    const input = host.querySelector(`input[placeholder="${openWorldZh.player.checkpointPlaceholder}"]`) as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '抵达新区')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await waitFor(() => expect(button(host, '保存').disabled).toBe(false))
    await click(host, '保存')
    await waitFor(() => expect(useTextOpenWorldPlayerStore.getState().checkpoints.some(item => item.name === '抵达新区')).toBe(true))
    const originalSessionId = useTextOpenWorldPlayerStore.getState().selectedSessionId
    await click(host, '抵达新区', true)
    await waitFor(() => expect(useTextOpenWorldPlayerStore.getState().selectedSessionId).not.toBe(originalSessionId))
    const branchedSessionId = useTextOpenWorldPlayerStore.getState().selectedSessionId!
    const state = await readSimulationState(branchedSessionId)
    expect(state.openWorld?.currentRegionKey).not.toBe(startRegion)
    expect(await db.simulationSessions.get(branchedSessionId)).toMatchObject({ parentSessionId: originalSessionId })
    const exitButton = button(host, commonZh.player.exitGame)
    expect(exitButton.getAttribute('aria-label')).toBe(commonZh.player.exitGame)
    await click(host, commonZh.player.exitGame)
    await waitFor(() => expect(useTextOpenWorldPlayerStore.getState().selectedSessionId).toBeNull())
    expect(host.textContent).toContain('从正式发布开始开放世界旅程')
  }, 35_000)

  it.sequential('非默认语言（pt-BR）渲染投影后的区域注意力、认知插值、发现触发与任务类别标签', async () => {
    const owned = await fixture('TEXTWORLD locale UI')
    const definition = await seedTextOpenWorldAcceptanceGame({ scope: owned.scope })
    await publishTextOpenWorldGame({ scope: owned.scope, gameDefinitionId: definition.id! })
    await act(async () => {
      root.render(createElement(DialogProvider, null, createElement(TextOpenWorldPlayer, {
        project: owned.project,
        scope: owned.scope,
        worldGroupId: null,
      })))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    try {
      await act(async () => { await i18n.changeLanguage('pt-BR'); await new Promise(resolve => setTimeout(resolve, 0)) })
      await waitFor(() => expect(host.textContent).toContain(openWorldPt.player.sidebarTitle))
      await click(host, openWorldPt.player.startNewJourney)
      await waitFor(() => expect(useTextOpenWorldPlayerStore.getState().runtimeState.openWorld).not.toBeNull())
      await waitFor(() => expect(host.textContent).toContain(openWorldPt.player.kicker))

      // 区域卡片：注意力代码走投影，认知值经 regionCardMeta 插值本地化。
      const regionSection = host.querySelector('main section') as HTMLElement
      const attentionCodes = Array.from(regionSection.querySelectorAll('article code')).map(item => item.textContent)
      expect(attentionCodes.length).toBeGreaterThan(0)
      for (const code of attentionCodes) {
        expect(Object.values(attentionPt)).toContain(code)
        expect(Object.keys(attentionPt)).not.toContain(code)
      }
      const regionMetas = Array.from(regionSection.querySelectorAll('article small')).map(item => item.textContent ?? '')
      expect(regionMetas.length).toBeGreaterThan(0)
      const knowledgePattern = new RegExp(`^(${Object.values(knowledgePt).join('|')}) · Problemas \\d+$`)
      for (const meta of regionMetas) expect(meta).toMatch(knowledgePattern)

      // 发现触发按钮：触发词投影为本地标签，且不再出现规范英文码。
      const observeLabel = openWorldPt.player.discoverAction.replace('{{kind}}', triggerPt.observe)
      button(host, observeLabel)
      const rawTriggerLabels = ['observe', 'social', 'explore', 'rest'].map(kind => openWorldPt.player.discoverAction.replace('{{kind}}', kind))
      const leakedRawTrigger = Array.from(host.querySelectorAll('button')).some(item => rawTriggerLabels.some(raw => item.textContent?.includes(raw)))
      expect(leakedRawTrigger).toBe(false)
      await click(host, observeLabel)
      await waitFor(() => expect(useTextOpenWorldPlayerStore.getState().busy).toBe(false))

      // 任务类别代码投影为本地标签。
      const revealedCard = Array.from(host.querySelectorAll('article')).find(item => Array.from(item.querySelectorAll('button')).some(candidate => candidate.textContent?.trim() === openWorldPt.player.questAccept))
      expect(revealedCard).toBeTruthy()
      const categoryCode = revealedCard!.querySelector('code')?.textContent
      expect(Object.values(questCategoryPt)).toContain(categoryCode)
      expect(Object.keys(questCategoryPt)).not.toContain(categoryCode)

      await click(host, openWorldPt.player.questAccept)
      await waitFor(() => expect(useTextOpenWorldPlayerStore.getState().runtimeState.openWorld?.questInstances.some(item => item.status === 'active')).toBe(true))
    } finally {
      await act(async () => { await i18n.changeLanguage('zh-CN'); await new Promise(resolve => setTimeout(resolve, 0)) })
    }
  }, 35_000)
})
