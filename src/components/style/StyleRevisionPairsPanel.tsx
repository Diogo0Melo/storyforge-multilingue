import { GitCompareArrows, Trash2 } from 'lucide-react'
import type { StyleRevisionPair } from '../../lib/types/user-style'
import { useDomainT } from '../../i18n'

interface Props {
  pairs: readonly StyleRevisionPair[]
  onUpdateNote: (pairId: string, note: string) => Promise<void>
  onRemove: (pairId: string) => Promise<void>
}

function excerpt(value: string): string {
  return value.length > 180 ? `${value.slice(0, 180)}…` : value
}

export default function StyleRevisionPairsPanel({ pairs, onUpdateNote, onRemove }: Props) {
  const { t } = useDomainT('style')
  if (!pairs.length) {
    return (
      <div className="rounded bg-bg-base p-3 text-xs leading-5 text-text-muted">
        {t('revisionPairs.empty')}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {pairs.map(pair => (
        <article key={pair.id} className="rounded-md border border-border bg-bg-base p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-text-primary">
              <GitCompareArrows className="h-3.5 w-3.5 shrink-0 text-accent" />
              <span className="truncate">{pair.chapterTitle}</span>
            </span>
            <button
              type="button"
              onClick={() => { void onRemove(pair.id) }}
              className="rounded p-1 text-text-muted hover:bg-error/10 hover:text-error"
              title={t('revisionPairs.deleteTitle')}
              aria-label={t('revisionPairs.deleteAria', { title: pair.chapterTitle })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 grid gap-2 text-[11px] leading-5 md:grid-cols-2">
            <div className="rounded border border-border/70 p-2 text-text-muted">
              <span className="mb-1 block font-medium text-text-secondary">{t('revisionPairs.beforeLabel')}</span>
              {excerpt(pair.beforeText)}
            </div>
            <div className="rounded border border-accent/25 bg-accent/5 p-2 text-text-secondary">
              <span className="mb-1 block font-medium text-accent">{t('revisionPairs.afterLabel')}</span>
              {excerpt(pair.afterText)}
            </div>
          </div>
          <input
            key={`${pair.id}-${pair.authorNote ?? ''}`}
            defaultValue={pair.authorNote ?? ''}
            onBlur={event => {
              if (event.currentTarget.value.trim() !== (pair.authorNote ?? '')) {
                void onUpdateNote(pair.id, event.currentTarget.value)
              }
            }}
            maxLength={240}
            placeholder={t('revisionPairs.notePlaceholder')}
            className="mt-2 w-full rounded border border-border bg-bg-surface px-2.5 py-1.5 text-xs text-text-secondary focus:border-accent focus:outline-none"
          />
        </article>
      ))}
    </div>
  )
}
