import { AlertTriangle, BookOpenCheck, Loader2 } from 'lucide-react'
import { useDomainT, type DomainTFunction } from '../../i18n'
import { CONTEXT_SOURCE_BY_KEY } from '../../lib/registry/context-sources'
import type { AssembleContextResult } from '../../lib/registry/types'

/** UI 侧来源名走 labelKey 翻译；注册表中文 label 只作兜底，AI 装配不受影响。 */
function contextSourceLabel(t: DomainTFunction, key: string): string {
  const source = CONTEXT_SOURCE_BY_KEY.get(key)
  if (!source) return key
  return t(source.labelKey, { defaultValue: source.label })
}

function contextExcerpt(assembled: AssembleContextResult, key: string, maxChars = 180): string {
  const index = assembled.included.indexOf(key)
  const content = index >= 0 ? assembled.segments[index]?.content ?? '' : ''
  const compact = content
    .replace(/^【[^】]+】\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (compact.length <= maxChars) return compact
  return `${compact.slice(0, maxChars)}...`
}

export default function OutlineGenerationBasis({
  context,
  loading,
  error,
}: {
  context: AssembleContextResult | null
  loading: boolean
  error: string
}) {
  const { t } = useDomainT('outline')
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-muted" data-testid="outline-basis-loading">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('generation.basis.loading')}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 text-xs text-error" role="alert">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{t('generation.basis.loadFailed', { error })}</span>
      </div>
    )
  }

  if (!context) return null

  const storyCore = contextExcerpt(context, 'storyCore')
  const existingVolumes = contextExcerpt(context, 'existingVolumeOutlines')

  return (
    <div className="space-y-2 text-xs" data-testid="outline-generation-basis">
      <div className="flex items-center gap-2 text-text-primary">
        <BookOpenCheck className="h-3.5 w-3.5 text-accent" />
        <span className="font-medium">{t('generation.basis.heading')}</span>
        <span className="text-[10px] text-text-muted">
          {t('generation.basis.tokens', { used: context.totalInputTokens.toLocaleString(), budget: context.inputBudget.toLocaleString() })}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5" aria-label={t('generation.basis.sourcesAria')}>
        {context.included.map(key => (
          <span key={key} className="rounded bg-accent/10 px-1.5 py-0.5 text-accent">
            {contextSourceLabel(t, key)}
          </span>
        ))}
        {context.included.length === 0 && <span className="text-warning">{t('generation.basis.noSources')}</span>}
      </div>

      {storyCore ? (
        <p className="leading-5 text-text-secondary"><span className="text-text-muted">{t('generation.basis.storyCoreLabel')}</span>{storyCore}</p>
      ) : (
        <p className="leading-5 text-warning">{t('generation.basis.storyCoreMissing')}</p>
      )}
      {existingVolumes && (
        <p className="leading-5 text-text-secondary"><span className="text-text-muted">{t('generation.basis.existingVolumesLabel')}</span>{existingVolumes}</p>
      )}

      {context.omitted.length > 0 && (
        <p className="text-text-muted">
          {t('generation.basis.omitted', { sources: context.omitted.map(key => contextSourceLabel(t, key)).join(', ') })}
        </p>
      )}
      {context.trimmed.length > 0 && (
        <p className="text-warning">
          {t('generation.basis.trimmed', { sources: context.trimmed.map(key => contextSourceLabel(t, key)).join(', ') })}
        </p>
      )}
      <p className="text-text-muted">{t('generation.basis.inspirationExcluded')}</p>
    </div>
  )
}
