import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Brain, Check, Plus, X } from 'lucide-react'
import type { KnowledgeAction, KnowledgeEventStatus, Project } from '../../lib/types'
import { useKnowledgeLedgerStore } from '../../stores/knowledge-ledger'
import type { PanelsKeys } from '../../i18n/generated-resources'

const ACTION_LABEL_KEY = {
  learn: 'facts.action.learn',
  mislearn: 'facts.action.mislearn',
  forget: 'facts.action.forget',
  correct: 'facts.action.correct',
} as const satisfies Record<KnowledgeAction, PanelsKeys>

const STATUS_LABEL_KEY = {
  candidate: 'facts.kStatus.candidate',
  confirmed: 'facts.kStatus.confirmed',
  rejected: 'facts.kStatus.rejected',
  'source-missing': 'facts.kStatus.sourceMissing',
  'invalid-range': 'facts.kStatus.invalidRange',
} as const satisfies Record<KnowledgeEventStatus, PanelsKeys>

const REVIEWABLE: KnowledgeEventStatus[] = ['candidate', 'source-missing', 'invalid-range']

export default function KnowledgeLedgerPanel({ project, onShowFacts }: {
  project: Project
  onShowFacts: () => void
}) {
  const { t } = useTranslation('panels')
  const { events, characters, chapters, loading, load, adopt, confirmEvent, rejectEvent } = useKnowledgeLedgerStore()
  const [status, setStatus] = useState<KnowledgeEventStatus>('candidate')
  const [characterId, setCharacterId] = useState('')
  const [knowledgeKey, setKnowledgeKey] = useState('')
  const [statement, setStatement] = useState('')
  const [action, setAction] = useState<KnowledgeAction>('learn')
  const [belief, setBelief] = useState('')
  const [sourceChapterId, setSourceChapterId] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (project.id != null) void load(project.id)
  }, [load, project.id])

  const counts = useMemo(() => {
    const result = new Map<KnowledgeEventStatus, number>()
    for (const event of events) result.set(event.status, (result.get(event.status) ?? 0) + 1)
    return result
  }, [events])
  const rows = events.filter(event => event.status === status)

  const addCandidate = async () => {
    if (project.id == null) return
    const character = characters.find(item => item.id === Number(characterId))
    if (!character || !knowledgeKey.trim() || !statement.trim()) {
      setMessage(t('facts.knowledge.selectCharAndFill'))
      return
    }
    if (action === 'mislearn' && !belief.trim()) {
      setMessage(t('facts.knowledge.mislearnRequiresBelief'))
      return
    }
    const result = await adopt(project.id, [{
      characterId: character.id!,
      characterName: character.name,
      worldGroupId: character.homeWorldGroupId ?? null,
      knowledgeKey: knowledgeKey.trim(),
      statement: statement.trim(),
      action,
      belief: action === 'mislearn' ? belief.trim() : null,
      sourceType: sourceChapterId ? 'chapter' : 'manual',
      sourceChapterId: sourceChapterId ? Number(sourceChapterId) : null,
      sourceQuote: '',
    }])
    setMessage(result.written ? t('facts.knowledge.added') : t('facts.knowledge.notWritten', { count: result.skipped }))
    if (result.written) {
      setKnowledgeKey('')
      setStatement('')
      setBelief('')
      setStatus('candidate')
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-violet-400" />
          <h1 className="text-lg font-bold text-text-primary">{t('facts.knowledge.title')}</h1>
        </div>
        <button onClick={onShowFacts} className="px-3 py-1.5 text-xs rounded-md bg-bg-elevated text-text-secondary hover:text-text-primary">
          {t('facts.knowledge.viewFacts')}
        </button>
      </div>
      <p className="text-xs text-text-muted mb-4">
        {t('facts.knowledge.desc')}
      </p>

      <div className="mb-4 p-3 rounded-lg border border-border bg-bg-elevated/60 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select value={characterId} onChange={event => setCharacterId(event.target.value)}
            className="px-2 py-1.5 text-xs rounded bg-bg-base border border-border text-text-primary">
            <option value="">{t('facts.knowledge.selectCharacter')}</option>
            {characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}
          </select>
          <select value={action} onChange={event => setAction(event.target.value as KnowledgeAction)}
            className="px-2 py-1.5 text-xs rounded bg-bg-base border border-border text-text-primary">
            {(Object.keys(ACTION_LABEL_KEY) as KnowledgeAction[]).map(key =>
              <option key={key} value={key}>{t(ACTION_LABEL_KEY[key])}</option>)}
          </select>
          <select value={sourceChapterId} onChange={event => setSourceChapterId(event.target.value)}
            className="px-2 py-1.5 text-xs rounded bg-bg-base border border-border text-text-primary">
            <option value="">{t('facts.knowledge.baseline')}</option>
            {chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
          </select>
        </div>
        <input value={knowledgeKey} onChange={event => setKnowledgeKey(event.target.value)}
          placeholder={t('facts.knowledge.keyPlaceholder')}
          className="w-full px-2 py-1.5 text-xs rounded bg-bg-base border border-border text-text-primary placeholder:text-text-muted" />
        <textarea value={statement} onChange={event => setStatement(event.target.value)}
          placeholder={t('facts.knowledge.statementPlaceholder')}
          className="w-full min-h-[56px] px-2 py-1.5 text-xs rounded bg-bg-base border border-border text-text-primary placeholder:text-text-muted" />
        {action === 'mislearn' && (
          <textarea value={belief} onChange={event => setBelief(event.target.value)}
            placeholder={t('facts.knowledge.beliefPlaceholder')}
            className="w-full min-h-[48px] px-2 py-1.5 text-xs rounded bg-bg-base border border-border text-text-primary placeholder:text-text-muted" />
        )}
        <div className="flex items-center gap-2">
          <button onClick={() => void addCandidate()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-500/15 text-xs text-violet-300 hover:bg-violet-500/25">
            <Plus className="w-3.5 h-3.5" /> {t('facts.knowledge.addToPending')}
          </button>
          {message && <span className="text-[11px] text-text-muted">{message}</span>}
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {(Object.keys(STATUS_LABEL_KEY) as KnowledgeEventStatus[]).map(key => (
          <button key={key} onClick={() => setStatus(key)}
            className={`px-3 py-1.5 text-xs rounded-md ${status === key ? 'bg-violet-500/20 text-violet-300' : 'bg-bg-elevated text-text-muted hover:text-text-secondary'}`}>
            {t(STATUS_LABEL_KEY[key])}{counts.get(key) ? `（${counts.get(key)}）` : ''}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-text-muted">{t('facts.library.loading')}</p>}
      {!loading && !rows.length && <p className="text-sm text-text-muted py-8 text-center">{t('facts.knowledge.empty', { status: t(STATUS_LABEL_KEY[status]) })}</p>}
      <div className="space-y-2">
        {rows.map(event => (
          <div key={event.id} className="flex items-start gap-3 p-3 bg-bg-elevated rounded-lg border border-border">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary">
                <span className="font-medium">{event.characterName}</span>
                <span className="text-text-muted"> · {t(ACTION_LABEL_KEY[event.action])}：</span>
                <span>{event.statement}</span>
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-bg-base text-text-muted">{event.knowledgeKey}</span>
              </p>
              {event.belief && <p className="text-xs text-amber-300 mt-1">{t('facts.knowledge.actualBelief', { belief: event.belief })}</p>}
              <p className="text-[11px] text-text-muted mt-1">
                {t('facts.knowledge.source', { source: event.sourceChapterId == null ? t('facts.knowledge.sourceBaseline') : chapters.find(chapter => chapter.id === event.sourceChapterId)?.title ?? t('facts.knowledge.sourceChapter', { id: event.sourceChapterId }) })}
              </p>
            </div>
            {REVIEWABLE.includes(event.status) && event.id != null && (
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => void confirmEvent(project.id!, event.id!)} title={t('facts.knowledge.confirmAria')}
                  className="p-1.5 text-emerald-400 hover:bg-emerald-500/15 rounded"><Check className="w-4 h-4" /></button>
                <button onClick={() => void rejectEvent(project.id!, event.id!)} title={t('facts.knowledge.rejectAria')}
                  className="p-1.5 text-rose-400 hover:bg-rose-500/15 rounded"><X className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
