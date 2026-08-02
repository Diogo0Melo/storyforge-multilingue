/**
 * WorldMapPanel — 世界地图主面板
 * 顶层容器：世界树导航 + AI 生成按钮 + Voronoi/2D/3D 切换 + Canvas + 属性编辑器
 */

import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { TokenUsage } from '../shared/TokenUsage'
import { formatNumber } from '../../i18n/format'
import { Sparkles, Loader2, RefreshCw, Map, Box, Globe } from 'lucide-react'
import { useGeographyStore } from '../../stores/project-singletons'
import { useWorldviewStore } from '../../stores/worldview'
import { useWorldNodeStore } from '../../stores/world-node'
import { useWorldGroupStore } from '../../stores/world-group'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { db } from '../../lib/db/schema'
import WorldGroupSwitcher from '../world-group/WorldGroupSwitcher'
import {
  buildVoronoiMapPrompt,
  parseVoronoiMapConfig,
} from '../../lib/ai/adapters/voronoi-map-adapter'
import { assembleContext } from '../../lib/registry/assemble-context'
import type { Project, Location, Worldview, Geography } from '../../lib/types'
import type { MapGenConfig } from '../../lib/world-map/engine'
import WorldTreeSidebar from './WorldTreeSidebar'

// Voronoi 地图引擎组件懒加载
const WorldMapVoronoi = lazy(() => import('./WorldMapVoronoi'))

interface Props {
  project: Project
}

type ViewMode = '3d' | 'voronoi'

export default function WorldMapPanel({ project }: Props) {
  const { t } = useTranslation('panels')
  const { geography } = useGeographyStore()
  const { worldview } = useWorldviewStore()
  const { nodes, activeWorldId, loadNodes, ensureRootWorld, updateNode } = useWorldNodeStore()
  const activeGroupId = useWorldGroupStore(s => s.activeGroupId)
  const ai = useAIStream(createAISessionKey(
    project.id!,
    'geography.world-map',
    activeWorldId ?? activeGroupId ?? 'root',
  ))

  const [viewMode, setViewMode] = useState<ViewMode>('voronoi')

  // 当前活跃世界的 Voronoi 配置
  const [voronoiConfig, setVoronoiConfig] = useState<Partial<MapGenConfig> | undefined>(undefined)
  const [parseError, setParseError] = useState<string | null>(null)

  // 多世界模式下世界树按世界组隔离；单世界传 null 走原逻辑
  const scopedGroupId = project.enableMultiWorld ? activeGroupId : null

  // ── 初始化世界树（按世界组作用域） ──
  useEffect(() => {
    if (!project.id) return
    ensureRootWorld(project.id, scopedGroupId).then(() => loadNodes(project.id!, scopedGroupId))
  }, [project.id, scopedGroupId, ensureRootWorld, loadNodes])

  // ── 切换世界时加载该世界的地图配置 ──
  const activeNode = nodes.find(n => n.id === activeWorldId)

  useEffect(() => {
    if (!activeNode) {
      setVoronoiConfig(undefined)
      return
    }
    // 从世界节点加载地图配置
    if (activeNode.mapConfigJSON) {
      try {
        setVoronoiConfig(JSON.parse(activeNode.mapConfigJSON))
      } catch {
        setVoronoiConfig(undefined)
      }
    } else {
      setVoronoiConfig(undefined)
    }
  }, [activeNode])

  // ── AI 生成地图 ─────────────────────────────────────────
  const handleGenerate = async () => {
    // 多世界模式：读取当前世界组的世界观 + 地理（store 里的可能不是本世界组的）
    // 单世界模式：直接用 store（同原逻辑）
    let wv: Partial<Worldview> | null = worldview
    let geo: Geography | undefined = geography ?? undefined
    if (project.enableMultiWorld && scopedGroupId != null) {
      const allWv = await db.worldviews.where('projectId').equals(project.id!).toArray()
      wv = allWv.find(w => w.worldGroupId === scopedGroupId) ?? null
      const allGeo = await db.geographies.where('projectId').equals(project.id!).toArray()
      geo = allGeo.find(g => g.worldGroupId === scopedGroupId)
    }

    const overview = geo?.overview || ''
    let locations: Location[] = []
    try {
      locations = JSON.parse(geo?.locations || '[]')
    } catch { /* empty */ }

    setParseError(null)
    // 读全:把当前世界作用域下的自然/人文词条(具体山川/势力/城池)也喂给地图生成
    const codexCtx = (await assembleContext({
      projectId: project.id!,
      worldGroupId: scopedGroupId,
      sourceKeys: ['codex', 'locations'],
    })).text
    const messages = buildVoronoiMapPrompt(wv, overview, locations, codexCtx)
    const result = await ai.start(messages, undefined, { category: 'geography.world-map', projectId: project.id! })
    if (!result) return

    try {
      // 证据只能命中用户资料，不能借用 system prompt 中的示例文字。
      const sourceText = messages
        .filter(message => message.role === 'user')
        .map(message => message.content)
        .join('\n\n')
      const config = parseVoronoiMapConfig(result, sourceText)
      if (activeNode) {
        config.mapName = activeNode.name
      }
      setVoronoiConfig(config)

      // 持久化到世界节点
      if (activeWorldId) {
        await updateNode(activeWorldId, {
          mapConfigJSON: JSON.stringify(config),
        })
      }
    } catch (err) {
      console.error('Failed to parse AI Voronoi config:', err)
      setParseError(t('geography.aiParseError', { error: err instanceof Error ? err.message : t('errors.ai.unknown', { ns: 'common' }) }))
    }
  }

  const handleMapConfigChange = useCallback(async (patch: Partial<MapGenConfig>) => {
    const nextConfig = { ...(voronoiConfig ?? {}), ...patch }
    setVoronoiConfig(nextConfig)
    if (activeWorldId) {
      await updateNode(activeWorldId, {
        mapConfigJSON: JSON.stringify(nextConfig),
      })
    }
  }, [activeWorldId, updateNode, voronoiConfig])

  // ── 渲染 ─────────────────────────────────────────────────
  const generateButtonLabel = voronoiConfig ? t('geography.aiRegenerate') : t('geography.aiGenerateMap')

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏 */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <Map className="w-5 h-5" />
          {t('geography.worldMapTitle')}
          {activeNode && (
            <span className="text-sm font-normal text-text-muted ml-1">
              — {activeNode.icon} {activeNode.name}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {/* 多世界：世界组切换（切换后整套世界树+地图跟随） */}
          {project.enableMultiWorld && <WorldGroupSwitcher />}
          {/* 视图切换 */}
          <div className="flex bg-bg-elevated rounded-lg p-0.5 border border-border">
            <button
              onClick={() => setViewMode('voronoi')}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors ${
                viewMode === 'voronoi'
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Globe className="w-3 h-3" /> {t('geography.viewFantasy')}
            </button>
            <button
              type="button"
              disabled
              title={t('geography.view3DTitle')}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors text-text-muted/50 cursor-not-allowed"
            >
              <Box className="w-3 h-3" /> {t('geography.view3DLabs')}
            </button>
          </div>

          <button
            onClick={handleGenerate}
            disabled={ai.isStreaming}
            className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {ai.isStreaming ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('geography.aiAnalyzing')}
              </>
            ) : voronoiConfig ? (
              <>
                <RefreshCw className="w-4 h-4" />
                {generateButtonLabel}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {t('geography.aiGenerateMap')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* AI 错误提示 */}
      {(ai.error || parseError) && (
        <div className="mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {ai.error || parseError}
        </div>
      )}

      {/* AI 流式输出进度 */}
      {ai.isStreaming && (
        <div className="mb-3 p-3 bg-accent/10 border border-accent/20 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-accent mb-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t('geography.aiAnalyzingWorld')}
            {ai.output.length > 0 && (
              <span className="text-xs text-text-muted">≈ ~{formatNumber(Math.round(ai.output.length * 1.5))} tokens</span>
            )}
          </div>
          <div className="text-xs text-text-muted max-h-20 overflow-y-auto font-mono">
            {ai.output.slice(0, 200)}
            {ai.output.length > 200 && '...'}
          </div>
        </div>
      )}
      {ai.tokenUsage && !ai.isStreaming && (
        <TokenUsage inputTokens={ai.tokenUsage.inputTokens} outputTokens={ai.tokenUsage.outputTokens} className="mb-2 text-[10px] text-text-muted" />
      )}

      {/* 主内容区域：世界树 + 地图 */}
      <div className="flex-1 flex min-h-0 rounded-lg overflow-hidden border border-border">
        {/* 世界树侧边栏 */}
        <WorldTreeSidebar projectId={project.id!} />

        {/* 地图区域 — 奇幻 Voronoi 地图 */}
        <div className="flex-1 min-w-0">
          <Suspense fallback={
            <div className="w-full h-full flex items-center justify-center bg-[#1a1f2e]">
              <div className="text-center text-text-muted">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-accent" />
                <p className="text-sm">{t('geography.loadingMapEngine')}</p>
              </div>
            </div>
          }>
            <WorldMapVoronoi
              key={activeWorldId ?? 'default'}
              config={voronoiConfig}
              onConfigChange={handleMapConfigChange}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
