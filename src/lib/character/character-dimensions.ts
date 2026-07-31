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
 */
import type { Character, CharacterRoleWeight } from '../types/character'

export type CharacterDimensionKey =
  | 'shortDescription' | 'identity' | 'profile' | 'appearance' | 'location'
  | 'personality' | 'values' | 'strengths' | 'weaknesses' | 'fears'
  | 'motivation' | 'goals' | 'innerConflict'
  | 'background' | 'keyEvents'
  | 'abilities' | 'powerLevel'
  | 'speechStyle' | 'habits' | 'signatureItem'
  | 'arc' | 'storyRole' | 'ending'

export interface CharacterDimensionSpec {
  key: CharacterDimensionKey
  label: string
  group: string
  rows: number
  labelKey?: string
  groupKey?: string
  /** 该维度在哪些戏份下默认勾选(main 始终默认全选,不必列) */
  defaultFor: CharacterRoleWeight[]
}

const ALL: CharacterRoleWeight[] = ['secondary', 'npc', 'extra']

export const CHARACTER_DIMENSIONS: CharacterDimensionSpec[] = [
  // 身份
  { key: 'shortDescription', label: '一句话简介', labelKey: 'dimensions.shortDescription', group: '身份', groupKey: 'dimensions.groupIdentity', rows: 2, defaultFor: ALL },
  { key: 'identity',  label: '身份/职业/势力', labelKey: 'dimensions.identity', group: '身份', groupKey: 'dimensions.groupIdentity', rows: 2, defaultFor: ['secondary', 'npc'] },
  { key: 'profile',   label: '年龄·性别·种族', labelKey: 'dimensions.profile', group: '身份', groupKey: 'dimensions.groupIdentity', rows: 1, defaultFor: ['secondary'] },
  { key: 'appearance', label: '外貌', labelKey: 'dimensions.appearance', group: '身份', groupKey: 'dimensions.groupIdentity', rows: 3, defaultFor: ALL },
  { key: 'location',  label: '常驻地点', labelKey: 'dimensions.location', group: '身份', groupKey: 'dimensions.groupIdentity', rows: 1, defaultFor: ['npc', 'extra'] },
  // 性格内核
  { key: 'personality', label: '性格', labelKey: 'dimensions.personality', group: '性格内核', groupKey: 'dimensions.groupPersonality', rows: 3, defaultFor: ['secondary', 'npc'] },
  { key: 'values',     label: '价值观/信念', labelKey: 'dimensions.values', group: '性格内核', groupKey: 'dimensions.groupPersonality', rows: 2, defaultFor: ['secondary'] },
  { key: 'strengths',  label: '优点/长处', labelKey: 'dimensions.strengths', group: '性格内核', groupKey: 'dimensions.groupPersonality', rows: 2, defaultFor: [] },
  { key: 'weaknesses', label: '缺点/性格弱点', labelKey: 'dimensions.weaknesses', group: '性格内核', groupKey: 'dimensions.groupPersonality', rows: 2, defaultFor: ['secondary'] },
  { key: 'fears',      label: '恐惧/软肋', labelKey: 'dimensions.fears', group: '性格内核', groupKey: 'dimensions.groupPersonality', rows: 2, defaultFor: [] },
  // 驱动力
  { key: 'motivation',   label: '动机/欲望', labelKey: 'dimensions.motivation', group: '驱动力', groupKey: 'dimensions.groupDrive', rows: 2, defaultFor: ['secondary', 'npc'] },
  { key: 'goals',        label: '目标(短/长期)', labelKey: 'dimensions.goals', group: '驱动力', groupKey: 'dimensions.groupDrive', rows: 2, defaultFor: ['secondary'] },
  { key: 'innerConflict', label: '核心矛盾/内心冲突', labelKey: 'dimensions.innerConflict', group: '驱动力', groupKey: 'dimensions.groupDrive', rows: 2, defaultFor: [] },
  // 背景
  { key: 'background', label: '背景故事', labelKey: 'dimensions.background', group: '背景', groupKey: 'dimensions.groupBackground', rows: 4, defaultFor: ['secondary', 'npc'] },
  { key: 'keyEvents',  label: '关键经历/转折', labelKey: 'dimensions.keyEvents', group: '背景', groupKey: 'dimensions.groupBackground', rows: 3, defaultFor: [] },
  // 能力
  { key: 'abilities',  label: '能力/金手指', labelKey: 'dimensions.abilities', group: '能力', groupKey: 'dimensions.groupAbility', rows: 2, defaultFor: ['secondary'] },
  { key: 'powerLevel', label: '实力定位/境界', labelKey: 'dimensions.powerLevel', group: '能力', groupKey: 'dimensions.groupAbility', rows: 1, defaultFor: [] },
  // 鲜活细节
  { key: 'speechStyle',  label: '语言风格/口头禅', labelKey: 'dimensions.speechStyle', group: '鲜活细节', groupKey: 'dimensions.groupVivid', rows: 2, defaultFor: ['npc'] },
  { key: 'habits',       label: '习惯/小动作/癖好', labelKey: 'dimensions.habits', group: '鲜活细节', groupKey: 'dimensions.groupVivid', rows: 2, defaultFor: [] },
  { key: 'signatureItem', label: '标志性物品/符号', labelKey: 'dimensions.signatureItem', group: '鲜活细节', groupKey: 'dimensions.groupVivid', rows: 1, defaultFor: [] },
  // 成长
  { key: 'arc', label: '角色弧光/成长线', labelKey: 'dimensions.arc', group: '成长', groupKey: 'dimensions.groupGrowth', rows: 2, defaultFor: ['secondary'] },
  // 剧情功能
  { key: 'storyRole', label: '在故事中的作用', labelKey: 'dimensions.storyRole', group: '剧情功能', groupKey: 'dimensions.groupPlotFunction', rows: 2, defaultFor: ALL },
  { key: 'ending',    label: '结局走向', labelKey: 'dimensions.ending', group: '剧情功能', groupKey: 'dimensions.groupPlotFunction', rows: 2, defaultFor: ['extra'] },
]

/** 某戏份默认勾选的维度 key 集（main = 全选）。 */
export function defaultDimensionsForWeight(weight: CharacterRoleWeight): CharacterDimensionKey[] {
  if (weight === 'main') return CHARACTER_DIMENSIONS.map(d => d.key)
  return CHARACTER_DIMENSIONS.filter(d => d.defaultFor.includes(weight)).map(d => d.key)
}

/** 已填(非空)的维度 key 集。 */
export function filledDimensions(c: Character): CharacterDimensionKey[] {
  return CHARACTER_DIMENSIONS.filter(d => (c[d.key] as string)?.trim()).map(d => d.key)
}

/** 按分组归类(供面板分组渲染)。 */
export function dimensionsByGroup(): Array<{ group: string; dims: CharacterDimensionSpec[] }> {
  const order: string[] = []
  const map = new Map<string, CharacterDimensionSpec[]>()
  for (const d of CHARACTER_DIMENSIONS) {
    if (!map.has(d.group)) { map.set(d.group, []); order.push(d.group) }
    map.get(d.group)!.push(d)
  }
  return order.map(group => ({ group, dims: map.get(group)! }))
}
