import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, BookOpenCheck, CheckSquare, Square, X } from 'lucide-react'
import type { CodexImportCategoryOption } from '../../../lib/import/codex-classification'
import type { CodexImportCandidate } from '../../../lib/types/import-session-data'

interface Props {
  filename: string
  candidates: readonly CodexImportCandidate[]
  categories: readonly CodexImportCategoryOption[]
  onConfirm: (candidates: CodexImportCandidate[]) => Promise<void>
  onCancel: () => void
}

export default function CodexImportReviewModal({
  filename,
  candidates,
  categories,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation('import')
  const [drafts, setDrafts] = useState(() => candidates.map(candidate => ({
    ...candidate,
    fields: { ...candidate.fields },
    tags: [...candidate.tags],
    evidence: [...candidate.evidence],
  })))
  const [selected, setSelected] = useState(() => new Set(candidates.map((_, index) => index)))
  const [submitting, setSubmitting] = useState(false)
  const selectedCount = selected.size
  const categoryByRef = useMemo(
    () => new Map(categories.map(category => [category.ref, category])),
    [categories],
  )

  const updateDraft = (index: number, patch: Partial<CodexImportCandidate>) => {
    setDrafts(current => current.map((draft, draftIndex) =>
      draftIndex === index ? { ...draft, ...patch } : draft))
  }

  const toggle = (index: number) => {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const submit = async () => {
    if (submitting || selectedCount === 0) return
    setSubmitting(true)
    try {
      await onConfirm(drafts.filter((_, index) => selected.has(index)))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-bg-surface border border-border rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2 text-text-primary font-semibold">
              <BookOpenCheck className="w-5 h-5 text-accent" />
              {t('codexReview.title')}
            </div>
            <div className="text-xs text-text-muted mt-1">
              {t('codexReview.subtitle', { filename })}
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded hover:bg-bg-hover">
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border bg-bg-base flex items-center justify-between gap-3">
          <div className="text-xs text-text-secondary">
            {t('codexReview.selectedCount', { selected: selectedCount, total: drafts.length })}
          </div>
          <button
            onClick={() => setSelected(selectedCount === drafts.length
              ? new Set()
              : new Set(drafts.map((_, index) => index)))}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded"
          >
            {selectedCount === drafts.length
              ? <CheckSquare className="w-3.5 h-3.5" />
              : <Square className="w-3.5 h-3.5" />}
            {selectedCount === drafts.length ? t('codexReview.deselectAll') : t('codexReview.selectAll')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {drafts.map((candidate, index) => {
            const category = categoryByRef.get(candidate.categoryRef)
            const checked = selected.has(index)
            return (
              <div
                key={index}
                className={`border rounded-xl p-3 space-y-3 ${
                  checked ? 'border-accent/50 bg-accent/5' : 'border-border opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggle(index)}
                    className="mt-1 text-accent"
                    aria-label={`${checked ? t('codexReview.deselect') : t('codexReview.select')} ${candidate.name}`}
                  >
                    {checked
                      ? <CheckSquare className="w-4 h-4" />
                      : <Square className="w-4 h-4" />}
                  </button>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 flex-1">
                    <label className="text-[11px] text-text-muted">
                      {t('codexReview.entryName')}
                      <input
                        value={candidate.name}
                        onChange={event => updateDraft(index, { name: event.target.value })}
                        className="mt-1 w-full px-2.5 py-2 bg-bg-base border border-border rounded text-sm text-text-primary"
                      />
                    </label>
                    <label className="text-[11px] text-text-muted">
                      {t('codexReview.category')}
                      <select
                        value={category ? candidate.categoryRef : ''}
                        onChange={event => updateDraft(index, { categoryRef: event.target.value })}
                        className="mt-1 w-full px-2.5 py-2 bg-bg-base border border-border rounded text-sm text-text-primary"
                      >
                        {!category && <option value="">{t('codexReview.categoryUnavailable')}</option>}
                        {categories.map(option => (
                          <option key={option.ref} value={option.ref}>
                            {option.domain === 'natural' ? t('codexReview.domain.natural') : option.domain === 'humanity' ? t('codexReview.domain.humanity') : t('codexReview.domain.origin')}
                            {' · '}{option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className={`text-[11px] px-2 py-1 rounded ${
                    candidate.confidence >= 0.75
                      ? 'bg-success/10 text-success'
                      : 'bg-warning/10 text-warning'
                  }`}>
                    {t('codexReview.confidence', { value: Math.round(candidate.confidence * 100) })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-7">
                  <label className="text-[11px] text-text-muted">
                    {t('codexReview.summary')}
                    <textarea
                      value={candidate.summary}
                      onChange={event => updateDraft(index, { summary: event.target.value })}
                      rows={2}
                      className="mt-1 w-full px-2.5 py-2 bg-bg-base border border-border rounded text-xs text-text-primary resize-y"
                    />
                  </label>
                  <label className="text-[11px] text-text-muted">
                    {t('codexReview.description')}
                    <textarea
                      value={candidate.description}
                      onChange={event => updateDraft(index, { description: event.target.value })}
                      rows={2}
                      className="mt-1 w-full px-2.5 py-2 bg-bg-base border border-border rounded text-xs text-text-primary resize-y"
                    />
                  </label>
                </div>

                <div className="pl-7 text-[11px] text-text-muted space-y-1">
                  <div>
                    标签：{candidate.tags.join('、') || '无'}
                    {Object.keys(candidate.fields).length > 0
                      ? ` · 结构化字段：${Object.keys(candidate.fields).join('、')}`
                      : ''}
                  </div>
                  <div className="bg-bg-base border border-border rounded p-2 text-text-secondary">
                    <span className="text-text-muted">逐字证据：</span>
                    {candidate.evidence.map((evidence, evidenceIndex) => (
                      <span key={`${evidence.chunkIndex}:${evidenceIndex}`}>
                        {evidenceIndex > 0 && '；'}
                        第 {evidence.chunkIndex + 1} 块“{evidence.quote}”
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-5 py-3 border-t border-border bg-bg-base flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <AlertTriangle className="w-3.5 h-3.5 text-warning" />
            {t('codexReview.sameNameNote')}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              disabled={submitting}
              className="px-4 py-2 text-sm border border-border rounded text-text-secondary hover:bg-bg-hover disabled:opacity-50"
            >
              {t('codexReview.notNow')}
            </button>
            <button
              onClick={submit}
              disabled={submitting || selectedCount === 0 || drafts.some((draft, index) =>
                selected.has(index) && (!draft.name.trim() || !categoryByRef.has(draft.categoryRef)))}
              className="px-4 py-2 text-sm bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? t('codexReview.writing') : t('codexReview.confirmImport', { count: selectedCount })}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
