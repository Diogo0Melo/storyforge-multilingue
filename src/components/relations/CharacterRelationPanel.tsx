import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Plus, Trash2, ArrowRightLeft, ArrowRight, Users, GitFork, List, Sparkles, Check, X, AlertCircle } from 'lucide-react'
import { useCharacterRelationStore } from '../../stores/character-relation'
import { useCharacterStore } from '../../stores/character'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { buildRelationExtractPrompt, parseRelationOutput, matchRelations, type MatchedRelation } from '../../lib/ai/relation-extractor'
import type { Project, RelationType } from '../../lib/types'
import { CInput, CTextarea } from '../shared/CompositionInput'
import { useToast } from '../shared/Toast'
import { syncRelationToCharacterFields } from '../../lib/relations/relationship-summary'
import RelationGraph from './RelationGraph'
import { useDomainT } from '../../i18n'

const RELATION_TYPE_VALUES: RelationType[] = [
  'family',
  'lover',
  'friend',
  'rival',
  'enemy',
  'master',
  'student',
  'ally',
  'subordinate',
  'other',
]

interface Props {
  project: Project
}

export default function CharacterRelationPanel({ project }: Props) {
  const { t } = useDomainT('relations')
  const { relations, addRelation, updateRelation, deleteRelation } = useCharacterRelationStore()
  const { characters } = useCharacterStore()
  const toast = useToast()
  const projectId = project.id!

  const [editingId, setEditingId] = useState<number | null>(null)
  const [view, setView] = useState<'list' | 'graph'>('graph')
  const containerRef = useRef<HTMLDivElement>(null)
  const [graphWidth, setGraphWidth] = useState(700)

  // ── AI 提取相关状态 ──
  const ai = useAIStream(createAISessionKey(projectId, 'relation.extract'))
  const [extractedRelations, setExtractedRelations] = useState<MatchedRelation[]>([])
  const [selectedExtracted, setSelectedExtracted] = useState<Set<number>>(new Set())
  const [showExtractPanel, setShowExtractPanel] = useState(false)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [savedId, setSavedId] = useState<number | null>(null)

  const projectCharacters = useMemo(
    () => characters.filter((c) => c.projectId === projectId),
    [characters, projectId],
  )
  const projectRelations = useMemo(
    () => relations.filter((r) => r.projectId === projectId),
    [relations, projectId],
  )
  const projectCharacterIds = useMemo(
    () => new Set(projectCharacters.map((c) => c.id).filter((id): id is number => id != null)),
    [projectCharacters],
  )
  const validProjectRelations = useMemo(
    () => projectRelations.filter((r) =>
      projectCharacterIds.has(r.fromCharacterId) && projectCharacterIds.has(r.toCharacterId),
    ),
    [projectRelations, projectCharacterIds],
  )

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) setGraphWidth(Math.floor(w))
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // ── AI 提取：流完成后自动解析 ──
  useEffect(() => {
    if (!ai.isStreaming && ai.output) {
      setShowExtractPanel(true)
      const parsed = parseRelationOutput(ai.output)
      const matched = matchRelations(parsed, projectCharacters, validProjectRelations)
      setExtractedRelations(matched)
      // 默认选中所有非重复的
      const sel = new Set<number>()
      matched.forEach((r, i) => { if (!r.isDuplicate) sel.add(i) })
      setSelectedExtracted(sel)
    }
  }, [ai.isStreaming, ai.output, projectCharacters, validProjectRelations])

  const handleAIExtract = useCallback(async () => {
    setShowExtractPanel(true)
    setExtractedRelations([])
    setSelectedExtracted(new Set())
    const messages = await buildRelationExtractPrompt(projectId, projectCharacters)
    ai.start(messages, undefined, { category: 'relation.extract', projectId, outputKind: 'functional-structured' })
  }, [projectId, projectCharacters, ai])

  const handleAcceptExtracted = async () => {
    let written = 0
    try {
      for (const [i, rel] of extractedRelations.entries()) {
        if (!selectedExtracted.has(i)) continue
        if (!projectCharacterIds.has(rel.fromCharacterId) || !projectCharacterIds.has(rel.toCharacterId)) {
          toast.error(t('messages.skippedForeignRelationToast'))
          continue
        }
        const relation = {
          projectId,
          fromCharacterId: rel.fromCharacterId,
          toCharacterId: rel.toCharacterId,
          relationType: rel.type,
          label: rel.label,
          description: rel.description,
          isBidirectional: rel.bidirectional,
        }
        await addRelation(relation)
        await syncRelationToCharacterFields({ projectId, relation, characters: projectCharacters })
        written++
      }
      if (written > 0) await useCharacterStore.getState().loadAll(projectId)
      toast.success(t('messages.importSuccessToast', { count: written }))
    } catch (err) {
      toast.error(t('messages.importFailedToast', { message: err instanceof Error ? err.message : String(err) }))
      return
    }
    setShowExtractPanel(false)
    setExtractedRelations([])
    ai.reset()
  }

  // 新建关系
  const handleAdd = async () => {
    if (projectCharacters.length < 2) return
    const relation = {
      projectId,
      fromCharacterId: projectCharacters[0]?.id ?? 0,
      toCharacterId: projectCharacters[1]?.id ?? 0,
      relationType: 'friend' as RelationType,
      label: t('messages.defaultNewLabel'),
      description: '',
      isBidirectional: true,
    }
    try {
      await addRelation(relation)
      toast.success(t('messages.saveSuccessToast'))
    } catch (err) {
      toast.error(t('messages.saveFailedToast', { message: err instanceof Error ? err.message : String(err) }))
    }
  }

  const handleUpdateRelation = async (
    id: number,
    data: Parameters<typeof updateRelation>[1],
    options: { notify?: boolean } = {},
  ) => {
    setSavingId(id)
    try {
      await updateRelation(id, data)
      setSavedId(id)
      window.setTimeout(() => {
        setSavedId(current => current === id ? null : current)
      }, 1600)
      if (options.notify) toast.success(t('messages.saveSuccessToast'))
    } catch (err) {
      toast.error(t('messages.saveFailedToast', { message: err instanceof Error ? err.message : String(err) }))
    } finally {
      setSavingId(null)
    }
  }

  const handleDeleteRelation = async (id: number) => {
    try {
      await deleteRelation(id)
      toast.success(t('messages.deleteSuccessToast'))
    } catch (err) {
      toast.error(t('messages.deleteFailedToast', { message: err instanceof Error ? err.message : String(err) }))
    }
  }

  const getCharacterName = (id: number) => {
    return projectCharacters.find((c) => c.id === id)?.name || t('messages.characterRefFallback', { id })
  }

  const duplicateCount = extractedRelations.filter(r => r.isDuplicate).length

  return (
    <div className="max-w-4xl mx-auto space-y-6" ref={containerRef}>
      {/* 标题 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-bold text-text-primary">{t('panel.pageTitle')}</h1>
          <span className="text-sm text-text-muted">{t('panel.relationCountSuffix', { count: projectRelations.length })}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* 视图切换 */}
          <div className="flex bg-bg-elevated rounded-lg p-0.5">
            <button
              onClick={() => setView('graph')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors ${
                view === 'graph' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <GitFork className="w-3.5 h-3.5" /> {t('panel.viewGraphLabel')}
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors ${
                view === 'list' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <List className="w-3.5 h-3.5" /> {t('panel.viewListLabel')}
            </button>
          </div>
          <button
            onClick={handleAIExtract}
            disabled={projectCharacters.length < 2 || ai.isStreaming}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-sm hover:bg-accent/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={t('panel.aiExtractButtonTitle')}
          >
            <Sparkles className="w-4 h-4" />
            {ai.isStreaming ? t('panel.aiExtractButtonStreaming') : t('panel.aiExtractButtonIdle')}
          </button>
          <button
            onClick={handleAdd}
            disabled={projectCharacters.length < 2}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={projectCharacters.length < 2 ? t('panel.addRelationButtonDisabledTitle') : t('panel.addRelationButtonTitle')}
          >
            <Plus className="w-4 h-4" />
            {t('panel.addRelationButtonLabel')}
          </button>
        </div>
      </div>

      {/* ── AI 提取结果面板 ── */}
      {showExtractPanel && (
        <div className="bg-bg-surface border border-accent/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              {t('panel.extractPanelTitle')}
            </h3>
            <button
              onClick={() => { setShowExtractPanel(false); ai.reset() }}
              className="text-text-muted hover:text-text-primary"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {ai.isStreaming && (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <span className="animate-spin">⏳</span>
              {t('panel.extractStreamingHint')}
            </div>
          )}

          {ai.error && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertCircle className="w-4 h-4" />
              {ai.error}
            </div>
          )}

          {extractedRelations.length > 0 && (
            <>
              <div className="text-xs text-text-muted">
                {t('panel.extractSummary', { total: extractedRelations.length, duplicateCount })}
              </div>
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                {extractedRelations.map((rel, i) => {
                  const fromName = projectCharacters.find(c => c.id === rel.fromCharacterId)?.name || rel.char1
                  const toName = projectCharacters.find(c => c.id === rel.toCharacterId)?.name || rel.char2
                  const typeLabel = t(`types.${rel.type}` as any) || rel.type
                  const isSelected = selectedExtracted.has(i)
                  return (
                    <label
                      key={i}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        rel.isDuplicate
                          ? 'border-border/50 bg-bg-base/50 opacity-60'
                          : isSelected
                            ? 'border-accent/40 bg-accent/5'
                            : 'border-border hover:border-border-hover'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setSelectedExtracted(prev => {
                            const next = new Set(prev)
                            if (next.has(i)) next.delete(i)
                            else next.add(i)
                            return next
                          })
                        }}
                        className="mt-0.5 accent-accent"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-text-primary">{fromName}</span>
                          <span className="text-accent text-xs">{rel.bidirectional ? '⇄' : '→'}</span>
                          <span className="font-medium text-text-primary">{toName}</span>
                          <span className="px-1.5 py-0.5 bg-accent/10 text-accent rounded text-xs">{typeLabel}</span>
                          {rel.label && <span className="text-xs text-text-muted">{t('panel.extractedRelationLabel', { label: rel.label })}</span>}
                          {rel.isDuplicate && (
                            <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded text-xs">{t('panel.extractDuplicateBadge')}</span>
                          )}
                        </div>
                        {rel.description && (
                          <p className="text-xs text-text-muted mt-1 line-clamp-2">{rel.description}</p>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => { setShowExtractPanel(false); ai.reset() }}
                  className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
                >
                  {t('panel.extractCancelButton')}
                </button>
                <button
                  onClick={handleAcceptExtracted}
                  disabled={selectedExtracted.size === 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 disabled:opacity-40 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  {t('panel.extractImportButton', { count: selectedExtracted.size })}
                </button>
              </div>
            </>
          )}

          {!ai.isStreaming && !ai.error && extractedRelations.length === 0 && ai.output && (
            <div className="text-sm text-text-muted py-2">
              {t('panel.extractEmptyResult')}
            </div>
          )}
        </div>
      )}

      {/* 关系图视图 */}
      {view === 'graph' && (
        <RelationGraph characters={projectCharacters} relations={validProjectRelations} width={graphWidth} height={480} />
      )}

      {/* 提示 */}
      {projectCharacters.length < 2 && (
        <div className="bg-accent/10 border border-accent/20 rounded-lg p-4 text-sm text-text-secondary">
          {t('panel.minCharactersNotice')}
        </div>
      )}

      {/* 列表视图 */}
      {view === 'list' && validProjectRelations.length === 0 && projectCharacters.length >= 2 && (
        <div className="text-center py-16 text-text-muted">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>{t('panel.listEmptyTitle')}</p>
          <p className="text-sm mt-1">{t('panel.listEmptyHint')}</p>
        </div>
      )}

      {view === 'list' && <div className="space-y-3">
        {validProjectRelations.map((rel) => {
          const isEditing = editingId === rel.id
          return (
            <div
              key={rel.id}
              className="bg-bg-surface border border-border rounded-lg p-4 hover:border-accent/30 transition-colors"
            >
              {/* 关系概览行 */}
              <div className="flex items-center gap-3 mb-3">
                {/* 角色 A */}
                <select
                  value={rel.fromCharacterId}
                  onChange={(e) =>
                    handleUpdateRelation(rel.id!, { fromCharacterId: Number(e.target.value) }, { notify: true })
                  }
                  className="bg-bg-base border border-border rounded px-2 py-1.5 text-sm text-text-primary flex-1 max-w-[180px]"
                >
                  {projectCharacters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                {/* 方向指示器 */}
                <button
                  onClick={() =>
                    handleUpdateRelation(rel.id!, { isBidirectional: !rel.isBidirectional }, { notify: true })
                  }
                  className="text-accent hover:text-accent/80 transition-colors"
                  title={rel.isBidirectional ? t('panel.directionToggleBidirectionalTitle') : t('panel.directionToggleUnidirectionalTitle')}
                >
                  {rel.isBidirectional ? (
                    <ArrowRightLeft className="w-5 h-5" />
                  ) : (
                    <ArrowRight className="w-5 h-5" />
                  )}
                </button>

                {/* 角色 B */}
                <select
                  value={rel.toCharacterId}
                  onChange={(e) =>
                    handleUpdateRelation(rel.id!, { toCharacterId: Number(e.target.value) }, { notify: true })
                  }
                  className="bg-bg-base border border-border rounded px-2 py-1.5 text-sm text-text-primary flex-1 max-w-[180px]"
                >
                  {projectCharacters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                {/* 关系类型 */}
                <select
                  value={rel.relationType}
                  onChange={(e) =>
                    handleUpdateRelation(rel.id!, { relationType: e.target.value as RelationType }, { notify: true })
                  }
                  className="bg-bg-base border border-border rounded px-2 py-1.5 text-sm text-text-primary"
                >
                  {RELATION_TYPE_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {t(`types.${value}`)}
                    </option>
                  ))}
                </select>

                {/* 展开/折叠 & 删除 */}
                <button
                  onClick={() => setEditingId(isEditing ? null : rel.id!)}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors"
                >
                  {isEditing ? t('panel.collapseButton') : t('panel.expandButton')}
                </button>
                {savingId === rel.id && <span className="text-xs text-text-muted">{t('panel.savingIndicator')}</span>}
                {savingId !== rel.id && savedId === rel.id && <span className="text-xs text-accent">{t('panel.autosavedIndicator')}</span>}
                <button
                  onClick={() => handleDeleteRelation(rel.id!)}
                  className="text-text-muted hover:text-red-400 transition-colors"
                  title={t('panel.deleteRelationTitle')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* 关系标签（始终显示） */}
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <span className="font-medium text-text-primary">{getCharacterName(rel.fromCharacterId)}</span>
                <span className="text-accent">
                  {rel.isBidirectional ? '⇄' : '→'}
                </span>
                <span className="font-medium text-text-primary">{getCharacterName(rel.toCharacterId)}</span>
                <span className="text-text-muted">{t('panel.relationLabelSeparator')}</span>
                {isEditing ? (
                  <CInput
                    value={rel.label}
                    onChange={(e) => handleUpdateRelation(rel.id!, { label: e.target.value })}
                    className="bg-bg-base border border-border rounded px-2 py-1 text-sm text-text-primary flex-1"
                    placeholder={t('panel.relationLabelPlaceholder')}
                  />
                ) : (
                  <span className="text-accent font-medium">{rel.label || t('panel.unnamedRelationFallback')}</span>
                )}
              </div>

              {/* 展开的编辑区域 */}
              {isEditing && (
                <div className="mt-3 pt-3 border-t border-border">
                  <label className="block text-xs text-text-muted mb-1">{t('panel.descriptionLabel')}</label>
                  <CTextarea
                    value={rel.description}
                    onChange={(e) => handleUpdateRelation(rel.id!, { description: e.target.value })}
                    rows={3}
                    className="w-full bg-bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-accent"
                    placeholder={t('panel.descriptionPlaceholder')}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>}
    </div>
  )
}
