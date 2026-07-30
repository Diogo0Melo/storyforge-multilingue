/**
 * NS-4 · 事实库面板 — 审阅事实账本候选、确认升 Canon / 否决。
 * 所有变更走 useFactLedgerStore（→ lib/fact-ledger 单一入口），面板不裸写 db。
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, X, Database, Download, Upload } from 'lucide-react'
import type { Project } from '../../lib/types'
import { useFactLedgerStore } from '../../stores/fact-ledger'
import { getFactPredicate } from '../../lib/registry/fact-predicate-registry'
import type { FactStatus } from '../../lib/types/temporal-fact'
import { exportFactMemoryMarkdown } from '../../lib/fact-ledger/human-readable-io'
import KnowledgeLedgerPanel from './KnowledgeLedgerPanel'
import WorldConstitutionPanel from './WorldConstitutionPanel'

type FactTab = FactStatus | 'exceptions'

const STATUS_TABS: { key: FactTab; labelKey: string }[] = [
  { key: 'exceptions', labelKey: 'facts.library.tabExceptions' },
  { key: 'candidate', labelKey: 'facts.library.tabCandidate' },
  { key: 'confirmed', labelKey: 'facts.library.tabConfirmed' },
  { key: 'superseded', labelKey: 'facts.library.tabSuperseded' },
  { key: 'rejected', labelKey: 'facts.library.tabRejected' },
]

const EXCEPTION_STATUSES: FactStatus[] = ['stale', 'source-missing', 'invalid-range']

const STATUS_LABEL_KEY: Record<FactStatus, string> = {
  candidate: 'facts.status.candidate',
  confirmed: 'facts.status.confirmed',
  superseded: 'facts.status.superseded',
  rejected: 'facts.status.rejected',
  stale: 'facts.status.stale',
  'source-missing': 'facts.status.sourceMissing',
  'invalid-range': 'facts.status.invalidRange',
}

const STATUS_HINT_KEY: Partial<Record<FactStatus, string>> = {
  stale: 'facts.hint.stale',
  'source-missing': 'facts.hint.sourceMissing',
  'invalid-range': 'facts.hint.invalidRange',
}

export default function FactLibraryPanel({ project }: { project: Project }) {
  const { t } = useTranslation('panels')
  const { facts, loading, load, confirmFact, rejectFact, importCandidateDiff } = useFactLedgerStore()
  const [tab, setTab] = useState<FactTab>('exceptions')
  const [diffText, setDiffText] = useState('')
  const [ioMsg, setIoMsg] = useState('')
  const [libraryMode, setLibraryMode] = useState<'facts' | 'knowledge' | 'constitution'>('facts')

  useEffect(() => { if (project.id != null) void load(project.id) }, [project.id, load])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const f of facts) c[f.status] = (c[f.status] ?? 0) + 1
    c.exceptions = EXCEPTION_STATUSES.reduce((sum, status) => sum + (c[status] ?? 0), 0)
    return c
  }, [facts])

  const rows = useMemo(() => tab === 'exceptions'
    ? facts.filter(f => EXCEPTION_STATUSES.includes(f.status))
    : facts.filter(f => f.status === tab), [facts, tab])

  const handleExport = async () => {
    if (project.id == null) return
    const markdown = await exportFactMemoryMarkdown(project.id)
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `storyforge-fact-memory-${project.id}.md`
    a.click()
    URL.revokeObjectURL(url)
    setIoMsg(t('facts.library.exported' as any))
  }

  const handleImportDiff = async () => {
    if (project.id == null || !diffText.trim()) return
    try {
      const raw = JSON.parse(diffText)
      const result = await importCandidateDiff(project.id, raw)
      setIoMsg(t('facts.library.diffImported' as any, { written: result.written, duplicate: result.skippedDuplicate, invalid: result.skippedInvalid } as any))
      if (result.written > 0) setDiffText('')
    } catch (err) {
      setIoMsg(t('facts.library.diffImportFailed' as any, { error: err instanceof Error ? err.message : String(err) } as any))
    }
  }

  if (libraryMode === 'knowledge') {
    return <KnowledgeLedgerPanel project={project} onShowFacts={() => setLibraryMode('facts')} />
  }
  if (libraryMode === 'constitution') {
    return <WorldConstitutionPanel project={project} onShowFacts={() => setLibraryMode('facts')} />
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-sky-400" />
          <h1 className="text-lg font-bold text-text-primary">{t('facts.library.title' as any)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setLibraryMode('constitution')}
            className="px-3 py-1.5 text-xs rounded-md bg-amber-500/10 text-amber-300 hover:bg-amber-500/20">
            {t('facts.library.viewConstitution' as any)}
          </button>
          <button onClick={() => setLibraryMode('knowledge')}
            className="px-3 py-1.5 text-xs rounded-md bg-violet-500/10 text-violet-300 hover:bg-violet-500/20">
            {t('facts.library.viewKnowledge' as any)}
          </button>
        </div>
      </div>
      <p className="text-xs text-text-muted mb-4">
        {t('facts.library.desc' as any)}
      </p>

      <div className="mb-4 p-3 rounded-lg border border-border bg-bg-elevated/60">
        <div className="flex flex-wrap gap-2 items-center mb-2">
          <button onClick={() => void handleExport()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-bg-base text-xs text-text-secondary hover:text-text-primary">
            <Download className="w-3.5 h-3.5" /> {t('facts.library.exportMarkdown' as any)}
          </button>
          <button onClick={() => void handleImportDiff()} disabled={!diffText.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-500/10 text-xs text-sky-300 hover:bg-sky-500/20 disabled:opacity-40">
            <Upload className="w-3.5 h-3.5" /> {t('facts.library.importDiff' as any)}
          </button>
          {ioMsg && <span className="text-[11px] text-text-muted">{ioMsg}</span>}
        </div>
        <textarea value={diffText} onChange={e => setDiffText(e.target.value)}
          placeholder={t('facts.library.diffPlaceholder' as any)}
          className="w-full min-h-[76px] px-3 py-2 text-xs rounded bg-bg-base border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-sky-500" />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_TABS.map(tabItem => (
          <button key={tabItem.key} onClick={() => setTab(tabItem.key)}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${tab === tabItem.key ? 'bg-sky-500/20 text-sky-300' : 'bg-bg-elevated text-text-muted hover:text-text-secondary'}`}>
            {t(tabItem.labelKey as any)}{counts[tabItem.key] ? `（${counts[tabItem.key]}）` : ''}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-text-muted">{t('facts.library.loading' as any)}</p>}
      {!loading && rows.length === 0 && (
        <p className="text-sm text-text-muted py-8 text-center">{t('facts.library.empty' as any, { tab: t(STATUS_TABS.find(tabItem => tabItem.key === tab)?.labelKey ?? '' as any) } as any)}</p>
      )}

      <div className="space-y-2">
        {rows.map(f => {
          const spec = getFactPredicate(f.predicate)
          return (
            <div key={f.id} className="flex items-start gap-3 p-3 bg-bg-elevated rounded-lg border border-border">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary">
                  <span className="font-medium">{f.subjectName}</span>
                  <span className="text-text-muted"> · {spec?.label ?? f.predicate}：</span>
                  <span>{f.value}</span>
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-bg-base text-text-muted">{t(STATUS_LABEL_KEY[f.status] as any)}</span>
                  {f.locked && <span className="ml-2 text-[10px] text-amber-400">{t('facts.library.locked' as any)}</span>}
                </p>
                {STATUS_HINT_KEY[f.status] && <p className="text-xs text-amber-300/90 mt-1">{t(STATUS_HINT_KEY[f.status]! as any)}</p>}
                {f.sourceQuote && <p className="text-xs text-text-muted mt-1 truncate">{t('facts.library.evidence' as any, { quote: f.sourceQuote } as any)}</p>}
              </div>
              {(['candidate', ...EXCEPTION_STATUSES] as FactStatus[]).includes(f.status) && f.id != null && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => void confirmFact(project.id!, f.id!)} title={t('facts.library.confirmAria' as any)}
                    className="p-1.5 text-emerald-400 hover:bg-emerald-500/15 rounded">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => void rejectFact(project.id!, f.id!)} title={t('facts.library.rejectAria' as any)}
                    className="p-1.5 text-rose-400 hover:bg-rose-500/15 rounded">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
