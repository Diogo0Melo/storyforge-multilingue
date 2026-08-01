import type { RagDocumentMetadata } from './rag-library'
import type { PanelsKeys } from '../../i18n/generated-resources'

/**
 * Phase 35-a — 词条系统（Codex）数据模型
 *
 * 设计见 docs/CODEX-REDESIGN.md 第三章。
 * 用「通用词条表 + 分类树 + 字段 schema」承载自然物产/人工器物/种族/势力/城池等可枚举实体，
 * 取代分散的自由文本字段；天然支持用户自定义分类与字段。
 */

/** 词条所属领域 */
export type CodexDomain = 'natural' | 'humanity' | 'origin'

export const CODEX_DOMAIN_LABELS: Record<CodexDomain, string> = {
  natural: '自然环境',
  humanity: '人文环境',
  origin: '世界起源',
}

export const CODEX_DOMAIN_LABEL_KEYS = {
  natural: 'codex.domain.natural',
  humanity: 'codex.domain.humanity',
  origin: 'codex.domain.origin',
} as const satisfies Record<CodexDomain, PanelsKeys>

/** 字段类型 */
export type CodexFieldType = 'text' | 'longtext' | 'select' | 'number' | 'ref'

/** 字段定义（驱动词条详情表单的渲染） */
export interface CodexFieldDef {
  /** 内部键 */
  key: string
  /** 显示名（外观/品级/功效…） */
  label: string
  /** i18n key for UI label */
  labelKey?: string
  type: CodexFieldType
  /** select 选项 */
  options?: string[]
  /** i18n keys for select options (parallel to options[]) */
  optionKeys?: string[]
  /** ref 字段：建议指向哪类词条的 builtInKey（软提示，选择器仍可跨类） */
  refCategory?: string
  /** ref 字段是否允许多选（默认 true） */
  refMulti?: boolean
  required?: boolean
  /** 占位/说明 */
  placeholder?: string
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
 * - `target === number`：多世界数据，只读取该世界的词条；null 不是"全局词条"。
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
  name: string        // persisted to DB — do NOT change
  nameKey?: string    // i18n key for UI display
  icon: string
  fields: CodexFieldDef[]
}

const PIN_JI_OPTIONS = ['凡品', '下品', '中品', '上品', '极品', '神品']

export const BUILTIN_CATEGORIES: BuiltInCategorySeed[] = [
  // ── 自然环境 ──
  {
    domain: 'natural', builtInKey: 'mineral', name: '矿物灵材', nameKey: 'codex.builtIn.mineral', icon: '⛏️',
    fields: [
      { key: 'appearance', label: '外观', labelKey: 'codex.field.mineral.appearance', type: 'longtext', placeholder: '形状 / 颜色 / 质感' },
      { key: 'rank', label: '品级品阶', labelKey: 'codex.field.mineral.rank', type: 'select', options: PIN_JI_OPTIONS, optionKeys: ['codex.field.mineral.rank.option.0', 'codex.field.mineral.rank.option.1', 'codex.field.mineral.rank.option.2', 'codex.field.mineral.rank.option.3', 'codex.field.mineral.rank.option.4', 'codex.field.mineral.rank.option.5'] },
      { key: 'effect', label: '功效作用', labelKey: 'codex.field.mineral.effect', type: 'longtext' },
      { key: 'origin', label: '产地分布', labelKey: 'codex.field.mineral.origin', type: 'text' },
      { key: 'rarity', label: '稀有度', labelKey: 'codex.field.mineral.rarity', type: 'select', options: ['常见', '稀少', '罕见', '珍稀', '绝世'], optionKeys: ['codex.field.mineral.rarity.option.0', 'codex.field.mineral.rarity.option.1', 'codex.field.mineral.rarity.option.2', 'codex.field.mineral.rarity.option.3', 'codex.field.mineral.rarity.option.4'] },
      { key: 'craftInto', label: '可炼器物', labelKey: 'codex.field.mineral.craftInto', type: 'ref', refCategory: 'artifact', refMulti: true },
    ],
  },
  {
    domain: 'natural', builtInKey: 'herb', name: '灵植草药', nameKey: 'codex.builtIn.herb', icon: '🌿',
    fields: [
      { key: 'form', label: '形态', labelKey: 'codex.field.herb.form', type: 'longtext' },
      { key: 'effect', label: '药效', labelKey: 'codex.field.herb.effect', type: 'longtext' },
      { key: 'rank', label: '品级', labelKey: 'codex.field.herb.rank', type: 'select', options: PIN_JI_OPTIONS, optionKeys: ['codex.field.herb.rank.option.0', 'codex.field.herb.rank.option.1', 'codex.field.herb.rank.option.2', 'codex.field.herb.rank.option.3', 'codex.field.herb.rank.option.4', 'codex.field.herb.rank.option.5'] },
      { key: 'habitat', label: '生长环境', labelKey: 'codex.field.herb.habitat', type: 'text' },
      { key: 'maturity', label: '成熟周期', labelKey: 'codex.field.herb.maturity', type: 'text' },
      { key: 'difficulty', label: '采集难度', labelKey: 'codex.field.herb.difficulty', type: 'select', options: ['容易', '一般', '困难', '极难'], optionKeys: ['codex.field.herb.difficulty.option.0', 'codex.field.herb.difficulty.option.1', 'codex.field.herb.difficulty.option.2', 'codex.field.herb.difficulty.option.3'] },
      { key: 'craftInto', label: '可炼丹药', labelKey: 'codex.field.herb.craftInto', type: 'ref', refCategory: 'artifact', refMulti: true },
    ],
  },
  {
    domain: 'natural', builtInKey: 'beast', name: '灵兽异兽', nameKey: 'codex.builtIn.beast', icon: '🐅',
    fields: [
      { key: 'kind', label: '类别', labelKey: 'codex.field.beast.kind', type: 'select', options: ['走兽', '飞禽', '水族', '虫豸', '异种'], optionKeys: ['codex.field.beast.kind.option.0', 'codex.field.beast.kind.option.1', 'codex.field.beast.kind.option.2', 'codex.field.beast.kind.option.3', 'codex.field.beast.kind.option.4'] },
      // WORLD-1 已有结构化关联；保留这两个旧文本字段承载老项目无法自动推断的数据。
      { key: 'cultivation', label: '修炼体系（旧文本备注）', labelKey: 'codex.field.beast.cultivation', type: 'text', placeholder: '旧数据兼容；新数据请使用上方结构化关联' },
      { key: 'realm', label: '境界（旧文本备注）', labelKey: 'codex.field.beast.realm', type: 'text' },
      { key: 'body', label: '体型外貌', labelKey: 'codex.field.beast.body', type: 'longtext' },
      { key: 'habit', label: '习性性情', labelKey: 'codex.field.beast.habit', type: 'longtext' },
      { key: 'habitat', label: '栖息地', labelKey: 'codex.field.beast.habitat', type: 'text' },
      { key: 'threat', label: '威胁等级', labelKey: 'codex.field.beast.threat', type: 'select', options: ['无害', '低危', '中危', '高危', '毁灭级'], optionKeys: ['codex.field.beast.threat.option.0', 'codex.field.beast.threat.option.1', 'codex.field.beast.threat.option.2', 'codex.field.beast.threat.option.3', 'codex.field.beast.threat.option.4'] },
      { key: 'ability', label: '特殊能力', labelKey: 'codex.field.beast.ability', type: 'longtext' },
      { key: 'drops', label: '可产出材料', labelKey: 'codex.field.beast.drops', type: 'ref', refCategory: 'artifact', refMulti: true },
    ],
  },
  // ── 人文环境 ──
  {
    domain: 'humanity', builtInKey: 'race', name: '种族民族', nameKey: 'codex.builtIn.race', icon: '🧬',
    fields: [
      { key: 'appearance', label: '外貌特征', labelKey: 'codex.field.race.appearance', type: 'longtext' },
      { key: 'talent', label: '种族天赋', labelKey: 'codex.field.race.talent', type: 'longtext' },
      { key: 'lifespan', label: '平均寿命', labelKey: 'codex.field.race.lifespan', type: 'text' },
      { key: 'population', label: '人口规模', labelKey: 'codex.field.race.population', type: 'text' },
      { key: 'settlement', label: '聚居地', labelKey: 'codex.field.race.settlement', type: 'text' },
      { key: 'custom', label: '文化习俗', labelKey: 'codex.field.race.custom', type: 'longtext' },
      { key: 'faith', label: '信仰', labelKey: 'codex.field.race.faith', type: 'text' },
      { key: 'relations', label: '与其他种族关系', labelKey: 'codex.field.race.relations', type: 'longtext' },
      { key: 'representatives', label: '代表人物', labelKey: 'codex.field.race.representatives', type: 'text' },
    ],
  },
  {
    domain: 'humanity', builtInKey: 'faction', name: '势力', nameKey: 'codex.builtIn.faction', icon: '⚔️',
    fields: [
      { key: 'type', label: '类型', labelKey: 'codex.field.faction.type', type: 'select', options: ['门派', '朝廷', '商会', '部落', '教派', '世家', '其他'], optionKeys: ['codex.field.faction.type.option.0', 'codex.field.faction.type.option.1', 'codex.field.faction.type.option.2', 'codex.field.faction.type.option.3', 'codex.field.faction.type.option.4', 'codex.field.faction.type.option.5', 'codex.field.faction.type.option.6'] },
      { key: 'territory', label: '势力范围', labelKey: 'codex.field.faction.territory', type: 'text' },
      { key: 'leader', label: '领导者', labelKey: 'codex.field.faction.leader', type: 'text' },
      { key: 'coreMembers', label: '核心成员', labelKey: 'codex.field.faction.coreMembers', type: 'longtext' },
      { key: 'power', label: '实力等级', labelKey: 'codex.field.faction.power', type: 'text' },
      { key: 'goal', label: '宗旨目标', labelKey: 'codex.field.faction.goal', type: 'longtext' },
      { key: 'relations', label: '敌友关系', labelKey: 'codex.field.faction.relations', type: 'longtext' },
      { key: 'banner', label: '标志旗帜', labelKey: 'codex.field.faction.banner', type: 'text' },
      { key: 'mapRegion', label: '绑定地图区域', labelKey: 'codex.field.faction.mapRegion', type: 'text' },
      { key: 'color', label: '颜色', labelKey: 'codex.field.faction.color', type: 'text', placeholder: '如 #C17D5E' },
    ],
  },
  {
    domain: 'humanity', builtInKey: 'city', name: '城池重镇', nameKey: 'codex.builtIn.city', icon: '🏰',
    fields: [
      { key: 'faction', label: '所属势力', labelKey: 'codex.field.city.faction', type: 'ref', refCategory: 'faction', refMulti: false },
      { key: 'locationNote', label: '位置备注（旧文本）', labelKey: 'codex.field.city.locationNote', type: 'text', placeholder: '结构化位置请使用上方「重要地点」关联' },
      { key: 'scale', label: '规模人口', labelKey: 'codex.field.city.scale', type: 'text' },
      { key: 'ruler', label: '统治者', labelKey: 'codex.field.city.ruler', type: 'text' },
      { key: 'economy', label: '经济特产', labelKey: 'codex.field.city.economy', type: 'longtext' },
      { key: 'strategic', label: '战略地位', labelKey: 'codex.field.city.strategic', type: 'longtext' },
      { key: 'style', label: '城市风貌', labelKey: 'codex.field.city.style', type: 'longtext' },
      { key: 'landmark', label: '地标建筑', labelKey: 'codex.field.city.landmark', type: 'text' },
    ],
  },
  {
    domain: 'humanity', builtInKey: 'artifact', name: '人工器物', nameKey: 'codex.builtIn.artifact', icon: '🗡️',
    fields: [
      { key: 'type', label: '类别', labelKey: 'codex.field.artifact.type', type: 'select', options: ['武器', '防具', '法器', '丹药', '功法秘籍', '阵法', '材料', '其他'], optionKeys: ['codex.field.artifact.type.option.0', 'codex.field.artifact.type.option.1', 'codex.field.artifact.type.option.2', 'codex.field.artifact.type.option.3', 'codex.field.artifact.type.option.4', 'codex.field.artifact.type.option.5', 'codex.field.artifact.type.option.6', 'codex.field.artifact.type.option.7'] },
      { key: 'rank', label: '品级品阶', labelKey: 'codex.field.artifact.rank', type: 'select', options: PIN_JI_OPTIONS, optionKeys: ['codex.field.artifact.rank.option.0', 'codex.field.artifact.rank.option.1', 'codex.field.artifact.rank.option.2', 'codex.field.artifact.rank.option.3', 'codex.field.artifact.rank.option.4', 'codex.field.artifact.rank.option.5'] },
      { key: 'appearance', label: '外观', labelKey: 'codex.field.artifact.appearance', type: 'longtext' },
      { key: 'effect', label: '能力效果', labelKey: 'codex.field.artifact.effect', type: 'longtext' },
      { key: 'craft', label: '炼制方式', labelKey: 'codex.field.artifact.craft', type: 'longtext' },
      { key: 'materials', label: '所需材料', labelKey: 'codex.field.artifact.materials', type: 'ref', refCategory: 'mineral', refMulti: true },
      { key: 'origin', label: '来历', labelKey: 'codex.field.artifact.origin', type: 'longtext' },
      { key: 'owner', label: '当前持有者', labelKey: 'codex.field.artifact.owner', type: 'text' },
    ],
  },

  // ── 自然环境各方面（全貌写在面板字段,这里逐条细化具体词条） ──
  {
    domain: 'natural', builtInKey: 'natStructure', name: '世界结构', nameKey: 'codex.builtIn.natStructure', icon: '🌐',
    fields: [
      { key: 'type', label: '层级类型', labelKey: 'codex.field.natStructure.type', type: 'text', placeholder: '如 星球 / 大陆 / 位面 / 平行空间' },
      { key: 'scope', label: '范围', labelKey: 'codex.field.natStructure.scope', type: 'text' },
      { key: 'feature', label: '特征说明', labelKey: 'codex.field.natStructure.feature', type: 'longtext' },
    ],
  },
  {
    domain: 'natural', builtInKey: 'natDimension', name: '疆域版图', nameKey: 'codex.builtIn.natDimension', icon: '📐',
    fields: [
      { key: 'scale', label: '尺度范围', labelKey: 'codex.field.natDimension.scale', type: 'text' },
      { key: 'feature', label: '区域特征', labelKey: 'codex.field.natDimension.feature', type: 'longtext' },
    ],
  },
  {
    domain: 'natural', builtInKey: 'natTerrain', name: '地貌', nameKey: 'codex.builtIn.natTerrain', icon: '🗺️',
    fields: [
      { key: 'type', label: '类型', labelKey: 'codex.field.natTerrain.type', type: 'select', options: ['大陆', '山脉', '高原', '平原', '盆地', '丘陵', '峡谷', '沙漠', '森林', '其他'], optionKeys: ['codex.field.natTerrain.type.option.0', 'codex.field.natTerrain.type.option.1', 'codex.field.natTerrain.type.option.2', 'codex.field.natTerrain.type.option.3', 'codex.field.natTerrain.type.option.4', 'codex.field.natTerrain.type.option.5', 'codex.field.natTerrain.type.option.6', 'codex.field.natTerrain.type.option.7', 'codex.field.natTerrain.type.option.8', 'codex.field.natTerrain.type.option.9'] },
      { key: 'location', label: '位置', labelKey: 'codex.field.natTerrain.location', type: 'text' },
      { key: 'feature', label: '地形特征', labelKey: 'codex.field.natTerrain.feature', type: 'longtext' },
    ],
  },
  {
    domain: 'natural', builtInKey: 'natWater', name: '山川水系', nameKey: 'codex.builtIn.natWater', icon: '⛰️',
    fields: [
      { key: 'type', label: '类型', labelKey: 'codex.field.natWater.type', type: 'select', options: ['山脉', '山峰', '河流', '湖泊', '海洋', '运河', '瀑布', '其他'], optionKeys: ['codex.field.natWater.type.option.0', 'codex.field.natWater.type.option.1', 'codex.field.natWater.type.option.2', 'codex.field.natWater.type.option.3', 'codex.field.natWater.type.option.4', 'codex.field.natWater.type.option.5', 'codex.field.natWater.type.option.6', 'codex.field.natWater.type.option.7'] },
      { key: 'scale', label: '规模', labelKey: 'codex.field.natWater.scale', type: 'text' },
      { key: 'feature', label: '特征', labelKey: 'codex.field.natWater.feature', type: 'longtext' },
    ],
  },
  {
    domain: 'natural', builtInKey: 'natClimate', name: '气候带', nameKey: 'codex.builtIn.natClimate', icon: '🌦️',
    fields: [
      { key: 'region', label: '所在区域', labelKey: 'codex.field.natClimate.region', type: 'text' },
      { key: 'type', label: '气候类型', labelKey: 'codex.field.natClimate.type', type: 'text', placeholder: '如 温带 / 苦寒 / 湿热' },
      { key: 'hazard', label: '季节/自然灾害', labelKey: 'codex.field.natClimate.hazard', type: 'longtext' },
    ],
  },

  // ── 人文环境各方面 ──
  {
    domain: 'humanity', builtInKey: 'humEra', name: '历史时代', nameKey: 'codex.builtIn.humEra', icon: '📜',
    fields: [
      { key: 'period', label: '时间/纪年', labelKey: 'codex.field.humEra.period', type: 'text' },
      { key: 'feature', label: '时代特征/大事', labelKey: 'codex.field.humEra.feature', type: 'longtext' },
    ],
  },
  {
    domain: 'humanity', builtInKey: 'humEvent', name: '重大事件', nameKey: 'codex.builtIn.humEvent', icon: '📅',
    fields: [
      { key: 'type', label: '类型', labelKey: 'codex.field.humEvent.type', type: 'select', options: ['战争', '王朝兴替', '灾劫', '变法', '发现', '其他'], optionKeys: ['codex.field.humEvent.type.option.0', 'codex.field.humEvent.type.option.1', 'codex.field.humEvent.type.option.2', 'codex.field.humEvent.type.option.3', 'codex.field.humEvent.type.option.4', 'codex.field.humEvent.type.option.5'] },
      { key: 'time', label: '发生时间', labelKey: 'codex.field.humEvent.time', type: 'text' },
      { key: 'impact', label: '影响', labelKey: 'codex.field.humEvent.impact', type: 'longtext' },
    ],
  },
  {
    domain: 'humanity', builtInKey: 'humSociety', name: '政经文化', nameKey: 'codex.builtIn.humSociety', icon: '🏛️',
    fields: [
      { key: 'type', label: '类别', labelKey: 'codex.field.humSociety.type', type: 'select', options: ['政体', '货币', '赋税', '阶层制度', '宗教信仰', '风俗节庆', '其他'], optionKeys: ['codex.field.humSociety.type.option.0', 'codex.field.humSociety.type.option.1', 'codex.field.humSociety.type.option.2', 'codex.field.humSociety.type.option.3', 'codex.field.humSociety.type.option.4', 'codex.field.humSociety.type.option.5', 'codex.field.humSociety.type.option.6'] },
      { key: 'detail', label: '说明', labelKey: 'codex.field.humSociety.detail', type: 'longtext' },
    ],
  },
  {
    domain: 'humanity', builtInKey: 'humPolitics', name: '政治制度', nameKey: 'codex.builtIn.humPolitics', icon: '🏛️',
    fields: [
      { key: 'type', label: '制度类型', labelKey: 'codex.field.humPolitics.type', type: 'select', options: ['政体', '官制', '法律', '军事', '外交', '阶层', '其他'], optionKeys: ['codex.field.humPolitics.type.option.0', 'codex.field.humPolitics.type.option.1', 'codex.field.humPolitics.type.option.2', 'codex.field.humPolitics.type.option.3', 'codex.field.humPolitics.type.option.4', 'codex.field.humPolitics.type.option.5', 'codex.field.humPolitics.type.option.6'] },
      { key: 'scope', label: '适用范围', labelKey: 'codex.field.humPolitics.scope', type: 'text' },
      { key: 'authority', label: '权力主体', labelKey: 'codex.field.humPolitics.authority', type: 'text' },
      { key: 'detail', label: '制度说明', labelKey: 'codex.field.humPolitics.detail', type: 'longtext' },
    ],
  },
  {
    domain: 'humanity', builtInKey: 'humEconomy', name: '经济制度', nameKey: 'codex.builtIn.humEconomy', icon: '💰',
    fields: [
      { key: 'type', label: '制度类型', labelKey: 'codex.field.humEconomy.type', type: 'select', options: ['货币', '税赋', '贸易', '产业', '资源分配', '金融', '其他'], optionKeys: ['codex.field.humEconomy.type.option.0', 'codex.field.humEconomy.type.option.1', 'codex.field.humEconomy.type.option.2', 'codex.field.humEconomy.type.option.3', 'codex.field.humEconomy.type.option.4', 'codex.field.humEconomy.type.option.5', 'codex.field.humEconomy.type.option.6'] },
      { key: 'scope', label: '流通范围', labelKey: 'codex.field.humEconomy.scope', type: 'text' },
      { key: 'actors', label: '主要参与者', labelKey: 'codex.field.humEconomy.actors', type: 'text' },
      { key: 'detail', label: '制度说明', labelKey: 'codex.field.humEconomy.detail', type: 'longtext' },
    ],
  },
  {
    domain: 'humanity', builtInKey: 'humCulture', name: '文化制度', nameKey: 'codex.builtIn.humCulture', icon: '🎭',
    fields: [
      { key: 'type', label: '文化类型', labelKey: 'codex.field.humCulture.type', type: 'select', options: ['语言', '宗教', '教育', '礼仪', '节庆', '艺术', '习俗', '其他'], optionKeys: ['codex.field.humCulture.type.option.0', 'codex.field.humCulture.type.option.1', 'codex.field.humCulture.type.option.2', 'codex.field.humCulture.type.option.3', 'codex.field.humCulture.type.option.4', 'codex.field.humCulture.type.option.5', 'codex.field.humCulture.type.option.6', 'codex.field.humCulture.type.option.7'] },
      { key: 'region', label: '流行区域/群体', labelKey: 'codex.field.humCulture.region', type: 'text' },
      { key: 'taboo', label: '禁忌', labelKey: 'codex.field.humCulture.taboo', type: 'text' },
      { key: 'detail', label: '文化说明', labelKey: 'codex.field.humCulture.detail', type: 'longtext' },
    ],
  },
  {
    domain: 'humanity', builtInKey: 'humConflict', name: '矛盾冲突', nameKey: 'codex.builtIn.humConflict', icon: '🔥',
    fields: [
      { key: 'type', label: '类型', labelKey: 'codex.field.humConflict.type', type: 'text', placeholder: '如 阶级 / 种族 / 信仰 / 资源' },
      { key: 'sides', label: '对立方', labelKey: 'codex.field.humConflict.sides', type: 'text' },
      { key: 'tension', label: '张力/根源', labelKey: 'codex.field.humConflict.tension', type: 'longtext' },
    ],
  },

  // ── 世界起源：力量体系 / 神明信仰 ──
  {
    domain: 'origin', builtInKey: 'originPower', name: '力量层级', nameKey: 'codex.builtIn.originPower', icon: '⚡',
    fields: [
      { key: 'rank', label: '等级/层级', labelKey: 'codex.field.originPower.rank', type: 'text' },
      { key: 'mark', label: '核心标志', labelKey: 'codex.field.originPower.mark', type: 'longtext' },
      { key: 'condition', label: '晋升条件', labelKey: 'codex.field.originPower.condition', type: 'longtext' },
    ],
  },
  {
    domain: 'origin', builtInKey: 'originDeity', name: '神明信仰', nameKey: 'codex.builtIn.originDeity', icon: '🌟',
    fields: [
      { key: 'type', label: '类型', labelKey: 'codex.field.originDeity.type', type: 'select', options: ['主神', '次神', '半神', '国教', '民间信仰', '邪神', '其他'], optionKeys: ['codex.field.originDeity.type.option.0', 'codex.field.originDeity.type.option.1', 'codex.field.originDeity.type.option.2', 'codex.field.originDeity.type.option.3', 'codex.field.originDeity.type.option.4', 'codex.field.originDeity.type.option.5', 'codex.field.originDeity.type.option.6'] },
      { key: 'title', label: '名号/职司', labelKey: 'codex.field.originDeity.title', type: 'text' },
      { key: 'rule', label: '规则/禁忌', labelKey: 'codex.field.originDeity.rule', type: 'longtext' },
    ],
  },
]

/** 通用字段标签（所有词条共有，固定在表单顶部，不进 fieldSchema） */
export const CODEX_COMMON_LABELS = {
  name: '名称',
  icon: '图标',
  summary: '一句话简介',
  description: '详细描述',
}

export const CODEX_COMMON_LABEL_KEYS = {
  name: 'codex.common.name',
  icon: 'codex.common.icon',
  summary: 'codex.common.summary',
  description: 'codex.common.description',
} as const
