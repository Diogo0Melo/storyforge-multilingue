import { create } from 'zustand'
import { getShortListFormatter } from '../i18n'
import { db } from '../lib/db/schema'
import {
  parseCultivationStages,
  validateCultivationStages,
  type CultivationSystem,
} from '../lib/types/cultivation'
import {
  clearCultivationSystemReferences,
  clearRemovedCultivationStageReferences,
  refreshCultivationProgressStageSources,
} from '../lib/cultivation/lifecycle'
import { refreshSettingAssertionSourceStatus } from '../lib/fact-ledger/setting-assertions'
import { transactionTablesForReferences } from '../lib/registry/lifecycle'

interface CultivationStore {
  systems: CultivationSystem[]
  loading: boolean
  loadAll: (projectId: number) => Promise<void>
  addSystem: (system: Omit<CultivationSystem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<number>
  updateSystem: (id: number, patch: Partial<CultivationSystem>) => Promise<void>
  deleteSystem: (id: number) => Promise<void>
}

const now = () => Date.now()

export const useCultivationStore = create<CultivationStore>((set, get) => ({
  systems: [],
  loading: false,

  loadAll: async (projectId) => {
    set({ loading: true })
    const systems = await db.cultivationSystems.where('projectId').equals(projectId).toArray()
    set({ systems, loading: false })
  },

  addSystem: async (system) => {
    const validation = validateCultivationStages(parseCultivationStages(system.stages))
    if (!validation.valid) throw new Error(getShortListFormatter().format(validation.errors))
    const timestamp = now()
    const row = { ...system, createdAt: timestamp, updatedAt: timestamp }
    const id = await db.cultivationSystems.add(row) as number
    set({ systems: [...get().systems, { ...row, id }] })
    return id
  },

  updateSystem: async (id, patch) => {
    const current = get().systems.find(system => system.id === id) ?? await db.cultivationSystems.get(id)
    if (!current) return
    let removedStageIds = new Set<string>()
    if (patch.stages !== undefined) {
      const nextStages = parseCultivationStages(patch.stages)
      const validation = validateCultivationStages(nextStages)
      if (!validation.valid) throw new Error(getShortListFormatter().format(validation.errors))
      const nextIds = new Set(nextStages.map(stage => stage.id))
      removedStageIds = new Set(parseCultivationStages(current.stages)
        .map(stage => stage.id)
        .filter(stageId => !nextIds.has(stageId)))
    }
    const next = { ...patch, updatedAt: now() }
    await db.transaction('rw', transactionTablesForReferences('cultivationSystems'), async () => {
      await db.cultivationSystems.update(id, next)
      await clearRemovedCultivationStageReferences(current.projectId, id, removedStageIds)
      if (patch.stages !== undefined) {
        await refreshCultivationProgressStageSources({
          projectId: current.projectId,
          systemId: id,
          previousStages: current.stages,
          nextStages: patch.stages,
        })
      }
    })
    await refreshSettingAssertionSourceStatus({
      projectId: current.projectId,
      table: 'cultivationSystems',
      recordId: id,
      changedFields: Object.keys(patch),
    })
    set({ systems: get().systems.map(system => system.id === id ? { ...system, ...next } : system) })
  },

  deleteSystem: async (id) => {
    const current = get().systems.find(system => system.id === id) ?? await db.cultivationSystems.get(id)
    if (!current) return
    await db.transaction('rw', transactionTablesForReferences('cultivationSystems'), async () => {
      await clearCultivationSystemReferences(current.projectId, new Set([id]))
      await db.cultivationSystems.delete(id)
    })
    set({ systems: get().systems.filter(system => system.id !== id) })
  },
}))
