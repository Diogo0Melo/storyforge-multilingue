import { create } from 'zustand'
import { db } from '../lib/db/schema'
import { getT, getSupportedUiLang } from '../i18n'
import type { Project, CreateProjectInput } from '../lib/types'
import { migrateGenre } from '../lib/types'
import { normalizeContentLanguage } from '../lib/ai/content-language'
import { requireBackupBefore } from '../lib/safety/require-backup-before'
import { cascadeDeleteProject } from '../lib/registry/lifecycle'
import {
  generateWorldCode,
  hasShareableWorldIdentity,
  withWorldIdentity,
} from '../lib/product/world-identity'
import { ensureWorkspaceOwnership } from '../lib/world-engine/ownership'
import { updateProjectAndActiveWork } from '../lib/world-engine/works'
import { generateWorkspaceUid } from '../lib/memory/identity'
import { clearProjectFolderHandle } from '../lib/storage/folder-handle-store'

async function ensureWorldIdentity(project: Project): Promise<Project> {
  if (hasShareableWorldIdentity(project)) return project
  if (!project.id) return withWorldIdentity(project)

  // Legacy projects are upgraded in a transaction so concurrent entry points
  // cannot assign different world codes to the same project.
  return db.transaction('rw', db.projects, async () => {
    const latest = await db.projects.get(project.id!)
    if (!latest) return withWorldIdentity(project)
    if (hasShareableWorldIdentity(latest)) return migrateGenre(latest)
    const normalized = withWorldIdentity(migrateGenre(latest))
    await db.projects.update(project.id!, {
      worldCode: normalized.worldCode,
      worldVersion: normalized.worldVersion,
    })
    return normalized
  })
}

interface ProjectStore {
  projects: Project[]
  currentProjectId: number | null
  loading: boolean

  loadProjects: () => Promise<void>
  loadProject: (id: number) => Promise<Project | undefined>
  createProject: (data: CreateProjectInput) => Promise<number>
  updateProject: (id: number, data: Partial<Project>) => Promise<void>
  deleteProject: (id: number) => Promise<void>
  setCurrentProject: (id: number | null) => void
}

interface ProjectWriteQueueItem {
  sequence: number
  promise: Promise<void>
}

interface ProjectWriteQueueState {
  /** Always-resolving execution tail; a failed item must not block later writes. */
  tail: Promise<void>
  nextSequence: number
  items: Map<number, ProjectWriteQueueItem>
}

// Content-language writes are also initiated outside the panel (for example by
// imports or tests), so the queue belongs to the store module rather than to a
// component. A failed item is swallowed only for the purpose of advancing the
// queue; its own promise and the flush still expose the original error.
const pendingProjectWrites = new Map<number, ProjectWriteQueueState>()

function enqueueProjectWrite(projectId: number, write: () => Promise<void>): Promise<void> {
  const state = pendingProjectWrites.get(projectId) ?? {
    tail: Promise.resolve(),
    nextSequence: 0,
    items: new Map<number, ProjectWriteQueueItem>(),
  }
  const sequence = state.nextSequence++
  const current = state.tail.then(write)
  state.tail = current.catch(() => undefined)
  state.items.set(sequence, { sequence, promise: current })
  pendingProjectWrites.set(projectId, state)

  // Keep the rejection handled internally so an ignored updateProject call
  // cannot create an unhandled-rejection event. The returned promise remains
  // rejected for callers that explicitly await the write.
  void current.then(
    () => {
      if (pendingProjectWrites.get(projectId) === state) {
        state.items.delete(sequence)
        if (state.items.size === 0 && state.nextSequence === sequence + 1) {
          pendingProjectWrites.delete(projectId)
        }
      }
    },
    () => undefined,
  )
  return current
}

/**
 * Wait for content-language writes already queued for a project.
 * No project id deliberately means that there is no project queue to await.
 */
export async function flushPendingProjectWrites(projectId?: number | null): Promise<void> {
  if (projectId == null) return

  while (true) {
    const state = pendingProjectWrites.get(projectId)
    if (!state) return
    const boundary = state.nextSequence
    const items = [...state.items.values()]

    if (items.length > 0) {
      const results = await Promise.allSettled(items.map(item => item.promise))
      const failed = results.find(result => result.status === 'rejected')

      // Consume this flush boundary's items. Failed items are retained until a
      // flush observes them, so a generation cannot silently pass an earlier
      // failed write merely because a later write succeeded.
      if (pendingProjectWrites.get(projectId) === state) {
        for (const item of items) {
          if (item.sequence < boundary) state.items.delete(item.sequence)
        }
        if (state.items.size === 0 && state.nextSequence === boundary) {
          pendingProjectWrites.delete(projectId)
        }
      }

      if (failed?.status === 'rejected') throw failed.reason
    }

    // A write may have arrived while this flush was awaiting. Observe the
    // newest queue boundary before allowing a generation to read IndexedDB.
    if (pendingProjectWrites.get(projectId) === state && state.nextSequence === boundary) return
  }
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  currentProjectId: null,
  loading: false,

  loadProjects: async () => {
    set({ loading: true })
    const raw = await db.projects.orderBy('updatedAt').reverse().toArray()
    // 兼容旧数据：确保每条记录都有 genres[] 和 status
    const projects = await Promise.all(raw.map(rawProject => ensureWorldIdentity(migrateGenre(rawProject))))
    set({ projects, loading: false })
  },

  loadProject: async (id: number) => {
    const raw = await db.projects.get(id)
    if (!raw) return undefined
    // WORLD-2C C2: projectId-only legacy routes resolve through one ownership
    // service before any project-scoped stores begin reading the workspace.
    const project = migrateGenre((await ensureWorkspaceOwnership(id)).project)
    const projects = get().projects
    const exists = projects.some(p => p.id === id)
    const nextProjects = exists
      ? projects.map(p => p.id === id ? project : p)
      : [...projects, project].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    set({ currentProjectId: id, projects: nextProjects })
    return project
  },

  createProject: async (data: CreateProjectInput) => {
    const now = Date.now()
    // WS-2/G1: normalize caller-supplied contentLanguage; never persist unsupported values
    const contentLanguage = normalizeContentLanguage(data.contentLanguage) ?? getSupportedUiLang()
    const id = await db.projects.add({
      ...data,
      genres: data.genres ?? [],
      status: data.status ?? 'drafting',
      workspaceUid: data.workspaceUid ?? generateWorkspaceUid(),
      worldCode: data.worldCode ?? generateWorldCode(),
      worldVersion: data.worldVersion ?? 1,
      contentLanguage,
      createdAt: now,
      updatedAt: now,
    } as Project)
    await ensureWorkspaceOwnership(id as number)
    await get().loadProjects()
    return id as number
  },

  updateProject: (id: number, data: Partial<Project>) => {
    const result = (async () => {
      const hasContentLanguage = Object.prototype.hasOwnProperty.call(data, 'contentLanguage')
      const otherChanges: Partial<Project> = { ...data }
      delete otherChanges.contentLanguage

      // WS-2/G1: normalize once before a language write enters the per-project
      // FIFO. Unsupported values never reach IndexedDB.
      const normalizedContentLanguage = hasContentLanguage
        ? normalizeContentLanguage(data.contentLanguage) ?? getSupportedUiLang()
        : undefined

      const write = async () => {
        if (hasContentLanguage) {
          await db.projects.update(id, {
            contentLanguage: normalizedContentLanguage,
            updatedAt: Date.now(),
          })
        }

        if (Object.keys(otherChanges).length > 0) {
          await updateProjectAndActiveWork(id, otherChanges)
        }

        await get().loadProjects()
      }

      if (hasContentLanguage) {
        await enqueueProjectWrite(id, write)
      } else {
        await updateProjectAndActiveWork(id, data)
        await get().loadProjects()
      }
    })()

    // Handle ignored calls without changing the rejection observed by callers
    // that explicitly await the public promise.
    void result.catch(() => undefined)
    return result
  },

  deleteProject: async (id: number) => {
    // 数据红线:删项目前强制提示备份(Pre-Phase 0 安全网)
    const t = getT()
    const proceed = await requireBackupBefore({
      operation: t('errors:project.deleteOperation'),
      projectId: id,
      details: t('errors:project.deleteDetails'),
      confirmLabel: t('errors-lib:safety.dangerOperationContinue'),
    })
    if (!proceed) return  // 用户取消

    await flushPendingProjectWrites(id)

    const project = await db.projects.get(id)

    // Phase 1.1b: 级联删除全部从 PROJECT_TABLES 注册表派生(不再手写表清单)。
    // 加新表 = 注册表加一行,这里自动覆盖。行为与 Phase 0.6 手写版等价(R-05 保证)。
    await cascadeDeleteProject(id)
    if (project) {
      try {
        await clearProjectFolderHandle(project)
      } catch (error) {
        // The project is already deleted. A stale browser handle grants no
        // automatic access, so cleanup failure must not leave the UI stuck.
        console.warn('[project-storage] 删除项目后清理文件夹关联失败', error)
      }
    }

    if (get().currentProjectId === id) {
      set({ currentProjectId: null })
    }
    await get().loadProjects()
  },

  setCurrentProject: (id: number | null) => {
    set({ currentProjectId: id })
  },
}))
