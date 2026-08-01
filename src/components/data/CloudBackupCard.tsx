/**
 * 云备份卡（GitHub Gist）—— FB-11 数据持久 · A
 *
 * 把项目备份到 GitHub 私密 Gist：数据离开浏览器存到云端，清浏览器 / 换设备都不丢，可一键拉回。
 * 需要用户提供一个带 `gist` 权限的 GitHub Personal Access Token（opt-in）。
 */
import { useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { Cloud, CloudUpload, CloudDownload, Check, Loader2, LogOut, ExternalLink, History } from 'lucide-react'
import { useGistStore } from '../../stores/gist'
import type { GistBackupMeta, GistRevisionMeta } from '../../lib/export/gist-export'
import { useDialog } from '../shared/Dialog'

interface Props {
  projectId: number
  onImported?: (newId: number) => void
}

export default function CloudBackupCard({ projectId, onImported }: Props) {
  const { t } = useTranslation('panels')
  const { pat, username, rememberPat, autoBackup, busy, error, connect, disconnect, backupProject, restoreFromGist, listBackups, listRevisions, setAutoBackup, projBackup } = useGistStore()
  const dialog = useDialog()
  const [patInput, setPatInput] = useState('')
  const [rememberPatInput, setRememberPatInput] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [backups, setBackups] = useState<GistBackupMeta[] | null>(null)
  const [revisions, setRevisions] = useState<GistRevisionMeta[] | null>(null)
  const proj = projBackup(projectId)

  const handleConnect = async () => {
    if (!patInput.trim()) return
    const ok = await connect(patInput, rememberPatInput)
    if (ok) { setPatInput(''); setRememberPatInput(false); setMsg(t('data.backup.connected')) }
  }
  const handleBackup = async () => {
    setMsg(null)
    const r = await backupProject(projectId)
    if (r) setMsg(t('data.backup.success'))
  }
  const handleShowRestore = async () => {
    setMsg(null)
    setRevisions(null)
    setBackups(await listBackups())
  }
  const handleRestore = async (gistId: string, title: string) => {
    const ok = await dialog.confirm({
      title: t('data.backup.restoreTitle', { title }),
      message: t('data.backup.restoreMsg'),
      confirmText: t('data.backup.restoreAsNew'),
    })
    if (!ok) return
    const newId = await restoreFromGist(gistId)
    if (newId) { setMsg(t('data.backup.restoredSuccess')); setBackups(null); onImported?.(newId) }
  }
  const handleShowRevisions = async () => {
    setMsg(null)
    setBackups(null)
    const list = await listRevisions(projectId)
    setRevisions(list)
    if (list.length === 0) setMsg(t('data.backup.noHistory'))
  }
  const handleRestoreRevision = async (rev: GistRevisionMeta) => {
    if (!proj?.gistId) return
    const when = new Date(rev.committedAt).toLocaleString('zh-CN')
    const ok = await dialog.confirm({
      title: t('data.backup.restoreVersionTitle', { when }),
      message: t('data.backup.restoreMsg'),
      confirmText: t('data.backup.restoreAsNew'),
    })
    if (!ok) return
    const newId = await restoreFromGist(proj.gistId, rev.version)
    if (newId) { setMsg(t('data.backup.restoredVersionSuccess', { when })); setRevisions(null); onImported?.(newId) }
  }

  return (
    <div className="bg-bg-surface border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <Cloud className="w-5 h-5 text-sky-400" />
        <h3 className="text-sm font-semibold text-text-primary">{t('data.backup.title')}</h3>
      </div>
      <p className="text-xs text-text-muted mb-3">
        <Trans i18nKey="data.backup.desc" ns="panels" components={[<strong key="hl" />]} />
      </p>

      {!pat ? (
        // 未连接:填 PAT
        <div className="space-y-2">
          <input
            type="password"
            value={patInput}
            onChange={e => setPatInput(e.target.value)}
            placeholder={t('data.backup.patPlaceholder')}
            className="w-full px-3 py-2 bg-bg-base border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent"
          />
          <div className="flex items-center gap-2">
            <button onClick={handleConnect} disabled={busy || !patInput.trim()}
              className="px-3 py-1.5 rounded bg-sky-500/80 text-white text-sm hover:bg-sky-500 disabled:opacity-50 flex items-center gap-1.5">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />} {t('data.backup.connectGithub')}
            </button>
            <a href="https://github.com/settings/tokens/new?scopes=gist&description=storyforge-backup" target="_blank" rel="noreferrer"
              className="text-xs text-sky-400 hover:underline flex items-center gap-0.5">
              {t('data.backup.howCreateToken')} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <label className="flex items-start gap-2 text-[11px] text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={rememberPatInput}
              onChange={e => setRememberPatInput(e.target.checked)}
              className="mt-0.5 accent-sky-400"
            />
            <span>{t('data.backup.rememberToken')}</span>
          </label>
          <p className="text-[11px] text-text-muted">
            {t('data.backup.securityNote')}
          </p>
        </div>
      ) : (
        // 已连接
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-success" /> {t('data.backup.connectedTo')} <strong>@{username}</strong>
              <em className="not-italic text-[10px] text-text-muted">
                {rememberPat ? t('data.backup.rememberedThisDevice') : t('data.backup.thisSessionOnly')}
              </em>
            </span>
            <button onClick={() => { disconnect(); setBackups(null) }} className="text-[11px] text-text-muted hover:text-error flex items-center gap-0.5">
              <LogOut className="w-3 h-3" /> {t('data.backup.disconnect')}
            </button>
          </div>
          <p className="text-[11px] text-text-muted">
            {t('data.backup.tokenStorage', { remembered: rememberPat ? t('data.backup.tokenSavedLocal') : t('data.backup.tokenSessionOnly') })}
          </p>

          <div className="flex flex-wrap gap-2">
            <button onClick={handleBackup} disabled={busy}
              className="px-3 py-1.5 rounded bg-sky-500/80 text-white text-sm hover:bg-sky-500 disabled:opacity-50 flex items-center gap-1.5">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />} {t('data.backup.backupNow')}
            </button>
            <button onClick={handleShowRestore} disabled={busy}
              className="px-3 py-1.5 rounded border border-border text-text-secondary text-sm hover:bg-bg-hover disabled:opacity-50 flex items-center gap-1.5">
              <CloudDownload className="w-4 h-4" /> {t('data.backup.restoreFromCloud')}
            </button>
            {proj?.gistId && (
              <button onClick={handleShowRevisions} disabled={busy}
                className="px-3 py-1.5 rounded border border-border text-text-secondary text-sm hover:bg-bg-hover disabled:opacity-50 flex items-center gap-1.5">
                <History className="w-4 h-4" /> {t('data.backup.projectHistory')}
              </button>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
            <input type="checkbox" checked={autoBackup} onChange={e => setAutoBackup(e.target.checked)} className="accent-sky-400" />
            {t('data.backup.autoBackup')}
          </label>

          {proj?.lastBackupAt && (
            <p className="text-[11px] text-text-muted">{t('data.backup.lastBackup', { date: new Date(proj.lastBackupAt).toLocaleString('zh-CN') })}</p>
          )}

          {backups && (
            <div className="border border-border rounded p-2 space-y-1 max-h-48 overflow-y-auto bg-bg-base">
              {backups.length === 0 ? (
                <p className="text-xs text-text-muted">{t('data.backup.noCloudBackup')}</p>
              ) : backups.map(b => (
                <button key={b.gistId} onClick={() => handleRestore(b.gistId, b.description || b.filename)}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-bg-hover text-xs">
                  <div className="text-text-primary truncate">{b.description || b.filename}</div>
                  <div className="text-[10px] text-text-muted">{t('data.backup.updatedAt', { date: new Date(b.updatedAt).toLocaleString('zh-CN') })}</div>
                </button>
              ))}
            </div>
          )}

          {revisions && revisions.length > 0 && (
            <div className="border border-border rounded bg-bg-base">
              <div className="px-2 py-1.5 border-b border-border flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-[11px] text-text-secondary">{t('data.backup.historyDesc')}</span>
              </div>
              <div className="p-2 space-y-1 max-h-56 overflow-y-auto">
                {revisions.map((rev, i) => (
                  <button key={rev.version} onClick={() => handleRestoreRevision(rev)} disabled={busy}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-bg-hover text-xs disabled:opacity-50 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span className="text-text-primary">{new Date(rev.committedAt).toLocaleString('zh-CN')}</span>
                      {i === 0 && <span className="text-[10px] px-1 rounded bg-sky-500/20 text-sky-400">{t('data.backup.latest')}</span>}
                    </span>
                    <span className="text-[10px] text-text-muted shrink-0">
                      {rev.additions != null && rev.deletions != null ? `+${rev.additions} / -${rev.deletions}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(msg || error) && (
        <p className={`text-xs mt-2 ${error ? 'text-error' : 'text-success'}`}>{error || msg}</p>
      )}
    </div>
  )
}
