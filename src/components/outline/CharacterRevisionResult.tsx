import { AlertTriangle, Check, Clipboard, Loader2, X } from 'lucide-react'
import { useDomainT } from '../../i18n'
import type { CharacterRevisionPlan } from '../../lib/story-planning/character-revision'

interface Props {
  analysis: CharacterRevisionPlan
  selectedOptionId: string | null
  selectedPatchIds: Set<number>
  applying: boolean
  onSelectOption: (id: string) => void
  onTogglePatch: (outlineNodeId: number) => void
  onCopy: () => void
  onApply: () => void
  onReject?: () => void
}

export default function CharacterRevisionResult({
  analysis,
  selectedOptionId,
  selectedPatchIds,
  applying,
  onSelectOption,
  onTogglePatch,
  onCopy,
  onApply,
  onReject,
}: Props) {
  const { t, lang } = useDomainT('outline')
  const selectedOption = analysis.options.find(option => option.id === selectedOptionId) ?? null
  return (
    <section className="space-y-4 rounded-lg border border-border bg-bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-text-primary">{t('revisionResult.heading')}</h3>
        <button onClick={onCopy} className="ml-auto inline-flex items-center gap-1 text-xs text-accent">
          <Clipboard className="w-3.5 h-3.5" />{t('revisionResult.copyPlan')}
        </button>
      </div>
      <p className="text-sm text-text-primary">{analysis.changeSummary}</p>
      <p className="text-xs text-text-muted">{analysis.scopeSummary}</p>

      {analysis.warnings.length > 0 && (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800">
          <div className="mb-1 flex items-center gap-1 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />{t('revisionResult.warningsHeading')}
          </div>
          {analysis.warnings.map(warning => <p key={warning}>• {warning}</p>)}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <ResultList
          title={t('revisionResult.affectedWrittenTitle', { count: analysis.affectedWrittenChapters.length })}
          items={analysis.affectedWrittenChapters.map(item =>
            t('revisionResult.writtenChapterFormat', { ordinal: item.ordinal, title: item.title, severity: item.severity, reason: item.reason }),
          )}
          empty={t('revisionResult.affectedWrittenEmpty')}
        />
        <ResultList
          title={t('revisionResult.immutableFactsTitle', { count: analysis.immutableFacts.length })}
          items={analysis.immutableFacts.map(item =>
            (item.sourceChapterOrdinal ? t('revisionResult.factFormat', { ordinal: item.sourceChapterOrdinal, statement: item.statement }) : t('revisionResult.factWithoutSource', { statement: item.statement }))
            + (item.evidenceQuote ? ` ${t('revisionResult.evidencePrefix')}${item.evidenceQuote}` : ` ${t('revisionResult.evidenceInsufficient')}`),
          )}
          empty={t('revisionResult.immutableFactsEmpty')}
        />
        <ResultList
          title={t('revisionResult.conflictsTitle', { count: analysis.conflicts.length })}
          items={analysis.conflicts.map(item => t('revisionResult.conflictFormat', { severity: item.severity, title: item.title, reason: item.reason }))}
          empty={t('revisionResult.conflictsEmpty')}
        />
        <ResultList
          title={t('revisionResult.foreshadowSuggestionsTitle', { count: analysis.foreshadowSuggestions.length })}
          items={analysis.foreshadowSuggestions.map(item =>
            t('revisionResult.foreshadowFormat', { ordinal: item.chapterOrdinal, title: item.title, suggestion: item.suggestion })
            + (item.writtenRegion ? t('revisionResult.manualSuggestionSuffix') : ''),
          )}
          empty={t('revisionResult.foreshadowSuggestionsEmpty')}
        />
      </div>

      {analysis.mainPlotSuggestion && (
        <div className="rounded border border-border bg-bg-base p-3">
          <h4 className="mb-1 text-xs font-medium text-text-primary">{t('revisionResult.mainPlotSuggestionHeading')}</h4>
          <p className="text-xs text-text-muted whitespace-pre-wrap">{analysis.mainPlotSuggestion}</p>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-sm font-medium text-text-primary">{t('revisionResult.chooseOptionHeading')}</h4>
        <div className="grid gap-3 lg:grid-cols-3">
          {analysis.options.map(option => (
            <button
              key={option.id}
              onClick={() => onSelectOption(option.id)}
              className={`rounded-lg border p-3 text-left ${
                selectedOptionId === option.id
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-bg-base'
              }`}
            >
              <strong className="text-sm text-text-primary">{option.label}</strong>
              <span className="ml-2 text-[10px] text-text-muted">{t('revisionResult.patchCount', { count: option.patches.length })}</span>
              <p className="mt-1 text-xs text-text-muted">{option.summary}</p>
              {option.risks.length > 0 && (
                <p className="mt-2 text-[11px] text-amber-700">{t('revisionResult.risksPrefix')}{new Intl.ListFormat(lang, { type: 'conjunction', style: 'short' }).format(option.risks)}</p>
              )}
            </button>
          ))}
        </div>
      </div>

      {selectedOption && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium text-text-primary">{t('revisionResult.previewHeading')}</h4>
            <span className="text-xs text-text-muted">{t('revisionResult.pendingCount', { count: selectedPatchIds.size })}</span>
          </div>
          {selectedOption.patches.length === 0 ? (
            <div className="rounded border border-dashed border-border p-4 text-center text-xs text-text-muted">
              {t('revisionResult.noPatches')}
            </div>
          ) : (
            <div className="space-y-2">
              {selectedOption.patches.map(patch => (
                <label key={patch.outlineNodeId} className="block rounded border border-border bg-bg-base p-3">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedPatchIds.has(patch.outlineNodeId)}
                      onChange={() => onTogglePatch(patch.outlineNodeId)}
                      className="mt-1 accent-accent"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-text-primary">
                        {patch.title}
                        {patch.anchorProtected && <span className="ml-2 text-amber-700">{t('revisionResult.anchorBadge')}</span>}
                      </div>
                      {patch.currentTitle !== patch.proposedTitle && (
                        <p className="mt-1 text-xs">
                          <span className="text-text-muted line-through">{patch.currentTitle}</span>
                          <span className="mx-1 text-accent">→</span>
                          <span className="text-text-primary">{patch.proposedTitle}</span>
                        </p>
                      )}
                      <div className="mt-1 grid gap-1 text-xs md:grid-cols-2">
                        <p className="rounded bg-red-500/5 p-2 text-text-muted whitespace-pre-wrap">
                          {t('revisionResult.originalSummary', { summary: patch.currentSummary || t('revisionResult.noSummary') })}
                        </p>
                        <p className="rounded bg-green-500/5 p-2 text-text-primary whitespace-pre-wrap">
                          {t('revisionResult.proposedSummary', { summary: patch.proposedSummary || t('revisionResult.noSummary') })}
                        </p>
                      </div>
                      {patch.reason && <p className="mt-1 text-[11px] text-text-muted">{t('revisionResult.reasonPrefix')}{patch.reason}</p>}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <button
          onClick={onApply}
          disabled={!selectedPatchIds.size || applying}
          className="inline-flex items-center gap-1.5 rounded bg-green-600 px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {t('revisionResult.applyButton')}
        </button>
        <span className="text-xs text-text-muted">{t('revisionResult.applySafetyNote')}</span>
        {onReject && (
          <button
            onClick={onReject}
            disabled={applying}
            className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-2 text-sm text-text-muted disabled:opacity-40"
          >
            <X className="w-4 h-4" />{t('revisionResult.rejectButton')}
          </button>
        )}
      </div>
    </section>
  )
}

function ResultList({
  title,
  items,
  empty,
}: {
  title: string
  items: string[]
  empty: string
}) {
  return (
    <div className="rounded border border-border bg-bg-base p-3">
      <h4 className="mb-2 text-xs font-medium text-text-primary">{title}</h4>
      {items.length
        ? items.map(item => <p key={item} className="mb-1 text-xs text-text-muted">• {item}</p>)
        : <p className="text-xs text-text-muted">{empty}</p>}
    </div>
  )
}
