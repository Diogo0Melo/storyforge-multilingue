import { useState, useEffect, useCallback } from 'react'
import { Sparkles } from 'lucide-react'
import { useDomainT } from '../../i18n'
import { useWorldviewStore } from '../../stores/worldview'
import { useWorldGroupStore } from '../../stores/world-group'
import WorldGroupSwitcher from '../world-group/WorldGroupSwitcher'
import CodexPanel from '../codex/CodexPanel'
import CodexSearchBar from '../codex/CodexSearchBar'
import { InlineTextarea } from '../shared/InlineEdit'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { buildWorldviewPrompt } from '../../lib/ai/adapters/worldview-adapter'
import { assembleContext } from '../../lib/registry/assemble-context'
import AIStreamOutput from '../shared/AIStreamOutput'
import PromptRunPanel from '../shared/PromptRunPanel'
import AIFieldModeTabs from '../shared/AIFieldModeTabs'
import type { Project, NaturalResources } from '../../lib/types'
import type { FieldGenerationMode } from '../../lib/ai/field-generation-context'

async function buildRulesSourceContext(projectId: number, worldGroupId: number | null): Promise<string> {
  return (await assembleContext({
    projectId,
    worldGroupId,
    sourceKeys: ['canonAssertions', 'worldRules', 'historical'],
  })).text
}

interface Props { project: Project }

// ── 字段定义（统一标签，兼容幻想与历史） ─────────────────────────

/** Static key map for natural fields — no computed keys. */
const NATURAL_FIELD_KEYS = {
  worldStructure:   { labelKey: 'natural.fields.worldStructure.label' as const, descKey: 'natural.fields.worldStructure.desc' as const },
  worldDimensions:  { labelKey: 'natural.fields.worldDimensions.label' as const, descKey: 'natural.fields.worldDimensions.desc' as const },
  continentLayout:  { labelKey: 'natural.fields.continentLayout.label' as const, descKey: 'natural.fields.continentLayout.desc' as const },
  mountainsRivers:  { labelKey: 'natural.fields.mountainsRivers.label' as const, descKey: 'natural.fields.mountainsRivers.desc' as const },
  climateByRegion:  { labelKey: 'natural.fields.climateByRegion.label' as const, descKey: 'natural.fields.climateByRegion.desc' as const },
}

type FieldKey = keyof typeof NATURAL_FIELD_KEYS | 'naturalResources'

const FIELDS = [
  { key: 'worldStructure' as const,   emoji: '🌐', ctxKey: 'structure' },
  { key: 'worldDimensions' as const,  emoji: '📐', ctxKey: 'dim' },
  { key: 'continentLayout' as const,  emoji: '🗺', ctxKey: 'continent' },
  { key: 'mountainsRivers' as const,  emoji: '⛰', ctxKey: 'mountains' },
  { key: 'climateByRegion' as const,  emoji: '🌦', ctxKey: 'climate' },
] as const

// 每个方面(子页) → 其专属词条分类(builtInKey)。(重镇/城池已移到人文环境;自然资源单独处理)
const NATURAL_CODEX_KEYS: Record<string, string[] | undefined> = {
  worldStructure: ['natStructure'],
  worldDimensions: ['natDimension'],
  continentLayout: ['natTerrain'],
  mountainsRivers: ['natWater'],
  climateByRegion: ['natClimate'],
}

// ── 主面板 ─────────────────────────────────────────────────────

export default function WorldviewNaturalPanel({ project }: Props) {
  const { t } = useDomainT('worldview')
  const { worldview, saveWorldview, loadAll } = useWorldviewStore()
  const activeGroupId = useWorldGroupStore(s => s.activeGroupId)

  const [values, setValues] = useState<Record<string, string>>({})
  const [naturalResources, setNaturalResources] = useState<NaturalResources>({
    rareCreatures: '', herbs: '', minerals: '', others: '',
  })
  const [activeKey, setActiveKey] = useState<FieldKey>('worldStructure')
  const [streamingKeys, setStreamingKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadAll(project.id!, project.enableMultiWorld ? activeGroupId : null)
  }, [project.id, project.enableMultiWorld, activeGroupId, loadAll])

  useEffect(() => {
    if (!worldview) return
    setValues({
      worldStructure:   worldview.worldStructure || '',
      worldDimensions:  worldview.worldDimensions || '',
      continentLayout:  worldview.continentLayout || '',
      regionDimensions: worldview.regionDimensions || '',
      mountainsRivers:  worldview.mountainsRivers || '',
      climateByRegion:  worldview.climateByRegion || '',
      naturalResourceOverview: worldview.naturalResourceOverview || '',
    })
    setNaturalResources(worldview.naturalResources || {
      rareCreatures: '', herbs: '', minerals: '', others: '',
    })
  }, [worldview])

  const save = (patch: Partial<typeof worldview>) =>
    saveWorldview({ projectId: project.id!, ...patch })

  // NOTE: 【...】 context markers are AI prompt content, not user-visible UI strings.
  const buildCtx = useCallback((skipCtxKey: string): string => {
    const parts: string[] = []
    // ── 世界起源面板关键字段 ──
    if (worldview?.worldOrigin)    parts.push(`【世界来源】${worldview.worldOrigin.slice(0, 200)}`)
    if (worldview?.powerHierarchy) parts.push(`【力量体系】${worldview.powerHierarchy.slice(0, 150)}`)
    // ── 本面板内互参 ──
    for (const f of FIELDS) {
      if (f.ctxKey !== skipCtxKey && values[f.key]) {
        // Use zh labels for AI context — these are prompt payloads, not UI
        const zhLabels: Record<string, string> = {
          structure: '世界结构', dim: '疆域尺寸', continent: '地貌分布',
          mountains: '山川水系', climate: '气候环境',
        }
        parts.push(`【${zhLabels[f.ctxKey]}】${values[f.key].slice(0, 150)}`)
      }
    }
    // ── 人文环境面板关键字段 ──
    if (worldview?.races)         parts.push(`【种族与民族】${worldview.races.slice(0, 100)}`)
    if (worldview?.factionLayout) parts.push(`【势力分布】${worldview.factionLayout.slice(0, 100)}`)
    return parts.join('\n')
  }, [worldview, values])

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
    <div className="flex flex-col w-full h-full space-y-4">
      {/* 顶部 */}
      <div className="pb-4 border-b border-border/40 px-6 pt-4 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            {t('natural.title')}
          </h2>
          {project.enableMultiWorld && <WorldGroupSwitcher />}
        </div>
        <p className="text-xs text-text-muted mt-0.5">
          {t('natural.subtitle')}
        </p>
        <div className="mt-3 max-w-xl">
          <CodexSearchBar
            categoryKeys={[...Object.values(NATURAL_CODEX_KEYS).flat().filter(Boolean) as string[], 'mineral', 'herb', 'beast']}
            onJump={(catKey) => {
              if (['mineral', 'herb', 'beast'].includes(catKey)) { setActiveKey('naturalResources'); return }
              const sub = Object.keys(NATURAL_CODEX_KEYS).find(k => NATURAL_CODEX_KEYS[k]?.includes(catKey))
              if (sub) setActiveKey(sub as FieldKey)
            }}
          />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── 左侧边栏 ── */}
        <nav className="w-max min-w-32 max-w-44 flex-shrink-0 border-r border-border bg-bg-surface/50 overflow-y-auto">
          {[...FIELDS.map(f => ({ key: f.key, emoji: f.emoji })),
            { key: 'naturalResources' as const, emoji: '🌿' },
          ].map(f => {
            const isActive = activeKey === f.key
            const isFieldStreaming = streamingKeys.has(f.key)
            const label = f.key === 'naturalResources'
              ? t('natural.fields.naturalResources.label')
              : t(NATURAL_FIELD_KEYS[f.key as keyof typeof NATURAL_FIELD_KEYS].labelKey)
            return (
              <button
                key={f.key}
                onClick={() => setActiveKey(f.key)}
                className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-l-2 flex items-center gap-1 ${
                  isActive
                    ? 'border-accent bg-accent/10 text-text-primary font-medium'
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-elevated/50'
                }`}
              >
                <span className="flex-1">{f.emoji} {label}</span>
                {isFieldStreaming && !isActive && (
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
                )}
              </button>
            )
          })}
        </nav>

        {/* ── 右侧：所有字段同时渲染，hidden 控制显示 ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {FIELDS.map(f => {
            const label = t(NATURAL_FIELD_KEYS[f.key].labelKey)
            return (
              <div key={f.key} className={activeKey === f.key ? '' : 'hidden'}>
                <SimpleFieldEditor
                  fieldKey={f.key}
                  value={values[f.key] || ''}
                  onChange={v => {
                    setValues(prev => ({ ...prev, [f.key]: v }))
                    save({ [f.key]: v })
                  }}
                  project={project}
                  contextSummary={buildCtx(f.ctxKey)}
                  onStreamingChange={streaming => handleStreamingChange(f.key, streaming)}
                />
                {/* 全貌之下:本方面的专属词条(只显示对应那一类) */}
                {NATURAL_CODEX_KEYS[f.key] && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-text-primary mb-1">{t('natural.codexHeading', { label })}</h3>
                    <p className="text-xs text-text-muted mb-3">{t('natural.codexHint', { label })}</p>
                    <CodexPanel
                      project={project}
                      fixedCategoryKeys={NATURAL_CODEX_KEYS[f.key]}
                      extractionSourceText={values[f.key] || ''}
                      embedded
                    />
                  </div>
                )}
              </div>
            )
          })}
          <div className={activeKey === 'naturalResources' ? 'space-y-4' : 'hidden'}>
            {/* 全貌(上):自然资源整体概述,带 AI 生成,与其它方面一致 */}
            <SimpleFieldEditor
              fieldKey="naturalResources"
              value={values.naturalResourceOverview || ''}
              onChange={v => {
                setValues(prev => ({ ...prev, naturalResourceOverview: v }))
                save({ naturalResourceOverview: v })
              }}
              project={project}
              contextSummary={buildCtx('resources')}
              onStreamingChange={streaming => handleStreamingChange('naturalResources', streaming)}
            />
            {/* 自然资源:矿物/草药/异兽 三类词条 */}
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">{t('natural.resourcesCodexHeading')}</h3>
              <p className="text-xs text-text-muted mb-2">{t('natural.resourcesCodexHint')}</p>
              <CodexPanel
                project={project}
                fixedCategoryKeys={['mineral', 'herb', 'beast']}
                extractionSourceText={[
                  values.naturalResourceOverview,
                  naturalResources.minerals,
                  naturalResources.herbs,
                  naturalResources.rareCreatures,
                  naturalResources.others,
                ].filter(Boolean).join('\n\n')}
                embedded
              />
            </div>
            {/* 旧版自然资源(纯文本)——保留兼容 */}
            <details className="border-t border-border/60 pt-3">
              <summary className="text-xs text-text-muted cursor-pointer hover:text-text-secondary">{t('natural.legacyResourcesSummary')}</summary>
              <div className="mt-2">
                <NaturalResourcesEditor
                  naturalResources={naturalResources}
                  setNaturalResources={setNaturalResources}
                  save={save}
                />
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 单字段编辑器（各自独立的 AI 流） ──────────────────────────

function SimpleFieldEditor({ fieldKey, value, onChange, project, contextSummary, onStreamingChange }: {
  fieldKey: FieldKey
  value: string
  onChange: (v: string) => void
  project: Project
  contextSummary: string
  onStreamingChange: (streaming: boolean) => void
}) {
  const { t } = useDomainT('worldview')
  const [hint, setHint] = useState('')
  const [parameterValues, setParameterValues] = useState<Record<string, unknown>>({})
  const [systemOverride, setSystemOverride] = useState<string | null>(null)
  const [userOverride, setUserOverride] = useState<string | null>(null)
  const [mode, setMode] = useState<FieldGenerationMode>('expand')
  const activeGroupId = useWorldGroupStore(s => s.activeGroupId)
  const ai = useAIStream(createAISessionKey(
    project.id!,
    'worldview.dimension',
    `${activeGroupId ?? 'global'}:${fieldKey}`,
  ))

  const label = fieldKey === 'naturalResources'
    ? t('natural.fields.naturalResources.label')
    : t(NATURAL_FIELD_KEYS[fieldKey as keyof typeof NATURAL_FIELD_KEYS].labelKey)
  const desc = fieldKey === 'naturalResources'
    ? t('natural.fields.naturalResources.desc')
    : t(NATURAL_FIELD_KEYS[fieldKey as keyof typeof NATURAL_FIELD_KEYS].descKey)
  const emoji = fieldKey === 'naturalResources' ? '🌿' : FIELDS.find(f => f.key === fieldKey)?.emoji ?? ''

  useEffect(() => {
    onStreamingChange(ai.isStreaming)
  }, [ai.isStreaming, onStreamingChange])

  const handleGenerate = async () => {
    const rulesCtx = await buildRulesSourceContext(project.id!, project.enableMultiWorld ? activeGroupId : null)
    const opts = {
      parameterValues: {
        ...parameterValues,
        worldRulesContext: rulesCtx,
      },
      overrides: (systemOverride != null || userOverride != null) ? {
        systemPrompt: systemOverride ?? undefined,
        userPromptTemplate: userOverride ?? undefined,
      } : undefined,
    }
    // label is passed to AI prompt builder — intentional (AI needs dimension name)
    const messages = buildWorldviewPrompt(
      label, project.name, project.genre || '', contextSummary, hint, opts, value, mode,
    )
    ai.start(messages, undefined, { category: 'worldview.dimension', projectId: project.id! })
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">{emoji} {label}</h3>
        <p className="mt-1 text-sm text-text-muted">{desc}</p>
      </div>

      <div className="bg-bg-surface border border-border rounded-lg p-4">
        <InlineTextarea value={value} onChange={onChange} placeholder={desc} />
      </div>

      <div className="flex items-center gap-2">
        <AIFieldModeTabs value={mode} onChange={setMode} />
        <input value={hint} onChange={e => setHint(e.target.value)}
          placeholder={t('natural.hintPlaceholder')}
          className="flex-1 px-2 py-1.5 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent" />
        <button onClick={handleGenerate} disabled={ai.isStreaming}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded disabled:opacity-50 shrink-0 bg-accent/10 text-accent hover:bg-accent/20">
          <Sparkles className="w-3.5 h-3.5" /> {t('natural.aiGenerate')}
        </button>
      </div>

      <PromptRunPanel moduleKey="worldview.dimension" parameterValues={parameterValues}
        onParamChange={setParameterValues} systemOverride={systemOverride}
        onSystemOverrideChange={setSystemOverride} userOverride={userOverride}
        onUserOverrideChange={setUserOverride} />

      {(ai.output || ai.isStreaming || ai.error) && (
        <AIStreamOutput output={ai.output} isStreaming={ai.isStreaming} error={ai.error}
          tokenUsage={ai.tokenUsage} onStop={ai.stop}
          onAccept={(text: string) => { onChange(text); ai.reset() }}
          onRetry={handleGenerate} moduleKey="worldview.dimension" />
      )}
    </div>
  )
}

// ── 自然资源编辑器 ─────────────────────────────────────────────

/** Static key map for resource rows — no computed keys. */
const RESOURCE_ROW_KEYS = {
  rareCreatures: { labelKey: 'natural.resourceRows.rareCreatures.label' as const, placeholderKey: 'natural.resourceRows.rareCreatures.placeholder' as const },
  herbs:         { labelKey: 'natural.resourceRows.herbs.label' as const,         placeholderKey: 'natural.resourceRows.herbs.placeholder' as const },
  minerals:      { labelKey: 'natural.resourceRows.minerals.label' as const,      placeholderKey: 'natural.resourceRows.minerals.placeholder' as const },
  others:        { labelKey: 'natural.resourceRows.others.label' as const,        placeholderKey: 'natural.resourceRows.others.placeholder' as const },
} satisfies Record<keyof NaturalResources, { labelKey: string; placeholderKey: string }>

function NaturalResourcesEditor({ naturalResources, setNaturalResources, save }: {
  naturalResources: NaturalResources
  setNaturalResources: React.Dispatch<React.SetStateAction<NaturalResources>>
  save: (patch: Record<string, unknown>) => void
}) {
  const { t } = useDomainT('worldview')

  const update = (key: keyof NaturalResources, v: string) => {
    const next = { ...naturalResources, [key]: v }
    setNaturalResources(next)
    save({ naturalResources: next })
  }

  const rowKeys = ['rareCreatures', 'herbs', 'minerals', 'others'] as const

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">{t('natural.resourcesTitle')}</h3>
        <p className="mt-1 text-sm text-text-muted">{t('natural.resourcesSubtitle')}</p>
      </div>
      <div className="bg-bg-surface border border-border rounded-lg p-4 space-y-4">
        {rowKeys.map(r => (
          <div key={r} className="flex items-start gap-3">
            <span className="text-sm text-text-secondary w-28 flex-shrink-0 pt-0.5">{t(RESOURCE_ROW_KEYS[r].labelKey)}</span>
            <div className="flex-1">
              <InlineTextarea value={naturalResources[r]} onChange={v => update(r, v)} placeholder={t(RESOURCE_ROW_KEYS[r].placeholderKey)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
