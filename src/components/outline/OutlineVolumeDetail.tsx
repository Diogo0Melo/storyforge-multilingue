import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Sparkles, Trash2 } from 'lucide-react'
import type { OutlineNode, StoryStructure, WorldGroup } from '../../lib/types'
import AutoResizeTextarea from '../shared/AutoResizeTextarea'
import { CInput } from '../shared/CompositionInput'
import { useDragReorder } from './useDragReorder'
import OutlineStructureMenu from './OutlineStructureMenu'
import { OutlineChapterRow, OutlineStoryBlockSection } from './OutlineChapterTree'
import type { ChapterDragPayload, GetActiveChapterDrag } from './chapter-drag'

interface Props {
  volume: OutlineNode | null
  nodes: OutlineNode[]
  multiWorldEnabled: boolean
  worldGroups: WorldGroup[]
  aiStreaming: boolean
  activeChapterDrag: ChapterDragPayload | null
  getActiveChapterDrag: GetActiveChapterDrag
  onChapterDragStart: (payload: ChapterDragPayload) => void
  onChapterDragEnd: () => void
  onUpdateNode: (id: number, patch: Partial<OutlineNode>) => void
  onDeleteNode: (id: number) => void
  onGenerateVolume: (volumeId: number) => void
  onGenerateAllChapters: () => void
  onAddChapter: (parentId?: number) => void
  onDeleteVolume: () => void
  onAddStructure: (structure: StoryStructure) => void
  onInsertChapterAfter: (chapterId: number, parentId: number) => void
  onGenerateChapter: (chapterId: number) => void
  onOpenChapter?: (chapterId: number) => void
  onReorderNodes: (orderedIds: number[]) => void
  onMoveChapter: (chapterId: number, targetParentId: number, index: number) => Promise<void>
}

export default function OutlineVolumeDetail({
  volume,
  nodes,
  multiWorldEnabled,
  worldGroups,
  aiStreaming,
  activeChapterDrag,
  getActiveChapterDrag,
  onChapterDragStart,
  onChapterDragEnd,
  onUpdateNode,
  onDeleteNode,
  onGenerateVolume,
  onGenerateAllChapters,
  onAddChapter,
  onDeleteVolume,
  onAddStructure,
  onInsertChapterAfter,
  onGenerateChapter,
  onOpenChapter,
  onReorderNodes,
  onMoveChapter,
}: Props) {
  const { t } = useTranslation('outline')
  const storyBlocks = useMemo(() => (
    volume
      ? nodes.filter(node => node.parentId === volume.id && node.type === 'storyBlock').sort((a, b) => a.order - b.order)
      : []
  ), [nodes, volume])
  const directChapters = useMemo(() => (
    volume
      ? nodes.filter(node => node.parentId === volume.id && node.type === 'chapter').sort((a, b) => a.order - b.order)
      : []
  ), [nodes, volume])
  const blockChapterCount = useMemo(() => nodes.filter(node => (
    node.type === 'chapter' && storyBlocks.some(block => block.id === node.parentId)
  )).length, [nodes, storyBlocks])
  const directChaptersDnD = useDragReorder(directChapters.map(chapter => chapter.id), onReorderNodes)
  const hasBlocks = storyBlocks.length > 0

  if (!volume) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-text-muted gap-3">
        <div className="text-4xl opacity-20">📖</div>
        <p className="text-sm">{t('volumeDetail.emptyHint')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <CInput
          value={volume.title}
          onChange={event => onUpdateNode(volume.id!, { title: event.target.value })}
          className="text-lg font-bold bg-transparent text-text-primary outline-none flex-1"
        />
        <div className="flex items-center gap-1.5">
          {!volume.summary.trim() && (
            <button
              onClick={() => onGenerateVolume(volume.id!)}
              disabled={aiStreaming}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-bg-elevated text-accent rounded-md hover:bg-accent/10 border border-accent/30 disabled:opacity-50 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" /> {t('volumeDetail.aiGenerateVolume')}
            </button>
          )}
          <button
            onClick={onGenerateAllChapters}
            disabled={aiStreaming}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-accent text-white rounded-md hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" /> {t('volumeDetail.generateAllChapters')}
          </button>
          <button
            onClick={() => onAddChapter()}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-bg-elevated text-text-secondary rounded-md hover:text-text-primary border border-border transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> {t('volumeDetail.addChapter')}
          </button>
          <button onClick={onDeleteVolume} title={t('volumeDetail.deleteVolumeTitle')} className="p-1.5 text-text-muted hover:text-error rounded transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {multiWorldEnabled && worldGroups.length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-muted">{t('volumeDetail.worldLabel')}</label>
          <select
            value={volume.worldGroupId ?? ''}
            onChange={event => onUpdateNode(volume.id!, { worldGroupId: event.target.value ? Number(event.target.value) : null })}
            className="px-2 py-1 bg-bg-surface border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent cursor-pointer"
          >
            <option value="">{t('volumeDetail.unspecified')}</option>
            {worldGroups.map(group => (
              <option key={group.id} value={group.id}>{group.icon || '🌐'} {group.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="text-xs text-text-muted mb-1 block">{t('volumeDetail.volumeSummaryLabel')}</label>
        <AutoResizeTextarea
          value={volume.summary}
          onChange={event => onUpdateNode(volume.id!, { summary: event.target.value })}
          placeholder={t('volumeDetail.volumeSummaryPlaceholder')}
          minRows={3}
          maxRows={10}
          className="w-full px-3 py-2 bg-bg-surface border border-border rounded-md text-text-secondary text-sm focus:outline-none focus:border-accent"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-text-primary">
            {hasBlocks ? t('volumeDetail.storyStructure') : t('volumeDetail.chapterList')}
            <span className="text-text-muted font-normal ml-1">{t('volumeDetail.chaptersCount', { count: directChapters.length + blockChapterCount })}</span>
          </h3>
          {!hasBlocks && <OutlineStructureMenu onSelect={onAddStructure} />}
        </div>

        {hasBlocks && (
          <div className="space-y-3 mb-3">
            {storyBlocks.map(block => {
              const blockChapters = nodes
                .filter(node => node.parentId === block.id && node.type === 'chapter')
                .sort((a, b) => a.order - b.order)
              return (
                <OutlineStoryBlockSection
                  key={block.id}
                  block={block}
                  chapters={blockChapters}
                  onUpdateNode={onUpdateNode}
                  onDeleteNode={onDeleteNode}
                  onAddChapter={() => onAddChapter(block.id!)}
                  onOpenChapter={onOpenChapter}
                  onReorder={onReorderNodes}
                  onInsertAfter={chapterId => onInsertChapterAfter(chapterId, block.id!)}
                  onGenerateChapter={onGenerateChapter}
                  onMoveChapter={onMoveChapter}
                  activeChapterDrag={activeChapterDrag}
                  getActiveChapterDrag={getActiveChapterDrag}
                  onChapterDragStart={onChapterDragStart}
                  onChapterDragEnd={onChapterDragEnd}
                />
              )
            })}
            <button
              onClick={() => onAddStructure('custom')}
              className="w-full py-2 text-xs text-text-muted border border-dashed border-border rounded-lg hover:text-accent hover:border-accent/50 transition-colors"
            >
              {t('volumeDetail.addBlock')}
            </button>
          </div>
        )}

        {!hasBlocks && (
          directChapters.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-sm border border-dashed border-border rounded-lg">
              {t('volumeDetail.noChapters')}
            </div>
          ) : (
            <div className="space-y-1">
              {directChapters.map((chapter, index) => (
                <OutlineChapterRow
                  key={chapter.id}
                  ch={chapter}
                  idx={index}
                  onUpdate={onUpdateNode}
                  onDelete={onDeleteNode}
                  onOpen={onOpenChapter}
                  dnd={directChaptersDnD.itemDnD(chapter.id)}
                  onInsertAfter={() => onInsertChapterAfter(chapter.id!, volume.id!)}
                  onGenerate={() => onGenerateChapter(chapter.id!)}
                  parentId={volume.id!}
                  onMoveChapter={onMoveChapter}
                  activeChapterDrag={activeChapterDrag}
                  getActiveChapterDrag={getActiveChapterDrag}
                  onChapterDragStart={onChapterDragStart}
                  onChapterDragEnd={onChapterDragEnd}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
