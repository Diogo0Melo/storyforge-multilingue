/**
 * R-ORACLE2 · ProjectStorageFolderField 动态权限错误必须可被无障碍播报(Oracle remediation)
 *
 * 回归边界:
 * - 文件夹选择后被拒绝授权时,错误文案以 role="alert"(隐含 aria-live=assertive)
 *   挂载,屏幕阅读器可感知动态出现;
 * - 视觉呈现不变(仍是原有错误段落样式,仅增加语义属性);
 * - 授权通过的正向路径不得误报警。
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProjectStorageFolderField from '../../src/components/shared/ProjectStorageFolderField'
import i18n from '../../src/i18n'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const folderMocks = vi.hoisted(() => ({
  handle: { name: 'pasta-negada', kind: 'directory' } as unknown as FileSystemDirectoryHandle,
  pick: vi.fn(),
  ensure: vi.fn(),
}))

vi.mock('../../src/lib/storage/folder-backup', () => ({
  isFSASupported: () => true,
  pickFolder: folderMocks.pick,
  ensureFolderPermission: folderMocks.ensure,
}))

const mounted: Array<{ host: HTMLDivElement; root: ReturnType<typeof createRoot> }> = []

async function mount(element: React.ReactNode) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  mounted.push({ host, root })
  await act(async () => root.render(element))
  return host
}

afterEach(async () => {
  while (mounted.length > 0) {
    const item = mounted.pop()!
    await act(async () => item.root.unmount())
    item.host.remove()
  }
  folderMocks.pick.mockReset()
  folderMocks.ensure.mockReset()
})

describe('R-ORACLE2 · ProjectStorageFolderField accessible permission error', () => {
  it('权限被拒时以 role=alert 播报错误,且不触发 onChange', async () => {
    folderMocks.pick.mockResolvedValue(folderMocks.handle)
    folderMocks.ensure.mockResolvedValue(false)
    const onChange = vi.fn()
    const host = await mount(createElement(ProjectStorageFolderField, { value: null, onChange }))

    const choose = host.querySelector('button')!
    await act(async () => { choose.click(); await new Promise(resolve => setTimeout(resolve, 0)) })

    const alert = host.querySelector('[role="alert"]')
    expect(alert).toBeTruthy()
    expect(alert!.textContent).toBe(i18n.t('settings:projectStorage.noticePermissionDenied'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('授权通过的正向路径不出现 alert', async () => {
    folderMocks.pick.mockResolvedValue(folderMocks.handle)
    folderMocks.ensure.mockResolvedValue(true)
    const onChange = vi.fn()
    const host = await mount(createElement(ProjectStorageFolderField, { value: null, onChange }))

    const choose = host.querySelector('button')!
    await act(async () => { choose.click(); await new Promise(resolve => setTimeout(resolve, 0)) })

    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(onChange).toHaveBeenCalledWith(folderMocks.handle)
  })
})
