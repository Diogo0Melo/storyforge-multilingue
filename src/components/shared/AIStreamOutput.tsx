import { useEffect, useState } from 'react'
import { Square, Check, RotateCcw, Loader2, ThumbsUp, ThumbsDown, Braces, ChevronDown, ChevronRight, X } from 'lucide-react'
import { usePromptStore } from '../../stores/prompt'
import type { PromptModuleKey, PromptExample } from '../../lib/types/prompt'
import type { TokenUsage } from '../../lib/ai/logger'
import { useDomainT } from '../../i18n'

interface AIStreamOutputProps {
  /** 流式输出的文本 */
  output: string
  /** 是否正在生成 */
  isStreaming: boolean
  /** 错误信息 */
  error: string | null
  /** 本次生成的 token 用量 */
  tokenUsage?: TokenUsage | null
  /** 停止生成 */
  onStop: () => void
  /** 采纳内容；结构化结果由调用方单独审查/应用时可省略 */
  onAccept?: (text: string) => void
  /** 重试 */
  onRetry: () => void
  /** 关闭/弃用本次结果（不写回正文）。传入则显示「关闭」按钮 */
  onDismiss?: () => void
  /** 占位提示 */
  placeholder?: string
  /** P15：传入则显示「⭐ 好示例 / 💩 坏示例」标记按钮，写入对应模板的 examples */
  moduleKey?: PromptModuleKey
  /** 允许作者在确认前直接修订候选；修订文本只会在点击采纳时提交校验。 */
  editable?: boolean
  /** durable 写入与终验进行中时锁定候选操作。 */
  busy?: boolean
  /** 采纳生命周期开始后禁止关闭候选。 */
  closeDisabled?: boolean
}

/**
 * AI 流式输出展示组件
 * 显示 AI 生成的文字 + 操作按钮（停止/采纳/重试）
 */
export default function AIStreamOutput({
  output,
  isStreaming,
  error,
  onStop,
  onAccept,
  onRetry,
  onDismiss,
  placeholder,
  moduleKey,
  tokenUsage,
  editable = false,
  busy = false,
  closeDisabled = false,
}: AIStreamOutputProps) {
  const [editableOutput, setEditableOutput] = useState(output)
  useEffect(() => setEditableOutput(output), [output])
  const displayedOutput = editable && !isStreaming ? editableOutput : output
  const hasOutput = displayedOutput.length > 0
  const [marked, setMarked] = useState<'good' | 'bad' | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [pendingAction, setPendingAction] = useState<'accept' | 'dismiss' | null>(null)
  const controlsBusy = busy || pendingAction !== null
  const { t } = useDomainT('shared')

  // 检测是否结构化输出（JSON）——这类内容是给程序解析的，不该让用户直接读原始 JSON
  const trimmed = displayedOutput.trimStart()
  const isStructured = hasOutput && (
    trimmed.startsWith('{') || trimmed.startsWith('[') || /^```(?:json)?\s*[[{]/.test(trimmed)
  )

  /** 把当前输出存为模板的好/坏示例 */
  const handleMark = async (kind: 'good' | 'bad') => {
    if (!moduleKey || !displayedOutput.trim()) return
    const tpl = usePromptStore.getState().getActive(moduleKey)
    const example: PromptExample = {
      id: `ex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: displayedOutput.trim().slice(0, 2000), // 限制长度
      source: 'user-marked',
      rating: kind === 'good' ? 5 : 1,
      createdAt: Date.now(),
    }
    const examples = tpl.examples || {}
    const updated = {
      ...examples,
      [kind]: [...(examples[kind] || []), example],
    }
    await usePromptStore.getState().saveTemplate({ ...tpl, examples: updated })
    setMarked(kind)
  }

  const handleAccept = async () => {
    if (!onAccept || controlsBusy) return
    setPendingAction('accept')
    try {
      // The durable caller owns validation, writing, and verification. Keep the
      // candidate locked until that lifecycle has settled.
      await onAccept(displayedOutput)
    } finally {
      setPendingAction(null)
    }
  }

  const handleDismiss = async () => {
    if (!onDismiss || controlsBusy || closeDisabled) return
    setPendingAction('dismiss')
    try {
      // Dismissal is also awaited so it cannot race an in-flight adoption.
      await onDismiss()
    } finally {
      setPendingAction(null)
    }
  }

  // Phase 21.1: 生成中 token 估算（中文 ≈ 1.5 token/字，英文 ≈ 1.3 token/word）
  const estimatedOutputTokens = isStreaming && !tokenUsage && displayedOutput.length > 0
    ? Math.round(displayedOutput.length * 1.5)
    : null

  return (
    <div className="border border-border rounded-lg overflow-hidden border-l-2 border-l-accent">
      {/* 输出区域 */}
      <div className="min-h-[200px] max-h-[500px] overflow-y-auto p-4 bg-accent-soft">
        {error ? (
          <div className="text-error text-sm">
            <p className="font-medium mb-1">{t('aiStream.generateFailed')}</p>
            <p className="text-text-muted">{error}</p>
            {error.includes('Failed to fetch') && (
              <p className="mt-2 text-xs text-warning bg-warning/5 p-2 rounded">
                {t('aiStream.fetchFixLine1')}<br />
                {t('aiStream.fetchFixCheckNetwork')}<br />
                {t('aiStream.fetchFixSwitchProxy')}<br />
                {t('aiStream.fetchFixCheckBaseUrl')}
              </p>
            )}
            {error.includes('API Key') && (
              <p className="mt-2 text-xs text-warning bg-warning/5 p-2 rounded">
                {t('aiStream.apiKeyFix')}
              </p>
            )}
          </div>
        ) : editable && hasOutput && !isStreaming ? (
          <textarea
            aria-label={t('aiStream.editableCandidateAria')}
            value={editableOutput}
            disabled={controlsBusy}
            onChange={event => setEditableOutput(event.target.value)}
            className="min-h-[260px] w-full resize-y rounded border border-border bg-bg-surface p-3 font-mono text-xs leading-5 text-text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
          />
        ) : isStructured ? (
          // 结构化（JSON）输出：不直接展示原始 JSON，给友好提示 + 可折叠原文
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <Braces className="w-4 h-4 text-accent shrink-0" />
              {isStreaming ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {onAccept
                    ? t('aiStream.structuredStreamingWithAccept')
                    : t('aiStream.structuredStreamingReview')}
                </span>
              ) : (
                <span>
                  {onAccept
                    ? t('aiStream.structuredDoneWithAccept')
                    : t('aiStream.structuredDoneReview')}
                </span>
              )}
            </div>
            <button
              onClick={() => setShowRaw(v => !v)}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              {showRaw ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {showRaw ? t('aiStream.hideRaw') : t('aiStream.showRaw')}
            </button>
            {showRaw && (
              <pre className="text-xs text-text-muted bg-bg-base/50 rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-60">{displayedOutput}</pre>
            )}
          </div>
        ) : hasOutput ? (
          <div className="text-text-primary text-sm leading-relaxed whitespace-pre-wrap">
            {displayedOutput}
            {isStreaming && (
              <span className="inline-block w-1.5 h-4 bg-accent ml-0.5 animate-pulse" />
            )}
          </div>
        ) : isStreaming ? (
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t('aiStream.thinking')}</span>
          </div>
        ) : (
          <p className="text-text-muted text-sm">{placeholder ?? t('aiStream.placeholder')}</p>
        )}
      </div>

      {/* 操作栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-bg-elevated border-t border-border">
        <span className="text-text-muted text-xs flex items-center gap-2">
          {hasOutput && <span>{t('aiStream.charCount', { count: displayedOutput.length })}</span>}
          {tokenUsage ? (
            <span title={`Input ${tokenUsage.inputTokens} + Output ${tokenUsage.outputTokens}`}>
              {t('aiStream.tokenStats', {
                input: tokenUsage.inputTokens.toLocaleString(),
                output: tokenUsage.outputTokens.toLocaleString(),
              })}
            </span>
          ) : estimatedOutputTokens ? (
            <span className="text-text-muted" title={t('aiStream.estimatedOutputTokensTitle')}>
              {t('aiStream.estimatedOutputTokens', { count: estimatedOutputTokens.toLocaleString() })}
            </span>
          ) : null}
        </span>
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <button
              onClick={onStop}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-error/10 text-error rounded-md hover:bg-error/20 transition-colors"
            >
              <Square className="w-3 h-3" />
              {t('aiStream.stop')}
            </button>
          ) : (
            <>
              {(hasOutput || error) && (
                <button
                  onClick={onRetry}
                  disabled={controlsBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-bg-hover text-text-secondary rounded-md hover:text-text-primary transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  {t('aiStream.retry')}
                </button>
              )}
              {/* P15: 标记好/坏示例（仅在已有输出 + moduleKey 提供时） */}
              {hasOutput && !error && moduleKey && (
                <>
                  <button
                    onClick={() => handleMark('good')}
                    disabled={marked === 'good' || controlsBusy}
                    title={t('aiStream.markGoodTitle')}
                    className={`flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md transition-colors ${
                      marked === 'good'
                        ? 'bg-success/20 text-success'
                        : 'bg-bg-hover text-text-secondary hover:text-success hover:bg-success/10'
                    }`}
                  >
                    <ThumbsUp className="w-3 h-3" />
                    {marked === 'good' ? t('aiStream.markGoodDone') : t('aiStream.markGood')}
                  </button>
                  <button
                    onClick={() => handleMark('bad')}
                    disabled={marked === 'bad' || controlsBusy}
                    title={t('aiStream.markBadTitle')}
                    className={`flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md transition-colors ${
                      marked === 'bad'
                        ? 'bg-error/20 text-error'
                        : 'bg-bg-hover text-text-secondary hover:text-error hover:bg-error/10'
                    }`}
                  >
                    <ThumbsDown className="w-3 h-3" />
                    {marked === 'bad' ? t('aiStream.markBadDone') : t('aiStream.markBad')}
                  </button>
                </>
              )}
              {hasOutput && !error && onAccept && (
                <button
                  onClick={() => { void handleAccept() }}
                  disabled={controlsBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-white rounded-md hover:bg-accent-hover transition-colors disabled:opacity-40"
                >
                  {busy || pendingAction === 'accept'
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Check className="w-3 h-3" />}
                  {t('aiStream.accept')}
                </button>
              )}
              {/* G2：关闭/弃用——不满意可直接关掉，保留原文不写回 */}
              {onDismiss && (hasOutput || error) && (
                <button
                  onClick={() => { void handleDismiss() }}
                  disabled={controlsBusy || closeDisabled}
                  title={t('aiStream.dismissTitle')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-bg-hover text-text-muted rounded-md hover:text-text-primary transition-colors disabled:opacity-40"
                >
                  {pendingAction === 'dismiss'
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <X className="w-3 h-3" />}
                  {t('aiStream.dismiss')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
