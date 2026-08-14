import JSON5 from 'json5'
import { getT } from '../../i18n'
import type { SupportedLang } from '../../i18n'
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

/**
 * R-I18N-P2 · 模拟严格 JSON 调用的字段级叙事语言契约。
 *
 * 这些调用点显式声明 outputKind: 'language-neutral'，client gate 因此不追加
 * 宽泛的散文语言约束（避免破坏严格协议）；改由提示词在字段级别声明：只有列出的
 * 叙事字段跟随项目 resolved contentLanguage，JSON 键、canonical 枚举值、实体键、
 * 数值/骰子表达式与协议结构一律保持原样。语言名只取自既有 SupportedLang，
 * 不引入第二套 locale 源。ttrpg.ts 的两个提示词构造器复用同一构造器。
 *
 * Oracle 修正（fix-6 复审）：分类必须覆盖全部面向作者的自由文本字段——
 * NPC attributes 的字符串值（mood / goal / condition 等）与 GM check.skill
 * （runtime 按 ≤120 字符自由散文接受）也纳入语言契约；属性键名、非字符串值、
 * expression/dc、实体键仍属协议，保持原样。
 */
const SIMULATION_CONTENT_LANGUAGE_NAMES: Record<SupportedLang, string> = {
  'pt-BR': 'português brasileiro',
  'en': 'English',
  'zh-CN': '简体中文',
}

export function buildSimulationNarrativeLanguageDirective(
  contentLanguage: SupportedLang,
  narrativeFields: readonly string[],
  clarifications: readonly string[] = [],
): string {
  const languageName = SIMULATION_CONTENT_LANGUAGE_NAMES[contentLanguage]
  return [
    '【叙事字段语言契约】',
    `输出仍然是单个严格 JSON 对象。其中仅以下叙事字段必须使用${languageName}书写：${narrativeFields.join('、')}。`,
    ...clarifications,
    'JSON 键、canonical 枚举值、实体键、数值与骰子表达式以及协议结构必须保持原样，不得翻译、改名或改动。',
    '不要新增字段，不要输出 JSON 以外的任何文本。',
  ].join('\n')
}

/** NPC 演进候选中跟随项目内容语言的叙事字段（其余字段属协议/键/枚举）。 */
export const NPC_EVOLUTION_NARRATIVE_FIELDS = ['narrative', 'memory.content', 'rationale'] as const

/**
 * Oracle 修正：attributes 的字符串值（如 mood / goal / condition）是面向作者的
 * 自由文本，同样跟随内容语言；attributes 的键名与非字符串值属协议，保持原样。
 * memory.status / lifecycleStatus 等 canonical 枚举不在此列。
 */
export const NPC_EVOLUTION_ATTRIBUTE_LANGUAGE_CLARIFICATION =
  'attributes 中仅字符串类型的值（如 mood / goal / condition）属于面向作者的叙事文本，同样使用该内容语言；attributes 的键名与非字符串值保持原样。'

export function buildNpcEvolutionPrompt(input: {
  authorRequest: string
  targetEntityKey: string
  targetName: string
  runtimeContext: string
  /** R-I18N-P2: 项目 resolved 内容语言；仅驱动叙事字段语言契约，缺省时不注入。 */
  contentLanguage?: SupportedLang
}): ChatMessage[] {
  const request = input.authorRequest.trim()
  if (request.length < 2) throw new Error(getT()('simulation:npcEvolution.requestTooShort'))
  if (request.length > MAX_NPC_EVOLUTION_REQUEST_CHARS) {
    throw new Error(getT()('simulation:npcEvolution.requestTooLong', { max: MAX_NPC_EVOLUTION_REQUEST_CHARS }))
  }
  const system: string[] = [
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
  ]
  if (input.contentLanguage) {
    system.push(buildSimulationNarrativeLanguageDirective(
      input.contentLanguage,
      NPC_EVOLUTION_NARRATIVE_FIELDS,
      [NPC_EVOLUTION_ATTRIBUTE_LANGUAGE_CLARIFICATION],
    ))
  }
  return [
    {
      role: 'system',
      content: system.join('\n'),
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
