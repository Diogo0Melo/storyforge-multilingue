import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  CheckCircle2,
  History,
  Loader2,
  Microscope,
  RotateCcw,
  StopCircle,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import type {
  Reference,
  ReferenceAnalysisDepth,
  ReferenceAnalysisRun,
  ReferenceChunkAnalysis,
  ReferenceSourceKind,
  ReferenceUsageScope,
} from '../../lib/types'
import { DIMENSION_LABELS, DIMENSION_LABEL_KEYS } from '../../lib/types/reference'
import {
  cancelRefAnalysisPipeline,
  getActiveRefAnalysisRunId,
  isRefAnalysisPipelineRunning,
  planRefChunks,
  registerRefChunks,
  runRefAnalysis,
  setRefAnalysisPipelineListener,
} from '../../lib/reference-analysis/pipeline'
import {
  activateReferenceAnalysisRun,
  createReferenceAnalysisRun,
  diffReferenceAnalysisChunks,
  discardReferenceAnalysisRun,
  listReferenceAnalysisRuns,
} from '../../lib/reference-analysis/lifecycle'
import { useReferenceStore } from '../../stores/reference'
import AnalysisReportViewer from './AnalysisReportViewer'
import { useDomainT } from '../../i18n'

interface Props {
  reference: Reference
}

type RunStatus = ReferenceAnalysisRun['status']
type StatusKey =
  | 'deepAnalysis.statusAnalyzing' | 'deepAnalysis.statusReady'
  | 'deepAnalysis.statusActive' | 'deepAnalysis.statusSuperseded'
  | 'deepAnalysis.statusFailed' | 'deepAnalysis.statusCancelled'

const STATUS_KEY: Record<RunStatus, StatusKey> = {
  analyzing: 'deepAnalysis.statusAnalyzing',
  ready: 'deepAnalysis.statusReady',
  active: 'deepAnalysis.statusActive',
  superseded: 'deepAnalysis.statusSuperseded',
  failed: 'deepAnalysis.statusFailed',
  cancelled: 'deepAnalysis.statusCancelled',
}

export default function ReferenceDeepAnalysisTab({ reference }: Props) {
  const { t, lang } = useDomainT('project')
  // 维度差异清单的语言感知连接（替代硬编码 '、'）
  const dimensionListFormat = useMemo(() => new Intl.ListFormat(lang, { type: 'conjunction', style: 'short' }), [lang])
  const { getChunkAnalyses, loadAll } = useReferenceStore()
  const [runs, setRuns] = useState<ReferenceAnalysisRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<number>()
  const [chunks, setChunks] = useState<ReferenceChunkAnalysis[]>([])
  const [activeChunks, setActiveChunks] = useState<ReferenceChunkAnalysis[]>([])
  const [depth, setDepth] = useState<ReferenceAnalysisDepth>('quick')
  const [sourceKind, setSourceKind] = useState<ReferenceSourceKind>('unknown')
  const [usageScope, setUsageScope] = useState<ReferenceUsageScope>('analysis-only')
  const [rightsNote, setRightsNote] = useState('')
  const [rightsConfirmed, setRightsConfirmed] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')
  const [activityLog, setActivityLog] = useState<{ level: string; msg: string }[]>([])
  const [running, setRunning] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reloadRuns = useCallback(async (preferRunId?: number) => {
    if (!reference.id) return
    const nextRuns = await listReferenceAnalysisRuns(reference.id)
    setRuns(nextRuns)
    const active = nextRuns.find(run => run.status === 'active')
    const selected = nextRuns.find(run => run.id === preferRunId)
      ?? active
      ?? nextRuns[0]
    setSelectedRunId(selected?.id)
    setChunks(selected?.id ? await getChunkAnalyses(reference.id, selected.id) : [])
    setActiveChunks(active?.id ? await getChunkAnalyses(reference.id, active.id) : [])
    if (selected) setProgress(selected.progress)
    setRunning(isRefAnalysisPipelineRunning() && getActiveRefAnalysisRunId() === selected?.id)
  }, [getChunkAnalyses, reference.id])

  useEffect(() => {
    reloadRuns()
  }, [reloadRuns])

  useEffect(() => {
    setRefAnalysisPipelineListener({
      onProgress: (nextProgress, message) => {
        setProgress(nextProgress)
        if (message) setStatusMessage(message)
      },
      onActivity: (level, message) => {
        setActivityLog(current => [...current.slice(-20), { level, msg: message }])
      },
      onDone: async (referenceId, _success, runId) => {
        if (reference.id !== referenceId) return
        setRunning(false)
        await reloadRuns(runId)
        await loadAll(reference.projectId)
      },
    })
    return () => setRefAnalysisPipelineListener({})
  }, [loadAll, reference.id, reference.projectId, reloadRuns])

  useEffect(() => {
    if ((sourceKind === 'research' || sourceKind === 'unknown') && usageScope !== 'analysis-only') {
      setUsageScope('analysis-only')
    }
  }, [sourceKind, usageScope])

  const selectedRun = runs.find(run => run.id === selectedRunId)
  const activeRun = runs.find(run => run.status === 'active')
  const isAnalyzing = running
  const isHistorical = reference.type === 'historical'
  const diff = useMemo(
    () => selectedRun?.status === 'ready'
      ? diffReferenceAnalysisChunks(activeChunks, chunks)
      : undefined,
    [activeChunks, chunks, selectedRun?.status],
  )

  const handleSelectRun = async (run: ReferenceAnalysisRun) => {
    if (!reference.id || !run.id) return
    setSelectedRunId(run.id)
    setChunks(await getChunkAnalyses(reference.id, run.id))
    setProgress(run.progress)
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !reference.id) return
    try {
      if (!/\.(txt|md)$/i.test(file.name)) {
        throw new Error(t('deepAnalysis.errorTxtMdOnly'))
      }
      if (!rightsConfirmed) throw new Error(t('deepAnalysis.errorRightsRequired'))
      const text = await file.text()
      if (!text.trim()) throw new Error(t('deepAnalysis.errorEmptyFile'))
      const plan = planRefChunks(text, depth)
      const run = await createReferenceAnalysisRun({
        referenceId: reference.id,
        depth,
        sourceFilename: file.name,
        fileHash: plan.fileHash,
        totalChars: plan.totalChars,
        expectedChunks: plan.chunks.length,
        sourceKind,
        usageScope,
        rightsNote,
        rightsConfirmed: true,
        sourceText: text,
        sourceChunks: plan.chunks,
      })
      registerRefChunks(run.id!, plan.chunks)
      setSelectedRunId(run.id)
      setStatusMessage(t('deepAnalysis.savedBreakpoint', {
        filename: file.name,
        chars: plan.totalChars.toLocaleString(),
        chunks: plan.chunks.length,
      }))
      setActivityLog([])
      setProgress(0)
      await reloadRuns(run.id)
      setRunning(true)
      void runRefAnalysis(reference.id, run.id)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error))
    } finally {
      event.target.value = ''
    }
  }

  const handleResume = async () => {
    if (!reference.id || !selectedRun?.id) return
    setRunning(true)
    setProgress(selectedRun.progress)
    setStatusMessage(t('deepAnalysis.resumeFromLocal'))
    void runRefAnalysis(reference.id, selectedRun.id)
  }

  const handleActivate = async () => {
    if (!selectedRun?.id) return
    try {
      await activateReferenceAnalysisRun(selectedRun.id)
      await reloadRuns(selectedRun.id)
      await loadAll(reference.projectId)
      setStatusMessage(t('deepAnalysis.versionActivated', { version: selectedRun.version }))
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const handleDiscard = async () => {
    if (!selectedRun?.id) return
    try {
      await discardReferenceAnalysisRun(selectedRun.id)
      await reloadRuns(activeRun?.id)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-bg-elevated rounded-lg p-3 text-xs text-text-muted leading-relaxed">
        <Microscope className="w-4 h-4 inline mr-1.5 text-accent" />
        {isHistorical ? t('deepAnalysis.introHistorical')
          : t('deepAnalysis.introNarrative')}
        {' '}{t('deepAnalysis.introLifecycle')}
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_1fr] bg-bg-elevated/60 border border-border rounded-lg p-3">
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-primary">{t('deepAnalysis.settingsHeading')}</p>
          <div className="flex flex-wrap gap-2">
            <select value={depth} onChange={event => setDepth(event.target.value as ReferenceAnalysisDepth)}
              className="bg-bg-elevated border border-border rounded px-2 py-1.5 text-xs text-text-primary">
              <option value="quick">{t('deepAnalysis.depthQuick')}</option>
              <option value="deep">{t('deepAnalysis.depthDeep')}</option>
            </select>
            <select value={sourceKind} onChange={event => setSourceKind(event.target.value as ReferenceSourceKind)}
              className="bg-bg-elevated border border-border rounded px-2 py-1.5 text-xs text-text-primary">
              <option value="own-work">{t('deepAnalysis.sourceOwnWork')}</option>
              <option value="authorized">{t('deepAnalysis.sourceAuthorized')}</option>
              <option value="public-domain">{t('deepAnalysis.sourcePublicDomain')}</option>
              <option value="research">{t('deepAnalysis.sourceResearch')}</option>
              <option value="unknown">{t('deepAnalysis.sourceUnknown')}</option>
            </select>
            <select value={usageScope} onChange={event => setUsageScope(event.target.value as ReferenceUsageScope)}
              className="bg-bg-elevated border border-border rounded px-2 py-1.5 text-xs text-text-primary">
              <option value="analysis-only">{t('deepAnalysis.scopeAnalysisOnly')}</option>
              <option value="creative-reference" disabled={sourceKind === 'research' || sourceKind === 'unknown'}>{t('deepAnalysis.scopeCreativeReference')}</option>
              <option value="continuation-authorized" disabled={sourceKind === 'research' || sourceKind === 'unknown'}>{t('deepAnalysis.scopeContinuationAuthorized')}</option>
            </select>
          </div>
          <input value={rightsNote} onChange={event => setRightsNote(event.target.value)}
            placeholder={t('deepAnalysis.rightsNotePlaceholder')}
            className="w-full bg-bg-elevated border border-border rounded px-2 py-1.5 text-xs text-text-primary" />
          <label className="flex items-start gap-2 text-[11px] text-text-muted">
            <input type="checkbox" checked={rightsConfirmed} onChange={event => setRightsConfirmed(event.target.checked)}
              className="mt-0.5" />
            <span>{t('deepAnalysis.rightsConfirmLabel')}</span>
          </label>
          <input ref={fileInputRef} type="file" accept=".txt,.md" onChange={handleFileUpload} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing}
            className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors">
            <UploadCloud className="w-4 h-4" /> {t('deepAnalysis.uploadButton')}
          </button>
          {statusMessage && <p className="text-[11px] text-text-muted">{statusMessage}</p>}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-text-primary flex items-center gap-1">
            <History className="w-3.5 h-3.5" /> {t('deepAnalysis.versionsHeading')}
          </p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {runs.length === 0 && <p className="text-xs text-text-muted">{t('deepAnalysis.noVersions')}</p>}
            {runs.map(run => (
              <button key={run.id} onClick={() => handleSelectRun(run)}
                className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded border text-xs ${
                  selectedRunId === run.id ? 'border-accent/50 bg-accent/10' : 'border-border hover:bg-bg-hover'
                }`}>
                <span className="text-text-primary">v{run.version} · {run.depth === 'deep' ? t('deepAnalysis.depthDeepShort') : t('deepAnalysis.depthQuickShort')} · {run.sourceFilename}</span>
                <span className={run.status === 'active' ? 'text-green-400' : run.status === 'ready' ? 'text-amber-400' : 'text-text-muted'}>
                  {t(STATUS_KEY[run.status])}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {isAnalyzing && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-accent"><Loader2 className="w-4 h-4 animate-spin" /> {t('deepAnalysis.analyzingProgress', { version: selectedRun?.version ?? '?' })}</div>
            <button onClick={cancelRefAnalysisPipeline}
              className="flex items-center gap-1 px-3 py-1 text-xs text-red-400 border border-red-400/30 rounded">
              <StopCircle className="w-3.5 h-3.5" /> {t('deepAnalysis.cancelButton')}
            </button>
          </div>
          <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
            <div className="h-full bg-accent transition-all rounded-full" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-xs text-text-muted">{progress}% — {statusMessage}</div>
        </div>
      )}

      {!isAnalyzing && selectedRun && (
        <div className="flex items-center justify-between gap-3 border border-border rounded-lg p-3">
          <div className="text-xs text-text-muted">
            <p className="text-sm text-text-primary flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4" /> {t('deepAnalysis.chunkProgress', {
                version: selectedRun.version,
                status: t(STATUS_KEY[selectedRun.status]),
                done: chunks.length,
                total: selectedRun.expectedChunks,
              })}
            </p>
            <p className="mt-1">
              {t('deepAnalysis.metaSource', { kind: selectedRun.sourceKind, scope: selectedRun.usageScope })}
              {!selectedRun.rightsConfirmed && <span className="text-amber-400"> · {t('deepAnalysis.legacyRightsWarning')}</span>}
            </p>
            {selectedRun.error && <p className="text-amber-400 mt-1">{selectedRun.error}</p>}
          </div>
          <div className="flex items-center gap-2">
            {(selectedRun.status === 'analyzing' || selectedRun.status === 'failed' || selectedRun.status === 'cancelled') && (
              <button onClick={handleResume} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-accent/40 text-accent rounded">
                <RotateCcw className="w-3.5 h-3.5" /> {t('deepAnalysis.resumeButton')}
              </button>
            )}
            {(selectedRun.status === 'ready' || selectedRun.status === 'superseded') && (
              <button onClick={handleActivate} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-accent text-white rounded">
                <CheckCircle2 className="w-3.5 h-3.5" /> {selectedRun.status === 'superseded' ? t('deepAnalysis.rollbackButton') : t('deepAnalysis.activateButton')}
              </button>
            )}
            {selectedRun.status !== 'active' && (
              <button onClick={handleDiscard} className="p-1.5 text-text-muted hover:text-red-400" aria-label={t('deepAnalysis.discardAriaLabel')}>
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {diff && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs">
          <p className="font-medium text-amber-400 mb-1">{t('deepAnalysis.diffHeading')}</p>
          <p className="text-text-muted">
            {t('deepAnalysis.diffSummary', {
              added: diff.added.length,
              changed: diff.changed.length,
              removed: diff.removed.length,
              unchanged: diff.unchanged.length,
            })}
          </p>
          {(diff.added.length + diff.changed.length + diff.removed.length) > 0 && (
            <p className="mt-1 text-text-primary">
              {dimensionListFormat.format([...diff.added, ...diff.changed, ...diff.removed].map(dim => DIMENSION_LABEL_KEYS[dim] ? t(DIMENSION_LABEL_KEYS[dim], { defaultValue: DIMENSION_LABELS[dim] }) : (DIMENSION_LABELS[dim] || dim)))}
            </p>
          )}
        </div>
      )}

      {isAnalyzing && activityLog.length > 0 && (
        <div className="bg-bg-elevated rounded-lg p-2 max-h-28 overflow-y-auto text-[11px] font-mono space-y-0.5">
          {activityLog.map((log, index) => (
            <div key={index} className={log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : log.level === 'success' ? 'text-green-400' : 'text-text-muted'}>
              {log.msg}
            </div>
          ))}
        </div>
      )}

      {chunks.length > 0 && !isAnalyzing && selectedRun && (
        <AnalysisReportViewer reference={reference} run={selectedRun} chunks={chunks} isHistorical={isHistorical} />
      )}
    </div>
  )
}
