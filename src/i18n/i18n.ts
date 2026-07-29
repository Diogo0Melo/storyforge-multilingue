/**
 * i18next initialization — import this module once in main.tsx before rendering.
 * Uses HTTP backend for lazy-loading JSON locale files from /public/locales/.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import HttpBackend from 'i18next-http-backend'
import { FALLBACK_LNG, SUPPORTED_LANGUAGES, DEFAULT_NS, NAMESPACES, STORAGE_KEY } from './settings'

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: FALLBACK_LNG,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    defaultNS: DEFAULT_NS,
    ns: [...NAMESPACES],

    backend: {
      loadPath: '/storyforge/locales/{{lng}}/{{ns}}.json',
    },

    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: STORAGE_KEY,
    },

    interpolation: {
      escapeValue: false, // React already escapes
    },

    react: {
      useSuspense: true,
    },

    // Dev: log missing keys
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: (lng, ns, key) => {
      if (import.meta.env.DEV) {
        console.warn(`[i18n] Missing: ${lng}/${ns}/${key}`)
      }
    },
  })

export default i18n
