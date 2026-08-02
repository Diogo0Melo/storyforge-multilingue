import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatNumber } from '../../i18n/format'
import { AlertTriangle, Save, X } from 'lucide-react'
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
  const { t } = useTranslation(['editor', 'common'])
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
        title: t('compare.discardTitle'),
        message: t('compare.discardMessage'),
        confirmText: t('compare.discardConfirm'),
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
      await dialog.alert({ title: t('compare.emptySaveTitle'), message: t('compare.emptySaveMessage') })
      return
    }

    setSaving(true)
    try {
      const heldItems = await readProjectHeldItems(projectId, chapterId, worldGroupId)
      const findings = evaluateCompareDraftConsistency(html, heldItems)
      if (findings.length > 0) {
        const examples = findings.slice(0, 3).map(item => `“${item.quote}”`).join('\n')
        const proceed = await dialog.confirm({
          title: t('compare.consistencyRiskTitle', { count: findings.length }),
          message: t('compare.consistencyRiskMessage', { examples }),
          confirmText: t('compare.consistencyRiskConfirm'),
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
        // 文风样本是正文保存后的衍生数据，失败不得回滚已经完成的章节保存。
        console.warn('[ComparePolish] 文风样本沉淀失败:', captureError)
      }
      setDraftHtml(result.html)
      onSaved(result)
      toast.success(capturedStyleSample
        ? t('compare.savedWithStyle')
        : t('compare.savedWithSnapshot'))
      onClose()
    } catch (error) {
      toast.error(t('compare.saveFailed', { error: error instanceof Error ? error.message : String(error) }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-label={t('compare.title')} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{t('compare.titleWith', { chapterTitle })}</h3>
          <p className="mt-1 text-xs text-text-muted">{t('compare.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { void save() }}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? t('header.saving') : t('compare.snapshotAndSave')}
          </button>
          <button
            type="button"
            onClick={() => { void close() }}
            title={t('compare.closeLabel')}
            aria-label={t('compare.closeLabel')}
            className="rounded p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-text-secondary">{t('compare.originalReadonly')}</span>
            <span className="text-text-muted">{t('common:unit.characters', { count: formatNumber(sourceWords) })}</span>
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
            <span className="font-medium text-text-secondary">{t('compare.draft')}</span>
            <span className="text-text-muted">{t('common:unit.characters', { count: formatNumber(draftWords) })}</span>
          </div>
          <RichEditor
            ref={editorRef}
            value={draftHtml}
            onChange={html => setDraftHtml(html)}
            placeholder={t('compare.placeholder')}
            minHeight={560}
            className="sf-manuscript-editor"
            entityReferences={entityReferences}
          />
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-5 text-text-muted">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
        {t('compare.footerNote')}
      </p>
    </section>
  )
}
