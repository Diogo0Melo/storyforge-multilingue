/**
 * NS-4 · 事实库面板 — 审阅事实账本候选、确认升 Canon / 否决。
 * 所有变更走 useFactLedgerStore（→ lib/fact-ledger 单一入口），面板不裸写 db。
 */
import { useEffect, useMemo, useState } from 'react'
import { Check, X, Database, Download, Upload } from 'lucide-react'
import type { Project } from '../../lib/types'
import { useDomainT } from '../../i18n'
import { useFactLedgerStore } from '../../stores/fact-ledger'
import { getFactPredicate, getFactPredicateLabelKey } from '../../lib/registry/fact-predicate-registry'
import type { FactStatus } from '../../lib/types/temporal-fact'
import { exportFactMemoryMarkdown } from '../../lib/fact-ledger/human-readable-io'
import KnowledgeLedgerPanel from './KnowledgeLedgerPanel'
import WorldConstitutionPanel from './WorldConstitutionPanel'
import {
  INITIAL_RECORD_TARGET_CLASS,
  initialRecordTargetAttributes,
  useInitialRecordTarget,
} from '../shared/initial-record-target'

type FactTab = FactStatus | 'exceptions'

const STATUS_TAB_KEYS = {
  exceptions: 'library.tabExceptions' as const,
  candidate: 'library.tabCandidate' as const,
  confirmed: 'library.tabConfirmed' as const,
  superseded: 'library.tabSuperseded' as const,
  rejected: 'library.tabRejected' as const,
} satisfies Partial<Record<FactTab, string>>

const EXCEPTION_STATUSES: FactStatus[] = ['stale', 'source-missing', 'invalid-range']

const STATUS_LABEL_KEYS = {
  candidate: 'status.candidate' as const,
  confirmed: 'status.confirmed' as const,
  superseded: 'status.superseded' as const,
  rejected: 'status.rejected' as const,
  stale: 'status.stale' as const,
  'source-missing': 'status.sourceMissing' as const,
  'invalid-range': 'status.invalidRange' as const,
} satisfies Record<FactStatus, string>

const STATUS_HINT_KEYS = {
  stale: 'statusHint.stale' as const,
  'source-missing': 'statusHint.sourceMissing' as const,
  'invalid-range': 'statusHint.invalidRange' as const,
} satisfies Partial<Record<FactStatus, string>>

export default function FactLibraryPanel({
  project,
  initialFactId,
}: {
  project: Project
  initialFactId?: number | null
}) {
  const { t } = useDomainT('facts')
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
  const targetFact = useMemo(
    () => facts.find(fact => fact.id === initialFactId) ?? null,
    [facts, initialFactId],
  )

  useEffect(() => {
    if (!targetFact) return
    setLibraryMode('facts')
    setTab(EXCEPTION_STATUSES.includes(targetFact.status) ? 'exceptions' : targetFact.status)
  }, [targetFact])
  useInitialRecordTarget(
    initialFactId,
    libraryMode === 'facts' && rows.some(fact => fact.id === initialFactId),
  )

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
    setIoMsg(t('library.exportSuccessMsg'))
  }

  const handleImportDiff = async () => {
    if (project.id == null || !diffText.trim()) return
    try {
      const raw = JSON.parse(diffText)
      const result = await importCandidateDiff(project.id, raw)
      setIoMsg(t('library.importSuccessMsg', {
        written: result.written,
        skippedDuplicate: result.skippedDuplicate,
        skippedInvalid: result.skippedInvalid,
      }))
      if (result.written > 0) setDiffText('')
    } catch (err) {
      setIoMsg(t('library.importFailedMsg', { message: err instanceof Error ? err.message : String(err) }))
    }
  }

  if (libraryMode === 'knowledge') {
    return <KnowledgeLedgerPanel project={project} onShowFacts={() => setLibraryMode('facts')} />
  }
  if (libraryMode === 'constitution') {
    return <WorldConstitutionPanel project={project} onShowFacts={() => setLibraryMode('facts')} />
  }

  const tabKeys = Object.keys(STATUS_TAB_KEYS) as FactTab[]

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-sky-400" />
          <h1 className="text-lg font-bold text-text-primary">{t('library.title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setLibraryMode('constitution')}
            className="px-3 py-1.5 text-xs rounded-md bg-amber-500/10 text-amber-300 hover:bg-amber-500/20">
            {t('library.viewConstitutionButton')}
          </button>
          <button onClick={() => setLibraryMode('knowledge')}
            className="px-3 py-1.5 text-xs rounded-md bg-violet-500/10 text-violet-300 hover:bg-violet-500/20">
            {t('library.viewKnowledgeButton')}
          </button>
        </div>
      </div>
      <p className="text-xs text-text-muted mb-4">
        {t('library.subtitle')}
      </p>

      <div className="mb-4 p-3 rounded-lg border border-border bg-bg-elevated/60">
        <div className="flex flex-wrap gap-2 items-center mb-2">
          <button onClick={() => void handleExport()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-bg-base text-xs text-text-secondary hover:text-text-primary">
            <Download className="w-3.5 h-3.5" /> {t('library.exportMarkdownButton')}
          </button>
          <button onClick={() => void handleImportDiff()} disabled={!diffText.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-500/10 text-xs text-sky-300 hover:bg-sky-500/20 disabled:opacity-40">
            <Upload className="w-3.5 h-3.5" /> {t('library.importDiffButton')}
          </button>
          {ioMsg && <span className="text-[11px] text-text-muted">{ioMsg}</span>}
        </div>
        <textarea value={diffText} onChange={e => setDiffText(e.target.value)}
          placeholder={t('library.diffPlaceholder')}
          className="w-full min-h-[76px] px-3 py-2 text-xs rounded bg-bg-base border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-sky-500" />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {tabKeys.map(key => {
          const labelKey = STATUS_TAB_KEYS[key as keyof typeof STATUS_TAB_KEYS]
          return (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${tab === key ? 'bg-sky-500/20 text-sky-300' : 'bg-bg-elevated text-text-muted hover:text-text-secondary'}`}>
              {t(labelKey)}{counts[key] ? t('library.tabCountSuffix', { count: counts[key] }) : ''}
            </button>
          )
        })}
      </div>

      {loading && <p className="text-sm text-text-muted">{t('library.loading')}</p>}
      {!loading && rows.length === 0 && (() => {
        const tabLabelKey = STATUS_TAB_KEYS[tab as keyof typeof STATUS_TAB_KEYS]
        return (
          <p className="text-sm text-text-muted py-8 text-center">{t('library.emptyState', { tab: t(tabLabelKey) })}</p>
        )
      })()}

      <div className="space-y-2">
        {rows.map(f => {
          const spec = getFactPredicate(f.predicate)
          const predicateLabelKey = getFactPredicateLabelKey(f.predicate)
          return (
            <div
              key={f.id}
              {...initialRecordTargetAttributes(f.id === initialFactId, f.id)}
              className={`flex items-start gap-3 p-3 bg-bg-elevated rounded-lg border border-border ${
                f.id === initialFactId ? INITIAL_RECORD_TARGET_CLASS : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary">
                  <span className="font-medium">{f.subjectName}</span>
                  <span className="text-text-muted"> · {t('library.predicateValueLabel', { label: predicateLabelKey ? t(predicateLabelKey) : (spec?.label ?? f.predicate) })}</span>
                  <span>{f.value}</span>
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-bg-base text-text-muted">{t(STATUS_LABEL_KEYS[f.status])}</span>
                  {f.locked && <span className="ml-2 text-[10px] text-amber-400">{t('library.lockedBadge')}</span>}
                </p>
                {(() => {
                  const hintKey = STATUS_HINT_KEYS[f.status as keyof typeof STATUS_HINT_KEYS]
                  return hintKey ? <p className="text-xs text-amber-300/90 mt-1">{t(hintKey)}</p> : null
                })()}
                {f.sourceQuote && <p className="text-xs text-text-muted mt-1 truncate">{t('library.evidencePrefix', { quote: f.sourceQuote })}</p>}
              </div>
              {(['candidate', ...EXCEPTION_STATUSES] as FactStatus[]).includes(f.status) && f.id != null && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => void confirmFact(project.id!, f.id!)} title={t('library.confirmFactTitle')}
                    className="p-1.5 text-emerald-400 hover:bg-emerald-500/15 rounded">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => void rejectFact(project.id!, f.id!)} title={t('library.rejectFactTitle')}
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
