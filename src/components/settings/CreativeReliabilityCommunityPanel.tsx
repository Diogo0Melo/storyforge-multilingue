import { useState } from 'react'
import { Download, ExternalLink, MessageSquareText, ShieldCheck, Trash2 } from 'lucide-react'
import { downloadTextFile } from '../../lib/export/text-export'
import {
  CREATIVE_RELIABILITY_FEEDBACK_OUTCOMES_V1,
  CREATIVE_RELIABILITY_FEEDBACK_STAGES_V1,
  CREATIVE_RELIABILITY_FEEDBACK_TAGS_V1,
  clearCreativeReliabilityFeedbackV1,
  loadCreativeReliabilityFeedbackV1,
  saveCreativeReliabilityFeedbackV1,
  serializeCreativeReliabilityFeedbackV1,
  type CreativeReliabilityFeedbackOutcomeV1,
  type CreativeReliabilityFeedbackRatingV1,
  type CreativeReliabilityFeedbackStageV1,
  type CreativeReliabilityFeedbackTagV1,
} from '../../lib/feedback/creative-reliability'
import { useDialog } from '../shared/Dialog'
import { useDomainT } from '../../i18n'

const STAGE_KEYS = {
  'story-arc': 'creativeReliabilityCommunity.stages.storyArc',
  outline: 'creativeReliabilityCommunity.stages.outline',
  'detailed-outline': 'creativeReliabilityCommunity.stages.detailedOutline',
  prose: 'creativeReliabilityCommunity.stages.prose',
  'long-form': 'creativeReliabilityCommunity.stages.longForm',
} as const satisfies Record<CreativeReliabilityFeedbackStageV1, string>

const OUTCOME_KEYS = {
  kept: 'creativeReliabilityCommunity.outcomes.kept',
  edited: 'creativeReliabilityCommunity.outcomes.edited',
  discarded: 'creativeReliabilityCommunity.outcomes.discarded',
} as const satisfies Record<CreativeReliabilityFeedbackOutcomeV1, string>

const TAG_KEYS = {
  irrelevant: 'creativeReliabilityCommunity.tags.irrelevant',
  stalled: 'creativeReliabilityCommunity.tags.stalled',
  infodump: 'creativeReliabilityCommunity.tags.infodump',
  structure: 'creativeReliabilityCommunity.tags.structure',
  continuity: 'creativeReliabilityCommunity.tags.continuity',
  cost: 'creativeReliabilityCommunity.tags.cost',
  latency: 'creativeReliabilityCommunity.tags.latency',
  other: 'creativeReliabilityCommunity.tags.other',
} as const satisfies Record<CreativeReliabilityFeedbackTagV1, string>

export default function CreativeReliabilityCommunityPanel() {
  const dialog = useDialog()
  const { t } = useDomainT('settings')
  const [stage, setStage] = useState<CreativeReliabilityFeedbackStageV1>('story-arc')
  const [outcome, setOutcome] = useState<CreativeReliabilityFeedbackOutcomeV1>('edited')
  const [rating, setRating] = useState<CreativeReliabilityFeedbackRatingV1>(3)
  const [editMinutes, setEditMinutes] = useState(15)
  const [tags, setTags] = useState<CreativeReliabilityFeedbackTagV1[]>([])
  const [recordCount, setRecordCount] = useState(() => loadCreativeReliabilityFeedbackV1().length)
  const [message, setMessage] = useState('')

  const toggleTag = (tag: CreativeReliabilityFeedbackTagV1, checked: boolean) => {
    setTags(current => checked
      ? [...current.filter(item => item !== tag), tag]
      : current.filter(item => item !== tag))
  }

  const handleSave = () => {
    try {
      const bundle = saveCreativeReliabilityFeedbackV1({
        stage,
        outcome,
        rating,
        editMinutes: Math.max(0, Math.min(10_080, Math.round(editMinutes) || 0)),
        tags,
      })
      setRecordCount(bundle.records.length)
      setMessage(t('creativeReliabilityCommunity.messages.saved'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('creativeReliabilityCommunity.messages.saveError'))
    }
  }

  const handleExport = () => {
    downloadTextFile(
      serializeCreativeReliabilityFeedbackV1(),
      `storyforge-creative-feedback-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json',
    )
    setMessage(t('creativeReliabilityCommunity.messages.exported'))
  }

  const handleClear = async () => {
    const confirmed = await dialog.confirm({
      title: t('creativeReliabilityCommunity.messages.clearTitle'),
      message: t('creativeReliabilityCommunity.messages.clearMessage', { count: recordCount }),
      confirmText: t('creativeReliabilityCommunity.messages.clearConfirm'),
      cancelText: t('creativeReliabilityCommunity.messages.clearCancel'),
      tone: 'danger',
    })
    if (!confirmed) return
    clearCreativeReliabilityFeedbackV1()
    setRecordCount(0)
    setMessage(t('creativeReliabilityCommunity.messages.cleared'))
  }

  return (
    <section
      className="mt-6 max-w-2xl rounded-xl border border-border bg-bg-surface p-4"
      data-testid="creative-reliability-community"
    >
      <div className="flex items-start gap-2">
        <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{t('creativeReliabilityCommunity.title')}</h3>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            {t('creativeReliabilityCommunity.description')}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-border bg-bg-base p-3 text-[11px] leading-5 text-text-muted">
        <p className="font-medium text-text-secondary">{t('creativeReliabilityCommunity.usageTitle')}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>{t('creativeReliabilityCommunity.usage.limits')}</li>
          <li>{t('creativeReliabilityCommunity.usage.costs')}</li>
          <li>{t('creativeReliabilityCommunity.usage.validation')}</li>
          <li>{t('creativeReliabilityCommunity.usage.rollback')}</li>
        </ul>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-text-secondary">
          {t('creativeReliabilityCommunity.stageLabel')}
          <select
            value={stage}
            onChange={event => setStage(event.target.value as CreativeReliabilityFeedbackStageV1)}
            aria-label={t('creativeReliabilityCommunity.stageAria')}
            className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-1.5 text-xs text-text-primary"
          >
            {CREATIVE_RELIABILITY_FEEDBACK_STAGES_V1.map(value => (
              <option key={value} value={value}>{t(STAGE_KEYS[value])}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-text-secondary">
          {t('creativeReliabilityCommunity.outcomeLabel')}
          <select
            value={outcome}
            onChange={event => setOutcome(event.target.value as CreativeReliabilityFeedbackOutcomeV1)}
            aria-label={t('creativeReliabilityCommunity.outcomeAria')}
            className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-1.5 text-xs text-text-primary"
          >
            {CREATIVE_RELIABILITY_FEEDBACK_OUTCOMES_V1.map(value => (
              <option key={value} value={value}>{t(OUTCOME_KEYS[value])}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-text-secondary">
          {t('creativeReliabilityCommunity.ratingLabel')}
          <select
            value={rating}
            onChange={event => setRating(Number(event.target.value) as CreativeReliabilityFeedbackRatingV1)}
            aria-label={t('creativeReliabilityCommunity.ratingAria')}
            className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-1.5 text-xs text-text-primary"
          >
            {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-xs text-text-secondary">
          {t('creativeReliabilityCommunity.editMinutesLabel')}
          <input
            type="number"
            min={0}
            max={10_080}
            value={editMinutes}
            onChange={event => setEditMinutes(Number(event.target.value))}
            aria-label={t('creativeReliabilityCommunity.editMinutesAria')}
            className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-1.5 text-xs text-text-primary"
          />
        </label>
      </div>

      <fieldset className="mt-3">
        <legend className="text-xs text-text-secondary">{t('creativeReliabilityCommunity.tagsLegend')}</legend>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5">
          {CREATIVE_RELIABILITY_FEEDBACK_TAGS_V1.map(tag => (
            <label key={tag} className="flex items-center gap-1.5 text-[11px] text-text-muted">
              <input
                type="checkbox"
                checked={tags.includes(tag)}
                onChange={event => toggleTag(tag, event.target.checked)}
                aria-label={t('creativeReliabilityCommunity.tagAria', { tag: t(TAG_KEYS[tag]) })}
              />
              {t(TAG_KEYS[tag])}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          {t('creativeReliabilityCommunity.save')}
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={recordCount === 0}
          className="flex items-center gap-1.5 rounded-lg bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" /> {t('creativeReliabilityCommunity.export', { count: recordCount })}
        </button>
        <button
          type="button"
          onClick={() => { void handleClear() }}
          disabled={recordCount === 0}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-text-muted hover:text-red-400 disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" /> {t('creativeReliabilityCommunity.clear')}
        </button>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
        <p className="text-[11px] leading-5 text-text-muted">
          {t('creativeReliabilityCommunity.privacyBeforeLink')}
          <a
            href="https://github.com/yuanbw2025/storyforge/issues/new"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-accent hover:underline"
          >
            GitHub Issues <ExternalLink className="h-3 w-3" />
          </a>{' '}
          {t('creativeReliabilityCommunity.privacyAfterLink')}
        </p>
      </div>
      {message && <p role="status" className="mt-2 text-[11px] text-emerald-400">{message}</p>}
    </section>
  )
}
