import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import {
  History, Plus, Trash2, RotateCcw, FileText, Clock, Sparkles, Hand,
} from 'lucide-react'
import { useBackupStore } from '../../stores/backup'
import type { Project } from '../../lib/types'
import { useDialog } from '../shared/Dialog'
import { useToast } from '../shared/Toast'

interface Props {
  project: Project
}

/** v3 §2.1 — 设置区.版本历史（基于 snapshots 表） */
export default function VersionHistoryPanel({ project }: Props) {
  const { t } = useTranslation('import')
  const navigate = useNavigate()
  const dialog = useDialog()
  const toast = useToast()
  const { snapshots, loading, loadSnapshots, createSnapshot, deleteSnapshot, restoreSnapshot } = useBackupStore()
  const [newLabel, setNewLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState<number | null>(null)

  useEffect(() => { loadSnapshots(project.id!) }, [project.id, loadSnapshots])

  const handleCreate = async () => {
    setCreating(true)
    try {
      await createSnapshot(project.id!, newLabel.trim() || t('versionHistory.manualSnapshotLabel', { time: formatTime(Date.now()) }), 'manual')
      setNewLabel('')
    } finally {
      setCreating(false)
    }
  }

  const handleRestore = async (id: number, label: string) => {
    const ok = await dialog.confirm({
      title: t('versionHistory.restoreConfirmTitle', { label }),
      message: t('versionHistory.restoreConfirmMessage'),
      confirmText: t('versionHistory.restoreConfirm'),
    })
    if (!ok) return
    setRestoring(id)
    try {
      const newProjectId = await restoreSnapshot(id)
      navigate(`/workspace/${newProjectId}`)
    } catch (e) {
      toast.error(t('versionHistory.restoreFailed', { error: e instanceof Error ? e.message : String(e) }))
    } finally {
      setRestoring(null)
    }
  }

  const handleDelete = async (id: number, label: string) => {
    const ok = await dialog.confirm({
      title: t('versionHistory.deleteConfirmTitle', { label }),
      message: t('versionHistory.deleteConfirmMessage'),
      confirmText: t('versionHistory.deleteConfirm'),
      tone: 'danger',
    })
    if (!ok) return
    await deleteSnapshot(id)
  }

  const totalSize = snapshots.reduce((s, sn) => s + sn.size, 0)
  const autoCount = snapshots.filter(s => s.type === 'auto').length
  const manualCount = snapshots.filter(s => s.type === 'manual').length

  return (
    <div className="max-w-4xl p-6 space-y-4">
      <div>
        <h2 className="text-xl font-bold text-text-primary mb-1">{t('versionHistory.title')}</h2>
        <p className="text-sm text-text-muted">
          {t('versionHistory.description', { total: snapshots.length, auto: autoCount, manual: manualCount, size: formatSize(totalSize) })}
        </p>
      </div>

      {/* 创建快照 */}
      <div className="bg-bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center gap-2">
          <input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder={t('versionHistory.snapshotPlaceholder')}
            className="flex-1 px-3 py-2 bg-bg-base border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-sm rounded hover:bg-accent-hover disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> {creating ? t('versionHistory.creating') : t('versionHistory.createSnapshot')}
          </button>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          {t('versionHistory.snapshotNote')}
        </p>
      </div>

      {/* 时间线 */}
      {loading ? (
        <div className="text-center py-12 text-text-muted text-sm">{t('versionHistory.loading')}</div>
      ) : snapshots.length === 0 ? (
        <div className="text-center py-12 text-text-muted text-sm">
          <History className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>{t('versionHistory.empty')}</p>
        </div>
      ) : (
        <div className="bg-bg-surface border border-border rounded-xl divide-y divide-border">
          {snapshots.map(s => (
            <div key={s.id} className="p-3 hover:bg-bg-hover transition-colors">
              <div className="flex items-center gap-3">
                {/* 类型图标 */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  s.type === 'manual' ? 'bg-accent/15 text-accent' : 'bg-info/10 text-info'
                }`}>
                  {s.type === 'manual'
                    ? <Hand className="w-4 h-4" />
                    : <Sparkles className="w-4 h-4" />}
                </div>

                {/* 主内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary truncate">{s.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                      s.type === 'manual'
                        ? 'bg-accent/15 text-accent'
                        : 'bg-info/15 text-info'
                    }`}>
                      {s.type === 'manual' ? t('versionHistory.manual') : t('versionHistory.auto')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-text-muted">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {formatTime(s.createdAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" /> {formatSize(s.size)}
                    </span>
                  </div>
                </div>

                {/* 操作 */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleRestore(s.id!, s.label)}
                    disabled={restoring === s.id}
                    title={t('versionHistory.restoreTitle')}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {restoring === s.id ? t('versionHistory.restoring') : t('versionHistory.restore')}
                  </button>
                  <button
                    onClick={() => handleDelete(s.id!, s.label)}
                    title={t('versionHistory.deleteTitle')}
                    className="p-1 text-text-muted hover:text-error"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
