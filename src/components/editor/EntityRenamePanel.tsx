import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Eye, RotateCcw, ShieldCheck } from 'lucide-react'
import { useBackupStore } from '../../stores/backup'
import { useChapterStore } from '../../stores/chapter'
import { useCharacterStore } from '../../stores/character'
import { useCodexStore } from '../../stores/codex'
import { useLocationStore } from '../../stores/location'
import { useStateCardStore } from '../../stores/state-card'
import {
  buildEntityRenamePreview,
  executeEntityRename,
  listRenamableEntities,
  undoEntityRename,
  type EntityRenamePreview,
  type EntityRenameTarget,
  type EntityRenameUndoPatch,
  type RenamableEntity,
  type RenamableEntityKind,
} from '../../lib/editor/entity-rename'
import { useDomainT } from '../../i18n'
import { useDialog } from '../shared/Dialog'
import { useToast } from '../shared/Toast'

interface Props {
  projectId: number
  onSelectOutlineNode: (outlineNodeId: number) => void
}

function getKindLabels(t: (...args: any[]) => string): Record<RenamableEntityKind, string> {
  return {
    character: t('entityRename.kindCharacter'),
    location: t('entityRename.kindLocation'),
    codexEntry: t('entityRename.kindCodexEntry'),
  }
}

function formatTime(ts: number): string {
  const date = new Date(ts)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function entityKey(entity: RenamableEntity): string {
  return `${entity.kind}:${entity.id}`
}

function parseEntityKey(value: string): EntityRenameTarget | null {
  const [kind, rawId] = value.split(':')
  const id = Number(rawId)
  if (!['character', 'location', 'codexEntry'].includes(kind) || !Number.isFinite(id)) return null
  return { kind: kind as RenamableEntityKind, id }
}

export default function EntityRenamePanel({ projectId, onSelectOutlineNode }: Props) {
  const { t } = useDomainT('editor')
  const dialog = useDialog()
  const toast = useToast()
  const createSnapshot = useBackupStore(state => state.createSnapshot)
  const loadChapters = useChapterStore(state => state.loadAll)
  const loadCharacters = useCharacterStore(state => state.loadAll)
  const loadLocations = useLocationStore(state => state.loadAll)
  const loadCodex = useCodexStore(state => state.loadExisting)
  const loadStateCards = useStateCardStore(state => state.loadAll)

  const [entities, setEntities] = useState<RenamableEntity[]>([])
  const [selectedKey, setSelectedKey] = useState('')
  const [newName, setNewName] = useState('')
  const [preview, setPreview] = useState<EntityRenamePreview | null>(null)
  const [undoPatch, setUndoPatch] = useState<EntityRenameUndoPatch | null>(null)
  const [busy, setBusy] = useState(false)

  const selected = useMemo(
    () => entities.find(entity => entityKey(entity) === selectedKey) ?? null,
    [entities, selectedKey],
  )

  const refreshEntities = async () => {
    const next = await listRenamableEntities(projectId)
    setEntities(next)
    return next
  }

  const refreshProjectStores = async () => {
    await Promise.all([
      loadChapters(projectId),
      loadCharacters(projectId),
      loadLocations(projectId),
      loadCodex(projectId),
      loadStateCards(projectId),
    ])
  }

  useEffect(() => {
    let active = true
    void listRenamableEntities(projectId)
      .then(items => {
        if (active) setEntities(items)
      })
      .catch(error => {
        if (active) toast.error(t('entityRename.toastLoadFailed', { message: error instanceof Error ? error.message : String(error) }))
      })
    return () => {
      active = false
    }
  }, [projectId, toast, t])

  const buildPreview = async () => {
    const target = parseEntityKey(selectedKey)
    if (!target) {
      toast.error(t('entityRename.toastSelectEntityFirst'))
      return
    }
    if (!newName.trim()) {
      toast.error(t('entityRename.toastEnterNewName'))
      return
    }
    setBusy(true)
    try {
      setPreview(await buildEntityRenamePreview(projectId, target, newName))
    } catch (error) {
      toast.error(t('entityRename.toastPreviewFailed', { message: error instanceof Error ? error.message : String(error) }))
    } finally {
      setBusy(false)
    }
  }

  const applyRename = async () => {
    if (!preview || preview.blockers.length) return
    const ok = await dialog.confirm({
      title: t('entityRename.confirmRenameTitle', { oldName: preview.entity.name, newName: preview.newName }),
      message: t('entityRename.confirmRenameMessage', {
        chapterReplacementCount: preview.chapterReplacementCount,
        structuredCount: preview.changes.filter(change => change.target !== 'chapters').length,
        manualReviewCount: preview.manualReview.length,
      }),
      confirmText: t('entityRename.confirmRenameBtn'),
      cancelText: t('common:cancel'),
      tone: 'danger',
    })
    if (!ok) return

    setBusy(true)
    try {
      const result = await executeEntityRename({
        projectId,
        entity: { kind: preview.entity.kind, id: preview.entity.id },
        newName: preview.newName,
        expectedBaseline: preview.baseline,
        createSnapshot,
        label: `${t('entityRename.snapshotLabelPrefix')} ${formatTime(Date.now())}`,
      })
      setUndoPatch(result.undoPatch)
      await refreshProjectStores()
      const next = await refreshEntities()
      const renamed = next.find(entity =>
        entity.kind === preview.entity.kind && entity.id === preview.entity.id,
      )
      setSelectedKey(renamed ? entityKey(renamed) : '')
      setNewName('')
      setPreview(null)
      toast.success(t('entityRename.toastRenameSuccess', { records: result.changedRecords, replacements: result.chapterReplacements }))
    } catch (error) {
      toast.error(t('entityRename.toastRenameFailed', { message: error instanceof Error ? error.message : String(error) }))
    } finally {
      setBusy(false)
    }
  }

  const undoRename = async () => {
    if (!undoPatch) return
    const ok = await dialog.confirm({
      title: t('entityRename.undoConfirmTitle'),
      message: t('entityRename.undoConfirmMessage', { newName: undoPatch.newName, oldName: undoPatch.oldName }),
      confirmText: t('entityRename.undoConfirmBtn'),
      cancelText: t('common:cancel'),
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    try {
      await undoEntityRename(undoPatch)
      await refreshProjectStores()
      await refreshEntities()
      setSelectedKey('')
      setNewName('')
      setPreview(null)
      setUndoPatch(null)
      toast.success(t('entityRename.toastUndoSuccess'))
    } catch (error) {
      toast.error(t('entityRename.toastUndoFailed', { message: error instanceof Error ? error.message : String(error) }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-3">
        <div className="grid gap-2 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[11px] text-text-muted">{t('entityRename.labelSelectEntity')}</span>
            <select
              value={selectedKey}
              onChange={event => {
                setSelectedKey(event.target.value)
                setNewName('')
                setPreview(null)
              }}
              className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">{t('entityRename.selectPlaceholder')}</option>
              {entities.map(entity => (
                <option key={entityKey(entity)} value={entityKey(entity)}>
                  {t('entityRename.optionFormat', { kind: getKindLabels(t)[entity.kind], label: entity.label, detail: entity.detail })}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-text-muted">{t('entityRename.labelNewName')}</span>
            <input
              value={newName}
              onChange={event => {
                setNewName(event.target.value)
                setPreview(null)
              }}
              placeholder={selected ? t('entityRename.newNamePlaceholderSelected', { name: selected.name }) : t('entityRename.newNamePlaceholderEmpty')}
              disabled={!selected}
              className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent disabled:opacity-50"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void buildPreview()}
            disabled={busy || !selected || !newName.trim()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            <Eye className="h-3.5 w-3.5" /> {t('entityRename.btnPreview')}
          </button>
          {preview && !preview.blockers.length && (
            <button
              onClick={() => void applyRename()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> {t('entityRename.btnApply')}
            </button>
          )}
          {undoPatch && (
            <button
              onClick={() => void undoRename()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-warning hover:bg-warning/20 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> {t('entityRename.btnUndo')}
            </button>
          )}
        </div>

        <div className="rounded-lg border border-border bg-bg-base p-3 text-[11px] leading-5 text-text-muted">
          <p>{t('entityRename.disclaimerItems')}</p>
          <p>{t('entityRename.disclaimerFreeText')}</p>
        </div>

        {preview && (
          <div className="space-y-2">
            {preview.blockers.map(blocker => (
              <div key={blocker} className="flex gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{blocker}</span>
              </div>
            ))}
            {!preview.blockers.length && (
              <div className="flex gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t('entityRename.safeToProceed')}</span>
              </div>
            )}
            {preview.warnings.map(warning => (
              <div key={warning} className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <aside className="rounded-lg border border-border bg-bg-base p-3">
        <p className="mb-2 text-xs font-medium text-text-secondary">{t('entityRename.previewTitle')}</p>
        {!preview && <p className="py-8 text-center text-xs text-text-muted">{t('entityRename.previewHint')}</p>}
        {preview && (
          <div className="max-h-80 space-y-3 overflow-y-auto pr-1 text-[11px]">
            <section>
              <p className="font-medium text-text-secondary">{t('entityRename.previewSectionChapters')}</p>
              <p className="text-text-muted">{t('entityRename.previewStatsChapters', { count: preview.chapterReplacementCount, chapters: preview.chapterMatches.length })}</p>
              {preview.chapterMatches.map(match => (
                <button
                  key={match.chapterId}
                  onClick={() => onSelectOutlineNode(match.outlineNodeId)}
                  className="mt-1 block w-full truncate text-left text-accent hover:underline"
                >
                  {match.title} · {t('findReplace.matchCountSuffix', { count: match.count })}
                </button>
              ))}
            </section>
            <section>
              <p className="font-medium text-text-secondary">{t('entityRename.previewSectionStructured')}</p>
              {preview.structuredCounts.map(item => (
                <p key={item.label} className="text-text-muted">{t('entityRename.previewStructuredItem', { label: item.label, count: item.count })}</p>
              ))}
            </section>
            <section>
              <p className="font-medium text-text-secondary">{t('entityRename.previewSectionManual', { count: preview.manualReview.length })}</p>
              {preview.manualReview.slice(0, 12).map((item, index) => (
                <p key={`${item.source}-${item.label}-${index}`} className="mt-1 text-text-muted">
                  {t('entityRename.manualReviewItem', { source: item.source, label: item.label, detail: item.detail })}
                </p>
              ))}
              {preview.manualReview.length > 12 && (
                <p className="mt-1 text-text-muted">{t('entityRename.previewManualMore', { count: preview.manualReview.length - 12 })}</p>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  )
}
