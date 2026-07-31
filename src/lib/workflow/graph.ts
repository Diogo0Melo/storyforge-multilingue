import type {
  PromptWorkflow,
  PromptWorkflowGraph,
  PromptWorkflowGraphEdge,
  PromptWorkflowStep,
} from '../types/workflow'
import { WORKFLOW_ERRORS, type WorkflowErrorCode, type WorkflowValidationError } from './error-codes'

export type { WorkflowValidationError } from './error-codes'

export const WORKFLOW_GRAPH_VERSION = 1 as const
export const WORKFLOW_NODE_WIDTH = 240
export const WORKFLOW_NODE_HEIGHT = 164
export const WORKFLOW_CANVAS_PADDING = 48

export interface WorkflowGraphIssue extends WorkflowValidationError {
  code: WorkflowErrorCode
}

/**
 * Error thrown when workflow compilation fails.
 * Contains structured issues that can be translated by callers.
 */
export class WorkflowCompilationError extends Error {
  constructor(public readonly issues: WorkflowGraphIssue[]) {
    super('Workflow compilation failed')
    this.name = 'WorkflowCompilationError'
  }
}

export interface CompiledWorkflowGraph {
  graph: PromptWorkflowGraph
  orderedSteps: PromptWorkflowStep[]
  incomingByStep: Map<string, PromptWorkflowGraphEdge[]>
}

export interface WorkflowUpstreamInput {
  sourceStepId: string
  sourceLabel: string
  targetVariable: string
  output: string
}

function defaultNodePosition(index: number): { x: number; y: number } {
  const column = index % 4
  const row = Math.floor(index / 4)
  return {
    x: WORKFLOW_CANVAS_PADDING + column * (WORKFLOW_NODE_WIDTH + 88),
    y: WORKFLOW_CANVAS_PADDING + row * (WORKFLOW_NODE_HEIGHT + 92),
  }
}

function legacyTargetVariable(step: PromptWorkflowStep): string {
  return step.inputMapping?.previousOutput?.trim() || 'worldContext'
}

/**
 * 旧 PromptWorkflow 的兼容视图。相邻步骤显式连线，保持旧 Runner 无论是否声明
 * inputMapping 都会把上一步输出放进 worldContext 的行为。
 */
export function createLegacyWorkflowGraph(steps: PromptWorkflowStep[]): PromptWorkflowGraph {
  return {
    version: WORKFLOW_GRAPH_VERSION,
    nodes: steps.map((step, index) => ({
      stepId: step.stepId,
      ...defaultNodePosition(index),
    })),
    edges: steps.slice(1).map((step, index) => ({
      edgeId: `legacy-${steps[index].stepId}-${step.stepId}`,
      sourceStepId: steps[index].stepId,
      targetStepId: step.stepId,
      targetVariable: legacyTargetVariable(step),
    })),
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

export function workflowGraphFor(workflow: PromptWorkflow): PromptWorkflowGraph {
  return workflow.graph
    ? {
        version: workflow.graph.version,
        nodes: workflow.graph.nodes.map(node => ({ ...node })),
        edges: workflow.graph.edges.map(edge => ({ ...edge })),
        viewport: workflow.graph.viewport ? { ...workflow.graph.viewport } : undefined,
      }
    : createLegacyWorkflowGraph(workflow.steps)
}

export function validateWorkflowGraph(workflow: PromptWorkflow): WorkflowGraphIssue[] {
  const graph = workflowGraphFor(workflow)
  const issues: WorkflowGraphIssue[] = []
  const stepIds = new Set<string>()

  for (const step of workflow.steps) {
    if (!step.stepId.trim()) {
      issues.push({ code: WORKFLOW_ERRORS.EMPTY_STEP_ID })
      continue
    }
    if (stepIds.has(step.stepId)) {
      issues.push({
        code: WORKFLOW_ERRORS.DUPLICATE_STEP_ID,
        params: { stepId: step.stepId },
      })
    }
    stepIds.add(step.stepId)
  }

  if (graph.version !== WORKFLOW_GRAPH_VERSION) {
    issues.push({
      code: WORKFLOW_ERRORS.UNSUPPORTED_VERSION,
      params: { version: String(graph.version) },
    })
  }

  const graphNodeIds = new Set<string>()
  for (const node of graph.nodes) {
    if (!stepIds.has(node.stepId)) {
      issues.push({
        code: WORKFLOW_ERRORS.UNKNOWN_NODE,
        params: { stepId: node.stepId },
      })
    }
    if (graphNodeIds.has(node.stepId)) {
      issues.push({
        code: WORKFLOW_ERRORS.DUPLICATE_NODE,
        params: { stepId: node.stepId },
      })
    }
    graphNodeIds.add(node.stepId)
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      issues.push({
        code: WORKFLOW_ERRORS.INVALID_POSITION,
        params: { stepId: node.stepId },
      })
    }
  }
  for (const stepId of stepIds) {
    if (!graphNodeIds.has(stepId)) {
      issues.push({
        code: WORKFLOW_ERRORS.MISSING_NODE,
        params: { stepId },
      })
    }
  }

  const edgeIds = new Set<string>()
  const edgeKeys = new Set<string>()
  const adjacency = new Map<string, string[]>()
  for (const stepId of stepIds) adjacency.set(stepId, [])

  for (const edge of graph.edges) {
    if (!edge.edgeId.trim()) {
      issues.push({ code: WORKFLOW_ERRORS.EMPTY_EDGE_ID })
    } else if (edgeIds.has(edge.edgeId)) {
      issues.push({
        code: WORKFLOW_ERRORS.DUPLICATE_EDGE_ID,
        params: { edgeId: edge.edgeId },
      })
    }
    edgeIds.add(edge.edgeId)

    const hasSource = stepIds.has(edge.sourceStepId)
    const hasTarget = stepIds.has(edge.targetStepId)
    if (!hasSource) {
      issues.push({
        code: WORKFLOW_ERRORS.UNKNOWN_EDGE_SOURCE,
        params: { sourceStepId: edge.sourceStepId },
      })
    }
    if (!hasTarget) {
      issues.push({
        code: WORKFLOW_ERRORS.UNKNOWN_EDGE_TARGET,
        params: { targetStepId: edge.targetStepId },
      })
    }
    if (edge.sourceStepId === edge.targetStepId) {
      issues.push({
        code: WORKFLOW_ERRORS.SELF_EDGE,
        params: { stepId: edge.sourceStepId },
      })
    }

    const targetVariable = edge.targetVariable.trim()
    if (!targetVariable) {
      issues.push({
        code: WORKFLOW_ERRORS.EMPTY_TARGET_VARIABLE,
        params: { edgeId: edge.edgeId },
      })
    } else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(targetVariable)) {
      issues.push({
        code: WORKFLOW_ERRORS.INVALID_TARGET_VARIABLE,
        params: { variable: edge.targetVariable },
      })
    }

    const edgeKey = `${edge.sourceStepId}\u0000${edge.targetStepId}\u0000${targetVariable}`
    if (edgeKeys.has(edgeKey)) {
      issues.push({
        code: WORKFLOW_ERRORS.DUPLICATE_EDGE,
        params: { sourceStepId: edge.sourceStepId, targetStepId: edge.targetStepId, variable: targetVariable },
      })
    }
    edgeKeys.add(edgeKey)

    if (hasSource && hasTarget && edge.sourceStepId !== edge.targetStepId) {
      adjacency.get(edge.sourceStepId)!.push(edge.targetStepId)
    }
  }

  const visitState = new Map<string, 0 | 1 | 2>()
  let cycleFound = false
  const visit = (stepId: string) => {
    if (cycleFound) return
    const state = visitState.get(stepId) ?? 0
    if (state === 1) {
      cycleFound = true
      return
    }
    if (state === 2) return
    visitState.set(stepId, 1)
    for (const target of adjacency.get(stepId) ?? []) visit(target)
    visitState.set(stepId, 2)
  }
  for (const stepId of stepIds) visit(stepId)
  if (cycleFound) {
    issues.push({ code: WORKFLOW_ERRORS.CYCLE_DETECTED })
  }

  return issues
}

function insertByAuthorOrder(queue: string[], stepId: string, order: Map<string, number>) {
  const targetOrder = order.get(stepId) ?? Number.MAX_SAFE_INTEGER
  const index = queue.findIndex(current => (order.get(current) ?? Number.MAX_SAFE_INTEGER) > targetOrder)
  if (index < 0) queue.push(stepId)
  else queue.splice(index, 0, stepId)
}

export function compileWorkflowGraph(workflow: PromptWorkflow): CompiledWorkflowGraph {
  const graph = workflowGraphFor(workflow)
  const issues = validateWorkflowGraph({ ...workflow, graph })
  if (issues.length) {
    throw new WorkflowCompilationError(issues)
  }

  const authorOrder = new Map(workflow.steps.map((step, index) => [step.stepId, index]))
  const stepById = new Map(workflow.steps.map(step => [step.stepId, step]))
  const indegree = new Map(workflow.steps.map(step => [step.stepId, 0]))
  const outgoing = new Map(workflow.steps.map(step => [step.stepId, [] as string[]]))
  const incomingByStep = new Map(workflow.steps.map(step => [step.stepId, [] as PromptWorkflowGraphEdge[]]))

  graph.edges.forEach(edge => {
    outgoing.get(edge.sourceStepId)!.push(edge.targetStepId)
    indegree.set(edge.targetStepId, (indegree.get(edge.targetStepId) ?? 0) + 1)
    incomingByStep.get(edge.targetStepId)!.push(edge)
  })
  for (const edges of incomingByStep.values()) {
    edges.sort((a, b) => {
      const bySource = (authorOrder.get(a.sourceStepId) ?? 0) - (authorOrder.get(b.sourceStepId) ?? 0)
      return bySource || a.edgeId.localeCompare(b.edgeId)
    })
  }

  const queue: string[] = []
  workflow.steps.forEach(step => {
    if ((indegree.get(step.stepId) ?? 0) === 0) insertByAuthorOrder(queue, step.stepId, authorOrder)
  })
  const orderedIds: string[] = []
  while (queue.length) {
    const stepId = queue.shift()!
    orderedIds.push(stepId)
    for (const target of outgoing.get(stepId) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1
      indegree.set(target, next)
      if (next === 0) insertByAuthorOrder(queue, target, authorOrder)
    }
  }
  if (orderedIds.length !== workflow.steps.length) {
    throw new WorkflowCompilationError([{ code: WORKFLOW_ERRORS.TOPOLOGICAL_SORT_FAILED }])
  }

  return {
    graph,
    orderedSteps: orderedIds.map(stepId => stepById.get(stepId)!),
    incomingByStep,
  }
}

export function collectWorkflowUpstreamInputs(
  compiled: CompiledWorkflowGraph,
  targetStepId: string,
  outputs: Map<string, string>,
): WorkflowUpstreamInput[] {
  const labelById = new Map(compiled.orderedSteps.map(step => [step.stepId, step.label]))
  return (compiled.incomingByStep.get(targetStepId) ?? [])
    .map(edge => ({
      sourceStepId: edge.sourceStepId,
      sourceLabel: labelById.get(edge.sourceStepId) ?? edge.sourceStepId,
      targetVariable: edge.targetVariable,
      output: outputs.get(edge.sourceStepId) ?? '',
    }))
    .filter(input => input.output.trim())
}

export function groupWorkflowInputsByVariable(
  inputs: WorkflowUpstreamInput[],
): Record<string, string> {
  const grouped = new Map<string, string[]>()
  for (const input of inputs) {
    const rows = grouped.get(input.targetVariable) ?? []
    rows.push(`【来自节点：${input.sourceLabel}】\n${input.output}`)
    grouped.set(input.targetVariable, rows)
  }
  return Object.fromEntries([...grouped].map(([key, values]) => [key, values.join('\n\n')]))
}

export function formatWorkflowUpstreamContext(inputs: WorkflowUpstreamInput[]): string {
  return inputs
    .map(input => `【来自节点：${input.sourceLabel} → ${input.targetVariable}】\n${input.output}`)
    .join('\n\n')
}
