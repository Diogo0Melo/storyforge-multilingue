import { useTranslation } from 'react-i18next'
import { Trans } from 'react-i18next'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type {
  Chapter,
  HistoricalEra,
  HistoricalKeyword,
  HistoricalKeywordCategory,
} from '../../lib/types'
import { HISTORICAL_ERA_LABELS, KEYWORD_CATEGORY_LABELS } from '../../lib/types/history'
import { CInput, CTextarea } from '../shared/CompositionInput'
import HistoryAgentWorkspace, { type HistoryAgentViewState } from './HistoryAgentWorkspace'
import HistoryChapterPicker from './HistoryChapterPicker'

interface Props {
  keyword: HistoricalKeyword
  chapters: Chapter[]
  expanded: boolean
  canEdit: boolean
  consultActive: boolean
  stormActive: boolean
  consultPreparing: boolean
  stormPreparing: boolean
  consultAI: HistoryAgentViewState
  stormAI: HistoryAgentViewState
  onToggle: () => void
  onChange: (patch: Partial<HistoricalKeyword>) => void
  onConsult: () => void
  onStorm: () => void
  onDelete: () => void
  onAcceptConsult: (text: string) => void
  onAcceptStorm: (text: string) => void
}

export default function HistoryKeywordCard({
  keyword,
  chapters,
  expanded,
  canEdit,
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
  const eraLabel = HISTORICAL_ERA_LABELS[keyword.era as HistoricalEra] || keyword.era
  const categoryLabel = KEYWORD_CATEGORY_LABELS[keyword.category] || keyword.category

  return (
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
            <span className="text-xs font-semibold text-accent">#{keyword.keyword}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">
              {categoryLabel}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">
              {eraLabel}
            </span>
          </div>
          {keyword.description && !expanded && (
            <p className="text-xs text-text-muted line-clamp-1 mt-1">{keyword.description}</p>
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
              <label className="block text-[11px] text-text-muted mb-1">{t('history.keywordName')}</label>
              <CInput
                value={keyword.keyword}
                onChange={event => onChange({ keyword: event.target.value })}
                className="w-full px-2.5 py-1.5 bg-bg-base border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-[11px] text-text-muted mb-1">{t('history.category')}</label>
              <select
                aria-label={t('history.categoryAriaLabel')}
                value={keyword.category}
                onChange={event => onChange({ category: event.target.value as HistoricalKeywordCategory })}
                className="w-full px-2 py-1.5 bg-bg-base border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent"
              >
                {Object.entries(KEYWORD_CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-text-muted mb-1">{t('history.era')}</label>
              <select
                aria-label={t('history.eraAriaLabel')}
                value={keyword.era}
                onChange={event => onChange({ era: event.target.value as HistoricalEra })}
                className="w-full px-2 py-1.5 bg-bg-base border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent"
              >
                {Object.entries(HISTORICAL_ERA_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-text-muted mb-1">{t('history.customTimeRange')}</label>
              <CInput
                value={keyword.customTimeRange || ''}
                onChange={event => onChange({ customTimeRange: event.target.value })}
                placeholder={t('history.customTimeRangePlaceholder')}
                className="w-full px-2.5 py-1.5 bg-bg-base border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-[11px] text-text-muted mb-1">{t('history.location')}</label>
              <CInput
                value={keyword.location || ''}
                onChange={event => onChange({ location: event.target.value })}
                placeholder={t('history.locationPlaceholder')}
                className="w-full px-2.5 py-1.5 bg-bg-base border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-text-muted mb-1">
              <Trans i18nKey="history.finalEntry" ns="panels" components={[<span className="text-amber-500" />]} />
            </label>
            <CTextarea
              value={keyword.description}
              onChange={event => onChange({ description: event.target.value })}
              placeholder={t('history.finalEntryPlaceholder')}
              className="w-full h-24 p-2 bg-bg-base border border-border rounded-lg text-xs text-text-primary resize-y focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-[11px] text-text-muted mb-1">{t('history.relatedChapters')}</label>
            <HistoryChapterPicker
              chapters={chapters}
              relatedChapterIds={keyword.relatedChapterIds}
              spacious
              onChange={relatedChapterIds => onChange({ relatedChapterIds })}
            />
          </div>

          <div>
            <label className="block text-[11px] text-text-muted mb-1">
              {t('history.conceptNote')}
            </label>
            <CTextarea
              value={keyword.conceptNote || ''}
              onChange={event => onChange({ conceptNote: event.target.value })}
              placeholder={t('history.conceptNotePlaceholder')}
              className="w-full h-24 p-2 bg-bg-base border border-border rounded-lg text-xs text-text-primary resize-y focus:outline-none focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-text-muted mb-1">
                {t('history.consultPromptLabel')}
              </label>
              <CTextarea
                value={keyword.consultPrompt || ''}
                onChange={event => onChange({ consultPrompt: event.target.value })}
                placeholder={t('history.consultPromptPlaceholder')}
                className="w-full h-20 p-2 bg-bg-base border border-border rounded-lg text-xs text-text-primary resize-y focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-[11px] text-text-muted mb-1">
                {t('history.stormPromptLabel')}
              </label>
              <CTextarea
                value={keyword.stormPrompt || ''}
                onChange={event => onChange({ stormPrompt: event.target.value })}
                placeholder={t('history.stormPromptPlaceholder')}
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
            savedConsult={keyword.aiConsult}
            savedStorm={keyword.aiBrainstorm}
            savedStormLabel={t('history.agentDetailLibrary')}
            savedStormMaxHeight="80"
            deleteLabel={t('history.deleteKeyword')}
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
  )
}
