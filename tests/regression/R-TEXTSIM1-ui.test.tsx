import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import NarrativeSimulationPlayer from '../../src/components/text-game/NarrativeSimulationPlayer'
import NarrativeSimulationWorkbench from '../../src/components/text-game/NarrativeSimulationWorkbench'
import { DialogProvider } from '../../src/components/shared/Dialog'
import { publishNarrativeSimulationGame, seedNarrativeSimulationAcceptanceGame } from '../../src/lib/narrative-simulation/authoring'
import { db } from '../../src/lib/db/schema'
import { readSimulationState } from '../../src/lib/simulation/runtime'
import { EMPTY_SIMULATION_STATE, type Project, type WorkspaceScope } from '../../src/lib/types'
import { ensureWorkspaceOwnership } from '../../src/lib/world-engine/ownership'
import { useNarrativeSimulationPlayerStore } from '../../src/stores/narrative-simulation-player'
import i18n from '../../src/i18n'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function button(host: ParentNode, text: string): HTMLButtonElement {
  const result = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.includes(text))
  if (!result) throw new Error(`找不到按钮:${text}`)
  return result
}
async function click(host: ParentNode, text: string) {
  await act(async () => { button(host, text).click(); await new Promise(resolve => setTimeout(resolve, 0)) })
}
async function waitFor(assertion: () => void | Promise<void>) {
  const started = Date.now(); let last: unknown
  while (Date.now() - started < 12_000) {
    try { await act(async () => { await assertion() }); return }
    catch (reason) { last = reason; await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) }) }
  }
  throw last
}
/** 受控 textarea 需要原生 setter 才能触发 React onChange。 */
async function setEditorValue(host: ParentNode, value: string) {
  const textarea = host.querySelector('.storygame-json-editor textarea') as HTMLTextAreaElement | null
  if (!textarea) throw new Error('找不到规则 JSON 编辑器')
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  await act(async () => {
    setValue.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}
async function fixture(name: string): Promise<{ project: Project; scope: WorkspaceScope }> {
  const now = Date.now()
  const projectId = await db.projects.add({
    name, genre: 'simulation', genres: ['simulation'], status: 'drafting', description: '',
    targetWordCount: 20_000, createdAt: now, updatedAt: now,
  } as any) as number
  const owned = await ensureWorkspaceOwnership(projectId)
  return { project: owned.project, scope: owned.scope }
}

describe('TEXTSIM-1 · author and player UI', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  beforeAll(async () => { await db.delete(); await db.open() })
  beforeEach(() => {
    localStorage.clear()
    useNarrativeSimulationPlayerStore.setState({
      scope: null, worldGroupId: null, releases: [], sessions: [], selectedSessionId: null,
      events: [], checkpoints: [], runtimeState: structuredClone(EMPTY_SIMULATION_STATE),
      selectedManifest: null, generatedCandidate: null, loading: false, busy: false, error: '',
    })
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  })
  afterEach(async () => { await act(async () => root.unmount()); host.remove() })
  afterAll(() => db.close())

  it('作者创建验收模拟、运行 100 回合批量预览、诊断并发布', async () => {
    const owned = await fixture('TEXTSIM 作者 UI')
    await act(async () => {
      root.render(createElement(DialogProvider, null, createElement(NarrativeSimulationWorkbench, { scope: owned.scope })))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(host.textContent).toContain('创建第一份封闭系统模拟'))
    await click(host, '创建验收模拟')
    await waitFor(() => expect(host.textContent).toContain('十二街区治理录'))
    expect(host.textContent).toContain('6资源 / 指标')
    expect(host.textContent).toContain('10行动 / 政策')
    await click(host, '批量模拟')
    await click(host, '运行固定种子')
    await waitFor(() => expect(host.textContent).toContain('可复现平衡证据'))
    expect(host.textContent).toContain('规则结局')
    await click(host, '发布检查')
    await click(host, '运行校验')
    await waitFor(() => expect(host.textContent).toContain('所有发布闸门通过'))
    await click(host, '发布版本')
    await click(host, '校验并发布')
    await waitFor(() => expect(host.textContent).toContain('已冻结 GameRelease v1'))
    expect(await db.narrativeSimulationModules.count()).toBe(1)
    expect(await db.gameReleases.count()).toBe(1)
  }, 30_000)

  it('玩家完全离线结算回合、查看报告、自动检查点并进入规则结局', async () => {
    const owned = await fixture('TEXTSIM 玩家 UI')
    const definition = await seedNarrativeSimulationAcceptanceGame({ scope: owned.scope })
    await publishNarrativeSimulationGame({ scope: owned.scope, gameDefinitionId: definition.id! })
    await act(async () => {
      root.render(createElement(DialogProvider, null, createElement(NarrativeSimulationPlayer, {
        project: owned.project, scope: owned.scope, worldGroupId: null,
      })))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(host.textContent).toContain('十二街区治理录'))
    await click(host, '新建模拟')
    await waitFor(() => expect(host.textContent).toContain('第 1 / 30 回合'))
    expect(host.textContent).toContain('修缮住房')
    for (let index = 0; index < 30; index += 1) {
      if (useNarrativeSimulationPlayerStore.getState().runtimeState.narrativeSimulation?.phase === 'ended') break
      await click(host, '结算回合')
      await waitFor(() => expect(useNarrativeSimulationPlayerStore.getState().busy).toBe(false))
    }
    await waitFor(() => expect(host.textContent).toContain('模拟已确定结局'))
    expect(host.textContent).toContain('玩家可见报告')
    expect(useNarrativeSimulationPlayerStore.getState().checkpoints.length).toBeGreaterThan(0)
    const endingButton = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.includes('进入结局'))
    expect(endingButton).toBeTruthy()
    await act(async () => { endingButton!.click(); await new Promise(resolve => setTimeout(resolve, 0)) })
    await waitFor(() => expect(host.textContent).toContain('本局已完成'))
    const sessionId = useNarrativeSimulationPlayerStore.getState().selectedSessionId!
    const state = await readSimulationState(sessionId)
    expect(state.narrative?.completed).toBe(true)
    expect(state.narrativeSimulation?.phase).toBe('ended')
    await click(host, '退出游戏')
    await waitFor(() => expect(useNarrativeSimulationPlayerStore.getState().selectedSessionId).toBeNull())
    expect(host.textContent).toContain('选择正式发布开始模拟')
  }, 60_000)

  it('界面标签由 simulation 命名空间 locale 驱动（en / pt-BR / zh-CN）', async () => {
    const owned = await fixture('TEXTSIM locale UI')
    const definition = await seedNarrativeSimulationAcceptanceGame({ scope: owned.scope })
    await publishNarrativeSimulationGame({ scope: owned.scope, gameDefinitionId: definition.id! })
    await act(async () => {
      root.render(createElement(DialogProvider, null, createElement(NarrativeSimulationWorkbench, { scope: owned.scope })))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(host.textContent).toContain('叙事模拟定义与规模'))
    try {
      await act(async () => { await i18n.changeLanguage('en'); await new Promise(resolve => setTimeout(resolve, 0)) })
      expect(host.textContent).toContain('Simulation definition & scale')
      expect(host.textContent).toContain('Create acceptance simulation')
      await act(async () => { await i18n.changeLanguage('pt-BR'); await new Promise(resolve => setTimeout(resolve, 0)) })
      expect(host.textContent).toContain('Definição e escala da simulação')
      // 图标-only 刷新按钮必须带本地化 aria-label（与 title 同键）。
      expect(host.querySelector('button[title="Atualizar"][aria-label="Atualizar"]')).toBeTruthy()
      await act(async () => root.unmount())
      host = document.createElement('div'); document.body.append(host); root = createRoot(host)
      await act(async () => {
        root.render(createElement(DialogProvider, null, createElement(NarrativeSimulationPlayer, {
          project: owned.project, scope: owned.scope, worldGroupId: null,
        })))
        await new Promise(resolve => setTimeout(resolve, 0))
      })
      await waitFor(() => expect(host.textContent).toContain('Publicações de simulação narrativa'))
      await waitFor(() => expect(host.textContent).toContain('Nova simulação'))
      await waitFor(() => expect(host.textContent).toContain('v1 · 30 turnos · 4 finais'))
      await click(host, 'Nova simulação')
      await waitFor(() => expect(host.textContent).toContain('Turno 1 / 30 · Planejamento'))
      // 图标-only 分支按钮必须带本地化 aria-label。
      expect(host.querySelector('button[aria-label="Criar um ramo a partir do estado atual"]')).toBeTruthy()
      expect(host.textContent).toContain('Pressão')
      expect(host.textContent).toContain('Problema')
      expect(host.textContent).toContain('Crise')
      expect(host.textContent).toContain('Em evolução')
    } finally {
      await act(async () => { await i18n.changeLanguage('zh-CN'); await new Promise(resolve => setTimeout(resolve, 0)) })
    }
    expect(host.textContent).toContain('叙事模拟发布')
  }, 30_000)

  it('失败与校验路径只呈现 locale 驱动的通用文案与结构化诊断（en / pt-BR）', async () => {
    const owned = await fixture('TEXTSIM locale error UI')
    await act(async () => {
      root.render(createElement(DialogProvider, null, createElement(NarrativeSimulationWorkbench, { scope: owned.scope })))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(host.textContent).toContain('创建第一份封闭系统模拟'))
    await click(host, '创建验收模拟')
    await waitFor(() => expect(host.textContent).toContain('十二街区治理录'))
    try {
      await act(async () => { await i18n.changeLanguage('en'); await new Promise(resolve => setTimeout(resolve, 0)) })
      await click(host, 'Rules JSON')
      const editor = () => host.querySelector('.storygame-json-editor textarea') as HTMLTextAreaElement
      expect(editor()).toBeTruthy()
      const validContent = editor().value
      // 解析失败：只显示通用本地化文案，不渲染解析器异常文本。
      await setEditorValue(host, '{ "broken": ')
      await waitFor(() => expect(host.textContent).toContain('Invalid content'))
      expect(host.textContent).not.toContain('内容不是合法 JSON')
      // 结构性重复 key：实时校验显示计数摘要，而不是拼接原始错误数组。
      const mutated = JSON.parse(validContent)
      mutated.resources.push(structuredClone(mutated.resources[0]))
      const duplicateKey = `resource:${mutated.resources[0].key}`
      await setEditorValue(host, JSON.stringify(mutated))
      await waitFor(() => expect(host.textContent).toContain('1 live validation issues'))
      // 保存后运行发布校验：诊断列表完全由结构化字段 + locale 键构成。
      await click(host, 'Validate & save')
      await waitFor(() => expect(host.textContent).toContain('Simulation definition and rules content saved.'))
      await click(host, 'Release checks')
      await click(host, 'Run validation')
      await waitFor(() => expect(host.textContent).toContain('Blocking issues remain.'))
      expect(host.textContent).toContain('1 errors · 0 warnings')
      expect(host.textContent).toContain(`Duplicate key: ${duplicateKey}`)
      expect(host.textContent).not.toContain('稳定 key 重复')
      expect(host.textContent).not.toContain('引用缺失')
      // pt-BR 同样由 locale 驱动，且不残留 en 文案或引擎语言原始错误。
      await act(async () => { await i18n.changeLanguage('pt-BR'); await new Promise(resolve => setTimeout(resolve, 0)) })
      await waitFor(() => expect(host.textContent).toContain('Ainda existem problemas bloqueadores.'))
      expect(host.textContent).toContain('1 erros · 0 avisos')
      expect(host.textContent).toContain(`Chave duplicada: ${duplicateKey}`)
    } finally {
      await act(async () => { await i18n.changeLanguage('zh-CN'); await new Promise(resolve => setTimeout(resolve, 0)) })
    }
  }, 30_000)

  it('发布校验诊断渲染问题阶段覆盖与空分区等结构化字段（en / pt-BR）', async () => {
    const owned = await fixture('TEXTSIM structured diagnostics')
    await act(async () => {
      root.render(createElement(DialogProvider, null, createElement(NarrativeSimulationWorkbench, { scope: owned.scope })))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(host.textContent).toContain('创建第一份封闭系统模拟'))
    await click(host, '创建验收模拟')
    await waitFor(() => expect(host.textContent).toContain('十二街区治理录'))
    try {
      await act(async () => { await i18n.changeLanguage('en'); await new Promise(resolve => setTimeout(resolve, 0)) })
      await click(host, 'Rules JSON')
      const editor = () => host.querySelector('.storygame-json-editor textarea') as HTMLTextAreaElement
      expect(editor()).toBeTruthy()
      // 构造两条结构化 blocker：空分区（themes）+ 问题阶段未从最小压力起步。
      const mutated = JSON.parse(editor().value)
      mutated.themes = []
      mutated.issues[0].minimumPressure -= 1
      await setEditorValue(host, JSON.stringify(mutated))
      await click(host, 'Validate & save')
      await waitFor(() => expect(host.textContent).toContain('Simulation definition and rules content saved.'))
      await click(host, 'Release checks')
      await click(host, 'Run validation')
      await waitFor(() => expect(host.textContent).toContain('Blocking issues remain.'))
      expect(host.textContent).toContain('Required simulation section is empty: themes')
      expect(host.textContent).toContain(`Issue stages do not start at the minimum pressure: ${mutated.issues[0].key}`)
      // 引擎语言原始错误不得进入 UI。
      expect(host.textContent).not.toContain('至少需要一套题材映射')
      expect(host.textContent).not.toContain('问题阶段未覆盖最小压力')
      // pt-BR 同样完全由 locale 键驱动。
      await act(async () => { await i18n.changeLanguage('pt-BR'); await new Promise(resolve => setTimeout(resolve, 0)) })
      await waitFor(() => expect(host.textContent).toContain('Seção obrigatória da simulação vazia: themes'))
      expect(host.textContent).toContain(`Os estágios do problema não começam na pressão mínima: ${mutated.issues[0].key}`)
      expect(host.textContent).not.toContain('Required simulation section is empty')
    } finally {
      await act(async () => { await i18n.changeLanguage('zh-CN'); await new Promise(resolve => setTimeout(resolve, 0)) })
    }
  }, 30_000)

  it('玩家界面不渲染 store / release 条目原始错误，仅显示本地化通用文案并输出控制台', async () => {
    const owned = await fixture('TEXTSIM 玩家原始错误防护')
    await act(async () => {
      root.render(createElement(DialogProvider, null, createElement(NarrativeSimulationPlayer, {
        project: owned.project, scope: owned.scope, worldGroupId: null,
      })))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    // 等真实 load 结束（空项目 → 空 releases），再注入 store 级错误，避免被覆盖。
    await waitFor(() => expect(useNarrativeSimulationPlayerStore.getState().loading).toBe(false))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await act(async () => useNarrativeSimulationPlayerStore.setState({
        error: '[engine] raw-store-failure 引擎原始存储错误',
        releases: [{
          release: { id: 9001, version: 1, label: 'raw-label' },
          manifest: null,
          error: '[engine] raw-manifest-failure 引擎原始清单错误',
        }],
      } as any))
      // alert 只显示 locale 驱动的通用文案；localError 为空时回退到 store 错误的本地化投影。
      await waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain('操作失败'))
      // release 条目卡片同样只显示本地化通用文案。
      expect(host.textContent).toContain('该发布当前不可用。')
      // 原始引擎文本不得进入 UI。
      expect(host.textContent).not.toContain('raw-store-failure')
      expect(host.textContent).not.toContain('raw-manifest-failure')
      // 原始细节保留在开发者控制台，且带稳定组件前缀。
      expect(errorSpy.mock.calls.some(call => String(call[0]).startsWith('[narrative-simulation]'))).toBe(true)
    } finally {
      errorSpy.mockRestore()
    }
  }, 30_000)

  it('发布校验诊断渲染 Narrative 死路 / 不可达节点与残余问题计数，不泄漏引擎原文', async () => {
    const owned = await fixture('TEXTSIM narrative graph diagnostics')
    const definition = await seedNarrativeSimulationAcceptanceGame({ scope: owned.scope })
    // 注入一个无出口且不可达的 scene 节点：同时命中 deadEndNodeKeys、
    // unreachableNodeKeys 与一条无结构化表示的原始 narrative.errors。
    const nodes = await db.narrativeNodes.where('moduleId').equals(definition.narrativeModuleId).toArray()
    const template = nodes[0]!
    await db.narrativeNodes.add({
      ...structuredClone(template), id: undefined, key: 'diag-dead-end', kind: 'scene',
      title: '诊断死路', summary: '', successorKeysJson: '[]', order: 999,
    } as any)
    await act(async () => {
      root.render(createElement(DialogProvider, null, createElement(NarrativeSimulationWorkbench, { scope: owned.scope })))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(host.textContent).toContain('叙事模拟定义与规模'))
    await click(host, '发布检查')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await click(host, '运行校验')
      await waitFor(() => expect(host.textContent).toContain('Narrative 死路节点（非结局且无出口）：diag-dead-end'))
      expect(host.textContent).toContain('Narrative 不可达节点：diag-dead-end')
      expect(host.textContent).toContain('另有 1 条 Narrative 校验问题')
      // 引擎语言原始错误字符串不得进入 UI；原始细节只进控制台（稳定前缀）。
      expect(host.textContent).not.toContain('[storygame]')
      expect(host.textContent).not.toContain('非结局死路')
      expect(warnSpy.mock.calls.some(call => String(call[0]) === '[narrative-simulation] unstructured narrative graph errors')).toBe(true)
      // en 由同一组结构化字段 + locale 键驱动。
      await act(async () => { await i18n.changeLanguage('en'); await new Promise(resolve => setTimeout(resolve, 0)) })
      expect(host.textContent).toContain('Narrative dead-end node (non-ending without exits): diag-dead-end')
      expect(host.textContent).toContain('Narrative unreachable node: diag-dead-end')
      expect(host.textContent).toContain('1 additional narrative validation issues')
      expect(host.textContent).not.toContain('[storygame]')
    } finally {
      warnSpy.mockRestore()
      await act(async () => { await i18n.changeLanguage('zh-CN'); await new Promise(resolve => setTimeout(resolve, 0)) })
    }
  }, 30_000)
})
