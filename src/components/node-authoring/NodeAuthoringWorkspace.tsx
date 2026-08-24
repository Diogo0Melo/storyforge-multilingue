import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleStop,
  AlignCenterHorizontal,
  AlignCenterVertical,
  Copy,
  Database,
  GitBranch,
  GripVertical,
  History,
  LayoutTemplate,
  LayoutDashboard,
  Loader2,
  Map,
  Pause,
  Play,
  Plus,
  Save,
  Star,
  RotateCcw,
  Users,
  Trash2,
  Workflow,
  X,
} from 'lucide-react'
import i18n, { useDomainT, type DomainTFunction } from '../../i18n'
import { projectCanonicalLabel, NODE_RUN_STATUS_LABEL_KEYS } from '../../i18n/display-projection'
import { nanoid } from 'nanoid'
import type { Project, NodeFlow, NodeRunRecord } from '../../lib/types'
import {
  AUTHORING_NODE_CATALOG,
  AUTHORING_NODE_BY_ID,
  authoringTemplatesForCategory,
  defaultConfigForTemplate,
} from '../../lib/node-authoring/catalog'
import {
  emptyAuthoringGraph,
  type AuthoringNodeGraph,
  type AuthoringNodeInstance,
  type AuthoringNodeTemplate,
} from '../../lib/node-authoring/contracts'
import { parseAuthoringGraph } from '../../lib/node-authoring/migration'
import { suggestAuthoringConnections, authoringPortsCompatible } from '../../lib/node-authoring/compatibility'
import { topologicalAuthoringOrder, validateAuthoringGraph } from '../../lib/node-authoring/graph'
import {
  adoptAuthoringCandidate,
  buildAuthoringExecutionPlan,
  parseAuthoringExecutionPlan,
  persistAdoptedAuthoringCandidate,
  runAuthoringGraph,
  type AuthoringCandidateMap,
  type AuthoringRunSnapshotMap,
} from '../../lib/node-authoring/executor'
import CreativeArtifactSummary from '../agent/CreativeArtifactSummary'
import { buildAuthoringOverviewGraph } from '../../lib/node-authoring/overview'
import { buildAuthoringCreationChainGraph } from '../../lib/node-authoring/creation-chain'
import { compareCandidateVariants } from '../../lib/node-authoring/candidate-diff'
import { inspectAuthoringGraphFreshness, type AuthoringFreshnessMap } from '../../lib/node-authoring/freshness'
import {
  alignAuthoringNodes,
  autoLayoutAuthoringGraph,
  authoringGraphBounds,
  compareAuthoringGraphs,
  copyAuthoringSubgraph,
  groupAuthoringNodes,
} from '../../lib/node-authoring/productivity'
import {
  AUTHORING_OFFICIAL_TEMPLATES,
  buildOfficialAuthoringTemplate,
} from '../../lib/node-authoring/templates'
import { useNodeFlowStore } from '../../stores/node-flow'
import { useAIConfigStore } from '../../stores/ai-config'
import { CONTEXT_SOURCES } from '../../lib/registry/context-sources'
import { buildRagLibrary } from '../../lib/retrieval/rag-library'
import type { RagLibraryEntry } from '../../lib/types'
import RagEntrySelector from '../retrieval/RagEntrySelector'
import { useDialog } from '../shared/Dialog'
import { useToast } from '../shared/Toast'

const NODE_WIDTH = 238
const NODE_HEIGHT = 168
const HEADER_HEIGHT = 38
const PORT_HEIGHT = 24

function templateColor(template: AuthoringNodeTemplate): string {
  if (template.class === 'control') return 'border-amber-400/60 bg-amber-50/80'
  if (template.class === 'processor') return 'border-sky-400/60 bg-sky-50/80'
  if (template.class === 'output') return 'border-emerald-400/60 bg-emerald-50/80'
  return 'border-violet-400/60 bg-violet-50/80'
}

function addEdge(graph: AuthoringNodeGraph, sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string): AuthoringNodeGraph {
  return {
    ...graph,
    edges: [...graph.edges, {
      id: nanoid(), sourceNodeId, sourcePortId, targetNodeId, targetPortId,
      mapping: { mode: 'full', missingPolicy: 'block', refreshPolicy: 'live' },
    }],
  }
}

function portPosition(node: AuthoringNodeInstance, direction: 'input' | 'output', index: number, zoom: number) {
  return {
    x: node.x + (direction === 'output' ? NODE_WIDTH : 0),
    y: node.y + HEADER_HEIGHT + index * PORT_HEIGHT + PORT_HEIGHT / 2,
    screenX: (node.x + (direction === 'output' ? NODE_WIDTH : 0)) * zoom,
    screenY: (node.y + HEADER_HEIGHT + index * PORT_HEIGHT + PORT_HEIGHT / 2) * zoom,
  }
}

function nodeFromTemplate(template: AuthoringNodeTemplate, index: number, t: DomainTFunction): AuthoringNodeInstance {
  const config = defaultConfigForTemplate(template)
  if (template.id === 'source.project-context') {
    config.sourceKeys = ['worldview', 'storyCore']
    config.ragEntryKeys = []
    config.contextBudget = 12_000
  }
  if (template.id === 'input.manual-text') config.text = ''
  // I18N-F5 · 新建节点默认名在创建期经 labelKey 解析（A4 translate-at-creation），
  // 与画布/库面板渲染同一 node-authoring ns；zh label 仅作兜底并保留给 prompt payload。
  const catalogTemplate = AUTHORING_NODE_BY_ID.get(template.id)
  const title = catalogTemplate ? t(catalogTemplate.labelKey, { defaultValue: template.label }) : template.label
  return {
    id: nanoid(), templateId: template.id, templateVersion: template.version,
    title, x: 80 + (index % 3) * 330, y: 80 + Math.floor(index / 3) * 240,
    config, inputs: structuredClone(template.inputs), outputs: structuredClone(template.outputs),
  }
}

function runData(run: NodeRunRecord | null) {
  if (!run) return { snapshots: {} as AuthoringRunSnapshotMap, candidates: {} as AuthoringCandidateMap }
  try {
    return {
      snapshots: JSON.parse(run.inputSnapshotsJson || '{}') as AuthoringRunSnapshotMap,
      candidates: JSON.parse(run.nodeResultsJson || '{}') as AuthoringCandidateMap,
    }
  } catch {
    return { snapshots: {}, candidates: {} }
  }
}

function NodeLibrary(props: {
  graph?: AuthoringNodeGraph
  onAdd: (template: AuthoringNodeTemplate) => void
  onSelectNode?: (id: string) => void
}) {
  const { t } = useDomainT('node-authoring')
  const categories = useMemo(() => {
    const seen: Array<[string, string]> = []
    const keys = new Set<string>()
    for (const template of AUTHORING_NODE_CATALOG) {
      if (!keys.has(template.category)) { keys.add(template.category); seen.push([template.category, template.categoryKey]) }
    }
    return seen
  }, [])
  const graph = props.graph ?? emptyAuthoringGraph()
  const favorites = graph.nodes.filter(node => node.favorite)
  const recent = [...graph.nodes]
    .filter(node => !node.favorite && node.lastOpenedAt)
    .sort((left, right) => (right.lastOpenedAt ?? 0) - (left.lastOpenedAt ?? 0))
    .slice(0, 5)
  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-bg-surface p-3">
      <div className="mb-3 flex items-center gap-2">
        <Workflow className="h-4 w-4 text-accent" />
        <div><p className="text-xs font-semibold text-text-primary">{t('library.title')}</p><p className="text-[10px] text-text-muted">{t('library.hint')}</p></div>
      </div>
      {(favorites.length > 0 || recent.length > 0) && <div className="mb-3 space-y-2 border-b border-border pb-3">
        {favorites.length > 0 && <section><h3 className="mb-1 flex items-center gap-1 px-1 text-[10px] font-semibold text-amber-700"><Star className="h-3 w-3" />{t('library.favorites')}</h3>{favorites.map(node => <button key={node.id} type="button" onClick={() => props.onSelectNode?.(node.id)} className="block w-full truncate rounded px-2 py-1 text-left text-[10px] text-text-secondary hover:bg-bg-hover">{node.title}</button>)}</section>}
        {recent.length > 0 && <section><h3 className="mb-1 flex items-center gap-1 px-1 text-[10px] font-semibold text-text-muted"><History className="h-3 w-3" />{t('library.recent')}</h3>{recent.map(node => <button key={node.id} type="button" onClick={() => props.onSelectNode?.(node.id)} className="block w-full truncate rounded px-2 py-1 text-left text-[10px] text-text-secondary hover:bg-bg-hover">{node.title}</button>)}</section>}
      </div>}
      <div className="space-y-3">
        {categories.map(([category, categoryKey]) => (
          <section key={category}>
            <h3 className="mb-1 px-1 text-[10px] font-semibold tracking-wide text-text-muted">{t(categoryKey, { defaultValue: category })}</h3>
            <div className="space-y-1">
              {authoringTemplatesForCategory(category).map(template => (
                <button key={template.id} type="button" onClick={() => props.onAdd(template)} className="group flex w-full items-start gap-2 rounded border border-transparent px-2 py-1.5 text-left hover:border-accent/40 hover:bg-bg-hover">
                  <GripVertical className="mt-0.5 h-3 w-3 shrink-0 text-text-muted group-hover:text-accent" />
                  <span className="min-w-0"><span className="block truncate text-[11px] font-medium text-text-primary">{t(template.labelKey, { defaultValue: template.label })}</span><span className="mt-0.5 block text-[9px] leading-3 text-text-muted">{t(template.descriptionKey, { defaultValue: template.description })}</span></span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  )
}

function AuthoringCanvas(props: {
  graph: AuthoringNodeGraph
  selectedNodeId: string | null
  selectedNodeIds: ReadonlySet<string>
  candidates: AuthoringCandidateMap
  freshness: AuthoringFreshnessMap
  onSelectNode: (id: string) => void
  onSelectionChange: (ids: string[]) => void
  onToggleFavorite: (id: string) => void
  onChange: (graph: AuthoringNodeGraph) => void
  onBeginConnection: (nodeId: string, portId: string, direction: 'input' | 'output') => void
  onCanvasConnection: (x: number, y: number) => void
  onRemoveNode: (id: string) => void
}) {
  const { t } = useDomainT('node-authoring')
  const dragRef = useRef<{ nodeId: string; startX: number; startY: number; nodeX: number; nodeY: number } | null>(null)
  const selectionRef = useRef<{ x: number; y: number } | null>(null)
  const selectionMovedRef = useRef(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const zoom = props.graph.viewport.zoom
  const height = 120 + Math.max(0, ...props.graph.nodes.map(node => node.y + HEADER_HEIGHT + Math.max(node.inputs.length, node.outputs.length) * PORT_HEIGHT))
  const width = Math.max(1900, 180 + Math.max(0, ...props.graph.nodes.map(node => node.x + NODE_WIDTH)))
  const bounds = authoringGraphBounds(props.graph)

  const canvasPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (event.clientX - rect.left + (canvasRef.current?.scrollLeft ?? 0) - props.graph.viewport.x) / zoom,
      y: (event.clientY - rect.top + (canvasRef.current?.scrollTop ?? 0) - props.graph.viewport.y) / zoom,
    }
  }

  const moveNode = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    props.onChange({ ...props.graph, nodes: props.graph.nodes.map(node => node.id === drag.nodeId ? {
      ...node,
      x: Math.max(20, drag.nodeX + (event.clientX - drag.startX) / zoom),
      y: Math.max(20, drag.nodeY + (event.clientY - drag.startY) / zoom),
    } : node) })
  }

  return (
    <div
      ref={canvasRef}
      className="relative min-w-0 flex-1 overflow-auto bg-[#f7f7f5]"
      onPointerDown={event => {
        if (event.button !== 0 || event.target !== event.currentTarget) return
        const point = canvasPoint(event)
        selectionRef.current = point
        selectionMovedRef.current = false
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event => {
        moveNode(event)
        if (!selectionRef.current) return
        const point = canvasPoint(event)
        const start = selectionRef.current
        const box = { x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) }
        if (box.width > 4 || box.height > 4) selectionMovedRef.current = true
        setSelectionBox(box)
      }}
      onPointerUp={event => {
        if (selectionRef.current) {
          const point = canvasPoint(event)
          const start = selectionRef.current
          const box = { x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) }
          if (selectionMovedRef.current) {
            props.onSelectionChange(props.graph.nodes.filter(node => (
              node.x < box.x + box.width && node.x + NODE_WIDTH > box.x
              && node.y < box.y + box.height && node.y + NODE_HEIGHT > box.y
            )).map(node => node.id))
          } else {
            props.onSelectionChange([])
          }
          selectionRef.current = null
          setSelectionBox(null)
        }
        dragRef.current = null
      }}
      onPointerLeave={() => { dragRef.current = null; selectionRef.current = null; setSelectionBox(null) }}
      onClick={event => {
        if (event.target !== event.currentTarget || selectionMovedRef.current) return
        const rect = canvasRef.current?.getBoundingClientRect()
        if (!rect) return
        props.onCanvasConnection((event.clientX - rect.left - props.graph.viewport.x) / zoom, (event.clientY - rect.top - props.graph.viewport.y) / zoom)
      }}
    >
      <div className="relative" style={{ width, height, transform: `translate(${props.graph.viewport.x}px, ${props.graph.viewport.y}px) scale(${zoom})`, transformOrigin: 'top left' }}>
        {(props.graph.groups ?? []).map(group => {
          const members = props.graph.nodes.filter(node => node.groupId === group.id)
          if (!members.length) return null
          const left = Math.min(...members.map(node => node.x)) - 16
          const top = Math.min(...members.map(node => node.y)) - 28
          const right = Math.max(...members.map(node => node.x + NODE_WIDTH)) + 16
          const bottom = Math.max(...members.map(node => node.y + NODE_HEIGHT)) + 16
          return <div key={group.id} className="pointer-events-none absolute rounded-lg border border-dashed border-accent/30 bg-accent/5" style={{ left, top, width: right - left, height: bottom - top }}><span className="absolute -top-5 left-1 text-[10px] font-semibold text-accent">{group.title}</span></div>
        })}
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          {props.graph.edges.map(edge => {
            const source = props.graph.nodes.find(node => node.id === edge.sourceNodeId)
            const target = props.graph.nodes.find(node => node.id === edge.targetNodeId)
            if (!source || !target) return null
            const sourceIndex = source.outputs.findIndex(port => port.id === edge.sourcePortId)
            const targetIndex = target.inputs.findIndex(port => port.id === edge.targetPortId)
            if (sourceIndex < 0 || targetIndex < 0) return null
            const from = portPosition(source, 'output', sourceIndex, 1)
            const to = portPosition(target, 'input', targetIndex, 1)
            const bend = Math.max(60, Math.abs(to.x - from.x) * 0.45)
            return <path key={edge.id} d={`M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeOpacity=".7" />
          })}
        </svg>
        {props.graph.nodes.map(node => {
          const template = AUTHORING_NODE_BY_ID.get(node.templateId)
          if (!template) return null
          const result = props.candidates[node.id]
          const freshness = props.freshness[node.id]
          const freshnessLabel = freshness?.status === 'stale'
            ? freshness.reasons.includes('source-missing') ? t('canvas.freshnessSourceMissing') : t('canvas.freshnessStale')
            : freshness?.status === 'fresh' ? t('canvas.freshnessFresh') : undefined
          return (
            <div key={node.id} data-authoring-node-template={node.templateId} role="button" tabIndex={0} aria-label={t('canvas.ariaNode', { title: node.title })} className={`absolute rounded-md border shadow-sm ${templateColor(template)} ${props.selectedNodeIds.has(node.id) ? 'ring-2 ring-accent ring-offset-1' : ''}`} style={{ left: node.x, top: node.y, width: NODE_WIDTH }} onClick={event => { event.stopPropagation(); props.onSelectNode(node.id) }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); props.onSelectNode(node.id) } }}>
              <div
                className="flex h-[38px] cursor-grab items-center gap-2 rounded-t-md border-b border-black/10 px-2 active:cursor-grabbing"
                onPointerDown={event => { event.stopPropagation(); dragRef.current = { nodeId: node.id, startX: event.clientX, startY: event.clientY, nodeX: node.x, nodeY: node.y }; event.currentTarget.setPointerCapture(event.pointerId) }}
              >
                <GripVertical className="h-3.5 w-3.5 text-text-muted" /><span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-text-primary">{node.title}</span><button type="button" title={node.favorite ? t('canvas.toggleFavoriteOn') : t('canvas.toggleFavoriteOff')} aria-label={node.favorite ? t('canvas.toggleFavoriteOn') : t('canvas.toggleFavoriteOff')} onClick={event => { event.stopPropagation(); props.onToggleFavorite(node.id) }} className={`rounded p-0.5 ${node.favorite ? 'text-amber-600' : 'text-text-muted'} hover:bg-amber-100`}><Star className="h-3 w-3" fill={node.favorite ? 'currentColor' : 'none'} /></button><button type="button" title={t('canvas.removeNode')} onClick={event => { event.stopPropagation(); props.onRemoveNode(node.id) }} className="rounded p-0.5 text-text-muted hover:bg-error/10 hover:text-error"><X className="h-3 w-3" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2 px-1 py-1.5">
                <div className="space-y-1">{node.inputs.map(port => { const tp = template.inputs.find(p => p.id === port.id); return <button key={port.id} type="button" onClick={event => { event.stopPropagation(); props.onBeginConnection(node.id, port.id, 'input') }} className="flex w-full items-center gap-1 text-left text-[9px] text-text-secondary hover:text-accent"><span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-accent bg-white" /><span className="truncate">{tp ? t(tp.labelKey, { defaultValue: tp.label }) : port.label}{port.required ? ' *' : ''}</span></button> })}</div>
                <div className="space-y-1">{node.outputs.map(port => { const tp = template.outputs.find(p => p.id === port.id); return <button key={port.id} type="button" onClick={event => { event.stopPropagation(); props.onBeginConnection(node.id, port.id, 'output') }} className="flex w-full items-center justify-end gap-1 text-right text-[9px] text-text-secondary hover:text-accent"><span className="truncate">{tp ? t(tp.labelKey, { defaultValue: tp.label }) : port.label}</span><span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-accent bg-white" /></button> })}</div>
              </div>
              <div className={`border-t border-black/10 px-2 py-1 text-[9px] ${freshness?.status === 'stale' ? 'text-error' : 'text-text-muted'}`}>{result ? (result.status === 'blocked' ? t('canvas.runBlocked') : `${t('canvas.charsCandidate', { count: result.output.length.toLocaleString() })}${freshnessLabel ? ` · ${freshnessLabel}` : ''}`) : `${t(template.categoryKey, { defaultValue: template.category })} · ${template.capability}`}</div>
            </div>
          )
        })}
      </div>
      {selectionBox && <div className="pointer-events-none absolute border border-accent bg-accent/10" style={{ left: selectionBox.x * zoom + props.graph.viewport.x, top: selectionBox.y * zoom + props.graph.viewport.y, width: selectionBox.width * zoom, height: selectionBox.height * zoom }} />}
      <div className="pointer-events-none absolute right-3 top-3 z-10 w-40 rounded border border-border bg-bg-surface/90 p-2 shadow-sm"><div className="mb-1 flex items-center gap-1 text-[9px] font-semibold text-text-muted"><Map className="h-3 w-3" />{t('canvas.minimap', { count: props.graph.nodes.length })}</div><div className="relative h-20 overflow-hidden rounded bg-bg-base"><div className="absolute inset-1" style={{ transform: `scale(${Math.min(1, 150 / Math.max(150, bounds.width))}, ${Math.min(1, 72 / Math.max(72, bounds.height))})`, transformOrigin: 'top left' }}>{props.graph.nodes.map(node => <span key={node.id} className={`absolute h-1.5 w-3 rounded-sm ${props.selectedNodeIds.has(node.id) ? 'bg-accent' : 'bg-text-muted/50'}`} style={{ left: node.x - bounds.minX, top: node.y - bounds.minY }} />)}</div></div></div>
      {!props.graph.nodes.length && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center"><div><Workflow className="mx-auto h-9 w-9 text-accent/50" /><p className="mt-2 text-sm font-medium text-text-secondary">{t('canvas.emptyTitle')}</p><p className="mt-1 text-xs text-text-muted">{t('canvas.emptySubtitle')}</p></div></div>}
    </div>
  )
}

function CharacterBindingSelector(props: {
  node: AuthoringNodeInstance
  projectId: number
  worldGroupId: number | null
  fieldKey: string
  onChange: (binding: AuthoringNodeInstance['binding'] | undefined) => void
}) {
  const { t } = useDomainT('node-authoring')
  const [entries, setEntries] = useState<RagLibraryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const selectedDocumentId = props.node.binding?.ref?.documentId ?? ''

  useEffect(() => {
    let active = true
    setLoading(true)
    void buildRagLibrary({ projectId: props.projectId, worldGroupId: props.worldGroupId })
      .then(next => {
        if (active) setEntries(next.filter(entry => entry.tableName === 'characters' && entry.fieldKey === props.fieldKey))
      })
      .catch(() => {
        if (active) setEntries([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [props.projectId, props.worldGroupId, props.fieldKey])

  const characters = useMemo(() => {
    const seen = new Set<string>()
    return entries.filter(entry => {
      if (seen.has(entry.documentId)) return false
      seen.add(entry.documentId)
      return true
    })
  }, [entries])

  return (
    <section className="mb-4 rounded border border-amber-300/70 bg-amber-50/60 p-2">
      <p className="text-[10px] font-semibold text-amber-900">{t('binding.targetCharacterLabel')}</p>
      <p className="mt-1 text-[9px] leading-4 text-amber-800/80">{t('binding.targetCharacterHint')}</p>
      <select
        aria-label={t('binding.bindTargetCharacter')}
        value={selectedDocumentId}
        onChange={event => {
          const documentId = event.target.value
          props.onChange(documentId
            ? { mode: 'snapshot', ref: { documentId, fieldKey: props.fieldKey, target: 'characters' }, capturedAt: Date.now() }
            : undefined)
        }}
        className="mt-2 w-full rounded border border-amber-300 bg-bg-base px-2 py-1.5 text-[11px] text-text-primary"
        disabled={loading}
      >
        <option value="">{loading ? t('binding.loadingCharacters') : characters.length ? t('binding.selectCharacter') : t('binding.noBindableCharacter')}</option>
        {characters.map(entry => <option key={entry.documentId} value={entry.documentId}>{entry.title}</option>)}
      </select>
    </section>
  )
}

function NodeInspector(props: { node: AuthoringNodeInstance | null; graph: AuthoringNodeGraph; projectId: number; worldGroupId: number | null; onChange: (graph: AuthoringNodeGraph) => void; onRemove: () => void; onRun: (nodeId: string) => void }) {
  const { t } = useDomainT('node-authoring')
  // 来源名走 outline 域的 labelKey 翻译；注册表中文 label 只作兜底。
  const { t: tOutline } = useDomainT('outline')
  const presets = useAIConfigStore(state => state.presets)
  if (!props.node) return <aside className="flex w-80 shrink-0 items-center justify-center border-l border-border bg-bg-surface p-6 text-center text-xs text-text-muted">{t('inspector.empty')}</aside>
  const node = props.node
  const template = AUTHORING_NODE_BY_ID.get(node.templateId)!
  const updateNode = (patch: Partial<AuthoringNodeInstance>) => props.onChange({ ...props.graph, nodes: props.graph.nodes.map(item => item.id === node.id ? { ...item, ...patch } : item) })
  const updateConfig = (key: string, value: unknown) => updateNode({ config: { ...node.config, [key]: value } })
  const sourceKeys = Array.isArray(node.config.sourceKeys) ? node.config.sourceKeys.filter((item): item is string => typeof item === 'string') : []
  const ragEntryKeys = Array.isArray(node.config.ragEntryKeys) ? node.config.ragEntryKeys.filter((item): item is string => typeof item === 'string') : []
  const selectionMode = node.config.selectionMode === 'exact' || (node.config.selectionMode == null && sourceKeys.includes('ragSelection')) ? 'exact' : 'registered'
  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-bg-surface p-4">
      <div className="mb-4 flex items-start justify-between gap-2"><div><p className="text-[10px] font-semibold tracking-wide text-accent">{t(template.categoryKey, { defaultValue: template.category })}</p><h3 className="mt-1 text-sm font-semibold text-text-primary">{t(template.labelKey, { defaultValue: template.label })}</h3></div><div className="flex items-center gap-1"><button type="button" title={t('inspector.favoriteNode')} aria-label={t('inspector.favoriteNode')} onClick={() => updateNode({ favorite: !node.favorite })} className={`rounded p-1 ${node.favorite ? 'text-amber-600' : 'text-text-muted'} hover:bg-amber-100`}><Star className="h-3.5 w-3.5" fill={node.favorite ? 'currentColor' : 'none'} /></button><button type="button" title={t('inspector.runToNode')} aria-label={t('inspector.runToNode')} onClick={() => props.onRun(node.id)} className="rounded p-1 text-accent hover:bg-accent/10"><Play className="h-3.5 w-3.5" /></button><button type="button" title={t('inspector.deleteNode')} onClick={props.onRemove} className="rounded p-1 text-text-muted hover:bg-error/10 hover:text-error"><Trash2 className="h-3.5 w-3.5" /></button></div></div>
      <label className="mb-4 block"><span className="mb-1 block text-[10px] text-text-secondary">{t('inspector.nodeName')}</span><input value={node.title} onChange={event => updateNode({ title: event.target.value })} className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent" /></label>
      <p className="mb-3 text-[10px] leading-4 text-text-muted">{t(template.descriptionKey, { defaultValue: template.description })}</p>
      {template.writes?.target === 'characters' && template.writes.fields?.length === 1 && <CharacterBindingSelector node={node} projectId={props.projectId} worldGroupId={props.worldGroupId} fieldKey={template.writes.fields[0]} onChange={binding => updateNode({ binding })} />}
      {template.id === 'source.project-context' && <section className="mb-4 rounded border border-border bg-bg-base p-2">
        <div className="mb-2 grid grid-cols-2 rounded border border-border bg-bg-surface p-0.5 text-[10px]">
          <button type="button" onClick={() => updateNode({ config: { ...node.config, selectionMode: 'exact', sourceKeys: ['ragSelection'] } })} className={`rounded px-2 py-1 ${selectionMode === 'exact' ? 'bg-accent text-white' : 'text-text-muted hover:bg-bg-hover'}`}>{t('inspector.exactSources')}</button>
          <button type="button" onClick={() => updateNode({ config: { ...node.config, selectionMode: 'registered', sourceKeys: sourceKeys.includes('ragSelection') ? ['worldview', 'storyCore'] : sourceKeys } })} className={`rounded px-2 py-1 ${selectionMode === 'registered' ? 'bg-accent text-white' : 'text-text-muted hover:bg-bg-hover'}`}>{t('inspector.registeredSources')}</button>
        </div>
        {selectionMode === 'exact' ? <RagEntrySelector projectId={props.projectId} worldGroupId={props.worldGroupId} selectedKeys={ragEntryKeys} onChange={keys => updateNode({ config: { ...node.config, selectionMode: 'exact', sourceKeys: ['ragSelection'], ragEntryKeys: keys } })} /> : <section>
          <p className="mb-2 text-[10px] font-medium text-text-secondary">{t('inspector.readRegisteredSources')}</p>
          <div className="max-h-48 space-y-1 overflow-y-auto">{CONTEXT_SOURCES.filter(source => source.key !== 'ragSelection').map(source => <label key={source.key} className="flex items-start gap-2 text-[10px] text-text-secondary"><input type="checkbox" checked={sourceKeys.includes(source.key)} onChange={() => updateConfig('sourceKeys', sourceKeys.includes(source.key) ? sourceKeys.filter(item => item !== source.key) : [...sourceKeys, source.key])} className="mt-0.5 accent-[var(--color-accent)]" /><span><span className="block">{tOutline(source.labelKey, { defaultValue: source.label })}</span><span className="block text-[9px] text-text-muted">{source.key}</span></span></label>)}</div>
        </section>}
      </section>}
      <div className="space-y-3">{(template.parameters ?? []).map(parameter => {
        const value = node.config[parameter.key] ?? parameter.defaultValue ?? ''
        if (parameter.key === 'presetId') return <label key={parameter.key} className="block"><span className="mb-1 block text-[10px] text-text-secondary">{t(parameter.labelKey, { defaultValue: parameter.label })}</span><select value={String(value)} onChange={event => updateConfig(parameter.key, event.target.value)} className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-[11px] text-text-primary"><option value="">{t('inspector.useGlobalConfig')}</option>{presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
        if (parameter.type === 'text') return <label key={parameter.key} className="block"><span className="mb-1 block text-[10px] text-text-secondary">{t(parameter.labelKey, { defaultValue: parameter.label })}</span><textarea rows={parameter.key === 'text' || parameter.key === 'instruction' || parameter.key === 'template' ? 6 : 3} value={String(value)} onChange={event => updateConfig(parameter.key, event.target.value)} className="w-full resize-y rounded border border-border bg-bg-base px-2 py-1.5 text-[11px] leading-4 text-text-primary outline-none focus:border-accent" /></label>
        if (parameter.type === 'boolean') return <label key={parameter.key} className="flex items-center gap-2 text-[11px] text-text-secondary"><input type="checkbox" checked={Boolean(value)} onChange={event => updateConfig(parameter.key, event.target.checked)} className="accent-[var(--color-accent)]" />{t(parameter.labelKey, { defaultValue: parameter.label })}</label>
        return <label key={parameter.key} className="block"><span className="mb-1 flex justify-between text-[10px] text-text-secondary"><span>{t(parameter.labelKey, { defaultValue: parameter.label })}</span><span className="text-text-muted">{String(value)}</span></span><input type="number" min={parameter.min} max={parameter.max} step={parameter.step} value={Number(value)} onChange={event => updateConfig(parameter.key, Number(event.target.value))} className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-[11px] text-text-primary outline-none focus:border-accent" /></label>
      })}</div>
      <div className="mt-5 border-t border-border pt-3"><p className="mb-2 text-[10px] font-semibold text-text-secondary">{t('inspector.inputPorts')}</p>{node.inputs.length ? node.inputs.map(port => { const tp = template.inputs.find(p => p.id === port.id); return <div key={port.id} className="flex items-center justify-between border-b border-border/60 py-1.5 text-[10px]"><span className="text-text-secondary">{tp ? t(tp.labelKey, { defaultValue: tp.label }) : port.label}{port.required ? ' *' : ''}</span><span className="text-text-muted">{port.semantic}</span></div> }) : <p className="text-[10px] text-text-muted">{t('inspector.noInputPorts')}</p>}<p className="mb-2 mt-3 text-[10px] font-semibold text-text-secondary">{t('inspector.outputPorts')}</p>{node.outputs.map(port => { const tp = template.outputs.find(p => p.id === port.id); return <div key={port.id} className="flex items-center justify-between border-b border-border/60 py-1.5 text-[10px]"><span className="text-text-secondary">{tp ? t(tp.labelKey, { defaultValue: tp.label }) : port.label}</span><span className="text-text-muted">{port.semantic}</span></div> })}</div>
    </aside>
  )
}

function SmartConnectionMenu(props: { anchor: { nodeId: string; portId: string; direction: 'input' | 'output'; x: number; y: number }; graph: AuthoringNodeGraph; onPick: (template: AuthoringNodeTemplate) => void; onClose: () => void }) {
  const { t } = useDomainT('node-authoring')
  const node = props.graph.nodes.find(item => item.id === props.anchor.nodeId)
  const template = node ? AUTHORING_NODE_BY_ID.get(node.templateId) : undefined
  const port = node ? [...node.inputs, ...node.outputs].find(item => item.id === props.anchor.portId) : undefined
  if (!node || !template || !port) return null
  const suggestions = suggestAuthoringConnections({ catalog: AUTHORING_NODE_CATALOG, anchorTemplate: template, anchorPort: port, direction: props.anchor.direction === 'output' ? 'after' : 'before' }).slice(0, 10)
  return <div className="absolute z-20 w-64 rounded-md border border-border bg-bg-surface p-2 shadow-xl" style={{ left: props.anchor.x, top: props.anchor.y }}><div className="mb-1 flex items-center justify-between"><p className="text-[10px] font-semibold text-text-secondary">{props.anchor.direction === 'output' ? t('connectionMenu.addAfter') : t('connectionMenu.addBefore')}</p><button type="button" onClick={props.onClose} className="text-text-muted hover:text-text-primary"><X className="h-3 w-3" /></button></div>{suggestions.length ? suggestions.map(item => { const i18nTemplate = AUTHORING_NODE_BY_ID.get(item.template.id); const i18nPort = i18nTemplate ? [...i18nTemplate.inputs, ...i18nTemplate.outputs].find(p => p.id === item.port.id) : undefined; return <button key={`${item.template.id}:${item.port.id}`} type="button" onClick={() => props.onPick(item.template)} className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-bg-hover"><ChevronRight className="mt-0.5 h-3 w-3 text-accent" /><span><span className="block text-[10px] text-text-primary">{i18nTemplate ? t(i18nTemplate.labelKey, { defaultValue: item.template.label }) : item.template.label}</span><span className="block text-[9px] text-text-muted">{item.reason === 'recommended' ? t('connectionMenu.recommended') : t('connectionMenu.semanticCompatible')} · {i18nPort ? t(i18nPort.labelKey, { defaultValue: item.port.label }) : item.port.label}</span></span></button> }) : <p className="p-2 text-[10px] text-text-muted">{t('connectionMenu.noCompatible')}</p>}</div>
}

export default function NodeAuthoringWorkspace(props: { project: Project; worldGroupId: number | null }) {
  const { t } = useDomainT('node-authoring')
  const [, setAgentNamespaceReady] = useState(false)
  const projectId = props.project.id!
  const dialog = useDialog()
  const toast = useToast()
  const flows = useNodeFlowStore(state => state.flows)
  const runs = useNodeFlowStore(state => state.runs)
  const loading = useNodeFlowStore(state => state.loading)
  const [selectedFlowId, setSelectedFlowId] = useState<number | null>(null)
  const [draft, setDraft] = useState<NodeFlow | null>(null)
  const [graph, setGraph] = useState<AuthoringNodeGraph>(emptyAuthoringGraph())
  const [savedGraph, setSavedGraph] = useState<AuthoringNodeGraph>(emptyAuthoringGraph())
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [run, setRun] = useState<NodeRunRecord | null>(null)
  const [snapshots, setSnapshots] = useState<AuthoringRunSnapshotMap>({})
  const [candidates, setCandidates] = useState<AuthoringCandidateMap>({})
  const [freshness, setFreshness] = useState<AuthoringFreshnessMap>({})
  const [connection, setConnection] = useState<{ nodeId: string; portId: string; direction: 'input' | 'output' } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [showRuns, setShowRuns] = useState(true)
  const [showTemplates, setShowTemplates] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [legacySourceVersion, setLegacySourceVersion] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let active = true
    void i18n.loadNamespaces('agent').then(() => {
      if (active) setAgentNamespaceReady(true)
    })
    return () => { active = false }
  }, [])

  useEffect(() => { void useNodeFlowStore.getState().load(projectId) }, [projectId])
  useEffect(() => { if (selectedFlowId == null && flows.length) setSelectedFlowId(flows[0].id!) }, [flows, selectedFlowId])
  useEffect(() => {
    if (selectedFlowId == null) { setDraft(null); setGraph(emptyAuthoringGraph()); setSavedGraph(emptyAuthoringGraph()); setLegacySourceVersion(null); return }
    const flow = flows.find(item => item.id === selectedFlowId)
    if (!flow) return
    try { const parsed = parseAuthoringGraph(flow.graphJson); setDraft(flow); setGraph(parsed.graph); setSavedGraph(structuredClone(parsed.graph)); setLegacySourceVersion(parsed.migrated ? parsed.sourceVersion : null); setSelectedNodeId(null); setSelectedNodeIds([]); setDirty(false); void useNodeFlowStore.getState().loadRuns(projectId, selectedFlowId) } catch (error) { setLegacySourceVersion(null); toast.error(t('toast.legacyConvertFailed', { message: error instanceof Error ? error.message : String(error) })) }
  // A store refresh must not replace an in-progress local graph edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFlowId, projectId])
  useEffect(() => { const latest = runs.find(item => item.flowId === selectedFlowId) ?? null; setRun(latest); const data = runData(latest); setSnapshots(data.snapshots); setCandidates(data.candidates) }, [runs, selectedFlowId])
  useEffect(() => {
    if (!draft || !run || !Object.keys(candidates).length) { setFreshness({}); return }
    let active = true
    void inspectAuthoringGraphFreshness({ flow: draft, snapshots, candidates }).then(next => { if (active) setFreshness(next) }).catch(() => { if (active) setFreshness({}) })
    return () => { active = false }
  }, [draft, run, snapshots, candidates])

  const selectedNode = selectedNodeId ? graph.nodes.find(node => node.id === selectedNodeId) ?? null : null
  const save = async (notify = false): Promise<NodeFlow | null> => {
    if (!draft) return null
    setSaving(true)
    try { const next = { ...draft, graphJson: JSON.stringify(graph), updatedAt: Date.now() }; const id = await useNodeFlowStore.getState().saveFlow(next); const saved = { ...next, id }; setDraft(saved); setSavedGraph(structuredClone(graph)); setLegacySourceVersion(null); setDirty(false); if (notify) toast.success(t('toast.saveSuccess')); return saved } catch (error) { toast.error(t('toast.saveFailed', { message: error instanceof Error ? error.message : String(error) })); return null } finally { setSaving(false) }
  }
  // Autosave intentionally captures the current draft and graph snapshot; including the
  // recreated save callback would schedule a second save on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!dirty || !draft) return; const timer = window.setTimeout(() => { void save() }, 700); return () => window.clearTimeout(timer) }, [dirty, graph, draft?.name, draft?.description])
  const changeGraph = (next: AuthoringNodeGraph) => { setGraph(next); setDirty(true) }
  const createFlow = async () => { const id = await useNodeFlowStore.getState().createFlow(projectId, props.worldGroupId); setSelectedFlowId(id) }
  const createOfficialTemplate = async (templateId: Parameters<typeof buildOfficialAuthoringTemplate>[0]) => {
    const template = AUTHORING_OFFICIAL_TEMPLATES.find(item => item.id === templateId)
    if (!template) return
    try {
      const id = await useNodeFlowStore.getState().createFlow(projectId, props.worldGroupId, {
        name: t(template.nameKey),
        description: t(template.descriptionKey),
        graph: buildOfficialAuthoringTemplate(templateId),
      })
      setSelectedFlowId(id)
      toast.success(t('toast.templateCreated', { name: t(template.nameKey) }))
    } catch (error) {
      toast.error(t('toast.templateCreateFailed', { message: error instanceof Error ? error.message : String(error) }))
    }
  }
  const createOverview = async () => {
    try {
      const overview = await buildAuthoringOverviewGraph({ projectId, worldGroupId: props.worldGroupId })
      const id = await useNodeFlowStore.getState().createFlow(projectId, props.worldGroupId, {
        name: t('common:defaults.authoringOverviewFlowName'),
        description: t('common:defaults.authoringOverviewFlowDescription', { count: overview.entryCount }),
        graph: overview.graph,
      })
      setSelectedFlowId(id)
      toast.success(t('toast.overviewGenerated', { count: overview.entryCount }))
    } catch (error) {
      toast.error(t('toast.overviewGenerateFailed', { message: error instanceof Error ? error.message : String(error) }))
    }
  }
  const createCreationChain = async () => {
    try {
      const { graph } = buildAuthoringCreationChainGraph()
      const id = await useNodeFlowStore.getState().createFlow(projectId, props.worldGroupId, {
        name: t('common:defaults.creationChainFlowName'),
        description: t('common:defaults.creationChainFlowDescription'),
        graph,
      })
      setSelectedFlowId(id)
      toast.success(t('toast.chainCreated'))
    } catch (error) {
      toast.error(t('toast.chainCreateFailed', { message: error instanceof Error ? error.message : String(error) }))
    }
  }
  const removeFlow = async () => {
    if (!draft?.id) return
    const confirmed = await dialog.confirm({
      title: t('toast.deleteConfirmTitle', { name: draft.name }),
      message: t('toast.deleteConfirmMessage'),
      confirmText: t('toast.deleteConfirmButton'),
      tone: 'danger',
    })
    if (!confirmed) return
    try {
      await useNodeFlowStore.getState().removeFlow(draft.id)
      setSelectedFlowId(null)
      setDraft(null)
      setGraph(emptyAuthoringGraph())
      setSavedGraph(emptyAuthoringGraph())
      setSelectedNodeId(null)
      setSelectedNodeIds([])
      setCandidates({})
      setSnapshots({})
      setRun(null)
      toast.success(t('toast.deleteSuccess'))
    } catch (error) {
      toast.error(t('toast.deleteFailed', { message: error instanceof Error ? error.message : String(error) }))
    }
  }
  const selectedNodeSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds])
  const selectNode = (id: string) => {
    setSelectedNodeId(id)
    setSelectedNodeIds([id])
    changeGraph({ ...graph, nodes: graph.nodes.map(node => node.id === id ? { ...node, lastOpenedAt: Date.now() } : node) })
  }
  const addTemplate = (template: AuthoringNodeTemplate, position?: { x: number; y: number }) => { const node = nodeFromTemplate(template, graph.nodes.length, t); if (position) { node.x = position.x; node.y = position.y } changeGraph({ ...graph, nodes: [...graph.nodes, node] }); setSelectedNodeId(node.id); setSelectedNodeIds([node.id]); return node }
  const removeNode = (id: string) => { changeGraph({ ...graph, nodes: graph.nodes.filter(node => node.id !== id), edges: graph.edges.filter(edge => edge.sourceNodeId !== id && edge.targetNodeId !== id) }); if (selectedNodeId === id) setSelectedNodeId(null); setSelectedNodeIds(current => current.filter(item => item !== id)) }
  const toggleFavorite = (id: string) => changeGraph({ ...graph, nodes: graph.nodes.map(node => node.id === id ? { ...node, favorite: !node.favorite } : node) })
  const applyOfficialTemplate = (templateId: Parameters<typeof buildOfficialAuthoringTemplate>[0]) => {
    const nextGraph = buildOfficialAuthoringTemplate(templateId)
    const template = AUTHORING_OFFICIAL_TEMPLATES.find(item => item.id === templateId)!
    changeGraph(nextGraph)
    setSelectedNodeId(nextGraph.nodes[0]?.id ?? null)
    setSelectedNodeIds(nextGraph.nodes[0] ? [nextGraph.nodes[0].id] : [])
    if (draft) setDraft({ ...draft, name: t(template.nameKey), description: t(template.descriptionKey) })
    setShowTemplates(false)
  }
  const beginConnection = (nodeId: string, portId: string, direction: 'input' | 'output') => { if (connection && connection.direction === 'output' && direction === 'input' && connection.nodeId !== nodeId) { const next = addEdge(graph, connection.nodeId, connection.portId, nodeId, portId); const issue = validateAuthoringGraph(next).find(item => item.code === 'cycle' || item.code === 'type-mismatch' || item.code === 'duplicate-edge'); if (issue) toast.error(issue.message); else changeGraph(next); setConnection(null); setMenu(null); return } setConnection({ nodeId, portId, direction }); setMenu(null) }
  const openConnectionMenu = (x: number, y: number) => { if (connection) setMenu({ x, y }) }
  const pickConnectionTemplate = (template: AuthoringNodeTemplate) => {
    if (!connection) return
    const anchorNode = graph.nodes.find(node => node.id === connection.nodeId)
    if (!anchorNode) return
    const node = nodeFromTemplate(template, graph.nodes.length, t)
    node.x = Math.max(30, anchorNode.x + (connection.direction === 'output' ? 330 : -330))
    node.y = anchorNode.y
    const anchorPort = [...anchorNode.inputs, ...anchorNode.outputs].find(port => port.id === connection.portId)
    const newPort = connection.direction === 'output'
      ? template.inputs.find(port => anchorPort && authoringPortsCompatible(anchorPort, port))
      : template.outputs.find(port => anchorPort && authoringPortsCompatible(port, anchorPort))
    const graphWithNode = { ...graph, nodes: [...graph.nodes, node] }
    changeGraph(anchorPort && newPort
      ? addEdge(
          graphWithNode,
          connection.direction === 'output' ? anchorNode.id : node.id,
          connection.direction === 'output' ? anchorPort.id : newPort.id,
          connection.direction === 'output' ? node.id : anchorNode.id,
          connection.direction === 'output' ? newPort.id : anchorPort.id,
        )
      : graphWithNode)
    setSelectedNodeId(node.id)
    setConnection(null)
    setMenu(null)
  }
  const staleNodeIds = useMemo(() => new Set(Object.values(freshness).filter(item => item.status === 'stale' || item.status === 'never-run' || item.status === 'blocked').map(item => item.nodeId)), [freshness])
  const graphDiff = useMemo(() => compareAuthoringGraphs(savedGraph, graph), [savedGraph, graph])
  const runGraph = async (targetNodeId?: string, mode: 'normal' | 'stale' | 'resume' = 'normal') => {
    if (!draft || abortRef.current) return
    const issues = validateAuthoringGraph(graph)
    if (issues.length) { toast.error(t('toast.validationIssue', { message: issues[0].message })); return }
    const saved = await save()
    if (!saved?.id) return
    const controller = new AbortController()
    abortRef.current = controller
    setIsRunning(true)
    try {
      const reusableTargetRun = mode === 'normal' && targetNodeId && run?.id != null
        ? topologicalAuthoringOrder(graph, targetNodeId).slice(0, -1).every(node => {
            const candidate = candidates[node.id]
            const state = freshness[node.id]?.status
            return Boolean(candidate)
              && candidate.status !== 'blocked'
              && candidate.status !== 'stale'
              && candidate.status !== 'draft'
              && state !== 'blocked'
              && state !== 'stale'
              && state !== 'never-run'
          })
        : false
      const result = await runAuthoringGraph({
        flow: saved,
        ...(targetNodeId ? { targetNodeId } : {}),
        ...(mode === 'resume' && run?.id ? { resumeRunId: run.id } : {}),
        ...(mode === 'stale' && run?.id ? { baseRunId: run.id, runNodeIds: staleNodeIds } : {}),
        ...(reusableTargetRun && run?.id != null && targetNodeId
          ? { baseRunId: run.id, runNodeIds: new Set([targetNodeId]) }
          : {}),
        signal: controller.signal,
        onUpdate: update => { setRun(update.run); setSnapshots(update.snapshots); setCandidates(update.candidates) },
      })
      setRun(result.run)
      setSnapshots(result.snapshots)
      setCandidates(result.candidates)
      await useNodeFlowStore.getState().loadRuns(projectId, saved.id)
      if (result.run.status === 'completed') toast.success(mode === 'stale' ? t('toast.staleRerunCompleted') : t('toast.runCompleted'))
      if (result.run.status === 'paused') toast.success(t('toast.runPaused'))
      if (result.run.status === 'failed' && Object.values(result.candidates).some(candidate => candidate.status === 'blocked')) {
        toast.error(t('toast.runFailed', { message: t('agent:artifact.status.blocked') }))
      }
    } catch (error) {
      toast.error(t('toast.runFailed', { message: error instanceof Error ? error.message : String(error) }))
    } finally {
      abortRef.current = null
      setIsRunning(false)
    }
  }
  const selectedPlan = parseAuthoringExecutionPlan(run?.executionPlanJson)
  const executionEstimate = useMemo(() => {
    try { return buildAuthoringExecutionPlan({ graph }) } catch { return null }
  }, [graph])
  const pauseRun = () => abortRef.current?.abort('paused')
  const cancelRun = () => abortRef.current?.abort('cancelled')
  const selectMany = (ids: string[]) => {
    setSelectedNodeIds(ids)
    setSelectedNodeId(ids[0] ?? null)
  }
  const copySelection = () => {
    const copied = copyAuthoringSubgraph(graph, selectedNodeSet)
    if (!copied.copiedNodeIds.length) { toast.error(t('toast.copySelectFirst')); return }
    changeGraph(copied.graph)
    selectMany(copied.copiedNodeIds)
    toast.success(t('toast.copySuccess', { count: copied.copiedNodeIds.length }))
  }
  const groupSelection = () => {
    if (!selectedNodeSet.size) { toast.error(t('toast.groupSelectFirst')); return }
    changeGraph(groupAuthoringNodes(graph, selectedNodeSet))
  }
  const alignSelection = (axis: 'x' | 'y') => {
    if (selectedNodeSet.size < 2) { toast.error(t('toast.alignNeedTwo')); return }
    changeGraph(alignAuthoringNodes(graph, selectedNodeSet, axis))
  }
  const adoptCandidate = async (nodeId: string) => {
    const candidate = candidates[nodeId]
    if (!draft || !candidate) return
    if (candidate.status === 'blocked' && !candidate.authorEditedAfterArtifact) {
      toast.error(t('toast.runFailed', { message: t('agent:artifact.status.blocked') }))
      return
    }
    try {
      const result = await adoptAuthoringCandidate({ flow: draft, nodeId, output: candidate.output })
      if (run?.id != null) {
        const persistedRun = await persistAdoptedAuthoringCandidate({
          flow: draft,
          runId: run.id,
          nodeId,
          output: candidate.output,
        })
        setRun(persistedRun)
      }
      setCandidates(current => ({
        ...current,
        [nodeId]: { ...current[nodeId], status: 'adopted' },
      }))
      toast.success(t('toast.adoptSuccess', { count: result.written.length }))
    } catch (error) {
      toast.error(t('toast.adoptFailed', { message: error instanceof Error ? error.message : String(error) }))
    }
  }

  if (loading && !flows.length) return <div className="flex min-h-[720px] items-center justify-center text-sm text-text-muted"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('workspace.loadingGraphs')}</div>
  if (!draft) return <div className="flex min-h-[720px] items-center justify-center overflow-y-auto bg-[#f7f7f5] p-6"><div className="w-full max-w-4xl rounded-lg border border-border bg-bg-surface p-8 text-center shadow-sm"><Workflow className="mx-auto h-10 w-10 text-accent" /><h2 className="mt-3 text-lg font-semibold text-text-primary">{t('workspace.heroTitle')}</h2><p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{t('workspace.heroDescription')}</p><div className="mt-5 grid gap-2 sm:grid-cols-3"><button type="button" onClick={() => void createCreationChain()} className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"><GitBranch className="h-4 w-4" />{t('workspace.createChainButton')}</button><button type="button" onClick={() => void createOverview()} className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover"><LayoutTemplate className="h-4 w-4" />{t('workspace.generateOverviewButton')}</button><button type="button" onClick={() => void createFlow()} className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover"><Plus className="h-4 w-4" />{t('workspace.createBlankButton')}</button></div><div className="mt-7 border-t border-border pt-5 text-left"><div className="mb-3 flex items-center gap-2"><LayoutTemplate className="h-4 w-4 text-accent" /><h3 className="text-xs font-semibold text-text-primary">{t('workspace.officialTemplatesTitle')}</h3><span className="text-[10px] text-text-muted">{t('workspace.officialTemplatesHint')}</span></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{AUTHORING_OFFICIAL_TEMPLATES.map(template => <button key={template.id} type="button" onClick={() => void createOfficialTemplate(template.id)} className="rounded-md border border-border p-3 text-left transition-colors hover:border-accent/50 hover:bg-bg-hover"><span className="block text-[11px] font-semibold text-text-primary">{t(template.nameKey)}</span><span className="mt-1 block text-[10px] leading-4 text-text-muted">{t(template.descriptionKey)}</span></button>)}</div></div><p className="mt-4 text-[11px] leading-5 text-text-muted">{t('workspace.heroFooter')}</p></div></div>

  const selectedSnapshot = selectedNodeId ? snapshots[selectedNodeId] : undefined
  const selectedCandidate = selectedNodeId ? candidates[selectedNodeId] : undefined
  const selectedVariantIndex = selectedCandidate
    ? selectedCandidate.selectedVariantIndex
      ?? Math.max(0, selectedCandidate.variants?.findIndex(item => item === selectedCandidate.output) ?? 0)
    : 0
  const selectedArtifact = selectedCandidate?.creativeArtifacts?.[selectedVariantIndex]
  return <div className="flex h-[760px] min-h-[560px] max-h-[calc(100vh-180px)] flex-col overflow-hidden bg-bg-base">
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-bg-surface px-3"><Workflow className="h-4 w-4 text-accent" /><input aria-label={t('workspace.graphNameAria')} value={draft.name} onChange={event => { setDraft({ ...draft, name: event.target.value }); setDirty(true) }} className="w-56 rounded border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-text-primary hover:border-border focus:border-accent focus:outline-none" /><span className="text-[10px] text-text-muted">{saving ? t('workspace.savingStatus') : dirty ? t('workspace.dirtyStatus') : t('workspace.savedStatus')}</span><div className="ml-auto flex items-center gap-2"><button type="button" onClick={() => void save(true)} className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs text-text-secondary hover:bg-bg-hover"><Save className="h-3.5 w-3.5" />{t('workspace.saveButton')}</button>{isRunning ? <><button type="button" onClick={pauseRun} title={t('workspace.pauseRun')} aria-label={t('workspace.pauseRun')} className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-1.5 text-xs text-amber-800"><Pause className="h-3.5 w-3.5" />{t('workspace.pauseRun')}</button><button type="button" onClick={cancelRun} title={t('workspace.cancelRun')} aria-label={t('workspace.cancelRun')} className="inline-flex items-center gap-1 rounded bg-error/10 px-2 py-1.5 text-xs text-error"><CircleStop className="h-3.5 w-3.5" />{t('workspace.cancelRun')}</button></> : run?.status === 'paused' || run?.status === 'failed' ? <button type="button" onClick={() => void runGraph(undefined, 'resume')} className="inline-flex items-center gap-1 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"><RotateCcw className="h-3.5 w-3.5" />{t('workspace.resumeRun')}</button> : <button type="button" onClick={() => void runGraph()} className="inline-flex items-center gap-1 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"><Play className="h-3.5 w-3.5" />{t('workspace.runAll')}</button>}</div></header>
    {legacySourceVersion != null && <div className="flex shrink-0 items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-900"><span className="min-w-0 flex-1">{t('workspace.legacyBanner', { version: legacySourceVersion })}</span><button type="button" onClick={() => void save(true)} className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-300 bg-white px-2 py-1 font-medium text-amber-900 hover:bg-amber-100"><Save className="h-3 w-3" />{t('workspace.convertAndSave')}</button></div>}
    <section className="flex flex-wrap items-center gap-1 border-b border-border bg-bg-surface px-3 py-1.5 text-[10px] text-text-muted"><button type="button" title={t('workspace.templateToggle')} aria-label={t('workspace.templateToggle')} onClick={() => setShowTemplates(value => !value)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-text-secondary hover:bg-bg-hover"><LayoutTemplate className="h-3 w-3" />{t('workspace.templateToggle')}</button><button type="button" title={t('workspace.autoLayout')} aria-label={t('workspace.autoLayout')} onClick={() => changeGraph(autoLayoutAuthoringGraph(graph))} className="inline-flex items-center gap-1 rounded px-2 py-1 text-text-secondary hover:bg-bg-hover"><LayoutDashboard className="h-3 w-3" />{t('workspace.autoLayout')}</button><button type="button" title={t('workspace.copySelection')} aria-label={t('workspace.copySelection')} onClick={copySelection} className="inline-flex items-center gap-1 rounded px-2 py-1 text-text-secondary hover:bg-bg-hover"><Copy className="h-3 w-3" />{t('workspace.copySelection')}</button><button type="button" title={t('workspace.alignHorizontal')} aria-label={t('workspace.alignHorizontal')} onClick={() => alignSelection('y')} className="rounded p-1 text-text-secondary hover:bg-bg-hover"><AlignCenterHorizontal className="h-3 w-3" /></button><button type="button" title={t('workspace.alignVertical')} aria-label={t('workspace.alignVertical')} onClick={() => alignSelection('x')} className="rounded p-1 text-text-secondary hover:bg-bg-hover"><AlignCenterVertical className="h-3 w-3" /></button><button type="button" title={t('workspace.groupSelection')} aria-label={t('workspace.groupSelection')} onClick={groupSelection} className="inline-flex items-center gap-1 rounded px-2 py-1 text-text-secondary hover:bg-bg-hover"><Users className="h-3 w-3" />{t('workspace.groupSelection')}</button><span className="ml-auto">{t('workspace.statsBar', { selected: selectedNodeIds.length, nodes: graph.nodes.length, edges: graph.edges.length, changes: graphDiff.nodesChanged + graphDiff.nodesAdded + graphDiff.nodesRemoved + graphDiff.edgesAdded + graphDiff.edgesRemoved })}</span>{showTemplates && <div className="absolute z-30 mt-32 grid w-80 gap-1 rounded border border-border bg-bg-surface p-2 shadow-xl sm:grid-cols-2">{AUTHORING_OFFICIAL_TEMPLATES.map(template => <button key={template.id} type="button" onClick={() => applyOfficialTemplate(template.id)} className="rounded p-2 text-left hover:bg-bg-hover"><span className="block text-[10px] font-semibold text-text-primary">{t(template.nameKey)}</span><span className="mt-0.5 block text-[9px] text-text-muted">{t(template.descriptionKey)}</span></button>)}</div>}</section>
    <div className="flex min-h-0 flex-1"><div className="flex w-60 shrink-0 flex-col border-r border-border bg-bg-surface"><div className="border-b border-border p-3"><div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-semibold tracking-wide text-text-muted">{t('workspace.myGraphs')}</span><div className="flex items-center gap-1"><button type="button" title={t('workspace.deleteCurrentGraph')} aria-label={t('workspace.deleteCurrentGraph')} onClick={() => void removeFlow()} className="rounded p-1 text-text-muted hover:bg-error/10 hover:text-error"><Trash2 className="h-3.5 w-3.5" /></button><button type="button" title={t('workspace.generateOverviewFromProject')} aria-label={t('workspace.generateOverviewFromProject')} onClick={() => void createOverview()} className="rounded p-1 text-text-muted hover:bg-bg-hover"><LayoutTemplate className="h-3.5 w-3.5" /></button><button type="button" title={t('workspace.newGraph')} aria-label={t('workspace.newGraph')} onClick={() => void createFlow()} className="rounded p-1 text-accent hover:bg-accent/10"><Plus className="h-3.5 w-3.5" /></button></div></div>{flows.map(flow => <button key={flow.id} type="button" onClick={() => setSelectedFlowId(flow.id!)} className={`mb-1 w-full truncate rounded px-2 py-1.5 text-left text-[11px] ${flow.id === selectedFlowId ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-bg-hover'}`}>{flow.name}</button>)}</div><NodeLibrary graph={graph} onAdd={template => addTemplate(template)} onSelectNode={selectNode} /></div><div className="relative flex min-w-0 flex-1"><AuthoringCanvas graph={graph} selectedNodeId={selectedNodeId} selectedNodeIds={selectedNodeSet} candidates={candidates} freshness={freshness} onSelectNode={selectNode} onSelectionChange={selectMany} onToggleFavorite={toggleFavorite} onChange={changeGraph} onBeginConnection={beginConnection} onCanvasConnection={openConnectionMenu} onRemoveNode={removeNode} />{connection && menu && <SmartConnectionMenu anchor={{ ...connection, x: menu.x, y: menu.y }} graph={graph} onPick={pickConnectionTemplate} onClose={() => { setConnection(null); setMenu(null) }} />}</div><NodeInspector node={selectedNode} graph={graph} projectId={projectId} worldGroupId={props.worldGroupId} onChange={changeGraph} onRemove={() => selectedNode && removeNode(selectedNode.id)} onRun={nodeId => void runGraph(nodeId)} /></div>
    <section className="shrink-0 border-t border-border bg-bg-surface">
      <button type="button" onClick={() => setShowRuns(value => !value)} className="flex h-9 w-full items-center gap-2 px-4 text-left text-[11px] text-text-secondary hover:bg-bg-hover">
        <History className="h-3.5 w-3.5" />
        <span>{t('workspace.runsToggle')}</span>
        <span className="text-text-muted">{run ? `${projectCanonicalLabel(t, NODE_RUN_STATUS_LABEL_KEYS, run.status)} · ${new Date(run.startedAt).toLocaleString()}` : t('workspace.notYetRun')}</span>
        <span className="ml-auto">{showRuns ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</span>
      </button>
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2 text-[10px] text-text-muted"><span>{t('workspace.planEstimate', { calls: selectedPlan?.estimatedAiCalls ?? executionEstimate?.estimatedAiCalls ?? '—', tokens: (selectedPlan?.estimatedMaxOutputTokens ?? executionEstimate?.estimatedMaxOutputTokens ?? 0).toLocaleString() })}</span>{run && staleNodeIds.size > 0 && !isRunning && <button type="button" onClick={() => void runGraph(undefined, 'stale')} className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-amber-800 hover:bg-amber-200"><RotateCcw className="h-3 w-3" />{t('workspace.rerunStale', { count: staleNodeIds.size })}</button>}<span className="ml-auto">{t('workspace.diffSummary', { addedNodes: graphDiff.nodesAdded, removedNodes: graphDiff.nodesRemoved, addedEdges: graphDiff.edgesAdded, removedEdges: graphDiff.edgesRemoved })}</span></div>
      {showRuns && (
        <div className="grid max-h-72 grid-cols-2 gap-0 overflow-y-auto border-t border-border">
          <div className="border-r border-border p-3">
            <div className="mb-2 flex items-center gap-1 text-[10px] font-semibold text-text-secondary"><Database className="h-3 w-3" />{t('workspace.actualInputSnapshot')}</div>
            {selectedSnapshot ? <><p className="text-[10px] text-text-muted">{t('workspace.estimatedInputTokens', { count: selectedSnapshot.totalTokens.toLocaleString() })}</p>{selectedSnapshot.inputs.map(input => <details key={`${input.sourceNodeId}:${input.targetPortId}`} className="mt-2 rounded border border-border bg-bg-base p-2"><summary className="cursor-pointer text-[10px]">{input.targetPortId} ← {input.sourceNodeId} · {input.tokens} tokens</summary><pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-[9px] text-text-muted">{input.content}</pre></details>)}</> : <p className="text-[10px] text-text-muted">{t('workspace.snapshotEmpty')}</p>}
          </div>
          <div className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-text-secondary">{t('workspace.candidateOutput')}</span>
              <div className="flex items-center gap-2">
                {selectedCandidate?.variants && selectedCandidate.variants.length > 1 && (
                  <label className="flex items-center gap-1 text-[10px] text-text-muted">
                    <span>{t('workspace.variantSelectorLabel')}</span>
                    <select
                      aria-label={t('workspace.chooseVariantAria')}
                      value={selectedVariantIndex}
                      onChange={event => {
                        const index = Number(event.target.value)
                        const output = selectedCandidate.variants?.[index]
                        if (!output) return
                        const artifact = selectedCandidate.creativeArtifacts?.[index]
                        const blocked = artifact?.status === 'manual-repair' || artifact?.status === 'blocked'
                        setCandidates(current => ({
                          ...current,
                          [selectedCandidate.nodeId]: {
                            ...selectedCandidate,
                            output,
                            status: blocked ? 'blocked' : 'candidate',
                            selectedVariantIndex: index,
                            authorEditedAfterArtifact: false,
                          },
                        }))
                      }}
                      className="rounded border border-border bg-bg-base px-1 py-0.5 text-[10px] text-text-secondary"
                    >
                      {selectedCandidate.variants.map((_, index) => <option key={index} value={index}>{t('workspace.variantOption', { index: index + 1 })}</option>)}
                    </select>
                  </label>
                )}
                {selectedCandidate && !selectedNode?.binding?.ref && <button type="button" onClick={() => void adoptCandidate(selectedNodeId!)} disabled={selectedCandidate.status === 'blocked' && !selectedCandidate.authorEditedAfterArtifact} className="inline-flex items-center gap-1 rounded bg-accent px-2 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"><Check className="h-3 w-3" />{selectedCandidate.status === 'adopted' ? t('workspace.adopted') : t('workspace.confirmAdopt')}</button>}
              </div>
            </div>
            {selectedCandidate ? <>
              <textarea aria-label={t('workspace.candidateOutputAria')} value={selectedCandidate.output} onChange={event => setCandidates(current => ({ ...current, [selectedCandidate.nodeId]: { ...selectedCandidate, output: event.target.value, status: 'draft', authorEditedAfterArtifact: true } }))} className="h-40 w-full resize-y rounded border border-border bg-bg-base p-2 text-[10px] leading-4 text-text-primary outline-none focus:border-accent" />
              {selectedArtifact && <>
                <CreativeArtifactSummary artifact={selectedArtifact} />
                {selectedCandidate.authorEditedAfterArtifact && <p className="mt-1 text-[9px] text-warning">{t('agent:candidate.outputNote')}</p>}
              </>}
              {selectedCandidate.variants && selectedCandidate.variants.length > 1 && (
                <details className="mt-2 rounded border border-border bg-bg-base">
                  <summary className="cursor-pointer px-2 py-1.5 text-[10px] font-medium text-text-secondary">{t('workspace.expandVariants', { count: selectedCandidate.variants.length })}</summary>
                  <div className="border-t border-border px-2 py-1.5 text-[9px] text-text-muted">
                    {compareCandidateVariants(selectedCandidate.output, selectedCandidate.variants).filter(diff => selectedCandidate.variants?.[diff.variantIndex] !== selectedCandidate.output).map(diff => <span key={diff.variantIndex} className="mr-3">{t('workspace.variantDiff', { index: diff.variantIndex + 1, changedLines: diff.changedLines, addedLines: diff.addedLines, removedLines: diff.removedLines })}</span>)}
                  </div>
                  <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto border-t border-border p-2">
                    {selectedCandidate.variants.map((variant, index) => (
                      <article key={`${selectedCandidate.nodeId}:variant:${index}`} className="min-w-0 rounded border border-border/70 bg-bg-surface p-2">
                        <p className="mb-1 text-[9px] font-semibold text-accent">{t('workspace.variantTitle', { index: index + 1 })}</p>
                        <pre className="max-h-36 overflow-auto whitespace-pre-wrap text-[9px] leading-4 text-text-secondary">{variant}</pre>
                      </article>
                    ))}
                  </div>
                </details>
              )}
            </> : <p className="text-[10px] text-text-muted">{t('workspace.candidateEmpty')}</p>}
          </div>
        </div>
      )}
    </section>
  </div>
}
