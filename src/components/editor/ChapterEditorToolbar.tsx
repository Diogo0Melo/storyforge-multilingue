import { useMemo } from 'react'
import { BookOpenCheck, Check, ClipboardList, Eye, GitBranch, Loader2, RefreshCw, ShieldCheck, StickyNote, X } from 'lucide-react'
import { CInput } from '../shared/CompositionInput'
import { useDomainT } from '../../i18n'
import type { ImpactPatchCandidateV1 } from '../../lib/agent/run/impact-patch-durable'
import type { ImpactOutlineRegenerationCandidateV1 } from '../../lib/agent/run/impact-outline-regeneration-durable'
import type { ImpactStoryTimelineRegenerationCandidateV1 } from '../../lib/agent/run/impact-story-timeline-regeneration-durable'
import type { ImpactDownstreamScheduleV1 } from '../../lib/agent/run/impact-downstream-schedule'
import type {
  ImpactAuthorReviewRecordV1,
  ImpactReviewDecisionV1,
} from '../../lib/agent/run/impact-review-durable'
import type { ImpactRemediationPlanV1 } from '../../lib/consistency/impact-remediation-plan'

interface ImpactPatchTarget {
  id: number
  title: string
  summary: string
}

interface ImpactOutlineRegenerationTarget extends ImpactPatchTarget {
  itemId: string
}

interface ImpactStoryTimelineRegenerationTarget {
  itemId: string
  id: number
  title: string
}

const IMPACT_REVIEW_ACTION_KEY_MAP: Record<string, string> = {
  'review-source': 'chapterEditorToolbar.actionReviewSource',
  'review-fact': 'chapterEditorToolbar.actionReviewFact',
  'review-source-record': 'chapterEditorToolbar.actionReviewSourceRecord',
  'review-derived-state': 'chapterEditorToolbar.actionReviewDerivedState',
  'review-outline': 'chapterEditorToolbar.actionReviewOutline',
  'review-downstream-chapter': 'chapterEditorToolbar.actionReviewDownstreamChapter',
}

interface Props {
  isStreaming: boolean
  hasText: boolean
  organizingChapter: boolean
  hasOrganizationCandidate: boolean
  analyzingImpact: boolean
  impactInfo: string | null
  impactRemediationPlan: ImpactRemediationPlanV1 | null
  impactDownstreamSchedule: ImpactDownstreamScheduleV1 | null
  impactRemediationBusy: boolean
  impactRemediationReceipt: string | null
  impactRemediationError: string | null
  impactReviewItemId: string | null
  impactReviewDecision: ImpactReviewDecisionV1
  impactReviewNote: string
  impactReviewBusy: boolean
  impactReviewReceipt: string | null
  impactReviewError: string | null
  impactReviewRecords: ImpactAuthorReviewRecordV1[]
  impactPatchTargets: ImpactPatchTarget[]
  impactPatchTargetId: number | null
  impactPatchSummary: string
  impactPatchReason: string
  impactPatchCandidate: ImpactPatchCandidateV1 | null
  impactPatchBusy: boolean
  impactPatchError: string | null
  impactOutlineRegenerationTargets: ImpactOutlineRegenerationTarget[]
  impactOutlineRegenerationItemId: string | null
  impactOutlineRegenerationCandidate: ImpactOutlineRegenerationCandidateV1 | null
  impactOutlineRegenerationBusy: boolean
  impactOutlineRegenerationReceipt: string | null
  impactOutlineRegenerationError: string | null
  impactStoryTimelineRegenerationTargets: ImpactStoryTimelineRegenerationTarget[]
  impactStoryTimelineRegenerationItemId: string | null
  impactStoryTimelineRegenerationCandidate: ImpactStoryTimelineRegenerationCandidateV1 | null
  impactStoryTimelineRegenerationBusy: boolean
  impactStoryTimelineRegenerationReceipt: string | null
  impactStoryTimelineRegenerationError: string | null
  hasOutline: boolean
  showOutlinePreview: boolean
  showReviewPanel: boolean
  consistencyAlertCount: number
  showNotePanel: boolean
  customInstruction: string
  perspectiveCharacterId: number | null
  perspectiveCharacters: Array<{ id: number; name: string }>
  onGenerate: () => void
  onContinue: () => void
  onExpand: () => void
  onPolish: () => void
  onDeAI: () => void
  onOrganizeChapter: () => void
  onAnalyzeImpact: () => void
  onDismissImpact: () => void
  onImpactPatchTargetChange: (targetId: number | null) => void
  onImpactPatchSummaryChange: (value: string) => void
  onImpactPatchReasonChange: (value: string) => void
  onCreateImpactPatch: () => void
  onRunImpactRemediation: () => void
  onReplanImpactRemediation: () => void
  onImpactReviewItemChange: (itemId: string | null) => void
  onImpactReviewDecisionChange: (decision: ImpactReviewDecisionV1) => void
  onImpactReviewNoteChange: (value: string) => void
  onExecuteImpactReview: () => void
  onOpenImpactManualEntry: () => void
  onConfirmImpactPatch: () => void
  onRejectImpactPatch: () => void
  onImpactOutlineRegenerationItemChange: (itemId: string | null) => void
  onGenerateImpactOutlineRegeneration: () => void
  onConfirmImpactOutlineRegeneration: () => void
  onRejectImpactOutlineRegeneration: () => void
  onImpactStoryTimelineRegenerationItemChange: (itemId: string | null) => void
  onGenerateImpactStoryTimelineRegeneration: () => void
  onConfirmImpactStoryTimelineRegeneration: () => void
  onRejectImpactStoryTimelineRegeneration: () => void
  onToggleOutlinePreview: () => void
  onToggleReviewPanel: () => void
  onToggleNotePanel: () => void
  onCustomInstructionChange: (value: string) => void
  onPerspectiveCharacterChange: (characterId: number | null) => void
}

export default function ChapterEditorToolbar({
  isStreaming,
  hasText,
  organizingChapter,
  hasOrganizationCandidate,
  analyzingImpact,
  impactInfo,
  impactRemediationPlan,
  impactDownstreamSchedule,
  impactRemediationBusy,
  impactRemediationReceipt,
  impactRemediationError,
  impactReviewItemId,
  impactReviewDecision,
  impactReviewNote,
  impactReviewBusy,
  impactReviewReceipt,
  impactReviewError,
  impactReviewRecords,
  impactPatchTargets,
  impactPatchTargetId,
  impactPatchSummary,
  impactPatchReason,
  impactPatchCandidate,
  impactPatchBusy,
  impactPatchError,
  impactOutlineRegenerationTargets,
  impactOutlineRegenerationItemId,
  impactOutlineRegenerationCandidate,
  impactOutlineRegenerationBusy,
  impactOutlineRegenerationReceipt,
  impactOutlineRegenerationError,
  impactStoryTimelineRegenerationTargets,
  impactStoryTimelineRegenerationItemId,
  impactStoryTimelineRegenerationCandidate,
  impactStoryTimelineRegenerationBusy,
  impactStoryTimelineRegenerationReceipt,
  impactStoryTimelineRegenerationError,
  hasOutline,
  showOutlinePreview,
  showReviewPanel,
  consistencyAlertCount,
  showNotePanel,
  customInstruction,
  perspectiveCharacterId,
  perspectiveCharacters,
  onGenerate,
  onContinue,
  onExpand,
  onPolish,
  onDeAI,
  onOrganizeChapter,
  onAnalyzeImpact,
  onDismissImpact,
  onImpactPatchTargetChange,
  onImpactPatchSummaryChange,
  onImpactPatchReasonChange,
  onCreateImpactPatch,
  onRunImpactRemediation,
  onReplanImpactRemediation,
  onImpactReviewItemChange,
  onImpactReviewDecisionChange,
  onImpactReviewNoteChange,
  onExecuteImpactReview,
  onOpenImpactManualEntry,
  onConfirmImpactPatch,
  onRejectImpactPatch,
  onImpactOutlineRegenerationItemChange,
  onGenerateImpactOutlineRegeneration,
  onConfirmImpactOutlineRegeneration,
  onRejectImpactOutlineRegeneration,
  onImpactStoryTimelineRegenerationItemChange,
  onGenerateImpactStoryTimelineRegeneration,
  onConfirmImpactStoryTimelineRegeneration,
  onRejectImpactStoryTimelineRegeneration,
  onToggleOutlinePreview,
  onToggleReviewPanel,
  onToggleNotePanel,
  onCustomInstructionChange,
  onPerspectiveCharacterChange,
}: Props) {
  const { t, lang } = useDomainT('editor')
  const listFormat = useMemo(() => new Intl.ListFormat(lang, { type: 'conjunction', style: 'short' }), [lang])
  const reviewedImpactItemIds = new Set(impactReviewRecords.map(record => record.output.itemId))
  const selectedImpactReview = impactReviewRecords.find(record => record.output.itemId === impactReviewItemId)
  const impactDownstreamFocus = impactDownstreamSchedule?.items.find(item => item.status === 'awaiting-confirmation')
    ?? impactDownstreamSchedule?.items.find(item => item.status === 'needs-manual-action')
    ?? impactDownstreamSchedule?.items.find(item => item.status === 'ready')
    ?? impactDownstreamSchedule?.items.find(item => item.status === 'blocked')
  return (
    <div className="flex flex-wrap gap-2 border-t border-border/60 bg-bg-surface/35 px-6 py-3">
      <button onClick={onGenerate} disabled={isStreaming}
        className="rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 disabled:opacity-50 transition-colors">
        {t('chapterEditorToolbar.btnGenerate')}
      </button>
      <button onClick={onContinue} disabled={isStreaming || !hasText}
        className="rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors">
        {t('chapterEditorToolbar.btnContinue')}
      </button>
      <button onClick={onExpand} disabled={isStreaming}
        className="rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors">
        {t('chapterEditorToolbar.btnExpand')}
      </button>
      <button onClick={onPolish} disabled={isStreaming}
        className="rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors">
        {t('chapterEditorToolbar.btnPolish')}
      </button>
      <button onClick={onDeAI} disabled={isStreaming}
        className="rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors">
        {t('chapterEditorToolbar.btnDeAI')}
      </button>
      <button onClick={onOrganizeChapter} disabled={isStreaming || !hasText}
        title={t('chapterEditorToolbar.btnOrganizeTitle')}
        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 text-xs rounded-md hover:bg-emerald-500/20 disabled:opacity-50 transition-colors">
        {organizingChapter
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : <ClipboardList className="w-3 h-3" />}
        {organizingChapter ? t('chapterEditorToolbar.btnOrganizeStop') : hasOrganizationCandidate ? t('chapterEditorToolbar.btnOrganizeView') : t('chapterEditorToolbar.btnOrganizeRun')}
      </button>
      <button onClick={onAnalyzeImpact} disabled={analyzingImpact || !hasText}
        title={t('chapterEditorToolbar.btnImpactTitle')}
        className="flex items-center gap-1 px-3 py-1.5 bg-amber-500/10 text-amber-400 text-xs rounded-md hover:bg-amber-500/20 disabled:opacity-50 transition-colors">
        <ClipboardList className="w-3 h-3" />
        {analyzingImpact ? t('chapterEditorToolbar.btnImpactAnalyzing') : t('chapterEditorToolbar.btnImpactAnalyze')}
      </button>
      {impactInfo && (
        <div className="basis-full space-y-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300/90">
          <div className="flex items-start gap-2">
            <span className="flex-1">{impactInfo}</span>
            <button onClick={onDismissImpact} aria-label={t('chapterEditorToolbar.ariaDismissImpact')} className="text-text-muted hover:text-text-primary"><X className="h-3.5 w-3.5" /><span className="sr-only">×</span></button>
          </div>
          {impactRemediationPlan && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-border/70 bg-bg-elevated/60 px-2 py-1.5 text-[11px] text-text-secondary">
              <span>{t('chapterEditorToolbar.remediationPlanTotal', { total: impactRemediationPlan.counts.total })}</span>
              <span>{t('chapterEditorToolbar.remediationPlanDeterministic', { count: impactRemediationPlan.counts.deterministic })}</span>
              <span>{t('chapterEditorToolbar.remediationPlanAuthorConfirmed', { reviewed: impactReviewRecords.length, total: impactRemediationPlan.counts.authorConfirmed })}</span>
              <span className="ml-auto text-text-muted">{t('chapterEditorToolbar.remediationPlanHash', { hash: impactRemediationPlan.planHash.slice(0, 12) })}</span>
              {impactRemediationPlan.counts.deterministic > 0 && (
                <button
                  onClick={onRunImpactRemediation}
                  disabled={impactRemediationBusy}
                  title={t('chapterEditorToolbar.remediationRunTitle')}
                  className="flex items-center gap-1 rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-400/20 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${impactRemediationBusy ? 'animate-spin' : ''}`} />
                  {impactRemediationBusy ? t('chapterEditorToolbar.remediationRunBusy') : t('chapterEditorToolbar.remediationRunIdle')}
                </button>
              )}
              <button
                onClick={onReplanImpactRemediation}
                disabled={impactRemediationBusy}
                title={t('chapterEditorToolbar.remediationReplanTitle')}
                className="flex items-center gap-1 rounded border border-sky-400/30 bg-sky-400/10 px-2 py-1 text-[11px] text-sky-200 hover:bg-sky-400/20 disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${impactRemediationBusy ? 'animate-spin' : ''}`} />
                {t('chapterEditorToolbar.remediationReplan')}
              </button>
            </div>
          )}
          {impactDownstreamSchedule && (
            <div
              aria-label={t('chapterEditorToolbar.scheduleAriaLabel')}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-indigo-400/20 bg-indigo-400/5 px-2 py-1.5 text-[11px] text-text-secondary"
            >
              <span className="text-indigo-200">
                {t('chapterEditorToolbar.scheduleDownstream', { completed: impactDownstreamSchedule.counts.completed, total: impactDownstreamSchedule.items.length })}
              </span>
              <span>{t('chapterEditorToolbar.scheduleReady', { count: impactDownstreamSchedule.counts.ready })}</span>
              <span>{t('chapterEditorToolbar.scheduleAwaitingConfirmation', { count: impactDownstreamSchedule.counts['awaiting-confirmation'] })}</span>
              <span>{t('chapterEditorToolbar.scheduleBlocked', { count: impactDownstreamSchedule.counts.blocked })}</span>
              <span>{t('chapterEditorToolbar.scheduleNeedsManual', { count: impactDownstreamSchedule.counts['needs-manual-action'] })}</span>
              <span className={`ml-auto ${impactDownstreamSchedule.settled ? 'text-success' : 'text-text-muted'}`}>
                {impactDownstreamSchedule.settled ? t('chapterEditorToolbar.scheduleAllCompleted') : t('chapterEditorToolbar.scheduleHash', { hash: impactDownstreamSchedule.scheduleHash.slice(0, 12) })}
              </span>
              {impactDownstreamFocus && (
                <span aria-label={t('chapterEditorToolbar.schedulePolicyAriaLabel')} className="basis-full text-indigo-100/80">
                  {t('chapterEditorToolbar.schedulePolicy', { policyId: impactDownstreamFocus.policyId, policyReason: impactDownstreamFocus.policyReason })}
                  {impactDownstreamFocus.manualModule ? t('chapterEditorToolbar.scheduleManualModule', { module: impactDownstreamFocus.manualModule }) : ''}
                </span>
              )}
            </div>
          )}
          {impactRemediationPlan && impactRemediationPlan.counts.authorConfirmed > 0 && (
            <div className="space-y-2 rounded border border-sky-400/20 bg-sky-400/5 px-2 py-2 text-[11px] text-text-secondary">
              <div className="text-sky-200">{t('chapterEditorToolbar.reviewSectionNote')}</div>
              <div className="grid gap-2 md:grid-cols-[minmax(180px,1.2fr)_auto_minmax(180px,1fr)_auto]">
                <label className="flex min-w-0 items-center gap-2 rounded border border-border bg-bg-elevated px-2 text-text-secondary">
                  <span className="sr-only">{t('chapterEditorToolbar.reviewItemAriaLabel')}</span>
                  <select
                    aria-label={t('chapterEditorToolbar.reviewItemAriaLabel')}
                    value={impactReviewItemId ?? ''}
                    onChange={event => onImpactReviewItemChange(event.target.value || null)}
                    className="min-w-0 flex-1 bg-transparent py-1.5 text-xs text-text-primary outline-none"
                    disabled={impactReviewBusy}
                  >
                    <option value="">{t('chapterEditorToolbar.reviewItemPlaceholder')}</option>
                    {impactRemediationPlan.items
                      .filter(item => item.mode === 'author-confirmed')
                      .map(item => (
                        <option key={item.id} value={item.id}>
                          {(IMPACT_REVIEW_ACTION_KEY_MAP[item.action] ? t(IMPACT_REVIEW_ACTION_KEY_MAP[item.action]) : t('chapterEditorToolbar.actionReviewFallback'))} · {item.table}#{item.recordId ?? t('chapterEditorToolbar.reviewItemPending')}
                          {reviewedImpactItemIds.has(item.id) ? t('chapterEditorToolbar.reviewItemReviewed') : ''}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="flex items-center rounded border border-border bg-bg-elevated p-0.5" role="group" aria-label={t('chapterEditorToolbar.reviewDecisionAriaLabel')}>
                  <button
                    type="button"
                    onClick={() => onImpactReviewDecisionChange('acknowledged')}
                    aria-pressed={impactReviewDecision === 'acknowledged'}
                    className={`rounded px-2 py-1 text-[11px] transition-colors ${impactReviewDecision === 'acknowledged' ? 'bg-emerald-500/15 text-emerald-200' : 'text-text-muted hover:text-text-primary'}`}
                    disabled={impactReviewBusy}
                  >
                    {t('chapterEditorToolbar.reviewDecisionAcknowledged')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onImpactReviewDecisionChange('needs-manual-action')}
                    aria-pressed={impactReviewDecision === 'needs-manual-action'}
                    className={`rounded px-2 py-1 text-[11px] transition-colors ${impactReviewDecision === 'needs-manual-action' ? 'bg-amber-500/15 text-amber-200' : 'text-text-muted hover:text-text-primary'}`}
                    disabled={impactReviewBusy}
                  >
                    {t('chapterEditorToolbar.reviewDecisionNeedsManual')}
                  </button>
                </div>
                <CInput
                  aria-label={t('chapterEditorToolbar.reviewNoteAriaLabel')}
                  value={impactReviewNote}
                  onChange={event => onImpactReviewNoteChange(event.target.value)}
                  placeholder={t('chapterEditorToolbar.reviewNotePlaceholder')}
                  className="rounded border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
                  disabled={impactReviewBusy}
                />
                <button
                  type="button"
                  onClick={onExecuteImpactReview}
                  disabled={impactReviewBusy || !impactReviewItemId || impactReviewNote.trim().length < 2}
                  title={t('chapterEditorToolbar.reviewExecuteTitle')}
                  className="flex items-center justify-center gap-1 rounded border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-xs text-sky-200 hover:bg-sky-400/20 disabled:opacity-50"
                >
                  {impactReviewBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {impactReviewBusy ? t('chapterEditorToolbar.reviewExecuteBusy') : t('chapterEditorToolbar.reviewExecuteIdle')}
                </button>
              </div>
              {selectedImpactReview && (
                <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-text-muted">
                  <span className={selectedImpactReview.output.decision === 'needs-manual-action' ? 'text-amber-200' : 'text-emerald-200'}>
                    {t('chapterEditorToolbar.reviewLatestDecision')}{selectedImpactReview.output.decision === 'needs-manual-action' ? t('chapterEditorToolbar.reviewDecisionNeedsManual') : t('chapterEditorToolbar.reviewDecisionAcknowledged')}
                  </span>
                  <span>{selectedImpactReview.output.note}</span>
                  <span>{t('chapterEditorToolbar.reviewReceipt', { hash: selectedImpactReview.receiptHash.slice(0, 12) })}</span>
                  {selectedImpactReview.output.decision === 'needs-manual-action' && (
                    <button
                      type="button"
                      onClick={onOpenImpactManualEntry}
                      className="inline-flex items-center gap-1 rounded border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200 hover:bg-amber-400/20"
                      title={t('chapterEditorToolbar.reviewManualEntryTitle')}
                    >
                      <BookOpenCheck className="h-3 w-3" />{t('chapterEditorToolbar.reviewManualEntry')}
                    </button>
                  )}
                </div>
              )}
              {impactReviewReceipt && <div className="text-[10px] text-success">{t('chapterEditorToolbar.reviewReceiptLabel', { hash: impactReviewReceipt.slice(0, 12) })}</div>}
              {impactReviewError && <div role="alert" className="text-xs text-error">{impactReviewError}</div>}
            </div>
          )}
          {impactOutlineRegenerationTargets.length > 0
            && !impactOutlineRegenerationCandidate
            && !impactStoryTimelineRegenerationCandidate
            && !impactPatchCandidate && (
            <div className="space-y-2 rounded border border-violet-400/20 bg-violet-400/5 p-2">
              <div className="text-[11px] text-violet-200">
                {t('chapterEditorToolbar.outlineRegenHint')}
              </div>
              <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_auto]">
                <label className="flex items-center gap-2 rounded border border-border bg-bg-elevated px-2 text-text-secondary">
                  <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                  <span className="sr-only">{t('chapterEditorToolbar.outlineRegenTargetAriaLabel')}</span>
                  <select
                    aria-label={t('chapterEditorToolbar.outlineRegenTargetAriaLabel')}
                    value={impactOutlineRegenerationItemId ?? ''}
                    onChange={event => onImpactOutlineRegenerationItemChange(event.target.value || null)}
                    className="min-w-0 flex-1 bg-transparent py-1.5 text-xs text-text-primary outline-none"
                    disabled={impactOutlineRegenerationBusy}
                  >
                    <option value="">{t('chapterEditorToolbar.outlineRegenTargetPlaceholder')}</option>
                    {impactOutlineRegenerationTargets.map(target => (
                      <option key={target.itemId} value={target.itemId}>{target.title} · {target.summary || t('chapterEditorToolbar.outlineRegenNoSummary')}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={onGenerateImpactOutlineRegeneration}
                  disabled={impactOutlineRegenerationBusy || !impactOutlineRegenerationItemId}
                  title={t('chapterEditorToolbar.outlineRegenGenerateTitle')}
                  className="flex items-center justify-center gap-1 rounded border border-violet-400/30 bg-violet-400/10 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-400/20 disabled:opacity-50"
                >
                  {impactOutlineRegenerationBusy
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <RefreshCw className="h-3.5 w-3.5" />}
                  {impactOutlineRegenerationBusy ? t('chapterEditorToolbar.outlineRegenGenerateBusy') : t('chapterEditorToolbar.outlineRegenGenerateIdle')}
                </button>
              </div>
            </div>
          )}
          {impactOutlineRegenerationCandidate && !impactStoryTimelineRegenerationCandidate && (
            <div className="space-y-2 rounded border border-violet-400/25 bg-bg-elevated/70 p-2 text-text-secondary">
              <div className="text-[11px] text-text-muted">{t('chapterEditorToolbar.outlineRegenCandidateNote')}</div>
              <div className="whitespace-pre-wrap text-xs text-text-primary">{impactOutlineRegenerationCandidate.result.summary}</div>
              <div className="text-[11px] text-text-secondary">{t('chapterEditorToolbar.outlineRegenReason', { reason: impactOutlineRegenerationCandidate.result.reason })}</div>
              <div className="text-[10px] text-text-muted">{t('chapterEditorToolbar.outlineRegenEvidence', { evidence: listFormat.format(impactOutlineRegenerationCandidate.result.evidenceRefs) })}</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onConfirmImpactOutlineRegeneration}
                  disabled={impactOutlineRegenerationBusy}
                  className="flex items-center gap-1 rounded border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-50"
                >
                  {impactOutlineRegenerationBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {t('chapterEditorToolbar.outlineRegenConfirm')}
                </button>
                <button
                  type="button"
                  onClick={onRejectImpactOutlineRegeneration}
                  disabled={impactOutlineRegenerationBusy}
                  className="flex items-center gap-1 rounded border border-border bg-bg-surface px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />{t('chapterEditorToolbar.outlineRegenReject')}
                </button>
                <span className="text-[10px] text-text-muted">{t('chapterEditorToolbar.outlineRegenChildHash', { hash: impactOutlineRegenerationCandidate.candidateHash.slice(0, 12) })}</span>
              </div>
            </div>
          )}
          {impactStoryTimelineRegenerationTargets.length > 0
            && !impactStoryTimelineRegenerationCandidate
            && !impactOutlineRegenerationCandidate
            && !impactPatchCandidate && (
            <div className="space-y-2 rounded border border-cyan-400/20 bg-cyan-400/5 p-2">
              <div className="text-[11px] text-cyan-200">
                {t('chapterEditorToolbar.timelineRegenHint')}
              </div>
              <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_auto]">
                <label className="flex items-center gap-2 rounded border border-border bg-bg-elevated px-2 text-text-secondary">
                  <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                  <span className="sr-only">{t('chapterEditorToolbar.timelineRegenTargetAriaLabel')}</span>
                  <select
                    aria-label={t('chapterEditorToolbar.timelineRegenTargetAriaLabel')}
                    value={impactStoryTimelineRegenerationItemId ?? ''}
                    onChange={event => onImpactStoryTimelineRegenerationItemChange(event.target.value || null)}
                    className="min-w-0 flex-1 bg-transparent py-1.5 text-xs text-text-primary outline-none"
                    disabled={impactStoryTimelineRegenerationBusy}
                  >
                    <option value="">{t('chapterEditorToolbar.timelineRegenTargetPlaceholder')}</option>
                    {impactStoryTimelineRegenerationTargets.map(target => (
                      <option key={target.itemId} value={target.itemId}>{t('chapterEditorToolbar.timelineRegenEventLabel', { title: target.title, id: target.id })}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={onGenerateImpactStoryTimelineRegeneration}
                  disabled={impactStoryTimelineRegenerationBusy || !impactStoryTimelineRegenerationItemId}
                  title={t('chapterEditorToolbar.timelineRegenGenerateTitle')}
                  className="flex items-center justify-center gap-1 rounded border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-400/20 disabled:opacity-50"
                >
                  {impactStoryTimelineRegenerationBusy
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <RefreshCw className="h-3.5 w-3.5" />}
                  {impactStoryTimelineRegenerationBusy ? t('chapterEditorToolbar.timelineRegenGenerateBusy') : t('chapterEditorToolbar.timelineRegenGenerateIdle')}
                </button>
              </div>
            </div>
          )}
          {impactStoryTimelineRegenerationCandidate && !impactOutlineRegenerationCandidate && (
            <div className="space-y-2 rounded border border-cyan-400/25 bg-bg-elevated/70 p-2 text-text-secondary">
              <div className="text-[11px] text-text-muted">
                {t('chapterEditorToolbar.timelineRegenCandidateNote', { title: impactStoryTimelineRegenerationCandidate.targetBaseline.title })}
              </div>
              <div className="grid gap-1 text-[11px] md:grid-cols-2">
                <div className="rounded border border-border/70 bg-bg-surface/60 p-2">
                  <div className="text-text-muted">{t('chapterEditorToolbar.timelineRegenCurrentValue')}</div>
                  <div>{t('chapterEditorToolbar.timelineRegenTime', { time: impactStoryTimelineRegenerationCandidate.targetBaseline.storyTime || t('chapterEditorToolbar.timelineRegenNoTime') })}</div>
                  <div>{t('chapterEditorToolbar.timelineRegenImportance', { importance: impactStoryTimelineRegenerationCandidate.targetBaseline.importance })}</div>
                  <div className="whitespace-pre-wrap">{impactStoryTimelineRegenerationCandidate.targetBaseline.description || t('chapterEditorToolbar.timelineRegenNoDescription')}</div>
                </div>
                <div className="rounded border border-cyan-400/20 bg-cyan-400/5 p-2">
                  <div className="text-cyan-200">{t('chapterEditorToolbar.timelineRegenCandidateValue')}</div>
                  <div>{t('chapterEditorToolbar.timelineRegenTime', { time: impactStoryTimelineRegenerationCandidate.result.storyTime || t('chapterEditorToolbar.timelineRegenNoTime') })}</div>
                  <div>{t('chapterEditorToolbar.timelineRegenImportance', { importance: impactStoryTimelineRegenerationCandidate.result.importance })}</div>
                  <div className="whitespace-pre-wrap text-text-primary">{impactStoryTimelineRegenerationCandidate.result.description || t('chapterEditorToolbar.timelineRegenNoDescription')}</div>
                </div>
              </div>
              <div className="text-[11px] text-text-secondary">{t('chapterEditorToolbar.timelineRegenReason', { reason: impactStoryTimelineRegenerationCandidate.result.reason })}</div>
              <div className="text-[10px] text-text-muted">{t('chapterEditorToolbar.timelineRegenEvidence', { evidence: listFormat.format(impactStoryTimelineRegenerationCandidate.result.evidenceRefs) })}</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onConfirmImpactStoryTimelineRegeneration}
                  disabled={impactStoryTimelineRegenerationBusy}
                  className="flex items-center gap-1 rounded border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-50"
                >
                  {impactStoryTimelineRegenerationBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {t('chapterEditorToolbar.timelineRegenConfirm')}
                </button>
                <button
                  type="button"
                  onClick={onRejectImpactStoryTimelineRegeneration}
                  disabled={impactStoryTimelineRegenerationBusy}
                  className="flex items-center gap-1 rounded border border-border bg-bg-surface px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />{t('chapterEditorToolbar.timelineRegenReject')}
                </button>
                <span className="text-[10px] text-text-muted">{t('chapterEditorToolbar.timelineRegenChildHash', { hash: impactStoryTimelineRegenerationCandidate.candidateHash.slice(0, 12) })}</span>
              </div>
            </div>
          )}
          {impactPatchTargets.length > 0 && !impactPatchCandidate
            && !impactOutlineRegenerationCandidate && !impactStoryTimelineRegenerationCandidate && (
            <div className="grid gap-2 md:grid-cols-[minmax(150px,0.7fr)_minmax(200px,1.5fr)_minmax(160px,1fr)_auto]">
              <label className="flex items-center gap-2 rounded border border-border bg-bg-elevated px-2 text-text-secondary">
                <GitBranch className="h-3.5 w-3.5 shrink-0" />
                <span className="sr-only">{t('chapterEditorToolbar.patchTargetAriaLabel')}</span>
                <select
                  aria-label={t('chapterEditorToolbar.patchTargetAriaLabel')}
                  value={impactPatchTargetId ?? ''}
                  onChange={event => onImpactPatchTargetChange(event.target.value ? Number(event.target.value) : null)}
                  className="min-w-0 flex-1 bg-transparent py-1.5 text-xs text-text-primary outline-none"
                  disabled={impactPatchBusy}
                >
                  <option value="">{t('chapterEditorToolbar.patchTargetPlaceholder')}</option>
                  {impactPatchTargets.map(target => (
                    <option key={target.id} value={target.id}>{target.title}</option>
                  ))}
                </select>
              </label>
              <textarea
                aria-label={t('chapterEditorToolbar.patchSummaryAriaLabel')}
                value={impactPatchSummary}
                onChange={event => onImpactPatchSummaryChange(event.target.value)}
                placeholder={t('chapterEditorToolbar.patchSummaryPlaceholder')}
                className="min-h-9 resize-y rounded border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                disabled={impactPatchBusy}
              />
              <CInput
                aria-label={t('chapterEditorToolbar.patchReasonAriaLabel')}
                value={impactPatchReason}
                onChange={event => onImpactPatchReasonChange(event.target.value)}
                placeholder={t('chapterEditorToolbar.patchReasonPlaceholder')}
                className="rounded border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
                disabled={impactPatchBusy}
              />
              <button
                onClick={onCreateImpactPatch}
                disabled={impactPatchBusy || !impactPatchTargetId || !impactPatchSummary.trim() || !impactPatchReason.trim()}
                title={t('chapterEditorToolbar.patchCreateTitle')}
                className="flex items-center justify-center gap-1 rounded border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-400/20 disabled:opacity-50"
              >
                {impactPatchBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
                {impactPatchBusy ? t('chapterEditorToolbar.patchCreateBusy') : t('chapterEditorToolbar.patchCreateIdle')}
              </button>
            </div>
          )}
          {impactPatchCandidate && !impactOutlineRegenerationCandidate && !impactStoryTimelineRegenerationCandidate && (
            <div className="space-y-2 rounded border border-accent/20 bg-bg-elevated/70 p-2 text-text-secondary">
              <div className="text-[11px] text-text-muted">{t('chapterEditorToolbar.patchCandidateNote')}</div>
              <div className="whitespace-pre-wrap text-xs text-text-primary">{impactPatchCandidate.proposal.fields.summary}</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={onConfirmImpactPatch}
                  disabled={impactPatchBusy}
                  className="flex items-center gap-1 rounded border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-50"
                >
                  {impactPatchBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {t('chapterEditorToolbar.patchConfirm')}
                </button>
                <button
                  onClick={onRejectImpactPatch}
                  disabled={impactPatchBusy}
                  className="flex items-center gap-1 rounded border border-border bg-bg-surface px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                  {t('chapterEditorToolbar.patchReject')}
                </button>
                <span className="text-[10px] text-text-muted">{t('chapterEditorToolbar.patchEvidenceHash', { hash: impactPatchCandidate.durable.candidateHash.slice(0, 12) })}</span>
              </div>
            </div>
          )}
          {impactPatchError && <div role="alert" className="text-xs text-error">{impactPatchError}</div>}
          {impactOutlineRegenerationReceipt && <div className="text-[10px] text-success">{t('chapterEditorToolbar.outlineRegenReceiptLabel', { hash: impactOutlineRegenerationReceipt.slice(0, 12) })}</div>}
          {impactOutlineRegenerationError && <div role="alert" className="text-xs text-error">{impactOutlineRegenerationError}</div>}
          {impactStoryTimelineRegenerationReceipt && <div className="text-[10px] text-success">{t('chapterEditorToolbar.timelineRegenReceiptLabel', { hash: impactStoryTimelineRegenerationReceipt.slice(0, 12) })}</div>}
          {impactStoryTimelineRegenerationError && <div role="alert" className="text-xs text-error">{impactStoryTimelineRegenerationError}</div>}
          {impactRemediationReceipt && <div className="text-[10px] text-success">{t('chapterEditorToolbar.remediationReceiptLabel', { hash: impactRemediationReceipt.slice(0, 12) })}</div>}
          {impactRemediationError && <div role="alert" className="text-xs text-error">{impactRemediationError}</div>}
        </div>
      )}
      {hasOutline && (
        <button onClick={onToggleOutlinePreview}
          title={t('chapterEditorToolbar.btnOutlinePreviewTitle')}
          aria-pressed={showOutlinePreview}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-md transition-colors ${
            showOutlinePreview
              ? 'bg-accent/10 text-accent'
              : 'bg-bg-elevated text-text-secondary hover:text-text-primary'
          }`}>
          <BookOpenCheck className="w-3 h-3" />
          {t('chapterEditorToolbar.btnOutlinePreview')}
        </button>
      )}
      <button onClick={onToggleReviewPanel}
        disabled={!hasText}
        title={t('chapterEditorToolbar.btnReviewTitle')}
        aria-pressed={showReviewPanel}
        className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-md transition-colors disabled:opacity-50 ${
          showReviewPanel
            ? 'bg-success/10 text-success'
            : 'bg-bg-elevated text-text-secondary hover:text-text-primary'
        }`}>
        <ShieldCheck className="w-3 h-3" />
        {t('chapterEditorToolbar.btnReview')}
        {consistencyAlertCount > 0 && (
          <span className="min-w-4 rounded-full bg-error/15 px-1 text-center text-[10px] text-error">
            {consistencyAlertCount}
          </span>
        )}
      </button>
      <button onClick={onToggleNotePanel}
        title={t('chapterEditorToolbar.btnNotesTitle')}
        aria-pressed={showNotePanel}
        className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-md transition-colors ${
          showNotePanel
            ? 'bg-yellow-500/10 text-yellow-600'
            : 'bg-bg-elevated text-text-secondary hover:text-text-primary'
        }`}>
        <StickyNote className="w-3 h-3" />
        {t('chapterEditorToolbar.btnNotes')}
      </button>
      <label className="flex min-w-[180px] items-center gap-2 rounded-md border border-border bg-bg-elevated px-2 text-xs text-text-secondary">
        <Eye className="h-3.5 w-3.5 shrink-0" />
        <span className="sr-only">{t('chapterEditorToolbar.perspectiveAriaLabel')}</span>
        <select
          aria-label={t('chapterEditorToolbar.perspectiveAriaLabel')}
          value={perspectiveCharacterId ?? ''}
          onChange={event => onPerspectiveCharacterChange(
            event.target.value ? Number(event.target.value) : null,
          )}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-xs text-text-primary outline-none"
        >
          <option value="">{t('chapterEditorToolbar.perspectiveNone')}</option>
          {perspectiveCharacters.map(character => (
            <option key={character.id} value={character.id}>{character.name}</option>
          ))}
        </select>
      </label>
      <CInput value={customInstruction} onChange={event => onCustomInstructionChange(event.target.value)}
        placeholder={t('chapterEditorToolbar.customInstructionPlaceholder')}
        className="min-w-[220px] flex-1 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent" />
    </div>
  )
}
