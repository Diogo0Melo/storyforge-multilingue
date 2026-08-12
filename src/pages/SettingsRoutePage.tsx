import { lazy, Suspense } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { useDomainT } from '../i18n'

const SettingsPage = lazy(() => import('../components/settings/SettingsPage'))

export default function SettingsRoutePage() {
  const navigate = useNavigate()
  const { t } = useDomainT('pages')

  return (
    <div className="min-h-screen bg-bg-base">
      <header className="border-b border-border px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          title={t('settingsRoute.backTitle')}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-base font-semibold text-text-primary">{t('settingsRoute.title')}</h1>
          <p className="text-xs text-text-muted">{t('settingsRoute.subtitle')}</p>
        </div>
      </header>
      <Suspense fallback={<div className="p-6 text-sm text-text-muted">{t('settingsRoute.fallback')}</div>}>
        <SettingsPage />
      </Suspense>
    </div>
  )
}
