import { useState, useRef, useEffect } from 'react'
import {
  Download, Upload, FileJson, FileText, FileType,
  Loader2, CheckCircle, AlertCircle, FolderOpen, X,
  History, Plus, Trash2, RotateCcw, HardDrive,
  ShieldAlert, Stethoscope,
} from 'lucide-react'
import { useDomainT } from '../../i18n'
import { exportProjectJSON, downloadJSON, importProjectJSON, type ProjectExportData } from '../../lib/export/json-export'
import { exportProjectMarkdown, exportProjectTXT, downloadTextFile } from '../../lib/export/text-export'
import {
  isFSASupported, pickFolder, ensureFolderPermission, folderPermissionGranted,
  writeProjectJSONToFolder,
} from '../../lib/storage/folder-backup'
import { saveFolderHandle, loadFolderHandle, clearFolderHandle, projFolderKey, LAST_FOLDER_KEY } from '../../lib/storage/folder-handle-store'
import { useBackupStore } from '../../stores/backup'
import CloudBackupCard from './CloudBackupCard'
import { useToast } from '../shared/Toast'
import { useDialog } from '../shared/Dialog'
import type { Project, Snapshot } from '../../lib/types'
import { buildLocalDiagnosticReport } from '../../lib/diagnostics/local-diagnostic-report'
import { inspectProjectBackup, type BackupTrustReport } from '../../lib/export/backup-trust'

type Tab = 'export' | 'backup'
type ExportStatus = 'idle' | 'loading' | 'success' | 'error'

interface Props {
  project: Project
  onImported?: (newProjectId: number) => void
}

export default function DataManagementPanel({ project, onImported }: Props) {
  const { t } = useDomainT('data')
  const [activeTab, setActiveTab] = useState<Tab>('export')

  const TABS = [
    { id: 'export' as Tab,    labelKey: 'panel.tabExport' as const, icon: FileJson },
    { id: 'backup' as Tab,    labelKey: 'panel.tabBackup' as const, icon: History },
  ]

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-xl font-bold text-text-primary mb-1">{t('panel.title')}</h2>
        <p className="text-sm text-text-muted">{t('panel.subtitle')}</p>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 bg-bg-elevated rounded-xl p-1 w-fit">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-bg-surface text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t(tab.labelKey)}
            </button>
          )
        })}
      </div>

      {activeTab === 'export'    && <ExportTab    project={project} onImported={onImported} />}
      {activeTab === 'backup'    && <BackupTab    project={project} onImported={onImported} />}
    </div>
  )
}

// ── 导出/导入 Tab ────────────────────────────────────────────
function ExportTab({ project, onImported }: Props) {
  const { t, lang } = useDomainT('data')
  const [status, setStatus] = useState<ExportStatus>('idle')
  const [message, setMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── 本地文件夹（句柄持久化 + 重新授权 + 自动备份，FB-11）──
  const [folderHandle, setFolderHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [folderName, setFolderName] = useState('')
  const [folderNeedsAuth, setFolderNeedsAuth] = useState(false)
  const [folderBusy, setFolderBusy] = useState(false)
  const [backupReport, setBackupReport] = useState<BackupTrustReport | null>(null)

  // 进面板时把该项目已持久化的绑定读回来；授权仍有效则直接显示已绑定，失效则提示重新授权
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const h = await loadFolderHandle(projFolderKey(project.id!))
      if (!h || cancelled) return
      setFolderHandle(h)
      setFolderName(h.name)
      setFolderNeedsAuth(!(await folderPermissionGranted(h)))
    })()
    return () => { cancelled = true }
  }, [project.id])

  const show = (s: ExportStatus, msg: string) => {
    setStatus(s); setMessage(msg)
    if (s === 'success') setTimeout(() => setStatus('idle'), 4000)
  }

  const handleExportJSON = async () => {
    try {
      show('loading', t('export.loadingJson'))
      const data = await exportProjectJSON(project.id!)
      downloadJSON(data, `${project.name}_${new Date().toISOString().slice(0, 10)}.json`)
      show('success', t('export.successJson'))
    } catch (e) { show('error', t('export.errorExport', { message: (e as Error).message })) }
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      show('loading', t('export.loadingImport'))
      const data: ProjectExportData = JSON.parse(await file.text())
      const report = inspectProjectBackup(data)
      setBackupReport(report)
      if (!report.valid) throw new Error(new Intl.ListFormat(lang, { type: 'conjunction', style: 'short' }).format(report.errors))
      const newId = await importProjectJSON(data)
      show('success', t('export.successImport'))
      onImported?.(newId)
    } catch (err) { show('error', t('export.errorImport', { message: (err as Error).message })) }
    e.target.value = ''
  }

  const handleExportMarkdown = async () => {
    try {
      show('loading', t('export.loadingMarkdown'))
      const md = await exportProjectMarkdown(project.id!)
      downloadTextFile(md, `${project.name}_${new Date().toISOString().slice(0, 10)}.md`, 'text/markdown')
      show('success', t('export.successMarkdown'))
    } catch (e) { show('error', t('export.errorExport', { message: (e as Error).message })) }
  }

  const handleExportTXT = async () => {
    try {
      show('loading', t('export.loadingTxt'))
      const txt = await exportProjectTXT(project.id!)
      downloadTextFile(txt, `${project.name}_${new Date().toISOString().slice(0, 10)}.txt`)
      show('success', t('export.successTxt'))
    } catch (e) { show('error', t('export.errorExport', { message: (e as Error).message })) }
  }

  const handleDownloadDiagnostics = async () => {
    try {
      show('loading', t('export.loadingDiagnostics'))
      const report = await buildLocalDiagnosticReport()
      downloadTextFile(
        JSON.stringify(report, null, 2),
        `storyforge-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
        'application/json',
      )
      show('success', t('export.successDiagnostics'))
    } catch (e) {
      show('error', t('export.errorDiagnostics', { message: (e as Error).message }))
    }
  }

  // 绑定文件夹：选目录 → 请求授权 → 持久化句柄 → 立刻写一次
  const handleBindFolder = async () => {
    const h = await pickFolder()
    if (!h) return
    setFolderBusy(true)
    try {
      const ok = await ensureFolderPermission(h)
      if (!ok) { show('error', t('export.folderNotGranted')); return }
      await saveFolderHandle(projFolderKey(project.id!), h)
      await saveFolderHandle(LAST_FOLDER_KEY, h)
      setFolderHandle(h); setFolderName(h.name); setFolderNeedsAuth(false)
      const wrote = await writeProjectJSONToFolder(h, project.id!)
      show(wrote ? 'success' : 'error', wrote ? t('export.folderBindSuccess', { name: h.name }) : t('export.folderBindWriteFailed'))
    } catch (e) { show('error', t('export.folderBindFailed', { message: (e as Error).message })) }
    finally { setFolderBusy(false) }
  }

  // 重新授权（更新/刷新后浏览器把权限降回 prompt 时，一次手势恢复）
  const handleReauthFolder = async () => {
    if (!folderHandle) return
    setFolderBusy(true)
    try {
      const ok = await ensureFolderPermission(folderHandle)
      if (!ok) { show('error', t('export.folderReauthStillDenied')); return }
      setFolderNeedsAuth(false)
      await writeProjectJSONToFolder(folderHandle, project.id!)
      show('success', t('export.folderReauthSuccess'))
    } catch (e) { show('error', t('export.folderReauthFailed', { message: (e as Error).message })) }
    finally { setFolderBusy(false) }
  }

  const handleSaveToFolder = async () => {
    if (!folderHandle) return
    setFolderBusy(true)
    try {
      show('loading', t('export.folderSaving'))
      if (!(await ensureFolderPermission(folderHandle))) { show('error', t('export.folderSaveNoAuth')); setFolderNeedsAuth(true); return }
      const ok = await writeProjectJSONToFolder(folderHandle, project.id!)
      show(ok ? 'success' : 'error', ok ? t('export.folderSaveSuccess') : t('export.folderSaveFailed'))
    } catch (e) { show('error', t('export.folderWriteFailed', { message: (e as Error).message })) }
    finally { setFolderBusy(false) }
  }

  const handleUnbindFolder = async () => {
    await clearFolderHandle(projFolderKey(project.id!))
    setFolderHandle(null); setFolderName(''); setFolderNeedsAuth(false)
  }

  return (
    <div className="space-y-4">
      {status !== 'idle' && (
        <StatusBar status={status} message={message} />
      )}

      {/* JSON */}
      <SectionCard
        icon={<FileJson className="w-5 h-5 text-accent" />}
        title={t('export.jsonTitle')}
        desc={t('export.jsonDesc')}
      >
        <p className="text-[11px] text-text-muted bg-bg-base border border-border rounded px-3 py-2">
          {t('export.jsonPrecheckNote')}
        </p>
        <div className="flex gap-3 flex-wrap">
          <ActionButton onClick={handleExportJSON} disabled={status === 'loading'} variant="accent">
            <Download className="w-4 h-4" /> {t('export.exportJsonButton')}
          </ActionButton>
          <ActionButton onClick={() => fileInputRef.current?.click()} disabled={status === 'loading'} variant="default">
            <Upload className="w-4 h-4" /> {t('export.importJsonButton')}
          </ActionButton>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelected} className="hidden" />
        </div>
        {backupReport && <BackupTrustResult report={backupReport} />}
      </SectionCard>

      {/* 云备份（GitHub Gist）—— 清浏览器/换设备都不丢 */}
      <CloudBackupCard projectId={project.id!} onImported={onImported} />

      {/* Markdown */}
      <SectionCard
        icon={<FileText className="w-5 h-5 text-blue-400" />}
        title={t('export.markdownTitle')}
        desc={t('export.markdownDesc')}
      >
        <ActionButton onClick={handleExportMarkdown} disabled={status === 'loading'} variant="blue">
          <Download className="w-4 h-4" /> {t('export.exportMarkdownButton')}
        </ActionButton>
      </SectionCard>

      {/* TXT */}
      <SectionCard
        icon={<FileType className="w-5 h-5 text-yellow-400" />}
        title={t('export.txtTitle')}
        desc={t('export.txtDesc')}
      >
        <ActionButton onClick={handleExportTXT} disabled={status === 'loading'} variant="yellow">
          <Download className="w-4 h-4" /> {t('export.exportTxtButton')}
        </ActionButton>
      </SectionCard>

      {/* 本地文件夹 */}
      <SectionCard
        icon={<FolderOpen className="w-5 h-5 text-orange-400" />}
        title={t('export.folderTitle')}
        desc={t('export.folderDesc')}
        badge={!isFSASupported() ? t('export.folderBadge') : undefined}
      >
        {folderHandle ? (
          <div className="space-y-2">
            {folderNeedsAuth ? (
              <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">{t('export.folderBoundNeedReauth', { name: folderName })}</span>
                <button onClick={handleUnbindFolder} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 px-3 py-2 rounded-lg">
                <FolderOpen className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">{t('export.folderBoundActive', { name: folderName })}</span>
                <button onClick={handleUnbindFolder} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {folderNeedsAuth && (
                <ActionButton onClick={handleReauthFolder} disabled={folderBusy} variant="orange">
                  {folderBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                  {t('export.reauthButton')}
                </ActionButton>
              )}
              <ActionButton onClick={handleSaveToFolder} disabled={folderBusy || status === 'loading'} variant={folderNeedsAuth ? 'default' : 'orange'}>
                {folderBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {folderBusy ? t('export.savingButton') : t('export.saveNowButton')}
              </ActionButton>
            </div>
          </div>
        ) : (
          <ActionButton onClick={handleBindFolder} disabled={!isFSASupported() || folderBusy || status === 'loading'} variant="orange">
            {folderBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />} {t('export.selectFolderButton')}
          </ActionButton>
        )}
      </SectionCard>

      <SectionCard
        icon={<Stethoscope className="w-5 h-5 text-teal-400" />}
        title={t('export.diagnosticsTitle')}
        desc={t('export.diagnosticsDesc')}
      >
        <ActionButton onClick={handleDownloadDiagnostics} disabled={status === 'loading'} variant="default">
          <Download className="w-4 h-4" /> {t('export.downloadDiagnosticsButton')}
        </ActionButton>
      </SectionCard>
    </div>
  )
}

function BackupTrustResult({ report }: { report: BackupTrustReport }) {
  const { t } = useDomainT('data')
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${report.valid
      ? 'border-green-500/30 bg-green-500/5 text-text-secondary'
      : 'border-red-500/30 bg-red-500/5 text-red-300'}`}>
      <div className="flex items-center gap-2 font-medium">
        {report.valid ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <AlertCircle className="w-3.5 h-3.5" />}
        {report.valid ? t('backupTrust.passed') : t('backupTrust.failed')}
        {report.projectName && <span className="text-text-muted font-normal">· {report.projectName}</span>}
      </div>
      {report.valid && (
        <p className="mt-1 text-text-muted">{t('backupTrust.stats', { version: report.version, tables: report.presentTables, records: report.recordCount })}</p>
      )}
      {report.errors.map(error => <p key={error} className="mt-1 text-red-300">{error}</p>)}
      {report.warnings.map(warning => <p key={warning} className="mt-1 text-amber-300">{warning}</p>)}
    </div>
  )
}

// ── 版本历史 Tab ─────────────────────────────────────────────
function BackupTab({ project }: Props) {
  const { t, lang } = useDomainT('data')
  const { snapshots, loading, loadSnapshots, createSnapshot, deleteSnapshot, restoreSnapshot } = useBackupStore()
  const toast = useToast()
  const dialog = useDialog()
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState<number | null>(null)
  const [label, setLabel] = useState('')
  const [showForm, setShowForm] = useState(false)

  useState(() => { loadSnapshots(project.id!) })

  const handleCreate = async () => {
    setCreating(true)
    try {
      await createSnapshot(project.id!, label.trim() || `${t('backup.defaultLabelPrefix')}${new Date().toLocaleString(lang)}`, 'manual')
      toast.success(t('backup.createSuccessToast'))
      setLabel(''); setShowForm(false)
    } catch (err) {
      toast.error(t('backup.createFailedToast', { message: (err as Error).message }))
    } finally { setCreating(false) }
  }

  const handleRestore = async (snap: Snapshot) => {
    const ok = await dialog.confirm({
      title: t('backup.restoreConfirmTitle', { label: snap.label }),
      message: t('backup.restoreConfirmMessage'),
      confirmText: t('backup.restoreConfirmText'),
    })
    if (!ok) return
    setRestoring(snap.id!)
    try {
      await restoreSnapshot(snap.id!)
      toast.success(t('backup.restoreSuccessToast'))
    } catch (err) { toast.error(t('backup.restoreFailedToast', { message: (err as Error).message })) }
    finally { setRestoring(null) }
  }

  return (
    <div className="space-y-4">
      {/* 新建快照 */}
      <div className="bg-bg-surface border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-text-primary">{t('backup.createTitle')}</span>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-xs text-accent hover:text-accent-hover transition-colors"
          >
            {showForm ? t('backup.toggleFormHide') : t('backup.toggleFormShow')}
          </button>
        </div>
        {showForm && (
          <div className="flex gap-2">
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={t('backup.labelPlaceholder')}
              className="flex-1 px-3 py-1.5 bg-bg-base border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-sm rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {t('backup.createButton')}
            </button>
          </div>
        )}
      </div>

      {/* 快照列表 */}
      <div className="space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-8 text-text-muted">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t('backup.loadSnapshots')}
          </div>
        )}
        {!loading && snapshots.length === 0 && (
          <div className="text-center text-text-muted text-sm py-10">
            <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
            {t('backup.emptyState')}
          </div>
        )}
        {snapshots.map(snap => (
          <div key={snap.id} className="bg-bg-surface border border-border rounded-lg p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{snap.label}</p>
              <p className="text-xs text-text-muted">{new Date(snap.createdAt).toLocaleString(lang)}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => handleRestore(snap)}
                disabled={restoring === snap.id}
                title={t('backup.restoreTitle')}
                className="p-1.5 text-text-muted hover:text-accent rounded hover:bg-accent/10 transition-colors disabled:opacity-50"
              >
                {restoring === snap.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              </button>
              <button
                onClick={() => deleteSnapshot(snap.id!)}
                title={t('backup.deleteTitle')}
                className="p-1.5 text-text-muted hover:text-error rounded hover:bg-error/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 共用小组件 ───────────────────────────────────────────────
function StatusBar({ status, message }: { status: ExportStatus; message: string }) {
  const cls = status === 'loading' ? 'bg-accent/10 text-accent'
    : status === 'success' ? 'bg-green-500/10 text-green-400'
    : 'bg-red-500/10 text-red-400'
  return (
    <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${cls}`}>
      {status === 'loading' && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
      {status === 'success' && <CheckCircle className="w-4 h-4 shrink-0" />}
      {status === 'error'   && <AlertCircle className="w-4 h-4 shrink-0" />}
      <span>{message}</span>
    </div>
  )
}

function SectionCard({
  icon, title, desc, badge, children,
}: {
  icon: React.ReactNode; title: string; desc: string; badge?: string; children: React.ReactNode
}) {
  return (
    <div className="bg-bg-surface border border-border rounded-lg p-5 space-y-3">
      <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
        {icon} {title}
        {badge && <span className="text-xs text-text-muted bg-bg-elevated px-2 py-0.5 rounded ml-auto">{badge}</span>}
      </h3>
      <p className="text-xs text-text-muted">{desc}</p>
      {children}
    </div>
  )
}

type ButtonVariant = 'accent' | 'default' | 'blue' | 'yellow' | 'orange'
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  accent:  'bg-accent text-white hover:bg-accent-hover',
  default: 'bg-bg-elevated text-text-secondary hover:bg-bg-hover hover:text-text-primary',
  blue:    'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30',
  yellow:  'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30',
  orange:  'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30',
}

function ActionButton({
  onClick, disabled, variant, children,
}: {
  onClick: () => void; disabled?: boolean; variant: ButtonVariant; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${VARIANT_CLASS[variant]}`}
    >
      {children}
    </button>
  )
}
