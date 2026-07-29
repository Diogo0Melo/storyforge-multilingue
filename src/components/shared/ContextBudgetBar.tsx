/**
 * 上下文窗口预算进度条 — Phase 21.3
 *
 * 类似 Cline 的上下文窗口进度条，但适配写小说场景：
 * - 显示各层（L0-L3）的 token 占比
 * - 超窗口自动告警 + 建议裁剪
 * - 鼠标 hover 显示各段详情
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronDown, ChevronUp, Zap, Eye } from 'lucide-react'
import {
  formatTokenCount,
  getBudgetColorClass,
  autoTrimToFit,
  type ContextBudget,
  type ContextLayer,
} from '../../lib/ai/context-budget'

interface Props {
  budget: ContextBudget
  /** 用户确认裁剪后回调（返回裁剪后的 segments） */
  onTrim?: (trimmedLayers: ContextLayer[]) => void
  /** 紧凑模式（只显示进度条，不显示详情） */
  compact?: boolean
}

const LAYER_COLORS: Record<ContextLayer, string> = {
  L0: 'bg-blue-500',
  L1: 'bg-green-500',
  L2: 'bg-amber-500',
  L3: 'bg-purple-500',
}

const LAYER_KEYS: ContextLayer[] = ['L0', 'L1', 'L2', 'L3']

export default function ContextBudgetBar({ budget, onTrim, compact }: Props) {
  const { t } = useTranslation('common')
  const [showDetail, setShowDetail] = useState(false)
  // 展开查看某段「实际注入给 AI 的内容」（数据本就在 seg.content，这里只是显示出来）
  const [openSeg, setOpenSeg] = useState<number | null>(null)
  const pct = Math.min(budget.usageRatio * 100, 100)
  const colorClass = getBudgetColorClass(budget.usageRatio)

  const getLayerLabel = (layer: ContextLayer) => t(`contextBudget.layer${layer}`)

  // 按 layer 分组统计 token
  const layerTokens: Record<ContextLayer, number> = { L0: 0, L1: 0, L2: 0, L3: 0 }
  for (const seg of budget.segments) {
    layerTokens[seg.layer] += seg.tokens
  }

  return (
    <div className="text-xs">
      {/* 进度条 */}
      <div className="flex items-center gap-2">
        <Zap className={`w-3 h-3 flex-shrink-0 ${colorClass}`} />
        <div className="flex-1 h-2 bg-bg-elevated rounded-full overflow-hidden relative">
          {/* 分层色条 */}
          {LAYER_KEYS.map(layer => {
            const layerPct = budget.inputBudget > 0
              ? (layerTokens[layer] / budget.inputBudget) * 100
              : 0
            if (layerPct <= 0) return null
            return (
              <div
                key={layer}
                className={`h-full ${LAYER_COLORS[layer]} inline-block`}
                style={{ width: `${Math.min(layerPct, 100)}%` }}
                title={`${getLayerLabel(layer)}: ${formatTokenCount(layerTokens[layer])}`}
              />
            )
          })}
        </div>
        <span className={`flex-shrink-0 tabular-nums ${colorClass}`}>
          {formatTokenCount(budget.totalInputTokens)} / {formatTokenCount(budget.inputBudget)}
        </span>
        {!compact && (
          <button
            onClick={() => setShowDetail(v => !v)}
            className="p-0.5 text-text-muted hover:text-text-primary"
          >
            {showDetail ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* 超窗口警告 */}
      {budget.overBudget && (
        <div className="mt-1.5 flex items-start gap-1.5 text-error bg-error/10 rounded px-2 py-1">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{t('contextBudget.overLimit')}</p>
            <p className="text-text-muted mt-0.5">
              {t('contextBudget.overLimitDetail', {
                count: formatTokenCount(budget.totalInputTokens - budget.inputBudget),
                action: onTrim ? t('contextBudget.autoTrim') : '',
              })}
            </p>
            {onTrim && (
              <button
                onClick={() => {
                  const { trimmedLayers } = autoTrimToFit(budget)
                  onTrim(trimmedLayers)
                }}
                className="mt-1 px-2 py-0.5 bg-error/20 text-error rounded hover:bg-error/30 text-[10px]"
              >
                {t('contextBudget.autoTrimAction')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 详情面板 */}
      {showDetail && !compact && (
        <div className="mt-2 space-y-1 bg-bg-base border border-border rounded-lg p-2">
          {/* 图例 */}
          <div className="flex items-center gap-3 mb-1.5 text-[10px] text-text-muted">
            {LAYER_KEYS.map(l => (
              <span key={l} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-sm ${LAYER_COLORS[l]}`} />
                {getLayerLabel(l)}
              </span>
            ))}
          </div>

          {/* 各段明细（点击查看本段实际注入给 AI 的内容） */}
          {budget.segments.map((seg, i) => {
            const segPct = budget.inputBudget > 0
              ? ((seg.tokens / budget.inputBudget) * 100).toFixed(1)
              : '0'
            const open = openSeg === i
            const hasContent = !!seg.content?.trim()
            return (
              <div key={i}>
                <button
                  type="button"
                  disabled={!hasContent}
                  onClick={() => setOpenSeg(open ? null : i)}
                  className={`w-full flex items-center gap-2 text-[10px] rounded px-0.5 py-0.5 ${
                    hasContent ? 'hover:bg-bg-hover cursor-pointer' : 'cursor-default opacity-70'
                  }`}
                  title={hasContent ? t('contextBudget.viewInjected') : seg.label}
                >
                  <span className={`w-2 h-2 rounded-sm flex-shrink-0 ${LAYER_COLORS[seg.layer]}`} />
                  <span className="flex-1 text-left text-text-secondary truncate">{seg.label}</span>
                  {hasContent && <Eye className={`w-3 h-3 flex-shrink-0 ${open ? 'text-accent' : 'text-text-muted'}`} />}
                  <span className="text-text-muted tabular-nums">{formatTokenCount(seg.tokens)}</span>
                  <span className="text-text-muted tabular-nums w-10 text-right">{segPct}%</span>
                </button>
                {open && hasContent && (
                  <pre className="mt-0.5 mb-1 ml-4 max-h-48 overflow-auto whitespace-pre-wrap break-words bg-bg-elevated border border-border rounded p-2 text-[10px] leading-relaxed text-text-secondary">
                    {seg.content}
                  </pre>
                )}
              </div>
            )
          })}

          {/* 汇总 */}
          <div className="border-t border-border pt-1 mt-1 flex justify-between text-[10px]">
            <span className="text-text-muted">
              {t('contextBudget.footer', {
                maxContext: formatTokenCount(budget.maxContext),
                maxOutput: formatTokenCount(budget.maxOutput),
                safetyMargin: formatTokenCount(budget.safetyMargin),
              })}
            </span>
            <span className={colorClass}>{t('contextBudget.usedPct', { pct: pct.toFixed(0) })}</span>
          </div>
        </div>
      )}
    </div>
  )
}
