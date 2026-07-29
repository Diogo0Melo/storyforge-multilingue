import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { recordRuntimeDiagnosticError } from '../../lib/diagnostics/local-diagnostic-report'
import i18n from '../../i18n/i18n'

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

      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-warning mb-4" />
          <h2 className="text-lg font-bold text-text-primary mb-2">{i18n.t('common:errorBoundary.title')}</h2>
          <p className="text-sm text-text-muted mb-4 max-w-md">
            {this.state.error?.message || i18n.t('common:errorBoundary.message')}
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> {i18n.t('common:errorBoundary.retry')}
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
