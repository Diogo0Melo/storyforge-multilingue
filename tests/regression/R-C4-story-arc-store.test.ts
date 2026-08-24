import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/schema'
import type { WorkspaceScope } from '../../src/lib/types'
import { useStoryArcStore } from '../../src/stores/story-arc'

async function createWorkspace(label: string): Promise<WorkspaceScope> {
  const now = Date.now()
  const projectId = await db.projects.add({
    name: label,
    genre: 'fantasy',
    genres: ['fantasy'],
    status: 'drafting',
    description: '',
    targetWordCount: 1_000,
    createdAt: now,
    updatedAt: now,
    ownershipSchemaVersion: 1,
  } as any) as number
  const worldId = await db.worlds.add({
    projectId,
    code: `${label}-world`,
    name: `${label} world`,
    currentVersion: 1,
    createdAt: now,
    updatedAt: now,
  } as any) as number
  const workId = await db.works.add({
    projectId,
    worldId,
    title: `${label} work`,
    genres: ['fantasy'],
    status: 'drafting',
    targetWordCount: 1_000,
    createdAt: now,
    updatedAt: now,
  } as any) as number
  await db.projects.update(projectId, {
    activeWorldId: worldId,
    activeWorkId: workId,
    worldCode: `${label}-world`,
    worldVersion: 1,
  })
  return { projectId, worldId, workId }
}

async function addArc(scope: WorkspaceScope, name: string): Promise<number> {
  return db.storyArcs.add({
    projectId: scope.projectId,
    worldId: null,
    workId: scope.workId,
    name,
    type: 'sub',
    stages: '[]',
    description: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as any) as Promise<number>
}

describe.sequential('R-C4 · story arc store scope and immediate saves', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    useStoryArcStore.setState({ arcs: [], activeArcId: null, loading: false, loadedScope: null })
  })

  afterEach(() => {
    db.close()
  })

  it('loads and repairs only the active Work, resetting stale activation on project switch', async () => {
    const first = await createWorkspace('first')
    const second = await createWorkspace('second')
    const firstArcId = await addArc(first, 'Subenredo {{index}}')
    await addArc(second, 'Subenredo {{index}}')

    await useStoryArcStore.getState().loadAll(first)
    expect(useStoryArcStore.getState().arcs).toHaveLength(1)
    expect(useStoryArcStore.getState().arcs[0]).toMatchObject({ id: firstArcId, name: 'Subenredo 1' })

    await useStoryArcStore.getState().loadAll(second)
    expect(useStoryArcStore.getState().arcs).toHaveLength(1)
    expect(useStoryArcStore.getState().arcs[0].projectId).toBe(second.projectId)
    expect(useStoryArcStore.getState().activeArcId).not.toBe(firstArcId)
    expect(() => useStoryArcStore.getState().setActiveArc(firstArcId)).toThrow()
  })

  it('serializes immediate edits and rejects cross-project writes', async () => {
    const first = await createWorkspace('first')
    const second = await createWorkspace('second')
    const firstArcId = await addArc(first, 'First')
    const secondArcId = await addArc(second, 'Second')

    await useStoryArcStore.getState().loadAll(first)
    await Promise.all([
      useStoryArcStore.getState().updateArc(firstArcId, { name: 'First · 1' }),
      useStoryArcStore.getState().updateArc(firstArcId, { name: 'First · 2' }),
    ])
    expect((await db.storyArcs.get(firstArcId))?.name).toBe('First · 2')

    await expect(useStoryArcStore.getState().updateArc(secondArcId, { name: 'tampered' }))
      .rejects.toThrow()
    expect((await db.storyArcs.get(secondArcId))?.name).toBe('Second')
  })
})
