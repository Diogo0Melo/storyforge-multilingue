import { create } from 'zustand'
import { db } from '../lib/db/schema'
import { adopt } from '../lib/registry/adopt'
import { getT } from '../i18n'
import {
  createInspirationFragment,
  createInspirationVersion,
  MAX_INSPIRATION_VERSIONS,
  parseInspirationFragments,
  parseInspirationVersions,
  repairInspirationVersionParents,
  upsertInspirationFragment,
} from '../lib/inspiration/workspace'
import type {
  InspirationFragment,
  InspirationResultMode,
  InspirationSourceKind,
  InspirationVersion,
  InspirationWorkspace,
} from '../lib/types/inspiration-workspace'

interface InspirationWorkspaceState {
  workspace: InspirationWorkspace | null
  fragments: InspirationFragment[]
  versions: InspirationVersion[]
  loading: boolean
  load: (projectId: number) => Promise<void>
  addFragment: (projectId: number, input: {
    text: string
    label?: string
    sourceKind?: InspirationSourceKind
  }) => Promise<InspirationFragment | null>
  removeFragment: (projectId: number, fragmentId: string) => Promise<void>
  saveVersion: (projectId: number, input: {
    mode: InspirationResultMode
    parentVersionId?: string | null
    fragmentIds: string[]
    result: unknown
  }) => Promise<InspirationVersion>
}

async function persistWorkspace(
  projectId: number,
  fragments: InspirationFragment[],
  versions: InspirationVersion[],
): Promise<InspirationWorkspace> {
  const adopted = await adopt({
    projectId,
    target: 'inspirationWorkspaces',
    mode: 'replace',
    data: {
      fragments: JSON.stringify(fragments),
      versions: JSON.stringify(versions),
    },
  })
  if (adopted.written.length === 0) {
    const t = getT()
    const reason = adopted.skipped[0]?.reason ?? adopted.typeErrors[0]?.field ?? 'unknown'
    throw new Error(t('project:fusionReview.workspaceWriteRejected', { reason }))
  }
  const row = await db.inspirationWorkspaces.where('projectId').equals(projectId).first()
  if (!row) throw new Error(getT()('project:fusionReview.workspaceReadbackFailed'))
  return row
}

export const useInspirationWorkspaceStore = create<InspirationWorkspaceState>((set, get) => ({
  workspace: null,
  fragments: [],
  versions: [],
  loading: false,

  load: async (projectId) => {
    set({ loading: true })
    try {
      const workspace = await db.inspirationWorkspaces.where('projectId').equals(projectId).first() ?? null
      set({
        workspace,
        fragments: parseInspirationFragments(workspace?.fragments),
        versions: parseInspirationVersions(workspace?.versions),
      })
    } finally {
      set({ loading: false })
    }
  },

  addFragment: async (projectId, input) => {
    const fragment = createInspirationFragment(input)
    if (!fragment) return null
    const current = get().workspace?.projectId === projectId ? get().fragments : []
    const fragments = upsertInspirationFragment(current, fragment)
    if (fragments === current) {
      return current.find(item =>
        item.text.replace(/\s+/g, '').toLocaleLowerCase()
        === fragment.text.replace(/\s+/g, '').toLocaleLowerCase()) ?? null
    }
    const versions = get().workspace?.projectId === projectId ? get().versions : []
    const workspace = await persistWorkspace(projectId, fragments, versions)
    set({ workspace, fragments, versions })
    return fragment
  },

  removeFragment: async (projectId, fragmentId) => {
    const current = get().workspace?.projectId === projectId ? get().fragments : []
    const versions = get().workspace?.projectId === projectId ? get().versions : []
    if (versions.some(version => version.fragmentIds.includes(fragmentId))) {
      throw new Error(getT()('project:fusionReview.fragmentReferencedError'))
    }
    const fragments = current.filter(fragment => fragment.id !== fragmentId)
    const workspace = await persistWorkspace(projectId, fragments, versions)
    set({ workspace, fragments, versions })
  },

  saveVersion: async (projectId, input) => {
    const version = createInspirationVersion(input)
    const fragments = get().workspace?.projectId === projectId ? get().fragments : []
    const current = get().workspace?.projectId === projectId ? get().versions : []
    const versions = repairInspirationVersionParents(
      [...current, version].slice(-MAX_INSPIRATION_VERSIONS),
    )
    const workspace = await persistWorkspace(projectId, fragments, versions)
    set({ workspace, fragments, versions })
    return version
  },
}))
