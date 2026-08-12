/**
 * 角色维度描述符 · 单一事实源(呈现 + 生成勾选层)。
 *
 * 注意分工:
 * - 「能不能写」由 FIELD_REGISTRY 管(每个 key 都已在 field-registry 注册,AI 输出经 adopt() 写回);
 * - 本文件只管「怎么呈现 / 生成时默认勾哪些」——label、分组、textarea 行高、各戏份默认勾选集。
 * - 四个角色面板、维度勾选器、补全动作全部读这一份 → 加一个维度只改这里 + FIELD_REGISTRY 一行,
 *   生成/写回/四页展示/导出全部自动覆盖(「改一处,所有相关功能受益」)。
 *
 * relationships 走「关系网」面板,不在此重复。
 *
 * i18n: label/group 文案已迁到 character.dimensions.* / character.dimensionGroups.*;
 * 此处保留静态 key 与结构,运行时由 getLabel()/getGroupLabel() 通过 getT() 解析。
 * 双重用途:UI 与 prompt builder 共用同一标签;翻译后 AI 看到本地化标签(项目约定 UI 优先)。
 */
import type { Character, CharacterRoleWeight } from '../types/character'
import { getT } from '../../i18n'

export type CharacterDimensionKey =
  | 'shortDescription' | 'identity' | 'profile' | 'appearance' | 'location'
  | 'personality' | 'values' | 'strengths' | 'weaknesses' | 'fears'
  | 'motivation' | 'goals' | 'innerConflict'
  | 'background' | 'keyEvents'
  | 'abilities' | 'powerLevel'
  | 'speechStyle' | 'habits' | 'signatureItem'
  | 'arc' | 'storyRole' | 'ending'

/** 内部规格(label/group 在运行时按语言解析,不再硬编码中文)。 */
export interface CharacterDimensionSpec {
  key: CharacterDimensionKey
  /** i18n key 后缀(对应 character.dimensions.<key>) */
  labelKey: string
  /** i18n key 后缀(对应 character.dimensionGroups.<group>) */
  groupKey: string
  rows: number
  /** 该维度在哪些戏份下默认勾选(main 始终默认全选,不必列) */
  defaultFor: CharacterRoleWeight[]
}

const ALL: CharacterRoleWeight[] = ['secondary', 'npc', 'extra']

export const CHARACTER_DIMENSIONS: CharacterDimensionSpec[] = [
  // 身份
  { key: 'shortDescription', labelKey: 'shortDescription', groupKey: 'identity', rows: 2, defaultFor: ALL },
  { key: 'identity',  labelKey: 'identity', groupKey: 'identity', rows: 2, defaultFor: ['secondary', 'npc'] },
  { key: 'profile',   labelKey: 'profile', groupKey: 'identity', rows: 1, defaultFor: ['secondary'] },
  { key: 'appearance', labelKey: 'appearance', groupKey: 'identity', rows: 3, defaultFor: ALL },
  { key: 'location',  labelKey: 'location', groupKey: 'identity', rows: 1, defaultFor: ['npc', 'extra'] },
  // 性格内核
  { key: 'personality', labelKey: 'personality', groupKey: 'personalityCore', rows: 3, defaultFor: ['secondary', 'npc'] },
  { key: 'values',     labelKey: 'values', groupKey: 'personalityCore', rows: 2, defaultFor: ['secondary'] },
  { key: 'strengths',  labelKey: 'strengths', groupKey: 'personalityCore', rows: 2, defaultFor: [] },
  { key: 'weaknesses', labelKey: 'weaknesses', groupKey: 'personalityCore', rows: 2, defaultFor: ['secondary'] },
  { key: 'fears',      labelKey: 'fears', groupKey: 'personalityCore', rows: 2, defaultFor: [] },
  // 驱动力
  { key: 'motivation',   labelKey: 'motivation', groupKey: 'drive', rows: 2, defaultFor: ['secondary', 'npc'] },
  { key: 'goals',        labelKey: 'goals', groupKey: 'drive', rows: 2, defaultFor: ['secondary'] },
  { key: 'innerConflict', labelKey: 'innerConflict', groupKey: 'drive', rows: 2, defaultFor: [] },
  // 背景
  { key: 'background', labelKey: 'background', groupKey: 'background', rows: 4, defaultFor: ['secondary', 'npc'] },
  { key: 'keyEvents',  labelKey: 'keyEvents', groupKey: 'background', rows: 3, defaultFor: [] },
  // 能力
  { key: 'abilities',  labelKey: 'abilities', groupKey: 'abilities', rows: 2, defaultFor: ['secondary'] },
  { key: 'powerLevel', labelKey: 'powerLevel', groupKey: 'abilities', rows: 1, defaultFor: [] },
  // 鲜活细节
  { key: 'speechStyle',  labelKey: 'speechStyle', groupKey: 'vividDetails', rows: 2, defaultFor: ['npc'] },
  { key: 'habits',       labelKey: 'habits', groupKey: 'vividDetails', rows: 2, defaultFor: [] },
  { key: 'signatureItem', labelKey: 'signatureItem', groupKey: 'vividDetails', rows: 1, defaultFor: [] },
  // 成长
  { key: 'arc', labelKey: 'arc', groupKey: 'growth', rows: 2, defaultFor: ['secondary'] },
  // 剧情功能
  { key: 'storyRole', labelKey: 'storyRole', groupKey: 'plotFunction', rows: 2, defaultFor: ALL },
  { key: 'ending',    labelKey: 'ending', groupKey: 'plotFunction', rows: 2, defaultFor: ['extra'] },
]

/** 维度 key → 静态 i18n key(避免运行时拼接,确保类型安全)。 */
const DIMENSION_LABEL_KEYS = {
  shortDescription: 'character:dimensions.shortDescription',
  identity: 'character:dimensions.identity',
  profile: 'character:dimensions.profile',
  appearance: 'character:dimensions.appearance',
  location: 'character:dimensions.location',
  personality: 'character:dimensions.personality',
  values: 'character:dimensions.values',
  strengths: 'character:dimensions.strengths',
  weaknesses: 'character:dimensions.weaknesses',
  fears: 'character:dimensions.fears',
  motivation: 'character:dimensions.motivation',
  goals: 'character:dimensions.goals',
  innerConflict: 'character:dimensions.innerConflict',
  background: 'character:dimensions.background',
  keyEvents: 'character:dimensions.keyEvents',
  abilities: 'character:dimensions.abilities',
  powerLevel: 'character:dimensions.powerLevel',
  speechStyle: 'character:dimensions.speechStyle',
  habits: 'character:dimensions.habits',
  signatureItem: 'character:dimensions.signatureItem',
  arc: 'character:dimensions.arc',
  storyRole: 'character:dimensions.storyRole',
  ending: 'character:dimensions.ending',
} as const satisfies Record<CharacterDimensionKey, string>

/** 维度分组 key → 静态 i18n key。 */
const DIMENSION_GROUP_LABEL_KEYS = {
  identity: 'character:dimensionGroups.identity',
  personalityCore: 'character:dimensionGroups.personalityCore',
  drive: 'character:dimensionGroups.drive',
  background: 'character:dimensionGroups.background',
  abilities: 'character:dimensionGroups.abilities',
  vividDetails: 'character:dimensionGroups.vividDetails',
  growth: 'character:dimensionGroups.growth',
  plotFunction: 'character:dimensionGroups.plotFunction',
} as const

/** 所有 dimension/dimensionGroup i18n key 的联合类型(从静态 map 派生)。 */
type DimensionLabelKey =
  | typeof DIMENSION_LABEL_KEYS[keyof typeof DIMENSION_LABEL_KEYS]
  | typeof DIMENSION_GROUP_LABEL_KEYS[keyof typeof DIMENSION_GROUP_LABEL_KEYS]

/**
 * 窄化 t() 调用:只接受已知 dimension/group key。
 * 入参已由静态 map 约束,key 必为合法 i18n key;cast 仅绕过 TS 对
 * Record[K] 索引时把字面量联合宽化为模板字符串的限制。
 */
function tDim(key: DimensionLabelKey): string {
  return (getT() as any)(key)
}

/** 获取维度的本地化 label。非 React 环境使用 getT();若 i18n 未就绪则回退 key。 */
export function getDimensionLabel(key: CharacterDimensionKey): string {
  const k = DIMENSION_LABEL_KEYS[key]
  const translated = tDim(k)
  return typeof translated === 'string' && translated !== k ? translated : key
}

/** 获取维度分组的本地化 label。 */
export function getDimensionGroupLabel(groupKey: string): string {
  const k = DIMENSION_GROUP_LABEL_KEYS[groupKey as keyof typeof DIMENSION_GROUP_LABEL_KEYS]
  if (!k) return groupKey
  const translated = tDim(k)
  return typeof translated === 'string' && translated !== k ? translated : groupKey
}

/** 某戏份默认勾选的维度 key 集（main = 全选）。 */
export function defaultDimensionsForWeight(weight: CharacterRoleWeight): CharacterDimensionKey[] {
  if (weight === 'main') return CHARACTER_DIMENSIONS.map(d => d.key)
  return CHARACTER_DIMENSIONS.filter(d => d.defaultFor.includes(weight)).map(d => d.key)
}

/** 已填(非空)的维度 key 集。 */
export function filledDimensions(c: Character): CharacterDimensionKey[] {
  return CHARACTER_DIMENSIONS.filter(d => (c[d.key] as string)?.trim()).map(d => d.key)
}

/** 按分组归类(供面板分组渲染)。group 字段为 i18n key 后缀,调用方需自行翻译。 */
export function dimensionsByGroup(): Array<{ groupKey: string; dims: CharacterDimensionSpec[] }> {
  const order: string[] = []
  const map = new Map<string, CharacterDimensionSpec[]>()
  for (const d of CHARACTER_DIMENSIONS) {
    if (!map.has(d.groupKey)) { map.set(d.groupKey, []); order.push(d.groupKey) }
    map.get(d.groupKey)!.push(d)
  }
  return order.map(groupKey => ({ groupKey, dims: map.get(groupKey)! }))
}
