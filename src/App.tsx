import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router'
import { useDomainT } from './i18n'

const HomePage = lazy(() => import('./pages/HomePage'))
const ProductHubPage = lazy(() => import('./pages/ProductHubPage'))
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'))
const SettingsRoutePage = lazy(() => import('./pages/SettingsRoutePage'))

function RouteFallback() {
  const { t } = useDomainT('pages')
  return <div className="min-h-screen bg-bg-base flex items-center justify-center text-sm text-text-muted">{t('app.routeLoading')}</div>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Suspense fallback={<RouteFallback />}><ProductHubPage /></Suspense>} />
      <Route path="/projects" element={<Suspense fallback={<RouteFallback />}><HomePage /></Suspense>} />
      <Route path="/settings" element={<Suspense fallback={<RouteFallback />}><SettingsRoutePage /></Suspense>} />
      <Route path="/workspace/:projectId" element={<Suspense fallback={<RouteFallback />}><WorkspacePage /></Suspense>} />
    </Routes>
  )
}
