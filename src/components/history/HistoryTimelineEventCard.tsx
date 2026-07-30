import { useTranslation } from 'react-i18next'
import { Trans } from 'react-i18next'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Chapter, HistoricalEra, HistoricalTimelineEvent } from '../../lib/types'
import { HISTORICAL_ERA_LABELS } from '../../lib/types/history'
import { formatHistoricalYear } from '../../lib/history/year'
import { CInput, CTextarea } from '../shared/CompositionInput'
import HistoryAgentWorkspace, { type HistoryAgentViewState } from './HistoryAgentWorkspace'
import HistoryChapterPicker from './HistoryChapterPicker'

interface Props {
  event: HistoricalTimelineEvent
  chapters: Chapter[]
  expanded: boolean
  canEdit: boolean
  worldBadge?: { icon: string; name: string }
  consultActive: boolean
  stormActive: boolean
  consultPreparing: boolean
  stormPreparing: boolean
  consultAI: HistoryAgentViewState
  stormAI: HistoryAgentViewState
  onToggle: () => void
  onChange: (patch: Partial<HistoricalTimelineEvent>) => void
  onConsult: () => void
  onStorm: () => void
  onDelete: () => void
  onAcceptConsult: (text: string) => void
  onAcceptStorm: (text: string) => void
}

export default function HistoryTimelineEventCard({
  event,
  chapters,
  expanded,
  canEdit,
  worldBadge,
  consultActive,
  stormActive,
  consultPreparing,
  stormPreparing,
  consultAI,
  stormAI,
  onToggle,
  onChange,
  onConsult,
  onStorm,
  onDelete,
  onAcceptConsult,
  onAcceptStorm,
}: Props) {
  const { t } = useTranslation('panels')
  const eraLabel = HISTORICAL_ERA_LABELS[event.era as HistoricalEra] || event.era
  const yearText = formatHistoricalYear(event.year)

  return (
    <div className="relative">
      <span className={`absolute -left-[31px] top-3.5 w-2.5 h-2.5 rounded-full border-2 bg-bg-base transition-colors ${
        event.isHistorical
          ? 'border-blue-500 ring-4 ring-blue-500/10'
          : 'border-purple-500 ring-4 ring-purple-500/10'
      }`} />

      <div className={`rounded-xl border bg-bg-surface transition-all ${
        expanded
          ? 'border-accent/40 shadow-sm'
          : 'border-border hover:border-border-hover'
      }`}>
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-start gap-3 px-4 py-3.5 text-left"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs font-mono font-semibold text-text-secondary">
                {event.date} ({yearText})
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">
                {eraLabel}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                event.isHistorical
                  ? 'border-blue-500/20 text-blue-400 bg-blue-500/5'
                  : 'border-purple-500/20 text-purple-400 bg-purple-500/5'
              }`}>
                {event.isHistorical ? t('history.historicalAnchor') : t('history.fictionalLabel')}
              </span>
              {event.isHistorical && (
                <span className="text-[10px] text-amber-400/70" title={t('history.aiCannotViolateTitle')}>
                  {t('history.aiCannotViolate')}
                </span>
              )}
              {worldBadge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                  {worldBadge.icon}{worldBadge.name}
                </span>
              )}
            </div>
            <h4 className="text-sm font-medium text-text-primary truncate">{event.title}</h4>
            {!expanded && event.description && (
              <p className="text-xs text-text-muted line-clamp-1 mt-1">{event.description}</p>
            )}
          </div>
          {expanded
            ? <ChevronDown className="w-4 h-4 text-text-muted shrink-0 mt-1" />
            : <ChevronRight className="w-4 h-4 text-text-muted shrink-0 mt-1" />}
        </button>

        {expanded && (
          <div className="px-4 pb-4 border-t border-border/50 pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-text-muted mb-1">{t('history.eventName')}</label>
                <CInput
                  value={event.title}
                  onChange={change => onChange({ title: change.target.value })}
                  className="w-full px-2.5 py-1.5 bg-bg-base border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-[11px] text-text-muted mb-1">{t('history.historicalEra')}</label>
                <select
                  aria-label={t('history.historicalEraAriaLabel')}
                  value={event.era}
                  onChange={change => onChange({ era: change.target.value as HistoricalEra })}
                  className="w-full px-2 py-1.5 bg-bg-base border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent"
                >
                  {Object.entries(HISTORICAL_ERA_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-text-muted mb-1">{t('history.digitalYear')}</label>
                <input
                  aria-label={t('history.digitalYearAriaLabel')}
                  type="number"
                  value={event.year}
                  onChange={change => onChange({ year: parseInt(change.target.value) || 0 })}
                  placeholder={t('history.digitalYearPlaceholder')}
                  className="w-full px-2.5 py-1.5 bg-bg-base border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-text-muted mb-1">{t('history.timeDescription')}</label>
                <CInput
                  value={event.date}
                  onChange={change => onChange({ date: change.target.value })}
                  placeholder={t('history.timeDescriptionPlaceholder')}
                  className="w-full px-2.5 py-1.5 bg-bg-base border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-[11px] text-text-muted mb-1">{t('history.customTimeRange')}</label>
                <CInput
                  value={event.customTimeRange || ''}
                  onChange={change => onChange({ customTimeRange: change.target.value })}
                  placeholder={t('history.customTimeRangePlaceholder')}
                  className="w-full px-2.5 py-1.5 bg-bg-base border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-[11px] text-text-muted mb-1">{t('history.location')}</label>
                <CInput
                  value={event.location || ''}
                  onChange={change => onChange({ location: change.target.value })}
                  placeholder={t('history.locationPlaceholder')}
                  className="w-full px-2.5 py-1.5 bg-bg-base border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-text-muted mb-1">{t('history.eventAttribute')}</label>
                <div className="flex gap-2 h-[30px] items-center">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      checked={event.isHistorical}
                      onChange={() => onChange({ isHistorical: true })}
                      className="accent-blue-500"
                    />
                    <span className="text-text-secondary">{t('history.realHistory')}</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      checked={!event.isHistorical}
                      onChange={() => onChange({ isHistorical: false })}
                      className="accent-purple-500"
                    />
                    <span className="text-text-secondary">{t('history.fictional')}</span>
                  </label>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] text-text-muted mb-1">
                  {event.isHistorical ? t('history.sourceOrOrigin') : t('history.fictionalNote')}
                </label>
                <CInput
                  value={event.source || ''}
                  onChange={change => onChange({ source: change.target.value })}
                  placeholder={event.isHistorical ? t('history.sourcePlaceholder') : t('history.fictionalPlaceholder')}
                  className="w-full px-2.5 py-1.5 bg-bg-base border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-text-muted mb-1">
                <Trans i18nKey="history.finalEntry" ns="panels" components={[<span className="text-amber-500" />]} />
              </label>
              <CTextarea
                value={event.description}
                onChange={change => onChange({ description: change.target.value })}
                placeholder={t('history.finalEntryEventPlaceholder')}
                className="w-full h-24 p-2 bg-bg-base border border-border rounded-lg text-xs text-text-primary resize-y focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-[11px] text-text-muted mb-1">{t('history.impact')}</label>
              <CTextarea
                value={event.impact || ''}
                onChange={change => onChange({ impact: change.target.value })}
                placeholder={t('history.impactPlaceholder')}
                className="w-full h-20 p-2 bg-bg-base border border-border rounded-lg text-xs text-text-primary resize-y focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-[11px] text-text-muted mb-1">{t('history.relatedChapters')}</label>
              <HistoryChapterPicker
                chapters={chapters}
                relatedChapterIds={event.relatedChapterIds}
                onChange={relatedChapterIds => onChange({ relatedChapterIds })}
              />
            </div>

            <div>
              <label className="block text-[11px] text-text-muted mb-1">
                {t('history.conceptNote')}
              </label>
              <CTextarea
                value={event.conceptNote || ''}
                onChange={change => onChange({ conceptNote: change.target.value })}
                placeholder={t('history.conceptNoteEventPlaceholder')}
                className="w-full h-24 p-2 bg-bg-base border border-border rounded-lg text-xs text-text-primary resize-y focus:outline-none focus:border-accent"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-text-muted mb-1">
                  {t('history.consultPromptLabel')}
                </label>
                <CTextarea
                  value={event.consultPrompt || ''}
                  onChange={change => onChange({ consultPrompt: change.target.value })}
                  placeholder={t('history.consultPromptEventPlaceholder')}
                  className="w-full h-20 p-2 bg-bg-base border border-border rounded-lg text-xs text-text-primary resize-y focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-[11px] text-text-muted mb-1">
                  {t('history.stormPromptLabel')}
                </label>
                <CTextarea
                  value={event.stormPrompt || ''}
                  onChange={change => onChange({ stormPrompt: change.target.value })}
                  placeholder={t('history.stormPromptEventPlaceholder')}
                  className="w-full h-20 p-2 bg-bg-base border border-border rounded-lg text-xs text-text-primary resize-y focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <HistoryAgentWorkspace
              canEdit={canEdit}
              consultActive={consultActive}
              stormActive={stormActive}
              consultPreparing={consultPreparing}
              stormPreparing={stormPreparing}
              consultAI={consultAI}
              stormAI={stormAI}
              savedConsult={event.aiConsult}
              savedStorm={event.aiBrainstorm}
              savedStormLabel={t('history.agentStormResult')}
              deleteLabel={t('history.deleteEvent')}
              onConsult={onConsult}
              onStorm={onStorm}
              onDelete={onDelete}
              onAcceptConsult={onAcceptConsult}
              onAcceptStorm={onAcceptStorm}
              onClearConsult={() => onChange({ aiConsult: undefined })}
              onClearStorm={() => onChange({ aiBrainstorm: undefined })}
            />
          </div>
        )}
      </div>
    </div>
  )
}
