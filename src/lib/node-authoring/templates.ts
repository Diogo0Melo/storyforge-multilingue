import { nanoid } from 'nanoid'
import { getT } from '../../i18n'
import { AUTHORING_NODE_BY_ID, defaultConfigForTemplate } from './catalog'
import { buildAuthoringCreationChainGraph, resolveAuthoringNodeTitle } from './creation-chain'
import type { AuthoringEdge, AuthoringNodeGraph, AuthoringNodeInstance } from './contracts'
import { autoLayoutAuthoringGraph } from './productivity'

export const AUTHORING_OFFICIAL_TEMPLATE_IDS = [
  'world-foundation',
  'long-novel',
  'short-novel',
  'character-driven',
  'multi-line-narrative',
  'chapter-continuation-review',
] as const

export type AuthoringOfficialTemplateId = typeof AUTHORING_OFFICIAL_TEMPLATE_IDS[number]

/**
 * 官方模板显示名/描述的 i18n key（node-authoring ns）。
 * 字面量键供类型化 t() 校验；渲染/调用时解析，保证语言切换后跟随更新。
 */
export const AUTHORING_OFFICIAL_TEMPLATE_I18N_KEYS = {
  'world-foundation': {
    nameKey: 'node-authoring:templates.worldFoundation.name',
    descriptionKey: 'node-authoring:templates.worldFoundation.description',
  },
  'long-novel': {
    nameKey: 'node-authoring:templates.longNovel.name',
    descriptionKey: 'node-authoring:templates.longNovel.description',
  },
  'short-novel': {
    nameKey: 'node-authoring:templates.shortNovel.name',
    descriptionKey: 'node-authoring:templates.shortNovel.description',
  },
  'character-driven': {
    nameKey: 'node-authoring:templates.characterDriven.name',
    descriptionKey: 'node-authoring:templates.characterDriven.description',
  },
  'multi-line-narrative': {
    nameKey: 'node-authoring:templates.multiLineNarrative.name',
    descriptionKey: 'node-authoring:templates.multiLineNarrative.description',
  },
  'chapter-continuation-review': {
    nameKey: 'node-authoring:templates.chapterContinuationReview.name',
    descriptionKey: 'node-authoring:templates.chapterContinuationReview.description',
  },
} as const satisfies Record<AuthoringOfficialTemplateId, { nameKey: string; descriptionKey: string }>

type AuthoringOfficialTemplateI18nKeySet =
  (typeof AUTHORING_OFFICIAL_TEMPLATE_I18N_KEYS)[AuthoringOfficialTemplateId]

export interface AuthoringOfficialTemplate {
  id: AuthoringOfficialTemplateId
  /** i18n key (node-authoring ns)；渲染/调用时经 t() 解析，使显示名跟随语言切换。 */
  nameKey: AuthoringOfficialTemplateI18nKeySet['nameKey']
  /** i18n key (node-authoring ns)；渲染/调用时经 t() 解析。 */
  descriptionKey: AuthoringOfficialTemplateI18nKeySet['descriptionKey']
  build(): AuthoringNodeGraph
}

function node(
  templateId: string,
  id: string,
  config: Record<string, unknown> = {},
): AuthoringNodeInstance {
  const template = AUTHORING_NODE_BY_ID.get(templateId)
  if (!template) throw new Error(getT()('node-authoring:templates.missingOfficialNode', { templateId }))
  return {
    id,
    templateId,
    templateVersion: template.version,
    // I18N-F5 · 创建期持久化默认节点名经 labelKey 解析（A4 translate-at-creation）。
    title: resolveAuthoringNodeTitle(template),
    x: 0,
    y: 0,
    config: { ...defaultConfigForTemplate(template), ...config },
    inputs: structuredClone(template.inputs),
    outputs: structuredClone(template.outputs),
  }
}

function edge(
  source: AuthoringNodeInstance,
  target: AuthoringNodeInstance,
  targetPortId = 'context',
  sourcePortId = source.outputs[0]?.id ?? 'candidate',
): AuthoringEdge {
  return {
    id: `template-edge-${nanoid(8)}`,
    sourceNodeId: source.id,
    sourcePortId,
    targetNodeId: target.id,
    targetPortId,
    mapping: { mode: 'full', missingPolicy: 'block', refreshPolicy: 'live' },
  }
}

function graph(nodes: AuthoringNodeInstance[], edges: AuthoringEdge[], groups: AuthoringNodeGraph['groups'] = []) {
  return autoLayoutAuthoringGraph({
    version: 2,
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 0.8 },
    groups,
  })
}

function projectContext(id: string, sourceKeys: string[]): AuthoringNodeInstance {
  return node('source.project-context', id, {
    sourceKeys,
    ragEntryKeys: [],
    contextBudget: 24_000,
  })
}

function worldFoundationGraph(): AuthoringNodeGraph {
  const context = projectContext('world-template-context', ['worldview', 'worldRules', 'codex', 'locations'])
  const worldNodes = [
    'world.origin', 'world.structure', 'world.terrain', 'world.waterways', 'world.climate',
    'world.races', 'world.factions', 'world.politics', 'world.economy', 'world.culture',
    'world.power', 'world.items',
  ].map((templateId, index) => node(templateId, `world-template-${index}`))
  return graph(
    [context, ...worldNodes],
    worldNodes.map(item => edge(context, item)),
    [
      { id: 'world-natural', title: getT()('node-authoring:templates.worldNaturalGroupTitle'), color: '#2d8777' },
      { id: 'world-humanity', title: getT()('node-authoring:templates.worldHumanityGroupTitle'), color: '#42759a' },
      { id: 'world-rules', title: getT()('node-authoring:templates.worldRulesGroupTitle'), color: '#b77731' },
    ],
  )
}

function configureCreationChain(input: {
  chapterCount: number
  volumeCount: number
  wordCount: number
  namePrefix: string
}): AuthoringNodeGraph {
  const { graph: base } = buildAuthoringCreationChainGraph()
  return {
    ...base,
    nodes: base.nodes.map(item => {
      const config = { ...item.config }
      if (item.templateId === 'control.chapter-count') config.value = input.chapterCount
      if (item.templateId === 'control.volume-count') config.value = input.volumeCount
      if (item.templateId === 'control.word-count') config.value = input.wordCount
      return { ...item, id: `${input.namePrefix}-${item.id}`, config }
    }),
    edges: base.edges.map(item => ({
      ...item,
      id: `${input.namePrefix}-${item.id}`,
      sourceNodeId: `${input.namePrefix}-${item.sourceNodeId}`,
      targetNodeId: `${input.namePrefix}-${item.targetNodeId}`,
    })),
  }
}

function characterDrivenGraph(): AuthoringNodeGraph {
  const base = configureCreationChain({ chapterCount: 18, volumeCount: 3, wordCount: 2800, namePrefix: 'character' })
  const context = base.nodes.find(item => item.templateId === 'source.project-context')!
  const character = base.nodes.find(item => item.templateId === 'character.profile')!
  const volume = base.nodes.find(item => item.templateId === 'outline.volume')!
  const arc = node('story.arc', 'character-story-arc', { request: '围绕角色欲望、代价与变化建立角色驱动故事线。' })
  const relation = node('character.relation', 'character-relation', { request: '围绕关键角色建立会推动剧情变化的关系。' })
  const expanded = {
    ...base,
    nodes: [...base.nodes, arc, relation],
    edges: [
      ...base.edges,
      edge(context, arc),
      edge(context, relation),
      edge(character, arc),
      edge(character, relation),
      edge(arc, volume),
    ],
  }
  return autoLayoutAuthoringGraph(expanded)
}

function multiLineNarrativeGraph(): AuthoringNodeGraph {
  const context = projectContext('multiline-context', ['worldview', 'storyCore', 'characters', 'storyArcs', 'existingVolumeOutlines'])
  const concept = node('story.concept', 'multiline-concept')
  const conflict = node('story.conflict', 'multiline-conflict')
  const arcTitles = [
    { key: 'node-authoring:templates.multiLineNarrative.arcMainLine', zh: '主线' },
    { key: 'node-authoring:templates.multiLineNarrative.arcCharacterSubplot', zh: '角色支线' },
    { key: 'node-authoring:templates.multiLineNarrative.arcWorldSubplot', zh: '世界支线' },
  ] as const
  const arcs = arcTitles.map(({ key, zh }, index) => ({
    ...node('story.arc', `multiline-arc-${index}`, { request: `设计${zh}的阶段、交汇点和收束条件。` }),
    // I18N-F5 · 创建期持久化节点名经 i18n 解析（A4 translate-at-creation）；
    // zh 仅保留为 AI prompt payload，与 resolveAuthoringNodeTitle 的 defaultValue 兜底一致。
    title: getT()(key, { defaultValue: zh }),
  }))
  const volume = node('outline.volume', 'multiline-volume', { request: '按故事线交汇与阶段推进规划卷纲。' })
  const volumeCount = node('control.volume-count', 'multiline-volume-count', { value: 5 })
  return graph(
    [context, concept, conflict, ...arcs, volume, volumeCount],
    [
      edge(context, concept),
      edge(context, conflict),
      ...arcs.flatMap(arc => [edge(context, arc), edge(concept, arc), edge(conflict, arc), edge(arc, volume)]),
      edge(context, volume),
      edge(volumeCount, volume, 'volume-count'),
    ],
    [{ id: 'multiline-arcs', title: getT()('node-authoring:templates.multiLineNarrative.name'), color: '#7c3aed' }],
  )
}

function chapterContinuationReviewGraph(): AuthoringNodeGraph {
  const context = projectContext('continuation-context', ['chapterOutline', 'detailedOutline', 'chapterContent', 'characters', 'worldview'])
  const previous = node('context.previous-ending', 'continuation-previous')
  const handoff = node('context.handoff', 'continuation-handoff')
  const summaries = node('context.recent-summaries', 'continuation-summaries')
  const related = node('context.related-passages', 'continuation-related')
  const report = node('context.consistency-report', 'continuation-report')
  const prose = node('chapter.prose', 'continuation-prose', { request: '承接已有正文并遵守连续性证据，生成下一段正文候选。' })
  const organize = node('chapter.organize', 'continuation-organize')
  const wordCount = node('control.word-count', 'continuation-word-count', { value: 2200 })
  const sources = [context, previous, handoff, summaries, related, report]
  return graph(
    [...sources, prose, organize, wordCount],
    [
      ...sources.map(source => edge(source, prose)),
      edge(wordCount, prose, 'word-count'),
      edge(prose, organize, 'chapter'),
    ],
    [
      { id: 'continuation-evidence', title: getT()('node-authoring:templates.continuityEvidenceGroupTitle'), color: '#42759a' },
      { id: 'continuation-output', title: getT()('node-authoring:templates.continuationReviewGroupTitle'), color: '#2d8777' },
    ],
  )
}

// 只存 i18n key、不存解析结果：模块级 getT() + Object.freeze 会把名称/描述固定在
// 首次导入时的语言，切换语言后不会更新。由调用方在渲染/创建时经 t() 解析（Gate 5 · S2）。
export const AUTHORING_OFFICIAL_TEMPLATES: readonly AuthoringOfficialTemplate[] = Object.freeze([
  {
    id: 'world-foundation',
    ...AUTHORING_OFFICIAL_TEMPLATE_I18N_KEYS['world-foundation'],
    build: worldFoundationGraph,
  },
  {
    id: 'long-novel',
    ...AUTHORING_OFFICIAL_TEMPLATE_I18N_KEYS['long-novel'],
    build: () => configureCreationChain({ chapterCount: 20, volumeCount: 5, wordCount: 3000, namePrefix: 'long' }),
  },
  {
    id: 'short-novel',
    ...AUTHORING_OFFICIAL_TEMPLATE_I18N_KEYS['short-novel'],
    build: () => configureCreationChain({ chapterCount: 3, volumeCount: 1, wordCount: 1800, namePrefix: 'short' }),
  },
  {
    id: 'character-driven',
    ...AUTHORING_OFFICIAL_TEMPLATE_I18N_KEYS['character-driven'],
    build: characterDrivenGraph,
  },
  {
    id: 'multi-line-narrative',
    ...AUTHORING_OFFICIAL_TEMPLATE_I18N_KEYS['multi-line-narrative'],
    build: multiLineNarrativeGraph,
  },
  {
    id: 'chapter-continuation-review',
    ...AUTHORING_OFFICIAL_TEMPLATE_I18N_KEYS['chapter-continuation-review'],
    build: chapterContinuationReviewGraph,
  },
])

export const AUTHORING_OFFICIAL_TEMPLATE_BY_ID = new Map(
  AUTHORING_OFFICIAL_TEMPLATES.map(template => [template.id, template] as const),
)

export function buildOfficialAuthoringTemplate(id: AuthoringOfficialTemplateId): AuthoringNodeGraph {
  const template = AUTHORING_OFFICIAL_TEMPLATE_BY_ID.get(id)
  if (!template) throw new Error(getT()('node-authoring:templates.unknownOfficialTemplate', { id }))
  return template.build()
}
