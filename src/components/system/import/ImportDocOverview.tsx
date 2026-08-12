import { Info } from 'lucide-react'
import { Trans } from 'react-i18next'
import { FILE_LIMIT_HINTS } from '../../../lib/doc-parser'
import type { ImportSession } from '../../../lib/types/import-session'
import { useDomainT } from '../../../i18n'

export function ImportDocIntro({ chunkSize }: { chunkSize: number }) {
  const { t } = useDomainT('system')
  return (
    <div>
      <h2 className="text-xl font-bold text-text-primary mb-1">{t('importIntro.heading')}</h2>
      <p className="text-sm text-text-muted">
        {t('importIntro.bodyPart1')}
        <span className="text-accent">{t('importIntro.bodyHighlight')}</span>
        {t('importIntro.bodyPart2')}<strong>{t('importIntro.targetCurrentProject')}</strong>{t('common:colon')}{t('importIntro.targetReference')}
        {t('importIntro.bodyPart3')}<strong>{t('importIntro.realtimeIngest')}</strong>
        {t('importIntro.bodyPart4')}
      </p>
      <div className="mt-2 bg-bg-surface border border-border rounded-lg p-3 text-xs text-text-secondary">
        <div className="flex items-center gap-1.5 mb-1.5 text-text-primary">
          <Info className="w-3.5 h-3.5 text-accent" />
          <span className="font-medium">{t('importIntro.limitsHeading')}</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {FILE_LIMIT_HINTS.map(hint => (
            <div key={hint.ext} className="text-center px-2 py-1.5 bg-bg-base rounded">
              <div className="text-xs font-mono text-accent">.{hint.ext}</div>
              <div className="text-[10px] text-text-muted">{hint.ext === 'txt' ? t('importIntro.formatTxt') : hint.label}</div>
              <div className="text-xs text-text-primary font-medium">≤ {hint.mb} MB</div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[11px] text-text-muted leading-relaxed">
          {t('importIntro.chunkingNote', { chunkSize: chunkSize.toLocaleString() })}<br />
          <Trans
            i18nKey="importIntro.blobPersistNote"
            ns="system"
            components={{
              1: <strong />,
              3: <strong />,
            }}
          />
        </div>
      </div>
    </div>
  )
}

export function ImportReusableSessionBanner({
  session,
  applying,
  originalTextAvailable,
  onApplyProject,
  onApplyReference,
  onReviewCodex,
  onIgnore,
}: {
  session: ImportSession
  applying: boolean
  originalTextAvailable: boolean
  onApplyProject: () => void
  onApplyReference: (depth: 'quick' | 'deep') => void
  onReviewCodex?: () => void
  onIgnore: () => void
}) {
  const { t } = useDomainT('system')
  return (
    <div className="rounded-lg border border-purple-400/40 bg-purple-400/5 p-3 text-xs">
      <div className="flex items-center gap-1.5 font-medium text-purple-300 mb-1">
        {t('reusableBanner.detected', {
          filename: session.filename,
          chars: session.totalChars.toLocaleString(),
          chunks: session.totalChunks,
        })}
      </div>
      <div className="text-text-muted mb-2 leading-relaxed">
        <Trans
          i18nKey="reusableBanner.description"
          ns="system"
          components={{ 1: <strong className="text-accent" /> }}
        />
        {!originalTextAvailable && t('reusableBanner.deepFallbackNotice')}{t('common:colon')}
      </div>
      <div className="flex flex-wrap gap-2">
        <button disabled={applying} onClick={onApplyProject}
          className="px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-50 font-medium">
          {t('reusableBanner.applyProject')}
        </button>
        <button disabled={applying} onClick={() => onApplyReference('quick')}
          className="px-3 py-1.5 rounded bg-purple-500/80 text-white hover:bg-purple-500 disabled:opacity-50">
          {t('reusableBanner.applyReferenceQuick')}
        </button>
        <button disabled={applying} onClick={() => onApplyReference('deep')}
          className="px-3 py-1.5 rounded border border-purple-400/60 text-purple-200 hover:bg-purple-400/10 disabled:opacity-50">
          {t('reusableBanner.applyReferenceDeep')}
        </button>
        {onReviewCodex && (session.merged?.codexCandidates?.length || 0) > 0 && !session.codexAdoption && (
          <button disabled={applying} onClick={onReviewCodex}
            className="px-3 py-1.5 rounded border border-accent/60 text-accent hover:bg-accent/10 disabled:opacity-50">
            {t('reusableBanner.reviewCodex', { count: session.merged?.codexCandidates?.length ?? 0 })}
          </button>
        )}
        <button disabled={applying} onClick={onIgnore}
          className="px-3 py-1.5 rounded text-text-muted hover:bg-bg-hover">
          {t('reusableBanner.ignore')}
        </button>
      </div>
    </div>
  )
}
