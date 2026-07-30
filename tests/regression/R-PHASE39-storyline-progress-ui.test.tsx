import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StorylineProgressPanel from '../../src/components/outline/StorylineProgressPanel'
import { db } from '../../src/lib/db/schema'
import { stringifyStages } from '../../src/lib/types'
import { useStorylineProgressStore } from '../../src/stores/storyline-progress'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const startMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/hooks/useAIStream', () => ({
  useAIStream: () => ({
    start: startMock,
    isStreaming: false,
    output: '',
    error: null,
    reset: vi.fn(),
  }),
}))

describe('Phase 39 · 动态故事线作者确认 UI', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(async () => {
    await db.delete()
    await db.open()
    useStorylineProgressStore.setState({ progress: [], crossings: [], loading: false })
    startMock.mockReset()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    db.close()
  })

  it('映射已写章节后只显示候选，作者点击采纳才落库', async () => {
    const now = Date.now()
    const projectId = await db.projects.add({
      name: '故事线 UI',
      genre: '',
      description: '',
      targetWordCount: 0,
      enableMultiWorld: false,
      createdAt: now,
      updatedAt: now,
    } as any) as number
    const volumeId = await db.outlineNodes.add({
      projectId,
      parentId: null,
      type: 'volume',
      title: '卷一',
      summary: '',
      order: 0,
      createdAt: now,
      updatedAt: now,
    } as any) as number
    const nodeId = await db.outlineNodes.add({
      projectId,
      parentId: volumeId,
      type: 'chapter',
      title: '交钥匙',
      summary: '',
      order: 0,
      createdAt: now,
      updatedAt: now,
    } as any) as number
    await db.chapters.add({
      projectId,
      outlineNodeId: nodeId,
      title: '交钥匙',
      content: '<p>林飞交出了青铜钥匙。</p>',
      wordCount: 12,
      status: 'draft',
      order: 0,
      notes: '',
      createdAt: now,
      updatedAt: now,
    } as any)
    const arcId = await db.storyArcs.add({
      projectId,
      name: '寻钥主线',
      type: 'main',
      stages: stringifyStages([{
        id: 'hand-over',
        title: '交付',
        description: '交出钥匙',
        keyEvents: [],
      }]),
      description: '',
      createdAt: now,
      updatedAt: now,
    }) as number
    const arcs = await db.storyArcs.where('projectId').equals(projectId).toArray()
    startMock.mockResolvedValue(JSON.stringify({
      progress: [{
        arcId,
        currentStageId: 'hand-over',
        status: 'active',
        progressNote: '钥匙已交付',
        involvedEntities: ['林飞', '青铜钥匙'],
        quote: '交出了青铜钥匙',
      }],
      crossings: [],
      newArcs: [],
    }))

    await act(async () => {
      root.render(createElement(StorylineProgressPanel, {
        projectId,
        arcs,
        onArcsChanged: async () => undefined,
      }))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await act(async () => {
      await vi.waitFor(() => expect(host.textContent).toContain('交钥匙'))
    })

    const analyze = Array.from(host.querySelectorAll('button'))
      .find(button => button.textContent?.includes('progress.mapChapter')) as HTMLButtonElement
    await act(async () => {
      analyze.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await act(async () => {
      await vi.waitFor(() => expect(host.textContent).toContain('钥匙已交付'))
    })
    expect(await db.storylineProgress.count()).toBe(0)

    const accept = Array.from(host.querySelectorAll('button'))
      .find(button => button.textContent?.includes('progress.accept')) as HTMLButtonElement
    await act(async () => {
      accept.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await act(async () => {
      await vi.waitFor(() => expect(db.storylineProgress.count()).resolves.toBe(1))
    })
    expect(host.textContent).toContain('progress.accepted')
    expect((await db.storylineProgress.toArray())[0]).toEqual(expect.objectContaining({
      arcId,
      status: 'active',
      progressNote: '钥匙已交付',
    }))
  })
})
