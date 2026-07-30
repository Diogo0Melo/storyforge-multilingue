import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Sparkles, ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react'
import { useAIStream } from '../../../hooks/useAIStream'
import { useAIConfigStore } from '../../../stores/ai-config'
import { getAIConfigRequiredMessage, isAIConfigReady } from '../../../lib/ai/config-readiness'
import { resolveRequestConfig } from '../../../lib/ai/client'
import type { PromptTemplate, PromptExample } from '../../../lib/types/prompt'
import { useDialog } from '../../shared/Dialog'
import { useToast } from '../../shared/Toast'

interface Props {
  template: PromptTemplate
  onChange: (next: { good?: PromptExample[]; bad?: PromptExample[] }) => void
  readOnly?: boolean
}

/**
 * 模板编辑器中的"示例 / 反例"区。
 * 用户可以：
 *  - 手动添加示例（粘贴优秀输出/避免输出）
 *  - 让 AI 自动生成几条示例（基于当前模板的 systemPrompt 反推）
 *  - 删除示例
 *
 * 示例会自动被 prompt-engine 拼到 user prompt 末尾作为 few-shot 参考。
 */
export default function PromptExamplesEditor({ template, onChange, readOnly }: Props) {
  const { t } = useTranslation('settings')
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
      title: kind === 'good' ? t('prompt.examples.addGoodTitle') : t('prompt.examples.addBadTitle'),
      message: t('prompt.examples.addMessage'),
      placeholder: t('prompt.examples.addPlaceholder'),
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

  /** 让 AI 自动生成示例：用 meta-prompt 让 AI 基于模板生成 2 条示例 */
  const generateWithAI = async (kind: 'good' | 'bad') => {
    if (readOnly) return
    const effectiveConfig = resolveRequestConfig(aiConfig, { category: 'prompt.examples' }).config
    if (!isAIConfigReady(effectiveConfig)) {
      toast.error(getAIConfigRequiredMessage(effectiveConfig))
      return
    }
    setGeneratingFor(kind)

    const metaPrompt = kind === 'good'
      ? t('prompt.examples.metaPromptGoodUser', { systemPrompt: template.systemPrompt, userPromptTemplate: template.userPromptTemplate })
      : t('prompt.examples.metaPromptBadUser', { systemPrompt: template.systemPrompt })

    try {
      const result = await ai.start([
        { role: 'system', content: t('prompt.examples.metaPromptGoodSystem') },
        { role: 'user', content: metaPrompt },
      ], undefined, { category: 'prompt.examples' })
      // 解析输出
      const parts = result.split(/===EXAMPLE===/i).map(s => s.trim()).filter(Boolean)
      const newExamples: PromptExample[] = parts.slice(0, 3).map(t => ({
        id: `ex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: t,
        source: 'ai-generated',
        rating: kind === 'good' ? 4 : 2,
        createdAt: Date.now(),
      }))
      if (newExamples.length === 0) {
        toast.error(t('prompt.examples.aiGenerated'))
      } else {
        onChange({
          ...examples,
          [kind]: [...(kind === 'good' ? good : bad), ...newExamples],
        })
      }
    } catch (e) {
      toast.error(t('prompt.examples.generateFailed', { error: e instanceof Error ? e.message : String(e) }))
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
    const label = kind === 'good' ? t('prompt.examples.goodLabel') : t('prompt.examples.badLabel')
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
                title={t('prompt.examples.manualTitle')}
              >
                <Plus className="w-3 h-3" /> {t('prompt.examples.manual')}
              </button>
              <button
                onClick={() => generateWithAI(kind)}
                disabled={isGenerating || ai.isStreaming}
                className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded disabled:opacity-50"
                title={t('prompt.examples.aiGenerateTitle')}
              >
                {isGenerating
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Sparkles className="w-3 h-3" />}
                {t('prompt.examples.aiGenerate')}
              </button>
            </div>
          )}
        </div>

        {list.length === 0 ? (
          <p className={`text-xs text-text-muted py-2 px-3 border border-dashed border-border rounded ${bgClass}`}>
            {kind === 'good' ? t('prompt.examples.emptyGood') : t('prompt.examples.emptyBad')}{!readOnly ? t('prompt.examples.emptyHint') : ''}
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
                      {ex.source === 'ai-generated' ? t('prompt.examples.sourceAi') : ex.source === 'user-marked' ? t('prompt.examples.sourceUser') : t('prompt.examples.sourceManual')}
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
          {t('prompt.examples.title')} <span className="text-text-muted text-xs">（{t('prompt.examples.subtitle')}）</span>
        </label>
        <span className="text-xs text-text-muted">
          {t('prompt.examples.legend')}
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
      <p className="mt-3 text-xs text-text-muted">
        {t('prompt.examples.hint')}
      </p>
    </div>
  )
}
