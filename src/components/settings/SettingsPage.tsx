import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen } from 'lucide-react'
import AIConfigPanel from './AIConfigPanel'
import LanguageSelector from './LanguageSelector'
import { resetWelcomeGuide } from '../guide/WelcomeGuide'
import NS0EvalPanel from './NS0EvalPanel'

/**
 * 设置页（Phase 4 之后）：
 * 「提示词管理」已升级为侧边栏一级菜单，所以这里只剩 AI 配置。
 * 保留这个外壳是为了未来可能再加其他「设置」类目（快捷键、语言、备份策略等）。
 */
export default function SettingsPage() {
  const { t } = useTranslation('settings')
  const [guideReset, setGuideReset] = useState(false)

  return (
    <div className="h-full overflow-auto p-6">
      <AIConfigPanel />
      <div className="max-w-2xl mt-6">
        <LanguageSelector />
      </div>
      {import.meta.env.DEV && <NS0EvalPanel />}

      {/* 其他设置 */}
      <div className="max-w-2xl mt-6 p-4 bg-bg-surface border border-border rounded-xl">
        <h3 className="text-sm font-semibold text-text-primary mb-3">{t('settings.other')}</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text-secondary">{t('settings.welcomeGuide')}</p>
            <p className="text-xs text-text-muted">{t('settings.welcomeGuideDescription')}</p>
          </div>
          <button
            onClick={() => { resetWelcomeGuide(); setGuideReset(true) }}
            disabled={guideReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-bg-elevated text-text-secondary rounded-lg hover:bg-bg-hover disabled:opacity-50 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            {guideReset ? t('settings.resetSuccess') : t('settings.resetGuide')}
          </button>
        </div>
      </div>
    </div>
  )
}
