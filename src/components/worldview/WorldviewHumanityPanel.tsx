import { useState, useEffect, useCallback } from 'react'
import { BookOpen, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWorldviewStore } from '../../stores/worldview'
import { useWorldGroupStore } from '../../stores/world-group'
import WorldGroupSwitcher from '../world-group/WorldGroupSwitcher'
import { InlineTextarea } from '../shared/InlineEdit'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { buildWorldviewPrompt } from '../../lib/ai/adapters/worldview-adapter'
import { assembleContext } from '../../lib/registry/assemble-context'
import AIStreamOutput from '../shared/AIStreamOutput'
import PromptRunPanel from '../shared/PromptRunPanel'
import AIFieldModeTabs from '../shared/AIFieldModeTabs'
import type { Project } from '../../lib/types'
import type { FieldGenerationMode } from '../../lib/ai/field-generation-context'

async function buildRulesSourceContext(projectId: number, worldGroupId: number | null): Promise<string> {
  return (await assembleContext({
    projectId,
    worldGroupId,
    sourceKeys: ['canonAssertions', 'worldRules', 'historical'],
  })).text
}
import CodexPanel from '../codex/CodexPanel'
import CodexSearchBar from '../codex/CodexSearchBar'

// ── 字段定义（统一标签，兼容幻想与历史） ─────────────────────────

interface FieldMeta {
  key: string       // skipKey for buildCtx
  field: string     // worldview store field name
  emoji: string
  labelKey: string  // i18n key
  descriptionKey: string  // i18n key
  /** 与独立管理面板重叠时的导航提示 */
  hintKey?: string  // i18n key
}

const FIELDS: FieldMeta[] = [
  { key: 'races',     field: 'races',                  emoji: '🧬', labelKey: 'humanity.fieldRaces',     descriptionKey: 'humanity.fieldRacesDesc' },
  { key: 'factions',  field: 'factionLayout',          emoji: '⚔',  labelKey: 'humanity.fieldFactions',  descriptionKey: 'humanity.fieldFactionsDesc' },
  { key: 'cities',    field: 'regionDimensions',       emoji: '🏰', labelKey: 'humanity.fieldCities',    descriptionKey: 'humanity.fieldCitiesDesc' },
  { key: 'politics',  field: 'politicsOverview',       emoji: '🏛', labelKey: 'humanity.fieldPolitics',  descriptionKey: 'humanity.fieldPoliticsDesc' },
  { key: 'economy',   field: 'economyOverview',        emoji: '💰', labelKey: 'humanity.fieldEconomy',   descriptionKey: 'humanity.fieldEconomyDesc' },
  { key: 'culture',   field: 'cultureOverview',        emoji: '🎭', labelKey: 'humanity.fieldCulture',   descriptionKey: 'humanity.fieldCultureDesc' },
  { key: 'conflicts', field: 'internalConflicts',      emoji: '🔥', labelKey: 'humanity.fieldConflicts', descriptionKey: 'humanity.fieldConflictsDesc' },
  { key: 'items',     field: 'itemDesign',             emoji: '🗡', labelKey: 'humanity.fieldItems',     descriptionKey: 'humanity.fieldItemsDesc', hintKey: 'humanity.fieldItemsHint' },
]
const HISTORY_NAV = { key: 'history', emoji: '📜', label: '历史年表' }

// 每个方面(子页) → 其专属词条分类(builtInKey)。下方只显示该方面对应的词条。
const HUMANITY_CODEX_KEYS: Record<string, string[] | undefined> = {
  races: ['race'],
  factions: ['faction'],
  cities: ['city'],
  politics: ['humPolitics'],
  economy: ['humEconomy'],
  culture: ['humCulture'],
  conflicts: ['humConflict'],
  items: ['artifact'],
}

// ── 主面板 ─────────────────────────────────────────────────────

interface Props {
  project: Project
  onOpenHistory: () => void
}

export default function WorldviewHumanityPanel({ project, onOpenHistory }: Props) {
  const { t } = useTranslation('worlds')
  const { worldview, saveWorldview, loadAll } = useWorldviewStore()
  const activeGroupId = useWorldGroupStore(s => s.activeGroupId)

  const [values, setValues] = useState<Record<string, string>>({})
  const [activeKey, setActiveKey] = useState(HISTORY_NAV.key)
  const [streamingKeys, setStreamingKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadAll(project.id!, project.enableMultiWorld ? activeGroupId : null)
  }, [project.id, project.enableMultiWorld, activeGroupId, loadAll])

  useEffect(() => {
    if (!worldview) return
    setValues({
      history:   worldview.historyLine || '',
      events:    worldview.worldEvents || '',
      races:     worldview.races || '',
      factions:  worldview.factionLayout || '',
      cities:    worldview.regionDimensions || '',
      politics: worldview.politicsOverview || '',
      economy: worldview.economyOverview || '',
      culture: worldview.cultureOverview || '',
      legacySociety: worldview.politicsEconomyCulture || '',
      conflicts: worldview.internalConflicts || '',
      items:     worldview.itemDesign || '',
    })
  }, [worldview])

  const save = (fieldName: string, v: string) =>
    saveWorldview({ projectId: project.id!, [fieldName]: v })

  /** 拼其他字段（含世界起源 + 自然环境的关键值）做 AI 上下文 */
  const buildCtx = useCallback((skipKey: string): string => {
    const parts: string[] = []
    if (worldview?.worldOrigin) parts.push(`【${t('origin.fieldOrigin')}】${worldview.worldOrigin.slice(0, 200)}`)
    if (worldview?.powerHierarchy) parts.push(`【${t('origin.fieldPower')}】${worldview.powerHierarchy.slice(0, 150)}`)
    if (worldview?.continentLayout) parts.push(`【${t('natural.fieldContinentLayout')}】${worldview.continentLayout.slice(0, 150)}`)
    const map: [string, string, string][] = [
      ['races',     t('humanity.fieldRaces'),   values.races || ''],
      ['factions',  t('humanity.fieldFactions'), values.factions || ''],
      ['politics',  t('humanity.fieldPolitics'), values.politics || ''],
      ['economy',   t('humanity.fieldEconomy'),  values.economy || ''],
      ['culture',   t('humanity.fieldCulture'),  values.culture || ''],
      ['conflicts', t('humanity.fieldConflicts'), values.conflicts || ''],
      ['items',     t('humanity.fieldItems'),    values.items || ''],
    ]
    for (const [k, label, val] of map) {
      if (k !== skipKey && val) parts.push(`【${label}】${val.slice(0, 150)}`)
    }
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
            {t('humanity.title')}
          </h2>
          {project.enableMultiWorld && <WorldGroupSwitcher />}
        </div>
        <p className="text-xs text-text-muted mt-0.5">
          {t('humanity.subtitle')}
        </p>
        {/* 词条搜索:跨本面板所有方面,点结果跳到对应子页 */}
        <div className="mt-3 max-w-xl">
          <CodexSearchBar
            categoryKeys={[
              ...new Set([
                ...Object.values(HUMANITY_CODEX_KEYS).flat().filter(Boolean),
                'humEra', 'humEvent', 'humSociety',
              ] as string[]),
            ]}
            onJump={(catKey) => {
              if (catKey === 'humEra' || catKey === 'humEvent') {
                setActiveKey('history')
                return
              }
              if (catKey === 'humSociety') {
                setActiveKey('politics')
                return
              }
              const sub = Object.keys(HUMANITY_CODEX_KEYS).find(k => HUMANITY_CODEX_KEYS[k]?.includes(catKey))
              if (sub) setActiveKey(sub)
            }}
          />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── 左侧导航 ── */}
        <nav className="w-max min-w-32 max-w-44 flex-shrink-0 border-r border-border overflow-y-auto py-4 pr-1">
          {[HISTORY_NAV, ...FIELDS].map(f => {
            const isActive = f.key === activeKey
            const isFieldStreaming = streamingKeys.has(f.key)
            const label = 'label' in f ? f.label : t(f.labelKey as 'humanity.fieldRaces')
            return (
              <button
                key={f.key}
                onClick={() => setActiveKey(f.key)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors border-l-2 flex items-center gap-1 ${
                  isActive
                    ? 'border-accent bg-accent/8 text-accent font-medium'
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
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
        <div className="flex-1 min-w-0 overflow-y-auto p-6">
          {activeKey === 'history' && (
            <div className="max-w-3xl space-y-5">
              <div>
                <h3 className="text-lg font-semibold text-text-primary">{t('humanity.fieldHistory')}</h3>
                <p className="mt-1 text-sm text-text-muted">
                  {t('humanity.historyDesc')}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenHistory}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 text-sm"
              >
                <BookOpen className="w-4 h-4" />
                {t('humanity.openHistory')}
              </button>
              <details className="border border-border rounded-xl bg-bg-surface p-4">
                <summary className="cursor-pointer text-sm font-medium text-text-secondary">
                  {t('humanity.legacyHistoryLabel')}
                </summary>
                <div className="mt-4 space-y-4">
                  <label className="block">
                    <span className="block text-xs text-text-muted mb-1">{t('humanity.legacyHistoryLine')}</span>
                    <InlineTextarea
                      value={values.history || ''}
                      onChange={value => {
                        setValues(prev => ({ ...prev, history: value }))
                        save('historyLine', value)
                      }}
                      placeholder={t('humanity.legacyHistoryPlaceholder')}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs text-text-muted mb-1">{t('humanity.legacyEvents')}</span>
                    <InlineTextarea
                      value={values.events || ''}
                      onChange={value => {
                        setValues(prev => ({ ...prev, events: value }))
                        save('worldEvents', value)
                      }}
                      placeholder={t('humanity.legacyEventsPlaceholder')}
                    />
                  </label>
                  <CodexPanel
                    project={project}
                    fixedCategoryKeys={['humEra', 'humEvent']}
                    extractionSourceText={`${values.history || ''}\n${values.events || ''}`}
                    embedded
                  />
                </div>
              </details>
            </div>
          )}
          {FIELDS.map(f => (
            <div key={f.key} className={activeKey === f.key ? '' : 'hidden'}>
              {/* 全貌（上）：现有字段本身就是这个方面的整体概述，带 AI 生成 */}
              <HumanityFieldEditor
                meta={f}
                value={values[f.key] || ''}
                onChange={v => {
                  setValues(prev => ({ ...prev, [f.key]: v }))
                  save(f.field, v)
                }}
                project={project}
                contextSummary={buildCtx(f.key)}
                onStreamingChange={streaming => handleStreamingChange(f.key, streaming)}
              />
              {/* 词条（下）：在全貌之下,把"本方面"细化为一个个具体条目(只显示对应那一类,可打星) */}
              {HUMANITY_CODEX_KEYS[f.key] && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-text-primary mb-1">📚 {t(f.labelKey as 'humanity.fieldRaces')} · {t('humanity.entriesTitle', { label: t(f.labelKey as 'humanity.fieldRaces') })}</h3>
                  <p className="text-xs text-text-muted mb-3">{t('humanity.entriesDesc', { label: t(f.labelKey as 'humanity.fieldRaces') })}</p>
                  <CodexPanel
                    project={project}
                    fixedCategoryKeys={HUMANITY_CODEX_KEYS[f.key]}
                    extractionSourceText={values[f.key] || ''}
                    embedded
                  />
                </div>
              )}
              {f.key === 'politics' && (
                <details className="mt-6 border border-border rounded-xl bg-bg-surface p-4">
                  <summary className="cursor-pointer text-sm font-medium text-text-secondary">
                    旧版“政经文化”兼容资料
                  </summary>
                  <div className="mt-4 space-y-4">
                    <InlineTextarea
                      value={values.legacySociety || ''}
                      onChange={value => {
                        setValues(prev => ({ ...prev, legacySociety: value }))
                        save('politicsEconomyCulture', value)
                      }}
                      placeholder="旧版政经文化原文"
                    />
                    <CodexPanel
                      project={project}
                      fixedCategoryKeys={['humSociety']}
                      extractionSourceText={values.legacySociety || ''}
                      embedded
                    />
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 单字段编辑器（各自独立的 AI 流） ──────────────────────────

function HumanityFieldEditor({
  meta, value, onChange, project, contextSummary, onStreamingChange,
}: {
  meta: FieldMeta
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
    `${activeGroupId ?? 'global'}:${meta.key}`,
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
      t(meta.labelKey as 'humanity.fieldRaces'), project.name, project.genre || '', contextSummary, hint, opts, value, mode,
    )
    ai.start(messages, undefined, { category: 'worldview.dimension', projectId: project.id! })
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">{meta.emoji} {t(meta.labelKey as 'humanity.fieldRaces')}</h3>
        <p className="mt-1 text-sm text-text-muted">{t(meta.descriptionKey as 'humanity.fieldRacesDesc')}</p>
        {meta.hintKey && (
          <p className="mt-1.5 text-xs text-accent/80 bg-accent/5 border border-accent/15 rounded px-2 py-1">
            💡 {t(meta.hintKey as 'humanity.fieldItemsHint')}
          </p>
        )}
      </div>

      <div className="bg-bg-surface border border-border rounded-xl p-4">
        <InlineTextarea value={value} onChange={onChange} placeholder={t(meta.descriptionKey as 'humanity.fieldRacesDesc')} />
      </div>

      <div className="flex items-center gap-2">
        <AIFieldModeTabs value={mode} onChange={setMode} />
        <input
          value={hint} onChange={e => setHint(e.target.value)}
          placeholder={t('humanity.aiHintPlaceholder')}
          className="flex-1 px-2 py-1.5 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
        />
        <button onClick={handleGenerate} disabled={ai.isStreaming}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded disabled:opacity-50 shrink-0 bg-accent/10 text-accent hover:bg-accent/20">
          <Sparkles className="w-3.5 h-3.5" /> {t('humanity.aiGenerate')}
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
