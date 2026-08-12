import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { recordRuntimeDiagnosticError } from '../../lib/diagnostics/local-diagnostic-report'
import { useDomainT } from '../../i18n'

function ErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  const { t } = useDomainT('shared')
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center">
      <AlertTriangle className="w-12 h-12 text-warning mb-4" />
      <h2 className="text-lg font-bold text-text-primary mb-2">{t('errorBoundary.title')}</h2>
      <p className="text-sm text-text-muted mb-4 max-w-md">
        {error?.message || t('common:unknownError')}
      </p>
      <button
        onClick={onReset}
        className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover transition-colors"
      >
        <RefreshCw className="w-4 h-4" /> {t('errorBoundary.retry')}
      </button>
    </div>
  )
}

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    recordRuntimeDiagnosticError(error, 'react')
    console.error('[StoryForge ErrorBoundary]', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return <ErrorFallback error={this.state.error} onReset={this.handleReset} />
    }

    return this.props.children
  }
}
