import { useMemo } from 'react'
import { BookOpenCheck, DatabaseZap, Gamepad2, PenLine, Settings2, WandSparkles } from 'lucide-react'
import {
  buildModuleContentTypeDefinitions,
  type ModuleContentType,
} from './sidebar-tree'
import { useDomainT } from '../../i18n'

interface Props {
  contentType: ModuleContentType
  compact?: boolean
  showDescription?: boolean
  className?: string
}

const TYPE_STYLES: Record<ModuleContentType, string> = {
  upstream: 'border-info/25 bg-info/10 text-info',
  writing: 'border-accent/25 bg-accent/10 text-accent',
  downstream: 'border-success/25 bg-success/10 text-success',
  tool: 'border-warning/25 bg-warning/10 text-warning',
  experience: 'border-accent/25 bg-accent/10 text-accent',
  system: 'border-border bg-bg-elevated text-text-muted',
}

const TYPE_ICONS = {
  upstream: BookOpenCheck,
  writing: PenLine,
  downstream: DatabaseZap,
  tool: WandSparkles,
  experience: Gamepad2,
  system: Settings2,
} satisfies Record<ModuleContentType, typeof BookOpenCheck>

export default function ContentTypeBadge({
  contentType,
  compact = false,
  showDescription = false,
  className = '',
}: Props) {
  // Rebuild definitions when language changes so labels stay translated.
  // useDomainT provides a REAL react-i18next subscription, so `lang` is a
  // reactive memo key on language switch (reading the i18n.language singleton
  // directly was not — P0-1 cold-mount raw keys). Cold-load correctness rides
  // on `layout` ∈ PRELOAD_NS (src/i18n/index.ts): the subscription alone would
  // NOT rebuild this memo when a late ns arrives, because `lang` hasn't
  // changed — do not drop `layout` from the preload set.
  const { t, lang } = useDomainT('layout')
  const definitions = useMemo(
    () => buildModuleContentTypeDefinitions(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lang 来自 useDomainT 的响应式订阅
    [lang],
  )
  const definition = definitions[contentType]
  const Icon = TYPE_ICONS[contentType]
  const tooltip = t('sidebar.contentTypeTooltip', { label: definition.label, description: definition.description })

  if (compact) {
    return (
      <span
        data-content-type={contentType}
        aria-hidden="true"
        title={tooltip}
        className={`ml-auto inline-flex shrink-0 items-center rounded-sm px-1 py-0.5 text-[9px] font-medium ${TYPE_STYLES[contentType]} ${className}`}
      >
        {definition.label}
      </span>
    )
  }

  return (
    <span
      data-content-type={contentType}
      title={tooltip}
      className={`inline-flex min-w-0 items-center gap-1.5 rounded border px-2 py-1 text-xs ${TYPE_STYLES[contentType]} ${className}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="shrink-0 font-medium">{definition.label}</span>
      {showDescription && (
        <span className="hidden truncate text-text-muted xl:inline">{definition.description}</span>
      )}
    </span>
  )
}
