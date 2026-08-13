/**
 * 场景拆分面板 — 从 DetailedOutlinePanel 提取，可嵌入章节编辑页
 *
 * 展示并编辑某章节的细纲场景列表，支持 AI 一键拆场景。
 */
import { useState, useEffect } from 'react'
import { Plus, Trash2, Sparkles, ChevronDown, ChevronRight, Wand2 } from 'lucide-react'
import { useDetailedOutlineStore } from '../../stores/detailed-outline'
import { useOutlineStore } from '../../stores/outline'
import { useCharacterStore } from '../../stores/character'
import { useForeshadowStore } from '../../stores/foreshadow'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { buildDetailSceneGeneratePrompt, normalizeParsedScenes, parseEnhancedDetailSmart } from '../../lib/ai/adapters/detail-scene-adapter'
import AIStreamOutput from '../shared/AIStreamOutput'
import { nanoid } from '../../lib/utils/id'
import { adopt } from '../../lib/registry/adopt'
import { assembleContext } from '../../lib/registry/assemble-context'
import { useAIConfigStore } from '../../stores/ai-config'
import { useToast } from '../shared/Toast'
import { useDomainT } from '../../i18n'
import type { DetailedScene, Project, ScenePace } from '../../lib/types'
import ChapterOutlineWorkshop from './ChapterOutlineWorkshop'
import { adoptChapterOutlineWorkshopResult } from '../../lib/outline/adopt-workshop'

const PACE_KEYS: Record<ScenePace, string> = {
  slow:   'scene.pace.slow',
  medium: 'scene.pace.medium',
  fast:   'scene.pace.fast',
  climax: 'scene.pace.climax',
}

const PACE_COLORS: Record<ScenePace, string> = {
  slow:   'bg-info/10 text-info',
  medium: 'bg-text-muted/10 text-text-secondary',
  fast:   'bg-warning/10 text-warning',
  climax: 'bg-error/10 text-error',
}

interface Props {
  project: Project
  outlineNodeId: number
  chapterTitle: string
  chapterSummary: string
}

export default function ScenePanel({ project, outlineNodeId, chapterTitle, chapterSummary }: Props) {
  const { t, lang } = useDomainT('outline')
  const projectId = project.id!
  const { detailedOutlines, loadAll, getOrCreate, save } = useDetailedOutlineStore()
  const nodes = useOutlineStore(state => state.nodes)
  const characters = useCharacterStore(state => state.characters)
  const foreshadows = useForeshadowStore(state => state.foreshadows)
  const ai = useAIStream(createAISessionKey(projectId, 'detail.scene', outlineNodeId))
  const aiConfig = useAIConfigStore(s => s.config)
  const toast = useToast()
  const [expanded, setExpanded] = useState(false)
  const [showWorkshop, setShowWorkshop] = useState(false)

  useEffect(() => { loadAll(projectId) }, [projectId, loadAll])
  useEffect(() => { setShowWorkshop(false) }, [outlineNodeId])

  const detailed = detailedOutlines.find(d => d.outlineNodeId === outlineNodeId)
  const scenes = detailed?.scenes || []
  const hasScenes = scenes.length > 0

  const ensureDetailed = async () => {
    return await getOrCreate(projectId, outlineNodeId)
  }

  const updateScenes = async (nextScenes: DetailedScene[]) => {
    const dt = await ensureDetailed()
    if (!dt?.id) return
    await save(dt.id, { scenes: nextScenes })
  }

  const adoptScenes = async (nextScenes: DetailedScene[]) => {
    await adopt({
      projectId,
      target: 'detailedOutlines',
      mode: 'add',
      data: { outlineNodeId, scenes: nextScenes },
    })
    await loadAll(projectId)
  }

  const addScene = async () => {
    const dt = await ensureDetailed()
    if (!dt) return
    const newScene: DetailedScene = {
      sceneId: nanoid(),
      title: t('detailed.newSceneTitle'), summary: '',
      characterIds: [], location: '', conflict: '',
      pace: 'medium', estimatedWords: 0, notes: '',
    }
    await updateScenes([...(dt.scenes || []), newScene])
    setExpanded(true)
  }

  const updateScene = async (sceneId: string, patch: Partial<DetailedScene>) => {
    if (!detailed) return
    const next = detailed.scenes.map(s =>
      s.sceneId === sceneId ? { ...s, ...patch } : s
    )
    await updateScenes(next)
  }

  const deleteScene = async (sceneId: string) => {
    if (!detailed) return
    await updateScenes(detailed.scenes.filter(s => s.sceneId !== sceneId))
  }

  const handleAIGenerate = async () => {
    const assembled = await assembleContext({
      projectId,
      worldGroupId: null,
      outlineNodeId,
      sourceKeys: ['chapterOutline', 'canonAssertions', 'worldview', 'storyCore', 'characterDrivenPlan', 'powerSystem', 'cultivationProgress', 'codex', 'characters', 'creativeRules', 'worldRules', 'historical', 'locations'],
    })
    const charIdx = assembled.included.indexOf('characters')
    const messages = buildDetailSceneGeneratePrompt(
      chapterTitle,
      chapterSummary || '',
      assembled.text,
      charIdx >= 0 ? assembled.segments[charIdx]?.content ?? '' : '',
      '',
    )
    ai.start(messages, undefined, { category: 'detail.scene', projectId, outputKind: 'mixed' })
    setExpanded(true)
  }

  const totalWords = scenes.reduce((s, sc) => s + (sc.estimatedWords || 0), 0)
  const chapterNode = nodes.find(node => node.id === outlineNodeId && node.type === 'chapter')

  const handleAdoptWorkshop = async (raw: string): Promise<boolean> => {
    const result = await adoptChapterOutlineWorkshopResult({
      raw,
      projectId,
      outlineNodeId,
      chapterSummary,
      validCharacterIds: new Set(
        characters.map(character => character.id).filter((id): id is number => id != null),
      ),
      validForeshadowIds: new Set(
        foreshadows.map(item => item.id).filter((id): id is number => id != null),
      ),
    })
    if (!result.ok) {
      toast.error(t('scene.adoptWorkshopFailed', { reason: result.reason }))
      return false
    }
    await loadAll(projectId)
    toast.success(t('scene.adoptWorkshopSuccess', { sceneCount: result.sceneCount, prohibitionCount: result.prohibitionCount }))
    return true
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* 折叠头 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-bg-elevated hover:bg-bg-hover transition-colors text-left"
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-text-muted" /> : <ChevronRight className="w-4 h-4 text-text-muted" />}
        <span className="text-sm font-medium text-text-primary">{t('scene.panelTitle')}</span>
        {hasScenes && (
          <span className="text-xs text-text-muted">
            {t('scene.stats', { scenes: scenes.length, words: totalWords.toLocaleString() })}
          </span>
        )}
        <div className="flex-1" />
        <span onClick={e => { e.stopPropagation(); addScene() }}
          className="p-1 text-text-muted hover:text-accent rounded" title={t('scene.addSceneTitle')}>
          <Plus className="w-3.5 h-3.5" />
        </span>
        <span onClick={e => { e.stopPropagation(); handleAIGenerate() }}
          className={`p-1 text-text-muted hover:text-accent rounded ${ai.isStreaming ? 'opacity-50 pointer-events-none' : ''}`}
          title={t('scene.aiSplitTitle')}>
          <Sparkles className="w-3.5 h-3.5" />
        </span>
        <span
          onClick={event => {
            event.stopPropagation()
            setExpanded(true)
            setShowWorkshop(value => !value)
          }}
          className="p-1 text-text-muted hover:text-purple-500 rounded"
          title={t('scene.workshopTitle')}
        >
          <Wand2 className="w-3.5 h-3.5" />
        </span>
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="p-3 space-y-3 bg-bg-surface">
          {showWorkshop && chapterNode && (
            <ChapterOutlineWorkshop
              key={chapterNode.id}
              project={project}
              chapter={chapterNode}
              nodes={nodes}
              characters={characters}
              onAdopt={handleAdoptWorkshop}
              onClose={() => setShowWorkshop(false)}
            />
          )}

          {detailed?.prohibitions && detailed.prohibitions.length > 0 && (
            <div className="rounded border border-warning/30 bg-warning/10 p-2 text-[11px] text-text-secondary">
              <span className="font-medium text-warning">{t('scene.prohibitionsLabel')}</span>
              {new Intl.ListFormat(lang, { type: 'conjunction', style: 'short' }).format(detailed.prohibitions)}
            </div>
          )}
          {/* AI 输出 */}
          {(ai.output || ai.isStreaming || ai.error) && (
            <AIStreamOutput
              output={ai.output} isStreaming={ai.isStreaming} error={ai.error} tokenUsage={ai.tokenUsage}
              onStop={ai.stop}
              onAccept={async (text) => {
                try {
                  const parsed = await parseEnhancedDetailSmart(text, aiConfig)
                  const newScenes = normalizeParsedScenes(parsed?.scenes)
                  if (newScenes.length === 0) {
                    toast.error(t('detailed.adoptScenesFailed'))
                    return
                  }
                  await adoptScenes([...(detailed?.scenes || []), ...newScenes])
                  toast.success(t('detailed.adoptScenesSuccess', { count: newScenes.length }))
                } catch (err) {
                  console.error('[ScenePanel] 采纳失败:', err)
                  toast.error(t('detailed.adoptGenericFailed'))
                }
                ai.reset()
              }}
              onRetry={handleAIGenerate}
            />
          )}

          {/* 场景列表 */}
          {scenes.length === 0 ? (
            <div className="text-center py-6 text-text-muted text-xs">
              {t('scene.emptyState')}
            </div>
          ) : (
            scenes.map((s, idx) => (
              <div key={s.sceneId} className="bg-bg-base border border-border rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-text-muted text-xs">#{idx + 1}</span>
                  <input
                    value={s.title}
                    onChange={e => updateScene(s.sceneId, { title: e.target.value })}
                    placeholder={t('scene.titlePlaceholder')}
                    className="flex-1 px-2 py-1 bg-transparent border border-border rounded text-xs font-medium text-text-primary focus:outline-none focus:border-accent"
                  />
                  <select
                    value={s.pace}
                    onChange={e => updateScene(s.sceneId, { pace: e.target.value as ScenePace })}
                    className={`px-1.5 py-0.5 text-[10px] rounded border-0 ${PACE_COLORS[s.pace]}`}
                  >
                    {Object.entries(PACE_KEYS).map(([k, key]) => (
                      <option key={k} value={k}>{t(key as any)}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={s.estimatedWords || ''}
                    onChange={e => updateScene(s.sceneId, { estimatedWords: parseInt(e.target.value) || 0 })}
                    placeholder={t('scene.wordCountPlaceholder')}
                    className="w-16 px-1.5 py-0.5 bg-transparent border border-border rounded text-[10px] text-text-primary focus:outline-none focus:border-accent"
                  />
                  <button onClick={() => deleteScene(s.sceneId)} className="p-0.5 text-text-muted hover:text-error" title={t('scene.deleteAria', { index: idx + 1 })}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <textarea
                  value={s.summary}
                  onChange={e => updateScene(s.sceneId, { summary: e.target.value })}
                  placeholder={t('scene.summaryPlaceholder')}
                  rows={1}
                  className="w-full px-2 py-1 bg-transparent border border-border rounded text-xs text-text-primary resize-none focus:outline-none focus:border-accent"
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    value={s.location}
                    onChange={e => updateScene(s.sceneId, { location: e.target.value })}
                    placeholder={t('scene.locationPlaceholder')}
                    className="px-2 py-0.5 bg-transparent border border-border rounded text-[10px] text-text-primary focus:outline-none focus:border-accent"
                  />
                  <input
                    value={s.conflict}
                    onChange={e => updateScene(s.sceneId, { conflict: e.target.value })}
                    placeholder={t('scene.conflictPlaceholder')}
                    className="px-2 py-0.5 bg-transparent border border-border rounded text-[10px] text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
                {s.notes && (
                  <textarea
                    value={s.notes}
                    onChange={e => updateScene(s.sceneId, { notes: e.target.value })}
                    placeholder={t('scene.notesPlaceholder')}
                    rows={2}
                    className="w-full px-2 py-1 bg-transparent border border-border rounded text-[10px] text-text-muted resize-y focus:outline-none focus:border-accent"
                  />
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
