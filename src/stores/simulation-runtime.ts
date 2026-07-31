import { create } from 'zustand'
import { db } from '../lib/db/schema'
import {
  appendSimulationEvent,
  branchSimulationSession,
  createSimulationCheckpoint,
  createSimulationSession,
  deleteSimulationSession,
  readSimulationState,
  resolveSimulationDice,
} from '../lib/simulation/runtime'
import {
  EMPTY_SIMULATION_STATE,
  type SimulationCheckpoint,
  type SimulationEvent,
  type SimulationRuntimeState,
  type SimulationSession,
  type SimulationSessionKind,
} from '../lib/types'
import i18n from '../i18n/i18n'

interface SimulationRuntimeStore {
  projectId: number | null
  sessions: SimulationSession[]
  selectedSessionId: number | null
  events: SimulationEvent[]
  checkpoints: SimulationCheckpoint[]
  runtimeState: SimulationRuntimeState
  loading: boolean
  error: string
  load(projectId: number): Promise<void>
  select(sessionId: number | null): Promise<void>
  createSession(input: {
    projectId: number
    worldGroupId: number | null
    kind: SimulationSessionKind
    title: string
    seed?: string
  }): Promise<number>
  advanceTime(amount: number): Promise<void>
  recordNarrative(text: string): Promise<void>
  rollDice(expression: string): Promise<void>
  checkpoint(name: string): Promise<void>
  branch(title: string): Promise<number>
  remove(sessionId: number): Promise<void>
}

async function readSessionDetails(sessionId: number) {
  const [events, checkpoints, runtimeState] = await Promise.all([
    db.simulationEvents.where('sessionId').equals(sessionId).toArray(),
    db.simulationCheckpoints.where('sessionId').equals(sessionId).toArray(),
    readSimulationState(sessionId),
  ])
  events.sort((left, right) => left.sequence - right.sequence)
  checkpoints.sort((left, right) => right.createdAt - left.createdAt)
  return { events, checkpoints, runtimeState }
}

export const useSimulationRuntimeStore = create<SimulationRuntimeStore>((set, get) => {
  const refreshSelected = async () => {
    const sessionId = get().selectedSessionId
    if (sessionId == null) return
    const details = await readSessionDetails(sessionId)
    set(details)
  }

  return {
    projectId: null,
    sessions: [],
    selectedSessionId: null,
    events: [],
    checkpoints: [],
    runtimeState: structuredClone(EMPTY_SIMULATION_STATE),
    loading: false,
    error: '',

    load: async projectId => {
      set({ loading: true, error: '' })
      try {
        const sessions = await db.simulationSessions.where('projectId').equals(projectId).toArray()
        sessions.sort((left, right) => right.updatedAt - left.updatedAt)
        const current = get().projectId === projectId ? get().selectedSessionId : null
        const selectedSessionId = current != null && sessions.some(row => row.id === current)
          ? current
          : sessions[0]?.id ?? null
        set({ projectId, sessions, selectedSessionId, loading: false })
        if (selectedSessionId != null) await refreshSelected()
        else set({
          events: [],
          checkpoints: [],
          runtimeState: structuredClone(EMPTY_SIMULATION_STATE),
        })
      } catch (error) {
        set({ loading: false, error: error instanceof Error ? error.message : String(error) })
      }
    },

    select: async sessionId => {
      set({ selectedSessionId: sessionId, error: '' })
      if (sessionId == null) {
        set({
          events: [],
          checkpoints: [],
          runtimeState: structuredClone(EMPTY_SIMULATION_STATE),
        })
        return
      }
      try {
        set(await readSessionDetails(sessionId))
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) })
      }
    },

    createSession: async input => {
      const session = await createSimulationSession({
        ...input,
        canonSnapshot: {
          version: 1,
          sources: [],
          note: 'SIM-1A 核心会话；结构化 Canon 选择将在 SIM-1B 接入。',
        },
      })
      await get().load(input.projectId)
      await get().select(session.id!)
      return session.id!
    },

    advanceTime: async amount => {
      const sessionId = get().selectedSessionId
      if (sessionId == null) throw new Error(i18n.t('errors.simulation.selectSessionFirst'))
      await appendSimulationEvent({
        sessionId,
        type: 'time.advanced',
        payload: { amount },
      })
      await refreshSelected()
    },

    recordNarrative: async text => {
      const sessionId = get().selectedSessionId
      if (sessionId == null) throw new Error(i18n.t('errors.simulation.selectSessionFirst'))
      await appendSimulationEvent({
        sessionId,
        type: 'narrative.recorded',
        payload: { text },
      })
      await refreshSelected()
    },

    rollDice: async expression => {
      const sessionId = get().selectedSessionId
      if (sessionId == null) throw new Error(i18n.t('errors.simulation.selectSessionFirst'))
      await resolveSimulationDice({ sessionId, expression })
      await refreshSelected()
    },

    checkpoint: async name => {
      const sessionId = get().selectedSessionId
      if (sessionId == null) throw new Error(i18n.t('errors.simulation.selectSessionFirst'))
      await createSimulationCheckpoint({ sessionId, name })
      await refreshSelected()
    },

    branch: async title => {
      const sessionId = get().selectedSessionId
      if (sessionId == null) throw new Error(i18n.t('errors.simulation.selectSessionFirst'))
      const parent = get().sessions.find(row => row.id === sessionId)
      if (!parent) throw new Error(i18n.t('errors.simulation.sessionNotFound'))
      const child = await branchSimulationSession({
        parentSessionId: sessionId,
        throughSequence: get().runtimeState.lastSequence,
        title,
      })
      await get().load(parent.projectId)
      await get().select(child.id!)
      return child.id!
    },

    remove: async sessionId => {
      const projectId = get().projectId
      await deleteSimulationSession(sessionId)
      if (projectId != null) await get().load(projectId)
    },
  }
})
