import JSON5 from 'json5'
import { getT } from '../../i18n'
import { useAIConfigStore } from '../../stores/ai-config'
import { chat, resolveRequestConfig } from '../ai/client'
import {
  parseChapterOutlineOutput,
  parseVolumeOutlineOutput,
} from '../ai/parse-outline-output'
import { db } from '../db/schema'
import type {
  GenerationGateIssue,
  GenerationNode,
  PreparedGenerationNode,
} from '../generation/generation-node'
import { prepareGenerationNode } from '../generation/generation-node'
import {
  adoptGeneratedOutlineItems,
  type AdoptGeneratedOutlineItemsResult,
  type GeneratedOutlineItem,
} from '../outline/adopt-generation'
import { buildOutlineGenerationPlan } from '../outline/generation-plan'
import type { OutlineGenerationRequest } from '../outline/generation-request'
import { assembleContext } from '../registry/assemble-context'
import type {
  AIConfig,
  OutlineNode,
  Project,
} from '../types'
import {
  evidenceFromContextResult,
  resolveAgentContextPolicy,
  type AgentContextEvidence,
  type AgentContextProfile,
} from './context-policy'

export const OUTLINE_COPILOT_SOURCE_KEYS = [
  'canonAssertions',
  'worldview',
  'storyCore',
  'characterDrivenPlan',
  'powerSystem',
  'cultivationProgress',
  'codex',
  'characters',
  'creativeRules',
  'worldRules',
  'historical',
  'locations',
  'foreshadows',
  'storyArcs',
  'storylineProgress',
  'existingVolumeOutlines',
  'writtenChapterProgress',
] as const

export type OutlineCopilotMode = 'volumes' | 'chapters'

export interface OutlineCopilotSnapshot {
  serialized: string
  existingTitles: string[]
  startingOrder: number
}

export interface OutlineCopilotInput {
  project: Project
  worldGroupId: number | null
  authorRequest: string
  supplementalContext: string
  mode: OutlineCopilotMode
  parentVolumeId: number | null
  nodes: OutlineNode[]
  volumes: OutlineNode[]
  assembled: Awaited<ReturnType<typeof assembleContext>>
  snapshot: OutlineCopilotSnapshot
  config: AIConfig
  parameterValues?: Record<string, unknown>
  generationOverrides?: { temperature?: number; maxTokens?: number }
  routingCategory?: string
  signal?: AbortSignal
}

export interface PreparedOutlineCopilot {
  node: GenerationNode<
    OutlineCopilotInput,
    GeneratedOutlineItem[],
    AdoptGeneratedOutlineItemsResult
  >
  prepared: PreparedGenerationNode
  contextSources: string[]
  snapshot: OutlineCopilotSnapshot
  mode: OutlineCopilotMode
  parentVolumeId: number | null
  label: string
  contextEvidence: AgentContextEvidence
}

interface OutlineCopilotDependencies {
  runAI?: (messages: ReturnType<typeof buildOutlineMessages>) => Promise<string>
  readCurrent?: () => Promise<OutlineCopilotSnapshot>
  saveItems?: (items: GeneratedOutlineItem[]) => Promise<AdoptGeneratedOutlineItemsResult>
}

const MAX_CANDIDATE_CHARS = 120_000
const MAX_ITEMS = 100
const MAX_TITLE_CHARS = 160
const MAX_SUMMARY_CHARS = 8_000

export class OutlineCopilotStaleError extends Error {
  constructor() {
    super(getT()('agent:copilot.outline.staleError'))
    this.name = 'OutlineCopilotStaleError'
  }
}

function normalizeTitle(title: string): string {
  return title.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')
}

function rowsInWorld(
  rows: OutlineNode[],
  worldGroupId: number | null,
): OutlineNode[] {
  const roots = rows.filter(row => (
    row.type === 'volume'
    && row.parentId === null
    && (row.worldGroupId ?? null) === worldGroupId
  ))
  const ids = new Set(roots.flatMap(row => row.id == null ? [] : [row.id]))
  let changed = true
  while (changed) {
    changed = false
    for (const row of rows) {
      if (row.id == null || row.parentId == null || !ids.has(row.parentId) || ids.has(row.id)) continue
      ids.add(row.id)
      changed = true
    }
  }
  return rows.filter(row => row.id != null && ids.has(row.id))
}

function snapshotOf(
  rows: OutlineNode[],
  worldGroupId: number | null,
  mode: OutlineCopilotMode,
  parentVolumeId: number | null,
): OutlineCopilotSnapshot {
  const scoped = rowsInWorld(rows, worldGroupId)
  const parentId = mode === 'volumes' ? null : parentVolumeId
  const type = mode === 'volumes' ? 'volume' : 'chapter'
  const siblings = scoped
    .filter(row => row.parentId === parentId && row.type === type)
    .sort((left, right) => left.order - right.order)
  return {
    serialized: JSON.stringify(scoped
      .map(row => ({
        id: row.id,
        parentId: row.parentId,
        type: row.type,
        title: row.title,
        summary: row.summary,
        order: row.order,
        worldGroupId: row.worldGroupId ?? null,
        updatedAt: row.updatedAt,
      }))
      .sort((left, right) => (left.id ?? 0) - (right.id ?? 0))),
    existingTitles: siblings.map(row => normalizeTitle(row.title)),
    startingOrder: siblings.reduce((max, row) => Math.max(max, row.order + 1), 0),
  }
}

async function readSnapshot(
  projectId: number,
  worldGroupId: number | null,
  mode: OutlineCopilotMode,
  parentVolumeId: number | null,
): Promise<OutlineCopilotSnapshot> {
  const rows = await db.outlineNodes.where('projectId').equals(projectId).toArray()
  return snapshotOf(rows, worldGroupId, mode, parentVolumeId)
}

function assertAuthorRequest(value: string): string {
  const request = value.trim()
  if (request.length < 2) throw new Error(getT()('agent:copilot.outline.requestTooShort'))
  if (request.length > 2000) throw new Error(getT()('agent:copilot.outline.requestTooLong'))
  return request
}

function determineMode(request: string, volumes: OutlineNode[]): OutlineCopilotMode {
  if (!volumes.length) return 'volumes'
  if (/卷纲|卷级|分卷|全书大纲|新增.{0,6}卷|规划.{0,6}卷/.test(request)) return 'volumes'
  return 'chapters'
}

function chooseTargetVolume(request: string, volumes: OutlineNode[]): OutlineNode | null {
  const explicitlyNamed = volumes.find(volume => (
    volume.title.trim().length > 0 && request.includes(volume.title.trim())
  ))
  return explicitlyNamed ?? volumes[volumes.length - 1] ?? null
}

function parseStrictArray(draft: string): unknown[] {
  const input = draft.trim()
  if (!input) throw new Error(getT()('agent:copilot.outline.candidateEmpty'))
  if (input.length > MAX_CANDIDATE_CHARS) {
    throw new Error(getT()('agent:copilot.outline.candidateTooLong', { max: MAX_CANDIDATE_CHARS }))
  }
  const fenced = /^```(?:json)?\s*([\s\S]*?)```\s*$/i.exec(input)
  const candidate = fenced?.[1]?.trim() ?? input
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    try {
      parsed = JSON5.parse(candidate)
    } catch {
      throw new Error(getT()('agent:copilot.outline.candidateInvalidJson'))
    }
  }
  if (!Array.isArray(parsed)) throw new Error(getT()('agent:copilot.outline.candidateMustBeArray'))
  return parsed
}

export function parseOutlineCandidateDraft(draft: string): GeneratedOutlineItem[] {
  const rows = parseStrictArray(draft)
  if (!rows.length) throw new Error(getT()('agent:copilot.outline.candidateMinItems'))
  if (rows.length > MAX_ITEMS) throw new Error(getT()('agent:copilot.outline.candidateMaxItems', { max: MAX_ITEMS }))
  const result = rows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(getT()('agent:copilot.outline.itemMustBeObject', { index: index + 1 }))
    }
    const source = row as Record<string, unknown>
    const unknown = Object.keys(source).filter(key => key !== 'title' && key !== 'summary')
    if (unknown.length) {
      throw new Error(getT()('agent:copilot.outline.itemUnknownFields', { index: index + 1, fields: unknown.join('、') }))
    }
    if (typeof source.title !== 'string' || !source.title.trim()) {
      throw new Error(getT()('agent:copilot.outline.itemMissingTitle', { index: index + 1 }))
    }
    if (typeof source.summary !== 'string' || !source.summary.trim()) {
      throw new Error(getT()('agent:copilot.outline.itemMissingSummary', { index: index + 1 }))
    }
    const title = source.title.trim()
    const summary = source.summary.trim()
    if (title.length > MAX_TITLE_CHARS) throw new Error(getT()('agent:copilot.outline.titleTooLong', { title: title.slice(0, 20) }))
    if (summary.length > MAX_SUMMARY_CHARS) throw new Error(getT()('agent:copilot.outline.summaryTooLong', { title }))
    return { title, summary }
  })
  const titles = result.map(item => normalizeTitle(item.title))
  if (new Set(titles).size !== titles.length) throw new Error(getT()('agent:copilot.outline.duplicateTitles'))
  return result
}

function candidateIssues(
  output: GeneratedOutlineItem[],
  snapshot: OutlineCopilotSnapshot,
): GenerationGateIssue[] {
  const issues: GenerationGateIssue[] = []
  let parsed: GeneratedOutlineItem[] | null = null
  try {
    parsed = parseOutlineCandidateDraft(JSON.stringify(output))
  } catch (error) {
    issues.push({
      code: 'outline-invalid-structure',
      message: error instanceof Error ? error.message : getT()('agent:copilot.outline.invalidStructure'),
    })
  }
  const existing = new Set(snapshot.existingTitles)
  const duplicate = parsed?.find(item => existing.has(normalizeTitle(item.title)))
  if (duplicate) {
    issues.push({
      code: 'outline-duplicate-title',
      message: getT()('agent:copilot.outline.duplicateTitleInScope', { title: duplicate.title }),
    })
  }
  return issues
}

function generationRequest(input: OutlineCopilotInput): OutlineGenerationRequest {
  if (input.mode === 'volumes') return { kind: 'volumes' }
  if (input.parentVolumeId == null) throw new Error(getT()('agent:copilot.outline.missingTargetVolume'))
  return { kind: 'chapters', volumeId: input.parentVolumeId }
}

function buildOutlineMessages(input: OutlineCopilotInput) {
  const supplemental = input.supplementalContext.trim()
    ? `\n\n【本轮上游候选（尚未采纳，不属于 Canon）】\n${input.supplementalContext.trim()}`
    : ''
  const plan = buildOutlineGenerationPlan({
    request: generationRequest(input),
    project: input.project,
    nodes: input.nodes,
    volumes: input.volumes,
    assembled: input.assembled,
    hint: `${input.authorRequest}${supplemental}`,
    options: { parameterValues: input.parameterValues },
  })
  if (plan.status === 'skip') throw new Error(plan.reason)
  return plan.messages
}

async function adoptCandidate(input: {
  projectId: number
  worldGroupId: number | null
  mode: OutlineCopilotMode
  parentVolumeId: number | null
  snapshot: OutlineCopilotSnapshot
  items: GeneratedOutlineItem[]
}): Promise<AdoptGeneratedOutlineItemsResult> {
  return db.transaction('rw', db.outlineNodes, async () => {
    const current = await readSnapshot(
      input.projectId,
      input.worldGroupId,
      input.mode,
      input.parentVolumeId,
    )
    if (current.serialized !== input.snapshot.serialized) throw new OutlineCopilotStaleError()
    const issues = candidateIssues(input.items, current)
    if (issues.length) throw new Error(issues.map(issue => issue.message).join('；'))
    const result = await adoptGeneratedOutlineItems({
      projectId: input.projectId,
      worldGroupId: input.worldGroupId,
      parentId: input.mode === 'volumes' ? null : input.parentVolumeId,
      type: input.mode === 'volumes' ? 'volume' : 'chapter',
      items: input.items,
      startingOrder: current.startingOrder,
    })
    if (result.writtenCount !== input.items.length || result.skippedReasons.length) {
      throw new Error(getT()('agent:copilot.outline.writePartialRollback', { written: result.writtenCount, total: input.items.length }))
    }
    return result
  })
}

export async function adoptRestoredOutlineCandidate(input: {
  projectId: number
  worldGroupId: number | null
  mode: OutlineCopilotMode
  parentVolumeId: number | null
  snapshot: OutlineCopilotSnapshot
  draft: string
}): Promise<AdoptGeneratedOutlineItemsResult> {
  return adoptCandidate({
    ...input,
    items: parseOutlineCandidateDraft(input.draft),
  })
}

export async function prepareOutlineCopilot(input: {
  projectId: number
  worldGroupId: number | null
  authorRequest: string
  supplementalContext?: string
  routingCategory?: string
  contextProfile?: AgentContextProfile
  parameterValues?: Record<string, unknown>
  /** 节点级 AI preset 的解析结果；未提供时沿用全局路由配置。 */
  configOverride?: AIConfig
  generationOverrides?: { temperature?: number; maxTokens?: number }
  signal?: AbortSignal
}): Promise<PreparedOutlineCopilot> {
  const project = await db.projects.get(input.projectId)
  if (!project) throw new Error(getT()('agent:copilot.outline.projectNotFound'))
  if (project.enableMultiWorld && input.worldGroupId == null) {
    throw new Error(getT()('agent:copilot.outline.multiWorldRequired'))
  }
  const worldGroupId = project.enableMultiWorld ? input.worldGroupId : null
  const request = assertAuthorRequest(input.authorRequest)
  const allNodes = await db.outlineNodes.where('projectId').equals(input.projectId).toArray()
  const nodes = rowsInWorld(allNodes, worldGroupId)
  const volumes = nodes
    .filter(node => node.type === 'volume' && node.parentId === null)
    .sort((left, right) => left.order - right.order)
  const mode = determineMode(request, volumes)
  const targetVolume = mode === 'chapters' ? chooseTargetVolume(request, volumes) : null
  if (mode === 'chapters' && !targetVolume?.id) throw new Error(getT()('agent:copilot.outline.noExpandableVolume'))

  const parentVolumeId = targetVolume?.id ?? null
  const before = snapshotOf(allNodes, worldGroupId, mode, parentVolumeId)
  const defaultCategory = mode === 'volumes' ? 'outline.volume' : 'outline.chapter'
  const routingCategory = input.routingCategory ?? defaultCategory
  const config = input.configOverride ?? resolveRequestConfig(
    useAIConfigStore.getState().config,
    { category: routingCategory },
  ).config
  const contextProfile = input.contextProfile ?? 'full'
  const contextPolicy = resolveAgentContextPolicy('agent-outline', contextProfile)
  const assembled = await assembleContext({
    projectId: input.projectId,
    worldGroupId,
    outlineNodeId: parentVolumeId,
    provider: config.provider,
    model: config.model,
    sourceKeys: [...OUTLINE_COPILOT_SOURCE_KEYS],
    inputBudgetMaxTokens: contextPolicy.maxInputTokens,
    sourceBudgetScale: contextPolicy.sourceBudgetScale,
  })
  const currentNodes = await db.outlineNodes.where('projectId').equals(input.projectId).toArray()
  const snapshot = snapshotOf(currentNodes, worldGroupId, mode, parentVolumeId)
  if (before.serialized !== snapshot.serialized) throw new OutlineCopilotStaleError()

  const nodeInput: OutlineCopilotInput = {
    project,
    worldGroupId,
    authorRequest: request,
    supplementalContext: input.supplementalContext ?? '',
    mode,
    parentVolumeId,
    nodes: rowsInWorld(currentNodes, worldGroupId),
    volumes,
    assembled,
    snapshot,
    config,
    parameterValues: input.parameterValues,
    generationOverrides: input.generationOverrides,
    routingCategory,
    signal: input.signal,
  }
  const node = createOutlineCopilotNode(nodeInput)
  return {
    node,
    prepared: prepareGenerationNode(node, nodeInput),
    contextSources: assembled.included,
    snapshot,
    mode,
    parentVolumeId,
    contextEvidence: evidenceFromContextResult(contextProfile, assembled),
    label: mode === 'volumes'
      ? getT()('agent:copilot.outline.labelVolumeOutline')
      : getT()('agent:copilot.outline.labelChapterOutline', { title: targetVolume!.title }),
  }
}

export function createOutlineCopilotNode(
  input: OutlineCopilotInput,
  dependencies: OutlineCopilotDependencies = {},
): PreparedOutlineCopilot['node'] {
  const readCurrent = dependencies.readCurrent ?? (() => readSnapshot(
    input.project.id!,
    input.worldGroupId,
    input.mode,
    input.parentVolumeId,
  ))
  const saveItems = dependencies.saveItems ?? (items => adoptCandidate({
    projectId: input.project.id!,
    worldGroupId: input.worldGroupId,
    mode: input.mode,
    parentVolumeId: input.parentVolumeId,
    snapshot: input.snapshot,
    items,
  }))
  const runAI = dependencies.runAI ?? (messages => chat(messages, input.config, {
    category: input.routingCategory ?? (input.mode === 'volumes' ? 'outline.volume' : 'outline.chapter'),
    projectId: input.project.id!,
    configOverrides: {
      maxTokens: input.generationOverrides?.maxTokens ?? (input.mode === 'volumes' ? 8000 : 12_000),
      ...(input.generationOverrides?.temperature != null
        ? { temperature: input.generationOverrides.temperature }
        : {}),
    },
    contextOverflowPolicy: 'reject',
  }, input.signal))

  return {
    id: `agent.chat-copilot.outline:${input.project.id}:${input.worldGroupId ?? 'global'}:${input.mode}:${input.parentVolumeId ?? 'root'}:${input.snapshot.serialized.length}`,
    kind: input.mode === 'volumes' ? 'outline.volume' : 'outline.chapter',
    editableInput: true,
    assembleInput: buildOutlineMessages,
    run: async messages => {
      const raw = await runAI(messages)
      const parsed = input.mode === 'volumes'
        ? parseVolumeOutlineOutput(raw)
        : parseChapterOutlineOutput(raw)
      return parseOutlineCandidateDraft(JSON.stringify(parsed))
    },
    gate: output => {
      const issues = candidateIssues(output, input.snapshot)
      return { status: issues.length ? 'blocked' : 'pass', issues }
    },
    adopt: async output => {
      const current = await readCurrent()
      if (current.serialized !== input.snapshot.serialized) throw new OutlineCopilotStaleError()
      return saveItems(parseOutlineCandidateDraft(JSON.stringify(output)))
    },
  }
}
