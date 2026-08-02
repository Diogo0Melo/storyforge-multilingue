import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import { formatNumber } from '../../../i18n/format'
import { FILE_LIMIT_HINTS } from '../../../lib/doc-parser'
import type { ImportSession } from '../../../lib/types/import-session'
import type { ImportKeys } from '../../../i18n/generated-resources'

export function ImportDocIntro({ chunkSize }: { chunkSize: number }) {
  const { t } = useTranslation('import')
  return (
    <div>
      <h2 className="text-xl font-bold text-text-primary mb-1">{t('intro.title')}</h2>
      <p className="text-sm text-text-muted">
        {t('intro.description')}
        <span className="text-accent">{t('intro.targets')}</span>。
        {t('intro.chooseTarget')}<strong>{t('intro.currentProject')}</strong>{t('intro.or')}<strong>{t('intro.projectReference')}</strong>；
        {t('intro.realtime')}<strong>{t('intro.realtimeEmphasis')}</strong>{t('intro.codexNote')}
      </p>
      <div className="mt-2 bg-bg-surface border border-border rounded-lg p-3 text-xs text-text-secondary">
        <div className="flex items-center gap-1.5 mb-1.5 text-text-primary">
          <Info className="w-3.5 h-3.5 text-accent" />
          <span className="font-medium">{t('intro.supportedFormats')}</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {FILE_LIMIT_HINTS.map(hint => (
            <div key={hint.ext} className="text-center px-2 py-1.5 bg-bg-base rounded">
              <div className="text-xs font-mono text-accent">.{hint.ext}</div>
              <div className="text-[10px] text-text-muted">{hint.labelKey ? t(hint.labelKey as ImportKeys) : hint.label}</div>
              <div className="text-xs text-text-primary font-medium">≤ {hint.mb} MB</div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[11px] text-text-muted leading-relaxed">
          {t('intro.largeDocNote', { chars: formatNumber(chunkSize) })}<br />
          ✨ <strong>{t('intro.autoArchiveStrong')}</strong>{t('intro.autoArchiveSuffix')}<strong>{t('intro.resumeStrong')}</strong>{t('intro.autoArchiveEnd')}
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
  const { t } = useTranslation('import')
  return (
    <div className="rounded-lg border border-purple-400/40 bg-purple-400/5 p-3 text-xs">
      <div className="flex items-center gap-1.5 font-medium text-purple-300 mb-1">
        {t('reuse.detected', { filename: session.filename, chars: formatNumber(session.totalChars), chunks: session.totalChunks })}
      </div>
      <div className="text-text-muted mb-2 leading-relaxed">
        {t('reuse.descriptionPrefix')}<strong className="text-accent">{t('reuse.descriptionStrong')}</strong>{t('reuse.descriptionSuffix')}{!originalTextAvailable && t('reuse.originalNotAvailable')}：
      </div>
      <div className="flex flex-wrap gap-2">
        <button disabled={applying} onClick={onApplyProject}
          className="px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-50 font-medium">
          {t('reuse.applyProject')}
        </button>
        <button disabled={applying} onClick={() => onApplyReference('quick')}
          className="px-3 py-1.5 rounded bg-purple-500/80 text-white hover:bg-purple-500 disabled:opacity-50">
          {t('reuse.applyReferenceShallow')}
        </button>
        <button disabled={applying} onClick={() => onApplyReference('deep')}
          className="px-3 py-1.5 rounded border border-purple-400/60 text-purple-200 hover:bg-purple-400/10 disabled:opacity-50">
          {t('reuse.applyReferenceDeep')}
        </button>
        {onReviewCodex && (session.merged?.codexCandidates?.length || 0) > 0 && !session.codexAdoption && (
          <button disabled={applying} onClick={onReviewCodex}
            className="px-3 py-1.5 rounded border border-accent/60 text-accent hover:bg-accent/10 disabled:opacity-50">
            {t('reuse.reviewCodex', { count: session.merged?.codexCandidates?.length || 0 })}
          </button>
        )}
        <button disabled={applying} onClick={onIgnore}
          className="px-3 py-1.5 rounded text-text-muted hover:bg-bg-hover">
          {t('reuse.ignore')}
        </button>
      </div>
    </div>
  )
}
