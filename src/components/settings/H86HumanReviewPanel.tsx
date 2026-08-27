import { useEffect, useMemo, useState } from 'react'
import { Download, Save, ShieldCheck, Trash2 } from 'lucide-react'
import {
  clearH86HumanReviewV1,
  createH86HumanReviewV1,
  exportH86HumanReviewV1,
  h86CheckpointHasCompletePairedOutputsV1,
  loadH86HumanReviewV1,
  persistH86HumanReviewV1,
  updateH86HumanReviewItemV1,
  type H86HumanCandidateReviewV1,
  type H86HumanReviewItemV1,
  type H86HumanReviewRecordV1,
} from '../../lib/evals/agent-harness/story-arc-human-review'
import type { H86CheckpointV1 } from '../../lib/evals/agent-harness/story-arc-main-path'
import { H86_STORY_ARC_DEVELOPMENT_FIXTURES_V1 } from '../../lib/evals/agent-harness/story-arc-main-path-fixtures'
import { useDomainT } from '../../i18n'
import { useDialog } from '../shared/Dialog'

/**
 * Reactive localized error: stores the i18n key + params so the visible
 * message re-translates on locale switch. Raw engine/provider errors stay raw.
 */
interface LocalizedMessage { key: string; params?: Record<string, unknown> }
type PanelError = LocalizedMessage | { raw: string } | null

function toPanelError(cause: unknown): PanelError {
  return { raw: cause instanceof Error ? cause.message : String(cause) }
}

function renderPanelError(t: (key: string, opts?: Record<string, unknown>) => string, error: PanelError): string {
  if (!error) return ''
  return 'raw' in error ? error.raw : t(error.key, error.params)
}

type ScoreField = 'constraintFaithfulness' | 'causalCoherence' | 'specificity' | 'authorUsability'

const SCORE_FIELDS: ScoreField[] = [
  'constraintFaithfulness',
  'causalCoherence',
  'specificity',
  'authorUsability',
]

function downloadJson(raw: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function initialReview(output: string, review: H86HumanCandidateReviewV1 | null): H86HumanCandidateReviewV1 {
  return review ?? {
    constraintFaithfulness: 3,
    causalCoherence: 3,
    specificity: 3,
    authorUsability: 3,
    editedOutput: output,
    notes: '',
  }
}

function reviewed(item: H86HumanReviewItemV1): boolean {
  return item.reviewA != null && item.reviewB != null && item.preference != null
}

function CandidateEditor(props: {
  label: 'A' | 'B'
  output: string
  value: H86HumanCandidateReviewV1
  onChange: (value: H86HumanCandidateReviewV1) => void
}) {
  const { t } = useDomainT('settings')
  return (
    <div className="rounded-md border border-border bg-bg-base p-2">
      <h6 className="text-xs font-medium text-text-primary">{t('evalHarness.candidateLabel', { label: props.label })}</h6>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-bg-elevated p-2 text-[10px] text-text-secondary">
        {props.output}
      </pre>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {SCORE_FIELDS.map(field => {
          const fieldLabel = t(`evalHarness.h86Review.score.${field}`)
          return (
            <label key={field} className="text-[10px] text-text-muted">
              {fieldLabel}
              <select
                aria-label={t('evalHarness.h86Review.scoreAria', { candidate: props.label, field: fieldLabel })}
                value={props.value[field]}
                onChange={event => props.onChange({ ...props.value, [field]: Number(event.target.value) })}
                className="mt-1 w-full rounded border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary"
              >
                {[1, 2, 3, 4, 5].map(score => <option key={score} value={score}>{score}</option>)}
              </select>
            </label>
          )
        })}
      </div>
      <label className="mt-2 block text-[10px] text-text-muted">
        {t('evalHarness.h86Review.editedOutputLabel')}
        <textarea
          aria-label={t('evalHarness.h86Review.editedOutputAria', { candidate: props.label })}
          value={props.value.editedOutput}
          onChange={event => props.onChange({ ...props.value, editedOutput: event.target.value })}
          className="mt-1 h-36 w-full resize-y rounded border border-border bg-bg-elevated p-2 font-mono text-[10px] text-text-secondary"
        />
      </label>
      <label className="mt-2 block text-[10px] text-text-muted">
        {t('evalHarness.h86Review.notesLabel')}
        <textarea
          aria-label={t('evalHarness.h86Review.notesAria', { candidate: props.label })}
          value={props.value.notes}
          maxLength={2_000}
          onChange={event => props.onChange({ ...props.value, notes: event.target.value })}
          className="mt-1 h-16 w-full resize-y rounded border border-border bg-bg-elevated p-2 text-[10px] text-text-secondary"
        />
      </label>
    </div>
  )
}

export default function H86HumanReviewPanel({ checkpoint }: { checkpoint: H86CheckpointV1 | null }) {
  const { t, lang } = useDomainT('settings')
  const listFormat = useMemo(() => new Intl.ListFormat(lang, { type: 'conjunction', style: 'short' }), [lang])
  const dialog = useDialog()
  const [record, setRecord] = useState<H86HumanReviewRecordV1 | null>(null)
  const [reviewer, setReviewer] = useState('')
  const [reviewA, setReviewA] = useState<H86HumanCandidateReviewV1>(() => initialReview('', null))
  const [reviewB, setReviewB] = useState<H86HumanCandidateReviewV1>(() => initialReview('', null))
  const [preference, setPreference] = useState<'A' | 'B' | 'tie'>('tie')
  const [error, setError] = useState<PanelError>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    if (checkpoint?.status !== 'completed') {
      setRecord(null)
      return () => { active = false }
    }
    void loadH86HumanReviewV1().then(value => {
      if (!active || !value) return
      if (value.checkpointHash !== checkpoint.checkpointHash) {
        setError({ key: 'evalHarness.h86Review.checkpointMismatch' })
        return
      }
      setRecord(value)
      setReviewer(value.reviewer)
    }).catch(cause => {
      if (active) setError(toPanelError(cause))
    })
    return () => { active = false }
  }, [checkpoint?.checkpointHash, checkpoint?.status])

  const currentItem = useMemo(() => record?.items.find(item => !reviewed(item)) ?? null, [record])
  const fixture = currentItem
    ? H86_STORY_ARC_DEVELOPMENT_FIXTURES_V1.find(item => item.id === currentItem.fixtureId) ?? null
    : null
  const reviewedCount = record?.items.filter(reviewed).length ?? 0
  const canStartReview = checkpoint != null && h86CheckpointHasCompletePairedOutputsV1(checkpoint)

  useEffect(() => {
    if (!currentItem) return
    setReviewA(initialReview(currentItem.candidateA, currentItem.reviewA))
    setReviewB(initialReview(currentItem.candidateB, currentItem.reviewB))
    setPreference(currentItem.preference ?? 'tie')
  }, [currentItem])

  const start = async () => {
    if (!checkpoint || checkpoint.status !== 'completed') return
    setSaving(true)
    setError(null)
    try {
      const next = await createH86HumanReviewV1({ checkpoint, reviewer })
      await persistH86HumanReviewV1(next)
      setRecord(next)
    } catch (cause) {
      setError(toPanelError(cause))
    } finally {
      setSaving(false)
    }
  }

  const saveCurrent = async () => {
    if (!record || !currentItem) return
    setSaving(true)
    setError(null)
    try {
      const next = await updateH86HumanReviewItemV1({
        record,
        fixtureId: currentItem.fixtureId,
        reviewA,
        reviewB,
        preference,
      })
      await persistH86HumanReviewV1(next)
      setRecord(next)
    } catch (cause) {
      setError(toPanelError(cause))
    } finally {
      setSaving(false)
    }
  }

  const clearReview = async () => {
    const confirmed = await dialog.confirm({
      title: t('evalHarness.h86Review.clearConfirmTitle'),
      message: t('evalHarness.h86Review.clearConfirmMessage'),
      confirmText: t('evalHarness.actions.clear'),
      cancelText: t('evalHarness.actions.keep'),
      tone: 'danger',
    })
    if (!confirmed) return
    clearH86HumanReviewV1()
    setRecord(null)
    setReviewer('')
    setError(null)
  }

  const exportReview = async () => {
    if (!record || record.status !== 'completed') return
    try {
      downloadJson(
        await exportH86HumanReviewV1(record),
        `storyforge-h86-human-review-${record.checkpointHash.slice(0, 12)}.json`,
      )
    } catch (cause) {
      setError(toPanelError(cause))
    }
  }

  if (checkpoint?.status !== 'completed') return null

  return (
    <div data-testid="h86-human-review" className="mt-3 rounded-md border border-border bg-bg-base p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h5 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" />{t('evalHarness.h86Review.title')}
          </h5>
          <p className="mt-1 text-[10px] text-text-muted">
            {t('evalHarness.h86Review.description')}
          </p>
        </div>
        {record && (
          <span data-testid="h86-human-progress" className="text-[10px] text-text-muted">
            {record.status === 'completed' ? t('evalHarness.status.completed') : `${reviewedCount}/6`}
          </span>
        )}
      </div>

      {!record && !canStartReview && (
        <p data-testid="h86-human-unavailable" className="mt-3 text-[11px] text-warning">
          {t('evalHarness.h86Review.unavailable')}
        </p>
      )}

      {!record && canStartReview && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-56 flex-1 text-[10px] text-text-muted">
            {t('evalHarness.h86Review.reviewerLabel')}
            <input
              data-testid="h86-reviewer"
              value={reviewer}
              maxLength={80}
              onChange={event => setReviewer(event.target.value)}
              placeholder={t('evalHarness.h86Review.reviewerPlaceholder')}
              className="mt-1 w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary"
            />
          </label>
          <button
            type="button"
            data-testid="h86-start-human-review"
            disabled={saving || !reviewer.trim() || Boolean(error)}
            onClick={() => { void start() }}
            className="rounded bg-accent/10 px-2.5 py-1.5 text-xs text-accent disabled:opacity-40"
          >
            {t('evalHarness.h86Review.start')}
          </button>
          {error && (
            <button type="button" onClick={() => { void clearReview() }} className="inline-flex items-center gap-1 text-[10px] text-error">
              <Trash2 className="h-3 w-3" />{t('evalHarness.h86Review.clearOld')}
            </button>
          )}
        </div>
      )}

      {record?.status === 'running' && currentItem && fixture && (
        <div className="mt-3" data-testid="h86-human-current-case">
          <div className="rounded-md bg-bg-elevated p-2 text-[10px] text-text-secondary">
            <p className="font-medium text-text-primary">{fixture.projectName} · {fixture.id}</p>
            <p className="mt-1">{t('evalHarness.h86Review.authorRequest', { value: fixture.authorRequest })}</p>
            <p className="mt-1">{t('evalHarness.h86Review.worldRules', { value: fixture.worldRules })}</p>
            <p className="mt-1">{t('evalHarness.requiredFactsPrefix', {
              value: listFormat.format(fixture.requiredFacts.map(item => item.description)),
            })}</p>
            <p className="mt-1">{t('evalHarness.h86Review.forbiddenFacts', {
              value: listFormat.format(fixture.forbiddenFacts),
            })}</p>
          </div>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            <CandidateEditor label="A" output={currentItem.candidateA} value={reviewA} onChange={setReviewA} />
            <CandidateEditor label="B" output={currentItem.candidateB} value={reviewB} onChange={setReviewB} />
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-[10px] text-text-muted">
              {t('evalHarness.h86Review.casePreference')}
              <select
                aria-label={t('evalHarness.h86Review.casePreference')}
                value={preference}
                onChange={event => setPreference(event.target.value as 'A' | 'B' | 'tie')}
                className="ml-2 rounded border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary"
              >
                <option value="A">{t('evalHarness.candidateLabel', { label: 'A' })}</option>
                <option value="B">{t('evalHarness.candidateLabel', { label: 'B' })}</option>
                <option value="tie">{t('evalHarness.tie')}</option>
              </select>
            </label>
            <button
              type="button"
              data-testid="h86-save-human-case"
              disabled={saving || !reviewA.editedOutput.trim() || !reviewB.editedOutput.trim()}
              onClick={() => { void saveCurrent() }}
              className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-400 disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" />{t('evalHarness.actions.saveAndNext')}
            </button>
          </div>
        </div>
      )}

      {record?.status === 'completed' && record.aggregate && record.gate && (
        <div className="mt-3" data-testid="h86-human-result">
          <p className={record.gate.passed ? 'text-[11px] text-success' : 'text-[11px] text-error'}>
            {t('evalHarness.h86Review.humanGate', {
              result: record.gate.passed ? 'PASS' : `FAIL · ${listFormat.format(record.gate.failures)}`,
            })}
            {' '}· {t('evalHarness.h86Review.humanGateNote')}
          </p>
          <div className="mt-2 overflow-x-auto text-[10px] text-text-secondary">
            <table className="w-full text-left">
              <thead className="text-text-muted"><tr><th>{t('evalHarness.h86Review.colPath')}</th><th>{t('evalHarness.h86Review.colAverageScore')}</th><th>{t('evalHarness.h86Review.colEditRatio')}</th><th>{t('evalHarness.h86Review.colPreference')}</th></tr></thead>
              <tbody>
                <tr className="border-t border-border/50">
                  <td>{t('evalHarness.legacyDirect')}</td>
                  <td>{record.aggregate.legacyDirect.averageScore.toFixed(2)}</td>
                  <td>{(record.aggregate.legacyDirect.averageLineEditRatio * 100).toFixed(1)}%</td>
                  <td>{record.aggregate.legacyDirect.preferredCount}</td>
                </tr>
                <tr className="border-t border-border/50">
                  <td>Agent/Harness</td>
                  <td>{record.aggregate.agentHarness.averageScore.toFixed(2)}</td>
                  <td>{(record.aggregate.agentHarness.averageLineEditRatio * 100).toFixed(1)}%</td>
                  <td>{record.aggregate.agentHarness.preferredCount}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            <button type="button" onClick={() => { void exportReview() }} className="inline-flex items-center gap-1 text-[10px] text-accent">
              <Download className="h-3 w-3" />{t('evalHarness.h86Review.exportEvidence')}
            </button>
            <button type="button" onClick={() => { void clearReview() }} className="inline-flex items-center gap-1 text-[10px] text-error">
              <Trash2 className="h-3 w-3" />{t('evalHarness.h86Review.clearReview')}
            </button>
          </div>
        </div>
      )}

      {error && <p data-testid="h86-human-error" className="mt-2 text-[11px] text-error">{renderPanelError(t, error)}</p>}
    </div>
  )
}
