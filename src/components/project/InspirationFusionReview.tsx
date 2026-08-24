import { Check, GitCompareArrows, History, Trash2, X } from 'lucide-react'
import type { InspirationResultDiff } from '../../lib/inspiration/workspace'
import type {
  InspirationFragment,
  InspirationResultMode,
  InspirationVersion,
} from '../../lib/types/inspiration-workspace'
import { useDomainT } from '../../i18n'

type SourceKindKey = 'author' | 'reference' | 'research' | 'other'
type FusionSourceKey =
  | 'fusionReview.sourceAuthor' | 'fusionReview.sourceReference'
  | 'fusionReview.sourceResearch' | 'fusionReview.sourceOther'

const SOURCE_LABEL_KEY: Record<SourceKindKey, FusionSourceKey> = {
  author: 'fusionReview.sourceAuthor',
  reference: 'fusionReview.sourceReference',
  research: 'fusionReview.sourceResearch',
  other: 'fusionReview.sourceOther',
}

interface Props {
  fragments: InspirationFragment[]
  versions: InspirationVersion[]
  selectedIds: ReadonlySet<string>
  mode: InspirationResultMode
  pendingDiff: InspirationResultDiff[] | null
  confirming: boolean
  candidateDraft?: string | null
  candidateInputSummary?: string
  onCandidateChange?: (draft: string) => void
  onToggle: (fragmentId: string) => void
  onRemove: (fragmentId: string) => void
  onConfirm: () => void
  onDiscard: () => void
}

export default function InspirationFusionReview({
  fragments,
  versions,
  selectedIds,
  mode,
  pendingDiff,
  confirming,
  candidateDraft = null,
  candidateInputSummary,
  onCandidateChange,
  onToggle,
  onRemove,
  onConfirm,
  onDiscard,
}: Props) {
  const { t } = useDomainT('project')
  const modeVersions = versions.filter(version => version.mode === mode)

  return (
    <section className="space-y-3 rounded-lg border border-border bg-bg-surface p-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-text-primary">{t('fusionReview.heading')}</h3>
          <p className="mt-0.5 text-xs text-text-muted">
            {t('fusionReview.selectionHint')}
          </p>
        </div>
        <span className="flex items-center gap-1 text-xs text-text-muted">
          <History className="h-3.5 w-3.5" />
          {t('fusionReview.confirmedVersions', { count: modeVersions.length })}
        </span>
      </div>

      {fragments.length === 0 ? (
        <p className="rounded bg-bg-elevated px-3 py-2 text-xs text-text-muted">
          {t('fusionReview.emptyState')}
        </p>
      ) : (
        <div className="max-h-56 space-y-1.5 overflow-y-auto">
          {fragments.map(fragment => {
            const referenced = versions.some(version => version.fragmentIds.includes(fragment.id))
            const sourceKey = SOURCE_LABEL_KEY[fragment.sourceKind as SourceKindKey]
            return (
              <div
                key={fragment.id}
                className={`flex items-start gap-2 rounded border px-2.5 py-2 ${
                  selectedIds.has(fragment.id) ? 'border-accent/50 bg-accent/5' : 'border-border bg-bg-base'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(fragment.id)}
                  onChange={() => onToggle(fragment.id)}
                  className="mt-0.5 accent-accent"
                  aria-label={t('fusionReview.selectFragmentAriaLabel', { label: fragment.label || fragment.text.slice(0, 20) })}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px] text-text-muted">
                    <span className="rounded bg-bg-elevated px-1.5 py-0.5">
                      {sourceKey ? t(sourceKey) : fragment.sourceKind}
                    </span>
                    {fragment.label && <span className="truncate">{fragment.label}</span>}
                    <time className="ml-auto shrink-0">
                      {new Date(fragment.createdAt).toLocaleString()}
                    </time>
                  </div>
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-text-secondary">
                    {fragment.text}
                  </p>
                </div>
                <button
                  onClick={() => onRemove(fragment.id)}
                  disabled={referenced}
                  className="shrink-0 p-1 text-text-muted hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                  title={referenced
                    ? t('fusionReview.referencedTooltip')
                    : t('fusionReview.removeTooltip')}
                  aria-label={t('fusionReview.removeAriaLabel')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {(candidateDraft != null || pendingDiff !== null) && (
        <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-amber-400">
            <GitCompareArrows className="h-4 w-4" />
            {t('fusionReview.pendingHeading')}
          </div>
          <p className="text-xs text-text-muted">
            {candidateDraft != null
              ? t('fusionReview.candidateHint')
              : t('fusionReview.pendingHint')}
          </p>
          {candidateInputSummary && (
            <p className="text-[11px] text-text-muted">{candidateInputSummary}</p>
          )}
          {candidateDraft != null && (
            <textarea
              aria-label={t('fusionReview.candidateInputAriaLabel')}
              value={candidateDraft}
              onChange={event => onCandidateChange?.(event.target.value)}
              disabled={confirming}
              className="min-h-64 w-full resize-y rounded border border-border bg-bg-base px-2.5 py-2 font-mono text-[11px] leading-5 text-text-primary"
            />
          )}
          {pendingDiff === null ? (
            <p className="text-xs text-red-400">{t('fusionReview.candidateInvalid')}</p>
          ) : pendingDiff.length === 0 ? (
            <p className="text-xs text-text-secondary">{t('fusionReview.noDiff')}</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {pendingDiff.map(diff => (
                <div key={diff.path} className="rounded border border-border bg-bg-base p-2 text-xs">
                  <div className="mb-1 font-mono text-[11px] text-accent">{diff.path}</div>
                  <div className="grid gap-1 md:grid-cols-2">
                    <div className="rounded bg-red-500/5 p-1.5 text-text-muted">
                      <span className="mb-0.5 block text-[10px] text-red-400">{t('fusionReview.previousVersion')}</span>
                      {diff.before || t('fusionReview.noneValue')}
                    </div>
                    <div className="rounded bg-green-500/5 p-1.5 text-text-secondary">
                      <span className="mb-0.5 block text-[10px] text-green-400">{t('fusionReview.newVersion')}</span>
                      {diff.after || t('fusionReview.deletedValue')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={onConfirm}
              disabled={confirming || pendingDiff === null}
              className="flex items-center gap-1 rounded bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700 disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" />
              {confirming ? t('fusionReview.saving') : t('fusionReview.confirmFusion')}
            </button>
            <button
              onClick={onDiscard}
              disabled={confirming}
              className="flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" />
              {t('fusionReview.discard')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
