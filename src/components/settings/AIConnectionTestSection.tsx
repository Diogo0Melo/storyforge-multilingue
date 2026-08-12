import { CheckCircle, ScrollText, Wifi, WifiOff } from 'lucide-react'
import type { AIProvider } from '../../lib/types'
import type { TestResult } from '../../stores/ai-config'
import { useDomainT } from '../../i18n'

interface Props {
  testing: boolean
  result: TestResult | null
  configReady: boolean
  provider: AIProvider
  logCount: number
  showLogs: boolean
  isDevelopment: boolean
  onTest: () => void
  onToggleLogs: () => void
}

export default function AIConnectionTestSection({
  testing,
  result,
  configReady,
  provider,
  logCount,
  showLogs,
  isDevelopment,
  onTest,
  onToggleLogs,
}: Props) {
  const { t } = useDomainT('settings')
  const networkErrorToken = t('errors-lib:ai.networkError')
  const showCorsHint = result && !result.ok && provider === 'deepseek'
    && (result.message.includes('CORS') || (networkErrorToken ? result.message.includes(networkErrorToken) : false))

  return (
    <div className="pt-2 space-y-2">
      <div className="flex items-center gap-3">
        <button onClick={onTest} disabled={testing || !configReady}
          className="flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent rounded-lg hover:bg-accent/20 disabled:opacity-40 transition-colors text-sm">
          {testing ? (
            <span className="animate-spin">⏳</span>
          ) : result?.ok ? (
            <CheckCircle className="w-4 h-4" />
          ) : result && !result.ok ? (
            <WifiOff className="w-4 h-4" />
          ) : (
            <Wifi className="w-4 h-4" />
          )}
          {testing ? t('connectionTest.testing') : t('connectionTest.testConnection')}
        </button>
        <button onClick={onToggleLogs} aria-pressed={showLogs}
          className="flex items-center gap-1.5 px-3 py-2 text-text-muted hover:text-text-secondary text-sm transition-colors">
          <ScrollText className="w-4 h-4" />
          {t('connectionTest.logs')} {logCount > 0 && `(${logCount})`}
        </button>
      </div>
      {result && (
        <div className={`text-sm px-3 py-2 rounded-lg ${result.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          <p>{result.message}</p>
          {result.duration && <p className="text-xs mt-0.5 opacity-70">{t('connectionTest.duration', { ms: result.duration })}</p>}
        </div>
      )}
      {showCorsHint && (
        <p className="text-xs text-amber-400 px-1">
          {isDevelopment
            ? t('connectionTest.corsHintDev')
            : t('connectionTest.corsHintProd')}
        </p>
      )}
    </div>
  )
}
