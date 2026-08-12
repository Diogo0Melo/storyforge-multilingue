import { getT } from '../../i18n'
import type {
  NodeFlowEdge,
  NodeFlowGraph,
  NodeFlowNode,
  NodeValueType,
} from '../types'

export interface NodeFlowIssue {
  code: string
  message: string
  nodeId?: string
  edgeId?: string
}

export interface NodeKindDefinition {
  kind: NodeFlowNode['kind']
  label: string
  description: string
  outputType: NodeValueType
  acceptsInput: boolean
}

export const NODE_KIND_DEFINITIONS: readonly NodeKindDefinition[] = [
  {
    kind: 'input.text',
    label: getT()('node-flow:graph.kinds.inputText.label'),
    description: getT()('node-flow:graph.kinds.inputText.description'),
    outputType: 'text',
    acceptsInput: false,
  },
  {
    kind: 'source.context',
    label: getT()('node-flow:graph.kinds.sourceContext.label'),
    description: getT()('node-flow:graph.kinds.sourceContext.description'),
    outputType: 'context',
    acceptsInput: false,
  },
  {
    kind: 'transform.compose',
    label: getT()('node-flow:graph.kinds.transformCompose.label'),
    description: getT()('node-flow:graph.kinds.transformCompose.description'),
    outputType: 'text',
    acceptsInput: true,
  },
  {
    kind: 'generation.freeform',
    label: getT()('node-flow:graph.kinds.generationFreeform.label'),
    description: getT()('node-flow:graph.kinds.generationFreeform.description'),
    outputType: 'candidate',
    acceptsInput: true,
  },
  {
    kind: 'validation.required',
    label: getT()('node-flow:graph.kinds.validationRequired.label'),
    description: getT()('node-flow:graph.kinds.validationRequired.description'),
    outputType: 'candidate',
    acceptsInput: true,
  },
  {
    kind: 'output.preview',
    label: getT()('node-flow:graph.kinds.outputPreview.label'),
    description: getT()('node-flow:graph.kinds.outputPreview.description'),
    outputType: 'candidate',
    acceptsInput: true,
  },
] as const

export const NODE_KIND_BY_ID = new Map(
  NODE_KIND_DEFINITIONS.map(definition => [definition.kind, definition] as const),
)

function canConnect(source: NodeValueType, target: NodeValueType): boolean {
  return source === 'any' || target === 'any' || source === target
    || (source === 'context' && target === 'text')
    || (source === 'candidate' && target === 'text')
    || (source === 'text' && target === 'candidate')
    || (source === 'context' && target === 'candidate')
}

export function validateNodeFlowGraph(graph: NodeFlowGraph): NodeFlowIssue[] {
  const issues: NodeFlowIssue[] = []
  if (graph.version !== 1) issues.push({ code: 'version', message: getT()('node-flow:graph.versionUnsupported') })
  const nodes = new Map<string, NodeFlowNode>()
  for (const node of graph.nodes) {
    if (!node.id.trim()) {
      issues.push({ code: 'empty-node-id', message: getT()('node-flow:graph.emptyNodeId') })
      continue
    }
    if (nodes.has(node.id)) {
      issues.push({ code: 'duplicate-node', nodeId: node.id, message: getT()('node-flow:graph.duplicateNodeId', { id: node.id }) })
    }
    if (!NODE_KIND_BY_ID.has(node.kind)) {
      issues.push({ code: 'unknown-kind', nodeId: node.id, message: getT()('node-flow:graph.unknownKind', { kind: node.kind }) })
    }
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      issues.push({ code: 'position', nodeId: node.id, message: getT()('node-flow:graph.invalidPosition', { title: node.title }) })
    }
    const slotIds = new Set<string>()
    for (const slot of node.inputSlots) {
      if (!slot.id.trim() || slotIds.has(slot.id)) {
        issues.push({ code: 'slot', nodeId: node.id, message: getT()('node-flow:graph.invalidOrDuplicateSlot', { title: node.title }) })
      }
      slotIds.add(slot.id)
    }
    nodes.set(node.id, node)
  }

  const edgeIds = new Set<string>()
  const edgeKeys = new Set<string>()
  const adjacency = new Map(graph.nodes.map(node => [node.id, [] as string[]]))
  for (const edge of graph.edges) {
    if (!edge.id.trim() || edgeIds.has(edge.id)) {
      issues.push({ code: 'edge-id', edgeId: edge.id, message: getT()('node-flow:graph.edgeIdEmptyOrDuplicate') })
    }
    edgeIds.add(edge.id)
    const source = nodes.get(edge.sourceNodeId)
    const target = nodes.get(edge.targetNodeId)
    if (!source || !target) {
      issues.push({ code: 'dangling-edge', edgeId: edge.id, message: getT()('node-flow:graph.danglingEdge') })
      continue
    }
    if (source.id === target.id) {
      issues.push({ code: 'self-edge', edgeId: edge.id, message: getT()('node-flow:graph.selfEdge') })
      continue
    }
    const slot = target.inputSlots.find(item => item.id === edge.targetSlotId)
    if (!slot) {
      issues.push({
        code: 'unknown-slot',
        edgeId: edge.id,
        message: getT()('node-flow:graph.unknownTargetSlot', { nodeTitle: target.title, slotId: edge.targetSlotId }),
      })
      continue
    }
    const outputType = NODE_KIND_BY_ID.get(source.kind)?.outputType ?? 'any'
    if (!canConnect(outputType, slot.type)) {
      issues.push({
        code: 'type-mismatch',
        edgeId: edge.id,
        message: getT()('node-flow:graph.typeMismatch', { sourceTitle: source.title, sourceType: outputType, targetTitle: target.title, slotLabel: slot.label, slotType: slot.type }),
      })
    }
    const key = `${source.id}\u0000${target.id}\u0000${slot.id}`
    if (edgeKeys.has(key)) {
      issues.push({ code: 'duplicate-edge', edgeId: edge.id, message: getT()('node-flow:graph.duplicateEdge') })
    }
    edgeKeys.add(key)
    adjacency.get(source.id)?.push(target.id)
  }

  const state = new Map<string, 0 | 1 | 2>()
  let cycle = false
  const visit = (nodeId: string) => {
    if (cycle) return
    const current = state.get(nodeId) ?? 0
    if (current === 1) {
      cycle = true
      return
    }
    if (current === 2) return
    state.set(nodeId, 1)
    for (const target of adjacency.get(nodeId) ?? []) visit(target)
    state.set(nodeId, 2)
  }
  graph.nodes.forEach(node => visit(node.id))
  if (cycle) issues.push({ code: 'cycle', message: getT()('node-flow:graph.cycleDetected') })

  for (const node of graph.nodes) {
    for (const slot of node.inputSlots.filter(item => item.required)) {
      if (!graph.edges.some(edge => edge.targetNodeId === node.id && edge.targetSlotId === slot.id)) {
        issues.push({
          code: 'required-slot',
          nodeId: node.id,
          message: getT()('node-flow:graph.requiredSlotMissing', { title: node.title, slotLabel: slot.label }),
        })
      }
    }
  }
  return issues
}

export function topologicalNodeOrder(
  graph: NodeFlowGraph,
  targetNodeId?: string | null,
): NodeFlowNode[] {
  const issues = validateNodeFlowGraph(graph)
  if (issues.length) throw new Error(issues.map(issue => issue.message).join('；'))

  let included = new Set(graph.nodes.map(node => node.id))
  if (targetNodeId) {
    if (!included.has(targetNodeId)) throw new Error(getT()('node-flow:graph.targetNodeMissing'))
    const incoming = new Map<string, string[]>()
    graph.edges.forEach(edge => {
      const values = incoming.get(edge.targetNodeId) ?? []
      values.push(edge.sourceNodeId)
      incoming.set(edge.targetNodeId, values)
    })
    included = new Set<string>()
    const collect = (nodeId: string) => {
      if (included.has(nodeId)) return
      included.add(nodeId)
      for (const source of incoming.get(nodeId) ?? []) collect(source)
    }
    collect(targetNodeId)
  }

  const indegree = new Map<string, number>()
  const outgoing = new Map<string, string[]>()
  graph.nodes.filter(node => included.has(node.id)).forEach(node => {
    indegree.set(node.id, 0)
    outgoing.set(node.id, [])
  })
  graph.edges.filter(edge => included.has(edge.sourceNodeId) && included.has(edge.targetNodeId)).forEach(edge => {
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1)
    outgoing.get(edge.sourceNodeId)?.push(edge.targetNodeId)
  })
  const queue = graph.nodes.filter(node => included.has(node.id) && indegree.get(node.id) === 0)
  const ordered: NodeFlowNode[] = []
  while (queue.length) {
    const node = queue.shift()!
    ordered.push(node)
    for (const target of outgoing.get(node.id) ?? []) {
      const value = (indegree.get(target) ?? 0) - 1
      indegree.set(target, value)
      if (value === 0) queue.push(graph.nodes.find(node => node.id === target)!)
    }
  }
  return ordered
}

export function removeNodeFromGraph(graph: NodeFlowGraph, nodeId: string): NodeFlowGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter(node => node.id !== nodeId),
    edges: graph.edges.filter(edge => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId),
  }
}

export function removeSlotFromGraph(
  graph: NodeFlowGraph,
  nodeId: string,
  slotId: string,
): NodeFlowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map(node => node.id === nodeId
      ? { ...node, inputSlots: node.inputSlots.filter(slot => slot.id !== slotId) }
      : node),
    edges: graph.edges.filter(edge => !(edge.targetNodeId === nodeId && edge.targetSlotId === slotId)),
  }
}

export function addNodeEdge(graph: NodeFlowGraph, edge: NodeFlowEdge): NodeFlowGraph {
  return { ...graph, edges: [...graph.edges, edge] }
}
