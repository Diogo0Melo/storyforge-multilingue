import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Database, Loader2, RefreshCw, Search } from 'lucide-react'
import { buildRagLibrary } from '../../lib/retrieval/rag-library'
import type { RagLibraryEntry } from '../../lib/types'

interface DocumentGroup {
  id: string
  sourceLabel: string
  title: string
  fields: RagLibraryEntry[]
}

export default function RagEntrySelector(props: {
  projectId: number
  worldGroupId: number | null
  selectedKeys: string[]
  onChange: (keys: string[]) => void
}) {
  const { t } = useTranslation('panels')
  const [entries, setEntries] = useState<RagLibraryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setEntries(await buildRagLibrary({
        projectId: props.projectId,
        worldGroupId: props.worldGroupId,
      }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // load is bound to the active project/world identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.projectId, props.worldGroupId])

  const groups = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN')
    const filtered = normalized
      ? entries.filter(entry => (
          `${entry.sourceLabel} ${entry.title} ${entry.fieldLabel} ${entry.content}`
            .toLocaleLowerCase('zh-CN')
            .includes(normalized)
        ))
      : entries
    const map = new Map<string, DocumentGroup>()
    for (const entry of filtered) {
      const group = map.get(entry.documentId) ?? {
        id: entry.documentId,
        sourceLabel: entry.sourceLabel,
        title: entry.title,
        fields: [],
      }
      group.fields.push(entry)
      map.set(entry.documentId, group)
    }
    return [...map.values()]
  }, [entries, query])

  const selected = new Set(props.selectedKeys)
  const toggle = (key: string) => {
    props.onChange(selected.has(key)
      ? props.selectedKeys.filter(item => item !== key)
      : [...props.selectedKeys, key])
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium text-text-secondary">{t('retrieval.rag.title' as any)}</p>
          <p className="text-[9px] leading-4 text-text-muted">
            {t('retrieval.rag.selectedCount' as any, { count: props.selectedKeys.length } as any)}
          </p>
        </div>
        <button
          type="button"
          title={t('retrieval.rag.refreshAria' as any)}
          onClick={() => void load()}
          className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-accent"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <label className="mb-2 flex items-center gap-1.5 rounded border border-border bg-bg-base px-2 py-1">
        <Search className="h-3 w-3 text-text-muted" />
        <input
          aria-label={t('retrieval.rag.searchAria' as any)}
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={t('retrieval.rag.searchPlaceholder' as any)}
          className="min-w-0 flex-1 bg-transparent text-[10px] text-text-primary outline-none"
        />
      </label>
      <div className="max-h-[27rem] space-y-1.5 overflow-y-auto rounded border border-border bg-bg-base p-2">
        {loading && !entries.length ? (
          <p className="flex items-center justify-center gap-1 py-6 text-[10px] text-text-muted">
            <Loader2 className="h-3 w-3 animate-spin" /> {t('retrieval.rag.buildingProjection' as any)}
          </p>
        ) : error ? (
          <p className="rounded bg-error/10 p-2 text-[10px] text-error">{error}</p>
        ) : !groups.length ? (
          <p className="py-6 text-center text-[10px] text-text-muted">{t('retrieval.rag.noMatch' as any)}</p>
        ) : groups.map(group => {
          const selectedCount = group.fields.filter(entry => selected.has(entry.key)).length
          return (
            <details key={group.id} open={selectedCount > 0} className="rounded border border-border/70 bg-bg-surface">
              <summary className="cursor-pointer list-none px-2 py-1.5 text-[10px] text-text-secondary">
                <span className="flex items-center gap-1">
                  <Database className="h-3 w-3 text-text-muted" />
                  <span className="min-w-0 flex-1 truncate">{group.sourceLabel} · {group.title}</span>
                  {selectedCount > 0 && (
                    <span className="rounded bg-accent/10 px-1 text-[9px] text-accent">{selectedCount}</span>
                  )}
                </span>
              </summary>
              <div className="border-t border-border/70 p-1">
                {group.fields.map(entry => (
                  <button
                    key={entry.key}
                    type="button"
                    disabled={!entry.enabled}
                    onClick={() => toggle(entry.key)}
                    title={entry.enabled
                      ? `${entry.tokenEstimate} tokens · 权重 ${entry.weight} · 上限 ${entry.tokenCap}`
                      : t('retrieval.rag.fieldDisabled' as any)}
                    className={`flex w-full items-start gap-1.5 rounded px-1.5 py-1 text-left ${
                      selected.has(entry.key)
                        ? 'bg-accent/10 text-accent'
                        : entry.enabled
                          ? 'text-text-secondary hover:bg-bg-hover'
                          : 'cursor-not-allowed text-text-muted opacity-50'
                    }`}
                  >
                    <span className="mt-0.5 flex h-3 w-3 shrink-0 items-center justify-center rounded border border-current">
                      {selected.has(entry.key) && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px]">{entry.fieldLabel}</span>
                      <span className="block truncate text-[9px] opacity-70">
                        {entry.tokenEstimate} tokens · {entry.vectorState === 'ready' ? t('retrieval.rag.vectorReady' as any) : entry.vectorState === 'keyword' ? t('retrieval.rag.vectorKeyword' as any) : t('retrieval.rag.vectorNone' as any)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </details>
          )
        })}
      </div>
    </section>
  )
}
