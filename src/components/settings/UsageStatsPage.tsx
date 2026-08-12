/**
 * AI 消耗统计页 — 设置区
 *
 * 展示每次 AI 调用：时间 / 消耗类型(标签) / 输入 / 输出 / 花费(美元上·人民币下)。
 * 顶部汇总：总输入/输出/总花费；可调美元→人民币汇率；可清空。
 */
import { useEffect, useMemo, useState } from 'react'
import { Trash2, RefreshCw, Coins } from 'lucide-react'
import { useAIUsageStore } from '../../stores/ai-usage'
import { categoryMeta, getUsdCnyRate, setUsdCnyRate } from '../../lib/ai/usage-log'
import type { Project } from '../../lib/types'
import { useDialog } from '../shared/Dialog'
import { useDomainT } from '../../i18n'

interface Props {
  project?: Project
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function fmtUsd(n: number): string {
  return '$' + n.toFixed(n < 0.01 ? 6 : 4)
}
function fmtCny(n: number): string {
  return '¥' + n.toFixed(n < 0.01 ? 4 : 2)
}

const TASK_KIND_LABEL_KEYS: Record<string, string> = {
  creation: 'usageStats.taskKindLabels.creation',
  extraction: 'usageStats.taskKindLabels.extraction',
  analysis: 'usageStats.taskKindLabels.analysis',
  review: 'usageStats.taskKindLabels.review',
  'agent-orchestrator': 'usageStats.taskKindLabels.agentOrchestrator',
  'agent-world-origin': 'usageStats.taskKindLabels.agentWorldOrigin',
  'agent-character': 'usageStats.taskKindLabels.agentCharacter',
  'agent-inspiration': 'usageStats.taskKindLabels.agentInspiration',
  'agent-outline': 'usageStats.taskKindLabels.agentOutline',
  'agent-prose': 'usageStats.taskKindLabels.agentProse',
} as const

export default function UsageStatsPage({ project }: Props) {
  const { t } = useDomainT('settings')
  const dialog = useDialog()
  const { entries, loading, loadAll, clearAll } = useAIUsageStore()
  const [rate, setRate] = useState(getUsdCnyRate())
  const [scopeProject, setScopeProject] = useState(true)

  useEffect(() => {
    loadAll(scopeProject ? (project?.id ?? null) : null)
  }, [loadAll, scopeProject, project?.id])

  const totals = useMemo(() => {
    return entries.reduce(
      (acc, e) => {
        acc.input += e.inputTokens
        acc.output += e.outputTokens
        acc.usd += e.costUsd
        acc.count += 1
        return acc
      },
      { input: 0, output: 0, usd: 0, count: 0 },
    )
  }, [entries])

  const handleRateChange = (v: string) => {
    const n = Number(v)
    if (n > 0) { setRate(n); setUsdCnyRate(n) }
  }

  const handleClear = async () => {
    const ok = await dialog.confirm({
      title: t('usageStats.clearTitle'),
      message: t('usageStats.clearMessage'),
      confirmText: t('usageStats.clear'),
      tone: 'danger',
    })
    if (ok) clearAll(scopeProject ? (project?.id ?? null) : null)
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Coins className="w-5 h-5 text-accent" />
        <h2 className="text-xl font-bold text-text-primary">{t('usageStats.title')}</h2>
        <span className="text-xs text-text-muted">{t('usageStats.callsCount', { count: totals.count })}</span>
        <div className="ml-auto flex items-center gap-3">
          <label className="text-xs text-text-muted flex items-center gap-1">
            {t('usageStats.exchangeRate')}
            <input
              type="number" value={rate} step="0.1" min="0.1"
              onChange={e => handleRateChange(e.target.value)}
              className="w-16 px-1.5 py-1 rounded bg-bg-elevated border border-border text-text-primary text-xs"
            />
            ¥
          </label>
          <label className="text-xs text-text-muted flex items-center gap-1">
            <input type="checkbox" checked={scopeProject} onChange={e => setScopeProject(e.target.checked)} />
            {t('usageStats.currentProjectOnly')}
          </label>
          <button
            onClick={() => loadAll(scopeProject ? (project?.id ?? null) : null)}
            className="text-xs text-text-muted hover:text-text-primary inline-flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" /> {t('usageStats.refresh')}
          </button>
          <button
            onClick={() => { void handleClear() }}
            className="text-xs text-red-400 hover:text-red-300 inline-flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" /> {t('usageStats.clear')}
          </button>
        </div>
      </div>

      {/* 汇总卡 */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label={t('usageStats.totalInputTokens')} value={totals.input.toLocaleString()} />
        <SummaryCard label={t('usageStats.totalOutputTokens')} value={totals.output.toLocaleString()} />
        <SummaryCard
          label={t('usageStats.totalCost')}
          value={fmtUsd(totals.usd)}
          sub={fmtCny(totals.usd * rate)}
        />
      </div>

      {/* 明细表 */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-elevated text-text-muted text-xs">
              <th className="text-left font-medium px-3 py-2">{t('usageStats.timeColumn')}</th>
              <th className="text-left font-medium px-3 py-2">{t('usageStats.categoryColumn')}</th>
              <th className="text-left font-medium px-3 py-2">{t('usageStats.modelColumn')}</th>
              <th className="text-right font-medium px-3 py-2">{t('usageStats.inputColumn')}</th>
              <th className="text-right font-medium px-3 py-2">{t('usageStats.outputColumn')}</th>
              <th className="text-right font-medium px-3 py-2">{t('usageStats.costColumn')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="text-center text-text-muted py-6">{t('usageStats.loading')}</td></tr>
            )}
            {!loading && entries.length === 0 && (
              <tr><td colSpan={6} className="text-center text-text-muted py-8">{t('usageStats.empty')}</td></tr>
            )}
            {entries.map(e => {
              const meta = categoryMeta(e.category)
              return (
                <tr key={e.id} className="border-t border-border/50 hover:bg-bg-hover/50">
                  <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{fmtTime(e.timestamp)}</td>
                  <td className="px-3 py-2">
                    <span
                      className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                      style={{ backgroundColor: meta.color + '22', color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-text-muted text-xs whitespace-nowrap max-w-[180px]" title={`${e.provider ?? ''} ${e.model}`}>
                    <div className="truncate">{e.model}</div>
                    {(e.provider || e.taskKind) && (
                      <div className="truncate text-[10px] text-text-muted/70">
                        {[e.provider, e.taskKind ? t(TASK_KIND_LABEL_KEYS[e.taskKind] as any) : null].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-text-secondary tabular-nums">{e.inputTokens.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-text-secondary tabular-nums">{e.outputTokens.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    <div className="text-text-primary">{fmtUsd(e.costUsd)}</div>
                    <div className="text-text-muted text-xs">{fmtCny(e.costUsd * rate)}</div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-text-muted leading-relaxed">
        {t('usageStats.footer')}
      </p>
    </div>
  )
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg-surface p-4">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className="text-lg font-semibold text-text-primary tabular-nums">{value}</div>
      {sub && <div className="text-sm text-text-muted tabular-nums">{sub}</div>}
    </div>
  )
}
