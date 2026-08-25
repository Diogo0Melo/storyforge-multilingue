import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Eye,
  FilePlus2,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { addNarrativeNode } from '../../lib/narrative/blueprint'
import type {
  NarrativeBeat,
  NarrativeBeatKind,
  NarrativeChoice,
  NarrativeContentGraphReport,
  NarrativeNode,
  NarrativeNodeKind,
  WorkspaceScope,
} from '../../lib/types'
import { NARRATIVE_BEAT_KINDS, NARRATIVE_NODE_KINDS } from '../../lib/types'
import {
  advanceStoryGameDraftPreview,
  buildStoryGameDraftPreview,
  createStarterStoryGame,
  deleteStoryGameDraft,
  deleteNarrativeBeat,
  deleteNarrativeChoice,
  deleteNarrativeNode,
  loadStoryGameAuthoringSnapshot,
  publishStoryGameDraft,
  seedStoryGameAcceptanceSample,
  updateGameDefinition,
  updateNarrativeBeat,
  updateNarrativeChoice,
  updateNarrativeModule,
  updateNarrativeNode,
  type StoryGameAuthoringSnapshot,
  type StoryGameDraftPreview,
} from '../../lib/text-game/authoring'
import {
  addNarrativeBeat,
  addNarrativeChoice,
  validateStoryGameContent,
} from '../../lib/text-game/content'
import { useDomainT } from '../../i18n'
import {
  NARRATIVE_BEAT_KIND_LABEL_KEYS,
  NARRATIVE_NODE_KIND_LABEL_KEYS,
  projectCanonicalLabel,
  type DisplayT,
} from '../../i18n/display-projection'
import { useDialog } from '../shared/Dialog'

type WorkbenchView = 'game' | 'content' | 'graph' | 'preview' | 'release' | 'help'

const EMPTY_SNAPSHOT: StoryGameAuthoringSnapshot = {
  definitions: [], modules: [], nodes: [], beats: [], choices: [], releases: [], characters: [],
}

function reportMessages(t: DisplayT, report: NarrativeContentGraphReport | null): string[] {
  if (!report) return []
  return [
    ...report.errors,
    ...report.danglingSuccessors.map(item => t('textGame.story.workbench.diagDanglingSuccessor', { from: item.nodeKey, to: item.successorKey })),
    ...report.invalidChoiceTargets.map(item => t('textGame.story.workbench.diagInvalidChoiceTarget', { choice: item.choiceKey, target: item.targetNodeKey })),
    ...report.unreachableNodeKeys.map(key => t('textGame.story.workbench.diagUnreachableNode', { key })),
    ...report.orphanBeatKeys.map(key => t('textGame.story.workbench.diagOrphanBeat', { key })),
    ...report.orphanChoiceKeys.map(key => t('textGame.story.workbench.diagOrphanChoice', { key })),
    ...report.blockingCycleKeys.map(keys => t('textGame.story.workbench.diagBlockingCycle', { cycle: keys.join(' → ') })),
  ]
}

function BeatEditor(props: {
  scope: WorkspaceScope
  beat: NarrativeBeat
  characters: StoryGameAuthoringSnapshot['characters']
  onChanged: () => Promise<void>
}) {
  const [kind, setKind] = useState(props.beat.kind)
  const [text, setText] = useState(props.beat.text)
  const [speaker, setSpeaker] = useState(props.beat.speakerCharacterId?.toString() ?? '')
  const [order, setOrder] = useState(props.beat.order)
  const [busy, setBusy] = useState(false)
  const { t } = useDomainT('simulation')
  const save = async () => {
    setBusy(true)
    try {
      await updateNarrativeBeat({
        scope: props.scope,
        beatId: props.beat.id!,
        kind,
        speakerCharacterId: kind === 'dialogue' && speaker ? Number(speaker) : null,
        text,
        order,
      })
      await props.onChanged()
    } finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true)
    try { await deleteNarrativeBeat({ scope: props.scope, beatId: props.beat.id! }); await props.onChanged() } finally { setBusy(false) }
  }
  return <article className="storygame-author-card storygame-beat-editor">
    <div className="storygame-author-card-head"><code>{props.beat.beatKey}</code><label>{t('textGame.story.workbench.orderLabel')}<input type="number" value={order} onChange={event => setOrder(Number(event.target.value))} /></label></div>
    <div className="storygame-author-inline">
      <label>{t('textGame.story.workbench.typeLabel')}<select value={kind} onChange={event => setKind(event.target.value as NarrativeBeatKind)}>{NARRATIVE_BEAT_KINDS.map(value => <option key={value} value={value}>{projectCanonicalLabel(t, NARRATIVE_BEAT_KIND_LABEL_KEYS, value)}</option>)}</select></label>
      {kind === 'dialogue' && <label>{t('textGame.story.workbench.speakerLabel')}<select value={speaker} onChange={event => setSpeaker(event.target.value)}><option value="">{t('textGame.story.workbench.selectCharacterOption')}</option>{props.characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>}
    </div>
    <label>{t('textGame.story.workbench.textLabel')}<textarea rows={3} value={text} onChange={event => setText(event.target.value)} /></label>
    <div className="storygame-author-actions"><button type="button" onClick={() => void save()} disabled={busy || !text.trim()}><Save className="h-3.5 w-3.5" />{t('textGame.story.workbench.save')}</button><button type="button" className="danger" onClick={() => void remove()} disabled={busy}><Trash2 className="h-3.5 w-3.5" />{t('textGame.story.workbench.delete')}</button></div>
  </article>
}

function ChoiceEditor(props: {
  scope: WorkspaceScope
  choice: NarrativeChoice
  nodes: NarrativeNode[]
  onChanged: () => Promise<void>
}) {
  const [text, setText] = useState(props.choice.text)
  const [description, setDescription] = useState(props.choice.description)
  const [target, setTarget] = useState(props.choice.targetNodeKey)
  const [display, setDisplay] = useState(props.choice.displayConditionJson)
  const [available, setAvailable] = useState(props.choice.availableConditionJson)
  const [reason, setReason] = useState(props.choice.unavailableReason)
  const [effects, setEffects] = useState(props.choice.effectsJson)
  const [tags, setTags] = useState(props.choice.tagsJson)
  const [order, setOrder] = useState(props.choice.order)
  const [busy, setBusy] = useState(false)
  const { t } = useDomainT('simulation')
  const save = async () => {
    setBusy(true)
    try {
      await updateNarrativeChoice({
        scope: props.scope,
        choiceId: props.choice.id!,
        text,
        description,
        unavailableReason: reason,
        targetNodeKey: target,
        displayConditionJson: display,
        availableConditionJson: available,
        effectsJson: effects,
        tagsJson: tags,
        order,
      })
      await props.onChanged()
    } finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true)
    try { await deleteNarrativeChoice({ scope: props.scope, choiceId: props.choice.id! }); await props.onChanged() } finally { setBusy(false) }
  }
  return <article className="storygame-author-card storygame-choice-editor">
    <div className="storygame-author-card-head"><code>{props.choice.choiceKey}</code><label>{t('textGame.story.workbench.orderLabel')}<input type="number" value={order} onChange={event => setOrder(Number(event.target.value))} /></label></div>
    <label>{t('textGame.story.workbench.choiceTextLabel')}<input value={text} onChange={event => setText(event.target.value)} /></label>
    <label>{t('textGame.story.workbench.choiceDescLabel')}<input value={description} onChange={event => setDescription(event.target.value)} /></label>
    <div className="storygame-author-inline"><label>{t('textGame.story.workbench.targetNodeLabel')}<select value={target} onChange={event => setTarget(event.target.value)}>{props.nodes.map(node => <option key={node.key} value={node.key}>{node.title} · {node.key}</option>)}</select></label><label>{t('textGame.story.workbench.unavailableReasonLabel')}<input value={reason} onChange={event => setReason(event.target.value)} placeholder={t('textGame.story.workbench.unavailableReasonPlaceholder')} /></label></div>
    <details><summary>{t('textGame.story.workbench.conditionsSummary')}</summary><div className="storygame-author-json-grid"><label>{t('textGame.story.workbench.displayConditionLabel')}<textarea rows={3} value={display} onChange={event => setDisplay(event.target.value)} /></label><label>{t('textGame.story.workbench.availableConditionLabel')}<textarea rows={3} value={available} onChange={event => setAvailable(event.target.value)} /></label><label>{t('textGame.story.workbench.effectsLabel')}<textarea rows={3} value={effects} onChange={event => setEffects(event.target.value)} /></label><label>{t('textGame.story.workbench.tagsLabel')}<textarea rows={3} value={tags} onChange={event => setTags(event.target.value)} /></label></div></details>
    <div className="storygame-author-actions"><button type="button" onClick={() => void save()} disabled={busy || !text.trim() || !target}><Save className="h-3.5 w-3.5" />{t('textGame.story.workbench.save')}</button><button type="button" className="danger" onClick={() => void remove()} disabled={busy}><Trash2 className="h-3.5 w-3.5" />{t('textGame.story.workbench.delete')}</button></div>
  </article>
}

export default function StoryGameWorkbench(props: { scope: WorkspaceScope }) {
  const dialog = useDialog()
  const { t } = useDomainT('simulation')
  const [snapshot, setSnapshot] = useState<StoryGameAuthoringSnapshot>(EMPTY_SNAPSHOT)
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<number | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
  const [view, setView] = useState<WorkbenchView>('game')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [report, setReport] = useState<NarrativeContentGraphReport | null>(null)
  const [preview, setPreview] = useState<StoryGameDraftPreview | null>(null)
  const [previewStart, setPreviewStart] = useState('')
  const [gameTitle, setGameTitle] = useState('')
  const [gameDescription, setGameDescription] = useState('')
  const [initialVariables, setInitialVariables] = useState('{}')
  const [moduleTitle, setModuleTitle] = useState('')
  const [moduleDescription, setModuleDescription] = useState('')
  const [entryNodeKey, setEntryNodeKey] = useState('')
  const [nodeTitle, setNodeTitle] = useState('')
  const [nodeSummary, setNodeSummary] = useState('')
  const [nodeKind, setNodeKind] = useState<NarrativeNodeKind>('scene')
  const [nodeCondition, setNodeCondition] = useState('{}')
  const [nodeEffects, setNodeEffects] = useState('[]')
  const [newNodeKey, setNewNodeKey] = useState('')
  const [newNodeTitle, setNewNodeTitle] = useState('')
  const [newNodeKind, setNewNodeKind] = useState<NarrativeNodeKind>('scene')
  const [newBeatText, setNewBeatText] = useState('')
  const [newBeatKind, setNewBeatKind] = useState<NarrativeBeatKind>('narration')
  const [newBeatSpeaker, setNewBeatSpeaker] = useState('')
  const [newChoiceText, setNewChoiceText] = useState('')
  const [newChoiceTarget, setNewChoiceTarget] = useState('')

  const load = async () => {
    const loaded = await loadStoryGameAuthoringSnapshot(props.scope)
    setSnapshot(loaded)
    setSelectedDefinitionId(previous => loaded.definitions.some(item => item.id === previous) ? previous : loaded.definitions[0]?.id ?? null)
    setLoading(false)
  }
  useEffect(() => {
    setLoading(true); setError(''); setMessage(''); setPreview(null); setReport(null)
    void load().catch(cause => { setError(cause instanceof Error ? cause.message : t('textGame.story.workbench.loadFailedError')); setLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.scope.projectId, props.scope.worldId, props.scope.workId])

  const definition = snapshot.definitions.find(item => item.id === selectedDefinitionId) ?? null
  const module = snapshot.modules.find(item => item.id === definition?.narrativeModuleId) ?? null
  const nodes = useMemo(() => snapshot.nodes.filter(item => item.moduleId === module?.id).sort((a, b) => a.order - b.order), [module?.id, snapshot.nodes])
  const selectedNode = nodes.find(item => item.id === selectedNodeId) ?? nodes[0] ?? null
  const beats = useMemo(() => snapshot.beats.filter(item => item.moduleId === module?.id && item.nodeKey === selectedNode?.key).sort((a, b) => a.order - b.order), [module?.id, selectedNode?.key, snapshot.beats])
  const choices = useMemo(() => snapshot.choices.filter(item => item.moduleId === module?.id && item.sourceNodeKey === selectedNode?.key).sort((a, b) => a.order - b.order), [module?.id, selectedNode?.key, snapshot.choices])
  const releases = useMemo(() => snapshot.releases.filter(item => item.gameDefinitionId === definition?.id), [definition?.id, snapshot.releases])

  useEffect(() => {
    if (!definition || !module) return
    setGameTitle(definition.title); setGameDescription(definition.description); setInitialVariables(definition.initialVariablesJson)
    setModuleTitle(module.title); setModuleDescription(module.description); setEntryNodeKey(module.entryNodeKey ?? '')
    setPreview(null); setReport(null)
  }, [definition, module])
  useEffect(() => {
    if (!selectedNode) return
    setSelectedNodeId(selectedNode.id!); setNodeTitle(selectedNode.title); setNodeSummary(selectedNode.summary)
    setNodeKind(selectedNode.kind); setNodeCondition(selectedNode.conditionJson); setNodeEffects(selectedNode.effectsJson)
    setNewChoiceTarget(nodes.find(node => node.id !== selectedNode.id)?.key ?? '')
  }, [selectedNode, nodes])

  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { await action() } catch (cause) { setError(cause instanceof Error ? cause.message : t('textGame.story.workbench.actionFailedError')) } finally { setBusy(false) }
  }
  const refresh = async () => { await load(); setPreview(null); setReport(null) }
  const createBlank = () => run(async () => {
    const created = await createStarterStoryGame({ scope: props.scope })
    await load(); setSelectedDefinitionId(created.id!); setMessage(t('textGame.story.workbench.createdBlankMessage'))
  })
  const createSample = () => run(async () => {
    const created = await seedStoryGameAcceptanceSample({ scope: props.scope })
    await load(); setSelectedDefinitionId(created.id!); setMessage(t('textGame.story.workbench.createdSampleMessage'))
  })
  const saveGame = () => run(async () => {
    if (!definition || !module) return
    await updateGameDefinition({ scope: props.scope, gameDefinitionId: definition.id!, title: gameTitle, description: gameDescription, initialVariablesJson: initialVariables })
    await updateNarrativeModule({ scope: props.scope, moduleId: module.id!, title: moduleTitle, description: moduleDescription, entryNodeKey })
    await refresh(); setMessage(t('textGame.story.workbench.settingsSavedMessage'))
  })
  const removeGame = () => run(async () => {
    if (!definition) return
    const confirmed = await dialog.confirm({
      title: t('textGame.story.workbench.draftDeleteConfirmTitle', { title: definition.title }),
      message: t('textGame.story.workbench.draftDeleteConfirmMessage'),
      confirmText: t('textGame.story.workbench.draftDeleteConfirmAction'),
      tone: 'danger',
    })
    if (!confirmed) return
    await deleteStoryGameDraft({ scope: props.scope, gameDefinitionId: definition.id! }); await refresh(); setMessage(t('textGame.story.workbench.draftDeletedMessage'))
  })
  const addNode = () => run(async () => {
    if (!module) return
    const created = await addNarrativeNode({ scope: props.scope, moduleId: module.id!, key: newNodeKey, kind: newNodeKind, title: newNodeTitle, order: nodes.length })
    setNewNodeKey(''); setNewNodeTitle(''); await load(); setSelectedNodeId(created.id!); setMessage(t('textGame.story.workbench.nodeCreatedMessage'))
  })
  const saveNode = () => run(async () => {
    if (!selectedNode) return
    await updateNarrativeNode({ scope: props.scope, nodeId: selectedNode.id!, kind: nodeKind, title: nodeTitle, summary: nodeSummary, conditionJson: nodeCondition, effectsJson: nodeEffects })
    await refresh(); setMessage(t('textGame.story.workbench.nodeSavedMessage'))
  })
  const removeNode = () => run(async () => {
    if (!selectedNode) return
    const confirmed = await dialog.confirm({ title: t('textGame.story.workbench.nodeDeleteConfirmTitle', { title: selectedNode.title }), message: t('textGame.story.workbench.nodeDeleteConfirmMessage'), confirmText: t('textGame.story.workbench.nodeDeleteConfirmAction'), tone: 'danger' })
    if (!confirmed) return
    await deleteNarrativeNode({ scope: props.scope, nodeId: selectedNode.id! }); setSelectedNodeId(null); await refresh(); setMessage(t('textGame.story.workbench.nodeDeletedMessage'))
  })
  const addBeat = () => run(async () => {
    if (!module || !selectedNode) return
    await addNarrativeBeat({
      scope: props.scope,
      moduleId: module.id!,
      nodeKey: selectedNode.key,
      beatKey: `${selectedNode.key}.beat-${Date.now().toString(36)}`,
      kind: newBeatKind,
      speakerCharacterId: newBeatKind === 'dialogue' && newBeatSpeaker ? Number(newBeatSpeaker) : null,
      text: newBeatText,
      order: beats.length,
    })
    setNewBeatText(''); await refresh(); setMessage(t('textGame.story.workbench.beatAddedMessage'))
  })
  const addChoice = () => run(async () => {
    if (!module || !selectedNode) return
    await addNarrativeChoice({
      scope: props.scope,
      moduleId: module.id!,
      sourceNodeKey: selectedNode.key,
      choiceKey: `${selectedNode.key}.choice-${Date.now().toString(36)}`,
      text: newChoiceText,
      targetNodeKey: newChoiceTarget,
      order: choices.length,
    })
    setNewChoiceText(''); await refresh(); setMessage(t('textGame.story.workbench.choiceAddedMessage'))
  })
  const checkGraph = () => run(async () => {
    if (!module) return
    const next = await validateStoryGameContent(props.scope, module.id!); setReport(next)
    setMessage(next.valid ? t('textGame.story.workbench.checkPassedMessage') : t('textGame.story.workbench.checkIssuesMessage', { count: reportMessages(t, next).length }))
  })
  const startPreview = (nodeKey?: string) => run(async () => {
    if (!definition) return
    const next = await buildStoryGameDraftPreview({ scope: props.scope, gameDefinitionId: definition.id!, startNodeKey: nodeKey || previewStart || undefined })
    setPreview(next); setPreviewStart(next.state.currentNodeKey ?? '')
  })
  const choosePreview = (choiceKey: string) => {
    try { if (preview) setPreview(advanceStoryGameDraftPreview(preview, choiceKey)) } catch (cause) { setError(cause instanceof Error ? cause.message : t('textGame.story.workbench.previewAdvanceError')) }
  }
  const publish = () => run(async () => {
    if (!definition) return
    const confirmed = await dialog.confirm({ title: t('textGame.story.workbench.publishConfirmTitle', { title: definition.title }), message: t('textGame.story.workbench.publishConfirmMessage'), confirmText: t('textGame.story.workbench.publishConfirmAction') })
    if (!confirmed) return
    const published = await publishStoryGameDraft({ scope: props.scope, gameDefinitionId: definition.id!, label: `${definition.title} v${releases.length + 1}` })
    setReport(published.report); await load(); setMessage(t('textGame.story.workbench.publishedMessage', { version: published.gameRelease.version }))
  })

  const previewNode = preview?.state.nodes.find(node => node.key === preview.state.currentNodeKey) ?? null
  const previewBeats = (preview?.state.beats ?? []).filter(beat => beat.nodeKey === previewNode?.key).sort((a, b) => a.order - b.order)
  const previewChoices = (preview?.state.visibleChoiceKeys ?? []).map(key => preview?.state.choices?.find(choice => choice.choiceKey === key)).filter((choice): choice is NonNullable<typeof choice> => choice != null)
  const issues = reportMessages(t, report)

  if (loading) return <div className="storygame-author-empty"><Loader2 className="h-6 w-6 animate-spin" />{t('textGame.story.workbench.loading')}</div>
  return <section className="storygame-author" aria-label={t('textGame.story.workbench.title')} data-testid="storygame-workbench">
    <aside className="storygame-author-sidebar">
      <div className="storygame-author-sidebar-head"><strong>{t('textGame.story.workbench.draftsHeading')}</strong><button type="button" aria-label={t('textGame.story.workbench.refreshAria')} onClick={() => void run(refresh)}><RefreshCw className="h-3.5 w-3.5" /></button></div>
      <div className="storygame-author-game-list">{snapshot.definitions.map(item => <button type="button" className={item.id === definition?.id ? 'active' : ''} key={item.id} onClick={() => setSelectedDefinitionId(item.id!)}><strong>{item.title}</strong><small>{item.gameKey} · {item.status === 'draft' ? t('textGame.story.workbench.statusDraft') : t('textGame.story.workbench.statusArchived')}</small></button>)}</div>
      <button type="button" className="storygame-author-create" onClick={createBlank} disabled={busy}><FilePlus2 className="h-4 w-4" />{t('textGame.story.workbench.createBlank')}</button>
      <button type="button" className="storygame-author-create sample" onClick={createSample} disabled={busy}><Sparkles className="h-4 w-4" />{t('textGame.story.workbench.loadSample')}</button>
      <p>{t('textGame.story.workbench.sampleBlurb')}</p>
    </aside>
    <div className="storygame-author-main">
      <header className="storygame-author-toolbar">
        <div><strong>{definition?.title ?? t('textGame.story.workbench.title')}</strong><span>{module ? t('textGame.story.workbench.moduleStats', { module: module.title, nodes: nodes.length, beats: snapshot.beats.filter(item => item.moduleId === module.id).length, choices: snapshot.choices.filter(item => item.moduleId === module.id).length }) : t('textGame.story.workbench.noDraftHint')}</span></div>
        <nav aria-label={t('textGame.story.workbench.viewsAria')}>
          {([
            ['game', t('textGame.story.workbench.navGame')], ['content', t('textGame.story.workbench.navContent')], ['graph', t('textGame.story.workbench.navGraph')], ['preview', t('textGame.story.workbench.navPreview')], ['release', t('textGame.story.workbench.navRelease')], ['help', t('textGame.story.workbench.navHelp')],
          ] as Array<[WorkbenchView, string]>).map(([id, label]) => <button key={id} type="button" className={view === id ? 'active' : ''} onClick={() => setView(id)} disabled={!definition && id !== 'help'}>{label}</button>)}
        </nav>
      </header>
      {(error || message) && <div className={`storygame-author-notice ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>{error ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}<span>{error || message}</span><button type="button" aria-label={t('textGame.story.workbench.dismissNoticeAria')} onClick={() => { setError(''); setMessage('') }}>×</button></div>}
      {!definition && view !== 'help' ? <div className="storygame-author-empty"><BookOpenCheck className="h-8 w-8" /><h2>{t('textGame.story.workbench.emptyTitle')}</h2><p>{t('textGame.story.workbench.emptyIntro')}</p></div> : view === 'game' && definition && module ? <div className="storygame-author-pane">
        <div className="storygame-author-heading"><div><small>{t('textGame.story.workbench.gameDefKicker')}</small><h2>{t('textGame.story.workbench.gameModuleHeading')}</h2></div><div className="storygame-author-actions"><button type="button" onClick={saveGame} disabled={busy}><Save className="h-4 w-4" />{t('textGame.story.workbench.saveSettings')}</button><button type="button" className="danger" onClick={removeGame} disabled={busy}><Trash2 className="h-4 w-4" />{t('textGame.story.workbench.deleteDraft')}</button></div></div>
        <div className="storygame-author-form-grid"><label>{t('textGame.story.workbench.gameTitleLabel')}<input value={gameTitle} onChange={event => setGameTitle(event.target.value)} /></label><label>{t('textGame.story.workbench.gameKeyLabel')}<input value={definition.gameKey} readOnly /></label><label className="wide">{t('textGame.story.workbench.gameDescLabel')}<textarea rows={3} value={gameDescription} onChange={event => setGameDescription(event.target.value)} /></label><label>{t('textGame.story.workbench.moduleTitleLabel')}<input value={moduleTitle} onChange={event => setModuleTitle(event.target.value)} /></label><label>{t('textGame.story.workbench.entryNodeLabel')}<select value={entryNodeKey} onChange={event => setEntryNodeKey(event.target.value)}>{nodes.map(node => <option key={node.key} value={node.key}>{node.title} · {node.key}</option>)}</select></label><label className="wide">{t('textGame.story.workbench.moduleDescLabel')}<textarea rows={3} value={moduleDescription} onChange={event => setModuleDescription(event.target.value)} /></label><label className="wide">{t('textGame.story.workbench.initialVarsLabel')}<textarea rows={5} value={initialVariables} onChange={event => setInitialVariables(event.target.value)} spellCheck={false} /></label></div>
        <div className="storygame-author-contract"><ShieldCheck className="h-5 w-5" /><div><strong>{t('textGame.story.workbench.contractTitle')}</strong><p>{t('textGame.story.workbench.contractBody')}</p></div></div>
      </div> : view === 'content' && module ? <div className="storygame-content-layout">
        <aside className="storygame-node-list-author"><div className="storygame-author-card-head"><strong>{t('textGame.story.workbench.nodeListHeading')}</strong><span>{nodes.length}</span></div>{nodes.map(node => <button type="button" key={node.id} className={node.id === selectedNode?.id ? 'active' : ''} onClick={() => setSelectedNodeId(node.id!)}><span>{projectCanonicalLabel(t, NARRATIVE_NODE_KIND_LABEL_KEYS, node.kind)}</span><strong>{node.title}</strong><code>{node.key}</code></button>)}<div className="storygame-new-node"><input aria-label={t('textGame.story.workbench.newNodeKeyAria')} value={newNodeKey} onChange={event => setNewNodeKey(event.target.value)} placeholder={t('textGame.story.workbench.newNodeKeyPlaceholder')} /><input aria-label={t('textGame.story.workbench.newNodeTitleAria')} value={newNodeTitle} onChange={event => setNewNodeTitle(event.target.value)} placeholder={t('textGame.story.workbench.newNodeTitlePlaceholder')} /><select aria-label={t('textGame.story.workbench.newNodeKindAria')} value={newNodeKind} onChange={event => setNewNodeKind(event.target.value as NarrativeNodeKind)}>{NARRATIVE_NODE_KINDS.map(value => <option key={value} value={value}>{projectCanonicalLabel(t, NARRATIVE_NODE_KIND_LABEL_KEYS, value)}</option>)}</select><button type="button" onClick={addNode} disabled={busy || !newNodeKey.trim() || !newNodeTitle.trim()}><Plus className="h-3.5 w-3.5" />{t('textGame.story.workbench.addNode')}</button></div></aside>
        {selectedNode ? <div className="storygame-node-editor">
          <div className="storygame-author-heading"><div><small>{projectCanonicalLabel(t, NARRATIVE_NODE_KIND_LABEL_KEYS, selectedNode.kind)} · {selectedNode.key}</small><h2>{selectedNode.title}</h2></div><div className="storygame-author-actions"><button type="button" onClick={saveNode} disabled={busy}><Save className="h-4 w-4" />{t('textGame.story.workbench.saveNode')}</button><button type="button" className="danger" onClick={removeNode} disabled={busy}><Trash2 className="h-4 w-4" />{t('textGame.story.workbench.delete')}</button></div></div>
          <div className="storygame-author-form-grid"><label>{t('textGame.story.workbench.newNodeTitlePlaceholder')}<input value={nodeTitle} onChange={event => setNodeTitle(event.target.value)} /></label><label>{t('textGame.story.workbench.nodeTypeLabel')}<select value={nodeKind} onChange={event => setNodeKind(event.target.value as NarrativeNodeKind)}>{NARRATIVE_NODE_KINDS.map(value => <option key={value} value={value}>{projectCanonicalLabel(t, NARRATIVE_NODE_KIND_LABEL_KEYS, value)}</option>)}</select></label><label className="wide">{t('textGame.story.workbench.summaryLabel')}<textarea rows={2} value={nodeSummary} onChange={event => setNodeSummary(event.target.value)} /></label><label>{t('textGame.story.workbench.enterConditionJsonLabel')}<textarea rows={4} value={nodeCondition} onChange={event => setNodeCondition(event.target.value)} spellCheck={false} /></label><label>{t('textGame.story.workbench.enterEffectsJsonLabel')}<textarea rows={4} value={nodeEffects} onChange={event => setNodeEffects(event.target.value)} spellCheck={false} /></label></div>
          <section className="storygame-author-section"><div className="storygame-author-section-head"><div><h3>{t('textGame.story.workbench.beatsHeading')}</h3><small>{t('textGame.story.workbench.beatsSubheading')}</small></div><span>{beats.length}</span></div>{beats.map(beat => <BeatEditor key={beat.id} scope={props.scope} beat={beat} characters={snapshot.characters} onChanged={refresh} />)}<div className="storygame-author-add-row"><select aria-label={t('textGame.story.workbench.newBeatKindAria')} value={newBeatKind} onChange={event => setNewBeatKind(event.target.value as NarrativeBeatKind)}>{NARRATIVE_BEAT_KINDS.map(value => <option key={value} value={value}>{projectCanonicalLabel(t, NARRATIVE_BEAT_KIND_LABEL_KEYS, value)}</option>)}</select>{newBeatKind === 'dialogue' && <select aria-label={t('textGame.story.workbench.newBeatSpeakerAria')} value={newBeatSpeaker} onChange={event => setNewBeatSpeaker(event.target.value)}><option value="">{t('textGame.story.workbench.chooseCharacterOption')}</option>{snapshot.characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select>}<textarea aria-label={t('textGame.story.workbench.newBeatTextAria')} rows={2} value={newBeatText} onChange={event => setNewBeatText(event.target.value)} placeholder={t('textGame.story.workbench.newBeatTextPlaceholder')} /><button type="button" onClick={addBeat} disabled={busy || !newBeatText.trim() || (newBeatKind === 'dialogue' && !newBeatSpeaker)}><Plus className="h-3.5 w-3.5" />{t('textGame.story.workbench.addBeat')}</button></div></section>
          <section className="storygame-author-section"><div className="storygame-author-section-head"><div><h3>{t('textGame.story.workbench.choicesHeading')}</h3><small>{t('textGame.story.workbench.choicesSubheading')}</small></div><span>{choices.length}</span></div>{choices.map(choice => <ChoiceEditor key={choice.id} scope={props.scope} choice={choice} nodes={nodes} onChanged={refresh} />)}{selectedNode.kind !== 'ending' && <div className="storygame-author-add-row choice"><input aria-label={t('textGame.story.workbench.newChoiceTextAria')} value={newChoiceText} onChange={event => setNewChoiceText(event.target.value)} placeholder={t('textGame.story.workbench.newChoiceTextPlaceholder')} /><select aria-label={t('textGame.story.workbench.newChoiceTargetAria')} value={newChoiceTarget} onChange={event => setNewChoiceTarget(event.target.value)}>{nodes.filter(node => node.id !== selectedNode.id).map(node => <option key={node.key} value={node.key}>{node.title} · {node.key}</option>)}</select><button type="button" onClick={addChoice} disabled={busy || !newChoiceText.trim() || !newChoiceTarget}><Plus className="h-3.5 w-3.5" />{t('textGame.story.workbench.addChoice')}</button></div>}</section>
        </div> : null}
      </div> : view === 'graph' && module ? <div className="storygame-author-pane">
        <div className="storygame-author-heading"><div><small>{t('textGame.story.workbench.graphKicker')}</small><h2>{t('textGame.story.workbench.graphHeading')}</h2></div><button type="button" onClick={checkGraph} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{t('textGame.story.workbench.runFullCheck')}</button></div>
        {report && <div className={`storygame-graph-summary ${report.valid ? 'valid' : 'invalid'}`}>{report.valid ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}<div><strong>{report.valid ? t('textGame.story.workbench.graphValidMessage') : t('textGame.story.workbench.graphBlockedMessage', { count: issues.length })}</strong><span>{t('textGame.story.workbench.graphStatsLine', { reachable: report.reachableNodeKeys.length, total: nodes.length, reachableEndings: report.reachableEndingKeys.length, endings: report.endingNodeKeys.length, cycles: report.cycleRisks.length })}</span></div></div>}
        {issues.length > 0 && <ul className="storygame-graph-issues">{issues.map((issue, index) => <li key={`${issue}-${index}`}><AlertTriangle className="h-3.5 w-3.5" />{issue}</li>)}</ul>}
        <div className="storygame-graph">{nodes.map(node => { const outgoing = snapshot.choices.filter(choice => choice.moduleId === module.id && choice.sourceNodeKey === node.key); return <article key={node.key} className={`storygame-graph-node ${report?.unreachableNodeKeys.includes(node.key) ? 'unreachable' : ''}`}><div><span>{projectCanonicalLabel(t, NARRATIVE_NODE_KIND_LABEL_KEYS, node.kind)}</span><code>{node.key}</code></div><strong>{node.title}</strong><ul>{outgoing.map(choice => <li key={choice.id}><span>{choice.text}</span><ChevronRight className="h-3 w-3" /><code>{choice.targetNodeKey}</code></li>)}</ul>{node.kind !== 'ending' && outgoing.length === 0 && <small>{t('textGame.story.workbench.noExitHint')}</small>}</article> })}</div>
      </div> : view === 'preview' && definition ? <div className="storygame-author-pane">
        <div className="storygame-author-heading"><div><small>{t('textGame.story.workbench.previewKicker')}</small><h2>{t('textGame.story.workbench.previewHeading')}</h2></div><div className="storygame-preview-start"><select aria-label={t('textGame.story.workbench.previewStartAria')} value={previewStart} onChange={event => setPreviewStart(event.target.value)}><option value="">{t('textGame.story.workbench.moduleEntryOption')}</option>{nodes.map(node => <option key={node.key} value={node.key}>{node.title} · {node.key}</option>)}</select><button type="button" onClick={() => void startPreview()} disabled={busy}><Eye className="h-4 w-4" />{t('textGame.story.workbench.startReset')}</button></div></div>
        <div className="storygame-preview-note"><ShieldCheck className="h-4 w-4" />{t('textGame.story.workbench.previewNote')}</div>
        {preview && previewNode ? <section className="storygame-draft-player"><div className="storygame-draft-meta"><span>{preview.state.moduleTitle}</span><span>{t('textGame.story.workbench.previewMetaLine', { visited: preview.state.visitedNodeKeys.length, choices: (preview.state.choiceHistory ?? []).length })}</span></div><small>{projectCanonicalLabel(t, NARRATIVE_NODE_KIND_LABEL_KEYS, previewNode.kind)} · {previewNode.key}</small><h2>{previewNode.title}</h2>{previewNode.summary && <p className="summary">{previewNode.summary}</p>}<div className="storygame-draft-beats">{previewBeats.map(beat => <article key={beat.beatKey}><strong>{beat.kind === 'dialogue' ? preview.speakerNames[beat.speakerKey ?? ''] ?? t('textGame.common.player.unknownSpeaker') : projectCanonicalLabel(t, NARRATIVE_BEAT_KIND_LABEL_KEYS, beat.kind)}</strong><p>{beat.text}</p></article>)}</div>{preview.state.completed ? <div className="storygame-draft-ending"><CheckCircle2 className="h-6 w-6" /><strong>{t('textGame.story.workbench.reachedEnding')}</strong><button type="button" onClick={() => void startPreview()}>{t('textGame.story.workbench.restartPreview')}</button></div> : <div className="storygame-draft-choices">{previewChoices.map(choice => { const available = preview.state.availableChoiceKeys?.includes(choice.choiceKey) ?? false; return <div key={choice.choiceKey}><button type="button" onClick={() => choosePreview(choice.choiceKey)} disabled={!available}><strong>{choice.text}</strong><span>{choice.description}</span></button>{!available && <small>{choice.unavailableReason || t('textGame.story.player.conditionNotMet')}</small>}</div> })}</div>}</section> : <div className="storygame-author-empty compact"><Eye className="h-7 w-7" /><h2>{t('textGame.story.workbench.previewEmptyTitle')}</h2><p>{t('textGame.story.workbench.previewEmptyIntro')}</p></div>}
      </div> : view === 'release' && definition && module ? <div className="storygame-author-pane">
        <div className="storygame-author-heading"><div><small>{t('textGame.story.workbench.releaseKicker')}</small><h2>{t('textGame.story.workbench.releaseHeading')}</h2></div><div className="storygame-author-actions"><button type="button" onClick={checkGraph} disabled={busy}><ShieldCheck className="h-4 w-4" />{t('textGame.story.workbench.releaseCheck')}</button><button type="button" onClick={publish} disabled={busy || report?.valid !== true}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}{t('textGame.story.workbench.publishNewVersion')}</button></div></div>
        <div className="storygame-release-pipeline"><article><span>1</span><div><strong>{t('textGame.story.workbench.pipeline1Title')}</strong><p>{t('textGame.story.workbench.pipeline1Body')}</p></div></article><article><span>2</span><div><strong>{t('textGame.story.workbench.pipeline2Title')}</strong><p>{t('textGame.story.workbench.pipeline2Body')}</p></div></article><article><span>3</span><div><strong>{t('textGame.story.workbench.pipeline3Title')}</strong><p>{t('textGame.story.workbench.pipeline3Body')}</p></div></article></div>
        <div className="storygame-version-list"><div className="storygame-author-section-head"><div><h3>{t('textGame.story.workbench.versionsHeading')}</h3><small>{t('textGame.story.workbench.versionsSubheading')}</small></div><span>{releases.length}</span></div>{releases.map(release => <article key={release.id}><div><strong>v{release.version} · {release.label}</strong><span>{new Date(release.createdAt).toLocaleString('zh-CN')}</span></div><code>{release.contentHash.slice(0, 16)}…</code><span>WorldRelease #{release.worldReleaseId}</span></article>)}{releases.length === 0 && <div className="storygame-author-empty compact"><Rocket className="h-7 w-7" /><h2>{t('textGame.story.workbench.noReleasesTitle')}</h2><p>{t('textGame.story.workbench.noReleasesIntro')}</p></div>}</div>
      </div> : view === 'help' ? <div className="storygame-author-pane storygame-author-help">
        <div className="storygame-author-heading"><div><small>{t('textGame.story.workbench.helpKicker')}</small><h2>{t('textGame.story.workbench.helpHeading')}</h2></div><CircleHelp className="h-6 w-6" /></div>
        <div className="storygame-help-grid"><article><span>1</span><div><strong>{t('textGame.story.workbench.help1Title')}</strong><p>{t('textGame.story.workbench.help1Body')}</p></div></article><article><span>2</span><div><strong>{t('textGame.story.workbench.help2Title')}</strong><p>{t('textGame.story.workbench.help2Body')}</p></div></article><article><span>3</span><div><strong>{t('textGame.story.workbench.help3Title')}</strong><p>{t('textGame.story.workbench.help3Body')}</p></div></article><article><span>4</span><div><strong>{t('textGame.story.workbench.help4Title')}</strong><p>{t('textGame.story.workbench.help4Body')}</p></div></article><article><span>5</span><div><strong>{t('textGame.story.workbench.help5Title')}</strong><p>{t('textGame.story.workbench.help5Body')}</p></div></article><article><span>6</span><div><strong>{t('textGame.story.workbench.help6Title')}</strong><p>{t('textGame.story.workbench.help6Body')}</p></div></article></div>
        <div className="storygame-author-contract"><GitBranch className="h-5 w-5" /><div><strong>{t('textGame.story.workbench.recommendedPathTitle')}</strong><p>{t('textGame.story.workbench.recommendedPathBody')}</p></div></div>
      </div> : null}
    </div>
  </section>
}
