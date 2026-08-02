import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Wand2, AlertTriangle, Info, Gauge, Timer, Coins, BookOpen, ChevronDown, ChevronRight, Microscope } from 'lucide-react'
import { formatNumber } from '../../../i18n/format'
import type { ChunkPlan } from '../../../lib/import/chunker'
import type { VolumeDetectResult } from '../../../lib/import/volume-detector'
import type { WorldGroup, ReferenceAnalysisDepth } from '../../../lib/types'

interface Props {
  filename: string
  totalChars: number
  chunks: ChunkPlan[]
  chunkSize: number
  /** 本地检测到的分卷结构 */
  volumeDetect?: VolumeDetectResult | null
  /** 单块估算用时（秒），给总时预估用 */
  estSecondsPerChunk?: number
  worldGroups?: WorldGroup[]
  targetWorldGroupId?: number | null
  onTargetWorldGroupChange?: (id: number | null) => void
  onChunkSizeChange: (size: number) => void
  onConfirm: (target: 'project' | 'reference', targetWorldGroupId?: number | null, depth?: ReferenceAnalysisDepth) => void
  onCancel: () => void
}

/**
 * 解析前确认弹窗 —— Phase 18「事前请示」。
 *
 * 把 AI 要处理多少块、预计花多久、大概吃多少 tokens、会不会有风险
 * 一股脑摆给用户看，避免"点下按钮后啥都看不见"的黑盒感。
 */
export default function ImportConfirmModal({
  filename, totalChars, chunks, chunkSize,
  volumeDetect,
  estSecondsPerChunk = 35,
  worldGroups = [],
  targetWorldGroupId = null,
  onTargetWorldGroupChange,
  onChunkSizeChange,   onConfirm, onCancel,
}: Props) {
  const { t } = useTranslation('import')
  const [showStructure, setShowStructure] = useState(false)
  const [refDepth, setRefDepth] = useState<ReferenceAnalysisDepth>('quick')
  const [showExample, setShowExample] = useState(false)
  const stats = useMemo(() => {
    const totalChunks = chunks.length
    const totalSeconds = totalChunks * estSecondsPerChunk
    // 中文 token 粗估：1 字 ≈ 1 token；输入 ≈ chunkSize，输出 ≈ 3k tokens/块
    const estInputTokens = totalChars + totalChunks * 800 // + rolling context
    const estOutputTokens = totalChunks * 3000
    // 简单成本估算（以 Gemini 2.5 Flash ¥0.001/1K in, ¥0.002/1K out 的量级参考）
    const estRmbLow = (estInputTokens * 0.001 + estOutputTokens * 0.002) / 1000
    const estRmbHigh = estRmbLow * 4 // 给高价模型留 4x 余量
    return {
      totalChunks,
      totalSeconds,
      estInputTokens,
      estOutputTokens,
      estRmbLow,
      estRmbHigh,
    }
  }, [chunks, totalChars, estSecondsPerChunk])

  // 深层分析额外成本估算（浅层随解析免费,深层逐块深析:15k/块,每维 ~400 字 → ~5k 输出/块）
  const deepCost = useMemo(() => {
    const nChunks = Math.max(1, Math.ceil(totalChars / 15000))
    const inTok = nChunks * (15000 + 800)
    const outTok = nChunks * 5000
    const low = (inTok * 0.001 + outTok * 0.002) / 1000
    return { nChunks, low, high: low * 4, seconds: nChunks * estSecondsPerChunk }
  }, [totalChars, estSecondsPerChunk])
  const fmtRmb = (low: number, high: number) => `¥${low.toFixed(2)} ~ ¥${high.toFixed(2)}`

  const fmtDuration = (sec: number) => {
    if (sec < 60) return `~${sec}s`
    if (sec < 3600) return `~${Math.round(sec / 60)}min`
    const h = Math.floor(sec / 3600)
    const m = Math.round((sec % 3600) / 60)
    return `~${h}h ${m}min`
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-bg-surface border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-accent" />
            <h3 className="text-base font-semibold text-text-primary">
              {t('confirm.title')}
            </h3>
          </div>
          <button onClick={onCancel} className="p-1 hover:bg-bg-hover rounded">
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 文件概览 */}
          <div className="bg-bg-base border border-border rounded-lg p-3">
            <div className="text-xs text-text-muted mb-1">{t('confirm.file')}</div>
            <div className="text-sm text-text-primary font-medium break-all">{filename}</div>
            <div className="text-xs text-text-muted mt-1">
              {t('confirm.charsAndChunks', { chars: formatNumber(totalChars), chunks: stats.totalChunks })}
            </div>
          </div>

          {/* 分卷结构检测 */}
          {volumeDetect && (volumeDetect.hasVolumes || volumeDetect.totalChapters > 0) && (
            <div className="bg-bg-base border border-border rounded-lg p-3">
              <button
                onClick={() => setShowStructure(v => !v)}
                className="flex items-center gap-2 w-full text-left"
              >
                <BookOpen className="w-3.5 h-3.5 text-accent" />
                <span className="text-xs font-medium text-text-primary flex-1">
                  {t('confirm.structureDetected')}
                  {volumeDetect.hasVolumes
                    ? t('confirm.volumesChapters', { volumes: volumeDetect.totalVolumes, chapters: volumeDetect.totalChapters })
                    : t('confirm.chaptersNoVolumes', { chapters: volumeDetect.totalChapters })}
                </span>
                {showStructure
                  ? <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
                  : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />}
              </button>
              {showStructure && (
                <div className="mt-2 max-h-[200px] overflow-y-auto text-xs space-y-1">
                  {volumeDetect.orphanChapters.length > 0 && (
                    <div className="space-y-0.5 mb-2">
                      {volumeDetect.orphanChapters.map((ch, i) => (
                        <div key={i} className="pl-4 text-text-muted truncate">📄 {ch.title}</div>
                      ))}
                    </div>
                  )}
                  {volumeDetect.volumes.map((vol, vi) => (
                    <div key={vi}>
                      <div className="font-medium text-accent truncate">📚 {vol.title}</div>
                      {vol.chapters.map((ch, ci) => (
                        <div key={ci} className="pl-6 text-text-muted truncate">📄 {ch.title}</div>
                      ))}
                    </div>
                  ))}
                  {volumeDetect.hasVolumes && (
                    <div className="pt-1 text-text-muted italic">
                      {t('confirm.autoCreateOutline')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* chunkSize 调节 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-text-secondary flex items-center gap-1">
                <Gauge className="w-3 h-3" /> {t('confirm.charsPerChunk')}
              </label>
              <span className="text-xs text-accent font-mono">{t('confirm.charsPerChunkValue', { count: formatNumber(chunkSize) })}</span>
            </div>
            <input
              type="range"
              min={20000}
              max={80000}
              step={5000}
              value={chunkSize}
              onChange={e => onChunkSizeChange(Number(e.target.value))}
              className="w-full accent-[var(--color-accent)]"
            />
            <div className="flex justify-between text-[10px] text-text-muted mt-1">
              <span>{t('confirm.chunkSizeLow')}</span>
              <span>{t('confirm.chunkSizeRecommended')}</span>
              <span>{t('confirm.chunkSizeHigh')}</span>
            </div>
          </div>

          {/* 预估卡片 */}
          <div className="grid grid-cols-3 gap-2">
            <EstCard
              icon={Timer} label={t('confirm.estimatedTime')}
              value={fmtDuration(stats.totalSeconds)}
              hint={t('confirm.timeHint', { seconds: estSecondsPerChunk })}
            />
            <EstCard
              icon={Gauge} label={t('confirm.estimatedTokens')}
              value={`${Math.round((stats.estInputTokens + stats.estOutputTokens) / 1000)}K`}
              hint={t('confirm.inputOutput', { input: Math.round(stats.estInputTokens / 1000), output: Math.round(stats.estOutputTokens / 1000) })}
            />
            <EstCard
              icon={Coins} label={t('confirm.estimatedCost')}
              value={`¥${stats.estRmbLow.toFixed(2)} ~ ${stats.estRmbHigh.toFixed(2)}`}
              hint={t('confirm.costVaries')}
            />
          </div>

          {/* 行为说明 */}
          <div className="bg-accent/5 border border-accent/30 rounded-lg p-3 space-y-1.5 text-xs text-text-secondary leading-relaxed">
            <div className="flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
              <span><strong className="text-text-primary">{t('confirm.serialProcessing')}</strong>：{t('confirm.serialProcessingDesc')}</span>
            </div>
            <div className="flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
              <span><strong className="text-text-primary">{t('confirm.instantCommit')}</strong>：{t('confirm.instantCommitDesc')}</span>
            </div>
            <div className="flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
              <span><strong className="text-text-primary">{t('confirm.codexReviewFirst')}</strong>：{t('confirm.codexReviewFirstDesc')}</span>
            </div>
            <div className="flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
              <span><strong className="text-text-primary">{t('confirm.autoRetry')}</strong>：{t('confirm.autoRetryDesc')}</span>
            </div>
            <div className="flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
              <span><strong className="text-text-primary">{t('confirm.crossChunkMerge')}</strong>：{t('confirm.crossChunkMergeDesc')}</span>
            </div>
          </div>

          {/* 风险提示 */}
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-xs text-warning leading-relaxed flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span dangerouslySetInnerHTML={{ __html: `<strong>${t('confirm.warning')}</strong>：${t('confirm.warningText')}` }} />
          </div>
        </div>

        {/* 导入目标说明 */}
        <div className="px-5 py-3 border-t border-border bg-bg-elevated/50">
          <div className="text-xs text-text-muted mb-2">{t('confirm.afterParse')}</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-bg-base border border-accent/30 rounded-lg p-2.5">
              <div className="font-medium text-accent mb-0.5">{t('confirm.importCurrentProject')}</div>
              <div className="text-text-muted leading-relaxed">{t('confirm.importCurrentProjectDesc')}</div>
              {worldGroups.length > 0 && (
                <label className="block mt-2">
                  <span className="block text-[10px] text-text-muted mb-1">{t('confirm.targetWorld')}</span>
                  <select
                    value={targetWorldGroupId ?? ''}
                    onChange={e => onTargetWorldGroupChange?.(e.target.value ? Number(e.target.value) : null)}
                    className="w-full rounded border border-border bg-bg-surface px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent"
                  >
                    {worldGroups.map(group => (
                      <option key={group.id} value={group.id}>
                        {group.icon ? `${group.icon} ` : ''}{group.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="bg-bg-base border border-purple-400/30 rounded-lg p-2.5">
              <div className="font-medium text-purple-400 mb-0.5">{t('confirm.importReference')}</div>
              <div className="text-text-muted leading-relaxed mb-2">{t('confirm.importReferenceDesc')}<span className="text-text-secondary">{t('confirm.importReferenceAnalysis')}</span>，{t('confirm.chooseDepth')}</div>
              {/* 浅 / 深 档位 */}
              <div className="space-y-1.5">
                {([
                  { key: 'quick' as const, nameKey: 'confirm.shallowQuick', descKey: 'confirm.shallowQuickDesc', costKey: 'confirm.shallowQuickCost', time: '' },
                  { key: 'deep' as const, nameKey: 'confirm.deepTemplate', descKey: 'confirm.deepTemplateDesc', cost: fmtRmb(deepCost.low, deepCost.high), time: fmtDuration(deepCost.seconds) },
                ] as const).map(opt => (
                  <label key={opt.key} className={`block rounded border p-1.5 cursor-pointer transition-colors ${refDepth === opt.key ? 'border-purple-400 bg-purple-400/10' : 'border-border hover:border-purple-400/40'}`}>
                    <div className="flex items-center gap-1.5">
                      <input type="radio" name="refDepth" checked={refDepth === opt.key} onChange={() => setRefDepth(opt.key)} className="accent-purple-400" />
                      <span className="text-[11px] font-medium text-text-primary">{t(opt.nameKey)}</span>
                    </div>
                    <div className="pl-5 text-[10px] text-text-muted leading-snug">{t(opt.descKey)}</div>
                    <div className="pl-5 text-[10px]"><span className="text-amber-400">{'cost' in opt ? opt.cost : t(opt.costKey)}</span>{'time' in opt && opt.time && <span className="text-text-muted"> · {opt.time}</span>}</div>
                  </label>
                ))}
              </div>
              <button onClick={() => setShowExample(v => !v)} className="mt-1.5 flex items-center gap-0.5 text-[10px] text-purple-400 hover:underline">
                <Microscope className="w-3 h-3" /> {showExample ? t('confirm.hideExample') : t('confirm.showExample')}
              </button>
              {showExample && (
                <div className="mt-1 text-[10px] leading-relaxed bg-bg-surface rounded p-2 space-y-1.5 border border-border">
                  <div className="text-text-muted">{t('confirm.exampleIntro')}</div>
                  <div><span className="text-green-400 font-medium">{t('confirm.shallowQuick')}</span>：{t('confirm.shallowQuickExample')}</div>
                  <div><span className="text-red-400 font-medium">{t('confirm.deepTemplate')}</span>：{t('confirm.deepTemplateExample')}<span className="text-text-muted">{t('confirm.citationNote')}</span></div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer：按钮左右对齐上方卡片（导入当前项目=左，取消居中，导入项目参考=右） */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border bg-bg-base">
          <button
            onClick={() => onConfirm('project', targetWorldGroupId)}
            className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-sm rounded hover:bg-accent-hover"
          >
            <Wand2 className="w-4 h-4" /> {t('confirm.importCurrentProjectBtn', { chunks: stats.totalChunks })}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-text-secondary hover:bg-bg-hover rounded"
          >
            {t('confirm.cancel')}
          </button>
          <button
            onClick={() => onConfirm('reference', null, refDepth)}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-500/80 text-white text-sm rounded hover:bg-purple-500 transition-colors"
          >
            {refDepth === 'deep' ? t('confirm.importReferenceBtnDeep') : t('confirm.importReferenceBtnShallow')}
          </button>
        </div>
      </div>
    </div>
  )
}

function EstCard({
  icon: Icon, label, value, hint,
}: {
  icon: typeof Info; label: string; value: string; hint?: string
}) {
  return (
    <div className="bg-bg-base border border-border rounded-lg p-3">
      <div className="flex items-center gap-1 text-[10px] text-text-muted mb-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-sm font-semibold text-text-primary">{value}</div>
      {hint && <div className="text-[10px] text-text-muted mt-0.5">{hint}</div>}
    </div>
  )
}
