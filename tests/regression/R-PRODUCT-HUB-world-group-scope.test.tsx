/**
 * R-PRODUCT-HUB · 世界组作用域边界（Deepwork Phase 2 · bounded remediation）
 *
 * Oracle：Product Hub 移除 WorldGroupOverview 后，多世界 WorldEngineWorkspace
 * 只能读到全局 world-group store 的 activeGroupId —— 它可能是 null（该路径不再有
 * 项目级 loadAll 调用点），或另一项目刚访问过的主组（陈旧跨项目泄漏），并会一路
 * 进入 WorldNarrativeReleasePanel 的实例创建。
 *
 * 本文件只通过公共 UI（MemoryRouter + 真实 Dexie fixture + 规范发布管线 fixture）
 * 证明修复后的行为：
 * 1. 先访问项目 A 的世界引擎（解析 A 主组并可从真实发布面板创建实例，
 *    实例持久化 A 的 worldGroupId）；
 * 2. 经公共子导航切换到项目 B：B 的世界引擎必须重新解析为 B 的主组
 *    （不是 null、不是 A 的组），且从 B 面板创建的实例持久化 B 的 worldGroupId；
 * 3. 从未初始化组的多世界项目进入世界引擎时，按最小初始化补建主世界组
 *    （ensurePrimaryGroup 路径；无迁移 UI、无批量盖章）。
 *
 * 证据边界：仅本文件 + src/pages/ProductHubPage.tsx 内的非视觉作用域桥；
 * 不修改其他生产代码、既有测试、locale 或文档。
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ProductHubPage from '../../src/pages/ProductHubPage'
import { DialogProvider } from '../../src/components/shared/Dialog'
import { db } from '../../src/lib/db/schema'
import { createStarterNarrativeModule } from '../../src/lib/narrative/blueprint'
import type { Project, SimulationSession, WorkspaceScope } from '../../src/lib/types'
import { ensureWorkspaceOwnership } from '../../src/lib/world-engine/ownership'
import {
  createWorldRevision,
  publishWorldRevision,
  worldReleaseSectionTables,
} from '../../src/lib/world-engine/releases'
import { useWorldGroupStore } from '../../src/stores/world-group'
import { useProjectStore } from '../../src/stores/project'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const PROJECT_A_NAME = '甲·世界组项目'
const PROJECT_B_NAME = '乙·世界组项目'
const FRESH_PROJECT_NAME = '丙·未初始化多世界项目'

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

/**
 * 规范多世界 fixture：项目（enableMultiWorld）→ ensureWorkspaceOwnership →
 * 用与被测修复相同的规范 API 建立主世界组 → 冻结并发布一个可执行 WorldRelease，
 * 让世界引擎发布面板处于可直接“创建实例”的就绪状态。
 */
async function seedMultiWorldProject(name: string): Promise<{
  projectId: number
  scope: WorkspaceScope
  groupId: number
}> {
  const now = Date.now()
  const projectId = await db.projects.add({
    name,
    genre: 'fantasy',
    genres: ['fantasy'],
    status: 'drafting',
    description: '',
    targetWordCount: 100_000,
    enableMultiWorld: true,
    createdAt: now,
    updatedAt: now,
  } as Project) as number
  const ownership = await ensureWorkspaceOwnership(projectId)
  const groupId = await useWorldGroupStore.getState().ensurePrimaryGroup(ownership.scope)
  const module = await createStarterNarrativeModule({
    scope: ownership.scope,
    owner: 'work',
    kind: 'main',
    title: `${name}·主线`,
  })
  const sections = ['foundation', 'characters', 'narrative', 'outline'] as const
  const revision = await createWorldRevision({
    scope: ownership.scope,
    label: `${name}·修订1`,
    selectedTables: sections.flatMap(worldReleaseSectionTables),
    selectedNarrativeModuleIds: [module.id!],
  })
  await publishWorldRevision(revision.id!)
  return { projectId, scope: ownership.scope, groupId }
}

describe('R-PRODUCT-HUB · 世界引擎的世界组作用域边界', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(async () => {
    await db.delete()
    await db.open()
    useProjectStore.setState({ projects: [], currentProjectId: null, loading: false })
    useWorldGroupStore.setState({ groups: [], links: [], activeGroupId: null, loading: false })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    // 让卸载前已在途的异步读取先落地，避免 db.close() 制造未处理拒绝。
    await new Promise(resolve => setTimeout(resolve, 0))
    db.close()
  })

  async function renderProductHub() {
    await act(async () => {
      root.render(createElement(
        MemoryRouter,
        null,
        createElement(DialogProvider, null, createElement(ProductHubPage)),
      ))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
  }

  async function openWorldEngineTab(expectedProjectName: string) {
    await viWaitFor(() => expect(host.textContent).toContain(expectedProjectName))
    const tab = host.querySelector<HTMLButtonElement>('[data-testid="product-tab-worlds"]')
    expect(tab, 'Product Hub 导航缺少 product-tab-worlds').not.toBeNull()
    await act(async () => {
      tab!.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
  }

  /** 门开条件：工作台已渲染，且全局活动组恰为期望的主组（非 null / 非他项目）。 */
  async function waitForEngineResolved(groupId: number) {
    await viWaitFor(() => {
      expect(host.querySelector('#world-engine-editor .sf-world-engine-workspace')).not.toBeNull()
      expect(useWorldGroupStore.getState().activeGroupId).toBe(groupId)
    })
  }

  it('先访 A 再切 B：B 的世界引擎解析 B 主组，B 实例持久化 B 的 worldGroupId', async () => {
    const a = await seedMultiWorldProject(PROJECT_A_NAME)
    const b = await seedMultiWorldProject(PROJECT_B_NAME)
    // A 的 updatedAt 最大 ⇒ Product Hub 默认选中 A（loadProjects 按 updatedAt 倒序）。
    await db.projects.update(a.projectId, { updatedAt: Date.now() + 60_000 })

    await renderProductHub()
    await openWorldEngineTab(PROJECT_A_NAME)

    // 项目 A：门打开 ⇒ 全局活动组已解析为 A 的主组。
    await waitForEngineResolved(a.groupId)

    // 从 A 的真实发布面板创建独立实例。
    await clickWhenEnabled(host, '创建实例')
    let sessionsA: SimulationSession[] = []
    await viWaitFor(async () => {
      sessionsA = await db.simulationSessions.where('projectId').equals(a.projectId).toArray()
      expect(sessionsA).toHaveLength(1)
    })
    expect(sessionsA[0].kind).toBe('ttrpg')
    expect(sessionsA[0].worldGroupId).toBe(a.groupId)

    // 公共子导航切换到项目 B。
    await act(async () => {
      const target = Array.from(host.querySelectorAll<HTMLButtonElement>('.sf-subnav button'))
        .find(candidate => candidate.textContent?.includes(PROJECT_B_NAME))
      expect(target, '世界引擎子导航缺少项目 B').not.toBeUndefined()
      target!.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    // B 必须重新解析为 B 自己的主组：不是 null，也不是 A 的陈旧组。
    await waitForEngineResolved(b.groupId)
    expect(useWorldGroupStore.getState().activeGroupId).not.toBe(a.groupId)

    // 从 B 的真实发布面板创建独立实例：必须持久化 B 的 worldGroupId。
    await clickWhenEnabled(host, '创建实例')
    let sessionsB: SimulationSession[] = []
    await viWaitFor(async () => {
      sessionsB = await db.simulationSessions.where('projectId').equals(b.projectId).toArray()
      expect(sessionsB).toHaveLength(1)
    })
    expect(sessionsB[0].kind).toBe('ttrpg')
    expect(sessionsB[0].worldGroupId).toBe(b.groupId)
    expect(sessionsB[0].worldGroupId).not.toBe(a.groupId)
    expect(sessionsB[0].worldGroupId).not.toBeNull()

    // 全局不变量：两个实例各归其主，没有 null、没有跨项目组。
    const all = await db.simulationSessions.toArray()
    expect(all).toHaveLength(2)
    expect(new Set(all.map(row => row.worldGroupId))).toEqual(new Set([a.groupId, b.groupId]))
  })

  it('从未初始化的多世界项目进入世界引擎时补建主世界组并解析为活动组', async () => {
    const now = Date.now()
    const projectId = await db.projects.add({
      name: FRESH_PROJECT_NAME,
      genre: 'fantasy',
      genres: ['fantasy'],
      status: 'drafting',
      description: '',
      targetWordCount: 100_000,
      enableMultiWorld: true,
      createdAt: now,
      updatedAt: now,
    } as Project) as number
    await ensureWorkspaceOwnership(projectId)
    expect(await db.worldGroups.where('projectId').equals(projectId).toArray()).toHaveLength(0)

    await renderProductHub()
    await openWorldEngineTab(FRESH_PROJECT_NAME)

    // 最小初始化路径：门打开时活动组必须已存在、属于本项目且已解析。
    await viWaitFor(() => {
      expect(host.querySelector('#world-engine-editor .sf-world-engine-workspace')).not.toBeNull()
      const state = useWorldGroupStore.getState()
      expect(state.activeGroupId).not.toBeNull()
      expect(state.groups.some(group => group.id === state.activeGroupId
        && group.projectId === projectId)).toBe(true)
    })
    const groups = await db.worldGroups.where('projectId').equals(projectId).toArray()
    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe('primary')
    expect(useWorldGroupStore.getState().activeGroupId).toBe(groups[0].id)
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
