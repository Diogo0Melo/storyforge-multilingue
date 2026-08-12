import { useDomainT } from '../../i18n'
import { useForeshadowStore } from '../../stores/foreshadow'
import type { Foreshadow, ForeshadowStatus, ForeshadowType } from '../../lib/types'

const STATUS_COLUMN_KEYS = {
  planned: 'statusColumn.planned' as const,
  planted: 'statusColumn.planted' as const,
  echoed: 'statusColumn.echoed' as const,
  resolved: 'statusColumn.resolved' as const,
} satisfies Record<ForeshadowStatus, string>

const STATUS_COLUMN_STYLES: Record<ForeshadowStatus, { dot: string; accent: string; border: string }> = {
  planned: { dot: 'bg-text-muted', accent: 'text-text-primary', border: 'border-l-border' },
  planted: { dot: 'bg-error', accent: 'text-text-primary', border: 'border-l-error' },
  echoed: { dot: 'bg-warning', accent: 'text-text-primary', border: 'border-l-warning' },
  resolved: { dot: 'bg-success', accent: 'text-text-primary', border: 'border-l-success' },
}

const TYPE_EMOJI: Record<ForeshadowType, string> = {
  chekhov: '🔫', prophecy: '🔮', symbol: '🎭', character: '👤',
  dialogue: '💬', environment: '🌿', timeline: '⏰',
  'red-herring': '🐟', parallel: '🔄', callback: '↩️',
}

interface Props {
  onSelectForeshadow: (id: number) => void
}

export default function ForeshadowKanban({ onSelectForeshadow }: Props) {
  const { t } = useDomainT('foreshadow')
  const { foreshadows, updateStatus } = useForeshadowStore()

  const getColumnItems = (status: ForeshadowStatus) =>
    foreshadows.filter(f => f.status === status)

  const handleAdvance = (f: Foreshadow) => {
    const flow: ForeshadowStatus[] = ['planned', 'planted', 'echoed', 'resolved']
    const idx = flow.indexOf(f.status)
    if (idx < flow.length - 1 && f.id) {
      updateStatus(f.id, flow[idx + 1])
    }
  }

  const handleRevert = (f: Foreshadow) => {
    const flow: ForeshadowStatus[] = ['planned', 'planted', 'echoed', 'resolved']
    const idx = flow.indexOf(f.status)
    if (idx > 0 && f.id) {
      updateStatus(f.id, flow[idx - 1])
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 pb-4 md:grid-cols-2 xl:grid-cols-4">
      {(['planned', 'planted', 'echoed', 'resolved'] as ForeshadowStatus[]).map(key => {
        const items = getColumnItems(key)
        const styles = STATUS_COLUMN_STYLES[key]
        return (
          <div key={key} className="min-w-0 overflow-hidden rounded-xl border border-border bg-bg-surface/70 shadow-theme-sm">
            {/* 列标题 */}
            <div className="flex items-center justify-between border-b border-border bg-bg-elevated/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} />
                <span className={`text-sm font-semibold ${styles.accent}`}>{(() => {
                  const labelKey = STATUS_COLUMN_KEYS[key]
                  return t(labelKey)
                })()}</span>
              </div>
              <span className="rounded-full bg-bg-base px-2 py-0.5 text-xs text-text-muted">
                {items.length}
              </span>
            </div>

            {/* 卡片列表 */}
            <div className="min-h-[520px] space-y-3 px-3 py-4">
              {items.length === 0 ? (
                <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border text-xs text-text-muted/50">
                  {t('kanban.emptyColumn')}
                </div>
              ) : (
                items.map(f => (
                  <div
                    key={f.id}
                    className={`group cursor-pointer rounded-lg border border-border border-l-2 ${styles.border} bg-bg-elevated p-4 shadow-theme-sm transition hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-theme-md`}
                    onClick={() => onSelectForeshadow(f.id!)}
                  >
                    {/* 卡片标题 */}
                    <div className="flex items-start gap-2 mb-1.5">
                      <span className="text-sm shrink-0">{TYPE_EMOJI[f.type]}</span>
                      <span className="text-sm font-medium text-text-primary truncate">
                        {f.name}
                      </span>
                    </div>

                    {/* 描述 */}
                    {f.description && (
                      <p className="text-xs text-text-muted line-clamp-2 mb-2">
                        {f.description}
                      </p>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex items-center justify-between opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRevert(f) }}
                        disabled={f.status === 'planned'}
                        className="text-xs text-text-muted hover:text-text-primary disabled:opacity-20 disabled:cursor-default"
                        title={t('kanban.revertButtonTitle')}
                      >
                        {t('kanban.revertButtonLabel')}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAdvance(f) }}
                        disabled={f.status === 'resolved'}
                        className="text-xs text-accent hover:text-accent-hover disabled:opacity-20 disabled:cursor-default"
                        title={t('kanban.advanceButtonTitle')}
                      >
                        {t('kanban.advanceButtonLabel')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
