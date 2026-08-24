import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  appendAgentEvent,
  getOrCreateAgentConversation,
  readAgentEvents,
  updateAgentEventCandidate,
} from '../../lib/agent/conversations'
import {
  adoptMasterCandidate,
  createMasterAgentPlan,
  executeMasterAgentPlan,
  type ExecutedMasterCandidate,
  type PinnedMasterAgentTaskV1,
  type MasterCandidatePayload,
  DOMAIN_AGENT_IDS,
} from '../../lib/agent/orchestrator'
import {
  findResumableMasterAgentRunV1,
  isMasterAgentDurableHarnessEnabledV1,
  runDurableMasterAgentPlanV1,
} from '../../lib/agent/run/master-durable'
import {
  commitMasterAgentCandidateAdoptionV1,
  recoverPendingMasterAgentAdoptionsV1,
  rejectMasterAgentCandidateV1,
} from '../../lib/agent/run/master-adoption'
import { verifyMasterAgentRunV1 } from '../../lib/agent/run/master-verification'
import { readAgentRunV1 } from '../../lib/agent/run/event-store'
import type { AgentEvent, Project, WorkspaceScope } from '../../lib/types'
import { AgentTeamBudgetTracker } from '../../lib/agent/team-budget'
import { useAIConfigStore } from '../../stores/ai-config'
import i18n, { getT } from '../../i18n'
import {
  revalidateStoryArcCreativeDraftV1,
  type StoryArcCopilotSnapshot,
} from '../../lib/agent/story-arc-copilot'
import {
  revalidateOutlineCreativeDraftV1,
  type OutlineCopilotSnapshot,
} from '../../lib/agent/outline-copilot'
import { revalidateProseCreativeDraftV1 } from '../../lib/agent/prose-copilot'
import { parseCreativeArtifactV1 } from '../../lib/agent/creative-reliability'

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return getT()('agent:errors.operationFailed')
}

const MASTER_COPILOT_SYNC_EVENT = 'storyforge:master-copilot-sync-v1'
const MASTER_COPILOT_SCOPE_OWNERS = new Map<string, symbol>()

interface MasterCopilotSyncDetail {
  scopeKey: string
  busy: boolean
}

function notifyMasterCopilotSync(scopeKey: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<MasterCopilotSyncDetail>(MASTER_COPILOT_SYNC_EVENT, {
    detail: {
      scopeKey,
      busy: MASTER_COPILOT_SCOPE_OWNERS.has(scopeKey),
    },
  }))
}

function claimMasterCopilotScope(scopeKey: string): symbol | null {
  if (MASTER_COPILOT_SCOPE_OWNERS.has(scopeKey)) return null
  const owner = Symbol(scopeKey)
  MASTER_COPILOT_SCOPE_OWNERS.set(scopeKey, owner)
  notifyMasterCopilotSync(scopeKey)
  return owner
}

function releaseMasterCopilotScope(scopeKey: string, owner: symbol): void {
  if (MASTER_COPILOT_SCOPE_OWNERS.get(scopeKey) !== owner) return
  MASTER_COPILOT_SCOPE_OWNERS.delete(scopeKey)
  notifyMasterCopilotSync(scopeKey)
}

export interface PendingMasterCandidate {
  event: AgentEvent
  payload: MasterCandidatePayload
  durable: boolean
  durableRunId?: number
}

export interface QuarantinedMasterCandidate {
  event: AgentEvent
  reason: string
}

export type MasterCandidateUpdateStatus = 'updating' | 'settled' | 'failed'

interface CandidateUpdateQueueEntry {
  revision: number
  status: MasterCandidateUpdateStatus
  tail: Promise<string | null>
}

type CandidateClassification =
  | { kind: 'legacy'; payload: MasterCandidatePayload }
  | { kind: 'durable'; payload: MasterCandidatePayload; runId: number }
  | { kind: 'quarantined'; reason: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readPayloadRecord(event: AgentEvent): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(event.payload) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isDomainAgentId(value: unknown): value is MasterCandidatePayload['agentId'] {
  return typeof value === 'string' && DOMAIN_AGENT_IDS.some(agentId => agentId === value)
}

function isMasterCandidatePayload(value: unknown): value is MasterCandidatePayload {
  if (!isRecord(value)) return false
  return value.version === 1
    && typeof value.taskId === 'string'
    && value.taskId.trim().length > 0
    && isDomainAgentId(value.agentId)
    && typeof value.label === 'string'
    && value.label.trim().length > 0
    && Array.isArray(value.contextSources)
    && value.contextSources.every(source => typeof source === 'string')
    && Object.prototype.hasOwnProperty.call(value, 'baseSnapshot')
}

function hasExplicitDurablePayloadIdentity(payload: Record<string, unknown>): boolean {
  // dependencyBindings are emitted by the legacy orchestrator as well.  They
  // are dependency evidence, not durable identity on their own.
  return ['runId', 'runStepId', 'candidateHash', 'runGeneration']
    .some(key => Object.prototype.hasOwnProperty.call(payload, key))
}

function hasValidDependencyBindings(payload: Record<string, unknown>): boolean {
  if (!Object.prototype.hasOwnProperty.call(payload, 'dependencyBindings')) return true
  if (!Array.isArray(payload.dependencyBindings)) return false
  return payload.dependencyBindings.every(binding => {
    if (!isRecord(binding)) return false
    if (
      typeof binding.taskId !== 'string'
      || !binding.taskId.trim()
      || typeof binding.outputHash !== 'string'
      || !/^[a-f0-9]{64}$/.test(binding.outputHash)
    ) return false
    return [binding.candidateHash, binding.verificationReceiptHash]
      .every(hash => hash === undefined || (typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)))
      && (binding.generation === undefined
        || (typeof binding.generation === 'number'
          && Number.isInteger(binding.generation)
          && binding.generation > 0))
  })
}

export function classifyMasterCandidate(event: AgentEvent): CandidateClassification {
  const payload = readPayloadRecord(event)
  const eventHasDurableRun = event.durableRunId !== undefined && event.durableRunId !== null
  const payloadHasDurableIdentity = payload != null && hasExplicitDurablePayloadIdentity(payload)
  if (!payload || !isMasterCandidatePayload(payload)) {
    return {
      kind: 'quarantined',
      reason: eventHasDurableRun || payloadHasDurableIdentity
        ? 'durable 候选 payload 缺失或格式损坏。'
        : '候选 payload 缺失或格式损坏。',
    }
  }
  if (!hasValidDependencyBindings(payload)) {
    return {
      kind: 'quarantined',
      reason: eventHasDurableRun || payloadHasDurableIdentity
        ? 'durable 候选依赖证据无效。'
        : '候选依赖证据无效。',
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'creativeArtifact')) {
    try {
      parseCreativeArtifactV1(payload.creativeArtifact)
    } catch {
      return {
        kind: 'quarantined',
        reason: eventHasDurableRun || payloadHasDurableIdentity
          ? 'durable 候选创作产物合同无效。'
          : '候选创作产物合同无效。',
      }
    }
  }
  if (!eventHasDurableRun && !payloadHasDurableIdentity) {
    return { kind: 'legacy', payload }
  }
  if (
    eventHasDurableRun
    && (
      typeof event.durableRunId !== 'number'
      || !Number.isInteger(event.durableRunId)
      || event.durableRunId < 1
    )
  ) return { kind: 'quarantined', reason: 'durableRunId 无效。' }
  if (
    typeof payload.runId !== 'number'
    || !Number.isInteger(payload.runId)
    || payload.runId < 1
    || typeof payload.runStepId !== 'string'
    || payload.runStepId !== `master:${payload.taskId}`
    || typeof payload.candidateHash !== 'string'
    || !/^[a-f0-9]{64}$/.test(payload.candidateHash)
    || (eventHasDurableRun && event.durableRunId !== payload.runId)
  ) return { kind: 'quarantined', reason: 'durable 候选身份、run 或 hash 不一致。' }
  if (
    (Object.prototype.hasOwnProperty.call(payload, 'runGeneration')
      !== Object.prototype.hasOwnProperty.call(payload, 'dependencyBindings'))
    || (
      Object.prototype.hasOwnProperty.call(payload, 'dependencyBindings')
      && !Array.isArray(payload.dependencyBindings)
    )
    || (
      Object.prototype.hasOwnProperty.call(payload, 'runGeneration')
      && (
        typeof payload.runGeneration !== 'number'
        || !Number.isInteger(payload.runGeneration)
        || payload.runGeneration < 1
      )
    )
  ) return { kind: 'quarantined', reason: 'durable 候选 generation/dependency 证据不完整。' }
  if (Array.isArray(payload.dependencyBindings)) {
    const validBindings = payload.dependencyBindings.every(binding => {
      if (!isRecord(binding)) return false
      if (
        typeof binding.taskId !== 'string'
        || !binding.taskId.trim()
        || typeof binding.outputHash !== 'string'
        || !/^[a-f0-9]{64}$/.test(binding.outputHash)
      ) return false
      return [binding.candidateHash, binding.verificationReceiptHash]
        .every(hash => hash === undefined || (typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)))
    })
    if (!validBindings) return { kind: 'quarantined', reason: 'durable 候选依赖 hash 证据无效。' }
  }
  return { kind: 'durable', payload, runId: payload.runId }
}

function isStoryArcSnapshot(value: unknown): value is StoryArcCopilotSnapshot {
  return isRecord(value)
    && typeof value.serialized === 'string'
    && Array.isArray(value.existingNames)
    && value.existingNames.every(item => typeof item === 'string')
}

function isOutlineSnapshot(value: unknown): value is OutlineCopilotSnapshot {
  return isRecord(value)
    && typeof value.serialized === 'string'
    && Array.isArray(value.existingTitles)
    && value.existingTitles.every(item => typeof item === 'string')
    && typeof value.startingOrder === 'number'
}

export function useMasterCopilot(input: {
  project: Project
  worldGroupId: number | null
}) {
  const { project, worldGroupId } = input
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [authorRequest, setAuthorRequest] = useState('')
  const [activeRequest, setActiveRequest] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [recoveryAvailable, setRecoveryAvailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidateUpdateState, setCandidateUpdateState] = useState<Record<number, MasterCandidateUpdateStatus>>({})
  const abortRef = useRef<AbortController | null>(null)
  const runtimeCandidates = useRef(new Map<number, ExecutedMasterCandidate>())
  const candidateUpdateQueues = useRef(new Map<number, CandidateUpdateQueueEntry>())
  const workspaceScope = useMemo<WorkspaceScope | undefined>(() => (
    project.id != null && project.activeWorldId != null && project.activeWorkId != null
      ? { projectId: project.id, worldId: project.activeWorldId, workId: project.activeWorkId }
      : undefined
  ), [project.activeWorkId, project.activeWorldId, project.id])
  const scopeKey = `${project.id}:${project.activeWorldId ?? 'legacy'}:${project.activeWorkId ?? 'legacy'}:${worldGroupId ?? 'global'}`

  const reload = useCallback(async (id: number) => {
    setEvents(await readAgentEvents(id, workspaceScope))
  }, [workspaceScope])

  useEffect(() => {
    if (conversationId == null || typeof window === 'undefined') return
    const handleSync = (event: Event) => {
      const detail = (event as CustomEvent<MasterCopilotSyncDetail>).detail
      if (detail?.scopeKey !== scopeKey) return
      setBusy(detail.busy)
      void reload(conversationId)
    }
    window.addEventListener(MASTER_COPILOT_SYNC_EVENT, handleSync)
    return () => window.removeEventListener(MASTER_COPILOT_SYNC_EVENT, handleSync)
  }, [conversationId, reload, scopeKey])

  const recordTask = useCallback(async (
    task: Parameters<NonNullable<Parameters<typeof executeMasterAgentPlan>[0]['onTask']>>[0],
    status: 'running' | 'completed' | 'failed',
    error?: string,
  ) => {
    if (conversationId == null) return
    await appendAgentEvent({
      projectId: project.id!,
      conversationId,
      kind: 'task',
      content: error || task.instruction,
      payload: { taskId: task.id, agentId: task.agentId, status, error },
      scope: workspaceScope,
    })
  }, [conversationId, project.id, workspaceScope])

  useEffect(() => {
    let active = true
    abortRef.current?.abort()
    runtimeCandidates.current.clear()
    setBusy(MASTER_COPILOT_SCOPE_OWNERS.has(scopeKey))
    setRecoveryAvailable(false)
    setError(null)
    setLoading(true)
    void (async () => {
      const conversation = await getOrCreateAgentConversation({
        projectId: project.id!,
        worldGroupId,
        scope: workspaceScope,
      })
      if (!active) return
      setConversationId(conversation.id!)
      if (workspaceScope) {
        const recovered = await recoverPendingMasterAgentAdoptionsV1(workspaceScope)
        if (recovered.failed.length > 0) {
          setError(getT()('agent:chat.resumeFailed', { message: recovered.failed[0].reason }))
        }
        for (const runId of recovered.recoveredRunIds) {
          const snapshot = await readAgentRunV1(workspaceScope, runId)
          if (snapshot.projection.state === 'running') {
            await verifyMasterAgentRunV1({ scope: workspaceScope, runId })
          }
        }
      }
      let rows = await readAgentEvents(conversation.id!, workspaceScope)
      if (!rows.length) {
        // Chat messages are persisted to IndexedDB; each row keeps the active locale's
        // text from creation time (translate-at-creation, expected behavior).
        // Ensure the 'agent' namespace is loaded before translating — getT() is sync
        // and returns the raw key if the namespace hasn't been fetched yet.
        await i18n.loadNamespaces('agent')
        await appendAgentEvent({
          projectId: project.id!,
          conversationId: conversation.id!,
          kind: 'message',
          role: 'assistant',
          content: getT()('agent:chat.greeting'),
          scope: workspaceScope,
        })
        rows = await readAgentEvents(conversation.id!, workspaceScope)
      }
      if (active) {
        setEvents(rows)
        setRecoveryAvailable(workspaceScope
          ? await findResumableMasterAgentRunV1({
              scope: workspaceScope,
              conversationId: conversation.id!,
            }) != null
          : false)
        setLoading(false)
      }
    })().catch(error => {
      if (active) {
        console.error('[master-copilot] load failed', error)
        setLoading(false)
      }
    })
    return () => {
      active = false
      abortRef.current?.abort()
    }
  }, [project.id, scopeKey, workspaceScope, worldGroupId])

  const { pendingCandidates, quarantinedCandidates } = useMemo(() => {
    const resolved = new Set<number>()
    events.filter(event => event.kind === 'confirmation').forEach(event => {
      const payload = readPayloadRecord(event)
      if (typeof payload?.candidateEventId === 'number') resolved.add(payload.candidateEventId)
    })
    const pending: PendingMasterCandidate[] = []
    const quarantined: QuarantinedMasterCandidate[] = []
    events
      .filter(event => event.kind === 'candidate' && event.id != null && !resolved.has(event.id))
      .forEach(event => {
        const classification = classifyMasterCandidate(event)
        if (classification.kind === 'quarantined') {
          quarantined.push({ event, reason: classification.reason })
        } else {
          pending.push({
            event,
            payload: classification.payload,
            durable: classification.kind === 'durable',
            ...(classification.kind === 'durable' ? { durableRunId: classification.runId } : {}),
          })
        }
      })
    return { pendingCandidates: pending, quarantinedCandidates: quarantined }
  }, [events])

  const submitRequest = useCallback(async (
    requestOverride?: string,
    options?: { pinnedTask?: PinnedMasterAgentTaskV1 },
  ) => {
    const request = (requestOverride ?? authorRequest).trim()
    if (!request || busy || conversationId == null) return
    if (pendingCandidates.length) return
    const scopeOwner = claimMasterCopilotScope(scopeKey)
    if (!scopeOwner) return
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    setBusy(true)
    setActiveRequest(request)
    setError(null)
    if (requestOverride === undefined) setAuthorRequest('')
    try {
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'message',
        role: 'user',
        content: request,
        scope: workspaceScope,
      })
      await reload(conversationId)
      const teamBudget = new AgentTeamBudgetTracker(
        useAIConfigStore.getState().agentTeamBudgetProfile,
      )
      const plan = await createMasterAgentPlan({
        projectId: project.id!,
        scope: workspaceScope,
        worldGroupId,
        request,
        budget: teamBudget,
        signal: controller.signal,
        pinnedTask: options?.pinnedTask,
      })
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'plan',
        content: plan.summary,
        payload: plan,
        scope: workspaceScope,
      })
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'message',
        role: 'assistant',
        content: getT()('agent:chat.backgroundTasksNotice', {
          summary: plan.summary,
          count: plan.tasks.length,
        }),
        scope: workspaceScope,
      })
      await reload(conversationId)

      const durable = workspaceScope && isMasterAgentDurableHarnessEnabledV1()
        ? await runDurableMasterAgentPlanV1({
            scope: workspaceScope,
            worldGroupId,
            conversationId,
            plan,
            budget: teamBudget,
            signal: controller.signal,
            onTask: recordTask,
          })
        : null
      const candidates = durable
        ? null
        : await executeMasterAgentPlan({
            projectId: project.id!,
            scope: workspaceScope,
            worldGroupId,
            plan,
            budget: teamBudget,
            signal: controller.signal,
            onTask: recordTask,
          })
      if (!durable) {
        for (const candidate of candidates ?? []) {
          const event = await appendAgentEvent({
            projectId: project.id!,
            conversationId,
            kind: 'candidate',
            content: candidate.draft,
            payload: candidate.payload,
            scope: workspaceScope,
          })
          runtimeCandidates.current.set(event.id!, candidate)
        }
      } else {
        for (const candidate of durable.candidates) {
          if (candidate.event.id != null && candidate.runtime) {
            runtimeCandidates.current.set(candidate.event.id, candidate.runtime)
          }
        }
      }
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'message',
        role: 'assistant',
        content: [
          getT()('agent:chat.completionCandidates', {
            count: durable?.candidates.length ?? candidates?.length ?? 0,
          }),
          getT()('agent:chat.completionBudget', {
            used: teamBudget.snapshot().usedTokens.toLocaleString(),
            max: teamBudget.snapshot().maxTokens.toLocaleString(),
            calls: teamBudget.snapshot().calls,
            retries: teamBudget.snapshot().semanticRetries,
          }),
        ].join(' '),
        scope: workspaceScope,
      })
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = errorMessage(error)
        setError(message)
        await appendAgentEvent({
          projectId: project.id!,
          conversationId,
          kind: 'error',
          content: message,
          scope: workspaceScope,
        })
        await appendAgentEvent({
          projectId: project.id!,
          conversationId,
          kind: 'message',
          role: 'assistant',
          content: getT()('agent:chat.roundFailed', { message }),
          scope: workspaceScope,
        })
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setActiveRequest(null)
      releaseMasterCopilotScope(scopeKey, scopeOwner)
      setBusy(MASTER_COPILOT_SCOPE_OWNERS.has(scopeKey))
      await reload(conversationId)
      setRecoveryAvailable(workspaceScope
        ? await findResumableMasterAgentRunV1({
            scope: workspaceScope,
            conversationId,
          }) != null
        : false)
      notifyMasterCopilotSync(scopeKey)
    }
  }, [
    authorRequest,
    busy,
    conversationId,
    pendingCandidates.length,
    project.id,
    recordTask,
    reload,
    scopeKey,
    worldGroupId,
    workspaceScope,
  ])

  const submit = useCallback(() => submitRequest(), [submitRequest])

  const submitTargetedRequest = useCallback((
    request: string,
    pinnedTask: PinnedMasterAgentTaskV1,
  ) => submitRequest(request, { pinnedTask }), [submitRequest])

  const resume = useCallback(async () => {
    if (busy || conversationId == null || !workspaceScope) return
    const runId = await findResumableMasterAgentRunV1({
      scope: workspaceScope,
      conversationId,
    })
    if (runId == null) {
      setRecoveryAvailable(false)
      return
    }
    const scopeOwner = claimMasterCopilotScope(scopeKey)
    if (!scopeOwner) return
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    setBusy(true)
    setError(null)
    try {
      const result = await runDurableMasterAgentPlanV1({
        scope: workspaceScope,
        worldGroupId,
        runId,
        signal: controller.signal,
        onTask: recordTask,
      })
      for (const candidate of result.candidates) {
        if (candidate.event.id != null && candidate.runtime) {
          runtimeCandidates.current.set(candidate.event.id, candidate.runtime)
        }
      }
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'message',
        role: 'assistant',
        content: getT()('agent:chat.resumeSuccess', { count: result.candidates.length }),
        scope: workspaceScope,
      })
      setRecoveryAvailable(false)
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(errorMessage(error))
        await appendAgentEvent({
          projectId: project.id!,
          conversationId,
          kind: 'message',
          role: 'assistant',
          content: getT()('agent:chat.resumeFailed', { message: errorMessage(error) }),
          scope: workspaceScope,
        })
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      releaseMasterCopilotScope(scopeKey, scopeOwner)
      setBusy(MASTER_COPILOT_SCOPE_OWNERS.has(scopeKey))
      await reload(conversationId)
      setRecoveryAvailable(await findResumableMasterAgentRunV1({
        scope: workspaceScope,
        conversationId,
      }) != null)
      notifyMasterCopilotSync(scopeKey)
    }
  }, [busy, conversationId, project.id, recordTask, reload, scopeKey, worldGroupId, workspaceScope])

  const updateCandidate = useCallback(async (eventId: number, draft: string) => {
    const previous = candidateUpdateQueues.current.get(eventId)
    const entry: CandidateUpdateQueueEntry = {
      revision: (previous?.revision ?? 0) + 1,
      status: 'updating',
      tail: Promise.resolve(null),
    }
    candidateUpdateQueues.current.set(eventId, entry)
    setCandidateUpdateState(current => ({ ...current, [eventId]: 'updating' }))
    entry.tail = (previous?.tail ?? Promise.resolve(null)).catch(() => null).then(async () => {
      const candidate = pendingCandidates.find(item => item.event.id === eventId)
      if (!candidate) throw new Error(getT()('agent:conversations.candidateNotFound'))
      let creativeArtifact = candidate.payload.creativeArtifact
      if (creativeArtifact && candidate.payload.skillId === 'outline.story-arcs' && candidate.payload.storyArcKind) {
        if (!isStoryArcSnapshot(candidate.payload.baseSnapshot)) {
          throw new Error(getT()('agent:errors.storyArcSnapshotCorrupted'))
        }
        creativeArtifact = revalidateStoryArcCreativeDraftV1({
          draft,
          snapshot: candidate.payload.baseSnapshot,
          kind: candidate.payload.storyArcKind,
          previousArtifact: creativeArtifact,
        })
      } else if (creativeArtifact && candidate.payload.agentId === 'outline' && candidate.payload.outlineMode) {
        if (!isOutlineSnapshot(candidate.payload.baseSnapshot)) {
          throw new Error(getT()('agent:errors.outlineSnapshotCorrupted'))
        }
        creativeArtifact = revalidateOutlineCreativeDraftV1({
          draft,
          snapshot: candidate.payload.baseSnapshot,
          previousArtifact: creativeArtifact,
        })
      } else if (creativeArtifact && candidate.payload.agentId === 'prose' && candidate.payload.informationBoundary) {
        creativeArtifact = revalidateProseCreativeDraftV1({
          draft,
          informationBoundary: candidate.payload.informationBoundary,
          previousArtifact: creativeArtifact,
        })
      }
      const nextPayload = await updateAgentEventCandidate(
        eventId,
        project.id!,
        draft,
        workspaceScope,
        { creativeArtifact },
      )
      setEvents(current => current.map(event => event.id === eventId
        ? { ...event, content: draft, ...(nextPayload ? { payload: nextPayload } : {}) }
        : event))
      if (candidateUpdateQueues.current.get(eventId) === entry) {
        entry.status = 'settled'
        setCandidateUpdateState(current => ({ ...current, [eventId]: 'settled' }))
      }
      setError(null)
      notifyMasterCopilotSync(scopeKey)
      return nextPayload
    }).catch(error => {
      if (candidateUpdateQueues.current.get(eventId) === entry) {
        entry.status = 'failed'
        setCandidateUpdateState(current => ({ ...current, [eventId]: 'failed' }))
      }
      throw error
    })
    try {
      await entry.tail
    } catch (error) {
      setError(errorMessage(error))
    }
  }, [pendingCandidates, project.id, scopeKey, workspaceScope])

  const awaitCandidateUpdateSettled = useCallback(async (eventId: number) => {
    let observedRevision = -1
    while (true) {
      const entry = candidateUpdateQueues.current.get(eventId)
      if (!entry || entry.revision === observedRevision) break
      observedRevision = entry.revision
      try {
        await entry.tail
      } catch {
        throw new Error(getT()('agent:errors.candidateTextPersistencePending'))
      }
      const latest = candidateUpdateQueues.current.get(eventId)
      if (latest?.status === 'failed') throw new Error(getT()('agent:errors.candidateTextPersistenceFailed'))
    }
  }, [])

  const resolveCandidate = useCallback(async (
    candidate: PendingMasterCandidate,
    decision: 'adopted' | 'rejected',
  ) => {
    if (busy || conversationId == null || candidate.event.id == null) return
    const scopeOwner = claimMasterCopilotScope(scopeKey)
    if (!scopeOwner) return
    setBusy(true)
    setError(null)
    try {
      await awaitCandidateUpdateSettled(candidate.event.id)
      const latestEvent = (await readAgentEvents(conversationId, workspaceScope))
        .find(event => event.id === candidate.event.id)
      if (!latestEvent || latestEvent.kind !== 'candidate') {
        throw new Error(getT()('agent:errors.candidateMissingOrResolved'))
      }
      const classification = classifyMasterCandidate(latestEvent)
      if (classification.kind === 'quarantined') {
        throw new Error(`候选已隔离：${classification.reason}`)
      }
      let message = getT()('agent:chat.candidateRejected')
      let terminalMessage: string | null = null
      const durableCandidate = classification.kind === 'durable'
      if (durableCandidate && workspaceScope == null) {
        throw new Error(getT()('agent:errors.durableCandidateScopeMissing'))
      }
      if (durableCandidate && decision === 'adopted') {
        const adoption = await commitMasterAgentCandidateAdoptionV1({
          scope: workspaceScope!,
          runId: classification.runId,
          candidateEventId: latestEvent.id!,
          runtime: runtimeCandidates.current.get(latestEvent.id!),
        })
        message = adoption.message
        // The verifier only accepts a run while every step is in the running
        // join state.  An earlier adoption can leave sibling candidates
        // awaiting confirmation, so defer terminal verification until the
        // durable adoption has actually made the run ready.
        if (adoption.snapshot.projection.state === 'running') {
          const verification = await verifyMasterAgentRunV1({
            scope: workspaceScope!,
            runId: classification.runId,
          })
          if (verification.accepted) {
            // Keep the business-adoption message stable for existing callers and
            // surface terminal verification as a separate auditable event.
            terminalMessage = '本轮所有步骤均已通过终态校验。'
          } else if (!verification.codes.includes('run-not-ready')) {
            message = `${message} 终态校验未通过：${verification.codes.join('、')}。`
          }
        }
      } else if (durableCandidate) {
        await rejectMasterAgentCandidateV1({
          scope: workspaceScope!,
          runId: classification.runId,
          candidateEventId: latestEvent.id!,
        }, getT()('agent:chat.candidateRejected'))
      } else if (decision === 'adopted') {
        message = await adoptMasterCandidate({
          projectId: project.id!,
          scope: workspaceScope,
          worldGroupId,
          event: latestEvent,
          payload: classification.payload,
          draft: latestEvent.content,
          runtime: runtimeCandidates.current.get(latestEvent.id!),
        })
      }
      if (!durableCandidate) {
        await appendAgentEvent({
          projectId: project.id!,
          conversationId,
          kind: 'confirmation',
          content: message,
          payload: { candidateEventId: latestEvent.id, decision },
          scope: workspaceScope,
        })
      }
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'message',
        role: 'assistant',
        content: message,
        scope: workspaceScope,
      })
      if (terminalMessage) {
        await appendAgentEvent({
          projectId: project.id!,
          conversationId,
          kind: 'message',
          role: 'assistant',
          content: terminalMessage,
          scope: workspaceScope,
        })
      }
      runtimeCandidates.current.delete(latestEvent.id!)
      return true
    } catch (error) {
      setError(errorMessage(error))
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'message',
        role: 'assistant',
        content: errorMessage(error),
        scope: workspaceScope,
      })
      return false
    } finally {
      releaseMasterCopilotScope(scopeKey, scopeOwner)
      setBusy(MASTER_COPILOT_SCOPE_OWNERS.has(scopeKey))
      await reload(conversationId)
      setRecoveryAvailable(workspaceScope
        ? await findResumableMasterAgentRunV1({
            scope: workspaceScope,
            conversationId,
          }) != null
        : false)
      notifyMasterCopilotSync(scopeKey)
    }
  }, [awaitCandidateUpdateSettled, busy, conversationId, project.id, reload, scopeKey, workspaceScope, worldGroupId])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  return {
    authorRequest,
    activeRequest,
    setAuthorRequest,
    events,
    pendingCandidates,
    quarantinedCandidates,
    candidateUpdateState,
    busy,
    loading,
    recoveryAvailable,
    error,
    submit,
    submitRequest,
    submitTargetedRequest,
    resume,
    stop,
    updateCandidate,
    adoptCandidate: (candidate: PendingMasterCandidate) => resolveCandidate(candidate, 'adopted'),
    rejectCandidate: (candidate: PendingMasterCandidate) => resolveCandidate(candidate, 'rejected'),
  }
}

export type MasterCopilotController = ReturnType<typeof useMasterCopilot>
