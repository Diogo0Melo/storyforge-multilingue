import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ParsedChapter, ParsedVolume } from '../../lib/ai/parse-outline-output'
import type { TokenUsage } from '../../lib/ai/logger'
import AIStreamOutput from '../shared/AIStreamOutput'
import OutlinePreviewPanel from './OutlinePreviewPanel'

interface Props {
  output: string
  isStreaming: boolean
  error: string | null
  tokenUsage?: TokenUsage | null
  moduleKey: 'outline.volume' | 'outline.chapter'
  restructuring: boolean
  previewVolumes: ParsedVolume[] | null
  previewChapters: ParsedChapter[] | null
  previewTargetId: number | null
  selectedVolumeTitle?: string
  onStop: () => void
  onAccept: (text: string) => void
  onRetry: () => void
  onConfirmVolumes: () => void
  onConfirmChapters: () => void
  onCancelPreview: () => void
}

export default function OutlineGenerationResultPanel({
  output,
  isStreaming,
  error,
  tokenUsage,
  moduleKey,
  restructuring,
  previewVolumes,
  previewChapters,
  previewTargetId,
  selectedVolumeTitle,
  onStop,
  onAccept,
  onRetry,
  onConfirmVolumes,
  onConfirmChapters,
  onCancelPreview,
}: Props) {
  const { t } = useTranslation('outline')
  return (
    <>
      {(output || isStreaming || error) && (
        <AIStreamOutput
          output={output}
          isStreaming={isStreaming}
          error={error}
          tokenUsage={tokenUsage}
          onStop={onStop}
          onAccept={onAccept}
          onRetry={onRetry}
          moduleKey={moduleKey}
        />
      )}

      {restructuring && (
        <div className="flex items-center gap-2 text-xs text-accent">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('result.restructuring')}
        </div>
      )}

      {previewVolumes && (
        <OutlinePreviewPanel
          label={previewTargetId != null ? t('result.willCompleteVolume') : t('result.willCreateVolumes', { count: previewVolumes.length })}
          items={previewVolumes}
          onConfirm={onConfirmVolumes}
          onCancel={onCancelPreview}
        />
      )}

      {previewChapters && (
        <OutlinePreviewPanel
          label={previewTargetId != null
            ? t('result.willCompleteChapter')
            : t('result.willCreateChapters', { count: previewChapters.length, title: selectedVolumeTitle ?? '' })}
          items={previewChapters}
          onConfirm={onConfirmChapters}
          onCancel={onCancelPreview}
        />
      )}
    </>
  )
}
