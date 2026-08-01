/**
 * CONSISTENCY-3 · 世界宪法设定来源注册表。
 *
 * 模型只能引用本表登记的 table/field/predicate 闭集。这里不保存用户数据，只定义
 * 哪些现有设定字段可以成为可追溯 Canon 的证据来源。
 */
export type CanonAssertionSourceTable =
  | 'worldviews'
  | 'powerSystems'
  | 'cultivationSystems'
  | 'storyCores'
  | 'characters'

export interface CanonAssertionSourceFieldSpec {
  field: string
  label: string
  labelKey?: string
  predicates: readonly string[]
}

export interface CanonAssertionSourceSpec {
  table: CanonAssertionSourceTable
  label: string
  labelKey?: string
  fields: readonly CanonAssertionSourceFieldSpec[]
}

export const CANON_ASSERTION_SOURCE_REGISTRY: readonly CanonAssertionSourceSpec[] = Object.freeze([
  {
    table: 'worldviews',
    label: '世界观',
    labelKey: 'panels:canonSource.worldviews',
    fields: [
      { field: 'worldOrigin', label: '世界来源', labelKey: 'panels:canonSource.worldOrigin', predicates: ['magicSource', 'creationOrigin', 'deityAuthority', 'technologyLevel'] },
      { field: 'powerHierarchy', label: '力量体系', labelKey: 'panels:canonSource.powerHierarchy', predicates: ['magicSource', 'deityAuthority', 'powerCeiling'] },
      { field: 'divineDesign', label: '神明设定', labelKey: 'panels:canonSource.divineDesign', predicates: ['deityAuthority'] },
      { field: 'worldStructure', label: '世界结构', labelKey: 'panels:canonSource.worldStructure', predicates: ['technologyLevel'] },
      { field: 'politicsOverview', label: '政治制度', labelKey: 'panels:canonSource.politicsOverview', predicates: ['technologyLevel'] },
      { field: 'economyOverview', label: '经济制度', labelKey: 'panels:canonSource.economyOverview', predicates: ['technologyLevel'] },
      { field: 'cultureOverview', label: '文化制度', labelKey: 'panels:canonSource.cultureOverview', predicates: ['technologyLevel'] },
      { field: 'politicsEconomyCulture', label: '政治经济文化', labelKey: 'panels:canonSource.politicsEconomyCulture', predicates: ['technologyLevel'] },
    ],
  },
  {
    table: 'powerSystems',
    label: '力量体系',
    labelKey: 'panels:canonSource.powerSystems',
    fields: [
      { field: 'description', label: '体系描述', labelKey: 'panels:canonSource.powerSystemDescription', predicates: ['magicSource'] },
      { field: 'levels', label: '力量等级', labelKey: 'panels:canonSource.powerLevels', predicates: ['powerCeiling'] },
      { field: 'rules', label: '体系规则', labelKey: 'panels:canonSource.powerRules', predicates: ['magicSource', 'deityAuthority', 'powerCeiling'] },
    ],
  },
  {
    table: 'cultivationSystems',
    label: '修炼体系',
    labelKey: 'panels:canonSource.cultivationSystems',
    fields: [
      { field: 'description', label: '流派描述', labelKey: 'panels:canonSource.cultivationDescription', predicates: ['magicSource', 'powerCeiling'] },
      { field: 'stages', label: '境界图谱', labelKey: 'panels:canonSource.cultivationStages', predicates: ['powerCeiling'] },
    ],
  },
  {
    table: 'storyCores',
    label: '故事核心',
    labelKey: 'panels:canonSource.storyCores',
    fields: [
      { field: 'logline', label: '一句话故事', labelKey: 'panels:canonSource.logline', predicates: ['parentStatus', 'characterOrigin', 'trueIdentity'] },
      { field: 'concept', label: '故事概念', labelKey: 'panels:canonSource.concept', predicates: ['parentStatus', 'characterOrigin', 'trueIdentity'] },
      { field: 'mainPlot', label: '故事主线', labelKey: 'panels:canonSource.mainPlot', predicates: ['parentStatus', 'characterOrigin', 'trueIdentity'] },
    ],
  },
  {
    table: 'characters',
    label: '角色档案',
    labelKey: 'panels:canonSource.characters',
    fields: [
      { field: 'background', label: '背景故事', labelKey: 'panels:canonSource.background', predicates: ['parentStatus', 'characterOrigin', 'trueIdentity'] },
      { field: 'relationships', label: '关系描述', labelKey: 'panels:canonSource.relationships', predicates: ['parentStatus'] },
      { field: 'identity', label: '身份', labelKey: 'panels:canonSource.identity', predicates: ['characterOrigin', 'trueIdentity'] },
    ],
  },
])

const SOURCE_BY_TABLE = new Map(CANON_ASSERTION_SOURCE_REGISTRY.map(item => [item.table, item]))

export function getCanonAssertionSourceField(
  table: string,
  field: string,
): CanonAssertionSourceFieldSpec | undefined {
  return SOURCE_BY_TABLE.get(table as CanonAssertionSourceTable)?.fields.find(item => item.field === field)
}

export function isAllowedCanonAssertionSource(
  table: string,
  field: string,
  predicate: string,
): boolean {
  return getCanonAssertionSourceField(table, field)?.predicates.includes(predicate) === true
}
