import { FileText } from 'lucide-react'
import type { ChapterPlanReconciliation } from '../../lib/types'
import { useDomainT } from '../../i18n'

interface Props {
  summary?: string
  hasText: boolean
  memoryBusy: boolean
  reconciliation?: ChapterPlanReconciliation
  reconciliationCurrent: boolean
  onGenerateMemory: () => void
  onConfirmActualProgress: () => void
  onApplyOutlineCandidate: () => void
}

export default function ChapterMemoryPanel({
  summary,
  hasText,
  memoryBusy,
  reconciliation,
  reconciliationCurrent,
  onGenerateMemory,
  onConfirmActualProgress,
  onApplyOutlineCandidate,
}: Props) {
  const { t } = useDomainT('editor')
  const reconciliationStale = reconciliation
    && !reconciliationCurrent
    && (reconciliation.reviewStatus === 'pending' || reconciliation.reviewStatus === 'confirmed-constraint')

  return (
    <>
      {(summary || hasText) && (
        <div className="mb-3 p-3 bg-bg-elevated border border-border rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-text-muted">{t('chapterMemory.summaryLabel')}</p>
            <button
              type="button"
              onClick={onGenerateMemory}
              disabled={!hasText || memoryBusy}
              title={t('chapterMemory.refreshBtnTitle')}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-accent disabled:opacity-50 transition-colors"
            >
              <FileText className="w-3 h-3" />
              {memoryBusy ? t('chapterMemory.refreshBtnBusy') : summary ? t('chapterMemory.refreshBtnHasSummary') : t('chapterMemory.refreshBtnNoSummary')}
            </button>
          </div>
          {summary
            ? <p className="text-sm text-text-secondary">{summary}</p>
            : <p className="text-xs text-text-muted/60">{t('chapterMemory.summaryHint')}</p>}
        </div>
      )}

      {reconciliationStale && (
        <div className="mb-3 px-3 py-2 text-xs text-text-muted bg-bg-elevated border border-border rounded-lg">
          {t('chapterMemory.reconciliationStale')}
        </div>
      )}

      {reconciliation && reconciliationCurrent && (
        <div className="mb-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-amber-300">{t('chapterMemory.reconciliationTitle')}</p>
            <span className="text-[10px] text-text-muted">
              {reconciliation.reviewStatus === 'pending' ? t('chapterMemory.reconciliationStatusPending') : t('chapterMemory.reconciliationStatusHandled')}
            </span>
          </div>
          <div className="mt-2 space-y-1 text-xs text-text-secondary">
            {([
              [t('chapterMemory.reconciliationCompleted'), reconciliation.completedGoals],
              [t('chapterMemory.reconciliationUnfinished'), reconciliation.unfinishedGoals],
              [t('chapterMemory.reconciliationDeviations'), reconciliation.deviations],
              [t('chapterMemory.reconciliationNewConstraints'), reconciliation.newConstraints],
              [t('chapterMemory.reconciliationNextImpacts'), reconciliation.nextChapterImpacts],
            ] as const).flatMap(([label, items]) => items.map((item, index) => (
              <div key={`${label}:${index}`}>
                <p><span className="text-amber-300/80">{label}{t('common:colon')}</span>{item.text}</p>
                {item.evidenceQuotes[0] && (
                  <p className="pl-3 text-[11px] text-text-muted">{t('chapterMemory.evidenceQuote', { quote: item.evidenceQuotes[0].quote })}</p>
                )}
              </div>
            )))}
          </div>
          {reconciliation.reviewStatus === 'pending' && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onConfirmActualProgress}
                className="px-2 py-1 text-xs rounded bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
              >
                {t('chapterMemory.btnConfirmProgress')}
              </button>
              {reconciliation.proposedOutlineSummary && (
                <button
                  type="button"
                  onClick={onApplyOutlineCandidate}
                  className="px-2 py-1 text-xs rounded bg-accent/10 text-accent hover:bg-accent/20"
                >
                  {t('chapterMemory.btnApplyOutline')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
