/**
 * R-ORACLE1 · ChatGamePanel 列表分隔符必须随 UI 语言变化(Oracle remediation)
 *
 * 回归边界:
 * - 场景头部与输入框占位符里的参与者名单不得再硬编码中文顿号 `、`,
 *   必须经 Intl.ListFormat(conjunction/short, 当前 UI 语言)格式化;
 * - zh-CN 下语义保持(分隔符仍是 `、`,与修复前视觉一致);
 * - 切到 pt-BR 后分隔符必须跟随语言,不得残留 `、`;
 * - 静态源码守卫:组件内不再存在 `.join('、')`(覆盖 memorySource 等
 *   无 AI 时难以在 DOM 中触达的调用点)。
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ChatGamePanel from '../../src/components/simulation/ChatGamePanel'
import {
  createStarterInteractionGame,
  publishInteractionGameDraft,
} from '../../src/lib/character-interaction/authoring'
import { db } from '../../src/lib/db/schema'
import type { Project } from '../../src/lib/types'
import { ensureWorkspaceOwnership } from '../../src/lib/world-engine/ownership'
import i18n from '../../src/i18n'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const CHARACTER_NAMES = ['汀兰', '明石', '郁'] as const
const LIST_FORMAT_OPTIONS = { type: 'conjunction', style: 'short' } as const

function button(host: ParentNode, text: string): HTMLButtonElement {
  const result = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.trim() === text)
  if (!result) throw new Error(`找不到按钮:${text}`)
  return result
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
    name: 'Oracle 列表格式', genre: 'drama', genres: ['drama'], status: 'drafting', description: '',
    targetWordCount: 20_000, createdAt: now, updatedAt: now,
  } as any) as number
  const ownership = await ensureWorkspaceOwnership(projectId)
  const ids: number[] = []
  for (const [index, name] of CHARACTER_NAMES.entries()) {
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

describe('R-ORACLE1 · ChatGamePanel locale-aware list formatting', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  beforeEach(async () => {
    await db.delete(); await db.open()
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  })
  afterEach(async () => {
    await act(async () => { await i18n.changeLanguage('zh-CN'); await new Promise(resolve => setTimeout(resolve, 0)) })
    await act(async () => root.unmount()); host.remove(); db.close()
  })

  it('参与者名单按当前 UI 语言用 Intl.ListFormat 连接:zh 保持顿号语义,pt-BR 不残留 、', async () => {
    const seeded = await fixture()
    const definition = await createStarterInteractionGame({ scope: seeded.scope, title: '港口列表格式', characterIds: seeded.characterIds })
    await publishInteractionGameDraft({ scope: seeded.scope, gameDefinitionId: definition.id! })
    await act(async () => {
      root.render(createElement(ChatGamePanel, { project: seeded.project, worldGroupId: null, workspaceScope: seeded.scope }))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(host.textContent).toContain('港口列表格式'))
    await act(async () => { button(host, '新建会话').click(); await new Promise(resolve => setTimeout(resolve, 0)) })
    // textarea 仅在场景激活后渲染,作为场景就绪信号。
    await waitFor(() => expect(host.querySelector('textarea')).toBeTruthy())

    const textarea = host.querySelector('textarea') as HTMLTextAreaElement
    const zhList = new Intl.ListFormat('zh-CN', LIST_FORMAT_OPTIONS).format([...CHARACTER_NAMES])
    // zh-CN:语义与修复前一致(顿号分隔),占位符与场景头部都携带格式化名单。
    expect(zhList).toContain('、')
    expect(textarea.placeholder).toContain(zhList)
    expect(host.textContent).toContain(zhList)

    try {
      await act(async () => { await i18n.changeLanguage('pt-BR'); await new Promise(resolve => setTimeout(resolve, 0)) })
      const ptList = new Intl.ListFormat('pt-BR', LIST_FORMAT_OPTIONS).format([...CHARACTER_NAMES])
      expect(ptList).not.toEqual(zhList)
      await waitFor(() => expect((host.querySelector('textarea') as HTMLTextAreaElement).placeholder).toContain(ptList))
      const refreshed = host.querySelector('textarea') as HTMLTextAreaElement
      expect(refreshed.placeholder).toContain(ptList)
      expect(refreshed.placeholder).not.toContain('、')
      expect(host.textContent).toContain(ptList)
      expect(host.textContent).not.toContain(zhList)
    } finally {
      await act(async () => { await i18n.changeLanguage('zh-CN'); await new Promise(resolve => setTimeout(resolve, 0)) })
    }
  }, 20_000)

  it('组件源码不再包含硬编码 .join(、)(覆盖 memorySource 等低频调用点)', () => {
    // happy-dom 环境下 import.meta.url 非 file:// 协议,统一用 process.cwd()(vitest root=仓库根)。
    const source = readFileSync(join(process.cwd(), 'src', 'components', 'simulation', 'ChatGamePanel.tsx'), 'utf8')
    expect(source).not.toContain("join('、')")
    expect(source).toContain('Intl.ListFormat')
    expect(source).toContain('listFormat.format')
  })
})
