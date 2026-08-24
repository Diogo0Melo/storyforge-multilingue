import { CHARACTER_DIMENSIONS, getDimensionLabel, getDimensionGroupLabel } from '../character/character-dimensions'
import type { OutputKind } from '../ai/output-language'
import type { PromptModuleKey } from '../types/prompt'
import type {
  AuthoringNodeTemplate,
  AuthoringParameterDefinition,
  AuthoringPortDefinition,
  AuthoringSemantic,
  AuthoringWriteContract,
} from './contracts'

/**
 * i18n 双重用途约定(与 CONTEXT_SOURCES.labelKey 同一模式):
 *
 * - 中文 `label` / `description` / `category` 字段保留,它们不是纯 UI 文案:
 *   1. AI prompt payload——executor.ts 的 system/user 消息直接引用 template.label /
 *      template.description(prompt 内容按项目约定不翻译);
 *   2. 持久化默认节点名——nodeFromTemplate / templates.ts / creation-chain.ts /
 *      overview.ts 用 template.label 作为新建节点的 title(A4 模式,创建后可编辑);
 *   3. UI 兜底——组件以 `t(key, { defaultValue: 中文字段 })` 解析。
 * - `labelKey` / `descriptionKey` / `categoryKey` 指向 node-authoring 命名空间
 *   `nodes.*` 键组,只供 UI 渲染解析,不进入 prompt 与持久化数据。
 */
export interface AuthoringPortI18n extends AuthoringPortDefinition {
  labelKey: string
}

export interface AuthoringParameterI18n extends AuthoringParameterDefinition {
  labelKey: string
}

export interface AuthoringNodeTemplateI18n extends Omit<AuthoringNodeTemplate, 'inputs' | 'outputs' | 'parameters'> {
  labelKey: string
  descriptionKey: string
  categoryKey: string
  inputs: AuthoringPortI18n[]
  outputs: AuthoringPortI18n[]
  parameters?: AuthoringParameterI18n[]
}

type FieldTemplateInput = {
  id: string
  label: string
  labelKey: string
  description: string
  descriptionKey: string
  category: string
  categoryKey: string
  target: string
  field: string
  sourceKey: string
  semantic: AuthoringSemantic
  promptModuleKey: PromptModuleKey
  recommendedBefore?: string[]
  recommendedAfter?: string[]
}

const contextInput = (): AuthoringPortI18n => ({
  id: 'context',
  label: '创作依据',
  labelKey: 'nodes.ports.context',
  semantic: 'any',
  cardinality: 'many',
  state: 'any',
  required: false,
  multiple: true,
  priority: 50,
  maxTokens: 12_000,
})

const optionalControl = (
  id: string,
  label: string,
  labelKey: string,
  semantic: AuthoringSemantic,
): AuthoringPortI18n => ({
  id,
  label,
  labelKey,
  semantic,
  cardinality: 'one',
  state: 'control',
  required: false,
})

const generationInputs = (): AuthoringPortI18n[] => [
  contextInput(),
  optionalControl('ai-profile', 'AI 配置', 'nodes.ports.aiProfile', 'control.ai-profile'),
  optionalControl('prompt', 'Prompt 模板', 'nodes.ports.prompt', 'control.prompt'),
  optionalControl('temperature', '温度', 'nodes.ports.temperature', 'control.temperature'),
  optionalControl('max-tokens', '最大输出 Tokens', 'nodes.ports.maxTokens', 'control.max-tokens'),
  optionalControl('word-count', '期望字数', 'nodes.ports.wordCount', 'control.word-count'),
  optionalControl('context-budget', '上下文预算', 'nodes.ports.contextBudget', 'control.context-budget'),
  optionalControl('candidate-count', '候选数量', 'nodes.ports.candidateCount', 'control.count'),
]

const candidateOutput = (
  semantic: AuthoringSemantic,
  cardinality: 'one' | 'many' = 'one',
): AuthoringPortI18n => ({
  id: 'candidate',
  label: '候选内容',
  labelKey: 'nodes.ports.candidate',
  semantic,
  cardinality,
  state: 'candidate',
})

function fieldTemplate(input: FieldTemplateInput): AuthoringNodeTemplateI18n {
  return {
    id: input.id,
    version: 1,
    label: input.label,
    labelKey: input.labelKey,
    description: input.description,
    descriptionKey: input.descriptionKey,
    category: input.category,
    categoryKey: input.categoryKey,
    class: 'content',
    capability: 'generate-field',
    inputs: generationInputs(),
    outputs: [candidateOutput(input.semantic)],
    reads: { sourceKeys: [input.sourceKey], allowExactFields: true },
    writes: { target: input.target, fields: [input.field], mode: 'replace' },
    promptModuleKey: input.promptModuleKey,
    recommendedBefore: input.recommendedBefore,
    recommendedAfter: input.recommendedAfter,
  }
}

function collectionTemplate(input: {
  id: string
  label: string
  labelKey: string
  description: string
  descriptionKey: string
  category: string
  categoryKey: string
  semantic: AuthoringSemantic
  cardinality?: 'one' | 'many'
  sourceKeys: string[]
  writes?: AuthoringWriteContract
  promptModuleKey: PromptModuleKey
  extraInputs?: AuthoringPortI18n[]
  parameters?: AuthoringParameterI18n[]
  recommendedBefore?: string[]
  recommendedAfter?: string[]
}): AuthoringNodeTemplateI18n {
  return {
    id: input.id,
    version: 1,
    label: input.label,
    labelKey: input.labelKey,
    description: input.description,
    descriptionKey: input.descriptionKey,
    category: input.category,
    categoryKey: input.categoryKey,
    class: 'content',
    capability: 'generate-collection',
    inputs: [...generationInputs(), ...(input.extraInputs ?? [])],
    outputs: [candidateOutput(input.semantic, input.cardinality)],
    reads: { sourceKeys: input.sourceKeys, allowExactFields: true },
    writes: input.writes,
    promptModuleKey: input.promptModuleKey,
    parameters: input.parameters,
    recommendedBefore: input.recommendedBefore,
    recommendedAfter: input.recommendedAfter,
  }
}

const WORLD_FIELDS: FieldTemplateInput[] = [
  { id: 'world.origin', label: '世界来源', labelKey: 'nodes.templates.worldOrigin.label', description: '世界、文明或时代从何而来。', descriptionKey: 'nodes.templates.worldOrigin.description', category: '世界观/起源', categoryKey: 'nodes.categories.worldviewOrigin', target: 'worldviews', field: 'worldOrigin', sourceKey: 'worldview', semantic: 'world.setting', promptModuleKey: 'worldview.dimension', recommendedAfter: ['story.concept', 'world.structure'] },
  { id: 'world.power', label: '力量体系', labelKey: 'nodes.templates.worldPower.label', description: '力量来源、层级、规则与限制。', descriptionKey: 'nodes.templates.worldPower.description', category: '世界观/起源', categoryKey: 'nodes.categories.worldviewOrigin', target: 'worldviews', field: 'powerHierarchy', sourceKey: 'worldview', semantic: 'world.rule', promptModuleKey: 'worldview.dimension' },
  { id: 'world.divinity', label: '神明与信仰', labelKey: 'nodes.templates.worldDivinity.label', description: '神明、宗教、权柄与信仰边界。', descriptionKey: 'nodes.templates.worldDivinity.description', category: '世界观/起源', categoryKey: 'nodes.categories.worldviewOrigin', target: 'worldviews', field: 'divineDesign', sourceKey: 'worldview', semantic: 'world.rule', promptModuleKey: 'worldview.dimension' },
  { id: 'world.structure', label: '世界结构', labelKey: 'nodes.templates.worldStructure.label', description: '星球、大陆、位面与空间层级。', descriptionKey: 'nodes.templates.worldStructure.description', category: '世界观/自然', categoryKey: 'nodes.categories.worldviewNature', target: 'worldviews', field: 'worldStructure', sourceKey: 'worldview', semantic: 'world.setting', promptModuleKey: 'worldview.dimension', recommendedAfter: ['world.dimensions', 'world.terrain'] },
  { id: 'world.dimensions', label: '疆域尺寸', labelKey: 'nodes.templates.worldDimensions.label', description: '世界与核心区域的范围和尺度。', descriptionKey: 'nodes.templates.worldDimensions.description', category: '世界观/自然', categoryKey: 'nodes.categories.worldviewNature', target: 'worldviews', field: 'worldDimensions', sourceKey: 'worldview', semantic: 'world.setting', promptModuleKey: 'worldview.dimension' },
  { id: 'world.terrain', label: '地貌分布', labelKey: 'nodes.templates.worldTerrain.label', description: '大陆、山脉、平原和盆地的分布。', descriptionKey: 'nodes.templates.worldTerrain.description', category: '世界观/自然', categoryKey: 'nodes.categories.worldviewNature', target: 'worldviews', field: 'continentLayout', sourceKey: 'worldview', semantic: 'world.location', promptModuleKey: 'worldview.dimension', recommendedAfter: ['world.waterways', 'world.climate', 'entity.location'] },
  { id: 'world.region-size', label: '行政区域与城池', labelKey: 'nodes.templates.worldRegionSize.label', description: '区域面积、行政层级与核心城池。', descriptionKey: 'nodes.templates.worldRegionSize.description', category: '世界观/人文', categoryKey: 'nodes.categories.worldviewHumanity', target: 'worldviews', field: 'regionDimensions', sourceKey: 'worldview', semantic: 'world.location', promptModuleKey: 'worldview.dimension' },
  { id: 'world.waterways', label: '山川水系', labelKey: 'nodes.templates.worldWaterways.label', description: '山脉、河流、湖泊、运河和水路。', descriptionKey: 'nodes.templates.worldWaterways.description', category: '世界观/自然', categoryKey: 'nodes.categories.worldviewNature', target: 'worldviews', field: 'mountainsRivers', sourceKey: 'worldview', semantic: 'world.location', promptModuleKey: 'worldview.dimension' },
  { id: 'world.climate', label: '气候环境', labelKey: 'nodes.templates.worldClimate.label', description: '区域气候、季节与自然灾害。', descriptionKey: 'nodes.templates.worldClimate.description', category: '世界观/自然', categoryKey: 'nodes.categories.worldviewNature', target: 'worldviews', field: 'climateByRegion', sourceKey: 'worldview', semantic: 'world.setting', promptModuleKey: 'worldview.dimension' },
  { id: 'world.resources-overview', label: '自然资源', labelKey: 'nodes.templates.worldResourcesOverview.label', description: '资源分布、丰饶程度与总体特点。', descriptionKey: 'nodes.templates.worldResourcesOverview.description', category: '世界观/自然', categoryKey: 'nodes.categories.worldviewNature', target: 'worldviews', field: 'naturalResourceOverview', sourceKey: 'worldview', semantic: 'world.setting', promptModuleKey: 'worldview.dimension' },
  { id: 'world.resources-detail', label: '自然资源细分', labelKey: 'nodes.templates.worldResourcesDetail.label', description: '异兽、作物、药材、矿产和特产。', descriptionKey: 'nodes.templates.worldResourcesDetail.description', category: '世界观/自然', categoryKey: 'nodes.categories.worldviewNature', target: 'worldviews', field: 'naturalResources', sourceKey: 'worldview', semantic: 'world.setting', promptModuleKey: 'worldview.dimension' },
  { id: 'world.history', label: '世界历史线', labelKey: 'nodes.templates.worldHistory.label', description: '王朝、文明、灾变与关键时代。', descriptionKey: 'nodes.templates.worldHistory.description', category: '世界观/历史', categoryKey: 'nodes.categories.worldviewHistory', target: 'worldviews', field: 'historyLine', sourceKey: 'historical', semantic: 'world.history', promptModuleKey: 'worldview.dimension' },
  { id: 'world.events', label: '世界大事记', labelKey: 'nodes.templates.worldEvents.label', description: '对当前世界有长期影响的重大事件。', descriptionKey: 'nodes.templates.worldEvents.description', category: '世界观/历史', categoryKey: 'nodes.categories.worldviewHistory', target: 'worldviews', field: 'worldEvents', sourceKey: 'historical', semantic: 'world.history', promptModuleKey: 'worldview.dimension' },
  { id: 'world.races', label: '种族与民族', labelKey: 'nodes.templates.worldRaces.label', description: '人群特征、历史、能力与关系。', descriptionKey: 'nodes.templates.worldRaces.description', category: '世界观/人文', categoryKey: 'nodes.categories.worldviewHumanity', target: 'worldviews', field: 'races', sourceKey: 'worldview', semantic: 'world.setting', promptModuleKey: 'worldview.dimension' },
  { id: 'world.factions', label: '势力分布', labelKey: 'nodes.templates.worldFactions.label', description: '国家、门派、组织和阵营格局。', descriptionKey: 'nodes.templates.worldFactions.description', category: '世界观/人文', categoryKey: 'nodes.categories.worldviewHumanity', target: 'worldviews', field: 'factionLayout', sourceKey: 'worldview', semantic: 'world.setting', promptModuleKey: 'worldview.dimension', recommendedAfter: ['story.conflict', 'character.profile'] },
  { id: 'world.politics', label: '政治制度', labelKey: 'nodes.templates.worldPolitics.label', description: '政体、官制、法律、军事与外交。', descriptionKey: 'nodes.templates.worldPolitics.description', category: '世界观/人文', categoryKey: 'nodes.categories.worldviewHumanity', target: 'worldviews', field: 'politicsOverview', sourceKey: 'worldview', semantic: 'world.setting', promptModuleKey: 'worldview.dimension' },
  { id: 'world.economy', label: '经济制度', labelKey: 'nodes.templates.worldEconomy.label', description: '货币、税赋、贸易、产业和资源分配。', descriptionKey: 'nodes.templates.worldEconomy.description', category: '世界观/人文', categoryKey: 'nodes.categories.worldviewHumanity', target: 'worldviews', field: 'economyOverview', sourceKey: 'worldview', semantic: 'world.setting', promptModuleKey: 'worldview.dimension' },
  { id: 'world.culture', label: '文化制度', labelKey: 'nodes.templates.worldCulture.label', description: '语言、教育、礼仪、节庆、艺术和禁忌。', descriptionKey: 'nodes.templates.worldCulture.description', category: '世界观/人文', categoryKey: 'nodes.categories.worldviewHumanity', target: 'worldviews', field: 'cultureOverview', sourceKey: 'worldview', semantic: 'world.setting', promptModuleKey: 'worldview.dimension' },
  { id: 'world.conflicts', label: '社会矛盾', labelKey: 'nodes.templates.worldConflicts.label', description: '阶层、制度、族群与外部冲突。', descriptionKey: 'nodes.templates.worldConflicts.description', category: '世界观/人文', categoryKey: 'nodes.categories.worldviewHumanity', target: 'worldviews', field: 'internalConflicts', sourceKey: 'worldview', semantic: 'story.conflict', promptModuleKey: 'worldview.dimension', recommendedAfter: ['story.conflict', 'story.main-plot'] },
  { id: 'world.items', label: '道具与器物体系', labelKey: 'nodes.templates.worldItems.label', description: '武器、法器、工具和科技装备的规则。', descriptionKey: 'nodes.templates.worldItems.description', category: '世界观/人文', categoryKey: 'nodes.categories.worldviewHumanity', target: 'worldviews', field: 'itemDesign', sourceKey: 'worldview', semantic: 'world.setting', promptModuleKey: 'worldview.dimension' },
]

const STORY_FIELDS: FieldTemplateInput[] = [
  { id: 'story.logline', label: '一句话故事', labelKey: 'nodes.templates.storyLogline.label', description: '用一句话概括主角、目标、阻力与结果方向。', descriptionKey: 'nodes.templates.storyLogline.description', category: '故事设计', categoryKey: 'nodes.categories.storyDesign', target: 'storyCores', field: 'logline', sourceKey: 'storyCore', semantic: 'text', promptModuleKey: 'story.core' },
  { id: 'story.concept', label: '故事概念', labelKey: 'nodes.templates.storyConcept.label', description: '作品最核心的独特设定或反差。', descriptionKey: 'nodes.templates.storyConcept.description', category: '故事设计', categoryKey: 'nodes.categories.storyDesign', target: 'storyCores', field: 'concept', sourceKey: 'storyCore', semantic: 'story.theme', promptModuleKey: 'story.core', recommendedBefore: ['world.origin'], recommendedAfter: ['story.theme', 'story.conflict'] },
  { id: 'story.theme', label: '故事主题', labelKey: 'nodes.templates.storyTheme.label', description: '作品要探讨的人性与价值命题。', descriptionKey: 'nodes.templates.storyTheme.description', category: '故事设计', categoryKey: 'nodes.categories.storyDesign', target: 'storyCores', field: 'theme', sourceKey: 'storyCore', semantic: 'story.theme', promptModuleKey: 'story.core', recommendedAfter: ['story.conflict', 'outline.volume'] },
  { id: 'story.conflict', label: '核心冲突', labelKey: 'nodes.templates.storyConflict.label', description: '主角面对的外在和内在矛盾。', descriptionKey: 'nodes.templates.storyConflict.description', category: '故事设计', categoryKey: 'nodes.categories.storyDesign', target: 'storyCores', field: 'centralConflict', sourceKey: 'storyCore', semantic: 'story.conflict', promptModuleKey: 'story.core', recommendedAfter: ['story.main-plot', 'character.profile'] },
  { id: 'story.pattern', label: '故事模式', labelKey: 'nodes.templates.storyPattern.label', description: '线性、多线、单元剧或其它结构方式。', descriptionKey: 'nodes.templates.storyPattern.description', category: '故事设计', categoryKey: 'nodes.categories.storyDesign', target: 'storyCores', field: 'plotPattern', sourceKey: 'storyCore', semantic: 'story.arc', promptModuleKey: 'story.core' },
  { id: 'story.main-plot', label: '故事主线', labelKey: 'nodes.templates.storyMainPlot.label', description: '主要目标、阻碍、升级和结局方向。', descriptionKey: 'nodes.templates.storyMainPlot.description', category: '故事设计', categoryKey: 'nodes.categories.storyDesign', target: 'storyCores', field: 'mainPlot', sourceKey: 'storyCore', semantic: 'story.arc', promptModuleKey: 'story.core', recommendedAfter: ['outline.volume'] },
  { id: 'story.sub-plots', label: '故事复线', labelKey: 'nodes.templates.storySubPlots.label', description: '感情线、角色线、阵营线和暗线。', descriptionKey: 'nodes.templates.storySubPlots.description', category: '故事设计', categoryKey: 'nodes.categories.storyDesign', target: 'storyCores', field: 'subPlots', sourceKey: 'storyCore', semantic: 'story.arc', promptModuleKey: 'story.core', recommendedAfter: ['story.arc'] },
]

/** 角色维度分组 → 分类键(分类文案 `角色/<分组名>` 中的分组键)。 */
const CHARACTER_GROUP_CATEGORY_KEYS: Record<string, string> = {
  identity: 'nodes.categories.characterIdentity',
  personalityCore: 'nodes.categories.characterPersonalityCore',
  drive: 'nodes.categories.characterDrive',
  background: 'nodes.categories.characterBackground',
  abilities: 'nodes.categories.characterAbilities',
  vividDetails: 'nodes.categories.characterVividDetails',
  growth: 'nodes.categories.characterGrowth',
  plotFunction: 'nodes.categories.characterPlotFunction',
}

const CHARACTER_FIELD_TEMPLATES = CHARACTER_DIMENSIONS.map(dimension => {
  const keyBase = `characterField${dimension.key.charAt(0).toUpperCase()}${dimension.key.slice(1)}`
  return fieldTemplate({
    id: `character.field.${dimension.key}`,
    label: getDimensionLabel(dimension.key),
    labelKey: `nodes.templates.${keyBase}.label`,
    description: `角色维度：${getDimensionGroupLabel(dimension.groupKey)}。`,
    descriptionKey: `nodes.characterDimensionDescriptions.${dimension.groupKey}`,
    category: `角色/${getDimensionGroupLabel(dimension.groupKey)}`,
    categoryKey: CHARACTER_GROUP_CATEGORY_KEYS[dimension.groupKey],
    target: 'characters',
    field: dimension.key,
    sourceKey: 'characters',
    semantic: 'character.profile',
    promptModuleKey: 'character.dimension',
    recommendedBefore: ['character.profile'],
  })
})

const CONTENT_TEMPLATES: AuthoringNodeTemplateI18n[] = [
  ...WORLD_FIELDS.map(fieldTemplate),
  ...STORY_FIELDS.map(fieldTemplate),
  ...CHARACTER_FIELD_TEMPLATES,
  collectionTemplate({
    id: 'character.profile',
    label: '角色档案',
    labelKey: 'nodes.templates.characterProfile.label',
    description: '创建或补全主要角色、次要角色、NPC 与路人。',
    descriptionKey: 'nodes.templates.characterProfile.description',
    category: '角色/主体',
    categoryKey: 'nodes.categories.characterMain',
    semantic: 'character.profile',
    sourceKeys: ['characters', 'worldview', 'storyCore'],
    writes: { target: 'characters', mode: 'add' },
    promptModuleKey: 'character.generate',
    parameters: [{ key: 'request', label: '生成要求', labelKey: 'nodes.params.generateRequest', type: 'text', defaultValue: '' }],
    recommendedBefore: ['world.factions', 'story.conflict'],
    recommendedAfter: ['character.field.motivation', 'character.relation', 'outline.volume'],
  }),
  collectionTemplate({
    id: 'entity.location',
    label: '重要地点',
    labelKey: 'nodes.templates.entityLocation.label',
    description: '城市、区域、建筑、秘境或其它地点实体。',
    descriptionKey: 'nodes.templates.entityLocation.description',
    category: '世界观/地理实体',
    categoryKey: 'nodes.categories.worldviewGeoEntities',
    semantic: 'world.location',
    sourceKeys: ['locations', 'worldview'],
    writes: { target: 'importantLocations', mode: 'add' },
    promptModuleKey: 'worldview.worldbuilding',
  }),
  collectionTemplate({
    id: 'story.arc',
    label: '故事线',
    labelKey: 'nodes.templates.storyArc.label',
    description: '主线、支线及其阶段。',
    descriptionKey: 'nodes.templates.storyArc.description',
    category: '故事设计/故事线',
    categoryKey: 'nodes.categories.storyDesignArcs',
    semantic: 'story.arc',
    sourceKeys: ['storyArcs', 'storyCore', 'characters'],
    writes: { target: 'storyArcs', mode: 'add' },
    promptModuleKey: 'outline.plot',
    recommendedAfter: ['outline.volume'],
  }),
  collectionTemplate({
    id: 'character.relation',
    label: '角色关系',
    labelKey: 'nodes.templates.characterRelation.label',
    description: '两个角色之间的关系类型、描述与方向。',
    descriptionKey: 'nodes.templates.characterRelation.description',
    category: '角色/关系',
    categoryKey: 'nodes.categories.characterRelations',
    semantic: 'character.relation',
    sourceKeys: ['characterRelations', 'characters'],
    writes: { target: 'characterRelations', mode: 'add' },
    promptModuleKey: 'relation.extract',
  }),
  collectionTemplate({
    id: 'outline.volume',
    label: '卷纲',
    labelKey: 'nodes.templates.outlineVolume.label',
    description: '生成或维护全书卷级结构。',
    descriptionKey: 'nodes.templates.outlineVolume.description',
    category: '大纲',
    categoryKey: 'nodes.categories.outline',
    semantic: 'outline.volume',
    cardinality: 'many',
    sourceKeys: ['worldview', 'storyCore', 'characters', 'storyArcs', 'existingVolumeOutlines'],
    writes: { target: 'outlineNodes', mode: 'add-many' },
    promptModuleKey: 'outline.volume',
    parameters: [{ key: 'request', label: '生成要求', labelKey: 'nodes.params.generateRequest', type: 'text', defaultValue: '' }],
    extraInputs: [optionalControl('volume-count', '卷数', 'nodes.ports.volumeCount', 'control.volume-count')],
    recommendedAfter: ['outline.chapter'],
  }),
  collectionTemplate({
    id: 'outline.chapter',
    label: '章节大纲',
    labelKey: 'nodes.templates.outlineChapter.label',
    description: '为卷生成章节结构和章纲摘要。',
    descriptionKey: 'nodes.templates.outlineChapter.description',
    category: '大纲',
    categoryKey: 'nodes.categories.outline',
    semantic: 'outline.chapter',
    cardinality: 'many',
    sourceKeys: ['worldview', 'storyCore', 'characters', 'storyArcs', 'existingVolumeOutlines'],
    writes: { target: 'outlineNodes', mode: 'add-many' },
    promptModuleKey: 'outline.chapter',
    parameters: [
      { key: 'request', label: '生成要求', labelKey: 'nodes.params.generateRequest', type: 'text', defaultValue: '' },
      { key: 'volumeTitle', label: '所属卷标题', labelKey: 'nodes.params.volumeTitle', type: 'text', defaultValue: '' },
    ],
    extraInputs: [
      { id: 'volume', label: '所属卷候选', labelKey: 'nodes.ports.volumeCandidate', semantic: 'outline.volume', cardinality: 'many', state: 'any', required: true },
      optionalControl('chapter-count', '章节数', 'nodes.ports.chapterCount', 'control.chapter-count'),
    ],
    recommendedAfter: ['outline.plan', 'chapter.prose'],
  }),
  collectionTemplate({
    id: 'outline.plan',
    label: '章节细纲',
    labelKey: 'nodes.templates.outlinePlan.label',
    description: '场景、人物、伏笔、开篇钩子与结尾悬念。',
    descriptionKey: 'nodes.templates.outlinePlan.description',
    category: '大纲/细纲',
    categoryKey: 'nodes.categories.outlineDetail',
    semantic: 'outline.plan',
    sourceKeys: ['chapterOutline', 'detailedOutline', 'characters', 'foreshadows'],
    writes: { target: 'detailedOutlines', mode: 'replace' },
    promptModuleKey: 'detail.chapter-planning',
    parameters: [
      { key: 'request', label: '生成要求', labelKey: 'nodes.params.generateRequest', type: 'text', defaultValue: '' },
      { key: 'chapterTitle', label: '目标章节标题', labelKey: 'nodes.params.targetChapterTitle', type: 'text', defaultValue: '' },
    ],
    extraInputs: [{ id: 'chapter', label: '章节候选', labelKey: 'nodes.ports.chapterCandidate', semantic: 'outline.chapter', cardinality: 'many', state: 'any', required: true }],
    recommendedAfter: ['chapter.prose'],
  }),
  collectionTemplate({
    id: 'chapter.prose',
    label: '章节正文',
    labelKey: 'nodes.templates.chapterProse.label',
    description: '根据章纲和明确上游设定生成正文候选。',
    descriptionKey: 'nodes.templates.chapterProse.description',
    category: '正文',
    categoryKey: 'nodes.categories.prose',
    semantic: 'chapter.prose',
    sourceKeys: ['chapterOutline', 'detailedOutline', 'worldview', 'storyCore', 'characters', 'creativeRules', 'foreshadows', 'retrievedPassages'],
    writes: { target: 'chapters', fields: ['content'], mode: 'replace' },
    promptModuleKey: 'chapter.content',
    parameters: [
      { key: 'request', label: '生成要求', labelKey: 'nodes.params.generateRequest', type: 'text', defaultValue: '' },
      { key: 'chapterTitle', label: '目标章节标题', labelKey: 'nodes.params.targetChapterTitle', type: 'text', defaultValue: '' },
    ],
    extraInputs: [{ id: 'plan', label: '章节计划', labelKey: 'nodes.ports.chapterPlan', semantic: 'outline.plan', cardinality: 'one', state: 'any', required: false }],
    recommendedAfter: ['chapter.organize'],
  }),
  collectionTemplate({
    id: 'continuity.foreshadow',
    label: '伏笔',
    labelKey: 'nodes.templates.continuityForeshadow.label',
    description: '设计、埋设、呼应和回收叙事承诺。',
    descriptionKey: 'nodes.templates.continuityForeshadow.description',
    category: '连续性',
    categoryKey: 'nodes.categories.continuity',
    semantic: 'continuity.foreshadow',
    sourceKeys: ['foreshadows', 'outlineTree', 'storyCore', 'chapterContent'],
    writes: { target: 'foreshadows', mode: 'add' },
    promptModuleKey: 'foreshadow.generate',
    parameters: [
      { key: 'request', label: '整理要求', labelKey: 'nodes.params.organizeRequest', type: 'text', defaultValue: '' },
      { key: 'chapterTitle', label: '目标章节标题', labelKey: 'nodes.params.targetChapterTitle', type: 'text', defaultValue: '' },
    ],
  }),
]

/**
 * FLOW-3D 连续性节点目录。
 *
 * 这些节点只描述编排契约；正文、事实账本、认知账本和事件流水仍由各自
 * 的既有 parser / adoption extension 写回，避免在节点层复制第二套 Canon。
 */
const CONTINUITY_TEMPLATES: AuthoringNodeTemplateI18n[] = [
  collectionTemplate({
    id: 'continuity.storyline',
    label: '故事线',
    labelKey: 'nodes.templates.continuityStoryline.label',
    description: '登记主线、支线及其阶段，并观察章节对故事线的推进。',
    descriptionKey: 'nodes.templates.continuityStoryline.description',
    category: '连续性/故事线',
    categoryKey: 'nodes.categories.continuityStoryline',
    semantic: 'story.arc',
    sourceKeys: ['storyArcs', 'storyCore', 'characters', 'outlineTree', 'chapterContent'],
    writes: { target: 'storyArcs', mode: 'add' },
    promptModuleKey: 'outline.plot',
    parameters: [
      { key: 'request', label: '故事线要求', labelKey: 'nodes.params.storylineRequest', type: 'text', defaultValue: '' },
      { key: 'chapterTitle', label: '参考章节标题', labelKey: 'nodes.params.referenceChapterTitle', type: 'text', defaultValue: '' },
    ],
    recommendedAfter: ['outline.volume', 'chapter.organize'],
  }),
  collectionTemplate({
    id: 'continuity.location',
    label: '地点',
    labelKey: 'nodes.templates.continuityLocation.label',
    description: '创建地点实体，补充地点关系和章节中的地理连续性。',
    descriptionKey: 'nodes.templates.continuityLocation.description',
    category: '连续性/世界状态',
    categoryKey: 'nodes.categories.continuityWorldState',
    semantic: 'continuity.location',
    sourceKeys: ['locations', 'worldview', 'chapterContent', 'outlineTree'],
    writes: { target: 'importantLocations', mode: 'add' },
    promptModuleKey: 'worldview.worldbuilding',
    parameters: [
      { key: 'request', label: '地点要求', labelKey: 'nodes.params.locationRequest', type: 'text', defaultValue: '' },
      { key: 'chapterTitle', label: '参考章节标题', labelKey: 'nodes.params.referenceChapterTitle', type: 'text', defaultValue: '' },
    ],
    recommendedAfter: ['world.terrain', 'chapter.organize'],
  }),
  collectionTemplate({
    id: 'continuity.state',
    label: '状态',
    labelKey: 'nodes.templates.continuityState.label',
    description: '建立或更新角色、地点、物品和势力的状态卡。',
    descriptionKey: 'nodes.templates.continuityState.description',
    category: '连续性/世界状态',
    categoryKey: 'nodes.categories.continuityWorldState',
    semantic: 'continuity.state',
    sourceKeys: ['stateCards', 'currentFacts', 'characters', 'locations', 'chapterContent'],
    writes: { target: 'stateCards', mode: 'add' },
    promptModuleKey: 'chapter.continuity',
    parameters: [
      { key: 'request', label: '状态要求', labelKey: 'nodes.params.stateRequest', type: 'text', defaultValue: '' },
      { key: 'chapterTitle', label: '参考章节标题', labelKey: 'nodes.params.referenceChapterTitle', type: 'text', defaultValue: '' },
    ],
    recommendedAfter: ['character.profile', 'continuity.location', 'chapter.organize'],
  }),
  collectionTemplate({
    id: 'continuity.item',
    label: '物品流水',
    labelKey: 'nodes.templates.continuityItem.label',
    description: '记录角色获得、消耗和转移物品的事件，保留章节证据。',
    descriptionKey: 'nodes.templates.continuityItem.description',
    category: '连续性/世界状态',
    categoryKey: 'nodes.categories.continuityWorldState',
    semantic: 'continuity.item',
    sourceKeys: ['itemLedger', 'characters', 'chapterContent', 'heldItems'],
    writes: { target: 'itemLedger', mode: 'add-many' },
    promptModuleKey: 'inventory.extract',
    parameters: [
      { key: 'request', label: '物品整理要求', labelKey: 'nodes.params.itemLedgerRequest', type: 'text', defaultValue: '' },
      { key: 'chapterTitle', label: '目标章节标题', labelKey: 'nodes.params.targetChapterTitle', type: 'text', defaultValue: '' },
    ],
    recommendedAfter: ['chapter.prose', 'chapter.organize'],
  }),
  collectionTemplate({
    id: 'continuity.fact',
    label: '事实',
    labelKey: 'nodes.templates.continuityFact.label',
    description: '从正文抽取受控谓词事实，先作为候选等待作者确认。',
    descriptionKey: 'nodes.templates.continuityFact.description',
    category: '连续性/世界状态',
    categoryKey: 'nodes.categories.continuityWorldState',
    semantic: 'continuity.fact',
    sourceKeys: ['currentFacts', 'canonAssertions', 'characters', 'locations', 'chapterContent'],
    promptModuleKey: 'chapter.continuity',
    parameters: [
      { key: 'request', label: '事实整理要求', labelKey: 'nodes.params.factRequest', type: 'text', defaultValue: '' },
      { key: 'chapterTitle', label: '目标章节标题', labelKey: 'nodes.params.targetChapterTitle', type: 'text', defaultValue: '' },
    ],
    recommendedAfter: ['chapter.prose', 'chapter.organize'],
  }),
  collectionTemplate({
    id: 'continuity.knowledge',
    label: '角色认知',
    labelKey: 'nodes.templates.continuityKnowledge.label',
    description: '记录角色在章节中的获知、误知、遗忘和纠正。',
    descriptionKey: 'nodes.templates.continuityKnowledge.description',
    category: '连续性/角色状态',
    categoryKey: 'nodes.categories.continuityCharacterState',
    semantic: 'continuity.knowledge',
    sourceKeys: ['characterKnowledge', 'currentFacts', 'characters', 'chapterContent'],
    writes: { target: 'knowledgeLedger', mode: 'add-many' },
    promptModuleKey: 'chapter.continuity',
    parameters: [
      { key: 'request', label: '认知整理要求', labelKey: 'nodes.params.knowledgeRequest', type: 'text', defaultValue: '' },
      { key: 'chapterTitle', label: '目标章节标题', labelKey: 'nodes.params.targetChapterTitle', type: 'text', defaultValue: '' },
    ],
    recommendedAfter: ['chapter.prose', 'chapter.organize'],
  }),
  collectionTemplate({
    id: 'continuity.timeline',
    label: '故事年表',
    labelKey: 'nodes.templates.continuityTimeline.label',
    description: '抽取改变剧情进程的关键事件并按章节保留来源。',
    descriptionKey: 'nodes.templates.continuityTimeline.description',
    category: '连续性/时间线',
    categoryKey: 'nodes.categories.continuityTimeline',
    semantic: 'continuity.timeline',
    sourceKeys: ['storyTimeline', 'storyArcs', 'chapterContent', 'outlineTree'],
    writes: { target: 'storyTimelineEvents', mode: 'add-many' },
    promptModuleKey: 'story-timeline.extract',
    parameters: [
      { key: 'request', label: '年表整理要求', labelKey: 'nodes.params.timelineRequest', type: 'text', defaultValue: '' },
      { key: 'chapterTitle', label: '目标章节标题', labelKey: 'nodes.params.targetChapterTitle', type: 'text', defaultValue: '' },
    ],
    recommendedAfter: ['chapter.prose', 'chapter.organize'],
  }),
  {
    id: 'chapter.organize',
    version: 1,
    label: '整理本章',
    labelKey: 'nodes.templates.chapterOrganize.label',
    description: '从已确认正文一次生成状态、事实、物品、年表、关系和伏笔六域候选。',
    descriptionKey: 'nodes.templates.chapterOrganize.description',
    category: '连续性/写后整理',
    categoryKey: 'nodes.categories.continuityPostWrite',
    class: 'content',
    capability: 'generate-collection',
    inputs: [
      ...generationInputs(),
      { id: 'chapter', label: '目标章节', labelKey: 'nodes.ports.targetChapter', semantic: 'chapter.prose', cardinality: 'one', state: 'any', required: true },
    ],
    outputs: [{ id: 'candidate', label: '六域候选', labelKey: 'nodes.ports.sixDomainCandidate', semantic: 'continuity.report', cardinality: 'one', state: 'candidate' }],
    reads: {
      sourceKeys: [
        'chapterContent', 'stateCards', 'currentFacts', 'characters', 'itemLedger',
        'characterRelations', 'foreshadows', 'storyTimeline', 'storyArcs',
        'storylineProgress', 'characterKnowledge', 'previousChapterEnding',
        'chapterContinuityHandoff', 'recentChapterSummaries', 'consistencyDossier', 'retrievedPassages',
      ],
      allowExactFields: true,
    },
    promptModuleKey: 'chapter.continuity',
    parameters: [
      { key: 'chapterTitle', label: '目标章节标题', labelKey: 'nodes.params.targetChapterTitle', type: 'text', defaultValue: '' },
    ],
    recommendedAfter: ['continuity.state', 'continuity.fact', 'continuity.item', 'continuity.timeline', 'continuity.knowledge', 'continuity.foreshadow'],
  },
]

const CONTINUITY_CONTEXT_TEMPLATES: AuthoringNodeTemplateI18n[] = [
  {
    id: 'context.previous-ending',
    version: 1,
    label: '前章结尾',
    labelKey: 'nodes.templates.contextPreviousEnding.label',
    description: '只读读取目标章节之前一章的正文尾部。',
    descriptionKey: 'nodes.templates.contextPreviousEnding.description',
    category: '连续性/只读上下文',
    categoryKey: 'nodes.categories.continuityReadonlyContext',
    class: 'content',
    capability: 'read-canon',
    inputs: [],
    outputs: [{ id: 'context', label: '前章结尾', labelKey: 'nodes.ports.previousEnding', semantic: 'text', cardinality: 'one', state: 'canon' }],
    reads: { sourceKeys: ['previousChapterEnding'] },
    parameters: [{ key: 'chapterTitle', label: '目标章节标题', labelKey: 'nodes.params.targetChapterTitle', type: 'text', defaultValue: '' }],
  },
  {
    id: 'context.handoff',
    version: 1,
    label: '连续性交接',
    labelKey: 'nodes.templates.contextHandoff.label',
    description: '只读读取目标章节的前章 handoff 和计划对账。',
    descriptionKey: 'nodes.templates.contextHandoff.description',
    category: '连续性/只读上下文',
    categoryKey: 'nodes.categories.continuityReadonlyContext',
    class: 'content',
    capability: 'read-canon',
    inputs: [],
    outputs: [{ id: 'context', label: '连续性交接', labelKey: 'nodes.ports.continuityHandoff', semantic: 'text', cardinality: 'one', state: 'canon' }],
    reads: { sourceKeys: ['chapterContinuityHandoff', 'previousPlanReconciliation'] },
    parameters: [{ key: 'chapterTitle', label: '目标章节标题', labelKey: 'nodes.params.targetChapterTitle', type: 'text', defaultValue: '' }],
  },
  {
    id: 'context.recent-summaries',
    version: 1,
    label: '最近摘要',
    labelKey: 'nodes.templates.contextRecentSummaries.label',
    description: '只读读取当前世界最近已验证的章节摘要。',
    descriptionKey: 'nodes.templates.contextRecentSummaries.description',
    category: '连续性/只读上下文',
    categoryKey: 'nodes.categories.continuityReadonlyContext',
    class: 'content',
    capability: 'read-canon',
    inputs: [],
    outputs: [{ id: 'context', label: '最近摘要', labelKey: 'nodes.ports.recentSummaries', semantic: 'text', cardinality: 'many', state: 'canon' }],
    reads: { sourceKeys: ['recentChapterSummaries'] },
    parameters: [{ key: 'chapterTitle', label: '目标章节标题', labelKey: 'nodes.params.targetChapterTitle', type: 'text', defaultValue: '' }],
  },
  {
    id: 'context.related-passages',
    version: 1,
    label: '相关前文',
    labelKey: 'nodes.templates.contextRelatedPassages.label',
    description: '只读读取与目标章节相关的前文检索片段。',
    descriptionKey: 'nodes.templates.contextRelatedPassages.description',
    category: '连续性/只读上下文',
    categoryKey: 'nodes.categories.continuityReadonlyContext',
    class: 'content',
    capability: 'read-canon',
    inputs: [],
    outputs: [{ id: 'context', label: '相关前文', labelKey: 'nodes.ports.relatedPassages', semantic: 'text', cardinality: 'many', state: 'canon' }],
    reads: { sourceKeys: ['retrievedPassages'] },
    parameters: [{ key: 'chapterTitle', label: '目标章节标题', labelKey: 'nodes.params.targetChapterTitle', type: 'text', defaultValue: '' }],
  },
  {
    id: 'context.consistency-report',
    version: 1,
    label: '一致性报告',
    labelKey: 'nodes.templates.contextConsistencyReport.label',
    description: '只读读取当前章节已有的一致性检查结果和影响提示。',
    descriptionKey: 'nodes.templates.contextConsistencyReport.description',
    category: '连续性/只读上下文',
    categoryKey: 'nodes.categories.continuityReadonlyContext',
    class: 'content',
    capability: 'read-canon',
    inputs: [],
    outputs: [{ id: 'context', label: '一致性报告', labelKey: 'nodes.ports.consistencyReport', semantic: 'continuity.report', cardinality: 'many', state: 'canon' }],
    reads: { sourceKeys: ['consistencyReport'] },
    parameters: [{ key: 'chapterTitle', label: '目标章节标题', labelKey: 'nodes.params.targetChapterTitle', type: 'text', defaultValue: '' }],
  },
]

function controlTemplate(input: {
  id: string
  label: string
  labelKey: string
  description: string
  descriptionKey: string
  semantic: AuthoringSemantic
  parameter: AuthoringParameterI18n
}): AuthoringNodeTemplateI18n {
  return {
    id: input.id,
    version: 1,
    label: input.label,
    labelKey: input.labelKey,
    description: input.description,
    descriptionKey: input.descriptionKey,
    category: '执行控制',
    categoryKey: 'nodes.categories.executionControl',
    class: 'control',
    capability: 'manual-draft',
    inputs: [],
    outputs: [{ id: 'value', label: input.label, labelKey: input.labelKey, semantic: input.semantic, cardinality: 'one', state: 'control' }],
    parameters: [input.parameter],
  }
}

const CONTROL_TEMPLATES: AuthoringNodeTemplateI18n[] = [
  controlTemplate({ id: 'control.ai-profile', label: 'AI 配置档案', labelKey: 'nodes.templates.controlAiProfile.label', description: '引用一个现有 AI preset，不保存 API Key。', descriptionKey: 'nodes.templates.controlAiProfile.description', semantic: 'control.ai-profile', parameter: { key: 'presetId', label: '配置档案', labelKey: 'nodes.params.presetId', type: 'select', options: [], defaultValue: '' } }),
  controlTemplate({ id: 'control.prompt', label: 'Prompt 模板', labelKey: 'nodes.templates.controlPrompt.label', description: '引用现有 Prompt 模板和本次补充说明。', descriptionKey: 'nodes.templates.controlPrompt.description', semantic: 'control.prompt', parameter: { key: 'templateId', label: 'Prompt 模板', labelKey: 'nodes.params.promptTemplateId', type: 'text', defaultValue: '' } }),
  controlTemplate({ id: 'control.temperature', label: '温度', labelKey: 'nodes.templates.controlTemperature.label', description: '控制生成随机性，最终范围由 provider 归一。', descriptionKey: 'nodes.templates.controlTemperature.description', semantic: 'control.temperature', parameter: { key: 'value', label: '温度', labelKey: 'nodes.params.temperatureValue', type: 'number', min: 0, max: 2, step: 0.1, defaultValue: 0.7 } }),
  controlTemplate({ id: 'control.max-tokens', label: '最大输出 Tokens', labelKey: 'nodes.templates.controlMaxTokens.label', description: '限制模型单次最大输出。', descriptionKey: 'nodes.templates.controlMaxTokens.description', semantic: 'control.max-tokens', parameter: { key: 'value', label: 'Tokens', labelKey: 'nodes.params.tokensValue', type: 'number', min: 100, max: 128_000, step: 100, defaultValue: 6000 } }),
  controlTemplate({ id: 'control.word-count', label: '期望字数', labelKey: 'nodes.templates.controlWordCount.label', description: '创作目标字数，不冒充精确 token 换算。', descriptionKey: 'nodes.templates.controlWordCount.description', semantic: 'control.word-count', parameter: { key: 'value', label: '字数', labelKey: 'nodes.params.wordCountValue', type: 'number', min: 100, max: 100_000, step: 100, defaultValue: 3000 } }),
  controlTemplate({ id: 'control.context-budget', label: '上下文预算', labelKey: 'nodes.templates.controlContextBudget.label', description: '限制节点总输入预算。', descriptionKey: 'nodes.templates.controlContextBudget.description', semantic: 'control.context-budget', parameter: { key: 'value', label: 'Tokens', labelKey: 'nodes.params.tokensValue', type: 'number', min: 1000, max: 256_000, step: 1000, defaultValue: 16_000 } }),
  controlTemplate({ id: 'control.candidate-count', label: '候选数量', labelKey: 'nodes.templates.controlCandidateCount.label', description: '生成多个候选供作者比较。', descriptionKey: 'nodes.templates.controlCandidateCount.description', semantic: 'control.count', parameter: { key: 'value', label: '数量', labelKey: 'nodes.params.countValue', type: 'number', min: 1, max: 8, step: 1, defaultValue: 1 } }),
  controlTemplate({ id: 'control.volume-count', label: '卷数', labelKey: 'nodes.templates.controlVolumeCount.label', description: '约束批量卷纲的目标数量。', descriptionKey: 'nodes.templates.controlVolumeCount.description', semantic: 'control.volume-count', parameter: { key: 'value', label: '卷数', labelKey: 'nodes.params.volumeCountValue', type: 'number', min: 1, max: 30, step: 1, defaultValue: 5 } }),
  controlTemplate({ id: 'control.chapter-count', label: '章节数', labelKey: 'nodes.templates.controlChapterCount.label', description: '约束批量章节的目标数量。', descriptionKey: 'nodes.templates.controlChapterCount.description', semantic: 'control.chapter-count', parameter: { key: 'value', label: '章节数', labelKey: 'nodes.params.chapterCountValue', type: 'number', min: 1, max: 500, step: 1, defaultValue: 20 } }),
]

const PROCESSOR_TEMPLATES: AuthoringNodeTemplateI18n[] = [
  {
    id: 'input.manual-text', version: 1, label: '自由文本', labelKey: 'nodes.templates.inputManualText.label', description: '作者要求、临时设定或任意文字。', descriptionKey: 'nodes.templates.inputManualText.description', category: '输入', categoryKey: 'nodes.categories.input', class: 'content', capability: 'manual-draft', inputs: [], outputs: [{ id: 'text', label: '文字', labelKey: 'nodes.ports.manualText', semantic: 'text', cardinality: 'one', state: 'draft' }], legacyKind: 'input.text', parameters: [{ key: 'text', label: '作者输入', labelKey: 'nodes.params.authorInput', type: 'text', defaultValue: '' }],
  },
  {
    id: 'source.project-context', version: 1, label: '项目资料', labelKey: 'nodes.templates.sourceProjectContext.label', description: '通过登记上下文或稳定字段键读取 Canon。', descriptionKey: 'nodes.templates.sourceProjectContext.description', category: '输入', categoryKey: 'nodes.categories.input', class: 'content', capability: 'read-canon', inputs: [], outputs: [{ id: 'context', label: '项目资料', labelKey: 'nodes.ports.projectContext', semantic: 'any', cardinality: 'many', state: 'canon' }], reads: { sourceKeys: ['ragSelection'], allowExactFields: true }, legacyKind: 'source.context',
  },
  {
    id: 'processor.compose', version: 1, label: '整理与合并', labelKey: 'nodes.templates.processorCompose.label', description: '按字段、优先级和模板组合上游内容。', descriptionKey: 'nodes.templates.processorCompose.description', category: '处理', categoryKey: 'nodes.categories.processing', class: 'processor', capability: 'transform', inputs: [contextInput()], outputs: [{ id: 'text', label: '整理结果', labelKey: 'nodes.ports.composedText', semantic: 'text', cardinality: 'one', state: 'draft' }], legacyKind: 'transform.compose', parameters: [{ key: 'template', label: '组合模板', labelKey: 'nodes.params.composeTemplate', type: 'text', defaultValue: '' }],
  },
  {
    id: 'processor.free-generation', version: 1, label: '自由创作', labelKey: 'nodes.templates.processorFreeGeneration.label', description: '保留 FLOW-2 自由指令能力，输出仍是候选。', descriptionKey: 'nodes.templates.processorFreeGeneration.description', category: '处理', categoryKey: 'nodes.categories.processing', class: 'processor', capability: 'transform', inputs: generationInputs(), outputs: [candidateOutput('candidate')], legacyKind: 'generation.freeform', promptModuleKey: 'prompt.operations', parameters: [{ key: 'instruction', label: '创作指令', labelKey: 'nodes.params.instruction', type: 'text', defaultValue: '' }],
  },
  {
    id: 'processor.validate', version: 1, label: '内容校验', labelKey: 'nodes.templates.processorValidate.label', description: '执行空值、必含和禁用内容检查。', descriptionKey: 'nodes.templates.processorValidate.description', category: '处理', categoryKey: 'nodes.categories.processing', class: 'processor', capability: 'validate', inputs: [{ id: 'candidate', label: '待校验内容', labelKey: 'nodes.ports.contentToValidate', semantic: 'any', cardinality: 'one', state: 'candidate', required: true }], outputs: [candidateOutput('candidate')], legacyKind: 'validation.required', parameters: [{ key: 'requiredTerms', label: '必含内容', labelKey: 'nodes.params.requiredTerms', type: 'text' }, { key: 'forbiddenTerms', label: '禁用内容', labelKey: 'nodes.params.forbiddenTerms', type: 'text' }],
  },
  {
    id: 'output.review-adopt', version: 1, label: '预览与采纳', labelKey: 'nodes.templates.outputReviewAdopt.label', description: '查看差异并通过上游写契约确认采纳。', descriptionKey: 'nodes.templates.outputReviewAdopt.description', category: '输出', categoryKey: 'nodes.categories.output', class: 'output', capability: 'adopt', inputs: [{ id: 'candidate', label: '候选内容', labelKey: 'nodes.ports.candidate', semantic: 'any', cardinality: 'one', state: 'candidate', required: true }], outputs: [{ id: 'adopted', label: '已确认内容', labelKey: 'nodes.ports.adoptedContent', semantic: 'any', cardinality: 'one', state: 'canon' }], legacyKind: 'output.preview',
  },
]

export const AUTHORING_NODE_CATALOG: readonly AuthoringNodeTemplateI18n[] = Object.freeze([
  ...CONTENT_TEMPLATES,
  ...CONTINUITY_TEMPLATES,
  ...CONTINUITY_CONTEXT_TEMPLATES,
  ...CONTROL_TEMPLATES,
  ...PROCESSOR_TEMPLATES,
])

export const AUTHORING_NODE_BY_ID: ReadonlyMap<string, AuthoringNodeTemplateI18n> = new Map(
  AUTHORING_NODE_CATALOG.map(template => [template.id, template] as const),
)

export const AUTHORING_NODE_CATEGORIES: readonly string[] = Object.freeze(
  Array.from(new Set(AUTHORING_NODE_CATALOG.map(template => template.category))),
)

export function authoringTemplatesForCategory(category: string): AuthoringNodeTemplateI18n[] {
  return AUTHORING_NODE_CATALOG.filter(template => template.category === category)
}

export function defaultConfigForTemplate(template: AuthoringNodeTemplate): Record<string, unknown> {
  return Object.fromEntries((template.parameters ?? []).map(parameter => [
    parameter.key,
    parameter.defaultValue ?? (parameter.type === 'number' ? 0 : parameter.type === 'boolean' ? false : ''),
  ]))
}

/**
 * WS-3B · 动态节点执行的输出语义意图声明表（按 promptModuleKey）。
 *
 * 基类 AuthoringNodeTemplate 契约没有 output-kind 字段（contracts.ts 不归本lane改），
 * 因此这里用显式解析表代替模板字段，规则与 client gate 的单点注入契约对齐：
 * - 读者向创作文本（世界/故事/角色/伏笔等）→ 'creative'，由 gate 注入项目 contentLanguage；
 * - 'chapter.continuity' 被 'chapter.' 前缀分类为 creation，但状态/认知/事实/物品/年表
 *   整理输出都是 parser 严格解析的结构化数据，必须显式 'functional-structured'；
 *   'detail.chapter-planning' 同理（'detail.' 前缀）。
 * - 抽取类键（relation.extract / inventory.extract / story-timeline.extract）由
 *   EXTRACTION_PREFIXES 分类推导 functional-structured，此处不重复声明。
 * - 未列出的键有意返回 undefined：由 client gate 走 classifyAITask 推导或失败保险，
 *   绝不把未知/自定义键静默为 creative。
 */
const AUTHORING_DYNAMIC_OUTPUT_KINDS: ReadonlyMap<string, OutputKind> = new Map([
  ['worldview.dimension', 'creative'],
  ['worldview.worldbuilding', 'creative'],
  ['story.core', 'creative'],
  ['character.dimension', 'creative'],
  ['character.generate', 'creative'],
  ['outline.plot', 'creative'],
  ['foreshadow.generate', 'creative'],
  ['chapter.content', 'creative'],
  ['detail.chapter-planning', 'functional-structured'],
  ['chapter.continuity', 'functional-structured'],
])

/**
 * WS-3B · 解析动态 generate-field / generate-collection 执行应声明的 outputKind。
 *
 * - 无 promptModuleKey 的模板：executor 以自由创作 'node.creation' category 调用，
 *   语义即自由创作 → 'creative'（显式声明，与 classifyAITask 的 creation 分类一致）。
 * - 已知创作/结构化键 → 按上表显式声明。
 * - 未知/自定义键 → undefined，交由 client gate 的分类推导/失败保险裁决。
 */
export function authoringDynamicOutputKind(template: AuthoringNodeTemplate): OutputKind | undefined {
  if (!template.promptModuleKey) return 'creative'
  return AUTHORING_DYNAMIC_OUTPUT_KINDS.get(template.promptModuleKey)
}
