import Dexie from 'dexie'
import { db } from '../db/schema'
import { getT } from '../../i18n'
import type {
  AgentConversation,
  AgentEvent,
  AgentEventKind,
} from '../types'
import {
  assertRecordInScope,
  readOwnedRows,
  resolveScope,
  scopeTransactionTables,
  stampNewRecord,
} from '../world-engine/scope'
import type { WorkspaceScope } from '../types/world-ownership'
import { hashCanonicalValue } from './run/hash'
import {
  appendPrivilegedAgentRunEventInTransactionV1,
  readVerifiedAgentRunInTransactionV1,
} from './run/event-store'
import { parseAgentRunEventV1 } from './run/event-schema'
import type { MasterCandidatePayload } from './orchestrator'
import { DOMAIN_AGENT_IDS } from './skill-registry'
import { parseCreativeArtifactV1, type CreativeArtifactV1 } from './creative-reliability'
import {
  contextManifestHashForStepAttemptV1,
  createMasterCandidateStepReceiptV1,
} from './run/master-step-verification'

const candidateUpdateQueues = new Map<number, Promise<string | null>>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExplicitDurableCandidateIdentity(payload: Record<string, unknown>): boolean {
  // Legacy orchestrator candidates always carry dependencyBindings.  Durable
  // routing requires the explicit run/candidate identity markers instead.
  return ['runId', 'runStepId', 'candidateHash', 'runGeneration']
    .some(key => Object.prototype.hasOwnProperty.call(payload, key))
}

function isMasterCandidatePayload(value: unknown): value is MasterCandidatePayload {
  if (!isRecord(value)) return false
  return value.version === 1
    && typeof value.taskId === 'string'
    && value.taskId.trim().length > 0
    && typeof value.agentId === 'string'
    && DOMAIN_AGENT_IDS.some(agentId => agentId === value.agentId)
    && typeof value.label === 'string'
    && value.label.trim().length > 0
    && Array.isArray(value.contextSources)
    && value.contextSources.every(source => typeof source === 'string')
    && Object.prototype.hasOwnProperty.call(value, 'baseSnapshot')
}

function isValidDurableBinding(
  event: AgentEvent,
  payload: Record<string, unknown>,
): payload is Record<string, unknown> & {
  taskId: string
  runId: number
  runStepId: string
  candidateHash: string
} {
  if (
    typeof payload.runId !== 'number'
    || !Number.isInteger(payload.runId)
    || payload.runId < 1
    || typeof payload.runStepId !== 'string'
    || !payload.runStepId.trim()
    || typeof payload.taskId !== 'string'
    || payload.runStepId !== `master:${payload.taskId}`
    || typeof payload.candidateHash !== 'string'
    || !/^[a-f0-9]{64}$/.test(payload.candidateHash)
  ) return false
  if (
    (Object.prototype.hasOwnProperty.call(payload, 'runGeneration')
      !== Object.prototype.hasOwnProperty.call(payload, 'dependencyBindings'))
    || (
      Object.prototype.hasOwnProperty.call(payload, 'runGeneration')
      && (
        typeof payload.runGeneration !== 'number'
        || !Number.isInteger(payload.runGeneration)
        || payload.runGeneration < 1
      )
    )
    || (
      Object.prototype.hasOwnProperty.call(payload, 'dependencyBindings')
      && !Array.isArray(payload.dependencyBindings)
    )
    || (
      Array.isArray(payload.dependencyBindings)
      && payload.dependencyBindings.some(binding => {
        if (!isRecord(binding)) return true
        if (
          typeof binding.taskId !== 'string'
          || !binding.taskId.trim()
          || typeof binding.outputHash !== 'string'
          || !/^[a-f0-9]{64}$/.test(binding.outputHash)
        ) return true
        return [binding.candidateHash, binding.verificationReceiptHash]
          .some(hash => hash !== undefined && (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)))
          || (
            binding.generation !== undefined
            && (
              typeof binding.generation !== 'number'
              || !Number.isInteger(binding.generation)
              || binding.generation < 1
            )
          )
      })
    )
  ) return false
  return event.durableRunId == null || event.durableRunId === payload.runId
}

export async function getOrCreateAgentConversation(input: {
  projectId: number
  worldGroupId: number | null
  purpose?: string
  title?: string
  scope?: WorkspaceScope
}): Promise<AgentConversation> {
  const scope = input.scope ?? await resolveScope({ projectId: input.projectId })
  const purpose = input.purpose?.trim() || undefined
  const rows = await readOwnedRows<AgentConversation>(scope, 'agentConversations', { owner: 'work' })
  const current = rows
    .filter(row => (
      row.status === 'active'
      && (row.worldGroupId ?? null) === input.worldGroupId
      && (purpose ? row.purpose === purpose : row.purpose == null)
    ))
    .sort((left, right) => right.updatedAt - left.updatedAt)[0]
  if (current) return current

  const now = Date.now()
  const row = stampNewRecord(scope, 'agentConversations', {
    projectId: input.projectId,
    worldGroupId: input.worldGroupId,
    purpose,
    title: input.title?.trim() || getT()('agent:conversations.defaultTitle'),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }, { owner: 'work' }) as AgentConversation
  const id = await db.agentConversations.add(row) as number
  return { ...row, id }
}

export async function readAgentEvents(conversationId: number, scope?: WorkspaceScope): Promise<AgentEvent[]> {
  const conversation = await db.agentConversations.get(conversationId)
  if (!conversation) return []
  const resolved = scope ?? await resolveScope({ projectId: conversation.projectId })
  if (!await assertRecordInScope(resolved, 'agentConversations', conversation, { owner: 'work' })) return []
  const events = await db.agentEvents
    .where('conversationId')
    .equals(conversationId)
    .sortBy('sequence')
  const owned: AgentEvent[] = []
  for (const event of events) {
    if (await assertRecordInScope(resolved, 'agentEvents', event, { owner: 'work' })) owned.push(event)
  }
  return owned
}

export async function appendAgentEvent(input: {
  projectId: number
  conversationId: number
  durableRunId?: number | null
  kind: AgentEventKind
  role?: AgentEvent['role']
  content: string
  payload?: unknown
  scope?: WorkspaceScope
}): Promise<AgentEvent> {
  const scope = input.scope ?? await resolveScope({ projectId: input.projectId })
  return db.transaction('rw', db.agentConversations, db.agentEvents, async () => {
    const conversation = await db.agentConversations.get(input.conversationId)
    if (!conversation || !await assertRecordInScope(scope, 'agentConversations', conversation, { owner: 'work' })) {
      throw new Error(getT()('agent:conversations.notFound'))
    }
    const candidates = await db.agentEvents
      .where('conversationId')
      .equals(input.conversationId)
      .toArray()
    const existing: AgentEvent[] = []
    for (const event of candidates) {
      if (await assertRecordInScope(scope, 'agentEvents', event, { owner: 'work' })) existing.push(event)
    }
    const sequence = existing.reduce((max, event) => Math.max(max, event.sequence), 0) + 1
    const createdAt = Date.now()
    const event = stampNewRecord(scope, 'agentEvents', {
      projectId: input.projectId,
      conversationId: input.conversationId,
      durableRunId: input.durableRunId ?? null,
      sequence,
      kind: input.kind,
      role: input.role,
      content: input.content,
      payload: JSON.stringify(input.payload ?? {}),
      createdAt,
    }, { owner: 'work' }) as AgentEvent
    const id = await db.agentEvents.add(event) as number
    await db.agentConversations.update(input.conversationId, {
      updatedAt: createdAt,
      ...(conversation.title === '创作对话' && input.role === 'user'
        ? { title: input.content.trim().slice(0, 40) || conversation.title }
        : {}),
    })
    return { ...event, id }
  })
}

export async function updateAgentEventCandidate(
  eventId: number,
  projectId: number,
  content: string,
  scope?: WorkspaceScope,
  options?: { creativeArtifact?: CreativeArtifactV1; refreshOutputHash?: boolean },
): Promise<string | null> {
  const resolvedScope = scope ?? await resolveScope({ projectId })
  const previous = candidateUpdateQueues.get(eventId) ?? Promise.resolve<string | null>(null)
  const next: Promise<string | null> = previous.catch(() => null).then(async () => {
    const event = await db.agentEvents.get(eventId)
    if (
      !event
      || !await assertRecordInScope(resolvedScope, 'agentEvents', event, { owner: 'work' })
      || event.kind !== 'candidate'
    ) throw new Error(getT()('agent:conversations.candidateNotFound'))

    let payload: Record<string, unknown> | null = null
    try {
      const parsed = JSON.parse(event.payload) as unknown
      if (isRecord(parsed)) payload = parsed
    } catch {
      payload = null
    }
    if (payload && Object.prototype.hasOwnProperty.call(payload, 'creativeArtifact')) {
      payload = {
        ...payload,
        creativeArtifact: parseCreativeArtifactV1(payload.creativeArtifact),
      }
    }
    if (payload && options?.creativeArtifact) {
      payload = {
        ...payload,
        creativeArtifact: parseCreativeArtifactV1(options.creativeArtifact),
      }
    }
    if (payload && options?.refreshOutputHash) {
      if (typeof payload.outputHash !== 'string') throw new Error('该候选不支持刷新 outputHash。')
      payload = { ...payload, outputHash: await hashCanonicalValue(content) }
    }

    // A durable marker is never treated as a legacy candidate.  Read and
    // validate it inside the serialized operation so an older hash cannot win.
    const eventHasDurableRun = event.durableRunId !== undefined && event.durableRunId !== null
    if (eventHasDurableRun && !payload) {
      throw new Error('durable 候选 payload 缺失，已隔离。')
    }
    if (payload && (eventHasDurableRun || hasExplicitDurableCandidateIdentity(payload))) {
      if (!isMasterCandidatePayload(payload) || !isValidDurableBinding(event, payload)) {
        throw new Error('durable 候选证据损坏，已隔离。')
      }
      const previousCandidateHash = payload.candidateHash
      const { candidateHash: _oldHash, semanticReview: _staleSemanticReview, ...withoutHash } = payload
      const candidateHash = await hashCanonicalValue({ draft: content, payload: withoutHash })
      const revisedPayload = { ...withoutHash, candidateHash }
      const revisedCandidatePayload = isMasterCandidatePayload(revisedPayload)
        ? revisedPayload
        : null
      if (!revisedCandidatePayload) throw new Error('durable 候选 payload 损坏，已隔离。')
      const nextPayload = JSON.stringify(revisedPayload)
      await db.transaction(
        'rw',
        scopeTransactionTables(db.agentEvents, db.agentRuns, db.agentRunEvents),
        async () => {
          let snapshot = await readVerifiedAgentRunInTransactionV1(resolvedScope, event.durableRunId ?? payload!.runId)
          const stepId = payload!.runStepId
          const step = snapshot.projection.steps[stepId]
          if (!step || step.status !== 'awaiting_confirmation' || step.candidateHash !== previousCandidateHash) {
            throw new Error('待更新的 durable 候选不在等待确认状态。')
          }
          if (step.verificationReceiptHash) {
            const staleEvent = parseAgentRunEventV1({
              version: 1,
              runId: snapshot.run.id,
              sequence: snapshot.projection.lastSequence + 1,
              generation: snapshot.projection.generation,
              projectId: snapshot.run.projectId,
              worldGroupId: snapshot.run.worldGroupId ?? null,
              contractHash: snapshot.run.contractHash,
              type: 'step.verification.staled',
              createdAt: Date.now(),
              payload: {
                stepId,
                previousReceiptHash: step.verificationReceiptHash,
                reason: 'author_revised_candidate',
              },
            })
            snapshot = await appendPrivilegedAgentRunEventInTransactionV1(snapshot, staleEvent)
          }
          const runEvent = parseAgentRunEventV1({
            version: 1,
            runId: snapshot.run.id,
            sequence: snapshot.projection.lastSequence + 1,
            generation: snapshot.projection.generation,
            projectId: snapshot.run.projectId,
            worldGroupId: snapshot.run.worldGroupId ?? null,
            contractHash: snapshot.run.contractHash,
            type: 'candidate.revised',
            createdAt: Date.now(),
            payload: {
              stepId,
              attempt: step.attempt,
              previousCandidateHash,
              candidateHash,
            },
          })
          snapshot = await appendPrivilegedAgentRunEventInTransactionV1(snapshot, runEvent)
          await db.agentEvents.update(eventId, { content, payload: nextPayload })
          const contextManifestHash = contextManifestHashForStepAttemptV1(snapshot, stepId, step.attempt)
          const semanticReviewRequired = snapshot.contract.candidateSemanticReviewPolicy
            ?.taskIds.includes(payload!.taskId) === true
          if (
            snapshot.contract.dependencyReceiptPolicy?.requiredForJoin
            && contextManifestHash
            && !semanticReviewRequired
          ) {
            let receipt = null
            try {
              receipt = await Dexie.waitFor(createMasterCandidateStepReceiptV1({
                payload: revisedCandidatePayload,
                draft: content,
                attempt: step.attempt,
                contextManifestHash,
                acceptedAt: Date.now(),
                verifierSetVersion: snapshot.contract.dependencyReceiptPolicy.verifierSetVersion,
              }))
            } catch {
              // Invalid author edits remain editable candidates but cannot feed a downstream join.
            }
            if (receipt) {
              const acceptedEvent = parseAgentRunEventV1({
                version: 1,
                runId: snapshot.run.id,
                sequence: snapshot.projection.lastSequence + 1,
                generation: snapshot.projection.generation,
                projectId: snapshot.run.projectId,
                worldGroupId: snapshot.run.worldGroupId ?? null,
                contractHash: snapshot.run.contractHash,
                type: 'step.verification.accepted',
                createdAt: Date.now(),
                payload: { receipt },
              })
              await appendPrivilegedAgentRunEventInTransactionV1(snapshot, acceptedEvent)
            }
          }
        },
      )
      return nextPayload
    }

    const nextPayload = payload ? JSON.stringify(payload) : null
    await db.agentEvents.update(eventId, {
      content,
      ...(nextPayload ? { payload: nextPayload } : {}),
    })
    return nextPayload
  })
  candidateUpdateQueues.set(eventId, next)
  void next.then(
    () => { if (candidateUpdateQueues.get(eventId) === next) candidateUpdateQueues.delete(eventId) },
    () => { if (candidateUpdateQueues.get(eventId) === next) candidateUpdateQueues.delete(eventId) },
  )
  return next
}
