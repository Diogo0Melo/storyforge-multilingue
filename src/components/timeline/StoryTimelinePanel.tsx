/**
 * 故事进程年表 — Phase 25.5.2-a
 *
 * 下游提取产物：AI 从已写正文中提取剧情大事，按故事进程排列。
 * 与「历史年表（世界背景）」「故事线（结构）」严格区分。
 */
import { useState, useEffect, useMemo } from 'react'
import { CalendarClock, Sparkles, Loader2, Trash2, Plus, BookOpen, Flag } from 'lucide-react'
import { useStoryTimelineStore } from '../../stores/story-timeline'
import { useChapterStore } from '../../stores/chapter'
import { useAIConfigStore } from '../../stores/ai-config'
import { chat, resolveRequestConfig } from '../../lib/ai/client'
import { getAIConfigRequiredMessage, isAIConfigReady } from '../../lib/ai/config-readiness'
import {
  buildStoryTimelinePrompt, parseStoryEvents, type ExtractedStoryEvent,
} from '../../lib/ai/adapters/story-timeline-adapter'
import { htmlToPlainText } from '../../lib/utils/html'
import type { Project } from '../../lib/types'
import { splitExtractionText, uniqueBy } from '../../lib/ai/structured-extraction'
import { adopt } from '../../lib/registry/adopt'
import { assembleContext } from '../../lib/registry/assemble-context'
import { useDomainT } from '../../i18n'

interface Props {
  project: Project
  onOpenChapter?: (chapterId: number) => void
}

const IMPORTANCE_STYLE: Record<number, string> = {
  1: 'bg-bg-elevated text-text-muted',
  2: 'bg-blue-500/10 text-blue-400',
  3: 'bg-amber-500/15 text-amber-400',
}

const IMPORTANCE_KEYS: Record<number, string> = {
  1: 'importance.minor',
  2: 'importance.important',
  3: 'importance.critical',
}

/** 本 ns 自有错误的语义键：只在状态里存键，渲染时才翻译（ready/切语言后自动刷新）。 */
type TimelineErrorKey = 'errors.noWrittenChapters'

export default function StoryTimelinePanel({ project, onOpenChapter }: Props) {
  const { t, ready } = useDomainT('timeline')
  const { events, loading, loadAll, addEvent, updateEvent, deleteEvent, deleteByChapter } = useStoryTimelineStore()
  const { chapters, loadAll: loadChapters } = useChapterStore()
  const aiConfig = useAIConfigStore(s => s.config)

  const [extracting, setExtracting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  // 语义键错误在渲染期翻译；来自 lib 的消息（errors-lib 预加载，恒 ready）保持预译字符串。
  const [error, setError] = useState<{ key: TimelineErrorKey } | { message: string } | null>(null)

  useEffect(() => {
    loadAll(project.id!)
    loadChapters(project.id!)
  }, [project.id, loadAll, loadChapters])

  // 按章节进程排序（章节顺序 = 故事进程），同章按 order
  const sorted = useMemo(() => {
    const chapterOrder = new Map<number, number>()
    chapters.forEach((c, i) => { if (c.id != null) chapterOrder.set(c.id, i) })
    return [...events].sort((a, b) => {
      const ca = a.chapterId != null ? (chapterOrder.get(a.chapterId) ?? 9999) : 9999
      const cb = b.chapterId != null ? (chapterOrder.get(b.chapterId) ?? 9999) : 9999
      if (ca !== cb) return ca - cb
      return a.order - b.order
    })
  }, [events, chapters])

  const writtenChapters = useMemo(
    () => chapters.filter(c => c.content && htmlToPlainText(c.content).trim().length > 50),
    [chapters],
  )

  // timeline 是懒加载命名空间：ready 前不渲染任何文案，也不允许触发会把翻译
  // 写进状态或持久化的动作（手动添加的默认事件标题是 A4 持久化数据）。
  if (!ready) return null

  const handleExtract = async () => {
    const effectiveConfig = resolveRequestConfig(aiConfig, { category: 'story.timeline', outputKind: 'functional-structured' }).config
    if (!isAIConfigReady(effectiveConfig)) { setError({ message: getAIConfigRequiredMessage(effectiveConfig) }); return }
    if (writtenChapters.length === 0) { setError({ key: 'errors.noWrittenChapters' }); return }
    setExtracting(true)
    setError(null)
    setProgress({ done: 0, total: writtenChapters.length })
    try {
      for (let i = 0; i < writtenChapters.length; i++) {
        const ch = writtenChapters[i]
        try {
          const found: ExtractedStoryEvent[] = []
          const chapterSource = await assembleContext({
            projectId: project.id!,
            chapterId: ch.id,
            sourceKeys: ['chapterContent'],
          })
          for (const chunk of splitExtractionText(chapterSource.text)) {
            const messages = buildStoryTimelinePrompt(ch.title, chunk)
            // WS-3B P2-C：事件抽取输出纯 JSON 数组，高置信结构化调用，不注入文本语言约束。
            const raw = await chat(messages, aiConfig, { category: 'story.timeline', outputKind: 'functional-structured', projectId: project.id! })
            found.push(...parseStoryEvents(raw))
          }
          const parsed = uniqueBy(
            found,
            event => `${event.title.trim().toLocaleLowerCase()}\u0000${event.storyTime.trim()}`,
          )
          if (ch.id != null) await deleteByChapter(project.id!, ch.id)
          if (parsed.length > 0) {
            await adopt({
              projectId: project.id!,
              target: 'storyTimelineEvents',
              mode: 'add-many',
              data: parsed.map((e, idx) => ({
                title: e.title,
                storyTime: e.storyTime || '',
                importance: e.importance,
                description: e.description || '',
                chapterId: ch.id ?? null,
                chapterTitle: ch.title,
                order: idx,
              })),
            })
            await loadAll(project.id!)
          }
        } catch (err) {
          console.error('[StoryTimeline] 章节提取失败:', ch.title, err)
        }
        setProgress({ done: i + 1, total: writtenChapters.length })
      }
    } finally {
      setExtracting(false)
      setProgress(null)
    }
  }

  const handleManualAdd = async () => {
    await addEvent({
      projectId: project.id!,
      title: t('actions.newEventTitle'),
      importance: 2,
      order: events.length,
    })
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="pb-4 border-b border-border/40">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
              <CalendarClock className="w-5 h-5" /> {t('panel.title')}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              {t('panel.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleManualAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-bg-elevated text-text-secondary border border-border hover:text-text-primary transition-colors">
              <Plus className="w-3.5 h-3.5" /> {t('actions.manualAdd')}
            </button>
            <button onClick={handleExtract} disabled={extracting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
              {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {extracting ? t('actions.extracting', { done: progress?.done, total: progress?.total }) : t('actions.extractFromText')}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {'key' in error ? t(error.key) : error.message}
        </div>
      )}

      {extracting && progress && (
        <div className="p-3 bg-accent/10 border border-accent/20 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-accent mb-1.5">
            <Loader2 className="w-4 h-4 animate-spin" /> {t('progress.extracting', { done: progress.done, total: progress.total })}
          </div>
          <div className="h-1.5 bg-bg-base rounded-full overflow-hidden">
            <div className="h-full bg-accent transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-text-muted text-sm py-8 text-center">{t('empty.loading')}</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <CalendarClock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t('empty.noTimeline')}</p>
          <p className="text-xs mt-1">{t('empty.noTimelineHint')}</p>
        </div>
      ) : (
        <div className="relative pl-6 border-l border-border/80 space-y-3 ml-2">
          {sorted.map(e => (
            <div key={e.id} className="relative group">
              <span className={`absolute -left-[31px] top-2 w-2.5 h-2.5 rounded-full border-2 bg-bg-base ${
                e.importance === 3 ? 'border-amber-500 ring-4 ring-amber-500/10'
                  : e.importance === 2 ? 'border-blue-500 ring-4 ring-blue-500/10'
                  : 'border-text-muted'
              }`} />
              <div className="bg-bg-surface border border-border rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  {e.storyTime && <span className="text-xs font-mono text-text-secondary">{e.storyTime}</span>}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${IMPORTANCE_STYLE[e.importance]}`}>
                    {t(IMPORTANCE_KEYS[e.importance] as never)}
                  </span>
                  {e.chapterTitle && (
                    <button
                      onClick={() => e.chapterId != null && onOpenChapter?.(e.chapterId)}
                      disabled={e.chapterId == null || !onOpenChapter}
                      className="inline-flex items-center gap-1 text-[10px] text-accent hover:underline disabled:text-text-muted disabled:no-underline"
                      title={t('event.jumpToChapter')}
                    >
                      <BookOpen className="w-3 h-3" /> {e.chapterTitle}
                    </button>
                  )}
                  <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <select
                      value={e.importance}
                      onChange={ev => updateEvent(e.id!, { importance: Number(ev.target.value) })}
                      className="bg-bg-base border border-border rounded text-[10px] px-1 py-0.5 text-text-secondary"
                    >
                      <option value={1}>{t('importance.minor')}</option>
                      <option value={2}>{t('importance.important')}</option>
                      <option value={3}>{t('importance.critical')}</option>
                    </select>
                    <button onClick={() => deleteEvent(e.id!)} className="p-0.5 text-text-muted hover:text-red-400">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  {e.importance === 3 && <Flag className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />}
                <input
                  value={e.title}
                  onChange={ev => updateEvent(e.id!, { title: ev.target.value })}
                  className="w-full bg-transparent text-sm font-medium text-text-primary outline-none"
                />
                </div>
                {e.description && <p className="text-xs text-text-muted mt-0.5">{e.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
