import type { RagDocumentMetadata } from './rag-library'
import type { FieldRole } from '../registry/types'

/**
 * Phase 35-a — 词条系统（Codex）数据模型
 *
 * 设计见 docs/CODEX-REDESIGN.md 第三章。
 * 用「通用词条表 + 分类树 + 字段 schema」承载自然物产/人工器物/种族/势力/城池等可枚举实体，
 * 取代分散的自由文本字段；天然支持用户自定义分类与字段。
 */

/** 词条所属领域 */
export type CodexDomain = 'natural' | 'humanity' | 'origin'

/** 字段类型 */
export type CodexFieldType = 'text' | 'longtext' | 'select' | 'number' | 'ref'

/** 字段定义（驱动词条详情表单的渲染） */
export interface CodexFieldDef {
  /** 内部键 */
  key: string
  /** 显示名（外观/品级/功效…） */
  label: string
  type: CodexFieldType
  /** AI 输出字段的审计角色；旧 schema 缺省时保持未审计，不做推断。 */
  role?: FieldRole
  /** select 选项 */
  options?: string[]
  /** ref 字段：建议指向哪类词条的 builtInKey（软提示，选择器仍可跨类） */
  refCategory?: string
  /** ref 字段是否允许多选（默认 true） */
  refMulti?: boolean
  required?: boolean
  /** 占位/说明 */
  placeholder?: string
  /** i18n key for label display (resolved at render time; label remains as persisted/AI fallback) */
  labelKey?: string
  /** i18n key for placeholder display */
  placeholderKey?: string
  /** i18n keys for option display (parallel to options array) */
  optionKeys?: string[]
}

/** 内置分类稳定标识 */
export type BuiltInCodexKey =
  | 'mineral'   // 矿物灵材
  | 'herb'      // 灵植草药
  | 'beast'     // 灵兽异兽
  | 'race'      // 种族民族
  | 'faction'   // 势力
  | 'city'      // 城池重镇
  | 'artifact'  // 人工器物
  // 世界观各方面的"全貌+词条"分类（每个面板子页一个）
  | 'natStructure' | 'natDimension' | 'natTerrain' | 'natWater' | 'natClimate' // 自然环境各方面
  | 'humEra' | 'humEvent' | 'humSociety' | 'humPolitics' | 'humEconomy'
  | 'humCulture' | 'humConflict'                                                // 人文环境各方面
  | 'originPower' | 'originDeity'                                              // 世界起源:力量体系/神明信仰

/** 词条分类（树状，内置 + 用户自定义） */
export interface CodexCategory {
  id?: number
  projectId: number
  domain: CodexDomain
  /** 父分类 id（null = 顶层大类）；支持多级大类→小类 */
  parentId: number | null
  name: string
  icon?: string
  /** 内置分类的稳定标识（自定义分类为 undefined）；用于代码识别内置类 */
  builtInKey?: BuiltInCodexKey
  /** 该分类下词条的字段 schema（CodexFieldDef[] 序列化） */
  fieldSchema: string
  /** 是否隐藏（内置分类不可删，但可隐藏） */
  hidden?: boolean
  order: number
  /**
   * 历史兼容字段。分类 schema 由整个项目共享，不按世界复制；
   * 新数据始终写 null，旧备份中的数值也按项目级分类处理。
   */
  worldGroupId?: number | null
  createdAt: number
  updatedAt: number
}

/** 一条词条 */
export interface CodexEntry extends RagDocumentMetadata {
  id?: number
  projectId: number
  categoryId: number
  name: string
  icon?: string
  /** 一句话简介 */
  summary: string
  /** 详细描述（自由文本） */
  description: string
  /** 按所属分类 fieldSchema 填的结构化字段（JSON：{ [key]: string }） */
  fields: string
  /** 与其它词条的关联（JSON：{ [fieldKey]: entryId[] }） */
  refs?: string
  /** 标签（JSON string: string[]），可由 AI 提取补充，也可手动编辑。 */
  tags?: string
  /**
   * 重要度星级（1-5）。主要用于「地点」类词条标记重要程度，
   * 也可用于任意词条。未设/0 表示未标记。非索引字段，零 DB 迁移。
   */
  importance?: number
  /** 异兽等词条采用的修炼体系（WORLD-1）。 */
  cultivationSystemId?: number | null
  /** 该词条在所选体系中的当前境界 stage id。 */
  cultivationStageId?: string | null
  /** 城池词条对应的空间地点；人文属性与地点树分层，删除地点只断开软引用。 */
  importantLocationId?: number | null
  order: number
  worldGroupId?: number | null
  createdAt: number
  updatedAt: number
}

// ── 工具函数 ──────────────────────────────────────────────────

export function parseFieldSchema(json: string | undefined): CodexFieldDef[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function stringifyFieldSchema(defs: CodexFieldDef[]): string {
  return JSON.stringify(defs)
}

export function parseEntryFields(json: string | undefined): Record<string, string> {
  if (!json) return {}
  try {
    const v = JSON.parse(json)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export function stringifyEntryFields(fields: Record<string, string>): string {
  return JSON.stringify(fields)
}

export function parseEntryRefs(json: string | undefined): Record<string, number[]> {
  if (!json) return {}
  try {
    const v = JSON.parse(json)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export function stringifyEntryRefs(refs: Record<string, number[]>): string {
  return JSON.stringify(refs)
}

/**
 * Codex 词条的世界作用域判定。
 *
 * - `target === undefined`：调用方明确未启用作用域过滤，返回全部（如项目级维护工具）。
 * - `target === null`：单世界数据，只读取尚未归属世界组的词条。
 * - `target === number`：多世界数据，只读取该世界的词条；null 不是“全局词条”。
 *
 * 开启多世界时，stampPrimaryWorld 会把既有 null 词条迁移到主世界。因此把 null
 * 继续视为全局会让迁移后新建错位数据泄漏到所有世界。
 */
export function codexEntryInWorld(
  entry: Pick<CodexEntry, 'worldGroupId'>,
  target?: number | null,
): boolean {
  if (target === undefined) return true
  return (entry.worldGroupId ?? null) === (target ?? null)
}

export function filterCodexEntriesByWorld<T extends Pick<CodexEntry, 'worldGroupId'>>(
  entries: readonly T[],
  target?: number | null,
): T[] {
  return entries.filter(entry => codexEntryInWorld(entry, target))
}

// ── 内置分类与字段 schema（预置 seed，见设计文档 3.2） ──────────────

/** 内置分类的种子定义（不含 projectId/时间，落库时补全） */
export interface BuiltInCategorySeed {
  domain: CodexDomain
  builtInKey: BuiltInCodexKey
  name: string
  icon: string
  fields: CodexFieldDef[]
}

const PIN_JI_OPTIONS = ['凡品', '下品', '中品', '上品', '极品', '神品']
const PIN_JI_OPTION_KEYS = ['fso.pinJi.0', 'fso.pinJi.1', 'fso.pinJi.2', 'fso.pinJi.3', 'fso.pinJi.4', 'fso.pinJi.5']

export const BUILTIN_CATEGORIES: BuiltInCategorySeed[] = [
  // ── 自然环境 ──
  {
    domain: 'natural', builtInKey: 'mineral', name: '矿物灵材', icon: '⛏️',
    fields: [
      { key: 'appearance', label: '外观', labelKey: 'fs.mineral.appearance', type: 'longtext', placeholder: '形状 / 颜色 / 质感', placeholderKey: 'fs.mineral.appearancePh' },
      { key: 'rank', label: '品级品阶', labelKey: 'fs.mineral.rank', type: 'select', options: PIN_JI_OPTIONS, optionKeys: PIN_JI_OPTION_KEYS },
      { key: 'effect', label: '功效作用', labelKey: 'fs.mineral.effect', type: 'longtext' },
      { key: 'origin', label: '产地分布', labelKey: 'fs.mineral.origin', type: 'text' },
      { key: 'rarity', label: '稀有度', labelKey: 'fs.mineral.rarity', type: 'select', options: ['常见', '稀少', '罕见', '珍稀', '绝世'], optionKeys: ['fso.rarity.0', 'fso.rarity.1', 'fso.rarity.2', 'fso.rarity.3', 'fso.rarity.4'] },
      { key: 'craftInto', label: '可炼器物', labelKey: 'fs.mineral.craftInto', type: 'ref', refCategory: 'artifact', refMulti: true },
    ],
  },
  {
    domain: 'natural', builtInKey: 'herb', name: '灵植草药', icon: '🌿',
    fields: [
      { key: 'form', label: '形态', labelKey: 'fs.herb.form', type: 'longtext' },
      { key: 'effect', label: '药效', labelKey: 'fs.herb.effect', type: 'longtext' },
      { key: 'rank', label: '品级', labelKey: 'fs.herb.rank', type: 'select', options: PIN_JI_OPTIONS, optionKeys: PIN_JI_OPTION_KEYS },
      { key: 'habitat', label: '生长环境', labelKey: 'fs.herb.habitat', type: 'text' },
      { key: 'maturity', label: '成熟周期', labelKey: 'fs.herb.maturity', type: 'text' },
      { key: 'difficulty', label: '采集难度', labelKey: 'fs.herb.difficulty', type: 'select', options: ['容易', '一般', '困难', '极难'], optionKeys: ['fso.difficulty.0', 'fso.difficulty.1', 'fso.difficulty.2', 'fso.difficulty.3'] },
      { key: 'craftInto', label: '可炼丹药', labelKey: 'fs.herb.craftInto', type: 'ref', refCategory: 'artifact', refMulti: true },
    ],
  },
  {
    domain: 'natural', builtInKey: 'beast', name: '灵兽异兽', icon: '🐅',
    fields: [
      { key: 'kind', label: '类别', labelKey: 'fs.beast.kind', type: 'select', options: ['走兽', '飞禽', '水族', '虫豸', '异种'], optionKeys: ['fso.beastKind.0', 'fso.beastKind.1', 'fso.beastKind.2', 'fso.beastKind.3', 'fso.beastKind.4'] },
      // WORLD-1 已有结构化关联；保留这两个旧文本字段承载老项目无法自动推断的数据。
      { key: 'cultivation', label: '修炼体系（旧文本备注）', labelKey: 'fs.beast.cultivation', type: 'text', placeholder: '旧数据兼容；新数据请使用上方结构化关联', placeholderKey: 'fs.beast.cultivationPh' },
      { key: 'realm', label: '境界（旧文本备注）', labelKey: 'fs.beast.realm', type: 'text' },
      { key: 'body', label: '体型外貌', labelKey: 'fs.beast.body', type: 'longtext' },
      { key: 'habit', label: '习性性情', labelKey: 'fs.beast.habit', type: 'longtext' },
      { key: 'habitat', label: '栖息地', labelKey: 'fs.beast.habitat', type: 'text' },
      { key: 'threat', label: '威胁等级', labelKey: 'fs.beast.threat', type: 'select', options: ['无害', '低危', '中危', '高危', '毁灭级'], optionKeys: ['fso.threat.0', 'fso.threat.1', 'fso.threat.2', 'fso.threat.3', 'fso.threat.4'] },
      { key: 'ability', label: '特殊能力', labelKey: 'fs.beast.ability', type: 'longtext' },
      { key: 'drops', label: '可产出材料', labelKey: 'fs.beast.drops', type: 'ref', refCategory: 'artifact', refMulti: true },
    ],
  },
  // ── 人文环境 ──
  {
    domain: 'humanity', builtInKey: 'race', name: '种族民族', icon: '🧬',
    fields: [
      { key: 'appearance', label: '外貌特征', labelKey: 'fs.race.appearance', type: 'longtext' },
      { key: 'talent', label: '种族天赋', labelKey: 'fs.race.talent', type: 'longtext' },
      { key: 'lifespan', label: '平均寿命', labelKey: 'fs.race.lifespan', type: 'text' },
      { key: 'population', label: '人口规模', labelKey: 'fs.race.population', type: 'text' },
      { key: 'settlement', label: '聚居地', labelKey: 'fs.race.settlement', type: 'text' },
      { key: 'custom', label: '文化习俗', labelKey: 'fs.race.custom', type: 'longtext' },
      { key: 'faith', label: '信仰', labelKey: 'fs.race.faith', type: 'text' },
      { key: 'relations', label: '与其他种族关系', labelKey: 'fs.race.relations', type: 'longtext' },
      { key: 'representatives', label: '代表人物', labelKey: 'fs.race.representatives', type: 'text' },
    ],
  },
  {
    domain: 'humanity', builtInKey: 'faction', name: '势力', icon: '⚔️',
    fields: [
      { key: 'type', label: '类型', labelKey: 'fs.faction.type', type: 'select', options: ['门派', '朝廷', '商会', '部落', '教派', '世家', '其他'], optionKeys: ['fso.factionType.0', 'fso.factionType.1', 'fso.factionType.2', 'fso.factionType.3', 'fso.factionType.4', 'fso.factionType.5', 'fso.factionType.6'] },
      { key: 'territory', label: '势力范围', labelKey: 'fs.faction.territory', type: 'text' },
      { key: 'leader', label: '领导者', labelKey: 'fs.faction.leader', type: 'text' },
      { key: 'coreMembers', label: '核心成员', labelKey: 'fs.faction.coreMembers', type: 'longtext' },
      { key: 'power', label: '实力等级', labelKey: 'fs.faction.power', type: 'text' },
      { key: 'goal', label: '宗旨目标', labelKey: 'fs.faction.goal', type: 'longtext' },
      { key: 'relations', label: '敌友关系', labelKey: 'fs.faction.relations', type: 'longtext' },
      { key: 'banner', label: '标志旗帜', labelKey: 'fs.faction.banner', type: 'text' },
      { key: 'mapRegion', label: '绑定地图区域', labelKey: 'fs.faction.mapRegion', type: 'text' },
      { key: 'color', label: '颜色', labelKey: 'fs.faction.color', type: 'text', placeholder: '如 #C17D5E', placeholderKey: 'fs.faction.colorPh' },
    ],
  },
  {
    domain: 'humanity', builtInKey: 'city', name: '城池重镇', icon: '🏰',
    fields: [
      { key: 'faction', label: '所属势力', labelKey: 'fs.city.faction', type: 'ref', refCategory: 'faction', refMulti: false },
      { key: 'locationNote', label: '位置备注（旧文本）', labelKey: 'fs.city.locationNote', type: 'text', placeholder: '结构化位置请使用上方「重要地点」关联', placeholderKey: 'fs.city.locationNotePh' },
      { key: 'scale', label: '规模人口', labelKey: 'fs.city.scale', type: 'text' },
      { key: 'ruler', label: '统治者', labelKey: 'fs.city.ruler', type: 'text' },
      { key: 'economy', label: '经济特产', labelKey: 'fs.city.economy', type: 'longtext' },
      { key: 'strategic', label: '战略地位', labelKey: 'fs.city.strategic', type: 'longtext' },
      { key: 'style', label: '城市风貌', labelKey: 'fs.city.style', type: 'longtext' },
      { key: 'landmark', label: '地标建筑', labelKey: 'fs.city.landmark', type: 'text' },
    ],
  },
  {
    domain: 'humanity', builtInKey: 'artifact', name: '人工器物', icon: '🗡️',
    fields: [
      { key: 'type', label: '类别', labelKey: 'fs.artifact.type', type: 'select', options: ['武器', '防具', '法器', '丹药', '功法秘籍', '阵法', '材料', '其他'], optionKeys: ['fso.artifactType.0', 'fso.artifactType.1', 'fso.artifactType.2', 'fso.artifactType.3', 'fso.artifactType.4', 'fso.artifactType.5', 'fso.artifactType.6', 'fso.artifactType.7'] },
      { key: 'rank', label: '品级品阶', labelKey: 'fs.artifact.rank', type: 'select', options: PIN_JI_OPTIONS, optionKeys: PIN_JI_OPTION_KEYS },
      { key: 'appearance', label: '外观', labelKey: 'fs.artifact.appearance', type: 'longtext' },
      { key: 'effect', label: '能力效果', labelKey: 'fs.artifact.effect', type: 'longtext' },
      { key: 'craft', label: '炼制方式', labelKey: 'fs.artifact.craft', type: 'longtext' },
      { key: 'materials', label: '所需材料', labelKey: 'fs.artifact.materials', type: 'ref', refCategory: 'mineral', refMulti: true },
      { key: 'origin', label: '来历', labelKey: 'fs.artifact.origin', type: 'longtext' },
      { key: 'owner', label: '当前持有者', labelKey: 'fs.artifact.owner', type: 'text' },
    ],
  },

  // ── 自然环境各方面（全貌写在面板字段,这里逐条细化具体词条） ──
  {
    domain: 'natural', builtInKey: 'natStructure', name: '世界结构', icon: '🌐',
    fields: [
      { key: 'type', label: '层级类型', labelKey: 'fs.natStructure.type', type: 'text', placeholder: '如 星球 / 大陆 / 位面 / 平行空间', placeholderKey: 'fs.natStructure.typePh' },
      { key: 'scope', label: '范围', labelKey: 'fs.natStructure.scope', type: 'text' },
      { key: 'feature', label: '特征说明', labelKey: 'fs.natStructure.feature', type: 'longtext' },
    ],
  },
  {
    domain: 'natural', builtInKey: 'natDimension', name: '疆域版图', icon: '📐',
    fields: [
      { key: 'scale', label: '尺度范围', labelKey: 'fs.natDimension.scale', type: 'text' },
      { key: 'feature', label: '区域特征', labelKey: 'fs.natDimension.feature', type: 'longtext' },
    ],
  },
  {
    domain: 'natural', builtInKey: 'natTerrain', name: '地貌', icon: '🗺️',
    fields: [
      { key: 'type', label: '类型', labelKey: 'fs.natTerrain.type', type: 'select', options: ['大陆', '山脉', '高原', '平原', '盆地', '丘陵', '峡谷', '沙漠', '森林', '其他'], optionKeys: ['fso.terrainType.0', 'fso.terrainType.1', 'fso.terrainType.2', 'fso.terrainType.3', 'fso.terrainType.4', 'fso.terrainType.5', 'fso.terrainType.6', 'fso.terrainType.7', 'fso.terrainType.8', 'fso.terrainType.9'] },
      { key: 'location', label: '位置', labelKey: 'fs.natTerrain.location', type: 'text' },
      { key: 'feature', label: '地形特征', labelKey: 'fs.natTerrain.feature', type: 'longtext' },
    ],
  },
  {
    domain: 'natural', builtInKey: 'natWater', name: '山川水系', icon: '⛰️',
    fields: [
      { key: 'type', label: '类型', labelKey: 'fs.natWater.type', type: 'select', options: ['山脉', '山峰', '河流', '湖泊', '海洋', '运河', '瀑布', '其他'], optionKeys: ['fso.waterType.0', 'fso.waterType.1', 'fso.waterType.2', 'fso.waterType.3', 'fso.waterType.4', 'fso.waterType.5', 'fso.waterType.6', 'fso.waterType.7'] },
      { key: 'scale', label: '规模', labelKey: 'fs.natWater.scale', type: 'text' },
      { key: 'feature', label: '特征', labelKey: 'fs.natWater.feature', type: 'longtext' },
    ],
  },
  {
    domain: 'natural', builtInKey: 'natClimate', name: '气候带', icon: '🌦️',
    fields: [
      { key: 'region', label: '所在区域', labelKey: 'fs.natClimate.region', type: 'text' },
      { key: 'type', label: '气候类型', labelKey: 'fs.natClimate.type', type: 'text', placeholder: '如 温带 / 苦寒 / 湿热', placeholderKey: 'fs.natClimate.typePh' },
      { key: 'hazard', label: '季节/自然灾害', labelKey: 'fs.natClimate.hazard', type: 'longtext' },
    ],
  },

  // ── 人文环境各方面 ──
  {
    domain: 'humanity', builtInKey: 'humEra', name: '历史时代', icon: '📜',
    fields: [
      { key: 'period', label: '时间/纪年', labelKey: 'fs.humEra.period', type: 'text' },
      { key: 'feature', label: '时代特征/大事', labelKey: 'fs.humEra.feature', type: 'longtext' },
    ],
  },
  {
    domain: 'humanity', builtInKey: 'humEvent', name: '重大事件', icon: '📅',
    fields: [
      { key: 'type', label: '类型', labelKey: 'fs.humEvent.type', type: 'select', options: ['战争', '王朝兴替', '灾劫', '变法', '发现', '其他'], optionKeys: ['fso.eventType.0', 'fso.eventType.1', 'fso.eventType.2', 'fso.eventType.3', 'fso.eventType.4', 'fso.eventType.5'] },
      { key: 'time', label: '发生时间', labelKey: 'fs.humEvent.time', type: 'text' },
      { key: 'impact', label: '影响', labelKey: 'fs.humEvent.impact', type: 'longtext' },
    ],
  },
  {
    domain: 'humanity', builtInKey: 'humSociety', name: '政经文化', icon: '🏛️',
    fields: [
      { key: 'type', label: '类别', labelKey: 'fs.humSociety.type', type: 'select', options: ['政体', '货币', '赋税', '阶层制度', '宗教信仰', '风俗节庆', '其他'], optionKeys: ['fso.societyType.0', 'fso.societyType.1', 'fso.societyType.2', 'fso.societyType.3', 'fso.societyType.4', 'fso.societyType.5', 'fso.societyType.6'] },
      { key: 'detail', label: '说明', labelKey: 'fs.humSociety.detail', type: 'longtext' },
    ],
  },
  {
    domain: 'humanity', builtInKey: 'humPolitics', name: '政治制度', icon: '🏛️',
    fields: [
      { key: 'type', label: '制度类型', labelKey: 'fs.humPolitics.type', type: 'select', options: ['政体', '官制', '法律', '军事', '外交', '阶层', '其他'], optionKeys: ['fso.politicsType.0', 'fso.politicsType.1', 'fso.politicsType.2', 'fso.politicsType.3', 'fso.politicsType.4', 'fso.politicsType.5', 'fso.politicsType.6'] },
      { key: 'scope', label: '适用范围', labelKey: 'fs.humPolitics.scope', type: 'text' },
      { key: 'authority', label: '权力主体', labelKey: 'fs.humPolitics.authority', type: 'text' },
      { key: 'detail', label: '制度说明', labelKey: 'fs.humPolitics.detail', type: 'longtext' },
    ],
  },
  {
    domain: 'humanity', builtInKey: 'humEconomy', name: '经济制度', icon: '💰',
    fields: [
      { key: 'type', label: '制度类型', labelKey: 'fs.humEconomy.type', type: 'select', options: ['货币', '税赋', '贸易', '产业', '资源分配', '金融', '其他'], optionKeys: ['fso.economyType.0', 'fso.economyType.1', 'fso.economyType.2', 'fso.economyType.3', 'fso.economyType.4', 'fso.economyType.5', 'fso.economyType.6'] },
      { key: 'scope', label: '流通范围', labelKey: 'fs.humEconomy.scope', type: 'text' },
      { key: 'actors', label: '主要参与者', labelKey: 'fs.humEconomy.actors', type: 'text' },
      { key: 'detail', label: '制度说明', labelKey: 'fs.humEconomy.detail', type: 'longtext' },
    ],
  },
  {
    domain: 'humanity', builtInKey: 'humCulture', name: '文化制度', icon: '🎭',
    fields: [
      { key: 'type', label: '文化类型', labelKey: 'fs.humCulture.type', type: 'select', options: ['语言', '宗教', '教育', '礼仪', '节庆', '艺术', '习俗', '其他'], optionKeys: ['fso.cultureType.0', 'fso.cultureType.1', 'fso.cultureType.2', 'fso.cultureType.3', 'fso.cultureType.4', 'fso.cultureType.5', 'fso.cultureType.6', 'fso.cultureType.7'] },
      { key: 'region', label: '流行区域/群体', labelKey: 'fs.humCulture.region', type: 'text' },
      { key: 'taboo', label: '禁忌', labelKey: 'fs.humCulture.taboo', type: 'text' },
      { key: 'detail', label: '文化说明', labelKey: 'fs.humCulture.detail', type: 'longtext' },
    ],
  },
  {
    domain: 'humanity', builtInKey: 'humConflict', name: '矛盾冲突', icon: '🔥',
    fields: [
      { key: 'type', label: '类型', labelKey: 'fs.humConflict.type', type: 'text', placeholder: '如 阶级 / 种族 / 信仰 / 资源', placeholderKey: 'fs.humConflict.typePh' },
      { key: 'sides', label: '对立方', labelKey: 'fs.humConflict.sides', type: 'text' },
      { key: 'tension', label: '张力/根源', labelKey: 'fs.humConflict.tension', type: 'longtext' },
    ],
  },

  // ── 世界起源：力量体系 / 神明信仰 ──
  {
    domain: 'origin', builtInKey: 'originPower', name: '力量层级', icon: '⚡',
    fields: [
      { key: 'rank', label: '等级/层级', labelKey: 'fs.originPower.rank', type: 'text' },
      { key: 'mark', label: '核心标志', labelKey: 'fs.originPower.mark', type: 'longtext' },
      { key: 'condition', label: '晋升条件', labelKey: 'fs.originPower.condition', type: 'longtext' },
    ],
  },
  {
    domain: 'origin', builtInKey: 'originDeity', name: '神明信仰', icon: '🌟',
    fields: [
      { key: 'type', label: '类型', labelKey: 'fs.originDeity.type', type: 'select', options: ['主神', '次神', '半神', '国教', '民间信仰', '邪神', '其他'], optionKeys: ['fso.deityType.0', 'fso.deityType.1', 'fso.deityType.2', 'fso.deityType.3', 'fso.deityType.4', 'fso.deityType.5', 'fso.deityType.6'] },
      { key: 'title', label: '名号/职司', labelKey: 'fs.originDeity.title', type: 'text' },
      { key: 'rule', label: '规则/禁忌', labelKey: 'fs.originDeity.rule', type: 'longtext' },
    ],
  },
]
