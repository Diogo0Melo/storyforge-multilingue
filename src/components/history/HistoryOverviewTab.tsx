import { useTranslation } from 'react-i18next'
import { CTextarea } from '../shared/CompositionInput'

interface Props {
  overview: string
  eraSystem: string
  onOverviewChange: (value: string) => void
  onEraSystemChange: (value: string) => void
  onSaveOverview: () => void
  onSaveEraSystem: () => void
}

export default function HistoryOverviewTab({
  overview,
  eraSystem,
  onOverviewChange,
  onEraSystemChange,
  onSaveOverview,
  onSaveEraSystem,
}: Props) {
  const { t } = useTranslation('panels')
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-bg-surface border border-border rounded-xl p-5 space-y-2">
        <label className="block text-sm font-medium text-text-primary">{t('history.overviewLabel')}</label>
        <p className="text-xs text-text-muted">{t('history.overviewDescription')}</p>
        <CTextarea
          value={overview}
          onChange={event => onOverviewChange(event.target.value)}
          onBlur={onSaveOverview}
          placeholder={t('history.overviewPlaceholder')}
          className="w-full h-36 p-3 bg-bg-base border border-border rounded-lg text-text-primary text-sm resize-y focus:outline-none focus:border-accent"
        />
      </div>

      <div className="bg-bg-surface border border-border rounded-xl p-5 space-y-2">
        <label className="block text-sm font-medium text-text-primary">{t('history.eraSystemLabel')}</label>
        <p className="text-xs text-text-muted">{t('history.eraSystemDescription')}</p>
        <CTextarea
          value={eraSystem}
          onChange={event => onEraSystemChange(event.target.value)}
          onBlur={onSaveEraSystem}
          placeholder={t('history.eraSystemPlaceholder')}
          className="w-full h-24 p-3 bg-bg-base border border-border rounded-lg text-text-primary text-sm resize-y focus:outline-none focus:border-accent"
        />
      </div>
    </div>
  )
}
