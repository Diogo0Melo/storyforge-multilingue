import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from '../../i18n/settings'

export default function LanguageSelector() {
  const { i18n, t } = useTranslation('settings')
  const currentLang = i18n.language

  return (
    <div className="bg-bg-surface border border-border rounded-xl p-5">
      <h3 className="text-base font-semibold text-text-primary mb-1">{t('language.title')}</h3>
      <p className="text-xs text-text-muted mb-4">{t('language.description')}</p>
      <div className="flex flex-col gap-3">
        {SUPPORTED_LANGUAGES.map((lang: string) => {
          const isActive = currentLang === lang
          const label = LANGUAGE_LABELS[lang as keyof typeof LANGUAGE_LABELS] ?? lang
          return (
            <button key={lang} onClick={() => i18n.changeLanguage(lang)} aria-pressed={isActive}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                isActive ? 'border-accent bg-accent/10' : 'border-border hover:border-border-hover hover:bg-bg-hover'
              }`}>
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-bg-elevated border border-border flex-shrink-0">
                <span className="text-sm font-semibold text-text-primary">{lang.split('-')[0].toUpperCase()}</span>
              </div>
              <div className="flex-1">
                <p className="text-sm text-text-primary font-medium leading-none mb-1">{label}</p>
                <p className="text-xs text-text-muted">{lang}</p>
              </div>
              {isActive && (
                <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center flex-shrink-0" aria-label={t('language.currentLanguage')}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17 4 12"/>
                  </svg>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
