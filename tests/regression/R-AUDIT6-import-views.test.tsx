import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImportDocIntro, ImportReusableSessionBanner } from '../../src/components/system/import/ImportDocOverview'
import { ImportPipelineControls } from '../../src/components/system/import/ImportRuntimeView'
import CodexImportReviewModal from '../../src/components/system/import/CodexImportReviewModal'
import useImportDocumentPreparation from '../../src/components/system/import/useImportDocumentPreparation'
import type { ImportSession } from '../../src/lib/types/import-session'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ host: HTMLDivElement; root: ReturnType<typeof createRoot> }> = []

afterEach(async () => {
  while (mounted.length > 0) {
    const item = mounted.pop()!
    await act(async () => item.root.unmount())
    item.host.remove()
  }
})

async function mount(element: React.ReactElement) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  mounted.push({ host, root })
  await act(async () => root.render(element))
  return host
}

const session: ImportSession = {
  id: 12,
  projectId: 1,
  filename: '设定集.md',
  fileHash: 'hash',
  totalChars: 12345,
  totalChunks: 3,
  chunkSize: 50000,
  chunks: [],
  merged: { worldview: {}, characters: [], outline: [] },
  rollingContext: '',
  importTarget: 'project',
  status: 'done',
  createdAt: 1,
  updatedAt: 1,
}

function ImportPreparationHarness() {
  const preparation = useImportDocumentPreparation()
  return createElement('div', null,
    createElement('button', { onClick: () => preparation.handleRawTextChange('第一章\n镜海之门开启。') }, '载入粘贴文本'),
    createElement('button', { onClick: preparation.prepareConfirmation }, '准备解析'),
    createElement('span', { 'data-testid': 'state' }, preparation.showConfirm
      ? `${preparation.plans?.length}|${preparation.previewPlans?.length}|${preparation.sourceBlob().filename}`
      : 'closed'),
  )
}

describe('AUDIT-6 · 文档导入视图', () => {
  it('介绍区使用当前切块大小并展示文件限制', async () => {
    const host = await mount(createElement(ImportDocIntro, { chunkSize: 50000 }))
    expect(host.textContent).toContain('intro.title')
    expect(host.textContent).toContain('intro.description')
    expect(host.textContent).toContain('intro.supportedFormats')
  })

  it('复用会话的四个操作只向父级转发', async () => {
    const onApplyProject = vi.fn()
    const onApplyReference = vi.fn()
    const onIgnore = vi.fn()
    const host = await mount(createElement(ImportReusableSessionBanner, {
      session,
      applying: false,
      originalTextAvailable: false,
      onApplyProject,
      onApplyReference,
      onIgnore,
    }))

    const buttons = host.querySelectorAll('button')
    expect(buttons).toHaveLength(4)
    await act(async () => buttons[0].click())
    await act(async () => buttons[1].click())
    await act(async () => buttons[2].click())
    await act(async () => buttons[3].click())
    expect(onApplyProject).toHaveBeenCalledOnce()
    expect(onApplyReference).toHaveBeenNthCalledWith(1, 'quick')
    expect(onApplyReference).toHaveBeenNthCalledWith(2, 'deep')
    expect(onIgnore).toHaveBeenCalledOnce()
    expect(host.textContent).toContain('reuse.originalNotAvailable')
  })

  it('词条候选审查允许取消、改名和改分类，确认时只交回选中项', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const host = await mount(createElement(CodexImportReviewModal, {
      filename: '设定集.md',
      categories: [
        {
          ref: 'builtin:city',
          categoryId: 1,
          domain: 'humanity',
          label: '城池重镇',
          fields: [],
        },
        {
          ref: 'builtin:faction',
          categoryId: 2,
          domain: 'humanity',
          label: '势力',
          fields: [],
        },
      ],
      candidates: [
        {
          categoryRef: 'builtin:city',
          name: '临渊城',
          summary: '海门重镇',
          description: '',
          fields: {},
          tags: [],
          confidence: 0.91,
          evidence: [{ chunkIndex: 0, quote: '临渊城扼守海峡' }],
        },
        {
          categoryRef: 'builtin:faction',
          name: '海盟',
          summary: '',
          description: '',
          fields: {},
          tags: [],
          confidence: 0.6,
          evidence: [{ chunkIndex: 1, quote: '海盟七部' }],
        },
      ],
      onConfirm,
      onCancel: vi.fn(),
    }))

    const firstName = host.querySelectorAll<HTMLInputElement>('input')[0]
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      valueSetter.call(firstName, '新临渊城')
      firstName.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const secondToggle = host.querySelector<HTMLButtonElement>('button[aria-label="codexReview.deselect 海盟"]')!
    await act(async () => secondToggle.click())
    const confirm = Array.from(host.querySelectorAll('button'))
      .find(button => button.textContent?.includes('codexReview.confirmImport'))!
    await act(async () => confirm.click())

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onConfirm.mock.calls[0][0]).toHaveLength(1)
    expect(onConfirm.mock.calls[0][0][0].name).toBe('新临渊城')
    expect(host.textContent).toContain('逐字证据')
  })

  it('流水线控制栏按 phase 显示暂停、恢复和取消命令', async () => {
    const onPause = vi.fn()
    const onResume = vi.fn()
    const onCancel = vi.fn()
    const host = await mount(createElement(ImportPipelineControls, {
      phase: 'paused',
      canResume: true,
      onPause,
      onResume,
      onCancel,
    }))
    expect(host.textContent).toContain('runtime.resume')
    expect(host.textContent).toContain('runtime.cancel')
    expect(host.textContent).not.toContain('runtime.pause')
    const resume = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('runtime.resume'))!
    const cancel = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('runtime.cancel'))!
    await act(async () => resume.click())
    await act(async () => cancel.click())
    expect(onResume).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('文档准备控制器为粘贴文本生成切块和 Blob 兜底', async () => {
    const host = await mount(createElement(ImportPreparationHarness))
    const load = Array.from(host.querySelectorAll('button')).find(button => button.textContent === '载入粘贴文本')!
    const prepare = Array.from(host.querySelectorAll('button')).find(button => button.textContent === '准备解析')!
    await act(async () => load.click())
    await act(async () => prepare.click())
    expect(host.querySelector('[data-testid="state"]')?.textContent).toBe('1|1|import:prep.pastedContent')
  })
})
