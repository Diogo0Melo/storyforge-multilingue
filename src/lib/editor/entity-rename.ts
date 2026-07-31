import { db } from '../db/schema'
import type {
  Character,
  CodexCategory,
  CodexEntry,
  ImportantLocation,
  StateCategory,
} from '../types'
import { adopt } from '../registry/adopt'
import { transactionTablesFor } from '../registry/lifecycle'
import i18n from '../../i18n/i18n'
import {
  buildChapterSearchTargets,
  findChapterMatches,
  replaceChapterContent,
  type ChapterMatchPreview,
} from './find-replace'

export type RenamableEntityKind = 'character' | 'location' | 'codexEntry'

export interface RenamableEntity {
  kind: RenamableEntityKind
  id: number
  name: string
  label: string
  detail: string
}

export interface EntityRenameTarget {
  kind: RenamableEntityKind
  id: number
}

export interface EntityRenameRecordChange {
  target:
    | 'characters'
    | 'importantLocations'
    | 'codexEntries'
    | 'chapters'
    | 'stateCards'
    | 'temporalFacts'
    | 'knowledgeLedger'
    | 'cultivationProgress'
    | 'itemLedger'
  id: number
  before: Record<string, unknown>
  after: Record<string, unknown>
}

export interface EntityRenameManualReview {
  source: string
  label: string
  detail: string
}

export interface EntityRenamePreview {
  entity: RenamableEntity
  newName: string
  blockers: string[]
  warnings: string[]
  chapterMatches: ChapterMatchPreview[]
  chapterReplacementCount: number
  structuredCounts: Array<{ label: string; count: number }>
  manualReview: EntityRenameManualReview[]
  changes: EntityRenameRecordChange[]
  baseline: string
}

export interface EntityRenameUndoPatch {
  label: string
  snapshotId: number
  projectId: number
  entity: EntityRenameTarget
  oldName: string
  newName: string
  changes: EntityRenameRecordChange[]
}

export interface ExecuteEntityRenameArgs {
  projectId: number
  entity: EntityRenameTarget
  newName: string
  expectedBaseline: string
  createSnapshot: (projectId: number, label: string, type: 'auto' | 'manual') => Promise<number>
  label: string
}

export interface ExecuteEntityRenameResult {
  snapshotId: number
  changedRecords: number
  chapterReplacements: number
  undoPatch: EntityRenameUndoPatch
}

function entityKindLabel(kind: RenamableEntityKind): string {
  return i18n.t(`editor:entityType.${kind}`)
}

const TARGET_TABLE: Record<RenamableEntityKind, EntityRenameRecordChange['target']> = {
  character: 'characters',
  location: 'importantLocations',
  codexEntry: 'codexEntries',
}

function normalizedName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase()
}

function hasText(value: unknown, query: string): boolean {
  const normalizedQuery = normalizedName(query)
  if (!normalizedQuery) return false
  if (typeof value === 'string') return value.normalize('NFKC').toLocaleLowerCase().includes(normalizedQuery)
  if (Array.isArray(value)) return value.some(item => hasText(item, query))
  if (value && typeof value === 'object') return Object.values(value).some(item => hasText(item, query))
  return false
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function sortedChanges(changes: EntityRenameRecordChange[]): EntityRenameRecordChange[] {
  return [...changes].sort((left, right) =>
    left.target.localeCompare(right.target)
    || left.id - right.id
    || JSON.stringify(left.before).localeCompare(JSON.stringify(right.before)),
  )
}

function buildBaseline(input: {
  entity: RenamableEntity
  newName: string
  blockers: string[]
  changes: EntityRenameRecordChange[]
}): string {
  return JSON.stringify({
    entity: { kind: input.entity.kind, id: input.entity.id, name: input.entity.name },
    newName: input.newName,
    blockers: [...input.blockers].sort(),
    changes: sortedChanges(input.changes),
  })
}

async function projectEntities(projectId: number): Promise<{
  entities: RenamableEntity[]
  characters: Character[]
  categories: CodexCategory[]
  codexEntries: CodexEntry[]
  locations: ImportantLocation[]
}> {
  const [characters, locations, categories, codexEntries] = await Promise.all([
    db.characters.where('projectId').equals(projectId).toArray(),
    db.importantLocations.where('projectId').equals(projectId).toArray(),
    db.codexCategories.where('projectId').equals(projectId).toArray(),
    db.codexEntries.where('projectId').equals(projectId).toArray(),
  ])
  const categoryById = new Map(categories.map(category => [category.id, category]))
  const entities: RenamableEntity[] = [
    ...characters
      .filter(character => character.id != null)
      .map(character => ({
        kind: 'character' as const,
        id: character.id!,
        name: character.name,
        label: character.name,
        detail: `${i18n.t('editor:entityType.character')} · ${character.homeWorldGroupId == null ? i18n.t('editor:worldGroup.primaryOrUngrouped') : i18n.t('editor:worldGroup.numbered', { id: character.homeWorldGroupId })}`,
      })),
    ...locations
      .filter(location => location.id != null)
      .map(location => ({
        kind: 'location' as const,
        id: location.id!,
        name: location.name,
        label: location.name,
        detail: i18n.t('editor:entityType.importantLocation'),
      })),
    ...codexEntries
      .filter(entry => entry.id != null)
      .map(entry => ({
        kind: 'codexEntry' as const,
        id: entry.id!,
        name: entry.name,
        label: entry.name,
        detail: `${i18n.t('editor:entityType.codexEntry')} · ${categoryById.get(entry.categoryId)?.name ?? i18n.t('editor:category.numbered', { id: entry.categoryId })}`,
      })),
  ]
  return { entities, characters, categories, codexEntries, locations }
}

export async function listRenamableEntities(projectId: number): Promise<RenamableEntity[]> {
  const { entities } = await projectEntities(projectId)
  return entities.sort((left, right) =>
    left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name, 'zh-CN'),
  )
}

function targetEntity(
  entities: RenamableEntity[],
  target: EntityRenameTarget,
): RenamableEntity | undefined {
  return entities.find(entity => entity.kind === target.kind && entity.id === target.id)
}

function addChange(
  changes: EntityRenameRecordChange[],
  target: EntityRenameRecordChange['target'],
  id: number | undefined,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): void {
  if (id == null || sameValue(before, after)) return
  changes.push({ target, id, before, after })
}

function expectedStateCategory(
  entity: RenamableEntity,
  categories: CodexCategory[],
  codexEntries: CodexEntry[],
): StateCategory | null {
  if (entity.kind === 'character') return 'character'
  if (entity.kind === 'location') return 'location'
  const entry = codexEntries.find(item => item.id === entity.id)
  const category = categories.find(item => item.id === entry?.categoryId)
  return category?.builtInKey === 'faction' ? 'faction' : null
}

function structuredCounts(changes: EntityRenameRecordChange[]): Array<{ label: string; count: number }> {
  const labels: Partial<Record<EntityRenameRecordChange['target'], string>> = {
    characters: i18n.t('editor:structuredType.characters'),
    importantLocations: i18n.t('editor:structuredType.importantLocations'),
    codexEntries: i18n.t('editor:structuredType.codexEntries'),
    stateCards: i18n.t('editor:structuredType.stateCards'),
    temporalFacts: i18n.t('editor:structuredType.temporalFacts'),
    knowledgeLedger: i18n.t('editor:structuredType.knowledgeLedger'),
    cultivationProgress: i18n.t('editor:structuredType.cultivationProgress'),
    itemLedger: i18n.t('editor:structuredType.itemLedger'),
  }
  return Object.entries(labels)
    .map(([target, label]) => ({
      label: label!,
      count: changes.filter(change => change.target === target).length,
    }))
    .filter(item => item.count > 0)
}

function pushManualReview(
  output: EntityRenameManualReview[],
  source: string,
  label: string,
  detail: string,
): void {
  if (output.some(item => item.source === source && item.label === label && item.detail === detail)) return
  output.push({ source, label, detail })
}

export async function buildEntityRenamePreview(
  projectId: number,
  target: EntityRenameTarget,
  requestedName: string,
): Promise<EntityRenamePreview> {
  const newName = requestedName.normalize('NFKC').trim()
  const { entities, characters, categories, codexEntries, locations } = await projectEntities(projectId)
  const entity = targetEntity(entities, target)
  if (!entity) throw new Error(i18n.t('errors:editor.entityNotFound'))

  const blockers: string[] = []
  const warnings: string[] = []
  const changes: EntityRenameRecordChange[] = []
  const manualReview: EntityRenameManualReview[] = []
  const oldKey = normalizedName(entity.name)
  const newKey = normalizedName(newName)

  if (!newName) blockers.push(i18n.t('errors:editor.nameRequired'))
  if (newKey === oldKey) blockers.push(i18n.t('errors:editor.sameName'))

  const itemRows = await db.itemLedger.where('projectId').equals(projectId).toArray()
  const itemNames = Array.from(new Set(itemRows.map(row => row.itemName.trim()).filter(Boolean)))
  const oldEntityCollisions = entities.filter(item =>
    !(item.kind === entity.kind && item.id === entity.id)
    && normalizedName(item.name) === oldKey,
  )
  const newEntityCollisions = entities.filter(item =>
    !(item.kind === entity.kind && item.id === entity.id)
    && normalizedName(item.name) === newKey,
  )
  if (oldEntityCollisions.length || itemNames.some(name => normalizedName(name) === oldKey)) {
    blockers.push(i18n.t('errors:editor.oldNameCollision', { name: entity.name }))
  }
  if (newName && (newEntityCollisions.length || itemNames.some(name => normalizedName(name) === newKey))) {
    blockers.push(i18n.t('errors:editor.newNameCollision', { name: newName }))
  }

  addChange(changes, TARGET_TABLE[entity.kind], entity.id, { name: entity.name }, { name: newName })

  const [
    chapters,
    outlineNodes,
    stateCards,
    temporalFacts,
    knowledgeRows,
    cultivationRows,
    storyCores,
    detailedOutlines,
  ] = await Promise.all([
    db.chapters.where('projectId').equals(projectId).toArray(),
    db.outlineNodes.where('projectId').equals(projectId).toArray(),
    db.stateCards.where('projectId').equals(projectId).toArray(),
    db.temporalFacts.where('projectId').equals(projectId).toArray(),
    db.knowledgeLedger.where('projectId').equals(projectId).toArray(),
    db.cultivationProgress.where('projectId').equals(projectId).toArray(),
    db.storyCores.where('projectId').equals(projectId).toArray(),
    db.detailedOutlines.where('projectId').equals(projectId).toArray(),
  ])

  const protectedTerms = Array.from(new Set([
    ...entities.map(item => item.name.trim()),
    ...itemNames,
  ].filter(Boolean)))
  const searchOptions = {
    query: entity.name,
    replacement: newName,
    wholeWord: true,
    protectedTerms,
  }
  const chapterTargets = buildChapterSearchTargets(chapters, outlineNodes)
  const chapterMatches = chapterTargets
    .map(chapter => findChapterMatches(chapter, searchOptions))
    .filter((match): match is ChapterMatchPreview => !!match)
  for (const chapterTarget of chapterTargets) {
    const replacement = replaceChapterContent(chapterTarget.content, searchOptions)
    if (!replacement.count) continue
    const chapter = chapters.find(item => item.id === chapterTarget.id)
    if (!chapter) continue
    addChange(
      changes,
      'chapters',
      chapter.id,
      { content: chapter.content || '', wordCount: chapter.wordCount || 0 },
      { content: replacement.html, wordCount: replacement.wordCount },
    )
  }

  const canonicalChapterIds = new Set(chapterTargets.map(chapter => chapter.id))
  for (const chapter of chapters) {
    if (chapter.id != null && !canonicalChapterIds.has(chapter.id) && hasText(chapter.content, entity.name)) {
      pushManualReview(manualReview, i18n.t('editor:manualReview.chapterBody'), chapter.title || i18n.t('editor:manualReview.chapterNumbered', { id: chapter.id }), i18n.t('editor:manualReview.nonCanonicalChapter'))
    }
  }

  const stateCategory = expectedStateCategory(entity, categories, codexEntries)
  if (stateCategory) {
    if (stateCards.some(card =>
      card.category === stateCategory
      && normalizedName(card.entityName) === newKey
      && normalizedName(card.entityName) !== oldKey,
    )) {
      blockers.push(i18n.t('errors:editor.stateCardCollision', { name: newName }))
    }
    for (const card of stateCards.filter(card =>
      card.category === stateCategory && normalizedName(card.entityName) === oldKey,
    )) {
      addChange(changes, 'stateCards', card.id, { entityName: card.entityName }, { entityName: newName })
    }
  } else if (stateCards.some(card => normalizedName(card.entityName) === oldKey)) {
    warnings.push(i18n.t('editor:manualReview.stateCardNoMapping'))
  }

  if (entity.kind === 'character') {
    for (const fact of temporalFacts.filter(row => row.characterId === entity.id)) {
      addChange(changes, 'temporalFacts', fact.id, { subjectName: fact.subjectName }, { subjectName: newName })
    }
    for (const row of knowledgeRows.filter(item => item.characterId === entity.id)) {
      addChange(changes, 'knowledgeLedger', row.id, { characterName: row.characterName }, { characterName: newName })
    }
    for (const row of cultivationRows.filter(item => item.characterId === entity.id)) {
      addChange(changes, 'cultivationProgress', row.id, { characterName: row.characterName }, { characterName: newName })
    }
    for (const row of itemRows.filter(item => item.characterId === entity.id)) {
      addChange(changes, 'itemLedger', row.id, { heldByName: row.heldByName }, { heldByName: newName })
    }
  } else if (entity.kind === 'location') {
    for (const fact of temporalFacts.filter(row => row.locationId === entity.id)) {
      addChange(changes, 'temporalFacts', fact.id, { subjectName: fact.subjectName }, { subjectName: newName })
    }
  } else {
    for (const fact of temporalFacts.filter(row => row.codexEntryId === entity.id)) {
      addChange(changes, 'temporalFacts', fact.id, { subjectName: fact.subjectName }, { subjectName: newName })
    }
  }

  for (const node of outlineNodes) {
    if (hasText(node.title, entity.name) || hasText(node.summary, entity.name)) {
      pushManualReview(manualReview, i18n.t('editor:manualReview.outline'), node.title || i18n.t('editor:manualReview.outlineNodeNumbered', { id: node.id }), i18n.t('editor:manualReview.outlineContainsOldName'))
    }
  }
  for (const row of detailedOutlines) {
    if (hasText(row, entity.name)) {
      pushManualReview(manualReview, i18n.t('editor:manualReview.detailedOutline'), i18n.t('editor:manualReview.outlineNodeNumbered', { id: row.outlineNodeId }), i18n.t('editor:manualReview.detailedOutlineContainsOldName'))
    }
  }
  for (const row of storyCores) {
    if (hasText(row, entity.name)) {
      pushManualReview(manualReview, i18n.t('editor:manualReview.storyCore'), i18n.t('editor:manualReview.recordNumbered', { id: row.id }), i18n.t('editor:manualReview.storyCoreContainsOldName'))
    }
  }
  for (const fact of temporalFacts) {
    if (hasText(fact.value, entity.name) || hasText(fact.sourceQuote, entity.name)) {
      pushManualReview(manualReview, i18n.t('editor:manualReview.factLedger'), i18n.t('editor:manualReview.factNumbered', { id: fact.id }), i18n.t('editor:manualReview.factContainsOldName'))
    }
  }
  for (const card of stateCards) {
    if (hasText(card.fields, entity.name)) {
      pushManualReview(manualReview, i18n.t('editor:manualReview.stateCardContent'), `${card.entityName} · ${card.category}`, i18n.t('editor:manualReview.stateCardContainsOldName'))
    }
  }
  const descriptiveEntities = [
    ...characters.map(row => ({ kind: 'character' as const, row })),
    ...locations.map(row => ({ kind: 'location' as const, row })),
    ...codexEntries.map(row => ({ kind: 'codexEntry' as const, row })),
  ]
  for (const item of descriptiveEntities) {
    if (item.kind === entity.kind && item.row.id === entity.id) continue
    if (hasText(item.row, entity.name)) {
      pushManualReview(
        manualReview,
        `${entityKindLabel(item.kind)}${i18n.t('editor:suffix.record')}`,
        item.row.name,
        i18n.t('editor:manualReview.containsOldName'),
      )
    }
  }

  if (manualReview.length) {
    warnings.push(i18n.t('editor:warning.manualReviewRequired', { count: manualReview.length }))
  }
  warnings.push(i18n.t('editor:warning.snapshotsPreserved'))

  const sorted = sortedChanges(changes)
  const preview: EntityRenamePreview = {
    entity,
    newName,
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    chapterMatches,
    chapterReplacementCount: chapterMatches.reduce((sum, match) => sum + match.count, 0),
    structuredCounts: structuredCounts(sorted),
    manualReview,
    changes: sorted,
    baseline: '',
  }
  preview.baseline = buildBaseline(preview)
  return preview
}

async function getRecord(
  target: EntityRenameRecordChange['target'],
  id: number,
): Promise<Record<string, unknown> | undefined> {
  return await db[target].get(id) as Record<string, unknown> | undefined
}

async function assertRecordState(change: EntityRenameRecordChange, side: 'before' | 'after'): Promise<void> {
  const current = await getRecord(change.target, change.id)
  if (!current) throw new Error(i18n.t('errors:editor.recordGone', { target: change.target, id: change.id }))
  const expected = change[side]
  for (const [field, value] of Object.entries(expected)) {
    if (!sameValue(current[field], value)) {
      throw new Error(i18n.t('errors:editor.recordModified', { target: change.target, id: change.id, field }))
    }
  }
}

async function applyChange(
  projectId: number,
  change: EntityRenameRecordChange,
  side: 'before' | 'after',
): Promise<void> {
  const data = change[side]
  if (change.target === 'temporalFacts') {
    await db.temporalFacts.update(change.id, { ...data, updatedAt: Date.now() })
    return
  }
  const result = await adopt({
    projectId,
    target: change.target,
    recordId: change.id,
    mode: 'replace',
    data,
  })
  if (result.written.length !== 1 || result.skipped.length || result.typeErrors.length || result.fkErrors.length) {
    throw new Error(i18n.t('errors:editor.registryReject', { target: change.target, id: change.id }))
  }
}

export async function executeEntityRename(
  args: ExecuteEntityRenameArgs,
): Promise<ExecuteEntityRenameResult> {
  const preview = await buildEntityRenamePreview(args.projectId, args.entity, args.newName)
  if (preview.baseline !== args.expectedBaseline) throw new Error(i18n.t('errors:editor.baselineChanged'))
  if (preview.blockers.length) throw new Error(preview.blockers.join('；'))

  const snapshotId = await args.createSnapshot(args.projectId, args.label, 'manual')
  await db.transaction('rw', transactionTablesFor('importProject'), async () => {
    const current = await buildEntityRenamePreview(args.projectId, args.entity, args.newName)
    if (current.baseline !== args.expectedBaseline || current.blockers.length) {
      throw new Error(i18n.t('errors:editor.snapshotDataChanged'))
    }
    for (const change of current.changes) await assertRecordState(change, 'before')
    for (const change of current.changes) await applyChange(args.projectId, change, 'after')
  })

  return {
    snapshotId,
    changedRecords: preview.changes.length,
    chapterReplacements: preview.chapterReplacementCount,
    undoPatch: {
      label: `${args.label} · ${i18n.t('editor:suffix.snapshot', { id: snapshotId })}`,
      snapshotId,
      projectId: args.projectId,
      entity: args.entity,
      oldName: preview.entity.name,
      newName: preview.newName,
      changes: preview.changes,
    },
  }
}

export async function undoEntityRename(patch: EntityRenameUndoPatch): Promise<number> {
  await db.transaction('rw', transactionTablesFor('importProject'), async () => {
    const reversePreview = await buildEntityRenamePreview(
      patch.projectId,
      patch.entity,
      patch.oldName,
    )
    if (reversePreview.blockers.length) {
      throw new Error(i18n.t('errors:editor.undoBlockers', { blockers: reversePreview.blockers.join('；') }))
    }
    const changeShape = (change: EntityRenameRecordChange) => JSON.stringify({
      target: change.target,
      id: change.id,
      fields: Array.from(new Set([
        ...Object.keys(change.before),
        ...Object.keys(change.after),
      ])).sort(),
    })
    const expectedShapes = patch.changes.map(changeShape).sort()
    const currentShapes = reversePreview.changes.map(changeShape).sort()
    if (!sameValue(expectedShapes, currentShapes)) {
      throw new Error(i18n.t('errors:editor.undoNewRecords'))
    }
    for (const change of patch.changes) await assertRecordState(change, 'after')
    for (const change of [...patch.changes].reverse()) await applyChange(patch.projectId, change, 'before')
  })
  return patch.changes.length
}
