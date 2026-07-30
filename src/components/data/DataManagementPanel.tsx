import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Download, Upload, FileJson, FileText, FileType,
  Loader2, CheckCircle, AlertCircle, FolderOpen, X,
  History, Plus, Trash2, RotateCcw, HardDrive,
  ShieldAlert, Stethoscope,
} from 'lucide-react'
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

type Tab = 'export' | 'backup'
type ExportStatus = 'idle' | 'loading' | 'success' | 'error'

interface Props {
  project: Project
  onImported?: (newProjectId: number) => void
}

export default function DataManagementPanel({ project, onImported }: Props) {
  const { t } = useTranslation('panels')
  const [activeTab, setActiveTab] = useState<Tab>('export')

  const TABS: { id: Tab; labelKey: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'export',    labelKey: 'data.mgmt.tabExport', icon: FileJson },
    { id: 'backup',    labelKey: 'data.mgmt.tabBackup', icon: History },
  ]

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-xl font-bold text-text-primary mb-1">{t('data.mgmt.title' as any)}</h2>
        <p className="text-sm text-text-muted">{t('data.mgmt.subtitle' as any)}</p>
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
              {t(tab.labelKey as any)}
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
  const { t } = useTranslation('panels')
  const [status, setStatus] = useState<ExportStatus>('idle')
  const [message, setMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── 本地文件夹（句柄持久化 + 重新授权 + 自动备份，FB-11）──
  const [folderHandle, setFolderHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [folderName, setFolderName] = useState('')
  const [folderNeedsAuth, setFolderNeedsAuth] = useState(false)
  const [folderBusy, setFolderBusy] = useState(false)

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
      show('loading', t('data.mgmt.exportingJson' as any))
      const data = await exportProjectJSON(project.id!)
      downloadJSON(data, `${project.name}_${new Date().toISOString().slice(0, 10)}.json`)
      show('success', t('data.mgmt.jsonExportSuccess' as any))
    } catch (e) { show('error', t('data.mgmt.exportFailed' as any, { error: (e as Error).message })) }
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      show('loading', t('data.mgmt.importing' as any))
      const data: ProjectExportData = JSON.parse(await file.text())
      const newId = await importProjectJSON(data)
      show('success', t('data.mgmt.importSuccess' as any))
      onImported?.(newId)
    } catch (err) { show('error', t('data.mgmt.importFailed' as any, { error: (err as Error).message })) }
    e.target.value = ''
  }

  const handleExportMarkdown = async () => {
    try {
      show('loading', t('data.mgmt.exportingMarkdown' as any))
      const md = await exportProjectMarkdown(project.id!)
      downloadTextFile(md, `${project.name}_${new Date().toISOString().slice(0, 10)}.md`, 'text/markdown')
      show('success', t('data.mgmt.markdownExportSuccess' as any))
    } catch (e) { show('error', t('data.mgmt.exportFailed' as any, { error: (e as Error).message })) }
  }

  const handleExportTXT = async () => {
    try {
      show('loading', t('data.mgmt.exportingTxt' as any))
      const txt = await exportProjectTXT(project.id!)
      downloadTextFile(txt, `${project.name}_${new Date().toISOString().slice(0, 10)}.txt`)
      show('success', t('data.mgmt.txtExportSuccess' as any))
    } catch (e) { show('error', t('data.mgmt.exportFailed' as any, { error: (e as Error).message })) }
  }

  const handleDownloadDiagnostics = async () => {
    try {
      show('loading', t('data.mgmt.gatheringDiagnostics' as any))
      const report = await buildLocalDiagnosticReport()
      downloadTextFile(
        JSON.stringify(report, null, 2),
        `storyforge-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
        'application/json',
      )
      show('success', t('data.mgmt.diagnosticsSuccess' as any))
    } catch (e) {
      show('error', t('data.mgmt.diagnosticsFailed' as any, { error: (e as Error).message }))
    }
  }

  // 绑定文件夹：选目录 → 请求授权 → 持久化句柄 → 立刻写一次
  const handleBindFolder = async () => {
    const h = await pickFolder()
    if (!h) return
    setFolderBusy(true)
    try {
      const ok = await ensureFolderPermission(h)
      if (!ok) { show('error', t('data.mgmt.noFolderPermission' as any)); return }
      await saveFolderHandle(projFolderKey(project.id!), h)
      await saveFolderHandle(LAST_FOLDER_KEY, h)
      setFolderHandle(h); setFolderName(h.name); setFolderNeedsAuth(false)
      const wrote = await writeProjectJSONToFolder(h, project.id!)
      show(wrote ? 'success' : 'error', wrote ? t('data.mgmt.boundAndSaved' as any, { name: h.name }) : t('data.mgmt.bindSuccessWriteFail' as any))
    } catch (e) { show('error', t('data.mgmt.bindFailed' as any, { error: (e as Error).message })) }
    finally { setFolderBusy(false) }
  }

  // 重新授权（更新/刷新后浏览器把权限降回 prompt 时，一次手势恢复）
  const handleReauthFolder = async () => {
    if (!folderHandle) return
    setFolderBusy(true)
    try {
      const ok = await ensureFolderPermission(folderHandle)
      if (!ok) { show('error', t('data.mgmt.notAuthorized' as any)); return }
      setFolderNeedsAuth(false)
      await writeProjectJSONToFolder(folderHandle, project.id!)
      show('success', t('data.mgmt.reauthSuccess' as any))
    } catch (e) { show('error', t('data.mgmt.reauthFailed' as any, { error: (e as Error).message })) }
    finally { setFolderBusy(false) }
  }

  const handleSaveToFolder = async () => {
    if (!folderHandle) return
    setFolderBusy(true)
    try {
      show('loading', t('data.mgmt.writingFolder' as any))
      if (!(await ensureFolderPermission(folderHandle))) { show('error', t('data.mgmt.notAuthorizedCannotWrite' as any)); setFolderNeedsAuth(true); return }
      const ok = await writeProjectJSONToFolder(folderHandle, project.id!)
      show(ok ? 'success' : 'error', ok ? t('data.mgmt.savedToFolder' as any) : t('data.mgmt.writeFailedRebind' as any))
    } catch (e) { show('error', t('data.mgmt.writeFailed' as any, { error: (e as Error).message })) }
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
        title={t('data.mgmt.jsonFullBackup' as any)}
        desc={t('data.mgmt.jsonFullBackupDesc' as any)}
      >
        <div className="flex gap-3 flex-wrap">
          <ActionButton onClick={handleExportJSON} disabled={status === 'loading'} variant="accent">
            <Download className="w-4 h-4" /> {t('data.mgmt.exportJson' as any)}
          </ActionButton>
          <ActionButton onClick={() => fileInputRef.current?.click()} disabled={status === 'loading'} variant="default">
            <Upload className="w-4 h-4" /> {t('data.mgmt.importJson' as any)}
          </ActionButton>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelected} className="hidden" />
        </div>
      </SectionCard>

      {/* 云备份（GitHub Gist）—— 清浏览器/换设备都不丢 */}
      <CloudBackupCard projectId={project.id!} onImported={onImported} />

      {/* Markdown */}
      <SectionCard
        icon={<FileText className="w-5 h-5 text-blue-400" />}
        title={t('data.mgmt.markdownExport' as any)}
        desc={t('data.mgmt.markdownExportDesc' as any)}
      >
        <ActionButton onClick={handleExportMarkdown} disabled={status === 'loading'} variant="blue">
          <Download className="w-4 h-4" /> {t('data.mgmt.exportMarkdown' as any)}
        </ActionButton>
      </SectionCard>

      {/* TXT */}
      <SectionCard
        icon={<FileType className="w-5 h-5 text-yellow-400" />}
        title={t('data.mgmt.txtExport' as any)}
        desc={t('data.mgmt.txtExportDesc' as any)}
      >
        <ActionButton onClick={handleExportTXT} disabled={status === 'loading'} variant="yellow">
          <Download className="w-4 h-4" /> {t('data.mgmt.exportTxt' as any)}
        </ActionButton>
      </SectionCard>

      {/* 本地文件夹 */}
      <SectionCard
        icon={<FolderOpen className="w-5 h-5 text-orange-400" />}
        title={t('data.mgmt.folderBackup' as any)}
        desc={t('data.mgmt.folderBackupDesc' as any)}
        badge={!isFSASupported() ? t('data.mgmt.chromeEdgeOnly' as any) : undefined}
      >
        {folderHandle ? (
          <div className="space-y-2">
            {folderNeedsAuth ? (
              <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">{t('data.mgmt.boundButReauth' as any, { name: folderName })}</span>
                <button onClick={handleUnbindFolder} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 px-3 py-2 rounded-lg">
                <FolderOpen className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">{t('data.mgmt.bound' as any, { name: folderName })}</span>
                <button onClick={handleUnbindFolder} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {folderNeedsAuth && (
                <ActionButton onClick={handleReauthFolder} disabled={folderBusy} variant="orange">
                  {folderBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                  {t('data.mgmt.reauthorize' as any)}
                </ActionButton>
              )}
              <ActionButton onClick={handleSaveToFolder} disabled={folderBusy || status === 'loading'} variant={folderNeedsAuth ? 'default' : 'orange'}>
                {folderBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {folderBusy ? t('data.mgmt.writing' as any) : t('data.mgmt.saveNow' as any)}
              </ActionButton>
            </div>
          </div>
        ) : (
          <ActionButton onClick={handleBindFolder} disabled={!isFSASupported() || folderBusy || status === 'loading'} variant="orange">
            {folderBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />} {t('data.mgmt.selectFolder' as any)}
          </ActionButton>
        )}
      </SectionCard>

      <SectionCard
        icon={<Stethoscope className="w-5 h-5 text-teal-400" />}
        title={t('data.mgmt.diagnostics' as any)}
        desc={t('data.mgmt.diagnosticsDesc' as any)}
      >
        <ActionButton onClick={handleDownloadDiagnostics} disabled={status === 'loading'} variant="default">
          <Download className="w-4 h-4" /> {t('data.mgmt.downloadDiagnostics' as any)}
        </ActionButton>
      </SectionCard>
    </div>
  )
}

// ── 版本历史 Tab ─────────────────────────────────────────────
function BackupTab({ project }: Props) {
  const { t } = useTranslation('panels')
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
      await createSnapshot(project.id!, label.trim() || t('data.mgmt.manualBackup' as any, { date: new Date().toLocaleString('zh-CN') }), 'manual')
      toast.success(t('data.mgmt.snapshotCreated' as any))
      setLabel(''); setShowForm(false)
    } catch (err) {
      toast.error(t('data.mgmt.snapshotCreateFailed' as any, { error: (err as Error).message }))
    } finally { setCreating(false) }
  }

  const handleRestore = async (snap: Snapshot) => {
    const ok = await dialog.confirm({
      title: t('data.mgmt.restoreSnapshotTitle' as any, { label: snap.label }),
      message: t('data.mgmt.restoreSnapshotMsg' as any),
      confirmText: t('data.backup.restoreAsNew' as any),
    })
    if (!ok) return
    setRestoring(snap.id!)
    try {
      await restoreSnapshot(snap.id!)
      toast.success(t('data.mgmt.restoreSuccess' as any))
    } catch (err) { toast.error(t('data.mgmt.restoreFailed' as any, { error: (err as Error).message })) }
    finally { setRestoring(null) }
  }

  return (
    <div className="space-y-4">
      {/* 新建快照 */}
      <div className="bg-bg-surface border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-text-primary">{t('data.mgmt.createSnapshot' as any)}</span>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-xs text-accent hover:text-accent-hover transition-colors"
          >
            {showForm ? t('data.mgmt.collapse' as any) : t('data.mgmt.addNew' as any)}
          </button>
        </div>
        {showForm && (
          <div className="flex gap-2">
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={t('data.mgmt.snapshotPlaceholder' as any)}
              className="flex-1 px-3 py-1.5 bg-bg-base border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-sm rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {t('data.mgmt.create' as any)}
            </button>
          </div>
        )}
      </div>

      {/* 快照列表 */}
      <div className="space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-8 text-text-muted">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t('data.mgmt.loading' as any)}
          </div>
        )}
        {!loading && snapshots.length === 0 && (
          <div className="text-center text-text-muted text-sm py-10">
            <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
            {t('data.mgmt.noSnapshots' as any)}
          </div>
        )}
        {snapshots.map(snap => (
          <div key={snap.id} className="bg-bg-surface border border-border rounded-lg p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{snap.label}</p>
              <p className="text-xs text-text-muted">{new Date(snap.createdAt).toLocaleString('zh-CN')}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => handleRestore(snap)}
                disabled={restoring === snap.id}
                title={t('data.mgmt.restoreFromSnapshotAria' as any)}
                className="p-1.5 text-text-muted hover:text-accent rounded hover:bg-accent/10 transition-colors disabled:opacity-50"
              >
                {restoring === snap.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              </button>
              <button
                onClick={() => deleteSnapshot(snap.id!)}
                title={t('data.mgmt.deleteSnapshotAria' as any)}
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
