/**
 * 故事线 Store — Phase B
 * 管理全局故事线（主线+支线）的 CRUD
 */
import { create } from 'zustand'
import { db } from '../lib/db/schema'
import type { StoryArc } from '../lib/types'
import { parseStages, stringifyStages, type StoryStage } from '../lib/types/story-arc'
import { deleteStoryArcLifecycle, updateStoryArcStagesLifecycle } from '../lib/storyline/lifecycle'

const now = () => Date.now()

interface StoryArcStore {
  arcs: StoryArc[]
  activeArcId: number | null
  loading: boolean

  loadAll: (projectId: number) => Promise<void>
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

export const useStoryArcStore = create<StoryArcStore>((set, get) => ({
  arcs: [],
  activeArcId: null,
  loading: false,

  loadAll: async (projectId: number) => {
    set({ loading: true })
    try {
      let arcs = await db.storyArcs.where('projectId').equals(projectId).toArray()
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
        await Promise.all([...repairs.entries()].map(([id, name]) =>
          db.storyArcs.update(id, { name, updatedAt: now() })))
        arcs = arcs.map(a => repairs.has(a.id!) ? { ...a, name: repairs.get(a.id!)!, updatedAt: now() } : a)
      }
      set({ arcs, loading: false })
      // 默认选中主线
      if (arcs.length > 0 && !get().activeArcId) {
        const main = arcs.find(a => a.type === 'main')
        set({ activeArcId: main?.id ?? arcs[0].id ?? null })
      }
    } catch (err) {
      console.error('[StoryArc] loadAll 失败:', err)
      set({ loading: false })
    }
  },

  setActiveArc: (id) => set({ activeArcId: id }),

  addArc: async (arc) => {
    const newArc: StoryArc = { ...arc, createdAt: now(), updatedAt: now() }
    const id = await db.storyArcs.add(newArc) as number
    set({ arcs: [...get().arcs, { ...newArc, id }] })
    return id
  },

  updateArc: async (id, data) => {
    const patch = { ...data, updatedAt: now() }
    await db.storyArcs.update(id, patch)
    set({ arcs: get().arcs.map(a => a.id === id ? { ...a, ...patch } : a) })
  },

  deleteArc: async (id) => {
    await deleteStoryArcLifecycle(id)
    const arcs = get().arcs.filter(a => a.id !== id)
    set({ arcs, activeArcId: get().activeArcId === id ? (arcs[0]?.id ?? null) : get().activeArcId })
  },

  getActiveStages: () => {
    const { arcs, activeArcId } = get()
    const arc = arcs.find(a => a.id === activeArcId)
    if (!arc) return []
    return parseStages(arc.stages)
  },

  updateStages: async (arcId, stages) => {
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
