import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FileJson2,
  FlaskConical,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import {
  createNarrativeSimulationAcceptanceContent,
  createNarrativeSimulationGame,
  deleteNarrativeSimulationGameDraft,
  loadNarrativeSimulationAuthoringSnapshot,
  publishNarrativeSimulationGame,
  saveNarrativeSimulationContent,
  updateNarrativeSimulationDefinition,
  validateNarrativeSimulationGame,
  type NarrativeSimulationAuthoringSnapshot,
  type NarrativeSimulationDraftReport,
} from '../../lib/narrative-simulation/authoring'
import {
  parseNarrativeSimulationContent,
  runNarrativeSimulationBatch,
  validateNarrativeSimulationContent,
} from '../../lib/narrative-simulation/runtime'
import type { WorkspaceScope } from '../../lib/types'
import { useDomainT, type DomainTFunction } from '../../i18n'
import { useDialog } from '../shared/Dialog'

type View = 'overview' | 'content' | 'balance' | 'diagnostics' | 'release'
const EMPTY: NarrativeSimulationAuthoringSnapshot = {
  definitions: [], narrativeModules: [], narrativeNodes: [], simulationModules: [], releases: [],
}

// Diagnostics render ONLY stable structured fields through locale keys; raw
// report.errors / report.warnings / parser exceptions stay out of the UI
// (they may carry engine-language text) and surface in console logs instead.
// The structured set covers duplicate keys, missing references, balance
// warnings, crisis/ending reachability, issue-stage coverage, empty required
// sections, and the actionable Narrative graph blockers (dead ends,
// unreachable nodes). Residual raw narrative.errors strings have no stable
// shape and collapse into one localized count item; their raw text is
// console-only.
function diagnostics(report: NarrativeSimulationDraftReport | null, t: DomainTFunction): string[] {
  if (!report) return []
  return [
    ...report.simulation.duplicateKeys.map(item => t('textGame.simulation.workbench.diagDuplicateKey', { item })),
    ...report.simulation.missingReferences.map(item => t('textGame.simulation.workbench.diagMissingReference', { item })),
    ...report.simulation.issueStageCoverageKeys.map(item => t('textGame.simulation.workbench.diagIssueStageCoverage', { key: item })),
    ...report.simulation.emptySectionKeys.map(section => t('textGame.simulation.workbench.diagEmptySection', { section })),
    ...report.simulation.dominatedActionKeys.map(item => t('textGame.simulation.workbench.diagDominatedAction', { item })),
    ...report.simulation.unboundedGrowthKeys.map(item => t('textGame.simulation.workbench.diagUnboundedGrowth', { item })),
    ...report.simulation.conservedMutationKeys.map(item => t('textGame.simulation.workbench.diagConservedMutation', { item })),
    ...report.simulation.unsolvedCrisisKeys.map(item => t('textGame.simulation.workbench.diagUnsolvedCrisis', { item })),
    ...report.simulation.unreachableEndingKeys.map(item => t('textGame.simulation.workbench.diagUnreachableEnding', { item })),
    ...report.narrative.danglingSuccessors.map(item => t('textGame.simulation.workbench.diagNarrativeDangling', { node: item.nodeKey, successor: item.successorKey })),
    ...report.narrative.invalidChoiceTargets.map(item => t('textGame.simulation.workbench.diagNarrativeInvalidChoiceTarget', { choice: item.choiceKey, target: item.targetNodeKey })),
    ...report.narrative.orphanBeatKeys.map(item => t('textGame.simulation.workbench.diagNarrativeOrphanBeat', { item })),
    ...report.narrative.orphanChoiceKeys.map(item => t('textGame.simulation.workbench.diagNarrativeOrphanChoice', { item })),
    ...report.narrative.blockingCycleKeys.map(keys => t('textGame.simulation.workbench.diagNarrativeCycle', { cycle: keys.join(' → ') })),
    ...report.narrative.deadEndNodeKeys.map(item => t('textGame.simulation.workbench.diagNarrativeDeadEnd', { item })),
    ...report.narrative.unreachableNodeKeys.map(item => t('textGame.simulation.workbench.diagNarrativeUnreachable', { item })),
    // Residual engine-language narrative errors without a structured field:
    // one localized count entry only, never the raw string.
    ...(report.narrative.errors.length
      ? [t('textGame.simulation.workbench.diagAdditionalNarrativeIssues', { count: report.narrative.errors.length })]
      : []),
  ]
}

export default function NarrativeSimulationWorkbench({ scope }: { scope: WorkspaceScope }) {
  const dialog = useDialog()
  const { t } = useDomainT('simulation')
  const [snapshot, setSnapshot] = useState(EMPTY)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [view, setView] = useState<View>('overview')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [editor, setEditor] = useState('')
  const [report, setReport] = useState<NarrativeSimulationDraftReport | null>(null)
  const [batchTurns, setBatchTurns] = useState<10 | 100 | 500>(100)
  const [batchResult, setBatchResult] = useState<ReturnType<typeof runNarrativeSimulationBatch> | null>(null)

  const load = async (preferId?: number | null) => {
    const next = await loadNarrativeSimulationAuthoringSnapshot(scope)
    setSnapshot(next)
    setSelectedId(previous => {
      const desired = preferId === undefined ? previous : preferId
      return desired != null && next.definitions.some(item => item.id === desired)
        ? desired : next.definitions[0]?.id ?? null
    })
    setLoading(false)
  }

  useEffect(() => {
    setLoading(true); setError(''); setMessage(''); setReport(null); setBatchResult(null)
    void load().catch(reason => {
      console.error('[narrative-simulation] author snapshot load failed', reason)
      setError(t('textGame.common.errors.loadFailed'))
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.projectId, scope.worldId, scope.workId])

  const definition = snapshot.definitions.find(item => item.id === selectedId) ?? null
  const module = snapshot.simulationModules.find(item => item.gameDefinitionId === selectedId) ?? null
  const releases = snapshot.releases.filter(item => item.gameDefinitionId === selectedId)
  const parsed = useMemo(() => {
    // Raw parser exception text is kept for console diagnostics only; the UI
    // shows the locale-driven generic message via `rawError` presence.
    try { return { content: parseNarrativeSimulationContent(editor), rawError: '' } }
    catch (reason) { return { content: null, rawError: reason instanceof Error ? reason.message : String(reason) } }
  }, [editor])
  useEffect(() => {
    if (parsed.rawError) console.warn('[narrative-simulation] rules JSON parse failed', parsed.rawError)
  }, [parsed.rawError])
  useEffect(() => {
    // Residual narrative graph errors have no structured representation; their
    // raw engine-language text stays console-only behind a stable prefix.
    if (report?.narrative.errors.length) {
      console.warn('[narrative-simulation] unstructured narrative graph errors', report.narrative.errors)
    }
  }, [report])
  const liveReport = useMemo(() => parsed.content
    ? validateNarrativeSimulationContent({
        content: parsed.content,
        narrativeNodeKeys: snapshot.narrativeNodes
          .filter(node => node.moduleId === definition?.narrativeModuleId).map(node => node.key),
      })
    : null, [parsed.content, snapshot.narrativeNodes, definition?.narrativeModuleId])

  useEffect(() => {
    if (!definition || !module) { setTitle(''); setDescription(''); setEditor(''); return }
    setTitle(definition.title); setDescription(definition.description); setEditor(module.contentJson)
    setReport(null); setBatchResult(null)
  }, [definition, module])

  const run = async (operation: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { await operation() }
    catch (reason) {
      console.error('[narrative-simulation] authoring operation failed', reason)
      setError(t('textGame.common.errors.operationFailed'))
    }
    finally { setBusy(false) }
  }
  const refresh = async () => { await load(selectedId); setReport(null); setBatchResult(null) }
  const createSample = () => run(async () => {
    const created = await createNarrativeSimulationGame({
      scope,
      gameKey: `closed-district-${Date.now().toString(36)}`,
      title: '十二街区治理录',
      content: createNarrativeSimulationAcceptanceContent(),
    })
    await load(created.id!); setView('overview')
    setMessage(t('textGame.simulation.workbench.sampleCreatedMessage'))
  })
  const save = () => run(async () => {
    if (!definition || !parsed.content) throw new Error(parsed.rawError || t('textGame.simulation.workbench.invalidContentError'))
    await updateNarrativeSimulationDefinition({ scope, gameDefinitionId: definition.id!, title, description })
    await saveNarrativeSimulationContent({ scope, gameDefinitionId: definition.id!, content: parsed.content })
    await refresh(); setMessage(t('textGame.simulation.workbench.savedMessage'))
  })
  const validate = () => run(async () => {
    if (!definition) return
    const next = await validateNarrativeSimulationGame(scope, definition.id!)
    setReport(next); setView('diagnostics')
    setMessage(next.valid ? t('textGame.simulation.workbench.validatedMessage') : '')
  })
  const publish = () => run(async () => {
    if (!definition) return
    const result = await publishNarrativeSimulationGame({ scope, gameDefinitionId: definition.id! })
    setReport(result.report); await refresh(); setView('release')
    setMessage(t('textGame.simulation.workbench.publishedMessage', { version: result.gameRelease.version }))
  })
  const remove = () => run(async () => {
    if (!definition) return
    const confirmed = await dialog.confirm({
      title: t('textGame.simulation.workbench.deleteConfirmTitle', { name: definition.title }),
      message: t('textGame.simulation.workbench.deleteConfirmMessage'),
      confirmText: t('textGame.simulation.workbench.deleteConfirmAction'),
      tone: 'danger',
    })
    if (!confirmed) return
    await deleteNarrativeSimulationGameDraft({ scope, gameDefinitionId: definition.id! })
    await load(null); setMessage(t('textGame.simulation.workbench.deletedMessage'))
  })
  const simulate = () => {
    if (!parsed.content) return
    try {
      const next = runNarrativeSimulationBatch({
        content: parsed.content,
        contentHash: '0'.repeat(64),
        seed: 'author-balance-preview',
        turns: batchTurns,
        decide: (_state, available) => available.slice(0, 1),
      })
      setBatchResult(next); setError('')
    } catch (reason) {
      console.error('[narrative-simulation] batch simulation failed', reason)
      setError(t('textGame.common.errors.operationFailed'))
    }
  }

  const counts = parsed.content ? [
    [t('textGame.simulation.workbench.countResourcesMetrics'), parsed.content.resources.length + parsed.content.metrics.length],
    [t('textGame.simulation.workbench.countActors'), parsed.content.actors.length],
    [t('textGame.simulation.workbench.countActions'), parsed.content.actions.length],
    [t('textGame.simulation.workbench.countModifiers'), parsed.content.modifiers.length],
    [t('textGame.simulation.workbench.countIssues'), parsed.content.issues.length],
    [t('textGame.simulation.workbench.countEndingsThemes'), parsed.content.endings.length + parsed.content.themes.length],
  ] : []

  return <div className="storygame-author" data-testid="narrative-simulation-workbench">
    <aside className="storygame-author-sidebar">
      <div className="storygame-author-sidebar-head"><strong>{t('textGame.simulation.workbench.sidebarHeading')}</strong><button title={t('textGame.common.actions.refresh')} aria-label={t('textGame.common.actions.refresh')} onClick={() => void refresh()}><RefreshCw className="h-3.5 w-3.5" /></button></div>
      <div className="storygame-author-game-list">{snapshot.definitions.map(item => <button key={item.id} className={item.id === selectedId ? 'active' : ''} onClick={() => setSelectedId(item.id!)}><strong>{item.title}</strong><small>{item.gameKey}</small></button>)}</div>
      <button className="storygame-author-create sample" disabled={busy} onClick={() => void createSample()}><Plus className="h-3.5 w-3.5" />{t('textGame.simulation.workbench.createAcceptanceButton')}</button>
      <p>{t('textGame.simulation.workbench.sidebarNote')}</p>
    </aside>
    <main className="storygame-author-main">
      <header className="storygame-author-toolbar"><div><strong>{definition?.title ?? t('textGame.simulation.workbench.fallbackTitle')}</strong><span>{t('textGame.simulation.workbench.subtitle')}</span></div><nav>{([
        ['overview', t('textGame.simulation.workbench.navOverview')], ['content', t('textGame.simulation.workbench.navContentJson')], ['balance', t('textGame.simulation.workbench.navBalance')], ['diagnostics', t('textGame.simulation.workbench.navDiagnostics')], ['release', t('textGame.simulation.workbench.navReleases')],
      ] as Array<[View, string]>).map(([key, label]) => <button key={key} disabled={!definition} className={view === key ? 'active' : ''} onClick={() => setView(key)}>{label}</button>)}</nav></header>
      {message && <div className="storygame-author-notice success"><CheckCircle2 className="h-4 w-4" /><span>{message}</span></div>}
      {error && <div className="storygame-author-notice error" role="alert"><AlertTriangle className="h-4 w-4" /><span>{error}</span></div>}
      {loading && <div className="storygame-empty"><Loader2 className="h-7 w-7 animate-spin" /><p>{t('textGame.simulation.workbench.loading')}</p></div>}
      {!loading && !definition && <div className="storygame-empty"><Activity className="h-8 w-8" /><h2>{t('textGame.simulation.workbench.emptyTitle')}</h2><p>{t('textGame.simulation.workbench.emptyIntro')}</p><button className="storygame-author-create" onClick={() => void createSample()}><Plus className="h-4 w-4" />{t('textGame.simulation.workbench.createAcceptanceButton')}</button></div>}
      {!loading && definition && <>
        {view === 'overview' && <section className="storygame-author-pane"><div className="storygame-author-heading"><div><small>{t('textGame.simulation.workbench.overviewKicker')}</small><h2>{t('textGame.simulation.workbench.overviewHeading')}</h2></div><div className="storygame-author-actions"><button onClick={() => void save()} disabled={busy || !!parsed.rawError}><Save className="h-3.5 w-3.5" />{t('textGame.common.actions.save')}</button><button className="danger" onClick={() => void remove()} disabled={busy}><Trash2 className="h-3.5 w-3.5" />{t('textGame.common.actions.delete')}</button></div></div><div className="storygame-author-form-grid"><label>{t('textGame.simulation.workbench.titleLabel')}<input value={title} onChange={event => setTitle(event.target.value)} /></label><label>{t('textGame.simulation.workbench.stableKeyLabel')}<input value={definition.gameKey} readOnly /></label><label className="wide">{t('textGame.simulation.workbench.descriptionLabel')}<textarea rows={3} value={description} onChange={event => setDescription(event.target.value)} /></label></div><div className="storygame-author-summary-grid">{counts.map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div><div className="storygame-author-contract"><ShieldCheck className="h-5 w-5" /><div><strong>{t('textGame.simulation.workbench.contractTitle')}</strong><p>{t('textGame.simulation.workbench.contractBody')}</p></div></div></section>}
        {view === 'content' && <section className="storygame-author-pane"><div className="storygame-author-heading"><div><small>{t('textGame.simulation.workbench.contentKicker')}</small><h2>{t('textGame.simulation.workbench.contentHeading')}</h2></div><button disabled={busy || !!parsed.rawError} onClick={() => void save()}><Save className="h-3.5 w-3.5" />{t('textGame.simulation.workbench.validateAndSave')}</button></div>{parsed.rawError && <div className="storygame-author-notice error"><AlertTriangle className="h-4 w-4" /><span>{t('textGame.common.errors.contentInvalid')}</span></div>}<label className="storygame-json-editor">{t('textGame.simulation.workbench.contentModuleLabel')}<textarea aria-label={t('textGame.simulation.workbench.contentEditorAria')} rows={36} spellCheck={false} value={editor} onChange={event => setEditor(event.target.value)} /></label>{liveReport && <div className={`storygame-author-notice ${liveReport.valid ? 'success' : 'error'}`}><FileJson2 className="h-4 w-4" /><span>{liveReport.valid ? t('textGame.simulation.workbench.liveReportValidMessage') : t('textGame.common.errors.liveValidationIssues', { count: liveReport.errors.length })}</span></div>}</section>}
        {view === 'balance' && <section className="storygame-author-pane"><div className="storygame-author-heading"><div><small>{t('textGame.simulation.workbench.balanceKicker')}</small><h2>{t('textGame.simulation.workbench.balanceHeading')}</h2></div><FlaskConical className="h-5 w-5 text-accent" /></div><div className="storygame-preview-start"><label>{t('textGame.simulation.workbench.batchTurnsLabel')}<select value={batchTurns} onChange={event => setBatchTurns(Number(event.target.value) as 10 | 100 | 500)}><option value={10}>{t('textGame.simulation.workbench.batchTurnsOption', { turns: 10 })}</option><option value={100}>{t('textGame.simulation.workbench.batchTurnsOption', { turns: 100 })}</option><option value={500}>{t('textGame.simulation.workbench.batchTurnsOption', { turns: 500 })}</option></select></label><button disabled={!parsed.content} onClick={simulate}><FlaskConical className="h-3.5 w-3.5" />{t('textGame.simulation.workbench.runBatchButton')}</button></div>{batchResult && <><div className="storygame-author-summary-grid"><article><strong>{batchResult.state.turn}</strong><span>{t('textGame.simulation.workbench.statStoppedTurn')}</span></article><article><strong>{batchResult.events.length}</strong><span>{t('textGame.simulation.workbench.statEventCount')}</span></article><article><strong>{batchResult.state.qualifiedEndingKey ?? t('textGame.simulation.workbench.batchNoEnding')}</strong><span>{t('textGame.simulation.workbench.statRuleEnding')}</span></article><article><strong>{batchResult.state.schedules.filter(item => item.status === 'pending').length}</strong><span>{t('textGame.simulation.workbench.statPendingSchedules')}</span></article></div><div className="storygame-author-contract"><CheckCircle2 className="h-5 w-5" /><div><strong>{t('textGame.simulation.workbench.balanceContractTitle')}</strong><p>{t('textGame.simulation.workbench.balanceContractBody')}</p></div></div></>}</section>}
        {view === 'diagnostics' && <section className="storygame-author-pane"><div className="storygame-author-heading"><div><small>{t('textGame.simulation.workbench.diagnosticsKicker')}</small><h2>{t('textGame.simulation.workbench.diagnosticsHeading')}</h2></div><button disabled={busy} onClick={() => void validate()}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}{t('textGame.simulation.workbench.runValidation')}</button></div>{!report && <div className="storygame-empty"><FlaskConical className="h-7 w-7" /><p>{t('textGame.simulation.workbench.diagnosticsIntro')}</p></div>}{report && <><div className={`storygame-author-notice ${report.valid ? 'success' : 'error'}`}>{report.valid ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}<span>{report.valid ? t('textGame.simulation.workbench.allGatesPassedMessage') : `${t('textGame.simulation.workbench.blockersPresentMessage')} ${t('textGame.common.errors.validationSummary', { errors: report.errors.length, warnings: report.warnings.length })}`}</span></div><div className="storygame-diagnostic-list">{diagnostics(report, t).map((item, index) => <article key={`${index}:${item}`}><AlertTriangle className="h-3.5 w-3.5" /><span>{item}</span></article>)}{report.valid && !diagnostics(report, t).length && <article><CheckCircle2 className="h-3.5 w-3.5" /><span>{t('textGame.simulation.workbench.noIssuesMessage')}</span></article>}</div></>}</section>}
        {view === 'release' && <section className="storygame-author-pane"><div className="storygame-author-heading"><div><small>{t('textGame.simulation.workbench.releaseKicker')}</small><h2>{t('textGame.simulation.workbench.releaseHeading')}</h2></div><button disabled={busy} onClick={() => void publish()}><Rocket className="h-3.5 w-3.5" />{t('textGame.simulation.workbench.validateAndPublish')}</button></div><div className="storygame-author-contract"><ShieldCheck className="h-5 w-5" /><div><strong>{t('textGame.simulation.workbench.releaseContractTitle')}</strong><p>{t('textGame.simulation.workbench.releaseContractBody')}</p></div></div><div className="storygame-release-list-author">{releases.map(item => <article key={item.id}><div><strong>{t('textGame.simulation.workbench.releaseItemMeta', { version: item.version, name: item.label })}</strong><small>{t('textGame.simulation.workbench.releaseItemStamp', { date: new Date(item.createdAt).toLocaleString(), hash: item.contentHash.slice(0, 12) })}</small></div><CheckCircle2 className="h-4 w-4" /></article>)}{!releases.length && <p>{t('textGame.simulation.workbench.noReleasesYet')}</p>}</div></section>}
      </>}
    </main>
  </div>
}
