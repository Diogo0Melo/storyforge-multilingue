import { useEffect, useMemo, useState } from 'react'
import { useDomainT, type DomainTFunction } from '../../i18n'
import {
  Check,
  Loader2,
  Network,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useStorylineProgressStore } from '../../stores/storyline-progress'
import type { MasterCopilotController } from '../agent/useMasterCopilot'
import { CTextarea } from '../shared/CompositionInput'
import type { Chapter, StoryArc } from '../../lib/types'
import { parseStages } from '../../lib/types'
import { db } from '../../lib/db/schema'
import { htmlToPlainText } from '../../lib/utils/html'
import { resolveCanonicalChapterSequence } from '../../lib/ai/chapter-memory/canonical-chapter-sequence'
import {
  parseStorylineProgressResult,
  type StorylineAnalysisCandidates,
  type StorylineCrossingCandidate,
  type StorylineProgressCandidate,
  type NewStorylineCandidate,
} from '../../lib/storyline/storyline-progress'
import {
  INITIAL_RECORD_TARGET_CLASS,
  initialRecordTargetAttributes,
  useInitialRecordTarget,
} from '../shared/initial-record-target'
import type { StoryArcInitialRecordTarget } from './StoryArcPanel'

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

function isStorylineProgressCandidate(
  candidate: MasterCopilotController['pendingCandidates'][number],
): boolean {
  // A missing agentId is accepted only for old persisted fixtures. New Master
  // payloads always carry the explicit outline owner, and a different owner
  // never enters this panel.
  return candidate.payload.skillId === 'outline.storyline-progress'
    && (candidate.payload.agentId == null || candidate.payload.agentId === 'outline')
}

function isCandidateUpdateGuarded(status: unknown): boolean {
  return status === 'updating' || status === 'failed'
}

function progressKey(candidate: StorylineProgressCandidate): string {
  return `p:${candidate.arcId}`
}

function crossingKey(candidate: StorylineCrossingCandidate): string {
  return `c:${candidate.arcIdA}:${candidate.arcIdB}`
}

function newArcKey(candidate: NewStorylineCandidate): string {
  return `n:${candidate.name}`
}

export default function StorylineProgressPanel(props: {
  projectId: number
  arcs: StoryArc[]
  copilot: MasterCopilotController
  onArcsChanged: () => Promise<void>
  initialRecordTarget?: StoryArcInitialRecordTarget | null
}) {
  const { t } = useDomainT('outline')
  const statusLabels = useMemo(() => getStatusLabels(t), [t])
  const { progress, crossings, loadAll } = useStorylineProgressStore()
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [chapterId, setChapterId] = useState<number | null>(null)
  const [selectedCandidateKeys, setSelectedCandidateKeys] = useState<Set<string>>(new Set())
  const [accepted, setAccepted] = useState(false)
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

  const pendingCandidate = props.copilot.pendingCandidates.find(isStorylineProgressCandidate) ?? null
  const hasOtherPendingCandidates = props.copilot.pendingCandidates.some(candidate => !isStorylineProgressCandidate(candidate))
  const quarantinedCandidates = props.copilot.quarantinedCandidates ?? []
  const hasQuarantinedCandidates = quarantinedCandidates.length > 0
  const pendingChapterId = pendingCandidate?.payload.storylineProgressChapterId ?? null
  const pendingChapter = chapters.find(row => row.id === pendingChapterId) ?? null

  // Once a durable candidate is recovered, keep the review anchored to the
  // chapter that was frozen into its Master task rather than the last dropdown
  // choice the author happened to make.
  useEffect(() => {
    if (pendingChapterId != null && chapters.some(chapter => chapter.id === pendingChapterId)) {
      setChapterId(pendingChapterId)
    }
  }, [chapters, pendingChapterId])

  const candidates = useMemo<StorylineAnalysisCandidates>(() => {
    if (!pendingCandidate || !pendingChapter) return EMPTY
    return parseStorylineProgressResult({
      raw: pendingCandidate.event.content,
      chapterContent: htmlToPlainText(pendingChapter.content || '').trim(),
      arcs: props.arcs,
    })
  }, [pendingCandidate, pendingChapter, props.arcs])

  const candidateSignature = pendingCandidate
    ? `${pendingCandidate.event.id ?? pendingCandidate.event.sequence}:${pendingCandidate.event.content}`
    : ''
  const candidateKeys = useMemo(() => [
    ...candidates.progress.map(progressKey),
    ...candidates.crossings.map(crossingKey),
    ...candidates.newArcs.map(newArcKey),
  ], [candidates])

  useEffect(() => {
    if (!candidateSignature) {
      setSelectedCandidateKeys(new Set())
      setAccepted(false)
      return
    }
    setSelectedCandidateKeys(current => {
      const valid = new Set(candidateKeys)
      if (current.size === 0 || [...current].some(key => !valid.has(key))) return valid
      return current
    })
    setAccepted(false)
  }, [candidateKeys, candidateSignature])

  const updateStatus = pendingCandidate?.event.id == null
    ? undefined
    : props.copilot.candidateUpdateState?.[pendingCandidate.event.id]
  const candidateGuarded = props.copilot.busy
    || hasQuarantinedCandidates
    || isCandidateUpdateGuarded(updateStatus)
    || (pendingCandidate != null && pendingChapter == null)
    || accepted
  const hasCandidates = candidateKeys.length > 0
  const selectedCount = selectedCandidateKeys.size
  const allSelected = hasCandidates && selectedCount === candidateKeys.length
  const targetId = props.initialRecordTarget?.recordId ?? null
  const targetReady = props.initialRecordTarget?.table === 'storylineProgress'
    ? progress.some(row => row.id === targetId)
    : props.initialRecordTarget?.table === 'storylineCrossings'
      ? crossings.some(row => row.id === targetId)
      : false
  useInitialRecordTarget(targetId, targetReady)

  const selectedDraft = useMemo<StorylineAnalysisCandidates>(() => ({
    progress: candidates.progress.filter(item => selectedCandidateKeys.has(progressKey(item))),
    crossings: candidates.crossings.filter(item => selectedCandidateKeys.has(crossingKey(item))),
    newArcs: candidates.newArcs.filter(item => selectedCandidateKeys.has(newArcKey(item))),
  }), [candidates, selectedCandidateKeys])

  const analyze = async () => {
    if (!selectedChapter) return
    setActionError('')
    setAccepted(false)
    await props.copilot.submitTargetedRequest(
      `映射已写章节“${selectedChapter.title}”如何推进已登记故事线、故事线交汇以及正文中有证据的疑似新线。`,
      {
        id: `storyline-progress-${selectedChapter.id}`,
        agentId: 'outline',
        skillId: 'outline.storyline-progress',
        instruction: `映射章节 ID=${selectedChapter.id}。章节标题=${selectedChapter.title}。`,
        dependsOn: [],
        storylineProgressChapterId: selectedChapter.id!,
      },
    )
  }

  const toggleCandidate = (key: string) => {
    if (candidateGuarded) return
    setSelectedCandidateKeys(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleReject = async () => {
    if (!pendingCandidate || candidateGuarded) return
    try {
      setActionError('')
      const rejected = await props.copilot.rejectCandidate(pendingCandidate)
      if (rejected !== false) {
        setSelectedCandidateKeys(new Set())
        setAccepted(false)
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  const handleAdoptSelected = async () => {
    if (!pendingCandidate || !pendingChapter || candidateGuarded) return
    if (selectedCount === 0) {
      setActionError(t('storylineProgress.selectAtLeastOne'))
      return
    }
    if (pendingCandidate.event.id == null) return
    try {
      setActionError('')
      // Per-card acceptance is a staged selection. The single Master adoption
      // remains the only write path and re-runs its durable scope/evidence
      // checks against exactly the reviewed subset.
      const draft = JSON.stringify(selectedDraft)
      await props.copilot.updateCandidate(pendingCandidate.event.id, draft)
      const adopted = await props.copilot.adoptCandidate({
        ...pendingCandidate,
        event: { ...pendingCandidate.event, content: draft },
      })
      if (adopted === false) return
      setAccepted(true)
      await loadAll(props.projectId)
      await props.onArcsChanged()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

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
            disabled={pendingCandidate != null || props.copilot.busy || hasQuarantinedCandidates}
            onChange={event => setChapterId(event.target.value ? Number(event.target.value) : null)}
            className="px-3 py-2 bg-bg-base border border-border rounded-lg text-sm text-text-primary disabled:opacity-60"
          >
            <option value="">{t('storylineProgress.selectChapterPlaceholder')}</option>
            {chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
          </select>
          <button
            type="button"
            onClick={() => { void analyze() }}
            disabled={!selectedChapter || !props.arcs.length || props.copilot.busy || hasQuarantinedCandidates || props.copilot.pendingCandidates.length > 0}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm disabled:opacity-50"
          >
            {props.copilot.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {t('storylineProgress.mapChapter')}
          </button>
        </div>
        {!props.arcs.length && <p className="text-xs text-warning mt-2">{t('storylineProgress.registerArcFirst')}</p>}
        {!chapters.length && <p className="text-xs text-text-muted mt-2">{t('storylineProgress.saveContentFirst')}</p>}
        {(props.copilot.error || actionError) && <p role="alert" className="text-xs text-error mt-2">{actionError || props.copilot.error}</p>}
      </div>

      {hasOtherPendingCandidates && (
        <p className="rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-secondary">
          {t('storylineProgress.otherPending')}
        </p>
      )}

      {progress.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {progress.map(row => {
            const arc = arcsById.get(row.arcId)
            const stage = arc ? parseStages(arc.stages).find(item => item.id === row.currentStageId) : null
            return (
              <div
                key={row.id}
                {...initialRecordTargetAttributes(
                  props.initialRecordTarget?.table === 'storylineProgress' && row.id === targetId,
                  row.id,
                )}
                className={`bg-bg-surface border border-border rounded-lg p-3 ${
                  props.initialRecordTarget?.table === 'storylineProgress' && row.id === targetId
                    ? INITIAL_RECORD_TARGET_CLASS
                    : ''
                }`}
              >
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
              <div
                key={row.id}
                {...initialRecordTargetAttributes(
                  props.initialRecordTarget?.table === 'storylineCrossings' && row.id === targetId,
                  row.id,
                )}
                className={`flex items-start gap-2 text-xs rounded ${
                  props.initialRecordTarget?.table === 'storylineCrossings' && row.id === targetId
                    ? INITIAL_RECORD_TARGET_CLASS
                    : ''
                }`}
              >
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

      {(hasCandidates || pendingCandidate) && (
        <div className="bg-bg-surface border border-border rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-medium text-text-primary">{t('storylineProgress.candidatesHeading')}</h4>
              {pendingChapter && <p className="mt-1 text-[11px] text-text-muted">{pendingChapter.title}</p>}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={candidateGuarded || !hasCandidates}
                onClick={() => setSelectedCandidateKeys(allSelected ? new Set() : new Set(candidateKeys))}
                className="text-xs text-text-muted flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className="w-3 h-3" />
                {allSelected ? t('storylineProgress.clearSelection') : t('storylineProgress.selectAll')}
              </button>
              {pendingCandidate && (
                <button
                  type="button"
                  onClick={() => { void handleReject() }}
                  disabled={candidateGuarded}
                  className="text-xs text-text-muted flex items-center gap-1 disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" /> {t('storylineProgress.reject')}
                </button>
              )}
              {pendingCandidate && (
                <button
                  type="button"
                  onClick={() => { void handleAdoptSelected() }}
                  disabled={candidateGuarded || !hasCandidates || selectedCount === 0}
                  className="text-xs text-accent flex items-center gap-1 disabled:opacity-50"
                >
                  {props.copilot.busy
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Check className="w-3 h-3" />}
                  {accepted
                    ? t('storylineProgress.accepted')
                    : allSelected
                      ? t('storylineProgress.adoptAll')
                      : t('storylineProgress.adoptSelected', { count: selectedCount })}
                </button>
              )}
            </div>
          </div>

          {pendingCandidate && (
            <>
              <CTextarea
                aria-label={t('storylineProgress.candidateAria')}
                value={pendingCandidate.event.content}
                disabled={props.copilot.busy || hasQuarantinedCandidates || updateStatus === 'updating'}
                onChange={event => {
                  if (pendingCandidate.event.id != null) {
                    void props.copilot.updateCandidate(pendingCandidate.event.id, event.target.value)
                  }
                }}
                className="min-h-40 w-full resize-y font-mono text-xs leading-5"
              />
              {updateStatus === 'updating' && (
                <p role="status" className="flex items-center gap-1.5 text-[11px] text-accent">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('storylineProgress.candidateSaving')}
                </p>
              )}
              {updateStatus === 'failed' && (
                <p role="alert" className="text-[11px] leading-4 text-warning">
                  {t('storylineProgress.candidateSaveFailed')}
                </p>
              )}
              {pendingCandidate.payload.contextEvidence && (
                <details className="border border-border/60 bg-bg-base px-3 py-2 text-[11px] text-text-muted rounded">
                  <summary className="cursor-pointer text-text-secondary">{t('storylineProgress.inputEvidence')}</summary>
                  <p className="mt-2 break-words">
                    {t('storylineProgress.evidenceIncluded', {
                      items: pendingCandidate.payload.contextEvidence.included.join('、') || t('storylineProgress.none'),
                    })}
                  </p>
                  {pendingCandidate.payload.contextEvidence.trimmed.length > 0 && (
                    <p className="mt-1 text-warning">
                      {t('storylineProgress.evidenceTrimmed', { items: pendingCandidate.payload.contextEvidence.trimmed.join('、') })}
                    </p>
                  )}
                </details>
              )}
            </>
          )}

          {!hasCandidates && !props.copilot.busy && (
            <p className="text-xs text-text-muted">{t('storylineProgress.noCandidates')}</p>
          )}
          {pendingCandidate && pendingChapter == null && (
            <p className="text-xs text-warning">{t('storylineProgress.candidateChapterUnavailable')}</p>
          )}

          {candidates.progress.map(item => (
            <CandidateCard
              t={t}
              key={progressKey(item)}
              title={t('storylineProgress.progressCandidateTitle', { name: arcsById.get(item.arcId)?.name ?? String(item.arcId) })}
              text={`${statusLabels[item.status]} · ${item.progressNote}`}
              quote={item.evidenceQuote}
              selected={selectedCandidateKeys.has(progressKey(item))}
              disabled={candidateGuarded}
              onToggle={() => toggleCandidate(progressKey(item))}
            />
          ))}
          {candidates.crossings.map(item => (
            <CandidateCard
              t={t}
              key={crossingKey(item)}
              title={t('storylineProgress.crossingCandidateTitle', {
                arcA: arcsById.get(item.arcIdA)?.name ?? String(item.arcIdA),
                arcB: arcsById.get(item.arcIdB)?.name ?? String(item.arcIdB),
              })}
              text={item.note}
              quote={item.evidenceQuote}
              selected={selectedCandidateKeys.has(crossingKey(item))}
              disabled={candidateGuarded}
              onToggle={() => toggleCandidate(crossingKey(item))}
            />
          ))}
          {candidates.newArcs.map(item => (
            <CandidateCard
              t={t}
              key={newArcKey(item)}
              title={t('storylineProgress.newArcCandidateTitle', { name: String(item.name) })}
              text={`${item.arcType === 'main' ? t('storylineProgress.newArcMain') : t('storylineProgress.newArcSub')} · ${item.description}`}
              quote={item.evidenceQuote}
              selected={selectedCandidateKeys.has(newArcKey(item))}
              disabled={candidateGuarded}
              onToggle={() => toggleCandidate(newArcKey(item))}
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
  selected: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text-primary">{props.title}</p>
          <p className="text-xs text-text-secondary mt-1">{props.text}</p>
          {props.quote && (
            <p className="text-[11px] text-text-muted mt-2">
              {t('storylineProgress.evidencePrefix', { quote: props.quote })}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-pressed={props.selected}
          onClick={props.onToggle}
          disabled={props.disabled}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs bg-accent/10 text-accent rounded disabled:opacity-60"
        >
          <Check className="w-3.5 h-3.5" />
          {props.selected ? t('storylineProgress.selected') : t('storylineProgress.selectForAdoption')}
        </button>
      </div>
    </div>
  )
}
