import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { createSimulationCheckpoint, createSimulationSession } from '../../src/lib/simulation/runtime'
import { useInteractionGamePlayerStore } from '../../src/stores/interaction-game-player'
import type { WorkspaceScope } from '../../src/lib/types'

describe('CHATGAME-2C · player lifecycle guards', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(() => db.close())

  it('does not pass legacy CHATGAME-1 sessions to checkpoint, fork, or delete APIs', async () => {
    const projectId = await db.projects.add({
      name: 'CHATGAME-2C guards', genre: 'drama', genres: ['drama'], status: 'drafting',
      description: '', targetWordCount: 10_000, enableMultiWorld: false, createdAt: 1, updatedAt: 1,
    } as any) as number
    const scope: WorkspaceScope = { projectId, worldId: 1, workId: 1 }
    const legacy = await createSimulationSession({
      projectId,
      kind: 'chatgame',
      title: '旧聊天存档',
    })
    const checkpoint = await createSimulationCheckpoint({ sessionId: legacy.id!, name: '旧检查点' })
    const store = useInteractionGamePlayerStore.getState()

    await store.load(scope, null)
    await expect(useInteractionGamePlayerStore.getState().saveCheckpoint('不应保存')).rejects.toThrow('只读兼容')
    await expect(useInteractionGamePlayerStore.getState().forkCurrent()).rejects.toThrow('只读兼容')
    await expect(useInteractionGamePlayerStore.getState().forkCheckpoint(checkpoint.id!)).rejects.toThrow('只读兼容')
    await expect(useInteractionGamePlayerStore.getState().remove(legacy.id!)).rejects.toThrow('只读兼容')
    expect(await db.simulationSessions.get(legacy.id!)).toBeDefined()
  })
})
