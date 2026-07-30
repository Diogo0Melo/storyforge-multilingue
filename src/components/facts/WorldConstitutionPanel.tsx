import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Landmark, Loader2, ScanSearch, X } from 'lucide-react'
import type { FactStatus, Project } from '../../lib/types'
import { db } from '../../lib/db/schema'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { useFactLedgerStore } from '../../stores/fact-ledger'
import { getFactPredicate, isConstitutionPredicate } from '../../lib/registry/fact-predicate-registry'
import {
  buildSettingAssertionExtractPrompt,
  listSettingAssertionSources,
  parseSettingAssertionCandidates,
} from '../../lib/fact-ledger/setting-assertions'

type ConstitutionTab = 'candidate' | 'confirmed' | 'exceptions' | 'rejected'
const EXCEPTIONS: FactStatus[] = ['stale', 'source-missing', 'invalid-range']

const TAB_LABEL_KEY: Record<ConstitutionTab, string> = {
  candidate: 'facts.tab.candidate',
  confirmed: 'facts.tab.confirmed',
  exceptions: 'facts.tab.exceptions',
  rejected: 'facts.tab.rejected',
}

export default function WorldConstitutionPanel({ project, onShowFacts }: {
  project: Project
  onShowFacts: () => void
}) {
  const { t } = useTranslation('panels')
  const {
    facts, loading, load, adoptSetting, confirmFact, replaceConstitutionFact, rejectFact,
  } = useFactLedgerStore()
  const ai = useAIStream(createAISessionKey(project.id!, 'canon.setting.extract'))
  const [tab, setTab] = useState<ConstitutionTab>('candidate')
  const [message, setMessage] = useState('')
  const [replacementCandidateId, setReplacementCandidateId] = useState<number | null>(null)

  useEffect(() => {
    if (project.id != null) void load(project.id)
  }, [load, project.id])

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
    if (project.id == null) return
    setMessage('')
    const [sources, worldGroups, characters] = await Promise.all([
      listSettingAssertionSources(project.id),
      db.worldGroups.where('projectId').equals(project.id).toArray(),
      db.characters.where('projectId').equals(project.id).toArray(),
    ])
    if (!sources.length) {
      setMessage(t('facts.constitution.noFields' as any))
      return
    }
    const subjects = {
      worldGroups: worldGroups.length
        ? worldGroups.map(item => ({ id: item.id!, name: item.name }))
        : [{ id: null, name: '默认世界' }],
      characters: characters
        .filter(item => item.id != null)
        .map(item => ({
          id: item.id!,
          name: item.name,
          worldGroupId: item.homeWorldGroupId ?? null,
        })),
    }
    try {
      const raw = await ai.start([
        {
          role: 'system',
          content: '你是设定断言抽取器。严格遵守闭集、逐字证据和 JSON 输出要求，不补写用户未提供的设定。',
        },
        { role: 'user', content: buildSettingAssertionExtractPrompt(sources, subjects) },
      ], undefined, { category: 'canon.setting.extract', projectId: project.id })
      const candidates = parseSettingAssertionCandidates(raw, sources, subjects)
      const result = await adoptSetting({
        projectId: project.id,
        candidates,
        sources,
        subjects,
      })
      setTab('candidate')
      setMessage(t('facts.constitution.scanResult' as any, { sources: sources.length, candidates: candidates.length, written: result.written, skipped: result.skipped } as any))
    } catch (error) {
      setMessage(t('facts.constitution.scanFailed' as any, { error: error instanceof Error ? error.message : String(error) } as any))
    }
  }

  const handleConfirm = async (factId: number) => {
    const result = await confirmFact(project.id!, factId)
    if (result.confirmed) {
      setReplacementCandidateId(null)
      setMessage(t('facts.constitution.confirmed' as any))
      return
    }
    if (result.clashes.length) {
      setReplacementCandidateId(factId)
      const values = result.clashes.map(item => `"${item.confirmed.value}"`).join('、')
      setMessage(t('facts.constitution.blockedClash' as any, { values } as any))
      return
    }
    if (result.reason === 'source-stale' || result.reason === 'source-missing') {
      setMessage(result.reason === 'source-stale'
        ? t('facts.constitution.blockedStale' as any)
        : t('facts.constitution.blockedMissing' as any))
      return
    }
    setMessage(t('facts.constitution.cannotConfirm' as any))
  }

  const handleExplicitReplacement = async () => {
    if (replacementCandidateId == null) return
    const result = await replaceConstitutionFact(project.id!, replacementCandidateId)
    if (result.confirmed) {
      setMessage(t('facts.constitution.replaced' as any, { count: result.replaced } as any))
      setReplacementCandidateId(null)
    } else if (result.reason === 'locked-conflict') {
      setMessage(t('facts.constitution.lockedCannotReplace' as any))
    } else {
      setMessage(t('facts.constitution.replaceFailed' as any))
      setReplacementCandidateId(null)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-amber-400" />
          <h1 className="text-lg font-bold text-text-primary">{t('facts.constitution.title' as any)}</h1>
        </div>
        <button onClick={onShowFacts}
          className="px-3 py-1.5 text-xs rounded-md bg-bg-elevated text-text-secondary hover:text-text-primary">
          {t('facts.constitution.viewFacts' as any)}
        </button>
      </div>
      <p className="text-xs text-text-muted mb-4">
        {t('facts.constitution.desc' as any)}
      </p>

      <div className="mb-4 p-3 rounded-lg border border-border bg-bg-elevated/60">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => void extractFromSettings()} disabled={ai.isStreaming}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500/15 text-xs text-amber-300 hover:bg-amber-500/25 disabled:opacity-50">
            {ai.isStreaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanSearch className="w-3.5 h-3.5" />}
            {ai.isStreaming ? t('facts.constitution.scanning' as any) : t('facts.constitution.scanNow' as any)}
          </button>
          {message && <span className="text-[11px] text-text-muted">{message}</span>}
        </div>
        {replacementCandidateId != null && (
          <button onClick={() => void handleExplicitReplacement()}
            className="mt-2 px-3 py-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 text-xs text-rose-300 hover:bg-rose-500/20">
            {t('facts.constitution.replaceOld' as any)}
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {(Object.keys(TAB_LABEL_KEY) as ConstitutionTab[]).map(key => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-3 py-1.5 text-xs rounded-md ${tab === key ? 'bg-amber-500/20 text-amber-300' : 'bg-bg-elevated text-text-muted hover:text-text-secondary'}`}>
            {t(TAB_LABEL_KEY[key] as any)}{counts[key] ? `（${counts[key]}）` : ''}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-text-muted">{t('facts.library.loading' as any)}</p>}
      {!loading && rows.length === 0 && (
        <p className="text-sm text-text-muted py-8 text-center">{t('facts.constitution.empty' as any, { tab: t(TAB_LABEL_KEY[tab] as any) } as any)}</p>
      )}
      <div className="space-y-2">
        {rows.map(fact => (
          <div key={fact.id} className="flex items-start gap-3 p-3 bg-bg-elevated rounded-lg border border-border">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary">
                <span className="font-medium">{fact.subjectName}</span>
                <span className="text-text-muted"> · {getFactPredicate(fact.predicate)?.label ?? fact.predicate}：</span>
                <span>{fact.value}</span>
              </p>
              <p className="text-[11px] text-text-muted mt-1">
                {t('facts.constitution.source' as any, { table: fact.sourceRecordTable ?? t('facts.constitution.unknown' as any), field: fact.sourceField ?? t('facts.constitution.unknownField' as any) } as any)}
                {fact.sourceQuote ? t('facts.constitution.evidence' as any, { quote: fact.sourceQuote } as any) : ''}
              </p>
            </div>
            {(['candidate', ...EXCEPTIONS] as FactStatus[]).includes(fact.status) && fact.id != null && (
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => void handleConfirm(fact.id!)} title={t('facts.constitution.confirmAria' as any)}
                  className="p-1.5 text-emerald-400 hover:bg-emerald-500/15 rounded">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => void rejectFact(project.id!, fact.id!)} title={t('facts.constitution.rejectAria' as any)}
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
