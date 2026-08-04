import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, type SupportedLanguage } from '../../i18n/settings'

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentLang = i18n.language as SupportedLanguage

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleLanguageChange = (lang: SupportedLanguage) => {
    i18n.changeLanguage(lang)
    setIsOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setIsOpen(!isOpen)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className="p-2 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5"
        aria-label="Change language"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title="Language"
      >
        <Languages className="w-4 h-4" />
        <span className="text-xs font-medium">{LANGUAGE_LABELS[currentLang]}</span>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-1 bg-bg-surface border border-border rounded-lg shadow-lg z-30 min-w-[140px]"
          role="listbox"
          aria-label="Select language"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang}
              onClick={() => handleLanguageChange(lang)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors first:rounded-t-lg last:rounded-b-lg ${
                currentLang === lang
                  ? 'bg-accent/10 text-accent font-medium'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
              }`}
              role="option"
              aria-selected={currentLang === lang}
            >
              {LANGUAGE_LABELS[lang]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
