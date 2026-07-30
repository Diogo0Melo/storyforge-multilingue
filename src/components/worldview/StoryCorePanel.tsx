import { useState, useEffect, useCallback, useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWorldviewStore } from '../../stores/worldview'
import { useWorldGroupStore } from '../../stores/world-group'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { buildStoryGeneratePrompt } from '../../lib/ai/adapters/story-adapter'
import AIStreamOutput from '../shared/AIStreamOutput'
import PromptRunPanel from '../shared/PromptRunPanel'
import { InlineTextarea } from '../shared/InlineEdit'
import AIFieldModeTabs from '../shared/AIFieldModeTabs'
import { assembleContext } from '../../lib/registry/assemble-context'
import type { Project } from '../../lib/types'
import type { FieldGenerationMode } from '../../lib/ai/field-generation-context'
import type { TFunction } from 'i18next'
import type { WorldsKeys } from '../../i18n/generated-resources'

// ── 字段定义 ──────────────────────────────────────────────────

interface FieldDef {
  key: string
  emoji: string
  labelKey: WorldsKeys
  descriptionKey: WorldsKeys
  dimensionKey: WorldsKeys
  saveKey: string
}

const FIELDS: FieldDef[] = [
  { key: 'logline',         emoji: '📜', labelKey: 'storyCore.oneLineStory', descriptionKey: 'story.fieldLoglineDesc',   dimensionKey: 'storyCore.oneLineStory', saveKey: 'logline' },
  { key: 'concept',         emoji: '💡', labelKey: 'storyCore.concept',      descriptionKey: 'story.fieldConceptDesc',   dimensionKey: 'storyCore.concept',      saveKey: 'concept' },
  { key: 'theme',           emoji: '🎯', labelKey: 'storyCore.theme',        descriptionKey: 'story.fieldThemeDesc',     dimensionKey: 'storyCore.theme',        saveKey: 'theme' },
  { key: 'centralConflict', emoji: '⚔️', labelKey: 'storyCore.coreConflict', descriptionKey: 'story.fieldConflictDesc',  dimensionKey: 'storyCore.coreConflict', saveKey: 'centralConflict' },
  { key: 'plotPattern',     emoji: '📊', labelKey: 'storyCore.storyMode',    descriptionKey: 'story.fieldPatternDesc',   dimensionKey: 'storyCore.storyMode',    saveKey: 'plotPattern' },
  { key: 'mainPlot',        emoji: '🛤', labelKey: 'storyCore.mainPlot',     descriptionKey: 'story.fieldMainPlotDesc',  dimensionKey: 'storyCore.mainPlot',     saveKey: 'mainPlot' },
  { key: 'subPlots',        emoji: '🎼', labelKey: 'storyCore.subPlot',      descriptionKey: 'story.fieldSubPlotsDesc',  dimensionKey: 'storyCore.subPlot',      saveKey: 'subPlots' },
]

function buildFields(t: TFunction<'worlds'>) {
  return FIELDS.map(f => ({
    ...f,
    label: t(f.labelKey),
    description: t(f.descriptionKey),
    dimension: t(f.dimensionKey),
  }))
}

// ── 主面板 ─────────────────────────────────────────────────────

interface Props { project: Project }

export default function StoryCorePanel({ project }: Props) {
  const { t } = useTranslation('worlds')
  const { storyCore, worldview, saveStoryCore, loadAll } = useWorldviewStore()
  const activeGroupId = useWorldGroupStore(s => s.activeGroupId)
  const fields = useMemo(() => buildFields(t), [t])

  const [values, setValues] = useState<Record<string, string>>({})
  const [activeKey, setActiveKey] = useState(FIELDS[0].key)
  // 跟踪哪些字段正在 streaming（用于侧边栏小圆点）
  const [streamingKeys, setStreamingKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadAll(project.id!, project.enableMultiWorld ? activeGroupId : null)
  }, [project.id, project.enableMultiWorld, activeGroupId, loadAll])

  useEffect(() => {
    if (!storyCore) return
    setValues({
      logline:         storyCore.logline || '',
      concept:         storyCore.concept || '',
      theme:           storyCore.theme || '',
      centralConflict: storyCore.centralConflict || '',
      plotPattern:     storyCore.plotPattern || '',
      mainPlot:        storyCore.mainPlot || storyCore.storyLines || '',
      subPlots:        storyCore.subPlots || '',
    })
  }, [storyCore])

  const save = (key: string, v: string) => {
    const field = FIELDS.find(f => f.key === key)!
    saveStoryCore({ projectId: project.id!, [field.saveKey]: v })
  }

  const worldCtx = (): string => {
    if (!worldview) return ''
    const parts: string[] = []
    if (worldview.summary) parts.push(`【${t('origin.title')}】${worldview.summary.slice(0, 300)}`)
    const ctxFields: [string, string | undefined][] = [
      [t('origin.fieldOrigin'), worldview.worldOrigin], [t('origin.fieldPower'), worldview.powerHierarchy],
      [t('humanity.fieldRaces'), worldview.races], [t('humanity.fieldFactions'), worldview.factionLayout],
    ]
    for (const [label, val] of ctxFields) {
      if (val) parts.push(`【${label}】${val.slice(0, 180)}`)
    }
    return parts.join('\n')
  }

  const handleStreamingChange = useCallback((key: string, streaming: boolean) => {
    setStreamingKeys(prev => {
      if (prev.has(key) === streaming) return prev
      const next = new Set(prev)
      if (streaming) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  return (
    <div className="flex gap-4 max-w-5xl">
      {/* ── 左侧导航 ── */}
      <div className="w-fit min-w-32 max-w-40 shrink-0 space-y-0.5 pt-1">
        {fields.map(f => {
          const active = activeKey === f.key
          const hasContent = !!values[f.key]
          const isFieldStreaming = streamingKeys.has(f.key)
          return (
            <button
              key={f.key}
              onClick={() => setActiveKey(f.key)}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-all ${
                active
                  ? 'bg-accent/8 border-l-2 border-accent'
                  : 'hover:bg-bg-hover border-l-2 border-transparent'
              }`}
            >
              <span className="text-base shrink-0">{f.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${active ? 'text-accent' : 'text-text-primary'}`}>
                  {f.label}
                </p>
                {hasContent && (
                  <p className="text-[10px] text-text-muted truncate">
                    {values[f.key].slice(0, 12)}…
                  </p>
                )}
              </div>
              {isFieldStreaming && !active && (
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
              )}
            </button>
          )
        })}
      </div>

      {/* ── 右侧：所有字段同时渲染，hidden 控制显示 ── */}
      <div className="flex-1 min-w-0">
        {fields.map(f => (
          <div key={f.key} className={activeKey === f.key ? '' : 'hidden'}>
            <FieldEditor
              field={f}
              value={values[f.key] || ''}
              onChange={v => {
                setValues(prev => ({ ...prev, [f.key]: v }))
                save(f.key, v)
              }}
              project={project}
              worldCtx={worldCtx}
              sessionEntity={`${activeGroupId ?? 'global'}:${f.key}`}
              onStreamingChange={streaming => handleStreamingChange(f.key, streaming)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 单字段编辑器（各自独立的 AI 流） ──────────────────────────

function FieldEditor({
  field, value, onChange, project, worldCtx, sessionEntity, onStreamingChange,
}: {
  field: ReturnType<typeof buildFields>[number]
  value: string
  onChange: (v: string) => void
  project: Project
  worldCtx: () => string
  sessionEntity: string
  onStreamingChange: (streaming: boolean) => void
}) {
  const { t } = useTranslation('worlds')
  const [hint, setHint] = useState('')
  const [parameterValues, setParameterValues] = useState<Record<string, unknown>>({})
  const [systemOverride, setSystemOverride] = useState<string | null>(null)
  const [userOverride, setUserOverride] = useState<string | null>(null)
  const [mode, setMode] = useState<FieldGenerationMode>('expand')
  const ai = useAIStream(createAISessionKey(project.id!, 'story.generate', sessionEntity))

  // 通知父组件 streaming 状态
  useEffect(() => {
    onStreamingChange(ai.isStreaming)
  }, [ai.isStreaming, onStreamingChange])

  const activeGroupId = useWorldGroupStore(state => state.activeGroupId)
  const handleGenerate = async () => {
    const historical = await assembleContext({
      projectId: project.id!,
      worldGroupId: project.enableMultiWorld ? activeGroupId : null,
      sourceKeys: ['historical'],
    })
    const fullWorldContext = [worldCtx(), historical.text].filter(Boolean).join('\n\n')
    const opts = {
      parameterValues: Object.keys(parameterValues).length > 0 ? parameterValues : undefined,
      overrides: (systemOverride != null || userOverride != null) ? {
        systemPrompt: systemOverride ?? undefined,
        userPromptTemplate: userOverride ?? undefined,
      } : undefined,
    }
    const messages = buildStoryGeneratePrompt(
      field.dimension, project.name, project.genre || '', fullWorldContext, hint, opts, value, mode,
    )
    ai.start(messages, undefined, { category: 'story.generate', projectId: project.id! })
  }

  return (
    <div className="space-y-4">
      {/* 标题 + 描述 */}
      <div>
        <h2 className="text-xl font-bold text-text-primary mb-0.5">
          {field.emoji} {field.label}
        </h2>
        <p className="text-sm text-text-muted">{field.description}</p>
      </div>

      {/* 内容区 — 行内编辑 */}
      <div className="bg-bg-surface border border-border rounded-lg p-4">
        <InlineTextarea
          value={value}
          onChange={onChange}
          placeholder={t('storyCore.fieldPlaceholder', { label: field.label })}
        />
      </div>

      {/* AI 生成区 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <AIFieldModeTabs value={mode} onChange={setMode} />
          <input
            value={hint}
            onChange={e => setHint(e.target.value)}
            placeholder={t('storyCore.hintPlaceholder')}
            className="flex-1 px-2 py-1.5 bg-bg-surface border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleGenerate}
            disabled={ai.isStreaming}
            className="flex items-center gap-1.5 px-3 py-2 bg-bg-elevated text-text-secondary text-sm rounded-md hover:text-accent disabled:opacity-50 transition-colors border border-border hover:border-accent/50"
          >
            <Sparkles className="w-3.5 h-3.5" /> {t('storyCore.aiGenerate')}
          </button>
        </div>

        <PromptRunPanel
          moduleKey="story.generate"
          parameterValues={parameterValues}
          onParamChange={setParameterValues}
          systemOverride={systemOverride}
          onSystemOverrideChange={setSystemOverride}
          userOverride={userOverride}
          onUserOverrideChange={setUserOverride}
        />

        {(ai.output || ai.isStreaming || ai.error) && (
          <AIStreamOutput
            output={ai.output}
            isStreaming={ai.isStreaming}
            error={ai.error}
            tokenUsage={ai.tokenUsage}
            onStop={ai.stop}
            onAccept={(text: string) => {
              onChange(text)
              ai.reset()
            }}
            onRetry={handleGenerate}
            moduleKey="story.generate"
          />
        )}
      </div>
    </div>
  )
}

// InlineTextarea 已移至 shared/InlineEdit.tsx（组合输入安全版）
