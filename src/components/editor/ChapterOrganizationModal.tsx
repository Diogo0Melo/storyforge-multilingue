import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatNumber } from '../../i18n/format'
import {
  AlertTriangle,
  Check,
  Database,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react'
import type {
  ChapterOrganizationDomain,
  ChapterOrganizationRun,
  ChapterOrganizationSelection,
} from '../../lib/agent/chapter-organization'
import { selectAllChapterOrganizationCandidates } from '../../lib/agent/chapter-organization'

interface Props {
  run: ChapterOrganizationRun
  current: boolean
  busy: boolean
  error: string
  onApply: (selection: ChapterOrganizationSelection) => void
  onRerun: () => void
  onClose: () => void
}

const DOMAIN_META_KEYS: Record<ChapterOrganizationDomain, { labelKey: string; descriptionKey: string }> = {
  state: { labelKey: 'organization.domain.state', descriptionKey: 'organization.domain.stateDesc' },
  facts: { labelKey: 'organization.domain.facts', descriptionKey: 'organization.domain.factsDesc' },
  inventory: { labelKey: 'organization.domain.inventory', descriptionKey: 'organization.domain.inventoryDesc' },
  timeline: { labelKey: 'organization.domain.timeline', descriptionKey: 'organization.domain.timelineDesc' },
  relations: { labelKey: 'organization.domain.relations', descriptionKey: 'organization.domain.relationsDesc' },
  foreshadows: { labelKey: 'organization.domain.foreshadows', descriptionKey: 'organization.domain.foreshadowsDesc' },
}

type OrgStatusKey = 'organization.statusLabel.pending' | 'organization.statusLabel.adopted' | 'organization.statusLabel.failed' | 'organization.statusLabel.skipped'

const STATUS_LABEL_KEYS: Record<string, OrgStatusKey> = {
  pending: 'organization.statusLabel.pending',
  adopted: 'organization.statusLabel.adopted',
  failed: 'organization.statusLabel.failed',
  skipped: 'organization.statusLabel.skipped',
}

function selectedSet(selection: ChapterOrganizationSelection, key: keyof ChapterOrganizationSelection) {
  return new Set(selection[key])
}

export default function ChapterOrganizationModal({
  run,
  current,
  busy,
  error,
  onApply,
  onRerun,
  onClose,
}: Props) {
  const { t } = useTranslation('editor')
  const { candidate } = run
  const [selection, setSelection] = useState<ChapterOrganizationSelection>(() => (
    selectAllChapterOrganizationCandidates(candidate)
  ))

  useEffect(() => {
    setSelection(selectAllChapterOrganizationCandidates(candidate))
  }, [candidate])

  const total = useMemo(() => Object.values(selection).reduce((sum, indexes) => sum + indexes.length, 0), [selection])
  const allResolved = Object.values(candidate.domainStatus).every(
    status => status === 'adopted' || status === 'skipped',
  )

  const toggle = (key: keyof ChapterOrganizationSelection, index: number) => {
    setSelection(currentSelection => {
      const selected = selectedSet(currentSelection, key)
      if (selected.has(index)) selected.delete(index)
      else selected.add(index)
      return { ...currentSelection, [key]: [...selected].sort((a, b) => a - b) }
    })
  }

  const renderSection = (input: {
    domain: ChapterOrganizationDomain
    key: keyof ChapterOrganizationSelection
    items: Array<{ title: string; detail: string; quote: string }>
  }) => {
    const status = candidate.domainStatus[input.domain]
    const selected = selectedSet(selection, input.key)
    return (
      <section className="rounded-xl border border-border bg-bg-base/60 overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-text-primary">{t(DOMAIN_META_KEYS[input.domain].labelKey as 'organization.domain.state')}</h4>
              <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[10px] text-text-muted">
                {t('organization.itemCount', { count: input.items.length })}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-text-muted">{t(DOMAIN_META_KEYS[input.domain].descriptionKey as 'organization.domain.stateDesc')}</p>
          </div>
          <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] ${
            status === 'adopted' ? 'bg-emerald-500/10 text-emerald-400'
              : status === 'failed' ? 'bg-red-500/10 text-red-400'
                : 'bg-amber-500/10 text-amber-300'
          }`}>
            {STATUS_LABEL_KEYS[status] ? t(STATUS_LABEL_KEYS[status]) : status}
          </span>
        </div>
        {candidate.domainErrors[input.domain] && (
          <p className="border-b border-red-500/20 bg-red-500/5 px-4 py-2 text-xs text-red-300">
            {candidate.domainErrors[input.domain]}
          </p>
        )}
        {input.items.length === 0 ? (
          <p className="px-4 py-3 text-xs text-text-muted">{t('organization.noCandidates')}</p>
        ) : (
          <div className="divide-y divide-border/50">
            {input.items.map((item, index) => (
              <label key={`${input.domain}-${index}`} className="flex cursor-pointer gap-3 px-4 py-3 hover:bg-bg-hover/40">
                <input
                  type="checkbox"
                  checked={selected.has(index)}
                  disabled={busy || !current || (status !== 'pending' && status !== 'failed')}
                  onChange={() => toggle(input.key, index)}
                  className="mt-1 accent-accent"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-text-primary">{item.title}</span>
                  {item.detail && <span className="mt-0.5 block text-xs text-text-secondary">{item.detail}</span>}
                  <span className="mt-1 block rounded bg-bg-elevated px-2 py-1 text-[11px] text-text-muted">
                    {t('organization.evidence', { quote: item.quote })}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-bg-surface shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-text-primary">
              <Sparkles className="h-5 w-5 text-accent" />
              {t('organization.title', { chapterTitle: candidate.chapterTitle })}
            </h3>
            <p className="mt-1 text-xs text-text-muted">
              {t('organization.subtitle')}
            </p>
          </div>
          <button onClick={onClose} disabled={busy} aria-label={t('organization.closeLabel')}
            className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {!current && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">{t('organization.expiredTitle')}</p>
                <p className="mt-0.5 text-xs text-amber-200/80">{t('organization.expiredDesc')}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-bg-base p-3 text-xs text-text-secondary sm:grid-cols-3">
            <span>{t('organization.budgetTokens', { used: formatNumber(candidate.budget.usedTokens), max: formatNumber(candidate.budget.maxTokens) })}</span>
            <span>{t('organization.budgetCalls', { used: candidate.budget.calls, max: candidate.budget.maxCalls })}</span>
            <span>{t('organization.sourceHash', { hash: candidate.sourceTextHash.slice(0, 12) })}</span>
          </div>

          {renderSection({
            domain: 'state',
            key: 'stateDiffs',
            items: candidate.stateDiffs.map(item => ({
              title: `${item.entityName} · ${item.field}`,
              detail: `${item.oldValue || t('organization.emptyValue')} → ${item.newValue}`,
              quote: item.sourceQuote,
            })),
          })}
          {renderSection({
            domain: 'facts',
            key: 'facts',
            items: candidate.facts.map(item => ({
              title: `${item.subjectName} · ${item.predicate}：${item.value}`,
              detail: item.objectName ? t('organization.objectLabel', { name: item.objectName }) : '',
              quote: item.sourceQuote,
            })),
          })}
          {renderSection({
            domain: 'inventory',
            key: 'inventoryEvents',
            items: candidate.inventoryEvents.map(item => ({
              title: `${item.heldByName} ${item.action === 'gain' ? t('organization.gain') : t('organization.consume')} ${item.itemName} ×${item.quantity}`,
              detail: item.note,
              quote: item.sourceQuote,
            })),
          })}
          {renderSection({
            domain: 'timeline',
            key: 'storyEvents',
            items: candidate.storyEvents.map(item => ({
              title: `${item.title} · ${t('organization.importance', { value: item.importance })}`,
              detail: [item.storyTime, item.description].filter(Boolean).join(' · '),
              quote: item.sourceQuote,
            })),
          })}
          {renderSection({
            domain: 'relations',
            key: 'relations',
            items: candidate.relations.map(item => ({
              title: `${item.char1} ↔ ${item.char2} · ${item.label || item.type}`,
              detail: item.description,
              quote: item.sourceQuote,
            })),
          })}
          {renderSection({
            domain: 'foreshadows',
            key: 'foreshadowUpdates',
            items: candidate.foreshadowUpdates.map(item => ({
              title: `${item.name} · ${item.fromStatus} → ${item.toStatus}`,
              detail: item.note,
              quote: item.sourceQuote,
            })),
          })}

          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Database className="h-4 w-4" />
            {t('organization.savedLocally')}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onRerun} disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-secondary hover:text-text-primary disabled:opacity-40">
              <RefreshCw className="h-4 w-4" /> {t('organization.rerun')}
            </button>
            <button onClick={() => onApply(selection)}
              disabled={busy || !current || total === 0 || allResolved}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {busy ? t('organization.writing') : t('organization.confirmWrite', { count: total })}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
