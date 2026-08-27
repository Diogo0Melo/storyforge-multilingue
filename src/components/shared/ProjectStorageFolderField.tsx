import { useState } from 'react'
import { FolderOpen, Loader2 } from 'lucide-react'
import { useDomainT } from '../../i18n'
import {
  ensureFolderPermission,
  isFSASupported,
  pickFolder,
} from '../../lib/storage/folder-backup'

interface Props {
  value: FileSystemDirectoryHandle | null
  onChange: (handle: FileSystemDirectoryHandle) => void
  disabled?: boolean
}

/** Optional project-location field shared by every project creation entry. */
export default function ProjectStorageFolderField({ value, onChange, disabled = false }: Props) {
  const { t } = useDomainT('settings')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const supported = isFSASupported()

  const choose = async () => {
    setBusy(true)
    setError('')
    try {
      const handle = await pickFolder({
        id: 'storyforge-project-location',
        startIn: value ?? undefined,
      })
      if (!handle) return
      if (!(await ensureFolderPermission(handle))) {
        setError(t('projectStorage.noticePermissionDenied'))
        return
      }
      onChange(handle)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1.5" data-testid="project-storage-folder-field">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-base px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs text-text-secondary">{t('projectStorage.title')}</p>
          <p className="truncate text-xs text-text-muted">
            {value ? t('projectStorage.folderSelected', { name: value.name }) : supported ? t('projectStorage.folderIdle') : t('projectStorage.unsupported')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void choose()}
          disabled={disabled || busy || !supported}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />}
          {value ? t('projectStorage.btnChange') : t('projectStorage.btnChoose')}
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-text-muted">{t('projectStorage.hintSafety')}</p>
      {/* Oracle remediation:动态权限错误以 role="alert"(隐含 aria-live=assertive)播报,视觉不变。 */}
      {error && <p role="alert" className="text-xs text-error">{error}</p>}
    </div>
  )
}
