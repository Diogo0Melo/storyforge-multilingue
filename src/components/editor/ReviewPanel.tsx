/**
 * 质量审校面板 — Phase F
 *
 * 集成三套质量检测：审校(F1)、去AI味(F2)、追读力(F3)
 */
import { useEffect, useState } from 'react'
import { X, ShieldCheck, Bot, TrendingUp, Loader2, AlertTriangle, AlertCircle, Info, Wand2, ScanSearch } from 'lucide-react'
import { useDomainT } from '../../i18n'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { useReviewResultStore, selectChapterReview, type ReviewTab } from '../../stores/review-result'
import { buildReviewPrompt, parseReviewResult, REVIEW_DIMENSION_LABELS, REVIEW_DIMENSION_LABEL_KEYS, type ReviewResult } from '../../lib/ai/adapters/review-adapter'
import { buildAntiAIPrompt, parseAntiAIResult, ANTI_AI_DIMENSION_LABELS, ANTI_AI_DIMENSION_LABEL_KEYS, extractHighFreqWords, type AntiAIResult } from '../../lib/ai/adapters/anti-ai-adapter'
import { buildReadabilityPrompt, parseReadabilityResult, READABILITY_DIMENSION_LABELS, READABILITY_DIMENSION_LABEL_KEYS, type ReadabilityResult } from '../../lib/ai/adapters/readability-adapter'
import {
  type ConsistencyAuditMode,
  type ConsistencyAuditResult,
} from '../../lib/ai/adapters/consistency-audit-adapter'
import {
  persistConsistencyAgentCandidate,
  runConsistencyAgent,
  toConsistencyAuditResult,
  type ConsistencyAgentRun,
} from '../../lib/agent/consistency-agent'
import { AgentTeamBudgetTracker } from '../../lib/agent/team-budget'
import { useAIConfigStore } from '../../stores/ai-config'

interface Props {
  projectId: number
  /** 当前章节 id — 审校结果按章缓存到 store，收起/切标签不丢（bug G7 / B1） */
  chapterId: number
  /** NS-6：审计证据需用它做世界隔离 + 召回定位（多世界正确性） */
  outlineNodeId?: number | null
  worldGroupId?: number | null
  chapterContent: string
  chapterTitle: string
  worldContext: string
  characterContext: string
  prevChapterSummary: string
  nextChapterSummary: string
  foreshadowContext: string
  stateContext: string
  onClose: () => void
  /** G8：按审校报告让 AI 改全文（交给 ChapterEditor 走标准生成→采纳流程） */
  onReviseByReport?: (report: ReviewResult) => void
  consistencyRun?: ConsistencyAgentRun | null
  consistencyCurrent?: boolean
  onConsistencyRun?: (run: ConsistencyAgentRun) => void
  onBeforeConsistencyRun?: () => Promise<void>
}

type TabType = ReviewTab

function getTabs(t: (...args: any[]) => string): { key: TabType; label: string; icon: typeof ShieldCheck }[] {
  return [
    { key: 'consistency', label: t('review.tabConsistency'), icon: ScanSearch },
    { key: 'review', label: t('review.tabReview'), icon: ShieldCheck },
    { key: 'antiAI', label: t('review.tabAntiAI'), icon: Bot },
    { key: 'readability', label: t('review.tabReadability'), icon: TrendingUp },
  ]
}

export default function ReviewPanel(props: Props) {
  const { t } = useDomainT('editor')
  const TABS = getTabs(t)
  const { projectId, chapterId, outlineNodeId, worldGroupId, chapterContent, chapterTitle, worldContext, characterContext,
    prevChapterSummary, nextChapterSummary, foreshadowContext, stateContext, onClose, onReviseByReport } = props

  const ai = useAIStream(createAISessionKey(projectId, 'review.run', chapterId))
  const [auditMode, setAuditMode] = useState<ConsistencyAuditMode>('fast')
  const [consistencyError, setConsistencyError] = useState('')
  const [localConsistencyRun, setLocalConsistencyRun] = useState<ConsistencyAgentRun | null>(
    props.consistencyRun ?? null,
  )

  // 结果与当前标签都存 store（按 chapterId），故收起再展开 / 切一级标签回来都还在
  const cached = useReviewResultStore(selectChapterReview(chapterId))
  const {
    review: reviewResult,
    antiAI: antiAIResult,
    readability: readabilityResult,
    consistency: consistencyResult,
    activeTab,
  } = cached
  const setReview = useReviewResultStore(s => s.setReview)
  const setAntiAI = useReviewResultStore(s => s.setAntiAI)
  const setReadability = useReviewResultStore(s => s.setReadability)
  const setConsistency = useReviewResultStore(s => s.setConsistency)
  const setActiveTab = (tab: TabType) => useReviewResultStore.getState().setActiveTab(chapterId, tab)

  useEffect(() => {
    setLocalConsistencyRun(props.consistencyRun ?? null)
    if (props.consistencyRun) {
      setConsistency(chapterId, toConsistencyAuditResult(props.consistencyRun.candidate))
    }
  }, [chapterId, props.consistencyRun, setConsistency])

  const handleRunReview = async () => {
    const messages = buildReviewPrompt(
      chapterContent, chapterTitle, worldContext,
      characterContext, prevChapterSummary, foreshadowContext, stateContext
    )
    const output = await ai.start(messages, undefined, { category: 'review.quality' })
    const result = parseReviewResult(output)
    if (result) setReview(chapterId, result)
  }

  const handleRunAntiAI = async () => {
    const highFreq = extractHighFreqWords(chapterContent)
    const messages = buildAntiAIPrompt(chapterContent, highFreq.map(w => w.replace(/\(\d+次\)/, '')))
    const output = await ai.start(messages, undefined, { category: 'review.anti-ai' })
    const result = parseAntiAIResult(output)
    if (result) setAntiAI(chapterId, result)
  }

  const handleRunReadability = async () => {
    const messages = buildReadabilityPrompt(
      chapterContent, chapterTitle, prevChapterSummary, nextChapterSummary
    )
    const output = await ai.start(messages, undefined, { category: 'review.readability' })
    const result = parseReadabilityResult(output)
    if (result) setReadability(chapterId, result)
  }

  const handleRunConsistency = async () => {
    setConsistencyError('')
    try {
      await props.onBeforeConsistencyRun?.()
      const config = useAIConfigStore.getState().config
      const budget = new AgentTeamBudgetTracker(
        useAIConfigStore.getState().agentTeamBudgetProfile,
      )
      const candidate = await runConsistencyAgent({
        projectId,
        chapterId,
        outlineNodeId,
        worldGroupId: worldGroupId ?? null,
        chapterTitle,
        chapterContent,
        mode: auditMode,
        provider: config.provider,
        model: config.model,
        budget,
        call: messages => ai.start(messages, undefined, {
          category: auditMode === 'fast' ? 'review.consistency.fast' : 'review.consistency.deep',
          projectId,
          configOverrides: { maxTokens: auditMode === 'fast' ? 4_000 : 6_000 },
        }),
      })
      const run = await persistConsistencyAgentCandidate(candidate)
      setLocalConsistencyRun(run)
      setConsistency(chapterId, toConsistencyAuditResult(candidate))
      props.onConsistencyRun?.(run)
    } catch (error) {
      setConsistencyError(error instanceof Error ? error.message : t('review.consistencyAgentFailed'))
    }
  }

  const handleRun = () => {
    if (activeTab === 'consistency') void handleRunConsistency()
    else if (activeTab === 'review') handleRunReview()
    else if (activeTab === 'antiAI') handleRunAntiAI()
    else handleRunReadability()
  }

  const currentResult = activeTab === 'consistency' ? consistencyResult
    : activeTab === 'review' ? reviewResult
    : activeTab === 'antiAI' ? antiAIResult : readabilityResult

  const consistencyMeta = localConsistencyRun?.candidate

  return (
    <div className="bg-bg-surface border border-border rounded-xl overflow-hidden shadow-lg">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-2 bg-bg-elevated border-b border-border">
        <div className="flex items-center gap-1">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
                activeTab === tab.key
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {/* G8：审校出报告后，一键让 AI 按报告改全文（改稿在下方生成区预览，确认才替换原文） */}
          {activeTab === 'review' && reviewResult && onReviseByReport && (
            <button
              onClick={() => onReviseByReport(reviewResult)}
              disabled={ai.isStreaming}
              title={t('review.btnReviseByReportTitle')}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-emerald-500/10 text-emerald-400 rounded-md hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
            >
              <Wand2 className="w-3 h-3" />
              {t('review.btnReviseByReport')}
            </button>
          )}
          <button
            onClick={handleRun}
            disabled={ai.isStreaming || !chapterContent}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-accent text-white rounded-md hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {ai.isStreaming ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            {ai.isStreaming ? t('review.btnDetecting') : t('review.btnStartDetection')}
          </button>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="p-4 max-h-[50vh] overflow-y-auto">
        {activeTab === 'consistency' && (
          <div className="mb-3 flex gap-2">
            {([
              ['fast', t('review.auditModeFast')],
              ['deep', t('review.auditModeDeep')],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setAuditMode(value)}
                className={`px-2 py-1 text-xs rounded ${auditMode === value ? 'bg-accent/10 text-accent' : 'bg-bg-elevated text-text-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {activeTab === 'consistency' && consistencyMeta && (
          <div className={`mb-3 rounded-lg border px-3 py-2 text-[11px] ${
            props.consistencyCurrent === false
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
              : 'border-border bg-bg-base text-text-muted'
          }`}>
            <p>
              {props.consistencyCurrent === false ? t('review.consistencyStale') : t('review.consistencyCurrent')}
              {' · '}{consistencyMeta.mode === 'background' ? t('review.consistencyAutoFastGuard') : consistencyMeta.mode === 'fast' ? t('review.consistencyFastGuard') : t('review.consistencyDeepAudit')}
              {' · '}{t('review.consistencyCalls', { used: consistencyMeta.budget.calls, max: consistencyMeta.budget.maxCalls })}
              {' · '}{t('review.consistencyTokensApprox', { used: consistencyMeta.budget.usedTokens.toLocaleString(), max: consistencyMeta.budget.maxTokens.toLocaleString() })}
            </p>
            {consistencyMeta.context.included.length > 0 && (
              <p className="mt-1">
                {t('review.consistencyInputEvidence', { inputTokens: consistencyMeta.context.inputTokens.toLocaleString(), inputBudget: consistencyMeta.context.inputBudget.toLocaleString() })}
                {' · '}{t('review.consistencyIncluded', { count: consistencyMeta.context.included.length })}
                {' · '}{t('review.consistencyOmitted', { count: consistencyMeta.context.omitted.length })}
                {' · '}{t('review.consistencyTrimmed', { count: consistencyMeta.context.trimmed.length })}
              </p>
            )}
          </div>
        )}
        {(ai.error || consistencyError) && (
          <div className="text-xs text-error bg-error/10 px-3 py-2 rounded-lg mb-3">
            {consistencyError || ai.error}
          </div>
        )}

        {!currentResult && !ai.isStreaming && (
          <div className="text-center py-8 text-text-muted text-sm">
            {t('review.emptyHint', { mode: activeTab === 'consistency' ? (auditMode === 'fast' ? t('review.consistencyFastGuard') : t('review.consistencyDeepAudit')) : activeTab === 'review' ? t('review.tabReview') : activeTab === 'antiAI' ? t('review.tabAntiAI') : t('review.tabReadability') })}
          </div>
        )}

        {ai.isStreaming && (
          <div className="flex items-center justify-center py-8 gap-2 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('review.analyzing')}
            {ai.output.length > 0 && (
              <span className="text-xs">≈ ~{Math.round(ai.output.length * 1.5).toLocaleString()} tokens</span>
            )}
          </div>
        )}
        {ai.tokenUsage && !ai.isStreaming && (
          <div className="text-[10px] text-text-muted mb-2" title={t('reviewTokens.usageTooltip', { input: ai.tokenUsage.inputTokens, output: ai.tokenUsage.outputTokens })}>
            Token: ↑{ai.tokenUsage.inputTokens.toLocaleString()} ↓{ai.tokenUsage.outputTokens.toLocaleString()}
          </div>
        )}

        {activeTab === 'consistency' && consistencyResult && !ai.isStreaming && (
          <ConsistencyResultView result={consistencyResult} t={t} />
        )}

        {/* F1: 审校结果 */}
        {activeTab === 'review' && reviewResult && !ai.isStreaming && (
          <ReviewResultView result={reviewResult} t={t} />
        )}

        {/* F2: 去AI味结果 */}
        {activeTab === 'antiAI' && antiAIResult && !ai.isStreaming && (
          <AntiAIResultView result={antiAIResult} t={t} />
        )}

        {/* F3: 追读力结果 */}
        {activeTab === 'readability' && readabilityResult && !ai.isStreaming && (
          <ReadabilityResultView result={readabilityResult} t={t} />
        )}
      </div>
    </div>
  )
}

function ConsistencyResultView({ result, t }: { result: ConsistencyAuditResult; t: (...args: any[]) => string }) {
  if (!result.findings.length) {
    return <p className="text-sm text-success">{t('review.consistencyNoIssues')}</p>
  }
  return (
    <div className="space-y-3">
      {result.findings.map((finding, index) => (
        <div key={index} className="p-3 bg-bg-base rounded-lg border border-border">
          <div className="flex items-center gap-2 text-xs">
            <span className={
              finding.severity === 'hard' ? 'text-error'
                : finding.severity === 'risk' ? 'text-warning' : 'text-text-muted'
            }>
              {finding.severity === 'hard' ? t('review.severityHard') : finding.severity === 'risk' ? t('review.severityRisk') : t('review.severityInsufficient')}
            </span>
            <span className="text-text-muted">{finding.category}</span>
          </div>
          <p className="mt-1 text-xs text-text-primary">{finding.reason}</p>
          <p className="mt-1 text-[11px] text-text-muted border-l-2 border-border pl-2">{t('review.evidenceQuotePrefix', { quote: finding.quote })}</p>
          {finding.evidence.map((evidence, evidenceIndex) => (
            <p key={evidenceIndex} className="mt-1 text-[11px] text-accent/80">
              {t('review.evidenceSourceQuote', { type: evidence.sourceType, id: evidence.sourceId, quote: evidence.quote })}
            </p>
          ))}
          {finding.suggestion && <p className="mt-1 text-xs text-accent">{t('review.suggestionPrefix', { suggestion: finding.suggestion })}</p>}
        </div>
      ))}
    </div>
  )
}

// ── 评分徽章 ──

function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const color = score >= 80 ? 'text-success bg-success/10'
    : score >= 60 ? 'text-warning bg-warning/10'
    : 'text-error bg-error/10'

  const sizeClass = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-lg font-bold px-3 py-1.5'

  return <span className={`rounded-full ${color} ${sizeClass}`}>{score}</span>
}

// ── 严重度图标 ──

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'critical') return <AlertCircle className="w-3.5 h-3.5 text-error" />
  if (severity === 'warning') return <AlertTriangle className="w-3.5 h-3.5 text-warning" />
  return <Info className="w-3.5 h-3.5 text-info" />
}

// ── F1: 审校结果视图 ──

function ReviewResultView({ result, t }: { result: ReviewResult; t: (...args: any[]) => string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ScoreBadge score={result.overallScore} />
        <span className="text-sm text-text-primary font-medium">{t('review.reviewOverallScore')}</span>
      </div>

      {result.issues.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">{t('review.reviewIssuesTitle')}</h4>
          {result.issues.map((issue, idx) => (
            <div key={idx} className="flex items-start gap-2 bg-bg-base rounded-lg p-3">
              <SeverityIcon severity={issue.severity} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-1.5 py-0.5 bg-bg-elevated rounded text-text-muted">
                    {REVIEW_DIMENSION_LABEL_KEYS[issue.dimension] ? t(REVIEW_DIMENSION_LABEL_KEYS[issue.dimension], { defaultValue: REVIEW_DIMENSION_LABELS[issue.dimension] || issue.dimension }) : (REVIEW_DIMENSION_LABELS[issue.dimension] || issue.dimension)}
                  </span>
                </div>
                <p className="text-xs text-text-primary mt-1">{issue.description}</p>
                {issue.quote && (
                  <p className="text-[10px] text-text-muted mt-1 italic border-l-2 border-border pl-2">{issue.quote}</p>
                )}
                <p className="text-xs text-accent mt-1">💡 {issue.suggestion}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {result.suggestions.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">{t('review.reviewSuggestionsTitle')}</h4>
          <ul className="space-y-1">
            {result.suggestions.map((s, i) => (
              <li key={i} className="text-xs text-text-secondary flex items-start gap-1.5">
                <span className="text-accent mt-0.5">•</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── F2: 去AI味结果视图 ──

function AntiAIResultView({ result, t }: { result: AntiAIResult; t: (...args: any[]) => string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ScoreBadge score={result.overallScore} />
        <span className="text-sm text-text-primary font-medium">{t('review.antiAIOverallScore')}</span>
      </div>

      {result.dimensions.length > 0 && (
        <div className="space-y-2">
          {result.dimensions.map((dim, idx) => (
            <div key={idx} className="bg-bg-base rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-text-primary">
                  {ANTI_AI_DIMENSION_LABEL_KEYS[dim.dimension] ? t(ANTI_AI_DIMENSION_LABEL_KEYS[dim.dimension], { defaultValue: ANTI_AI_DIMENSION_LABELS[dim.dimension] || dim.dimension }) : (ANTI_AI_DIMENSION_LABELS[dim.dimension] || dim.dimension)}
                </span>
                <ScoreBadge score={dim.score} size="sm" />
              </div>
              {dim.markers.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {dim.markers.slice(0, 5).map((m, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 bg-error/10 text-error rounded">
                      {m.slice(0, 30)}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-accent">💡 {dim.suggestion}</p>
            </div>
          ))}
        </div>
      )}

      {result.highFreqWords.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">{t('review.antiAIHighFreqTitle')}</h4>
          <div className="flex flex-wrap gap-1">
            {result.highFreqWords.map((w, i) => (
              <span key={i} className="text-[10px] px-2 py-1 bg-warning/10 text-warning rounded-full">{w}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── F3: 追读力结果视图 ──

function ReadabilityResultView({ result, t }: { result: ReadabilityResult; t: (...args: any[]) => string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ScoreBadge score={result.overallScore} />
        <span className="text-sm text-text-primary font-medium">{t('review.readabilityOverallScore')}</span>
      </div>

      {result.dimensions.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {result.dimensions.map((dim, idx) => {
            const meta = READABILITY_DIMENSION_LABELS[dim.dimension]
            const labelKey = READABILITY_DIMENSION_LABEL_KEYS[dim.dimension]
            return (
              <div key={idx} className="bg-bg-base rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-text-primary">
                    {meta?.emoji} {labelKey ? t(labelKey, { defaultValue: meta?.label || dim.dimension }) : (meta?.label || dim.dimension)}
                  </span>
                  <ScoreBadge score={dim.score} size="sm" />
                </div>
                <p className="text-[10px] text-text-muted">{dim.description}</p>
                <p className="text-[10px] text-accent mt-1">💡 {dim.suggestion}</p>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {result.highlights.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-success mb-1">{t('review.readabilityHighlights')}</h4>
            <ul className="space-y-0.5">
              {result.highlights.map((h, i) => (
                <li key={i} className="text-[10px] text-text-secondary">• {h}</li>
              ))}
            </ul>
          </div>
        )}
        {result.weaknesses.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-warning mb-1">{t('review.readabilityWeaknesses')}</h4>
            <ul className="space-y-0.5">
              {result.weaknesses.map((w, i) => (
                <li key={i} className="text-[10px] text-text-secondary">• {w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
