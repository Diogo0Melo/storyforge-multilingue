import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChapterEditorToolbar from '../../src/components/editor/ChapterEditorToolbar'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ host: HTMLDivElement; root: ReturnType<typeof createRoot> }> = []

async function mount(patch: Record<string, unknown> = {}) {
  const props = {
    isStreaming: false,
    hasText: true,
    organizingChapter: false,
    hasOrganizationCandidate: false,
    analyzingImpact: false,
    impactInfo: null,
    hasOutline: true,
    showOutlinePreview: false,
    showReviewPanel: false,
    consistencyAlertCount: 0,
    showNotePanel: false,
    customInstruction: '',
    onGenerate: vi.fn(),
    onContinue: vi.fn(),
    onExpand: vi.fn(),
    onPolish: vi.fn(),
    onDeAI: vi.fn(),
    onOrganizeChapter: vi.fn(),
    onAnalyzeImpact: vi.fn(),
    onDismissImpact: vi.fn(),
    onToggleOutlinePreview: vi.fn(),
    onToggleReviewPanel: vi.fn(),
    onToggleNotePanel: vi.fn(),
    onCustomInstructionChange: vi.fn(),
    ...patch,
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  mounted.push({ host, root })
  await act(async () => root.render(createElement(ChapterEditorToolbar, props)))
  return { host, props }
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const match = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.trim() === label)
  if (!match) throw new Error(`missing button: ${label}`)
  return match
}

afterEach(async () => {
  while (mounted.length > 0) {
    const item = mounted.pop()!
    await act(async () => item.root.unmount())
    item.host.remove()
  }
})

describe('AUDIT-6 / HEALTH-4 · 正文编辑器工具栏', () => {
  it('逐项转发现有 AI、提取和面板命令', async () => {
    const { host, props } = await mount()
    for (const label of ['toolbar.generate', 'toolbar.continue', 'toolbar.expand', 'toolbar.polish', 'toolbar.deai', 'toolbar.organizeChapter', 'toolbar.impactAnalysis', 'toolbar.outlinePreview', 'toolbar.qualityReview', 'toolbar.notes']) {
      await act(async () => button(host, label).click())
    }
    expect(props.onGenerate).toHaveBeenCalledOnce()
    expect(props.onContinue).toHaveBeenCalledOnce()
    expect(props.onExpand).toHaveBeenCalledOnce()
    expect(props.onPolish).toHaveBeenCalledOnce()
    expect(props.onDeAI).toHaveBeenCalledOnce()
    expect(props.onOrganizeChapter).toHaveBeenCalledOnce()
    expect(props.onAnalyzeImpact).toHaveBeenCalledOnce()
    expect(props.onToggleOutlinePreview).toHaveBeenCalledOnce()
    expect(props.onToggleReviewPanel).toHaveBeenCalledOnce()
    expect(props.onToggleNotePanel).toHaveBeenCalledOnce()
  })

  it('无正文或任务忙碌时保持原禁用边界', async () => {
    const { host } = await mount({
      isStreaming: true,
      hasText: false,
      organizingChapter: true,
      analyzingImpact: true,
    })
    for (const label of ['toolbar.generate', 'toolbar.continue', 'toolbar.expand', 'toolbar.polish', 'toolbar.deai', 'toolbar.analyzing', 'toolbar.qualityReview']) {
      expect(button(host, label).disabled).toBe(true)
    }
    expect(button(host, 'toolbar.stopOrganizing').disabled).toBe(true)
    expect(button(host, 'toolbar.notes').disabled).toBe(false)
  })

  it('展示影响分析结果、开关状态并转发组合输入', async () => {
    const { host, props } = await mount({
      impactInfo: '2 条事实需要复核',
      showOutlinePreview: true,
      showReviewPanel: true,
      showNotePanel: true,
    })
    expect(host.textContent).toContain('2 条事实需要复核')
    expect(button(host, 'toolbar.outlinePreview').getAttribute('aria-pressed')).toBe('true')
    expect(button(host, 'toolbar.qualityReview').getAttribute('aria-pressed')).toBe('true')
    expect(button(host, 'toolbar.notes').getAttribute('aria-pressed')).toBe('true')
    await act(async () => button(host, '×').click())
    expect(props.onDismissImpact).toHaveBeenCalledOnce()

    const input = host.querySelector('input')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, '保持冷峻语气')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(props.onCustomInstructionChange).toHaveBeenCalledWith('保持冷峻语气')
  })

  it('当前正文存在一致性告警时在审校入口显示计数', async () => {
    const { host } = await mount({ consistencyAlertCount: 3 })
    const review = Array.from(host.querySelectorAll('button'))
      .find(item => item.textContent?.includes('toolbar.qualityReview'))
    expect(review?.textContent).toContain('3')
  })
})
