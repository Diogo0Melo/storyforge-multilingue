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

/** i18n keys for conflict priority labels (UI only) */
export const CONFLICT_PRIORITY_LABEL_KEYS: Record<ConflictPriority, string> = {
  historical: 'worldRules.priority.historical',
  balanced: 'worldRules.priority.balanced',
  fictional: 'worldRules.priority.fictional',
}
// ── 树节点定义（预定义 + 用户自定义） ──────────────────────────

/** 预定义树节点 */
export interface WorldRuleNodeDef {
  /** 点分 ID，如 'politics', 'politics.central' */
  id: string
  /** 中文标签 */
  label: string
  /** i18n key for UI display */
  labelKey?: string
  /** emoji 图标 */
  icon: string
  /** L3 提示标签（仅 L2 节点有） */
  hints?: string[]
  /** i18n keys for hints */
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
    id: 'era', label: '时代背景', labelKey: 'worldRules.categories.era', icon: '🕰️',
    children: [
      { id: 'era.period', label: '历史时期', labelKey: 'worldRules.subcategories.era.period', icon: '📜', hints: ['朝代', '纪年', '年号'], hintKeys: ['worldRules.hints.era.period.0', 'worldRules.hints.era.period.1', 'worldRules.hints.era.period.2'] },
      { id: 'era.divergence', label: '架空起点', labelKey: 'worldRules.subcategories.era.divergence', icon: '🦋', hints: ['蝴蝶效应边界', '分岔点', '架空程度'], hintKeys: ['worldRules.hints.era.divergence.0', 'worldRules.hints.era.divergence.1', 'worldRules.hints.era.divergence.2'] },
      { id: 'era.calendar', label: '历法时间', labelKey: 'worldRules.subcategories.era.calendar', icon: '📅', hints: ['历法', '节气', '时辰'], hintKeys: ['worldRules.hints.era.calendar.0', 'worldRules.hints.era.calendar.1', 'worldRules.hints.era.calendar.2'] },
    ],
  },
  {
    id: 'events', label: '重大事件', labelKey: 'worldRules.categories.events', icon: '⚡',
    hints: ['与历史年表联动', '📜史实事件自动成为锚点', '✨虚构事件为作者规划'],
    hintKeys: ['worldRules.hints.events.0', 'worldRules.hints.events.1', 'worldRules.hints.events.2'],
    children: [],
  },
  {
    id: 'geography', label: '地理疆域', labelKey: 'worldRules.categories.geography', icon: '🗺️',
    children: [
      { id: 'geography.admin', label: '行政区划', labelKey: 'worldRules.subcategories.geography.admin', icon: '📐', hints: ['省/府/州/县', '边疆与内地'], hintKeys: ['worldRules.hints.geography.admin.0', 'worldRules.hints.geography.admin.1'] },
      { id: 'geography.terrain', label: '地形地貌', labelKey: 'worldRules.subcategories.geography.terrain', icon: '⛰️', hints: ['山脉', '平原', '盆地', '沙漠', '高原'], hintKeys: ['worldRules.hints.geography.terrain.0', 'worldRules.hints.geography.terrain.1', 'worldRules.hints.geography.terrain.2', 'worldRules.hints.geography.terrain.3', 'worldRules.hints.geography.terrain.4'] },
      { id: 'geography.cities', label: '城市重镇', labelKey: 'worldRules.subcategories.geography.cities', icon: '🏰', hints: ['都城布局', '军事要塞', '商业都会', '城墙城门'], hintKeys: ['worldRules.hints.geography.cities.0', 'worldRules.hints.geography.cities.1', 'worldRules.hints.geography.cities.2', 'worldRules.hints.geography.cities.3'] },
      { id: 'geography.water', label: '水系', labelKey: 'worldRules.subcategories.geography.water', icon: '🌊', hints: ['河流', '湖泊', '运河', '漕运路线', '水利工程'], hintKeys: ['worldRules.hints.geography.water.0', 'worldRules.hints.geography.water.1', 'worldRules.hints.geography.water.2', 'worldRules.hints.geography.water.3', 'worldRules.hints.geography.water.4'] },
      { id: 'geography.roads', label: '道路交通', labelKey: 'worldRules.subcategories.geography.roads', icon: '🛤️', hints: ['官道', '驿站', '栈道', '关隘', '海路'], hintKeys: ['worldRules.hints.geography.roads.0', 'worldRules.hints.geography.roads.1', 'worldRules.hints.geography.roads.2', 'worldRules.hints.geography.roads.3', 'worldRules.hints.geography.roads.4'] },
    ],
  },
  {
    id: 'climate', label: '气候环境', labelKey: 'worldRules.categories.climate', icon: '🌦️',
    children: [
      { id: 'climate.weather', label: '气候特征', labelKey: 'worldRules.subcategories.climate.weather', icon: '☀️', hints: ['季节', '温度', '降水'], hintKeys: ['worldRules.hints.climate.weather.0', 'worldRules.hints.climate.weather.1', 'worldRules.hints.climate.weather.2'] },
      { id: 'climate.disaster', label: '自然灾害', labelKey: 'worldRules.subcategories.climate.disaster', icon: '🌪️', hints: ['旱涝', '地震', '瘟疫', '蝗灾'], hintKeys: ['worldRules.hints.climate.disaster.0', 'worldRules.hints.climate.disaster.1', 'worldRules.hints.climate.disaster.2', 'worldRules.hints.climate.disaster.3'] },
      { id: 'climate.ecology', label: '生态物种', labelKey: 'worldRules.subcategories.climate.ecology', icon: '🌿', hints: ['动物', '植物', '特殊物产'], hintKeys: ['worldRules.hints.climate.ecology.0', 'worldRules.hints.climate.ecology.1', 'worldRules.hints.climate.ecology.2'] },
    ],
  },
  {
    id: 'politics', label: '政治制度', labelKey: 'worldRules.categories.politics', icon: '🏛️',
    children: [
      { id: 'politics.system', label: '政体形态', labelKey: 'worldRules.subcategories.politics.system', icon: '👑', hints: ['君主制/共和', '集权程度', '分权制衡'], hintKeys: ['worldRules.hints.politics.system.0', 'worldRules.hints.politics.system.1', 'worldRules.hints.politics.system.2'] },
      { id: 'politics.central', label: '中央官制', labelKey: 'worldRules.subcategories.politics.central', icon: '📋', hints: ['宰辅', '部院', '寺监', '内阁/军机'], hintKeys: ['worldRules.hints.politics.central.0', 'worldRules.hints.politics.central.1', 'worldRules.hints.politics.central.2', 'worldRules.hints.politics.central.3'] },
      { id: 'politics.local', label: '地方官制', labelKey: 'worldRules.subcategories.politics.local', icon: '🏠', hints: ['州牧/刺史/知府', '藩镇', '地方自治'], hintKeys: ['worldRules.hints.politics.local.0', 'worldRules.hints.politics.local.1', 'worldRules.hints.politics.local.2'] },
      { id: 'politics.selection', label: '选官制度', labelKey: 'worldRules.subcategories.politics.selection', icon: '🎓', hints: ['科举', '荐举', '九品中正', '世袭'], hintKeys: ['worldRules.hints.politics.selection.0', 'worldRules.hints.politics.selection.1', 'worldRules.hints.politics.selection.2', 'worldRules.hints.politics.selection.3'] },
      { id: 'politics.nobility', label: '爵位封号', labelKey: 'worldRules.subcategories.politics.nobility', icon: '🎖️', hints: ['公侯伯子男', '封国', '食邑'], hintKeys: ['worldRules.hints.politics.nobility.0', 'worldRules.hints.politics.nobility.1', 'worldRules.hints.politics.nobility.2'] },
      { id: 'politics.law', label: '法律刑罚', labelKey: 'worldRules.subcategories.politics.law', icon: '⚖️', hints: ['律令格式', '刑罚种类', '审判流程', '监狱'], hintKeys: ['worldRules.hints.politics.law.0', 'worldRules.hints.politics.law.1', 'worldRules.hints.politics.law.2', 'worldRules.hints.politics.law.3'] },
      { id: 'politics.diplomacy', label: '外交', labelKey: 'worldRules.subcategories.politics.diplomacy', icon: '🤝', hints: ['朝贡', '邦交', '和亲', '质子', '国书'], hintKeys: ['worldRules.hints.politics.diplomacy.0', 'worldRules.hints.politics.diplomacy.1', 'worldRules.hints.politics.diplomacy.2', 'worldRules.hints.politics.diplomacy.3', 'worldRules.hints.politics.diplomacy.4'] },
    ],
  },
  {
    id: 'military', label: '军事', labelKey: 'worldRules.categories.military', icon: '⚔️',
    children: [
      { id: 'military.organization', label: '军制编制', labelKey: 'worldRules.subcategories.military.organization', icon: '🪖', hints: ['兵种', '军衔', '编制单位', '府兵/募兵'], hintKeys: ['worldRules.hints.military.organization.0', 'worldRules.hints.military.organization.1', 'worldRules.hints.military.organization.2', 'worldRules.hints.military.organization.3'] },
      { id: 'military.weapons', label: '武器装备', labelKey: 'worldRules.subcategories.military.weapons', icon: '🗡️', hints: ['兵器', '铠甲', '攻城器械'], hintKeys: ['worldRules.hints.military.weapons.0', 'worldRules.hints.military.weapons.1', 'worldRules.hints.military.weapons.2'] },
      { id: 'military.tactics', label: '战术战法', labelKey: 'worldRules.subcategories.military.tactics', icon: '🗺️', hints: ['阵法', '骑兵/步兵/水师', '攻城/守城'], hintKeys: ['worldRules.hints.military.tactics.0', 'worldRules.hints.military.tactics.1', 'worldRules.hints.military.tactics.2'] },
      { id: 'military.fortification', label: '防御工事', labelKey: 'worldRules.subcategories.military.fortification', icon: '🏰', hints: ['城池', '关隘', '长城', '烽燧', '堡寨'], hintKeys: ['worldRules.hints.military.fortification.0', 'worldRules.hints.military.fortification.1', 'worldRules.hints.military.fortification.2', 'worldRules.hints.military.fortification.3', 'worldRules.hints.military.fortification.4'] },
    ],
  },
  {
    id: 'economy', label: '经济', labelKey: 'worldRules.categories.economy', icon: '💰',
    children: [
      { id: 'economy.tax', label: '赋税制度', labelKey: 'worldRules.subcategories.economy.tax', icon: '📊', hints: ['田赋', '徭役', '商税', '两税法/一条鞭法'], hintKeys: ['worldRules.hints.economy.tax.0', 'worldRules.hints.economy.tax.1', 'worldRules.hints.economy.tax.2', 'worldRules.hints.economy.tax.3'] },
      { id: 'economy.currency', label: '货币金融', labelKey: 'worldRules.subcategories.economy.currency', icon: '🪙', hints: ['铜钱', '银两', '纸钞', '钱庄', '飞钱'], hintKeys: ['worldRules.hints.economy.currency.0', 'worldRules.hints.economy.currency.1', 'worldRules.hints.economy.currency.2', 'worldRules.hints.economy.currency.3', 'worldRules.hints.economy.currency.4'] },
      { id: 'economy.trade', label: '商业贸易', labelKey: 'worldRules.subcategories.economy.trade', icon: '🏪', hints: ['坊市', '行商坐贾', '丝路/海贸', '行会'], hintKeys: ['worldRules.hints.economy.trade.0', 'worldRules.hints.economy.trade.1', 'worldRules.hints.economy.trade.2', 'worldRules.hints.economy.trade.3'] },
      { id: 'economy.agriculture', label: '农业', labelKey: 'worldRules.subcategories.economy.agriculture', icon: '🌾', hints: ['耕作方式', '作物种类', '灌溉', '田制'], hintKeys: ['worldRules.hints.economy.agriculture.0', 'worldRules.hints.economy.agriculture.1', 'worldRules.hints.economy.agriculture.2', 'worldRules.hints.economy.agriculture.3'] },
      { id: 'economy.crafts', label: '手工业', labelKey: 'worldRules.subcategories.economy.crafts', icon: '🔨', hints: ['织造', '冶炼', '陶瓷', '造纸', '印刷'], hintKeys: ['worldRules.hints.economy.crafts.0', 'worldRules.hints.economy.crafts.1', 'worldRules.hints.economy.crafts.2', 'worldRules.hints.economy.crafts.3', 'worldRules.hints.economy.crafts.4'] },
      { id: 'economy.resources', label: '资源物产', labelKey: 'worldRules.subcategories.economy.resources', icon: '💎', hints: ['盐铁茶马', '矿产', '地方特产', '战略物资'], hintKeys: ['worldRules.hints.economy.resources.0', 'worldRules.hints.economy.resources.1', 'worldRules.hints.economy.resources.2', 'worldRules.hints.economy.resources.3'] },
    ],
  },
  {
    id: 'society', label: '社会结构', labelKey: 'worldRules.categories.society', icon: '👥',
    children: [
      { id: 'society.hierarchy', label: '阶层等级', labelKey: 'worldRules.subcategories.society.hierarchy', icon: '📶', hints: ['士农工商', '贵族/平民/贱民', '社会流动性'], hintKeys: ['worldRules.hints.society.hierarchy.0', 'worldRules.hints.society.hierarchy.1', 'worldRules.hints.society.hierarchy.2'] },
      { id: 'society.clan', label: '宗族家族', labelKey: 'worldRules.subcategories.society.clan', icon: '🏠', hints: ['家谱', '祠堂', '嫡庶/长幼', '分家/继承'], hintKeys: ['worldRules.hints.society.clan.0', 'worldRules.hints.society.clan.1', 'worldRules.hints.society.clan.2', 'worldRules.hints.society.clan.3'] },
      { id: 'society.gender', label: '性别秩序', labelKey: 'worldRules.subcategories.society.gender', icon: '⚤', hints: ['婚嫁制度', '贞操观', '女性地位'], hintKeys: ['worldRules.hints.society.gender.0', 'worldRules.hints.society.gender.1', 'worldRules.hints.society.gender.2'] },
      { id: 'society.servitude', label: '依附关系', labelKey: 'worldRules.subcategories.society.servitude', icon: '🔗', hints: ['奴婢', '佃户', '家仆', '人身依附'], hintKeys: ['worldRules.hints.society.servitude.0', 'worldRules.hints.society.servitude.1', 'worldRules.hints.society.servitude.2', 'worldRules.hints.society.servitude.3'] },
      { id: 'society.organizations', label: '民间组织', labelKey: 'worldRules.subcategories.society.organizations', icon: '🤫', hints: ['帮会', '秘密社团', '商帮', '会馆'], hintKeys: ['worldRules.hints.society.organizations.0', 'worldRules.hints.society.organizations.1', 'worldRules.hints.society.organizations.2', 'worldRules.hints.society.organizations.3'] },
    ],
  },
  {
    id: 'technology', label: '科技生产力', labelKey: 'worldRules.categories.technology', icon: '⚙️',
    children: [
      { id: 'technology.engineering', label: '工程建筑', labelKey: 'worldRules.subcategories.technology.engineering', icon: '🏗️', hints: ['建筑', '桥梁', '水利', '营造法式'], hintKeys: ['worldRules.hints.technology.engineering.0', 'worldRules.hints.technology.engineering.1', 'worldRules.hints.technology.engineering.2', 'worldRules.hints.technology.engineering.3'] },
      { id: 'technology.medicine', label: '医药', labelKey: 'worldRules.subcategories.technology.medicine', icon: '🏥', hints: ['医学体系', '药材', '瘟疫防治', '巫医'], hintKeys: ['worldRules.hints.technology.medicine.0', 'worldRules.hints.technology.medicine.1', 'worldRules.hints.technology.medicine.2', 'worldRules.hints.technology.medicine.3'] },
      { id: 'technology.astronomy', label: '天文历算', labelKey: 'worldRules.subcategories.technology.astronomy', icon: '🔭', hints: ['星象', '占卜', '数学', '历法编制'], hintKeys: ['worldRules.hints.technology.astronomy.0', 'worldRules.hints.technology.astronomy.1', 'worldRules.hints.technology.astronomy.2', 'worldRules.hints.technology.astronomy.3'] },
      { id: 'technology.transport', label: '交通工具', labelKey: 'worldRules.subcategories.technology.transport', icon: '🚢', hints: ['车马', '船舶', '轿子', '造船技术'], hintKeys: ['worldRules.hints.technology.transport.0', 'worldRules.hints.technology.transport.1', 'worldRules.hints.technology.transport.2', 'worldRules.hints.technology.transport.3'] },
      { id: 'technology.communication', label: '通信', labelKey: 'worldRules.subcategories.technology.communication', icon: '📨', hints: ['驿传', '烽火', '飞鸽', '信使'], hintKeys: ['worldRules.hints.technology.communication.0', 'worldRules.hints.technology.communication.1', 'worldRules.hints.technology.communication.2', 'worldRules.hints.technology.communication.3'] },
      { id: 'technology.tools', label: '生产工具', labelKey: 'worldRules.subcategories.technology.tools', icon: '🔧', hints: ['农具', '纺织机', '冶炼炉', '技术边界'], hintKeys: ['worldRules.hints.technology.tools.0', 'worldRules.hints.technology.tools.1', 'worldRules.hints.technology.tools.2', 'worldRules.hints.technology.tools.3'] },
    ],
  },
  {
    id: 'culture', label: '文化思想', labelKey: 'worldRules.categories.culture', icon: '📚',
    children: [
      { id: 'culture.philosophy', label: '主流思想', labelKey: 'worldRules.subcategories.culture.philosophy', icon: '🧠', hints: ['儒', '释', '道', '法', '墨', '理学/心学'], hintKeys: ['worldRules.hints.culture.philosophy.0', 'worldRules.hints.culture.philosophy.1', 'worldRules.hints.culture.philosophy.2', 'worldRules.hints.culture.philosophy.3', 'worldRules.hints.culture.philosophy.4', 'worldRules.hints.culture.philosophy.5'] },
      { id: 'culture.arts', label: '文学艺术', labelKey: 'worldRules.subcategories.culture.arts', icon: '🎨', hints: ['诗词', '话本', '戏曲', '书画', '音乐'], hintKeys: ['worldRules.hints.culture.arts.0', 'worldRules.hints.culture.arts.1', 'worldRules.hints.culture.arts.2', 'worldRules.hints.culture.arts.3', 'worldRules.hints.culture.arts.4'] },
      { id: 'culture.education', label: '教育', labelKey: 'worldRules.subcategories.culture.education', icon: '🎓', hints: ['私塾', '官学', '书院', '太学', '典籍'], hintKeys: ['worldRules.hints.culture.education.0', 'worldRules.hints.culture.education.1', 'worldRules.hints.culture.education.2', 'worldRules.hints.culture.education.3', 'worldRules.hints.culture.education.4'] },
    ],
  },
  {
    id: 'religion', label: '宗教信仰', labelKey: 'worldRules.categories.religion', icon: '🙏',
    children: [
      { id: 'religion.official', label: '官方宗教', labelKey: 'worldRules.subcategories.religion.official', icon: '⛪', hints: ['国教', '祭天', '宗庙', '宗教政策'], hintKeys: ['worldRules.hints.religion.official.0', 'worldRules.hints.religion.official.1', 'worldRules.hints.religion.official.2', 'worldRules.hints.religion.official.3'] },
      { id: 'religion.folk', label: '民间信仰', labelKey: 'worldRules.subcategories.religion.folk', icon: '🏮', hints: ['土地', '灶神', '妈祖', '关帝', '祈福禳灾'], hintKeys: ['worldRules.hints.religion.folk.0', 'worldRules.hints.religion.folk.1', 'worldRules.hints.religion.folk.2', 'worldRules.hints.religion.folk.3', 'worldRules.hints.religion.folk.4'] },
      { id: 'religion.funeral', label: '丧葬祭祀', labelKey: 'worldRules.subcategories.religion.funeral', icon: '🪦', hints: ['葬制', '祭祖', '招魂', '忌日', '陵墓'], hintKeys: ['worldRules.hints.religion.funeral.0', 'worldRules.hints.religion.funeral.1', 'worldRules.hints.religion.funeral.2', 'worldRules.hints.religion.funeral.3', 'worldRules.hints.religion.funeral.4'] },
      { id: 'religion.taboo', label: '禁忌避讳', labelKey: 'worldRules.subcategories.religion.taboo', icon: '🚫', hints: ['名讳', '字号', '文字狱', '吉凶观念'], hintKeys: ['worldRules.hints.religion.taboo.0', 'worldRules.hints.religion.taboo.1', 'worldRules.hints.religion.taboo.2', 'worldRules.hints.religion.taboo.3'] },
    ],
  },
  {
    id: 'ethnicity', label: '民族族群', labelKey: 'worldRules.categories.ethnicity', icon: '🌏',
    children: [
      { id: 'ethnicity.main', label: '主体民族', labelKey: 'worldRules.subcategories.ethnicity.main', icon: '🏘️', hints: ['民族特征', '文化认同'], hintKeys: ['worldRules.hints.ethnicity.main.0', 'worldRules.hints.ethnicity.main.1'] },
      { id: 'ethnicity.neighbors', label: '周边民族', labelKey: 'worldRules.subcategories.ethnicity.neighbors', icon: '🏕️', hints: ['游牧/渔猎', '华夷关系'], hintKeys: ['worldRules.hints.ethnicity.neighbors.0', 'worldRules.hints.ethnicity.neighbors.1'] },
      { id: 'ethnicity.interaction', label: '民族互动', labelKey: 'worldRules.subcategories.ethnicity.interaction', icon: '🔄', hints: ['战争', '融合', '同化', '边疆政策'], hintKeys: ['worldRules.hints.ethnicity.interaction.0', 'worldRules.hints.ethnicity.interaction.1', 'worldRules.hints.ethnicity.interaction.2', 'worldRules.hints.ethnicity.interaction.3'] },
      { id: 'ethnicity.foreign', label: '外国势力', labelKey: 'worldRules.subcategories.ethnicity.foreign', icon: '🌐', hints: ['外来文化', '传教士', '通商'], hintKeys: ['worldRules.hints.ethnicity.foreign.0', 'worldRules.hints.ethnicity.foreign.1', 'worldRules.hints.ethnicity.foreign.2'] },
    ],
  },
  {
    id: 'language', label: '语言称谓', labelKey: 'worldRules.categories.language', icon: '💬',
    children: [
      { id: 'language.spoken', label: '口语风格', labelKey: 'worldRules.subcategories.language.spoken', icon: '🗣️', hints: ['时代语感', '方言', '雅俗分野'], hintKeys: ['worldRules.hints.language.spoken.0', 'worldRules.hints.language.spoken.1', 'worldRules.hints.language.spoken.2'] },
      { id: 'language.titles', label: '称谓体系', labelKey: 'worldRules.subcategories.language.titles', icon: '📛', hints: ['官职称呼', '亲属称谓', '自称/敬称/贱称'], hintKeys: ['worldRules.hints.language.titles.0', 'worldRules.hints.language.titles.1', 'worldRules.hints.language.titles.2'] },
      { id: 'language.written', label: '书面语', labelKey: 'worldRules.subcategories.language.written', icon: '✒️', hints: ['文言/白话', '奏折/公文/信函格式'], hintKeys: ['worldRules.hints.language.written.0', 'worldRules.hints.language.written.1'] },
      { id: 'language.taboo', label: '忌讳用语', labelKey: 'worldRules.subcategories.language.taboo', icon: '🤐', hints: ['避讳字', '委婉语', '时代特有表达'], hintKeys: ['worldRules.hints.language.taboo.0', 'worldRules.hints.language.taboo.1', 'worldRules.hints.language.taboo.2'] },
    ],
  },
  {
    id: 'daily', label: '日常生活', labelKey: 'worldRules.categories.daily', icon: '🍵',
    children: [
      { id: 'daily.food', label: '饮食', labelKey: 'worldRules.subcategories.daily.food', icon: '🍜', hints: ['主食', '菜肴', '饮品', '烹饪方式', '饮食礼仪'], hintKeys: ['worldRules.hints.daily.food.0', 'worldRules.hints.daily.food.1', 'worldRules.hints.daily.food.2', 'worldRules.hints.daily.food.3', 'worldRules.hints.daily.food.4'] },
      { id: 'daily.clothing', label: '服饰', labelKey: 'worldRules.subcategories.daily.clothing', icon: '👘', hints: ['材质', '款式', '颜色', '等级标识'], hintKeys: ['worldRules.hints.daily.clothing.0', 'worldRules.hints.daily.clothing.1', 'worldRules.hints.daily.clothing.2', 'worldRules.hints.daily.clothing.3'] },
      { id: 'daily.housing', label: '居住', labelKey: 'worldRules.subcategories.daily.housing', icon: '🏠', hints: ['民居', '府邸', '宫殿', '客栈', '家具'], hintKeys: ['worldRules.hints.daily.housing.0', 'worldRules.hints.daily.housing.1', 'worldRules.hints.daily.housing.2', 'worldRules.hints.daily.housing.3', 'worldRules.hints.daily.housing.4'] },
      { id: 'daily.travel', label: '出行', labelKey: 'worldRules.subcategories.daily.travel', icon: '🐎', hints: ['日常交通', '出行礼仪', '路费盘缠'], hintKeys: ['worldRules.hints.daily.travel.0', 'worldRules.hints.daily.travel.1', 'worldRules.hints.daily.travel.2'] },
      { id: 'daily.measures', label: '度量衡', labelKey: 'worldRules.subcategories.daily.measures', icon: '📏', hints: ['长度', '重量', '容量', '货币换算'], hintKeys: ['worldRules.hints.daily.measures.0', 'worldRules.hints.daily.measures.1', 'worldRules.hints.daily.measures.2', 'worldRules.hints.daily.measures.3'] },
      { id: 'daily.time', label: '时间观念', labelKey: 'worldRules.subcategories.daily.time', icon: '⏳', hints: ['十二时辰', '更鼓', '日出而作'], hintKeys: ['worldRules.hints.daily.time.0', 'worldRules.hints.daily.time.1', 'worldRules.hints.daily.time.2'] },
      { id: 'daily.entertainment', label: '娱乐', labelKey: 'worldRules.subcategories.daily.entertainment', icon: '🎲', hints: ['棋牌', '蹴鞠', '斗鸡', '宴饮'], hintKeys: ['worldRules.hints.daily.entertainment.0', 'worldRules.hints.daily.entertainment.1', 'worldRules.hints.daily.entertainment.2', 'worldRules.hints.daily.entertainment.3'] },
      { id: 'daily.festivals', label: '节庆', labelKey: 'worldRules.subcategories.daily.festivals', icon: '🎊', hints: ['春节', '清明', '端午', '中秋', '重阳'], hintKeys: ['worldRules.hints.daily.festivals.0', 'worldRules.hints.daily.festivals.1', 'worldRules.hints.daily.festivals.2', 'worldRules.hints.daily.festivals.3', 'worldRules.hints.daily.festivals.4'] },
      { id: 'daily.etiquette', label: '社交礼仪', labelKey: 'worldRules.subcategories.daily.etiquette', icon: '🎩', hints: ['拜帖', '宴请', '送礼', '官场/民间礼仪'], hintKeys: ['worldRules.hints.daily.etiquette.0', 'worldRules.hints.daily.etiquette.1', 'worldRules.hints.daily.etiquette.2', 'worldRules.hints.daily.etiquette.3'] },
    ],
  },
  {
    id: 'supernatural', label: '力量与超自然', labelKey: 'worldRules.categories.supernatural', icon: '✨',
    children: [
      { id: 'supernatural.system', label: '力量体系', labelKey: 'worldRules.subcategories.supernatural.system', icon: '🔥', hints: ['修炼等级', '规则限制', '晋升路径'], hintKeys: ['worldRules.hints.supernatural.system.0', 'worldRules.hints.supernatural.system.1', 'worldRules.hints.supernatural.system.2'] },
      { id: 'supernatural.beings', label: '超自然存在', labelKey: 'worldRules.subcategories.supernatural.beings', icon: '👹', hints: ['神明', '妖魔', '鬼怪', '仙人'], hintKeys: ['worldRules.hints.supernatural.beings.0', 'worldRules.hints.supernatural.beings.1', 'worldRules.hints.supernatural.beings.2', 'worldRules.hints.supernatural.beings.3'] },
      { id: 'supernatural.artifacts', label: '灵材法器', labelKey: 'worldRules.subcategories.supernatural.artifacts', icon: '💎', hints: ['法宝', '丹药', '灵石', '阵法'], hintKeys: ['worldRules.hints.supernatural.artifacts.0', 'worldRules.hints.supernatural.artifacts.1', 'worldRules.hints.supernatural.artifacts.2', 'worldRules.hints.supernatural.artifacts.3'] },
      { id: 'supernatural.impact', label: '力量与社会', labelKey: 'worldRules.subcategories.supernatural.impact', icon: '⚡', hints: ['修士vs凡人', '力量vs权力', '管理制度'], hintKeys: ['worldRules.hints.supernatural.impact.0', 'worldRules.hints.supernatural.impact.1', 'worldRules.hints.supernatural.impact.2'] },
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
