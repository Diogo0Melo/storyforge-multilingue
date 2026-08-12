import type { FieldGenerationMode } from '../../lib/ai/field-generation-context'
import { useDomainT } from '../../i18n'

interface Props {
  value: FieldGenerationMode
  onChange: (mode: FieldGenerationMode) => void
}

const MODES: FieldGenerationMode[] = ['expand', 'rewrite', 'polish']

export default function AIFieldModeTabs({ value, onChange }: Props) {
  const { t } = useDomainT('shared')
  return (
    <div className="flex shrink-0 items-center rounded-lg border border-border bg-bg-base p-0.5">
      {MODES.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`px-2 py-1 text-xs rounded-md transition-colors ${
            value === key ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          {t(`fieldModeTabs.${key}`)}
        </button>
      ))}
    </div>
  )
}
