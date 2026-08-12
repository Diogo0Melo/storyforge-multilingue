import { Trans } from 'react-i18next'
import { HelpCircle, ShieldCheck, Sparkles } from 'lucide-react'
import { useDomainT } from '../../i18n'

export function TimelineHistoryHelp() {
  const { t } = useDomainT('history')
  return (
    <div className="space-y-4">
      <div className="bg-bg-surface border border-border rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-accent" />
          {t('helpTimeline.title')}
        </h3>
        <p className="text-xs text-text-secondary leading-relaxed">
          {t('helpTimeline.intro')}
        </p>
        <div className="space-y-2.5 pt-1">
          <div className="flex gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center text-xs shrink-0 font-bold">1</span>
            <div>
              <h4 className="text-xs font-medium text-text-primary">{t('helpTimeline.modeConsultTitle')}</h4>
              <p className="text-[11px] text-text-muted mt-0.5">
                {t('helpTimeline.modeConsultDesc')}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="w-5 h-5 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center text-xs shrink-0 font-bold">2</span>
            <div>
              <h4 className="text-xs font-medium text-text-primary">{t('helpTimeline.modeStormTitle')}</h4>
              <p className="text-[11px] text-text-muted mt-0.5">
                {t('helpTimeline.modeStormDesc')}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-bg-surface border border-border rounded-2xl p-5 space-y-2">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
          <HelpCircle className="w-4 h-4 text-text-muted" />
          {t('helpTimeline.tipsTitle')}
        </h3>
        <ul className="text-[11px] text-text-muted space-y-1.5 list-disc pl-4">
          <li><Trans ns="history" i18nKey="helpTimeline.tipYear" components={{ 1: <code className="bg-bg-base px-1 py-0.5 rounded font-mono" /> }} /></li>
          <li>{t('helpTimeline.tipSort')}</li>
          <li>{t('helpTimeline.tipChapter')}</li>
        </ul>
      </div>
    </div>
  )
}

export function KeywordHistoryHelp() {
  const { t } = useDomainT('history')
  return (
    <div className="space-y-4">
      <div className="bg-bg-surface border border-border rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-accent" />
          {t('helpKeyword.title')}
        </h3>
        <p className="text-xs text-text-secondary leading-relaxed">
          {t('helpKeyword.intro')}
        </p>
        <div className="space-y-2.5 pt-1 text-xs text-text-secondary">
          <p><Trans ns="history" i18nKey="helpKeyword.catTech" components={{ 1: <strong /> }} /></p>
          <p><Trans ns="history" i18nKey="helpKeyword.catSystem" components={{ 1: <strong /> }} /></p>
          <p><Trans ns="history" i18nKey="helpKeyword.catCulture" components={{ 1: <strong /> }} /></p>
          <p><Trans ns="history" i18nKey="helpKeyword.catEconomy" components={{ 1: <strong /> }} /></p>
          <p><Trans ns="history" i18nKey="helpKeyword.catGeo" components={{ 1: <strong /> }} /></p>
        </div>
      </div>

      <div className="bg-bg-surface border border-border rounded-2xl p-5 space-y-2">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
          <HelpCircle className="w-4 h-4 text-text-muted" />
          {t('helpKeyword.tipsTitle')}
        </h3>
        <ul className="text-[11px] text-text-muted space-y-1.5 list-disc pl-4">
          <li>{t('helpKeyword.tipFilter')}</li>
          <li>{t('helpKeyword.tipPersist')}</li>
          <li>{t('helpKeyword.tipChapter')}</li>
        </ul>
      </div>
    </div>
  )
}
