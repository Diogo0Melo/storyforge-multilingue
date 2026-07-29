import { useTranslation } from 'react-i18next'
import type { PreparedGenerationContext, OutlineGenerationRequest } from '../../lib/outline/generation-request'
import type { ChatMessage } from '../../lib/types'
import PromptPreviewGate from '../shared/PromptPreviewGate'
import OutlineGenerationBasis from './OutlineGenerationBasis'

interface Props {
  request: OutlineGenerationRequest
  preparedContext: PreparedGenerationContext | null
  loading: boolean
  error: string
  onRetry: () => void
  onCancel: () => void
  onConfirm: () => void
  messages?: ChatMessage[] | null
  transparentMode?: boolean
  promptReviewOpen?: boolean
  onTransparentModeChange?: (enabled: boolean) => void
  onClosePromptReview?: () => void
  onConfirmMessages?: (messages: ChatMessage[]) => void
}

const REQUEST_TITLE_KEYS: Record<OutlineGenerationRequest['kind'], string> = {
  volumes: 'request.titleVolumes',
  chapters: 'request.titleChapters',
  'single-volume': 'request.titleSingleVolume',
  'single-chapter': 'request.titleSingleChapter',
}

export default function OutlineGenerationRequestPanel({
  request,
  preparedContext,
  loading,
  error,
  onRetry,
  onCancel,
  onConfirm,
  messages = null,
  transparentMode = false,
  promptReviewOpen = false,
  onTransparentModeChange,
  onClosePromptReview,
  onConfirmMessages,
}: Props) {
  const { t } = useTranslation('outline')

  if (promptReviewOpen && messages && onClosePromptReview && onConfirmMessages) {
    return (
      <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-3">
        <PromptPreviewGate
          messages={messages}
          onBack={onClosePromptReview}
          onConfirm={onConfirmMessages}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="text-xs leading-5 text-text-secondary">
          <span className="font-medium text-text-primary">{t(REQUEST_TITLE_KEYS[request.kind] as any)}</span>
          <span className="ml-2">
            {request.kind === 'single-chapter'
              ? t('request.singleChapterNote')
              : t('request.defaultNote')}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {error && (
            <button
              onClick={onRetry}
              className="px-2.5 py-1 text-xs text-accent border border-accent/30 rounded hover:bg-accent/10"
            >
              {t('request.reRead')}
            </button>
          )}
          <button
            onClick={onCancel}
            className="px-2.5 py-1 text-xs text-text-muted border border-border rounded hover:text-text-primary"
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || Boolean(error) || !preparedContext}
            className="px-2.5 py-1 text-xs text-white bg-accent rounded hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {transparentMode ? t('request.previewPrompt') : t('request.confirmGenerate')}
          </button>
        </div>
      </div>
      <label className="flex cursor-pointer items-start gap-2 rounded border border-border/70 bg-bg-base/60 px-2.5 py-2 text-xs">
        <input
          type="checkbox"
          checked={transparentMode}
          onChange={event => onTransparentModeChange?.(event.target.checked)}
          className="mt-0.5 accent-accent"
        />
        <span>
          <span className="font-medium text-text-secondary">{t('request.transparentTitle')}</span>
          <span className="ml-2 text-[10px] text-text-muted">
            {t('request.transparentDesc')}
          </span>
        </span>
      </label>
      <div className="border-t border-accent/20 pt-3">
        <OutlineGenerationBasis
          context={preparedContext?.assembled ?? null}
          loading={loading}
          error={error}
        />
      </div>
    </div>
  )
}
