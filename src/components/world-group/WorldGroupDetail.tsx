/**
 * 世界组详情面板 — 编辑单个世界的基础信息和穿越规则
 */
import { CTextarea, CInput } from '../shared/CompositionInput'
import { useState, useEffect } from 'react'
import { ArrowLeft, Save, Loader2, Sparkles, Check } from 'lucide-react'
import { useWorldGroupStore } from '../../stores/world-group'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { buildWorldExpandPrompt, parseWorldExpandOutput } from '../../lib/ai/world-group-ai'
import { buildAllWorldsOverview } from '../../lib/ai/world-group-context'
import { db } from '../../lib/db/schema'
import { adopt } from '../../lib/registry/adopt'
import type { WorldGroup, WorldGroupType } from '../../lib/types'
import { useDomainT } from '../../i18n'

const TYPE_KEY = {
  primary: 'type.primary',
  traversal: 'type.traversal',
  instance: 'type.instance',
  parallel: 'type.parallel',
  ascension: 'type.ascension',
  custom: 'type.custom',
} as const satisfies Record<WorldGroupType, string>

const TYPE_OPTIONS: WorldGroupType[] = [
  'primary',
  'traversal',
  'instance',
  'parallel',
  'ascension',
  'custom',
]

const EMOJI_OPTIONS = ['🏠', '🔥', '⭐', '🗡️', '🌊', '🏔️', '🌙', '⚡', '🎭', '🐉', '🌸', '💎', '🌍', '☀️', '🌑', '🏰']

interface Props {
  group: WorldGroup
  onBack: () => void
}

export default function WorldGroupDetail({ group, onBack }: Props) {
  const { t } = useDomainT('world-group')
  const { updateGroup } = useWorldGroupStore()
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'custom' as WorldGroupType,
    icon: '🌐',
    color: '#6B7280',
    entryCondition: '',
    exitCondition: '',
    plannedChapterCount: 0,
    powerRestriction: '',
    takeawayRules: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm({
      name: group.name,
      description: group.description || '',
      type: group.type,
      icon: group.icon || '🌐',
      color: group.color || '#6B7280',
      entryCondition: group.entryCondition || '',
      exitCondition: group.exitCondition || '',
      plannedChapterCount: group.plannedChapterCount || 0,
      powerRestriction: group.powerRestriction || '',
      takeawayRules: group.takeawayRules || '',
    })
  }, [group])

  const handleSave = async () => {
    if (!group.id) return
    setSaving(true)
    await updateGroup(group.id, {
      name: form.name,
      description: form.description,
      type: form.type,
      icon: form.icon,
      color: form.color,
      entryCondition: form.entryCondition || undefined,
      exitCondition: form.exitCondition || undefined,
      plannedChapterCount: form.plannedChapterCount || undefined,
      powerRestriction: form.powerRestriction || undefined,
      takeawayRules: form.takeawayRules || undefined,
    })
    setSaving(false)
  }

  // ── AI 扩写世界观 ──
  const ai = useAIStream(createAISessionKey(group.projectId, 'world-group.expand', group.id ?? group.name))
  const [expanded, setExpanded] = useState(false)

  const handleAIExpand = async () => {
    if (!group.id || !group.projectId) return
    setExpanded(false)
    const otherWorlds = await buildAllWorldsOverview(group.projectId)
    const sc = await db.storyCores.where('projectId').equals(group.projectId).first()
    const messages = buildWorldExpandPrompt({
      worldName: form.name,
      worldType: t(TYPE_KEY[form.type]),
      draft: form.description || group.name,
      otherWorlds,
      storyCore: sc?.mainPlot || sc?.theme || '',
    })
    const result = await ai.start(messages, undefined, { category: 'world-group.expand', projectId: group.projectId, outputKind: 'mixed' })
    if (!result) return
    const parsed = parseWorldExpandOutput(result)
    if (!parsed) return
    await adopt({
      projectId: group.projectId,
      worldGroupId: group.id,
      target: 'worldviews',
      mode: 'replace',
      data: { ...parsed },
    })
    setExpanded(true)
  }

  const isPrimary = group.type === 'primary'

  return (
    <div className="space-y-5">
      {/* 返回 + 标题 */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('detail.backToOverview')}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAIExpand}
            disabled={ai.isStreaming}
            title={t('detail.aiExpandTitle')}
            className="flex items-center gap-1.5 px-3 py-2 bg-bg-elevated text-text-secondary border border-border rounded-lg hover:text-accent hover:border-accent/50 disabled:opacity-50 transition-colors text-sm"
          >
            {ai.isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : expanded ? <Check className="w-4 h-4 text-green-400" /> : <Sparkles className="w-4 h-4" />}
            {ai.isStreaming ? t('detail.aiExpanding') : expanded ? t('detail.aiExpanded') : t('detail.aiExpand')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors text-sm font-medium"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? t('detail.saving') : t('common:save')}
          </button>
        </div>
      </div>

      <div className="pb-4 border-b border-border/40">
        <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <span className="text-2xl">{form.icon}</span>
          {form.name || t('detail.unnamedWorld')}
        </h2>
        <p className="text-xs text-text-muted mt-0.5">
          {t(TYPE_KEY[form.type])}
          {form.plannedChapterCount ? ` · ${t('detail.plannedChaptersSuffix', { count: form.plannedChapterCount })}` : ''}
        </p>
      </div>

      {/* 基础信息 */}
      <section className="bg-bg-surface border border-border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-semibold text-text-primary">{t('detail.basicInfoTitle')}</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">{t('detail.nameLabel')}</label>
            <CInput
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">{t('detail.typeLabel')}</label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as WorldGroupType }))}
              disabled={isPrimary}
              className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent transition-colors disabled:opacity-50"
            >
              {TYPE_OPTIONS.map(value => (
                <option key={value} value={value}>{t(TYPE_KEY[value])}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1">{t('detail.descriptionLabel')}</label>
          <CTextarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3}
            placeholder={t('detail.descriptionPlaceholder')}
            className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent transition-colors resize-none"
          />
        </div>

        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">{t('detail.iconLabel')}</label>
            <div className="flex flex-wrap gap-1">
              {EMOJI_OPTIONS.map(e => (
                <button
                  key={e}
                  onClick={() => setForm(f => ({ ...f, icon: e }))}
                  className={`w-8 h-8 rounded text-lg flex items-center justify-center transition-colors ${
                    form.icon === e ? 'bg-accent/20 ring-1 ring-accent' : 'hover:bg-bg-hover'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">{t('detail.plannedChapterCountLabel')}</label>
            <CInput
              type="number"
              min={0}
              value={form.plannedChapterCount || ''}
              onChange={e => setForm(f => ({ ...f, plannedChapterCount: Number(e.target.value) || 0 }))}
              placeholder="0"
              className="w-24 px-3 py-2 bg-bg-base border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>
      </section>

      {/* 穿越规则（非主世界才显示） */}
      {!isPrimary && (
        <section className="bg-bg-surface border border-border rounded-lg p-4 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">{t('detail.traversalRulesTitle')}</h3>

          <div>
            <label className="block text-xs text-text-muted mb-1">{t('detail.entryConditionLabel')}</label>
            <CTextarea
              value={form.entryCondition}
              onChange={e => setForm(f => ({ ...f, entryCondition: e.target.value }))}
              rows={2}
              placeholder={t('detail.entryConditionPlaceholder')}
              className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1">{t('detail.powerRestrictionLabel')}</label>
            <CTextarea
              value={form.powerRestriction}
              onChange={e => setForm(f => ({ ...f, powerRestriction: e.target.value }))}
              rows={2}
              placeholder={t('detail.powerRestrictionPlaceholder')}
              className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1">{t('detail.takeawayRulesLabel')}</label>
            <CTextarea
              value={form.takeawayRules}
              onChange={e => setForm(f => ({ ...f, takeawayRules: e.target.value }))}
              rows={2}
              placeholder={t('detail.takeawayRulesPlaceholder')}
              className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1">{t('detail.exitConditionLabel')}</label>
            <CTextarea
              value={form.exitCondition}
              onChange={e => setForm(f => ({ ...f, exitCondition: e.target.value }))}
              rows={2}
              placeholder={t('detail.exitConditionPlaceholder')}
              className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent transition-colors resize-none"
            />
          </div>
        </section>
      )}
    </div>
  )
}
