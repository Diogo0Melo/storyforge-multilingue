/**
 * RAG-1 · 可见资料库投影与精确选择。
 *
 * 这里不复制 Canon：资料正文实时投影自现有业务表；仅把稳定 ragDocumentId 和作者的
 * 启用/权重/token 策略写回源记录。节点执行仍通过 CONTEXT_SOURCES.ragSelection 读取。
 */
import type { Table } from 'dexie'
import { estimateTokens } from '../ai/context-budget'
import { db } from '../db/schema'
import i18n from '../../i18n/i18n'
import {
  parseEntryFields,
  parseFieldSchema,
  type Character,
  type CharacterRelation,
  type Chapter,
  type CodexCategory,
  type CodexEntry,
  type Foreshadow,
  type History,
  type ImportantLocation,
  type ItemLedgerEntry,
  type RagDocumentMetadata,
  type RagDocumentPolicy,
  type RagFieldPolicy,
  type RagLibraryEntry,
  type RagSelectionTraceCollector,
  type Reference,
  type StoryCore,
  type Worldview,
} from '../types'
import { htmlToPlainText } from '../utils/html'

type RagRow = RagDocumentMetadata & {
  id?: number
  projectId: number
  updatedAt?: number
  createdAt?: number
}

type RagField = {
  key: string
  label: string
  labelKey?: string
  content: string
}

interface RagDescriptor<Row extends RagRow = RagRow> {
  tableName: string
  table: Table<Row, number>
  sourceKey: string
  sourceLabel: string
  sourceLabelKey?: string
  title: (row: Row, context: ProjectionContext) => string
  titleKey?: string
  fields: (row: Row, context: ProjectionContext) => RagField[]
  visible?: (row: Row, context: ProjectionContext) => boolean
}

interface ProjectionContext {
  worldGroupId: number | null
  outlineWorldById: Map<number, number | null>
  characterNameById: Map<number, string>
  categoryById: Map<number, CodexCategory>
  chapterChunks: Map<number, { count: number; embedded: number }>
}

const DEFAULT_WEIGHT = 1
const DEFAULT_TOKEN_CAP = 4000
const MIN_TOKEN_CAP = 100
const MAX_TOKEN_CAP = 50_000

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value == null) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function field(key: string, label: string, value: unknown, labelKey?: string): RagField {
  return { key, label, labelKey, content: text(value) }
}

function stableDocumentId(tableName: string, row: RagRow): string {
  if (row.ragDocumentId?.trim()) return row.ragDocumentId
  return `rag:${tableName}:${row.projectId}:${row.id}`
}

function recordPolicy(row: RagRow): Required<Omit<RagDocumentPolicy, 'fields'>> & {
  fields: Record<string, RagFieldPolicy>
} {
  return {
    enabled: row.ragPolicy?.enabled !== false,
    weight: normalizeWeight(row.ragPolicy?.weight),
    tokenCap: normalizeTokenCap(row.ragPolicy?.tokenCap),
    fields: row.ragPolicy?.fields ?? {},
  }
}

function normalizeWeight(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(5, Math.max(0.1, value))
    : DEFAULT_WEIGHT
}

function normalizeTokenCap(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.min(MAX_TOKEN_CAP, Math.max(MIN_TOKEN_CAP, value)))
    : DEFAULT_TOKEN_CAP
}

function exactWorld(rowWorld: number | null | undefined, current: number | null): boolean {
  return (rowWorld ?? null) === current
}

const WORLDVIEW_FIELDS: Array<[keyof Worldview, string]> = [
  ['summary', '世界观摘要'],
  ['worldOrigin', '世界来源'],
  ['powerHierarchy', '力量层级'],
  ['worldStructure', '世界结构'],
  ['worldDimensions', '世界尺寸'],
  ['continentLayout', '大陆分布'],
  ['mountainsRivers', '山川河流'],
  ['climateByRegion', '分区气候'],
  ['naturalResourceOverview', '自然资源全貌'],
  ['historyLine', '历史线'],
  ['worldEvents', '世界大事记'],
  ['races', '种族设定'],
  ['factionLayout', '势力分布'],
  ['politicsOverview', '政治制度'],
  ['economyOverview', '经济体系'],
  ['cultureOverview', '文化风俗'],
  ['internalConflicts', '矛盾冲突'],
  ['itemDesign', '道具设计'],
  ['rules', '世界规则（旧字段）'],
]

const STORY_CORE_FIELDS: Array<[keyof StoryCore, string]> = [
  ['logline', '一句话故事'],
  ['concept', '故事概念'],
  ['theme', '主题'],
  ['centralConflict', '核心冲突'],
  ['plotPattern', '情节模式'],
  ['mainPlot', '故事主线'],
  ['subPlots', '故事复线'],
]

const CHARACTER_FIELDS: Array<[keyof Character, string, string]> = [
  ['shortDescription', '一句话简介', 'rag.field.shortDescription'],
  ['identity', '身份', 'rag.field.identity'],
  ['profile', '基础档案', 'rag.field.profile'],
  ['appearance', '外貌', 'rag.field.appearance'],
  ['personality', '性格', 'rag.field.personality'],
  ['background', '背景', 'rag.field.background'],
  ['motivation', '动机', 'rag.field.motivation'],
  ['values', '价值观', 'rag.field.values'],
  ['strengths', '长处', 'rag.field.strengths'],
  ['weaknesses', '弱点', 'rag.field.weaknesses'],
  ['fears', '恐惧', 'rag.field.fears'],
  ['goals', '目标', 'rag.field.goals'],
  ['innerConflict', '内心冲突', 'rag.field.innerConflict'],
  ['abilities', '能力', 'rag.field.abilities'],
  ['powerLevel', '实力定位', 'rag.field.powerLevel'],
  ['relationships', '关系描述', 'rag.field.relationships'],
  ['arc', '角色弧光', 'rag.field.arc'],
  ['keyEvents', '关键经历', 'rag.field.keyEvents'],
  ['speechStyle', '语言风格', 'rag.field.speechStyle'],
  ['habits', '习惯', 'rag.field.habits'],
  ['signatureItem', '标志性物品', 'rag.field.signatureItem'],
]

function descriptors(): RagDescriptor<any>[] {
  return [
    {
      tableName: 'worldviews',
      table: db.worldviews,
      sourceKey: 'worldview',
      sourceLabel: '世界观',
      sourceLabelKey: 'rag.source.worldview',
      title: (_row, context) => context.worldGroupId == null ? '主世界观' : '当前世界观',
      titleKey: 'rag.title.worldview',
      visible: (row: Worldview, context) => exactWorld(row.worldGroupId, context.worldGroupId),
      fields: (row: Worldview) => WORLDVIEW_FIELDS.map(([key, label]) => field(String(key), label, row[key])),
    },
    {
      tableName: 'storyCores',
      table: db.storyCores,
      sourceKey: 'storyCore',
      sourceLabel: '故事核心',
      sourceLabelKey: 'rag.source.storyCore',
      title: () => '故事核心',
      titleKey: 'rag.title.storyCore',
      fields: (row: StoryCore) => STORY_CORE_FIELDS.map(([key, label]) => field(String(key), label, row[key])),
    },
    {
      tableName: 'characters',
      table: db.characters,
      sourceKey: 'characters',
      sourceLabel: '角色档案',
      sourceLabelKey: 'rag.source.characters',
      title: (row: Character) => row.name || `角色 #${row.id}`,
      titleKey: 'rag.title.character',
      visible: (row: Character, context) => (
        !!row.isCrossWorld || exactWorld(row.homeWorldGroupId, context.worldGroupId)
      ),
      fields: (row: Character) => CHARACTER_FIELDS.map(([key, label, labelKey]) => field(String(key), label, row[key], labelKey)),
    },
    {
      tableName: 'characterRelations',
      table: db.characterRelations,
      sourceKey: 'characterRelations',
      sourceLabel: '角色关系',
      sourceLabelKey: 'rag.source.characterRelations',
      title: (row: CharacterRelation, context) => {
        const from = context.characterNameById.get(row.fromCharacterId) ?? `角色 #${row.fromCharacterId}`
        const to = context.characterNameById.get(row.toCharacterId) ?? `角色 #${row.toCharacterId}`
        return `${from} → ${to}`
      },
      fields: (row: CharacterRelation) => [
        field('relationType', '关系类型', row.relationType, 'rag.field.relationType'),
        field('label', '关系标签', row.label, 'rag.field.relationLabel'),
        field('description', '关系说明', row.description, 'rag.field.relationDescription'),
        field('isBidirectional', '是否双向', row.isBidirectional ? '双向' : '单向', 'rag.field.isBidirectional'),
      ],
    },
    {
      tableName: 'chapters',
      table: db.chapters,
      sourceKey: 'chapterContent',
      sourceLabel: '章节与前文',
      sourceLabelKey: 'rag.source.chapterContent',
      title: (row: Chapter) => row.title || `章节 #${row.id}`,
      visible: (row: Chapter, context) => (
        exactWorld(context.outlineWorldById.get(row.outlineNodeId), context.worldGroupId)
      ),
      fields: (row: Chapter) => [
        field('content', '正文', htmlToPlainText(row.content || ''), 'rag.field.content'),
        field('summary', '章节摘要', row.summary, 'rag.field.chapterSummary'),
        field('notes', '作者笔记', row.notes, 'rag.field.authorNotes'),
      ],
    },
    {
      tableName: 'codexEntries',
      table: db.codexEntries,
      sourceKey: 'codex',
      sourceLabel: '设定词条',
      sourceLabelKey: 'rag.source.codex',
      title: (row: CodexEntry) => row.name || `词条 #${row.id}`,
      visible: (row: CodexEntry, context) => exactWorld(row.worldGroupId, context.worldGroupId),
      fields: (row: CodexEntry, context) => {
        const category = context.categoryById.get(row.categoryId)
        const customValues = parseEntryFields(row.fields)
        const customFields = parseFieldSchema(category?.fieldSchema).map(definition =>
          field(`custom.${definition.key}`, definition.label, customValues[definition.key]),
        )
        return [
          field('summary', '简介', row.summary, 'rag.field.summary'),
          field('description', '详细描述', row.description, 'rag.field.description'),
          ...customFields,
          field('tags', '标签', row.tags, 'rag.field.tags'),
        ]
      },
    },
    {
      tableName: 'importantLocations',
      table: db.importantLocations,
      sourceKey: 'locations',
      sourceLabel: '重要地点',
      sourceLabelKey: 'rag.source.locations',
      title: (row: ImportantLocation) => row.name || `地点 #${row.id}`,
      fields: (row: ImportantLocation) => [
        field('description', '地点描述', row.description, 'rag.field.locationDescription'),
        field('significance', '剧情作用', row.significance, 'rag.field.significance'),
        field('tags', '地点标签', row.tags, 'rag.field.locationTags'),
      ],
    },
    {
      tableName: 'histories',
      table: db.histories,
      sourceKey: 'historical',
      sourceLabel: '历史',
      sourceLabelKey: 'rag.source.historical',
      title: (_row, context) => context.worldGroupId == null ? '主世界历史' : '当前世界历史',
      titleKey: 'rag.title.historical',
      visible: (row: History, context) => exactWorld(row.worldGroupId, context.worldGroupId),
      fields: (row: History) => [
        field('overview', '历史总述', row.overview, 'rag.field.overview'),
        field('eraSystem', '纪年体系', row.eraSystem, 'rag.field.eraSystem'),
        field('events', '历史事件', row.events, 'rag.field.events'),
      ],
    },
    {
      tableName: 'foreshadows',
      table: db.foreshadows,
      sourceKey: 'foreshadows',
      sourceLabel: '伏笔',
      sourceLabelKey: 'rag.source.foreshadows',
      title: (row: Foreshadow) => row.name || `伏笔 #${row.id}`,
      fields: (row: Foreshadow) => [
        field('description', '伏笔描述', row.description, 'rag.field.foreshadowDescription'),
        field('notes', '作者备注', row.notes, 'rag.field.foreshadowNotes'),
        field('status', '当前状态', row.status, 'rag.field.foreshadowStatus'),
      ],
    },
    {
      tableName: 'references',
      table: db.references,
      sourceKey: 'references',
      sourceLabel: '项目参考',
      sourceLabelKey: 'rag.source.references',
      title: (row: Reference) => row.title || `参考 #${row.id}`,
      fields: (row: Reference) => [
        field('note', '作者备注', row.note, 'rag.field.referenceNote'),
        field('analysisSummary', '分析摘要', row.analysisSummary, 'rag.field.analysisSummary'),
        field('importedData', '结构化参考', row.importedData, 'rag.field.importedData'),
      ],
    },
    {
      tableName: 'itemLedger',
      table: db.itemLedger,
      sourceKey: 'itemLedger',
      sourceLabel: '角色物品流水',
      sourceLabelKey: 'rag.source.itemLedger',
      title: (row: ItemLedgerEntry) => `${row.heldByName || '未知持有人'} · ${row.itemName}`,
      fields: (row: ItemLedgerEntry) => [
        field(
          'event',
          '物品事件',
          `${row.heldByName || '未知持有人'}${row.action === 'gain' ? '获得' : '消耗'}`
            + `${row.quantity} × ${row.itemName}${row.chapterTitle ? `（${row.chapterTitle}）` : ''}`,
          'rag.field.itemEvent',
        ),
        field('note', '物品备注', row.note, 'rag.field.itemNote'),
      ],
    },
  ]
}

async function projectionContext(
  projectId: number,
  worldGroupId: number | null,
): Promise<ProjectionContext> {
  const [outlineNodes, characters, categories, chunks] = await Promise.all([
    db.outlineNodes.where('projectId').equals(projectId).toArray(),
    db.characters.where('projectId').equals(projectId).toArray(),
    db.codexCategories.where('projectId').equals(projectId).toArray(),
    db.retrievalChunks.where('projectId').equals(projectId).toArray(),
  ])
  const outlineWorldById = new Map(outlineNodes.flatMap(node =>
    node.id == null ? [] : [[node.id, node.worldGroupId ?? null] as const],
  ))
  const characterNameById = new Map(characters.flatMap(character =>
    character.id == null ? [] : [[character.id, character.name] as const],
  ))
  const categoryById = new Map(categories.flatMap(category =>
    category.id == null ? [] : [[category.id, category] as const],
  ))
  const chapterChunks = new Map<number, { count: number; embedded: number }>()
  for (const chunk of chunks) {
    const current = chapterChunks.get(chunk.sourceChapterId) ?? { count: 0, embedded: 0 }
    current.count++
    if (chunk.embedding?.length) current.embedded++
    chapterChunks.set(chunk.sourceChapterId, current)
  }
  return { worldGroupId, outlineWorldById, characterNameById, categoryById, chapterChunks }
}

function effectiveFieldPolicy(row: RagRow, fieldKey: string) {
  const record = recordPolicy(row)
  const own = record.fields[fieldKey] ?? {}
  return {
    enabled: record.enabled && own.enabled !== false,
    weight: normalizeWeight(own.weight ?? record.weight),
    tokenCap: normalizeTokenCap(own.tokenCap ?? record.tokenCap),
  }
}

function indexState(
  tableName: string,
  recordId: number,
  context: ProjectionContext,
): Pick<RagLibraryEntry, 'chunkCount' | 'vectorState'> {
  if (tableName !== 'chapters') return { chunkCount: 0, vectorState: 'keyword' }
  const state = context.chapterChunks.get(recordId) ?? { count: 0, embedded: 0 }
  if (!state.count) return { chunkCount: 0, vectorState: 'none' }
  if (!state.embedded) return { chunkCount: state.count, vectorState: 'keyword' }
  if (state.embedded < state.count) return { chunkCount: state.count, vectorState: 'partial' }
  return { chunkCount: state.count, vectorState: 'ready' }
}

export function makeRagEntryKey(documentId: string, fieldKey: string): string {
  return `${documentId}::${encodeURIComponent(fieldKey)}`
}

/** 实时投影所有当前世界可见资料；缺稳定 ID 时只补元数据，不复制正文。 */
export async function buildRagLibrary(input: {
  projectId: number
  worldGroupId?: number | null
}): Promise<RagLibraryEntry[]> {
  const worldGroupId = input.worldGroupId ?? null
  const context = await projectionContext(input.projectId, worldGroupId)
  const entries: RagLibraryEntry[] = []

  for (const descriptor of descriptors()) {
    const rows = await descriptor.table.where('projectId').equals(input.projectId).toArray()
    for (const row of rows) {
      if (row.id == null || descriptor.visible?.(row, context) === false) continue
      const documentId = stableDocumentId(descriptor.tableName, row)
      if (row.ragDocumentId !== documentId) {
        await descriptor.table.update(row.id, { ragDocumentId: documentId } as Partial<RagRow>)
        row.ragDocumentId = documentId
      }
      const title = descriptor.title(row, context)
      const documentPolicy = recordPolicy(row)
      for (const currentField of descriptor.fields(row, context)) {
        if (!currentField.content.trim()) continue
        const policy = effectiveFieldPolicy(row, currentField.key)
        entries.push({
          key: makeRagEntryKey(documentId, currentField.key),
          documentId,
          tableName: descriptor.tableName,
          recordId: row.id,
          sourceKey: descriptor.sourceKey,
          sourceLabel: descriptor.sourceLabel,
          sourceLabelKey: descriptor.sourceLabelKey,
          title,
          fieldKey: currentField.key,
          fieldLabel: currentField.label,
          content: currentField.content,
          updatedAt: row.updatedAt ?? row.createdAt ?? 0,
          tokenEstimate: estimateTokens(currentField.content),
          documentEnabled: documentPolicy.enabled,
          documentWeight: documentPolicy.weight,
          documentTokenCap: documentPolicy.tokenCap,
          enabled: policy.enabled,
          weight: policy.weight,
          tokenCap: policy.tokenCap,
          ...indexState(descriptor.tableName, row.id, context),
        })
      }
    }
  }

  return entries.sort((left, right) => (
    left.sourceLabel.localeCompare(right.sourceLabel, 'zh-CN')
    || left.title.localeCompare(right.title, 'zh-CN')
    || left.fieldLabel.localeCompare(right.fieldLabel, 'zh-CN')
  ))
}

function descriptorFor(tableName: string): RagDescriptor {
  const descriptor = descriptors().find(item => item.tableName === tableName)
  if (!descriptor) throw new Error(i18n.t('errors:retrieval.unsupportedTable', { tableName }))
  return descriptor
}

async function updatePolicy(input: {
  projectId: number
  tableName: string
  recordId: number
  transform: (policy: RagDocumentPolicy) => RagDocumentPolicy
}): Promise<void> {
  const descriptor = descriptorFor(input.tableName)
  const row = await descriptor.table.get(input.recordId)
  if (!row || row.projectId !== input.projectId) throw new Error(i18n.t('errors:retrieval.recordNotFound'))
  const next = input.transform(row.ragPolicy ?? {})
  await descriptor.table.update(input.recordId, {
    ragDocumentId: stableDocumentId(input.tableName, row),
    ragPolicy: next,
  } as Partial<RagRow>)
}

export async function updateRagDocumentPolicy(input: {
  projectId: number
  tableName: string
  recordId: number
  patch: RagFieldPolicy
}): Promise<void> {
  await updatePolicy({
    ...input,
    transform: policy => ({
      ...policy,
      ...input.patch,
      weight: input.patch.weight == null ? policy.weight : normalizeWeight(input.patch.weight),
      tokenCap: input.patch.tokenCap == null ? policy.tokenCap : normalizeTokenCap(input.patch.tokenCap),
    }),
  })
}

export async function updateRagFieldPolicy(input: {
  projectId: number
  tableName: string
  recordId: number
  fieldKey: string
  patch: RagFieldPolicy
}): Promise<void> {
  await updatePolicy({
    ...input,
    transform: policy => {
      const previous = policy.fields?.[input.fieldKey] ?? {}
      return {
        ...policy,
        fields: {
          ...policy.fields,
          [input.fieldKey]: {
            ...previous,
            ...input.patch,
            weight: input.patch.weight == null ? previous.weight : normalizeWeight(input.patch.weight),
            tokenCap: input.patch.tokenCap == null ? previous.tokenCap : normalizeTokenCap(input.patch.tokenCap),
          },
        },
      }
    },
  })
}

function capByTokens(content: string, budget: number): { content: string; trimmed: boolean } {
  if (estimateTokens(content) <= budget) return { content, trimmed: false }
  const marker = '\n…（该资料字段已按预算截断）'
  let low = 0
  let high = content.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (estimateTokens(`${content.slice(0, middle)}${marker}`) <= budget) low = middle
    else high = middle - 1
  }
  return { content: `${content.slice(0, low)}${marker}`, trimmed: true }
}

/**
 * CONTEXT_SOURCES.ragSelection 的读取实现。
 * 只读取节点明确选择且仍启用的字段，按权重排序并记录实际纳入/省略/裁剪原因。
 */
export async function readRagSelectionContext(input: {
  projectId: number
  worldGroupId?: number | null
  entryKeys?: string[]
  inputBudgetTokens?: number
  trace?: RagSelectionTraceCollector
}): Promise<string> {
  input.trace?.clear()
  const requested = input.entryKeys ?? []
  if (!requested.length) return ''
  const library = await buildRagLibrary(input)
  const byKey = new Map(library.map(entry => [entry.key, entry]))
  const order = new Map(requested.map((key, index) => [key, index]))
  const selected = requested
    .map(key => byKey.get(key))
    .filter((entry): entry is RagLibraryEntry => !!entry)
    .sort((left, right) => right.weight - left.weight || order.get(left.key)! - order.get(right.key)!)

  for (const missing of requested.filter(key => !byKey.has(key))) {
    input.trace?.omitted.push(`${missing}（源记录或字段已不存在）`)
  }

  const totalBudget = normalizeTokenCap(input.inputBudgetTokens ?? 12_000)
  let remaining = totalBudget
  const blocks: string[] = []
  for (const entry of selected) {
    const label = `${entry.sourceLabel} / ${entry.title} / ${entry.fieldLabel}`
    if (!entry.enabled) {
      input.trace?.omitted.push(`${label}（资料库已停用）`)
      continue
    }
    if (remaining < MIN_TOKEN_CAP) {
      input.trace?.omitted.push(`${label}（节点总预算不足）`)
      continue
    }
    const budget = Math.min(entry.tokenCap, remaining)
    const heading = `【${label}｜权重 ${entry.weight.toFixed(1)}】\n`
    const capped = capByTokens(entry.content, Math.max(MIN_TOKEN_CAP, budget - estimateTokens(heading)))
    const block = `${heading}${capped.content}`
    const used = estimateTokens(block)
    blocks.push(block)
    remaining = Math.max(0, remaining - used)
    input.trace?.included.push(`${label}（${used} tokens，权重 ${entry.weight.toFixed(1)}）`)
    if (capped.trimmed) input.trace?.trimmed.push(`${label}（字段 token 上限）`)
  }
  return blocks.join('\n\n')
}

export interface RecentRagRecall {
  runId: number
  startedAt: number
  nodeTitle: string
  included: string[]
  omitted: string[]
  trimmed: string[]
}

/** 读取最近节点运行中冻结的精确资料召回证据，不重新执行也不改写快照。 */
export async function readRecentRagRecalls(
  projectId: number,
  limit = 8,
): Promise<RecentRagRecall[]> {
  const runs = await db.nodeRuns.where('projectId').equals(projectId).reverse().sortBy('updatedAt')
  const recalls: RecentRagRecall[] = []
  for (const run of runs) {
    if (run.id == null) continue
    try {
      const snapshots = JSON.parse(run.inputSnapshotsJson || '{}') as Record<string, {
        nodeTitle?: string
        config?: { ragEntryKeys?: unknown }
        sourceEvidence?: {
          included?: string[]
          omitted?: string[]
          trimmed?: string[]
        }
      }>
      for (const snapshot of Object.values(snapshots)) {
        if (!Array.isArray(snapshot.config?.ragEntryKeys) || !snapshot.config?.ragEntryKeys.length) continue
        recalls.push({
          runId: run.id,
          startedAt: run.startedAt,
          nodeTitle: snapshot.nodeTitle || '项目元素节点',
          included: snapshot.sourceEvidence?.included ?? [],
          omitted: snapshot.sourceEvidence?.omitted ?? [],
          trimmed: snapshot.sourceEvidence?.trimmed ?? [],
        })
        if (recalls.length >= limit) return recalls
      }
    } catch {
      // 历史损坏运行不阻塞资料库；节点运行页仍会按原行为显示空快照。
    }
  }
  return recalls
}
