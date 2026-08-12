import { useState } from 'react'
import { chat } from '../../lib/ai/client'
import { getFixtures } from '../../lib/evals/long-consistency/fixtures'
import {
  evaluateNs1Gate,
  NS0_PAIRED_RESULTS_STORAGE_KEY,
  NS0_RESULTS_STORAGE_KEY,
  runPairedEvalInBrowser,
  runEvalInBrowser,
} from '../../lib/evals/long-consistency/runner'
import type { EvalRunRecord } from '../../lib/evals/long-consistency/types'
import {
  buildSemanticJudgeMessages,
  parseSemanticJudgeVerdict,
  scoreWithSemanticVerdict,
} from '../../lib/evals/long-consistency/semantic-judge'
import { isAIConfigReady } from '../../lib/ai/config-readiness'
import { useAIConfigStore } from '../../stores/ai-config'
import { useDomainT, getT } from '../../i18n'

function readStoredRecord(): EvalRunRecord | null {
  try {
    const raw = localStorage.getItem(NS0_RESULTS_STORAGE_KEY)
    return raw ? JSON.parse(raw) as EvalRunRecord : null
  } catch {
    return null
  }
}

function readPairedRecords(): EvalRunRecord[] {
  try {
    const raw = localStorage.getItem(NS0_PAIRED_RESULTS_STORAGE_KEY)
    return raw ? JSON.parse(raw) as EvalRunRecord[] : []
  } catch {
    return []
  }
}

async function evalChatWithRetry(
  messages: import('../../lib/types').ChatMessage[],
  config: import('../../lib/types').AIConfig,
  category: string,
) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController()
    // agnes 免费版单次生成常 >45s；评测是离线跑分、不需要快，放宽到 180s 避免被超时掐断整轮 A/B。
    const timeout = setTimeout(() => controller.abort(), 180_000)
    try {
      const result: import('../../lib/ai/client').ChatResult = {}
      const output = await chat(
        messages,
        config,
        { category: category },
        controller.signal,
        result,
      )
      return { output, usage: result.usage }
    } catch (error) {
      lastError = error
      const status = typeof error === 'object' && error && 'status' in error
        ? Number((error as { status?: unknown }).status)
        : 0
      const retryable = status >= 500 || status === 429 || status === 0
      if (!retryable || attempt === 2) throw error
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1500))
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError
}

async function judgeEvalOutput(
  fixture: import('../../lib/evals/long-consistency/types').LongConsistencyFixture,
  output: string,
  config: import('../../lib/types').AIConfig,
) {
  const messages = buildSemanticJudgeMessages(fixture, output)
  const response = await evalChatWithRetry(
    messages,
    { ...config, temperature: 0, maxTokens: 600 },
    'eval.ns1.judge',
  )
  const verdict = parseSemanticJudgeVerdict(fixture, response.output)
  if (!verdict) {
    const t = getT() as (key: string, opts?: Record<string, unknown>) => string
    throw new Error(t('settings:ns0Eval.judgeParseError', { id: fixture.id }))
  }
  return scoreWithSemanticVerdict(fixture, output, verdict)
}

export default function NS0EvalPanel() {
  const { t } = useDomainT('settings')
  const config = useAIConfigStore(state => state.config)
  const [record, setRecord] = useState<EvalRunRecord | null>(() => readStoredRecord())
  const [pairedRecords, setPairedRecords] = useState<EvalRunRecord[]>(() => readPairedRecords())
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)

  const run = async () => {
    setRunning(true)
    setError('')
    try {
      const fixtures = getFixtures('development')
      setProgress(`0/${fixtures.length}`)
      const next = await runEvalInBrowser({
        fixtures,
        split: 'development',
        variant: 'legacy-500-tail',
        budgetMode: 'fixed',
        config,
        call: (messages, fixedConfig) => evalChatWithRetry(messages, fixedConfig, 'eval.ns0'),
        onProgress: (completed, total) => setProgress(`${completed}/${total}`),
      })
      setRecord(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRunning(false)
    }
  }

  const runPaired = async () => {
    setRunning(true)
    setError('')
      setProgress(t('ns0Eval.progressPaired', { completed: 0, total: 4 }))
    try {
      const fixtures = getFixtures('held-out')
      const records = await runPairedEvalInBrowser({
        fixtures,
        split: 'held-out',
        variants: ['legacy-500-tail', 'handoff-tail-summary'],
        config,
        call: (messages, runConfig) => evalChatWithRetry(messages, runConfig, 'eval.ns1'),
        judge: judgeEvalOutput,
        onRunComplete: (_completedRecord, completed, total) => setProgress(t('ns0Eval.progressPaired', { completed, total })),
        onCaseProgress: (completedRuns, totalRuns, completedCases, totalCases) => {
          setProgress(t('ns0Eval.progressCase', { completedRuns: completedRuns + 1, totalRuns, completedCases, totalCases }))
        },
      })
      setPairedRecords(records)
      setRecord(records.length ? records[records.length - 1] : null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRunning(false)
    }
  }

  const aggregate = record?.aggregate
  const fixedLegacy = pairedRecords.find(item => item.budgetMode === 'fixed' && item.variant === 'legacy-500-tail')
  const fixedCandidate = pairedRecords.find(item => item.budgetMode === 'fixed' && item.variant === 'handoff-tail-summary')
  const naturalLegacy = pairedRecords.find(item => item.budgetMode === 'natural' && item.variant === 'legacy-500-tail')
  const naturalCandidate = pairedRecords.find(item => item.budgetMode === 'natural' && item.variant === 'handoff-tail-summary')
  const fixedGate = fixedLegacy && fixedCandidate ? evaluateNs1Gate(fixedLegacy, fixedCandidate) : null
  const naturalGate = naturalLegacy && naturalCandidate
    ? evaluateNs1Gate(naturalLegacy, naturalCandidate, { requireFactImprovement: false })
    : null
  const finalHeldOutAlreadyRun = pairedRecords.some(item => item.split === 'held-out')

  return (
    <div data-testid="ns0-eval-panel" className="max-w-2xl mt-6 p-4 bg-bg-surface border border-border rounded-xl">
      <h3 className="text-sm font-semibold text-text-primary">{t('ns0Eval.title')}</h3>
      <p className="mt-1 text-xs text-text-muted">
        {t('ns0Eval.description')}
      </p>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => { void run() }}
          disabled={running || !isAIConfigReady(config)}
          className="px-3 py-1.5 text-sm rounded-lg bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40"
        >
          {running ? t('ns0Eval.running', { progress }) : t('ns0Eval.runDevelopment')}
        </button>
        <button
          onClick={() => { void runPaired() }}
          disabled={running || !isAIConfigReady(config) || finalHeldOutAlreadyRun}
          className="px-3 py-1.5 text-sm rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40"
        >
          {finalHeldOutAlreadyRun ? t('ns0Eval.ns1FinalLocked') : t('ns0Eval.ns1PairedAB')}
        </button>
        {record && <span className="text-xs text-text-muted">{record.model} · {record.createdAt}</span>}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {aggregate && (
        <div data-testid="ns0-eval-result" className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-secondary">
          <span>{t('ns0Eval.factRecall', { value: (aggregate.requiredFactRecall * 100).toFixed(1) })}</span>
          <span>{t('ns0Eval.constraintRecall', { value: (aggregate.constraintRecall * 100).toFixed(1) })}</span>
          <span>{t('ns0Eval.futureLeakage', { value: (aggregate.futureLeakageRate * 100).toFixed(1) })}</span>
          <span>{t('ns0Eval.wrongWorldLeakage', { value: (aggregate.wrongWorldLeakageRate * 100).toFixed(1) })}</span>
          <span>{t('ns0Eval.estimatedInput', { value: aggregate.estimatedInputTokens })}</span>
          <span>{t('ns0Eval.estimatedOutput', { value: aggregate.estimatedOutputTokens })}</span>
        </div>
      )}
      {pairedRecords.length > 0 && (
        <div data-testid="ns1-paired-eval-result" className="mt-3 overflow-x-auto">
          <table className="w-full text-[11px] text-text-secondary">
            <thead>
              <tr className="text-left text-text-muted">
                <th>{t('ns0Eval.tableBudget')}</th><th>{t('ns0Eval.tableVariant')}</th><th>{t('ns0Eval.tableFact')}</th><th>{t('ns0Eval.tableConstraint')}</th><th>{t('ns0Eval.tableFuture')}</th><th>{t('ns0Eval.tableWrongWorld')}</th><th>{t('ns0Eval.tableInOut')}</th>
              </tr>
            </thead>
            <tbody>
              {pairedRecords.map(item => (
                <tr key={`${item.budgetMode}:${item.variant}`} className="border-t border-border/50">
                  <td>{item.budgetMode}</td>
                  <td>{item.variant}</td>
                  <td>{(item.aggregate.requiredFactRecall * 100).toFixed(1)}%</td>
                  <td>{(item.aggregate.constraintRecall * 100).toFixed(1)}%</td>
                  <td>{(item.aggregate.futureLeakageRate * 100).toFixed(1)}%</td>
                  <td>{(item.aggregate.wrongWorldLeakageRate * 100).toFixed(1)}%</td>
                  <td>{item.aggregate.estimatedInputTokens}/{item.aggregate.estimatedOutputTokens}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(fixedGate || naturalGate) && (
            <div className="mt-2 space-y-1 text-[11px]">
              {fixedGate && (
                <p className={fixedGate.passed ? 'text-success' : 'text-error'}>
                  {t('ns0Eval.fixedGate', { result: fixedGate.passed ? 'PASS' : `FAIL · ${fixedGate.failures.join(', ')}` })}
                </p>
              )}
              {naturalGate && (
                <p className={naturalGate.passed ? 'text-success' : 'text-error'}>
                  {t('ns0Eval.naturalGate', { result: naturalGate.passed ? 'PASS' : `FAIL · ${naturalGate.failures.join(', ')}` })}
                </p>
              )}
            </div>
          )}
          <div className="mt-2 space-y-1">
            {pairedRecords.filter(item => item.split === 'development').map(item => (
              <details key={`details:${item.budgetMode}:${item.variant}`} className="text-[11px] text-text-muted">
                <summary>{t('ns0Eval.perCaseSummary', { budgetMode: item.budgetMode, variant: item.variant })}</summary>
                {item.results.map(result => (
                  <div key={result.fixtureId} className="mt-1 border-l border-border pl-2">
                    <p>
                      {t('ns0Eval.caseScore', {
                        fixtureId: result.fixtureId,
                        fact: (result.score.requiredFactRecall * 100).toFixed(0),
                        constraint: (result.score.constraintRecall * 100).toFixed(0),
                      })}
                    </p>
                    <p>{t('ns0Eval.matchedConstraints', { list: result.score.matchedConstraints.join(', ') || t('ns0Eval.matchedConstraintsEmpty') })}</p>
                    <p className="whitespace-pre-wrap text-text-secondary">{result.output.slice(0, 500)}</p>
                  </div>
                ))}
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
