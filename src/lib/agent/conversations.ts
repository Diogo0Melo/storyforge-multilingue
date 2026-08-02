import { db } from '../db/schema'
import type {
  AgentConversation,
  AgentEvent,
  AgentEventKind,
} from '../types'
import i18n from '../../i18n/i18n'

/** Persisted sentinel — do NOT translate. Used for auto-rename logic comparison. */
const DEFAULT_CONVERSATION_TITLE = '创作对话'

export async function getOrCreateAgentConversation(input: {
  projectId: number
  worldGroupId: number | null
}): Promise<AgentConversation> {
  const rows = await db.agentConversations
    .where('projectId')
    .equals(input.projectId)
    .toArray()
  const current = rows
    .filter(row => row.status === 'active' && (row.worldGroupId ?? null) === input.worldGroupId)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0]
  if (current) return current

  const now = Date.now()
  const row: AgentConversation = {
    projectId: input.projectId,
    worldGroupId: input.worldGroupId,
    title: DEFAULT_CONVERSATION_TITLE,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
  const id = await db.agentConversations.add(row) as number
  return { ...row, id }
}

export async function readAgentEvents(conversationId: number): Promise<AgentEvent[]> {
  return db.agentEvents
    .where('conversationId')
    .equals(conversationId)
    .sortBy('sequence')
}

export async function appendAgentEvent(input: {
  projectId: number
  conversationId: number
  kind: AgentEventKind
  role?: AgentEvent['role']
  content: string
  payload?: unknown
}): Promise<AgentEvent> {
  return db.transaction('rw', db.agentConversations, db.agentEvents, async () => {
    const conversation = await db.agentConversations.get(input.conversationId)
    if (!conversation || conversation.projectId !== input.projectId) {
      throw new Error(i18n.t('common:errors.agent.agentConversationNotFound'))
    }
    const existing = await db.agentEvents
      .where('conversationId')
      .equals(input.conversationId)
      .toArray()
    const sequence = existing.reduce((max, event) => Math.max(max, event.sequence), 0) + 1
    const createdAt = Date.now()
    const event: AgentEvent = {
      projectId: input.projectId,
      conversationId: input.conversationId,
      sequence,
      kind: input.kind,
      role: input.role,
      content: input.content,
      payload: JSON.stringify(input.payload ?? {}),
      createdAt,
    }
    const id = await db.agentEvents.add(event) as number
    await db.agentConversations.update(input.conversationId, {
      updatedAt: createdAt,
      ...(conversation.title === DEFAULT_CONVERSATION_TITLE && input.role === 'user'
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
): Promise<void> {
  const event = await db.agentEvents.get(eventId)
  if (!event || event.projectId !== projectId || event.kind !== 'candidate') {
    throw new Error(i18n.t('common:errors.agent.agentCandidateNotFound'))
  }
  await db.agentEvents.update(eventId, { content })
}
