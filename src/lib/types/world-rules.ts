/**
 * Phase 32 — 真实与幻想（世界规则体系）
 *
 * 三级树结构：L1 大类 → L2 子类 → L3 提示标签
 * 每个节点（L1/L2）可独立设置「📜取自真实 / ✨架空改造 / ⚖️冲突优先」
 * L3 仅作为编辑区的灰色提示，不单独存数据
 */

// ── 冲突优先级 ──────────────────────────────────────────────

export type ConflictPriority = 'historical' | 'fictional' | 'balanced'

export const CONFLICT_PRIORITY_LABELS: Record<ConflictPriority, string> = {
  historical: '史实优先',
  balanced: '均衡',
  fictional: '架空优先',
}

/** i18n keys for conflict priority labels (UI only; manifest keeps zh labels). */
export const CONFLICT_PRIORITY_KEYS: Record<ConflictPriority, string> = {
  historical: 'worldview:worldRules.conflictPriority.historical',
  balanced: 'worldview:worldRules.conflictPriority.balanced',
  fictional: 'worldview:worldRules.conflictPriority.fictional',
}

// ── 树节点定义（预定义 + 用户自定义） ──────────────────────────

/** 预定义树节点 */
export interface WorldRuleNodeDef {
  /** 点分 ID，如 'politics', 'politics.central' */
  id: string
  /** 中文标签（AI manifest uses this verbatim） */
  label: string
  /** i18n key for UI label (e.g. 'worldview:worldRules.tree.era.label') */
  labelKey?: string
  /** emoji 图标 */
  icon: string
  /** L3 提示标签（仅 L2 节点有；AI manifest uses these verbatim） */
  hints?: string[]
  /** i18n keys for hint labels (UI only) */
  hintKeys?: string[]
  /** 子节点（L1 → L2） */
  children?: WorldRuleNodeDef[]
}

/** 用户自定义节点 */
export interface CustomWorldRuleNode {
  /** 唯一 ID，如 'custom_1694000000000' */
  id: string
  /** 父节点 ID，null = L1 顶级 */
  parentId: string | null
  /** 中文标签 */
  label: string
  /** emoji 图标（可选） */
  icon?: string
  /** L3 提示标签 */
  hints?: string[]
}

// ── 用户填写的节点数据 ────────────────────────────────────────

/** 单节点的用户设定数据 */
export interface WorldRuleEntry {
  /** 📜 取自真实 */
  historicalAnchors: string
  /** ✨ 架空改造 */
  fictionalAdaptations: string
  /** ⚖️ 冲突时优先 */
  priority: ConflictPriority
}

// ── 项目世界规则 Profile（projectId + worldGroupId） ─────────────

export interface WorldRulesProfile {
  id?: number
  projectId: number
  /** 所属世界组；null = 单世界/默认主世界 */
  worldGroupId?: number | null
  /** 节点数据，key = nodeId（预定义或自定义），只存非空节点 */
  entries: Record<string, WorldRuleEntry>
  /** 用户自定义节点列表 */
  customNodes: CustomWorldRuleNode[]
  /** 全局补充说明（对 AI 的额外约束） */
  globalNote?: string
  createdAt: number
  updatedAt: number
}

export type CreateWorldRulesInput = Omit<WorldRulesProfile, 'id' | 'createdAt' | 'updatedAt'>

// ── 预定义三级树 ──────────────────────────────────────────────

export const WORLD_RULE_TREE: WorldRuleNodeDef[] = [
  {
    id: 'era', label: '时代背景', labelKey: 'worldview:worldRules.tree.era.label', icon: '🕰️',
    children: [
      { id: 'era.period', label: '历史时期', labelKey: 'worldview:worldRules.tree.era.period.label', icon: '📜', hints: ['朝代', '纪年', '年号'], hintKeys: ['worldview:worldRules.tree.era.period.hint.0', 'worldview:worldRules.tree.era.period.hint.1', 'worldview:worldRules.tree.era.period.hint.2'] },
      { id: 'era.divergence', label: '架空起点', labelKey: 'worldview:worldRules.tree.era.divergence.label', icon: '🦋', hints: ['蝴蝶效应边界', '分岔点', '架空程度'], hintKeys: ['worldview:worldRules.tree.era.divergence.hint.0', 'worldview:worldRules.tree.era.divergence.hint.1', 'worldview:worldRules.tree.era.divergence.hint.2'] },
      { id: 'era.calendar', label: '历法时间', labelKey: 'worldview:worldRules.tree.era.calendar.label', icon: '📅', hints: ['历法', '节气', '时辰'], hintKeys: ['worldview:worldRules.tree.era.calendar.hint.0', 'worldview:worldRules.tree.era.calendar.hint.1', 'worldview:worldRules.tree.era.calendar.hint.2'] },
    ],
  },
  {
    id: 'events', label: '重大事件', labelKey: 'worldview:worldRules.tree.events.label', icon: '⚡',
    hints: ['与历史年表联动', '📜史实事件自动成为锚点', '✨虚构事件为作者规划'],
    hintKeys: ['worldview:worldRules.tree.events.hint.0', 'worldview:worldRules.tree.events.hint.1', 'worldview:worldRules.tree.events.hint.2'],
    children: [],
  },
  {
    id: 'geography', label: '地理疆域', labelKey: 'worldview:worldRules.tree.geography.label', icon: '🗺️',
    children: [
      { id: 'geography.admin', label: '行政区划', labelKey: 'worldview:worldRules.tree.geography.admin.label', icon: '📐', hints: ['省/府/州/县', '边疆与内地'], hintKeys: ['worldview:worldRules.tree.geography.admin.hint.0', 'worldview:worldRules.tree.geography.admin.hint.1'] },
      { id: 'geography.terrain', label: '地形地貌', labelKey: 'worldview:worldRules.tree.geography.terrain.label', icon: '⛰️', hints: ['山脉', '平原', '盆地', '沙漠', '高原'], hintKeys: ['worldview:worldRules.tree.geography.terrain.hint.0', 'worldview:worldRules.tree.geography.terrain.hint.1', 'worldview:worldRules.tree.geography.terrain.hint.2', 'worldview:worldRules.tree.geography.terrain.hint.3', 'worldview:worldRules.tree.geography.terrain.hint.4'] },
      { id: 'geography.cities', label: '城市重镇', labelKey: 'worldview:worldRules.tree.geography.cities.label', icon: '🏰', hints: ['都城布局', '军事要塞', '商业都会', '城墙城门'], hintKeys: ['worldview:worldRules.tree.geography.cities.hint.0', 'worldview:worldRules.tree.geography.cities.hint.1', 'worldview:worldRules.tree.geography.cities.hint.2', 'worldview:worldRules.tree.geography.cities.hint.3'] },
      { id: 'geography.water', label: '水系', labelKey: 'worldview:worldRules.tree.geography.water.label', icon: '🌊', hints: ['河流', '湖泊', '运河', '漕运路线', '水利工程'], hintKeys: ['worldview:worldRules.tree.geography.water.hint.0', 'worldview:worldRules.tree.geography.water.hint.1', 'worldview:worldRules.tree.geography.water.hint.2', 'worldview:worldRules.tree.geography.water.hint.3', 'worldview:worldRules.tree.geography.water.hint.4'] },
      { id: 'geography.roads', label: '道路交通', labelKey: 'worldview:worldRules.tree.geography.roads.label', icon: '🛤️', hints: ['官道', '驿站', '栈道', '关隘', '海路'], hintKeys: ['worldview:worldRules.tree.geography.roads.hint.0', 'worldview:worldRules.tree.geography.roads.hint.1', 'worldview:worldRules.tree.geography.roads.hint.2', 'worldview:worldRules.tree.geography.roads.hint.3', 'worldview:worldRules.tree.geography.roads.hint.4'] },
    ],
  },
  {
    id: 'climate', label: '气候环境', labelKey: 'worldview:worldRules.tree.climate.label', icon: '🌦️',
    children: [
      { id: 'climate.weather', label: '气候特征', labelKey: 'worldview:worldRules.tree.climate.weather.label', icon: '☀️', hints: ['季节', '温度', '降水'], hintKeys: ['worldview:worldRules.tree.climate.weather.hint.0', 'worldview:worldRules.tree.climate.weather.hint.1', 'worldview:worldRules.tree.climate.weather.hint.2'] },
      { id: 'climate.disaster', label: '自然灾害', labelKey: 'worldview:worldRules.tree.climate.disaster.label', icon: '🌪️', hints: ['旱涝', '地震', '瘟疫', '蝗灾'], hintKeys: ['worldview:worldRules.tree.climate.disaster.hint.0', 'worldview:worldRules.tree.climate.disaster.hint.1', 'worldview:worldRules.tree.climate.disaster.hint.2', 'worldview:worldRules.tree.climate.disaster.hint.3'] },
      { id: 'climate.ecology', label: '生态物种', labelKey: 'worldview:worldRules.tree.climate.ecology.label', icon: '🌿', hints: ['动物', '植物', '特殊物产'], hintKeys: ['worldview:worldRules.tree.climate.ecology.hint.0', 'worldview:worldRules.tree.climate.ecology.hint.1', 'worldview:worldRules.tree.climate.ecology.hint.2'] },
    ],
  },
  {
    id: 'politics', label: '政治制度', labelKey: 'worldview:worldRules.tree.politics.label', icon: '🏛️',
    children: [
      { id: 'politics.system', label: '政体形态', labelKey: 'worldview:worldRules.tree.politics.system.label', icon: '👑', hints: ['君主制/共和', '集权程度', '分权制衡'], hintKeys: ['worldview:worldRules.tree.politics.system.hint.0', 'worldview:worldRules.tree.politics.system.hint.1', 'worldview:worldRules.tree.politics.system.hint.2'] },
      { id: 'politics.central', label: '中央官制', labelKey: 'worldview:worldRules.tree.politics.central.label', icon: '📋', hints: ['宰辅', '部院', '寺监', '内阁/军机'], hintKeys: ['worldview:worldRules.tree.politics.central.hint.0', 'worldview:worldRules.tree.politics.central.hint.1', 'worldview:worldRules.tree.politics.central.hint.2', 'worldview:worldRules.tree.politics.central.hint.3'] },
      { id: 'politics.local', label: '地方官制', labelKey: 'worldview:worldRules.tree.politics.local.label', icon: '🏠', hints: ['州牧/刺史/知府', '藩镇', '地方自治'], hintKeys: ['worldview:worldRules.tree.politics.local.hint.0', 'worldview:worldRules.tree.politics.local.hint.1', 'worldview:worldRules.tree.politics.local.hint.2'] },
      { id: 'politics.selection', label: '选官制度', labelKey: 'worldview:worldRules.tree.politics.selection.label', icon: '🎓', hints: ['科举', '荐举', '九品中正', '世袭'], hintKeys: ['worldview:worldRules.tree.politics.selection.hint.0', 'worldview:worldRules.tree.politics.selection.hint.1', 'worldview:worldRules.tree.politics.selection.hint.2', 'worldview:worldRules.tree.politics.selection.hint.3'] },
      { id: 'politics.nobility', label: '爵位封号', labelKey: 'worldview:worldRules.tree.politics.nobility.label', icon: '🎖️', hints: ['公侯伯子男', '封国', '食邑'], hintKeys: ['worldview:worldRules.tree.politics.nobility.hint.0', 'worldview:worldRules.tree.politics.nobility.hint.1', 'worldview:worldRules.tree.politics.nobility.hint.2'] },
      { id: 'politics.law', label: '法律刑罚', labelKey: 'worldview:worldRules.tree.politics.law.label', icon: '⚖️', hints: ['律令格式', '刑罚种类', '审判流程', '监狱'], hintKeys: ['worldview:worldRules.tree.politics.law.hint.0', 'worldview:worldRules.tree.politics.law.hint.1', 'worldview:worldRules.tree.politics.law.hint.2', 'worldview:worldRules.tree.politics.law.hint.3'] },
      { id: 'politics.diplomacy', label: '外交', labelKey: 'worldview:worldRules.tree.politics.diplomacy.label', icon: '🤝', hints: ['朝贡', '邦交', '和亲', '质子', '国书'], hintKeys: ['worldview:worldRules.tree.politics.diplomacy.hint.0', 'worldview:worldRules.tree.politics.diplomacy.hint.1', 'worldview:worldRules.tree.politics.diplomacy.hint.2', 'worldview:worldRules.tree.politics.diplomacy.hint.3', 'worldview:worldRules.tree.politics.diplomacy.hint.4'] },
    ],
  },
  {
    id: 'military', label: '军事', labelKey: 'worldview:worldRules.tree.military.label', icon: '⚔️',
    children: [
      { id: 'military.organization', label: '军制编制', labelKey: 'worldview:worldRules.tree.military.organization.label', icon: '🪖', hints: ['兵种', '军衔', '编制单位', '府兵/募兵'], hintKeys: ['worldview:worldRules.tree.military.organization.hint.0', 'worldview:worldRules.tree.military.organization.hint.1', 'worldview:worldRules.tree.military.organization.hint.2', 'worldview:worldRules.tree.military.organization.hint.3'] },
      { id: 'military.weapons', label: '武器装备', labelKey: 'worldview:worldRules.tree.military.weapons.label', icon: '🗡️', hints: ['兵器', '铠甲', '攻城器械'], hintKeys: ['worldview:worldRules.tree.military.weapons.hint.0', 'worldview:worldRules.tree.military.weapons.hint.1', 'worldview:worldRules.tree.military.weapons.hint.2'] },
      { id: 'military.tactics', label: '战术战法', labelKey: 'worldview:worldRules.tree.military.tactics.label', icon: '🗺️', hints: ['阵法', '骑兵/步兵/水师', '攻城/守城'], hintKeys: ['worldview:worldRules.tree.military.tactics.hint.0', 'worldview:worldRules.tree.military.tactics.hint.1', 'worldview:worldRules.tree.military.tactics.hint.2'] },
      { id: 'military.fortification', label: '防御工事', labelKey: 'worldview:worldRules.tree.military.fortification.label', icon: '🏰', hints: ['城池', '关隘', '长城', '烽燧', '堡寨'], hintKeys: ['worldview:worldRules.tree.military.fortification.hint.0', 'worldview:worldRules.tree.military.fortification.hint.1', 'worldview:worldRules.tree.military.fortification.hint.2', 'worldview:worldRules.tree.military.fortification.hint.3', 'worldview:worldRules.tree.military.fortification.hint.4'] },
    ],
  },
  {
    id: 'economy', label: '经济', labelKey: 'worldview:worldRules.tree.economy.label', icon: '💰',
    children: [
      { id: 'economy.tax', label: '赋税制度', labelKey: 'worldview:worldRules.tree.economy.tax.label', icon: '📊', hints: ['田赋', '徭役', '商税', '两税法/一条鞭法'], hintKeys: ['worldview:worldRules.tree.economy.tax.hint.0', 'worldview:worldRules.tree.economy.tax.hint.1', 'worldview:worldRules.tree.economy.tax.hint.2', 'worldview:worldRules.tree.economy.tax.hint.3'] },
      { id: 'economy.currency', label: '货币金融', labelKey: 'worldview:worldRules.tree.economy.currency.label', icon: '🪙', hints: ['铜钱', '银两', '纸钞', '钱庄', '飞钱'], hintKeys: ['worldview:worldRules.tree.economy.currency.hint.0', 'worldview:worldRules.tree.economy.currency.hint.1', 'worldview:worldRules.tree.economy.currency.hint.2', 'worldview:worldRules.tree.economy.currency.hint.3', 'worldview:worldRules.tree.economy.currency.hint.4'] },
      { id: 'economy.trade', label: '商业贸易', labelKey: 'worldview:worldRules.tree.economy.trade.label', icon: '🏪', hints: ['坊市', '行商坐贾', '丝路/海贸', '行会'], hintKeys: ['worldview:worldRules.tree.economy.trade.hint.0', 'worldview:worldRules.tree.economy.trade.hint.1', 'worldview:worldRules.tree.economy.trade.hint.2', 'worldview:worldRules.tree.economy.trade.hint.3'] },
      { id: 'economy.agriculture', label: '农业', labelKey: 'worldview:worldRules.tree.economy.agriculture.label', icon: '🌾', hints: ['耕作方式', '作物种类', '灌溉', '田制'], hintKeys: ['worldview:worldRules.tree.economy.agriculture.hint.0', 'worldview:worldRules.tree.economy.agriculture.hint.1', 'worldview:worldRules.tree.economy.agriculture.hint.2', 'worldview:worldRules.tree.economy.agriculture.hint.3'] },
      { id: 'economy.crafts', label: '手工业', labelKey: 'worldview:worldRules.tree.economy.crafts.label', icon: '🔨', hints: ['织造', '冶炼', '陶瓷', '造纸', '印刷'], hintKeys: ['worldview:worldRules.tree.economy.crafts.hint.0', 'worldview:worldRules.tree.economy.crafts.hint.1', 'worldview:worldRules.tree.economy.crafts.hint.2', 'worldview:worldRules.tree.economy.crafts.hint.3', 'worldview:worldRules.tree.economy.crafts.hint.4'] },
      { id: 'economy.resources', label: '资源物产', labelKey: 'worldview:worldRules.tree.economy.resources.label', icon: '💎', hints: ['盐铁茶马', '矿产', '地方特产', '战略物资'], hintKeys: ['worldview:worldRules.tree.economy.resources.hint.0', 'worldview:worldRules.tree.economy.resources.hint.1', 'worldview:worldRules.tree.economy.resources.hint.2', 'worldview:worldRules.tree.economy.resources.hint.3'] },
    ],
  },
  {
    id: 'society', label: '社会结构', labelKey: 'worldview:worldRules.tree.society.label', icon: '👥',
    children: [
      { id: 'society.hierarchy', label: '阶层等级', labelKey: 'worldview:worldRules.tree.society.hierarchy.label', icon: '📶', hints: ['士农工商', '贵族/平民/贱民', '社会流动性'], hintKeys: ['worldview:worldRules.tree.society.hierarchy.hint.0', 'worldview:worldRules.tree.society.hierarchy.hint.1', 'worldview:worldRules.tree.society.hierarchy.hint.2'] },
      { id: 'society.clan', label: '宗族家族', labelKey: 'worldview:worldRules.tree.society.clan.label', icon: '🏠', hints: ['家谱', '祠堂', '嫡庶/长幼', '分家/继承'], hintKeys: ['worldview:worldRules.tree.society.clan.hint.0', 'worldview:worldRules.tree.society.clan.hint.1', 'worldview:worldRules.tree.society.clan.hint.2', 'worldview:worldRules.tree.society.clan.hint.3'] },
      { id: 'society.gender', label: '性别秩序', labelKey: 'worldview:worldRules.tree.society.gender.label', icon: '⚤', hints: ['婚嫁制度', '贞操观', '女性地位'], hintKeys: ['worldview:worldRules.tree.society.gender.hint.0', 'worldview:worldRules.tree.society.gender.hint.1', 'worldview:worldRules.tree.society.gender.hint.2'] },
      { id: 'society.servitude', label: '依附关系', labelKey: 'worldview:worldRules.tree.society.servitude.label', icon: '🔗', hints: ['奴婢', '佃户', '家仆', '人身依附'], hintKeys: ['worldview:worldRules.tree.society.servitude.hint.0', 'worldview:worldRules.tree.society.servitude.hint.1', 'worldview:worldRules.tree.society.servitude.hint.2', 'worldview:worldRules.tree.society.servitude.hint.3'] },
      { id: 'society.organizations', label: '民间组织', labelKey: 'worldview:worldRules.tree.society.organizations.label', icon: '🤫', hints: ['帮会', '秘密社团', '商帮', '会馆'], hintKeys: ['worldview:worldRules.tree.society.organizations.hint.0', 'worldview:worldRules.tree.society.organizations.hint.1', 'worldview:worldRules.tree.society.organizations.hint.2', 'worldview:worldRules.tree.society.organizations.hint.3'] },
    ],
  },
  {
    id: 'technology', label: '科技生产力', labelKey: 'worldview:worldRules.tree.technology.label', icon: '⚙️',
    children: [
      { id: 'technology.engineering', label: '工程建筑', labelKey: 'worldview:worldRules.tree.technology.engineering.label', icon: '🏗️', hints: ['建筑', '桥梁', '水利', '营造法式'], hintKeys: ['worldview:worldRules.tree.technology.engineering.hint.0', 'worldview:worldRules.tree.technology.engineering.hint.1', 'worldview:worldRules.tree.technology.engineering.hint.2', 'worldview:worldRules.tree.technology.engineering.hint.3'] },
      { id: 'technology.medicine', label: '医药', labelKey: 'worldview:worldRules.tree.technology.medicine.label', icon: '🏥', hints: ['医学体系', '药材', '瘟疫防治', '巫医'], hintKeys: ['worldview:worldRules.tree.technology.medicine.hint.0', 'worldview:worldRules.tree.technology.medicine.hint.1', 'worldview:worldRules.tree.technology.medicine.hint.2', 'worldview:worldRules.tree.technology.medicine.hint.3'] },
      { id: 'technology.astronomy', label: '天文历算', labelKey: 'worldview:worldRules.tree.technology.astronomy.label', icon: '🔭', hints: ['星象', '占卜', '数学', '历法编制'], hintKeys: ['worldview:worldRules.tree.technology.astronomy.hint.0', 'worldview:worldRules.tree.technology.astronomy.hint.1', 'worldview:worldRules.tree.technology.astronomy.hint.2', 'worldview:worldRules.tree.technology.astronomy.hint.3'] },
      { id: 'technology.transport', label: '交通工具', labelKey: 'worldview:worldRules.tree.technology.transport.label', icon: '🚢', hints: ['车马', '船舶', '轿子', '造船技术'], hintKeys: ['worldview:worldRules.tree.technology.transport.hint.0', 'worldview:worldRules.tree.technology.transport.hint.1', 'worldview:worldRules.tree.technology.transport.hint.2', 'worldview:worldRules.tree.technology.transport.hint.3'] },
      { id: 'technology.communication', label: '通信', labelKey: 'worldview:worldRules.tree.technology.communication.label', icon: '📨', hints: ['驿传', '烽火', '飞鸽', '信使'], hintKeys: ['worldview:worldRules.tree.technology.communication.hint.0', 'worldview:worldRules.tree.technology.communication.hint.1', 'worldview:worldRules.tree.technology.communication.hint.2', 'worldview:worldRules.tree.technology.communication.hint.3'] },
      { id: 'technology.tools', label: '生产工具', labelKey: 'worldview:worldRules.tree.technology.tools.label', icon: '🔧', hints: ['农具', '纺织机', '冶炼炉', '技术边界'], hintKeys: ['worldview:worldRules.tree.technology.tools.hint.0', 'worldview:worldRules.tree.technology.tools.hint.1', 'worldview:worldRules.tree.technology.tools.hint.2', 'worldview:worldRules.tree.technology.tools.hint.3'] },
    ],
  },
  {
    id: 'culture', label: '文化思想', labelKey: 'worldview:worldRules.tree.culture.label', icon: '📚',
    children: [
      { id: 'culture.philosophy', label: '主流思想', labelKey: 'worldview:worldRules.tree.culture.philosophy.label', icon: '🧠', hints: ['儒', '释', '道', '法', '墨', '理学/心学'], hintKeys: ['worldview:worldRules.tree.culture.philosophy.hint.0', 'worldview:worldRules.tree.culture.philosophy.hint.1', 'worldview:worldRules.tree.culture.philosophy.hint.2', 'worldview:worldRules.tree.culture.philosophy.hint.3', 'worldview:worldRules.tree.culture.philosophy.hint.4', 'worldview:worldRules.tree.culture.philosophy.hint.5'] },
      { id: 'culture.arts', label: '文学艺术', labelKey: 'worldview:worldRules.tree.culture.arts.label', icon: '🎨', hints: ['诗词', '话本', '戏曲', '书画', '音乐'], hintKeys: ['worldview:worldRules.tree.culture.arts.hint.0', 'worldview:worldRules.tree.culture.arts.hint.1', 'worldview:worldRules.tree.culture.arts.hint.2', 'worldview:worldRules.tree.culture.arts.hint.3', 'worldview:worldRules.tree.culture.arts.hint.4'] },
      { id: 'culture.education', label: '教育', labelKey: 'worldview:worldRules.tree.culture.education.label', icon: '🎓', hints: ['私塾', '官学', '书院', '太学', '典籍'], hintKeys: ['worldview:worldRules.tree.culture.education.hint.0', 'worldview:worldRules.tree.culture.education.hint.1', 'worldview:worldRules.tree.culture.education.hint.2', 'worldview:worldRules.tree.culture.education.hint.3', 'worldview:worldRules.tree.culture.education.hint.4'] },
    ],
  },
  {
    id: 'religion', label: '宗教信仰', labelKey: 'worldview:worldRules.tree.religion.label', icon: '🙏',
    children: [
      { id: 'religion.official', label: '官方宗教', labelKey: 'worldview:worldRules.tree.religion.official.label', icon: '⛪', hints: ['国教', '祭天', '宗庙', '宗教政策'], hintKeys: ['worldview:worldRules.tree.religion.official.hint.0', 'worldview:worldRules.tree.religion.official.hint.1', 'worldview:worldRules.tree.religion.official.hint.2', 'worldview:worldRules.tree.religion.official.hint.3'] },
      { id: 'religion.folk', label: '民间信仰', labelKey: 'worldview:worldRules.tree.religion.folk.label', icon: '🏮', hints: ['土地', '灶神', '妈祖', '关帝', '祈福禳灾'], hintKeys: ['worldview:worldRules.tree.religion.folk.hint.0', 'worldview:worldRules.tree.religion.folk.hint.1', 'worldview:worldRules.tree.religion.folk.hint.2', 'worldview:worldRules.tree.religion.folk.hint.3', 'worldview:worldRules.tree.religion.folk.hint.4'] },
      { id: 'religion.funeral', label: '丧葬祭祀', labelKey: 'worldview:worldRules.tree.religion.funeral.label', icon: '🪦', hints: ['葬制', '祭祖', '招魂', '忌日', '陵墓'], hintKeys: ['worldview:worldRules.tree.religion.funeral.hint.0', 'worldview:worldRules.tree.religion.funeral.hint.1', 'worldview:worldRules.tree.religion.funeral.hint.2', 'worldview:worldRules.tree.religion.funeral.hint.3', 'worldview:worldRules.tree.religion.funeral.hint.4'] },
      { id: 'religion.taboo', label: '禁忌避讳', labelKey: 'worldview:worldRules.tree.religion.taboo.label', icon: '🚫', hints: ['名讳', '字号', '文字狱', '吉凶观念'], hintKeys: ['worldview:worldRules.tree.religion.taboo.hint.0', 'worldview:worldRules.tree.religion.taboo.hint.1', 'worldview:worldRules.tree.religion.taboo.hint.2', 'worldview:worldRules.tree.religion.taboo.hint.3'] },
    ],
  },
  {
    id: 'ethnicity', label: '民族族群', labelKey: 'worldview:worldRules.tree.ethnicity.label', icon: '🌏',
    children: [
      { id: 'ethnicity.main', label: '主体民族', labelKey: 'worldview:worldRules.tree.ethnicity.main.label', icon: '🏘️', hints: ['民族特征', '文化认同'], hintKeys: ['worldview:worldRules.tree.ethnicity.main.hint.0', 'worldview:worldRules.tree.ethnicity.main.hint.1'] },
      { id: 'ethnicity.neighbors', label: '周边民族', labelKey: 'worldview:worldRules.tree.ethnicity.neighbors.label', icon: '🏕️', hints: ['游牧/渔猎', '华夷关系'], hintKeys: ['worldview:worldRules.tree.ethnicity.neighbors.hint.0', 'worldview:worldRules.tree.ethnicity.neighbors.hint.1'] },
      { id: 'ethnicity.interaction', label: '民族互动', labelKey: 'worldview:worldRules.tree.ethnicity.interaction.label', icon: '🔄', hints: ['战争', '融合', '同化', '边疆政策'], hintKeys: ['worldview:worldRules.tree.ethnicity.interaction.hint.0', 'worldview:worldRules.tree.ethnicity.interaction.hint.1', 'worldview:worldRules.tree.ethnicity.interaction.hint.2', 'worldview:worldRules.tree.ethnicity.interaction.hint.3'] },
      { id: 'ethnicity.foreign', label: '外国势力', labelKey: 'worldview:worldRules.tree.ethnicity.foreign.label', icon: '🌐', hints: ['外来文化', '传教士', '通商'], hintKeys: ['worldview:worldRules.tree.ethnicity.foreign.hint.0', 'worldview:worldRules.tree.ethnicity.foreign.hint.1', 'worldview:worldRules.tree.ethnicity.foreign.hint.2'] },
    ],
  },
  {
    id: 'language', label: '语言称谓', labelKey: 'worldview:worldRules.tree.language.label', icon: '💬',
    children: [
      { id: 'language.spoken', label: '口语风格', labelKey: 'worldview:worldRules.tree.language.spoken.label', icon: '🗣️', hints: ['时代语感', '方言', '雅俗分野'], hintKeys: ['worldview:worldRules.tree.language.spoken.hint.0', 'worldview:worldRules.tree.language.spoken.hint.1', 'worldview:worldRules.tree.language.spoken.hint.2'] },
      { id: 'language.titles', label: '称谓体系', labelKey: 'worldview:worldRules.tree.language.titles.label', icon: '📛', hints: ['官职称呼', '亲属称谓', '自称/敬称/贱称'], hintKeys: ['worldview:worldRules.tree.language.titles.hint.0', 'worldview:worldRules.tree.language.titles.hint.1', 'worldview:worldRules.tree.language.titles.hint.2'] },
      { id: 'language.written', label: '书面语', labelKey: 'worldview:worldRules.tree.language.written.label', icon: '✒️', hints: ['文言/白话', '奏折/公文/信函格式'], hintKeys: ['worldview:worldRules.tree.language.written.hint.0', 'worldview:worldRules.tree.language.written.hint.1'] },
      { id: 'language.taboo', label: '忌讳用语', labelKey: 'worldview:worldRules.tree.language.taboo.label', icon: '🤐', hints: ['避讳字', '委婉语', '时代特有表达'], hintKeys: ['worldview:worldRules.tree.language.taboo.hint.0', 'worldview:worldRules.tree.language.taboo.hint.1', 'worldview:worldRules.tree.language.taboo.hint.2'] },
    ],
  },
  {
    id: 'daily', label: '日常生活', labelKey: 'worldview:worldRules.tree.daily.label', icon: '🍵',
    children: [
      { id: 'daily.food', label: '饮食', labelKey: 'worldview:worldRules.tree.daily.food.label', icon: '🍜', hints: ['主食', '菜肴', '饮品', '烹饪方式', '饮食礼仪'], hintKeys: ['worldview:worldRules.tree.daily.food.hint.0', 'worldview:worldRules.tree.daily.food.hint.1', 'worldview:worldRules.tree.daily.food.hint.2', 'worldview:worldRules.tree.daily.food.hint.3', 'worldview:worldRules.tree.daily.food.hint.4'] },
      { id: 'daily.clothing', label: '服饰', labelKey: 'worldview:worldRules.tree.daily.clothing.label', icon: '👘', hints: ['材质', '款式', '颜色', '等级标识'], hintKeys: ['worldview:worldRules.tree.daily.clothing.hint.0', 'worldview:worldRules.tree.daily.clothing.hint.1', 'worldview:worldRules.tree.daily.clothing.hint.2', 'worldview:worldRules.tree.daily.clothing.hint.3'] },
      { id: 'daily.housing', label: '居住', labelKey: 'worldview:worldRules.tree.daily.housing.label', icon: '🏠', hints: ['民居', '府邸', '宫殿', '客栈', '家具'], hintKeys: ['worldview:worldRules.tree.daily.housing.hint.0', 'worldview:worldRules.tree.daily.housing.hint.1', 'worldview:worldRules.tree.daily.housing.hint.2', 'worldview:worldRules.tree.daily.housing.hint.3', 'worldview:worldRules.tree.daily.housing.hint.4'] },
      { id: 'daily.travel', label: '出行', labelKey: 'worldview:worldRules.tree.daily.travel.label', icon: '🐎', hints: ['日常交通', '出行礼仪', '路费盘缠'], hintKeys: ['worldview:worldRules.tree.daily.travel.hint.0', 'worldview:worldRules.tree.daily.travel.hint.1', 'worldview:worldRules.tree.daily.travel.hint.2'] },
      { id: 'daily.measures', label: '度量衡', labelKey: 'worldview:worldRules.tree.daily.measures.label', icon: '📏', hints: ['长度', '重量', '容量', '货币换算'], hintKeys: ['worldview:worldRules.tree.daily.measures.hint.0', 'worldview:worldRules.tree.daily.measures.hint.1', 'worldview:worldRules.tree.daily.measures.hint.2', 'worldview:worldRules.tree.daily.measures.hint.3'] },
      { id: 'daily.time', label: '时间观念', labelKey: 'worldview:worldRules.tree.daily.time.label', icon: '⏳', hints: ['十二时辰', '更鼓', '日出而作'], hintKeys: ['worldview:worldRules.tree.daily.time.hint.0', 'worldview:worldRules.tree.daily.time.hint.1', 'worldview:worldRules.tree.daily.time.hint.2'] },
      { id: 'daily.entertainment', label: '娱乐', labelKey: 'worldview:worldRules.tree.daily.entertainment.label', icon: '🎲', hints: ['棋牌', '蹴鞠', '斗鸡', '宴饮'], hintKeys: ['worldview:worldRules.tree.daily.entertainment.hint.0', 'worldview:worldRules.tree.daily.entertainment.hint.1', 'worldview:worldRules.tree.daily.entertainment.hint.2', 'worldview:worldRules.tree.daily.entertainment.hint.3'] },
      { id: 'daily.festivals', label: '节庆', labelKey: 'worldview:worldRules.tree.daily.festivals.label', icon: '🎊', hints: ['春节', '清明', '端午', '中秋', '重阳'], hintKeys: ['worldview:worldRules.tree.daily.festivals.hint.0', 'worldview:worldRules.tree.daily.festivals.hint.1', 'worldview:worldRules.tree.daily.festivals.hint.2', 'worldview:worldRules.tree.daily.festivals.hint.3', 'worldview:worldRules.tree.daily.festivals.hint.4'] },
      { id: 'daily.etiquette', label: '社交礼仪', labelKey: 'worldview:worldRules.tree.daily.etiquette.label', icon: '🎩', hints: ['拜帖', '宴请', '送礼', '官场/民间礼仪'], hintKeys: ['worldview:worldRules.tree.daily.etiquette.hint.0', 'worldview:worldRules.tree.daily.etiquette.hint.1', 'worldview:worldRules.tree.daily.etiquette.hint.2', 'worldview:worldRules.tree.daily.etiquette.hint.3'] },
    ],
  },
  {
    id: 'supernatural', label: '力量与超自然', labelKey: 'worldview:worldRules.tree.supernatural.label', icon: '✨',
    children: [
      { id: 'supernatural.system', label: '力量体系', labelKey: 'worldview:worldRules.tree.supernatural.system.label', icon: '🔥', hints: ['修炼等级', '规则限制', '晋升路径'], hintKeys: ['worldview:worldRules.tree.supernatural.system.hint.0', 'worldview:worldRules.tree.supernatural.system.hint.1', 'worldview:worldRules.tree.supernatural.system.hint.2'] },
      { id: 'supernatural.beings', label: '超自然存在', labelKey: 'worldview:worldRules.tree.supernatural.beings.label', icon: '👹', hints: ['神明', '妖魔', '鬼怪', '仙人'], hintKeys: ['worldview:worldRules.tree.supernatural.beings.hint.0', 'worldview:worldRules.tree.supernatural.beings.hint.1', 'worldview:worldRules.tree.supernatural.beings.hint.2', 'worldview:worldRules.tree.supernatural.beings.hint.3'] },
      { id: 'supernatural.artifacts', label: '灵材法器', labelKey: 'worldview:worldRules.tree.supernatural.artifacts.label', icon: '💎', hints: ['法宝', '丹药', '灵石', '阵法'], hintKeys: ['worldview:worldRules.tree.supernatural.artifacts.hint.0', 'worldview:worldRules.tree.supernatural.artifacts.hint.1', 'worldview:worldRules.tree.supernatural.artifacts.hint.2', 'worldview:worldRules.tree.supernatural.artifacts.hint.3'] },
      { id: 'supernatural.impact', label: '力量与社会', labelKey: 'worldview:worldRules.tree.supernatural.impact.label', icon: '⚡', hints: ['修士vs凡人', '力量vs权力', '管理制度'], hintKeys: ['worldview:worldRules.tree.supernatural.impact.hint.0', 'worldview:worldRules.tree.supernatural.impact.hint.1', 'worldview:worldRules.tree.supernatural.impact.hint.2'] },
    ],
  },
]

// ── 辅助函数 ──────────────────────────────────────────────────

/** 获取所有预定义节点的 ID 列表（含 L1 + L2） */
export function getAllPredefinedIds(): string[] {
  const ids: string[] = []
  for (const l1 of WORLD_RULE_TREE) {
    ids.push(l1.id)
    if (l1.children) {
      for (const l2 of l1.children) {
        ids.push(l2.id)
      }
    }
  }
  return ids
}

/** 判断一个 entry 是否为空（两个文本都为空） */
export function isEntryEmpty(entry: WorldRuleEntry | undefined): boolean {
  if (!entry) return true
  return !entry.historicalAnchors.trim() && !entry.fictionalAdaptations.trim()
}

/** 统计已填节点数 */
export function countFilledEntries(entries: Record<string, WorldRuleEntry>): number {
  return Object.values(entries).filter(e => !isEntryEmpty(e)).length
}

/** 创建空的 entry */
export function createEmptyEntry(): WorldRuleEntry {
  return { historicalAnchors: '', fictionalAdaptations: '', priority: 'balanced' }
}

/** 创建空的 profile */
export function createEmptyProfile(projectId: number): CreateWorldRulesInput {
  return {
    projectId,
    entries: {},
    customNodes: [],
    globalNote: '',
  }
}
