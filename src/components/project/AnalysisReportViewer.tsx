/**
 * Phase 28.2 — Structured analysis report viewer
 *
 * Replaces the former ChunkAnalysisViewer, adding:
 *  · Top TOC navigation (grouped by dimension + anchor jump)
 *  · Merged view (deduplicated per-dimension) + chunk view (raw per-chunk)
 *  · Character merge cards
 *  · Full-book AI summary display
 *  · Per-item chunk source label
 */
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import {
  AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, RotateCcw, Sparkles,
  Users2, X,
} from 'lucide-react'
import type { Reference, ReferenceAnalysisRun, ReferenceChunkAnalysis, AnalysisDimension } from '../../lib/types'
import { DIMENSION_LABELS, DIMENSION_LABEL_KEYS } from '../../lib/types/reference'
import {
  mergeAnalysisResults,
  collectCharacterCraftTexts,
  type MergedAnalysisResult, type MergedDimension, type AIMergedCharacter,
} from '../../lib/reference-analysis/merge-analysis'
import { useAIConfigStore } from '../../stores/ai-config'
import { useToast } from '../shared/Toast'
import { useDomainT } from '../../i18n'
import type { ReferenceDerivedModeV1 } from '../../lib/reference-analysis/derived-agent-baseline'
import { useReferenceDerivedAI, type ReferenceDerivedLaneState } from './useReferenceDerivedAI'

const DIM_COLORS: Partial<Record<AnalysisDimension, string>> = {
  narrativeStyle:     'text-blue-400',
  openingTechnique:   'text-amber-400',
  plotStructure:      'text-green-400',
  pacingControl:      'text-lime-400',
  climaxDesign:       'text-orange-400',
  conflictEscalation: 'text-red-400',
  characterCraft:     'text-purple-400',
  dialogueTechnique:  'text-fuchsia-400',
  proseStyle:         'text-pink-400',
  emotionalBeats:     'text-rose-400',
  foreshadowing:      'text-cyan-400',
  worldBuilding:      'text-teal-400',
  otherTechniques:    'text-slate-400',
  historicalContext:   'text-[#C17D5E]',
  socialInstitutions: 'text-[#B06B7B]',
  dailyLife:          'text-[#7BA08A]',
  materialCulture:    'text-[#B08B6B]',
  languageCustoms:    'text-[#8B7BB0]',
}

interface Props {
  reference: Reference
  run: ReferenceAnalysisRun
  chunks: ReferenceChunkAnalysis[]
  isHistorical: boolean
}

export default function AnalysisReportViewer({ reference, run, chunks, isHistorical }: Props) {
  const { t } = useDomainT('project')
  const toast = useToast()
  const aiConfig = useAIConfigStore(state => state.config)
  const [view, setView] = useState<'merged' | 'chunks'>('merged')
  const [activeDim, setActiveDim] = useState<string | null>(null)
  const [summaryJSON, setSummaryJSON] = useState(run.analysisSummary)
  const [charactersJSON, setCharactersJSON] = useState(run.mergedCharacters)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleCommitted = useCallback((mode: ReferenceDerivedModeV1, resultJson: string) => {
    if (mode === 'summary') setSummaryJSON(resultJson)
    else setCharactersJSON(resultJson)
  }, [])
  const derivedAI = useReferenceDerivedAI({
    projectId: reference.projectId,
    analysisRunId: run.id!,
    aiConfig,
    onCommitted: handleCommitted,
    onError: toast.error,
  })

  useEffect(() => {
    setSummaryJSON(run.analysisSummary)
    setCharactersJSON(run.mergedCharacters)
  }, [run.id, run.analysisSummary, run.mergedCharacters])

  // Merge analysis results (dimensions deduped locally; characters aggregated by AI below)
  const merged = useMemo(
    () => mergeAnalysisResults(chunks, isHistorical),
    [chunks, isHistorical],
  )

  // Parse existing AI character aggregation result
  const aiCharacters = useMemo<AIMergedCharacter[]>(() => {
    if (!charactersJSON) return []
    try {
      const arr = JSON.parse(charactersJSON)
      return Array.isArray(arr) ? arr : []
    } catch { return [] }
  }, [charactersJSON])

  // Whether there are character-craft analyses available for AI aggregation
  const hasCharacterCraft = useMemo(
    () => collectCharacterCraftTexts(chunks).length > 0,
    [chunks],
  )

  // Parse existing AI summary
  const summaryMap = useMemo<Record<string, string>>(() => {
    if (!summaryJSON) return {}
    try { return JSON.parse(summaryJSON) } catch { return {} }
  }, [summaryJSON])

  // Scroll to dimension anchor
  const scrollToDim = useCallback((dimId: string) => {
    setActiveDim(dimId)
    const el = document.getElementById(`dim-${dimId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleGenerateSummary = () => derivedAI.run('summary')

  const handleAggregateCharacters = () => derivedAI.run('characters')

  // Non-empty dimensions
  const nonEmptyDims = merged.dimensions.filter(d => d.items.length > 0)

  return (
    <div className="space-y-4" ref={contentRef}>
      {/* Top horizontal TOC nav (moved from left sidebar to free horizontal space for long analyses) */}
      <div className="sticky top-0 z-10 -mx-0.5 px-0.5 py-2 bg-bg-base/85 backdrop-blur-sm border-b border-border flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-text-muted uppercase tracking-wider mr-0.5">{t('analysisReport.tocLabel')}</span>

        {/* Summary section */}
        {Object.keys(summaryMap).length > 0 && (
          <button
            onClick={() => {
              setView('merged')
              const el = document.getElementById('section-summary')
              el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className="px-2 py-1 text-xs rounded-md border border-accent/30 hover:bg-accent/10 text-accent transition-colors whitespace-nowrap"
          >
            📋 {t('analysisReport.fullBookSummary')}
          </button>
        )}

        {/* Character section */}
        {(aiCharacters.length > 0 || hasCharacterCraft) && (
          <button
            onClick={() => {
              setView('merged')
              const el = document.getElementById('section-characters')
              el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className="px-2 py-1 text-xs rounded-md border border-purple-400/30 hover:bg-purple-500/10 text-purple-400 transition-colors whitespace-nowrap"
          >
            👤 {aiCharacters.length > 0
              ? t('analysisReport.characterCardsCount', { count: aiCharacters.length })
              : t('analysisReport.characterCards')}
          </button>
        )}

        {/* Dimension list */}
        {nonEmptyDims.map(d => (
          <button
            key={d.dimension}
            onClick={() => { setView('merged'); scrollToDim(d.dimension) }}
            className={`px-2 py-1 text-xs rounded-md border transition-colors whitespace-nowrap ${
              activeDim === d.dimension
                ? 'bg-accent/10 text-accent border-accent/40'
                : 'border-border/60 hover:bg-bg-hover text-text-muted'
            }`}
          >
            <span className={DIM_COLORS[d.dimension] || ''}>●</span>{' '}
            {d.label}
            <span className="text-text-muted/50 ml-1">({d.items.length})</span>
          </button>
        ))}

        {/* Chunk view entry */}
        <button
          onClick={() => setView('chunks')}
          className={`px-2 py-1 text-xs rounded-md border transition-colors whitespace-nowrap ${
            view === 'chunks' ? 'bg-accent/10 text-accent border-accent/40' : 'border-border/60 hover:bg-bg-hover text-text-muted'
          }`}
        >
          📦 {t('analysisReport.chunkViewButton', { count: merged.totalChunks })}
        </button>
      </div>

      {/* Content area (full width) */}
      <div className="space-y-4">
        {/* View toggle + summary button */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex bg-bg-elevated rounded-lg p-0.5">
            <button
              onClick={() => setView('merged')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                view === 'merged' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {t('analysisReport.mergedView')}
            </button>
            <button
              onClick={() => setView('chunks')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                view === 'chunks' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {t('analysisReport.chunkView')}
            </button>
          </div>

          {view === 'merged' && !summaryJSON && (
            <button
              onClick={handleGenerateSummary}
              disabled={derivedAI.summary.busy || derivedAI.summary.candidate != null || nonEmptyDims.length === 0}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {derivedAI.summary.busy
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Sparkles className="w-3.5 h-3.5" />}
              {derivedAI.summary.busy ? t('analysisReport.generatingSummary') : t('analysisReport.generateSummaryButton')}
            </button>
          )}
        </div>

        <ReferenceDerivedCandidatePanel
          mode="summary"
          lane={derivedAI.summary}
          onAccept={() => derivedAI.accept('summary')}
          onReject={() => derivedAI.reject('summary')}
          onRetry={() => derivedAI.retry('summary')}
          onAbandon={() => derivedAI.abandonUnsafe('summary')}
        />
        <ReferenceDerivedCandidatePanel
          mode="characters"
          lane={derivedAI.characters}
          onAccept={() => derivedAI.accept('characters')}
          onReject={() => derivedAI.reject('characters')}
          onRetry={() => derivedAI.retry('characters')}
          onAbandon={() => derivedAI.abandonUnsafe('characters')}
        />

        {view === 'merged' ? (
          <MergedView
            merged={merged}
            summaryMap={summaryMap}
            aiCharacters={aiCharacters}
            hasCharacterCraft={hasCharacterCraft}
            onAggregate={handleAggregateCharacters}
            aggregating={derivedAI.characters.busy}
            aggregatePending={derivedAI.characters.candidate != null}
          />
        ) : (
          <ChunkListView chunks={chunks} isHistorical={isHistorical} />
        )}
      </div>
    </div>
  )
}

// ── Merged view ────────────────────────────────────────────────────
function ReferenceDerivedCandidatePanel({
  mode,
  lane,
  onAccept,
  onReject,
  onRetry,
  onAbandon,
}: {
  mode: ReferenceDerivedModeV1
  lane: ReferenceDerivedLaneState
  onAccept: () => void
  onReject: () => void
  onRetry: () => void
  onAbandon: () => void
}) {
  const { t, lang } = useDomainT('project')
  if (!lane.candidate && lane.unsafeRunId == null && !lane.message) return null
  const isChinese = lang === 'zh-CN'
  const localizedFallback = (zh: string, pt: string, en: string) => lang === 'pt-BR' ? pt : isChinese ? zh : en
  const label = mode === 'summary'
    ? t('analysisReport.fullBookSummary')
    : t('analysisReport.derivedCharactersLabel', {
        defaultValue: localizedFallback('角色卡聚合', 'Consolidação de fichas', 'Character-card consolidation'),
      })
  let preview: unknown = null
  try { preview = lane.candidate ? JSON.parse(lane.candidate.resultJson) : null } catch { /* verified runner owns parsing */ }

  return (
    <div
      className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-3 space-y-3"
      data-testid={`reference-derived-${mode}-candidate`}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-medium text-text-primary">
          {label}{isChinese ? '' : ' · '}{t('analysisReport.derivedCandidate', {
            defaultValue: localizedFallback('持久候选', 'candidato persistente', 'review candidate'),
          })}
        </h3>
        {lane.candidate && <span className="text-[10px] text-text-muted">Run #{lane.runId}</span>}
      </div>
      {lane.message && <p className="text-xs text-text-muted">{lane.message}</p>}
      {lane.unsafeRunId != null && (
        <div className="flex items-start gap-2 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{t('analysisReport.derivedUnsafe', { defaultValue: localizedFallback(
            '模型结果是否返回无法判定；系统不会自动重试，以免产生双调用。',
            'O resultado do modelo é incerto; a repetição automática foi desativada para evitar uma chamada duplicada.',
            'The model result is uncertain; automatic retry is disabled to avoid a duplicate call.',
          ) })}</span>
        </div>
      )}
      {lane.candidate && mode === 'summary' && Boolean(preview) && typeof preview === 'object' && !Array.isArray(preview) && (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {Object.entries(preview as Record<string, unknown>).map(([key, value]) => (
            <div key={key} className="rounded-lg border border-border/40 bg-bg-surface p-2">
              <div className="text-[10px] text-amber-400 mb-1">{DIMENSION_LABELS[key as AnalysisDimension] ?? key}</div>
              <p className="text-xs text-text-primary whitespace-pre-wrap">{String(value)}</p>
            </div>
          ))}
        </div>
      )}
      {lane.candidate && mode === 'characters' && Array.isArray(preview) && (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {(preview as AIMergedCharacter[]).map(card => <AICharacterCard key={card.name} card={card} />)}
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {lane.unsafeRunId != null && (
          <button
            type="button"
            onClick={onAbandon}
            disabled={lane.busy}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-amber-400/40 text-amber-300 disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" /> {t('analysisReport.abandonUnsafe', { defaultValue: localizedFallback('放弃不可判定运行', 'Abandonar execução incerta', 'Abandon uncertain run') })}
          </button>
        )}
        {lane.candidate && !lane.adoptionPending && (
          <>
            <button
              type="button"
              onClick={onReject}
              disabled={lane.busy}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-border text-text-muted disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" /> {t('analysisReport.rejectCandidate', { defaultValue: localizedFallback('拒绝', 'Rejeitar', 'Reject') })}
            </button>
            <button
              type="button"
              onClick={onRetry}
              disabled={lane.busy}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-border text-text-secondary disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" /> {t('analysisReport.retryCandidate', { defaultValue: localizedFallback('重试', 'Tentar novamente', 'Retry') })}
            </button>
          </>
        )}
        {lane.candidate && (
          <button
            type="button"
            onClick={onAccept}
            disabled={lane.busy}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded bg-accent text-white disabled:opacity-50"
          >
            {lane.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {lane.adoptionPending
              ? t('analysisReport.continueAdoption', { defaultValue: localizedFallback('继续确认', 'Continuar revisão', 'Continue review') })
              : t('analysisReport.adoptCandidate', { defaultValue: localizedFallback('确认写入', 'Adotar', 'Adopt') })}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Merged view ────────────────────────────────────────────────────

function MergedView({
  merged, summaryMap, aiCharacters, hasCharacterCraft, onAggregate, aggregating, aggregatePending,
}: {
  merged: MergedAnalysisResult
  summaryMap: Record<string, string>
  aiCharacters: AIMergedCharacter[]
  hasCharacterCraft: boolean
  onAggregate: () => void
  aggregating: boolean
  aggregatePending: boolean
}) {
  const { t, lang } = useDomainT('project')
  const candidatePendingLabel = lang === 'zh-CN'
    ? '候选待确认'
    : lang === 'pt-BR'
      ? 'Candidato aguardando revisão'
      : 'Candidate awaiting review'
  const hasSummary = Object.keys(summaryMap).length > 0

  return (
    <div className="space-y-4">
      {/* AI full-book summary */}
      {hasSummary && (
        <div id="section-summary" className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-accent flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" />
            {t('analysisReport.aiSummaryHeading')}
          </h3>
          <div className="space-y-2">
            {merged.dimensions
              .filter(d => summaryMap[d.dimension])
              .map(d => (
                <div key={d.dimension} className="rounded-lg bg-bg-surface border border-border/40 p-3">
                  <div className={`text-xs font-medium mb-1 ${DIM_COLORS[d.dimension] || 'text-text-muted'}`}>
                    {d.label}
                  </div>
                  <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                    {summaryMap[d.dimension]}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Character merge cards (AI-consolidated deduplication) */}
      {(aiCharacters.length > 0 || hasCharacterCraft) && (
        <div id="section-characters" className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-purple-400 flex items-center gap-1.5">
              <Users2 className="w-4 h-4" />
              {t('analysisReport.characterAnalysisHeading')}
            </h3>
            {hasCharacterCraft && (
              <button
                onClick={onAggregate}
                disabled={aggregating || aggregatePending}
                className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-purple-400/30 text-purple-400 hover:bg-purple-500/10 transition disabled:opacity-50"
              >
                {aggregating
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('analysisReport.aggregating')}</>
                  : aggregatePending
                    ? <><Sparkles className="w-3.5 h-3.5" /> {t('analysisReport.candidatePending', { defaultValue: candidatePendingLabel })}</>
                    : <><Sparkles className="w-3.5 h-3.5" /> {aiCharacters.length > 0 ? t('analysisReport.reAggregate') : t('analysisReport.aggregateCharacters')}</>}
              </button>
            )}
          </div>
          {aiCharacters.length > 0 ? (
            <div className="grid gap-2">
              {aiCharacters.map(card => (
                <AICharacterCard key={card.name} card={card} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted leading-relaxed rounded-lg border border-dashed border-purple-400/20 bg-bg-surface px-3 py-2.5">
              {t('analysisReport.aggregateHelp')}
            </p>
          )}
        </div>
      )}

      {/* Dimensions */}
      {merged.dimensions
        .filter(d => d.items.length > 0)
        .map(d => (
          <DimensionSection key={d.dimension} dim={d} />
        ))}
    </div>
  )
}

function DimensionSection({ dim }: { dim: MergedDimension }) {
  const { t } = useDomainT('project')
  const [expanded, setExpanded] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const displayItems = showAll ? dim.items : dim.items.slice(0, 5)
  const hasMore = dim.items.length > 5

  return (
    <div id={`dim-${dim.dimension}`} className="rounded-xl border border-border bg-bg-surface overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-bg-hover transition text-left"
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-text-muted" /> : <ChevronRight className="w-4 h-4 text-text-muted" />}
        <span className={`text-sm font-semibold ${DIM_COLORS[dim.dimension] || 'text-text-primary'}`}>
          {dim.label}
        </span>
        <span className="text-xs text-text-muted ml-auto">{t('analysisReport.itemsCount', { count: dim.items.length })}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          {displayItems.map((item, i) => (
            <div key={i} className="rounded-lg border border-border/40 bg-bg-base px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] text-text-muted mb-1">
                <span className="px-1.5 py-0.5 rounded bg-bg-elevated">{item.sourceLabel}</span>
              </div>
              <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{item.text}</p>
            </div>
          ))}
          {hasMore && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="text-xs text-accent hover:underline"
            >
              {t('analysisReport.expandRemaining', { count: dim.items.length - 5 })}
            </button>
          )}
          {showAll && hasMore && (
            <button
              onClick={() => setShowAll(false)}
              className="text-xs text-text-muted hover:text-text-primary"
            >
              {t('analysisReport.collapse')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function AICharacterCard({ card }: { card: AIMergedCharacter }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-purple-400/20 bg-bg-surface overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-bg-hover transition text-left"
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />}
        <span className="w-7 h-7 rounded-full bg-purple-500/15 text-purple-400 flex items-center justify-center text-xs font-bold shrink-0">
          {card.name.charAt(0)}
        </span>
        <span className="text-sm font-medium text-text-primary shrink-0">{card.name}</span>
        {card.role && (
          <span className="text-[10px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded shrink-0">{card.role}</span>
        )}
        {card.summary && (
          <span className="text-[11px] text-text-muted truncate">{card.summary}</span>
        )}
      </button>
      {expanded && card.analysis && (
        <div className="px-3 pb-3">
          <div className="rounded bg-bg-base border border-border/30 px-2.5 py-2">
            <p className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap">{card.analysis}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Chunk view ─────────────────────────────────────────────────────

function ChunkListView({ chunks, isHistorical }: { chunks: ReferenceChunkAnalysis[]; isHistorical: boolean }) {
  const { t } = useDomainT('project')
  const sorted = useMemo(() => [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex), [chunks])
  const [selectedChunk, setSelectedChunk] = useState(0)

  const chunk = sorted[selectedChunk]
  if (!chunk) return null

  const histDims = new Set(['historicalContext', 'socialInstitutions', 'dailyLife', 'materialCulture', 'languageCustoms'])

  const visibleDimensions = (Object.keys(DIMENSION_LABELS) as AnalysisDimension[]).filter(dim => {
    if (isHistorical) return true
    return !histDims.has(dim)
  })

  return (
    <div className="space-y-3">
      {/* Chunk selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-text-muted">{t('analysisReport.chunkSelectorLabel')}</span>
        <div className="flex flex-wrap gap-1">
          {sorted.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setSelectedChunk(i)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                i === selectedChunk
                  ? 'bg-accent text-white'
                  : 'bg-bg-elevated text-text-muted hover:text-text-secondary'
              }`}
            >
              {c.label || t('analysisReport.chunkFallbackLabel', { index: i + 1 })}
            </button>
          ))}
        </div>
      </div>

      {/* Dimension content */}
      <div className="space-y-1">
        {visibleDimensions.map(dim => {
          const content = chunk[dim]
          if (!content || content === '本块未涉及') return null

          return (
            <div key={dim} className="border border-border/40 rounded-lg overflow-hidden">
              <div className="px-3 py-2">
                <span className={`text-xs font-medium ${DIM_COLORS[dim] || 'text-text-muted'}`}>
                  {DIMENSION_LABEL_KEYS[dim] ? t(DIMENSION_LABEL_KEYS[dim], { defaultValue: DIMENSION_LABELS[dim] }) : (DIMENSION_LABELS[dim] || dim)}
                </span>
              </div>
              <div className="px-3 pb-3 text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                {content}
              </div>
            </div>
          )
        })}
      </div>

      {/* Highlighted excerpts */}
      {chunk.rawExcerpt && (
        <div className="border border-border/40 rounded-lg p-3">
          <h4 className="text-xs font-medium text-text-muted mb-1.5">{t('analysisReport.excerptHeading')}</h4>
          <div className="text-sm text-text-secondary italic leading-relaxed whitespace-pre-wrap">
            {chunk.rawExcerpt}
          </div>
        </div>
      )}
    </div>
  )
}
