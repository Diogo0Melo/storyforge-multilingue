import { useState, useEffect, useMemo, useCallback } from 'react'
import { useDomainT } from '../../i18n'
import { useOutlineStore } from '../../stores/outline'
import { useWorldGroupStore } from '../../stores/world-group'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { assembleContext } from '../../lib/registry/assemble-context'
import {
  parseVolumeOutlineSmart, parseChapterOutlineSmart,
  type ParsedVolume, type ParsedChapter,
} from '../../lib/ai/parse-outline-output'
import { useAIConfigStore } from '../../stores/ai-config'
import { getTopLevelVolumes } from '../../lib/outline/selectors'
import { normalizeOutlineNode } from '../../lib/outline/normalize'
import { adoptGeneratedOutlineItems, adoptGeneratedOutlineSummary } from '../../lib/outline/adopt-generation'
import PromptRunPanel from '../shared/PromptRunPanel'
import PanelLayout from '../shared/PanelLayout'
import { CInput } from '../shared/CompositionInput'
import { useDialog } from '../shared/Dialog'
import { useToast } from '../shared/Toast'
import type { Project, StoryStructure } from '../../lib/types'
import { STORY_STRUCTURES } from '../../lib/types/outline'
import OutlineVolumeSidebar from './OutlineVolumeSidebar'
import OutlineVolumeDetail from './OutlineVolumeDetail'
import OutlineGenerationRequestPanel from './OutlineGenerationRequestPanel'
import OutlineGenerationResultPanel from './OutlineGenerationResultPanel'
import { useOutlineBatchGeneration } from './useOutlineBatchGeneration'
import { useOutlineGenerationController } from './useOutlineGenerationController'
import { useOutlineChapterCountEstimate } from './useOutlineChapterCountEstimate'
import { useOutlineChapterDrag } from './useOutlineChapterDrag'
import { decodeGenerationOperation } from '../../lib/outline/generation-request'

interface Props {
  project: Project
  onOpenChapter?: (nodeId: number) => void
}

export default function OutlinePanel({ project, onOpenChapter }: Props) {
  const { t, lang } = useDomainT('outline')
  // 语言感知的列表连接（跳过原因等）
  const listFormat = useMemo(() => new Intl.ListFormat(lang, { type: 'conjunction', style: 'short' }), [lang])
  const dialog = useDialog()
  const toast = useToast()
  const { nodes, loadAll, addNode, updateNode, deleteNode, reorderNodes, insertNodeAt, moveNodeToParent } = useOutlineStore()
  const worldGroups = useWorldGroupStore(s => s.groups)
  const aiConfig = useAIConfigStore(s => s.config)
  const [selectedVolId, setSelectedVolId] = useState<number | null>(null)
  const [hint, setHint] = useState('')
  const [parameterValues, setParameterValues] = useState<Record<string, unknown>>({})
  const [systemOverride, setSystemOverride] = useState<string | null>(null)
  const [userOverride, setUserOverride] = useState<string | null>(null)
  const [promptPanelOpen, setPromptPanelOpen] = useState(false)
  const { activeChapterDrag, beginChapterDrag, clearActiveChapterDrag, getActiveChapterDrag } = useOutlineChapterDrag()

  // 采纳预览
  const [previewVolumes, setPreviewVolumes] = useState<ParsedVolume[] | null>(null)
  const [previewChapters, setPreviewChapters] = useState<ParsedChapter[] | null>(null)
  const [previewTargetId, setPreviewTargetId] = useState<number | null>(null)
  const clearGenerationPreview = useCallback(() => {
    setPreviewVolumes(null)
    setPreviewChapters(null)
    setPreviewTargetId(null)
  }, [])

  const ai = useAIStream(createAISessionKey(project.id!, 'outline.generate'))

  useEffect(() => { loadAll(project.id!) }, [project.id, loadAll])

  const normalizedNodes = useMemo(() => nodes.map(normalizeOutlineNode), [nodes])
  const volumes = getTopLevelVolumes(normalizedNodes)
  const selectedVol = volumes.find(v => v.id === selectedVolId) || null

  useOutlineChapterCountEstimate({
    selectedVolumeId: selectedVolId,
    selectedVolumeExists: selectedVol != null,
    targetWordCount: project.targetWordCount,
    volumeCount: volumes.length,
    parameterValues,
    setParameterValues,
  })

  // 自动选中第一个卷
  useEffect(() => {
    if (selectedVolId === null && volumes.length > 0) {
      setSelectedVolId(volumes[0].id!)
    }
  }, [volumes, selectedVolId])

  const handleAddVolume = async () => {
    const id = await addNode({
      projectId: project.id!, parentId: null, type: 'volume',
      title: t('volume.defaultTitle', { index: volumes.length + 1 }), summary: '', order: volumes.length,
    })
    setSelectedVolId(id)
  }

  const handleAddChapter = async (parentId?: number) => {
    const pid = parentId ?? selectedVol?.id
    if (!pid) return
    const siblings = nodes.filter(n => n.parentId === pid && n.type === 'chapter')
    await addNode({
      projectId: project.id!, parentId: pid, type: 'chapter',
      title: t('chapter.defaultTitle', { index: siblings.length + 1 }), summary: '', order: siblings.length,
    })
  }

  // FB-2 任意位置插入：在某章之后插入一章（同 parentId 内重排 order）
  const handleInsertChapterAfter = async (afterChapterId: number, parentId: number) => {
    const siblingIds = nodes
      .filter(n => n.parentId === parentId && n.type === 'chapter')
      .sort((a, b) => a.order - b.order)
      .map(n => n.id!)
    const index = siblingIds.indexOf(afterChapterId) + 1
    await insertNodeAt(
      { projectId: project.id!, parentId, type: 'chapter', title: t('chapter.newTitle'), summary: '', order: 0 },
      siblingIds,
      index,
    )
  }

  const findWorldGroupForParent = (parentId: number | null): number | null => {
    if (parentId == null) return null
    const parent = normalizedNodes.find(node => node.id === parentId)
    if (!parent) return null
    if (parent.type === 'volume') return parent.worldGroupId ?? null
    if (parent.type === 'storyBlock') {
      const volume = normalizedNodes.find(node => node.id === parent.parentId && node.type === 'volume')
      return volume?.worldGroupId ?? null
    }
    return null
  }

  const canMoveChapterToParent = (chapterId: number, targetParentId: number | null): boolean => {
    if (!project.enableMultiWorld) return true
    const chapter = normalizedNodes.find(node => node.id === chapterId && node.type === 'chapter')
    if (!chapter) return false
    return findWorldGroupForParent(chapter.parentId) === findWorldGroupForParent(targetParentId)
  }

  const handleMoveChapter = async (chapterId: number, targetParentId: number, index: number) => {
    if (!canMoveChapterToParent(chapterId, targetParentId)) {
      toast.error(t('chapter.moveCrossWorldError'))
      return
    }
    try {
      await moveNodeToParent(chapterId, targetParentId, index)
    } catch (error) {
      console.error('[OutlinePanel] Failed to move chapter', error)
      toast.error(t('chapter.moveFailed'))
    }
  }

  const handleAddStructure = async (structure: StoryStructure) => {
    if (!selectedVol) return
    const def = STORY_STRUCTURES[structure]
    const currentBlocks = normalizedNodes
      .filter(node => node.parentId === selectedVol.id && node.type === 'storyBlock')
      .sort((a, b) => a.order - b.order)
    if (structure === 'custom') {
      await addNode({
        projectId: project.id!, parentId: selectedVol.id!, type: 'storyBlock',
        title: t('storyBlock.customTitle'), summary: '', order: currentBlocks.length,
      })
    } else {
      for (let i = 0; i < def.blocks.length; i++) {
        const blockTitle = def.blockKeys?.[i] ? t(def.blockKeys[i], { defaultValue: def.blocks[i] }) : def.blocks[i]
        await addNode({
          projectId: project.id!, parentId: selectedVol.id!, type: 'storyBlock',
          title: blockTitle, summary: '', order: currentBlocks.length + i,
        })
      }
    }
  }

  const generationRunOptions = useMemo(() => ({
    parameterValues: Object.keys(parameterValues).length > 0 ? parameterValues : undefined,
    overrides: (systemOverride != null || userOverride != null) ? {
      systemPrompt: systemOverride ?? undefined,
      userPromptTemplate: userOverride ?? undefined,
    } : undefined,
  }), [parameterValues, systemOverride, userOverride])

  const buildOutlineAssembledContext = useCallback(async (worldGroupId: number | null, outlineNodeId?: number | null) => {
    return await assembleContext({
      projectId: project.id!,
      worldGroupId,
      outlineNodeId: outlineNodeId ?? null,
      provider: aiConfig.provider,
      model: aiConfig.model,
      sourceKeys: [
        'canonAssertions',
        'worldview',
        'storyCore',
        'characterDrivenPlan',
        'powerSystem',
        'cultivationProgress',
        'codex',
        'characters',
        'creativeRules',
        'worldRules',
        'historical',
        'locations',
        'foreshadows',
        'storyArcs',
        'storylineProgress',
        'existingVolumeOutlines',
        'writtenChapterProgress',
      ],
    })
  }, [project.id, aiConfig.provider, aiConfig.model])

  const generation = useOutlineGenerationController({
    project,
    nodes,
    volumes,
    hint,
    runOptions: generationRunOptions,
    ai,
    assembleContext: buildOutlineAssembledContext,
    openPromptPanel: () => setPromptPanelOpen(true),
    clearPreview: clearGenerationPreview,
    onInfo: toast.info,
    onError: toast.error,
  })

  const handleAIVolumes = () => { void generation.prepare({ kind: 'volumes' }) }
  const handleAIChapters = () => {
    if (selectedVol?.id) void generation.prepare({ kind: 'chapters', volumeId: selectedVol.id })
  }

  // ── 采纳预览 + 确认 ──

  const [restructuring, setRestructuring] = useState(false)
  const handlePreviewAccept = async (text: string) => {
    setRestructuring(true)
    try {
      if (generation.moduleKey === 'outline.volume') {
        const parsed = await parseVolumeOutlineSmart(text, aiConfig)
        if (parsed.length === 0) {
          toast.error(t('adopt.parseVolumesFailed'))
          return
        }
        const operation = decodeGenerationOperation(ai.operation)
        if (operation?.kind === 'single-volume') {
          setPreviewTargetId(operation.volumeId)
          setPreviewVolumes(parsed.slice(0, 1))
        } else {
          setPreviewTargetId(null)
          setPreviewVolumes(parsed)
        }
      } else {
        const parsed = await parseChapterOutlineSmart(text, aiConfig)
        if (parsed.length === 0) {
          toast.error(t('adopt.parseChaptersFailed'))
          return
        }
        const operation = decodeGenerationOperation(ai.operation)
        if (operation?.kind === 'single-chapter') {
          setPreviewTargetId(operation.chapterId)
          setPreviewChapters(parsed.slice(0, 1))
        } else {
          setPreviewTargetId(null)
          setPreviewChapters(parsed)
        }
      }
    } finally {
      setRestructuring(false)
    }
  }

  const handleConfirmVolumes = async () => {
    if (!previewVolumes) return
    const targetId = previewTargetId
    ai.reset()
    if (targetId != null) {
      const result = await adoptGeneratedOutlineSummary(project.id!, targetId, previewVolumes[0]?.summary ?? '')
      if (!result.written) {
        toast.error(t('adopt.volumeSummaryWriteFailed', { reason: result.reason }))
        return
      }
      await loadAll(project.id!)
      setPreviewVolumes(null)
      setPreviewTargetId(null)
      toast.success(t('adopt.volumeSummaryWritten'))
      return
    }
    const existingCount = volumes.length
    let result: Awaited<ReturnType<typeof adoptGeneratedOutlineItems>>
    try {
      result = await adoptGeneratedOutlineItems({
        projectId: project.id!,
        parentId: null,
        type: 'volume',
        items: previewVolumes,
        startingOrder: existingCount,
      })
    } catch (err) {
      console.error('[Outline] 写入卷失败:', err)
      toast.error(t('adopt.volumeWriteError', { error: err instanceof Error ? err.message : String(err) }))
      return
    }
    await loadAll(project.id!)
    setPreviewVolumes(null)
    setPreviewTargetId(null)
    if (result.firstId) setSelectedVolId(result.firstId)
    // FB-10:不再静默——全跳过/部分跳过都明确告知用户原因
    if (result.writtenCount === 0) {
      toast.error(t('adopt.volumesNoneWritten', { reasons: listFormat.format(result.skippedReasons) || t('adopt.defaultSkipReason') }))
    } else if (result.writtenCount < previewVolumes.length) {
      toast.info(t('adopt.volumesPartial', { count: result.writtenCount, written: result.writtenCount, skipped: previewVolumes.length - result.writtenCount, reasons: listFormat.format(result.skippedReasons) || t('adopt.defaultSkipReason') }))
    } else {
      toast.success(t('adopt.volumesSuccess', { count: result.writtenCount }))
    }
  }

  const handleConfirmChapters = async () => {
    if (!previewChapters) return
    const targetId = previewTargetId
    const operation = decodeGenerationOperation(ai.operation)
    ai.reset()
    if (targetId != null) {
      const result = await adoptGeneratedOutlineSummary(project.id!, targetId, previewChapters[0]?.summary ?? '')
      if (!result.written) {
        toast.error(t('adopt.chapterSummaryWriteFailed', { reason: result.reason }))
        return
      }
      await loadAll(project.id!)
      setPreviewChapters(null)
      setPreviewTargetId(null)
      toast.success(t('adopt.chapterSummaryWritten'))
      return
    }
    const destinationVolume = operation?.kind === 'chapters'
      ? volumes.find(volume => volume.id === operation.volumeId) ?? null
      : selectedVol
    if (!destinationVolume) return
    const existingCount = nodes.filter(node => node.parentId === destinationVolume.id && node.type === 'chapter').length
    let result: Awaited<ReturnType<typeof adoptGeneratedOutlineItems>>
    try {
      result = await adoptGeneratedOutlineItems({
        projectId: project.id!,
        parentId: destinationVolume.id!,
        type: 'chapter',
        items: previewChapters,
        startingOrder: existingCount,
      })
    } catch (err) {
      console.error('[Outline] 写入章节失败:', err)
      toast.error(t('adopt.chapterWriteError', { error: err instanceof Error ? err.message : String(err) }))
      return
    }
    await loadAll(project.id!)
    setPreviewChapters(null)
    setPreviewTargetId(null)
    if (result.writtenCount === 0) {
      toast.error(t('adopt.chaptersNoneWritten', { reasons: listFormat.format(result.skippedReasons) || t('adopt.defaultSkipReason') }))
    } else if (result.writtenCount < previewChapters.length) {
      toast.info(t('adopt.chaptersPartial', { count: result.writtenCount, written: result.writtenCount, skipped: previewChapters.length - result.writtenCount, reasons: listFormat.format(result.skippedReasons) || t('adopt.defaultSkipReason') }))
    }
  }

  const handleDeleteSelectedVolume = async () => {
    if (!selectedVol?.id) return
    const ok = await dialog.confirm({
      title: t('deleteVolume.title', { title: selectedVol.title }),
      message: t('deleteVolume.message'),
      confirmText: t('common:delete'),
      tone: 'danger',
    })
    if (!ok) return
    deleteNode(selectedVol.id)
    setSelectedVolId(null)
  }

  const batch = useOutlineBatchGeneration({
    projectId: project.id!,
    multiWorldEnabled: Boolean(project.enableMultiWorld),
    volumes,
    nodes,
    hint,
    assembleContext: buildOutlineAssembledContext,
    reloadOutline: () => loadAll(project.id!),
    onError: toast.error,
  })

  // ── 侧栏：卷列表 ──

  const sidebarContent = (
    <OutlineVolumeSidebar
      volumes={volumes}
      nodes={normalizedNodes}
      selectedVolumeId={selectedVolId}
      multiWorldEnabled={Boolean(project.enableMultiWorld)}
      worldGroups={worldGroups}
      aiStreaming={ai.isStreaming}
      batchRunning={batch.running}
      batchProgress={batch.progress}
      batchResult={batch.result}
      activeChapterDrag={activeChapterDrag}
      getActiveChapterDrag={getActiveChapterDrag}
      onClearActiveChapterDrag={clearActiveChapterDrag}
      onSelectVolume={setSelectedVolId}
      onAddVolume={() => { void handleAddVolume() }}
      onGenerateVolumes={handleAIVolumes}
      onGenerateAllChapters={() => { void batch.generate() }}
      onCancelBatch={batch.cancel}
      onConfirmBatch={() => { void batch.confirm() }}
      onDismissBatch={batch.dismiss}
      onReorderVolumes={reorderNodes}
      onMoveChapter={handleMoveChapter}
    />
  )

  // ── 右侧编辑区 ──

  return (
    <PanelLayout
      sidebar={sidebarContent}
      sidebarTitle={t('sidebarTitle')}
      defaultWidth={220}
      minWidth={160}
      maxWidth={360}
      className="h-[calc(100vh-8rem)]"
    >
      <div className="p-4 space-y-4">
        {/* 调参 + 提示 */}
        <CInput value={hint} onChange={e => setHint(e.target.value)} placeholder={t('hintPlaceholder')}
          className="w-full px-3 py-2 bg-bg-surface border border-border rounded-md text-text-primary text-sm focus:outline-none focus:border-accent" />

        <PromptRunPanel
          moduleKey={generation.moduleKey}
          parameterValues={parameterValues}
          onParamChange={setParameterValues}
          systemOverride={systemOverride}
          onSystemOverrideChange={setSystemOverride}
          userOverride={userOverride}
          onUserOverrideChange={setUserOverride}
          open={promptPanelOpen}
          onOpenChange={setPromptPanelOpen}
        />

        {generation.pendingRequest && (
          <OutlineGenerationRequestPanel
            request={generation.pendingRequest}
            preparedContext={generation.preparedContext}
            loading={generation.contextLoading}
            error={generation.contextError}
            messages={generation.preparedNode?.messages}
            transparentMode={generation.transparentMode}
            promptReviewOpen={generation.promptReviewOpen}
            onTransparentModeChange={generation.setTransparentMode}
            onClosePromptReview={generation.closePromptReview}
            onConfirmMessages={messages => { void generation.confirmMessages(messages) }}
            onRetry={() => { void generation.prepare(generation.pendingRequest!) }}
            onCancel={generation.cancel}
            onConfirm={() => { void generation.confirm() }}
          />
        )}

        <OutlineGenerationResultPanel
          output={ai.output}
          isStreaming={ai.isStreaming}
          error={ai.error}
          tokenUsage={ai.tokenUsage}
          moduleKey={generation.moduleKey}
          restructuring={restructuring}
          previewVolumes={previewVolumes}
          previewChapters={previewChapters}
          previewTargetId={previewTargetId}
          selectedVolumeTitle={selectedVol?.title}
          onStop={ai.stop}
          onAccept={handlePreviewAccept}
          onRetry={() => { void generation.retry() }}
          onConfirmVolumes={() => { void handleConfirmVolumes() }}
          onConfirmChapters={() => { void handleConfirmChapters() }}
          onCancelPreview={clearGenerationPreview}
        />

        <OutlineVolumeDetail
          volume={selectedVol}
          nodes={normalizedNodes}
          multiWorldEnabled={Boolean(project.enableMultiWorld)}
          worldGroups={worldGroups}
          aiStreaming={ai.isStreaming}
          activeChapterDrag={activeChapterDrag}
          getActiveChapterDrag={getActiveChapterDrag}
          onChapterDragStart={beginChapterDrag}
          onChapterDragEnd={clearActiveChapterDrag}
          onUpdateNode={updateNode}
          onDeleteNode={deleteNode}
          onGenerateVolume={volumeId => { void generation.prepare({ kind: 'single-volume', volumeId }) }}
          onGenerateAllChapters={handleAIChapters}
          onAddChapter={parentId => { void handleAddChapter(parentId) }}
          onDeleteVolume={() => { void handleDeleteSelectedVolume() }}
          onAddStructure={structure => { void handleAddStructure(structure) }}
          onInsertChapterAfter={(chapterId, parentId) => { void handleInsertChapterAfter(chapterId, parentId) }}
          onGenerateChapter={chapterId => { void generation.prepare({ kind: 'single-chapter', chapterId }) }}
          onOpenChapter={onOpenChapter}
          onReorderNodes={orderedIds => { void reorderNodes(orderedIds) }}
          onMoveChapter={handleMoveChapter}
        />
      </div>
    </PanelLayout>
  )
}
