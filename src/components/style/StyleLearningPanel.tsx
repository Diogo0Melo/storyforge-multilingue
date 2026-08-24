import { useState, useEffect, useMemo, useRef } from 'react'
import { Sparkles, Brain, Loader2, Check, AlertCircle, Power, RotateCcw, X } from 'lucide-react'
import { useChapterStore } from '../../stores/chapter'
import { useUserStyleStore } from '../../stores/user-style'
import { useAIConfigStore } from '../../stores/ai-config'
import {
  parseStyleRevisionPairs,
} from '../../lib/style/style-learning'
import { countWords, htmlToPlainText } from '../../lib/utils/html'
import type { Project, ChapterStatus } from '../../lib/types'
import {
  STYLE_LEARNING_CHAPTER_CHARS_V1,
  STYLE_LEARNING_MAX_CHAPTERS_V1,
} from '../../lib/style/learning-agent'
import { useDomainT } from '../../i18n'
import StyleCalibrationPanel from './StyleCalibrationPanel'
import StyleRevisionPairsPanel from './StyleRevisionPairsPanel'
import { useStyleLearningAI } from './useStyleLearningAI'

interface Props {
  project: Project
}

/** 可作为文风语料的章节状态:用户亲手打磨过的 */
const CORPUS_STATUSES: ChapterStatus[] = ['revised', 'polished', 'final']
type StatusKey = 'revised' | 'polished' | 'final'
const STATUS_LABEL_KEY: Record<StatusKey, 'status.revised' | 'status.polished' | 'status.final'> = {
  revised: 'status.revised',
  polished: 'status.polished',
  final: 'status.final',
}
/** 每章取样上限(控 token);整体也按选中章数自然封顶 */
const PER_CHAPTER_CHARS = STYLE_LEARNING_CHAPTER_CHARS_V1
const MAX_CORPUS_CHAPTERS = STYLE_LEARNING_MAX_CHAPTERS_V1

const DURABLE_COPY = {
  en: {
    candidateTitle: 'Style profile candidate',
    candidateHint: (count: number, words: number) => `Based on ${count} chapters and about ${words.toLocaleString()} words. The candidate is saved; confirming it is required before the formal profile or downstream injection changes.`,
    candidateReady: 'A style candidate is ready for your review.',
    recovered: 'A pending style candidate was restored; the model was not called again.',
    adoptionPending: 'The adoption intent is saved and will finish safely when you confirm again.',
    recoveryBusy: 'Checking for a recoverable style-learning run…',
    adopted: 'The style profile was adopted after confirmation.',
    finished: 'The style-learning run finished without changing your formal profile.',
    abandon: 'Abandon the unresolved previous run',
    accept: 'Adopt profile',
    reject: 'Reject',
    retry: 'Learn again',
    candidateAria: 'Style profile candidate awaiting confirmation',
  },
  'pt-BR': {
    candidateTitle: 'Candidato de perfil de estilo',
    candidateHint: (count: number, words: number) => `Baseado em ${count} capítulos e cerca de ${words.toLocaleString()} palavras. O candidato foi salvo; é preciso confirmá-lo antes de alterar o perfil oficial ou a injeção nas próximas gerações.`,
    candidateReady: 'Há um candidato de estilo pronto para sua revisão.',
    recovered: 'Um candidato de estilo pendente foi recuperado; a IA não foi chamada novamente.',
    adoptionPending: 'A intenção de adoção foi salva e será concluída com segurança quando você confirmar novamente.',
    recoveryBusy: 'Verificando uma execução de aprendizado de estilo recuperável…',
    adopted: 'O perfil de estilo foi adotado após sua confirmação.',
    finished: 'O aprendizado de estilo terminou sem alterar seu perfil oficial.',
    abandon: 'Abandonar a execução anterior não resolvida',
    accept: 'Adotar perfil',
    reject: 'Recusar',
    retry: 'Aprender novamente',
    candidateAria: 'Candidato de perfil de estilo aguardando confirmação',
  },
  'zh-CN': {
    candidateTitle: '待确认文风画像',
    candidateHint: (count: number, words: number) => `基于 ${count} 章、约 ${words.toLocaleString()} 字。候选已持久化；确认前不会改写正式画像，也不会开启下游注入。`,
    candidateReady: '已有待你确认的文风候选。',
    recovered: '已恢复待确认文风候选；没有重复调用模型。',
    adoptionPending: '采纳意图已保存；再次确认即可沿原运行安全收敛。',
    recoveryBusy: '正在检查可恢复的文风学习运行…',
    adopted: '文风画像已确认写入。',
    finished: '文风学习运行已结束，正式画像没有变化。',
    abandon: '放弃结果不可判定的旧运行',
    accept: '确认采用画像',
    reject: '拒绝',
    retry: '重新学习',
    candidateAria: '待确认文风画像',
  },
} as const

export default function StyleLearningPanel({ project }: Props) {
  const { t, lang } = useDomainT('style')
  const durableCopy = DURABLE_COPY[lang as keyof typeof DURABLE_COPY] ?? DURABLE_COPY.en
  const { chapters, loadAll } = useChapterStore()
  const {
    profile,
    loadProfile,
    updateProfileText,
    setEnabled,
    updateRevisionPairNote,
    removeRevisionPair,
  } = useUserStyleStore()
  const aiConfig = useAIConfigStore(s => s.config)

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { loadAll(project.id!); loadProfile(project.id!) }, [project.id, loadAll, loadProfile])
  useEffect(() => { setDraft(profile?.profile || '') }, [profile?.profile])

  // 候选语料章节(已修改/已润色/定稿 + 有正文)
  const candidates = useMemo(
    () => chapters
      .filter(c => CORPUS_STATUSES.includes(c.status) && (c.content?.trim().length ?? 0) > 0)
      .sort((a, b) => a.order - b.order),
    [chapters],
  )

  // 默认选最近 6 个候选章节，避免旧项目一打开就把全部成稿送进模型。
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
  const hasLearnableSources = selected.length > 0 || revisionPairs.length > 0
  const hasProfile = !!profile?.profile.trim()
  const styleAI = useStyleLearningAI({
    projectId: project.id!,
    aiConfig,
    onCommitted: () => loadProfile(project.id!),
    onError: () => setError(t('learning.errorLearnFailed')),
  })

  const toggle = (id: number) => {
    if (!selectedIds.has(id) && selectedIds.size >= MAX_CORPUS_CHAPTERS) {
      setError(t('learning.errorMaxChapters', { max: MAX_CORPUS_CHAPTERS }))
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

  const handleLearn = () => {
    if (!hasLearnableSources) return
    setError(null)
    void styleAI.run(selected.map(chapter => chapter.id!))
  }

  const laneStatus = styleAI.lane.busy
    ? durableCopy.recoveryBusy
    : styleAI.lane.unsafeRunId != null
      ? durableCopy.abandon
      : styleAI.lane.candidate
        ? styleAI.lane.adoptionPending
          ? durableCopy.adoptionPending
          : styleAI.lane.message?.includes('恢复') ? durableCopy.recovered : durableCopy.candidateReady
        : styleAI.lane.message
          ? styleAI.lane.message.includes('确认写入') ? durableCopy.adopted : durableCopy.finished
          : null

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-5 space-y-5">
        {/* 标题 */}
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
            <Brain className="w-5 h-5 text-accent" /> {t('learning.title')}
          </h2>
          <p className="text-xs text-text-muted mt-1">
            {t('learning.subtitle')}
          </p>
        </div>

        {/* 语料选择 */}
        <div className="bg-bg-surface border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">{t('learning.corpusLabel')}</span>
            <span className="text-xs text-text-muted">
              {t('learning.selectedStats', { count: selected.length, words: sampleWords.toLocaleString() })}
            </span>
          </div>

          {candidates.length === 0 ? (
            <div className="flex items-start gap-2 text-xs text-text-muted bg-bg-base rounded p-3">
              <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <span>{t('learning.emptyCorpus')}</span>
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
                    {(() => {
                      const s = c.status
                      if (s === 'revised' || s === 'polished' || s === 'final') {
                        return t(STATUS_LABEL_KEY[s])
                      }
                      return s
                    })()}
                  </span>
                  <span className="text-[10px] text-text-muted shrink-0">
                    {t('learning.chapterWords', { count: (c.wordCount || c.content.length).toLocaleString() })}
                  </span>
                </label>
              ))}
            </div>
          )}

          <button
            onClick={handleLearn}
            disabled={styleAI.lane.busy || !!styleAI.lane.candidate || styleAI.lane.unsafeRunId != null || !hasLearnableSources}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {styleAI.lane.busy
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('learning.learnButtonRunning')}</>
              : <><Sparkles className="w-4 h-4" /> {hasProfile ? t('learning.learnButtonRelearn') : t('learning.learnButtonFirst')}</>}
          </button>

          <p className="text-[11px] leading-5 text-text-muted">
            {t('learning.learnHint', { maxChapters: MAX_CORPUS_CHAPTERS, maxChars: PER_CHAPTER_CHARS.toLocaleString() })}
          </p>

          {error && (
            <div className="flex items-start gap-2 text-xs text-error bg-error/10 rounded p-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}

          {laneStatus && (
            <p className="rounded bg-bg-base p-2 text-xs leading-5 text-text-muted">{laneStatus}</p>
          )}

          {styleAI.lane.unsafeRunId != null && (
            <button
              type="button"
              onClick={() => { void styleAI.abandonUnsafe() }}
              disabled={styleAI.lane.busy}
              className="w-full rounded border border-warning/40 px-3 py-2 text-xs font-medium text-warning hover:bg-warning/10 disabled:opacity-50"
            >
              {durableCopy.abandon}
            </button>
          )}
        </div>

        {styleAI.lane.candidate && (
          <div className="space-y-3 rounded-lg border border-accent/40 bg-accent/5 p-4" data-testid="style-learning-candidate">
            <div>
              <h3 className="text-sm font-medium text-text-primary">{durableCopy.candidateTitle}</h3>
              <p className="mt-1 text-[11px] leading-5 text-text-muted">
                {durableCopy.candidateHint(
                  styleAI.lane.candidate.baseline.sampleCount,
                  styleAI.lane.candidate.baseline.sampleWords,
                )}
              </p>
            </div>
            <textarea
              value={styleAI.lane.candidate.result}
              readOnly
              rows={16}
              aria-label={durableCopy.candidateAria}
              className="w-full resize-y rounded border border-accent/30 bg-bg-base px-3 py-2 font-mono text-sm leading-relaxed text-text-secondary focus:outline-none"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { void styleAI.accept() }}
                disabled={styleAI.lane.busy}
                className="inline-flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {styleAI.lane.busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {durableCopy.accept}
              </button>
              <button
                type="button"
                onClick={() => { void styleAI.reject() }}
                disabled={styleAI.lane.busy || styleAI.lane.adoptionPending}
                className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-error hover:text-error disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" /> {durableCopy.reject}
              </button>
              <button
                type="button"
                onClick={() => { void styleAI.retry() }}
                disabled={styleAI.lane.busy || styleAI.lane.adoptionPending}
                className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" /> {durableCopy.retry}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3 rounded-lg border border-border bg-bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-text-primary">{t('learning.revisionPairsSectionTitle')}</h3>
              <p className="mt-1 text-[11px] text-text-muted">
                {t('learning.revisionPairsSectionHint', { count: revisionPairs.length })}
              </p>
            </div>
          </div>
          <StyleRevisionPairsPanel
            pairs={revisionPairs}
            onUpdateNote={updateRevisionPairNote}
            onRemove={removeRevisionPair}
          />
        </div>

        {/* 画像展示 + 开关 */}
        {profile && hasProfile && (
          <div className="bg-bg-surface border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                <Check className="w-4 h-4 text-success" /> {t('learning.profileTitle')}
              </span>
              <button
                onClick={() => setEnabled(!profile.enabled)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  profile.enabled ? 'bg-success/15 text-success' : 'bg-text-muted/15 text-text-muted'
                }`}
                title={profile.enabled ? t('learning.toggleEnabled') : t('learning.toggleDisabled')}
              >
                <Power className="w-3.5 h-3.5" /> {profile.enabled ? t('learning.toggleOn') : t('learning.toggleOff')}
              </button>
            </div>

            <p className="text-[11px] text-text-muted">
              {t('learning.profileStats', { chapters: profile.sampleCount, words: profile.sampleWords.toLocaleString() })}
            </p>

            <textarea
              ref={taRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={() => { if (draft !== (profile.profile || '')) updateProfileText(draft) }}
              rows={16}
              placeholder={t('learning.profilePlaceholder')}
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
