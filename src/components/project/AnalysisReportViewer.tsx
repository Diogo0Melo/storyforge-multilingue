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
  ChevronDown, ChevronRight, Loader2, Sparkles,
  Users2,
} from 'lucide-react'
import type { Reference, ReferenceAnalysisRun, ReferenceChunkAnalysis, AnalysisDimension } from '../../lib/types'
import { DIMENSION_LABELS, DIMENSION_LABEL_KEYS } from '../../lib/types/reference'
import {
  mergeAnalysisResults, buildSummaryPrompt,
  collectCharacterCraftTexts, buildCharacterMergePrompt, parseCharacterMergeOutput,
  type MergedAnalysisResult, type MergedDimension, type AIMergedCharacter,
} from '../../lib/reference-analysis/merge-analysis'
import { chat, resolveRequestConfig } from '../../lib/ai/client'
import { getAIConfigRequiredMessage, isAIConfigReady } from '../../lib/ai/config-readiness'
import { useAIConfigStore } from '../../stores/ai-config'
import { extractJSON } from '../../lib/ai/adapters/import-adapter'
import { useToast } from '../shared/Toast'
import { updateReferenceAnalysisDerived } from '../../lib/reference-analysis/lifecycle'
import { useDomainT } from '../../i18n'

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
  const [view, setView] = useState<'merged' | 'chunks'>('merged')
  const [activeDim, setActiveDim] = useState<string | null>(null)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [aggregatingChars, setAggregatingChars] = useState(false)
  const [summaryJSON, setSummaryJSON] = useState(run.analysisSummary)
  const [charactersJSON, setCharactersJSON] = useState(run.mergedCharacters)
  const contentRef = useRef<HTMLDivElement>(null)

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

  // AI full-book summary
  const handleGenerateSummary = async () => {
    if (!reference.id || !run.id) return
    setGeneratingSummary(true)
    try {
      const { system, user } = buildSummaryPrompt(
        reference.title, reference.author || '', merged, isHistorical,
      )
      const config = useAIConfigStore.getState().config
      const meta = { category: 'reference.summary', projectId: reference.projectId, configOverrides: { maxTokens: 4096 } } as const
      const effectiveConfig = resolveRequestConfig(config, meta).config
      if (!isAIConfigReady(effectiveConfig)) throw new Error(getAIConfigRequiredMessage(effectiveConfig))
      const output = await chat(
        [{ role: 'system', content: system }, { role: 'user', content: user }],
        { ...config, maxTokens: 4096 },
        { category: 'reference.summary', projectId: reference.projectId, configOverrides: { maxTokens: 4096 } },
      )
      const json = extractJSON(output)
      if (json) {
        const summaryStr = JSON.stringify(json)
        await updateReferenceAnalysisDerived(run.id, { analysisSummary: summaryStr })
        setSummaryJSON(summaryStr)
      }
    } catch (err) {
      toast.error(t('analysisReport.summaryFailed', { message: err instanceof Error ? err.message : String(err) }))
    } finally {
      setGeneratingSummary(false)
    }
  }

  // AI character card aggregation (replaces regex name scraping, fully deduplicates)
  const handleAggregateCharacters = async () => {
    if (!reference.id || !run.id) return
    setAggregatingChars(true)
    try {
      const craftTexts = collectCharacterCraftTexts(chunks)
      if (craftTexts.length === 0) throw new Error(t('analysisReport.noCraftTexts'))
      const config = useAIConfigStore.getState().config
      const meta = { category: 'reference.characters', projectId: reference.projectId, configOverrides: { maxTokens: 4096 } } as const
      const effectiveConfig = resolveRequestConfig(config, meta).config
      if (!isAIConfigReady(effectiveConfig)) throw new Error(getAIConfigRequiredMessage(effectiveConfig))
      const { system, user } = buildCharacterMergePrompt(
        reference.title, reference.author || '', craftTexts,
      )
      const output = await chat(
        [{ role: 'system', content: system }, { role: 'user', content: user }],
        { ...config, maxTokens: 4096 },
        { category: 'reference.characters', projectId: reference.projectId, configOverrides: { maxTokens: 4096 } },
      )
      const characters = parseCharacterMergeOutput(output)
      if (characters.length === 0) throw new Error(t('analysisReport.noParsedCharacters'))
      const next = JSON.stringify(characters)
      await updateReferenceAnalysisDerived(run.id, { mergedCharacters: next })
      setCharactersJSON(next)
    } catch (err) {
      toast.error(t('analysisReport.aggregateFailed', { message: err instanceof Error ? err.message : String(err) }))
    } finally {
      setAggregatingChars(false)
    }
  }

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
              disabled={generatingSummary || nonEmptyDims.length === 0}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {generatingSummary
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Sparkles className="w-3.5 h-3.5" />}
              {generatingSummary ? t('analysisReport.generatingSummary') : t('analysisReport.generateSummaryButton')}
            </button>
          )}
        </div>

        {view === 'merged' ? (
          <MergedView
            merged={merged}
            summaryMap={summaryMap}
            aiCharacters={aiCharacters}
            hasCharacterCraft={hasCharacterCraft}
            onAggregate={handleAggregateCharacters}
            aggregating={aggregatingChars}
          />
        ) : (
          <ChunkListView chunks={chunks} isHistorical={isHistorical} />
        )}
      </div>
    </div>
  )
}

// ── Merged view ────────────────────────────────────────────────────

function MergedView({
  merged, summaryMap, aiCharacters, hasCharacterCraft, onAggregate, aggregating,
}: {
  merged: MergedAnalysisResult
  summaryMap: Record<string, string>
  aiCharacters: AIMergedCharacter[]
  hasCharacterCraft: boolean
  onAggregate: () => void
  aggregating: boolean
}) {
  const { t } = useDomainT('project')
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
                disabled={aggregating}
                className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-purple-400/30 text-purple-400 hover:bg-purple-500/10 transition disabled:opacity-50"
              >
                {aggregating
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('analysisReport.aggregating')}</>
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
                  {t(DIMENSION_LABEL_KEYS[dim], { defaultValue: DIMENSION_LABELS[dim] })}
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
