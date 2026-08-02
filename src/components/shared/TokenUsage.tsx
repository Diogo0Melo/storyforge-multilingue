/**
 * Shared token usage display component.
 * Renders "Token: ↑1.234 ↓567" with locale-aware number formatting.
 */
import { useTranslation } from 'react-i18next'
import { formatNumber } from '../../i18n/format'

interface TokenUsageProps {
  inputTokens: number
  outputTokens: number
  className?: string
}

export function TokenUsage({ inputTokens, outputTokens, className }: TokenUsageProps) {
  const { t } = useTranslation('common')
  return (
    <span className={className ?? 'text-[10px] text-text-muted font-mono'}>
      {t('token.usage', { input: formatNumber(inputTokens), output: formatNumber(outputTokens) })}
    </span>
  )
}
