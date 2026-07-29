import { Columns2, Eye, Loader2, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ChapterStatus } from '../../lib/types'

const STATUS_OPTIONS: { value: ChapterStatus; labelKey: 'status.outline' | 'status.draft' | 'status.revised' | 'status.polished' | 'status.final' }[] = [
  { value: 'outline', labelKey: 'status.outline' },
  { value: 'draft', labelKey: 'status.draft' },
  { value: 'revised', labelKey: 'status.revised' },
  { value: 'polished', labelKey: 'status.polished' },
  { value: 'final', labelKey: 'status.final' },
]

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
  const { t } = useTranslation('editor')
  return (
    <div className="flex items-center justify-between px-6 py-3">
      <div className="flex items-center gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
            {t('header.creationArea')}
          </p>
          <h2 className="font-serif text-xl font-semibold text-text-primary">{title}</h2>
        </div>
        <span className="rounded-full border border-border bg-bg-elevated px-2.5 py-1 text-xs text-text-muted">
          {t('chapter.wordCount', { count: wordCount.toLocaleString() })}
        </span>
        <select
          aria-label={t('header.chapterStatus')}
          value={status}
          onChange={event => onStatusChange(event.target.value as ChapterStatus)}
          title={t('header.statusTitle')}
          className={`text-xs px-2 py-1 rounded border border-transparent focus:outline-none focus:border-accent cursor-pointer ${STATUS_STYLE[status]}`}
        >
          {STATUS_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
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
          <Eye className="w-3.5 h-3.5" /> {t('header.context')}
        </button>
        <button
          type="button"
          onClick={onOpenCompare}
          disabled={!canCompare}
          className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-hover hover:text-accent disabled:opacity-40"
        >
          <Columns2 className="h-3.5 w-3.5" /> {t('header.comparePolish')}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saveDisabled || saving}
          title={saveError ? t('header.saveFailedWith', { error: saveError }) : undefined}
          className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-40 ${
            saveError ? 'text-error' : isSaved ? 'text-success' : 'text-text-muted hover:text-accent'
          }`}
        >
          {saving
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Save className="w-3.5 h-3.5" />}
          {saving ? t('header.saving') : saveError ? t('header.saveFailed') : isSaved ? t('header.saved') : t('header.save')}
        </button>
      </div>
    </div>
  )
}
