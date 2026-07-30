import { CTextarea } from '../shared/CompositionInput'
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X, Sparkles, Microscope, Check } from 'lucide-react'
import { useCreativeRulesStore } from '../../stores/project-singletons'
import { useWorldviewStore } from '../../stores/worldview'
import { useReferenceStore } from '../../stores/reference'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { buildRulesGeneratePrompt } from '../../lib/ai/adapters/rules-adapter'
import { adopt } from '../../lib/registry/adopt'
import AIStreamOutput from '../shared/AIStreamOutput'
import type { Project, NarrativePOV } from '../../lib/types'

const POV_OPTIONS: { value: NarrativePOV; labelKey: string; descKey: string }[] = [
  { value: 'first-person', labelKey: 'rules.pov.firstPerson', descKey: 'rules.pov.firstPersonDesc' },
  { value: 'third-limited', labelKey: 'rules.pov.thirdLimited', descKey: 'rules.pov.thirdLimitedDesc' },
  { value: 'third-omniscient', labelKey: 'rules.pov.thirdOmniscient', descKey: 'rules.pov.thirdOmniscientDesc' },
  { value: 'multi-pov', labelKey: 'rules.pov.multiPOV', descKey: 'rules.pov.multiPOVDesc' },
]

interface Props {
  project: Project
}

export default function CreativeRulesPanel({ project }: Props) {
  const { t } = useTranslation('panels')
  const { creativeRules, loadAll, save } = useCreativeRulesStore()
  const { worldview, storyCore, loadAll: loadWorldview } = useWorldviewStore()
  const { references, loadAll: loadRefs } = useReferenceStore()
  const [writingStyle, setWritingStyle] = useState('')
  const [narrativePOV, setNarrativePOV] = useState<NarrativePOV>('third-limited')
  const [toneAndMood, setToneAndMood] = useState('')
  const [prohibitions, setProhibitions] = useState<string[]>([])
  const [consistencyRules, setConsistencyRules] = useState<string[]>([])
  const [specialRequirements, setSpecialRequirements] = useState('')
  const [referenceWorks, setReferenceWorks] = useState<string[]>([])
  const [citedRefIds, setCitedRefIds] = useState<number[]>([])
  const [aiTarget, setAiTarget] = useState<'writingStyle' | 'toneAndMood' | 'specialRequirements' | null>(null)
  const ai = useAIStream(createAISessionKey(project.id!, 'rules.generate'))
  const currentAITarget = (ai.operation as typeof aiTarget) ?? aiTarget

  useEffect(() => {
    loadAll(project.id!)
    loadWorldview(project.id!)
    loadRefs(project.id!)
  }, [project.id, loadAll, loadWorldview, loadRefs])

  useEffect(() => {
    if (creativeRules) {
      setWritingStyle(creativeRules.writingStyle || '')
      setNarrativePOV(creativeRules.narrativePOV || 'third-limited')
      setToneAndMood(creativeRules.atmosphere || creativeRules.toneAndMood || '')
      setSpecialRequirements(creativeRules.specialRequirements || '')
      try { setProhibitions(JSON.parse(creativeRules.prohibitions || '[]')) } catch { setProhibitions([]) }
      try { setConsistencyRules(JSON.parse(creativeRules.consistencyRules || '[]')) } catch { setConsistencyRules([]) }
      try { setReferenceWorks(JSON.parse(creativeRules.referenceWorks || '[]')) } catch { setReferenceWorks([]) }
      try { setCitedRefIds(JSON.parse(creativeRules.citedReferenceIds || '[]')) } catch { setCitedRefIds([]) }
    }
  }, [creativeRules])

  const saveField = useCallback(async (data: Record<string, unknown>) => {
    await save({ projectId: project.id!, ...data })
  }, [project.id, save])

  /** AI 生成某字段：调 rules.generate 模板 */
  const generateField = (target: 'writingStyle' | 'toneAndMood' | 'specialRequirements') => {
    const dimensionMap = {
      writingStyle: t('rules.dimension.writingStyle' as any),
      toneAndMood: t('rules.dimension.toneAndMood' as any),
      specialRequirements: t('rules.dimension.specialRequirements' as any),
    }
    setAiTarget(target)
    ai.setOperation(target)
    const messages = buildRulesGeneratePrompt(
      dimensionMap[target],
      project.name,
      project.genre || '',
      worldview?.summary || worldview?.worldOrigin?.slice(0, 200) || '',
      storyCore?.theme || storyCore?.centralConflict || '',
    )
    ai.start(messages, undefined, { category: 'rules.generate', projectId: project.id! })
  }

  const acceptAi = async (text: string) => {
    if (!currentAITarget) return
    if (currentAITarget === 'writingStyle') setWritingStyle(text)
    else if (currentAITarget === 'toneAndMood') setToneAndMood(text)
    else if (currentAITarget === 'specialRequirements') setSpecialRequirements(text)
    await adopt({
      projectId: project.id!,
      target: 'creativeRules',
      mode: 'replace',
      data: { [currentAITarget]: text },
    })
    await loadAll(project.id!)
    ai.reset()
    setAiTarget(null)
  }

  /* ---- 列表操作通用 ---- */
  const handleAddToList = (
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    field: string,
  ) => {
    const updated = [...list, '']
    setList(updated)
    saveField({ [field]: JSON.stringify(updated) })
  }

  const handleUpdateListItem = (
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    _field: string,
    index: number,
    value: string,
  ) => {
    const updated = [...list]
    updated[index] = value
    setList(updated)
    // 仅 blur 时保存，这里先更新本地
  }

  const handleBlurListItem = (
    list: string[],
    field: string,
  ) => {
    saveField({ [field]: JSON.stringify(list) })
  }

  const handleRemoveListItem = (
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    field: string,
    index: number,
  ) => {
    const updated = list.filter((_, i) => i !== index)
    setList(updated)
    saveField({ [field]: JSON.stringify(updated) })
  }

  /* ---- 列表渲染 ---- */
  const renderList = (
    title: string,
    placeholder: string,
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    field: string,
  ) => (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-text-secondary">{title} ({list.length})</label>
        <button
          onClick={() => handleAddToList(list, setList, field)}
          className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('rules.creative.add' as any)}
        </button>
      </div>
      {list.length === 0 ? (
        <p className="text-text-muted text-xs py-3 text-center border border-dashed border-border rounded-lg">{t('rules.creative.empty' as any)}</p>
      ) : (
        <div className="space-y-1.5">
          {list.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                value={item}
                onChange={e => handleUpdateListItem(list, setList, field, idx, e.target.value)}
                onBlur={() => handleBlurListItem(list, field)}
                placeholder={placeholder}
                className="flex-1 px-2 py-1.5 bg-bg-surface border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent"
              />
              <button
                onClick={() => handleRemoveListItem(list, setList, field, idx)}
                className="p-1 text-text-muted hover:text-red-400 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="max-w-4xl">
      <h2 className="text-xl font-bold text-text-primary mb-4">{t('rules.creative.title' as any)}</h2>

      {/* 写作风格 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-text-secondary">{t('rules.creative.writingStyle' as any)}</label>
          <button
            onClick={() => generateField('writingStyle')}
            disabled={ai.isStreaming}
            className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3 h-3" /> {t('rules.creative.aiSuggest' as any)}
          </button>
        </div>
        <CTextarea
          value={writingStyle}
          onChange={e => setWritingStyle(e.target.value)}
          onBlur={() => saveField({ writingStyle })}
          placeholder={t('rules.creative.writingStylePlaceholder' as any)}
          className="w-full h-24 p-3 bg-bg-surface border border-border rounded-lg text-text-primary text-sm resize-y focus:outline-none focus:border-accent"
        />
        {currentAITarget === 'writingStyle' && (ai.output || ai.isStreaming || ai.error) && (
          <div className="mt-2">
            <AIStreamOutput
              output={ai.output} isStreaming={ai.isStreaming} error={ai.error} tokenUsage={ai.tokenUsage}
              onStop={ai.stop} onAccept={acceptAi}
              onRetry={() => generateField('writingStyle')}
            />
          </div>
        )}
      </div>

      {/* 叙事视角 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-text-secondary mb-2">{t('rules.creative.narrativePOV' as any)}</label>
        <div className="grid grid-cols-2 gap-2">
          {POV_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => {
                setNarrativePOV(opt.value)
                saveField({ narrativePOV: opt.value })
              }}
              className={`p-3 rounded-lg border text-left transition-all ${
                narrativePOV === opt.value
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-bg-surface hover:border-text-muted'
              }`}
            >
              <div className="text-sm font-medium text-text-primary">{t(opt.labelKey as any)}</div>
              <div className="text-xs text-text-muted mt-0.5">{t(opt.descKey as any)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 基调和氛围 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-text-secondary">{t('rules.creative.toneAndMood' as any)}</label>
          <button
            onClick={() => generateField('toneAndMood')}
            disabled={ai.isStreaming}
            className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3 h-3" /> {t('rules.creative.aiSuggest' as any)}
          </button>
        </div>
        <CTextarea
          value={toneAndMood}
          onChange={e => setToneAndMood(e.target.value)}
          onBlur={() => saveField({ toneAndMood })}
          placeholder={t('rules.creative.tonePlaceholder' as any)}
          className="w-full h-20 p-3 bg-bg-surface border border-border rounded-lg text-text-primary text-sm resize-y focus:outline-none focus:border-accent"
        />
        {currentAITarget === 'toneAndMood' && (ai.output || ai.isStreaming || ai.error) && (
          <div className="mt-2">
            <AIStreamOutput
              output={ai.output} isStreaming={ai.isStreaming} error={ai.error} tokenUsage={ai.tokenUsage}
              onStop={ai.stop} onAccept={acceptAi}
              onRetry={() => generateField('toneAndMood')}
            />
          </div>
        )}
      </div>

      {/* 禁止事项 */}
      {renderList(t('rules.creative.prohibitions' as any), t('rules.creative.prohibitionsPlaceholder' as any), prohibitions, setProhibitions, 'prohibitions')}

      {/* 一致性规则 */}
      {renderList(t('rules.creative.consistencyRules' as any), t('rules.creative.consistencyPlaceholder' as any), consistencyRules, setConsistencyRules, 'consistencyRules')}

      {/* 参考作品 */}
      {renderList(t('rules.creative.referenceWorks' as any), t('rules.creative.referencePlaceholder' as any), referenceWorks, setReferenceWorks, 'referenceWorks')}

      {/* 引用手法 —— Phase 20 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-text-secondary flex items-center gap-1.5">
            <Microscope className="w-3.5 h-3.5 text-accent" />
            {t('rules.creative.citationMethod' as any)}
          </label>
          <span className="text-[10px] text-text-muted">
            {t('rules.creative.citationDesc' as any)}
          </span>
        </div>
        {(() => {
          const analyzedRefs = references.filter(r => r.analysisStatus === 'done')
          if (analyzedRefs.length === 0) {
            return (
              <p className="text-text-muted text-xs py-3 text-center border border-dashed border-border rounded-lg">
                {t('rules.creative.noAnalyzedRefs' as any)}
              </p>
            )
          }
          return (
            <div className="space-y-1">
              {analyzedRefs.map(ref => {
                const checked = citedRefIds.includes(ref.id!)
                return (
                  <button
                    key={ref.id}
                    onClick={() => {
                      const next = checked
                        ? citedRefIds.filter(id => id !== ref.id!)
                        : [...citedRefIds, ref.id!]
                      setCitedRefIds(next)
                      saveField({ citedReferenceIds: JSON.stringify(next) })
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all border ${
                      checked
                        ? 'border-accent/40 bg-accent/8'
                        : 'border-border hover:border-text-muted bg-bg-surface'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                      checked ? 'bg-accent border-accent' : 'border-border'
                    }`}>
                      {checked && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-text-primary">{ref.title}</span>
                      {ref.author && <span className="text-xs text-text-muted ml-1.5">— {ref.author}</span>}
                    </div>
                    {ref.totalChars && (
                      <span className="text-[10px] text-text-muted shrink-0">
                        {t('rules.creative.charCount' as any, { count: (ref.totalChars / 10000).toFixed(1) } as any)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })()}
      </div>

      {/* 特殊创作要求 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-text-secondary">{t('rules.creative.specialRequirements' as any)}</label>
          <button
            onClick={() => generateField('specialRequirements')}
            disabled={ai.isStreaming}
            className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3 h-3" /> {t('rules.creative.aiSuggest' as any)}
          </button>
        </div>
        <CTextarea
          value={specialRequirements}
          onChange={e => setSpecialRequirements(e.target.value)}
          onBlur={() => saveField({ specialRequirements })}
          placeholder={t('rules.creative.specialPlaceholder' as any)}
          className="w-full h-24 p-3 bg-bg-surface border border-border rounded-lg text-text-primary text-sm resize-y focus:outline-none focus:border-accent"
        />
        {currentAITarget === 'specialRequirements' && (ai.output || ai.isStreaming || ai.error) && (
          <div className="mt-2">
            <AIStreamOutput
              output={ai.output} isStreaming={ai.isStreaming} error={ai.error} tokenUsage={ai.tokenUsage}
              onStop={ai.stop} onAccept={acceptAi}
              onRetry={() => generateField('specialRequirements')}
            />
          </div>
        )}
      </div>
    </div>
  )
}
