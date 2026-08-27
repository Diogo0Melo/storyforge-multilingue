import { useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardCopy, Download, FileJson, LoaderCircle, Play, RotateCcw, ShieldCheck, Upload } from 'lucide-react'
import { chat, type ChatResult } from '../../lib/ai/client'
import { isAIConfigReady } from '../../lib/ai/config-readiness'
import { estimateTokens } from '../../lib/ai/context-budget'
import { computeCostUsd } from '../../lib/ai/usage-log'
import {
  evaluateContextCompressionNonInferiorityV1,
  H17_CONTEXT_COMPRESSION_RESULTS_STORAGE_KEY,
  runContextCompressionEvalMatrixV1,
  verifyContextCompressionEvalRecordV1,
} from '../../lib/evals/context-compression/runner'
import type { ContextCompressionEvalRecordV1 } from '../../lib/evals/context-compression/types'
import {
  clearH4LongConsistencyBrowserCheckpointV1,
  clearH4SubtypeAdjudicationBrowserCheckpointV1,
  exportH4LongConsistencyRunCheckpointV1,
  exportH4SubtypeAdjudicationCheckpointV1,
  H4_LONG_CONSISTENCY_FIXTURE_VERSION_V1,
  H4_SUBTYPE_ADJUDICATION_PROMPT_VERSION_V1,
  importH4LongConsistencyRunCheckpointV1,
  loadH4LongConsistencyBrowserStateV1,
  loadH4SubtypeAdjudicationBrowserStateV1,
  LONG_CONSISTENCY_CURRENT_JUDGE_PROMPT_VERSION_V1,
  persistH4LongConsistencyBrowserCheckpointV1,
  persistH4SubtypeAdjudicationBrowserCheckpointV1,
  runH4SubtypeAdjudicationV1,
  runH4LongConsistencyVerifierV1,
  scoreH4SubtypeAdjudicationCheckpointV1,
  scoreH4LongConsistencyCheckpointV1,
  type H4LongConsistencyRunCheckpointV1,
  type H4LongConsistencySealedScoreV1,
  type H4LongConsistencyVerifierCallInputV1,
  type H4SubtypeAdjudicationCallInputV1,
  type H4SubtypeAdjudicationCheckpointV1,
  type H4SubtypeAdjudicationSealedScoreV1,
} from '../../lib/evals/long-consistency'
import { getFixtures } from '../../lib/evals/long-consistency/fixtures'
import { LongConsistencyIdentityMismatchError } from '../../lib/evals/long-consistency/identity-mismatch'
import type { EvalSplit } from '../../lib/evals/long-consistency/types'
import type { AIConfig, ChatMessage } from '../../lib/types'
import { APP_BUILD_ID } from '../../lib/version'
import { useAIConfigStore } from '../../stores/ai-config'
import { useDomainT } from '../../i18n'
import { useDialog } from '../shared/Dialog'
import H86StoryArcEvalPanel from './H86StoryArcEvalPanel'
import CreativeReliabilityEvalPanel from './CreativeReliabilityEvalPanel'

/**
 * Typed panel message: either an i18n descriptor translated at render time
 * (reactive to locale switches) or a raw provider/engine string kept verbatim.
 * Internal application messages use descriptors; catches from engine/provider
 * failures remain raw and unchanged.
 */
type PanelMessage =
  | { kind: 'descriptor'; key: string; params?: Record<string, unknown> }
  | { kind: 'raw'; text: string }

interface SplitViewState {
  checkpoint: H4LongConsistencyRunCheckpointV1 | null
  score: H4LongConsistencySealedScoreV1 | null
}

interface AdjudicationSplitViewState {
  checkpoint: H4SubtypeAdjudicationCheckpointV1 | null
  score: H4SubtypeAdjudicationSealedScoreV1 | null
}

const EMPTY_SPLIT_STATE: Record<EvalSplit, SplitViewState> = {
  development: { checkpoint: null, score: null },
  'held-out': { checkpoint: null, score: null },
}

const EMPTY_ADJUDICATION_SPLIT_STATE: Record<EvalSplit, AdjudicationSplitViewState> = {
  development: { checkpoint: null, score: null },
  'held-out': { checkpoint: null, score: null },
}

function isAdjudicationResumable(
  checkpoint: H4SubtypeAdjudicationCheckpointV1 | null | undefined,
): checkpoint is H4SubtypeAdjudicationCheckpointV1 {
  if (!checkpoint) return false
  if (checkpoint.status === 'running' || checkpoint.status === 'provider-blocked') return true
  const latestFailure = checkpoint.failures[checkpoint.failures.length - 1]
  return checkpoint.status === 'failed'
    && latestFailure?.code === 'adjudicator_error'
    && latestFailure.message.includes('AI API Error (429)')
}

function readContextCompressionRecords(): ContextCompressionEvalRecordV1[] {
  try {
    const raw = localStorage.getItem(H17_CONTEXT_COMPRESSION_RESULTS_STORAGE_KEY)
    return raw ? JSON.parse(raw) as ContextCompressionEvalRecordV1[] : []
  } catch {
    return []
  }
}

async function evalChatWithRetry(
  messages: ChatMessage[],
  config: AIConfig,
  category: 'eval.h17.compression' | 'eval.h17.generation',
) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 180_000)
    try {
      const result: ChatResult = {}
      const output = category === 'eval.h17.compression'
        ? await chat(messages, config, { category: 'eval.h17.compression' }, controller.signal, result)
        : await chat(messages, config, { category: 'eval.h17.generation' }, controller.signal, result)
      return { output, usage: result.usage }
    } catch (error) {
      lastError = error
      const status = typeof error === 'object' && error && 'status' in error
        ? Number((error as { status?: unknown }).status)
        : 0
      const retryable = status >= 500 || status === 429 || status === 0
      if (!retryable || attempt === 2) throw error
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1_500))
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError
}

async function callH4Verifier(
  input: H4LongConsistencyVerifierCallInputV1,
  config: AIConfig,
) {
  if (input.verifier.provider !== config.provider || input.verifier.model !== config.model) {
    throw new LongConsistencyIdentityMismatchError('verifier')
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180_000)
  const startedAt = performance.now()
  try {
    const result: ChatResult = {}
    const output = await chat(
      input.messages,
      { ...config, temperature: 0, maxTokens: 4_000 },
      { category: 'eval.h4.verifier', contextOverflowPolicy: 'reject' },
      controller.signal,
      result,
      input.verifier.promptVersion === LONG_CONSISTENCY_CURRENT_JUDGE_PROMPT_VERSION_V1
        ? { responseFormat: 'json_object' }
        : undefined,
    )
    const inputTokens = result.usage?.inputTokens
      ?? input.messages.reduce((sum, message) => sum + estimateTokens(message.content), 0)
    const outputTokens = result.usage?.outputTokens ?? estimateTokens(output)
    return {
      output,
      usage: {
        inputTokens,
        outputTokens,
        durationMs: Math.round(performance.now() - startedAt),
        costUsd: computeCostUsd(config.model, inputTokens, outputTokens),
      },
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function callH4SubtypeAdjudicator(
  input: H4SubtypeAdjudicationCallInputV1,
  config: AIConfig,
) {
  if (input.adjudicator.provider !== config.provider || input.adjudicator.model !== config.model) {
    throw new LongConsistencyIdentityMismatchError('adjudicator')
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180_000)
  const startedAt = performance.now()
  try {
    const result: ChatResult = {}
    const output = await chat(
      input.messages,
      { ...config, temperature: 0, maxTokens: 2_000 },
      { category: 'eval.h4.verifier', contextOverflowPolicy: 'reject' },
      controller.signal,
      result,
      { responseFormat: 'json_object' },
    )
    const inputTokens = result.usage?.inputTokens
      ?? input.messages.reduce((sum, message) => sum + estimateTokens(message.content), 0)
    const outputTokens = result.usage?.outputTokens ?? estimateTokens(output)
    return {
      output,
      usage: {
        inputTokens,
        outputTokens,
        durationMs: Math.round(performance.now() - startedAt),
        costUsd: computeCostUsd(config.model, inputTokens, outputTokens),
      },
    }
  } finally {
    clearTimeout(timeout)
  }
}

function downloadJson(raw: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function HarnessEvalPanel() {
  const { t, lang } = useDomainT('settings')
  const listFormat = useMemo(() => new Intl.ListFormat(lang, { type: 'conjunction', style: 'short' }), [lang])
  const config = useAIConfigStore(state => state.config)
  const dialog = useDialog()
  const [splits, setSplits] = useState<Record<EvalSplit, SplitViewState>>(EMPTY_SPLIT_STATE)
  const [adjudicationSplits, setAdjudicationSplits] = useState<Record<EvalSplit, AdjudicationSplitViewState>>(
    EMPTY_ADJUDICATION_SPLIT_STATE,
  )
  const [compressionRecords, setCompressionRecords] = useState<ContextCompressionEvalRecordV1[]>([])
  const [runningSplit, setRunningSplit] = useState<EvalSplit | null>(null)
  const [runningAdjudicationSplit, setRunningAdjudicationSplit] = useState<EvalSplit | null>(null)
  const [compressionRunning, setCompressionRunning] = useState(false)
  const [copiedSplit, setCopiedSplit] = useState<EvalSplit | null>(null)
  const [copiedAdjudicationSplit, setCopiedAdjudicationSplit] = useState<EvalSplit | null>(null)
  const [adjudicationExportJson, setAdjudicationExportJson] = useState<Partial<Record<EvalSplit, string>>>({})
  const [importingSplit, setImportingSplit] = useState<EvalSplit | null>(null)
  const [importDrafts, setImportDrafts] = useState<Record<EvalSplit, string>>({
    development: '',
    'held-out': '',
  })
  const [progress, setProgress] = useState<PanelMessage | null>(null)
  const [error, setError] = useState<PanelMessage | null>(null)
  const importInputRefs = useRef<Record<EvalSplit, HTMLInputElement | null>>({
    development: null,
    'held-out': null,
  })

  const formatRate = (value: number | null): string => (
    value == null ? t('evalHarness.noSamples') : `${(value * 100).toFixed(1)}%`
  )

  /** Localized display label for an eval split (raw IDs stay in checkpoint/export/hash). */
  const splitLabel = (split: EvalSplit): string => (
    split === 'held-out' ? t('evalHarness.h4.heldOutLabel') : t('evalHarness.h4.developmentLabel')
  )

  /** Translate a PanelMessage descriptor at render time; raw text passes through.
   *  Split ID params are resolved to localized labels here so a locale switch
   *  re-renders the message while raw IDs remain untouched in state. */
  const renderMessage = (message: PanelMessage | null): string => {
    if (!message) return ''
    if (message.kind === 'raw') return message.text
    if (!message.params) return t(message.key)
    const resolved: Record<string, unknown> = { ...message.params }
    if (typeof resolved.found === 'string' && (resolved.found === 'development' || resolved.found === 'held-out')) {
      resolved.found = splitLabel(resolved.found as EvalSplit)
    }
    if (typeof resolved.target === 'string' && (resolved.target === 'development' || resolved.target === 'held-out')) {
      resolved.target = splitLabel(resolved.target as EvalSplit)
    }
    if (typeof resolved.split === 'string' && (resolved.split === 'development' || resolved.split === 'held-out')) {
      resolved.split = splitLabel(resolved.split as EvalSplit)
    }
    return t(message.key, resolved)
  }

  useEffect(() => {
    let active = true
    void Promise.all((['development', 'held-out'] as const).map(async split => (
      [split, await loadH4LongConsistencyBrowserStateV1(split)] as const
    ))).then(entries => {
      if (!active) return
      setSplits(Object.fromEntries(entries.map(([split, state]) => [
        split,
        state ?? { checkpoint: null, score: null },
      ])) as Record<EvalSplit, SplitViewState>)
    }).catch(cause => {
      if (active) setError({ kind: 'raw', text: cause instanceof Error ? cause.message : String(cause) })
    })

    void Promise.all((['development', 'held-out'] as const).map(async split => (
      [split, await loadH4SubtypeAdjudicationBrowserStateV1(split)] as const
    ))).then(entries => {
      if (!active) return
      setAdjudicationSplits(Object.fromEntries(entries.map(([split, state]) => [
        split,
        state ?? { checkpoint: null, score: null },
      ])) as Record<EvalSplit, AdjudicationSplitViewState>)
    }).catch(cause => {
      if (active) setError({ kind: 'raw', text: cause instanceof Error ? cause.message : String(cause) })
    })

    const stored = readContextCompressionRecords()
    void Promise.all(stored.map(async item => (
      await verifyContextCompressionEvalRecordV1(item) ? item : null
    ))).then(records => {
      if (!active) return
      setCompressionRecords(records.filter((item): item is ContextCompressionEvalRecordV1 => item !== null))
    })
    return () => { active = false }
  }, [])

  const updateSplit = (
    split: EvalSplit,
    checkpoint: H4LongConsistencyRunCheckpointV1 | null,
    score: H4LongConsistencySealedScoreV1 | null = null,
  ) => {
    setSplits(current => ({ ...current, [split]: { checkpoint, score } }))
  }

  const updateAdjudicationSplit = (
    split: EvalSplit,
    checkpoint: H4SubtypeAdjudicationCheckpointV1 | null,
    score: H4SubtypeAdjudicationSealedScoreV1 | null = null,
  ) => {
    setAdjudicationSplits(current => ({ ...current, [split]: { checkpoint, score } }))
  }

  const runH4 = async (split: EvalSplit) => {
    setRunningSplit(split)
    setError(null)
    const existing = splits[split].checkpoint
    const total = split === 'development' ? 40 : 20
    setProgress({ kind: 'raw', text: `${existing?.completed.length ?? 0}/${total}` })
    if (
      existing?.status === 'running'
      && (existing.execution.verifier.provider !== config.provider
        || existing.execution.verifier.model !== config.model)
    ) {
      setError({ kind: 'descriptor', key: 'evalHarness.h4.switchBackToResume', params: {
        identity: `${existing.execution.verifier.provider}/${existing.execution.verifier.model}`,
      } })
      setRunningSplit(null)
      return
    }
    try {
      const checkpoint = await runH4LongConsistencyVerifierV1({
        runId: existing?.runId ?? `h4-${split}-${crypto.randomUUID()}`,
        split,
        codeRevision: existing?.codeRevision ?? APP_BUILD_ID,
        execution: existing?.execution ?? {
          generator: {
            provider: 'fixture',
            model: 'h4-synthetic-corpus',
            promptVersion: H4_LONG_CONSISTENCY_FIXTURE_VERSION_V1,
          },
          verifier: {
            provider: config.provider,
            model: config.model,
            promptVersion: LONG_CONSISTENCY_CURRENT_JUDGE_PROMPT_VERSION_V1,
          },
        },
        call: input => callH4Verifier(input, config),
        maxAttemptsPerFixture: existing?.maxAttemptsPerFixture ?? 3,
        resumeFrom: existing?.status === 'running' ? existing : undefined,
        onCheckpoint: async next => {
          await persistH4LongConsistencyBrowserCheckpointV1(next)
          updateSplit(split, next)
          setProgress({ kind: 'raw', text: `${next.completed.length}/${next.fixtureIds.length}` })
        },
      })
      const score = await scoreH4LongConsistencyCheckpointV1({ checkpoint })
      updateSplit(split, checkpoint, score)
    } catch (cause) {
      setError(
        cause instanceof LongConsistencyIdentityMismatchError && cause.scope === 'verifier'
          ? { kind: 'descriptor', key: 'evalHarness.h4.verifierIdentityMismatch' }
          : { kind: 'raw', text: cause instanceof Error ? cause.message : String(cause) },
      )
    } finally {
      setRunningSplit(null)
    }
  }

  const resetSplit = async (split: EvalSplit) => {
    const confirmed = await dialog.confirm({
      title: t('evalHarness.h4.clearConfirmTitle'),
      message: t('evalHarness.h4.clearConfirmMessage'),
      confirmText: t('evalHarness.actions.clear'),
      cancelText: t('evalHarness.actions.keep'),
      tone: 'danger',
    })
    if (!confirmed) return
    try {
      clearH4LongConsistencyBrowserCheckpointV1(split)
      updateSplit(split, null)
      setError(null)
    } catch (cause) {
      setError({ kind: 'raw', text: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  const exportSplit = async (split: EvalSplit) => {
    const checkpoint = splits[split].checkpoint
    if (!checkpoint) return
    try {
      const raw = await exportH4LongConsistencyRunCheckpointV1(checkpoint)
      downloadJson(raw, `storyforge-h4-${split}-${checkpoint.runId}.json`)
    } catch (cause) {
      setError({ kind: 'raw', text: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  const copySplit = async (split: EvalSplit) => {
    const checkpoint = splits[split].checkpoint
    if (!checkpoint) return
    try {
      const raw = await exportH4LongConsistencyRunCheckpointV1(checkpoint)
      await navigator.clipboard.writeText(raw)
      setCopiedSplit(split)
      setError(null)
    } catch (cause) {
      setError({ kind: 'raw', text: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  const importSplitRaw = async (split: EvalSplit, raw: string) => {
    try {
      const checkpoint = await importH4LongConsistencyRunCheckpointV1(raw)
      if (checkpoint.split !== split) {
        setError({ kind: 'descriptor', key: 'evalHarness.h4.importSplitMismatch', params: { found: checkpoint.split, target: split } })
        return
      }
      if (splits[split].checkpoint) {
        const confirmed = await dialog.confirm({
          title: t('evalHarness.h4.replaceConfirmTitle', { split: splitLabel(split) }),
          message: t('evalHarness.h4.replaceConfirmMessage'),
          confirmText: t('evalHarness.actions.replace'),
          cancelText: t('evalHarness.actions.keep'),
          tone: 'danger',
        })
        if (!confirmed) return
      }
      await persistH4LongConsistencyBrowserCheckpointV1(checkpoint)
      updateSplit(split, checkpoint, await scoreH4LongConsistencyCheckpointV1({ checkpoint }))
      setImportDrafts(current => ({ ...current, [split]: '' }))
      setImportingSplit(null)
      setError(null)
    } catch (cause) {
      setError({ kind: 'raw', text: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  const importSplitFile = async (split: EvalSplit, file: File) => {
    try {
      await importSplitRaw(split, await file.text())
    } finally {
      const input = importInputRefs.current[split]
      if (input) input.value = ''
    }
  }

  const runAdjudication = async (split: EvalSplit) => {
    setRunningAdjudicationSplit(split)
    setError(null)
    const baseCheckpoint = splits[split].checkpoint
    const existing = adjudicationSplits[split].checkpoint
    const frozenBaseCheckpoint = existing?.baseCheckpoint ?? baseCheckpoint
    const resumable = isAdjudicationResumable(existing)
    setProgress({ kind: 'raw', text: `${existing?.completed.length ?? 0}/${frozenBaseCheckpoint?.fixtureIds.length ?? 0}` })
    if (!frozenBaseCheckpoint || frozenBaseCheckpoint.status !== 'completed') {
      setError({ kind: 'descriptor', key: 'evalHarness.h85.requiresBase' })
      setRunningAdjudicationSplit(null)
      return
    }
    if (
      resumable
      && (
        existing.execution.adjudicator.provider !== config.provider
        || existing.execution.adjudicator.model !== config.model
      )
    ) {
      setError({ kind: 'descriptor', key: 'evalHarness.h85.switchBackToResume', params: {
        identity: `${existing.execution.adjudicator.provider}/${existing.execution.adjudicator.model}`,
      } })
      setRunningAdjudicationSplit(null)
      return
    }
    try {
      const checkpoint = await runH4SubtypeAdjudicationV1({
        runId: existing?.runId ?? `h85-${split}-${crypto.randomUUID()}`,
        codeRevision: existing?.codeRevision ?? APP_BUILD_ID,
        baseCheckpoint: frozenBaseCheckpoint,
        adjudicator: existing?.execution.adjudicator ?? {
          provider: config.provider,
          model: config.model,
          promptVersion: H4_SUBTYPE_ADJUDICATION_PROMPT_VERSION_V1,
        },
        call: input => callH4SubtypeAdjudicator(input, config),
        maxAttemptsPerFixture: existing?.maxAttemptsPerFixture ?? 2,
        resumeFrom: resumable ? existing : undefined,
        onCheckpoint: async next => {
          await persistH4SubtypeAdjudicationBrowserCheckpointV1(next)
          updateAdjudicationSplit(split, next)
          setProgress({ kind: 'raw', text: `${next.completed.length}/${next.fixtureIds.length}` })
        },
      })
      const score = await scoreH4SubtypeAdjudicationCheckpointV1({ checkpoint })
      updateAdjudicationSplit(split, checkpoint, score)
    } catch (cause) {
      setError(
        cause instanceof LongConsistencyIdentityMismatchError && cause.scope === 'adjudicator'
          ? { kind: 'descriptor', key: 'evalHarness.h85.adjudicatorIdentityMismatch' }
          : { kind: 'raw', text: cause instanceof Error ? cause.message : String(cause) },
      )
    } finally {
      setRunningAdjudicationSplit(null)
    }
  }

  const resetAdjudication = async (split: EvalSplit) => {
    const confirmed = await dialog.confirm({
      title: t('evalHarness.h85.clearConfirmTitle'),
      message: t('evalHarness.h85.clearConfirmMessage'),
      confirmText: t('evalHarness.actions.clear'),
      cancelText: t('evalHarness.actions.keep'),
      tone: 'danger',
    })
    if (!confirmed) return
    try {
      clearH4SubtypeAdjudicationBrowserCheckpointV1(split)
      updateAdjudicationSplit(split, null)
      setError(null)
    } catch (cause) {
      setError({ kind: 'raw', text: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  const exportAdjudication = async (split: EvalSplit) => {
    const checkpoint = adjudicationSplits[split].checkpoint
    if (!checkpoint) return
    try {
      const raw = await exportH4SubtypeAdjudicationCheckpointV1(checkpoint)
      downloadJson(raw, `storyforge-h85-${split}-${checkpoint.runId}.json`)
    } catch (cause) {
      setError({ kind: 'raw', text: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  const copyAdjudication = async (split: EvalSplit) => {
    const checkpoint = adjudicationSplits[split].checkpoint
    if (!checkpoint) return
    try {
      const raw = await exportH4SubtypeAdjudicationCheckpointV1(checkpoint)
      await navigator.clipboard.writeText(raw)
      setCopiedAdjudicationSplit(split)
      setError(null)
    } catch (cause) {
      setError({ kind: 'raw', text: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  const toggleAdjudicationJson = async (split: EvalSplit) => {
    if (adjudicationExportJson[split] != null) {
      setAdjudicationExportJson(current => ({ ...current, [split]: undefined }))
      return
    }
    const checkpoint = adjudicationSplits[split].checkpoint
    if (!checkpoint) return
    try {
      const raw = await exportH4SubtypeAdjudicationCheckpointV1(checkpoint)
      setAdjudicationExportJson(current => ({ ...current, [split]: raw }))
      setError(null)
    } catch (cause) {
      setError({ kind: 'raw', text: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  const runCompressionMatrix = async () => {
    setCompressionRunning(true)
    setError(null)
    setProgress({ kind: 'descriptor', key: 'evalHarness.h17.progressGroups', params: { completed: 0, total: 3 } })
    try {
      const records = await runContextCompressionEvalMatrixV1({
        fixtures: getFixtures('development').slice(0, 3),
        split: 'development',
        contextTargetTokens: 900,
        generationMaxTokens: 1_200,
        config,
        call: async (messages, runConfig, phase) => evalChatWithRetry(
          messages,
          runConfig,
          phase === 'compression' ? 'eval.h17.compression' : 'eval.h17.generation',
        ),
        onVariantComplete: (_record, completed, total) => setProgress(
          { kind: 'descriptor', key: 'evalHarness.h17.progressGroups', params: { completed, total } },
        ),
        onCaseProgress: (variantIndex, variantTotal, completed, total) => {
          setProgress({ kind: 'descriptor', key: 'evalHarness.h17.progressGroupCases', params: {
            variant: variantIndex + 1,
            variantTotal,
            completed,
            total,
          } })
        },
      })
      setCompressionRecords(records)
    } catch (cause) {
      setError({ kind: 'raw', text: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setCompressionRunning(false)
    }
  }

  const fullCompressionRecord = compressionRecords.find(item => item.variant === 'full-source')
  const semanticCompressionRecord = compressionRecords.find(item => item.variant === 'semantic-compression')
  const compressionGate = useMemo(() => (
    fullCompressionRecord && semanticCompressionRecord
      ? evaluateContextCompressionNonInferiorityV1({
          full: fullCompressionRecord,
          semantic: semanticCompressionRecord,
        })
      : null
  ), [fullCompressionRecord, semanticCompressionRecord])
  const adjudicationDevelopmentPassed = adjudicationSplits.development.score?.gate.passed === true
  const developmentPassed = splits.development.score?.gate.passed === true || adjudicationDevelopmentPassed
  const busy = runningSplit != null || runningAdjudicationSplit != null || compressionRunning

  const renderSplit = (split: EvalSplit, label: string) => {
    const state = splits[split]
    const checkpoint = state.checkpoint
    const score = state.score
    const latestFailure = checkpoint?.failures[checkpoint.failures.length - 1] ?? null
    const isRunning = runningSplit === split
    const isResumable = checkpoint?.status === 'running'
    const locked = checkpoint != null && checkpoint.status !== 'running'
    const heldOutBlocked = split === 'held-out' && !isResumable && !developmentPassed
    const statusLine = checkpoint
      ? t('evalHarness.h4.statusLine', {
          generator: `${checkpoint.execution.generator.provider}/${checkpoint.execution.generator.model}`,
          verifier: `${checkpoint.execution.verifier.provider}/${checkpoint.execution.verifier.model}`,
          status: t(`evalHarness.status.${checkpoint.status}`),
          progress: `${checkpoint.completed.length}/${checkpoint.fixtureIds.length}`,
        })
      : split === 'development' ? t('evalHarness.h4.developmentCases') : t('evalHarness.h4.heldOutLocked')
    return (
      <section className="border-t border-border/60 py-3 first:border-t-0" data-testid={`h4-${split}-section`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-medium text-text-primary">{label}</h4>
            <p className="mt-0.5 text-[11px] text-text-muted">
              {statusLine}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void runH4(split) }}
              disabled={busy || !isAIConfigReady(config) || locked || heldOutBlocked}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent/10 px-2.5 py-1.5 text-xs text-accent hover:bg-accent/20 disabled:opacity-40"
            >
              {isRunning
                ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                : <Play className="h-3.5 w-3.5" />}
              {isRunning ? renderMessage(progress) : isResumable ? t('evalHarness.actions.resume') : t('evalHarness.actions.run')}
            </button>
            <input
              ref={node => { importInputRefs.current[split] = node }}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label={t('evalHarness.h4.fileInputAria', { label })}
              onChange={event => {
                const file = event.currentTarget.files?.[0]
                if (file) void importSplitFile(split, file)
              }}
            />
            <button
              type="button"
              onClick={() => setImportingSplit(current => current === split ? null : split)}
              disabled={busy}
              title={t('evalHarness.h4.importTitle')}
              aria-label={t('evalHarness.h4.importAria', { label })}
              className="grid h-8 w-8 place-items-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
            {checkpoint && (
              <button
                type="button"
                onClick={() => { void copySplit(split) }}
                disabled={busy}
                title={copiedSplit === split ? t('evalHarness.h4.copyDoneTitle') : t('evalHarness.h4.copyTitle')}
                aria-label={t('evalHarness.h4.copyAria', { label })}
                className="grid h-8 w-8 place-items-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
              </button>
            )}
            {checkpoint && (
              <button
                type="button"
                onClick={() => { void exportSplit(split) }}
                disabled={busy}
                title={t('evalHarness.h4.exportTitle')}
                aria-label={t('evalHarness.h4.exportAria', { label })}
                className="grid h-8 w-8 place-items-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            )}
            {checkpoint && !busy
              && (split === 'development' || checkpoint.status !== 'completed') && (
              <button
                type="button"
                onClick={() => { void resetSplit(split) }}
                title={split === 'development' ? t('evalHarness.h4.resetDevTitle') : t('evalHarness.h4.resetIncompleteTitle')}
                aria-label={t('evalHarness.h4.clearAria', { label })}
                className="grid h-8 w-8 place-items-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-primary"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {importingSplit === split && (
          <div className="mt-3 rounded-md border border-border/70 bg-bg-primary/40 p-2" data-testid={`h4-${split}-import-panel`}>
            <textarea
              value={importDrafts[split]}
              onChange={event => setImportDrafts(current => ({ ...current, [split]: event.target.value }))}
              placeholder={t('evalHarness.h4.importPlaceholder')}
              aria-label={t('evalHarness.checkpointJsonAria', { label })}
              className="h-24 w-full resize-y rounded-md border border-border bg-bg-primary px-2 py-1.5 font-mono text-[10px] text-text-secondary outline-none focus:border-accent"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => { void importSplitRaw(split, importDrafts[split]) }}
                disabled={!importDrafts[split].trim()}
                className="rounded-md bg-accent/10 px-2.5 py-1.5 text-xs text-accent hover:bg-accent/20 disabled:opacity-40"
              >
                {t('evalHarness.actions.verifyAndImport')}
              </button>
              <button
                type="button"
                onClick={() => importInputRefs.current[split]?.click()}
                className="rounded-md px-2.5 py-1.5 text-xs text-text-secondary hover:bg-bg-hover"
              >
                {t('evalHarness.actions.chooseJsonFile')}
              </button>
              <span className="text-[10px] text-text-muted">{t('evalHarness.h4.importHint')}</span>
            </div>
          </div>
        )}
        {score && (
          <div data-testid={`h4-${split}-score`} className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-text-secondary sm:grid-cols-4">
            <span>{t('evalHarness.scores.highSeverityPrecision', { value: formatRate(score.highSeverityHard.precision.estimate) })}</span>
            <span>{t('evalHarness.scores.highSeverityRecall', { value: formatRate(score.highSeverityHard.recall.estimate) })}</span>
            <span>{t('evalHarness.scores.evidenceVerification', { value: formatRate(score.evidence.verificationRate.estimate) })}</span>
            <span className={score.gate.passed ? 'text-success' : 'text-error'}>
              {score.gate.passed
                ? t('evalHarness.scores.gatePassed')
                : t('evalHarness.scores.gateFailed', { failures: listFormat.format(score.gate.failures) })}
            </span>
            <span>{t('evalHarness.h4.verifierCalls', { value: score.usage.modelCalls })}</span>
            <span>{t('evalHarness.h4.verifierInputTokens', { value: score.usage.inputTokens })}</span>
            <span>{t('evalHarness.h4.verifierOutputTokens', { value: score.usage.outputTokens })}</span>
            <span>{t('evalHarness.h4.verifierCost', { value: score.usage.costUsd.toFixed(4) })}</span>
            <span>{t('evalHarness.scores.totalLatency', { value: `${(score.usage.durationMs / 1_000).toFixed(1)}s` })}</span>
          </div>
        )}
        {checkpoint && (
          <p
            data-testid={`h4-${split}-checkpoint-hash`}
            className="mt-2 break-all font-mono text-[10px] text-text-muted"
          >
            checkpoint {checkpoint.checkpointHash}
          </p>
        )}
        {latestFailure && (
          <p
            data-testid={`h4-${split}-failure`}
            className="mt-2 break-words text-[11px] text-error"
          >
            {t('evalHarness.latestFailure', { code: latestFailure.code, message: latestFailure.message })}
            {latestFailure.usage == null ? t('evalHarness.noProviderUsage') : ''}
          </p>
        )}
      </section>
    )
  }

  const renderAdjudicationSplit = (split: EvalSplit, label: string) => {
    const baseCheckpoint = splits[split].checkpoint
    const state = adjudicationSplits[split]
    const checkpoint = state.checkpoint
    const score = state.score
    const latestFailure = checkpoint?.failures[checkpoint.failures.length - 1] ?? null
    const isRunning = runningAdjudicationSplit === split
    const isResumable = isAdjudicationResumable(checkpoint)
    const locked = checkpoint != null && !isResumable
    const baseReady = isResumable || (
      baseCheckpoint?.status === 'completed'
      && baseCheckpoint.execution.verifier.promptVersion === LONG_CONSISTENCY_CURRENT_JUDGE_PROMPT_VERSION_V1
    )
    const heldOutBlocked = split === 'held-out' && !isResumable && !adjudicationDevelopmentPassed
    const statusLine = checkpoint
      ? t('evalHarness.h85.statusLine', {
          discovery: `${checkpoint.execution.discoveryVerifier.provider}/${checkpoint.execution.discoveryVerifier.model}`,
          adjudicator: `${checkpoint.execution.adjudicator.provider}/${checkpoint.execution.adjudicator.model}`,
          status: t(`evalHarness.status.${checkpoint.status}`),
          progress: `${checkpoint.completed.length}/${checkpoint.fixtureIds.length}`,
        })
      : !baseReady
        ? t('evalHarness.h85.needsParent')
        : split === 'development'
          ? t('evalHarness.h85.developmentDescription')
          : t('evalHarness.h85.heldOutLocked')
    return (
      <section
        className="border-t border-border/60 py-3"
        data-testid={`h85-${split}-section`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-medium text-text-primary">{label}</h4>
            <p className="mt-0.5 text-[11px] text-text-muted">
              {statusLine}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void runAdjudication(split) }}
              disabled={busy || !isAIConfigReady(config) || !baseReady || locked || heldOutBlocked}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-40"
            >
              {isRunning
                ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                : <Play className="h-3.5 w-3.5" />}
              {isRunning
                ? renderMessage(progress)
                : isResumable ? t('evalHarness.actions.resumeAdjudication') : t('evalHarness.actions.runAdjudication')}
            </button>
            {checkpoint && (
              <button
                type="button"
                onClick={() => { void copyAdjudication(split) }}
                disabled={busy}
                title={copiedAdjudicationSplit === split ? t('evalHarness.h85.copyDoneTitle') : t('evalHarness.h85.copyTitle')}
                aria-label={t('evalHarness.h85.copyAria', { label })}
                className="grid h-8 w-8 place-items-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
              </button>
            )}
            {checkpoint && (
              <button
                type="button"
                onClick={() => { void exportAdjudication(split) }}
                disabled={busy}
                title={t('evalHarness.h85.exportTitle')}
                aria-label={t('evalHarness.h85.exportAria', { label })}
                className="grid h-8 w-8 place-items-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            )}
            {checkpoint && (
              <button
                type="button"
                onClick={() => { void toggleAdjudicationJson(split) }}
                disabled={busy}
                title={adjudicationExportJson[split] == null ? t('evalHarness.h85.showJsonTitle') : t('evalHarness.h85.hideJsonTitle')}
                aria-label={adjudicationExportJson[split] == null
                  ? t('evalHarness.h85.showJsonAria', { label })
                  : t('evalHarness.h85.hideJsonAria', { label })}
                className="grid h-8 w-8 place-items-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
              >
                <FileJson className="h-3.5 w-3.5" />
              </button>
            )}
            {checkpoint && !busy
              && (split === 'development' || checkpoint.status !== 'completed') && (
              <button
                type="button"
                onClick={() => { void resetAdjudication(split) }}
                title={t('evalHarness.h85.resetTitle')}
                aria-label={t('evalHarness.h85.clearAria', { label })}
                className="grid h-8 w-8 place-items-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-primary"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {score && (
          <div data-testid={`h85-${split}-score`} className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-text-secondary sm:grid-cols-4">
            <span>{t('evalHarness.scores.highSeverityPrecision', { value: formatRate(score.highSeverityHard.precision.estimate) })}</span>
            <span>{t('evalHarness.scores.highSeverityRecall', { value: formatRate(score.highSeverityHard.recall.estimate) })}</span>
            <span>{t('evalHarness.scores.evidenceVerification', { value: formatRate(score.evidence.verificationRate.estimate) })}</span>
            <span className={score.gate.passed ? 'text-success' : 'text-error'}>
              {score.gate.passed
                ? t('evalHarness.scores.gatePassed')
                : t('evalHarness.scores.gateFailed', { failures: listFormat.format(score.gate.failures) })}
            </span>
            <span>{t('evalHarness.h85.discoveryCalls', { value: score.usage.discovery.modelCalls })}</span>
            <span>{t('evalHarness.h85.adjudicationCalls', { value: score.usage.adjudication.modelCalls })}</span>
            <span>{t('evalHarness.h85.totalInputTokens', { value: score.usage.total.inputTokens })}</span>
            <span>{t('evalHarness.h85.totalOutputTokens', { value: score.usage.total.outputTokens })}</span>
            <span>{t('evalHarness.h85.totalCost', { value: score.usage.total.costUsd.toFixed(4) })}</span>
            <span>{t('evalHarness.scores.totalLatency', { value: `${(score.usage.total.durationMs / 1_000).toFixed(1)}s` })}</span>
          </div>
        )}
        {checkpoint && (
          <p
            data-testid={`h85-${split}-checkpoint-hash`}
            className="mt-2 break-all font-mono text-[10px] text-text-muted"
          >
            checkpoint {checkpoint.checkpointHash} · parent {checkpoint.baseCheckpointHash}
          </p>
        )}
        {adjudicationExportJson[split] != null && (
          <textarea
            data-testid={`h85-${split}-export-json`}
            readOnly
            aria-label={t('evalHarness.checkpointJsonAria', { label })}
            value={adjudicationExportJson[split]}
            className="mt-2 h-28 w-full resize-y rounded-md border border-border bg-bg-base p-2 font-mono text-[10px] text-text-secondary"
          />
        )}
        {latestFailure && (
          <p data-testid={`h85-${split}-failure`} className="mt-2 break-words text-[11px] text-error">
            {t('evalHarness.latestFailure', { code: latestFailure.code, message: latestFailure.message })}
            {latestFailure.usage == null ? t('evalHarness.noProviderUsage') : ''}
          </p>
        )}
      </section>
    )
  }

  return (
    <div data-testid="harness-eval-panel" className="mt-6 max-w-2xl rounded-lg border border-border bg-bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-text-primary">{t('evalHarness.panelTitle')}</h3>
        <span className="text-[10px] text-text-muted">{t('evalHarness.devOnly')}</span>
      </div>
      {renderSplit('development', t('evalHarness.h4.developmentLabel'))}
      {renderSplit('held-out', t('evalHarness.h4.heldOutLabel'))}
      {renderAdjudicationSplit('development', t('evalHarness.h85.developmentLabel'))}
      {renderAdjudicationSplit('held-out', t('evalHarness.h85.heldOutLabel'))}
      <H86StoryArcEvalPanel />
      <CreativeReliabilityEvalPanel />

      <section className="border-t border-border pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-medium text-text-primary">{t('evalHarness.h17.title')}</h4>
          <button
            type="button"
            onClick={() => { void runCompressionMatrix() }}
            disabled={busy || !isAIConfigReady(config)}
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-500/10 px-2.5 py-1.5 text-xs text-sky-400 hover:bg-sky-500/20 disabled:opacity-40"
          >
            {compressionRunning
              ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              : <Play className="h-3.5 w-3.5" />}
            {compressionRunning ? renderMessage(progress) : t('evalHarness.actions.run')}
          </button>
        </div>
        {compressionRecords.length > 0 && (
          <div data-testid="h17-context-compression-result" className="mt-3 overflow-x-auto">
            <table className="w-full text-[11px] text-text-secondary">
              <thead>
                <tr className="text-left text-text-muted">
                  <th>{t('evalHarness.h17.colVariant')}</th><th>{t('evalHarness.h17.colFacts')}</th><th>{t('evalHarness.h17.colConstraints')}</th><th>{t('evalHarness.h17.colLeakage')}</th><th>{t('evalHarness.h17.colGenerationInput')}</th><th>{t('evalHarness.h17.colTotalInput')}</th><th>{t('evalHarness.h17.colCalls')}</th>
                </tr>
              </thead>
              <tbody>
                {compressionRecords.map(item => (
                  <tr key={item.variant} className="border-t border-border/50">
                    <td>{t(`evalHarness.h17.variant.${item.variant}`)}</td>
                    <td>{(item.aggregate.requiredFactRecall * 100).toFixed(1)}%</td>
                    <td>{(item.aggregate.constraintRecall * 100).toFixed(1)}%</td>
                    <td>{((item.aggregate.futureLeakageRate + item.aggregate.wrongWorldLeakageRate) * 100).toFixed(1)}%</td>
                    <td>{item.aggregate.generationInputTokens}</td>
                    <td>{item.aggregate.totalInputTokens}</td>
                    <td>{item.aggregate.modelCalls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {compressionGate && (
              <p className={`mt-2 text-[11px] ${compressionGate.passed ? 'text-success' : 'text-error'}`}>
                {t('evalHarness.h17.gate', {
                  result: compressionGate.passed ? 'PASS' : `FAIL · ${listFormat.format(compressionGate.failures)}`,
                })}
                {' '}· {t('evalHarness.h17.generationInputReduction', {
                  percent: `${(compressionGate.generationInputReduction * 100).toFixed(1)}%`,
                })}
                {' '}· {t('evalHarness.h17.totalInputMultiplier', {
                  value: `${compressionGate.totalInputMultiplier.toFixed(2)}x`,
                })}
              </p>
            )}
          </div>
        )}
      </section>
      {error && <p className="mt-2 text-xs text-error">{renderMessage(error)}</p>}
    </div>
  )
}
