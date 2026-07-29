/**
 * Shared i18n configuration constants.
 * Single source of truth for supported languages and namespaces.
 */
export const SUPPORTED_LANGUAGES = ['zh-CN', 'pt-BR'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const FALLBACK_LNG = 'zh-CN'
export const DEFAULT_NS = 'common'
export const NAMESPACES = ['common', 'nav', 'project', 'editor', 'outline', 'characters', 'worlds'] as const
export type AppNamespace = (typeof NAMESPACES)[number]

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  'zh-CN': '中文',
  'pt-BR': 'Português (BR)',
}

export const STORAGE_KEY = 'i18nextLng'
