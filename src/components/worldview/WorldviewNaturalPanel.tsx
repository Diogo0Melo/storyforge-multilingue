import { useState, useEffect, useCallback } from 'react'
import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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

const FIELDS = [
  { key: 'worldStructure',   emoji: '🌐', labelKey: 'natural.fieldWorldStructure',   descKey: 'natural.fieldWorldStructureDesc',   ctxKey: 'structure',  ctxLabelKey: 'natural.ctxLabels.structure' },
  { key: 'worldDimensions',  emoji: '📐', labelKey: 'natural.fieldWorldDimensions',  descKey: 'natural.fieldWorldDimensionsDesc',  ctxKey: 'dim',       ctxLabelKey: 'natural.ctxLabels.territory' },
  { key: 'continentLayout',  emoji: '🗺', labelKey: 'natural.fieldContinentLayout',  descKey: 'natural.fieldContinentLayoutDesc',  ctxKey: 'continent', ctxLabelKey: 'natural.ctxLabels.landform' },
  { key: 'mountainsRivers',  emoji: '⛰', labelKey: 'natural.fieldMountainsRivers',  descKey: 'natural.fieldMountainsRiversDesc',  ctxKey: 'mountains', ctxLabelKey: 'natural.ctxLabels.mountains' },
  { key: 'climateByRegion',  emoji: '🌦', labelKey: 'natural.fieldClimateByRegion',  descKey: 'natural.fieldClimateByRegionDesc',  ctxKey: 'climate',   ctxLabelKey: 'natural.ctxLabels.climate' },
] as const

type FieldKey = typeof FIELDS[number]['key'] | 'naturalResources'

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
  const { t } = useTranslation('worlds')
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

  const buildCtx = useCallback((skipCtxKey: string): string => {
    const parts: string[] = []
    // ── 世界起源面板关键字段 ──
    if (worldview?.worldOrigin)    parts.push(`【${t('origin.fieldOrigin')}】${worldview.worldOrigin.slice(0, 200)}`)
    if (worldview?.powerHierarchy) parts.push(`【${t('origin.fieldPower')}】${worldview.powerHierarchy.slice(0, 150)}`)
    // ── 本面板内互参 ──
    for (const f of FIELDS) {
      if (f.ctxKey !== skipCtxKey && values[f.key]) {
        parts.push(`【${t(f.ctxLabelKey as 'natural.ctxLabels.structure')}】${values[f.key].slice(0, 150)}`)
      }
    }
    // ── 人文环境面板关键字段 ──
    if (worldview?.races)         parts.push(`【${t('humanity.fieldRaces')}】${worldview.races.slice(0, 100)}`)
    if (worldview?.factionLayout) parts.push(`【${t('humanity.fieldFactions')}】${worldview.factionLayout.slice(0, 100)}`)
    return parts.join('\n')
  }, [worldview, values, t])

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
          {[
            { key: 'worldStructure' as const, emoji: '🌐', label: t('natural.fieldWorldStructure') },
            { key: 'worldDimensions' as const, emoji: '📐', label: t('natural.fieldWorldDimensions') },
            { key: 'continentLayout' as const, emoji: '🗺', label: t('natural.fieldContinentLayout') },
            { key: 'mountainsRivers' as const, emoji: '⛰', label: t('natural.fieldMountainsRivers') },
            { key: 'climateByRegion' as const, emoji: '🌦', label: t('natural.fieldClimateByRegion') },
            { key: 'naturalResources' as const, emoji: '🌿', label: t('natural.fieldNaturalResources') },
          ].map(f => {
            const isActive = activeKey === f.key
            const isFieldStreaming = streamingKeys.has(f.key)
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
                <span className="flex-1">{f.emoji} {f.label}</span>
                {isFieldStreaming && !isActive && (
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
                )}
              </button>
            )
          })}
        </nav>

        {/* ── 右侧：所有字段同时渲染，hidden 控制显示 ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {FIELDS.map(f => (
            <div key={f.key} className={activeKey === f.key ? '' : 'hidden'}>
              <SimpleFieldEditor
                field={f}
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
                  <h3 className="text-sm font-semibold text-text-primary mb-1">📚 {t(f.labelKey)} · {t('natural.entriesTitle', { label: t(f.labelKey) })}</h3>
                  <p className="text-xs text-text-muted mb-3">{t('natural.entriesDesc', { label: t(f.labelKey) })}</p>
                  <CodexPanel
                    project={project}
                    fixedCategoryKeys={NATURAL_CODEX_KEYS[f.key]}
                    extractionSourceText={values[f.key] || ''}
                    embedded
                  />
                </div>
              )}
            </div>
          ))}
          <div className={activeKey === 'naturalResources' ? 'space-y-4' : 'hidden'}>
            {/* 全貌(上):自然资源整体概述,带 AI 生成,与其它方面一致 */}
            <SimpleFieldEditor
              field={{ key: 'naturalResourceOverview', emoji: '🌿', labelKey: 'natural.fieldNaturalResources', descKey: 'natural.fieldNaturalResourcesDesc' }}
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
              <h3 className="text-sm font-semibold text-text-primary mb-1">📚 {t('natural.resourcesEntriesTitle')}</h3>
              <p className="text-xs text-text-muted mb-2">{t('natural.resourcesEntriesDesc')}</p>
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
              <summary className="text-xs text-text-muted cursor-pointer hover:text-text-secondary">{t('natural.legacyResourcesLabel')}</summary>
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

function SimpleFieldEditor({ field, value, onChange, project, contextSummary, onStreamingChange }: {
  field: { key: string; emoji: string; labelKey: string; descKey: string }
  value: string
  onChange: (v: string) => void
  project: Project
  contextSummary: string
  onStreamingChange: (streaming: boolean) => void
}) {
  const { t } = useTranslation('worlds')
  const [hint, setHint] = useState('')
  const [parameterValues, setParameterValues] = useState<Record<string, unknown>>({})
  const [systemOverride, setSystemOverride] = useState<string | null>(null)
  const [userOverride, setUserOverride] = useState<string | null>(null)
  const [mode, setMode] = useState<FieldGenerationMode>('expand')
  const activeGroupId = useWorldGroupStore(s => s.activeGroupId)
  const ai = useAIStream(createAISessionKey(
    project.id!,
    'worldview.dimension',
    `${activeGroupId ?? 'global'}:${field.key}`,
  ))

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
    const messages = buildWorldviewPrompt(
      t(field.labelKey as 'natural.fieldWorldStructure'), project.name, project.genre || '', contextSummary, hint, opts, value, mode,
    )
    ai.start(messages, undefined, { category: 'worldview.dimension', projectId: project.id! })
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">{field.emoji} {t(field.labelKey as 'natural.fieldWorldStructure')}</h3>
        <p className="mt-1 text-sm text-text-muted">{t(field.descKey as 'natural.fieldWorldStructureDesc')}</p>
      </div>

      <div className="bg-bg-surface border border-border rounded-lg p-4">
        <InlineTextarea value={value} onChange={onChange} placeholder={t(field.descKey as 'natural.fieldWorldStructureDesc')} />
      </div>

      <div className="flex items-center gap-2">
        <AIFieldModeTabs value={mode} onChange={setMode} />
        <input value={hint} onChange={e => setHint(e.target.value)}
          placeholder={t('natural.aiHintPlaceholder')}
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

function NaturalResourcesEditor({ naturalResources, setNaturalResources, save }: {
  naturalResources: NaturalResources
  setNaturalResources: React.Dispatch<React.SetStateAction<NaturalResources>>
  save: (patch: Record<string, unknown>) => void
}) {
  const { t } = useTranslation('worlds')
  const rows: { key: keyof NaturalResources; labelKey: string; placeholderKey: string }[] = [
    { key: 'rareCreatures', labelKey: 'natural.rareCreatures', placeholderKey: 'natural.rareCreaturesPlaceholder' },
    { key: 'herbs',         labelKey: 'natural.herbs',         placeholderKey: 'natural.herbsPlaceholder' },
    { key: 'minerals',      labelKey: 'natural.minerals',      placeholderKey: 'natural.mineralsPlaceholder' },
    { key: 'others',        labelKey: 'natural.others',        placeholderKey: 'natural.othersPlaceholder' },
  ]

  const update = (key: keyof NaturalResources, v: string) => {
    const next = { ...naturalResources, [key]: v }
    setNaturalResources(next)
    save({ naturalResources: next })
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">{t('natural.fieldNaturalResources')}</h3>
        <p className="mt-1 text-sm text-text-muted">{t('natural.resourcesOverview')}</p>
      </div>
      <div className="bg-bg-surface border border-border rounded-lg p-4 space-y-4">
        {rows.map(r => (
          <div key={r.key} className="flex items-start gap-3">
            <span className="text-sm text-text-secondary w-28 flex-shrink-0 pt-0.5">{t(r.labelKey as 'natural.rareCreatures')}</span>
            <div className="flex-1">
              <InlineTextarea value={naturalResources[r.key]} onChange={v => update(r.key, v)} placeholder={t(r.placeholderKey as 'natural.rareCreaturesPlaceholder')} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
