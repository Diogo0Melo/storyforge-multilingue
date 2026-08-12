import { getT } from '../../i18n'

export function formatHistoricalYear(year: number): string {
  const t = getT()
  if (!Number.isFinite(year)) return t('history:yearFormat.unspecified')
  if (year === 0) return t('history:yearFormat.epoch')
  return year > 0 ? t('history:yearFormat.ce', { year }) : t('history:yearFormat.bce', { year: Math.abs(year) })
}
