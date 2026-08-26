import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  Bot,
  Check,
  GitBranch,
  History,
  Loader2,
  Plus,
  Save,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { isAIConfigReady } from '../../lib/ai/config-readiness'
import { resolveRequestConfig } from '../../lib/ai/client'
import type { Project, WorkspaceScope } from '../../lib/types'
import {
  selectNarrativeSimulationActions,
  useNarrativeSimulationPlayerStore,
} from '../../stores/narrative-simulation-player'
import { useAIConfigStore } from '../../stores/ai-config'
import { useDomainT } from '../../i18n'
import { NARRATIVE_SIMULATION_ISSUE_KIND_LABEL_KEYS, NARRATIVE_SIMULATION_ISSUE_STATUS_LABEL_KEYS, NARRATIVE_SIMULATION_PHASE_LABEL_KEYS, projectCanonicalLabel } from '../../i18n/display-projection'

export default function NarrativeSimulationPlayer(props: {
  project: Project
  scope: WorkspaceScope
  worldGroupId: number | null
}) {
  const store = useNarrativeSimulationPlayerStore()
  const { config } = useAIConfigStore()
  const { t } = useDomainT('simulation')
  const [queue, setQueue] = useState<string[]>([])
  const [checkpointName, setCheckpointName] = useState('')
  const [branchTitle, setBranchTitle] = useState('')
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    void store.load(props.scope, props.worldGroupId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.scope.projectId, props.scope.worldId, props.scope.workId, props.worldGroupId])

  const selected = store.sessions.find(session => session.id === store.selectedSessionId) ?? null
  const simulation = store.runtimeState.narrativeSimulation
  const manifest = store.selectedManifest
  const actions = selectNarrativeSimulationActions(store)
  const visibleChoices = (store.runtimeState.narrative?.choices ?? [])
    .filter(choice => store.runtimeState.narrative?.visibleChoiceKeys?.includes(choice.choiceKey))
  const visibleReports = (simulation?.reports ?? []).filter(report => report.visibility === 'player'
    && (report.expiresAtTurn == null || report.expiresAtTurn >= simulation!.turn))
  const resolved = resolveRequestConfig(config, { category: 'runtime.prose.simulation-turn-briefing' })
  const aiReady = isAIConfigReady(resolved.config)
  // 原始 store / release 条目错误只进开发者控制台（稳定前缀）；玩家界面只渲染
  // 本地化通用文案。下方 alert 仍保持 localError 优先。
  useEffect(() => {
    if (store.error) console.error('[narrative-simulation] player store error', store.error)
    for (const item of store.releases) {
      if (item.error) console.error(`[narrative-simulation] player release ${item.release.id ?? '?'} manifest unavailable`, item.error)
    }
  }, [store.error, store.releases])
  const error = localError || (store.error ? t('textGame.common.errors.operationFailed') : '')

  useEffect(() => { setQueue([]) }, [simulation?.turn, store.selectedSessionId])

  const run = async (operation: () => Promise<unknown>) => {
    setLocalError('')
    try { await operation() }
    catch (reason) {
      // 原始错误只进开发者控制台；玩家界面呈现本地化通用错误。
      console.error('[narrative-simulation] player operation failed', reason)
      setLocalError(t('textGame.common.errors.operationFailed'))
    }
  }

  const toggle = (actionKey: string) => {
    if (!simulation || !manifest) return
    setLocalError('')
    setQueue(current => {
      if (current.includes(actionKey)) return current.filter(key => key !== actionKey)
      if (current.length >= simulation.actionBudget) {
        setLocalError(t('textGame.simulation.player.actionBudgetExhausted', { budget: simulation.actionBudget }))
        return current
      }
      const action = manifest.simulation.actions.find(item => item.key === actionKey)
      if (action?.conflictsWith.some(key => current.includes(key))) {
        setLocalError(t('textGame.simulation.player.actionConflictsQueue'))
        return current
      }
      return [...current, actionKey]
    })
  }

  const labels = useMemo(() => ({
    resource: new Map(manifest?.simulation.resources.map(item => [item.key, item.title]) ?? []),
    metric: new Map(manifest?.simulation.metrics.map(item => [item.key, item.title]) ?? []),
    actor: new Map(manifest?.simulation.actors.map(item => [item.key, item.title]) ?? []),
    issue: new Map(manifest?.simulation.issues.map(item => [item.key, item.title]) ?? []),
  }), [manifest])

  return <div className="flex min-h-[44rem] flex-col bg-bg-base lg:flex-row" data-testid="narrative-simulation-player">
    <aside className="w-full shrink-0 border-b border-border bg-bg-surface p-4 lg:w-72 lg:border-b-0 lg:border-r">
      <div className="mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-accent" /><strong className="text-sm">{t('textGame.simulation.player.sidebarTitle')}</strong></div>
      <p className="mb-4 text-xs leading-relaxed text-text-muted">{t('textGame.simulation.player.sidebarDescription')}</p>
      <div className="space-y-2">{store.releases.map(item => <article key={item.release.id} className="rounded border border-border bg-bg-base p-3">
        <strong className="block text-sm">{item.manifest?.definition.title ?? item.release.label}</strong>
        <span className="mt-1 block text-[10px] text-text-muted">{t('textGame.simulation.player.releaseMetaLine', { version: item.release.version, turnLimit: item.manifest?.simulation.turnLimit ?? 0, endings: item.manifest?.simulation.endings.length ?? 0 })}</span>
        {item.error && <p className="mt-2 text-[10px] text-danger">{t('textGame.simulation.player.releaseUnavailable')}</p>}
        <button disabled={!item.manifest || !!item.error || store.busy} onClick={() => void run(() => store.start(item.release.id!))} className="mt-3 flex w-full items-center justify-center gap-1 rounded bg-accent px-2 py-1.5 text-xs text-white disabled:opacity-40"><Plus className="h-3 w-3" />{t('textGame.simulation.player.startNewRun')}</button>
      </article>)}</div>
      {!store.releases.length && !store.loading && <div className="rounded border border-dashed border-border p-4 text-center text-xs text-text-muted">{t('textGame.simulation.player.releasesEmpty')}</div>}
      <div className="mb-2 mt-6 text-xs font-semibold">{t('textGame.simulation.player.sessionsHeading')}</div>
      <div className="space-y-1">{store.sessions.map(session => <div key={session.id} className={`flex rounded ${session.id === selected?.id ? 'bg-accent/10' : ''}`}><button className="min-w-0 flex-1 px-2 py-2 text-left text-xs" onClick={() => void store.select(session.id!)}><strong className="block truncate">{session.title}</strong><span className="text-[9px] text-text-muted">{session.id === selected?.id ? t('textGame.simulation.player.sessionEventsLine', { seq: store.runtimeState.lastSequence }) : t('textGame.simulation.player.sessionResumable')}</span></button><button aria-label={t('textGame.simulation.player.deleteSessionAria')} className="px-2 text-text-muted hover:text-danger" onClick={() => void run(() => store.remove(session.id!))}><Trash2 className="h-3 w-3" /></button></div>)}</div>
    </aside>

    <main className="min-w-0 flex-1 p-4 sm:p-6"><div className="mx-auto max-w-7xl space-y-4">
      {error && <div role="alert" className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {!selected && <div className="storygame-empty"><Activity className="h-8 w-8" /><h2>{t('textGame.simulation.player.emptyTitle')}</h2><p>{t('textGame.simulation.player.emptyDescription')}</p></div>}
      {selected && simulation && manifest && <>
        <header className="flex flex-wrap items-start justify-between gap-3"><div><span className="text-[10px] text-accent">{t('textGame.simulation.player.kicker')}</span><h1 className="mt-1 text-xl font-semibold">{manifest.definition.title}</h1><p className="mt-1 text-xs text-text-muted">{t('textGame.simulation.player.headerMetaLine', { turn: simulation.turn, turnLimit: simulation.turnLimit, phase: projectCanonicalLabel(t, NARRATIVE_SIMULATION_PHASE_LABEL_KEYS, simulation.phase), budget: simulation.actionBudget })}</p></div><div className="flex flex-wrap items-center justify-end gap-2"><div className="rounded border border-border bg-bg-surface px-3 py-2 text-right text-[10px] text-text-muted"><strong className="block text-xs text-text-primary">{selected.title}</strong>{t('textGame.simulation.player.sessionBadgeLine', { seq: store.runtimeState.lastSequence, hash: simulation.contentHash.slice(0, 12) })}</div><button type="button" aria-label={t('textGame.common.player.exitGame')} onClick={() => { setQueue([]); void store.select(null) }} className="flex items-center gap-1 rounded border border-border bg-bg-surface px-3 py-2 text-xs"><ArrowLeft className="h-3.5 w-3.5" />{t('textGame.common.player.exitGame')}</button></div></header>

        <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">{Object.entries(simulation.resources).map(([key, value]) => <article key={`resource:${key}`} className="rounded border border-border bg-bg-surface p-3"><small className="text-[9px] text-text-muted">{t('textGame.simulation.player.resourceKicker')}</small><strong className="mt-1 block text-lg">{value}</strong><span className="text-xs text-text-muted">{labels.resource.get(key) ?? key}</span></article>)}{Object.entries(simulation.metrics).map(([key, value]) => <article key={`metric:${key}`} className="rounded border border-accent/20 bg-accent/5 p-3"><small className="text-[9px] text-accent">{t('textGame.simulation.player.metricKicker')}</small><strong className="mt-1 block text-lg">{value}</strong><span className="text-xs text-text-muted">{labels.metric.get(key) ?? key}</span></article>)}</section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]"><div className="space-y-3">
          <article className="rounded border border-border bg-bg-surface p-4"><div className="mb-3 flex items-center justify-between gap-2"><div><strong className="text-sm">{t('textGame.simulation.player.decisionQueueHeading')}</strong><p className="text-[10px] text-text-muted">{t('textGame.simulation.player.decisionQueueHint', { selected: queue.length, budget: simulation.actionBudget })}</p></div><button disabled={store.busy || simulation.phase !== 'planning'} onClick={() => void run(() => store.settleTurn(queue))} className="flex items-center gap-1 rounded bg-accent px-3 py-2 text-xs text-white disabled:opacity-40">{store.busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}{t('textGame.simulation.player.settleTurn')}</button></div><div className="grid gap-2 md:grid-cols-2">{actions.map(item => <button key={item.action.key} disabled={!item.available || store.busy} onClick={() => toggle(item.action.key)} className={`rounded border p-3 text-left text-xs disabled:opacity-40 ${queue.includes(item.action.key) ? 'border-accent bg-accent/10' : 'border-border bg-bg-base'}`}><span className="flex justify-between gap-2"><strong>{item.action.title}</strong><code className="text-[9px] text-text-muted">{item.action.category}</code></span><p className="mt-1 text-[10px] leading-relaxed text-text-muted">{item.available ? item.action.description : item.reason}</p></button>)}</div></article>
          <article className="rounded border border-border bg-bg-surface p-4"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-accent" />{t('textGame.simulation.player.reportsHeading')}</div>{aiReady && store.events.some(event => event.type.startsWith('simulation.')) && <button disabled={store.busy} onClick={() => void run(() => store.generatePresentation('prose.simulation-turn-briefing', '依据最近正式事件写一段简短局势简报', resolved.config))} className="rounded border border-border px-2 py-1 text-[10px]"><Sparkles className="mr-1 inline h-3 w-3" />{t('textGame.simulation.player.harnessBriefingButton')}</button>}</div>{store.generatedCandidate && <div className="mb-3 rounded border border-accent/20 bg-accent/5 p-3 text-xs"><strong className="flex items-center gap-1"><Bot className="h-3.5 w-3.5 text-accent" />{t('textGame.simulation.player.presentationCandidateHeading')}</strong><p className="mt-2">{store.generatedCandidate.text}</p><small className="mt-1 block text-[9px] text-text-muted">{t('textGame.simulation.player.evidenceLine', { sequences: store.generatedCandidate.evidenceEventSequences.map(sequence => `#${sequence}`).join('、') })}</small></div>}<div className="max-h-80 space-y-2 overflow-y-auto">{[...visibleReports].reverse().map(report => <article key={report.reportId} className="rounded bg-bg-base p-3 text-xs"><div className="flex justify-between"><strong>{report.reportKey}</strong><span className="text-[9px] text-accent">{t('textGame.simulation.player.reportMetaLine', { turn: report.turn, confidence: Math.round(report.confidence * 100) })}</span></div><p className="mt-1 text-text-muted">{report.text}</p><small className="mt-1 block text-[9px] text-text-muted">{report.sourceEventSequences.length ? t('textGame.simulation.player.evidenceLine', { sequences: report.sourceEventSequences.map(sequence => `#${sequence}`).join('、') }) : t('textGame.simulation.player.evidenceParentSnapshot')}</small></article>)}{!visibleReports.length && <p className="text-xs text-text-muted">{t('textGame.simulation.player.reportsEmpty')}</p>}</div></article>
        </div><aside className="space-y-3">
          <article className="rounded border border-border bg-bg-surface p-4"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="h-4 w-4 text-accent" />{t('textGame.simulation.player.issuesHeading')}</div><div className="space-y-2">{simulation.issues.map(issue => { const definition = manifest.simulation.issues.find(item => item.key === issue.issueKey); return <div key={issue.issueKey} className="rounded bg-bg-base p-2 text-xs"><span className="flex justify-between"><strong>{labels.issue.get(issue.issueKey) ?? issue.issueKey}</strong><code className="text-[9px] text-accent">{issue.stageKey}</code></span><div className="mt-2 h-1.5 overflow-hidden rounded bg-border"><div className="h-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, issue.pressure))}%` }} /></div><small className="mt-1 block text-[9px] text-text-muted">{t('textGame.simulation.player.issuePressureLine', { pressure: issue.pressure, kind: projectCanonicalLabel(t, NARRATIVE_SIMULATION_ISSUE_KIND_LABEL_KEYS, definition?.crisis ? 'crisis' : 'issue'), status: projectCanonicalLabel(t, NARRATIVE_SIMULATION_ISSUE_STATUS_LABEL_KEYS, issue.resolved ? 'resolved' : 'evolving') })}</small></div>})}</div></article>
          <article className="rounded border border-border bg-bg-surface p-4"><strong className="text-sm">{t('textGame.simulation.player.actorStancesHeading')}</strong><div className="mt-3 space-y-1">{Object.entries(simulation.actorStances).map(([key, value]) => <div key={key} className="flex justify-between rounded bg-bg-base px-2 py-1.5 text-xs"><span>{labels.actor.get(key) ?? key}</span><strong>{value}</strong></div>)}</div></article>
          <article className="rounded border border-border bg-bg-surface p-4"><div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Save className="h-4 w-4 text-accent" />{t('textGame.simulation.player.checkpointHeading')}</div><div className="flex gap-2"><input value={checkpointName} onChange={event => setCheckpointName(event.target.value)} placeholder={t('textGame.simulation.player.checkpointPlaceholder')} className="min-w-0 flex-1 rounded border border-border bg-bg-base px-2 py-1.5 text-xs" /><button disabled={!checkpointName.trim()} onClick={() => void run(async () => { await store.saveCheckpoint(checkpointName); setCheckpointName('') })} className="rounded border border-border px-2 text-xs">{t('textGame.common.actions.save')}</button></div><div className="mt-2 max-h-32 space-y-1 overflow-y-auto">{store.checkpoints.map(checkpoint => <button key={checkpoint.id} onClick={() => void run(() => store.forkCheckpoint(checkpoint.id!))} className="block w-full rounded bg-bg-base px-2 py-1 text-left text-[9px] text-text-muted">{t('textGame.simulation.player.checkpointForkLine', { name: checkpoint.name, seq: checkpoint.throughSequence })}</button>)}</div><div className="mt-2 flex gap-2"><input value={branchTitle} onChange={event => setBranchTitle(event.target.value)} placeholder={t('textGame.simulation.player.branchPlaceholder')} className="min-w-0 flex-1 rounded border border-border bg-bg-base px-2 py-1.5 text-xs" /><button disabled={!branchTitle.trim()} aria-label={t('textGame.simulation.player.branchButtonAria')} onClick={() => void run(async () => { await store.forkCurrent(branchTitle); setBranchTitle('') })} className="rounded border border-border px-2"><GitBranch className="h-3 w-3" /></button></div></article>
        </aside></section>

        {simulation.qualifiedEndingKey && !store.runtimeState.narrative?.completed && <section className="rounded border border-accent/30 bg-accent/5 p-5"><h2 className="text-lg font-semibold">{t('textGame.simulation.player.qualifiedEndingHeading', { ending: manifest.simulation.endings.find(item => item.key === simulation.qualifiedEndingKey)?.title ?? simulation.qualifiedEndingKey })}</h2><p className="mt-1 text-xs text-text-muted">{t('textGame.simulation.player.qualifiedEndingDescription')}</p><div className="mt-3 flex flex-wrap gap-2">{visibleChoices.map(choice => <button key={choice.choiceKey} disabled={!store.runtimeState.narrative?.availableChoiceKeys?.includes(choice.choiceKey) || store.busy} onClick={() => void run(() => store.choose(choice.choiceKey))} className="rounded bg-accent px-3 py-2 text-xs text-white disabled:opacity-40">{choice.text}</button>)}</div></section>}
        {store.runtimeState.narrative?.completed && <section className="rounded border border-accent/30 bg-accent/5 p-5 text-center"><h2 className="text-xl font-semibold">{t('textGame.simulation.player.runCompletedHeading')}</h2><p className="mt-2 text-xs text-text-muted">{t('textGame.simulation.player.runCompletedDescription', { ending: store.runtimeState.narrative.endingKey })}</p></section>}
      </>}
    </div></main>
  </div>
}
