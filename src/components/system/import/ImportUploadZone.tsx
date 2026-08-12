import { Upload, Sparkles, AlertTriangle, FileText, Wand2 } from 'lucide-react'
import { Trans } from 'react-i18next'
import { ACCEPT_ATTR } from '../../../lib/doc-parser'
import type { ChunkPlan } from '../../../lib/import/chunker'
import { useDomainT } from '../../../i18n'

interface Props {
  filename: string
  rawText: string
  loadingFile: boolean
  fileError: string | null
  extractInfo: string | null
  chunkSize: number
  previewPlans: ChunkPlan[] | null
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRawTextChange: (text: string) => void
  onStart: () => void
}

/**
 * 上传区：文件上传按钮 + textarea + 预切块提示 + 「开始解析」按钮。
 * 从 ImportDocPanel.tsx 抽出，纯受控组件。
 */
export default function ImportUploadZone({
  filename,
  rawText,
  loadingFile,
  fileError,
  extractInfo,
  chunkSize,
  previewPlans,
  onFile,
  onRawTextChange,
  onStart,
}: Props) {
  const { t } = useDomainT('system')
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-text-secondary">{t('uploadZone.contentLabel')}</label>
        <label
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded cursor-pointer ${
            loadingFile ? 'text-text-muted bg-bg-hover' : 'text-accent hover:bg-accent/10'
          }`}
        >
          <Upload className="w-3 h-3" />
          {loadingFile ? t('uploadZone.extracting') : t('uploadZone.uploadFile')}
          <input
            type="file"
            accept={ACCEPT_ATTR}
            disabled={loadingFile}
            className="hidden"
            onChange={onFile}
          />
        </label>
      </div>

      {fileError && (
        <div className="mb-1.5 px-2 py-1.5 bg-error/10 border border-error/30 rounded text-xs text-error flex items-start gap-1.5">
          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> {fileError}
        </div>
      )}

      {filename && !fileError && (
        <p className="text-xs text-text-muted mb-1.5 flex items-center gap-1">
          <FileText className="w-3 h-3" /> {filename}
          {extractInfo && <span className="ml-1 opacity-70">· {extractInfo}</span>}
        </p>
      )}

      <textarea
        value={rawText}
        onChange={e => onRawTextChange(e.target.value)}
        placeholder={t('uploadZone.textareaPlaceholder')}
        rows={10}
        className="w-full px-3 py-2 bg-bg-base border border-border rounded text-sm text-text-primary font-mono resize-y focus:outline-none focus:border-accent"
      />

      {/* 预切块预览 */}
      {previewPlans && previewPlans.length > 0 && (
        <div className="mt-2 text-xs text-text-muted flex items-center gap-1">
          <Wand2 className="w-3 h-3 text-accent" />
          <Trans
            i18nKey="uploadZone.previewChunks"
            ns="system"
            values={{
              count: previewPlans.length,
              chunkSize: chunkSize.toLocaleString(),
              totalChars: rawText.length.toLocaleString(),
            }}
            components={{ 1: <strong className="text-accent" /> }}
          />
        </div>
      )}

      {/* 开始按钮 */}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={onStart}
          disabled={!rawText.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-sm rounded hover:bg-accent-hover disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          {t('uploadZone.startParsing')}
        </button>
      </div>
    </div>
  )
}
