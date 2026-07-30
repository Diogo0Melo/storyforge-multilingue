import { useTranslation } from 'react-i18next'
import { History, HardDrive, PlayCircle } from 'lucide-react'
import type { ImportSession } from '../../../lib/types/import-session'

interface Props {
  unfinished: ImportSession
  restoringBlob: boolean
  blobRestored: boolean
  /** 当前文本框里是否已经有原文（用于判断兜底续跑按钮是否可点） */
  hasRawText: boolean
  onResume: () => void
  onResumeWithUploaded: () => void
  onShowDetail: () => void
  onDiscard: () => void | Promise<void>
}

/**
 * 未完成会话横幅：打开面板时如果项目内有未完成任务，
 * 展示续跑入口与放弃按钮。从 ImportDocPanel.tsx 抽出。
 */
export default function ImportUnfinishedBanner({
  unfinished,
  restoringBlob,
  blobRestored,
  hasRawText,
  onResume,
  onResumeWithUploaded,
  onShowDetail,
  onDiscard,
}: Props) {
  const { t } = useTranslation('import')
  const remaining = unfinished.chunks.filter(c => c.status !== 'done').length

  return (
    <div className="bg-warning/5 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
      <History className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <div className="text-sm font-semibold text-warning mb-1">
          {t('unfinished.title')}
        </div>
        <div className="text-xs text-text-secondary leading-relaxed">
          {t('unfinished.description', { filename: unfinished.filename, remaining, total: unfinished.totalChunks, status: unfinished.status })}
        </div>
        {restoringBlob && (
          <div className="mt-1.5 text-[11px] text-text-muted flex items-center gap-1">
            <HardDrive className="w-3 h-3 animate-pulse" />
            {t('unfinished.restoring')}
          </div>
        )}
        {!restoringBlob && blobRestored && (
          <div className="mt-1.5 text-[11px] text-accent flex items-center gap-1">
            <HardDrive className="w-3 h-3" />
            {t('unfinished.restored')}
          </div>
        )}
        <div className="flex items-center gap-2 mt-2">
          {blobRestored ? (
            <button
              onClick={onResume}
              className="flex items-center gap-1 px-3 py-1.5 bg-warning text-white text-xs rounded hover:bg-warning/90"
            >
              <PlayCircle className="w-3.5 h-3.5" /> {t('unfinished.resumeNow')}
            </button>
          ) : hasRawText ? (
            <button
              onClick={onResumeWithUploaded}
              className="flex items-center gap-1 px-3 py-1.5 bg-warning text-white text-xs rounded hover:bg-warning/90"
            >
              <PlayCircle className="w-3.5 h-3.5" /> {t('unfinished.resumeWithCurrent')}
            </button>
          ) : !restoringBlob ? (
            <span className="text-xs text-text-muted">
              {t('unfinished.blobLost')}
            </span>
          ) : null}
          <button
            onClick={onShowDetail}
            className="px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover rounded"
          >
            {t('unfinished.viewDetails')}
          </button>
          <button
            onClick={() => onDiscard()}
            className="px-3 py-1.5 text-xs text-text-muted hover:text-error rounded"
          >
            {t('unfinished.discard')}
          </button>
        </div>
      </div>
    </div>
  )
}
