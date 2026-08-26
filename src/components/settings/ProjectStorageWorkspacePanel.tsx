import { useEffect, useState } from 'react'
import { FolderOpen, HardDrive, Loader2, RefreshCw, ShieldAlert, Unplug } from 'lucide-react'
import type { Project } from '../../lib/types'
import { useDomainT } from '../../i18n'
import {
  ensureFolderPermission,
  folderPermissionGranted,
  isFSASupported,
  pickFolder,
} from '../../lib/storage/folder-backup'
import {
  clearProjectFolderHandle,
  loadProjectFolderHandle,
} from '../../lib/storage/folder-handle-store'
import { bindProjectStorageWorkspace } from '../../lib/storage/project-storage-workspace'

interface Props {
  project?: Project
  onOpenDataManagement?: () => void
}

type Notice = { kind: 'success' | 'error'; text: string } | null

export default function ProjectStorageWorkspacePanel({ project, onOpenDataManagement }: Props) {
  const { t } = useDomainT('settings')
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const supported = isFSASupported()

  useEffect(() => {
    let cancelled = false
    setHandle(null)
    setNeedsAuth(false)
    setNotice(null)
    if (!project) return () => { cancelled = true }
    void (async () => {
      const stored = await loadProjectFolderHandle(project)
      if (!stored || cancelled) return
      const granted = await folderPermissionGranted(stored)
      if (cancelled) return
      setHandle(stored)
      setNeedsAuth(!granted)
    })()
    return () => { cancelled = true }
  }, [project])

  const chooseLocation = async () => {
    if (!project) return
    setBusy(true)
    setNotice(null)
    try {
      const selected = await pickFolder({
        id: 'storyforge-project-location',
        startIn: handle ?? undefined,
      })
      if (!selected) return
      if (!(await ensureFolderPermission(selected))) {
        setNotice({ kind: 'error', text: t('projectStorage.noticePermissionDenied') })
        return
      }
      const replaced = handle != null
      await bindProjectStorageWorkspace(project, selected)
      setHandle(selected)
      setNeedsAuth(false)
      setNotice({
        kind: 'success',
        text: replaced
          ? t('projectStorage.noticeReplaced', { name: selected.name })
          : t('projectStorage.noticeBound', { name: selected.name }),
      })
    } catch (error) {
      setNotice({ kind: 'error', text: t('projectStorage.noticeChooseFailed', { message: (error as Error).message }) })
    } finally {
      setBusy(false)
    }
  }

  const reauthorize = async () => {
    if (!handle) return
    setBusy(true)
    setNotice(null)
    try {
      const granted = await ensureFolderPermission(handle)
      setNeedsAuth(!granted)
      setNotice(granted
        ? { kind: 'success', text: t('projectStorage.noticeReauthorized') }
        : { kind: 'error', text: t('projectStorage.noticePermissionDenied') })
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!project) return
    setBusy(true)
    setNotice(null)
    try {
      await clearProjectFolderHandle(project)
      setHandle(null)
      setNeedsAuth(false)
      setNotice({ kind: 'success', text: t('projectStorage.noticeDisconnected') })
    } catch (error) {
      setNotice({ kind: 'error', text: t('projectStorage.noticeDisconnectFailed', { message: (error as Error).message }) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="max-w-2xl rounded-xl border border-border bg-bg-surface p-4" data-testid="project-storage-workspace-settings">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-lg bg-orange-500/10 p-2 text-orange-400"><HardDrive className="h-5 w-5" /></div>
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{t('projectStorage.title')}</h3>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            {t('projectStorage.description')}
          </p>
        </div>
      </div>

      {!project ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-text-muted">
          {t('projectStorage.noProject')}
        </div>
      ) : !supported ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs text-amber-300">
          {t('projectStorage.unsupported')}
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-bg-base px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {needsAuth ? <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" /> : <FolderOpen className="h-4 w-4 shrink-0 text-green-400" />}
                <div className="min-w-0">
                  <p className="truncate text-sm text-text-primary">
                    {handle ? handle.name : t('projectStorage.folderIdle')}
                  </p>
                  <p className="text-[11px] text-text-muted">
                    {handle
                      ? needsAuth ? t('projectStorage.statusNeedsAuth') : t('projectStorage.statusLinked')
                      : t('projectStorage.statusBrowserOnly')}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {needsAuth && handle && (
                  <button type="button" onClick={() => void reauthorize()} disabled={busy} className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/10 disabled:opacity-40">
                    {t('projectStorage.btnReauthorize')}
                  </button>
                )}
                <button type="button" onClick={() => void chooseLocation()} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs text-white hover:bg-accent-hover disabled:opacity-40">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />}
                  {handle ? t('projectStorage.btnChange') : t('projectStorage.btnChoose')}
                </button>
              </div>
            </div>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
            {t('projectStorage.hintSafety')}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {handle && onOpenDataManagement && (
              <button type="button" onClick={onOpenDataManagement} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent">
                <RefreshCw className="h-3.5 w-3.5" />{t('projectStorage.btnOpenDataManagement')}
              </button>
            )}
            {handle && (
              <button type="button" onClick={() => void disconnect()} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted hover:border-error/60 hover:text-error disabled:opacity-40">
                <Unplug className="h-3.5 w-3.5" />{t('projectStorage.btnDisconnect')}
              </button>
            )}
          </div>
        </>
      )}

      {notice && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${notice.kind === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-error/10 text-error'}`}>
          {notice.text}
        </p>
      )}
    </section>
  )
}
