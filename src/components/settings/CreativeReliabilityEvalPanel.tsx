import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, LoaderCircle, Pause, Play, RotateCcw, Save, Upload } from 'lucide-react'
import { isAIConfigReady } from '../../lib/ai/config-readiness'
import { hashCanonicalValue } from '../../lib/agent/run/hash'
import {
  cleanupStrandedCreativeReliabilityWorkspacesV1,
  createCreativeReliabilityBrowserDependenciesV1,
} from '../../lib/evals/creative-reliability/browser'
import {
  claimCreativeReliabilityHeldoutRunV1,
} from '../../lib/evals/creative-reliability/evidence'
import {
  CREATIVE_RELIABILITY_FIXTURE_SET_VERSION_V1,
  getCreativeReliabilityFixturesV1,
} from '../../lib/evals/creative-reliability/fixtures'
import {
  CREATIVE_RELIABILITY_VERIFIER_PROMPT_VERSION_V1,
} from '../../lib/evals/creative-reliability/protocol'
import {
  applyCreativeReliabilityReviewsToCheckpointV1,
  archiveCreativeReliabilityEvalCheckpointV1,
  clearCreativeReliabilityEvalCheckpointV1,
  exportCreativeReliabilityEvalCheckpointV1,
  importCreativeReliabilityEvalCheckpointV1,
  loadCreativeReliabilityEvalCheckpointArchivesV1,
  loadCreativeReliabilityEvalCheckpointV1,
  persistCreativeReliabilityEvalCheckpointV1,
  runCreativeReliabilityEvalV1,
  verifyCreativeReliabilityEvalCheckpointV1,
  type CreativeReliabilityEvalCheckpointV1,
} from '../../lib/evals/creative-reliability/runner'
import type {
  CreativeReliabilityBlindVerdictV1,
  CreativeReliabilityEvalSplitV1,
  CreativeReliabilityEvalVariantV1,
  CreativeReliabilityHumanReviewV1,
} from '../../lib/evals/creative-reliability/types'
import type { AIConfig, AIConfigPreset } from '../../lib/types'
import { APP_BUILD_ID } from '../../lib/version'
import {
  getAIConfigPresetSessionApiKey,
  useAIConfigStore,
} from '../../stores/ai-config'
import { useDomainT } from '../../i18n'
import { useDialog } from '../shared/Dialog'

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

/** Project the canonical split identifier through existing locale keys. */
function splitLabel(t: (key: string) => string, split: string): string {
  return split === 'held-out' ? t('evalHarness.crel.splitHeldOut') : t('evalHarness.crel.splitDevelopment')
}

const GENERATOR_PAIR_VERSION = 'crel-story-arc-paired-v1'

function presetConfig(preset: AIConfigPreset, current: AIConfig): AIConfig {
  const apiKey = preset.config.apiKey
    || getAIConfigPresetSessionApiKey(preset.id)
    || (preset.config.provider === current.provider ? current.apiKey : '')
  return { ...preset.config, apiKey }
}

function defaultPresetId(presets: AIConfigPreset[], pattern: RegExp, exclude?: string): string {
  return presets.find(item => item.id !== exclude && pattern.test(`${item.name} ${item.config.model}`))?.id
    ?? presets.find(item => item.id !== exclude)?.id
    ?? ''
}

function attemptedSteps(checkpoint: CreativeReliabilityEvalCheckpointV1 | null): number {
  if (!checkpoint) return 0
  return checkpoint.cases.reduce((sum, item) => (
    sum + Object.keys(item.generations).length + Object.keys(item.verifications).length
  ), 0)
}

function downloadJson(raw: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function blindOrder(
  checkpoint: CreativeReliabilityEvalCheckpointV1,
  fixtureId: string,
): [CreativeReliabilityEvalVariantV1, CreativeReliabilityEvalVariantV1] {
  const nibble = Number.parseInt(checkpoint.checkpointHash.slice(-1), 16)
  const index = checkpoint.cases.findIndex(item => item.fixtureId === fixtureId)
  return (nibble + index) % 2 === 0
    ? ['legacy-direct', 'creative-reliability']
    : ['creative-reliability', 'legacy-direct']
}

function initialVerdict(output: string, label: 'A' | 'B'): CreativeReliabilityBlindVerdictV1 {
  return {
    label,
    willingToEdit: Boolean(output.trim()),
    estimatedEditMinutes: output.trim() ? 15 : 0,
    retainedRatio: output.trim() ? 0.7 : 0,
  }
}

function CandidateReview(props: {
  label: 'A' | 'B'
  output: string
  verdict: CreativeReliabilityBlindVerdictV1
  onChange: (value: CreativeReliabilityBlindVerdictV1) => void
}) {
  const { t } = useDomainT('settings')
  return (
    <div className="rounded-md border border-border bg-bg-base p-2">
      <h6 className="text-xs font-medium text-text-primary">{t('evalHarness.candidateLabel', { label: props.label })}</h6>
      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-bg-elevated p-2 text-[10px] text-text-secondary">
        {props.output || t('evalHarness.crel.noEditableOutput')}
      </pre>
      <label className="mt-2 flex items-center gap-2 text-[10px] text-text-muted">
        <input
          type="checkbox"
          aria-label={t('evalHarness.crel.willingAria', { candidate: props.label })}
          checked={props.verdict.willingToEdit}
          onChange={event => props.onChange({ ...props.verdict, willingToEdit: event.target.checked })}
        />
        {t('evalHarness.crel.willingLabel')}
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-[10px] text-text-muted">
          {t('evalHarness.crel.editMinutesLabel')}
          <input
            type="number"
            min={0}
            max={9_999}
            value={props.verdict.estimatedEditMinutes}
            onChange={event => props.onChange({
              ...props.verdict,
              estimatedEditMinutes: Math.max(0, Number(event.target.value) || 0),
            })}
            className="mt-1 w-full rounded border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary"
          />
        </label>
        <label className="text-[10px] text-text-muted">
          {t('evalHarness.crel.retainedRatioLabel')}
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(props.verdict.retainedRatio * 100)}
            onChange={event => props.onChange({
              ...props.verdict,
              retainedRatio: Math.max(0, Math.min(1, (Number(event.target.value) || 0) / 100)),
            })}
            className="mt-1 w-full rounded border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary"
          />
        </label>
      </div>
    </div>
  )
}

export default function CreativeReliabilityEvalPanel() {
  const { t, lang } = useDomainT('settings')
  const listFormat = useMemo(() => new Intl.ListFormat(lang, { type: 'conjunction', style: 'short' }), [lang])
  const currentConfig = useAIConfigStore(state => state.config)
  const presets = useAIConfigStore(state => state.presets)
  const dialog = useDialog()
  const [generatorPresetId, setGeneratorPresetId] = useState('')
  const [verifierPresetId, setVerifierPresetId] = useState('')
  const [split, setSplit] = useState<CreativeReliabilityEvalSplitV1>('development')
  const [checkpoint, setCheckpoint] = useState<CreativeReliabilityEvalCheckpointV1 | null>(null)
  const [archives, setArchives] = useState<CreativeReliabilityEvalCheckpointV1[]>(() => (
    loadCreativeReliabilityEvalCheckpointArchivesV1()
  ))
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<PanelError>(null)
  const [reviewer, setReviewer] = useState('')
  const [verdictA, setVerdictA] = useState(() => initialVerdict('', 'A'))
  const [verdictB, setVerdictB] = useState(() => initialVerdict('', 'B'))
  const [preferred, setPreferred] = useState<'A' | 'B' | 'tie'>('tie')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const stopRequested = useRef(false)

  useEffect(() => {
    setGeneratorPresetId(current => current || defaultPresetId(presets, /agnes-2\.5-flash|agnes.*2\.5/i))
    setVerifierPresetId(current => current || defaultPresetId(
      presets,
      /deepseek-v4-pro-260425|deepseek.*v4.*pro/i,
      generatorPresetId,
    ))
  }, [generatorPresetId, presets])

  useEffect(() => {
    const stored = loadCreativeReliabilityEvalCheckpointV1()
    if (!stored) return
    const fixtures = getCreativeReliabilityFixturesV1(stored.split)
    void verifyCreativeReliabilityEvalCheckpointV1(stored, fixtures).then(valid => {
      if (!valid) {
        setError({ key: 'evalHarness.crel.localVerifyFailed' })
        return
      }
      setCheckpoint(stored)
      setSplit(stored.split)
    })
  }, [])

  const generatorPreset = presets.find(item => item.id === generatorPresetId) ?? null
  const verifierPreset = presets.find(item => item.id === verifierPresetId) ?? null
  const generatorConfig = useMemo(() => (
    generatorPreset ? presetConfig(generatorPreset, currentConfig) : null
  ), [currentConfig, generatorPreset])
  const verifierConfig = useMemo(() => (
    verifierPreset ? presetConfig(verifierPreset, currentConfig) : null
  ), [currentConfig, verifierPreset])
  const fixtures = getCreativeReliabilityFixturesV1(checkpoint?.split ?? split)
  const record = checkpoint?.record ?? null
  const currentReviewCase = record?.cases.find(item => item.humanReview == null) ?? null
  const currentFixture = currentReviewCase
    ? fixtures.find(item => item.id === currentReviewCase.fixtureId) ?? null
    : null
  const currentBlindOrder = checkpoint && currentReviewCase
    ? blindOrder(checkpoint, currentReviewCase.fixtureId)
    : null
  const outputFor = (label: 'A' | 'B') => {
    if (!currentReviewCase || !currentBlindOrder) return ''
    const variant = currentBlindOrder[label === 'A' ? 0 : 1]
    return currentReviewCase.generations[variant].presentedText
  }

  useEffect(() => {
    setVerdictA(initialVerdict(outputFor('A'), 'A'))
    setVerdictB(initialVerdict(outputFor('B'), 'B'))
    setPreferred('tie')
    // outputFor intentionally derives from the newly selected case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentReviewCase?.fixtureId, checkpoint?.checkpointHash])

  const run = async () => {
    setRunning(true)
    setError(null)
    stopRequested.current = false
    try {
      const completedDevelopment = checkpoint?.status === 'completed' && checkpoint.split === 'development'
      if (checkpoint?.status === 'completed' && checkpoint.split === 'held-out') {
        throw new LocalizedEvalError('evalHarness.crel.heldOutAlreadyCompleted')
      }
      const resumeCheckpoint = completedDevelopment ? null : checkpoint
      if (completedDevelopment) {
        setArchives(await archiveCreativeReliabilityEvalCheckpointV1(
          checkpoint,
          getCreativeReliabilityFixturesV1(checkpoint.split),
        ))
      }
      if (!generatorConfig || !verifierConfig) throw new LocalizedEvalError('evalHarness.selectPresets')
      if (!isAIConfigReady(generatorConfig) || !isAIConfigReady(verifierConfig)) {
        throw new LocalizedEvalError('evalHarness.presetIncomplete')
      }
      if (generatorConfig.provider === verifierConfig.provider && generatorConfig.model === verifierConfig.model) {
        throw new LocalizedEvalError('evalHarness.distinctIdentityRequired')
      }
      const selectedFixtures = getCreativeReliabilityFixturesV1(resumeCheckpoint?.split ?? split)
      if (!resumeCheckpoint && split === 'held-out') {
        const confirmed = await dialog.confirm({
          title: t('evalHarness.crel.heldOutConfirmTitle'),
          message: t('evalHarness.crel.heldOutConfirmMessage'),
          confirmText: t('evalHarness.actions.confirmRunOnce'),
          cancelText: t('evalHarness.actions.notNow'),
          tone: 'danger',
        })
        if (!confirmed) return
      }
      const runId = resumeCheckpoint?.runId ?? `crel-${split}-${crypto.randomUUID()}`
      if ((resumeCheckpoint?.split ?? split) === 'held-out') {
        claimCreativeReliabilityHeldoutRunV1({
          runId,
          fixtureSetHash: await hashCanonicalValue(selectedFixtures),
        })
      }
      if (resumeCheckpoint && (
        resumeCheckpoint.generator.provider !== generatorConfig.provider
        || resumeCheckpoint.generator.model !== generatorConfig.model
        || resumeCheckpoint.verifier.provider !== verifierConfig.provider
        || resumeCheckpoint.verifier.model !== verifierConfig.model
      )) throw new LocalizedEvalError('evalHarness.crel.frozenIdentityMismatch')
      await cleanupStrandedCreativeReliabilityWorkspacesV1()
      const next = await runCreativeReliabilityEvalV1({
        suiteVersion: CREATIVE_RELIABILITY_FIXTURE_SET_VERSION_V1,
        runId,
        codeRevision: resumeCheckpoint?.codeRevision ?? APP_BUILD_ID,
        fixtures: selectedFixtures,
        generator: resumeCheckpoint?.generator ?? {
          provider: generatorConfig.provider,
          model: generatorConfig.model,
          promptVersion: GENERATOR_PAIR_VERSION,
        },
        verifier: resumeCheckpoint?.verifier ?? {
          provider: verifierConfig.provider,
          model: verifierConfig.model,
          promptVersion: CREATIVE_RELIABILITY_VERIFIER_PROMPT_VERSION_V1,
        },
        parameters: { temperature: 0.55, maxOutputTokens: 6_000 },
        dependencies: createCreativeReliabilityBrowserDependenciesV1({
          generatorConfig,
          verifierConfig,
        }),
        ...(resumeCheckpoint ? { resumeFrom: resumeCheckpoint } : {}),
        onCheckpoint: async value => {
          await persistCreativeReliabilityEvalCheckpointV1(value)
          setCheckpoint(value)
          if (stopRequested.current) throw new Error('CREL_RUN_STOPPED')
        },
      })
      setCheckpoint(next)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message === 'CREL_RUN_STOPPED'
        ? { key: 'evalHarness.crel.stoppedMessage' }
        : { raw: message })
    } finally {
      setRunning(false)
    }
  }

  const reset = async () => {
    if (!checkpoint) return
    const confirmed = await dialog.confirm({
      title: t('evalHarness.crel.clearConfirmTitle', { split: splitLabel(t, checkpoint.split) }),
      message: checkpoint.split === 'held-out'
        ? t('evalHarness.crel.clearHeldOutMessage')
        : t('evalHarness.crel.clearDevelopmentMessage'),
      confirmText: t('evalHarness.actions.clearCheckpoint'),
      cancelText: t('evalHarness.actions.keep'),
      tone: 'danger',
    })
    if (!confirmed) return
    clearCreativeReliabilityEvalCheckpointV1()
    await cleanupStrandedCreativeReliabilityWorkspacesV1()
    setCheckpoint(null)
    setError(null)
  }

  const exportCheckpoint = async () => {
    if (!checkpoint) return
    try {
      downloadJson(
        await exportCreativeReliabilityEvalCheckpointV1(checkpoint, fixtures),
        `storyforge-crel-${checkpoint.split}-${checkpoint.status}-${Date.now()}.json`,
      )
    } catch (cause) {
      setError(toPanelError(cause))
    }
  }

  const exportLatestArchive = async () => {
    const archived = archives[0]
    if (!archived) return
    try {
      downloadJson(
        await exportCreativeReliabilityEvalCheckpointV1(
          archived,
          getCreativeReliabilityFixturesV1(archived.split),
        ),
        `storyforge-crel-${archived.split}-archived-${archived.runId}.json`,
      )
    } catch (cause) {
      setError(toPanelError(cause))
    }
  }

  const importFile = async (file: File) => {
    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw) as { split?: CreativeReliabilityEvalSplitV1 }
      if (parsed.split !== 'development' && parsed.split !== 'held-out') throw new LocalizedEvalError('evalHarness.crel.invalidSplit')
      const imported = await importCreativeReliabilityEvalCheckpointV1(
        raw,
        getCreativeReliabilityFixturesV1(parsed.split),
      )
      await persistCreativeReliabilityEvalCheckpointV1(imported)
      setCheckpoint(imported)
      setSplit(imported.split)
      setError(null)
    } catch (cause) {
      setError(toPanelError(cause))
    }
  }

  const saveReview = async () => {
    if (!checkpoint || !record || !currentReviewCase || !currentBlindOrder || !reviewer.trim()) return
    try {
      const reviewerIdHash = await hashCanonicalValue(reviewer.trim())
      const existingReviewer = record.cases.find(item => item.humanReview)?.humanReview?.reviewerIdHash
      if (existingReviewer && existingReviewer !== reviewerIdHash) {
        throw new LocalizedEvalError('evalHarness.crel.reviewerMismatch')
      }
      const reviews = Object.fromEntries(record.cases.flatMap(item => (
        item.humanReview ? [[item.fixtureId, item.humanReview] as const] : []
      )))
      reviews[currentReviewCase.fixtureId] = {
        reviewerIdHash,
        completedAt: Date.now(),
        blindOrder: currentBlindOrder,
        verdicts: [verdictA, verdictB],
        preferred,
      } satisfies CreativeReliabilityHumanReviewV1
      const next = await applyCreativeReliabilityReviewsToCheckpointV1({
        checkpoint,
        fixtures,
        reviews,
      })
      await persistCreativeReliabilityEvalCheckpointV1(next)
      setCheckpoint(next)
      setError(null)
    } catch (cause) {
      setError(toPanelError(cause))
    }
  }

  const aggregate = record?.aggregate
  const reviewedCount = record?.cases.filter(item => item.humanReview != null).length ?? 0

  return (
    <section data-testid="crel-eval-panel" className="border-t border-border pt-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-medium text-text-primary">{t('evalHarness.crel.title')}</h4>
          <p className="mt-1 text-[10px] text-text-muted">
            {t('evalHarness.crel.subtitle')}
          </p>
          <p className="mt-1 text-[10px] text-text-muted">
            {t('evalHarness.crel.persistenceNote')}
          </p>
        </div>
        <div className="flex gap-2">
          {running && (
            <button
              type="button"
              data-testid="crel-stop"
              onClick={() => { stopRequested.current = true }}
              className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning"
            >
              <Pause className="h-3.5 w-3.5" />{t('evalHarness.actions.stopAfterCurrentCall')}
            </button>
          )}
          <button
            type="button"
            data-testid="crel-run"
            onClick={() => { void run() }}
            disabled={running || checkpoint?.split === 'held-out' && checkpoint.status === 'completed'}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-400 disabled:opacity-40"
          >
            {running ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {running
              ? `${attemptedSteps(checkpoint)}/24`
              : checkpoint?.status === 'completed' && checkpoint.split === 'development'
                ? t('evalHarness.actions.archiveAndRerunDevelopment')
                : checkpoint && checkpoint.status !== 'completed' ? t('evalHarness.actions.resume') : t('evalHarness.actions.run')}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="text-[10px] text-text-muted">
          {t('evalHarness.crel.splitLabel')}
          <select
            data-testid="crel-split"
            value={checkpoint?.split ?? split}
            disabled={running || checkpoint != null}
            onChange={event => setSplit(event.target.value as CreativeReliabilityEvalSplitV1)}
            className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-1.5 text-xs text-text-primary"
          >
            <option value="development">{t('evalHarness.crel.splitDevelopment')}</option>
            <option value="held-out">{t('evalHarness.crel.splitHeldOut')}</option>
          </select>
        </label>
        <label className="text-[10px] text-text-muted">
          {t('evalHarness.generatorPreset')}
          <select
            data-testid="crel-generator"
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
            data-testid="crel-verifier"
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
            <span>{t('evalHarness.crel.steps', { steps: attemptedSteps(checkpoint) })}</span>
            <span>{splitLabel(t, checkpoint.split)}</span>
            <span>{checkpoint.generator.model} → {checkpoint.verifier.model}</span>
          </div>
          {aggregate && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-[10px]">
                <thead className="text-text-muted"><tr><th>{t('evalHarness.crel.colVariant')}</th><th>{t('evalHarness.crel.colEditable')}</th><th>{t('evalHarness.crel.colAdoptable')}</th><th>{t('evalHarness.crel.colAverageCalls')}</th><th>{t('evalHarness.crel.colTokensPerAdoptable')}</th><th>{t('evalHarness.crel.colSemantic')}</th><th>{t('evalHarness.crel.colProgress')}</th></tr></thead>
                <tbody>
                  <tr className="border-t border-border/50">
                    <td>{t('evalHarness.legacyDirect')}</td>
                    <td>{(aggregate.legacyDirect.editableArtifactRate * 100).toFixed(0)}%</td>
                    <td>{(aggregate.legacyDirect.adoptableRate * 100).toFixed(0)}%</td>
                    <td>{aggregate.legacyDirect.averageArtifactModelCalls.toFixed(2)}</td>
                    <td>{aggregate.legacyDirect.tokensPerAdoptableArtifact?.toFixed(0) ?? '—'}</td>
                    <td>{(aggregate.legacyDirect.semanticScore * 100).toFixed(0)}%</td>
                    <td>{(aggregate.legacyDirect.narrativeProgressRate * 100).toFixed(0)}%</td>
                  </tr>
                  <tr className="border-t border-border/50">
                    <td>CREL</td>
                    <td>{(aggregate.creativeReliability.editableArtifactRate * 100).toFixed(0)}%</td>
                    <td>{(aggregate.creativeReliability.adoptableRate * 100).toFixed(0)}%</td>
                    <td>{aggregate.creativeReliability.averageArtifactModelCalls.toFixed(2)}</td>
                    <td>{aggregate.creativeReliability.tokensPerAdoptableArtifact?.toFixed(0) ?? '—'}</td>
                    <td>{(aggregate.creativeReliability.semanticScore * 100).toFixed(0)}%</td>
                    <td>{(aggregate.creativeReliability.narrativeProgressRate * 100).toFixed(0)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {record && (
            <div className="mt-2 space-y-1">
              <p data-testid="crel-machine-gate" className={record.machineGate.passed ? 'text-success' : 'text-error'}>
                {t('evalHarness.machineGate', {
                  result: record.machineGate.passed ? 'PASS' : `FAIL · ${listFormat.format(record.machineGate.failures)}`,
                })}
              </p>
              <p data-testid="crel-community-gate" className={record.communityGate.passed ? 'text-success' : 'text-warning'}>
                {t('evalHarness.crel.communityGate', {
                  result: record.communityGate.passed
                    ? 'PASS'
                    : t('evalHarness.crel.communityGatePending', { failures: listFormat.format(record.communityGate.failures) }),
                })}
              </p>
            </div>
          )}
          <p className="mt-2 break-all font-mono text-[10px] text-text-muted">checkpoint {checkpoint.checkpointHash}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <button type="button" onClick={() => { void exportCheckpoint() }} className="inline-flex items-center gap-1 text-accent">
              <Download className="h-3 w-3" />{t('evalHarness.crel.exportEvidence')}
            </button>
            <button type="button" onClick={() => { void reset() }} className="inline-flex items-center gap-1 text-error">
              <RotateCcw className="h-3 w-3" />{t('evalHarness.actions.clear')}
            </button>
            {archives.length > 0 && (
              <button type="button" onClick={() => { void exportLatestArchive() }} className="inline-flex items-center gap-1 text-text-muted">
                <Download className="h-3 w-3" />{t('evalHarness.crel.exportArchive', { count: archives.length })}
              </button>
            )}
          </div>
        </div>
      )}

      {checkpoint?.status === 'completed' && record && currentReviewCase && currentFixture && (
        <div data-testid="crel-human-review" className="mt-3 rounded-md border border-border bg-bg-base p-3">
          <h5 className="text-xs font-medium text-text-primary">{t('evalHarness.crel.reviewTitle', { count: reviewedCount })}</h5>
          <p className="mt-1 text-[10px] text-text-muted">{t('evalHarness.crel.reviewDescription')}</p>
          <div className="mt-2 rounded bg-bg-elevated p-2 text-[10px] text-text-secondary">
            <p>{currentFixture.projectName} · {currentFixture.authorRequest}</p>
            <p className="mt-1">{t('evalHarness.crel.worldRulesPrefix', {
              value: currentFixture.worldRules || t('evalHarness.crel.worldRulesMissing'),
            })}</p>
            <p className="mt-1">{t('evalHarness.requiredFactsPrefix', {
              value: listFormat.format(currentFixture.requiredFacts.map(item => item.description)),
            })}</p>
          </div>
          <label className="mt-2 block text-[10px] text-text-muted">
            {t('evalHarness.crel.reviewerLabel')}
            <input
              data-testid="crel-reviewer"
              value={reviewer}
              onChange={event => setReviewer(event.target.value)}
              className="mt-1 w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary"
            />
          </label>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            <CandidateReview label="A" output={outputFor('A')} verdict={verdictA} onChange={setVerdictA} />
            <CandidateReview label="B" output={outputFor('B')} verdict={verdictB} onChange={setVerdictB} />
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-[10px] text-text-muted">
              {t('evalHarness.crel.preferenceLabel')}
              <select
                value={preferred}
                onChange={event => setPreferred(event.target.value as 'A' | 'B' | 'tie')}
                className="ml-2 rounded border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary"
              >
                <option value="A">{t('evalHarness.candidateLabel', { label: 'A' })}</option>
                <option value="B">{t('evalHarness.candidateLabel', { label: 'B' })}</option>
                <option value="tie">{t('evalHarness.tie')}</option>
              </select>
            </label>
            <button
              type="button"
              data-testid="crel-save-review"
              disabled={!reviewer.trim()}
              onClick={() => { void saveReview() }}
              className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-400 disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" />{t('evalHarness.actions.saveAndNext')}
            </button>
          </div>
        </div>
      )}

      {checkpoint?.status === 'completed' && record && !currentReviewCase && (
        <p data-testid="crel-human-complete" className="mt-3 text-[11px] text-success">
          {t('evalHarness.crel.reviewComplete')}
        </p>
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
        disabled={running}
        onClick={() => fileInputRef.current?.click()}
        className="mt-2 inline-flex items-center gap-1 text-[10px] text-text-muted disabled:opacity-40"
      >
        <Upload className="h-3 w-3" />{t('evalHarness.crel.importCheckpoint')}
      </button>
      {error && <p data-testid="crel-error" className="mt-2 text-[11px] text-error">{renderPanelError(t, error)}</p>}
    </section>
  )
}
