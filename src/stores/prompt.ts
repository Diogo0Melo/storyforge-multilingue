import { create } from 'zustand'
import { db } from '../lib/db/schema'
import { getT } from '../i18n'
import type { PromptTemplate, PromptModuleKey } from '../lib/types/prompt'
import type { PromptSeed } from '../lib/ai/prompt-seed-type'

/**
 * 系统 seed 运行时缓存（bundle 瘦身）：seed 语料不进 entry bundle，由模块求值期
 * 启动的共享 preload 动态加载后就绪；init() 与 getActive 兜底共用同一份缓存。
 * preload 完成前为 null —— 此时 getActive 的最后兜底退化为抛错。
 * 回归环境可经 injectSystemSeedsForTest 在任何测试前同步注入真实语料。
 */
let systemSeedsCache: PromptSeed[] | null = null
let seedsPreload: Promise<PromptSeed[]> | null = null

/**
 * 共享的 seed 预加载：并行加载两个 seed 语料模块并合并缓存。
 * 模块求值期即启动，争取在 init() 之前（含未经 init 的同步 getActive 调用）就绪；
 * init() 直接 await 同一 promise，不重复加载。加载失败时清空自身以便下次重试。
 */
function preloadSystemSeeds(): Promise<PromptSeed[]> {
  if (seedsPreload) return seedsPreload
  seedsPreload = Promise.all([
    import('../lib/ai/prompt-seeds'),
    import('../lib/ai/prompt-seeds-novel'),
  ]).then(([systemSeeds, novelSeeds]) => {
    const combined = [...systemSeeds.SYSTEM_PROMPT_SEEDS, ...novelSeeds.NOVEL_CONTENT_PROMPT_SEEDS]
    // 不覆盖约定：测试注入可能已在先（injectSystemSeedsForTest），晚到的解析不得替换已注入语料
    if (!systemSeedsCache) systemSeedsCache = combined
    return systemSeedsCache ?? combined
  }).catch((err: unknown) => {
    seedsPreload = null // 加载失败不缓存 rejected promise，允许后续调用重试
    throw err
  })
  return seedsPreload
}

// 模块求值期启动预加载：让 init() 之前的同步 getActive 兜底尽早可用
preloadSystemSeeds()

/**
 * [仅测试] 同步注入系统 seed 语料 —— 只供回归环境（tests/setup.ts）在任何测试
 * 运行前恢复「getActive 无需 init 即可同步兜底」的旧契约。生产代码禁止调用：
 * 生产路径始终走模块求值期 preload + init()，seed 语料不进 entry bundle。
 * 注入后 preload 的晚到解析不会覆盖已注入语料（见 preloadSystemSeeds 不覆盖约定）。
 */
export function injectSystemSeedsForTest(seeds: PromptSeed[]): void {
  systemSeedsCache = seeds
}

interface PromptStore {
  templates: PromptTemplate[]
  loaded: boolean

  /** 启动时调用一次：从 IndexedDB 加载，若空则注入系统 seed。 */
  init(): Promise<void>

  /** 同步获取某 moduleKey 当前激活的模板。
   *  正常情况从内存里取；若没找到，fallback 到模块求值期预加载的 seed 缓存兜底。
   */
  getActive(key: PromptModuleKey): PromptTemplate

  /** 保存（新增或更新）一个模板，并刷新 in-memory 列表。 */
  saveTemplate(t: PromptTemplate): Promise<number>

  /** 从已有模板克隆一份给用户编辑（scope='user'，isActive=false）。 */
  cloneTemplate(id: number, newName?: string): Promise<number>

  /** 把某模板设为对应 moduleKey 的激活模板（其他同 key 的取消激活）。 */
  setActive(id: number): Promise<void>

  /** 删除一个模板并刷新列表（UI 层不得直接 db.delete，必须走这里）。 */
  deleteTemplate(id: number): Promise<void>

  /** 强制重新从 DB 加载。 */
  reload(): Promise<void>
}

export const usePromptStore = create<PromptStore>((set, get) => ({
  templates: [],
  loaded: false,

  init: async () => {
    if (get().loaded) return
    // bundle 瘦身：seed 语料走共享 preload（模块求值期已启动）；必须在任何 IndexedDB 访问前就绪
    const allSystemSeeds = await preloadSystemSeeds()
    const existing = await db.promptTemplates.toArray()
    const now = Date.now()

    if (existing.length === 0) {
      // 全新库：注入全部 seed
      const rows: PromptTemplate[] = allSystemSeeds.map(seed => ({
        ...seed,
        createdAt: now,
        updatedAt: now,
      }))
      await db.promptTemplates.bulkAdd(rows)
    } else {
      // 已有库：补缺 seed + 更新现有 system seed 的内容（保留用户的 isActive 选择）
      // Phase 13: 同一 moduleKey 下可能有多套 seed（不同 genre），用 name 作为唯一键
      const existingSystemMap = new Map(
        existing.filter(t => t.scope === 'system').map(t => [t.name, t])
      )

      for (const seed of allSystemSeeds) {
        const old = existingSystemMap.get(seed.name)
        if (!old) {
          // 缺 → 补
          await db.promptTemplates.add({ ...seed, createdAt: now, updatedAt: now })
        } else {
          // 已有 → 用代码里的最新内容刷新（除了 isActive，保留用户的激活选择）
          const refreshed: Partial<PromptTemplate> = {
            name: seed.name,
            moduleKey: seed.moduleKey,
            description: seed.description,
            systemPrompt: seed.systemPrompt,
            userPromptTemplate: seed.userPromptTemplate,
            variables: seed.variables,
            promptType: seed.promptType,
            modelOverride: seed.modelOverride,
            isDefault: seed.isDefault,
            genres: seed.genres,
            parameters: seed.parameters,
            examples: seed.examples,
            lengthMode: seed.lengthMode,
            continuityMode: seed.continuityMode,
            assetId: seed.assetId,
            variableBindings: seed.variableBindings,
            applicability: seed.applicability,
            updatedAt: now,
          }
          await db.promptTemplates.update(old.id!, refreshed)
        }
      }
    }

    const reloaded = await db.promptTemplates.toArray()
    set({ templates: reloaded, loaded: true })
  },

  getActive: (key: PromptModuleKey): PromptTemplate => {
    const list = get().templates
    // 优先用户激活的
    const userActive = list.find(t => t.moduleKey === key && t.scope === 'user' && t.isActive)
    if (userActive) return userActive
    // 其次系统激活的
    const sysActive = list.find(t => t.moduleKey === key && t.scope === 'system' && t.isActive)
    if (sysActive) return sysActive
    // 再次任意同 key 模板
    const any = list.find(t => t.moduleKey === key)
    if (any) return any
    // 最后兜底：seed 缓存（DB 读取失败 / init() 未完成时保命用；preload 未就绪则抛错）
    const seed = systemSeedsCache?.find(s => s.moduleKey === key)
    if (seed) {
      const now = Date.now()
      return { ...seed, createdAt: now, updatedAt: now }
    }
    throw new Error(`[prompt-store] no template found for moduleKey: ${key}`)
  },

  saveTemplate: async (t: PromptTemplate): Promise<number> => {
    const now = Date.now()
    const row: PromptTemplate = { ...t, updatedAt: now, createdAt: t.createdAt || now }
    const id = await db.promptTemplates.put(row)
    await get().reload()
    return id as number
  },

  cloneTemplate: async (id: number, newName?: string): Promise<number> => {
    const src = await db.promptTemplates.get(id)
    if (!src) throw new Error(`template ${id} not found`)
    const now = Date.now()
    const { id: _drop, ...rest } = src
    void _drop
    const cloneRow: PromptTemplate = {
      ...rest,
      scope: 'user',
      name: newName || `${src.name} (${getT()('common:defaults.promptCloneSuffix')})`,
      parentId: src.id,
      isActive: false,
      createdAt: now,
      updatedAt: now,
    }
    const newId = await db.promptTemplates.add(cloneRow)
    await get().reload()
    return newId as number
  },

  setActive: async (id: number): Promise<void> => {
    const target = await db.promptTemplates.get(id)
    if (!target) throw new Error(`template ${id} not found`)
    // 同 moduleKey 的其他模板取消激活
    const siblings = await db.promptTemplates.where('moduleKey').equals(target.moduleKey).toArray()
    const now = Date.now()
    await db.transaction('rw', db.promptTemplates, async () => {
      for (const s of siblings) {
        if (s.id === id) {
          await db.promptTemplates.update(s.id!, { isActive: true, updatedAt: now })
        } else if (s.isActive) {
          await db.promptTemplates.update(s.id!, { isActive: false, updatedAt: now })
        }
      }
    })
    await get().reload()
  },

  deleteTemplate: async (id: number): Promise<void> => {
    await db.promptTemplates.delete(id)
    await get().reload()
  },

  reload: async () => {
    const all = await db.promptTemplates.toArray()
    set({ templates: all })
  },
}))
