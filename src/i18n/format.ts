/**
 * Locale-aware formatting helpers.
 * Thin wrappers over Intl APIs using the active i18n language.
 * Usable in both React components and non-React modules (lib/, stores/).
 */
import i18n from './i18n'

type DateInput = Date | string | number

/** Format a date (date-only, no time). Pass optional Intl options to override defaults. */
export function formatDate(date: DateInput, options?: Intl.DateTimeFormatOptions): string {
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleDateString(i18n.language, options ?? { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/** Format a date with both date and time components. */
export function formatDateTime(date: DateInput, options?: Intl.DateTimeFormatOptions): string {
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleString(i18n.language, options)
}

/** Format time only (no date part). */
export function formatTime(date: DateInput, options?: Intl.DateTimeFormatOptions): string {
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleTimeString(i18n.language, options)
}

/** Format a number with locale-appropriate separators (e.g. 1.234 in pt-BR, 1,234 in en). */
export function formatNumber(n: number): string {
  return n.toLocaleString(i18n.language)
}
