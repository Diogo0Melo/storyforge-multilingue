import { useState, useRef, useEffect } from 'react'
import {
  Download, Upload, FileJson, FileText, FileType,
  Loader2, CheckCircle, AlertCircle, FolderOpen, X,
  History, Plus, Trash2, RotateCcw, HardDrive,
  ShieldAlert, Stethoscope, RefreshCw, GitCompareArrows,
} from 'lucide-react'
import { useDomainT } from '../../i18n'
import { exportProjectJSON, downloadJSON, importProjectJSON, type ProjectExportData } from '../../lib/export/json-export'
import { exportProjectMarkdown, exportProjectTXT, downloadTextFile } from '../../lib/export/text-export'
import {
  isFSASupported, pickFolder, ensureFolderPermission, folderPermissionGranted,
  writeProjectSnapshotToFolder,
} from '../../lib/storage/folder-backup'
import {
  clearProjectFolderHandle,
  loadProjectFolderHandle,
} from '../../lib/storage/folder-handle-store'
import {
  bindCreatedProjectStorageWorkspace,
  bindProjectStorageWorkspace,
} from '../../lib/storage/project-storage-workspace'
import { useBackupStore } from '../../stores/backup'
import CloudBackupCard from './CloudBackupCard'
import { useToast } from '../shared/Toast'
import { useDialog } from '../shared/Dialog'
import type {
  Project,
  Snapshot,
  WorkspaceFileCandidateSetV1,
  WorkspaceImpactPlanV1,
  WorkspaceSelfCheckReportV1,
} from '../../lib/types'
import { buildLocalDiagnosticReport } from '../../lib/diagnostics/local-diagnostic-report'
import { inspectProjectBackup, type BackupTrustReport } from '../../lib/export/backup-trust'
import {
  buildWorkspaceSelfCheckReportV1,
  buildWorkspaceFileAdoptionCandidatesV1,
  adoptWorkspaceFileChangesV1,
  confirmMissingChapterFileDeletionsV1,
  resolveWorkspaceConflictsUsingDatabaseV1,
  restoreWorkspaceFromFolderV1,
  exportWorkspacePackageFromProjectV1,
  importWorkspacePackageV1,
  synchronizeProjectChangesToFolderV1,
} from '../../lib/memory/workspace-projection'
import {
  isMemoryEngineeringRuntimeEnabledV1,
  setMemoryEngineeringRuntimeEnabledV1,
} from '../../lib/memory/runtime'
import { buildWorkspaceImpactPlanV1 } from '../../lib/memory/workspace-impact'
import { useProjectStore } from '../../stores/project'

type Tab = 'export' | 'backup'
type ExportStatus = 'idle' | 'loading' | 'success' | 'error'

interface Props {
  project: Project
  onImported?: (newProjectId: number) => void
  onOpenStorageSettings?: () => void
}

export default function DataManagementPanel({ project, onImported, onOpenStorageSettings }: Props) {
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

      {activeTab === 'export'    && <ExportTab project={project} onImported={onImported} onOpenStorageSettings={onOpenStorageSettings} />}
      {activeTab === 'backup'    && <BackupTab    project={project} onImported={onImported} />}
    </div>
  )
}

// ── 导出/导入 Tab ────────────────────────────────────────────
function ExportTab({ project, onImported, onOpenStorageSettings }: Props) {
  const { t, lang } = useDomainT('data')
  const [status, setStatus] = useState<ExportStatus>('idle')
  const [message, setMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const workspacePackageInputRef = useRef<HTMLInputElement>(null)

  // ── 本地文件夹（句柄持久化 + 显式完整快照，FB-11）──
  const [folderHandle, setFolderHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [folderName, setFolderName] = useState('')
  const [folderNeedsAuth, setFolderNeedsAuth] = useState(false)
  const [folderBusy, setFolderBusy] = useState(false)
  const [memoryReport, setMemoryReport] = useState<WorkspaceSelfCheckReportV1 | null>(null)
  const [memoryCandidates, setMemoryCandidates] = useState<WorkspaceFileCandidateSetV1 | null>(null)
  const [memoryImpactPlan, setMemoryImpactPlan] = useState<WorkspaceImpactPlanV1 | null>(null)
  const [memoryEnabled, setMemoryEnabled] = useState(() => isMemoryEngineeringRuntimeEnabledV1())
  const [backupReport, setBackupReport] = useState<BackupTrustReport | null>(null)

  // 进面板时把该项目已持久化的绑定读回来；授权仍有效则直接显示已绑定，失效则提示重新授权
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const h = await loadProjectFolderHandle({ id: project.id, workspaceUid: project.workspaceUid })
      if (!h || cancelled) return
      setFolderHandle(h)
      setFolderName(h.name)
      setFolderNeedsAuth(!(await folderPermissionGranted(h)))
    })()
    return () => { cancelled = true }
  }, [project.id, project.workspaceUid])

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

  // Bind only persists the selected handle. No file is written until the author
  // explicitly confirms a snapshot or a memory-workspace synchronization.
  const handleBindFolder = async () => {
    setFolderBusy(true)
    try {
      const selected = await pickFolder({
        id: 'storyforge-project-location',
        startIn: folderHandle ?? undefined,
      })
      if (!selected) return
      if (!(await ensureFolderPermission(selected))) {
        show('error', t('export.folderNotGranted'))
        return
      }
      await bindProjectStorageWorkspace(project, selected)
      setFolderHandle(selected)
      setFolderName(selected.name)
      setFolderNeedsAuth(false)
      show('success', `文件夹已绑定：${selected.name}；尚未写入文件，请先核对后保存`)
    } catch (e) {
      show('error', t('export.folderBindFailed', { message: (e as Error).message }))
    } finally {
      setFolderBusy(false)
    }
  }

  const handleUnbindFolder = async () => {
    try {
      await clearProjectFolderHandle(project)
      setFolderHandle(null)
      setFolderName('')
      setFolderNeedsAuth(false)
      setMemoryReport(null)
      setMemoryCandidates(null)
      setMemoryImpactPlan(null)
    } catch (e) {
      show('error', t('export.folderBindFailed', { message: (e as Error).message }))
    }
  }

  const handleExportWorkspacePackage = async () => {
    try {
      show('loading', '正在生成可校验的工作区包...')
      const pkg = await exportWorkspacePackageFromProjectV1(project.id!)
      downloadTextFile(
        JSON.stringify(pkg, null, 2),
        `${project.name}_${new Date().toISOString().slice(0, 10)}.storyforge.json`,
        'application/json',
      )
      show('success', '工作区包已导出；它包含可读文档和完整恢复胶囊')
    } catch (e) {
      show('error', `工作区包导出失败：${(e as Error).message}`)
    }
  }

  const handleWorkspacePackageSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      show('loading', '正在校验并恢复工作区包...')
      const restored = await importWorkspacePackageV1(JSON.parse(await file.text()))
      await useProjectStore.getState().loadProject(restored.projectId)
      show('success', restored.reboundHarnessRunCount > 0
        ? `工作区包已恢复；${restored.reboundHarnessRunCount} 个 Harness 终态凭据因本地主键重绑定已安全标为待复核，历史证据仍保留`
        : '工作区包已完整恢复并通过回读核对')
      onImported?.(restored.projectId)
    } catch (e) {
      show('error', `工作区包导入失败：${(e as Error).message}`)
    } finally {
      event.target.value = ''
    }
  }

  // 重新授权（更新/刷新后浏览器把权限降回 prompt 时，一次手势恢复）
  const handleReauthFolder = async () => {
    if (!folderHandle) return
    setFolderBusy(true)
    try {
      const ok = await ensureFolderPermission(folderHandle)
      if (!ok) { show('error', t('export.folderReauthStillDenied')); return }
      setFolderNeedsAuth(false)
      show('success', '已重新授权；只有你点击保存时才会写入')
    } catch (e) { show('error', t('export.folderReauthFailed', { message: (e as Error).message })) }
    finally { setFolderBusy(false) }
  }

  const handleSaveToFolder = async () => {
    if (!folderHandle) return
    setFolderBusy(true)
    try {
      show('loading', t('export.folderSaving'))
      if (!(await ensureFolderPermission(folderHandle))) { show('error', t('export.folderSaveNoAuth')); setFolderNeedsAuth(true); return }
      const ok = await writeProjectSnapshotToFolder(folderHandle, project.id!)
      show(ok ? 'success' : 'error', ok ? t('export.folderSaveSuccess') : t('export.folderSaveFailed'))
    } catch (e) { show('error', t('export.folderWriteFailed', { message: (e as Error).message })) }
    finally { setFolderBusy(false) }
  }

  const handleCheckMemoryWorkspace = async () => {
    if (!folderHandle) return
    setFolderBusy(true)
    try {
      show('loading', '正在核对项目与本地文件...')
      if (!(await ensureFolderPermission(folderHandle, false))) {
        show('error', '未获文件夹读取权限')
        setFolderNeedsAuth(true)
        return
      }
      const report = await buildWorkspaceSelfCheckReportV1(project.id!, folderHandle)
      setMemoryReport(report)
      const candidates = await buildWorkspaceFileAdoptionCandidatesV1({
        projectId: project.id!,
        root: folderHandle,
        expectedPlanHash: report.plan.planHash,
        includeConflicts: true,
      })
      setMemoryCandidates(candidates)
      setMemoryImpactPlan(candidates.candidates.length
        ? await buildWorkspaceImpactPlanV1({ projectId: project.id!, candidateSet: candidates })
        : null)
      const changed = report.summary.projectChanged + report.summary.fileChanged
        + report.summary.conflict + report.summary.missing + report.summary.extra + report.summary.invalid
      show('success', changed === 0 ? '项目与本地文件已经一致' : `核对完成：发现 ${changed} 项需要处理`)
    } catch (e) {
      show('error', `核对失败：${(e as Error).message}`)
    } finally {
      setFolderBusy(false)
    }
  }

  const handleAdoptFileChanges = async () => {
    if (!folderHandle || !memoryReport) return
    setFolderBusy(true)
    try {
      show('loading', '正在按冻结候选采纳本地改动...')
      if (!(await ensureFolderPermission(folderHandle))) {
        show('error', '需要文件夹写入权限才能提交新的同步基线')
        setFolderNeedsAuth(true)
        return
      }
      await adoptWorkspaceFileChangesV1({
        projectId: project.id!,
        root: folderHandle,
        expectedPlanHash: memoryReport.plan.planHash,
        conflictResolution: memoryReport.summary.conflict > 0 ? 'file-wins' : 'reject',
      })
      await useProjectStore.getState().loadProject(project.id!)
      const next = await buildWorkspaceSelfCheckReportV1(project.id!, folderHandle)
      setMemoryReport(next)
      setMemoryCandidates(null)
      setMemoryImpactPlan(null)
      show('success', '本地文件改动已采纳，并完成数据库与文件回读核对')
    } catch (e) {
      show('error', `采纳停止：${(e as Error).message}`)
    } finally {
      setFolderBusy(false)
    }
  }

  const handleResolveConflictsUsingProject = async () => {
    if (!folderHandle || !memoryReport) return
    setFolderBusy(true)
    try {
      show('loading', '正在保留历史副本并用项目内容解决冲突...')
      if (!(await ensureFolderPermission(folderHandle))) {
        show('error', '未获文件夹写入权限')
        setFolderNeedsAuth(true)
        return
      }
      await resolveWorkspaceConflictsUsingDatabaseV1({
        projectId: project.id!,
        root: folderHandle,
        expectedPlanHash: memoryReport.plan.planHash,
      })
      const next = await buildWorkspaceSelfCheckReportV1(project.id!, folderHandle)
      setMemoryReport(next)
      setMemoryCandidates(null)
      setMemoryImpactPlan(null)
      show('success', '已保留冲突文件历史，并以项目内容完成同步')
    } catch (e) {
      show('error', `冲突处理停止：${(e as Error).message}`)
    } finally {
      setFolderBusy(false)
    }
  }

  const handleConfirmMissingChapterDeletion = async () => {
    if (!folderHandle || !memoryReport) return
    setFolderBusy(true)
    try {
      show('loading', '正在保存回收副本并执行章节删除生命周期...')
      if (!(await ensureFolderPermission(folderHandle))) {
        show('error', '未获文件夹写入权限')
        setFolderNeedsAuth(true)
        return
      }
      await confirmMissingChapterFileDeletionsV1({
        projectId: project.id!, root: folderHandle, expectedPlanHash: memoryReport.plan.planHash,
      })
      const next = await buildWorkspaceSelfCheckReportV1(project.id!, folderHandle)
      setMemoryReport(next)
      setMemoryCandidates(null)
      setMemoryImpactPlan(null)
      show('success', '缺失章节已移入工作区回收历史，并完成引用核对')
    } catch (e) {
      show('error', `删除停止：${(e as Error).message}`)
    } finally {
      setFolderBusy(false)
    }
  }

  const handleRestoreWorkspace = async () => {
    if (!folderHandle) return
    setFolderBusy(true)
    try {
      show('loading', '正在校验恢复胶囊并重建浏览器项目...')
      if (!(await ensureFolderPermission(folderHandle, false))) {
        show('error', '未获文件夹读取权限')
        setFolderNeedsAuth(true)
        return
      }
      const restored = await restoreWorkspaceFromFolderV1(folderHandle)
      // The directory used to restore the project becomes that new project's
      // storage workspace. This persists only the handle and writes no files.
      await bindCreatedProjectStorageWorkspace(restored.projectId, folderHandle)
      await useProjectStore.getState().loadProject(restored.projectId)
      show('success', restored.reboundHarnessRunCount > 0
        ? `已完整恢复并通过回读核对；${restored.reboundHarnessRunCount} 个 Harness 终态凭据因本地主键重绑定已安全标为待复核，历史证据仍保留`
        : '已从本地工作区完整恢复，并通过逐文档回读核对')
      onImported?.(restored.projectId)
    } catch (e) {
      show('error', `恢复停止：${(e as Error).message}`)
    } finally {
      setFolderBusy(false)
    }
  }

  const handleSyncProjectChanges = async () => {
    if (!folderHandle || !memoryReport) return
    setFolderBusy(true)
    try {
      show('loading', '正在按核对计划写入本地文件...')
      if (!(await ensureFolderPermission(folderHandle))) {
        show('error', '未获文件夹写入权限')
        setFolderNeedsAuth(true)
        return
      }
      await synchronizeProjectChangesToFolderV1({
        projectId: project.id!,
        root: folderHandle,
        expectedPlanHash: memoryReport.plan.planHash,
      })
      const next = await buildWorkspaceSelfCheckReportV1(project.id!, folderHandle)
      setMemoryReport(next)
      show('success', '项目改动已写入本地文件，并完成回读核对')
    } catch (e) {
      show('error', `同步停止：${(e as Error).message}`)
    } finally {
      setFolderBusy(false)
    }
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
        title="本地记忆工作区"
        desc="存储位置统一在“设置 → 项目存储工作区”管理。这里负责人工核对、同步和恢复；完整 JSON 恢复快照仍是独立操作。"
        badge={!isFSASupported() ? '仅 Chrome/Edge 支持' : undefined}
      >
        <div className="flex items-center justify-between gap-3 rounded bg-bg-base px-3 py-2 text-xs">
          <span className="text-text-muted">
            {memoryEnabled ? '记忆工作区已启用；所有读取与写入仍需你手动触发。' : '记忆工作区已停用；现有目录不会被读取或改写。'}
          </span>
          <button
            type="button"
            onClick={() => {
              const next = !memoryEnabled
              setMemoryEngineeringRuntimeEnabledV1(next)
              setMemoryEnabled(next)
              if (!next) {
                setMemoryReport(null)
                setMemoryCandidates(null)
                setMemoryImpactPlan(null)
              }
            }}
            className="shrink-0 rounded border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent"
          >
            {memoryEnabled ? '停用' : '重新启用'}
          </button>
        </div>
        {folderHandle ? (
          <div className="space-y-2">
            {folderNeedsAuth ? (
              <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">已绑定「{folderName}」，保存前需要重新授权</span>
                <button onClick={handleUnbindFolder} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 px-3 py-2 rounded-lg">
                <FolderOpen className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">项目存储工作区：{folderName}（不会自动写入）</span>
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
              {memoryEnabled && (
                <ActionButton onClick={handleCheckMemoryWorkspace} disabled={folderBusy || status === 'loading'} variant="orange">
                  {folderBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCompareArrows className="w-4 h-4" />}
                  检查记忆与本地文件
                </ActionButton>
              )}
              {memoryReport && memoryReport.summary.fileChanged + memoryReport.summary.conflict
                + memoryReport.summary.extra + memoryReport.summary.invalid === 0
                && memoryReport.summary.projectChanged + memoryReport.summary.missing + memoryReport.summary.sameChange > 0 && (
                <ActionButton onClick={handleSyncProjectChanges} disabled={folderBusy || status === 'loading'} variant="orange">
                  <RefreshCw className="w-4 h-4" /> 确认写入项目改动
                </ActionButton>
              )}
              {memoryReport && memoryReport.summary.fileChanged + memoryReport.summary.conflict > 0
                && memoryReport.summary.extra + memoryReport.summary.invalid === 0 && (
                <ActionButton onClick={handleAdoptFileChanges} disabled={folderBusy || status === 'loading'} variant="orange">
                  <Upload className="w-4 h-4" />
                  {memoryReport.summary.conflict > 0 ? '以本地文件解决并采纳' : '确认采纳本地改动'}
                </ActionButton>
              )}
              {memoryReport && memoryReport.summary.conflict > 0 && memoryReport.summary.fileChanged === 0
                && memoryReport.summary.extra + memoryReport.summary.invalid === 0 && (
                <ActionButton onClick={handleResolveConflictsUsingProject} disabled={folderBusy || status === 'loading'} variant="default">
                  <Download className="w-4 h-4" /> 以项目内容解决冲突
                </ActionButton>
              )}
              {memoryReport && memoryReport.summary.missing > 0
                && memoryReport.plan.items.filter(item => item.changeKind === 'file-missing')
                  .every(item => item.identity.documentKind === 'chapter')
                && memoryReport.summary.fileChanged + memoryReport.summary.conflict
                  + memoryReport.summary.extra + memoryReport.summary.invalid === 0 && (
                <ActionButton onClick={handleConfirmMissingChapterDeletion} disabled={folderBusy || status === 'loading'} variant="default">
                  <Trash2 className="w-4 h-4" /> 确认删除缺失章节
                </ActionButton>
              )}
              {memoryEnabled && (
                <ActionButton onClick={handleRestoreWorkspace} disabled={folderBusy || status === 'loading'} variant="default">
                  <RotateCcw className="w-4 h-4" /> 从工作区恢复浏览器数据
                </ActionButton>
              )}
              <ActionButton onClick={handleSaveToFolder} disabled={folderBusy || status === 'loading'} variant="default">
                {folderBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {folderBusy ? t('export.savingButton') : t('export.saveNowButton')}
              </ActionButton>
            </div>
            {memoryEnabled && memoryReport && <MemorySelfCheckSummary
              report={memoryReport}
              candidates={memoryCandidates}
              impactPlan={memoryImpactPlan}
            />}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border px-3 py-3">
            <div>
              <p className="text-sm text-text-secondary">尚未设置项目存储工作区</p>
              <p className="mt-0.5 text-xs text-text-muted">选择文件夹只保存绑定，不会自动写入；请回到这里核对并确认首次写入。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton onClick={handleBindFolder} disabled={!isFSASupported() || folderBusy || status === 'loading'} variant="orange">
                {folderBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />} {t('export.selectFolderButton')}
              </ActionButton>
              {onOpenStorageSettings && (
                <ActionButton onClick={onOpenStorageSettings} disabled={!isFSASupported()} variant="default">
                  <FolderOpen className="w-4 h-4" /> 前往设置
                </ActionButton>
              )}
            </div>
          </div>
        )}
        <div className="flex gap-2 flex-wrap border-t border-border/60 pt-3">
          {memoryEnabled && <>
            <ActionButton onClick={handleExportWorkspacePackage} disabled={status === 'loading'} variant="default">
              <Download className="w-4 h-4" /> 导出工作区包
            </ActionButton>
            <ActionButton onClick={() => workspacePackageInputRef.current?.click()} disabled={status === 'loading'} variant="default">
              <Upload className="w-4 h-4" /> 导入工作区包
            </ActionButton>
          </>}
          <input
            ref={workspacePackageInputRef}
            type="file"
            accept=".json,.storyforge.json"
            onChange={handleWorkspacePackageSelected}
            className="hidden"
          />
        </div>
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

function MemorySelfCheckSummary({
  report,
  candidates,
  impactPlan,
}: {
  report: WorkspaceSelfCheckReportV1
  candidates: WorkspaceFileCandidateSetV1 | null
  impactPlan: WorkspaceImpactPlanV1 | null
}) {
  const { summary } = report
  const blocked = summary.fileChanged + summary.conflict + summary.extra + summary.invalid
  const fieldLabels: Readonly<Record<string, string>> = {
    logline: '一句话故事',
    concept: '故事概念',
    theme: '主题',
    centralConflict: '核心冲突',
    plotPattern: '情节模式',
    mainPlot: '故事主线',
    subPlots: '故事复线',
    writingStyle: '写作风格',
    narrativePOV: '叙事视角',
    atmosphere: '基调与氛围',
    prohibitions: '禁止事项',
    consistencyRules: '一致性规则',
    specialRequirements: '特殊要求',
  }
  const changeLabels = {
    'project-changed': '项目内已修改，等待写入本地',
    'file-changed': '本地文件已修改，等待确认采纳',
    conflict: '项目与本地均有修改，需要选边',
    'file-missing': '本地文件缺失，可恢复或按规则处理',
    'file-extra': '本地存在未登记文件，需要人工处理',
    invalid: '文件身份、格式或只读证据异常',
    'same-change': '两侧改动一致，等待提交新基线',
    clean: '已一致',
  } as const
  const changedItems = report.plan.items.filter(item => item.changeKind !== 'clean')
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${blocked > 0
      ? 'border-amber-500/30 bg-amber-500/5 text-amber-200'
      : 'border-teal-500/30 bg-teal-500/5 text-text-secondary'}`}>
      <div className="font-medium">
        {blocked > 0 ? '已保护本地改动，尚未写入任何文件' : '三方核对完成'}
      </div>
      <p className="mt-1 text-text-muted">
        已一致 {summary.clean} · 项目内改动 {summary.projectChanged} · 本地改动 {summary.fileChanged}
        {' '}· 双方冲突 {summary.conflict} · 缺失 {summary.missing} · 异常 {summary.extra + summary.invalid}
      </p>
      {blocked > 0 && <p className="mt-1">本地改动、冲突或损坏项不会被“同步项目改动”覆盖。</p>}
      {changedItems.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
          <p className="font-medium">需要处理的文件</p>
          {changedItems.slice(0, 12).map(item => (
            <div key={item.identity.documentId} className="text-text-muted">
              <p>{item.relativePath} · {changeLabels[item.changeKind]}</p>
              {item.issues.map(issue => <p key={issue} className="pl-2 text-amber-300">{issue}</p>)}
            </div>
          ))}
          {changedItems.length > 12 && <p className="text-text-muted">另有 {changedItems.length - 12} 项未展开</p>}
        </div>
      )}
      {candidates && candidates.candidates.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
          <p className="font-medium">待确认的本地候选（未写入项目）</p>
          {candidates.candidates.map(candidate => (
            <p key={candidate.candidateId} className="text-text-muted">
              {candidate.relativePath} · {candidate.changedFields.map(field => fieldLabels[field] ?? field).join('、')}
            </p>
          ))}
        </div>
      )}
      {impactPlan && (
        <p className="mt-2 text-text-muted">
          影响计划：可确定重建 {impactPlan.counts.deterministic} · 需人工复核 {impactPlan.counts.manualReview}
          {' '}· 可选生成候选 {impactPlan.counts.generativeCandidate}（本次检查零模型调用）
        </p>
      )}
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
