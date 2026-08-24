import { useAIConfigStore } from '../../stores/ai-config'
import type { SupportedLang } from '../../i18n'
import {
  prepareGenerationNode,
  runGenerationNode,
} from '../generation/generation-node'
import {
  createOutlineGenerationTraceV1,
  type OutlineGenerationCandidateV1,
  type OutlineGenerationTraceV1,
} from '../outline/harness'
import { createOutlineGenerationNode } from '../outline/generation-node'
import type { RunOptions } from './adapters/outline-adapter'
import { chat } from './client'
import {
  parseChapterOutlineOutput,
  type ParsedChapter,
} from './parse-outline-output'
import type { AssembleContextResult } from '../registry/types'
import type { ChatMessage, OutlineNode, Project } from '../types'

/**
 * 稳定阶段码（语言无关）。回调里只允许出现这些码位，禁止写入任何自然语言
 * 文案；显示时经 locale key（outline ns → batch.stage.*）映射成本地化文案。
 * 新增阶段必须先在此登记码位，并同步 display-projection 与三语 locale。
 */
export const OUTLINE_BATCH_STAGES = ['generating-volume', 'volume-complete', 'volume-failed'] as const
export type OutlineBatchStage = typeof OUTLINE_BATCH_STAGES[number]

export interface BatchOutlineProgress {
  currentVolumeIndex: number
  totalVolumes: number
  currentVolumeTitle: string
  parsedChapters: ParsedChapter[]
  completedVolumes: number
  /** 稳定阶段码，见 OUTLINE_BATCH_STAGES；渲染端负责本地化显示。 */
  stage: OutlineBatchStage
}

export interface BatchOutlineFailure {
  volumeId: number
  volumeTitle: string
  reason: string
}

export interface BatchOutlineResult {
  batchGroupId: string
  chaptersByVolume: Map<number, ParsedChapter[]>
  candidatesByVolume: Map<number, OutlineGenerationCandidateV1>
  failures: BatchOutlineFailure[]
  cancelled: boolean
  elapsed: number
}

export interface BatchOutlineContextRequest {
  volume: OutlineNode
  priorOutlineCandidateText?: string
}

export interface BatchOutlineOptions {
  project: Project
  nodes: OutlineNode[]
  volumes: OutlineNode[]
  assembleContext: (request: BatchOutlineContextRequest) => Promise<AssembleContextResult>
  userHint?: string
  /** 角色上下文 */
  characterContext?: string
  /** Phase 32: 世界规则清单（替代旧 historicalContext + creativeMode） */
  worldRulesContext?: string
  /** 多世界：按卷解析各自世界规则（提供则逐卷覆盖 worldRulesContext） */
  worldRulesContextResolver?: (volumeId: number) => Promise<string>
  /** Phase 3: 项目 RESOLVED 内容语言（注入对应语言的章标题示例）；缺省回退语言无关占位符 */
  contentLanguage?: SupportedLang
  runOptions?: RunOptions
  onProgress?: (progress: BatchOutlineProgress) => void
  signal?: AbortSignal
  /** Test seam for proving one model call per volume without changing production routing. */
  runModel?: (messages: ChatMessage[], volume: OutlineNode, signal?: AbortSignal) => Promise<string>
  /** Stable injection for recovery tests. Production callers omit it. */
  batchGroupId?: string
}

function newBatchGroupId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `outline-batch-${globalThis.crypto.randomUUID()}`
  }
  return `outline-batch-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

function priorCandidateContext(input: {
  volume: OutlineNode
  chapters: ParsedChapter[]
  candidate: OutlineGenerationCandidateV1
}): string {
  return [
    '【同批次上一卷章纲候选（尚未采纳）】',
    `卷：${input.volume.title}`,
    `候选哈希：${input.candidate.candidateHash}`,
    ...input.chapters.map((chapter, index) => (
      `${index + 1}. ${chapter.title}${chapter.summary ? `：${chapter.summary}` : ''}`
    )),
    '仅用于保持后续卷的承接关系；它不是已采纳 Canon，不得覆盖用户正式设定。',
  ].join('\n')
}

function cancelledResult(input: {
  batchGroupId: string
  chaptersByVolume: Map<number, ParsedChapter[]>
  candidatesByVolume: Map<number, OutlineGenerationCandidateV1>
  failures: BatchOutlineFailure[]
  startTime: number
}): BatchOutlineResult {
  return {
    batchGroupId: input.batchGroupId,
    chaptersByVolume: input.chaptersByVolume,
    candidatesByVolume: input.candidatesByVolume,
    failures: input.failures,
    cancelled: true,
    elapsed: Date.now() - input.startTime,
  }
}

async function finalizeFailedTrace(input: {
  trace: OutlineGenerationTraceV1 | null
  cancelled: boolean
  code: string
}): Promise<void> {
  if (!input.trace) return
  try {
    await input.trace.terminateRun({
      status: input.cancelled ? 'cancelled' : 'failed',
      code: input.code,
    })
  } catch (error) {
    console.warn('[BatchOutline] 未能提交卷级运行终止证据。', error)
  }
}

/**
 * 按卷生成 durable 章纲候选。每卷只有一次模型调用；输出必须通过
 * 确定性解析，候选持久化成功后才会进入可确认结果。
 */
export async function runBatchOutlineGeneration(
  options: BatchOutlineOptions,
): Promise<BatchOutlineResult> {
  const {
    project,
    nodes,
    volumes,
    assembleContext,
    userHint,
    contentLanguage,
    runOptions = {},
    onProgress,
    signal,
  } = options
  if (project.id == null) throw new Error('批量章纲生成缺少项目 ID')
  const batchGroupId = options.batchGroupId ?? newBatchGroupId()
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(batchGroupId)) throw new Error('批量章纲任务 ID 不符合受控格式')

  const config = useAIConfigStore.getState().config
  const chaptersByVolume = new Map<number, ParsedChapter[]>()
  const candidatesByVolume = new Map<number, OutlineGenerationCandidateV1>()
  const failures: BatchOutlineFailure[] = []
  const startTime = Date.now()
  let previous: {
    volume: OutlineNode
    chapters: ParsedChapter[]
    candidate: OutlineGenerationCandidateV1
  } | null = null

  for (let index = 0; index < volumes.length; index++) {
    if (signal?.aborted) {
      return cancelledResult({ batchGroupId, chaptersByVolume, candidatesByVolume, failures, startTime })
    }
    const volume = volumes[index]
    if (volume.id == null) {
      failures.push({ volumeId: -1, volumeTitle: volume.title, reason: '目标卷缺少持久化 ID' })
      continue
    }
    const volumeId = volume.id
    onProgress?.({
      currentVolumeIndex: index,
      totalVolumes: volumes.length,
      currentVolumeTitle: volume.title,
      parsedChapters: [],
      completedVolumes: index,
      stage: 'generating-volume',
    })

    let trace: OutlineGenerationTraceV1 | null = null
    try {
      const scopedPrevious = previous
        && (previous.volume.worldGroupId ?? null) === (volume.worldGroupId ?? null)
        ? previous
        : null
      const predecessorCandidateHash = scopedPrevious?.candidate.candidateHash
      const assembled = await assembleContext({
        volume,
        priorOutlineCandidateText: scopedPrevious ? priorCandidateContext(scopedPrevious) : undefined,
      })
      if (signal?.aborted) {
        return cancelledResult({ batchGroupId, chaptersByVolume, candidatesByVolume, failures, startTime })
      }
      const request = { kind: 'chapters' as const, volumeId }
      const runModel = options.runModel ?? ((messages: ChatMessage[], target: OutlineNode, abortSignal?: AbortSignal) => (
        chat(messages, config, { category: 'outline.chapter', projectId: target.projectId }, abortSignal)
      ))
      const node = createOutlineGenerationNode({
        request,
        project,
        nodes,
        volumes,
        hint: userHint ?? '',
        runOptions: {
          ...runOptions,
          // A direct batch call without an explicit resolved language must not
          // inherit the UI locale's examples.
          contentLanguage: contentLanguage ?? null,
        },
        ai: { start: messages => runModel(messages, volume, signal) },
      })
      const prepared = prepareGenerationNode(node, assembled)
      trace = await createOutlineGenerationTraceV1({
        projectId: project.id,
        worldGroupId: volume.worldGroupId ?? null,
        request,
        assembled,
        durable: true,
        batch: {
          batchGroupId,
          batchIndex: index,
          batchTotal: volumes.length,
          ...(predecessorCandidateHash ? { predecessorCandidateHash } : {}),
        },
      })
      if (!trace.durable) {
        throw new Error(`durable 运行初始化失败：${trace.initializationError ?? '未知原因'}`)
      }
      const generation = await runGenerationNode(node, prepared, { shadowTrace: trace })
      if (generation.gate?.status === 'blocked') {
        throw new Error(generation.gate.issues.map(issue => issue.message).join('；'))
      }
      const parsed = parseChapterOutlineOutput(generation.output)
      if (parsed.length === 0) throw new Error('模型输出无法确定性解析为章节大纲')
      const candidate = await trace.persistCandidate(generation.output)
      if (!candidate) throw new Error('durable 候选未能持久化')

      chaptersByVolume.set(volumeId, parsed)
      candidatesByVolume.set(volumeId, candidate)
      previous = { volume, chapters: parsed, candidate }
      onProgress?.({
        currentVolumeIndex: index,
        totalVolumes: volumes.length,
        currentVolumeTitle: volume.title,
        parsedChapters: parsed,
        completedVolumes: index + 1,
        stage: 'volume-complete',
      })
      if (signal?.aborted) {
        await finalizeFailedTrace({
          trace,
          cancelled: true,
          code: 'author_cancelled_batch',
        })
        return cancelledResult({ batchGroupId, chaptersByVolume, candidatesByVolume, failures, startTime })
      }
    } catch (error) {
      if (signal?.aborted) {
        await finalizeFailedTrace({
          trace,
          cancelled: true,
          code: 'author_cancelled_batch',
        })
        return cancelledResult({ batchGroupId, chaptersByVolume, candidatesByVolume, failures, startTime })
      }
      const reason = error instanceof Error ? error.message : String(error)
      await finalizeFailedTrace({
        trace,
        cancelled: false,
        code: reason,
      })
      console.error(`[BatchOutline] 卷「${volume.title}」生成失败:`, error)
      failures.push({ volumeId, volumeTitle: volume.title, reason })
      onProgress?.({
        currentVolumeIndex: index,
        totalVolumes: volumes.length,
        currentVolumeTitle: volume.title,
        parsedChapters: [],
        completedVolumes: index + 1,
        stage: 'volume-failed',
      })
    }
  }

  return {
    batchGroupId,
    chaptersByVolume,
    candidatesByVolume,
    failures,
    cancelled: false,
    elapsed: Date.now() - startTime,
  }
}
