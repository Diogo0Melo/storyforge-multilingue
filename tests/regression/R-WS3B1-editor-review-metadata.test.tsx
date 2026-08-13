/**
 * WS-3B Phase 1 · editor/review lane 调用元信息回归
 *
 * 契约（orchestrator 批准）：
 * - review.revise 是全文手稿改写 → outputKind creative（ChapterEditor）
 * - ReviewPanel review / anti-ai / readability → functional-prose（含 projectId）
 * - ReviewPanel consistency fast / deep → functional-structured
 * - FloatingToolbar 手稿编辑（polish/expand/condense/rewrite）→ creative；
 *   查漏 check → functional-prose；且必须携带 projectId（动作级 category）
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FloatingToolbar from '../../src/components/editor/FloatingToolbar'
import ReviewPanel from '../../src/components/editor/ReviewPanel'
import { db } from '../../src/lib/db/schema'
import { useReviewResultStore } from '../../src/stores/review-result'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const startMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/hooks/useAIStream', () => ({
  useAIStream: () => ({
    start: startMock,
    stop: vi.fn(),
    reset: vi.fn(),
    setOperation: vi.fn(),
    isStreaming: false,
    output: '',
    error: null,
    tokenUsage: null,
    operation: null,
  }),
}))

describe('WS-3B Phase 1 · FloatingToolbar 动作级元信息', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    startMock.mockReset()
    startMock.mockResolvedValue('')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  async function renderToolbar(projectId: number) {
    await act(async () => {
      root.render(createElement(FloatingToolbar, {
        projectId,
        getSelectedText: () => '这是一段足够长的选中文本，用于触发浮动工具栏显示。',
        getSelectionRect: () => ({ top: 100, left: 100, width: 80 }) as DOMRect,
        replaceSelectedText: () => undefined,
      }))
    })
    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'))
    })
  }

  it.each([
    ['润色', { category: 'chapter.toolbar.polish', outputKind: 'creative' }],
    ['扩写', { category: 'chapter.toolbar.expand', outputKind: 'creative' }],
    ['缩写', { category: 'chapter.toolbar.condense', outputKind: 'creative' }],
    ['改写', { category: 'chapter.toolbar.rewrite', outputKind: 'creative' }],
    ['查漏', { category: 'chapter.toolbar.check', outputKind: 'functional-prose' }],
  ] as const)('%s 动作携带 %j 与 projectId', async (label, expected) => {
    await renderToolbar(42)
    const button = Array.from(host.querySelectorAll('button'))
      .find(item => item.textContent?.includes(label)) as HTMLButtonElement | undefined
    expect(button, `按钮「${label}」应可见`).toBeTruthy()
    await act(async () => {
      button!.click()
      await vi.waitFor(() => expect(startMock).toHaveBeenCalledOnce(), { timeout: 3000 })
    })
    expect(startMock.mock.calls[0][2]).toEqual({ ...expected, projectId: 42 })
  })
})

describe('WS-3B Phase 1 · ReviewPanel 审校三 tab 元信息', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  const chapterId = 901

  beforeEach(async () => {
    await db.delete()
    await db.open()
    startMock.mockReset()
    startMock.mockResolvedValue('')
    useReviewResultStore.setState({ byChapter: {} })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    db.close()
  })

  async function renderPanel(tab: 'review' | 'antiAI' | 'readability') {
    useReviewResultStore.getState().setActiveTab(chapterId, tab)
    await act(async () => {
      root.render(createElement(ReviewPanel, {
        projectId: 7,
        chapterId,
        outlineNodeId: null,
        worldGroupId: null,
        chapterContent: '林飞推门走进议事厅，亲手展开了地图。',
        chapterTitle: '第五章',
        worldContext: '',
        characterContext: '',
        prevChapterSummary: '',
        nextChapterSummary: '',
        foreshadowContext: '',
        stateContext: '',
        onClose: () => undefined,
      }))
    })
  }

  it.each([
    ['review', 'review.quality'],
    ['antiAI', 'review.anti-ai'],
    ['readability', 'review.readability'],
  ] as const)('%s tab 声明 functional-prose 与 projectId', async (tab, category) => {
    await renderPanel(tab)
    const run = Array.from(host.querySelectorAll('button'))
      .find(button => button.textContent?.includes('开始检测')) as HTMLButtonElement | undefined
    expect(run, '「开始检测」按钮应可见').toBeTruthy()
    await act(async () => {
      run!.click()
      await vi.waitFor(() => expect(startMock).toHaveBeenCalledOnce(), { timeout: 3000 })
    })
    expect(startMock.mock.calls[0][2]).toEqual({
      category,
      projectId: 7,
      outputKind: 'functional-prose',
    })
  })
})

describe('WS-3B Phase 1 · 调用点源码锚定（重渲染成本高的入口）', () => {
  const readSource = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

  it('review.revise 在 ChapterEditor 调用点声明 creative（手稿改写）', () => {
    const source = readSource('src/components/editor/ChapterEditor.tsx')
    const index = source.indexOf("category: 'review.revise'")
    expect(index).toBeGreaterThanOrEqual(0)
    const callSite = source.slice(index, index + 200)
    expect(callSite).toContain("outputKind: 'creative'")
    expect(callSite).toContain('projectId: project.id!')
  })

  it('ChapterEditor 向 FloatingToolbar 传入 projectId', () => {
    const source = readSource('src/components/editor/ChapterEditor.tsx')
    const index = source.indexOf('<FloatingToolbar')
    expect(index).toBeGreaterThanOrEqual(0)
    const callSite = source.slice(index, index + 600)
    expect(callSite).toContain('projectId={project.id!}')
  })

  it('consistency fast/deep 调用点声明 functional-structured 与 projectId', () => {
    const source = readSource('src/components/editor/ReviewPanel.tsx')
    const index = source.indexOf("'review.consistency.fast'")
    expect(index).toBeGreaterThanOrEqual(0)
    const callSite = source.slice(index - 300, index + 500)
    expect(callSite).toContain("'review.consistency.deep'")
    expect(callSite).toContain("outputKind: 'functional-structured'")
    expect(callSite).toContain('projectId')
  })
})
