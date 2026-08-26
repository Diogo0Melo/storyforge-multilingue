import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SimulationRuntimePanel, {
  ENCOUNTER_END_REASON_AUTHOR,
  formatEventSummary,
  MANUAL_RESOURCE_ADJUSTMENT_REASON,
  NPC_REJECTION_REASON_AUTHOR,
} from '../../src/components/simulation/SimulationRuntimePanel'
import { DialogProvider } from '../../src/components/shared/Dialog'
import { db } from '../../src/lib/db/schema'
import { loadSimulationCanonCandidates } from '../../src/lib/simulation/canon-snapshot'
import { EMPTY_SIMULATION_STATE, type Project } from '../../src/lib/types'
import { useSimulationRuntimeStore } from '../../src/stores/simulation-runtime'
import { createAISessionKey, useAIGenerationSessionStore } from '../../src/stores/ai-generation-session'
import { appendNpcEvolutionProposal, createSimulationSession, readSimulationState } from '../../src/lib/simulation/runtime'
import i18n from '../../src/i18n'

// Default implementation delegates to the real module; individual tests may
// stub loadSimulationCanonCandidates once (mockClear restores delegation).
vi.mock('../../src/lib/simulation/canon-snapshot', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/lib/simulation/canon-snapshot')>()
  return {
    ...actual,
    loadSimulationCanonCandidates: vi.fn(actual.loadSimulationCanonCandidates),
  }
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true

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

/** 点击侧栏会话行（行文本包含标题 + 类型/状态标签，因此按包含匹配）。 */
async function clickSessionRow(host: HTMLElement, title: string) {
  await viWaitFor(() => {
    const row = Array.from(host.querySelectorAll('aside button'))
      .find(item => item.textContent?.includes(title))
    expect(row).toBeTruthy()
  })
  const row = Array.from(host.querySelectorAll<HTMLButtonElement>('aside button'))
    .find(item => item.textContent?.includes(title))
  if (!row) throw new Error(`找不到会话行: ${title}`)
  await act(async () => {
    row.click()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function clickWhenEnabled(host: HTMLElement, text: string) {
  const target = button(host, text)
  await viWaitFor(() => expect(target.disabled).toBe(false))
  await act(async () => {
    target.click()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

describe('SIM-1B · 互动运行时 UI', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let project: Project

  beforeEach(async () => {
    await db.delete()
    await db.open()
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
    // Dexie 自增主键在 db.delete() 后会重置；共享 AI 会话状态必须一并清空，
    // 避免上一个用例注入的流错误泄漏到后续用例的同键会话。
    useAIGenerationSessionStore.setState({ sessions: {} })
    const now = Date.now()
    const projectId = await db.projects.add({
      name: '互动运行时 UI',
      genre: '',
      genres: [],
      status: 'drafting',
      description: '',
      targetWordCount: 0,
      enableMultiWorld: false,
      createdAt: now,
      updatedAt: now,
    } as Project) as number
    project = (await db.projects.get(projectId))!
    await db.characters.add({
      projectId,
      homeWorldGroupId: null,
      name: '林舟',
      role: 'protagonist',
      roleWeight: 'main',
      moralAxis: 'neutral',
      orderAxis: 'neutral',
      alignment: 'good',
      shortDescription: '潮汐旅人',
      appearance: '',
      personality: '',
      background: '',
      motivation: '',
      abilities: '',
      relationships: '',
      arc: '',
      createdAt: now,
      updatedAt: now,
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

  it('从可见入口创建会话、追加事件、保存检查点、建立分支并安全删除', async () => {
    await act(async () => {
      root.render(createElement(
        DialogProvider,
        null,
        createElement(SimulationRuntimePanel, { project, worldGroupId: null }),
      ))
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    const title = host.querySelector<HTMLInputElement>('input[placeholder="新会话名称"]')!
    await act(async () => changeValue(title, '雾港跑团'))
    await viWaitFor(() => expect(
      host.querySelector<HTMLInputElement>('input[aria-label="冻结 角色 林舟"]'),
    ).not.toBeNull())
    await act(async () => {
      host.querySelector<HTMLInputElement>('input[aria-label="冻结 世界 互动运行时 UI"]')!.click()
      host.querySelector<HTMLInputElement>('input[aria-label="冻结 角色 林舟"]')!.click()
    })
    await clickWhenEnabled(host, '创建并冻结')
    await viWaitFor(() => expect(host.textContent).toContain('雾港跑团'))
    expect(await db.simulationSessions.count()).toBe(1)
    expect(host.textContent).toContain('Canon 冻结审计')
    expect(host.textContent).toContain('运行时实体')
    expect(host.textContent).toContain('林舟')

    const time = host.querySelector<HTMLInputElement>('input[aria-label="推进时间"]')!
    await act(async () => changeValue(time, '3'))
    await clickWhenEnabled(host, '推进时间')
    await viWaitFor(() => expect(host.textContent).toContain('时间 +3'))

    const narrative = host.querySelector<HTMLTextAreaElement>('textarea')!
    await act(async () => changeValue(narrative, '守门人交出了潮汐密钥。'))
    await clickWhenEnabled(host, '追加叙事事件')
    await viWaitFor(() => expect(host.textContent).toContain('守门人交出了潮汐密钥。'))

    const checkpoint = host.querySelector<HTMLInputElement>('input[placeholder="检查点名称"]')!
    await act(async () => changeValue(checkpoint, '进入钟楼前'))
    await clickWhenEnabled(host, '保存')
    await viWaitFor(() => expect(host.textContent).toContain('进入钟楼前'))

    const branch = host.querySelector<HTMLInputElement>('input[placeholder="新分支名称"]')!
    await act(async () => changeValue(branch, '拒绝密钥分支'))
    await clickWhenEnabled(host, '分支')
    await viWaitFor(() => expect(db.simulationSessions.count()).resolves.toBe(2))
    const child = (await db.simulationSessions.toArray())
      .find(session => session.title === '拒绝密钥分支')
    expect(child).toMatchObject({ parentThroughSequence: 2 })
    expect(child?.parentSessionId).toBeTypeOf('number')

    await viWaitFor(() => expect(host.querySelector(
      'button[aria-label="删除会话 拒绝密钥分支"]',
    )).not.toBeNull())
    const remove = host.querySelector<HTMLButtonElement>(
      'button[aria-label="删除会话 拒绝密钥分支"]',
    )!
    await act(async () => remove.click())
    await viWaitFor(() => expect(host.textContent).toContain('删除互动会话“拒绝密钥分支”？'))
    await act(async () => {
      button(host, '删除').click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await viWaitFor(() => expect(db.simulationSessions.count()).resolves.toBe(1))
    expect(await db.simulationEvents.count()).toBe(2)
  })

  it('NPC 演进候选刷新后仍可从面板确认并应用', async () => {
    const session = await createSimulationSession({
      projectId: project.id!,
      kind: 'npc-evolution',
      title: 'NPC 演进线',
      initialState: {
        ...structuredClone(EMPTY_SIMULATION_STATE),
        entities: {
          'npc:gatekeeper': {
            entityKey: 'npc:gatekeeper',
            kind: 'npc',
            sourceId: null,
            name: '守门人',
            locationKey: null,
            lifecycleStatus: 'active',
            attributes: { role: 'npc', mood: '平静' },
          },
        },
      },
    })
    await appendNpcEvolutionProposal({
      sessionId: session.id!,
      candidate: {
        baseSequence: 0,
        entityKey: 'npc:gatekeeper',
        locationKey: null,
        lifecycleStatus: 'active',
        attributes: { mood: '警惕' },
        narrative: '守门人开始留意城外动静。',
        memory: null,
        rationale: '作者确认后的运行时状态变化。',
      },
    })

    await act(async () => {
      root.render(createElement(
        DialogProvider,
        null,
        createElement(SimulationRuntimePanel, { project, worldGroupId: null }),
      ))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await viWaitFor(() => expect(host.textContent).toContain('NPC 演进候选'))
    await viWaitFor(() => expect(host.textContent).toContain('守门人开始留意城外动静。'))
    await clickWhenEnabled(host, '确认并应用')
    await viWaitFor(() => expect((readSimulationState(session.id!)).then(state => state.lastSequence)).resolves.toBe(2))
    expect((await readSimulationState(session.id!)).entities['npc:gatekeeper'].attributes.mood).toBe('警惕')
    expect(host.textContent).toContain('暂无待确认候选')
  })

  it('跑团会话可从可见入口开始场景并执行确定性技能检定', async () => {
    const session = await createSimulationSession({
      projectId: project.id!,
      kind: 'ttrpg',
      title: '钟楼战役',
      seed: 'ui-ttrpg',
      initialState: {
        ...structuredClone(EMPTY_SIMULATION_STATE),
        entities: {
          'character:linzhou': {
            entityKey: 'character:linzhou',
            kind: 'character',
            sourceId: 1,
            name: '林舟',
            locationKey: null,
            lifecycleStatus: 'active',
            attributes: { role: 'player' },
          },
        },
      },
    })
    await act(async () => {
      root.render(createElement(
        DialogProvider,
        null,
        createElement(SimulationRuntimePanel, { project, worldGroupId: null }),
      ))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await viWaitFor(() => expect(host.textContent).toContain('单机战役主持'))
    await act(async () => {
      changeValue(host.querySelector<HTMLInputElement>('input[aria-label="跑团场景标题"]')!, '钟楼门厅')
      changeValue(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="跑团场景描述"]')!, '潮声从墙后传来。')
      changeValue(host.querySelector<HTMLInputElement>('input[aria-label="跑团回合顺序"]')!, 'character:linzhou')
    })
    await clickWhenEnabled(host, '开始场景')
    await viWaitFor(() => expect(host.textContent).toContain('第 1 回合'))
    expect((await readSimulationState(session.id!)).ttrpg).toMatchObject({
      activeActorKey: 'character:linzhou',
      turnOrder: ['character:linzhou'],
    })
    await act(async () => {
      changeValue(host.querySelector<HTMLInputElement>('input[aria-label="跑团检定技能"]')!, '感知')
      changeValue(host.querySelector<HTMLInputElement>('input[aria-label="跑团检定难度"]')!, '10')
    })
    await clickWhenEnabled(host, '技能检定')
    await viWaitFor(() => expect((readSimulationState(session.id!)).then(state => state.ttrpg?.checks.length)).resolves.toBe(1))
    expect(host.textContent).toContain('检定：感知')
  })

  it('跑团面板可创建战斗遭遇并执行攻击、资源与状态操作', async () => {
    const session = await createSimulationSession({
      projectId: project.id!,
      kind: 'ttrpg',
      title: '战斗遭遇 UI',
      seed: 'ui-ttrpg-1b',
      initialState: {
        ...structuredClone(EMPTY_SIMULATION_STATE),
        entities: {
          'character:linzhou': {
            entityKey: 'character:linzhou', kind: 'character', sourceId: 1, name: '林舟', locationKey: null,
            lifecycleStatus: 'active', attributes: { role: 'player', hp: 20, maxHp: 20, armorClass: 12, initiative: 20 },
          },
          'npc:watcher': {
            entityKey: 'npc:watcher', kind: 'npc', sourceId: null, name: '守望者', locationKey: null,
            lifecycleStatus: 'active', attributes: { role: 'npc', hp: 10, maxHp: 10, armorClass: 10, initiative: 10 },
          },
        },
      },
    })
    await act(async () => {
      root.render(createElement(
        DialogProvider,
        null,
        createElement(SimulationRuntimePanel, { project, worldGroupId: null }),
      ))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await viWaitFor(() => expect(useSimulationRuntimeStore.getState().selectedSessionId).toBe(session.id))
    await viWaitFor(() => expect(host.textContent).toContain('战斗遭遇与规则'))
    await act(async () => {
      changeValue(host.querySelector<HTMLInputElement>('input[aria-label="跑团场景标题"]')!, '战斗场景')
      changeValue(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="跑团场景描述"]')!, '战斗即将开始。')
      changeValue(host.querySelector<HTMLInputElement>('input[aria-label="跑团回合顺序"]')!, 'character:linzhou,npc:watcher')
    })
    await clickWhenEnabled(host, '开始场景')
    await act(async () => {
      changeValue(host.querySelector<HTMLInputElement>('input[aria-label="跑团遭遇标题"]')!, '门厅伏击')
      changeValue(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="跑团遭遇描述"]')!, '击退守望者。')
    })
    await clickWhenEnabled(host, '直接开始遭遇')
    await viWaitFor(() => expect((readSimulationState(session.id!)).then(state => state.ttrpg?.encounter?.title)).resolves.toBe('门厅伏击'))
    await act(async () => {
      changeValue(host.querySelector<HTMLInputElement>('input[aria-label="攻击骰式"]')!, '1d20+100')
      changeValue(host.querySelector<HTMLInputElement>('input[aria-label="伤害骰式"]')!, '1d4')
    })
    await clickWhenEnabled(host, '执行攻击')
    await viWaitFor(() => expect((readSimulationState(session.id!)).then(state => state.ttrpg?.attacks.length)).resolves.toBe(1))
    expect(host.textContent).toContain('战斗第 1 回合')
    expect((await readSimulationState(session.id!)).ttrpg?.encounter?.activeActorKey).toBe('npc:watcher')
  })

  it('产品跑团入口只显示跑团存档，不会自动打开已有沙盒会话', async () => {
    const ttrpg = await createSimulationSession({
      projectId: project.id!,
      kind: 'ttrpg',
      title: '产品跑团战役',
      seed: 'product-ttrpg',
      initialState: structuredClone(EMPTY_SIMULATION_STATE),
    })
    const sandbox = await createSimulationSession({
      projectId: project.id!,
      kind: 'sandbox',
      title: '不应出现在跑团页的沙盒',
      seed: 'product-sandbox',
      initialState: structuredClone(EMPTY_SIMULATION_STATE),
    })
    await db.simulationSessions.update(sandbox.id!, { updatedAt: Date.now() + 1_000 })

    await act(async () => {
      root.render(createElement(
        DialogProvider,
        null,
        createElement(SimulationRuntimePanel, {
          project,
          worldGroupId: null,
          sessionKind: 'ttrpg',
        }),
      ))
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    await viWaitFor(() => expect(useSimulationRuntimeStore.getState().selectedSessionId).toBe(ttrpg.id))
    await viWaitFor(() => expect(host.textContent).toContain('单机战役主持'))
    expect(host.textContent).toContain('产品跑团战役')
    expect(host.textContent).not.toContain('不应出现在跑团页的沙盒')
    expect(host.querySelector('[data-testid="runtime-kind-lock"]')?.textContent).toContain('跑团存档')
    expect(host.querySelector('select[aria-label="运行时类型"]')).toBeNull()
  })

  it('运行时面板界面标签由 simulation 命名空间 locale 驱动（pt-BR）', async () => {
    await act(async () => {
      root.render(createElement(
        DialogProvider,
        null,
        createElement(SimulationRuntimePanel, { project, worldGroupId: null }),
      ))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    try {
      await act(async () => { await i18n.changeLanguage('pt-BR'); await new Promise(resolve => setTimeout(resolve, 0)) })
      await viWaitFor(() => expect(host.textContent).toContain('Runtime Interativo'))
      expect(host.textContent).toContain(
        'NPCs, sessões de RPG e chats compartilham arquivos independentes. Eventos aqui não reescrevem o Canon da obra.',
      )
      expect(host.textContent).toContain('Criar e congelar')
      expect(host.querySelector('input[placeholder="Nome da nova sessão"]')).toBeTruthy()
      expect(host.querySelector('select[aria-label="Tipo de runtime"]')).toBeTruthy()
      await viWaitFor(() => expect(host.textContent).toContain('Nenhum arquivo interativo ainda'))
      // ai.* token usage strings stay locale-driven (interpolation intact).
      expect(i18n.t('simulation:ai.tokenUsage', { total: 12 })).toBe('12 tokens')
      expect(i18n.t('simulation:ai.tokenUsageAiPrefix', { total: 7 })).toBe('IA 7 tokens')
    } finally {
      await act(async () => { await i18n.changeLanguage('zh-CN'); await new Promise(resolve => setTimeout(resolve, 0)) })
    }
    expect(host.textContent).not.toContain('Runtime Interativo')
  })

  // ── Oracle 4/4 blockers · persisted-reason canonicality ────────────────────
  // UI-locale translated text must never enter persisted simulation events;
  // rejection / encounter-end / manual-resource reasons persist stable
  // locale-independent codes, and formatEventSummary projects them back to
  // localized timeline summaries at render time. Legacy persisted prose
  // reasons stay visible verbatim as authored data.

  it('时间线摘要按稳定原因码本地化渲染，遗留原因字符串保持作者原文可见', () => {
    const translate = i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string
    const tSim = ((key: string, options?: Record<string, unknown>) =>
      translate(`simulation:${key}`, options)) as unknown as Parameters<typeof formatEventSummary>[0]

    // Stable canonical reason codes render localized summaries.
    expect(formatEventSummary(tSim, 'ttrpg.encounter.resolved', JSON.stringify({ reason: ENCOUNTER_END_REASON_AUTHOR })))
      .toBe(translate('simulation:eventSummary.encounterResolvedAuthorEnded'))
    expect(translate('simulation:eventSummary.encounterResolvedAuthorEnded')).toBe('遭遇已由作者结束')
    expect(formatEventSummary(tSim, 'npc.evolution.rejected', JSON.stringify({ proposalSequence: 3, reason: NPC_REJECTION_REASON_AUTHOR })))
      .toBe(translate('simulation:eventSummary.npcEvolutionRejected'))
    expect(translate('simulation:eventSummary.npcEvolutionRejected')).toBe('NPC 演进候选被作者拒绝')

    // Legacy persisted prose reasons are authored data — shown verbatim, never rewritten.
    expect(formatEventSummary(tSim, 'ttrpg.encounter.resolved', JSON.stringify({ reason: '守门人举旗投降，战斗结束' })))
      .toContain('守门人举旗投降，战斗结束')
    expect(formatEventSummary(tSim, 'npc.evolution.rejected', JSON.stringify({ proposalSequence: 4, reason: '与主线设定冲突，退回重写' })))
      .toContain('与主线设定冲突，退回重写')
  })

  it('拒绝候选持久化语言无关原因码，时间线按 UI 语言渲染摘要（pt-BR）', async () => {
    const session = await createSimulationSession({
      projectId: project.id!,
      kind: 'npc-evolution',
      title: 'NPC 演进线',
      initialState: {
        ...structuredClone(EMPTY_SIMULATION_STATE),
        entities: {
          'npc:gatekeeper': {
            entityKey: 'npc:gatekeeper',
            kind: 'npc',
            sourceId: null,
            name: '守门人',
            locationKey: null,
            lifecycleStatus: 'active',
            attributes: { role: 'npc', mood: '平静' },
          },
        },
      },
    })
    await appendNpcEvolutionProposal({
      sessionId: session.id!,
      candidate: {
        baseSequence: 0,
        entityKey: 'npc:gatekeeper',
        locationKey: null,
        lifecycleStatus: 'active',
        attributes: { mood: '警惕' },
        narrative: '守门人开始留意城外动静。',
        memory: null,
        rationale: '作者确认后的运行时状态变化。',
      },
    })

    await act(async () => {
      root.render(createElement(
        DialogProvider,
        null,
        createElement(SimulationRuntimePanel, { project, worldGroupId: null }),
      ))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await viWaitFor(() => expect(host.textContent).toContain('守门人开始留意城外动静。'))
    try {
      await act(async () => { await i18n.changeLanguage('pt-BR'); await new Promise(resolve => setTimeout(resolve, 0)) })
      await clickWhenEnabled(host, 'Rejeitar')
      await viWaitFor(() => expect(host.textContent).toContain('Candidato de evolução de NPC rejeitado'))
      const rejected = await db.simulationEvents
        .filter(event => event.sessionId === session.id && event.type === 'npc.evolution.rejected')
        .toArray()
      expect(rejected).toHaveLength(1)
      const payload = JSON.parse(rejected[0].payloadJson) as { reason?: string }
      expect(payload.reason).toBe(NPC_REJECTION_REASON_AUTHOR)
      expect(NPC_REJECTION_REASON_AUTHOR).toBe('author-rejected')
      // No UI-locale translated prose ever lands in the persisted payload.
      expect(['Autor rejeitou este candidato', 'Author rejected this candidate', '作者拒绝该候选'])
        .not.toContain(payload.reason)
    } finally {
      await act(async () => { await i18n.changeLanguage('zh-CN'); await new Promise(resolve => setTimeout(resolve, 0)) })
    }
  })

  it('跑团攻击理由保持作者输入；资源调整与结束遭遇持久化稳定原因码', async () => {
    const session = await createSimulationSession({
      projectId: project.id!,
      kind: 'ttrpg',
      title: '原因码跑团',
      seed: 'reason-codes-ttrpg',
      initialState: {
        ...structuredClone(EMPTY_SIMULATION_STATE),
        entities: {
          'character:linzhou': {
            entityKey: 'character:linzhou', kind: 'character', sourceId: 1, name: '林舟', locationKey: null,
            lifecycleStatus: 'active', attributes: { role: 'player', hp: 20, maxHp: 20, armorClass: 12, initiative: 20 },
          },
          'npc:watcher': {
            entityKey: 'npc:watcher', kind: 'npc', sourceId: null, name: '守望者', locationKey: null,
            lifecycleStatus: 'active', attributes: { role: 'npc', hp: 10, maxHp: 10, armorClass: 10, initiative: 10 },
          },
        },
      },
    })
    await act(async () => {
      root.render(createElement(
        DialogProvider,
        null,
        createElement(SimulationRuntimePanel, { project, worldGroupId: null }),
      ))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await viWaitFor(() => expect(useSimulationRuntimeStore.getState().selectedSessionId).toBe(session.id))
    await viWaitFor(() => expect(host.textContent).toContain('战斗遭遇与规则'))
    await act(async () => {
      changeValue(host.querySelector<HTMLInputElement>('input[aria-label="跑团场景标题"]')!, '原因码场景')
      changeValue(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="跑团场景描述"]')!, '验证持久化原因码。')
      changeValue(host.querySelector<HTMLInputElement>('input[aria-label="跑团回合顺序"]')!, 'character:linzhou,npc:watcher')
    })
    await clickWhenEnabled(host, '开始场景')
    await act(async () => {
      changeValue(host.querySelector<HTMLInputElement>('input[aria-label="跑团遭遇标题"]')!, '原因码伏击')
      changeValue(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="跑团遭遇描述"]')!, '击退守望者。')
    })
    await clickWhenEnabled(host, '直接开始遭遇')
    await viWaitFor(() => expect((readSimulationState(session.id!)).then(state => state.ttrpg?.encounter?.title)).resolves.toBe('原因码伏击'))

    // Explicit author-entered attack reason stays authored data verbatim.
    await act(async () => {
      changeValue(host.querySelector<HTMLInputElement>('input[aria-label="攻击骰式"]')!, '1d20+100')
      changeValue(host.querySelector<HTMLInputElement>('input[aria-label="攻击说明"]')!, '长矛突刺压制守卫')
    })
    await clickWhenEnabled(host, '执行攻击')
    await viWaitFor(() => expect((readSimulationState(session.id!)).then(state => state.ttrpg?.attacks.length)).resolves.toBe(1))
    const attackEvents = await db.simulationEvents
      .filter(event => event.sessionId === session.id && event.type === 'ttrpg.combat.attack.resolved')
      .toArray()
    expect(attackEvents).toHaveLength(1)
    const attackPayload = JSON.parse(attackEvents[0].payloadJson) as { attack?: { reason?: string } }
    expect(attackPayload.attack?.reason).toBe('长矛突刺压制守卫')

    // Manual resource adjustment persists the stable canonical code.
    await clickWhenEnabled(host, '调整资源')
    await viWaitFor(() => expect(
      db.simulationEvents
        .filter(event => event.sessionId === session.id && event.type === 'ttrpg.combat.resource.changed')
        .toArray()
        .then(events => events.some(event => (
          (JSON.parse(event.payloadJson) as { reason?: string }).reason === MANUAL_RESOURCE_ADJUSTMENT_REASON
        ))),
    ).resolves.toBe(true))
    expect(MANUAL_RESOURCE_ADJUSTMENT_REASON).toBe('manual-resource-adjustment')

    // Ending the encounter persists the stable canonical code.
    await clickWhenEnabled(host, '结束遭遇')
    await viWaitFor(() => expect(
      db.simulationEvents
        .filter(event => event.sessionId === session.id && event.type === 'ttrpg.encounter.resolved')
        .toArray()
        .then(events => events.every(event => (
          (JSON.parse(event.payloadJson) as { reason?: string }).reason === ENCOUNTER_END_REASON_AUTHOR
        ))),
    ).resolves.toBe(true))
    expect(ENCOUNTER_END_REASON_AUTHOR).toBe('author-ended-encounter')
  })

  it('store 错误与操作失败只渲染本地化通用消息，原始错误仅开发端记录', async () => {
    const session = await createSimulationSession({
      projectId: project.id!,
      kind: 'sandbox',
      title: '错误路径沙盒',
      seed: 'error-path-sandbox',
      initialState: structuredClone(EMPTY_SIMULATION_STATE),
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await act(async () => {
        root.render(createElement(
          DialogProvider,
          null,
          createElement(SimulationRuntimePanel, { project, worldGroupId: null }),
        ))
        await new Promise(resolve => setTimeout(resolve, 0))
      })
      await viWaitFor(() => expect(useSimulationRuntimeStore.getState().selectedSessionId).toBe(session.id))

      // Store errors never render raw; a localized generic message is shown
      // and the raw value is logged developer-only.
      useSimulationRuntimeStore.setState({ error: 'RAW_STORE_DB_FAILURE_7F3A' })
      await viWaitFor(() => expect(host.textContent).toContain('操作失败'))
      expect(host.textContent).toContain('操作失败')
      expect(host.textContent).not.toContain('RAW_STORE_DB_FAILURE_7F3A')
      expect(errorSpy.mock.calls.some(args =>
        args[0] === '[SimulationRuntimePanel] simulation store error' && args[1] === 'RAW_STORE_DB_FAILURE_7F3A',
      )).toBe(true)

      // Operation failures follow the same contract (time.advanced rejects
      // amount 0 through runtime validation → run() catch path).
      await act(async () => changeValue(host.querySelector<HTMLInputElement>('input[aria-label="推进时间"]')!, '0'))
      await clickWhenEnabled(host, '推进时间')
      const rawRuntimeMessage = String(i18n.t('simulation:runtime.labels.timeAdvanceAmount'))
      await viWaitFor(() => expect(host.textContent).toContain('操作失败'))
      expect(host.textContent).toContain('操作失败')
      expect(host.textContent).not.toContain(rawRuntimeMessage)
      expect(errorSpy.mock.calls.some(args =>
        args[0] === '[SimulationRuntimePanel] operation failed' && args[1] instanceof Error,
      )).toBe(true)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('canon 候选加载失败时记录原始错误并显示本地化加载失败消息', async () => {
    const session = await createSimulationSession({
      projectId: project.id!,
      kind: 'sandbox',
      title: '加载失败沙盒',
      seed: 'load-failure-sandbox',
      initialState: structuredClone(EMPTY_SIMULATION_STATE),
    })
    // Stub before mount: the canon-load effect fires on mount. The alert lives
    // in the selected-session detail pane, so a session must be selected for
    // the localized load-failure message to be visible.
    vi.mocked(loadSimulationCanonCandidates).mockRejectedValueOnce(new Error('RAW_CANON_LOAD_FAILURE_XYZ'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await act(async () => {
        root.render(createElement(
          DialogProvider,
          null,
          createElement(SimulationRuntimePanel, { project, worldGroupId: null }),
        ))
        await new Promise(resolve => setTimeout(resolve, 0))
      })
      await viWaitFor(() => expect(useSimulationRuntimeStore.getState().selectedSessionId).toBe(session.id))
      await viWaitFor(() => expect(host.textContent).toContain('加载失败'))
      expect(host.textContent).toContain('加载失败')
      expect(host.textContent).not.toContain('RAW_CANON_LOAD_FAILURE_XYZ')
      expect(errorSpy.mock.calls.some(args =>
        args[0] === '[SimulationRuntimePanel] canon candidates load failed' && args[1] instanceof Error,
      )).toBe(true)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('三条 AI 流错误只渲染本地化通用消息，原始错误仅开发端记录', async () => {
    // npc-evolution 会话承载 NPC 演进 AI 错误位；ttrpg 会话承载遭遇生成与
    // GM 主持两条 AI 错误位。流错误通过共享生成会话 store 注入，不触网。
    const npcSession = await createSimulationSession({
      projectId: project.id!,
      kind: 'npc-evolution',
      title: 'AI 错误演进线',
      initialState: structuredClone(EMPTY_SIMULATION_STATE),
    })
    const ttrpgSession = await createSimulationSession({
      projectId: project.id!,
      kind: 'ttrpg',
      title: 'AI 错误跑团',
      seed: 'ai-error-ttrpg',
      initialState: structuredClone(EMPTY_SIMULATION_STATE),
    })
    const rawNpcError = 'RAW_NPC_AI_FAILURE_TOKEN_Q1'
    const rawEncounterError = 'RAW_ENCOUNTER_AI_FAILURE_TOKEN_W2'
    const rawGmError = 'RAW_GM_AI_FAILURE_TOKEN_E3'
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await act(async () => {
        root.render(createElement(
          DialogProvider,
          null,
          createElement(SimulationRuntimePanel, { project, worldGroupId: null }),
        ))
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      // NPC 演进 AI 流错误：只渲染通用消息，原始串只进 [SimulationRuntimePanel] 日志。
      await clickSessionRow(host, 'AI 错误演进线')
      await viWaitFor(() => expect(useSimulationRuntimeStore.getState().selectedSessionId).toBe(npcSession.id))
      await viWaitFor(() => expect(host.textContent).toContain('NPC 演进候选'))
      expect(host.textContent).not.toContain(rawNpcError)
      await act(async () => {
        useAIGenerationSessionStore.getState().patchSession(
          createAISessionKey(project.id!, 'simulation.npc-evolution', npcSession.id!),
          { error: rawNpcError },
        )
        await new Promise(resolve => setTimeout(resolve, 0))
      })
      await viWaitFor(() => expect(host.textContent).toContain('操作失败'))
      expect(host.textContent).not.toContain(rawNpcError)
      expect(errorSpy.mock.calls.some(args =>
        args[0] === '[SimulationRuntimePanel] npc evolution ai error' && args[1] === rawNpcError,
      )).toBe(true)

      // 遭遇生成 AI 流错误（跑团会话）。
      await clickSessionRow(host, 'AI 错误跑团')
      await viWaitFor(() => expect(useSimulationRuntimeStore.getState().selectedSessionId).toBe(ttrpgSession.id))
      await viWaitFor(() => expect(host.textContent).toContain('战斗遭遇与规则'))
      expect(host.textContent).not.toContain(rawEncounterError)
      await act(async () => {
        useAIGenerationSessionStore.getState().patchSession(
          createAISessionKey(project.id!, 'simulation.ttrpg-encounter', ttrpgSession.id!),
          { error: rawEncounterError },
        )
        await new Promise(resolve => setTimeout(resolve, 0))
      })
      await viWaitFor(() => expect(host.textContent).toContain('操作失败'))
      expect(host.textContent).not.toContain(rawEncounterError)
      expect(errorSpy.mock.calls.some(args =>
        args[0] === '[SimulationRuntimePanel] ttrpg encounter ai error' && args[1] === rawEncounterError,
      )).toBe(true)

      // GM 主持 AI 流错误（同一跑团会话的第三条错误位）。
      expect(host.textContent).not.toContain(rawGmError)
      await act(async () => {
        useAIGenerationSessionStore.getState().patchSession(
          createAISessionKey(project.id!, 'simulation.ttrpg-gm', ttrpgSession.id!),
          { error: rawGmError },
        )
        await new Promise(resolve => setTimeout(resolve, 0))
      })
      await viWaitFor(() => expect(host.textContent).toContain('操作失败'))
      // 三条原始串都从未进入可见 UI。
      expect(host.textContent).not.toContain(rawNpcError)
      expect(host.textContent).not.toContain(rawEncounterError)
      expect(host.textContent).not.toContain(rawGmError)
      expect(errorSpy.mock.calls.some(args =>
        args[0] === '[SimulationRuntimePanel] ttrpg gm ai error' && args[1] === rawGmError,
      )).toBe(true)
    } finally {
      errorSpy.mockRestore()
    }
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
