import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Search, Replace, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { useBackupStore } from '../../stores/backup'
import { useChapterStore } from '../../stores/chapter'
import { useCharacterStore } from '../../stores/character'
import { useDialog } from '../shared/Dialog'
import { useToast } from '../shared/Toast'
import {
  buildChapterSearchTargets,
  findChapterMatches,
  type ChapterMatchPreview,
  type FindReplaceOptions,
} from '../../lib/editor/find-replace'
import {
  countPlannedReplacements,
  executeFindReplace,
  undoFindReplace,
  type ReplaceMode,
  type FindReplaceUndoPatch,
} from '../../lib/editor/find-replace-operation'
import type { Chapter, OutlineNode } from '../../lib/types'
import EntityRenamePanel from './EntityRenamePanel'

type SearchScope = 'chapter' | 'book'

interface Props {
  projectId: number
  chapters: Chapter[]
  outlineNodes: OutlineNode[]
  selectedOutlineNodeId: number | null
  onSelectOutlineNode: (outlineNodeId: number) => void
  onClose: () => void
}

function formatTime(ts: number): string {
  const date = new Date(ts)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export default function FindReplacePanel({
  projectId,
  chapters,
  outlineNodes,
  selectedOutlineNodeId,
  onSelectOutlineNode,
  onClose,
}: Props) {
  const { t } = useTranslation('editor')
  const dialog = useDialog()
  const toast = useToast()
  const { updateChapter } = useChapterStore()
  const { createSnapshot } = useBackupStore()
  const characters = useCharacterStore(state => state.characters)
  const queryInputRef = useRef<HTMLInputElement | null>(null)

  const [scope, setScope] = useState<SearchScope>('chapter')
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [selected, setSelected] = useState<{ chapterId: number; occurrenceIndex: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [undoPatch, setUndoPatch] = useState<FindReplaceUndoPatch | null>(null)
  const [panelMode, setPanelMode] = useState<'text' | 'entity'>('text')

  useEffect(() => {
    queryInputRef.current?.focus()
  }, [])

  const protectedTerms = useMemo(() => {
    const names = characters
      .filter(character => character.projectId === projectId)
      .map(character => character.name.trim())
      .filter(Boolean)
    return Array.from(new Set(names))
  }, [characters, projectId])

  const searchOptions: FindReplaceOptions = useMemo(() => ({
    query,
    caseSensitive,
    wholeWord,
    useRegex,
    protectedTerms,
  }), [query, caseSensitive, wholeWord, useRegex, protectedTerms])

  const targets = useMemo(() => {
    const all = buildChapterSearchTargets(chapters, outlineNodes)
    if (scope === 'book') return all
    return all.filter(target => target.outlineNodeId === selectedOutlineNodeId)
  }, [chapters, outlineNodes, scope, selectedOutlineNodeId])

  const matches = useMemo(() => {
    if (!query.trim()) return []
    try {
      return targets
        .map(target => findChapterMatches(target, searchOptions))
        .filter((item): item is ChapterMatchPreview => !!item)
    } catch (error) {
      return [{ chapterId: -1, outlineNodeId: -1, title: t('findReplace.searchError'), count: 0, occurrences: [{
        occurrenceIndex: 0,
        matchText: '',
        snippet: error instanceof Error ? error.message : String(error),
      }] }]
    }
  }, [query, searchOptions, targets])

  const totalMatches = matches.reduce((sum, item) => sum + item.count, 0)
  const affectedChapters = matches.filter(match => match.chapterId > 0).length
  const flatOccurrences = matches
    .filter(match => match.chapterId > 0 && match.count > 0)
    .flatMap(match => match.occurrences.map(occurrence => ({
      chapterId: match.chapterId,
      outlineNodeId: match.outlineNodeId,
      occurrenceIndex: occurrence.occurrenceIndex,
    })))
  const activeSelected = selected && matches.some(match =>
    match.chapterId === selected.chapterId
    && match.occurrences.some(occurrence => occurrence.occurrenceIndex === selected.occurrenceIndex),
  )
    ? selected
    : null
  const selectedChapterMatch = activeSelected
    ? matches.find(match => match.chapterId === activeSelected.chapterId)
    : null
  const activeFlatIndex = activeSelected
    ? flatOccurrences.findIndex(item =>
      item.chapterId === activeSelected.chapterId
      && item.occurrenceIndex === activeSelected.occurrenceIndex,
    )
    : -1

  const selectFlatOccurrence = (offset: -1 | 1) => {
    if (!flatOccurrences.length) return
    const base = activeFlatIndex >= 0 ? activeFlatIndex : (offset > 0 ? -1 : 0)
    const nextIndex = (base + offset + flatOccurrences.length) % flatOccurrences.length
    const next = flatOccurrences[nextIndex]
    setSelected({ chapterId: next.chapterId, occurrenceIndex: next.occurrenceIndex })
    if (next.outlineNodeId > 0) onSelectOutlineNode(next.outlineNodeId)
  }

  const applyReplace = async (mode: ReplaceMode) => {
    if (!query.trim()) {
      toast.error(t('findReplace.enterQueryError'))
      return
    }
    if (!totalMatches) {
      toast.info(t('findReplace.noMatchesInfo'))
      return
    }

    const selectedChapterId = activeSelected?.chapterId ?? matches[0]?.chapterId
    const chaptersToReplace = mode === 'book'
      ? targets
      : mode === 'chapter'
        ? targets.filter(target => target.id === selectedChapterId || (selectedChapterId == null && target.outlineNodeId === selectedOutlineNodeId))
        : targets.filter(target => target.id === selectedChapterId)

    if (!chaptersToReplace.length) {
      toast.error(t('findReplace.noChaptersError'))
      return
    }

    const plan = countPlannedReplacements(chaptersToReplace, searchOptions, mode)

    const ok = await dialog.confirm({
      title: t('findReplace.confirmTitle'),
      message: t('findReplace.confirmMessage', { count: plan.count, chapters: plan.affectedChapters }),
      confirmText: t('findReplace.confirmAction'),
      cancelText: t('cancel'),
      tone: mode === 'book' ? 'danger' : 'info',
    })
    if (!ok) return

    setBusy(true)
    try {
      const result = await executeFindReplace({
        mode,
        targets: chaptersToReplace,
        chapters,
        options: { ...searchOptions, replacement },
        projectId,
        selected: activeSelected,
        createSnapshot,
        updateChapter,
        label: t('findReplace.snapshotLabel', { time: formatTime(Date.now()) }),
      })

      setUndoPatch(result.undoPatch)
      setSelected(null)
      toast.success(t('findReplace.replaceSuccess', { count: result.replaced }))
    } catch (error) {
      toast.error(t('findReplace.replaceFailed', { error: error instanceof Error ? error.message : String(error) }))
    } finally {
      setBusy(false)
    }
  }

  const handleUndo = async () => {
    if (!undoPatch) return
    const ok = await dialog.confirm({
      title: t('findReplace.undoTitle'),
      message: t('findReplace.undoMessage', { chapters: undoPatch.chapters.length, label: undoPatch.label }),
      confirmText: t('findReplace.undoLast'),
      cancelText: t('cancel'),
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    try {
      await undoFindReplace(undoPatch, updateChapter)
      setUndoPatch(null)
      toast.success(t('findReplace.undoSuccess'))
    } catch (error) {
      toast.error(t('findReplace.undoFailed', { error: error instanceof Error ? error.message : String(error) }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-bg-surface shadow-theme-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium text-text-primary">
            {panelMode === 'text' ? t('findReplace.titleText') : t('findReplace.titleEntity')}
          </p>
          <p className="text-[11px] text-text-muted">
            {panelMode === 'text'
              ? t('findReplace.descText')
              : t('findReplace.descEntity')}
          </p>
        </div>
        <button onClick={onClose} className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary" aria-label={t('findReplace.closeLabel')}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-1 border-b border-border px-4 pt-2">
        <button
          onClick={() => setPanelMode('text')}
          className={`rounded-t-md px-3 py-1.5 text-xs ${
            panelMode === 'text' ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          {t('findReplace.tabText')}
        </button>
        <button
          onClick={() => setPanelMode('entity')}
          className={`rounded-t-md px-3 py-1.5 text-xs ${
            panelMode === 'entity' ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          {t('findReplace.tabEntity')}
        </button>
      </div>

      {panelMode === 'entity' ? (
        <EntityRenamePanel projectId={projectId} onSelectOutlineNode={onSelectOutlineNode} />
      ) : (
      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[11px] text-text-muted">{t('findReplace.findLabel')}</span>
              <input
                ref={queryInputRef}
                value={query}
                onChange={event => { setQuery(event.target.value); setSelected(null) }}
                placeholder={t('findReplace.findPlaceholder')}
                className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-text-muted">{t('findReplace.replaceLabel')}</span>
              <input
                value={replacement}
                onChange={event => setReplacement(event.target.value)}
                placeholder={t('findReplace.replacePlaceholder')}
                className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-base px-2 py-1 text-text-secondary">
              <input type="radio" checked={scope === 'chapter'} onChange={() => { setScope('chapter'); setSelected(null) }} />
              {t('findReplace.scopeChapter')}
            </label>
            <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-base px-2 py-1 text-text-secondary">
              <input type="radio" checked={scope === 'book'} onChange={() => { setScope('book'); setSelected(null) }} />
              {t('findReplace.scopeBook')}
            </label>
            <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-base px-2 py-1 text-text-secondary">
              <input type="checkbox" checked={wholeWord} onChange={event => { setWholeWord(event.target.checked); setSelected(null) }} />
              {t('findReplace.wholeWord')}
            </label>
            <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-base px-2 py-1 text-text-secondary">
              <input type="checkbox" checked={caseSensitive} onChange={event => { setCaseSensitive(event.target.checked); setSelected(null) }} />
              {t('findReplace.caseSensitive')}
            </label>
            <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-base px-2 py-1 text-text-secondary">
              <input type="checkbox" checked={useRegex} onChange={event => { setUseRegex(event.target.checked); setSelected(null) }} />
              {t('findReplace.regex')}
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void applyReplace('one')}
              disabled={busy || !totalMatches}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
            >
              <Replace className="h-3.5 w-3.5" /> {t('findReplace.replaceOne')}
            </button>
            <button
              onClick={() => void applyReplace('chapter')}
              disabled={busy || !totalMatches}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
            >
              <Replace className="h-3.5 w-3.5" /> {t('findReplace.replaceChapter')}
            </button>
            <button
              onClick={() => void applyReplace('book')}
              disabled={busy || !totalMatches}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> {t('findReplace.replaceBook')}
            </button>
            {undoPatch && (
              <button
                onClick={() => void handleUndo()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-warning hover:bg-warning/20 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" /> {t('findReplace.undoLast')}
              </button>
            )}
          </div>
        </div>

        <aside className="rounded-lg border border-border bg-bg-base p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary">
              <Search className="h-3.5 w-3.5" /> {t('findReplace.hits')}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => selectFlatOccurrence(-1)}
                disabled={!flatOccurrences.length}
                className="rounded border border-border bg-bg-surface p-1 text-text-muted hover:text-text-primary disabled:opacity-40"
                title={t('findReplace.prevHit')}
                aria-label={t('findReplace.prevHitLabel')}
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <button
                onClick={() => selectFlatOccurrence(1)}
                disabled={!flatOccurrences.length}
                className="rounded border border-border bg-bg-surface p-1 text-text-muted hover:text-text-primary disabled:opacity-40"
                title={t('findReplace.nextHit')}
                aria-label={t('findReplace.nextHitLabel')}
              >
                <ChevronRight className="h-3 w-3" />
              </button>
              <span className="text-[11px] text-text-muted">{t('findReplace.hitCount', { total: totalMatches, chapters: affectedChapters })}</span>
            </div>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {!query.trim() && <p className="py-8 text-center text-xs text-text-muted">{t('findReplace.emptyHint')}</p>}
            {query.trim() && !totalMatches && <p className="py-8 text-center text-xs text-text-muted">{t('findReplace.noMatches')}</p>}
            {matches.map(match => (
              <div key={match.chapterId} className="space-y-1">
                <button
                  onClick={() => {
                    if (match.outlineNodeId > 0) onSelectOutlineNode(match.outlineNodeId)
                  }}
                  className="w-full truncate text-left text-[11px] font-medium text-accent hover:underline"
                >
                  {t('findReplace.chapterHitCount', { title: match.title, count: match.count })}
                </button>
                {match.occurrences.slice(0, 5).map(occurrence => {
                  const active = activeSelected?.chapterId === match.chapterId && activeSelected.occurrenceIndex === occurrence.occurrenceIndex
                  return (
                    <button
                      key={occurrence.occurrenceIndex}
                      onClick={() => {
                        setSelected({ chapterId: match.chapterId, occurrenceIndex: occurrence.occurrenceIndex })
                        if (match.outlineNodeId > 0) onSelectOutlineNode(match.outlineNodeId)
                      }}
                      className={`w-full rounded border px-2 py-1.5 text-left text-[11px] leading-4 ${
                        active
                          ? 'border-accent/50 bg-accent/10 text-text-primary'
                          : 'border-border bg-bg-surface text-text-muted hover:text-text-secondary'
                      }`}
                    >
                      {occurrence.snippet || occurrence.matchText || t('findReplace.hit')}
                    </button>
                  )
                })}
                {match.occurrences.length > 5 && (
                  <p className="text-[10px] text-text-muted">{t('findReplace.moreHits', { count: match.occurrences.length - 5 })}</p>
                )}
              </div>
            ))}
          </div>
          {selectedChapterMatch && (
            <p className="mt-2 border-t border-border pt-2 text-[10px] text-text-muted">
              {t('findReplace.selectedHit', { title: selectedChapterMatch.title, index: (activeSelected?.occurrenceIndex ?? 0) + 1 })}
            </p>
          )}
        </aside>
      </div>
      )}
    </div>
  )
}
