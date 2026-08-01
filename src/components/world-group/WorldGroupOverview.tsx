/**
 * 世界总览面板 — 管理多个世界组 + 世界关系
 */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, GripVertical, ArrowRight, ChevronRight, Sparkles, Loader2, Check } from 'lucide-react'
import { useWorldGroupStore } from '../../stores/world-group'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { buildWorldSuggestPrompt, parseWorldSuggestOutput, type SuggestedWorld } from '../../lib/ai/world-group-ai'
import { buildAllWorldsOverview } from '../../lib/ai/world-group-context'
import { WORLD_GROUP_TYPE_LABELS, WORLD_GROUP_TYPE_LABEL_KEYS, WORLD_LINK_TYPE_LABELS } from '../../lib/types/world-group'
import type { Project, WorldGroup, WorldGroupType, WorldGroupLinkType } from '../../lib/types'
import WorldGroupDetail from './WorldGroupDetail'
import WorldRelationGraph from './WorldRelationGraph'

interface Props {
  project: Project
}

export default function WorldGroupOverview({ project }: Props) {
  const { t } = useTranslation('panels')
  const { groups, links, loading, loadAll, createGroup, deleteGroup, ensurePrimaryGroup, createLink, deleteLink } = useWorldGroupStore()
  const [editingGroup, setEditingGroup] = useState<WorldGroup | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  // 关系创建
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [linkForm, setLinkForm] = useState<{ from: number | ''; to: number | ''; type: WorldGroupLinkType; name: string }>({
    from: '', to: '', type: 'portal', name: '',
  })

  // AI 建议世界
  const ai = useAIStream(createAISessionKey(project.id!, 'world-group.suggest'))
  const [showSuggest, setShowSuggest] = useState(() => !!(ai.output || ai.isStreaming || ai.error))
  const [concept, setConcept] = useState('')
  const [suggested, setSuggested] = useState<SuggestedWorld[] | null>(null)
  const [adoptedIdx, setAdoptedIdx] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!project.id) return
    loadAll(project.id).then(() => ensurePrimaryGroup(project.id!))
  }, [project.id, loadAll, ensurePrimaryGroup])

  useEffect(() => {
    if (ai.isStreaming || !ai.output) return
    setShowSuggest(true)
    setSuggested(parseWorldSuggestOutput(ai.output))
  }, [ai.isStreaming, ai.output])

  const handleAISuggest = async () => {
    const existingWorlds = await buildAllWorldsOverview(project.id!)
    const messages = buildWorldSuggestPrompt({
      projectName: project.name,
      genres: (project.genres || []).join('、'),
      concept: concept || project.description || '（未填写，请根据题材自由发挥）',
      existingWorlds,
      userHint: '',
    })
    const result = await ai.start(messages, undefined, { category: 'world-group.suggest', projectId: project.id! })
    if (!result) return
    const parsed = parseWorldSuggestOutput(result)
    setSuggested(parsed)
    setAdoptedIdx(new Set())
  }

  const handleAdoptSuggested = async (idx: number) => {
    if (!suggested || adoptedIdx.has(idx)) return
    const w = suggested[idx]
    await createGroup({
      projectId: project.id!,
      name: w.name,
      description: w.description,
      type: w.type,
      icon: '🌐',
      order: groups.length + idx,
      entryCondition: w.entryCondition || undefined,
      powerRestriction: w.powerRestriction || undefined,
      plannedChapterCount: w.plannedChapterCount || undefined,
    })
    setAdoptedIdx(prev => new Set(prev).add(idx))
  }

  const handleAddWorld = async () => {
    const id = await createGroup({
      projectId: project.id!,
      name: '新世界',
      description: '',
      type: 'traversal' as WorldGroupType,
      icon: '🌐',
      order: groups.length,
    })
    // 自动进入编辑
    const created = groups.find(g => g.id === id) ||
      { id, projectId: project.id!, name: '新世界', description: '', type: 'traversal' as WorldGroupType, icon: '🌐', order: groups.length, createdAt: Date.now(), updatedAt: Date.now() }
    setEditingGroup(created)
  }

  const handleDelete = async (id: number) => {
    await deleteGroup(id)
    setConfirmDeleteId(null)
  }

  const handleCreateLink = async () => {
    if (linkForm.from === '' || linkForm.to === '' || linkForm.from === linkForm.to) return
    await createLink({
      projectId: project.id!,
      fromGroupId: Number(linkForm.from),
      toGroupId: Number(linkForm.to),
      linkType: linkForm.type,
      name: linkForm.name || undefined,
      bidirectional: false,
    })
    setLinkForm({ from: '', to: '', type: 'portal', name: '' })
    setShowLinkForm(false)
  }

  // 如果正在编辑某个世界，显示详情
  if (editingGroup) {
    const latest = groups.find(g => g.id === editingGroup.id) || editingGroup
    return (
      <div className="max-w-3xl mx-auto">
        <WorldGroupDetail
          group={latest}
          onBack={() => setEditingGroup(null)}
        />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 顶部标题 */}
      <div className="pb-4 border-b border-border/40">
        <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
          {t('worldGroup.title')}
        </h2>
        <p className="text-xs text-text-muted mt-0.5">
          {t('worldGroup.subtitle')}
        </p>
      </div>

      {loading ? (
        <div className="text-text-muted text-sm py-8 text-center">{t('worldGroup.loading')}</div>
      ) : (
        <>
          {/* 世界列表 */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">{t('worldGroup.worldList')} ({groups.length})</h3>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowSuggest(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-bg-elevated text-text-secondary border border-border hover:text-accent hover:border-accent/50 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {t('worldGroup.aiSuggestWorlds')}
                </button>
                <button
                  onClick={handleAddWorld}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('worldGroup.addWorld')}
                </button>
              </div>
            </div>

            {/* AI 建议世界面板 */}
            {showSuggest && (
              <div className="p-3 bg-bg-surface border border-border rounded-lg space-y-2.5">
                <textarea
                  value={concept}
                  onChange={e => setConcept(e.target.value)}
                  placeholder={t('worldGroup.conceptPlaceholder')}
                  rows={2}
                  className="w-full px-3 py-2 bg-bg-base border border-border rounded text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAISuggest}
                    disabled={ai.isStreaming}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
                  >
                    {ai.isStreaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {ai.isStreaming ? t('worldGroup.aiThinking') : t('worldGroup.generateSuggestions')}
                  </button>
                  {ai.isStreaming && (
                    <button onClick={ai.stop} className="text-xs text-text-muted hover:text-red-500">{t('worldGroup.stop')}</button>
                  )}
                </div>
                {ai.error && <div className="text-xs text-red-400">{ai.error}</div>}

                {/* 建议结果 */}
                {suggested && suggested.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {suggested.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 p-2.5 bg-bg-base border border-border rounded-lg">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-text-primary">{w.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-bg-elevated text-text-muted border border-border/50">
                              {t(WORLD_GROUP_TYPE_LABEL_KEYS[w.type], { defaultValue: WORLD_GROUP_TYPE_LABELS[w.type] })}
                            </span>
                            {w.plannedChapterCount > 0 && (
                              <span className="text-[10px] text-text-muted">{t('worldGroup.chapters', { count: w.plannedChapterCount })}</span>
                            )}
                          </div>
                          <p className="text-xs text-text-muted mt-0.5">{w.description}</p>
                          {w.entryCondition && <p className="text-[10px] text-text-muted mt-0.5">{t('worldGroup.enterCondition', { condition: w.entryCondition })}</p>}
                        </div>
                        <button
                          onClick={() => handleAdoptSuggested(i)}
                          disabled={adoptedIdx.has(i)}
                          className={`shrink-0 flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors ${
                            adoptedIdx.has(i)
                              ? 'bg-green-600/20 text-green-400 cursor-default'
                              : 'bg-accent/10 text-accent hover:bg-accent/20'
                          }`}
                        >
                          {adoptedIdx.has(i) ? <><Check className="w-3 h-3" /> {t('worldGroup.adopted')}</> : t('worldGroup.adopt')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {suggested && suggested.length === 0 && (
                  <p className="text-xs text-text-muted">{t('worldGroup.noValidSuggestions')}</p>
                )}
              </div>
            )}

            <div className="space-y-1">
              {groups.map(g => (
                <div
                  key={g.id}
                  className="flex items-center gap-3 px-3 py-2.5 bg-bg-surface border border-border rounded-lg hover:border-accent/30 transition-colors group"
                >
                  <GripVertical className="w-4 h-4 text-text-muted/30 shrink-0 cursor-grab" />

                  {/* 图标 + 颜色指示 */}
                  <span className="text-xl shrink-0">{g.icon || '🌐'}</span>

                  {/* 信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">{g.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-bg-elevated text-text-muted border border-border/50">
                        {t(WORLD_GROUP_TYPE_LABEL_KEYS[g.type], { defaultValue: WORLD_GROUP_TYPE_LABELS[g.type] })}
                      </span>
                    </div>
                    {g.description && (
                      <p className="text-xs text-text-muted truncate mt-0.5">{g.description}</p>
                    )}
                  </div>

                  {/* 预计章节 */}
                  {g.plannedChapterCount ? (
                    <span className="text-xs text-text-muted shrink-0">{t('worldGroup.chapters', { count: g.plannedChapterCount })}</span>
                  ) : null}

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingGroup(g)}
                      className="p-1.5 rounded text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                      title={t('worldGroup.edit')}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    {g.type !== 'primary' && (
                      confirmDeleteId === g.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(g.id!)}
                            className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                          >
                            {t('worldGroup.confirmDelete')}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-0.5 text-xs text-text-muted hover:text-text-primary transition-colors"
                          >
                            {t('worldGroup.cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(g.id!)}
                          className="p-1.5 rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title={t('worldGroup.deleteWorld')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>

            {groups.length === 0 && (
              <div className="text-center py-8 text-text-muted text-sm">
                {t('worldGroup.noWorldGroups')}
              </div>
            )}
          </section>

          {/* 世界关系 */}
          {groups.length > 1 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-primary">{t('worldGroup.worldRelations')}</h3>
                <button
                  onClick={() => setShowLinkForm(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-bg-elevated text-text-secondary border border-border hover:text-accent hover:border-accent/50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('worldGroup.addRelation')}
                </button>
              </div>

              {/* 关系创建表单 */}
              {showLinkForm && (
                <div className="flex items-center gap-2 flex-wrap p-3 bg-bg-surface border border-border rounded-lg">
                  <select
                    value={linkForm.from}
                    onChange={e => setLinkForm(f => ({ ...f, from: e.target.value ? Number(e.target.value) : '' }))}
                    className="px-2 py-1.5 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
                  >
                    <option value="">{t('worldGroup.sourceWorld')}</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
                  </select>
                  <ArrowRight className="w-3.5 h-3.5 text-text-muted" />
                  <select
                    value={linkForm.to}
                    onChange={e => setLinkForm(f => ({ ...f, to: e.target.value ? Number(e.target.value) : '' }))}
                    className="px-2 py-1.5 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
                  >
                    <option value="">{t('worldGroup.targetWorld')}</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
                  </select>
                  <select
                    value={linkForm.type}
                    onChange={e => setLinkForm(f => ({ ...f, type: e.target.value as WorldGroupLinkType }))}
                    className="px-2 py-1.5 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
                  >
                    {(Object.entries(WORLD_LINK_TYPE_LABELS) as [WorldGroupLinkType, string][]).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <input
                    value={linkForm.name}
                    onChange={e => setLinkForm(f => ({ ...f, name: e.target.value }))}
                    placeholder={t('worldGroup.channelName')}
                    className="px-2 py-1.5 bg-bg-base border border-border rounded text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent w-32"
                  />
                  <button
                    onClick={handleCreateLink}
                    disabled={linkForm.from === '' || linkForm.to === '' || linkForm.from === linkForm.to}
                    className="px-3 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors"
                  >
                    {t('worldGroup.create')}
                  </button>
                </div>
              )}

              {/* 关系流向图（自适应布局） */}
              <WorldRelationGraph onNodeClick={(g) => setEditingGroup(g)} />

              {links.length > 0 && (
                <div className="space-y-1">
                  {links.map(l => {
                    const from = groups.find(g => g.id === l.fromGroupId)
                    const to = groups.find(g => g.id === l.toGroupId)
                    return (
                      <div key={l.id} className="flex items-center gap-2 px-3 py-2 bg-bg-surface border border-border rounded-lg text-sm group">
                        <span>{from?.icon} {from?.name}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-text-muted" />
                        <span>{to?.icon} {to?.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-bg-elevated text-text-muted border border-border/50">
                          {WORLD_LINK_TYPE_LABELS[l.linkType]}
                        </span>
                        {l.name && <span className="text-text-muted text-xs">（{l.name}）</span>}
                        <button
                          onClick={() => deleteLink(l.id!)}
                          className="ml-auto p-1 rounded text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          title={t('worldGroup.deleteRelation')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {/* 穿越总览 */}
          {groups.filter(g => g.type !== 'primary').length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-text-primary">{t('worldGroup.traversalOverview')}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-xs font-medium text-text-muted">{t('worldGroup.world')}</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-text-muted">{t('worldGroup.type')}</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-text-muted">{t('worldGroup.plannedChapters')}</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-text-muted">{t('worldGroup.entryCondition')}</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-text-muted">{t('worldGroup.powerRestriction')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.filter(g => g.type !== 'primary').map(g => (
                      <tr key={g.id} className="border-b border-border/50 hover:bg-bg-hover/50 transition-colors">
                        <td className="py-2 px-3">
                          <span className="flex items-center gap-1.5">
                            <span>{g.icon}</span>
                            <span className="text-text-primary">{g.name}</span>
                          </span>
                        </td>
                        <td className="py-2 px-3 text-text-muted text-xs">{t(WORLD_GROUP_TYPE_LABEL_KEYS[g.type], { defaultValue: WORLD_GROUP_TYPE_LABELS[g.type] })}</td>
                        <td className="py-2 px-3 text-text-muted">{g.plannedChapterCount || '—'}</td>
                        <td className="py-2 px-3 text-text-muted text-xs truncate max-w-[200px]">{g.entryCondition || '—'}</td>
                        <td className="py-2 px-3 text-text-muted text-xs truncate max-w-[200px]">{g.powerRestriction || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
