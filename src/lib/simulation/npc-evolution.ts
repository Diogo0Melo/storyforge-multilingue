import JSON5 from 'json5'
import { getT } from '../../i18n'
import type {
  ChatMessage,
  SimulationNpcEvolutionCandidate,
  SimulationRuntimeState,
} from '../types'
import {
  isNpcRuntimeEntity,
  parseSimulationNpcEvolutionCandidate,
} from './runtime'

export const MAX_NPC_EVOLUTION_REQUEST_CHARS = 1_000
export const MAX_NPC_EVOLUTION_CANDIDATE_CHARS = 20_000

export function buildNpcEvolutionPrompt(input: {
  authorRequest: string
  targetEntityKey: string
  targetName: string
  runtimeContext: string
}): ChatMessage[] {
  const request = input.authorRequest.trim()
  if (request.length < 2) throw new Error(getT()('simulation:npcEvolution.requestTooShort'))
  if (request.length > MAX_NPC_EVOLUTION_REQUEST_CHARS) {
    throw new Error(getT()('simulation:npcEvolution.requestTooLong', { max: MAX_NPC_EVOLUTION_REQUEST_CHARS }))
  }
  return [
    {
      role: 'system',
      content: [
        '你是 StoryForge 的运行时 NPC 演进候选编辑。',
        '你只能依据冻结运行时上下文和作者本次要求，提出一个可审阅的 NPC 状态候选。',
        '不要修改作者 Canon，不要创建新实体，不要改变实体类型、来源 ID 或角色主档字段。',
        '只输出一个完整 JSON 对象，不要 Markdown、解释或额外字段。',
        'locationKey 必须使用上下文中已有地点实体键，无法移动时保留当前地点；不能编造地点键。',
        'lifecycleStatus 只能是 active / inactive / dead / destroyed。',
        'attributes 只能是标量字段补丁，建议使用 mood / goal / condition 等运行时状态；不要输出对象或数组。',
        'memory 为 null 或包含 status（known / mistaken / forgotten）与 content；narrative 写本次可回放经历。',
        '输出格式：',
        '{',
        '  "entityKey": "目标 NPC 的稳定实体键",',
        '  "locationKey": "已有地点实体键或 null",',
        '  "lifecycleStatus": "active | inactive | dead | destroyed",',
        '  "attributes": {"mood": "状态"},',
        '  "narrative": "本次演进经历，没有则为空字符串",',
        '  "memory": {"status": "known", "content": "该 NPC 记住的内容"},',
        '  "rationale": "依据当前状态和作者要求的简短理由"',
        '}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `目标 NPC：${input.targetName}（${input.targetEntityKey}）`,
        `作者要求：${request}`,
        '【冻结运行时上下文】',
        input.runtimeContext,
      ].join('\n\n'),
    },
  ]
}

function parseJsonObject(draft: string): Record<string, unknown> {
  const input = draft.trim()
  if (!input) throw new Error(getT()('simulation:npcEvolution.candidateEmpty'))
  if (input.length > MAX_NPC_EVOLUTION_CANDIDATE_CHARS) {
    throw new Error(getT()('simulation:npcEvolution.candidateTooLong', { max: MAX_NPC_EVOLUTION_CANDIDATE_CHARS }))
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(input)
  const candidate = fenced?.[1]?.trim() ?? input
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error(getT()('simulation:npcEvolution.candidateNotJsonObject'))
  const json = candidate.slice(start, end + 1)
  const trailing = candidate.slice(end + 1).trim()
  if (trailing) throw new Error(getT()('simulation:npcEvolution.candidateTrailingText'))
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    try {
      return JSON5.parse(json) as Record<string, unknown>
    } catch {
      throw new Error(getT()('simulation:npcEvolution.candidateInvalidJson'))
    }
  }
}

export function parseNpcEvolutionCandidate(input: {
  draft: string
  state: SimulationRuntimeState
  targetEntityKey: string
  baseSequence: number
}): SimulationNpcEvolutionCandidate {
  const raw = parseJsonObject(input.draft)
  const candidate = parseSimulationNpcEvolutionCandidate({
    ...raw,
    baseSequence: input.baseSequence,
  })
  if (candidate.entityKey !== input.targetEntityKey) {
    throw new Error(getT()('simulation:npcEvolution.candidateEntityChanged'))
  }
  const target = input.state.entities[input.targetEntityKey]
  if (!target || !isNpcRuntimeEntity(target)) {
    throw new Error(getT()('simulation:npcEvolution.targetNotSessionNpc'))
  }
  if (candidate.locationKey != null) {
    const location = input.state.entities[candidate.locationKey]
    if (!location || location.kind !== 'location') {
      throw new Error(getT()('simulation:npcEvolution.locationNotFound', { locationKey: candidate.locationKey }))
    }
  }
  return candidate
}
