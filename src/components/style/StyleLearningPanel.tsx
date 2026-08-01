import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Brain, Loader2, Check, AlertCircle, Power } from 'lucide-react'
import { useChapterStore } from '../../stores/chapter'
import { useUserStyleStore } from '../../stores/user-style'
import { useAIConfigStore } from '../../stores/ai-config'
import { buildStyleLearnPrompt } from '../../lib/ai/adapters/style-adapter'
import { chat, resolveRequestConfig } from '../../lib/ai/client'
import { getAIConfigRequiredMessage, isAIConfigReady } from '../../lib/ai/config-readiness'
import {
  formatStyleCalibrationFeedback,
  formatStyleFewShotPairs,
  parseStyleCalibrationFeedback,
  parseStyleRevisionPairs,
} from '../../lib/style/style-learning'
import { countWords, htmlToPlainText } from '../../lib/utils/html'
import type { Project, Chapter, ChapterStatus } from '../../lib/types'
import StyleCalibrationPanel from './StyleCalibrationPanel'
import StyleRevisionPairsPanel from './StyleRevisionPairsPanel'
import type { PanelsKeys } from '../../i18n/generated-resources'

interface Props {
  project: Project
}

const CORPUS_STATUSES: ChapterStatus[] = ['revised', 'polished', 'final']
const STATUS_LABEL_KEYS = { revised: 'style.status.revised', polished: 'style.status.polished', final: 'style.status.final' } as const satisfies Partial<Record<ChapterStatus, PanelsKeys>>
const PER_CHAPTER_CHARS = 2500
const MAX_CORPUS_CHAPTERS = 6

export default function StyleLearningPanel({ project }: Props) {
  const { t } = useTranslation('panels')
  const { chapters, loadAll } = useChapterStore()
  const {
    profile,
    loadProfile,
    saveProfile,
    updateProfileText,
    setEnabled,
    updateRevisionPairNote,
    removeRevisionPair,
  } = useUserStyleStore()
  const aiConfig = useAIConfigStore(s => s.config)

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { loadAll(project.id!); loadProfile(project.id!) }, [project.id, loadAll, loadProfile])
  useEffect(() => { setDraft(profile?.profile || '') }, [profile?.profile])

  const candidates = useMemo(
    () => chapters
      .filter(c => CORPUS_STATUSES.includes(c.status) && (c.content?.trim().length ?? 0) > 0)
      .sort((a, b) => a.order - b.order),
    [chapters],
  )

  useEffect(() => {
    setSelectedIds(new Set(candidates.slice(-MAX_CORPUS_CHAPTERS).map(c => c.id!)))
  }, [candidates])

  const selected = candidates.filter(c => selectedIds.has(c.id!))
  const sampleWords = selected.reduce((sum, chapter) => {
    const sample = htmlToPlainText(chapter.content).trim().slice(0, PER_CHAPTER_CHARS)
    return sum + countWords(sample)
  }, 0)
  const revisionPairs = useMemo(
    () => parseStyleRevisionPairs(profile?.revisionPairs),
    [profile?.revisionPairs],
  )
  const formattedRevisionPairs = useMemo(
    () => formatStyleFewShotPairs(revisionPairs),
    [revisionPairs],
  )
  const formattedCalibrationFeedback = useMemo(
    () => formatStyleCalibrationFeedback(
      parseStyleCalibrationFeedback(profile?.calibrationFeedback),
    ),
    [profile?.calibrationFeedback],
  )
  const hasLearnableSources = selected.length > 0 || revisionPairs.length > 0
  const hasProfile = !!profile?.profile.trim()

  const toggle = (id: number) => {
    if (!selectedIds.has(id) && selectedIds.size >= MAX_CORPUS_CHAPTERS) {
      setError(t('style.learning.maxChapters', { count: MAX_CORPUS_CHAPTERS }))
      return
    }
    setError(null)
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const buildSamples = (chs: Chapter[]): string =>
    chs.map((c, i) => {
      const plain = htmlToPlainText(c.content).trim()
      const body = plain.slice(0, PER_CHAPTER_CHARS)
      const more = plain.length > PER_CHAPTER_CHARS ? '\n(...excerpt, rest omitted)' : ''
      return `[Sample ${i + 1} - ${c.title}]\n${body}${more}`
    }).join('\n\n--------\n\n')

  const handleLearn = async () => {
    if (!hasLearnableSources) return
    const effectiveConfig = resolveRequestConfig(aiConfig, { category: 'style.learn' }).config
    if (!isAIConfigReady(effectiveConfig)) {
      setError(getAIConfigRequiredMessage(effectiveConfig))
      return
    }
    setRunning(true)
    setError(null)
    try {
      const samples = buildSamples(selected)
      const messages = buildStyleLearnPrompt(samples, selected.length, sampleWords, {
        revisionPairs: formattedRevisionPairs,
        calibrationFeedback: formattedCalibrationFeedback,
      })
      const out = await chat(messages, aiConfig, { category: 'style.learn', projectId: project.id! })
      const text = out.trim()
      if (!text) { setError(t('style.learning.noContent')); return }
      await saveProfile(project.id!, {
        profile: text,
        sourceChapterIds: selected.map(c => c.id!),
        sampleCount: selected.length,
        sampleWords,
      })
    } catch (e) {
      console.error('[StyleLearning] learn failed:', e)
      setError(e instanceof Error ? e.message : t('style.learning.failed'))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-5 space-y-5">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
            <Brain className="w-5 h-5 text-accent" /> {t('style.learning.title')}
          </h2>
          <p className="text-xs text-text-muted mt-1">
            {t('style.learning.subtitle')}
          </p>
        </div>

        <div className="bg-bg-surface border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">{t('style.learning.corpus')}</span>
            <span className="text-xs text-text-muted">
              {t('style.learning.selectedChapters', { count: selected.length, words: sampleWords.toLocaleString() })}
            </span>
          </div>

          {candidates.length === 0 ? (
            <div className="flex items-start gap-2 text-xs text-text-muted bg-bg-base rounded p-3">
              <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <span>{t('style.learning.noChapters')}</span>
            </div>
          ) : (
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {candidates.map(c => (
                <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg-base cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id!)}
                    onChange={() => toggle(c.id!)}
                    className="accent-accent"
                  />
                  <span className="text-sm text-text-primary flex-1 truncate">{c.title}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent shrink-0">
                    {c.status in STATUS_LABEL_KEYS ? t(STATUS_LABEL_KEYS[c.status as keyof typeof STATUS_LABEL_KEYS]!) : c.status}
                  </span>
                  <span className="text-[10px] text-text-muted shrink-0">{(c.wordCount || c.content.length).toLocaleString()}</span>
                </label>
              ))}
            </div>
          )}

          <button
            onClick={handleLearn}
            disabled={running || !hasLearnableSources}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {running
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('style.learning.learning')}</>
              : <><Sparkles className="w-4 h-4" /> {hasProfile ? t('style.learning.relearn') : t('style.learning.learn')}</>}
          </button>

          <p className="text-[11px] leading-5 text-text-muted">
            {t('style.learning.limit', { chapters: MAX_CORPUS_CHAPTERS, chars: PER_CHAPTER_CHARS.toLocaleString() })}
          </p>

          {error && (
            <div className="flex items-start gap-2 text-xs text-error bg-error/10 rounded p-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-text-primary">{t('style.learning.revisionPairs')}</h3>
              <p className="mt-1 text-[11px] text-text-muted">
                {t('style.learning.pairsCount', { count: revisionPairs.length })}
              </p>
            </div>
          </div>
          <StyleRevisionPairsPanel
            pairs={revisionPairs}
            onUpdateNote={updateRevisionPairNote}
            onRemove={removeRevisionPair}
          />
        </div>

        {profile && hasProfile && (
          <div className="bg-bg-surface border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                <Check className="w-4 h-4 text-success" /> {t('style.learning.myProfile')}
              </span>
              <button
                onClick={() => setEnabled(!profile.enabled)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  profile.enabled ? 'bg-success/15 text-success' : 'bg-text-muted/15 text-text-muted'
                }`}
                title={profile.enabled ? t('style.learning.enabledInject') : t('style.learning.disabledInject')}
              >
                <Power className="w-3.5 h-3.5" /> {profile.enabled ? t('style.learning.injecting') : t('style.learning.disabled')}
              </button>
            </div>

            <p className="text-[11px] text-text-muted">
              {t('style.learning.profileBased', { chapters: profile.sampleCount, words: profile.sampleWords.toLocaleString() })} {t('style.learning.profileEditable')}
            </p>

            <textarea
              ref={taRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={() => { if (draft !== (profile.profile || '')) updateProfileText(draft) }}
              rows={16}
              placeholder={t('style.learning.profilePlaceholder')}
              className="w-full px-3 py-2 bg-bg-base border border-border rounded text-sm text-text-secondary leading-relaxed resize-y focus:outline-none focus:border-accent font-mono"
            />
          </div>
        )}

        {profile && hasProfile && (
          <StyleCalibrationPanel projectId={project.id!} profile={profile} />
        )}
      </div>
    </div>
  )
}
