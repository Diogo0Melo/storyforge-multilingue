import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import InteractionGameWorkbench from '../../src/components/character-interaction/InteractionGameWorkbench'
import ChatGamePanel from '../../src/components/simulation/ChatGamePanel'
import { DialogProvider } from '../../src/components/shared/Dialog'
import {
  createStarterInteractionGame,
  publishInteractionGameDraft,
  saveInteractionSceneTemplate,
} from '../../src/lib/character-interaction/authoring'
import { db } from '../../src/lib/db/schema'
import { readSimulationState } from '../../src/lib/simulation/runtime'
import type { Project } from '../../src/lib/types'
import { ensureWorkspaceOwnership } from '../../src/lib/world-engine/ownership'
import i18n from '../../src/i18n'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function button(host: ParentNode, text: string): HTMLButtonElement {
  const result = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.trim() === text)
  if (!result) throw new Error(`找不到按钮:${text}`)
  return result
}

async function click(host: ParentNode, text: string) {
  await act(async () => { button(host, text).click(); await new Promise(resolve => setTimeout(resolve, 0)) })
}

async function waitFor(assertion: () => void | Promise<void>) {
  const start = Date.now(); let last: unknown
  while (Date.now() - start < 8_000) {
    try { await act(async () => { await assertion() }); return } catch (reason) {
      last = reason
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
    }
  }
  throw last
}

async function fixture() {
  const now = Date.now()
  const projectId = await db.projects.add({
    name: '互动 UI', genre: 'drama', genres: ['drama'], status: 'drafting', description: '',
    targetWordCount: 20_000, createdAt: now, updatedAt: now,
  } as any) as number
  const ownership = await ensureWorkspaceOwnership(projectId)
  const ids: number[] = []
  for (const [index, name] of ['汀兰', '明石', '郁'].entries()) {
    ids.push(await db.characters.add({
      projectId, worldId: ownership.scope.worldId, name,
      role: 'supporting', roleWeight: 'secondary', moralAxis: 'neutral', orderAxis: 'neutral',
      shortDescription: `${name}是港口会面的参与者。`, appearance: '', personality: '', background: '',
      motivation: '', abilities: '', relationships: '[]', arc: '', speechStyle: '简洁克制',
      createdAt: now + index, updatedAt: now + index,
    } as any) as number)
  }
  return {
    scope: ownership.scope,
    project: (await db.projects.get(projectId)) as Project,
    characterIds: ids,
  }
}

describe('CHATGAME-2B/2C · author and player UI', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  beforeEach(async () => {
    await db.delete(); await db.open()
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  })
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); db.close() })

  it('作者可从世界角色建立游戏，检查可见上下文并发布', async () => {
    const seeded = await fixture()
    await act(async () => {
      root.render(createElement(DialogProvider, null, createElement(InteractionGameWorkbench, { scope: seeded.scope })))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(host.textContent).toContain('用所选角色创建'))
    await click(host, '用所选角色创建')
    await waitFor(() => expect(host.textContent).toContain('3 角色 · 1 场景'))
    await click(host, '上下文检查')
    const inspect = host.querySelector<HTMLButtonElement>('button[aria-label="检查 汀兰"]')
    expect(inspect).toBeTruthy()
    await act(async () => { inspect!.click(); await new Promise(resolve => setTimeout(resolve, 0)) })
    await waitFor(() => expect(host.textContent).toContain('统一上下文源：interactionRuntime'))
    await click(host, '校验与发布')
    await click(host, '运行检查')
    await waitFor(() => expect(host.textContent).toContain('可发布'))
    await click(host, '发布新版本')
    await waitFor(() => expect(host.textContent).toContain('已发布 GameRelease v1'))
    expect(await db.gameReleases.count()).toBe(1)
  }, 20_000)

  it('作者工作台界面标签由 simulation 命名空间 locale 驱动（pt-BR）', async () => {
    const seeded = await fixture()
    await act(async () => {
      root.render(createElement(DialogProvider, null, createElement(InteractionGameWorkbench, { scope: seeded.scope })))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    try {
      await act(async () => { await i18n.changeLanguage('pt-BR'); await new Promise(resolve => setTimeout(resolve, 0)) })
      await waitFor(() => expect(host.textContent).toContain('Jogos de interação'))
      expect(host.querySelector('input[placeholder="Título do novo jogo"]')).toBeTruthy()
      expect(host.textContent).toContain('Criar amostra de aceitação de cinco cenas')
      expect(host.textContent).toContain('fichas mestras dos personagens servem apenas como fonte de publicação')
      await click(host, 'Criar com os personagens selecionados')
      await waitFor(() => expect(host.textContent).toContain('3 personagens · 1 cenas · 0 publicações'))
      expect(host.textContent).toContain('Conhecimento, segredos e dimensões de relação dos personagens')
      expect(host.textContent).toContain('Limite de memória')
      await click(host, 'Inspeção de contexto')
      const inspect = host.querySelector<HTMLButtonElement>('button[aria-label="Inspecionar 汀兰"]')
      expect(inspect).toBeTruthy()
      await act(async () => { inspect!.click(); await new Promise(resolve => setTimeout(resolve, 0)) })
      await waitFor(() => expect(host.textContent).toContain('Fontes de contexto unificadas: interactionRuntime'))
      expect(host.textContent).not.toContain('统一上下文源：')
      await click(host, 'Validação e publicação')
      await click(host, 'Executar verificações')
      await waitFor(() => expect(host.textContent).toContain('Pronto para publicar'))
      await click(host, 'Publicar nova versão')
      await waitFor(() => expect(host.textContent).toContain('GameRelease v1 publicado'))
      expect(await db.gameReleases.count()).toBe(1)
    } finally {
      await act(async () => { await i18n.changeLanguage('zh-CN'); await new Promise(resolve => setTimeout(resolve, 0)) })
    }
  }, 20_000)

  it('新游戏标题输入保持作者主导：初始为空、locale 切换不注入或改写持久化标题', async () => {
    const seeded = await fixture()
    await act(async () => {
      root.render(createElement(DialogProvider, null, createElement(InteractionGameWorkbench, { scope: seeded.scope })))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(host.textContent).toContain('用所选角色创建'))
    const titleInput = () => host.querySelector('.storygame-author-sidebar input') as HTMLInputElement
    // 回归：初始标题输入必须为空，不得由 t()（locale 文案）预置。
    expect(titleInput().value).toBe('')
    // 作者输入后切换 UI locale：作者状态不得被 locale 改写。
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setValue.call(titleInput(), '我的互动剧本')
      titleInput().dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await act(async () => { await i18n.changeLanguage('en'); await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(titleInput().value).toBe('我的互动剧本')
    await click(host, 'Create from selected characters')
    await waitFor(() => expect(host.textContent).toContain('Created a minimal publishable character interaction.'))
    const definitions = await db.gameDefinitions.toArray()
    const created = definitions.find(item => item.title === '我的互动剧本')
    expect(created?.title).toBe('我的互动剧本')
    await act(async () => { await i18n.changeLanguage('zh-CN'); await new Promise(resolve => setTimeout(resolve, 0)) })
  }, 20_000)

  it('校验诊断按稳定 code 渲染本地化文案并携带 recordKey，不透出引擎原始 message', async () => {
    const seeded = await fixture()
    const definition = await createStarterInteractionGame({ scope: seeded.scope, characterIds: seeded.characterIds })
    // 直接改库制造 profile.incomplete 诊断（稳定 code，recordKey = participantKey）。
    const profile = await db.interactionCharacterProfiles
      .where('gameDefinitionId').equals(definition.id!).first()
    await db.interactionCharacterProfiles.update(profile!.id!, { roleLabel: '', voiceRules: '' })
    await act(async () => {
      root.render(createElement(DialogProvider, null, createElement(InteractionGameWorkbench, { scope: seeded.scope })))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    try {
      await act(async () => { await i18n.changeLanguage('en'); await new Promise(resolve => setTimeout(resolve, 0)) })
      // 等工作台加载出真实 definition 与校验页签后再进入发布检查。
      await waitFor(() => expect(host.textContent).toContain('Validate & release'))
      await click(host, 'Validate & release')
      await waitFor(() => expect(host.textContent).toContain('Run checks'))
      await click(host, 'Run checks')
      await waitFor(() => expect(host.textContent).toContain('Blocking issues found'))
      const issueLine = Array.from(host.querySelectorAll('.storygame-graph-issues li'))
        .map(item => item.textContent ?? '')
        .find(text => text.includes(profile!.participantKey))
      expect(issueLine).toContain('Blocking · Character role and voice rules must not be empty:')
      expect(issueLine).toContain(profile!.participantKey)
      // 引擎语言原始 message 与 zh 文案在 en 下都不得出现。
      expect(host.textContent).not.toContain('角色定位和口吻规则不能为空')
    } finally {
      await act(async () => { await i18n.changeLanguage('zh-CN'); await new Promise(resolve => setTimeout(resolve, 0)) })
    }
  }, 20_000)

  it('玩家可从 GameRelease 建档并用无 AI 固定行动产生可解释关系变化', async () => {
    const seeded = await fixture()
    const definition = await createStarterInteractionGame({ scope: seeded.scope, title: '港口之约', characterIds: seeded.characterIds })
    const profiles = await db.interactionCharacterProfiles.where('gameDefinitionId').equals(definition.id!).toArray()
    const scene = await db.interactionSceneTemplates.where('gameDefinitionId').equals(definition.id!).first()
    await saveInteractionSceneTemplate({
      scope: seeded.scope, gameDefinitionId: definition.id!, sceneId: scene!.id,
      sceneKey: scene!.sceneKey, title: scene!.title, purpose: scene!.purpose, location: scene!.location, timeLabel: scene!.timeLabel,
      participantKeysJson: scene!.participantKeysJson, publicKnowledgeKeysJson: scene!.publicKnowledgeKeysJson,
      goalsJson: scene!.goalsJson, endingConditionsJson: scene!.endingConditionsJson, safetyBoundariesJson: scene!.safetyBoundariesJson,
      relationshipRulesJson: JSON.stringify([{ ruleKey: 'promise.broken', label: '失约', playerText: '承认失约', fromParticipantKey: profiles[0].participantKey, toParticipantKey: 'player', dimensionKey: 'trust', delta: -2, reason: '玩家坦白自己未赴约。', significantEventKey: null }]),
      openingNodeKey: scene!.openingNodeKey, endingNodeKey: scene!.endingNodeKey,
      maxTurns: scene!.maxTurns, directorBudget: scene!.directorBudget, order: scene!.order,
    })
    await publishInteractionGameDraft({ scope: seeded.scope, gameDefinitionId: definition.id! })
    await act(async () => {
      root.render(createElement(ChatGamePanel, { project: seeded.project, worldGroupId: null, workspaceScope: seeded.scope }))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(host.textContent).toContain('港口之约'))
    await click(host, '新建会话')
    await waitFor(() => expect(host.textContent).toContain('承认失约'))
    await click(host, '承认失约')
    await waitFor(() => expect(host.textContent).toContain('0 → -2'))
    const session = await db.simulationSessions.where('projectId').equals(seeded.scope.projectId).first()
    expect((await readSimulationState(session!.id!)).interaction?.relationshipHistory[0]).toMatchObject({ ruleKey: 'promise.broken', after: -2 })
    expect(host.textContent).toContain('未配置 AI')
  }, 20_000)

  it('在产品页列出并只读回放无 World/Work 归属的 CHATGAME-1 存档', async () => {
    const seeded = await fixture()
    const now = Date.now()
    const sessionId = await db.simulationSessions.add({
      projectId: seeded.scope.projectId, worldGroupId: null, worldId: null, workId: null,
      worldReleaseId: null, gameReleaseId: null, narrativeModuleId: null,
      kind: 'chatgame', title: '旧城门对话', status: 'active', rulesetVersion: 1, seed: 'legacy',
      canonSnapshotJson: '{}', initialStateJson: JSON.stringify({
        version: 1, clock: 0, entities: {}, memories: [], randomResults: {}, narratives: [], pendingNpcEvolutions: [],
        ttrpg: null, interaction: null, narrative: null, lastSequence: 0,
        chat: { characterKey: 'legacy:keeper', identity: { name: '守门人', description: '旧存档角色' }, scene: { title: '城门初遇', description: '雨后的城门。' }, messages: [] },
      }),
      parentSessionId: null, parentThroughSequence: null, createdAt: now, updatedAt: now,
    } as any) as number
    await db.simulationEvents.bulkAdd([
      { projectId: seeded.scope.projectId, worldGroupId: null, sessionId, sequence: 1, type: 'chat.message.recorded', actorKey: null, targetKey: null, payloadJson: JSON.stringify({ messageId: 'legacy:1', text: '城里安全吗？' }), createdAt: now + 1 },
      { projectId: seeded.scope.projectId, worldGroupId: null, sessionId, sequence: 2, type: 'chat.reply.recorded', actorKey: 'legacy:keeper', targetKey: 'legacy:keeper', payloadJson: JSON.stringify({ messageId: 'legacy:2', text: '暂时安全，但别走北街。', replyToSequence: 1, supersedesSequence: null }), createdAt: now + 2 },
    ] as any)
    await act(async () => {
      root.render(createElement(ChatGamePanel, { project: seeded.project, worldGroupId: null, workspaceScope: seeded.scope }))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(host.textContent).toContain('旧城门对话'))
    expect(host.textContent).toContain('CHATGAME-1 · 只读')
    await click(host, '旧城门对话CHATGAME-1 · 只读')
    await waitFor(() => expect(host.textContent).toContain('别走北街'))
    expect(host.textContent).toContain('新消息、重试、检查点和分支均已关闭')
    expect(host.querySelector('textarea')).toBeNull()
  }, 20_000)
})
