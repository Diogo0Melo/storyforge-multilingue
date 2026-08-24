/**
 * R-PRODUCT-HUB · TTRPG scope bridge（Deepwork Phase 2 · lane B）
 *
 * 公共入口回归：Product Hub 的 TTRPG 路由（App `/` → ProductHubPage →
 * TtrpgPage）必须把活动工作区作用域 `scopeForProject(project)` =
 * `{projectId, worldId, workId}` 作为 `workspaceScope` 契约传给渲染出的
 * SimulationRuntimePanel，并由面板真实消费，而不是只存在于源码文本中。
 *
 * 本文件只通过公共 UI（MemoryRouter + 真实 Dexie fixture）证明：
 * 1. 活动 `{projectId, worldId, workId}` 会话在跑团页可见；
 * 2. 同世界其他作品的会话被隐藏（且 store 层已装入——隐藏发生在面板
 *    workspaceScope 过滤层，不是数据层）；
 * 3. 有意兼容的旧版无作用域会话（worldId/workId 均为空）仍然可见；
 * 4. 从公共跑团页新建会话会把活动 worldId/workId 持久化到新会话行
 *    （只有 workspaceScope 真正流入 store.createSession 才可能发生）。
 *
 * 证据边界：仅本文件；不修改生产代码、locale、文档或其他测试。
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ProductHubPage from '../../src/pages/ProductHubPage'
import { DialogProvider } from '../../src/components/shared/Dialog'
import { db } from '../../src/lib/db/schema'
import { createSimulationSession } from '../../src/lib/simulation/runtime'
import { createWorldInstance } from '../../src/lib/world-engine/instances'
import {
  EMPTY_SIMULATION_STATE,
  type Project,
  type SimulationRuntimeState,
  type WorkspaceScope,
} from '../../src/lib/types'
import { useProjectStore } from '../../src/stores/project'
import { useSimulationRuntimeStore } from '../../src/stores/simulation-runtime'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const PROJECT_NAME = '跑团作用域桥接'
const ACTIVE_SESSION_TITLE = '当前作品战役'
const OTHER_WORK_SESSION_TITLE = '另一作品战役'
const LEGACY_SESSION_TITLE = '旧版无作用域战役'

function changeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function button(host: HTMLElement, text: string): HTMLButtonElement {
  const result = Array.from(host.querySelectorAll('button'))
    .find(item => item.textContent?.trim() === text)
  if (!result) throw new Error(`找不到按钮: ${text}`)
  return result
}

async function clickWhenEnabled(host: HTMLElement, text: string) {
  const target = button(host, text)
  await viWaitFor(() => expect(target.disabled).toBe(false))
  await act(async () => {
    target.click()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

/** 真实 Dexie fixture：项目 + 一个世界 + 两个作品，项目锁定活动 World/Work。 */
async function seedScopedWorkspace(): Promise<{
  projectId: number
  worldId: number
  activeWorkId: number
  otherWorkId: number
}> {
  const now = Date.now()
  const projectId = await db.projects.add({
    name: PROJECT_NAME,
    genre: '',
    genres: [],
    status: 'drafting',
    description: '',
    targetWordCount: 0,
    enableMultiWorld: false,
    createdAt: now,
    updatedAt: now,
  } as Project) as number
  const worldId = await db.worlds.add({
    projectId,
    code: `ttrpg-bridge-${projectId}`,
    name: '雾港世界',
    description: '',
    currentVersion: 1,
    createdAt: now,
    updatedAt: now,
  }) as number
  const activeWorkId = await db.works.add({
    projectId,
    worldId,
    title: '潮汐来信',
    description: '',
    genres: ['drama'],
    status: 'drafting',
    targetWordCount: 10_000,
    createdAt: now,
    updatedAt: now,
  }) as number
  const otherWorkId = await db.works.add({
    projectId,
    worldId,
    title: '另一部作品',
    description: '',
    genres: ['drama'],
    status: 'drafting',
    targetWordCount: 10_000,
    createdAt: now,
    updatedAt: now + 1,
  }) as number
  await db.projects.update(projectId, {
    activeWorldId: worldId,
    activeWorkId,
    ownershipSchemaVersion: 1,
    worldCode: `ttrpg-bridge-${projectId}`,
    worldVersion: 1,
  })
  return { projectId, worldId, activeWorkId, otherWorkId }
}

function emptyState(): SimulationRuntimeState {
  return structuredClone(EMPTY_SIMULATION_STATE)
}

/** 生产路径：经 createWorldInstance 写入带 worldId/workId 绑定的会话行。 */
async function seedScopedTtrpgSession(scope: WorkspaceScope, title: string) {
  return createWorldInstance({
    scope,
    kind: 'ttrpg',
    title,
    draftSnapshotHash: `draft-hash:${scope.projectId}:${scope.worldId}:${scope.workId}`,
    canonSnapshot: { version: 2, sources: [] },
    initialState: emptyState(),
    worldGroupId: null,
  })
}

describe('R-PRODUCT-HUB · 产品 Hub 跑团路由的 workspaceScope 桥接', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(async () => {
    await db.delete()
    await db.open()
    useProjectStore.setState({ projects: [], currentProjectId: null, loading: false })
    useSimulationRuntimeStore.setState({
      projectId: null,
      worldGroupId: null,
      sessions: [],
      selectedSessionId: null,
      events: [],
      pendingProposals: [],
      checkpoints: [],
      runtimeState: structuredClone(EMPTY_SIMULATION_STATE),
      loading: false,
      error: '',
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    db.close()
  })

  /** 公共路由：挂载 Product Hub 并点击 TTRPG 导入页，等待 lazy 面板就绪。 */
  async function openProductHubTtrpgRoute() {
    await act(async () => {
      root.render(createElement(
        MemoryRouter,
        null,
        createElement(DialogProvider, null, createElement(ProductHubPage)),
      ))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    // 首页 resume 卡出现项目名 ⇒ loadProjects 完成、activeProject 就绪。
    await viWaitFor(() => expect(host.textContent).toContain(PROJECT_NAME))
    const tab = host.querySelector<HTMLButtonElement>('[data-testid="product-tab-ttrpg"]')
    expect(tab, 'Product Hub 导航缺少 product-tab-ttrpg').not.toBeNull()
    await act(async () => {
      tab!.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    // lazy(SimulationRuntimePanel) 挂载完成 ⇒ 新会话表单可见。
    await viWaitFor(() => expect(
      host.querySelector<HTMLInputElement>('input[placeholder="新会话名称"]'),
    ).not.toBeNull())
  }

  it('按活动 workspaceScope 区分会话：当前作品可见、其他作品隐藏、旧版无作用域兼容可见', async () => {
    const fx = await seedScopedWorkspace()
    await seedScopedTtrpgSession(
      { projectId: fx.projectId, worldId: fx.worldId, workId: fx.activeWorkId },
      ACTIVE_SESSION_TITLE,
    )
    await seedScopedTtrpgSession(
      { projectId: fx.projectId, worldId: fx.worldId, workId: fx.otherWorkId },
      OTHER_WORK_SESSION_TITLE,
    )
    // 有意兼容：旧版会话没有 worldId/workId，必须继续出现在作用域化页面。
    await createSimulationSession({
      projectId: fx.projectId,
      kind: 'ttrpg',
      title: LEGACY_SESSION_TITLE,
      initialState: emptyState(),
    })

    await openProductHubTtrpgRoute()

    // 数据层确实装入了全部 3 条同组会话（含其他作品）……
    expect(useSimulationRuntimeStore.getState().sessions).toHaveLength(3)
    // ……所以“另一作品不可见”只能由面板消费 workspaceScope 的过滤层造成。
    expect(host.textContent).toContain(ACTIVE_SESSION_TITLE)
    expect(host.textContent).toContain(LEGACY_SESSION_TITLE)
    expect(host.textContent).not.toContain(OTHER_WORK_SESSION_TITLE)

    // 会话列表按钮数量同样只有两条可见存档。
    const listTitles = Array.from(host.querySelectorAll('aside button div.truncate'))
      .map(node => node.textContent?.trim())
    expect(listTitles).toContain(ACTIVE_SESSION_TITLE)
    expect(listTitles).toContain(LEGACY_SESSION_TITLE)
    expect(listTitles).not.toContain(OTHER_WORK_SESSION_TITLE)
  })

  it('从公共跑团页新建会话继承活动 worldId/workId 并立即按作用域可见', async () => {
    const fx = await seedScopedWorkspace()
    await openProductHubTtrpgRoute()

    await act(async () => changeValue(
      host.querySelector<HTMLInputElement>('input[placeholder="新会话名称"]')!,
      '新建作用域战役',
    ))
    // worldGroupId 为空时 Canon 来源标签使用项目名（面板 scoped 候选列表）。
    const worldSource = await viWaitForValue(() =>
      host.querySelector<HTMLInputElement>(`input[aria-label="冻结 世界 ${PROJECT_NAME}"]`))
    await act(async () => {
      worldSource.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await clickWhenEnabled(host, '创建并冻结')
    await viWaitFor(() => expect(host.textContent).toContain('新建作用域战役'))

    const rows = await db.simulationSessions.where('projectId').equals(fx.projectId).toArray()
    const created = rows.find(row => row.title === '新建作用域战役')
    expect(created, '新建会话未持久化').not.toBeUndefined()
    expect(created!.kind).toBe('ttrpg')
    expect(created!.worldGroupId ?? null).toBeNull()
    // 只有 workspaceScope 从公共路由一路流入 store.createSession 才可能出现：
    expect(created!.worldId).toBe(fx.worldId)
    expect(created!.workId).toBe(fx.activeWorkId)
    // 新会话立即满足活动作用域过滤，出现在可见列表中。
    expect(useSimulationRuntimeStore.getState().sessions.some(row => row.id === created!.id)).toBe(true)
    expect(host.textContent).toContain('新建作用域战役')
  })
})

async function viWaitFor(assertion: () => void | Promise<void>) {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < 3_000) {
    try {
      await act(async () => {
        await assertion()
      })
      return
    } catch (error) {
      lastError = error
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
    }
  }
  throw lastError
}

async function viWaitForValue<T>(read: () => T | null): Promise<T> {
  let found: T | null = null
  await viWaitFor(() => {
    found = read()
    expect(found).not.toBeNull()
  })
  return found!
}
