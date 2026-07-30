import { Trans, useTranslation } from 'react-i18next'
import { HelpCircle, ShieldCheck, Sparkles } from 'lucide-react'

export function TimelineHistoryHelp() {
  const { t } = useTranslation('panels')
  return (
    <div className="space-y-4">
      <div className="bg-bg-surface border border-border rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-accent" />
          {t('history.helpTimelineTitle')}
        </h3>
        <p className="text-xs text-text-secondary leading-relaxed">
          {t('history.helpTimelineIntro')}
        </p>
        <div className="space-y-2.5 pt-1">
          <div className="flex gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center text-xs shrink-0 font-bold">1</span>
            <div>
              <h4 className="text-xs font-medium text-text-primary">{t('history.helpConsultMode')}</h4>
              <p className="text-[11px] text-text-muted mt-0.5">
                {t('history.helpConsultDescription')}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="w-5 h-5 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center text-xs shrink-0 font-bold">2</span>
            <div>
              <h4 className="text-xs font-medium text-text-primary">{t('history.helpStormMode')}</h4>
              <p className="text-[11px] text-text-muted mt-0.5">
                {t('history.helpStormDescription')}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-bg-surface border border-border rounded-2xl p-5 space-y-2">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
          <HelpCircle className="w-4 h-4 text-text-muted" />
          {t('history.helpTips')}
        </h3>
        <ul className="text-[11px] text-text-muted space-y-1.5 list-disc pl-4">
          <li><Trans i18nKey="history.helpTip1" ns="panels" components={[<code className="bg-bg-base px-1 py-0.5 rounded font-mono" />]} /></li>
          <li>{t('history.helpTip2')}</li>
          <li>{t('history.helpTip3')}</li>
        </ul>
      </div>
    </div>
  )
}

export function KeywordHistoryHelp() {
  const { t } = useTranslation('panels')
  return (
    <div className="space-y-4">
      <div className="bg-bg-surface border border-border rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-accent" />
          {t('history.helpKeywordTitle')}
        </h3>
        <p className="text-xs text-text-secondary leading-relaxed">
          {t('history.helpKeywordIntro')}
        </p>
        <div className="space-y-2.5 pt-1 text-xs text-text-secondary">
          <p><Trans i18nKey="history.helpKeywordItem1" ns="panels" components={[<strong />]} /></p>
          <p><Trans i18nKey="history.helpKeywordItem2" ns="panels" components={[<strong />]} /></p>
          <p><Trans i18nKey="history.helpKeywordItem3" ns="panels" components={[<strong />]} /></p>
          <p><Trans i18nKey="history.helpKeywordItem4" ns="panels" components={[<strong />]} /></p>
          <p><Trans i18nKey="history.helpKeywordItem5" ns="panels" components={[<strong />]} /></p>
        </div>
      </div>

      <div className="bg-bg-surface border border-border rounded-2xl p-5 space-y-2">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
          <HelpCircle className="w-4 h-4 text-text-muted" />
          {t('history.helpTips')}
        </h3>
        <ul className="text-[11px] text-text-muted space-y-1.5 list-disc pl-4">
          <li>{t('history.helpKeywordTip1')}</li>
          <li>{t('history.helpKeywordTip2')}</li>
          <li>{t('history.helpKeywordTip3')}</li>
        </ul>
      </div>
    </div>
  )
}
