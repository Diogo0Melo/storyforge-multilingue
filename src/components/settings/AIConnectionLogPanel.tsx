import { Trash2 } from 'lucide-react'
import { formatLog, type AILogEntry } from '../../lib/ai/logger'
import { useDomainT } from '../../i18n'

interface Props {
  logs: AILogEntry[]
  onClear: () => void
}

export default function AIConnectionLogPanel({ logs, onClear }: Props) {
  const { t } = useDomainT('settings')
  return (
    <div className="bg-bg-surface border border-border rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary">{t('connectionLog.title')}</h3>
        <button onClick={onClear} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary">
          <Trash2 className="w-3 h-3" /> {t('connectionLog.clear')}
        </button>
      </div>
      <div className="max-h-[200px] overflow-y-auto space-y-1 font-mono text-xs">
        {logs.length === 0 ? (
          <p className="text-text-muted">{t('connectionLog.empty')}</p>
        ) : (
          logs.map(log => (
            <pre key={log.id} className="text-text-secondary whitespace-pre-wrap break-all">{formatLog(log)}</pre>
          ))
        )}
      </div>
    </div>
  )
}
