import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FileJson2,
  GitBranch,
  Loader2,
  Map,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import {
  deleteAdventureGameDraft,
  loadAdventureAuthoringSnapshot,
  publishAdventureGameDraft,
  saveAdventureContent,
  seedAdventureAcceptanceGame,
  updateAdventureGameDefinition,
  validateAdventureGameDraft,
  type AdventureAuthoringSnapshot,
  type AdventureDraftReport,
} from '../../lib/adventure/authoring'
import {
  availableAdventureActions,
  createInitialAdventureState,
  parseAdventureContent,
  validateAdventureContent,
} from '../../lib/adventure/runtime'
import type { WorkspaceScope } from '../../lib/types'
import { useDomainT, type DomainTFunction } from '../../i18n'
import { useDialog } from '../shared/Dialog'

type View = 'overview' | 'content' | 'preview' | 'diagnostics' | 'release'

const EMPTY: AdventureAuthoringSnapshot = {
  definitions: [], modules: [], nodes: [], adventureModules: [], releases: [],
}

function messages(report: AdventureDraftReport | null, t: DomainTFunction): string[] {
  if (!report) return []
  return [
    ...report.errors,
    ...report.warnings,
    ...report.adventure.unreachableLocationKeys.map(key => t('textGame.adventure.workbench.diagUnreachableLocation', { key })),
    ...report.adventure.unavailableQuestKeys.map(key => t('textGame.adventure.workbench.diagUnavailableQuest', { key })),
    ...report.adventure.sourceLessItemKeys.map(key => t('textGame.adventure.workbench.diagSourceLessItem', { key })),
    ...report.narrative.danglingSuccessors.map(item => t('textGame.adventure.workbench.diagNarrativeDangling', { from: item.nodeKey, to: item.successorKey })),
    ...report.narrative.invalidChoiceTargets.map(item => t('textGame.adventure.workbench.diagInvalidChoiceTarget', { choice: item.choiceKey, target: item.targetNodeKey })),
    ...report.narrative.unreachableNodeKeys.map(key => t('textGame.adventure.workbench.diagNarrativeUnreachable', { key })),
    ...report.narrative.blockingCycleKeys.map(keys => t('textGame.adventure.workbench.diagNarrativeCycle', { cycle: keys.join(' → ') })),
    ...report.interaction.diagnostics.map(item => t('textGame.adventure.workbench.diagInteraction', {
      severity: item.severity === 'error' ? t('textGame.adventure.workbench.diagSeverityError') : t('textGame.adventure.workbench.diagSeverityWarning'),
      message: item.message,
    })),
  ]
}

export default function AdventureGameWorkbench(props: { scope: WorkspaceScope }) {
  const dialog = useDialog()
  const { t } = useDomainT('simulation')
  const [snapshot, setSnapshot] = useState(EMPTY)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [view, setView] = useState<View>('overview')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [report, setReport] = useState<AdventureDraftReport | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [editor, setEditor] = useState('')
  const [previewLocation, setPreviewLocation] = useState('')

  const load = async (preferId?: number | null) => {
    const next = await loadAdventureAuthoringSnapshot(props.scope)
    setSnapshot(next)
    setSelectedId(previous => {
      const desired = preferId === undefined ? previous : preferId
      return desired != null && next.definitions.some(item => item.id === desired)
        ? desired
        : next.definitions[0]?.id ?? null
    })
    setLoading(false)
  }

  useEffect(() => {
    setLoading(true); setError(''); setMessage(''); setReport(null)
    void load().catch(reason => { setError(reason instanceof Error ? reason.message : String(reason)); setLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.scope.projectId, props.scope.worldId, props.scope.workId])

  const definition = snapshot.definitions.find(item => item.id === selectedId) ?? null
  const module = snapshot.adventureModules.find(item => item.gameDefinitionId === selectedId) ?? null
  const releases = snapshot.releases.filter(item => item.gameDefinitionId === selectedId)
  const parsed = useMemo(() => {
    try { return { content: parseAdventureContent(editor), error: '' } }
    catch (reason) { return { content: null, error: reason instanceof Error ? reason.message : String(reason) } }
  }, [editor])
  const draftReport = useMemo(() => parsed.content ? validateAdventureContent(parsed.content) : null, [parsed.content])
  const preview = useMemo(() => {
    if (!parsed.content) return null
    const state = createInitialAdventureState(parsed.content, '0'.repeat(64))
    if (previewLocation && parsed.content.locations.some(item => item.key === previewLocation)) {
      state.currentLocationKey = previewLocation
      if (!state.visitedLocationKeys.includes(previewLocation)) state.visitedLocationKeys.push(previewLocation)
    }
    return {
      state,
      location: parsed.content.locations.find(item => item.key === state.currentLocationKey)!,
      actions: availableAdventureActions(parsed.content, state),
    }
  }, [parsed.content, previewLocation])

  useEffect(() => {
    if (!definition || !module) { setTitle(''); setDescription(''); setEditor(''); return }
    setTitle(definition.title); setDescription(definition.description); setEditor(module.contentJson)
    try { setPreviewLocation(parseAdventureContent(module.contentJson).initialLocationKey) } catch { setPreviewLocation('') }
    setReport(null)
  }, [definition, module])

  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { await action() } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  const refresh = async () => { await load(selectedId); setReport(null) }
  const createSample = () => run(async () => {
    const created = await seedAdventureAcceptanceGame({
      scope: props.scope, title: '雾港潮汐钟', gameKey: `mist-harbor-${Date.now().toString(36)}`,
    })
    await load(created.id!); setView('overview'); setMessage(t('textGame.adventure.workbench.sampleCreatedMessage'))
  })
  const save = () => run(async () => {
    if (!definition || !parsed.content) throw new Error(parsed.error || t('textGame.adventure.workbench.invalidContentError'))
    await updateAdventureGameDefinition({ scope: props.scope, gameDefinitionId: definition.id!, title, description })
    await saveAdventureContent({ scope: props.scope, gameDefinitionId: definition.id!, contentJson: JSON.stringify(parsed.content) })
    await refresh(); setMessage(t('textGame.adventure.workbench.savedMessage'))
  })
  const validate = () => run(async () => {
    if (!definition) return
    const next = await validateAdventureGameDraft(props.scope, definition.id!)
    setReport(next); setView('diagnostics')
    setMessage(next.valid ? t('textGame.adventure.workbench.validatedMessage') : '')
  })
  const publish = () => run(async () => {
    if (!definition) return
    const result = await publishAdventureGameDraft({ scope: props.scope, gameDefinitionId: definition.id! })
    setReport(result.report); await refresh(); setView('release')
    setMessage(t('textGame.adventure.workbench.publishedMessage', { version: result.gameRelease.version }))
  })
  const remove = () => run(async () => {
    if (!definition) return
    const confirmed = await dialog.confirm({
      title: t('textGame.adventure.workbench.deleteConfirmTitle', { title: definition.title }),
      message: t('textGame.adventure.workbench.deleteConfirmMessage'),
      confirmText: t('textGame.adventure.workbench.deleteConfirmAction'), tone: 'danger',
    })
    if (!confirmed) return
    await deleteAdventureGameDraft({ scope: props.scope, gameDefinitionId: definition.id! })
    await load(null); setMessage(t('textGame.adventure.workbench.deletedMessage'))
  })

  const counts = parsed.content ? [
    [t('textGame.adventure.workbench.countLocations'), parsed.content.locations.length], [t('textGame.adventure.workbench.countObjects'), parsed.content.objects.length],
    [t('textGame.adventure.workbench.countItems'), parsed.content.items.length], [t('textGame.adventure.workbench.countActions'), parsed.content.actions.length],
    [t('textGame.adventure.workbench.countQuests'), parsed.content.quests.length], [t('textGame.adventure.workbench.countAbilitiesResources'), parsed.content.abilities.length + parsed.content.resources.length],
  ] : []

  return <div className="storygame-author" data-testid="adventure-game-workbench">
    <aside className="storygame-author-sidebar">
      <div className="storygame-author-sidebar-head"><strong>{t('textGame.adventure.workbench.sidebarHeading')}</strong><button title={t('textGame.adventure.workbench.refreshTitle')} onClick={() => void refresh()}><RefreshCw className="h-3.5 w-3.5" /></button></div>
      <div className="storygame-author-game-list">{snapshot.definitions.map(item => <button key={item.id} className={item.id === selectedId ? 'active' : ''} onClick={() => setSelectedId(item.id!)}><strong>{item.title}</strong><small>{item.gameKey}</small></button>)}</div>
      <button className="storygame-author-create sample" disabled={busy} onClick={() => void createSample()}><Plus className="h-3.5 w-3.5" />{t('textGame.adventure.workbench.createSample')}</button>
      <p>{t('textGame.adventure.workbench.sidebarNote')}</p>
    </aside>
    <main className="storygame-author-main">
      <header className="storygame-author-toolbar"><div><strong>{definition?.title ?? t('textGame.adventure.workbench.title')}</strong><span>{t('textGame.adventure.workbench.subtitle')}</span></div><nav>{([
        ['overview', t('textGame.adventure.workbench.navOverview')], ['content', t('textGame.adventure.workbench.navContentJson')], ['preview', t('textGame.adventure.workbench.navStatePreview')], ['diagnostics', t('textGame.adventure.workbench.navDiagnostics')], ['release', t('textGame.adventure.workbench.navReleases')],
      ] as Array<[View, string]>).map(([key, label]) => <button key={key} disabled={!definition} className={view === key ? 'active' : ''} onClick={() => setView(key)}>{label}</button>)}</nav></header>
      {message && <div className="storygame-author-notice success"><CheckCircle2 className="h-4 w-4" /><span>{message}</span></div>}
      {error && <div className="storygame-author-notice error" role="alert"><AlertTriangle className="h-4 w-4" /><span>{error}</span></div>}
      {loading && <div className="storygame-empty"><Loader2 className="h-7 w-7 animate-spin" /><p>{t('textGame.adventure.workbench.loading')}</p></div>}
      {!loading && !definition && <div className="storygame-empty"><Map className="h-8 w-8" /><h2>{t('textGame.adventure.workbench.emptyTitle')}</h2><p>{t('textGame.adventure.workbench.emptyIntro')}</p><button className="storygame-author-create" onClick={() => void createSample()}><Plus className="h-4 w-4" />{t('textGame.adventure.workbench.createSample')}</button></div>}
      {!loading && definition && <>
        {view === 'overview' && <section className="storygame-author-pane"><div className="storygame-author-heading"><div><small>GAME DEFINITION</small><h2>{t('textGame.adventure.workbench.overviewHeading')}</h2></div><div className="storygame-author-actions"><button onClick={() => void save()} disabled={busy || !!parsed.error}><Save className="h-3.5 w-3.5" />{t('textGame.adventure.workbench.save')}</button><button className="danger" onClick={() => void remove()} disabled={busy}><Trash2 className="h-3.5 w-3.5" />{t('textGame.adventure.workbench.delete')}</button></div></div><div className="storygame-author-form-grid"><label>{t('textGame.adventure.workbench.titleLabel')}<input value={title} onChange={event => setTitle(event.target.value)} /></label><label>{t('textGame.adventure.workbench.stableKeyLabel')}<input value={definition.gameKey} readOnly /></label><label className="wide">{t('textGame.adventure.workbench.descriptionLabel')}<textarea rows={3} value={description} onChange={event => setDescription(event.target.value)} /></label></div><div className="storygame-author-summary-grid">{counts.map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div><div className="storygame-author-contract"><ShieldCheck className="h-5 w-5" /><div><strong>{t('textGame.adventure.workbench.contractTitle')}</strong><p>{t('textGame.adventure.workbench.contractBody')}</p></div></div></section>}
        {view === 'content' && <section className="storygame-author-pane"><div className="storygame-author-heading"><div><small>ADVENTURE MODULE</small><h2>{t('textGame.adventure.workbench.contentHeading')}</h2></div><button disabled={busy || !!parsed.error} onClick={() => void save()}><Save className="h-3.5 w-3.5" />{t('textGame.adventure.workbench.validateAndSave')}</button></div>{parsed.error && <div className="storygame-author-notice error"><AlertTriangle className="h-4 w-4" /><span>{parsed.error}</span></div>}<label className="storygame-json-editor">AdventureContentV1<textarea aria-label="AdventureContentV1 JSON" rows={34} spellCheck={false} value={editor} onChange={event => setEditor(event.target.value)} /></label>{draftReport && <div className={`storygame-author-notice ${draftReport.valid ? 'success' : 'error'}`}><FileJson2 className="h-4 w-4" /><span>{draftReport.valid ? t('textGame.adventure.workbench.draftValidMessage') : draftReport.errors.join('；')}</span></div>}</section>}
        {view === 'preview' && <section className="storygame-author-pane"><div className="storygame-author-heading"><div><small>DRAFT STATE PREVIEW</small><h2>{t('textGame.adventure.workbench.statePreviewHeading')}</h2></div><Play className="h-5 w-5 text-accent" /></div>{parsed.content && preview && <><div className="storygame-preview-start"><label>{t('textGame.adventure.workbench.previewLocationLabel')}<select value={preview.location.key} onChange={event => setPreviewLocation(event.target.value)}>{parsed.content.locations.map(item => <option key={item.key} value={item.key}>{item.title} · {item.key}</option>)}</select></label></div><div className="storygame-author-card-grid"><article className="storygame-author-card"><small>{t('textGame.adventure.workbench.currentLocationKicker')}</small><h3>{preview.location.title}</h3><p>{preview.location.description}</p><code>{preview.location.key}</code></article><article className="storygame-author-card"><small>{t('textGame.adventure.workbench.initialStateKicker')}</small><p>{t('textGame.adventure.workbench.initialStateLine', { items: preview.state.inventory.length, quests: preview.state.quests.length, abilities: Object.keys(preview.state.abilities).length, resources: Object.keys(preview.state.resources).length })}</p></article></div><h3 className="storygame-author-subheading">{t('textGame.adventure.workbench.locationActionsHeading')}</h3><div className="storygame-author-card-grid">{preview.actions.map(item => <article key={item.action.key} className="storygame-author-card"><div className="storygame-author-card-head"><strong>{item.action.label}</strong><code>{item.action.kind}</code></div><p>{item.action.description}</p><small>{item.available ? t('textGame.adventure.workbench.initiallyAvailable') : item.reason}</small></article>)}</div></>}</section>}
        {view === 'diagnostics' && <section className="storygame-author-pane"><div className="storygame-author-heading"><div><small>GRAPH & RELEASE GATE</small><h2>{t('textGame.adventure.workbench.diagnosticsHeading')}</h2></div><button disabled={busy} onClick={() => void validate()}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}{t('textGame.adventure.workbench.runValidation')}</button></div>{!report && <div className="storygame-empty"><GitBranch className="h-7 w-7" /><p>{t('textGame.adventure.workbench.diagnosticsIntro')}</p></div>}{report && <><div className={`storygame-author-notice ${report.valid ? 'success' : 'error'}`}>{report.valid ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}<span>{report.valid ? t('textGame.adventure.workbench.allGatesPassedMessage') : t('textGame.adventure.workbench.blockersPresentMessage')}</span></div><div className="storygame-diagnostic-list">{messages(report, t).map((item, index) => <article key={`${index}:${item}`}><AlertTriangle className="h-3.5 w-3.5" /><span>{item}</span></article>)}{report.valid && !messages(report, t).length && <article><CheckCircle2 className="h-3.5 w-3.5" /><span>{t('textGame.adventure.workbench.noIssuesMessage')}</span></article>}</div></>}</section>}
        {view === 'release' && <section className="storygame-author-pane"><div className="storygame-author-heading"><div><small>IMMUTABLE GAME RELEASE</small><h2>{t('textGame.adventure.workbench.releaseHeading')}</h2></div><button disabled={busy} onClick={() => void publish()}><Rocket className="h-3.5 w-3.5" />{t('textGame.adventure.workbench.validateAndPublish')}</button></div><div className="storygame-author-contract"><ShieldCheck className="h-5 w-5" /><div><strong>{t('textGame.adventure.workbench.releaseContractTitle')}</strong><p>{t('textGame.adventure.workbench.releaseContractBody')}</p></div></div><div className="storygame-release-list-author">{releases.map(item => <article key={item.id}><div><strong>v{item.version} · {item.label}</strong><small>{new Date(item.createdAt).toLocaleString()} · {item.contentHash.slice(0, 12)}</small></div><CheckCircle2 className="h-4 w-4" /></article>)}{!releases.length && <p>{t('textGame.adventure.workbench.noReleasesYet')}</p>}</div></section>}
      </>}
    </main>
  </div>
}
