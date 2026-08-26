import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileJson2, Globe2, Loader2, Rocket, Save, ShieldCheck, Trash2 } from 'lucide-react'
import type { WorkspaceScope } from '../../lib/types'
import {
  deleteTextOpenWorldGameDraft,
  loadTextOpenWorldAuthoringSnapshot,
  publishTextOpenWorldGame,
  saveTextOpenWorldBundle,
  seedTextOpenWorldAcceptanceGame,
  validateTextOpenWorldGame,
  type TextOpenWorldAuthoringSnapshot,
  type TextOpenWorldDraftReport,
} from '../../lib/open-world/authoring'
import { useDomainT } from '../../i18n'
import { useDialog } from '../shared/Dialog'

const EMPTY: TextOpenWorldAuthoringSnapshot = { definitions: [], narrativeModules: [], narrativeNodes: [], openWorldModules: [], adventureModules: [], simulationModules: [], profiles: [], scenes: [], releases: [] }

export default function TextOpenWorldWorkbench({ scope }: { scope: WorkspaceScope }) {
  const dialog = useDialog()
  const { t } = useDomainT('simulation')
  const [snapshot, setSnapshot] = useState(EMPTY)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [openWorldJson, setOpenWorldJson] = useState('')
  const [adventureJson, setAdventureJson] = useState('')
  const [simulationJson, setSimulationJson] = useState('')
  const [report, setReport] = useState<TextOpenWorldDraftReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const select = (next: TextOpenWorldAuthoringSnapshot, id: number | null) => {
    const desired = id != null && next.definitions.some(item => item.id === id) ? id : next.definitions[0]?.id ?? null
    setSelectedId(desired)
    setOpenWorldJson(next.openWorldModules.find(item => item.gameDefinitionId === desired)?.contentJson ?? '')
    setAdventureJson(next.adventureModules.find(item => item.gameDefinitionId === desired)?.contentJson ?? '')
    setSimulationJson(next.simulationModules.find(item => item.gameDefinitionId === desired)?.contentJson ?? '')
    setReport(null)
  }
  const refresh = async (id: number | null = selectedId) => {
    const next = await loadTextOpenWorldAuthoringSnapshot(scope)
    setSnapshot(next)
    select(next, id)
  }
  useEffect(() => { void refresh(null) // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.projectId, scope.worldId, scope.workId])
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setMessage('')
    try { await operation() } catch (error) { console.error('[TextOpenWorldWorkbench] operation failed', error); setMessage(t('textGame.common.errors.operationFailed')) }
    finally { setBusy(false) }
  }
  const counts = useMemo(() => {
    try {
      const content = JSON.parse(openWorldJson) as { regions?: unknown[]; fixedTaskCards?: unknown[]; taskTemplates?: unknown[]; actorSchedules?: Array<{ actorKind?: string }> }
      return { regions: content.regions?.length ?? 0, fixed: content.fixedTaskCards?.length ?? 0, templates: content.taskTemplates?.length ?? 0, participants: content.actorSchedules?.filter(item => item.actorKind === 'participant').length ?? 0, organizations: content.actorSchedules?.filter(item => item.actorKind === 'organization').length ?? 0 }
    } catch { return { regions: 0, fixed: 0, templates: 0, participants: 0, organizations: 0 } }
  }, [openWorldJson])
  const releases = snapshot.releases.filter(item => item.gameDefinitionId === selectedId)
  const statLabels: Record<string, string> = {
    regions: t('textGame.openWorld.workbench.statRegions'),
    fixed: t('textGame.openWorld.workbench.statFixedTasks'),
    templates: t('textGame.openWorld.workbench.statTaskTemplates'),
    participants: t('textGame.openWorld.workbench.statParticipants'),
    organizations: t('textGame.openWorld.workbench.statOrganizations'),
  }

  return <div className="grid min-h-[44rem] grid-cols-1 bg-bg-base lg:grid-cols-[17rem_minmax(0,1fr)]" data-testid="text-open-world-workbench">
    <aside className="border-b border-border bg-bg-surface p-4 lg:border-b-0 lg:border-r"><div className="mb-3 flex items-center gap-2"><Globe2 className="h-4 w-4 text-accent" /><strong className="text-sm">{t('textGame.openWorld.workbench.sidebarHeading')}</strong></div><p className="mb-4 text-xs leading-relaxed text-text-muted">{t('textGame.openWorld.workbench.sidebarDescription')}</p><button disabled={busy} className="mb-4 flex w-full items-center justify-center gap-1 rounded bg-accent px-3 py-2 text-xs text-white" onClick={() => void run(async () => { const created = await seedTextOpenWorldAcceptanceGame({ scope }); await refresh(created.id!); setMessage(t('textGame.openWorld.workbench.sampleCreatedMessage')) })}>{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe2 className="h-3 w-3" />}{t('textGame.openWorld.workbench.createAcceptanceButton')}</button><div className="space-y-1">{snapshot.definitions.map(definition => <button key={definition.id} onClick={() => select(snapshot, definition.id!)} className={`block w-full rounded px-3 py-2 text-left text-xs ${definition.id === selectedId ? 'bg-accent/10 text-accent' : 'hover:bg-bg-base'}`}><strong className="block truncate">{definition.title}</strong><small>{definition.gameKey}</small></button>)}</div></aside>
    <main className="min-w-0 p-4 sm:p-6"><div className="mx-auto max-w-7xl space-y-4">{message && <div role="status" className="rounded border border-border bg-bg-surface px-3 py-2 text-xs">{message}</div>}{!selectedId && <div className="storygame-empty"><Globe2 className="h-8 w-8" /><h2>{t('textGame.openWorld.workbench.emptyTitle')}</h2><p>{t('textGame.openWorld.workbench.emptyIntro')}</p></div>}{selectedId && <>
      <header className="flex flex-wrap items-start justify-between gap-3"><div><small className="text-accent">{t('textGame.openWorld.workbench.kicker')}</small><h1 className="mt-1 text-xl font-semibold">{snapshot.definitions.find(item => item.id === selectedId)?.title}</h1><p className="mt-1 text-xs text-text-muted">{t('textGame.openWorld.workbench.headerDescription')}</p></div><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => void run(async () => { const next = await validateTextOpenWorldGame(scope, selectedId); setReport(next); setMessage(next.valid ? t('textGame.openWorld.workbench.validationPassedMessage') : t('textGame.common.errors.validationSummary', { errors: next.errors.length, warnings: next.warnings.length })) })} className="rounded border border-border px-3 py-2 text-xs"><ShieldCheck className="mr-1 inline h-3 w-3" />{t('textGame.openWorld.workbench.validateButton')}</button><button disabled={busy} onClick={() => void run(async () => { const result = await publishTextOpenWorldGame({ scope, gameDefinitionId: selectedId }); setReport(result.report); setMessage(t('textGame.openWorld.workbench.publishedMessage', { version: result.gameRelease.version })); await refresh(selectedId) })} className="rounded bg-accent px-3 py-2 text-xs text-white"><Rocket className="mr-1 inline h-3 w-3" />{t('textGame.openWorld.workbench.publishButton')}</button><button disabled={busy} onClick={() => void run(async () => { const confirmed = await dialog.confirm({ title: t('textGame.openWorld.workbench.deleteConfirmTitle'), message: t('textGame.openWorld.workbench.deleteConfirmMessage'), confirmText: t('textGame.openWorld.workbench.deleteConfirmAction'), tone: 'danger' }); if (!confirmed) return; await deleteTextOpenWorldGameDraft({ scope, gameDefinitionId: selectedId }); await refresh(null) })} className="rounded border border-danger/30 px-3 py-2 text-xs text-danger"><Trash2 className="mr-1 inline h-3 w-3" />{t('textGame.common.actions.delete')}</button></div></header>
      <section className="grid gap-2 sm:grid-cols-5">{Object.entries(counts).map(([key, value]) => <article key={key} className="rounded border border-border bg-bg-surface p-3"><small className="text-[9px] uppercase text-text-muted">{statLabels[key] ?? key}</small><strong className="mt-1 block text-xl">{value}</strong></article>)}</section>
      {report && <section className={`rounded border p-3 text-xs ${report.valid ? 'border-accent/30 bg-accent/5' : 'border-danger/30 bg-danger/5'}`}><strong>{report.valid ? t('textGame.openWorld.workbench.reportReady') : t('textGame.openWorld.workbench.reportBlocked')}</strong><p className="mt-1 text-text-muted">{report.errors.length + report.warnings.length > 0 ? t('textGame.common.errors.validationSummary', { errors: report.errors.length, warnings: report.warnings.length }) : t('textGame.openWorld.workbench.reportAllValidDetail')}</p></section>}
      <section className="grid gap-3 xl:grid-cols-3">{[
        ['OpenWorldContentV1', openWorldJson, setOpenWorldJson],
        ['AdventureContentV1', adventureJson, setAdventureJson],
        ['NarrativeSimulationContentV1', simulationJson, setSimulationJson],
      ].map(([label, value, setter]) => <label key={label as string} className="rounded border border-border bg-bg-surface p-3 text-xs"><span className="mb-2 flex items-center gap-1 font-semibold"><FileJson2 className="h-3.5 w-3.5 text-accent" />{label as string}</span><textarea aria-label={t('textGame.openWorld.workbench.moduleEditorAria', { name: label as string })} rows={32} spellCheck={false} className="w-full rounded border border-border bg-bg-base p-2 font-mono text-[10px]" value={value as string} onChange={event => (setter as (value: string) => void)(event.target.value)} /></label>)}</section>
      <button disabled={busy} onClick={() => void run(async () => { await saveTextOpenWorldBundle({ scope, gameDefinitionId: selectedId, adventure: adventureJson, simulation: simulationJson, openWorld: openWorldJson }); await refresh(selectedId); setMessage(t('textGame.openWorld.workbench.bundleSavedMessage')) })} className="flex items-center gap-1 rounded bg-accent px-4 py-2 text-xs text-white"><Save className="h-3.5 w-3.5" />{t('textGame.openWorld.workbench.saveAllModulesButton')}</button>
      <section className="rounded border border-border bg-bg-surface p-4"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-accent" />{t('textGame.openWorld.workbench.releasesHeading')}</div><div className="space-y-2">{releases.map(item => <article key={item.id} className="flex justify-between rounded bg-bg-base p-2 text-xs"><span>{t('textGame.openWorld.workbench.releaseItemMeta', { version: item.version, name: item.label })}</span><code>{item.contentHash.slice(0, 12)}</code></article>)}{!releases.length && <p className="text-xs text-text-muted">{t('textGame.openWorld.workbench.noReleasesYet')}</p>}</div></section>
    </>}</div></main>
  </div>
}
