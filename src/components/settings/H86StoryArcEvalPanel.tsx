import { useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardCopy, Download, FileJson, LoaderCircle, Play, RotateCcw, Upload } from 'lucide-react'
import { isAIConfigReady } from '../../lib/ai/config-readiness'
import {
  H86_GENERATOR_PAIR_VERSION_V1,
  H86_VERIFIER_PROMPT_VERSION_V1,
  clearH86CheckpointV1,
  exportH86CheckpointV1,
  importH86CheckpointV1,
  loadH86CheckpointV1,
  persistH86CheckpointV1,
  runH86StoryArcMainPathEvalV1,
  type H86CheckpointV1,
} from '../../lib/evals/agent-harness/story-arc-main-path'
import {
  cleanupStrandedH86WorkspacesV1,
  createH86BrowserRunDependenciesV1,
} from '../../lib/evals/agent-harness/story-arc-main-path-browser'
import { clearH86HumanReviewV1 } from '../../lib/evals/agent-harness/story-arc-human-review'
import type { AIConfig, AIConfigPreset } from '../../lib/types'
import { APP_BUILD_ID } from '../../lib/version'
import {
  getAIConfigPresetSessionApiKey,
  useAIConfigStore,
} from '../../stores/ai-config'
import { useDomainT } from '../../i18n'
import { useDialog } from '../shared/Dialog'
import H86HumanReviewPanel from './H86HumanReviewPanel'

/**
 * Reactive localized error: stores the i18n key + params so the visible
 * message re-translates on locale switch. Raw engine/provider errors stay raw.
 */
interface LocalizedMessage { key: string; params?: Record<string, unknown> }
type PanelError = LocalizedMessage | { raw: string } | null

class LocalizedEvalError extends Error {
  readonly key: string
  readonly params?: Record<string, unknown>
  constructor(key: string, params?: Record<string, unknown>) {
    super(key)
    this.name = 'LocalizedEvalError'
    this.key = key
    this.params = params
  }
}

function toPanelError(cause: unknown): PanelError {
  if (cause instanceof LocalizedEvalError) return { key: cause.key, params: cause.params }
  return { raw: cause instanceof Error ? cause.message : String(cause) }
}

function renderPanelError(t: (key: string, opts?: Record<string, unknown>) => string, error: PanelError): string {
  if (!error) return ''
  return 'raw' in error ? error.raw : t(error.key, error.params)
}

function downloadJson(raw: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function presetConfig(preset: AIConfigPreset, current: AIConfig): AIConfig {
  const apiKey = preset.config.apiKey
    || getAIConfigPresetSessionApiKey(preset.id)
    || (preset.config.provider === current.provider ? current.apiKey : '')
  return { ...preset.config, apiKey }
}

function attemptedSteps(checkpoint: H86CheckpointV1 | null): number {
  if (!checkpoint) return 0
  return checkpoint.cases.reduce((sum, item) => sum + Object.values(item.variants).reduce(
    (caseSum, state) => caseSum
      + Number(state.generationAttempts.length > 0)
      + Number(state.verificationAttempts.length > 0),
    0,
  ), 0)
}

function successfulSteps(checkpoint: H86CheckpointV1 | null): number {
  if (!checkpoint) return 0
  return checkpoint.cases.reduce((sum, item) => sum + Object.values(item.variants).reduce(
    (caseSum, state) => {
      const generation = state.generationAttempts[state.generationAttempts.length - 1]
      const verification = state.verificationAttempts[state.verificationAttempts.length - 1]
      return caseSum + Number(generation?.status === 'succeeded') + Number(verification?.status === 'succeeded')
    },
    0,
  ), 0)
}

function defaultPresetId(presets: AIConfigPreset[], pattern: RegExp, exclude?: string): string {
  return presets.find(item => item.id !== exclude && pattern.test(`${item.name} ${item.config.model}`))?.id
    ?? presets.find(item => item.id !== exclude)?.id
    ?? ''
}

export default function H86StoryArcEvalPanel() {
  const { t, lang } = useDomainT('settings')
  const listFormat = useMemo(() => new Intl.ListFormat(lang, { type: 'conjunction', style: 'short' }), [lang])
  const currentConfig = useAIConfigStore(state => state.config)
  const presets = useAIConfigStore(state => state.presets)
  const dialog = useDialog()
  const [generatorPresetId, setGeneratorPresetId] = useState('')
  const [verifierPresetId, setVerifierPresetId] = useState('')
  const [checkpoint, setCheckpoint] = useState<H86CheckpointV1 | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<PanelError>(null)
  const [copied, setCopied] = useState(false)
  const [exportDraft, setExportDraft] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setGeneratorPresetId(current => current || defaultPresetId(presets, /agnes-2\.5-flash|agnes.*2\.5/i))
    setVerifierPresetId(current => current || defaultPresetId(presets, /deepseek-v4-pro-260425|deepseek.*v4.*pro/i))
  }, [presets])

  useEffect(() => {
    let active = true
    void loadH86CheckpointV1().then(value => {
      if (active) setCheckpoint(value)
    }).catch(cause => {
      if (active) setError(toPanelError(cause))
    })
    return () => { active = false }
  }, [])

  const generatorPreset = presets.find(item => item.id === generatorPresetId) ?? null
  const verifierPreset = presets.find(item => item.id === verifierPresetId) ?? null
  const generatorConfig = useMemo(() => (
    generatorPreset ? presetConfig(generatorPreset, currentConfig) : null
  ), [currentConfig, generatorPreset])
  const verifierConfig = useMemo(() => (
    verifierPreset ? presetConfig(verifierPreset, currentConfig) : null
  ), [currentConfig, verifierPreset])
  const frozenIdentity = checkpoint
    ? `${checkpoint.generator.provider}/${checkpoint.generator.model} → ${checkpoint.verifier.provider}/${checkpoint.verifier.model}`
    : null

  const run = async () => {
    setRunning(true)
    setError(null)
    setCopied(false)
    try {
      if (!generatorConfig || !verifierConfig) throw new LocalizedEvalError('evalHarness.selectPresets')
      if (!isAIConfigReady(generatorConfig) || !isAIConfigReady(verifierConfig)) {
        throw new LocalizedEvalError('evalHarness.presetIncomplete')
      }
      if (generatorConfig.provider === verifierConfig.provider && generatorConfig.model === verifierConfig.model) {
        throw new LocalizedEvalError('evalHarness.distinctIdentityRequired')
      }
      if (checkpoint && (
        checkpoint.generator.provider !== generatorConfig.provider
        || checkpoint.generator.model !== generatorConfig.model
        || checkpoint.verifier.provider !== verifierConfig.provider
        || checkpoint.verifier.model !== verifierConfig.model
      )) throw new LocalizedEvalError('evalHarness.h86.switchBackToFrozen', { identity: frozenIdentity ?? '' })
      await cleanupStrandedH86WorkspacesV1()
      const next = await runH86StoryArcMainPathEvalV1({
        runId: checkpoint?.runId ?? `h86-story-arc-${crypto.randomUUID()}`,
        codeRevision: checkpoint?.codeRevision ?? APP_BUILD_ID,
        generator: checkpoint?.generator ?? {
          provider: generatorConfig.provider,
          model: generatorConfig.model,
          promptVersion: H86_GENERATOR_PAIR_VERSION_V1,
        },
        verifier: checkpoint?.verifier ?? {
          provider: verifierConfig.provider,
          model: verifierConfig.model,
          promptVersion: H86_VERIFIER_PROMPT_VERSION_V1,
        },
        dependencies: createH86BrowserRunDependenciesV1({ generatorConfig, verifierConfig }),
        ...(checkpoint ? { resumeFrom: checkpoint, retryFailed: true } : {}),
        onCheckpoint: async value => {
          await persistH86CheckpointV1(value)
          setCheckpoint(value)
        },
      })
      setCheckpoint(next)
    } catch (cause) {
      setError(toPanelError(cause))
    } finally {
      setRunning(false)
    }
  }

  const reset = async () => {
    const confirmed = await dialog.confirm({
      title: t('evalHarness.h86.clearConfirmTitle'),
      message: t('evalHarness.h86.clearConfirmMessage'),
      confirmText: t('evalHarness.actions.clear'),
      cancelText: t('evalHarness.actions.keep'),
      tone: 'danger',
    })
    if (!confirmed) return
    clearH86CheckpointV1()
    clearH86HumanReviewV1()
    await cleanupStrandedH86WorkspacesV1()
    setCheckpoint(null)
    setExportDraft('')
    setError(null)
  }

  const exportCheckpoint = async (mode: 'download' | 'copy' | 'readonly') => {
    if (!checkpoint) return
    try {
      const raw = await exportH86CheckpointV1(checkpoint)
      if (mode === 'download') {
        downloadJson(raw, `storyforge-h86-story-arc-${checkpoint.status}-${Date.now()}.json`)
      } else if (mode === 'copy') {
        await navigator.clipboard.writeText(raw)
        setCopied(true)
      } else {
        setExportDraft(raw)
      }
    } catch (cause) {
      setError(toPanelError(cause))
    }
  }

  const importFile = async (file: File) => {
    try {
      const imported = await importH86CheckpointV1(await file.text())
      await persistH86CheckpointV1(imported)
      setCheckpoint(imported)
      setError(null)
    } catch (cause) {
      setError(toPanelError(cause))
    }
  }

  const aggregate = checkpoint?.aggregate
  const gate = checkpoint?.machineGate
  const canRun = !running && generatorConfig != null && verifierConfig != null

  return (
    <section data-testid="h86-story-arc-eval" className="border-t border-border pt-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-medium text-text-primary">{t('evalHarness.h86.title')}</h4>
          <p className="mt-1 text-[10px] text-text-muted">
            {t('evalHarness.h86.subtitle')}
          </p>
        </div>
        <button
          type="button"
          data-testid="h86-run"
          onClick={() => { void run() }}
          disabled={!canRun}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40"
        >
          {running ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {running
            ? t('evalHarness.h86.attemptedProgress', { steps: attemptedSteps(checkpoint) })
            : checkpoint && checkpoint.status !== 'completed' ? t('evalHarness.actions.resume') : t('evalHarness.actions.run')}
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-[10px] text-text-muted">
          {t('evalHarness.generatorPreset')}
          <select
            data-testid="h86-generator-preset"
            value={generatorPresetId}
            disabled={running || checkpoint != null}
            onChange={event => setGeneratorPresetId(event.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-1.5 text-xs text-text-primary"
          >
            <option value="">{t('evalHarness.actions.selectOption')}</option>
            {presets.map(item => <option key={item.id} value={item.id}>{item.name} · {item.config.model}</option>)}
          </select>
        </label>
        <label className="text-[10px] text-text-muted">
          {t('evalHarness.independentVerifierPreset')}
          <select
            data-testid="h86-verifier-preset"
            value={verifierPresetId}
            disabled={running || checkpoint != null}
            onChange={event => setVerifierPresetId(event.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-1.5 text-xs text-text-primary"
          >
            <option value="">{t('evalHarness.actions.selectOption')}</option>
            {presets.map(item => <option key={item.id} value={item.id}>{item.name} · {item.config.model}</option>)}
          </select>
        </label>
      </div>

      {checkpoint && (
        <div className="mt-3 rounded-md border border-border bg-bg-base p-2 text-[11px] text-text-secondary">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span>{t('evalHarness.statusLabel', { value: t(`evalHarness.status.${checkpoint.status}`) })}</span>
            <span>{t('evalHarness.h86.attempted', { steps: attemptedSteps(checkpoint) })}</span>
            <span>{t('evalHarness.h86.successfulStages', { steps: successfulSteps(checkpoint) })}</span>
            <span>{frozenIdentity}</span>
          </div>
          {aggregate && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-text-muted">
                  <tr><th>{t('evalHarness.h86.colVariant')}</th><th>{t('evalHarness.h86.colCompletion')}</th><th>{t('evalHarness.h86.colFacts')}</th><th>{t('evalHarness.h86.colSemantic')}</th><th>p95</th><th>tokens</th><th>{t('evalHarness.h86.colCost')}</th></tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border/50">
                    <td>{t('evalHarness.legacyDirect')}</td>
                    <td>{(aggregate.legacyDirect.completionRate * 100).toFixed(0)}%</td>
                    <td>{(aggregate.legacyDirect.requiredFactCoverage * 100).toFixed(1)}%</td>
                    <td>{(aggregate.legacyDirect.semanticScore * 100).toFixed(1)}%</td>
                    <td>{(aggregate.legacyDirect.p95LatencyMs / 1_000).toFixed(1)}s</td>
                    <td>{aggregate.legacyDirect.inputTokens + aggregate.legacyDirect.outputTokens}</td>
                    <td>${aggregate.legacyDirect.costUsd.toFixed(4)}</td>
                  </tr>
                  <tr className="border-t border-border/50">
                    <td>Agent/Harness</td>
                    <td>{(aggregate.agentHarness.completionRate * 100).toFixed(0)}%</td>
                    <td>{(aggregate.agentHarness.requiredFactCoverage * 100).toFixed(1)}%</td>
                    <td>{(aggregate.agentHarness.semanticScore * 100).toFixed(1)}%</td>
                    <td>{(aggregate.agentHarness.p95LatencyMs / 1_000).toFixed(1)}s</td>
                    <td>{aggregate.agentHarness.inputTokens + aggregate.agentHarness.outputTokens}</td>
                    <td>${aggregate.agentHarness.costUsd.toFixed(4)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {gate && (
            <p data-testid="h86-machine-gate" className={`mt-2 ${gate.passed ? 'text-success' : 'text-error'}`}>
              {t('evalHarness.machineGate', {
                result: gate.passed ? 'PASS' : `FAIL · ${listFormat.format(gate.failures)}`,
              })}
              {' '}· {t('evalHarness.h86.machineGateNote')}
            </p>
          )}
          <p className="mt-2 break-all font-mono text-[10px] text-text-muted">
            checkpoint {checkpoint.checkpointHash}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => { void exportCheckpoint('download') }} className="inline-flex items-center gap-1 text-accent">
              <Download className="h-3 w-3" />{t('evalHarness.actions.download')}
            </button>
            <button type="button" onClick={() => { void exportCheckpoint('copy') }} className="inline-flex items-center gap-1 text-accent">
              <ClipboardCopy className="h-3 w-3" />{copied ? t('evalHarness.actions.copied') : t('evalHarness.actions.copy')}
            </button>
            <button type="button" onClick={() => { void exportCheckpoint('readonly') }} className="inline-flex items-center gap-1 text-accent">
              <FileJson className="h-3 w-3" />{t('evalHarness.actions.readOnlyJson')}
            </button>
            <button type="button" onClick={() => { void reset() }} className="inline-flex items-center gap-1 text-error">
              <RotateCcw className="h-3 w-3" />{t('evalHarness.actions.clear')}
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0]
          if (file) void importFile(file)
          event.currentTarget.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={running}
        className="mt-2 inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-accent disabled:opacity-40"
      >
        <Upload className="h-3 w-3" />{t('evalHarness.h86.importCheckpoint')}
      </button>
      {exportDraft && (
        <textarea
          readOnly
          aria-label={t('evalHarness.checkpointJsonAria', { label: 'H86' })}
          value={exportDraft}
          className="mt-2 h-28 w-full resize-y rounded border border-border bg-bg-base p-2 font-mono text-[10px] text-text-secondary"
        />
      )}
      <H86HumanReviewPanel checkpoint={checkpoint} />
      {error && <p data-testid="h86-error" className="mt-2 text-[11px] text-error">{renderPanelError(t, error)}</p>}
    </section>
  )
}
