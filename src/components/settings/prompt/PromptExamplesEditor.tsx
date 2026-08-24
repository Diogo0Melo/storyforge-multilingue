import { useState } from 'react'
import { Plus, Trash2, Sparkles, ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react'
import { useAIStream } from '../../../hooks/useAIStream'
import { useAIConfigStore } from '../../../stores/ai-config'
import { getAIConfigRequiredMessage, isAIConfigReady } from '../../../lib/ai/config-readiness'
import { resolveRequestConfig } from '../../../lib/ai/client'
import type { PromptTemplate, PromptExample } from '../../../lib/types/prompt'
import { useDialog } from '../../shared/Dialog'
import { useToast } from '../../shared/Toast'
import { useDomainT } from '../../../i18n'

interface Props {
  template: PromptTemplate
  onChange: (next: { good?: PromptExample[]; bad?: PromptExample[] }) => void
  readOnly?: boolean
}

export default function PromptExamplesEditor({ template, onChange, readOnly }: Props) {
  const { t } = useDomainT('settings')
  const dialog = useDialog()
  const toast = useToast()
  const ai = useAIStream()
  const aiConfig = useAIConfigStore(s => s.config)
  const [generatingFor, setGeneratingFor] = useState<'good' | 'bad' | null>(null)

  const examples = template.examples || {}
  const good = examples.good || []
  const bad = examples.bad || []

  const addManual = async (kind: 'good' | 'bad') => {
    if (readOnly) return
    const text = await dialog.prompt({
      title: kind === 'good' ? t('promptExamples.addGoodTitle') : t('promptExamples.addBadTitle'),
      message: t('promptExamples.addMessage'),
      placeholder: t('promptExamples.addPlaceholder'),
    })
    if (!text || !text.trim()) return
    const ex: PromptExample = {
      id: `ex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: text.trim(),
      source: 'system',
      rating: kind === 'good' ? 5 : 1,
      createdAt: Date.now(),
    }
    onChange({
      ...examples,
      [kind]: [...(kind === 'good' ? good : bad), ex],
    })
  }

  const remove = (kind: 'good' | 'bad', id: string) => {
    if (readOnly) return
    onChange({
      ...examples,
      [kind]: (kind === 'good' ? good : bad).filter(e => e.id !== id),
    })
  }

  const generateWithAI = async (kind: 'good' | 'bad') => {
    if (readOnly) return
    const effectiveConfig = resolveRequestConfig(aiConfig, { category: 'prompt.examples' }).config
    if (!isAIConfigReady(effectiveConfig)) {
      toast.error(getAIConfigRequiredMessage(effectiveConfig))
      return
    }
    setGeneratingFor(kind)

    const metaPrompt = kind === 'good'
      ? `请根据以下提示词模板，生成 2 条"好示例" — 即用户调用此模板时，AI 应该输出的高质量内容样本。

模板的 system prompt：
"""
${template.systemPrompt}
"""

模板的 user prompt 模板：
"""
${template.userPromptTemplate}
"""

要求：
1. 每条示例独立成段，用 "===EXAMPLE===" 分隔
2. 每条示例要简短但有代表性（200-400 字）
3. 真实贴合模板的风格定位，不是空泛套话
4. 不要包含说明文字，只输出示例内容`
      : `请根据以下提示词模板，生成 2 条"反例" — 即用户调用此模板时，AI 应该避免的低质量输出样本。

模板的 system prompt：
"""
${template.systemPrompt}
"""

要求：
1. 每条反例独立成段，用 "===EXAMPLE===" 分隔
2. 每条反例要展现"该模板希望避免的问题"（如：泛泛而谈 / 套路化 / 偏题 / 空洞 / 文风不符）
3. 简短：100-300 字
4. 不要包含说明文字，只输出反例内容`

    try {
      // fix-5a 显式例外：示例是模板受控/源保留的提示词数据，不是 StoryForge 内容散文
      // → language-neutral（gate 不注入文本语言约束）。===EXAMPLE=== 分隔协议与规范示例
      // 元数据（id/text/source/rating/createdAt）保持稳定；解析不做后置翻译。
      const result = await ai.start([
        { role: 'system', content: '你是一位提示词工程师助手，擅长为提示词模板生成示例数据。' },
        { role: 'user', content: metaPrompt },
      ], undefined, { category: 'prompt.examples', outputKind: 'language-neutral' })
      const parts = result.split(/===EXAMPLE===/i).map(s => s.trim()).filter(Boolean)
      const newExamples: PromptExample[] = parts.slice(0, 3).map(t => ({
        id: `ex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: t,
        source: 'ai-generated',
        rating: kind === 'good' ? 4 : 2,
        createdAt: Date.now(),
      }))
      if (newExamples.length === 0) {
        toast.error(t('promptExamples.noExamplesError'))
      } else {
        onChange({
          ...examples,
          [kind]: [...(kind === 'good' ? good : bad), ...newExamples],
        })
        toast.info(t('promptExamples.tip'))
      }
    } catch (e) {
      toast.error(t('promptExamples.generateError', { error: e instanceof Error ? e.message : String(e) }))
    } finally {
      setGeneratingFor(null)
      ai.reset()
    }
  }

  const renderList = (kind: 'good' | 'bad') => {
    const list = kind === 'good' ? good : bad
    const Icon = kind === 'good' ? ThumbsUp : ThumbsDown
    const colorClass = kind === 'good' ? 'text-success' : 'text-error'
    const bgClass = kind === 'good' ? 'bg-success/5 border-success/20' : 'bg-error/5 border-error/20'
    const label = kind === 'good' ? t('promptExamples.goodLabel') : t('promptExamples.badLabel')
    const isGenerating = generatingFor === kind

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Icon className={`w-3.5 h-3.5 ${colorClass}`} />
            <span className="text-sm font-medium text-text-primary">
              {label} <span className="text-text-muted text-xs">({list.length})</span>
            </span>
          </div>
          {!readOnly && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => { void addManual(kind) }}
                className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded"
                title={t('promptExamples.manualAddTitle')}
              >
                <Plus className="w-3 h-3" /> {t('promptExamples.manualAdd')}
              </button>
              <button
                onClick={() => generateWithAI(kind)}
                disabled={isGenerating || ai.isStreaming}
                className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded disabled:opacity-50"
                title={t('promptExamples.aiGenerateTitle')}
              >
                {isGenerating
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Sparkles className="w-3 h-3" />}
                {t('promptExamples.aiGenerate')}
              </button>
            </div>
          )}
        </div>

        {list.length === 0 ? (
          <p className={`text-xs text-text-muted py-2 px-3 border border-dashed border-border rounded ${bgClass}`}>
            {t(kind === 'good' ? 'promptExamples.emptyGood' : 'promptExamples.emptyBad')} {!readOnly && t('promptExamples.emptyEditableSuffix')}
          </p>
        ) : (
          <div className="space-y-1.5">
            {list.map(ex => (
              <div key={ex.id} className={`px-2 py-1.5 border rounded text-xs ${bgClass}`}>
                <div className="flex items-start gap-2">
                  <pre className="flex-1 whitespace-pre-wrap text-text-primary font-sans line-clamp-3" title={ex.text}>
                    {ex.text}
                  </pre>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-[10px] text-text-muted">
                      {ex.source === 'ai-generated' ? '🤖' : ex.source === 'user-marked' ? '👤' : '✍️'}
                    </span>
                    {!readOnly && (
                      <button
                        onClick={() => remove(kind, ex.id)}
                        className="p-0.5 text-text-muted hover:text-error"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-bg-surface border border-border rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <label className="text-sm font-medium text-text-primary">
          {t('promptExamples.title')} <span className="text-text-muted text-xs">{t('promptExamples.titleHint')}</span>
        </label>
        <span className="text-xs text-text-muted">
          {t('promptExamples.sourceLegend')}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {renderList('good')}
        {renderList('bad')}
      </div>
      {ai.tokenUsage && !ai.isStreaming && (
        <div className="mt-2 text-[10px] text-text-muted">
          Token: ↑{ai.tokenUsage.inputTokens.toLocaleString()} ↓{ai.tokenUsage.outputTokens.toLocaleString()}
        </div>
      )}
      {!readOnly && (
        <p className="mt-3 text-xs text-text-muted">
          {t('promptExamples.draftNotice')}
        </p>
      )}
      <p className="mt-2 text-xs text-text-muted">
        {t('promptExamples.tip')}
      </p>
    </div>
  )
}
