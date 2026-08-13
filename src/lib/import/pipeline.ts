/**
 * 大文档分块导入流水线（Phase 18）
 *
 * 设计目标：让百万字～千万字小说也能稳定解析入库，并保证：
 *   · 每块即时写库（标签切走、刷新页面、断电都不丢已解析数据）
 *   · 单块失败自动重试 3 次，全失败后整体失败仍可手动重试
 *   · 支持暂停 / 恢复 / 取消
 *   · 状态、进度、日志全程通过 useImportStatusStore 暴露给 UI
 *   · 每 N 块 + 终末跑一次 AI 跨块角色合并，避免"一个人多个名"
 *
 * 严格串行（用户授权："慢点就慢点，保证不断就行"）。
 *
 * 本文件只负责"总控流"：
 *   · 持久化到单块 DB（chunk-writer.ts）
 *   · 结果累积 / 规范化 / 报告（unified-merge.ts）
 *   · AbortSignal 包装的 chat（chat-with-abort.ts）
 *   · AI 跨块角色合并（character-merge.ts）
 */

import { renderPrompt } from '../ai/prompt-engine'
import { usePromptStore } from '../../stores/prompt'
import { useAIConfigStore } from '../../stores/ai-config'
import { getAIConfigRequiredMessage, isAIConfigReady } from '../ai/config-readiness'
import { getT } from '../../i18n'
import { useImportSessionStore } from '../../stores/import-session'
import { useImportStatusStore } from '../../stores/import-status'
import { extractJSON, IMPORT_MAX_TOKENS } from '../ai/adapters/import-adapter'
import type { UnifiedParseResult } from '../types'
import type { AIConfig } from '../types'
import { resolveRequestConfig } from '../ai/client'
import type { ImportSession, ChunkState } from '../types'
import {
  registerChunkTexts as _registerChunkTexts,
  hasChunkTexts as _hasChunkTexts,
  clearChunkTexts as _clearChunkTexts,
  getChunkText,
} from './chunk-text-registry'
import {
  mergeUnified, buildRollingContext, normalizeUnified, buildFinalReport,
} from './unified-merge'
import { applyChunkResult, type ApplyChunkCounts } from './chunk-writer'
import { useReferenceStore } from '../../stores/reference'
import {
  writeShallowAnalysisFromTechniques,
  registerRefChunks,
  runRefAnalysis,
} from '../reference-analysis/pipeline'
import { createReferenceAnalysisRun } from '../reference-analysis/lifecycle'
import { chatWithAbort } from './chat-with-abort'
import { runCharacterMerge } from './character-merge'
import {
  formatCodexImportCatalog,
  loadCodexImportCategoryOptions,
  type CodexImportCategoryOption,
} from './codex-classification'

// 保留原有 API：UI / 其他模块一直从 pipeline 引入这三个函数。
export const registerChunkTexts = _registerChunkTexts
export const hasChunkTexts = _hasChunkTexts
export const clearChunkTexts = _clearChunkTexts

/** 跨块合并的触发周期 */
const MERGE_EVERY_N = 10

/** 单块最大重试次数（用户已批准 3 次） */
const MAX_ATTEMPTS = 3

/** 重试之间等多久（避免触发 rate limit），毫秒 */
const RETRY_DELAY_MS = 1500

/** 控制器：用户暂停 / 取消时切给 pipeline */
let activeController: AbortController | null = null
let activePauseFlag = { paused: false }

export function pausePipeline() {
  const t = getT()
  activePauseFlag.paused = true
  activeController?.abort()
  useImportStatusStore.getState().setPhase('paused')
  useImportStatusStore.getState().pushActivity('warn', t('errors-lib:import.pipelineUserPaused'))
}

export function cancelPipeline() {
  const t = getT()
  activeController?.abort()
  activePauseFlag.paused = true
  useImportStatusStore.getState().setPhase('idle')
  useImportStatusStore.getState().pushActivity('warn', t('errors-lib:import.pipelineUserCancelled'))
}

export function isPipelineRunning() {
  return activeController !== null && !activePauseFlag.paused
}

/** 暴露给 UI：跑一次完整的流水线（新会话 或 续跑现有会话） */
export async function runSession(args: {
  sessionId: number
  projectId: number
}): Promise<void> {
  const { sessionId, projectId } = args
  const t = getT()
  const sessionStore = useImportSessionStore.getState()
  const statusStore = useImportStatusStore.getState()

  // 拉最新 session
  let session = await sessionStore.load(sessionId)
  if (!session) throw new Error(t('errors-lib:import.sessionNotFound', { id: sessionId }))

  // 重置控制
  activeController = new AbortController()
  activePauseFlag = { paused: false }

  statusStore.attachSession({
    sessionId,
    filename: session.filename,
    totalChunks: session.totalChunks,
    finishedChunks: session.chunks.filter(c => c.status === 'done').length,
    failedChunks: session.chunks.filter(c => c.status === 'failed').length,
    phase: 'running',
  })
  statusStore.pushActivity('info',
    t('errors-lib:import.pipelineStart', { filename: session.filename, total: session.totalChunks }))
  await sessionStore.patch(sessionId, { status: 'running' })
  await sessionStore.log(sessionId, -1, 'info',
    t('errors-lib:import.pipelineStartLog', {
      total: session.totalChunks,
      done: session.chunks.filter(c => c.status === 'done').length,
    }))

  try {
    let processedSinceMerge = 0
    // 目录在本次 session 内固定，避免每块重复查库；确认写回时仍会重新解析当前目录。
    const codexOptions = await loadCodexImportCategoryOptions(projectId)

    for (const chunk of session.chunks) {
      // 已完成的跳过
      if (chunk.status === 'done') continue
      // 检查暂停 / 取消
      if (activePauseFlag.paused) {
        await sessionStore.patch(sessionId, { status: 'paused' })
        statusStore.pushActivity('warn', t('errors-lib:import.pipelinePaused'))
        return
      }

      session = await sessionStore.load(sessionId) // 重新读一次（防外部修改）
      if (!session) return

      const ok = await runChunk(session, chunk.index, projectId, codexOptions)
      if (ok) processedSinceMerge++

      // 每 N 块跑一次合并
      if (processedSinceMerge >= MERGE_EVERY_N) {
        processedSinceMerge = 0
        if (!activePauseFlag.paused) {
          await runCharacterMerge({
            sessionId,
            projectId,
            isFinal: false,
            signal: activeController?.signal,
            isPaused: () => activePauseFlag.paused,
          })
        }
      }
    }

    if (activePauseFlag.paused) return

    // 终末合并 + 收尾
    await runCharacterMerge({
      sessionId,
      projectId,
      isFinal: true,
      signal: activeController?.signal,
      isPaused: () => activePauseFlag.paused,
    })

    const fresh = await sessionStore.load(sessionId)
    if (!fresh) return
    const failedCount = fresh.chunks.filter(c => c.status === 'failed').length
    const doneCount = fresh.chunks.filter(c => c.status === 'done').length

    const report = buildFinalReport(fresh)

    // 项目参考模式：写入 references 表 + 按档位跑 13 维统一分析（浅层免费 / 深层逐块）
    if (fresh.importTarget === 'reference' && doneCount > 0) {
      try {
        await applyReferenceFromSession(projectId, fresh, sessionId, statusStore)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        statusStore.pushActivity('error', t('errors-lib:import.referenceSaveFailed', { message: msg }))
      }
    }

    await sessionStore.patch(sessionId, {
      status: failedCount === 0 ? 'done' : 'failed',
      finalReport: report,
      fatalError: failedCount > 0
        ? t('errors-lib:import.pipelineFatalChunk', { count: failedCount, attempts: MAX_ATTEMPTS })
        : undefined,
    })
    statusStore.setPhase(failedCount === 0 ? 'done' : 'failed')
    statusStore.pushActivity(failedCount === 0 ? 'success' : 'warn',
      t('errors-lib:import.pipelineDone', { done: doneCount, failed: failedCount }))
    if (failedCount > 0) {
      statusStore.setFatalError(t('errors-lib:import.pipelineFatalRetry', { count: failedCount }))
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if ((err as Error).name === 'AbortError') {
      statusStore.pushActivity('warn', t('errors-lib:import.pipelineAborted'))
      return
    }
    await sessionStore.patch(sessionId, { status: 'failed', fatalError: msg })
    statusStore.setPhase('failed')
    statusStore.setFatalError(msg)
    statusStore.pushActivity('error', t('errors-lib:import.pipelineTaskException', { message: msg }))
  } finally {
    activeController = null
  }
}

/** 跑单个 chunk，返回是否成功 */
async function runChunk(
  session: ImportSession,
  chunkIndex: number,
  projectId: number,
  codexOptions: readonly CodexImportCategoryOption[],
): Promise<boolean> {
  const sessionStore = useImportSessionStore.getState()
  const statusStore = useImportStatusStore.getState()
  const chunkState = session.chunks.find(c => c.index === chunkIndex)!

  // 重新切出本块原文（session 没保存原文，由调用方上传时已切；
  // 但因 session 不保存原文，我们让 ImportDocPanel 在 runSession 前把切好的文本
  // 缓存到 module 层的 IN_MEM_CHUNK_TEXT 里）
  const t = getT()
  const text = getChunkText(session.id!, chunkIndex)
  if (!text) {
    await sessionStore.patchChunk(session.id!, chunkIndex, {
      status: 'failed',
      errorMessage: t('errors-lib:import.chunkTextMissing'),
      attempts: chunkState.attempts,
      finishedAt: Date.now(),
    })
    statusStore.markChunkFinished({ success: false })
    statusStore.pushActivity('error',
      t('errors-lib:import.chunkTextMissingActivity', { index: chunkIndex + 1 }), chunkIndex)
    await sessionStore.log(session.id!, chunkIndex, 'error', t('errors-lib:import.chunkTextMissingLog'))
    return false
  }

  for (let attempt = chunkState.attempts; attempt < MAX_ATTEMPTS; attempt++) {
    if (activePauseFlag.paused) return false

    statusStore.setActiveChunk(chunkIndex, attempt + 1)
    await sessionStore.patchChunk(session.id!, chunkIndex, {
      status: 'running',
      attempts: attempt + 1,
      startedAt: chunkState.startedAt || Date.now(),
    })

    const attemptNo = attempt + 1
    statusStore.pushActivity('info',
      t('errors-lib:import.chunkParsing', {
        index: chunkIndex + 1,
        total: session.totalChunks,
        attempt: attemptNo,
      }),
      chunkIndex)
    await sessionStore.log(session.id!, chunkIndex, 'info',
      t('errors-lib:import.chunkAttemptLog', {
        attempt: attemptNo,
        chars: chunkState.charCount.toLocaleString(),
      }))

    try {
      const result = await parseChunkOnce({
        projectId,
        chunkIndex,
        totalChunks: session.totalChunks,
        knownContext: session.rollingContext || t('errors-lib:import.chunkKnownContextFallback'),
        rawDocument: text,
        codexOptions,
        signal: activeController?.signal,
      })

      // 入库（仅"导入当前项目"时写入项目表；"导入项目参考"只累积到 merged）
      let counts: ApplyChunkCounts
      if (session.importTarget === 'reference') {
        // 项目参考模式：不写项目表，只统计
        const wvFields = result.worldview ? Object.keys(result.worldview).filter(k => {
          const v = result.worldview![k]; return typeof v === 'string' && v.trim()
        }).length : 0
        counts = {
          worldviewFields: wvFields,
          characters: Array.isArray(result.characters) ? result.characters.length : 0,
          outlineNodes: Array.isArray(result.outline) ? result.outline.length : 0,
          codexCandidates: result.codexCandidates?.length || 0,
        }
      } else {
        counts = await applyChunkResult(projectId, result, session.targetWorldGroupId ?? null)
      }

      // 更新 session.merged 和 rollingContext
      const merged = mergeUnified(session.merged || {}, result)
      const rolling = buildRollingContext(merged)

      await sessionStore.patchChunk(session.id!, chunkIndex, {
        status: 'done',
        errorMessage: undefined,
        extractedCounts: counts,
        finishedAt: Date.now(),
      })
      await sessionStore.patch(session.id!, { merged, rollingContext: rolling })

      statusStore.markChunkFinished({ success: true })
      statusStore.pushActivity('success',
        t('errors-lib:import.chunkSuccessActivity', {
          index: chunkIndex + 1,
          wv: counts.worldviewFields,
          ch: counts.characters,
          ol: counts.outlineNodes,
          codex: counts.codexCandidates || 0,
        }),
        chunkIndex)
      await sessionStore.log(session.id!, chunkIndex, 'success',
        t('errors-lib:import.chunkSuccessLog', {
          wv: counts.worldviewFields,
          ch: counts.characters,
          ol: counts.outlineNodes,
          codex: counts.codexCandidates || 0,
        }))
      return true
    } catch (err) {
      if ((err as Error).name === 'AbortError') return false
      const msg = err instanceof Error ? err.message : String(err)
      statusStore.pushActivity('warn',
        t('errors-lib:import.chunkFailureActivity', {
          index: chunkIndex + 1,
          attempt: attemptNo,
          message: msg.slice(0, 80),
        }), chunkIndex)
      await sessionStore.log(session.id!, chunkIndex, 'warn',
        t('errors-lib:import.chunkFailureLog', { attempt: attemptNo, message: msg }))
      await sessionStore.patchChunk(session.id!, chunkIndex, {
        status: 'pending',
        errorMessage: msg,
      })
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(RETRY_DELAY_MS)
      } else {
        // 最终失败
        await sessionStore.patchChunk(session.id!, chunkIndex, {
          status: 'failed',
          finishedAt: Date.now(),
        })
        statusStore.markChunkFinished({ success: false })
        statusStore.pushActivity('error',
          t('errors-lib:import.chunkFinalFailureActivity', {
            index: chunkIndex + 1,
            attempts: MAX_ATTEMPTS,
            message: msg.slice(0, 80),
          }),
          chunkIndex)
        await sessionStore.log(session.id!, chunkIndex, 'error',
          t('errors-lib:import.chunkFinalFailureLog', { message: msg }))
        return false
      }
    }
  }
  return false
}

/** 调一次 AI 解析一个 chunk */
async function parseChunkOnce(args: {
  projectId: number
  chunkIndex: number
  totalChunks: number
  knownContext: string
  rawDocument: string
  codexOptions: readonly CodexImportCategoryOption[]
  signal?: AbortSignal
}): Promise<UnifiedParseResult> {
  const tpl = usePromptStore.getState().getActive('import.parse-chunk')
  const { messages } = renderPrompt(tpl, {
    chunkIndex: args.chunkIndex + 1,
    totalChunks: args.totalChunks,
    knownContext: args.knownContext.slice(0, 2000),
    codexCategoryCatalog: formatCodexImportCatalog(args.codexOptions),
    rawDocument: args.rawDocument,
  })
  const baseConfig = useAIConfigStore.getState().config
  const overrideMax = Math.max(baseConfig.maxTokens ?? 4096, IMPORT_MAX_TOKENS.all)
  const config: AIConfig = { ...baseConfig, maxTokens: overrideMax }
  const meta = {
    category: 'import.parse-chunk',
    // WS-3B P2-C：统一解析输出纯 JSON，高置信结构化调用，不注入文本语言约束。
    outputKind: 'functional-structured',
    projectId: args.projectId,
    configOverrides: { maxTokens: overrideMax },
  } as const
  const effectiveConfig = resolveRequestConfig(config, meta).config
  if (!isAIConfigReady(effectiveConfig)) throw new Error(getAIConfigRequiredMessage(effectiveConfig))

  const output = await chatWithAbort(messages, config, args.signal, meta)
  const obj = extractJSON(output) as UnifiedParseResult
  return normalizeUnified(obj, {
    sourceText: args.rawDocument,
    chunkIndex: args.chunkIndex,
    options: args.codexOptions,
  })
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

/**
 * 从一份(已解析完成的) session 落地到「项目参考」+ 跑 13 维统一分析。
 * 解析与落地解耦:导入流程完成解析后调它;"解析一次多次落地"复用路径也调它(零重复解析)。
 * - 浅层:用 merged.writingTechniques 免费落成全书分析行(不调 AI)。
 * - 深层:用 session 的块文本逐块深析(registerRefChunks + runRefAnalysis)。
 */
export async function applyReferenceFromSession(
  projectId: number,
  session: ImportSession,
  sessionId: number,
  statusStore?: { pushActivity: (level: 'info' | 'success' | 'warn' | 'error', msg: string) => void },
  depthOverride?: import('../types').ReferenceAnalysisDepth,
): Promise<number> {
  const t = getT()
  const depth = depthOverride ?? session.analysisDepth ?? 'quick'
  const refId = await useReferenceStore.getState().addReference({
    projectId,
    title: session.filename.replace(/\.[^.]+$/, ''),
    author: '',
    type: 'story',
    note: t('errors-lib:import.referenceNote', {
      filename: session.filename,
      chars: session.totalChars.toLocaleString(),
    }),
    url: '',
    fileHash: session.fileHash,
    importSessionId: sessionId,
    analysisDepth: depth,
    importedData: {
      worldview: session.merged?.worldview,
      characters: session.merged?.characters,
      outline: session.merged?.outline,
      writingTechniques: session.merged?.writingTechniques,
      codexCandidates: session.merged?.codexCandidates,
      sourceFilename: session.filename,
      importedAt: Date.now(),
    },
  })
  statusStore?.pushActivity('success', t('errors-lib:import.referenceSaved'))

  if (depth === 'deep') {
    // 深层:复用 session 已切的块(文本在 chunk-text-registry)逐块深析
    const chunkPlans: ChunkPlanLite[] = session.chunks.map(c => ({
      index: c.index,
      startChar: c.startChar,
      endChar: c.endChar,
      charCount: c.charCount,
      label: c.label,
      text: getChunkText(sessionId, c.index) ?? '',
    })).filter(c => c.text)
    if (chunkPlans.length > 0) {
      // chunk registry 已是 DOCX/PDF/EPUB 等格式解析后的纯文本；不能把原始二进制
      // Blob 用 .text() 当成断点原文。用本轮真实分析文本持久化即可安全续跑。
      const sourceText = chunkPlans.map(chunk => chunk.text).join('\n\n')
      const run = await createReferenceAnalysisRun({
        referenceId: refId,
        depth: 'deep',
        sourceFilename: session.filename,
        fileHash: session.fileHash,
        totalChars: session.totalChars,
        expectedChunks: chunkPlans.length,
        sourceKind: 'unknown',
        usageScope: 'analysis-only',
        rightsNote: t('errors-lib:import.referenceRightsNote'),
        rightsConfirmed: false,
        sourceText,
        sourceChunks: chunkPlans,
      })
      registerRefChunks(run.id!, chunkPlans)
      statusStore?.pushActivity('info', t('errors-lib:import.referenceDeepStart', { count: chunkPlans.length }))
      await runRefAnalysis(refId, run.id)
    } else {
      // 块文本丢了(刷新过) → 退回浅层,免得卡住
      await writeShallowAnalysisFromTechniques(refId, session.merged?.writingTechniques)
      statusStore?.pushActivity('warn', t('errors-lib:import.referenceChunkTextUnavailable'))
    }
  } else {
    // 浅层:免费,用解析已出的写作技法
    await writeShallowAnalysisFromTechniques(refId, session.merged?.writingTechniques)
    statusStore?.pushActivity('success', t('errors-lib:import.referenceShallowDone'))
  }
  return refId
}

/**
 * 从一份(已解析完成的) session 落地到「当前项目设定库」(世界观/角色/大纲),零重复解析。
 * "解析一次·多次落地"的另一半:用户已解析过对标文(或导入过参考),想把设定搬进设定库时,
 * 直接复用 session.merged 写库,**不再调用解析 AI**(省钱),也不必一个个手填。
 */
export async function applyProjectFromSession(
  projectId: number,
  session: ImportSession,
  worldGroupId: number | null = null,
  statusStore?: { pushActivity: (level: 'info' | 'success' | 'warn' | 'error', msg: string) => void },
): Promise<ApplyChunkCounts> {
  const t = getT()
  const merged = (session.merged ?? {}) as UnifiedParseResult
  const counts = await applyChunkResult(projectId, merged, worldGroupId ?? session.targetWorldGroupId ?? null)
  statusStore?.pushActivity('success', t('errors-lib:import.projectApplied', {
    wv: counts.worldviewFields,
    ch: counts.characters,
    ol: counts.outlineNodes,
  }))
  return counts
}

type ChunkPlanLite = { index: number; startChar: number; endChar: number; charCount: number; label?: string; text: string }

/** 单独重试某个失败的块（用户在 ReportModal 里点的"重试失败块"） */
export async function retryFailedChunks(args: {
  sessionId: number
  projectId: number
}): Promise<void> {
  const { sessionId, projectId } = args
  const sessionStore = useImportSessionStore.getState()
  const session = await sessionStore.load(sessionId)
  if (!session) return
  // 把失败的重置成 pending 并清空 attempts
  const chunks: ChunkState[] = session.chunks.map(c =>
    c.status === 'failed'
      ? { ...c, status: 'pending', attempts: 0, errorMessage: undefined }
      : c,
  )
  await sessionStore.patch(sessionId, { chunks, status: 'running', fatalError: undefined })
  await runSession({ sessionId, projectId })
}
