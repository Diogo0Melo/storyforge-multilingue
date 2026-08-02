import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatNumber } from '../../i18n/format'
import {
  ChevronDown,
  Database,
  FileSearch,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import {
  buildRagLibrary,
  readRecentRagRecalls,
  updateRagDocumentPolicy,
  updateRagFieldPolicy,
  type RecentRagRecall,
} from '../../lib/retrieval/rag-library'
import {
  clearProjectRetrievalCache,
  rebuildProjectNarrativeSummaries,
  rebuildProjectRetrievalChunks,
} from '../../lib/retrieval/retrieval'
import type { Project, RagLibraryEntry } from '../../lib/types'
import { useWorldGroupStore } from '../../stores/world-group'
import { useDialog } from '../shared/Dialog'
import { useToast } from '../shared/Toast'
import type { PanelsKeys } from '../../i18n/generated-resources'

interface DocumentGroup {
  id: string
  tableName: string
  recordId: number
  sourceLabel: string
  sourceLabelKey?: string
  title: string
  updatedAt: number
  fields: RagLibraryEntry[]
}

const VECTOR_LABELS = {
  none: 'retrieval.vector.none',
  keyword: 'retrieval.vector.keyword',
  partial: 'retrieval.vector.partial',
  ready: 'retrieval.vector.ready',
} as const satisfies Record<RagLibraryEntry['vectorState'], PanelsKeys>

export default function RagLibraryPanel({ project }: { project: Project }) {
  const { t } = useTranslation('panels')
  const projectId = project.id!
  const activeWorldGroupId = useWorldGroupStore(state => state.activeGroupId)
  const worldGroupId = project.enableMultiWorld ? activeWorldGroupId : null
  const toast = useToast()
  const dialog = useDialog()
  const [entries, setEntries] = useState<RagLibraryEntry[]>([])
  const [recalls, setRecalls] = useState<RecentRagRecall[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'rebuild' | 'clear' | null>(null)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [library, recent] = await Promise.all([
        buildRagLibrary({ projectId, worldGroupId }),
        readRecentRagRecalls(projectId),
      ])
      setEntries(library)
      setRecalls(recent)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // load is scoped by project/world identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, worldGroupId])

  const groups = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN')
    const visible = normalized
      ? entries.filter(entry => (
          `${entry.sourceLabel} ${entry.title} ${entry.fieldLabel} ${entry.content}`
            .toLocaleLowerCase('zh-CN')
            .includes(normalized)
        ))
      : entries
    const map = new Map<string, DocumentGroup>()
    for (const entry of visible) {
      const current = map.get(entry.documentId) ?? {
        id: entry.documentId,
        tableName: entry.tableName,
        recordId: entry.recordId,
        sourceLabel: entry.sourceLabel,
        sourceLabelKey: entry.sourceLabelKey,
        title: entry.title,
        updatedAt: entry.updatedAt,
        fields: [],
      }
      current.fields.push(entry)
      map.set(entry.documentId, current)
    }
    return [...map.values()]
  }, [entries, query])

  const stats = useMemo(() => ({
    documents: new Set(entries.map(entry => entry.documentId)).size,
    fields: entries.length,
    enabled: entries.filter(entry => entry.enabled).length,
    tokens: entries.filter(entry => entry.enabled).reduce((sum, entry) => sum + entry.tokenEstimate, 0),
    chunks: Math.max(0, ...entries.map(entry => entry.chunkCount)),
    totalChunks: [...new Map(entries.map(entry => [entry.documentId, entry.chunkCount])).values()]
      .reduce((sum, count) => sum + count, 0),
  }), [entries])

  const mutate = async (operation: () => Promise<void>) => {
    try {
      await operation()
      await load()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const rebuild = async () => {
    setBusy('rebuild')
    try {
      const chunks = await rebuildProjectRetrievalChunks({ projectId })
      const summaries = await rebuildProjectNarrativeSummaries({ projectId })
      await load()
      toast.success(
        t('retrieval.library.rebuildSuccess', { chunks: chunks.chunks, summaries: summaries.chapterNodes + summaries.volumeNodes + summaries.bookNodes }),
      )
    } catch (reason) {
      toast.error(t('retrieval.library.rebuildFailed', { error: reason instanceof Error ? reason.message : String(reason) }))
    } finally {
      setBusy(null)
    }
  }

  const clear = async () => {
    const confirmed = await dialog.confirm({
      title: t('retrieval.library.deleteTitle'),
      message: t('retrieval.library.deleteMsg'),
      confirmText: t('retrieval.library.deleteConfirm'),
      tone: 'danger',
    })
    if (!confirmed) return
    setBusy('clear')
    try {
      const cleared = await clearProjectRetrievalCache(projectId)
      await load()
      toast.success(t('retrieval.library.deleteSuccess', { chunks: cleared.chunks, summaries: cleared.summaries }))
    } catch (reason) {
      toast.error(t('retrieval.library.deleteFailed', { error: reason instanceof Error ? reason.message : String(reason) }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-bg-base p-5">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-start gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-accent" />
                <h1 className="text-lg font-semibold text-text-primary">{t('retrieval.library.title')}</h1>
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-text-secondary">
                {t('retrieval.library.subtitle')}
              </p>
            </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void rebuild()}
              className="flex items-center gap-1.5 rounded border border-border bg-bg-surface px-3 py-2 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {busy === 'rebuild' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {t('retrieval.library.rebuildIndex')}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void clear()}
              className="flex items-center gap-1.5 rounded border border-error/40 px-3 py-2 text-xs text-error hover:bg-error/10 disabled:opacity-50"
            >
              {busy === 'clear' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {t('retrieval.library.deleteIndex')}
            </button>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            [t('retrieval.library.visibleRecords'), formatNumber(stats.documents)],
            [t('retrieval.library.visibleFields'), `${stats.enabled}/${stats.fields}`],
            [t('retrieval.library.contentEstimate'), `${formatNumber(stats.tokens)} tokens`],
            [t('retrieval.library.chapterChunks'), formatNumber(stats.totalChunks)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-bg-surface p-3">
              <p className="text-[10px] text-text-muted">{label}</p>
              <p className="mt-1 text-sm font-medium text-text-primary">{value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-border bg-bg-surface">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
            <div>
              <h2 className="text-sm font-medium text-text-primary">{t('retrieval.library.inputData')}</h2>
              <p className="text-[10px] text-text-muted">{t('retrieval.library.inputDataDesc')}</p>
            </div>
            <label className="ml-auto flex min-w-64 items-center gap-2 rounded border border-border bg-bg-base px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-text-muted" />
              <input
                aria-label={t('retrieval.library.searchAria')}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={t('retrieval.library.searchPlaceholder')}
                className="min-w-0 flex-1 bg-transparent text-xs text-text-primary outline-none"
              />
            </label>
          </div>
          {loading && !entries.length ? (
            <p className="flex items-center justify-center gap-2 py-16 text-xs text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> {t('retrieval.library.loading')}
            </p>
          ) : error ? (
            <p className="m-4 rounded bg-error/10 p-3 text-xs text-error">{error}</p>
          ) : !groups.length ? (
            <p className="py-16 text-center text-xs text-text-muted">{t('retrieval.library.noMatch')}</p>
          ) : (
            <div className="divide-y divide-border">
              {groups.map(group => {
                const first = group.fields[0]
                const totalTokens = group.fields.reduce((sum, entry) => sum + entry.tokenEstimate, 0)
                const chunkCount = Math.max(...group.fields.map(entry => entry.chunkCount))
                const vectorState = group.fields.find(entry => entry.vectorState === 'ready')?.vectorState
                  ?? group.fields.find(entry => entry.vectorState === 'partial')?.vectorState
                  ?? group.fields.find(entry => entry.vectorState === 'keyword')?.vectorState
                  ?? 'none'
                return (
                  <details key={group.id} className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-bg-hover">
                      <ChevronDown className="h-3.5 w-3.5 text-text-muted transition-transform group-open:rotate-180" />
                      <input
                        type="checkbox"
                        aria-label={t('retrieval.library.enableDocAria', { title: group.title })}
                        checked={first.documentEnabled}
                        onClick={event => event.stopPropagation()}
                        onChange={event => void mutate(() => updateRagDocumentPolicy({
                          projectId,
                          tableName: group.tableName,
                          recordId: group.recordId,
                          patch: { enabled: event.target.checked },
                        }))}
                        className="accent-[var(--color-accent)]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-text-primary">
                          <span className="mr-2 text-text-muted">{group.sourceLabelKey ? t(group.sourceLabelKey as PanelsKeys, group.sourceLabel) : group.sourceLabel}</span>{group.title}
                        </p>
                        <p className="mt-0.5 text-[10px] text-text-muted">
                          {t('retrieval.library.fields', { count: group.fields.length })} · {formatNumber(totalTokens)} tokens ·
                          {' '}{chunkCount ? `${t('retrieval.library.chunks', { count: chunkCount })} · ` : ''}{t(VECTOR_LABELS[vectorState])} ·
                          {' '}{t('retrieval.library.updated', { date: group.updatedAt ? new Date(group.updatedAt).toLocaleString() : t('retrieval.library.unknown') })}
                        </p>
                      </div>
                      <label className="text-[10px] text-text-muted" onClick={event => event.stopPropagation()}>
                        {t('retrieval.library.defaultWeight')}
                        <input
                          type="number"
                          min={0.1}
                          max={5}
                          step={0.1}
                          value={first.documentWeight}
                          onChange={event => void mutate(() => updateRagDocumentPolicy({
                            projectId,
                            tableName: group.tableName,
                            recordId: group.recordId,
                            patch: { weight: Number(event.target.value) },
                          }))}
                          className="ml-1 w-16 rounded border border-border bg-bg-base px-1.5 py-1 text-[10px] text-text-primary"
                        />
                      </label>
                      <label className="text-[10px] text-text-muted" onClick={event => event.stopPropagation()}>
                        {t('retrieval.library.fieldCap')}
                        <input
                          type="number"
                          min={100}
                          step={100}
                          value={first.documentTokenCap}
                          onChange={event => void mutate(() => updateRagDocumentPolicy({
                            projectId,
                            tableName: group.tableName,
                            recordId: group.recordId,
                            patch: { tokenCap: Number(event.target.value) },
                          }))}
                          className="ml-1 w-20 rounded border border-border bg-bg-base px-1.5 py-1 text-[10px] text-text-primary"
                        />
                      </label>
                    </summary>
                    <div className="grid gap-2 bg-bg-base/50 px-10 pb-4 pt-1 lg:grid-cols-2">
                      {group.fields.map(entry => (
                        <div key={entry.key} className="rounded border border-border bg-bg-surface p-2.5">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              aria-label={t('retrieval.library.enableFieldAria', { label: entry.fieldLabel })}
                              checked={entry.enabled}
                              disabled={!entry.documentEnabled}
                              onChange={event => void mutate(() => updateRagFieldPolicy({
                                projectId,
                                tableName: entry.tableName,
                                recordId: entry.recordId,
                                fieldKey: entry.fieldKey,
                                patch: { enabled: event.target.checked },
                              }))}
                              className="accent-[var(--color-accent)]"
                            />
                            <span className="text-[11px] font-medium text-text-secondary">{entry.fieldLabel}</span>
                            <span className="ml-auto text-[9px] text-text-muted">
                              {entry.tokenEstimate} tokens · 权重 {entry.weight} · 上限 {entry.tokenCap}
                            </span>
                          </div>
                          <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-[10px] leading-4 text-text-muted">
                            {entry.content}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </details>
                )
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-bg-surface">
          <div className="flex items-center gap-2 border-b border-border p-3">
            <FileSearch className="h-4 w-4 text-accent" />
            <div>
              <h2 className="text-sm font-medium text-text-primary">{t('retrieval.library.recentRecalls')}</h2>
              <p className="text-[10px] text-text-muted">{t('retrieval.library.recentRecallsDesc')}</p>
            </div>
          </div>
          {!recalls.length ? (
            <p className="p-6 text-center text-xs text-text-muted">{t('retrieval.library.noRecalls')}</p>
          ) : (
            <div className="divide-y divide-border">
              {recalls.map(recall => (
                <details key={`${recall.runId}:${recall.nodeTitle}`} className="p-3">
                  <summary className="cursor-pointer text-xs text-text-secondary">
                    {recall.nodeTitle} · {new Date(recall.startedAt).toLocaleString()} ·
                    {' '}{t('retrieval.library.included')} {recall.included.length} / {t('retrieval.library.omitted')} {recall.omitted.length} / {t('retrieval.library.trimmed')} {recall.trimmed.length}
                  </summary>
                  <div className="mt-2 grid gap-2 text-[10px] text-text-muted md:grid-cols-3">
                    <p><strong className="text-text-secondary">{t('retrieval.library.included')}</strong><br />{recall.included.join('\n') || t('retrieval.library.none')}</p>
                    <p><strong className="text-text-secondary">{t('retrieval.library.omitted')}</strong><br />{recall.omitted.join('\n') || t('retrieval.library.none')}</p>
                    <p><strong className="text-text-secondary">{t('retrieval.library.trimmed')}</strong><br />{recall.trimmed.join('\n') || t('retrieval.library.none')}</p>
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
