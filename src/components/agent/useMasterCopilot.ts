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
  type MasterCandidatePayload,
} from '../../lib/agent/orchestrator'
import type { AgentEvent, Project } from '../../lib/types'
import { parseAgentEventPayload } from '../../lib/types'
import { AgentTeamBudgetTracker } from '../../lib/agent/team-budget'
import { useAIConfigStore } from '../../stores/ai-config'
import i18n, { getT } from '../../i18n'

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return getT()('agent:errors.operationFailed')
}

export interface PendingMasterCandidate {
  event: AgentEvent
  payload: MasterCandidatePayload
}

export function useMasterCopilot(input: {
  project: Project
  worldGroupId: number | null
}) {
  const { project, worldGroupId } = input
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [authorRequest, setAuthorRequest] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  const runtimeCandidates = useRef(new Map<number, ExecutedMasterCandidate>())
  const scopeKey = `${project.id}:${worldGroupId ?? 'global'}`

  const reload = useCallback(async (id: number) => {
    setEvents(await readAgentEvents(id))
  }, [])

  useEffect(() => {
    let active = true
    abortRef.current?.abort()
    runtimeCandidates.current.clear()
    setBusy(false)
    setLoading(true)
    void (async () => {
      const conversation = await getOrCreateAgentConversation({
        projectId: project.id!,
        worldGroupId,
      })
      if (!active) return
      setConversationId(conversation.id!)
      let rows = await readAgentEvents(conversation.id!)
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
        })
        rows = await readAgentEvents(conversation.id!)
      }
      if (active) {
        setEvents(rows)
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
  }, [project.id, scopeKey, worldGroupId])

  const pendingCandidates = useMemo(() => {
    const resolved = new Set<number>()
    events.filter(event => event.kind === 'confirmation').forEach(event => {
      const payload = parseAgentEventPayload<{ candidateEventId?: number }>(event, {})
      if (typeof payload.candidateEventId === 'number') resolved.add(payload.candidateEventId)
    })
    return events
      .filter(event => event.kind === 'candidate' && event.id != null && !resolved.has(event.id))
      .map(event => ({
        event,
        payload: parseAgentEventPayload<MasterCandidatePayload>(event, {
          version: 1,
          taskId: '',
          agentId: 'character',
          label: getT()('agent:chat.candidateFallbackLabel'),
          contextSources: [],
          baseSnapshot: {},
        }),
      }))
  }, [events])

  const submit = useCallback(async () => {
    const request = authorRequest.trim()
    if (!request || busy || conversationId == null) return
    if (pendingCandidates.length) return
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    setBusy(true)
    setAuthorRequest('')
    try {
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'message',
        role: 'user',
        content: request,
      })
      await reload(conversationId)
      const teamBudget = new AgentTeamBudgetTracker(
        useAIConfigStore.getState().agentTeamBudgetProfile,
      )
      const plan = await createMasterAgentPlan({
        projectId: project.id!,
        worldGroupId,
        request,
        budget: teamBudget,
        signal: controller.signal,
      })
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'plan',
        content: plan.summary,
        payload: plan,
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
      })
      await reload(conversationId)

      let taskQueue = Promise.resolve()
      const candidates = await executeMasterAgentPlan({
        projectId: project.id!,
        worldGroupId,
        plan,
        budget: teamBudget,
        signal: controller.signal,
        onTask: (task, status, error) => {
          taskQueue = taskQueue.then(async () => {
            await appendAgentEvent({
              projectId: project.id!,
              conversationId,
              kind: 'task',
              content: error || task.instruction,
              payload: { taskId: task.id, agentId: task.agentId, status, error },
            })
          })
        },
      })
      await taskQueue
      for (const candidate of candidates) {
        const event = await appendAgentEvent({
          projectId: project.id!,
          conversationId,
          kind: 'candidate',
          content: candidate.draft,
          payload: candidate.payload,
        })
        runtimeCandidates.current.set(event.id!, candidate)
      }
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'message',
        role: 'assistant',
        content: [
          getT()('agent:chat.completionCandidates', { count: candidates.length }),
          getT()('agent:chat.completionBudget', {
            used: teamBudget.snapshot().usedTokens.toLocaleString(),
            max: teamBudget.snapshot().maxTokens.toLocaleString(),
            calls: teamBudget.snapshot().calls,
            retries: teamBudget.snapshot().semanticRetries,
          }),
        ].join(' '),
      })
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = errorMessage(error)
        await appendAgentEvent({
          projectId: project.id!,
          conversationId,
          kind: 'error',
          content: message,
        })
        await appendAgentEvent({
          projectId: project.id!,
          conversationId,
          kind: 'message',
          role: 'assistant',
          content: getT()('agent:chat.roundFailed', { message }),
        })
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setBusy(false)
      await reload(conversationId)
    }
  }, [
    authorRequest,
    busy,
    conversationId,
    pendingCandidates.length,
    project.id,
    reload,
    worldGroupId,
  ])

  const updateCandidate = useCallback(async (eventId: number, draft: string) => {
    await updateAgentEventCandidate(eventId, project.id!, draft)
    setEvents(current => current.map(event => event.id === eventId ? { ...event, content: draft } : event))
  }, [project.id])

  const resolveCandidate = useCallback(async (
    candidate: PendingMasterCandidate,
    decision: 'adopted' | 'rejected',
  ) => {
    if (busy || conversationId == null || candidate.event.id == null) return
    setBusy(true)
    try {
      let message = getT()('agent:chat.candidateRejected')
      if (decision === 'adopted') {
        message = await adoptMasterCandidate({
          projectId: project.id!,
          worldGroupId,
          event: candidate.event,
          payload: candidate.payload,
          draft: candidate.event.content,
          runtime: runtimeCandidates.current.get(candidate.event.id),
        })
      }
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'confirmation',
        content: message,
        payload: { candidateEventId: candidate.event.id, decision },
      })
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'message',
        role: 'assistant',
        content: message,
      })
      runtimeCandidates.current.delete(candidate.event.id)
    } catch (error) {
      await appendAgentEvent({
        projectId: project.id!,
        conversationId,
        kind: 'message',
        role: 'assistant',
        content: errorMessage(error),
      })
    } finally {
      setBusy(false)
      await reload(conversationId)
    }
  }, [busy, conversationId, project.id, reload, worldGroupId])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  return {
    authorRequest,
    setAuthorRequest,
    events,
    pendingCandidates,
    busy,
    loading,
    submit,
    stop,
    updateCandidate,
    adoptCandidate: (candidate: PendingMasterCandidate) => resolveCandidate(candidate, 'adopted'),
    rejectCandidate: (candidate: PendingMasterCandidate) => resolveCandidate(candidate, 'rejected'),
  }
}
