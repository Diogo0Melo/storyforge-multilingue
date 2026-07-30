import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2, MessageSquareText, Save, Sparkles, Wrench } from 'lucide-react'
import { buildStyleCalibrationPrompt } from '../../lib/ai/adapters/style-adapter'
import { chat, resolveRequestConfig } from '../../lib/ai/client'
import { getAIConfigRequiredMessage, isAIConfigReady } from '../../lib/ai/config-readiness'
import {
  formatStyleCalibrationFeedback,
  formatStyleFewShotPairs,
  parseStyleCalibrationFeedback,
  parseStyleRevisionPairs,
} from '../../lib/style/style-learning'
import type { StyleCalibrationVerdict, UserStyleProfile } from '../../lib/types/user-style'
import { useAIConfigStore } from '../../stores/ai-config'
import { useUserStyleStore } from '../../stores/user-style'
import { useToast } from '../shared/Toast'

const MAX_CALIBRATION_SOURCE_CHARS = 1600

interface Props {
  projectId: number
  profile: UserStyleProfile
}

export default function StyleCalibrationPanel({ projectId, profile }: Props) {
  const { t } = useTranslation('panels')
  const aiConfig = useAIConfigStore(state => state.config)
  const captureRevisionPair = useUserStyleStore(state => state.captureRevisionPair)
  const addCalibrationFeedback = useUserStyleStore(state => state.addCalibrationFeedback)
  const toast = useToast()
  const [sourceText, setSourceText] = useState('')
  const [resultText, setResultText] = useState('')
  const [feedbackNote, setFeedbackNote] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const revisionPairs = useMemo(
    () => formatStyleFewShotPairs(parseStyleRevisionPairs(profile.revisionPairs)),
    [profile.revisionPairs],
  )
  const calibrationFeedback = useMemo(
    () => formatStyleCalibrationFeedback(parseStyleCalibrationFeedback(profile.calibrationFeedback)),
    [profile.calibrationFeedback],
  )
  const hasChangedResult = !!sourceText.trim()
    && !!resultText.trim()
    && sourceText.trim() !== resultText.trim()

  const generate = async () => {
    if (!sourceText.trim() || running) return
    const effectiveConfig = resolveRequestConfig(aiConfig, { category: 'style.calibrate' }).config
    if (!isAIConfigReady(effectiveConfig)) {
      setError(getAIConfigRequiredMessage(effectiveConfig))
      return
    }
    setRunning(true)
    setError(null)
    try {
      const messages = buildStyleCalibrationPrompt({
        profile: profile.profile,
        revisionPairs,
        calibrationFeedback,
        sourceText: sourceText.trim(),
      })
      const output = await chat(messages, aiConfig, {
        category: 'style.calibrate',
        projectId,
      })
      if (!output.trim()) {
        setError(t('style.calibration.noResult' as any))
        return
      }
      setResultText(output.trim())
    } catch (generateError) {
      console.error('[StyleCalibration] 生成失败:', generateError)
      setError(generateError instanceof Error ? generateError.message : t('style.calibration.generateFailed' as any))
    } finally {
      setRunning(false)
    }
  }

  const recordFeedback = async (verdict: StyleCalibrationVerdict) => {
    if (!resultText.trim()) return
    setError(null)
    try {
      await addCalibrationFeedback(projectId, {
        verdict,
        note: feedbackNote,
        sourceText,
        resultText,
      })
      toast.success(verdict === 'closer' ? t('style.calibration.recordedCloser' as any) : t('style.calibration.recordedAdjust' as any))
    } catch (feedbackError) {
      setError(t('style.calibration.feedbackFailed' as any, { error: feedbackError instanceof Error ? feedbackError.message : String(feedbackError) } as any))
    }
  }

  const savePair = async () => {
    if (!hasChangedResult) return
    setError(null)
    try {
      const pair = await captureRevisionPair(projectId, {
        chapterTitle: '互动校准样本',
        beforeText: sourceText,
        afterText: resultText,
        authorNote: feedbackNote,
      })
      if (!pair) return
      toast.success(t('style.calibration.sampleSaved' as any))
    } catch (pairError) {
      setError(t('style.calibration.sampleFailed' as any, { error: pairError instanceof Error ? pairError.message : String(pairError) } as any))
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-bg-surface p-4">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
          <Wrench className="h-4 w-4 text-accent" /> {t('style.calibration.title' as any)}
        </h3>
        <p className="mt-1 text-[11px] leading-5 text-text-muted">
          {t('style.calibration.desc' as any)}
        </p>
      </div>

      <textarea
        value={sourceText}
        onChange={event => setSourceText(event.target.value.slice(0, MAX_CALIBRATION_SOURCE_CHARS))}
        rows={6}
        placeholder={t('style.calibration.placeholder' as any)}
        className="w-full resize-y rounded border border-border bg-bg-base px-3 py-2 text-sm leading-relaxed text-text-secondary focus:border-accent focus:outline-none"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] text-text-muted">
          {t('style.calibration.charCount' as any, { count: sourceText.length.toLocaleString(), max: MAX_CALIBRATION_SOURCE_CHARS.toLocaleString() } as any)}
        </span>
        <button
          type="button"
          onClick={() => { void generate() }}
          disabled={running || !sourceText.trim()}
          className="inline-flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('style.calibration.generating' as any)}</>
            : <><Sparkles className="h-3.5 w-3.5" /> {t('style.calibration.generate' as any)}</>}
        </button>
      </div>

      {error && <p className="rounded bg-error/10 p-2 text-xs text-error">{error}</p>}

      {resultText && (
        <div className="space-y-2 border-t border-border pt-3">
          <label className="text-xs font-medium text-text-secondary" htmlFor="style-calibration-result">
            {t('style.calibration.resultLabel' as any)}
          </label>
          <textarea
            id="style-calibration-result"
            value={resultText}
            onChange={event => setResultText(event.target.value)}
            rows={7}
            className="w-full resize-y rounded border border-accent/30 bg-accent/5 px-3 py-2 text-sm leading-relaxed text-text-secondary focus:border-accent focus:outline-none"
          />
          <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
            <MessageSquareText className="h-3.5 w-3.5" /> {t('style.calibration.yourJudgement' as any)}
          </div>
          <input
            value={feedbackNote}
            onChange={event => setFeedbackNote(event.target.value.slice(0, 240))}
            placeholder={t('style.calibration.notePlaceholder' as any)}
            className="w-full rounded border border-border bg-bg-base px-2.5 py-1.5 text-xs text-text-secondary focus:border-accent focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { void recordFeedback('closer') }}
              className="inline-flex items-center gap-1 rounded bg-success/15 px-2.5 py-1.5 text-xs font-medium text-success hover:bg-success/25"
            >
              <Check className="h-3.5 w-3.5" /> {t('style.calibration.closer' as any)}
            </button>
            <button
              type="button"
              onClick={() => { void recordFeedback('needs-adjustment') }}
              className="inline-flex items-center gap-1 rounded bg-warning/15 px-2.5 py-1.5 text-xs font-medium text-warning hover:bg-warning/25"
            >
              <Wrench className="h-3.5 w-3.5" /> {t('style.calibration.needsAdjustment' as any)}
            </button>
            <button
              type="button"
              onClick={() => { void savePair() }}
              disabled={!hasChangedResult}
              className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" /> {t('style.calibration.saveSample' as any)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
