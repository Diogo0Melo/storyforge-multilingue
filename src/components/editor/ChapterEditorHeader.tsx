import { Columns2, Eye, Loader2, Save } from 'lucide-react'
import type { ChapterStatus } from '../../lib/types'
import { useDomainT } from '../../i18n'

const STATUS_STYLE: Record<ChapterStatus, string> = {
  outline: 'bg-bg-elevated text-text-muted',
  draft: 'bg-warning/10 text-warning',
  revised: 'bg-info/10 text-info',
  polished: 'bg-accent/10 text-accent',
  final: 'bg-success/10 text-success',
}

interface Props {
  title: string
  wordCount: number
  status: ChapterStatus
  showContext: boolean
  canCompare: boolean
  saveDisabled: boolean
  saving: boolean
  saveError: string
  isSaved: boolean
  onStatusChange: (status: ChapterStatus) => void
  onToggleContext: () => void
  onOpenCompare: () => void
  onSave: () => void
}

export default function ChapterEditorHeader({
  title,
  wordCount,
  status,
  showContext,
  canCompare,
  saveDisabled,
  saving,
  saveError,
  isSaved,
  onStatusChange,
  onToggleContext,
  onOpenCompare,
  onSave,
}: Props) {
  const { t, lang } = useDomainT('editor')
  const STATUS_OPTIONS: { value: ChapterStatus; label: string }[] = [
    { value: 'outline', label: t('chapterEditorHeader.statusOutline') },
    { value: 'draft', label: t('chapterEditorHeader.statusDraft') },
    { value: 'revised', label: t('chapterEditorHeader.statusRevised') },
    { value: 'polished', label: t('chapterEditorHeader.statusPolished') },
    { value: 'final', label: t('chapterEditorHeader.statusFinal') },
  ]
  return (
    <div className="flex items-center justify-between px-6 py-3">
      <div className="flex items-center gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
            {t('chapterEditorHeader.sectionLabel')}
          </p>
          <h2 className="font-serif text-xl font-semibold text-text-primary">{title}</h2>
        </div>
        <span className="rounded-full border border-border bg-bg-elevated px-2.5 py-1 text-xs text-text-muted">
          {t('chapterEditorHeader.wordCountSuffix', { count: wordCount.toLocaleString(lang) })}
        </span>
        <select
          aria-label={t('chapterEditorHeader.statusAriaLabel')}
          value={status}
          onChange={event => onStatusChange(event.target.value as ChapterStatus)}
          title={t('chapterEditorHeader.statusTitle')}
          className={`text-xs px-2 py-1 rounded border border-transparent focus:outline-none focus:border-accent cursor-pointer ${STATUS_STYLE[status]}`}
        >
          {STATUS_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleContext}
          aria-pressed={showContext}
          className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-hover hover:text-text-primary"
        >
          <Eye className="w-3.5 h-3.5" /> {t('chapterEditorHeader.btnContext')}
        </button>
        <button
          type="button"
          onClick={onOpenCompare}
          disabled={!canCompare}
          className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-hover hover:text-accent disabled:opacity-40"
        >
          <Columns2 className="h-3.5 w-3.5" /> {t('chapterEditorHeader.btnComparePolish')}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saveDisabled || saving}
          title={saveError ? t('chapterEditorHeader.saveErrorTooltip', { message: saveError }) : undefined}
          className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-40 ${
            saveError ? 'text-error' : isSaved ? 'text-success' : 'text-text-muted hover:text-accent'
          }`}
        >
          {saving
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Save className="w-3.5 h-3.5" />}
          {saving ? t('chapterEditorHeader.saving') : saveError ? t('chapterEditorHeader.saveFailed') : isSaved ? t('chapterEditorHeader.saved') : t('chapterEditorHeader.save')}
        </button>
      </div>
    </div>
  )
}
