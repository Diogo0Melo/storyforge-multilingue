import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '../../src/lib/types'

const mocks = vi.hoisted(() => ({
  setAuthorRequest: vi.fn(),
  submit: vi.fn(),
  stop: vi.fn(),
  updateCandidate: vi.fn(),
  adoptCandidate: vi.fn(),
  rejectCandidate: vi.fn(),
}))

vi.mock('../../src/components/agent/useMasterCopilot', () => ({
  useMasterCopilot: () => ({
    authorRequest: '',
    setAuthorRequest: mocks.setAuthorRequest,
    events: [
      {
        id: 1,
        kind: 'message',
        role: 'assistant',
        content: '直接告诉我你想完成什么。',
        payload: '{}',
      },
      {
        id: 2,
        kind: 'task',
        content: '建立世界',
        payload: JSON.stringify({
          taskId: 'world-1',
          agentId: 'world-origin',
          status: 'completed',
        }),
      },
    ],
    pendingCandidates: [{
      event: {
        id: 3,
        kind: 'candidate',
        content: '潮汐退去后，第一座盐城从海床升起。',
        payload: '{}',
      },
      payload: {
        version: 1,
        taskId: 'world-1',
        agentId: 'world-origin',
        label: '世界来源',
        contextSources: ['projectStatus', 'worldview'],
        baseSnapshot: {},
      },
    }],
    busy: false,
    loading: false,
    submit: mocks.submit,
    stop: mocks.stop,
    updateCandidate: mocks.updateCandidate,
    adoptCandidate: mocks.adoptCandidate,
    rejectCandidate: mocks.rejectCandidate,
  }),
}))

import ChatCopilotPanel from '../../src/components/agent/ChatCopilotPanel'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ host: HTMLDivElement; root: ReturnType<typeof createRoot> }> = []

afterEach(async () => {
  vi.clearAllMocks()
  while (mounted.length) {
    const item = mounted.pop()!
    await act(async () => item.root.unmount())
    item.host.remove()
  }
})

describe('AGENT-2 · 单一主 Agent 对话入口', () => {
  it('不暴露领域标签页，由主 Agent 统一展示后台任务与可编辑候选', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    mounted.push({ host, root })
    const project = {
      id: 1,
      name: '潮汐纪元',
      genre: 'fantasy',
      genres: ['fantasy'],
    } as Project

    await act(async () => root.render(createElement(ChatCopilotPanel, {
      project,
      worldGroupId: 3,
      worldName: '盐海世界',
      onClose: vi.fn(),
    })))

    expect(host.querySelector('aside')?.getAttribute('aria-label')).toBe('agent.chat.ariaLabel')
    expect(host.textContent).toContain('agent.chat.title')
    expect(host.textContent).toContain('agent.chat.singleEntry')
    expect(host.textContent).toContain('agent.chat.banner')
    expect(host.textContent).toContain('agent.chat.pendingConfirm')
    expect(host.textContent).toContain('agent.chat.inputSources')
    expect(host.textContent).not.toContain('角色生成')
    expect(host.textContent).not.toContain('灵感反推')

    const candidate = host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="agent.chat.candidateAria"]',
    )!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!
      setter.call(candidate, '作者修订后的候选')
      candidate.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(mocks.updateCandidate).toHaveBeenCalledWith(3, '作者修订后的候选')

    const buttons = Array.from(host.querySelectorAll('button'))
    await act(async () => buttons.find(button => button.textContent?.includes('agent.chat.reject'))!.click())
    await act(async () => buttons.find(button => button.textContent?.includes('agent.chat.adopt'))!.click())
    expect(mocks.rejectCandidate).toHaveBeenCalledTimes(1)
    expect(mocks.adoptCandidate).toHaveBeenCalledTimes(1)
  })
})
