import { useDomainT } from '../../i18n'

export type WorldviewOriginFieldKey = 'origin' | 'power' | 'divine'

/** Static key map for origin field labels/descriptions — no computed keys. */
const FIELD_KEYS = {
  origin: { labelKey: 'origin.fields.origin.label' as const, descKey: 'origin.fields.origin.desc' as const },
  power:  { labelKey: 'origin.fields.power.label' as const,  descKey: 'origin.fields.power.desc' as const },
  divine: { labelKey: 'origin.fields.divine.label' as const, descKey: 'origin.fields.divine.desc' as const },
} satisfies Record<WorldviewOriginFieldKey, { labelKey: string; descKey: string }>

/** Field metadata without translated strings — icon is not user-visible text. */
export const WORLDVIEW_ORIGIN_FIELDS: Array<{
  key: WorldviewOriginFieldKey
  icon: string
}> = [
  { key: 'origin', icon: '🌌' },
  { key: 'power',  icon: '⚡' },
  { key: 'divine', icon: '🌟' },
]

interface Props {
  active: WorldviewOriginFieldKey
  streamingKeys: ReadonlySet<string>
  onSelect: (key: WorldviewOriginFieldKey) => void
}

export default function WorldviewOriginSidebar({ active, streamingKeys, onSelect }: Props) {
  const { t } = useDomainT('worldview')
  return (
    <div className="w-fit min-w-32 max-w-44 shrink-0 space-y-0.5 pt-1">
      {WORLDVIEW_ORIGIN_FIELDS.map(field => {
        const isActive = active === field.key
        const isFieldStreaming = streamingKeys.has(field.key)
        const label = t(FIELD_KEYS[field.key].labelKey)
        return (
          <button
            key={field.key}
            onClick={() => onSelect(field.key)}
            aria-label={label}
            aria-pressed={isActive}
            className={`w-full flex items-center gap-2.5 px-2 py-2.5 rounded-lg text-left transition-all ${
              isActive
                ? 'bg-accent/8 border-l-2 border-accent'
                : 'hover:bg-bg-hover border-l-2 border-transparent'
            }`}>
            <span className="text-base shrink-0">{field.icon}</span>
            <span className={`text-sm font-medium truncate flex-1 ${isActive ? 'text-accent' : 'text-text-primary'}`}>{label}</span>
            {isFieldStreaming && !isActive && (
              <span aria-label={t('origin.streamingAriaLabel', { label })} className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
            )}
          </button>
        )
      })}
    </div>
  )
}
