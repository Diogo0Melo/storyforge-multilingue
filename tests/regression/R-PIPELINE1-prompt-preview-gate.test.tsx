import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PromptPreviewGate from '../../src/components/shared/PromptPreviewGate'
import type { ChatMessage } from '../../src/lib/types'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ host: HTMLDivElement; root: ReturnType<typeof createRoot> }> = []
const original: ChatMessage[] = [
  { role: 'system', content: '守住世界宪法' },
  { role: 'user', content: '生成第一章章纲' },
]

async function mount(onConfirm = vi.fn()) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  mounted.push({ host, root })
  await act(async () => root.render(createElement(PromptPreviewGate, {
    messages: original,
    onBack: vi.fn(),
    onConfirm,
  })))
  return { host, root, onConfirm }
}

afterEach(async () => {
  while (mounted.length > 0) {
    const item = mounted.pop()!
    await act(async () => item.root.unmount())
    item.host.remove()
  }
})

describe('PIPELINE-1 · 最终提示词预览闸门', () => {
  it('显示最终 system/user 消息，编辑后只提交本次副本', async () => {
    const { host, onConfirm } = await mount()
    const textareas = host.querySelectorAll('textarea')
    expect(textareas).toHaveLength(2)
    expect(textareas[0].value).toBe('守住世界宪法')
    expect(host.textContent).toContain('promptPreview.description')

    await act(async () => {
      const userPrompt = textareas[1]
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!
      setter.call(userPrompt, '生成第一章章纲，并避免巧合推进')
      userPrompt.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const send = Array.from(host.querySelectorAll('button'))
      .find(button => button.textContent?.includes('promptPreview.send'))!
    await act(async () => send.click())

    expect(onConfirm).toHaveBeenCalledWith([
      { role: 'system', content: '守住世界宪法' },
      { role: 'user', content: '生成第一章章纲，并避免巧合推进' },
    ])
    expect(original[1].content).toBe('生成第一章章纲')
  })

  it('编辑为空时禁止发送，重新挂载恢复原始内容', async () => {
    const first = await mount()
    const userPrompt = first.host.querySelectorAll('textarea')[1]
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!
      setter.call(userPrompt, ' ')
      userPrompt.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const send = Array.from(first.host.querySelectorAll('button'))
      .find(button => button.textContent?.includes('promptPreview.send'))!
    expect(send.disabled).toBe(true)

    const second = await mount()
    expect(second.host.querySelectorAll('textarea')[1].value).toBe('生成第一章章纲')
  })

  it('切换到新的输入快照时销毁上一请求的临时编辑', async () => {
    const current = await mount()
    const userPrompt = current.host.querySelectorAll('textarea')[1]
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!
      setter.call(userPrompt, '上一请求的临时编辑')
      userPrompt.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const nextMessages: ChatMessage[] = [
      { role: 'system', content: '新的系统约束' },
      { role: 'user', content: '新的请求快照' },
    ]
    await act(async () => {
      current.root.render(createElement(PromptPreviewGate, {
        messages: nextMessages,
        onBack: vi.fn(),
        onConfirm: vi.fn(),
      }))
      await Promise.resolve()
    })

    expect(current.host.querySelectorAll('textarea')[1].value).toBe('新的请求快照')
  })
})
