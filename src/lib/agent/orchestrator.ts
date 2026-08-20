import JSON5 from 'json5'
import { getSupportedUiLang, getT } from '../../i18n'
import { useAIConfigStore } from '../../stores/ai-config'
import { AGENT_ROLE_CATEGORIES } from '../ai/task-routing'
import { useChapterStore } from '../../stores/chapter'
import { useCharacterStore } from '../../stores/character'
import { useInspirationWorkspaceStore } from '../../stores/inspiration-workspace'
import { useOutlineStore } from '../../stores/outline'
import { useWorldviewStore } from '../../stores/worldview'
import { chat, resolveRequestConfig } from '../ai/client'
import { db } from '../db/schema'
import {
  adoptGenerationNodeOutput,
  type GenerationNode,
} from '../generation/generation-node'
import {
  parseInspirationFragments,
  MAX_INSPIRATION_FRAGMENTS,
} from '../inspiration/workspace'
import { adopt } from '../registry/adopt'
import { resolveProjectContentLanguage } from '../ai/content-language'
import { getFieldRole } from '../registry/field-registry'
import {
  projectAgentShadowFields,
  projectReverseShadowFields,
  unregisteredAgentShadowField,
} from '../ai/language-shadow-projections'
import { runLanguageShadow } from '../ai/language-shadow-runner'
import {
  parseAgentEventPayload,
  type AgentEvent,
  type InspirationResultMode,
} from '../types'
import {
  parseCharacterCandidateDraft,
  prepareCharacterCopilot,
  type CharacterCopilotCandidate,
  type CharacterRosterSnapshot,
} from './character-copilot'
import {
  parseInspirationCandidateDraft,
  prepareInspirationCopilot,
  type InspirationCopilotResult,
  type InspirationWorkspaceSnapshot,
} from './inspiration-copilot'
import {
  adoptRestoredOutlineCandidate,
  parseOutlineCandidateDraft,
  prepareOutlineCopilot,
  type OutlineCopilotMode,
  type OutlineCopilotSnapshot,
} from './outline-copilot'
import {
  adoptRestoredProseCandidate,
  parseProseCandidateDraft,
  prepareProseCopilot,
  type ProseCopilotOperation,
  type ProseCopilotSnapshot,
} from './prose-copilot'
import {
  prepareWorldOriginCopilot,
  type WorldOriginSnapshot,
} from './world-origin-copilot'
import type {
  AgentContextEvidence,
  AgentContextTaskKind,
} from './context-policy'
import { executeAgentTool } from './tool-registry'
import { validateDomainCandidateCanon } from './canon-validator'
import { runBudgetedGenerationNode } from './team-execution'
import {
  AgentTeamBudgetExceededError,
  AgentTeamBudgetTracker,
  type AgentTeamBudgetEvidence,
} from './team-budget'

export const DOMAIN_AGENT_IDS = ['world-origin', 'character', 'inspiration', 'outline', 'prose'] as const
export type DomainAgentId = typeof DOMAIN_AGENT_IDS[number]

const CONTEXT_TASK_BY_AGENT: Record<DomainAgentId, AgentContextTaskKind> = {
  'world-origin': 'agent-world-origin',
  character: 'agent-character',
  inspiration: 'agent-inspiration',
  outline: 'agent-outline',
  prose: 'agent-prose',
}

const MAX_OUTPUT_TOKENS_BY_AGENT: Record<DomainAgentId, number> = {
  'world-origin': 3_000,
  character: 6_000,
  inspiration: 8_000,
  outline: 12_000,
  prose: 16_000,
}

function prepareAgentLanguageShadowFields(
  agentId: DomainAgentId,
  draft: string,
  mode: InspirationResultMode = 'single',
) {
  if (agentId === 'world-origin') {
    return projectAgentShadowFields([{
      role: getFieldRole('worldviews', 'worldOrigin'),
      value: draft,
    }])
  }
  if (agentId === 'character') {
    try {
      const candidate = parseCharacterCandidateDraft(draft) as Record<string, unknown>
      const fields = ['name', 'shortDescription', 'personality', 'background', 'motivation', 'arc']
      return projectAgentShadowFields(fields.map(field => ({
        role: getFieldRole('characters', field),
        value: candidate[field],
      })))
    } catch {
      return projectAgentShadowFields([unregisteredAgentShadowField(draft)])
    }
  }
  if (agentId === 'inspiration') {
    try {
      return projectReverseShadowFields(parseInspirationCandidateDraft(draft, mode))
    } catch {
      return projectAgentShadowFields([unregisteredAgentShadowField(draft)])
    }
  }
  // Outline and prose do not expose audited field boundaries here. They are
  // intentionally reported as unregistered instead of being inferred from
  // candidate property names or types.
  return projectAgentShadowFields([unregisteredAgentShadowField(draft)])
}

export interface MasterAgentTask {
  id: string
  agentId: DomainAgentId
  instruction: string
  dependsOn: string[]
}

export interface MasterAgentPlan {
  summary: string
  tasks: MasterAgentTask[]
}

export interface MasterCandidatePayload {
  version: 1
  taskId: string
  agentId: DomainAgentId
  label: string
  contextSources: string[]
  contextEvidence?: AgentContextEvidence
  teamBudgetEvidence?: AgentTeamBudgetEvidence
  baseSnapshot: unknown
  mode?: InspirationResultMode
  selectedFragmentIds?: string[]
  outlineMode?: OutlineCopilotMode
  outlineParentId?: number | null
  proseOperation?: ProseCopilotOperation
  proseOutlineNodeId?: number
  dependsOnTaskIds?: string[]
}

export interface ExecutedMasterCandidate {
  payload: MasterCandidatePayload
  draft: string
  runtimeNode: GenerationNode<any, any, any>
  runtimeOutput: unknown
}

interface PlannerDependencies {
  complete?: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) => Promise<string>
}

function extractJsonObject(text: string): Record<string, unknown> {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1] ?? text
  const start = fenced.indexOf('{')
  const end = fenced.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error(getT()('agent:orchestrator.planNoJson'))
  const parsed = JSON5.parse(fenced.slice(start, end + 1)) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(getT()('agent:orchestrator.planMustBeObject'))
  }
  return parsed as Record<string, unknown>
}

function explicitlyRequestedDomains(request: string): Set<DomainAgentId> {
  const hasInspiration = /灵感|反推|碎片|脑洞/.test(request)
  const hasProse = /正文|续写|接着写|继续写|写(?:作|出|完)?第\s*[零〇一二两三四五六七八九十\d]+\s*章/.test(request)
  const outlineMention = /大纲|卷纲|章纲|章节规划|剧情结构|情节结构/.test(request)
  const outlineAction = (
    /(?:生成|创建|新增|规划|设计|展开|补充|完善|修改|重做).{0,12}(?:大纲|卷纲|章纲|章节规划|剧情结构|情节结构)/.test(request)
    || /(?:大纲|卷纲|章纲|章节规划|剧情结构|情节结构).{0,12}(?:生成|创建|新增|规划|设计|展开|补充|完善|修改|重做)/.test(request)
  )
  const hasOutline = hasProse ? outlineAction : outlineMention
  const worldMention = /世界|设定|起源|文明|力量|体系|时代|地理/.test(request)
  const worldObject = '(?:世界观|世界|背景设定|世界起源|文明设定|力量体系|时代背景|地理设定)'
  const worldAction = (
    new RegExp(`(?:创建|生成|设计|新增|建立|补充|完善|修改|重做).{0,12}${worldObject}`).test(request)
    || new RegExp(`${worldObject}.{0,12}(?:创建|生成|设计|新增|建立|补充|完善|修改|重做)`).test(request)
  )
  const characterMention = /角色|人物|主角|配角|反派|npc/i.test(request)
  const characterAction = (
    /(?:创建|生成|设计|新增|塑造|补充|完善|修改|重做).{0,12}(?:角色|人物|主角|配角|反派|npc)/i.test(request)
    || /(?:角色|人物|主角|配角|反派|npc).{0,12}(?:创建|生成|设计|新增|塑造|补充|完善|修改|重做)/i.test(request)
  )
  const downstreamWriting = hasOutline || hasProse
  const hasWorld = downstreamWriting ? worldAction : worldMention
  // 大纲里的“角色变化/角色弧光”是输出约束，不是创建或修改角色主档的授权。
  const hasCharacter = downstreamWriting ? characterAction : characterMention
  return new Set<DomainAgentId>([
    ...(hasWorld ? ['world-origin' as const] : []),
    ...(hasCharacter ? ['character' as const] : []),
    ...(hasInspiration ? ['inspiration' as const] : []),
    ...(hasOutline ? ['outline' as const] : []),
    ...(hasProse ? ['prose' as const] : []),
  ])
}

function fallbackPlan(request: string): MasterAgentPlan {
  const tasks: MasterAgentTask[] = []
  const requested = explicitlyRequestedDomains(request)
  const hasWorld = requested.has('world-origin')
  const hasCharacter = requested.has('character')
  const hasInspiration = requested.has('inspiration')
  const hasOutline = requested.has('outline')
  const hasProse = requested.has('prose')
  if (hasWorld) tasks.push({
    id: 'world-1',
    agentId: 'world-origin',
    instruction: request,
    dependsOn: [],
  })
  if (hasInspiration) tasks.push({
    id: 'inspiration-1',
    agentId: 'inspiration',
    instruction: request,
    dependsOn: [],
  })
  if (hasCharacter) tasks.push({
    id: 'character-1',
    agentId: 'character',
    instruction: request,
    dependsOn: hasWorld ? ['world-1'] : [],
  })
  if (hasOutline) tasks.push({
    id: 'outline-1',
    agentId: 'outline',
    instruction: request,
    dependsOn: [
      ...(hasWorld ? ['world-1'] : []),
      ...(hasCharacter ? ['character-1'] : []),
    ],
  })
  if (hasProse && !hasOutline) tasks.push({
    id: 'prose-1',
    agentId: 'prose',
    instruction: request,
    dependsOn: [
      ...(hasWorld ? ['world-1'] : []),
      ...(hasCharacter ? ['character-1'] : []),
      ...(hasOutline ? ['outline-1'] : []),
    ],
  })
  if (!tasks.length) tasks.push({
    id: 'character-1',
    agentId: 'character',
    instruction: request,
    dependsOn: [],
  })
  return {
    summary: hasProse && hasOutline
      ? getT()('agent:orchestrator.summaryStagedProse')
      : getT()('agent:orchestrator.summaryFallback'),
    tasks,
  }
}

function sanitizePlan(raw: Record<string, unknown>, request: string): MasterAgentPlan {
  const rawTasks = Array.isArray(raw.tasks) ? raw.tasks : []
  const tasks: MasterAgentTask[] = []
  const ids = new Set<string>()
  const agentIds = new Set<DomainAgentId>()
  const explicitlyRequested = explicitlyRequestedDomains(request)
  for (const item of rawTasks.slice(0, 6)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const source = item as Record<string, unknown>
    if (!DOMAIN_AGENT_IDS.includes(source.agentId as DomainAgentId)) continue
    const agentId = source.agentId as DomainAgentId
    // 模型不得把描述中出现的设定元素误当成新增数据授权。只要用户文本明确命中了至少一个
    // 已闭环领域，就只能调度这些领域；例如“用浮空城和守灯人规划卷纲”只能写大纲。
    if (explicitlyRequested.size > 0 && !explicitlyRequested.has(agentId)) continue
    // 当前每个领域节点都以一次候选快照为确认单位。同领域并列任务会共享旧快照，
    // 第一个采纳后让后续候选必然过期；批量目标必须由单个领域任务一次产出。
    if (agentIds.has(agentId)) {
      const existing = tasks.find(task => task.agentId === agentId)!
      existing.instruction = request.slice(0, 1000)
      if (Array.isArray(source.dependsOn)) {
        existing.dependsOn = [...new Set([
          ...existing.dependsOn,
          ...source.dependsOn.filter((value): value is string => typeof value === 'string'),
        ])].slice(0, 5)
      }
      continue
    }
    const id = typeof source.id === 'string' && source.id.trim()
      ? source.id.trim().slice(0, 80)
      : `task-${tasks.length + 1}`
    if (ids.has(id)) continue
    ids.add(id)
    agentIds.add(agentId)
    const instruction = typeof source.instruction === 'string' && source.instruction.trim()
      ? source.instruction.trim().slice(0, 1000)
      : request
    tasks.push({
      id,
      agentId,
      instruction,
      dependsOn: Array.isArray(source.dependsOn)
        ? source.dependsOn.filter((value): value is string => typeof value === 'string').slice(0, 5)
        : [],
    })
  }
  if (!tasks.length) return fallbackPlan(request)
  const knownIds = new Set(tasks.map(task => task.id))
  tasks.forEach(task => {
    task.dependsOn = task.dependsOn.filter(id => id !== task.id && knownIds.has(id))
  })
  const outlineTaskIds = new Set(tasks
    .filter(task => task.agentId === 'outline')
    .map(task => task.id))
  const stagedProse = tasks.some(task => (
    task.agentId === 'prose'
    && (outlineTaskIds.size > 0 || task.dependsOn.some(id => outlineTaskIds.has(id)))
  ))
  if (stagedProse) {
    for (let index = tasks.length - 1; index >= 0; index--) {
      if (tasks[index].agentId === 'prose') tasks.splice(index, 1)
    }
  }
  return {
    summary: stagedProse
      ? getT()('agent:orchestrator.summaryStagedProse')
      : typeof raw.summary === 'string' && raw.summary.trim()
      ? raw.summary.trim().slice(0, 500)
      : getT()('agent:orchestrator.summarySplit'),
    tasks,
  }
}

export async function createMasterAgentPlan(input: {
  projectId: number
  worldGroupId: number | null
  request: string
  budget?: AgentTeamBudgetTracker
  signal?: AbortSignal
}, dependencies: PlannerDependencies = {}): Promise<MasterAgentPlan> {
  const request = input.request.trim()
  if (request.length < 2) throw new Error(getT()('agent:orchestrator.requestTooShort'))
  const config = resolveRequestConfig(
    useAIConfigStore.getState().config,
    { category: AGENT_ROLE_CATEGORIES.orchestrator },
  ).config
  const status = await executeAgentTool('read_project_status', {
    projectId: input.projectId,
    worldGroupId: input.worldGroupId,
    provider: config.provider,
    model: config.model,
  })
  const messages = [{
    role: 'system' as const,
    content: `你是 StoryForge 面向用户的唯一主 Agent。你不直接生成作品，也不要求用户选择领域；
你只把用户目标拆成幕后领域任务。可用领域 Agent：
- world-origin：建立或补充世界来源、时代与文明起点；
- character：设计一个新角色；
- inspiration：基于项目内已保存灵感碎片做结构化反推。
- outline：生成卷级大纲，或把当前卷纲展开为章节大纲。
- prose：为已有章纲生成空白章正文，或显式续写已有正文；不得覆盖已有手稿。
只调度用户明确要求生成或修改的领域。用户在大纲要求中提到世界元素或角色姓名，只是大纲
约束，不代表授权新建世界观或角色；不得擅自扩大写入范围。
依赖任务必须写 dependsOn。世界设定与角色同时出现时，角色应依赖世界任务。
大纲依赖本轮新生成的世界或角色任务；正文依赖本轮新生成的大纲、世界或角色任务。只输出 JSON：
{"summary":"给用户的简短计划","tasks":[{"id":"稳定ID","agentId":"world-origin|character|inspiration|outline|prose","instruction":"给分 Agent 的完整要求","dependsOn":[]}]}。
每个领域最多一个任务；同一领域的批量目标必须合并到这个任务中一次产出。最多 5 个任务；
不要输出 Markdown。`,
  }, {
    role: 'user' as const,
    content: `【项目紧凑状态】\n${status.ok ? status.content : '状态不可用'}\n\n【用户目标】\n${request}`,
  }]
  let reservation: ReturnType<AgentTeamBudgetTracker['reserveCall']> | null = null
  let settled = false
  try {
    reservation = input.budget?.reserveCall({
      label: getT()('agent:orchestrator.callLabelMaster'),
      messages,
      maxOutputTokens: 1_800,
    }) ?? null
    const output = dependencies.complete
      ? await dependencies.complete(messages)
      : await chat(messages, config, {
          category: 'agent.orchestrator',
          projectId: input.projectId,
          // WS-3B：规划输出是严格 JSON 协议，固定 functional-structured；
          // client gate 不得注入自然语言输出约束。
          outputKind: 'functional-structured',
          configOverrides: { maxTokens: 1800, temperature: 0.2 },
          contextOverflowPolicy: 'reject',
        }, input.signal)
    if (reservation) {
      input.budget!.settleCall(reservation, output)
      settled = true
    }
    return sanitizePlan(extractJsonObject(output), request)
  } catch (error) {
    if (reservation && !settled) input.budget!.settleFailedCall(reservation)
    if (error instanceof AgentTeamBudgetExceededError) throw error
    if (input.signal?.aborted) throw error
    console.warn('[master-agent] 计划模型失败，使用确定性路由降级：', error)
    return fallbackPlan(request)
  }
}

function topologicalTasks(plan: MasterAgentPlan): MasterAgentTask[] {
  const byId = new Map(plan.tasks.map(task => [task.id, task]))
  const done = new Set<string>()
  const result: MasterAgentTask[] = []
  while (result.length < plan.tasks.length) {
    const available = plan.tasks.filter(task => (
      !done.has(task.id) && task.dependsOn.every(id => done.has(id) || !byId.has(id))
    ))
    if (!available.length) throw new Error(getT()('agent:orchestrator.planCyclicDependency'))
    available.forEach(task => {
      result.push(task)
      done.add(task.id)
    })
  }
  return result
}

export async function executeMasterAgentPlan(input: {
  projectId: number
  worldGroupId: number | null
  plan: MasterAgentPlan
  budget?: AgentTeamBudgetTracker
  signal?: AbortSignal
  onTask?: (task: MasterAgentTask, status: 'running' | 'completed' | 'failed', error?: string) => void
}): Promise<ExecutedMasterCandidate[]> {
  const candidates: ExecutedMasterCandidate[] = []
  const outputs = new Map<string, string>()
  const contextProfiles = useAIConfigStore.getState().agentContextProfiles
  const budget = input.budget ?? new AgentTeamBudgetTracker(
    useAIConfigStore.getState().agentTeamBudgetProfile,
  )
  for (const task of topologicalTasks(input.plan)) {
    if (input.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    input.onTask?.(task, 'running')
    try {
      const upstream = task.dependsOn
        .map(id => outputs.get(id))
        .filter((value): value is string => Boolean(value?.trim()))
        .join('\n\n')
      if (task.agentId === 'world-origin') {
        const prepared = await prepareWorldOriginCopilot({
          projectId: input.projectId,
          worldGroupId: input.worldGroupId,
          authorRequest: task.instruction,
          routingCategory: AGENT_ROLE_CATEGORIES['world-origin'],
          contextProfile: contextProfiles[CONTEXT_TASK_BY_AGENT[task.agentId]],
          signal: input.signal,
        })
        const result = await runBudgetedGenerationNode({
          node: prepared.node,
          prepared: prepared.prepared,
          budget,
          callLabel: getT()('agent:orchestrator.callLabelWorldOrigin'),
          maxOutputTokens: MAX_OUTPUT_TOKENS_BY_AGENT[task.agentId],
        })
        const draft = result.output
        candidates.push({
          payload: {
            version: 1,
            taskId: task.id,
            agentId: task.agentId,
            label: getT()('agent:copilot.worldOrigin.labelWorldOrigin'),
            contextSources: prepared.contextSources,
            contextEvidence: prepared.contextEvidence,
            baseSnapshot: prepared.snapshot,
            dependsOnTaskIds: task.dependsOn,
          },
          draft,
          runtimeNode: prepared.node,
          runtimeOutput: result.output,
        })
        outputs.set(task.id, draft)
      } else if (task.agentId === 'character') {
        const prepared = await prepareCharacterCopilot({
          projectId: input.projectId,
          worldGroupId: input.worldGroupId,
          authorRequest: task.instruction,
          supplementalContext: upstream,
          routingCategory: AGENT_ROLE_CATEGORIES.character,
          contextProfile: contextProfiles[CONTEXT_TASK_BY_AGENT[task.agentId]],
          signal: input.signal,
        })
        const result = await runBudgetedGenerationNode({
          node: prepared.node,
          prepared: prepared.prepared,
          budget,
          callLabel: getT()('agent:orchestrator.callLabelCharacter'),
          maxOutputTokens: MAX_OUTPUT_TOKENS_BY_AGENT[task.agentId],
        })
        const draft = JSON.stringify(result.output, null, 2)
        candidates.push({
          payload: {
            version: 1,
            taskId: task.id,
            agentId: task.agentId,
            label: getT()('agent:copilot.character.labelNewCharacter'),
            contextSources: prepared.contextSources,
            contextEvidence: prepared.contextEvidence,
            baseSnapshot: prepared.snapshot,
            dependsOnTaskIds: task.dependsOn,
          },
          draft,
          runtimeNode: prepared.node,
          runtimeOutput: result.output,
        })
        outputs.set(task.id, draft)
      } else if (task.agentId === 'inspiration') {
        const workspace = await db.inspirationWorkspaces.where('projectId').equals(input.projectId).first()
        const selectedFragmentIds = parseInspirationFragments(workspace?.fragments)
          .slice(0, MAX_INSPIRATION_FRAGMENTS)
          .map(fragment => fragment.id)
        if (!selectedFragmentIds.length) throw new Error(getT()('agent:copilot.inspiration.noSavedFragments'))
        const prepared = await prepareInspirationCopilot({
          projectId: input.projectId,
          selectedFragmentIds,
          authorRequest: task.instruction,
          routingCategory: AGENT_ROLE_CATEGORIES.inspiration,
          contextProfile: contextProfiles[CONTEXT_TASK_BY_AGENT[task.agentId]],
          signal: input.signal,
        })
        const result = await runBudgetedGenerationNode({
          node: prepared.node,
          prepared: prepared.prepared,
          budget,
          callLabel: getT()('agent:orchestrator.callLabelInspiration'),
          maxOutputTokens: MAX_OUTPUT_TOKENS_BY_AGENT[task.agentId],
        })
        const draft = JSON.stringify(result.output, null, 2)
        candidates.push({
          payload: {
            version: 1,
            taskId: task.id,
            agentId: task.agentId,
            label: getT()('agent:copilot.inspiration.labelVersion'),
            contextSources: prepared.contextSources,
            contextEvidence: prepared.contextEvidence,
            baseSnapshot: prepared.snapshot,
            mode: prepared.mode,
            selectedFragmentIds,
            dependsOnTaskIds: task.dependsOn,
          },
          draft,
          runtimeNode: prepared.node,
          runtimeOutput: result.output,
        })
        outputs.set(task.id, draft)
      } else if (task.agentId === 'outline') {
        const prepared = await prepareOutlineCopilot({
          projectId: input.projectId,
          worldGroupId: input.worldGroupId,
          authorRequest: task.instruction,
          supplementalContext: upstream,
          routingCategory: AGENT_ROLE_CATEGORIES.outline,
          contextProfile: contextProfiles[CONTEXT_TASK_BY_AGENT[task.agentId]],
          signal: input.signal,
        })
        const result = await runBudgetedGenerationNode({
          node: prepared.node,
          prepared: prepared.prepared,
          budget,
          callLabel: getT()('agent:orchestrator.callLabelOutline'),
          maxOutputTokens: MAX_OUTPUT_TOKENS_BY_AGENT[task.agentId],
          validate: output => validateDomainCandidateCanon({
            agentId: task.agentId,
            projectId: input.projectId,
            worldGroupId: input.worldGroupId,
            outlineNodeId: prepared.parentVolumeId,
            outputText: JSON.stringify(output),
          }),
        })
        const draft = JSON.stringify(result.output, null, 2)
        candidates.push({
          payload: {
            version: 1,
            taskId: task.id,
            agentId: task.agentId,
            label: prepared.label,
            contextSources: prepared.contextSources,
            contextEvidence: prepared.contextEvidence,
            baseSnapshot: prepared.snapshot,
            outlineMode: prepared.mode,
            outlineParentId: prepared.parentVolumeId,
            dependsOnTaskIds: task.dependsOn,
          },
          draft,
          runtimeNode: prepared.node,
          runtimeOutput: result.output,
        })
        outputs.set(task.id, draft)
      } else {
        const prepared = await prepareProseCopilot({
          projectId: input.projectId,
          worldGroupId: input.worldGroupId,
          authorRequest: task.instruction,
          supplementalContext: upstream,
          routingCategory: AGENT_ROLE_CATEGORIES.prose,
          contextProfile: contextProfiles[CONTEXT_TASK_BY_AGENT[task.agentId]],
          signal: input.signal,
        })
        const result = await runBudgetedGenerationNode({
          node: prepared.node,
          prepared: prepared.prepared,
          budget,
          callLabel: getT()('agent:orchestrator.callLabelProse'),
          maxOutputTokens: MAX_OUTPUT_TOKENS_BY_AGENT[task.agentId],
          validate: output => validateDomainCandidateCanon({
            agentId: task.agentId,
            projectId: input.projectId,
            worldGroupId: input.worldGroupId,
            outlineNodeId: prepared.outlineNodeId,
            outputText: output,
          }),
        })
        const draft = result.output
        candidates.push({
          payload: {
            version: 1,
            taskId: task.id,
            agentId: task.agentId,
            label: prepared.label,
            contextSources: prepared.contextSources,
            contextEvidence: prepared.contextEvidence,
            baseSnapshot: prepared.snapshot,
            proseOperation: prepared.operation,
            proseOutlineNodeId: prepared.outlineNodeId,
            dependsOnTaskIds: task.dependsOn,
          },
          draft,
          runtimeNode: prepared.node,
          runtimeOutput: result.output,
        })
        outputs.set(task.id, draft)
      }
      input.onTask?.(task, 'completed')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      input.onTask?.(task, 'failed', message)
      throw error
    }
  }
  const teamBudgetEvidence = budget.snapshot()
  candidates.forEach(candidate => {
    candidate.payload.teamBudgetEvidence = teamBudgetEvidence
  })
  return candidates
}

function sameWorldSnapshot(
  left: WorldOriginSnapshot,
  right: WorldOriginSnapshot,
): boolean {
  return left.id === right.id
    && left.updatedAt === right.updatedAt
    && left.worldOrigin === right.worldOrigin
}

async function currentWorldSnapshot(projectId: number, worldGroupId: number | null): Promise<WorldOriginSnapshot> {
  const rows = await db.worldviews.where('projectId').equals(projectId).toArray()
  const row = worldGroupId == null
    ? (rows.find(item => (item.worldGroupId ?? null) === null) ?? rows[0] ?? null)
    : (rows.find(item => item.worldGroupId === worldGroupId) ?? null)
  return { id: row?.id ?? null, updatedAt: row?.updatedAt ?? null, worldOrigin: row?.worldOrigin ?? '' }
}

async function currentRosterSnapshot(projectId: number, worldGroupId: number | null): Promise<CharacterRosterSnapshot> {
  const rows = await db.characters.where('projectId').equals(projectId).toArray()
  return {
    serialized: JSON.stringify(rows.map(character => ({
      id: character.id ?? null,
      updatedAt: character.updatedAt,
      name: character.name,
      homeWorldGroupId: character.homeWorldGroupId ?? null,
      isCrossWorld: Boolean(character.isCrossWorld),
    })).sort((left, right) => (left.id ?? 0) - (right.id ?? 0))),
    visibleNames: rows
      .filter(character => character.isCrossWorld || (character.homeWorldGroupId ?? null) === worldGroupId)
      .map(character => character.name.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')),
  }
}

async function currentInspirationSnapshot(projectId: number): Promise<InspirationWorkspaceSnapshot> {
  const row = await db.inspirationWorkspaces.where('projectId').equals(projectId).first()
  return {
    id: row?.id ?? null,
    updatedAt: row?.updatedAt ?? null,
    fragments: row?.fragments ?? '[]',
    versions: row?.versions ?? '[]',
  }
}

async function assertCandidateDependenciesAdopted(
  event: AgentEvent,
  payload: MasterCandidatePayload,
): Promise<void> {
  const taskIds = payload.dependsOnTaskIds ?? []
  if (!taskIds.length) return
  const events = await db.agentEvents
    .where('conversationId')
    .equals(event.conversationId)
    .toArray()
  const candidateByTask = new Map<string, number>()
  const adoptedCandidateIds = new Set<number>()
  for (const row of events) {
    if (row.kind === 'candidate' && row.id != null) {
      const candidate = parseAgentEventPayload<Partial<MasterCandidatePayload>>(row, {})
      if (candidate.taskId) candidateByTask.set(candidate.taskId, row.id)
    } else if (row.kind === 'confirmation') {
      const confirmation = parseAgentEventPayload<{
        candidateEventId?: number
        decision?: 'adopted' | 'rejected'
      }>(row, {})
      if (confirmation.decision === 'adopted' && confirmation.candidateEventId != null) {
        adoptedCandidateIds.add(confirmation.candidateEventId)
      }
    }
  }
  const missing = taskIds.filter(taskId => {
    const candidateId = candidateByTask.get(taskId)
    return candidateId == null || !adoptedCandidateIds.has(candidateId)
  })
  if (missing.length) {
    throw new Error(getT()('agent:orchestrator.dependencyNotAdopted', { ids: missing.join('、') }))
  }
}

export async function adoptMasterCandidate(input: {
  projectId: number
  worldGroupId: number | null
  event: AgentEvent
  payload: MasterCandidatePayload
  draft: string
  runtime?: ExecutedMasterCandidate
}): Promise<string> {
  await assertCandidateDependenciesAdopted(input.event, input.payload)
  let projectReadSucceeded = true
  let project: Awaited<ReturnType<typeof db.projects.get>> | undefined = undefined
  try {
    project = await db.projects.get(input.projectId)
  } catch {
    projectReadSucceeded = false
  }
  if (projectReadSucceeded) {
    runLanguageShadow({
      family: 'agents',
      targetLanguage: resolveProjectContentLanguage(project ?? {}, getSupportedUiLang()),
      fields: prepareAgentLanguageShadowFields(
        input.payload.agentId,
        input.draft,
        input.payload.mode ?? 'single',
      ),
    })
  }
  if (input.runtime) {
    const output = input.payload.agentId === 'world-origin'
      ? input.draft
      : input.payload.agentId === 'character'
        ? parseCharacterCandidateDraft(input.draft)
        : input.payload.agentId === 'inspiration'
          ? parseInspirationCandidateDraft(input.draft, input.payload.mode ?? 'single')
          : input.payload.agentId === 'outline'
            ? parseOutlineCandidateDraft(input.draft)
            : parseProseCandidateDraft(input.draft)
    const result = await adoptGenerationNodeOutput(input.runtime.runtimeNode, output)
    if (!result.adopted) {
      throw new Error(result.gate?.issues.map(issue => issue.message).join('；') || getT()('agent:orchestrator.gateRejected'))
    }
  } else if (input.payload.agentId === 'world-origin') {
    const base = input.payload.baseSnapshot as WorldOriginSnapshot
    if (!sameWorldSnapshot(base, await currentWorldSnapshot(input.projectId, input.worldGroupId))) {
      throw new Error(getT()('agent:orchestrator.worldOriginStale'))
    }
    const draft = input.draft.trim()
    if (draft.length < 4 || draft.length > 12_000) throw new Error(getT()('agent:orchestrator.worldOriginLengthInvalid'))
    await adopt({
      projectId: input.projectId,
      worldGroupId: input.worldGroupId,
      target: 'worldviews',
      mode: 'replace',
      data: { worldOrigin: draft },
    })
  } else if (input.payload.agentId === 'character') {
    const base = input.payload.baseSnapshot as CharacterRosterSnapshot
    const current = await currentRosterSnapshot(input.projectId, input.worldGroupId)
    if (base.serialized !== current.serialized) throw new Error(getT()('agent:orchestrator.characterRosterChanged'))
    const candidate = parseCharacterCandidateDraft(input.draft)
    const normalized = candidate.name.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')
    if (current.visibleNames.includes(normalized)) throw new Error(getT()('agent:orchestrator.characterDuplicate', { name: candidate.name }))
    await adopt({
      projectId: input.projectId,
      worldGroupId: input.worldGroupId,
      target: 'characters',
      mode: 'add',
      data: { ...candidate, isCrossWorld: false },
    })
  } else if (input.payload.agentId === 'inspiration') {
    const base = input.payload.baseSnapshot as InspirationWorkspaceSnapshot
    const current = await currentInspirationSnapshot(input.projectId)
    if (JSON.stringify(base) !== JSON.stringify(current)) throw new Error(getT()('agent:orchestrator.inspirationWorkspaceChanged'))
    const mode = input.payload.mode ?? 'single'
    const result = parseInspirationCandidateDraft(input.draft, mode)
    await useInspirationWorkspaceStore.getState().load(input.projectId)
    await useInspirationWorkspaceStore.getState().saveVersion(input.projectId, {
      mode,
      parentVersionId: null,
      fragmentIds: input.payload.selectedFragmentIds ?? [],
      result: result as InspirationCopilotResult,
    })
  } else if (input.payload.agentId === 'outline') {
    const mode = input.payload.outlineMode
    if (!mode) throw new Error(getT()('agent:orchestrator.outlineMissingMode'))
    await adoptRestoredOutlineCandidate({
      projectId: input.projectId,
      worldGroupId: input.worldGroupId,
      mode,
      parentVolumeId: input.payload.outlineParentId ?? null,
      snapshot: input.payload.baseSnapshot as OutlineCopilotSnapshot,
      draft: input.draft,
    })
  } else {
    if (!input.payload.proseOperation || input.payload.proseOutlineNodeId == null) {
      throw new Error(getT()('agent:orchestrator.proseMissingTarget'))
    }
    await adoptRestoredProseCandidate({
      projectId: input.projectId,
      worldGroupId: input.worldGroupId,
      operation: input.payload.proseOperation,
      outlineNodeId: input.payload.proseOutlineNodeId,
      snapshot: input.payload.baseSnapshot as ProseCopilotSnapshot,
      draft: input.draft,
    })
  }

  await Promise.all([
    useWorldviewStore.getState().loadAll(input.projectId, input.worldGroupId),
    useCharacterStore.getState().loadAll(input.projectId),
    useOutlineStore.getState().loadAll(input.projectId),
    useChapterStore.getState().loadAll(input.projectId),
  ])
  return input.payload.agentId === 'world-origin'
    ? getT()('agent:orchestrator.adoptSuccessWorldOrigin')
    : input.payload.agentId === 'character'
      ? getT()('agent:orchestrator.adoptSuccessCharacter', { name: (parseCharacterCandidateDraft(input.draft) as CharacterCopilotCandidate).name })
      : input.payload.agentId === 'inspiration'
        ? input.payload.mode === 'multiworld' ? getT()('agent:orchestrator.adoptSuccessInspirationMulti') : getT()('agent:orchestrator.adoptSuccessInspirationSingle')
        : input.payload.agentId === 'outline'
          ? input.payload.outlineMode === 'volumes'
            ? getT()('agent:orchestrator.adoptSuccessVolumeOutline')
            : getT()('agent:orchestrator.adoptSuccessChapterOutline')
          : input.payload.proseOperation === 'continue'
            ? getT()('agent:orchestrator.adoptSuccessProseContinue')
            : getT()('agent:orchestrator.adoptSuccessProseGenerate')
}
