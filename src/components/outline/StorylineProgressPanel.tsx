import { useEffect, useMemo, useState } from 'react'
import { useDomainT, type DomainTFunction } from '../../i18n'
import { Check, Loader2, Network, RefreshCw, Sparkles } from 'lucide-react'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { useStorylineProgressStore } from '../../stores/storyline-progress'
import type { Chapter, StoryArc } from '../../lib/types'
import { parseStages } from '../../lib/types'
import { db } from '../../lib/db/schema'
import { htmlToPlainText } from '../../lib/utils/html'
import { resolveCanonicalChapterSequence } from '../../lib/ai/chapter-memory/canonical-chapter-sequence'
import {
  acceptNewStorylineCandidate,
  acceptStorylineCrossingCandidate,
  acceptStorylineProgressCandidate,
  buildStorylineProgressPrompt,
  parseStorylineProgressResult,
  type NewStorylineCandidate,
  type StorylineAnalysisCandidates,
  type StorylineCrossingCandidate,
  type StorylineProgressCandidate,
} from '../../lib/storyline/storyline-progress'

const EMPTY: StorylineAnalysisCandidates = { progress: [], crossings: [], newArcs: [] }

function getStatusLabels(t: DomainTFunction): Record<string, string> {
  return {
    dormant: t('storylineProgress.status.dormant'),
    active: t('storylineProgress.status.active'),
    climax: t('storylineProgress.status.climax'),
    resolved: t('storylineProgress.status.resolved'),
    abandoned: t('storylineProgress.status.abandoned'),
  }
}

export default function StorylineProgressPanel(props: {
  projectId: number
  arcs: StoryArc[]
  onArcsChanged: () => Promise<void>
}) {
  const { t } = useDomainT('outline')
  const statusLabels = useMemo(() => getStatusLabels(t), [t])
  const { progress, crossings, loadAll } = useStorylineProgressStore()
  const ai = useAIStream(createAISessionKey(props.projectId, 'storyline-progress.map'))
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [chapterId, setChapterId] = useState<number | null>(null)
  const [candidates, setCandidates] = useState<StorylineAnalysisCandidates>(EMPTY)
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState('')
  const arcVersion = props.arcs.map(arc => `${arc.id}:${arc.updatedAt}`).join('|')

  useEffect(() => {
    void Promise.all([
      loadAll(props.projectId),
      Promise.all([
        db.chapters.where('projectId').equals(props.projectId).toArray(),
        db.outlineNodes.where('projectId').equals(props.projectId).toArray(),
      ]).then(([chapterRows, outlineNodes]) => {
        const { sequence } = resolveCanonicalChapterSequence(outlineNodes, chapterRows)
        const written = sequence
          .map(entry => entry.chapter)
          .filter(row => htmlToPlainText(row.content || '').trim())
        setChapters(written)
        setChapterId(current => current != null && written.some(row => row.id === current)
          ? current
          : written[written.length - 1]?.id ?? null)
      }),
    ])
  }, [props.projectId, loadAll, arcVersion])

  const selectedChapter = chapters.find(row => row.id === chapterId) ?? null
  const arcsById = useMemo(
    () => new Map(props.arcs.filter(arc => arc.id != null).map(arc => [arc.id!, arc])),
    [props.arcs],
  )

  const analyze = async () => {
    if (!selectedChapter) return
    setActionError('')
    setAccepted(new Set())
    const content = htmlToPlainText(selectedChapter.content || '').trim()
    const raw = await ai.start(
      buildStorylineProgressPrompt({
        chapterTitle: selectedChapter.title,
        chapterContent: content,
        arcs: props.arcs,
      }),
      undefined,
      { category: 'storyline-progress.map', projectId: props.projectId, outputKind: 'functional-structured' },
    )
    if (!raw) return
    setCandidates(parseStorylineProgressResult({ raw, chapterContent: content, arcs: props.arcs }))
  }

  const markAccepted = (key: string) => setAccepted(current => new Set(current).add(key))

  const acceptProgress = async (candidate: StorylineProgressCandidate) => {
    if (!selectedChapter?.id) return
    try {
      setActionError('')
      await acceptStorylineProgressCandidate({
        projectId: props.projectId,
        chapterId: selectedChapter.id,
        candidate,
      })
      markAccepted(`p:${candidate.arcId}`)
      await loadAll(props.projectId)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  const acceptCrossing = async (candidate: StorylineCrossingCandidate) => {
    if (!selectedChapter?.id) return
    try {
      setActionError('')
      await acceptStorylineCrossingCandidate({
        projectId: props.projectId,
        chapterId: selectedChapter.id,
        candidate,
      })
      markAccepted(`c:${candidate.arcIdA}:${candidate.arcIdB}`)
      await loadAll(props.projectId)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  const acceptNewArc = async (candidate: NewStorylineCandidate) => {
    try {
      setActionError('')
      await acceptNewStorylineCandidate({ projectId: props.projectId, candidate })
      markAccepted(`n:${candidate.name}`)
      await props.onArcsChanged()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  const hasCandidates = candidates.progress.length + candidates.crossings.length + candidates.newArcs.length > 0

  return (
    <section className="mt-6 space-y-4" aria-label={t('storylineProgress.heading')}>
      <div className="bg-bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Network className="w-4 h-4 text-accent" /> {t('storylineProgress.heading')}
            </h3>
            <p className="text-xs text-text-muted mt-1">{t('storylineProgress.subtitle')}</p>
          </div>
          <span className="text-[11px] text-text-muted">{t('storylineProgress.confirmedCounts', { progress: progress.length, crossings: crossings.length })}</span>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <select
            aria-label={t('storylineProgress.selectChapterAria')}
            value={chapterId ?? ''}
            onChange={event => setChapterId(event.target.value ? Number(event.target.value) : null)}
            className="px-3 py-2 bg-bg-base border border-border rounded-lg text-sm text-text-primary"
          >
            <option value="">{t('storylineProgress.selectChapterPlaceholder')}</option>
            {chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
          </select>
          <button
            onClick={analyze}
            disabled={!selectedChapter || !props.arcs.length || ai.isStreaming}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm disabled:opacity-50"
          >
            {ai.isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {t('storylineProgress.mapChapter')}
          </button>
        </div>
        {!props.arcs.length && <p className="text-xs text-warning mt-2">{t('storylineProgress.registerArcFirst')}</p>}
        {!chapters.length && <p className="text-xs text-text-muted mt-2">{t('storylineProgress.saveContentFirst')}</p>}
        {(ai.error || actionError) && <p role="alert" className="text-xs text-error mt-2">{actionError || ai.error}</p>}
      </div>

      {progress.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {progress.map(row => {
            const arc = arcsById.get(row.arcId)
            const stage = arc ? parseStages(arc.stages).find(item => item.id === row.currentStageId) : null
            return (
              <div key={row.id} className="bg-bg-surface border border-border rounded-lg p-3">
                <div className="flex justify-between gap-2">
                  <strong className="text-sm text-text-primary">{arc?.name ?? `#${row.arcId}`}</strong>
                  <span className="text-xs text-accent">{statusLabels[row.status]}</span>
                </div>
                {stage && <p className="text-xs text-text-secondary mt-1">{t('storylineProgress.stagePrefix')} {stage.title}</p>}
                <p className="text-xs text-text-muted mt-1">{row.progressNote}</p>
                {row.lastActiveChapterTitle && <p className="text-[11px] text-text-muted mt-2">{t('storylineProgress.lastActivePrefix')} {row.lastActiveChapterTitle}</p>}
              </div>
            )
          })}
        </div>
      )}

      {crossings.length > 0 && (
        <div className="bg-bg-surface border border-border rounded-xl p-4">
          <h4 className="text-sm font-medium text-text-primary mb-3">{t('storylineProgress.confirmedCrossingsHeading')}</h4>
          <div className="space-y-2">
            {crossings.slice(-12).reverse().map(row => (
              <div key={row.id} className="flex items-start gap-2 text-xs">
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                  {arcsById.get(row.arcIdA)?.name ?? `#${row.arcIdA}`}
                  {' × '}
                  {arcsById.get(row.arcIdB)?.name ?? `#${row.arcIdB}`}
                </span>
                <p className="text-text-secondary">
                  {row.note}
                  {row.chapterTitle && <span className="text-text-muted"> · {row.chapterTitle}</span>}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(hasCandidates || ai.output) && (
        <div className="bg-bg-surface border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-text-primary">{t('storylineProgress.candidatesHeading')}</h4>
            <button onClick={() => { setCandidates(EMPTY); ai.reset() }} className="text-xs text-text-muted flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> {t('storylineProgress.clearCandidates')}
            </button>
          </div>
          {!hasCandidates && !ai.isStreaming && <p className="text-xs text-text-muted">{t('storylineProgress.noCandidates')}</p>}
          {candidates.progress.map(item => (
            <CandidateCard
              t={t}
              key={`p:${item.arcId}`}
              title={t('storylineProgress.progressCandidateTitle', { name: arcsById.get(item.arcId)?.name ?? String(item.arcId) })}
              text={`${statusLabels[item.status]} · ${item.progressNote}`}
              quote={item.evidenceQuote ?? ''}
              accepted={accepted.has(`p:${item.arcId}`)}
              onAccept={() => acceptProgress(item)}
            />
          ))}
          {candidates.crossings.map(item => (
            <CandidateCard
              t={t}
              key={`c:${item.arcIdA}:${item.arcIdB}`}
              title={t('storylineProgress.crossingCandidateTitle', { arcA: arcsById.get(item.arcIdA)?.name ?? String(item.arcIdA), arcB: arcsById.get(item.arcIdB)?.name ?? String(item.arcIdB) })}
              text={item.note}
              quote={item.evidenceQuote ?? ''}
              accepted={accepted.has(`c:${item.arcIdA}:${item.arcIdB}`)}
              onAccept={() => acceptCrossing(item)}
            />
          ))}
          {candidates.newArcs.map(item => (
            <CandidateCard
              t={t}
              key={`n:${item.name}`}
              title={t('storylineProgress.newArcCandidateTitle', { name: String(item.name) })}
              text={`${item.arcType === 'main' ? t('storylineProgress.newArcMain') : t('storylineProgress.newArcSub')} · ${item.description}`}
              quote={item.evidenceQuote ?? ''}
              accepted={accepted.has(`n:${item.name}`)}
              onAccept={() => acceptNewArc(item)}
              acceptLabel={t('storylineProgress.createRegister')}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function CandidateCard({ t, ...props }: {
  t: DomainTFunction
  title: string
  text: string
  quote: string
  accepted: boolean
  onAccept: () => void
  acceptLabel?: string
}) {
  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text-primary">{props.title}</p>
          <p className="text-xs text-text-secondary mt-1">{props.text}</p>
          {props.quote && <p className="text-[11px] text-text-muted mt-2">{props.quote}</p>}
        </div>
        <button
          onClick={props.onAccept}
          disabled={props.accepted}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs bg-accent/10 text-accent rounded disabled:opacity-60"
        >
          <Check className="w-3.5 h-3.5" /> {props.accepted ? t('storylineProgress.accepted') : props.acceptLabel ?? t('storylineProgress.accept')}
        </button>
      </div>
    </div>
  )
}
