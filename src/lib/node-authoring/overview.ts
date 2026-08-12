import i18n, { getT } from '../../i18n'
import { AUTHORING_NODE_CATALOG, AUTHORING_NODE_BY_ID } from './catalog'
import { authoringPortsCompatible } from './compatibility'
import { emptyAuthoringGraph, type AuthoringNodeGraph, type AuthoringNodeInstance } from './contracts'
import { hashAuthoringText } from './bindings'
import { buildRagLibrary, getFieldLabelKey, RAG_STATIC_TITLE_KEYS } from '../retrieval/rag-library'

const TABLE_SEMANTICS: Record<string, AuthoringNodeInstance['outputs'][number]['semantic']> = {
  importantLocations: 'world.location',
  chapters: 'chapter.prose',
  foreshadows: 'continuity.foreshadow',
  itemLedger: 'continuity.item',
  histories: 'world.history',
  characterRelations: 'character.relation',
  storyArcs: 'story.arc',
}

function templateForEntry(tableName: string, fieldKey: string) {
  return AUTHORING_NODE_CATALOG.find(template => (
    template.writes?.target === tableName && template.writes.fields?.length === 1 && template.writes.fields[0] === fieldKey
  ))
}

/**
 * I18N-F5 · 概览节点标题在构建期组装并持久化进 graphJson，须在组装处解析
 * （A4 translate-at-creation）。模板 label 走 node-authoring ns `nodes.templates.*`；
 * 字段 label 与静态条目标题走 retrieval ns（F4 登记的 `fieldLabels.*` / `titles.*`）。
 * 键未登记（如 codex 自定义字段）时回退存储的 zh 文本；entry.title 中的用户内容
 * （角色名、关系对名等）不经此处翻译，只有静态标题段参与解析。
 */
function translateLabel(ns: 'node-authoring' | 'retrieval', key: string | undefined, fallback: string): string {
  if (!key) return fallback
  const translated = (getT() as any)(`${ns}:${key}`, { defaultValue: fallback })
  return typeof translated === 'string' && translated ? translated : fallback
}

/** 静态条目标题键（对齐 RAG_STATIC_TITLE_KEYS）；动态条目（用户内容标题）返回 undefined。 */
function staticTitleKey(sourceKey: string, worldGroupId: number | null): string | undefined {
  if (sourceKey === 'storyCore') return RAG_STATIC_TITLE_KEYS['storyCore.fixed']
  if (sourceKey === 'worldview') {
    return worldGroupId == null ? RAG_STATIC_TITLE_KEYS['worldview.primary'] : RAG_STATIC_TITLE_KEYS['worldview.current']
  }
  if (sourceKey === 'historical') {
    return worldGroupId == null ? RAG_STATIC_TITLE_KEYS['historical.primary'] : RAG_STATIC_TITLE_KEYS['historical.current']
  }
  return undefined
}

function nodeForEntry(
  entry: Awaited<ReturnType<typeof buildRagLibrary>>[number],
  index: number,
  worldGroupId: number | null,
): AuthoringNodeInstance {
  const entryTemplate = templateForEntry(entry.tableName, entry.fieldKey)
  const template = entryTemplate ?? AUTHORING_NODE_BY_ID.get('source.project-context')!
  const semantic = entryTemplate?.outputs[0]?.semantic
    ?? TABLE_SEMANTICS[entry.tableName]
    ?? 'any'
  const labelPart = entryTemplate
    ? translateLabel('node-authoring', entryTemplate.labelKey, entryTemplate.label)
    : translateLabel('retrieval', getFieldLabelKey(entry.sourceKey, entry.fieldKey), entry.fieldLabel)
  const titlePart = translateLabel('retrieval', staticTitleKey(entry.sourceKey, worldGroupId), entry.title)
  return {
    id: `overview-${hashAuthoringText(entry.key)}`,
    templateId: template.id,
    templateVersion: template.version,
    title: `${labelPart} · ${titlePart}`,
    x: 80 + (index % 4) * 360,
    y: 80 + Math.floor(index / 4) * 210,
    config: {
      sourceKeys: ['ragSelection'],
      ragEntryKeys: [entry.key],
      contextBudget: Math.min(entry.tokenCap, 12_000),
    },
    inputs: template.id === 'source.project-context'
      ? []
      : structuredClone(template.inputs),
    outputs: template.outputs.map(port => ({ ...port, semantic, state: 'canon' as const })),
    binding: {
      mode: 'live',
      ref: { documentId: entry.documentId, fieldKey: entry.fieldKey, target: entry.tableName },
      sourceHash: hashAuthoringText(`${entry.key}:${entry.content}`),
      capturedAt: Date.now(),
    },
    collapsed: true,
  }
}

function connectRecommended(graph: AuthoringNodeGraph): AuthoringNodeGraph {
  const nodesByTemplate = new Map<string, AuthoringNodeInstance[]>()
  graph.nodes.forEach(node => {
    const values = nodesByTemplate.get(node.templateId) ?? []
    values.push(node)
    nodesByTemplate.set(node.templateId, values)
  })
  const edges = []
  const edgeKeys = new Set<string>()
  for (const source of graph.nodes) {
    const template = AUTHORING_NODE_BY_ID.get(source.templateId)
    const output = source.outputs[0]
    if (!template || !output) continue
    for (const targetTemplateId of template.recommendedAfter ?? []) {
      const target = nodesByTemplate.get(targetTemplateId)?.find(item => item.id !== source.id)
      const input = target?.inputs.find(port => authoringPortsCompatible(output, port))
      if (!target || !input) continue
      const key = `${source.id}:${output.id}:${target.id}:${input.id}`
      if (edgeKeys.has(key)) continue
      edgeKeys.add(key)
      edges.push({
        id: `overview-edge-${hashAuthoringText(key)}`,
        sourceNodeId: source.id,
        sourcePortId: output.id,
        targetNodeId: target.id,
        targetPortId: input.id,
        mapping: { mode: 'full' as const, missingPolicy: 'block' as const, refreshPolicy: 'live' as const },
      })
    }
  }
  return { ...graph, edges }
}

export interface AuthoringOverviewResult {
  graph: AuthoringNodeGraph
  entryCount: number
  omittedCount: number
}

/** Build a read-only, live-bound overview without copying Canon into graph JSON. */
export async function buildAuthoringOverviewGraph(input: {
  projectId: number
  worldGroupId: number | null
}): Promise<AuthoringOverviewResult> {
  // I18N-F5 · getT() 同步求值，ns 未加载时只能回退 zh；组装标题前确保两个命名空间
  // 已加载（同 canon-snapshot.ts loadNamespaces 先例），保证非 zh 语言创建即本地化。
  await i18n.loadNamespaces(['node-authoring', 'retrieval'])
  const entries = await buildRagLibrary(input)
  const nodes = entries.map((entry, index) => nodeForEntry(entry, index, input.worldGroupId))
  const graph = connectRecommended({ ...emptyAuthoringGraph(), nodes })
  return { graph, entryCount: entries.length, omittedCount: 0 }
}
