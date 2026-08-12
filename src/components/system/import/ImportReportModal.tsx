import { useMemo } from 'react'
import { X, CheckCircle2, AlertTriangle, RotateCcw, FileText, Trash2, ArrowRight, BookOpenCheck } from 'lucide-react'
import type { ImportSession } from '../../../lib/types/import-session'
import { useDomainT } from '../../../i18n'

interface Props {
  session: ImportSession
  onRetryFailed: () => void
  onClose: () => void
  onDiscard: () => void
  /** 「前往查看」—— 跳到导入数据的落点（当前项目=设定库 / 项目参考页）。不传则不显示该按钮。 */
  onNavigate?: () => void
  /** Phase 35-c：进入 Codex 候选审查；候选未确认前不会入库。 */
  onReviewCodex?: () => void
}

/**
 * 解析结束后汇报弹窗 —— Phase 18「事后汇报」。
 *
 * 无论全部成功还是部分失败，都弹一次，告诉用户：
 *   · 最终入库了多少东西
 *   · 哪些块失败了、原因是什么
 *   · 要不要对失败块单独重试
 */
export default function ImportReportModal({
  session, onRetryFailed, onClose, onDiscard, onNavigate, onReviewCodex,
}: Props) {
  const toReference = session.importTarget === 'reference'
  const { t } = useDomainT('system')
  const { done, failed, totalWv, totalChars, totalOl, failedChunks } = useMemo(() => {
    const done = session.chunks.filter(c => c.status === 'done').length
    const failed = session.chunks.filter(c => c.status === 'failed').length
    const totalWv = session.chunks.reduce(
      (a, c) => a + (c.extractedCounts?.worldviewFields || 0), 0,
    )
    const totalChars = session.chunks.reduce(
      (a, c) => a + (c.extractedCounts?.characters || 0), 0,
    )
    const totalOl = session.chunks.reduce(
      (a, c) => a + (c.extractedCounts?.outlineNodes || 0), 0,
    )
    const failedChunks = session.chunks.filter(c => c.status === 'failed')
    return { done, failed, totalWv, totalChars, totalOl, failedChunks }
  }, [session])

  const allSuccess = failed === 0
  const codexCandidates = session.merged?.codexCandidates?.length || 0

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-bg-surface border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b border-border ${
          allSuccess ? 'bg-success/10' : 'bg-warning/10'
        }`}>
          <div className="flex items-center gap-2">
            {allSuccess
              ? <CheckCircle2 className="w-5 h-5 text-success" />
              : <AlertTriangle className="w-5 h-5 text-warning" />}
            <h3 className="text-base font-semibold text-text-primary">
              {allSuccess
                ? t('reportModal.headingSuccess')
                : t('reportModal.headingPartial', { count: failed })}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-bg-hover rounded">
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 文件信息 */}
          <div className="bg-bg-base border border-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-xs text-text-muted mb-1">
              <FileText className="w-3 h-3" /> {t('reportModal.fileLabel')}
            </div>
            <div className="text-sm text-text-primary font-medium break-all">{session.filename}</div>
            <div className="text-xs text-text-muted mt-1">
              {t('reportModal.fileStats', {
                chars: session.totalChars.toLocaleString(),
                chunks: session.totalChunks,
                chunkSize: session.chunkSize.toLocaleString(),
              })}
            </div>
          </div>

          {/* 结果摘要 */}
          <div className="grid grid-cols-5 gap-2">
            <StatCard label={t('reportModal.statSuccess')} value={done} color="text-success" />
            <StatCard label={t('reportModal.statFailed')} value={failed} color={failed > 0 ? 'text-error' : 'text-text-muted'} />
            <StatCard label={t('reportModal.statWorldview')} value={totalWv} color="text-accent" />
            <StatCard label={t('reportModal.statCharacters')} value={totalChars} color="text-accent" />
            <StatCard label={t('reportModal.statCodexCandidates')} value={codexCandidates} color="text-accent" />
          </div>
          <div className="text-xs text-text-muted">
            {t('reportModal.outlineNodesSummary', { count: totalOl })}
          </div>

          {/* 已导入提示 —— 数据在解析时已实时入库,无需再点「导入」 */}
          {done > 0 && (
            <div className="bg-success/10 border border-success/30 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-1.5 text-success font-medium mb-1">
                <CheckCircle2 className="w-4 h-4" />
                {toReference ? t('reportModal.importedToReference') : t('reportModal.importedToProject')}
              </div>
              <div className="text-text-secondary text-xs leading-relaxed">
                {toReference
                  ? t('reportModal.importedReferenceBody')
                  : t('reportModal.importedProjectBody')}
              </div>
            </div>
          )}

          {codexCandidates > 0 && (
            <div className={`border rounded-lg p-3 text-sm ${
              session.codexAdoption
                ? 'bg-success/10 border-success/30'
                : 'bg-accent/10 border-accent/30'
            }`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className={`flex items-center gap-1.5 font-medium ${
                    session.codexAdoption ? 'text-success' : 'text-accent'
                  }`}>
                    <BookOpenCheck className="w-4 h-4" />
                    {session.codexAdoption
                      ? t('reportModal.codexAdoptedSummary', {
                          imported: session.codexAdoption.imported,
                          updated: session.codexAdoption.updated,
                          skipped: session.codexAdoption.skipped,
                        })
                      : t('reportModal.codexPendingSummary', { count: codexCandidates })}
                  </div>
                  <div className="text-xs text-text-secondary mt-1">
                    {t('reportModal.codexReviewHint')}
                  </div>
                </div>
                {onReviewCodex && !session.codexAdoption && (
                  <button
                    onClick={onReviewCodex}
                    className="px-3 py-2 bg-accent text-white text-xs rounded hover:bg-accent-hover shrink-0"
                  >
                    {t('reportModal.codexReviewButton')}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* finalReport 详文 */}
          {session.finalReport && (
            <div className="bg-bg-base border border-border rounded-lg p-3">
              <div className="text-xs text-text-secondary mb-1.5">{t('reportModal.finalReportHeading')}</div>
              <pre className="text-xs text-text-primary font-mono whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
                {session.finalReport}
              </pre>
            </div>
          )}

          {/* 失败块明细 */}
          {failedChunks.length > 0 && (
            <div className="bg-error/5 border border-error/30 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs text-error mb-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                <strong>{t('reportModal.failedChunksHeading', { count: failedChunks.length })}</strong>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1 text-xs">
                {failedChunks.map(c => (
                  <div key={c.index} className="bg-bg-base p-2 rounded border border-error/20">
                    <div className="text-text-primary font-medium">
                      {t('reportModal.failedChunkLine', {
                        index: c.index + 1,
                        label: c.label ? `${t('common:colon')}${c.label}` : '',
                      })}
                    </div>
                    <div className="text-text-muted mt-0.5 break-all">
                      {c.errorMessage || t('reportModal.failedChunkUnknownError')}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-text-muted leading-relaxed">
                {t('reportModal.failedChunksRetryHint', { count: failedChunks.length })}
              </div>
            </div>
          )}

          {session.fatalError && !failedChunks.length && (
            <div className="bg-error/10 border border-error/30 rounded-lg p-3 text-xs text-error">
              <AlertTriangle className="inline w-3 h-3 mr-1" />
              {session.fatalError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border bg-bg-base">
          <button
            onClick={onDiscard}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-text-muted hover:text-error hover:bg-error/10 rounded"
            title={t('reportModal.discardSessionTitle')}
          >
            <Trash2 className="w-3.5 h-3.5" /> {t('reportModal.discardSessionButton')}
          </button>
          <div className="flex items-center gap-2">
            {failedChunks.length > 0 && (
              <button
                onClick={onRetryFailed}
                className="flex items-center gap-1.5 px-4 py-2 bg-warning text-white text-sm rounded hover:bg-warning/90"
              >
                <RotateCcw className="w-4 h-4" /> {t('reportModal.retryFailedButton', { count: failedChunks.length })}
              </button>
            )}
            {onNavigate && done > 0 && (
              <button
                onClick={onNavigate}
                className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-sm rounded hover:bg-accent-hover"
              >
                {toReference ? t('reportModal.navigateToReference') : t('reportModal.navigateToSettings')}
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className={`px-4 py-2 text-sm rounded ${
                onNavigate && done > 0
                  ? 'border border-border text-text-secondary hover:bg-bg-hover'
                  : 'bg-accent text-white hover:bg-accent-hover'
              }`}
            >
              {t('reportModal.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: {
  label: string; value: number; color: string
}) {
  return (
    <div className="bg-bg-base border border-border rounded-lg p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-text-muted mt-0.5">{label}</div>
    </div>
  )
}
