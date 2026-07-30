import { db } from '../db/schema'
import { parseInspirationFragments } from '../inspiration/workspace'
import { assembleContext } from '../registry/assemble-context'
import { CONTEXT_SOURCE_BY_KEY } from '../registry/context-sources'
import type { AssembleContextInput } from '../registry/types'
import { AGENT_SEARCH_KINDS } from './read-sources'
import type {
  AgentToolDefinition,
  AgentToolExecutionContext,
  AgentToolJsonSchema,
  AgentToolResult,
} from './types'
import i18n from '../../i18n/i18n'

type ArgRules = {
  allowed: readonly string[]
  required?: readonly string[]
}

type ReadToolSpec = Omit<AgentToolDefinition, 'execute' | 'risk'> & {
  argRules: ArgRules
  requiresWorldScope?: boolean
}

const EMPTY_SCHEMA: AgentToolJsonSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
}

const OPTIONAL_BOUNDARY_SCHEMA: AgentToolJsonSchema = {
  type: 'object',
  properties: {
    chapterId: { type: 'integer', minimum: 1, description: '章节 ID' },
    outlineNodeId: { type: 'integer', minimum: 1, description: '大纲节点 ID' },
    characterId: { type: 'integer', minimum: 1, description: '角色 ID' },
  },
  additionalProperties: false,
}

const READ_TOOL_SPECS: readonly ReadToolSpec[] = [
  {
    name: 'read_project_status',
    description: '读取当前项目的紧凑填写概况、字数和模块数量，不返回整表原文。',
    parameters: EMPTY_SCHEMA,
    sourceKeys: ['projectStatus'],
    inputBudgetTokens: 1400,
    argRules: { allowed: [] },
  },
  {
    name: 'read_worldview',
    description: '读取当前世界的世界观、力量体系和设定词条。',
    parameters: EMPTY_SCHEMA,
    sourceKeys: ['worldview', 'powerSystem', 'codex'],
    inputBudgetTokens: 18_000,
    argRules: { allowed: [] },
  },
  {
    name: 'read_story_core',
    description: '读取项目级故事核心和作者明确激活的角色驱动方案。',
    parameters: EMPTY_SCHEMA,
    sourceKeys: ['storyCore', 'characterDrivenPlan'],
    inputBudgetTokens: 8000,
    argRules: { allowed: [] },
  },
  {
    name: 'read_characters',
    description: '读取当前世界可见的角色档案和项目角色关系。',
    parameters: EMPTY_SCHEMA,
    sourceKeys: ['characters', 'characterRelations'],
    inputBudgetTokens: 10_500,
    argRules: { allowed: [] },
  },
  {
    name: 'read_outline',
    description: '读取当前世界的大纲树；可附带一个节点或章节以读取当前章纲。',
    parameters: {
      type: 'object',
      properties: {
        outlineNodeId: { type: 'integer', minimum: 1, description: '可选的大纲节点 ID' },
        chapterId: { type: 'integer', minimum: 1, description: '可选的章节 ID' },
      },
      additionalProperties: false,
    },
    sourceKeys: ['outlineTree', 'chapterOutline'],
    inputBudgetTokens: 7000,
    argRules: { allowed: ['outlineNodeId', 'chapterId'] },
  },
  {
    name: 'read_chapter',
    description: '读取当前项目指定章节的正文。',
    parameters: {
      type: 'object',
      properties: {
        chapterId: { type: 'integer', minimum: 1, description: '要读取的章节 ID' },
      },
      required: ['chapterId'],
      additionalProperties: false,
    },
    sourceKeys: ['chapterContent'],
    inputBudgetTokens: 24_000,
    argRules: { allowed: ['chapterId'], required: ['chapterId'] },
    requiresWorldScope: true,
  },
  {
    name: 'read_history',
    description: '读取当前世界的历史时间线和历史关键词上下文。',
    parameters: EMPTY_SCHEMA,
    sourceKeys: ['historical'],
    inputBudgetTokens: 2200,
    argRules: { allowed: [] },
  },
  {
    name: 'read_world_rules',
    description: '读取当前世界作者确认的 Canon 断言与真实/幻想规则。',
    parameters: EMPTY_SCHEMA,
    sourceKeys: ['canonAssertions', 'worldRules'],
    inputBudgetTokens: 3500,
    argRules: { allowed: [] },
  },
  {
    name: 'read_foreshadows',
    description: '读取伏笔状态；给出章节时按该章边界组织上下文。',
    parameters: {
      type: 'object',
      properties: {
        chapterId: { type: 'integer', minimum: 1, description: '可选的当前章节 ID' },
      },
      additionalProperties: false,
    },
    sourceKeys: ['foreshadows'],
    inputBudgetTokens: 1800,
    argRules: { allowed: ['chapterId'] },
  },
  {
    name: 'read_inventory',
    description: '读取物品流水；提供章节或大纲边界时同时返回已确认的当前持有投影。',
    parameters: OPTIONAL_BOUNDARY_SCHEMA,
    sourceKeys: ['itemLedger', 'heldItems'],
    inputBudgetTokens: 4200,
    argRules: { allowed: ['chapterId', 'outlineNodeId', 'characterId'] },
  },
  {
    name: 'read_story_timeline',
    description: '读取故事进程年表和作者确认的故事线进度。',
    parameters: {
      type: 'object',
      properties: {
        chapterId: { type: 'integer', minimum: 1, description: '可选的当前章节 ID' },
      },
      additionalProperties: false,
    },
    sourceKeys: ['storyTimeline', 'storylineProgress'],
    inputBudgetTokens: 4800,
    argRules: { allowed: ['chapterId'] },
  },
  {
    name: 'read_world_groups',
    description: '读取项目世界组目录和世界连接关系。',
    parameters: EMPTY_SCHEMA,
    sourceKeys: ['worldGroups'],
    inputBudgetTokens: 1800,
    argRules: { allowed: [] },
  },
  {
    name: 'read_inspiration_workspace',
    description: '只读取作者本次明确勾选的灵感碎片和同模式最近确认版本。',
    parameters: {
      type: 'object',
      properties: {
        fragmentIds: {
          type: 'array',
          description: '本次参与反推的灵感碎片 ID，最多 24 个',
          items: { type: 'string' },
        },
        mode: {
          type: 'string',
          enum: ['single', 'multiworld'],
          description: '与当前项目一致的反推结果模式',
        },
      },
      required: ['fragmentIds', 'mode'],
      additionalProperties: false,
    },
    sourceKeys: ['inspirationWorkspace'],
    inputBudgetTokens: 11_000,
    argRules: { allowed: ['fragmentIds', 'mode'], required: ['fragmentIds', 'mode'] },
  },
  {
    name: 'search_text',
    description: '在当前项目与世界作用域内做本地包含匹配，只返回有界短摘，不调用网络或 embedding。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 100, description: '搜索关键词' },
        limit: { type: 'integer', minimum: 1, maximum: 10, description: '最多返回条数' },
        kinds: {
          type: 'array',
          description: '可选的数据类型过滤',
          items: { type: 'string', enum: AGENT_SEARCH_KINDS },
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    sourceKeys: ['searchResults'],
    inputBudgetTokens: 2600,
    argRules: { allowed: ['query', 'limit', 'kinds'], required: ['query'] },
  },
] as const

function emptyMeta(toolName: string, sourceKeys: readonly string[], budget: number): AgentToolResult['meta'] {
  return {
    toolName,
    sourceKeys,
    included: [],
    omitted: [],
    trimmed: [],
    totalInputTokens: 0,
    inputBudget: budget,
    overBudgetBeforeTrim: false,
    overBudgetAfterTrim: false,
  }
}

function failure(spec: ReadToolSpec, error: string): AgentToolResult {
  return {
    ok: false,
    content: '',
    error,
    meta: emptyMeta(spec.name, spec.sourceKeys, spec.inputBudgetTokens),
  }
}

function positiveInteger(value: unknown, name: string): number | undefined {
  if (value == null) return undefined
  if (!Number.isInteger(value) || Number(value) <= 0) throw new Error(i18n.t('common:errors.agent.positiveIntegerRequired', { name }))
  return Number(value)
}

function validateArgs(spec: ReadToolSpec, raw: Record<string, unknown>): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(i18n.t('common:errors.agent.toolArgsMustBeObject'))
  const keys = Object.keys(raw)
  const unknown = keys.filter(key => !spec.argRules.allowed.includes(key))
  if (unknown.length) throw new Error(i18n.t('common:errors.agent.toolUnknownParams', { params: unknown.join(', ') }))
  const missing = (spec.argRules.required ?? []).filter(key => raw[key] == null)
  if (missing.length) throw new Error(i18n.t('common:errors.agent.toolMissingParams', { params: missing.join(', ') }))

  const args = { ...raw }
  for (const key of ['chapterId', 'outlineNodeId', 'characterId']) {
    if (key in args) args[key] = positiveInteger(args[key], key)
  }
  if ('query' in args) {
    if (typeof args.query !== 'string') throw new Error(i18n.t('common:errors.agent.toolQueryMustBeString'))
    const query = args.query.trim()
    if (query.length < 2 || query.length > 100) throw new Error(i18n.t('common:errors.agent.toolQueryLength'))
    args.query = query
  }
  if ('limit' in args) {
    const limit = positiveInteger(args.limit, 'limit')
    if (limit != null && limit > 10) throw new Error(i18n.t('common:errors.agent.toolLimitMax'))
    args.limit = limit
  }
  if ('kinds' in args) {
    if (!Array.isArray(args.kinds) || args.kinds.some(kind => (
      typeof kind !== 'string' || !AGENT_SEARCH_KINDS.includes(kind as typeof AGENT_SEARCH_KINDS[number])
    ))) throw new Error(i18n.t('common:errors.agent.toolKindsInvalid'))
  }
  if ('fragmentIds' in args) {
    if (
      !Array.isArray(args.fragmentIds)
      || args.fragmentIds.length === 0
      || args.fragmentIds.length > 24
      || args.fragmentIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 120)
    ) throw new Error(i18n.t('common:errors.agent.toolFragmentIdsInvalid'))
    args.fragmentIds = [...new Set(args.fragmentIds.map(id => String(id).trim()))]
  }
  if ('mode' in args && args.mode !== 'single' && args.mode !== 'multiworld') {
    throw new Error(i18n.t('common:errors.agent.toolModeInvalid'))
  }
  return args
}

async function resolveScope(
  spec: ReadToolSpec,
  context: AgentToolExecutionContext,
  args: Record<string, unknown>,
): Promise<AssembleContextInput> {
  const projectId = positiveInteger(context.projectId, 'projectId')!
  const project = await db.projects.get(projectId)
  if (!project) throw new Error(i18n.t('common:errors.agent.toolProjectNotFound'))
  const fragmentIds = args.fragmentIds as string[] | undefined
  const inspirationMode = args.mode as 'single' | 'multiworld' | undefined
  if (
    inspirationMode
    && inspirationMode !== (project.enableMultiWorld ? 'multiworld' : 'single')
  ) throw new Error(i18n.t('common:errors.agent.toolInspirationModeMismatch'))
  if (fragmentIds) {
    const workspace = await db.inspirationWorkspaces.where('projectId').equals(projectId).first()
    const available = new Set(parseInspirationFragments(workspace?.fragments).map(item => item.id))
    if (fragmentIds.some(fragmentId => !available.has(fragmentId))) {
      throw new Error(i18n.t('common:errors.agent.toolFragmentNotFound'))
    }
  }

  const needsWorld = spec.requiresWorldScope
    || spec.sourceKeys.some(key => CONTEXT_SOURCE_BY_KEY.get(key)?.requiresWorldGroupId)
  const explicitWorld = Object.prototype.hasOwnProperty.call(context, 'worldGroupId')
    && context.worldGroupId !== undefined
  let worldGroupId = context.worldGroupId
  if (needsWorld && !explicitWorld) {
    if (project.enableMultiWorld) throw new Error(i18n.t('common:errors.agent.toolMultiWorldGroupRequired'))
    worldGroupId = null
  }
  if (worldGroupId != null) {
    const group = await db.worldGroups.get(worldGroupId)
    if (!group || group.projectId !== projectId) throw new Error(i18n.t('common:errors.agent.toolWorldGroupMismatch'))
  }

  const chapterId = args.chapterId as number | undefined
  const outlineNodeId = args.outlineNodeId as number | undefined
  const characterId = args.characterId as number | undefined
  let chapterOutlineNodeId: number | undefined
  const assertOutlineWorld = async (nodeId: number) => {
    let node = await db.outlineNodes.get(nodeId)
    const visited = new Set<number>()
    let effectiveWorld: number | null = null
    while (node) {
      if (node.projectId !== projectId) throw new Error(i18n.t('common:errors.agent.toolOutlineNodeMismatch'))
      if (node.worldGroupId != null) {
        effectiveWorld = node.worldGroupId
        break
      }
      if (node.parentId == null || visited.has(node.parentId)) break
      visited.add(node.parentId)
      node = await db.outlineNodes.get(node.parentId)
    }
    if (needsWorld && effectiveWorld !== (worldGroupId ?? null)) {
      throw new Error(i18n.t('common:errors.agent.toolWorldScopeMismatch'))
    }
  }
  if (chapterId != null) {
    const chapter = await db.chapters.get(chapterId)
    if (!chapter || chapter.projectId !== projectId) throw new Error(i18n.t('common:errors.agent.toolChapterMismatch'))
    chapterOutlineNodeId = chapter.outlineNodeId
    await assertOutlineWorld(chapter.outlineNodeId)
  }
  if (outlineNodeId != null) {
    const node = await db.outlineNodes.get(outlineNodeId)
    if (!node || node.projectId !== projectId) throw new Error(i18n.t('common:errors.agent.toolOutlineNodeMismatch'))
    await assertOutlineWorld(outlineNodeId)
  }
  if (chapterOutlineNodeId != null && outlineNodeId != null && chapterOutlineNodeId !== outlineNodeId) {
    throw new Error(i18n.t('common:errors.agent.toolOutlineChapterMismatch'))
  }
  if (characterId != null) {
    const character = await db.characters.get(characterId)
    if (!character || character.projectId !== projectId) throw new Error(i18n.t('common:errors.agent.toolCharacterMismatch'))
    if (
      needsWorld
      && !character.isCrossWorld
      && (character.homeWorldGroupId ?? null) !== (worldGroupId ?? null)
    ) throw new Error(i18n.t('common:errors.agent.toolCharacterWorldMismatch'))
  }

  return {
    projectId,
    ...(needsWorld || explicitWorld ? { worldGroupId: worldGroupId ?? null } : {}),
    chapterId,
    outlineNodeId,
    characterId,
    searchQuery: args.query as string | undefined,
    searchLimit: args.limit as number | undefined,
    searchKinds: args.kinds as string[] | undefined,
    inspirationFragmentIds: fragmentIds,
    inspirationMode,
    provider: context.provider,
    model: context.model,
    sourceKeys: [...spec.sourceKeys],
    inputBudgetMaxTokens: Math.min(
      spec.inputBudgetTokens,
      context.contextPolicy?.maxInputTokens ?? spec.inputBudgetTokens,
    ),
    sourceBudgetScale: context.contextPolicy?.sourceBudgetScale,
  }
}

async function executeReadTool(
  spec: ReadToolSpec,
  context: AgentToolExecutionContext,
  rawArgs: Record<string, unknown>,
): Promise<AgentToolResult> {
  try {
    const args = validateArgs(spec, rawArgs)
    const assembled = await assembleContext(await resolveScope(spec, context, args))
    return {
      ok: true,
      content: assembled.text || '当前作用域内没有可用数据。',
      meta: {
        toolName: spec.name,
        sourceKeys: spec.sourceKeys,
        included: assembled.included,
        omitted: assembled.omitted,
        trimmed: assembled.trimmed,
        totalInputTokens: assembled.totalInputTokens,
        inputBudget: assembled.inputBudget,
        overBudgetBeforeTrim: assembled.overBudgetBeforeTrim,
        overBudgetAfterTrim: assembled.overBudgetAfterTrim,
      },
    }
  } catch (error) {
    return failure(spec, error instanceof Error ? error.message : i18n.t('common:errors.agent.toolExecutionFailed'))
  }
}

export const AGENT_READ_TOOLS: readonly AgentToolDefinition[] = READ_TOOL_SPECS.map(spec => {
  for (const sourceKey of spec.sourceKeys) {
    if (!CONTEXT_SOURCE_BY_KEY.has(sourceKey)) {
      throw new Error(i18n.t('common:errors.agent.toolUnregisteredSource', { name: spec.name, key: sourceKey }))
    }
  }
  return {
    name: spec.name,
    description: spec.description,
    risk: 'read',
    parameters: spec.parameters,
    sourceKeys: spec.sourceKeys,
    inputBudgetTokens: spec.inputBudgetTokens,
    execute: (context, args) => executeReadTool(spec, context, args),
  }
})

export const AGENT_TOOL_BY_NAME: ReadonlyMap<string, AgentToolDefinition> = new Map(
  AGENT_READ_TOOLS.map(tool => [tool.name, tool] as const),
)

export async function executeAgentTool(
  name: string,
  context: AgentToolExecutionContext,
  args: Record<string, unknown> = {},
): Promise<AgentToolResult> {
  const tool = AGENT_TOOL_BY_NAME.get(name)
  if (!tool) {
    return {
      ok: false,
      content: '',
      error: i18n.t('common:errors.agent.unknownTool', { name }),
      meta: emptyMeta(name, [], 0),
    }
  }
  return tool.execute(context, args)
}
