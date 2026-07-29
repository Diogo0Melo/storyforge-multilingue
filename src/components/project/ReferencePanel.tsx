import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Library, Upload } from 'lucide-react'
import { useReferenceStore } from '../../stores/reference'
import type { Project, Reference, ReferenceType } from '../../lib/types'
import { useDialog } from '../shared/Dialog'
import ReferenceDetailCard from './ReferenceDetailCard'
import {
  REFERENCE_GLYPH_COLORS,
  REFERENCE_TYPE_CONFIG,
} from './reference-view'

// ── 常量 ─────────────────────────────────────────────────────────

interface Props { project: Project }

// ── 主面板 ─────────────────────────────────────────────────────────

export default function ReferencePanel({ project }: Props) {
  const { t } = useTranslation('project')
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

  const handleDelete = async (ref: Reference) => {
    const ok = await dialog.confirm({
      title: t('reference.deleteTitle', { title: ref.title }),
      message: t('reference.deleteMessage'),
      confirmText: t('reference.deleteConfirm'),
      tone: 'danger',
    })
    if (!ok) return
    await deleteReference(ref.id!)
    if (selected === ref.id) setSelected(null)
  }

  return (
    <div className="flex gap-4">
      {/* 左侧列表 */}
      <div className="w-52 shrink-0 space-y-2">
        {/* 导入提示 */}
        <div className="bg-bg-elevated rounded-lg p-2.5 text-xs text-text-muted">
          <Upload className="w-3.5 h-3.5 inline mr-1 text-accent" />
          {t('reference.importHint')}
        </div>

        {/* 筛选 tabs */}
        <div className="flex gap-1 bg-bg-elevated rounded-lg p-1">
          {([
            ['all', t('reference.filterAll'), references.length],
            ['story', t('reference.filterStory'), storyCount],
            ['style', t('reference.filterStyle'), styleCount],
            ['historical', t('reference.filterHistorical'), references.filter(r => r.type === 'historical').length],
          ] as const).map(
            ([v, l, c]) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                className={`flex-1 text-xs py-1 rounded px-1 transition-colors ${filter === v ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'}`}
              >
                {l} {c > 0 && <span className="opacity-70">({c})</span>}
              </button>
            )
          )}
        </div>

        {importedCount > 0 && (
          <div className="text-[10px] text-text-muted px-1">
            {t('reference.importCount', { count: importedCount })}
          </div>
        )}

        {/* 列表 */}
        <div className="space-y-0.5 max-h-[calc(100vh-320px)] overflow-y-auto">
          {displayed.length === 0 && (
            <div className="text-center text-text-muted text-sm py-8">
              <Library className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>{t('reference.empty')}</p>
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
                onClick={() => setSelected(active ? null : ref.id!)}
                className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all ${
                  active
                    ? 'bg-accent/8 border-l-2 border-accent'
                    : 'hover:bg-bg-hover border-l-2 border-transparent'
                }`}
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${colorClass}`}>
                  {ref.title.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium truncate ${active ? 'text-accent' : 'text-text-primary'}`}>{ref.title}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`text-[10px] px-1 py-0.5 rounded border ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    {hasImported && (
                      <span className="text-[10px] px-1 py-0.5 rounded border border-blue-400/30 text-blue-400 bg-blue-400/10">
                        {t('reference.imported')}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 右侧详情 */}
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
            <p>{t('reference.selectHint')}</p>
            <div className="text-xs text-text-muted/60 text-center max-w-xs space-y-0.5">
              <p>· <span className="text-accent">{t('reference.descStory')}</span>：{t('reference.descStoryDetail')}</p>
              <p>· <span className="text-purple-400">{t('reference.descStyle')}</span>：{t('reference.descStyleDetail')}</p>
              <p>· <span className="text-amber-500">{t('reference.descHistorical')}</span>：{t('reference.descHistoricalDetail')}</p>
              <p>· <span className="text-blue-400">{t('reference.descImport')}</span>：{t('reference.descImportDetail')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
