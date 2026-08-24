import { useEffect, useState } from 'react'
import { Library, Upload } from 'lucide-react'
import { useReferenceStore } from '../../stores/reference'
import type { Project, Reference, ReferenceType } from '../../lib/types'
import { useDialog } from '../shared/Dialog'
import ReferenceDetailCard from './ReferenceDetailCard'
import {
  REFERENCE_GLYPH_COLORS,
  REFERENCE_TYPE_CONFIG,
  getReferenceTypeLabel,
} from './reference-view'
import { useDomainT } from '../../i18n'
import {
  INITIAL_RECORD_TARGET_CLASS,
  initialRecordTargetAttributes,
  useInitialRecordTarget,
} from '../shared/initial-record-target'

// ── Constants ───────────────────────────────────────────────────────

interface Props {
  project: Project
  initialReferenceId?: number | null
}

// ── Main panel ──────────────────────────────────────────────────────

export default function ReferencePanel({ project, initialReferenceId }: Props) {
  const { t } = useDomainT('project')
  const dialog = useDialog()
  const { references, loadAll, updateReference, deleteReference } = useReferenceStore()
  const [filter, setFilter] = useState<ReferenceType | 'all'>('all')
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => { loadAll(project.id!) }, [project.id, loadAll])

  const displayed = filter === 'all'
    ? references
    : references.filter(r => r.type === filter)

  const storyCount = references.filter(r => r.type === 'story').length
  const styleCount = references.filter(r => r.type === 'style').length
  const importedCount = references.filter(r => r.importedData).length

  const selectedRef = references.find(r => r.id === selected)
  const targetRef = references.find(reference => reference.id === initialReferenceId) ?? null

  useEffect(() => {
    if (!targetRef) return
    setFilter(targetRef.type)
    setSelected(targetRef.id ?? null)
  }, [targetRef])
  useInitialRecordTarget(
    initialReferenceId,
    displayed.some(reference => reference.id === initialReferenceId),
  )

  const handleDelete = async (ref: Reference) => {
    const ok = await dialog.confirm({
      title: t('referencePanel.deleteTitle', { title: ref.title }),
      message: t('referencePanel.deleteMessage'),
      confirmText: t('referencePanel.deleteConfirm'),
      tone: 'danger',
    })
    if (!ok) return
    await deleteReference(ref.id!)
    if (selected === ref.id) setSelected(null)
  }

  const FILTER_TABS = [
    { value: 'all' as const, labelKey: 'referencePanel.filterAll' as const, count: references.length },
    { value: 'story' as const, labelKey: 'referencePanel.filterStory' as const, count: storyCount },
    { value: 'style' as const, labelKey: 'referencePanel.filterStyle' as const, count: styleCount },
    { value: 'historical' as const, labelKey: 'referencePanel.filterHistorical' as const, count: references.filter(r => r.type === 'historical').length },
  ]

  return (
    <div className="flex gap-4">
      {/* Left list */}
      <div className="w-52 shrink-0 space-y-2">
        {/* Import hint */}
        <div className="bg-bg-elevated rounded-lg p-2.5 text-xs text-text-muted">
          <Upload className="w-3.5 h-3.5 inline mr-1 text-accent" />
          {t('referencePanel.importHint')}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-bg-elevated rounded-lg p-1">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`flex-1 text-xs py-1 rounded px-1 transition-colors ${filter === tab.value ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'}`}
            >
              {t(tab.labelKey)} {tab.count > 0 && <span className="opacity-70">({tab.count})</span>}
            </button>
          ))}
        </div>

        {importedCount > 0 && (
          <div className="text-[10px] text-text-muted px-1">
            {t('referencePanel.importedCount', { count: importedCount })}
          </div>
        )}

        {/* List */}
        <div className="space-y-0.5 max-h-[calc(100vh-320px)] overflow-y-auto">
          {displayed.length === 0 && (
            <div className="text-center text-text-muted text-sm py-8">
              <Library className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>{t('referencePanel.emptyState')}</p>
            </div>
          )}
          {displayed.map((ref, i) => {
            const cfg = REFERENCE_TYPE_CONFIG[ref.type]
            const active = selected === ref.id
            const hasImported = !!ref.importedData
            const colorClass = REFERENCE_GLYPH_COLORS[i % REFERENCE_GLYPH_COLORS.length]
            return (
              <button
                key={ref.id}
                {...initialRecordTargetAttributes(ref.id === initialReferenceId, ref.id)}
                onClick={() => setSelected(active ? null : ref.id!)}
                className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all ${
                  active
                    ? 'bg-accent/8 border-l-2 border-accent'
                    : 'hover:bg-bg-hover border-l-2 border-transparent'
                } ${ref.id === initialReferenceId ? INITIAL_RECORD_TARGET_CLASS : ''}`}
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${colorClass}`}>
                  {ref.title.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium truncate ${active ? 'text-accent' : 'text-text-primary'}`}>{ref.title}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`text-[10px] px-1 py-0.5 rounded border ${cfg.color}`}>
                      {getReferenceTypeLabel(ref.type)}
                    </span>
                    {hasImported && (
                      <span className="text-[10px] px-1 py-0.5 rounded border border-blue-400/30 text-blue-400 bg-blue-400/10">
                        {t('referencePanel.importedBadge')}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Right detail */}
      <div className="flex-1 min-w-0">
        {selectedRef ? (
          <ReferenceDetailCard
            reference={selectedRef}
            referenceIndex={references.findIndex(r => r.id === selectedRef.id)}
            onUpdate={(data) => {
              if (selectedRef?.id) {
                updateReference(selectedRef.id, data)
              }
            }}
            onDelete={() => handleDelete(selectedRef)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-text-muted text-sm gap-3">
            <Library className="w-12 h-12 opacity-20" />
            <p>{t('referencePanel.selectPrompt')}</p>
            <div className="text-xs text-text-muted/60 text-center max-w-xs space-y-0.5">
              <p>· <span className="text-accent">{t('referencePanel.guideStory')}</span>: {t('referencePanel.guideStoryDesc')}</p>
              <p>· <span className="text-purple-400">{t('referencePanel.guideStyle')}</span>: {t('referencePanel.guideStyleDesc')}</p>
              <p>· <span className="text-amber-500">{t('referencePanel.guideHistorical')}</span>: {t('referencePanel.guideHistoricalDesc')}</p>
              <p>· <span className="text-blue-400">{t('referencePanel.guideImported')}</span>: {t('referencePanel.guideImportedDesc')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
