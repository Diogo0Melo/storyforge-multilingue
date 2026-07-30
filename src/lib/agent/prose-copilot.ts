import { useAIConfigStore } from '../../stores/ai-config'
import { buildChapterContentPrompt, buildContinuePrompt } from '../ai/adapters/chapter-adapter'
import { chat, resolveRequestConfig } from '../ai/client'
import { buildBestChapterByOutlineMap } from '../chapters/selectors'
import { db } from '../db/schema'
import type {
  GenerationGateIssue,
  GenerationNode,
  PreparedGenerationNode,
} from '../generation/generation-node'
import { prepareGenerationNode } from '../generation/generation-node'
import { walkOutlineChaptersInCanonicalOrder } from '../outline/canonical-outline-walk'
import { adopt } from '../registry/adopt'
import { assembleContext } from '../registry/assemble-context'
import { rebuildChapterChunks } from '../retrieval/retrieval'
import type { AIConfig, Chapter, OutlineNode, Project } from '../types'
import { countWords, htmlToPlainText, plainTextToHtml } from '../utils/html'
import {
  evidenceFromContextResult,
  resolveAgentContextPolicy,
  type AgentContextEvidence,
  type AgentContextProfile,
} from './context-policy'
import i18n from '../../i18n/i18n'

export const PROSE_COPILOT_SOURCE_KEYS = [
  'contextMemo',
  'chapterOutline',
  'detailedOutline',
  'chapterContinuityHandoff',
  'previousPlanReconciliation',
  'previousChapterEnding',
  'recentChapterSummaries',
  'worldview',
  'storyCore',
  'characterDrivenPlan',
  'powerSystem',
  'cultivationProgress',
  'codex',
  'characters',
  'creativeRules',
  'worldRules',
  'historical',
  'locations',
  'foreshadows',
  'storyArcs',
  'storylineProgress',
  'emotionBeats',
  'stateCards',
  'currentFacts',
  'canonAssertions',
  'characterKnowledge',
  'heldItems',
  'retrievedPassages',
  'references',
  'userStyleProfile',
] as const

export type ProseCopilotOperation = 'generate' | 'continue'

export interface ProseCopilotSnapshot {
  outlineNodeId: number
  outlineUpdatedAt: number
  chapterId: number | null
  chapterUpdatedAt: number | null
  chapterContentHash: string
  chapterHadContent: boolean
  chapterOrder: number
}

export interface ProseCopilotInput {
  project: Project
  worldGroupId: number | null
  authorRequest: string
  supplementalContext: string
  operation: ProseCopilotOperation
  outlineNode: OutlineNode
  chapter: Chapter | null
  snapshot: ProseCopilotSnapshot
  assembled: Awaited<ReturnType<typeof assembleContext>>
  previousTail: string
  config: AIConfig
  routingCategory?: string
  signal?: AbortSignal
}

export interface PreparedProseCopilot {
  node: GenerationNode<ProseCopilotInput, string, { chapterId: number }>
  prepared: PreparedGenerationNode
  contextSources: string[]
  snapshot: ProseCopilotSnapshot
  operation: ProseCopilotOperation
  outlineNodeId: number
  label: string
  contextEvidence: AgentContextEvidence
}

interface ProseCopilotDependencies {
  runAI?: (messages: ReturnType<typeof buildProseMessages>) => Promise<string>
  readCurrent?: () => Promise<ProseCopilotSnapshot>
  save?: (draft: string) => Promise<{ chapterId: number }>
}

const MIN_PROSE_CHARS = 80
const MAX_PROSE_CHARS = 200_000

export class ProseCopilotStaleError extends Error {
  constructor() {
    super(i18n.t('common:errors.agent.proseStale'))
    this.name = 'ProseCopilotStaleError'
  }
}

function fingerprintContent(value: string): string {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ (code + index), 0x85ebca6b)
  }
  return `${value.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`
}

export function parseProseCandidateDraft(draft: string): string {
  const value = draft.replace(/^```(?:markdown|text)?\s*/i, '').replace(/\s*```$/, '').trim()
  if (value.length < MIN_PROSE_CHARS) throw new Error(i18n.t('common:errors.agent.proseMinChars', { min: MIN_PROSE_CHARS }))
  if (value.length > MAX_PROSE_CHARS) throw new Error(i18n.t('common:errors.agent.proseMaxChars', { max: MAX_PROSE_CHARS }))
  return value
}

function chineseOrdinal(value: string): number | null {
  if (/^\d+$/.test(value)) return Number(value)
  const digits: Record<string, number> = {
    零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
    六: 6, 七: 7, 八: 8, 九: 9,
  }
  if (value === '十') return 10
  if (value.includes('十')) {
    const [left, right] = value.split('十')
    return (left ? digits[left] : 1) * 10 + (right ? digits[right] : 0)
  }
  return digits[value] ?? null
}

function operationFor(request: string): ProseCopilotOperation {
  return /续写|接着写|继续写|承接.{0,6}正文/.test(request) ? 'continue' : 'generate'
}

function scopedOutlineChapters(
  nodes: OutlineNode[],
  worldGroupId: number | null,
): ReturnType<typeof walkOutlineChaptersInCanonicalOrder>['chapters'] {
  return walkOutlineChaptersInCanonicalOrder(nodes).chapters
    .filter(item => (item.worldGroupId ?? null) === worldGroupId)
}

function selectTarget(
  request: string,
  nodes: OutlineNode[],
  chapters: Chapter[],
  worldGroupId: number | null,
  operation: ProseCopilotOperation,
): { outline: OutlineNode; chapter: Chapter | null; ordinal: number } {
  const candidates = scopedOutlineChapters(nodes, worldGroupId)
  if (!candidates.length) throw new Error(i18n.t('common:errors.agent.proseNoOutline'))
  const chaptersByOutline = buildBestChapterByOutlineMap(chapters)
  const named = candidates.find(item => (
    item.outlineNode.title.trim() && request.includes(item.outlineNode.title.trim())
  ))
  const ordinalMatch = request.match(/第\s*([零〇一二两三四五六七八九十\d]+)\s*章/)
  const requestedOrdinal = ordinalMatch ? chineseOrdinal(ordinalMatch[1]) : null
  const numbered = requestedOrdinal == null
    ? undefined
    : candidates.find(item => item.ordinal === requestedOrdinal)
  const automatic = operation === 'continue'
    ? [...candidates].reverse().find(item => {
        const chapter = chaptersByOutline.get(item.outlineNode.id!)
        return Boolean(htmlToPlainText(chapter?.content ?? '').trim())
      })
    : candidates.find(item => {
        const chapter = chaptersByOutline.get(item.outlineNode.id!)
        return !htmlToPlainText(chapter?.content ?? '').trim()
      })
  const selected = named ?? numbered ?? automatic
  if (!selected?.outlineNode.id) {
    throw new Error(operation === 'continue'
      ? i18n.t('common:errors.agent.proseNoContinueTarget')
      : i18n.t('common:errors.agent.proseNoGenerateTarget'))
  }
  const chapter = chaptersByOutline.get(selected.outlineNode.id) ?? null
  const hasContent = Boolean(htmlToPlainText(chapter?.content ?? '').trim())
  if (operation === 'generate' && hasContent) {
    throw new Error(i18n.t('common:errors.agent.proseAlreadyHasContent', { title: selected.outlineNode.title }))
  }
  if (operation === 'continue' && !hasContent) {
    throw new Error(i18n.t('common:errors.agent.proseNoContentYet', { title: selected.outlineNode.title }))
  }
  return { outline: selected.outlineNode, chapter, ordinal: selected.ordinal }
}

async function snapshotOf(
  outline: OutlineNode,
  chapter: Chapter | null,
  order: number,
): Promise<ProseCopilotSnapshot> {
  return {
    outlineNodeId: outline.id!,
    outlineUpdatedAt: outline.updatedAt,
    chapterId: chapter?.id ?? null,
    chapterUpdatedAt: chapter?.updatedAt ?? null,
    chapterContentHash: fingerprintContent(chapter?.content ?? ''),
    chapterHadContent: Boolean(htmlToPlainText(chapter?.content ?? '').trim()),
    chapterOrder: chapter?.order ?? Math.max(0, order - 1),
  }
}

async function readSnapshot(projectId: number, base: ProseCopilotSnapshot): Promise<ProseCopilotSnapshot> {
  const outline = await db.outlineNodes.get(base.outlineNodeId)
  if (!outline || outline.projectId !== projectId) throw new ProseCopilotStaleError()
  const chapter = base.chapterId == null ? null : await db.chapters.get(base.chapterId)
  if (chapter && chapter.projectId !== projectId) throw new ProseCopilotStaleError()
  if (chapter && chapter.outlineNodeId !== base.outlineNodeId) throw new ProseCopilotStaleError()
  if (base.chapterId == null) {
    const created = await db.chapters.where('outlineNodeId').equals(base.outlineNodeId)
      .and(row => row.projectId === projectId)
      .first()
    if (created) throw new ProseCopilotStaleError()
  }
  return snapshotOf(outline, chapter ?? null, base.chapterOrder + 1)
}

function sameSnapshot(left: ProseCopilotSnapshot, right: ProseCopilotSnapshot): boolean {
  return left.outlineNodeId === right.outlineNodeId
    && left.outlineUpdatedAt === right.outlineUpdatedAt
    && left.chapterId === right.chapterId
    && left.chapterUpdatedAt === right.chapterUpdatedAt
    && left.chapterContentHash === right.chapterContentHash
    && left.chapterHadContent === right.chapterHadContent
}

function candidateIssues(output: string): GenerationGateIssue[] {
  try {
    parseProseCandidateDraft(output)
    return []
  } catch (error) {
    return [{
      code: 'prose-invalid',
      message: error instanceof Error ? error.message : '正文候选无效。',
    }]
  }
}

function buildProseMessages(input: ProseCopilotInput) {
  const charactersIndex = input.assembled.included.indexOf('characters')
  const characters = charactersIndex >= 0
    ? input.assembled.segments[charactersIndex]?.content ?? ''
    : ''
  const world = input.assembled.segments
    .filter((_, index) => index !== charactersIndex)
    .map(segment => segment.content)
    .filter(Boolean)
    .join('\n\n')
  const supplemental = input.supplementalContext.trim()
    ? `\n\n【本轮上游候选（尚未采纳，不属于 Canon）】\n${input.supplementalContext.trim()}`
    : ''
  const hint = `${input.authorRequest}${supplemental}`
  if (input.operation === 'continue') {
    const context = characters ? `${world}\n\n${characters}` : world
    return buildContinuePrompt(
      htmlToPlainText(input.chapter?.content ?? ''),
      input.outlineNode.summary,
      context,
      hint,
    )
  }
  const worldRulesIndex = input.assembled.included.indexOf('worldRules')
  return buildChapterContentPrompt(
    input.outlineNode.title,
    input.outlineNode.summary,
    world,
    characters,
    input.previousTail,
    worldRulesIndex >= 0 ? input.assembled.segments[worldRulesIndex]?.content ?? '' : '',
    hint,
  )
}

async function adoptCandidate(input: {
  projectId: number
  worldGroupId: number | null
  operation: ProseCopilotOperation
  outline: OutlineNode
  snapshot: ProseCopilotSnapshot
  draft: string
}): Promise<{ chapterId: number }> {
  const candidate = parseProseCandidateDraft(input.draft)
  const chapterId = await db.transaction(
    'rw',
    db.chapters,
    db.outlineNodes,
    db.retrievalChunks,
    db.narrativeSummaryNodes,
    async () => {
      const current = await readSnapshot(input.projectId, input.snapshot)
      if (!sameSnapshot(current, input.snapshot)) throw new ProseCopilotStaleError()
      const chapter = current.chapterId == null ? null : await db.chapters.get(current.chapterId)
      const candidateHtml = plainTextToHtml(candidate)
      const content = input.operation === 'continue'
        ? `${chapter?.content ?? ''}${candidateHtml}`
        : candidateHtml
      const data = {
        outlineNodeId: input.outline.id!,
        title: input.outline.title,
        content,
        wordCount: countWords(htmlToPlainText(content)),
        status: 'draft' as const,
        order: current.chapterOrder,
        notes: chapter?.notes ?? '',
      }
      const result = chapter?.id == null
        ? await adopt({
            projectId: input.projectId,
            worldGroupId: input.worldGroupId,
            target: 'chapters',
            mode: 'add',
            data,
          })
        : await adopt({
            projectId: input.projectId,
            worldGroupId: input.worldGroupId,
            target: 'chapters',
            recordId: chapter.id,
            mode: 'replace',
            data: {
              content: data.content,
              wordCount: data.wordCount,
              status: data.status,
            },
          })
      const writtenId = result.written[0]?.id
      if (writtenId == null || result.skipped.length || result.typeErrors.length || result.fkErrors.length) {
        throw new Error(i18n.t('common:errors.agent.proseWriteFailed'))
      }
      const oldChunkIds = await db.retrievalChunks.where('sourceChapterId').equals(writtenId).primaryKeys()
      if (oldChunkIds.length) await db.retrievalChunks.bulkDelete(oldChunkIds as number[])
      const summaries = await db.narrativeSummaryNodes.where('projectId').equals(input.projectId).toArray()
      for (const summary of summaries) {
        if (summary.id != null && (
          summary.level === 'book'
          || summary.level === 'volume'
          || summary.sourceChapterId === writtenId
        )) {
          await db.narrativeSummaryNodes.update(summary.id, { status: 'stale', updatedAt: Date.now() })
        }
      }
      return writtenId
    },
  )
  const [chapter, characters] = await Promise.all([
    db.chapters.get(chapterId),
    db.characters.where('projectId').equals(input.projectId).toArray(),
  ])
  if (chapter) {
    await rebuildChapterChunks({
      projectId: input.projectId,
      chapter,
      worldGroupId: input.worldGroupId,
      knownEntities: characters.map(character => character.name),
    })
  }
  return { chapterId }
}

export async function adoptRestoredProseCandidate(input: {
  projectId: number
  worldGroupId: number | null
  operation: ProseCopilotOperation
  outlineNodeId: number
  snapshot: ProseCopilotSnapshot
  draft: string
}): Promise<{ chapterId: number }> {
  const outline = await db.outlineNodes.get(input.outlineNodeId)
  if (!outline || outline.projectId !== input.projectId) throw new ProseCopilotStaleError()
  return adoptCandidate({ ...input, outline })
}

export async function prepareProseCopilot(input: {
  projectId: number
  worldGroupId: number | null
  authorRequest: string
  supplementalContext?: string
  routingCategory?: string
  contextProfile?: AgentContextProfile
  signal?: AbortSignal
}): Promise<PreparedProseCopilot> {
  const project = await db.projects.get(input.projectId)
  if (!project) throw new Error(i18n.t('common:errors.agent.proseProjectNotFound'))
  if (project.enableMultiWorld && input.worldGroupId == null) {
    throw new Error(i18n.t('common:errors.agent.proseMultiWorldRequired'))
  }
  const worldGroupId = project.enableMultiWorld ? input.worldGroupId : null
  const request = input.authorRequest.trim()
  if (request.length < 2 || request.length > 2000) throw new Error(i18n.t('common:errors.agent.proseRequestLength'))
  if (/重写|改写|覆盖|替换.{0,6}正文/.test(request)) {
    throw new Error(i18n.t('common:errors.agent.proseNoOverwrite'))
  }
  const [nodes, chapters] = await Promise.all([
    db.outlineNodes.where('projectId').equals(input.projectId).toArray(),
    db.chapters.where('projectId').equals(input.projectId).toArray(),
  ])
  const operation = operationFor(request)
  const target = selectTarget(request, nodes, chapters, worldGroupId, operation)
  const snapshot = await snapshotOf(target.outline, target.chapter, target.ordinal)
  const defaultCategory = operation === 'continue' ? 'chapter.continue' : 'chapter.content'
  const routingCategory = input.routingCategory ?? defaultCategory
  const config = resolveRequestConfig(
    useAIConfigStore.getState().config,
    { category: routingCategory },
  ).config
  const contextProfile = input.contextProfile ?? 'full'
  const contextPolicy = resolveAgentContextPolicy('agent-prose', contextProfile)
  const previous = scopedOutlineChapters(nodes, worldGroupId)
    .filter(item => item.ordinal < target.ordinal)
    .reverse()
    .map(item => chapters.find(chapter => chapter.outlineNodeId === item.outlineNode.id))
    .find(chapter => Boolean(htmlToPlainText(chapter?.content ?? '').trim()))
  const previousTail = htmlToPlainText(previous?.content ?? '').slice(-1800)
  const assembled = await assembleContext({
    projectId: input.projectId,
    worldGroupId,
    outlineNodeId: target.outline.id,
    chapterId: target.chapter?.id ?? null,
    currentChapterOrder: target.chapter?.order ?? target.ordinal - 1,
    previousChapterEnding: previousTail,
    stateReferenceText: [target.outline.title, target.outline.summary].join(' '),
    provider: config.provider,
    model: config.model,
    sourceKeys: [...PROSE_COPILOT_SOURCE_KEYS],
    inputBudgetMaxTokens: contextPolicy.maxInputTokens,
    sourceBudgetScale: contextPolicy.sourceBudgetScale,
  })
  const current = await readSnapshot(input.projectId, snapshot)
  if (!sameSnapshot(current, snapshot)) throw new ProseCopilotStaleError()
  const nodeInput: ProseCopilotInput = {
    project,
    worldGroupId,
    authorRequest: request,
    supplementalContext: input.supplementalContext ?? '',
    operation,
    outlineNode: target.outline,
    chapter: target.chapter,
    snapshot,
    assembled,
    previousTail,
    config,
    routingCategory,
    signal: input.signal,
  }
  const node = createProseCopilotNode(nodeInput)
  return {
    node,
    prepared: prepareGenerationNode(node, nodeInput),
    contextSources: assembled.included,
    snapshot,
    operation,
    outlineNodeId: target.outline.id!,
    contextEvidence: evidenceFromContextResult(contextProfile, assembled),
    label: operation === 'continue'
      ? `续写《${target.outline.title}》`
      : `《${target.outline.title}》正文`,
  }
}

export function createProseCopilotNode(
  input: ProseCopilotInput,
  dependencies: ProseCopilotDependencies = {},
): PreparedProseCopilot['node'] {
  const readCurrent = dependencies.readCurrent
    ?? (() => readSnapshot(input.project.id!, input.snapshot))
  const save = dependencies.save ?? (draft => adoptCandidate({
    projectId: input.project.id!,
    worldGroupId: input.worldGroupId,
    operation: input.operation,
    outline: input.outlineNode,
    snapshot: input.snapshot,
    draft,
  }))
  const runAI = dependencies.runAI ?? (messages => chat(messages, input.config, {
    category: input.routingCategory ?? (input.operation === 'continue' ? 'chapter.continue' : 'chapter.content'),
    projectId: input.project.id!,
    configOverrides: { maxTokens: 16_000 },
    contextOverflowPolicy: 'reject',
  }, input.signal))
  return {
    id: `agent.chat-copilot.prose:${input.project.id}:${input.outlineNode.id}:${input.operation}:${input.snapshot.chapterUpdatedAt ?? 'new'}`,
    kind: input.operation === 'continue' ? 'chapter.continue' : 'chapter.content',
    editableInput: true,
    assembleInput: buildProseMessages,
    run: async messages => parseProseCandidateDraft(await runAI(messages)),
    gate: output => {
      const issues = candidateIssues(output)
      return { status: issues.length ? 'blocked' : 'pass', issues }
    },
    adopt: async output => {
      const current = await readCurrent()
      if (!sameSnapshot(current, input.snapshot)) throw new ProseCopilotStaleError()
      return save(parseProseCandidateDraft(output))
    },
  }
}
