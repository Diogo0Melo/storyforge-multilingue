import { BookOpenCheck, ClipboardList, Loader2, ShieldCheck, StickyNote } from 'lucide-react'
import { CInput } from '../shared/CompositionInput'
import { useDomainT } from '../../i18n'

interface Props {
  isStreaming: boolean
  hasText: boolean
  organizingChapter: boolean
  hasOrganizationCandidate: boolean
  analyzingImpact: boolean
  impactInfo: string | null
  hasOutline: boolean
  showOutlinePreview: boolean
  showReviewPanel: boolean
  consistencyAlertCount: number
  showNotePanel: boolean
  customInstruction: string
  onGenerate: () => void
  onContinue: () => void
  onExpand: () => void
  onPolish: () => void
  onDeAI: () => void
  onOrganizeChapter: () => void
  onAnalyzeImpact: () => void
  onDismissImpact: () => void
  onToggleOutlinePreview: () => void
  onToggleReviewPanel: () => void
  onToggleNotePanel: () => void
  onCustomInstructionChange: (value: string) => void
}

export default function ChapterEditorToolbar({
  isStreaming,
  hasText,
  organizingChapter,
  hasOrganizationCandidate,
  analyzingImpact,
  impactInfo,
  hasOutline,
  showOutlinePreview,
  showReviewPanel,
  consistencyAlertCount,
  showNotePanel,
  customInstruction,
  onGenerate,
  onContinue,
  onExpand,
  onPolish,
  onDeAI,
  onOrganizeChapter,
  onAnalyzeImpact,
  onDismissImpact,
  onToggleOutlinePreview,
  onToggleReviewPanel,
  onToggleNotePanel,
  onCustomInstructionChange,
}: Props) {
  const { t } = useDomainT('editor')
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
        <span className="flex items-center gap-2 px-2 py-1 text-xs text-amber-300/90 bg-amber-500/5 rounded-md">
          {impactInfo}
          <button onClick={onDismissImpact} aria-label={t('chapterEditorToolbar.ariaDismissImpact')} className="text-text-muted hover:text-text-primary">×</button>
        </span>
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
      <CInput value={customInstruction} onChange={event => onCustomInstructionChange(event.target.value)}
        placeholder={t('chapterEditorToolbar.customInstructionPlaceholder')}
        className="min-w-[220px] flex-1 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent" />
    </div>
  )
}
