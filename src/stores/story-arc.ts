/**
 * 故事线 Store — Phase B
 * 管理全局故事线（主线+支线）的 CRUD
 */
import { create } from 'zustand'
import { db } from '../lib/db/schema'
import { getT } from '../i18n'
import type { StoryArc } from '../lib/types'
import { parseStages, stringifyStages, type StoryStage } from '../lib/types/story-arc'
import { deleteStoryArcLifecycle, updateStoryArcStagesLifecycle } from '../lib/storyline/lifecycle'
import {
  assertRecordInScope,
  readOwnedRows,
  resolveScopeLike,
  stampNewRecord,
  type WorkspaceScopeLike,
} from '../lib/world-engine/scope'
import type { WorkspaceScope } from '../lib/types/world-ownership'

const now = () => Date.now()

interface StoryArcStore {
  arcs: StoryArc[]
  activeArcId: number | null
  loading: boolean
  /** Scope represented by arcs; prevents stale selections crossing projects. */
  loadedScope: WorkspaceScope | null

  loadAll: (scope: WorkspaceScopeLike) => Promise<void>
  setActiveArc: (id: number | null) => void
  addArc: (arc: Omit<StoryArc, 'id' | 'createdAt' | 'updatedAt'>) => Promise<number>
  /** 静态阶段必须走 updateStages()，以便同步清理动态投影的悬空 stageId。 */
  updateArc: (
    id: number,
    data: Partial<Pick<StoryArc, 'name' | 'description' | 'type'>>,
  ) => Promise<void>
  deleteArc: (id: number) => Promise<void>

  /** 获取当前活跃故事线的阶段列表 */
  getActiveStages: () => StoryStage[]
  /** 更新某条故事线的阶段 */
  updateStages: (arcId: number, stages: StoryStage[]) => Promise<void>

  /** 构建用于 AI 注入的故事线上下文 */
  buildStoryArcContext: (currentChapterOrder?: number) => string
}

interface StoryArcWriteState {
  tail: Promise<void>
  nextSequence: number
  items: Map<number, Promise<void>>
}

/**
 * Edits can be fired by several immediate-save controls in the same tick.
 * Keep the chain module-local so callers do not have to coordinate writes and
 * a failed write cannot reorder a later successful one.
 */
const pendingStoryArcWrites = new Map<number, StoryArcWriteState>()

function enqueueStoryArcWrite(id: number, write: () => Promise<void>): Promise<void> {
  const state = pendingStoryArcWrites.get(id) ?? {
    tail: Promise.resolve(),
    nextSequence: 0,
    items: new Map<number, Promise<void>>(),
  }
  const sequence = state.nextSequence++
  const pending = state.tail.catch(() => undefined).then(write)
  state.tail = pending.catch(() => undefined)
  state.items.set(sequence, pending)
  pendingStoryArcWrites.set(id, state)

  // An ignored immediate-save promise must not create an unhandled rejection.
  void pending.then(
    () => {
      if (pendingStoryArcWrites.get(id) !== state) return
      state.items.delete(sequence)
      if (state.items.size === 0 && state.nextSequence === sequence + 1) {
        pendingStoryArcWrites.delete(id)
      }
    },
    () => undefined,
  )
  return pending
}

function missingStoryArcError(): Error {
  return new Error(getT()('errors-lib:editor.renameEntityMissing'))
}

function sameScope(left: WorkspaceScope | null, right: WorkspaceScope): boolean {
  return left?.projectId === right.projectId
    && left.worldId === right.worldId
    && left.workId === right.workId
}

async function resolveOwnedStoryArc(
  id: number,
  expectedScope: WorkspaceScope | null,
): Promise<{ arc: StoryArc; scope: WorkspaceScope } | null> {
  const before = await db.storyArcs.get(id)
  if (!before) return null
  const scope = expectedScope ?? await resolveScopeLike(before.projectId)
  const current = await db.storyArcs.get(id)
  if (!current || !await assertRecordInScope(scope, 'storyArcs', current, { owner: 'work' })) return null
  return { arc: current, scope }
}

export const useStoryArcStore = create<StoryArcStore>((set, get) => ({
  arcs: [],
  activeArcId: null,
  loading: false,
  loadedScope: null,

  loadAll: async (scopeInput: WorkspaceScopeLike) => {
    set({ loading: true })
    try {
      const scope = await resolveScopeLike(scopeInput)
      let arcs = await readOwnedRows<StoryArc>(scope, 'storyArcs', { owner: 'work' })
      // 修复历史脏数据：早期版本用 { count } 调用 defaultSubName，而模板插值的是
      // {{index}}，导致 "Subenredo {{index}}" 字面量被持久化。仅重命名仍含字面
      // 占位符的支线（用户手动改名的不受影响），编号取该支线在全部支线中的创建顺序。
      const subArcs = arcs
        .filter(a => a.type === 'sub')
        .sort((a, b) => (a.createdAt - b.createdAt) || ((a.id ?? 0) - (b.id ?? 0)))
      const repairs = new Map<number, string>()
      subArcs.forEach((a, i) => {
        if (a.name.includes('{{index}}')) {
          repairs.set(a.id!, a.name.replace(/\{\{index\}\}/g, String(i + 1)))
        }
      })
      if (repairs.size > 0) {
        const repairedAt = new Map<number, number>()
        await Promise.all([...repairs.entries()].map(([id, name]) =>
          enqueueStoryArcWrite(id, async () => {
            const current = await db.storyArcs.get(id)
            if (!current || !await assertRecordInScope(scope, 'storyArcs', current, { owner: 'work' })) {
              throw missingStoryArcError()
            }
            const updatedAt = now()
            await db.storyArcs.update(id, { name, updatedAt })
            repairedAt.set(id, updatedAt)
          })))
        arcs = arcs.map(a => {
          const updatedAt = repairedAt.get(a.id!)
          return updatedAt ? { ...a, name: repairs.get(a.id!)!, updatedAt } : a
        })
      }
      const currentActive = get().activeArcId
      const activeArcId = arcs.some(arc => arc.id === currentActive)
        ? currentActive
        : (arcs.find(a => a.type === 'main')?.id ?? arcs[0]?.id ?? null)
      set({ arcs, activeArcId, loadedScope: scope, loading: false })
    } catch (err) {
      console.error('[StoryArc] loadAll 失败:', err)
      set({ loading: false })
      throw err
    }
  },

  setActiveArc: (id) => {
    if (id != null && !get().arcs.some(arc => arc.id === id)) throw missingStoryArcError()
    set({ activeArcId: id })
  },

  addArc: async (arc) => {
    const scope = await resolveScopeLike(arc.projectId)
    const loadedScope = get().loadedScope
    if (loadedScope && !sameScope(loadedScope, scope)) throw missingStoryArcError()
    const newArc = stampNewRecord(
      scope,
      'storyArcs',
      { ...arc, createdAt: now(), updatedAt: now() } as StoryArc,
      { owner: 'work' },
    ) as StoryArc
    const id = await db.storyArcs.add(newArc) as number
    const arcs = get().arcs.every(item => item.projectId === newArc.projectId)
      ? [...get().arcs, { ...newArc, id }]
      : [{ ...newArc, id }]
    const currentActive = get().activeArcId
    set({
      arcs,
      activeArcId: currentActive != null && arcs.some(item => item.id === currentActive) ? currentActive : id,
      loadedScope: loadedScope ?? scope,
    })
    return id
  },

  updateArc: async (id, data) => {
    await enqueueStoryArcWrite(id, async () => {
      const resolved = await resolveOwnedStoryArc(id, get().loadedScope)
      if (!resolved) throw missingStoryArcError()
      const patch = { ...data, updatedAt: now() }
      await db.storyArcs.update(id, patch)
      set({ arcs: get().arcs.map(a => a.id === id ? { ...a, ...patch } : a) })
    })
  },

  deleteArc: async (id) => {
    await enqueueStoryArcWrite(id, async () => {
      const resolved = await resolveOwnedStoryArc(id, get().loadedScope)
      if (!resolved) throw missingStoryArcError()
      await deleteStoryArcLifecycle(id)
      const arcs = get().arcs.filter(a => a.id !== id)
      set({ arcs, activeArcId: get().activeArcId === id ? (arcs[0]?.id ?? null) : get().activeArcId })
    })
  },

  getActiveStages: () => {
    const { arcs, activeArcId } = get()
    const arc = arcs.find(a => a.id === activeArcId)
    if (!arc) return []
    return parseStages(arc.stages)
  },

  updateStages: async (arcId, stages) => {
    await enqueueStoryArcWrite(arcId, async () => {
      const resolved = await resolveOwnedStoryArc(arcId, get().loadedScope)
      if (!resolved) throw missingStoryArcError()
      const stagesJson = stringifyStages(stages)
      await updateStoryArcStagesLifecycle({
        arcId,
        stages: stagesJson,
        validStageIds: stages.map(stage => stage.id),
      })
      set({
        arcs: get().arcs.map(arc => arc.id === arcId
          ? { ...arc, stages: stagesJson, updatedAt: now() }
          : arc),
      })
    })
  },

  buildStoryArcContext: (currentChapterOrder?: number) => {
    const { arcs } = get()
    if (!arcs.length) return ''

    const parts: string[] = ['【全局故事线】']

    for (const arc of arcs) {
      const stages = parseStages(arc.stages)
      if (!stages.length) continue

      const typeLabel = arc.type === 'main' ? '主线' : '支线'
      parts.push(`\n[${typeLabel}] ${arc.name}${arc.description ? `：${arc.description}` : ''}`)

      for (let i = 0; i < stages.length; i++) {
        const s = stages[i]
        // 标注当前所处阶段
        const marker = ''
        if (currentChapterOrder !== undefined && s.startVolume !== undefined && s.endVolume !== undefined) {
          // 简化：暂用卷序号近似
        }
        const eventsStr = s.keyEvents.length > 0 ? ` | 关键事件：${s.keyEvents.join('、')}` : ''
        const tpStr = s.turningPoint ? ` | 转折：${s.turningPoint}` : ''
        parts.push(`  ${i + 1}. ${s.title}${marker}：${s.description}${eventsStr}${tpStr}`)
      }
    }

    return parts.join('\n')
  },
}))
