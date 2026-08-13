import JSON5 from 'json5'
import { getT } from '../../i18n'
import { useAIConfigStore } from '../../stores/ai-config'
import { buildCharacterPrompt } from '../ai/adapters/character-adapter'
import { chat, resolveRequestConfig } from '../ai/client'
import {
  MORAL_AXES,
  ORDER_AXES,
  ROLE_WEIGHTS,
} from '../character/character-axes'
import {
  CHARACTER_DIMENSIONS,
  getDimensionLabel,
  type CharacterDimensionKey,
} from '../character/character-dimensions'
import { db } from '../db/schema'
import type {
  GenerationGateIssue,
  GenerationNode,
  PreparedGenerationNode,
} from '../generation/generation-node'
import { prepareGenerationNode } from '../generation/generation-node'
import { adopt } from '../registry/adopt'
import type { AdoptResult } from '../registry/types'
import type {
  AIConfig,
  Character,
  CharacterMoralAxis,
  CharacterOrderAxis,
  CharacterRoleWeight,
} from '../types'
import {
  mergeContextEvidence,
  resolveAgentContextPolicy,
  splitAgentContextPolicy,
  type AgentContextEvidence,
  type AgentContextProfile,
} from './context-policy'
import { executeAgentTool } from './tool-registry'

export const MAX_CHARACTER_CANDIDATE_CHARS = 40_000
const MAX_CHARACTER_NAME_CHARS = 80
const MAX_CHARACTER_SUMMARY_CHARS = 800
const MAX_CHARACTER_FIELD_CHARS = 6_000

export type CharacterCopilotCandidate = {
  name: string
  roleWeight: CharacterRoleWeight
  moralAxis: CharacterMoralAxis
  orderAxis: CharacterOrderAxis
  relationships: string
} & Record<CharacterDimensionKey, string>

export interface CharacterRosterSnapshot {
  serialized: string
  visibleNames: string[]
}

export interface CharacterCopilotInput {
  projectId: number
  projectName: string
  genres: string
  worldGroupId: number | null
  authorRequest: string
  worldContext: string
  characterContext: string
  contextSources: string[]
  snapshot: CharacterRosterSnapshot
  config: AIConfig
  generationOverrides?: { temperature?: number; maxTokens?: number }
  routingCategory?: string
  signal?: AbortSignal
}

export interface PreparedCharacterCopilot {
  node: GenerationNode<CharacterCopilotInput, CharacterCopilotCandidate, AdoptResult>
  prepared: PreparedGenerationNode
  contextSources: string[]
  snapshot: CharacterRosterSnapshot
  contextEvidence: AgentContextEvidence
}

interface CharacterCopilotDependencies {
  runAI?: (
    messages: ReturnType<typeof buildCharacterPrompt>,
  ) => Promise<string>
  readCurrent?: () => Promise<CharacterRosterSnapshot>
  saveCharacter?: (candidate: CharacterCopilotCandidate) => Promise<AdoptResult>
}

export class CharacterCopilotStaleError extends Error {
  constructor() {
    super(getT()('agent:copilot.character.staleError'))
    this.name = 'CharacterCopilotStaleError'
  }
}

export class CharacterCopilotDuplicateError extends Error {
  constructor(name: string) {
    super(getT()('agent:copilot.character.duplicateError', { name }))
    this.name = 'CharacterCopilotDuplicateError'
  }
}

const CANDIDATE_FIELDS = [
  'name',
  'roleWeight',
  'moralAxis',
  'orderAxis',
  'relationships',
  ...CHARACTER_DIMENSIONS.map(dimension => dimension.key),
] as const
const CANDIDATE_FIELD_SET = new Set<string>(CANDIDATE_FIELDS)

function normalizeName(name: string): string {
  return name.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')
}

function isVisibleInScope(character: Character, worldGroupId: number | null): boolean {
  return Boolean(character.isCrossWorld)
    || (character.homeWorldGroupId ?? null) === worldGroupId
}

export async function readCharacterRosterSnapshot(
  projectId: number,
  worldGroupId: number | null,
): Promise<CharacterRosterSnapshot> {
  const rows = await db.characters.where('projectId').equals(projectId).toArray()
  const serialized = JSON.stringify(
    rows
      .map(character => ({
        id: character.id ?? null,
        updatedAt: character.updatedAt,
        name: character.name,
        homeWorldGroupId: character.homeWorldGroupId ?? null,
        isCrossWorld: Boolean(character.isCrossWorld),
      }))
      .sort((left, right) => (left.id ?? 0) - (right.id ?? 0)),
  )
  return {
    serialized,
    visibleNames: rows
      .filter(character => isVisibleInScope(character, worldGroupId))
      .map(character => normalizeName(character.name)),
  }
}

function assertAuthorRequest(value: string): string {
  const request = value.trim()
  if (request.length < 2) throw new Error(getT()('agent:copilot.character.requestTooShort'))
  if (request.length > 1000) throw new Error(getT()('agent:copilot.character.requestTooLong'))
  return request
}

function parseJsonObject(draft: string): Record<string, unknown> {
  const input = draft.trim()
  if (!input) throw new Error(getT()('agent:copilot.character.candidateEmpty'))
  if (input.length > MAX_CHARACTER_CANDIDATE_CHARS) {
    throw new Error(getT()('agent:copilot.character.candidateTooLong', { max: MAX_CHARACTER_CANDIDATE_CHARS }))
  }
  const fullFence = /```(?:json)?\s*([\s\S]*?)```/i.exec(input)
  const candidate = fullFence?.[1]?.trim() ?? input
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error(getT()('agent:copilot.character.candidateNotJsonObject'))
  const json = candidate.slice(start, end + 1)
  const trailing = candidate.slice(end + 1).trim()
  if (trailing) throw new Error(getT()('agent:copilot.character.candidateTrailingText'))
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    try {
      parsed = JSON5.parse(json)
    } catch {
      throw new Error(getT()('agent:copilot.character.candidateInvalidJson'))
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(getT()('agent:copilot.character.candidateMustBeObject'))
  }
  return parsed as Record<string, unknown>
}

function stringField(
  source: Record<string, unknown>,
  field: string,
  options: { required?: boolean; max?: number } = {},
): string {
  const raw = source[field]
  if (raw == null && !options.required) return ''
  if (typeof raw !== 'string') throw new Error(getT()('agent:copilot.character.fieldMustBeString', { field }))
  const value = raw.trim()
  if (options.required && !value) throw new Error(getT()('agent:copilot.character.fieldMissing', { field }))
  if (value.length > (options.max ?? MAX_CHARACTER_FIELD_CHARS)) {
    throw new Error(getT()('agent:copilot.character.fieldTooLong', { field }))
  }
  return value
}

export function parseCharacterCandidateDraft(draft: string): CharacterCopilotCandidate {
  const source = parseJsonObject(draft)
  const unknown = Object.keys(source).filter(field => !CANDIDATE_FIELD_SET.has(field))
  if (unknown.length) throw new Error(getT()('agent:copilot.character.unknownFields', { fields: unknown.join('、') }))

  const roleWeight = source.roleWeight
  const moralAxis = source.moralAxis
  const orderAxis = source.orderAxis
  if (!ROLE_WEIGHTS.includes(roleWeight as CharacterRoleWeight)) {
    throw new Error(getT()('agent:copilot.character.invalidRoleWeight'))
  }
  if (!MORAL_AXES.includes(moralAxis as CharacterMoralAxis)) {
    throw new Error(getT()('agent:copilot.character.invalidMoralAxis'))
  }
  if (!ORDER_AXES.includes(orderAxis as CharacterOrderAxis)) {
    throw new Error(getT()('agent:copilot.character.invalidOrderAxis'))
  }

  const dimensions = Object.fromEntries(
    CHARACTER_DIMENSIONS.map(dimension => [
      dimension.key,
      stringField(source, dimension.key, {
        required: dimension.key === 'shortDescription',
        max: dimension.key === 'shortDescription'
          ? MAX_CHARACTER_SUMMARY_CHARS
          : MAX_CHARACTER_FIELD_CHARS,
      }),
    ]),
  ) as Record<CharacterDimensionKey, string>
  const result: CharacterCopilotCandidate = {
    name: stringField(source, 'name', { required: true, max: MAX_CHARACTER_NAME_CHARS }),
    roleWeight: roleWeight as CharacterRoleWeight,
    moralAxis: moralAxis as CharacterMoralAxis,
    orderAxis: orderAxis as CharacterOrderAxis,
    relationships: stringField(source, 'relationships'),
    ...dimensions,
  }
  if (JSON.stringify(result).length > MAX_CHARACTER_CANDIDATE_CHARS) {
    throw new Error(getT()('agent:copilot.character.candidateTooLong', { max: MAX_CHARACTER_CANDIDATE_CHARS }))
  }
  return result
}

function structuredOutputContract(): string {
  const dimensionLines = CHARACTER_DIMENSIONS
    .map(dimension => `  "${dimension.key}": "${getDimensionLabel(dimension.key)}，没有内容时为空字符串"`)
    .join(',\n')
  return `本次必须只输出一个完整 JSON 对象，不要输出 Markdown、解释或额外字段：
{
  "name": "姓名",
  "roleWeight": "main | secondary | npc | extra",
  "moralAxis": "good | neutral | evil",
  "orderAxis": "lawful | neutral | chaotic",
  "relationships": "与已有角色的关系描述；不创建关系边",
${dimensionLines}
}
姓名与 shortDescription 必填。所有字段必须是字符串；三轴只能使用上面的英文枚举。`
}

function buildCharacterCopilotPrompt(input: CharacterCopilotInput) {
  const messages = buildCharacterPrompt(
    input.projectName,
    input.genres,
    input.worldContext,
    input.characterContext,
    input.authorRequest,
  )
  const contract = structuredOutputContract()
  const systemIndex = messages.findIndex(message => message.role === 'system')
  if (systemIndex >= 0) {
    messages[systemIndex] = {
      ...messages[systemIndex],
      content: `${messages[systemIndex].content}\n\n${contract}`,
    }
  } else {
    messages.unshift({ role: 'system', content: contract })
  }
  return messages
}

function candidateIssues(
  output: CharacterCopilotCandidate,
  snapshot: CharacterRosterSnapshot,
): GenerationGateIssue[] {
  const issues: GenerationGateIssue[] = []
  let parsed: CharacterCopilotCandidate | null = null
  try {
    parsed = parseCharacterCandidateDraft(JSON.stringify(output))
  } catch (error) {
    issues.push({
      code: 'character-invalid-structure',
      message: error instanceof Error ? error.message : getT()('agent:copilot.character.invalidStructure'),
    })
  }
  if (parsed && snapshot.visibleNames.includes(normalizeName(parsed.name))) {
    issues.push({
      code: 'character-duplicate-name',
      message: getT()('agent:copilot.character.duplicateNameInScope', { name: parsed.name }),
    })
  }
  return issues
}

export async function prepareCharacterCopilot(input: {
  projectId: number
  worldGroupId: number | null
  authorRequest: string
  /** 主 Agent 可把尚未写库的上游候选作为本轮显式证据传入，绝不冒充 Canon。 */
  supplementalContext?: string
  routingCategory?: string
  contextProfile?: AgentContextProfile
  /** 节点级 AI preset 的解析结果；未提供时沿用全局路由配置。 */
  configOverride?: AIConfig
  generationOverrides?: { temperature?: number; maxTokens?: number }
  signal?: AbortSignal
}): Promise<PreparedCharacterCopilot> {
  const project = await db.projects.get(input.projectId)
  if (!project) throw new Error(getT()('agent:copilot.character.projectNotFound'))
  if (project.enableMultiWorld && input.worldGroupId == null) {
    throw new Error(getT()('agent:copilot.character.multiWorldRequired'))
  }
  const worldGroupId = project.enableMultiWorld ? input.worldGroupId : null
  const beforeRead = await readCharacterRosterSnapshot(input.projectId, worldGroupId)
  const routingCategory = input.routingCategory ?? 'character.generate'
  const config = input.configOverride ?? resolveRequestConfig(
    useAIConfigStore.getState().config,
    { category: routingCategory },
  ).config
  const contextProfile = input.contextProfile ?? 'full'
  const contextPolicy = resolveAgentContextPolicy('agent-character', contextProfile)
  const [worldPolicy, characterPolicy] = splitAgentContextPolicy(contextPolicy, [18_000, 10_500])
  const executionContext = {
    projectId: input.projectId,
    worldGroupId,
    provider: config.provider,
    model: config.model,
  }
  const [worldview, characters] = await Promise.all([
    executeAgentTool('read_worldview', { ...executionContext, contextPolicy: worldPolicy }, {}),
    executeAgentTool('read_characters', { ...executionContext, contextPolicy: characterPolicy }, {}),
  ])
  if (!worldview.ok) throw new Error(worldview.error || getT()('agent:copilot.character.cannotReadWorldview'))
  if (!characters.ok) throw new Error(characters.error || getT()('agent:copilot.character.cannotReadCharacters'))
  const afterRead = await readCharacterRosterSnapshot(input.projectId, worldGroupId)
  if (beforeRead.serialized !== afterRead.serialized) throw new CharacterCopilotStaleError()

  const nodeInput: CharacterCopilotInput = {
    projectId: input.projectId,
    projectName: project.name,
    genres: project.genres?.join('/') || project.genre || '',
    worldGroupId,
    authorRequest: assertAuthorRequest(input.authorRequest),
    worldContext: [
      worldview.content,
      input.supplementalContext?.trim()
        ? `【本轮上游候选（尚未采纳，不属于 Canon）】\n${input.supplementalContext.trim()}`
        : '',
    ].filter(Boolean).join('\n\n'),
    characterContext: characters.content,
    contextSources: [...new Set([...worldview.meta.included, ...characters.meta.included])],
    snapshot: afterRead,
    config,
    generationOverrides: input.generationOverrides,
    routingCategory,
    signal: input.signal,
  }
  const node = createCharacterCopilotNode(nodeInput)
  return {
    node,
    prepared: prepareGenerationNode(node, nodeInput),
    contextSources: nodeInput.contextSources,
    snapshot: afterRead,
    contextEvidence: mergeContextEvidence(contextProfile, [worldview.meta, characters.meta]),
  }
}

/**
 * Phase 27.1-d 角色领域节点：只生成一个新角色候选，作者确认后才写角色主档。
 */
export function createCharacterCopilotNode(
  input: CharacterCopilotInput,
  dependencies: CharacterCopilotDependencies = {},
): GenerationNode<CharacterCopilotInput, CharacterCopilotCandidate, AdoptResult> {
  const readCurrent = dependencies.readCurrent
    ?? (() => readCharacterRosterSnapshot(input.projectId, input.worldGroupId))
  const saveCharacter = dependencies.saveCharacter ?? (candidate => db.transaction(
    'rw',
    db.characters,
    db.temporalFacts,
    async () => {
      // 将最终重复/过期检查与 adopt 写回锁进同一事务，避免多标签页在二者之间插入同名角色。
      const lockedCurrent = await readCharacterRosterSnapshot(input.projectId, input.worldGroupId)
      if (lockedCurrent.serialized !== input.snapshot.serialized) {
        throw new CharacterCopilotStaleError()
      }
      if (lockedCurrent.visibleNames.includes(normalizeName(candidate.name))) {
        throw new CharacterCopilotDuplicateError(candidate.name)
      }
      return adopt({
        projectId: input.projectId,
        worldGroupId: input.worldGroupId,
        target: 'characters',
        mode: 'add',
        data: {
          ...candidate,
          isCrossWorld: false,
        },
      })
    },
  ))
  const runAI = dependencies.runAI ?? (messages => chat(messages, input.config, {
    category: input.routingCategory ?? 'character.generate',
    projectId: input.projectId,
    // WS-3B：角色候选是结构化 JSON 但字段值面向读者，固定 mixed。
    outputKind: 'mixed',
    configOverrides: {
      maxTokens: input.generationOverrides?.maxTokens ?? 6000,
      ...(input.generationOverrides?.temperature != null
        ? { temperature: input.generationOverrides.temperature }
        : {}),
    },
    contextOverflowPolicy: 'reject',
  }, input.signal))

  return {
    id: `agent.chat-copilot.character:${input.projectId}:${input.worldGroupId ?? 'global'}:${input.snapshot.serialized.length}`,
    kind: 'character.generate',
    editableInput: true,
    assembleInput: buildCharacterCopilotPrompt,
    run: async messages => parseCharacterCandidateDraft(await runAI(messages)),
    gate: output => {
      const issues = candidateIssues(output, input.snapshot)
      return { status: issues.length ? 'blocked' : 'pass', issues }
    },
    adopt: async output => {
      const current = await readCurrent()
      if (current.serialized !== input.snapshot.serialized) {
        throw new CharacterCopilotStaleError()
      }
      const parsed = parseCharacterCandidateDraft(JSON.stringify(output))
      if (current.visibleNames.includes(normalizeName(parsed.name))) {
        throw new CharacterCopilotDuplicateError(parsed.name)
      }
      const result = await saveCharacter(parsed)
      if (
        result.written.length !== 1
        || result.unknown.length > 0
        || result.typeErrors.length > 0
        || result.fkErrors.length > 0
        || result.skipped.length > 0
      ) {
        throw new Error(getT()('agent:copilot.character.adoptIncomplete'))
      }
      return result
    },
  }
}

/** 节点执行器与聊天副驾共用的正式角色采纳入口。 */
export async function adoptCharacterCopilotCandidate(input: {
  projectId: number
  worldGroupId: number | null
  snapshot: CharacterRosterSnapshot
  candidate: CharacterCopilotCandidate
}): Promise<AdoptResult> {
  const parsed = parseCharacterCandidateDraft(JSON.stringify(input.candidate))
  return db.transaction(
    'rw',
    db.characters,
    db.temporalFacts,
    async () => {
      const current = await readCharacterRosterSnapshot(input.projectId, input.worldGroupId)
      if (current.serialized !== input.snapshot.serialized) throw new CharacterCopilotStaleError()
      if (current.visibleNames.includes(normalizeName(parsed.name))) {
        throw new CharacterCopilotDuplicateError(parsed.name)
      }
      return adopt({
        projectId: input.projectId,
        worldGroupId: input.worldGroupId,
        target: 'characters',
        mode: 'add',
        data: {
          ...parsed,
          isCrossWorld: false,
        },
      })
    },
  )
}
