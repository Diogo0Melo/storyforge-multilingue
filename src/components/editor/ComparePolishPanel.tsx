import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Save, X } from 'lucide-react'
import { useDomainT } from '../../i18n'
import type { RichEditorHandle } from './RichEditor'
import RichEditor from './RichEditor'
import { useBackupStore } from '../../stores/backup'
import { useChapterStore } from '../../stores/chapter'
import { useUserStyleStore } from '../../stores/user-style'
import { useBeforeUnload } from '../../hooks/useBeforeUnload'
import { useDialog } from '../shared/Dialog'
import { useToast } from '../shared/Toast'
import { readProjectHeldItems } from '../../lib/consistency/held-items'
import {
  evaluateCompareDraftConsistency,
  saveComparePolishDraft,
} from '../../lib/editor/compare-polish-operation'
import { countWords, htmlToPlainText } from '../../lib/utils/html'
import type { EditorEntityReference } from '../../lib/editor/entity-reference'

interface Props {
  projectId: number
  chapterId: number
  chapterTitle: string
  worldGroupId?: number | null
  sourceHtml: string
  entityReferences?: readonly EditorEntityReference[]
  onSaved: (result: { html: string; plainText: string; wordCount: number }) => void
  onClose: () => void
}

export default function ComparePolishPanel({
  projectId,
  chapterId,
  chapterTitle,
  worldGroupId,
  sourceHtml,
  entityReferences = [],
  onSaved,
  onClose,
}: Props) {
  const { t } = useDomainT('editor')
  const [draftHtml, setDraftHtml] = useState(sourceHtml)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<RichEditorHandle>(null)
  const createSnapshot = useBackupStore(state => state.createSnapshot)
  const updateChapter = useChapterStore(state => state.updateChapter)
  const dialog = useDialog()
  const toast = useToast()
  const dirty = draftHtml !== sourceHtml
  const sourceWords = useMemo(() => countWords(htmlToPlainText(sourceHtml)), [sourceHtml])
  const draftWords = useMemo(() => countWords(htmlToPlainText(draftHtml)), [draftHtml])

  useBeforeUnload(dirty)

  const close = async () => {
    if (dirty) {
      const confirmed = await dialog.confirm({
        title: t('comparePolish.discardConfirmTitle'),
        message: t('comparePolish.discardConfirmMessage'),
        confirmText: t('comparePolish.discardConfirmBtn'),
        tone: 'danger',
      })
      if (!confirmed) return
    }
    onClose()
  }

  const save = async () => {
    if (!dirty || saving) return
    const html = editorRef.current?.getHTML() ?? draftHtml
    const plain = editorRef.current?.getPlainText() ?? htmlToPlainText(html)
    if (!plain.trim()) {
      await dialog.alert({ title: t('comparePolish.emptyDraftAlertTitle'), message: t('comparePolish.emptyDraftAlertMessage') })
      return
    }

    setSaving(true)
    try {
      const heldItems = await readProjectHeldItems(projectId, chapterId, worldGroupId)
      const findings = evaluateCompareDraftConsistency(html, heldItems)
      if (findings.length > 0) {
        const examples = findings.slice(0, 3).map(item => `“${item.quote}”`).join('\n')
        const proceed = await dialog.confirm({
          title: t('comparePolish.consistencyRiskTitle', { count: findings.length }),
          message: `${examples}\n\n${t('comparePolish.consistencyRiskMessage')}`,
          confirmText: t('comparePolish.consistencyRiskConfirmBtn'),
        })
        if (!proceed) return
      }

      const result = await saveComparePolishDraft({
        projectId,
        chapterId,
        chapterTitle,
        draftHtml: html,
        createSnapshot,
        updateChapter,
      })
      let capturedStyleSample = false
      try {
        capturedStyleSample = await useUserStyleStore.getState().captureRevisionPair(projectId, {
          sourceChapterId: chapterId,
          chapterTitle,
          beforeText: sourceHtml,
          afterText: result.html,
        }) != null
      } catch (captureError) {
        // Style sample is derivative data after save; failure must not roll back the completed chapter save.
        console.warn('[ComparePolish] Style sample capture failed:', captureError)
      }
      setDraftHtml(result.html)
      onSaved(result)
      toast.success(capturedStyleSample
        ? t('comparePolish.toastSavedWithStyle')
        : t('comparePolish.toastSavedWithoutStyle'))
      onClose()
    } catch (error) {
      toast.error(`${t('comparePolish.toastSaveFailed')}${t('common:colon')}${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-label={t('comparePolish.ariaLabel')} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{t('comparePolish.headerTitle', { title: chapterTitle })}</h3>
          <p className="mt-1 text-xs text-text-muted">{t('comparePolish.headerSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { void save() }}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? t('comparePolish.btnSaveBusy') : t('comparePolish.btnSaveIdle')}
          </button>
          <button
            type="button"
            onClick={() => { void close() }}
            title={t('comparePolish.btnCloseTitle')}
            aria-label={t('comparePolish.btnCloseAria')}
            className="rounded p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-text-secondary">{t('comparePolish.originalLabel')}</span>
            <span className="text-text-muted">{t('comparePolish.wordCountSuffix', { count: sourceWords.toLocaleString() })}</span>
          </div>
          <RichEditor
            value={sourceHtml}
            onChange={() => {}}
            disabled
            showToolbar={false}
            minHeight={560}
            className="sf-manuscript-editor bg-bg-surface"
          />
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-text-secondary">{t('comparePolish.draftLabel')}</span>
            <span className="text-text-muted">{t('comparePolish.wordCountSuffix', { count: draftWords.toLocaleString() })}</span>
          </div>
          <RichEditor
            ref={editorRef}
            value={draftHtml}
            onChange={html => setDraftHtml(html)}
            placeholder={t('comparePolish.draftPlaceholder')}
            minHeight={560}
            className="sf-manuscript-editor"
            entityReferences={entityReferences}
          />
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-5 text-text-muted">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
        {t('comparePolish.disclaimer')}
      </p>
    </section>
  )
}
