import { useTranslation } from 'react-i18next'

export type WorldviewOriginFieldKey = 'origin' | 'power' | 'divine'

export const WORLDVIEW_ORIGIN_FIELDS = [
  { key: 'origin' as WorldviewOriginFieldKey, label: '世界来源', icon: '🌌', desc: 'origin.fieldOriginDesc' as const },
  { key: 'power' as WorldviewOriginFieldKey, label: '力量体系', icon: '⚡', desc: 'origin.fieldPowerDesc' as const },
  { key: 'divine' as WorldviewOriginFieldKey, label: '神明与信仰', icon: '🌟', desc: 'origin.fieldDivineDesc' as const },
]

const FIELD_LABEL_KEYS = {
  origin: 'origin.fieldOrigin' as const,
  power: 'origin.fieldPower' as const,
  divine: 'origin.fieldDivine' as const,
}

interface Props {
  active: WorldviewOriginFieldKey
  streamingKeys: ReadonlySet<string>
  onSelect: (key: WorldviewOriginFieldKey) => void
}

export default function WorldviewOriginSidebar({ active, streamingKeys, onSelect }: Props) {
  const { t } = useTranslation(['worlds', 'panels'])
  return (
    <div className="w-fit min-w-32 max-w-44 shrink-0 space-y-0.5 pt-1">
      {WORLDVIEW_ORIGIN_FIELDS.map(field => {
        const isActive = active === field.key
        const isFieldStreaming = streamingKeys.has(field.key)
        const label = t(FIELD_LABEL_KEYS[field.key])
        return (
          <button
            key={field.key}
            onClick={() => onSelect(field.key)}
            aria-label={label}
            aria-pressed={isActive}
            title={t(field.desc)}
            className={`w-full flex items-center gap-2.5 px-2 py-2.5 rounded-lg text-left transition-all ${
              isActive
                ? 'bg-accent/8 border-l-2 border-accent'
                : 'hover:bg-bg-hover border-l-2 border-transparent'
            }`}>
            <span className="text-base shrink-0">{field.icon}</span>
            <span className={`text-sm font-medium truncate flex-1 ${isActive ? 'text-accent' : 'text-text-primary'}`}>{label}</span>
            {isFieldStreaming && !isActive && (
              <span aria-label={t('worlds:origin.generating', { label })} className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
            )}
          </button>
        )
      })}
    </div>
  )
}
