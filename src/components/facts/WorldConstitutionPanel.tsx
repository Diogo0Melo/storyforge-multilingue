import { useEffect, useMemo, useState } from 'react'
import { Check, Landmark, Loader2, ScanSearch, X } from 'lucide-react'
import type { FactStatus, Project, WorkspaceScope } from '../../lib/types'
import { useAIConfigStore } from '../../stores/ai-config'
import { useDomainT } from '../../i18n'
import { useFactLedgerStore } from '../../stores/fact-ledger'
import { getFactPredicate, getFactPredicateLabelKey, isConstitutionPredicate } from '../../lib/registry/fact-predicate-registry'
import {
  abandonConstitutionExtractionRunV1,
  adoptConstitutionExtractionCandidateV1,
  generateConstitutionExtractionCandidateV1,
  readPendingConstitutionExtractionCandidateV1,
  readRecoverableConstitutionExtractionRunV1,
  rejectConstitutionExtractionCandidateV1,
  type ConstitutionExtractionCandidateV1,
} from '../../lib/agent/run/constitution-extraction-durable'
import { resolveScopeLike } from '../../lib/world-engine/scope'

type ConstitutionTab = 'candidate' | 'confirmed' | 'exceptions' | 'rejected'
const EXCEPTIONS: FactStatus[] = ['stale', 'source-missing', 'invalid-range']

const TAB_LABEL_KEYS = {
  candidate: 'constitution.tabCandidate' as const,
  confirmed: 'constitution.tabConfirmed' as const,
  exceptions: 'constitution.tabExceptions' as const,
  rejected: 'constitution.tabRejected' as const,
} satisfies Record<ConstitutionTab, string>

const ADOPTION_RECOVERY_MESSAGE = '上次扫描批次已确认但尚未完成事实候选写入；请继续原运行完成写入与终验，不会重复调用模型。'

export default function WorldConstitutionPanel({ project, onShowFacts }: {
  project: Project
  onShowFacts: () => void
}) {
  const { t, lang } = useDomainT('facts')
  const {
    facts, loading, load, confirmFact, replaceConstitutionFact, rejectFact,
  } = useFactLedgerStore()
  const aiConfig = useAIConfigStore(state => state.config)
  const [tab, setTab] = useState<ConstitutionTab>('candidate')
  const [message, setMessage] = useState('')
  const [replacementCandidateId, setReplacementCandidateId] = useState<number | null>(null)
  const [scope, setScope] = useState<WorkspaceScope | null>(null)
  const [scanCandidate, setScanCandidate] = useState<ConstitutionExtractionCandidateV1 | null>(null)
  const [scanRunId, setScanRunId] = useState<number | null>(null)
  const [unsafeRunId, setUnsafeRunId] = useState<number | null>(null)
  const [resumeAdoption, setResumeAdoption] = useState(false)
  const [scanBusy, setScanBusy] = useState(false)

  useEffect(() => {
    if (project.id == null) return
    let cancelled = false
    setScope(null)
    setScanCandidate(null)
    setScanRunId(null)
    setUnsafeRunId(null)
    setResumeAdoption(false)
    setMessage('')
    void (async () => {
      const resolved = await resolveScopeLike(project.id!)
      if (cancelled) return
      setScope(resolved)
      await load(project.id!)
      const pending = await readPendingConstitutionExtractionCandidateV1({ scope: resolved })
      if (cancelled) return
      if (pending) {
        setScanCandidate(pending.candidate)
        setScanRunId(pending.snapshot.run.id)
        setMessage(`已恢复待确认扫描批次：${pending.candidate.assertions.length} 条候选，尚未写入事实库。`)
        return
      }
      const recoverable = await readRecoverableConstitutionExtractionRunV1({ scope: resolved })
      if (cancelled || !recoverable) return
      if (recoverable.safeToResume && recoverable.candidate && recoverable.adoptionPending) {
        setScanCandidate(recoverable.candidate)
        setScanRunId(recoverable.snapshot.run.id)
        setResumeAdoption(true)
        setMessage(ADOPTION_RECOVERY_MESSAGE)
      } else if (!recoverable.safeToResume) {
        setUnsafeRunId(recoverable.snapshot.run.id)
        setMessage('上次设定扫描停在模型结果不可判定窗口，系统不会自动重试。请放弃后重新扫描。')
      }
    })().catch(reason => {
      if (!cancelled) setMessage(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { cancelled = true }
  }, [load, project.id, project.activeWorldId, project.activeWorkId])

  const constitutionFacts = useMemo(
    () => facts.filter(fact => isConstitutionPredicate(fact.predicate)),
    [facts],
  )
  const rows = constitutionFacts.filter(fact =>
    tab === 'exceptions' ? EXCEPTIONS.includes(fact.status) : fact.status === tab)
  const counts = useMemo(() => ({
    candidate: constitutionFacts.filter(fact => fact.status === 'candidate').length,
    confirmed: constitutionFacts.filter(fact => fact.status === 'confirmed').length,
    exceptions: constitutionFacts.filter(fact => EXCEPTIONS.includes(fact.status)).length,
    rejected: constitutionFacts.filter(fact => fact.status === 'rejected').length,
  }), [constitutionFacts])

  const extractFromSettings = async () => {
    if (project.id == null || !scope || scanBusy || scanCandidate || unsafeRunId != null) return
    setScanBusy(true)
    setMessage('')
    try {
      const generated = await generateConstitutionExtractionCandidateV1({
        scope,
        aiConfig,
      })
      setScanCandidate(generated.candidate)
      setScanRunId(generated.snapshot.run.id)
      setResumeAdoption(false)
      setMessage(`扫描 ${generated.candidate.sources.length} 个登记来源，得到 ${generated.candidate.assertions.length} 条待批次确认候选；事实库仍为零写入。`)
    } catch (reason) {
      setMessage(`设定扫描失败：${reason instanceof Error ? reason.message : String(reason)}`)
      const pending = await readPendingConstitutionExtractionCandidateV1({ scope }).catch(() => null)
      if (pending) {
        setScanCandidate(pending.candidate)
        setScanRunId(pending.snapshot.run.id)
        setMessage(`已恢复待确认扫描批次：${pending.candidate.assertions.length} 条候选，尚未写入事实库。`)
      } else {
        const recoverable = await readRecoverableConstitutionExtractionRunV1({ scope }).catch(() => null)
        if (recoverable?.safeToResume && recoverable.candidate && recoverable.adoptionPending) {
          setScanCandidate(recoverable.candidate)
          setScanRunId(recoverable.snapshot.run.id)
          setResumeAdoption(true)
          setMessage(ADOPTION_RECOVERY_MESSAGE)
        } else if (recoverable && !recoverable.safeToResume) {
          setUnsafeRunId(recoverable.snapshot.run.id)
        }
      }
    } finally {
      setScanBusy(false)
    }
  }

  const handleAdoptScan = async () => {
    if (!scope || scanRunId == null || !scanCandidate || scanBusy) return
    setScanBusy(true)
    setMessage('')
    try {
      const result = await adoptConstitutionExtractionCandidateV1({ scope, runId: scanRunId })
      await load(project.id!)
      setTab('candidate')
      setScanCandidate(null)
      setScanRunId(null)
      setResumeAdoption(false)
      setMessage(`已原子写入 ${result.written} 条事实候选；它们仍需下方逐条确认后才会成为世界宪法。`)
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason))
      const recoverable = await readRecoverableConstitutionExtractionRunV1({ scope }).catch(() => null)
      if (recoverable?.safeToResume && recoverable.candidate && recoverable.adoptionPending) {
        setScanCandidate(recoverable.candidate)
        setScanRunId(recoverable.snapshot.run.id)
        setResumeAdoption(true)
        setMessage(ADOPTION_RECOVERY_MESSAGE)
      }
    } finally {
      setScanBusy(false)
    }
  }

  const handleRejectScan = async () => {
    if (!scope || scanRunId == null || scanBusy || resumeAdoption) return
    setScanBusy(true)
    try {
      await rejectConstitutionExtractionCandidateV1({ scope, runId: scanRunId })
      setScanCandidate(null)
      setScanRunId(null)
      setMessage('已否决本批扫描候选，事实库没有写入。')
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setScanBusy(false)
    }
  }

  const handleAbandonScan = async () => {
    if (!scope || unsafeRunId == null || scanBusy) return
    setScanBusy(true)
    try {
      await abandonConstitutionExtractionRunV1({ scope, runId: unsafeRunId })
      setUnsafeRunId(null)
      setMessage('已放弃结果不可判定的旧运行，可以重新扫描。')
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setScanBusy(false)
    }
  }

  const handleConfirm = async (factId: number) => {
    const result = await confirmFact(project.id!, factId)
    if (result.confirmed) {
      setReplacementCandidateId(null)
      setMessage(t('constitution.confirmSuccessMsg'))
      return
    }
    if (result.clashes.length) {
      setReplacementCandidateId(factId)
      const values = new Intl.ListFormat(lang, { type: 'conjunction', style: 'short' })
        .format(result.clashes.map(item => `"${item.confirmed.value}"`))
      setMessage(t('constitution.confirmClashMsg', { values }))
      return
    }
    if (result.reason === 'source-stale' || result.reason === 'source-missing') {
      setMessage(result.reason === 'source-stale'
        ? t('constitution.confirmStaleMsg')
        : t('constitution.confirmMissingMsg'))
      return
    }
    setMessage(t('constitution.confirmUnavailableMsg'))
  }

  const handleExplicitReplacement = async () => {
    if (replacementCandidateId == null) return
    const result = await replaceConstitutionFact(project.id!, replacementCandidateId)
    if (result.confirmed) {
      setMessage(t('constitution.replaceSuccessMsg', { count: result.replaced }))
      setReplacementCandidateId(null)
    } else if (result.reason === 'locked-conflict') {
      setMessage(t('constitution.replaceLockedMsg'))
    } else {
      setMessage(t('constitution.replaceFailedMsg'))
      setReplacementCandidateId(null)
    }
  }

  const tabKeys = Object.keys(TAB_LABEL_KEYS) as ConstitutionTab[]

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-amber-400" />
          <h1 className="text-lg font-bold text-text-primary">{t('constitution.title')}</h1>
        </div>
        <button onClick={onShowFacts}
          className="px-3 py-1.5 text-xs rounded-md bg-bg-elevated text-text-secondary hover:text-text-primary">
          {t('constitution.backToFactsButton')}
        </button>
      </div>
      <p className="text-xs text-text-muted mb-4">
        {t('constitution.subtitle')}
      </p>

      <div className="mb-4 p-3 rounded-lg border border-border bg-bg-elevated/60">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => void extractFromSettings()} disabled={scanBusy || !!scanCandidate || unsafeRunId != null || !scope}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500/15 text-xs text-amber-300 hover:bg-amber-500/25 disabled:opacity-50">
            {scanBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanSearch className="w-3.5 h-3.5" />}
            {scanBusy ? t('constitution.scanningButton') : t('constitution.scanButton')}
          </button>
          {unsafeRunId != null && (
            <button onClick={() => void handleAbandonScan()} disabled={scanBusy}
              className="px-3 py-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 text-xs text-rose-300 hover:bg-rose-500/20 disabled:opacity-50">
              放弃不可判定运行
            </button>
          )}
          {message && <span className="text-[11px] text-text-muted">{message}</span>}
        </div>
        {scanCandidate && (
          <div className="mt-3 p-3 rounded-md border border-amber-500/30 bg-amber-500/5">
            <p className="text-xs font-medium text-amber-300">
              扫描批次待确认（{scanCandidate.assertions.length} 条）
            </p>
            <p className="text-[11px] text-text-muted mt-1">
              当前仅保存在可恢复候选中，尚未写入事实库。批次确认后也只会成为“待确认”事实，不会直接成为 Canon。
            </p>
            <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
              {scanCandidate.assertions.length === 0 && (
                <p className="text-xs text-text-muted">本次没有可靠闭集断言，可确认完成空批次或直接否决。</p>
              )}
              {scanCandidate.assertions.map((item, index) => (
                <div key={`${item.sourceKey}:${index}`} className="text-xs text-text-secondary">
                  <span className="text-text-primary">{item.value}</span>
                  <span className="text-text-muted"> · {getFactPredicate(item.predicate)?.label ?? item.predicate} · “{item.quote}”</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button onClick={() => void handleAdoptScan()} disabled={scanBusy}
                className="px-3 py-1.5 rounded-md bg-emerald-500/15 text-xs text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50">
                {resumeAdoption ? '继续已确认写入' : (scanCandidate.assertions.length ? '确认写入事实候选' : '确认完成空批次')}
              </button>
              {!resumeAdoption && (
                <button onClick={() => void handleRejectScan()} disabled={scanBusy}
                  className="px-3 py-1.5 rounded-md bg-rose-500/10 text-xs text-rose-300 hover:bg-rose-500/20 disabled:opacity-50">
                  否决本批扫描
                </button>
              )}
            </div>
          </div>
        )}
        {replacementCandidateId != null && (
          <button onClick={() => void handleExplicitReplacement()}
            className="mt-2 px-3 py-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 text-xs text-rose-300 hover:bg-rose-500/20">
            {t('constitution.replaceExplicitButton')}
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {tabKeys.map(key => {
          const labelKey = TAB_LABEL_KEYS[key]
          return (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-1.5 text-xs rounded-md ${tab === key ? 'bg-amber-500/20 text-amber-300' : 'bg-bg-elevated text-text-muted hover:text-text-secondary'}`}>
              {t(labelKey)}{counts[key] ? t('constitution.tabCountSuffix', { count: counts[key] }) : ''}
            </button>
          )
        })}
      </div>

      {loading && <p className="text-sm text-text-muted">{t('constitution.loading')}</p>}
      {!loading && rows.length === 0 && (() => {
        const emptyLabelKey = TAB_LABEL_KEYS[tab]
        return (
          <p className="text-sm text-text-muted py-8 text-center">{t('constitution.emptyState', { tab: t(emptyLabelKey) })}</p>
        )
      })()}
      <div className="space-y-2">
        {rows.map(fact => (
          <div key={fact.id} className="flex items-start gap-3 p-3 bg-bg-elevated rounded-lg border border-border">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary">
                <span className="font-medium">{fact.subjectName}</span>
                <span className="text-text-muted"> · {t('constitution.predicateValueLabel', { label: getFactPredicateLabelKey(fact.predicate) ? t(getFactPredicateLabelKey(fact.predicate)!) : (getFactPredicate(fact.predicate)?.label ?? fact.predicate) })}</span>
                <span>{fact.value}</span>
              </p>
              <p className="text-[11px] text-text-muted mt-1">
                {t('constitution.sourcePrefix')}{fact.sourceRecordTable ?? t('constitution.sourceUnknownTable')}.{fact.sourceField ?? t('constitution.sourceUnknownField')}
                {fact.sourceQuote ? ` · ${t('constitution.evidencePrefix', { quote: fact.sourceQuote })}` : ''}
              </p>
            </div>
            {(['candidate', ...EXCEPTIONS] as FactStatus[]).includes(fact.status) && fact.id != null && (
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => void handleConfirm(fact.id!)} title={t('constitution.confirmTitle')}
                  className="p-1.5 text-emerald-400 hover:bg-emerald-500/15 rounded">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => void rejectFact(project.id!, fact.id!)} title={t('constitution.rejectTitle')}
                  className="p-1.5 text-rose-400 hover:bg-rose-500/15 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
