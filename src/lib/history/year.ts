import i18n from '../../i18n/i18n'

export function formatHistoricalYear(year: number): string {
  if (!Number.isFinite(year)) return i18n.t('common:year.unspecified')
  if (year === 0) return i18n.t('common:year.epoch')
  return year > 0 ? i18n.t('common:year.ce', { year }) : i18n.t('common:year.bce', { year: Math.abs(year) })
}
