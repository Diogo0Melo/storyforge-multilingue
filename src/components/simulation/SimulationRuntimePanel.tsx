import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  CalendarClock,
  Clock3,
  CopyPlus,
  ClipboardList,
  Dices,
  GitBranch,
  Plus,
  RotateCcw,
  Save,
  ScrollText,
  Snowflake,
  Trash2,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { useDomainT } from '../../i18n'
import {
  loadSimulationCanonCandidates,
  parseSimulationCanonSnapshot,
  repairCanonSourceName,
  verifySimulationCanonSnapshot,
} from '../../lib/simulation/canon-snapshot'
import type {
  Project,
  SimulationCanonCandidate,
  SimulationCanonSourceKind,
  SimulationSessionKind,
  SimulationTtrpgEncounterCandidate,
  SimulationTtrpgTurnCandidate,
} from '../../lib/types'
import { useSimulationRuntimeStore } from '../../stores/simulation-runtime'
import { useDialog } from '../shared/Dialog'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { useAIConfigStore } from '../../stores/ai-config'
import { resolveRequestConfig } from '../../lib/ai/client'
import { isAIConfigReady } from '../../lib/ai/config-readiness'
import { assembleContext } from '../../lib/registry/assemble-context'
import { buildNpcEvolutionPrompt, parseNpcEvolutionCandidate } from '../../lib/simulation/npc-evolution'
import {
  buildTtrpgEncounterPrompt,
  buildTtrpgGmPrompt,
  parseTtrpgEncounterCandidate,
  parseTtrpgTurnCandidate,
} from '../../lib/simulation/ttrpg'
import { isNpcRuntimeEntity } from '../../lib/simulation/runtime'

type KindLabelKey = `kind.${'sandbox' | 'npcEvolution' | 'ttrpg' | 'chatgame'}`
type SourceKindLabelKey = `sourceKind.${'world' | 'character' | 'location' | 'item' | 'rule'}`

const KIND_LABEL_KEYS: Record<SimulationSessionKind, KindLabelKey> = {
  sandbox: 'kind.sandbox',
  'npc-evolution': 'kind.npcEvolution',
  ttrpg: 'kind.ttrpg',
  chatgame: 'kind.chatgame',
}

const SOURCE_KIND_LABEL_KEYS: Record<SimulationCanonSourceKind, SourceKindLabelKey> = {
  world: 'sourceKind.world',
  character: 'sourceKind.character',
  location: 'sourceKind.location',
  item: 'sourceKind.item',
  rule: 'sourceKind.rule',
}

const SOURCE_KIND_ORDER: SimulationCanonSourceKind[] = [
  'world',
  'character',
  'location',
  'item',
  'rule',
]

function formatEventSummary(
  t: ReturnType<typeof useDomainT>['t'],
  type: string,
  payloadJson: string,
): string {
  try {
    const payload = JSON.parse(payloadJson) as Record<string, unknown>
    if (type === 'time.advanced') return t('eventSummary.timeAdvanced', { amount: payload.amount })
    if (type === 'random.resolved') {
      const dice = Array.isArray(payload.dice) ? payload.dice.join(', ') : ''
      return t('eventSummary.randomResolved', {
        expression: payload.expression,
        dice,
        total: payload.total,
      })
    }
    if (type === 'narrative.recorded') return String(payload.text ?? '')
    if (type === 'ttrpg.scene.opened') {
      return t('eventSummary.sceneOpened', {
        title: (payload.scene as Record<string, unknown>)?.title ?? '',
      })
    }
    if (type === 'ttrpg.action.recorded') return t('eventSummary.actionRecorded', { text: payload.text ?? '' })
    if (type === 'ttrpg.check.resolved') {
      const check = payload.check as Record<string, unknown> | undefined
      return t('eventSummary.checkResolved', {
        skill: check?.skill ?? '',
        total: check?.total ?? '',
        dc: check?.dc ?? '',
      })
    }
    if (type === 'ttrpg.gm.response.recorded') return t('eventSummary.gmResponse', { text: payload.text ?? '' })
    if (type === 'ttrpg.turn.advanced') return t('eventSummary.turnAdvanced', { actor: payload.nextActorKey ?? '' })
    if (type === 'ttrpg.encounter.started') {
      return t('eventSummary.encounterStarted', {
        title: (payload.encounter as Record<string, unknown>)?.title ?? '',
      })
    }
    if (type === 'ttrpg.encounter.resolved') return t('eventSummary.encounterResolved', { reason: payload.reason ?? '' })
    if (type === 'ttrpg.combat.attack.resolved') {
      const attack = payload.attack as Record<string, unknown> | undefined
      return attack?.hit
        ? t('eventSummary.attackHit', {
            actor: attack.actorKey ?? '',
            target: attack.targetKey ?? '',
            damage: attack.damageTotal ?? 0,
          })
        : t('eventSummary.attackMiss', {
            actor: attack?.actorKey ?? '',
            target: attack?.targetKey ?? '',
          })
    }
    if (type === 'ttrpg.combat.resource.changed') {
      return t('eventSummary.resourceChanged', {
        entity: payload.entityKey ?? '',
        resource: payload.resourceKey ?? '',
        delta: payload.delta ?? '',
      })
    }
    if (type === 'ttrpg.combat.condition.applied') {
      return t('eventSummary.conditionApplied', {
        entity: payload.entityKey ?? '',
        condition: (payload.condition as Record<string, unknown>)?.name ?? '',
      })
    }
    if (type === 'ttrpg.combat.condition.removed') {
      return t('eventSummary.conditionRemoved', {
        entity: payload.entityKey ?? '',
        conditionId: payload.conditionId ?? '',
      })
    }
    if (type === 'ttrpg.combat.turn.advanced') return t('eventSummary.combatTurnAdvanced', { actor: payload.nextActorKey ?? '' })
    if (type === 'ttrpg.campaign.summary.updated') return t('eventSummary.campaignSummaryUpdated')
    if (type === 'ttrpg.campaign.quest.upserted') {
      return t('eventSummary.questUpserted', {
        title: (payload.quest as Record<string, unknown>)?.title ?? '',
      })
    }
    if (type === 'ttrpg.campaign.schedule.upserted') {
      return t('eventSummary.scheduleUpserted', {
        activity: (payload.schedule as Record<string, unknown>)?.activity ?? '',
      })
    }
    if (type === 'chat.session.configured') {
      return t('eventSummary.chatConfigured', {
        title: (payload.scene as Record<string, unknown>)?.title ?? '',
      })
    }
    if (type === 'chat.message.recorded') return t('eventSummary.chatMessage', { text: payload.text ?? '' })
    if (type === 'chat.reply.recorded') return t('eventSummary.chatReply', { text: payload.text ?? '' })
    if (type.startsWith('entity.')) return String(payload.entityKey ?? type)
    return type
  } catch {
    return type
  }
}

export default function SimulationRuntimePanel(props: {
  project: Project
  worldGroupId: number | null
  /** 产品入口锁定为单一会话类型；旧工作区不传时仍管理全部互动存档。 */
  sessionKind?: SimulationSessionKind
}) {
  const store = useSimulationRuntimeStore()
  const dialog = useDialog()
  const { t, lang } = useDomainT('simulation')
  // 语言感知的列表连接（NPC 标签、日程摘要等）
  const listFormat = useMemo(() => new Intl.ListFormat(lang, { type: 'conjunction', style: 'short' }), [lang])
  const kindLabel = (kind: SimulationSessionKind) => {
    const key = KIND_LABEL_KEYS[kind]
    return t(key)
  }
  const sourceKindLabel = (kind: SimulationCanonSourceKind) => {
    const key = SOURCE_KIND_LABEL_KEYS[kind]
    return t(key)
  }
  const [newTitle, setNewTitle] = useState('')
  const [newKind, setNewKind] = useState<SimulationSessionKind>(props.sessionKind ?? 'sandbox')
  const [dice, setDice] = useState('1d20')
  const [timeAmount, setTimeAmount] = useState('1')
  const [narrative, setNarrative] = useState('')
  const [checkpointName, setCheckpointName] = useState('')
  const [branchTitle, setBranchTitle] = useState('')
  const [canonCandidates, setCanonCandidates] = useState<SimulationCanonCandidate[]>([])
  const [canonWorldLabel, setCanonWorldLabel] = useState('')
  const [selectedSourceKeys, setSelectedSourceKeys] = useState<Set<string>>(new Set())
  const [canonLoading, setCanonLoading] = useState(false)
  const [snapshotVerified, setSnapshotVerified] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [npcTargetKey, setNpcTargetKey] = useState('')
  const [npcRequest, setNpcRequest] = useState('')
  const [ttrpgSceneTitle, setTtrpgSceneTitle] = useState('')
  const [ttrpgSceneDescription, setTtrpgSceneDescription] = useState('')
  const [ttrpgSceneLocationKey, setTtrpgSceneLocationKey] = useState('')
  const [ttrpgTurnOrderText, setTtrpgTurnOrderText] = useState('')
  const [ttrpgActorKey, setTtrpgActorKey] = useState('')
  const [ttrpgAction, setTtrpgAction] = useState('')
  const [ttrpgSkill, setTtrpgSkill] = useState('')
  const [ttrpgExpression, setTtrpgExpression] = useState('1d20')
  const [ttrpgDc, setTtrpgDc] = useState('12')
  const [ttrpgCandidate, setTtrpgCandidate] = useState<SimulationTtrpgTurnCandidate | null>(null)
  const [ttrpgEncounterTitle, setTtrpgEncounterTitle] = useState('')
  const [ttrpgEncounterDescription, setTtrpgEncounterDescription] = useState('')
  const [ttrpgParticipantKeys, setTtrpgParticipantKeys] = useState<string[]>([])
  const [ttrpgEncounterCandidate, setTtrpgEncounterCandidate] = useState<SimulationTtrpgEncounterCandidate | null>(null)
  const [ttrpgAttackTargetKey, setTtrpgAttackTargetKey] = useState('')
  const [ttrpgAttackExpression, setTtrpgAttackExpression] = useState('1d20')
  const [ttrpgDamageExpression, setTtrpgDamageExpression] = useState('1d6')
  const [ttrpgResourceKey] = useState('hp')
  const [ttrpgAttackReason, setTtrpgAttackReason] = useState('')
  const [ttrpgResourceEntityKey, setTtrpgResourceEntityKey] = useState('')
  const [ttrpgResourceName, setTtrpgResourceName] = useState('hp')
  const [ttrpgResourceDelta, setTtrpgResourceDelta] = useState('-1')
  const [ttrpgConditionEntityKey, setTtrpgConditionEntityKey] = useState('')
  const [ttrpgConditionName, setTtrpgConditionName] = useState('')
  const [ttrpgConditionDuration, setTtrpgConditionDuration] = useState('1')
  const [ttrpgConditionDescription, setTtrpgConditionDescription] = useState('')
  const [campaignSummary, setCampaignSummary] = useState('')
  const [campaignQuestId, setCampaignQuestId] = useState('')
  const [campaignQuestTitle, setCampaignQuestTitle] = useState('')
  const [campaignQuestDescription, setCampaignQuestDescription] = useState('')
  const [campaignQuestStatus, setCampaignQuestStatus] = useState<'active' | 'paused' | 'completed' | 'failed'>('active')
  const [campaignQuestPriority, setCampaignQuestPriority] = useState('0')
  const [campaignQuestDueClock, setCampaignQuestDueClock] = useState('')
  const [campaignScheduleId, setCampaignScheduleId] = useState('')
  const [campaignScheduleEntityKey, setCampaignScheduleEntityKey] = useState('')
  const [campaignScheduleStartClock, setCampaignScheduleStartClock] = useState('0')
  const [campaignScheduleEndClock, setCampaignScheduleEndClock] = useState('')
  const [campaignScheduleLocationKey, setCampaignScheduleLocationKey] = useState('')
  const [campaignScheduleActivity, setCampaignScheduleActivity] = useState('')
  const [campaignScheduleRecurrence, setCampaignScheduleRecurrence] = useState<'once' | 'daily' | 'weekly'>('once')
  const { config } = useAIConfigStore()

  useEffect(() => {
    void store.load(props.project.id!, props.worldGroupId)
  // Zustand action identity is stable; project change is the actual reload boundary.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.project.id, props.worldGroupId])

  useEffect(() => {
    let cancelled = false
    setCanonLoading(true)
    setSelectedSourceKeys(new Set())
    void loadSimulationCanonCandidates({
      projectId: props.project.id!,
      worldGroupId: props.worldGroupId,
    }).then(result => {
      if (!cancelled) {
        setCanonCandidates(result.candidates)
        setCanonWorldLabel(result.worldLabel)
      }
    }).catch(error => {
      if (!cancelled) setActionError(error instanceof Error ? error.message : String(error))
    }).finally(() => {
      if (!cancelled) setCanonLoading(false)
    })
    return () => { cancelled = true }
  }, [props.project.id, props.worldGroupId])

  const visibleSessions = useMemo(
    () => store.sessions.filter(session => (
      session.projectId === props.project.id
      && (session.worldGroupId ?? null) === props.worldGroupId
      && (!props.sessionKind || session.kind === props.sessionKind)
    )),
    [props.project.id, props.sessionKind, props.worldGroupId, store.sessions],
  )
  const selected = useMemo(
    () => visibleSessions.find(session => session.id === store.selectedSessionId) ?? null,
    [store.selectedSessionId, visibleSessions],
  )
  useEffect(() => {
    if (selected?.id == null) return
    setCampaignSummary(store.runtimeState.ttrpg?.campaign?.summary ?? '')
  }, [selected?.id, store.runtimeState.ttrpg?.campaign?.summary])
  const selectedSnapshot = useMemo(
    () => selected ? parseSimulationCanonSnapshot(selected.canonSnapshotJson) : null,
    [selected],
  )
  const npcAI = useAIStream(createAISessionKey(
    props.project.id!,
    'simulation.npc-evolution',
    selected?.id ?? 'none',
  ))
  const ttrpgAI = useAIStream(createAISessionKey(
    props.project.id!,
    'simulation.ttrpg-gm',
    selected?.id ?? 'none',
  ))
  const encounterAI = useAIStream(createAISessionKey(
    props.project.id!,
    'simulation.ttrpg-encounter',
    selected?.id ?? 'none',
  ))
  const npcEntities = useMemo(
    () => Object.values(store.runtimeState.entities).filter(isNpcRuntimeEntity),
    [store.runtimeState.entities],
  )
  const selectedNpc = npcEntities.find(entity => entity.entityKey === npcTargetKey) ?? npcEntities[0] ?? null
  const ttrpgActors = useMemo(
    () => Object.values(store.runtimeState.entities).filter(entity => (
      entity.kind === 'player' || entity.kind === 'character' || entity.kind === 'npc'
    )),
    [store.runtimeState.entities],
  )
  const selectedTtrpgActor = ttrpgActors.find(entity => entity.entityKey === ttrpgActorKey)
    ?? ttrpgActors.find(entity => entity.entityKey === store.runtimeState.ttrpg?.activeActorKey)
    ?? ttrpgActors[0]
  const combatEncounter = store.runtimeState.ttrpg?.encounter ?? null
  const combatants = useMemo(
    () => combatEncounter ? combatEncounter.turnOrder.map(key => combatEncounter.combatants[key]).filter(Boolean) : [],
    [combatEncounter],
  )
  const combatTargetEntities = useMemo(
    () => combatants.map(combatant => store.runtimeState.entities[combatant.entityKey]).filter(Boolean),
    [combatants, store.runtimeState.entities],
  )
  const campaign = store.runtimeState.ttrpg?.campaign ?? { summary: '', quests: [], npcSchedules: [] }
  const campaignNpcs = useMemo(
    () => Object.values(store.runtimeState.entities).filter(isNpcRuntimeEntity),
    [store.runtimeState.entities],
  )
  const activeCampaignSchedules = useMemo(
    () => campaign.npcSchedules.filter(schedule => (
      store.runtimeState.clock >= schedule.startClock
      && (schedule.endClock == null || store.runtimeState.clock <= schedule.endClock)
    )),
    [campaign.npcSchedules, store.runtimeState.clock],
  )
  const {
    loading: sessionsLoading,
    projectId: loadedProjectId,
    selectedSessionId,
    select: selectSession,
    worldGroupId: loadedWorldGroupId,
  } = store
  const candidatesByKind = useMemo(() => Object.fromEntries(SOURCE_KIND_ORDER.map(kind => [
    kind,
    canonCandidates.filter(candidate => candidate.kind === kind),
  ])) as Record<SimulationCanonSourceKind, SimulationCanonCandidate[]>, [canonCandidates])

  useEffect(() => {
    if (sessionsLoading || loadedProjectId !== props.project.id || loadedWorldGroupId !== props.worldGroupId) return
    if (visibleSessions.some(session => session.id === selectedSessionId)) return
    void selectSession(visibleSessions[0]?.id ?? null)
  }, [
    loadedProjectId,
    loadedWorldGroupId,
    props.project.id,
    props.worldGroupId,
    selectedSessionId,
    selectSession,
    sessionsLoading,
    visibleSessions,
  ])

  useEffect(() => {
    let cancelled = false
    setSnapshotVerified(null)
    if (selectedSnapshot) {
      void verifySimulationCanonSnapshot(selectedSnapshot).then(result => {
        if (!cancelled) setSnapshotVerified(result)
      })
    }
    return () => { cancelled = true }
  }, [selectedSnapshot])

  useEffect(() => {
    if (selected?.kind !== 'npc-evolution') return
    if (!npcTargetKey || !npcEntities.some(entity => entity.entityKey === npcTargetKey)) {
      setNpcTargetKey(npcEntities[0]?.entityKey ?? '')
    }
  }, [selected?.kind, selected?.id, npcEntities, npcTargetKey])

  useEffect(() => {
    if (selected?.kind !== 'ttrpg') return
    const active = combatEncounter?.activeActorKey ?? store.runtimeState.ttrpg?.activeActorKey
    if (!ttrpgActorKey || !ttrpgActors.some(entity => entity.entityKey === ttrpgActorKey)) {
      setTtrpgActorKey(active && ttrpgActors.some(entity => entity.entityKey === active)
        ? active
        : ttrpgActors[0]?.entityKey ?? '')
    }
  }, [selected?.kind, selected?.id, ttrpgActors, ttrpgActorKey, combatEncounter?.activeActorKey, store.runtimeState.ttrpg?.activeActorKey])

  useEffect(() => {
    if (selected?.kind !== 'ttrpg') return
    setTtrpgParticipantKeys(current => {
      const valid = current.filter(key => ttrpgActors.some(entity => entity.entityKey === key))
      if (valid.length >= 2) return valid
      return ttrpgActors.slice(0, Math.max(2, Math.min(4, ttrpgActors.length))).map(entity => entity.entityKey)
    })
  }, [selected?.kind, selected?.id, ttrpgActors])

  useEffect(() => {
    if (!combatTargetEntities.length) return
    if (!ttrpgAttackTargetKey || !combatTargetEntities.some(entity => entity.entityKey === ttrpgAttackTargetKey)) {
      setTtrpgAttackTargetKey(combatTargetEntities.find(entity => entity.entityKey !== ttrpgActorKey)?.entityKey ?? combatTargetEntities[0].entityKey)
    }
    if (!ttrpgResourceEntityKey || !combatTargetEntities.some(entity => entity.entityKey === ttrpgResourceEntityKey)) {
      setTtrpgResourceEntityKey(combatTargetEntities[0].entityKey)
    }
    if (!ttrpgConditionEntityKey || !combatTargetEntities.some(entity => entity.entityKey === ttrpgConditionEntityKey)) {
      setTtrpgConditionEntityKey(combatTargetEntities[0].entityKey)
    }
  }, [combatTargetEntities, ttrpgAttackTargetKey, ttrpgConditionEntityKey, ttrpgActorKey, ttrpgResourceEntityKey])

  const toggleSource = (sourceKey: string) => {
    setSelectedSourceKeys(current => {
      const next = new Set(current)
      if (next.has(sourceKey)) next.delete(sourceKey)
      else next.add(sourceKey)
      return next
    })
  }

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setActionError('')
    try {
      await action()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const generateNpcEvolution = async () => {
    if (!selected || selected.kind !== 'npc-evolution' || !selectedNpc) return
    const runtimeContext = await assembleContext({
      projectId: props.project.id!,
      worldGroupId: selected.worldGroupId ?? null,
      simulationSessionId: selected.id,
      sourceKeys: ['simulationRuntime'],
      provider: config.provider,
      model: config.model,
    })
    const baseSequence = store.runtimeState.lastSequence
    const draft = await npcAI.start(buildNpcEvolutionPrompt({
      authorRequest: npcRequest,
      targetEntityKey: selectedNpc.entityKey,
      targetName: selectedNpc.name,
      runtimeContext: runtimeContext.text,
    }), undefined, { category: 'simulation.npc-evolution', projectId: props.project.id! })
    if (!draft.trim()) return
    const candidate = parseNpcEvolutionCandidate({
      draft,
      state: store.runtimeState,
      targetEntityKey: selectedNpc.entityKey,
      baseSequence,
    })
    await store.proposeNpcEvolution(candidate)
  }

  const generateTtrpgTurn = async () => {
    if (!selected || selected.kind !== 'ttrpg' || !selectedTtrpgActor) return
    if (!store.runtimeState.ttrpg?.scene) throw new Error(t('ttrpg.requireSceneError'))
    const runtimeContext = await assembleContext({
      projectId: props.project.id!,
      worldGroupId: selected.worldGroupId ?? null,
      simulationSessionId: selected.id,
      sourceKeys: ['simulationRuntime'],
      provider: config.provider,
      model: config.model,
    })
    const draft = await ttrpgAI.start(buildTtrpgGmPrompt({
      actorKey: selectedTtrpgActor.entityKey,
      actorName: selectedTtrpgActor.name,
      action: ttrpgAction,
      runtimeContext: runtimeContext.text,
    }), undefined, { category: 'simulation.ttrpg-gm', projectId: props.project.id! })
    if (!draft.trim()) return
    setTtrpgCandidate(parseTtrpgTurnCandidate({
      draft,
      state: store.runtimeState,
      actorKey: selectedTtrpgActor.entityKey,
      action: ttrpgAction,
      baseSequence: store.runtimeState.lastSequence,
    }))
  }

  const generateTtrpgEncounter = async () => {
    if (!selected || selected.kind !== 'ttrpg') return
    if (ttrpgParticipantKeys.length < 2) throw new Error(t('ttrpg.encounterMinParticipantsError'))
    const runtimeContext = await assembleContext({
      projectId: props.project.id!,
      worldGroupId: selected.worldGroupId ?? null,
      simulationSessionId: selected.id,
      sourceKeys: ['simulationRuntime'],
      provider: config.provider,
      model: config.model,
    })
    const draft = await encounterAI.start(buildTtrpgEncounterPrompt({
      runtimeContext: runtimeContext.text,
      participantKeys: ttrpgParticipantKeys,
    }), undefined, { category: 'simulation.ttrpg-encounter', projectId: props.project.id! })
    if (!draft.trim()) return
    setTtrpgEncounterCandidate(parseTtrpgEncounterCandidate({
      draft,
      state: store.runtimeState,
      participantKeys: ttrpgParticipantKeys,
      baseSequence: store.runtimeState.lastSequence,
    }))
  }

  return (
    <div className="flex h-full min-h-[36rem] flex-col bg-bg-base lg:flex-row">
      <aside className="max-h-[28rem] w-full shrink-0 overflow-y-auto border-b border-border bg-bg-surface p-4 lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r">
        <div className="mb-4">
          <div className="mb-1 flex items-center gap-2">
            <Box className="h-4 w-4 text-accent" />
            <h2 className="font-semibold text-text-primary">{t('sidebar.title')}</h2>
          </div>
          <p className="text-xs leading-relaxed text-text-muted">
            {props.sessionKind
              ? t('sidebar.descriptionLocked', { kind: kindLabel(props.sessionKind) })
              : t('sidebar.descriptionUnlocked')}
          </p>
        </div>

        <div className="mb-4 space-y-2 rounded-lg border border-border bg-bg-base p-3">
          <input
            value={newTitle}
            onChange={event => setNewTitle(event.target.value)}
            placeholder={t('sidebar.newSessionPlaceholder')}
            className="w-full rounded border border-border bg-bg-surface px-2 py-1.5 text-sm text-text-primary"
          />
          {props.sessionKind ? (
            <div
              data-testid="runtime-kind-lock"
              className="flex w-full items-center gap-2 rounded border border-border bg-bg-surface px-2 py-1.5 text-sm text-text-primary"
            >
              <Dices className="h-3.5 w-3.5 text-accent" />
              {kindLabel(props.sessionKind)}{t('sidebar.kindLockSuffix')}
            </div>
          ) : (
            <select
              value={newKind}
              onChange={event => setNewKind(event.target.value as SimulationSessionKind)}
              aria-label={t('sidebar.runtimeTypeAria')}
              className="w-full rounded border border-border bg-bg-surface px-2 py-1.5 text-sm text-text-primary"
            >
              {(Object.keys(KIND_LABEL_KEYS) as SimulationSessionKind[]).map(value => (
                <option key={value} value={value}>{kindLabel(value)}</option>
              ))}
            </select>
          )}
          <fieldset className="space-y-2 border-t border-border pt-2">
            <legend className="flex items-center gap-1.5 px-1 text-xs font-medium text-text-secondary">
              <Snowflake className="h-3.5 w-3.5" />
              {t('sidebar.freezeSourcesLegend')}
            </legend>
            <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {SOURCE_KIND_ORDER.map(kind => candidatesByKind[kind].length > 0 && (
                <div key={kind}>
                  <div className="mb-1 text-[11px] font-medium text-text-muted">
                    {sourceKindLabel(kind)}
                  </div>
                  <div className="space-y-1">
                    {candidatesByKind[kind].map(candidate => (
                      <label
                        key={candidate.sourceKey}
                        className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-xs hover:bg-bg-hover"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSourceKeys.has(candidate.sourceKey)}
                          onChange={() => toggleSource(candidate.sourceKey)}
                          aria-label={t('sidebar.freezeSourceAria', { kind: sourceKindLabel(kind), name: candidate.name })}
                          className="mt-0.5 h-3.5 w-3.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-text-secondary">{repairCanonSourceName(candidate.name, canonWorldLabel)}</span>
                          {candidate.summary && (
                            <span className="block truncate text-[10px] text-text-muted">
                              {candidate.summary}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {canonLoading && <p className="py-2 text-center text-xs text-text-muted">{t('sidebar.loading')}</p>}
            </div>
          </fieldset>
          <button
            disabled={busy || canonLoading || !newTitle.trim() || selectedSourceKeys.size === 0}
            onClick={() => void run(async () => {
              await store.createSession({
                projectId: props.project.id!,
                worldGroupId: props.worldGroupId,
                kind: props.sessionKind ?? newKind,
                title: newTitle,
                sourceKeys: [...selectedSourceKeys],
              })
              setNewTitle('')
              setSelectedSourceKeys(new Set())
            })}
            className="flex w-full items-center justify-center gap-1.5 rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('sidebar.createAndFreeze')}
          </button>
        </div>

        <div className="space-y-1">
          {visibleSessions.map(session => (
            <button
              key={session.id}
              onClick={() => void store.select(session.id!)}
              className={`w-full rounded px-3 py-2 text-left ${
                session.id === store.selectedSessionId
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-secondary hover:bg-bg-hover'
              }`}
            >
              <div className="truncate text-sm font-medium">{session.title}</div>
              <div className="mt-0.5 text-[11px] text-text-muted">
                {kindLabel(session.kind)} · {session.status}
              </div>
            </button>
          ))}
          {!store.loading && visibleSessions.length === 0 && (
            <p className="py-6 text-center text-xs text-text-muted">
              {props.sessionKind ? t('sidebar.emptyLocked', { kind: kindLabel(props.sessionKind) }) : t('sidebar.emptyUnlocked')}
            </p>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            {props.sessionKind
              ? t('detail.emptyLocked', { kind: kindLabel(props.sessionKind) })
              : t('detail.emptyUnlocked')}
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-5">
            <header className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-1 text-xs text-text-muted">{t('detail.experienceCenterPrefix')} · {kindLabel(selected.kind)}</div>
                <h1 className="text-xl font-semibold text-text-primary">{selected.title}</h1>
                <p className="mt-1 text-xs text-text-muted">
                  {t('detail.metaLine', {
                    ruleset: selected.rulesetVersion,
                    sources: selectedSnapshot?.sources.length ?? 0,
                    events: store.runtimeState.lastSequence,
                    checkpoints: store.checkpoints.length,
                  })}
                </p>
              </div>
              <button
                onClick={() => void run(async () => {
                  const confirmed = await dialog.confirm({
                    title: t('detail.deleteTitle', { title: selected.title }),
                    message: t('detail.deleteMessage'),
                    confirmText: t('detail.deleteConfirm'),
                    tone: 'danger',
                  })
                  if (confirmed) await store.remove(selected.id!)
                })}
                className="rounded p-2 text-danger hover:bg-danger/10"
                title={t('detail.deleteSessionTitle')}
                aria-label={t('detail.deleteSessionAria', { title: selected.title })}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </header>

            {(store.error || actionError) && (
              <div className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {actionError || store.error}
              </div>
            )}

            <section className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-bg-surface p-4">
                <Clock3 className="mb-2 h-4 w-4 text-accent" />
                <div className="text-2xl font-semibold text-text-primary">{store.runtimeState.clock}</div>
                <div className="text-xs text-text-muted">{t('detail.statLogicalTime')}</div>
              </div>
              <div className="rounded-lg border border-border bg-bg-surface p-4">
                <Box className="mb-2 h-4 w-4 text-accent" />
                <div className="text-2xl font-semibold text-text-primary">
                  {Object.keys(store.runtimeState.entities).length}
                </div>
                <div className="text-xs text-text-muted">{t('detail.statRuntimeEntities')}</div>
              </div>
              <div className="rounded-lg border border-border bg-bg-surface p-4">
                <ScrollText className="mb-2 h-4 w-4 text-accent" />
                <div className="text-2xl font-semibold text-text-primary">
                  {store.runtimeState.narratives.length}
                </div>
                <div className="text-xs text-text-muted">{t('detail.statNarratives')}</div>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Snowflake className="h-4 w-4 text-accent" />
                  {t('canonAudit.heading')}
                </div>
                {selectedSnapshot && (
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className={snapshotVerified === false ? 'text-danger' : 'text-text-muted'}>
                      {snapshotVerified == null ? t('canonAudit.verifying') : snapshotVerified ? t('canonAudit.verified') : t('canonAudit.verifyFailed')}
                    </span>
                    <span className="font-mono text-text-muted" title={selectedSnapshot.snapshotHash}>
                      {selectedSnapshot.snapshotHash.slice(0, 12)}
                    </span>
                  </div>
                )}
              </div>
              {selectedSnapshot ? (
                <div className="divide-y divide-border">
                  {selectedSnapshot.sources.map(source => (
                    <div key={source.sourceKey} className="grid gap-1 px-4 py-3 sm:grid-cols-[8rem_1fr_auto] sm:gap-3">
                      <div className="text-xs font-medium text-text-primary">
                        {sourceKindLabel(source.kind)} · {repairCanonSourceName(source.name, selectedSnapshot.worldLabel)}
                      </div>
                      <div className="min-w-0 text-xs text-text-secondary">
                        <div className="truncate">{source.summary || t('canonAudit.noSummary')}</div>
                        <div className="mt-0.5 truncate font-mono text-[10px] text-text-muted">
                          {source.sourceKey}
                        </div>
                      </div>
                      <span className="font-mono text-[10px] text-text-muted" title={source.contentHash}>
                        {source.contentHash.slice(0, 10)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-5 text-sm text-text-muted">{t('canonAudit.legacyNotice')}</p>
              )}
            </section>

            {selected.kind === 'npc-evolution' && (
              <section className="rounded-lg border border-accent/30 bg-bg-surface">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                      <Sparkles className="h-4 w-4 text-accent" />
                      {t('npcEvolution.heading')}
                    </div>
                    <p className="mt-1 text-xs text-text-muted">{t('npcEvolution.description')}</p>
                  </div>
                  {npcAI.tokenUsage && (
                    <span className="text-[10px] text-text-muted">
                      {npcAI.tokenUsage.inputTokens + npcAI.tokenUsage.outputTokens} tokens
                    </span>
                  )}
                </div>
                <div className="space-y-3 p-4">
                  <div className="grid gap-3 md:grid-cols-[14rem_1fr]">
                    <select
                      value={selectedNpc?.entityKey ?? ''}
                      onChange={event => setNpcTargetKey(event.target.value)}
                      aria-label={t('npcEvolution.selectNpcAria')}
                      disabled={npcEntities.length === 0 || npcAI.isStreaming}
                      className="rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary disabled:opacity-50"
                    >
                      {npcEntities.length === 0 && <option value="">{t('npcEvolution.noNpcOption')}</option>}
                      {npcEntities.map(entity => (
                        <option key={entity.entityKey} value={entity.entityKey}>{entity.name}</option>
                      ))}
                    </select>
                    <textarea
                      value={npcRequest}
                      onChange={event => setNpcRequest(event.target.value)}
                      placeholder={t('npcEvolution.requestPlaceholder')}
                      className="min-h-20 rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      disabled={busy || npcAI.isStreaming || !selectedNpc || npcRequest.trim().length < 2 || !isAIConfigReady(resolveRequestConfig(config, { category: 'simulation.npc-evolution' }).config)}
                      onClick={() => void run(generateNpcEvolution)}
                      className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-40"
                    >
                      {npcAI.isStreaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {npcAI.isStreaming ? t('npcEvolution.generating') : t('npcEvolution.generateButton')}
                    </button>
                    {npcAI.error && <span className="text-xs text-danger">{npcAI.error}</span>}
                  </div>
                  {npcAI.output && (
                    <details className="rounded border border-border bg-bg-base px-3 py-2 text-xs">
                      <summary className="cursor-pointer text-text-secondary">{t('npcEvolution.rawOutputSummary')}</summary>
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-text-muted">{npcAI.output}</pre>
                    </details>
                  )}
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-text-secondary">{t('npcEvolution.pendingHeading')}</div>
                    {store.pendingProposals.map(proposal => {
                      const stale = store.runtimeState.lastSequence > proposal.proposalSequence
                      return (
                        <div key={proposal.proposalSequence} className="rounded border border-border bg-bg-base p-3 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-text-primary">{proposal.entityKey}</span>
                            <span className={stale ? 'text-danger' : 'text-accent'}>{stale ? t('npcEvolution.staleLabel') : t('npcEvolution.proposalLabel', { sequence: proposal.proposalSequence })}</span>
                          </div>
                          <div className="mt-2 grid gap-1 text-xs text-text-secondary sm:grid-cols-2">
                            <span>{t('npcEvolution.locationField', { value: proposal.locationKey ?? t('npcEvolution.locationNone') })}</span>
                            <span>{t('npcEvolution.lifecycleField', { value: proposal.lifecycleStatus })}</span>
                            <span className="sm:col-span-2">{t('npcEvolution.attributesField', { value: listFormat.format(Object.entries(proposal.attributes).map(([key, value]) => `${key}=${String(value)}`)) || t('npcEvolution.attributesNone') })}</span>
                            {proposal.narrative && <span className="sm:col-span-2">{t('npcEvolution.narrativeField', { value: proposal.narrative })}</span>}
                            {proposal.memory && <span className="sm:col-span-2">{t('npcEvolution.memoryField', { content: proposal.memory.content, status: proposal.memory.status })}</span>}
                            {proposal.rationale && <span className="sm:col-span-2">{t('npcEvolution.rationaleField', { value: proposal.rationale })}</span>}
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              disabled={busy || stale}
                              onClick={() => void run(() => store.acceptNpcEvolution(proposal.proposalSequence))}
                              className="rounded bg-accent px-3 py-1 text-xs text-white disabled:opacity-40"
                            >
                              {t('npcEvolution.acceptButton')}
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => void run(() => store.rejectNpcEvolution(proposal.proposalSequence, t('npcEvolution.rejectReason')))}
                              className="rounded border border-border px-3 py-1 text-xs text-text-secondary hover:bg-bg-hover disabled:opacity-40"
                            >
                              {t('npcEvolution.rejectButton')}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    {store.pendingProposals.length === 0 && (
                      <p className="text-xs text-text-muted">{t('npcEvolution.noPending')}</p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {selected.kind === 'ttrpg' && (
              <section className="rounded-lg border border-accent/30 bg-bg-surface">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                      <Dices className="h-4 w-4 text-accent" />
                      {t('ttrpg.heading')}
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      {t('ttrpg.description')}
                    </p>
                  </div>
                  {ttrpgAI.tokenUsage && (
                    <span className="text-[10px] text-text-muted">
                      {ttrpgAI.tokenUsage.inputTokens + ttrpgAI.tokenUsage.outputTokens} tokens
                    </span>
                  )}
                </div>
                <div className="space-y-4 p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <input
                        value={ttrpgSceneTitle}
                        onChange={event => setTtrpgSceneTitle(event.target.value)}
                        placeholder={t('ttrpg.sceneTitlePlaceholder')}
                        aria-label={t('ttrpg.sceneTitleAria')}
                        className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary"
                      />
                      <textarea
                        value={ttrpgSceneDescription}
                        onChange={event => setTtrpgSceneDescription(event.target.value)}
                        placeholder={t('ttrpg.sceneDescriptionPlaceholder')}
                        aria-label={t('ttrpg.sceneDescriptionAria')}
                        className="min-h-16 w-full rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <select
                        value={ttrpgSceneLocationKey}
                        onChange={event => setTtrpgSceneLocationKey(event.target.value)}
                        aria-label={t('ttrpg.sceneLocationAria')}
                        className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary"
                      >
                        <option value="">{t('ttrpg.noLocationOption')}</option>
                        {Object.values(store.runtimeState.entities)
                          .filter(entity => entity.kind === 'location')
                          .map(entity => <option key={entity.entityKey} value={entity.entityKey}>{entity.name}</option>)}
                      </select>
                      <input
                        value={ttrpgTurnOrderText}
                        onChange={event => setTtrpgTurnOrderText(event.target.value)}
                        placeholder={t('ttrpg.turnOrderPlaceholder')}
                        aria-label={t('ttrpg.turnOrderAria')}
                        className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary"
                      />
                      <button
                        disabled={busy || !ttrpgSceneTitle.trim() || !ttrpgTurnOrderText.trim()}
                        onClick={() => void run(async () => {
                          await store.openTtrpgScene({
                            title: ttrpgSceneTitle,
                            description: ttrpgSceneDescription,
                            locationKey: ttrpgSceneLocationKey || null,
                            turnOrder: ttrpgTurnOrderText.split(/[,，\n]/).map(value => value.trim()).filter(Boolean),
                          })
                        })}
                        className="rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-40"
                      >
                        {t('ttrpg.startScene')}
                      </button>
                    </div>
                  </div>

                  {store.runtimeState.ttrpg?.scene && (
                    <div className="rounded border border-border bg-bg-base px-3 py-2 text-xs text-text-secondary">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-medium text-text-primary">{store.runtimeState.ttrpg.scene.title}</span>
                        <span>{t('ttrpg.roundLabel', { round: store.runtimeState.ttrpg.round })}</span>
                        <span>{t('ttrpg.currentActorPrefix')}{store.runtimeState.entities[store.runtimeState.ttrpg.activeActorKey ?? '']?.name ?? store.runtimeState.ttrpg.activeActorKey ?? t('ttrpg.currentActorNone')}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap">{store.runtimeState.ttrpg.scene.description || t('ttrpg.noSceneDescription')}</p>
                      <div className="mt-1 text-[10px] text-text-muted">
                        {t('ttrpg.turnOrderPrefix')}{store.runtimeState.ttrpg.turnOrder.map(key => store.runtimeState.entities[key]?.name ?? key).join(' → ')}
                      </div>
                    </div>
                  )}

                  <section className="rounded border border-accent/30 bg-bg-base p-3" data-testid="ttrpg-combat-panel">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                          <Dices className="h-4 w-4 text-accent" />
                          {t('ttrpg.combatHeading')}
                        </div>
                        <p className="mt-1 text-xs text-text-muted">{t('ttrpg.combatDescription')}</p>
                      </div>
                      {encounterAI.tokenUsage && (
                        <span className="text-[10px] text-text-muted">
                          AI {encounterAI.tokenUsage.inputTokens + encounterAI.tokenUsage.outputTokens} tokens
                        </span>
                      )}
                    </div>

                    {!combatEncounter || combatEncounter.status === 'resolved' ? (
                      <div className="mt-3 space-y-3">
                        <div className="grid gap-2 md:grid-cols-2">
                          <input
                            value={ttrpgEncounterTitle}
                            onChange={event => setTtrpgEncounterTitle(event.target.value)}
                            placeholder={t('ttrpg.encounterTitlePlaceholder')}
                            aria-label={t('ttrpg.encounterTitleAria')}
                            className="rounded border border-border bg-bg-surface px-2 py-1.5 text-sm text-text-primary"
                          />
                          <textarea
                            value={ttrpgEncounterDescription}
                            onChange={event => setTtrpgEncounterDescription(event.target.value)}
                            placeholder={t('ttrpg.encounterDescriptionPlaceholder')}
                            aria-label={t('ttrpg.encounterDescriptionAria')}
                            className="min-h-16 rounded border border-border bg-bg-surface px-2 py-1.5 text-sm text-text-primary"
                          />
                        </div>
                        <div>
                          <div className="mb-1 text-xs font-medium text-text-secondary">{t('ttrpg.participantsHeading')}</div>
                          <div className="flex flex-wrap gap-2">
                            {ttrpgActors.map(entity => (
                              <label key={entity.entityKey} className="flex items-center gap-1.5 rounded border border-border px-2 py-1 text-xs text-text-secondary">
                                <input
                                  type="checkbox"
                                  checked={ttrpgParticipantKeys.includes(entity.entityKey)}
                                  onChange={() => setTtrpgParticipantKeys(current => current.includes(entity.entityKey)
                                    ? current.filter(key => key !== entity.entityKey)
                                    : [...current, entity.entityKey])}
                                  aria-label={t('ttrpg.participantAria', { name: entity.name })}
                                />
                                {entity.name}
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            disabled={busy || !store.runtimeState.ttrpg?.scene || ttrpgParticipantKeys.length < 2 || !ttrpgEncounterTitle.trim() || !ttrpgEncounterDescription.trim()}
                            onClick={() => void run(() => store.startTtrpgEncounter({
                              baseSequence: store.runtimeState.lastSequence,
                              title: ttrpgEncounterTitle,
                              description: ttrpgEncounterDescription,
                              participantKeys: ttrpgParticipantKeys,
                            }))}
                            className="rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-40"
                          >
                            {t('ttrpg.startEncounterDirect')}
                          </button>
                          <button
                            disabled={busy || encounterAI.isStreaming || !store.runtimeState.ttrpg?.scene || ttrpgParticipantKeys.length < 2 || !isAIConfigReady(resolveRequestConfig(config, { category: 'simulation.ttrpg-encounter' }).config)}
                            onClick={() => void run(generateTtrpgEncounter)}
                            className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-hover disabled:opacity-40"
                          >
                            {encounterAI.isStreaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                            {encounterAI.isStreaming ? t('ttrpg.encounterGenerating') : t('ttrpg.generateEncounterCandidate')}
                          </button>
                        </div>
                        {encounterAI.error && <span className="text-xs text-danger">{encounterAI.error}</span>}
                        {ttrpgEncounterCandidate && (
                          <div className="rounded border border-accent/30 bg-bg-surface p-3 text-sm">
                            <div className="font-medium text-text-primary">{ttrpgEncounterCandidate.title}</div>
                            <p className="mt-1 whitespace-pre-wrap text-xs text-text-secondary">{ttrpgEncounterCandidate.description}</p>
                            <div className="mt-1 text-[10px] text-text-muted">{t('ttrpg.participantsPrefix')}{listFormat.format(ttrpgEncounterCandidate.participantKeys)} · {t('ttrpg.baselinePrefix', { sequence: ttrpgEncounterCandidate.baseSequence })}</div>
                            <div className="mt-3 flex gap-2">
                              <button
                                disabled={busy || store.runtimeState.lastSequence !== ttrpgEncounterCandidate.baseSequence}
                                onClick={() => void run(async () => {
                                  await store.startTtrpgEncounter(ttrpgEncounterCandidate)
                                  setTtrpgEncounterCandidate(null)
                                })}
                                className="rounded bg-accent px-3 py-1 text-xs text-white disabled:opacity-40"
                              >
                                {t('ttrpg.confirmStartEncounter')}
                              </button>
                              <button disabled={busy} onClick={() => setTtrpgEncounterCandidate(null)} className="rounded border border-border px-3 py-1 text-xs text-text-secondary hover:bg-bg-hover disabled:opacity-40">{t('ttrpg.discardCandidate')}</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-3 space-y-3">
                        <div className="rounded border border-border bg-bg-surface px-3 py-2 text-xs text-text-secondary">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-medium text-text-primary">{combatEncounter.title}</span>
                            <span>{t('ttrpg.combatRoundLabel', { round: combatEncounter.round })}</span>
                            <span>{t('ttrpg.currentActorPrefix')}{store.runtimeState.entities[combatEncounter.activeActorKey ?? '']?.name ?? combatEncounter.activeActorKey ?? t('ttrpg.currentActorNone')}</span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap">{combatEncounter.description}</p>
                          <button
                            disabled={busy}
                            onClick={() => void run(() => store.resolveTtrpgEncounter(t('ttrpg.endEncounterReason')))}
                            className="mt-2 rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-hover disabled:opacity-40"
                          >
                            {t('ttrpg.endEncounter')}
                          </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {combatEncounter.turnOrder.map(entityKey => {
                            const combatant = combatEncounter.combatants[entityKey]
                            const entity = store.runtimeState.entities[entityKey]
                            if (!combatant || !entity) return null
                            const hp = combatant.resources.hp
                            return (
                              <div key={entityKey} className={`rounded border px-3 py-2 text-xs ${combatEncounter.activeActorKey === entityKey ? 'border-accent bg-accent/5' : 'border-border bg-bg-surface'}`}>
                                <div className="flex items-center justify-between gap-2"><span className="font-medium text-text-primary">{entity.name}</span><span className="text-text-muted">{t('ttrpg.initiativeAc', { initiative: combatant.initiative, ac: combatant.armorClass })}</span></div>
                                <div className="mt-1">{t('ttrpg.hpLine', { current: hp.current, maximum: hp.maximum })} · {Object.entries(combatant.resources).filter(([key]) => key !== 'hp').map(([key, resource]) => `${key} ${resource.current}/${resource.maximum}`).join(' · ') || t('ttrpg.noExtraResources')}</div>
                                <div className="mt-1 text-text-muted">{t('ttrpg.conditionsPrefix')}{listFormat.format(combatant.conditions.map(condition => `${condition.name}${condition.stacks > 1 ? t('ttrpg.conditionStacks', { stacks: condition.stacks }) : ''}${condition.duration != null ? t('ttrpg.conditionDuration', { duration: condition.duration }) : ''}`)) || t('ttrpg.noConditions')}</div>
                              </div>
                            )
                          })}
                        </div>
                        <div className="grid gap-2 md:grid-cols-[8rem_8rem_7rem_1fr_auto]">
                          <select value={ttrpgActorKey} onChange={event => setTtrpgActorKey(event.target.value)} aria-label={t('ttrpg.attackerAria')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary">
                            {combatTargetEntities.map(entity => <option key={entity.entityKey} value={entity.entityKey}>{entity.name}</option>)}
                          </select>
                          <select value={ttrpgAttackTargetKey} onChange={event => setTtrpgAttackTargetKey(event.target.value)} aria-label={t('ttrpg.attackTargetAria')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary">
                            {combatTargetEntities.filter(entity => entity.entityKey !== ttrpgActorKey).map(entity => <option key={entity.entityKey} value={entity.entityKey}>{entity.name}</option>)}
                          </select>
                          <input value={ttrpgAttackExpression} onChange={event => setTtrpgAttackExpression(event.target.value)} aria-label={t('ttrpg.attackExpressionAria')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary" />
                          <input value={ttrpgDamageExpression} onChange={event => setTtrpgDamageExpression(event.target.value)} aria-label={t('ttrpg.damageExpressionAria')} placeholder={t('ttrpg.damageExpressionPlaceholder')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary" />
                          <button disabled={busy || combatEncounter.activeActorKey !== ttrpgActorKey || !ttrpgAttackTargetKey} onClick={() => void run(() => store.resolveTtrpgAttack({ actorKey: ttrpgActorKey, targetKey: ttrpgAttackTargetKey, attackExpression: ttrpgAttackExpression, damageExpression: ttrpgDamageExpression || null, resourceKey: ttrpgResourceKey, reason: ttrpgAttackReason }))} className="rounded bg-accent px-3 py-1.5 text-xs text-white disabled:opacity-40">{t('ttrpg.executeAttack')}</button>
                        </div>
                        <input value={ttrpgAttackReason} onChange={event => setTtrpgAttackReason(event.target.value)} aria-label={t('ttrpg.attackReasonAria')} placeholder={t('ttrpg.attackReasonPlaceholder')} className="w-full rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary" />
                        <div className="grid gap-2 md:grid-cols-[8rem_7rem_6rem_1fr_auto]">
                          <select value={ttrpgResourceEntityKey} onChange={event => setTtrpgResourceEntityKey(event.target.value)} aria-label={t('ttrpg.resourceTargetAria')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary">
                            {combatTargetEntities.map(entity => <option key={entity.entityKey} value={entity.entityKey}>{entity.name}</option>)}
                          </select>
                          <input value={ttrpgResourceName} onChange={event => setTtrpgResourceName(event.target.value)} aria-label={t('ttrpg.resourceNameAria')} placeholder={t('ttrpg.resourceNamePlaceholder')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary" />
                          <input value={ttrpgResourceDelta} onChange={event => setTtrpgResourceDelta(event.target.value)} aria-label={t('ttrpg.resourceDeltaAria')} placeholder={t('ttrpg.resourceDeltaPlaceholder')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary" />
                          <span className="self-center text-[10px] text-text-muted">{t('ttrpg.manualResourceHint')}</span>
                          <button disabled={busy || !ttrpgResourceEntityKey || !ttrpgResourceName.trim()} onClick={() => void run(() => store.changeTtrpgResource({ entityKey: ttrpgResourceEntityKey, resourceKey: ttrpgResourceName, delta: Number(ttrpgResourceDelta), reason: t('ttrpg.manualResourceReason') }))} className="rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover disabled:opacity-40">{t('ttrpg.adjustResource')}</button>
                        </div>
                        <div className="grid gap-2 md:grid-cols-[8rem_7rem_6rem_1fr_auto]">
                          <select value={ttrpgConditionEntityKey} onChange={event => setTtrpgConditionEntityKey(event.target.value)} aria-label={t('ttrpg.conditionTargetAria')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary">
                            {combatTargetEntities.map(entity => <option key={entity.entityKey} value={entity.entityKey}>{entity.name}</option>)}
                          </select>
                          <input value={ttrpgConditionName} onChange={event => setTtrpgConditionName(event.target.value)} aria-label={t('ttrpg.conditionNameAria')} placeholder={t('ttrpg.conditionNamePlaceholder')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary" />
                          <input value={ttrpgConditionDuration} onChange={event => setTtrpgConditionDuration(event.target.value)} aria-label={t('ttrpg.conditionDurationAria')} placeholder={t('ttrpg.conditionDurationPlaceholder')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary" />
                          <input value={ttrpgConditionDescription} onChange={event => setTtrpgConditionDescription(event.target.value)} aria-label={t('ttrpg.conditionDescriptionAria')} placeholder={t('ttrpg.conditionDescriptionPlaceholder')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary" />
                          <button disabled={busy || !ttrpgConditionEntityKey || !ttrpgConditionName.trim()} onClick={() => void run(() => store.applyTtrpgCondition({ entityKey: ttrpgConditionEntityKey, condition: { conditionId: `manual:${Date.now()}`, name: ttrpgConditionName, description: ttrpgConditionDescription, duration: Number(ttrpgConditionDuration) > 0 ? Number(ttrpgConditionDuration) : null, stacks: 1 } }))} className="rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover disabled:opacity-40">{t('ttrpg.applyCondition')}</button>
                        </div>
                        <div className="grid gap-2 md:grid-cols-[8rem_1fr_auto]">
                          <select value={ttrpgConditionEntityKey} onChange={event => setTtrpgConditionEntityKey(event.target.value)} aria-label={t('ttrpg.removeConditionTargetAria')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary">
                            {combatTargetEntities.map(entity => <option key={entity.entityKey} value={entity.entityKey}>{entity.name}</option>)}
                          </select>
                          <select aria-label={t('ttrpg.removeConditionAria')} defaultValue="" onChange={event => { if (event.target.value) void run(() => store.removeTtrpgCondition({ entityKey: ttrpgConditionEntityKey, conditionId: event.target.value })) }} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-primary">
                            <option value="">{t('ttrpg.removeConditionPlaceholder')}</option>
                            {(combatEncounter.combatants[ttrpgConditionEntityKey]?.conditions ?? []).map(condition => <option key={condition.conditionId} value={condition.conditionId}>{condition.name}</option>)}
                          </select>
                          <span className="self-center text-[10px] text-text-muted">{t('ttrpg.conditionDurationHint')}</span>
                        </div>
                      </div>
                    )}
                  </section>

                  <div className="grid gap-3 md:grid-cols-[12rem_1fr]">
                    <select
                      value={selectedTtrpgActor?.entityKey ?? ''}
                      onChange={event => setTtrpgActorKey(event.target.value)}
                      aria-label={t('ttrpg.actorSelectAria')}
                      disabled={ttrpgActors.length === 0 || ttrpgAI.isStreaming}
                      className="rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary disabled:opacity-50"
                    >
                      {ttrpgActors.length === 0 && <option value="">{t('ttrpg.noActorOption')}</option>}
                      {ttrpgActors.map(entity => <option key={entity.entityKey} value={entity.entityKey}>{entity.name}</option>)}
                    </select>
                    <textarea
                      value={ttrpgAction}
                      onChange={event => setTtrpgAction(event.target.value)}
                      placeholder={t('ttrpg.actionPlaceholder')}
                      aria-label={t('ttrpg.actionAria')}
                      className="min-h-16 rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      disabled={busy || ttrpgAI.isStreaming || !store.runtimeState.ttrpg?.scene || !selectedTtrpgActor || !ttrpgAction.trim() || !isAIConfigReady(resolveRequestConfig(config, { category: 'simulation.ttrpg-gm' }).config)}
                      onClick={() => void run(generateTtrpgTurn)}
                      className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-40"
                    >
                      {ttrpgAI.isStreaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {ttrpgAI.isStreaming ? t('ttrpg.gmGenerating') : t('ttrpg.requestGm')}
                    </button>
                    {ttrpgAI.error && <span className="text-xs text-danger">{ttrpgAI.error}</span>}
                  </div>
                  {ttrpgAI.output && (
                    <details className="rounded border border-border bg-bg-base px-3 py-2 text-xs">
                      <summary className="cursor-pointer text-text-secondary">{t('ttrpg.gmRawOutputSummary')}</summary>
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-text-muted">{ttrpgAI.output}</pre>
                    </details>
                  )}
                  {ttrpgCandidate && (
                    <div className="rounded border border-accent/30 bg-bg-base p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-text-primary">{t('ttrpg.pendingTurnHeading')}</span>
                        <span className="text-[10px] text-text-muted">{t('ttrpg.baselineEventLabel', { sequence: ttrpgCandidate.baseSequence })}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-text-secondary">{ttrpgCandidate.narrative}</p>
                      {ttrpgCandidate.check && ttrpgCandidate.outcomes && (
                        <div className="mt-2 space-y-1 text-xs text-text-secondary">
                          <div>{t('ttrpg.checkLine', { skill: ttrpgCandidate.check.skill, expression: ttrpgCandidate.check.expression, dc: ttrpgCandidate.check.dc })}</div>
                          <div>{t('ttrpg.successLine', { text: ttrpgCandidate.outcomes.success })}</div>
                          <div>{t('ttrpg.failureLine', { text: ttrpgCandidate.outcomes.failure })}</div>
                        </div>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button
                          disabled={busy || store.runtimeState.lastSequence !== ttrpgCandidate.baseSequence}
                          onClick={() => void run(async () => {
                            await store.recordTtrpgTurn(ttrpgCandidate)
                            setTtrpgCandidate(null)
                            setTtrpgAction('')
                          })}
                          className="rounded bg-accent px-3 py-1 text-xs text-white disabled:opacity-40"
                        >
                          {t('ttrpg.recordTurn')}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => setTtrpgCandidate(null)}
                          className="rounded border border-border px-3 py-1 text-xs text-text-secondary hover:bg-bg-hover disabled:opacity-40"
                        >
                          {t('ttrpg.discardCandidate')}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-2 sm:grid-cols-[8rem_6rem_6rem_auto]">
                    <input
                      value={ttrpgSkill}
                      onChange={event => setTtrpgSkill(event.target.value)}
                      placeholder={t('ttrpg.skillPlaceholder')}
                      aria-label={t('ttrpg.skillAria')}
                      className="rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary"
                    />
                    <input
                      value={ttrpgExpression}
                      onChange={event => setTtrpgExpression(event.target.value)}
                      aria-label={t('ttrpg.expressionAria')}
                      className="rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary"
                    />
                    <input
                      value={ttrpgDc}
                      onChange={event => setTtrpgDc(event.target.value)}
                      aria-label={t('ttrpg.dcAria')}
                      className="rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary"
                    />
                    <button
                      disabled={busy || !store.runtimeState.ttrpg?.scene || !selectedTtrpgActor || !ttrpgSkill.trim()}
                      onClick={() => void run(() => store.resolveTtrpgCheck({
                        actorKey: selectedTtrpgActor?.entityKey ?? '',
                        skill: ttrpgSkill,
                        expression: ttrpgExpression,
                        dc: Number(ttrpgDc),
                      }))}
                      className="rounded border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-hover disabled:opacity-40"
                    >
                      {t('ttrpg.skillCheck')}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {selected.kind === 'ttrpg' && (
              <section className="rounded-lg border border-accent/30 bg-bg-surface" data-testid="ttrpg-campaign-panel">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <CalendarClock className="h-4 w-4 text-accent" />
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">{t('campaign.heading')}</h3>
                    <p className="mt-1 text-xs text-text-muted">{t('campaign.description')}</p>
                  </div>
                </div>
                <div className="space-y-4 p-4">
                  <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-text-secondary" htmlFor="ttrpg-campaign-summary">{t('campaign.summaryLabel')}</label>
                      <textarea
                        id="ttrpg-campaign-summary"
                        value={campaignSummary}
                        onChange={event => setCampaignSummary(event.target.value)}
                        placeholder={t('campaign.summaryPlaceholder')}
                        className="min-h-28 w-full rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary"
                      />
                      <button
                        disabled={busy || campaignSummary === campaign.summary}
                        onClick={() => void run(() => store.updateTtrpgCampaignSummary(campaignSummary, store.runtimeState.lastSequence))}
                        className="rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-40"
                      >
                        {t('campaign.saveSummary')}
                      </button>
                    </div>
                    <div className="rounded border border-border bg-bg-base p-3">
                      <div className="flex items-center justify-between gap-2 text-xs font-medium text-text-secondary">
                        <span>{t('campaign.worldTime')}</span>
                        <span className="font-mono text-accent">T+{store.runtimeState.clock}</span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-text-muted">{t('campaign.clockNote')}</p>
                      <div className="mt-3 text-xs text-text-secondary">{t('campaign.activeSchedulesCount', { count: activeCampaignSchedules.length })}</div>
                      {activeCampaignSchedules.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {activeCampaignSchedules.map(schedule => (
                            <div key={schedule.scheduleId} className="rounded bg-bg-surface px-2 py-1 text-xs text-text-secondary">
                              {store.runtimeState.entities[schedule.entityKey]?.name ?? schedule.entityKey}{t('common:colon')}{schedule.activity}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2 rounded border border-border bg-bg-base p-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-text-primary"><ClipboardList className="h-4 w-4 text-accent" />{t('campaign.questsHeading')}</div>
                      <input value={campaignQuestId} onChange={event => setCampaignQuestId(event.target.value)} placeholder={t('campaign.questIdPlaceholder')} aria-label={t('campaign.questIdAria')} className="w-full rounded border border-border bg-bg-surface px-2 py-1.5 text-sm" />
                      <input value={campaignQuestTitle} onChange={event => setCampaignQuestTitle(event.target.value)} placeholder={t('campaign.questTitlePlaceholder')} aria-label={t('campaign.questTitleAria')} className="w-full rounded border border-border bg-bg-surface px-2 py-1.5 text-sm" />
                      <textarea value={campaignQuestDescription} onChange={event => setCampaignQuestDescription(event.target.value)} placeholder={t('campaign.questDescriptionPlaceholder')} aria-label={t('campaign.questDescriptionAria')} className="min-h-16 w-full rounded border border-border bg-bg-surface px-2 py-1.5 text-sm" />
                      <div className="grid gap-2 sm:grid-cols-3">
                        <select value={campaignQuestStatus} onChange={event => setCampaignQuestStatus(event.target.value as typeof campaignQuestStatus)} aria-label={t('campaign.questStatusAria')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-sm">
                          <option value="active">{t('campaign.questStatusActive')}</option><option value="paused">{t('campaign.questStatusPaused')}</option><option value="completed">{t('campaign.questStatusCompleted')}</option><option value="failed">{t('campaign.questStatusFailed')}</option>
                        </select>
                        <input type="number" min="0" max="5" value={campaignQuestPriority} onChange={event => setCampaignQuestPriority(event.target.value)} placeholder={t('campaign.questPriorityPlaceholder')} aria-label={t('campaign.questPriorityAria')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-sm" />
                        <input type="number" min="0" value={campaignQuestDueClock} onChange={event => setCampaignQuestDueClock(event.target.value)} placeholder={t('campaign.questDuePlaceholder')} aria-label={t('campaign.questDueAria')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-sm" />
                      </div>
                      <button
                        disabled={busy || !campaignQuestId.trim() || !campaignQuestTitle.trim()}
                        onClick={() => void run(async () => {
                          await store.upsertTtrpgQuest({
                            questId: campaignQuestId,
                            title: campaignQuestTitle,
                            description: campaignQuestDescription,
                            status: campaignQuestStatus,
                            priority: Number(campaignQuestPriority),
                            dueClock: campaignQuestDueClock.trim() ? Number(campaignQuestDueClock) : null,
                          })
                          setCampaignQuestId(''); setCampaignQuestTitle(''); setCampaignQuestDescription('');
                        })}
                        className="rounded border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-hover disabled:opacity-40"
                      >
                        {t('campaign.saveQuest')}
                      </button>
                      <div className="max-h-40 space-y-1 overflow-y-auto">
                        {campaign.quests.map(quest => (
                          <button key={quest.questId} type="button" onClick={() => { setCampaignQuestId(quest.questId); setCampaignQuestTitle(quest.title); setCampaignQuestDescription(quest.description); setCampaignQuestStatus(quest.status); setCampaignQuestPriority(String(quest.priority)); setCampaignQuestDueClock(quest.dueClock == null ? '' : String(quest.dueClock)) }} className="flex w-full items-center gap-2 rounded bg-bg-surface px-2 py-1.5 text-left text-xs hover:bg-bg-hover">
                            <span className="flex-1 truncate text-text-secondary">{quest.title}</span><span className="text-text-muted">{quest.status}</span>{quest.dueClock != null && <span className="text-text-muted">T+{quest.dueClock}</span>}
                          </button>
                        ))}
                        {campaign.quests.length === 0 && <p className="text-xs text-text-muted">{t('campaign.noQuests')}</p>}
                      </div>
                    </div>

                    <div className="space-y-2 rounded border border-border bg-bg-base p-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-text-primary"><CalendarClock className="h-4 w-4 text-accent" />{t('campaign.schedulesHeading')}</div>
                      <input value={campaignScheduleId} onChange={event => setCampaignScheduleId(event.target.value)} placeholder={t('campaign.scheduleIdPlaceholder')} aria-label={t('campaign.scheduleIdAria')} className="w-full rounded border border-border bg-bg-surface px-2 py-1.5 text-sm" />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <select value={campaignScheduleEntityKey} onChange={event => setCampaignScheduleEntityKey(event.target.value)} aria-label={t('campaign.scheduleEntityAria')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-sm">
                          <option value="">{t('campaign.scheduleSelectNpc')}</option>{campaignNpcs.map(entity => <option key={entity.entityKey} value={entity.entityKey}>{entity.name}</option>)}
                        </select>
                        <select value={campaignScheduleLocationKey} onChange={event => setCampaignScheduleLocationKey(event.target.value)} aria-label={t('campaign.scheduleLocationAria')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-sm">
                          <option value="">{t('ttrpg.noLocationOption')}</option>{Object.values(store.runtimeState.entities).filter(entity => entity.kind === 'location').map(entity => <option key={entity.entityKey} value={entity.entityKey}>{entity.name}</option>)}
                        </select>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <input type="number" min="0" value={campaignScheduleStartClock} onChange={event => setCampaignScheduleStartClock(event.target.value)} placeholder={t('campaign.scheduleStartPlaceholder')} aria-label={t('campaign.scheduleStartAria')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-sm" />
                        <input type="number" min="0" value={campaignScheduleEndClock} onChange={event => setCampaignScheduleEndClock(event.target.value)} placeholder={t('campaign.scheduleEndPlaceholder')} aria-label={t('campaign.scheduleEndAria')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-sm" />
                        <select value={campaignScheduleRecurrence} onChange={event => setCampaignScheduleRecurrence(event.target.value as typeof campaignScheduleRecurrence)} aria-label={t('campaign.scheduleRecurrenceAria')} className="rounded border border-border bg-bg-surface px-2 py-1.5 text-sm">
                          <option value="once">{t('campaign.recurrenceOnce')}</option><option value="daily">{t('campaign.recurrenceDaily')}</option><option value="weekly">{t('campaign.recurrenceWeekly')}</option>
                        </select>
                      </div>
                      <input value={campaignScheduleActivity} onChange={event => setCampaignScheduleActivity(event.target.value)} placeholder={t('campaign.scheduleActivityPlaceholder')} aria-label={t('campaign.scheduleActivityAria')} className="w-full rounded border border-border bg-bg-surface px-2 py-1.5 text-sm" />
                      <button
                        disabled={busy || !campaignScheduleId.trim() || !campaignScheduleEntityKey || !campaignScheduleActivity.trim()}
                        onClick={() => void run(async () => {
                          await store.upsertTtrpgNpcSchedule({
                            scheduleId: campaignScheduleId,
                            entityKey: campaignScheduleEntityKey,
                            startClock: Number(campaignScheduleStartClock),
                            endClock: campaignScheduleEndClock.trim() ? Number(campaignScheduleEndClock) : null,
                            locationKey: campaignScheduleLocationKey || null,
                            activity: campaignScheduleActivity,
                            recurrence: campaignScheduleRecurrence,
                          })
                          setCampaignScheduleId(''); setCampaignScheduleActivity('')
                        })}
                        className="rounded border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-hover disabled:opacity-40"
                      >
                        {t('campaign.saveSchedule')}
                      </button>
                      <div className="max-h-40 space-y-1 overflow-y-auto">
                        {campaign.npcSchedules.map(schedule => (
                          <button key={schedule.scheduleId} type="button" onClick={() => { setCampaignScheduleId(schedule.scheduleId); setCampaignScheduleEntityKey(schedule.entityKey); setCampaignScheduleStartClock(String(schedule.startClock)); setCampaignScheduleEndClock(schedule.endClock == null ? '' : String(schedule.endClock)); setCampaignScheduleLocationKey(schedule.locationKey ?? ''); setCampaignScheduleActivity(schedule.activity); setCampaignScheduleRecurrence(schedule.recurrence) }} className="flex w-full items-center gap-2 rounded bg-bg-surface px-2 py-1.5 text-left text-xs hover:bg-bg-hover">
                            <span className="flex-1 truncate text-text-secondary">{store.runtimeState.entities[schedule.entityKey]?.name ?? schedule.entityKey}{t('common:colon')}{schedule.activity}</span><span className="text-text-muted">T+{schedule.startClock}</span>
                          </button>
                        ))}
                        {campaign.npcSchedules.length === 0 && <p className="text-xs text-text-muted">{t('campaign.noSchedules')}</p>}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-3 rounded-lg border border-border bg-bg-surface p-4">
                <h3 className="text-sm font-semibold text-text-primary">{t('deterministic.heading')}</h3>
                <div className="flex gap-2">
                  <input
                    value={timeAmount}
                    onChange={event => setTimeAmount(event.target.value)}
                    aria-label={t('deterministic.advanceTimeAria')}
                    className="min-w-0 flex-1 rounded border border-border bg-bg-base px-2 py-1.5 text-sm"
                  />
                  <button
                    disabled={busy}
                    onClick={() => void run(() => store.advanceTime(Number(timeAmount)))}
                    className="rounded border border-border px-3 py-1.5 text-sm hover:bg-bg-hover"
                  >
                    {t('deterministic.advanceTime')}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    value={dice}
                    onChange={event => setDice(event.target.value)}
                    aria-label={t('deterministic.diceExpressionAria')}
                    className="min-w-0 flex-1 rounded border border-border bg-bg-base px-2 py-1.5 text-sm"
                  />
                  <button
                    disabled={busy}
                    onClick={() => void run(() => store.rollDice(dice))}
                    className="flex items-center gap-1 rounded border border-border px-3 py-1.5 text-sm hover:bg-bg-hover"
                  >
                    <Dices className="h-3.5 w-3.5" />
                    {t('deterministic.rollDice')}
                  </button>
                </div>
                <textarea
                  value={narrative}
                  onChange={event => setNarrative(event.target.value)}
                  placeholder={t('deterministic.narrativePlaceholder')}
                  className="min-h-20 w-full rounded border border-border bg-bg-base px-2 py-1.5 text-sm"
                />
                <button
                  disabled={busy || !narrative.trim()}
                  onClick={() => void run(async () => {
                    await store.recordNarrative(narrative)
                    setNarrative('')
                  })}
                  className="rounded border border-border px-3 py-1.5 text-sm hover:bg-bg-hover disabled:opacity-40"
                >
                  {t('deterministic.appendNarrative')}
                </button>
              </div>

              <div className="space-y-3 rounded-lg border border-border bg-bg-surface p-4">
                <h3 className="text-sm font-semibold text-text-primary">{t('saveBranch.heading')}</h3>
                <div className="flex gap-2">
                  <input
                    value={checkpointName}
                    onChange={event => setCheckpointName(event.target.value)}
                    placeholder={t('saveBranch.checkpointPlaceholder')}
                    className="min-w-0 flex-1 rounded border border-border bg-bg-base px-2 py-1.5 text-sm"
                  />
                  <button
                    disabled={busy}
                    onClick={() => void run(async () => {
                      await store.checkpoint(checkpointName)
                      setCheckpointName('')
                    })}
                    className="flex items-center gap-1 rounded border border-border px-3 py-1.5 text-sm hover:bg-bg-hover"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {t('saveBranch.saveCheckpoint')}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    value={branchTitle}
                    onChange={event => setBranchTitle(event.target.value)}
                    placeholder={t('saveBranch.branchPlaceholder')}
                    className="min-w-0 flex-1 rounded border border-border bg-bg-base px-2 py-1.5 text-sm"
                  />
                  <button
                    disabled={busy || !branchTitle.trim()}
                    onClick={() => void run(async () => {
                      await store.branch(branchTitle)
                      setBranchTitle('')
                    })}
                    className="flex items-center gap-1 rounded border border-border px-3 py-1.5 text-sm hover:bg-bg-hover disabled:opacity-40"
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    {t('saveBranch.branchAction')}
                  </button>
                </div>
                <div className="space-y-2">
                  {store.checkpoints.map(checkpoint => (
                    <div key={checkpoint.id} className="flex items-center gap-2 rounded bg-bg-base px-2 py-1.5 text-xs">
                      <CopyPlus className="h-3.5 w-3.5 text-text-muted" />
                      <span className="flex-1 truncate">{checkpoint.name}</span>
                      <span className="text-text-muted">#{checkpoint.throughSequence}</span>
                      <button
                        disabled={busy}
                        onClick={() => void run(() => store.restoreCheckpoint(checkpoint.id!))}
                        className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-accent disabled:opacity-40"
                        title={t('saveBranch.restoreTitle')}
                        aria-label={t('saveBranch.restoreAria', { name: checkpoint.name })}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {store.checkpoints.length === 0 && (
                    <p className="text-xs text-text-muted">{t('saveBranch.noCheckpoints')}</p>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-bg-surface">
              <div className="border-b border-border px-4 py-3 text-sm font-semibold text-text-primary">
                {t('entities.heading')}
              </div>
              <div className="divide-y divide-border">
                {Object.values(store.runtimeState.entities).map(entity => (
                  <div key={entity.entityKey} className="grid gap-2 px-4 py-3 sm:grid-cols-[10rem_8rem_1fr]">
                    <div>
                      <div className="text-sm font-medium text-text-primary">{entity.name}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-text-muted">{entity.entityKey}</div>
                    </div>
                    <div className="text-xs text-text-secondary">
                      {entity.kind} · {entity.lifecycleStatus}
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
                      {Object.entries(entity.attributes).map(([key, value]) => (
                        <span key={key} className="max-w-full break-words">{key}: {String(value)}</span>
                      ))}
                    </div>
                  </div>
                ))}
                {Object.keys(store.runtimeState.entities).length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-text-muted">{t('entities.empty')}</p>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-bg-surface">
              <div className="border-b border-border px-4 py-3">
                <div className="text-sm font-semibold text-text-primary">{t('narrativeState.heading')}</div>
                <p className="mt-0.5 text-xs text-text-muted">
                  {t('narrativeState.description')}
                </p>
              </div>
              <div className="divide-y divide-border">
                {store.runtimeState.narratives.map((narrativeItem, index) => (
                  <div
                    key={`${narrativeItem.eventSequence}-${index}`}
                    className="flex gap-3 px-4 py-3 text-sm"
                  >
                    <span className="w-10 shrink-0 font-mono text-xs text-text-muted">
                      #{narrativeItem.eventSequence}
                    </span>
                    <span className="min-w-0 flex-1 break-words text-text-secondary">
                      {narrativeItem.text}
                    </span>
                  </div>
                ))}
                {store.runtimeState.narratives.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-text-muted">{t('narrativeState.empty')}</p>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-bg-surface">
              <div className="border-b border-border px-4 py-3 text-sm font-semibold text-text-primary">
                {t('eventLog.heading')}
              </div>
              <div className="divide-y divide-border">
                {[...store.events].reverse().map(event => (
                  <div key={event.id} className="flex gap-3 px-4 py-3 text-sm">
                    <span className="w-10 shrink-0 font-mono text-xs text-text-muted">#{event.sequence}</span>
                    <span className="w-32 shrink-0 text-xs text-accent">—</span>
                    <span className="min-w-0 flex-1 break-words text-text-secondary">
                      {formatEventSummary(t, event.type, event.payloadJson)}
                    </span>
                  </div>
                ))}
                {store.events.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-text-muted">{t('eventLog.empty')}</p>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
