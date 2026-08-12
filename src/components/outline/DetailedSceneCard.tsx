import { Trash2 } from 'lucide-react'
import { useDomainT } from '../../i18n'
import type { DetailedScene, ScenePace } from '../../lib/types'

const PACE_COLORS: Record<ScenePace, string> = {
  slow: 'bg-info/10 text-info',
  medium: 'bg-text-muted/10 text-text-secondary',
  fast: 'bg-warning/10 text-warning',
  climax: 'bg-error/10 text-error',
}

interface Props {
  scene: DetailedScene
  index: number
  onUpdate: (patch: Partial<DetailedScene>) => void
  onDelete: () => void
}

export default function DetailedSceneCard({ scene, index, onUpdate, onDelete }: Props) {
  const { t } = useDomainT('outline')

  const paceLabels: Record<ScenePace, string> = {
    slow: t('scene.pace.slow'),
    medium: t('scene.pace.medium'),
    fast: t('scene.pace.fast'),
    climax: t('scene.pace.climax'),
  }

  return (
    <div className="bg-bg-surface border border-border rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-text-muted text-xs">#{index + 1}</span>
        <input
          value={scene.title}
          onChange={event => onUpdate({ title: event.target.value })}
          placeholder={t('scene.titlePlaceholder')}
          className="flex-1 px-2 py-1 bg-bg-base border border-border rounded text-sm font-medium text-text-primary focus:outline-none focus:border-accent"
        />
        <select
          aria-label={t('scene.paceAria')}
          value={scene.pace}
          onChange={event => onUpdate({ pace: event.target.value as ScenePace })}
          className={`px-2 py-1 text-xs rounded border-0 ${PACE_COLORS[scene.pace]}`}
        >
          {Object.entries(paceLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <input
          type="number"
          value={scene.estimatedWords || ''}
          onChange={event => onUpdate({ estimatedWords: parseInt(event.target.value) || 0 })}
          placeholder={t('scene.wordCountPlaceholder')}
          className="w-20 px-2 py-1 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
        />
        <button onClick={onDelete} className="p-1 text-text-muted hover:text-error" aria-label={t('scene.deleteAria', { index: index + 1 })}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <textarea
        value={scene.summary}
        onChange={event => onUpdate({ summary: event.target.value })}
        placeholder={t('scene.summaryPlaceholder')}
        rows={2}
        className="w-full px-2 py-1 bg-bg-base border border-border rounded text-xs text-text-primary resize-none focus:outline-none focus:border-accent"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          value={scene.location}
          onChange={event => onUpdate({ location: event.target.value })}
          placeholder={t('scene.locationPlaceholder')}
          className="px-2 py-1 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
        />
        <input
          value={scene.conflict}
          onChange={event => onUpdate({ conflict: event.target.value })}
          placeholder={t('scene.conflictPlaceholder')}
          className="px-2 py-1 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
        />
      </div>
      {scene.notes && (
        <textarea
          value={scene.notes}
          onChange={event => onUpdate({ notes: event.target.value })}
          placeholder={t('scene.notesPlaceholder')}
          rows={3}
          className="w-full px-2 py-1 bg-bg-base border border-border rounded text-xs text-text-muted resize-y focus:outline-none focus:border-accent"
        />
      )}
    </div>
  )
}
