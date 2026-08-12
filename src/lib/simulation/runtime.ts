import { getT } from '../../i18n'
import { db } from '../db/schema'
import { transactionTablesForReferences } from '../registry/lifecycle'
import {
  EMPTY_SIMULATION_STATE,
  RUNTIME_ENTITY_KINDS,
  RUNTIME_LIFECYCLE_STATUSES,
  SIMULATION_EVENT_TYPES,
  SIMULATION_SESSION_KINDS,
  type RuntimeAttributes,
  type RuntimeEntityState,
  type RuntimeMemory,
  type SimulationCheckpoint,
  type SimulationEvent,
  type SimulationEventType,
  type SimulationNpcEvolutionCandidate,
  type SimulationNpcEvolutionProposal,
  type SimulationRuntimeState,
  type SimulationSession,
  type SimulationSessionKind,
  type SimulationTtrpgAction,
  type SimulationTtrpgAttackResult,
  type SimulationTtrpgCheck,
  type SimulationTtrpgCheckRequest,
  type SimulationTtrpgCombatant,
  type SimulationTtrpgCondition,
  type SimulationTtrpgCampaignState,
  type SimulationChatIdentity,
  type SimulationChatScene,
  type SimulationChatState,
  type SimulationChatMessage,
  type SimulationTtrpgEncounter,
  type SimulationTtrpgEncounterCandidate,
  type SimulationTtrpgNpcSchedule,
  type SimulationTtrpgQuest,
  SIMULATION_TTRPG_QUEST_STATUSES,
  type SimulationTtrpgQuestStatus,
  type SimulationTtrpgResource,
  type SimulationTtrpgScene,
  type SimulationTtrpgState,
  type SimulationTtrpgTurnCandidate,
} from '../types'

type JsonObject = Record<string, unknown>

export interface CreateSimulationSessionInput {
  projectId: number
  worldGroupId?: number | null
  kind: SimulationSessionKind
  title: string
  seed?: string
  canonSnapshot?: unknown
  initialState?: SimulationRuntimeState
}

export interface DiceResolution {
  expression: string
  dice: number[]
  modifier: number
  total: number
  nonce: string
}

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseJsonObject(value: string, label: string): JsonObject {
  try {
    const parsed = JSON.parse(value)
    if (!isObject(parsed)) throw new Error(getT()('simulation:runtime.json.mustBeObject', { label: label }))
    return parsed
  } catch (error) {
    if (error instanceof Error && error.message.endsWith(getT()('simulation:runtime.json.mustBeObject', { label: '' }).slice(1))) throw error
    throw new Error(getT()('simulation:runtime.json.invalid', { label: label }))
  }
}

function assertFiniteInteger(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new Error(getT()('simulation:runtime.validation.finiteInteger', { label: label, min: min, max: max }))
  }
  return Number(value)
}

function assertRuntimeAttributes(value: unknown): RuntimeAttributes {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.attributes.mustBeObject'))
  const result: RuntimeAttributes = {}
  for (const [key, raw] of Object.entries(value)) {
    if (!key.trim() || key.length > 80) throw new Error(getT()('simulation:runtime.attributes.keyInvalid'))
    if (raw !== null && !['string', 'number', 'boolean'].includes(typeof raw)) {
      throw new Error(getT()('simulation:runtime.attributes.scalarOnly', { key: key }))
    }
    if (typeof raw === 'number' && !Number.isFinite(raw)) {
      throw new Error(getT()('simulation:runtime.attributes.notFinite', { key: key }))
    }
    result[key] = raw as RuntimeAttributes[string]
  }
  return result
}

function assertRuntimeEntity(value: unknown): RuntimeEntityState {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.entity.mustBeObject'))
  const entityKey = String(value.entityKey ?? '').trim()
  const name = String(value.name ?? '').trim()
  const kind = String(value.kind ?? '')
  const lifecycleStatus = String(value.lifecycleStatus ?? '')
  if (!entityKey || entityKey.length > 160) throw new Error(getT()('simulation:runtime.entity.missingEntityKey'))
  if (!name || name.length > 200) throw new Error(getT()('simulation:runtime.entity.missingName'))
  if (!RUNTIME_ENTITY_KINDS.includes(kind as RuntimeEntityState['kind'])) {
    throw new Error(getT()('simulation:runtime.entity.unknownKind', { kind: kind }))
  }
  if (!RUNTIME_LIFECYCLE_STATUSES.includes(lifecycleStatus as RuntimeEntityState['lifecycleStatus'])) {
    throw new Error(getT()('simulation:runtime.entity.unknownLifecycle', { lifecycleStatus: lifecycleStatus }))
  }
  const sourceId = value.sourceId == null
    ? null
    : assertFiniteInteger(value.sourceId, 'sourceId', 1, Number.MAX_SAFE_INTEGER)
  const locationKey = value.locationKey == null ? null : String(value.locationKey).trim() || null
  return {
    entityKey,
    kind: kind as RuntimeEntityState['kind'],
    sourceId,
    name,
    locationKey,
    lifecycleStatus: lifecycleStatus as RuntimeEntityState['lifecycleStatus'],
    attributes: assertRuntimeAttributes(value.attributes ?? {}),
  }
}

function assertRuntimeMemory(value: unknown): RuntimeMemory {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.memory.mustBeObject'))
  const id = String(value.id ?? '').trim()
  const subjectKey = String(value.subjectKey ?? '').trim()
  const content = String(value.content ?? '').trim()
  const status = String(value.status ?? '')
  if (!id || id.length > 160) throw new Error(getT()('simulation:runtime.memory.missingId'))
  if (!subjectKey || subjectKey.length > 160) throw new Error(getT()('simulation:runtime.memory.missingSubject'))
  if (!content || content.length > 4_000) throw new Error(getT()('simulation:runtime.memory.contentInvalid'))
  if (!['known', 'mistaken', 'forgotten'].includes(status)) {
    throw new Error(getT()('simulation:runtime.memory.unknownStatus', { status: status }))
  }
  return {
    id,
    subjectKey,
    content,
    status: status as RuntimeMemory['status'],
    sourceEventSequence: assertFiniteInteger(
      value.sourceEventSequence,
      'sourceEventSequence',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
  }
}

export function isNpcRuntimeEntity(entity: RuntimeEntityState): boolean {
  return entity.kind === 'npc'
    || (entity.kind === 'character' && (
      entity.attributes.role === 'npc'
      || entity.attributes.roleWeight === 'npc'
    ))
}

export function parseSimulationNpcEvolutionCandidate(
  value: unknown,
): SimulationNpcEvolutionCandidate {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.npc.candidateMustBeObject'))
  const allowed = new Set([
    'baseSequence',
    'entityKey',
    'locationKey',
    'lifecycleStatus',
    'attributes',
    'narrative',
    'memory',
    'rationale',
  ])
  const unknown = Object.keys(value).filter(key => !allowed.has(key))
  if (unknown.length) throw new Error(getT()('simulation:runtime.npc.candidateUnknownFields', { fields: unknown.join(', ') }))
  const entityKey = String(value.entityKey ?? '').trim()
  if (!entityKey || entityKey.length > 160) throw new Error(getT()('simulation:runtime.npc.candidateMissingEntity'))
  const rawLocationKey = value.locationKey
  if (rawLocationKey != null && typeof rawLocationKey !== 'string') {
    throw new Error(getT()('simulation:runtime.npc.locationMustBeEntityOrNull'))
  }
  const locationKey = typeof rawLocationKey === 'string'
    ? rawLocationKey.trim() || null
    : null
  const lifecycleStatus = String(value.lifecycleStatus ?? '')
  if (!RUNTIME_LIFECYCLE_STATUSES.includes(lifecycleStatus as RuntimeEntityState['lifecycleStatus'])) {
    throw new Error(getT()('simulation:runtime.npc.unknownLifecycle', { lifecycleStatus: lifecycleStatus }))
  }
  const narrative = String(value.narrative ?? '').trim()
  if (narrative.length > 20_000) throw new Error(getT()('simulation:runtime.npc.narrativeTooLong'))
  const rationale = String(value.rationale ?? '').trim()
  if (rationale.length > 4_000) throw new Error(getT()('simulation:runtime.npc.rationaleTooLong'))
  let memory: SimulationNpcEvolutionCandidate['memory'] = null
  if (value.memory != null) {
    if (!isObject(value.memory)) throw new Error(getT()('simulation:runtime.npc.memoryMustBeObjectOrNull'))
    const status = String(value.memory.status ?? '')
    const content = String(value.memory.content ?? '').trim()
    if (!['known', 'mistaken', 'forgotten'].includes(status)) {
      throw new Error(getT()('simulation:runtime.npc.unknownMemoryStatus', { status: status }))
    }
    if (!content || content.length > 4_000) throw new Error(getT()('simulation:runtime.npc.memoryContentInvalid'))
    memory = { status: status as RuntimeMemory['status'], content }
  }
  return {
    baseSequence: assertFiniteInteger(
      value.baseSequence,
      getT()('simulation:runtime.labels.npcEvolutionBaselineSequence'),
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    entityKey,
    locationKey,
    lifecycleStatus: lifecycleStatus as RuntimeEntityState['lifecycleStatus'],
    attributes: assertRuntimeAttributes(value.attributes ?? {}),
    narrative,
    memory,
    rationale,
  }
}

function prepareNpcEvolution(
  state: SimulationRuntimeState,
  candidate: SimulationNpcEvolutionCandidate,
): RuntimeEntityState {
  const existing = state.entities[candidate.entityKey]
  if (!existing) throw new Error(getT()('simulation:runtime.npc.targetEntityNotFound', { entityKey: candidate.entityKey }))
  if (!isNpcRuntimeEntity(existing)) throw new Error(getT()('simulation:runtime.npc.targetNotNpc'))
  if (candidate.locationKey != null) {
    const location = state.entities[candidate.locationKey]
    if (!location || location.kind !== 'location') {
      throw new Error(getT()('simulation:runtime.npc.targetLocationNotFound', { locationKey: candidate.locationKey }))
    }
  }
  const next = assertRuntimeEntity({
    ...existing,
    locationKey: candidate.locationKey,
    lifecycleStatus: candidate.lifecycleStatus,
    attributes: { ...existing.attributes, ...candidate.attributes },
  })
  const attributesChanged = Object.entries(candidate.attributes)
    .some(([key, child]) => existing.attributes[key] !== child)
  if (
    next.locationKey === existing.locationKey
    && next.lifecycleStatus === existing.lifecycleStatus
    && !attributesChanged
    && !candidate.narrative
    && !candidate.memory
  ) throw new Error(getT()('simulation:runtime.npc.noChange'))
  return next
}

function applyNpcEvolution(
  state: SimulationRuntimeState,
  candidate: SimulationNpcEvolutionCandidate,
  eventSequence: number,
): void {
  state.entities[candidate.entityKey] = prepareNpcEvolution(state, candidate)
  if (candidate.narrative) {
    state.narratives.push({ eventSequence, text: candidate.narrative })
  }
  if (candidate.memory) {
    state.memories.push({
      id: `npc-evolution:${eventSequence}:${candidate.entityKey}`,
      subjectKey: candidate.entityKey,
      status: candidate.memory.status,
      content: candidate.memory.content,
      sourceEventSequence: eventSequence,
    })
  }
}

function assertTtrpgScene(value: unknown): SimulationTtrpgScene {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.ttrpg.sceneMustBeObject'))
  const sceneId = String(value.sceneId ?? '').trim()
  const title = String(value.title ?? '').trim()
  const description = String(value.description ?? '').trim()
  const locationKey = value.locationKey == null ? null : String(value.locationKey).trim() || null
  const status = String(value.status ?? 'active')
  if (!sceneId || sceneId.length > 160) throw new Error(getT()('simulation:runtime.ttrpg.sceneMissingId'))
  if (!title || title.length > 200) throw new Error(getT()('simulation:runtime.ttrpg.sceneTitleInvalid'))
  if (description.length > 8_000) throw new Error(getT()('simulation:runtime.ttrpg.sceneDescriptionTooLong'))
  if (status !== 'active' && status !== 'resolved') throw new Error(getT()('simulation:runtime.ttrpg.sceneStatusInvalid'))
  return { sceneId, title, description, locationKey, status: status as SimulationTtrpgScene['status'] }
}

function assertTtrpgAction(value: unknown): SimulationTtrpgAction {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.ttrpg.actionMustBeObject'))
  const eventSequence = assertFiniteInteger(value.eventSequence, getT()('simulation:runtime.labels.ttrpgActionEventSequence'), 1, Number.MAX_SAFE_INTEGER)
  const actorKey = String(value.actorKey ?? '').trim()
  const text = String(value.text ?? '').trim()
  if (!actorKey || actorKey.length > 160) throw new Error(getT()('simulation:runtime.ttrpg.actionMissingActor'))
  if (!text || text.length > 4_000) throw new Error(getT()('simulation:runtime.ttrpg.actionTextInvalid'))
  return { eventSequence, actorKey, text }
}

function assertTtrpgCheck(value: unknown): SimulationTtrpgCheck {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.ttrpg.checkMustBeObject'))
  const eventSequence = assertFiniteInteger(value.eventSequence, getT()('simulation:runtime.labels.ttrpgCheckEventSequence'), 1, Number.MAX_SAFE_INTEGER)
  const actorKey = String(value.actorKey ?? '').trim()
  const skill = String(value.skill ?? '').trim()
  const expression = String(value.expression ?? '').trim()
  const dc = assertFiniteInteger(value.dc, getT()('simulation:runtime.labels.checkDc'), 0, 1_000)
  const dice = value.dice
  if (!actorKey || actorKey.length > 160) throw new Error(getT()('simulation:runtime.ttrpg.checkMissingActor'))
  if (!skill || skill.length > 120) throw new Error(getT()('simulation:runtime.ttrpg.checkSkillInvalid'))
  if (!Array.isArray(dice)) throw new Error(getT()('simulation:runtime.ttrpg.checkMissingDice'))
  const parsed = parseDiceExpression(expression)
  if (dice.length !== parsed.count) throw new Error(getT()('simulation:runtime.ttrpg.checkDiceCountMismatch'))
  const normalizedDice = dice.map(die => assertFiniteInteger(die, getT()('simulation:runtime.labels.checkDiceValue'), 1, parsed.sides))
  const modifier = Number(value.modifier)
  const total = Number(value.total)
  const success = value.success
  if (modifier !== parsed.modifier || total !== normalizedDice.reduce((sum, die) => sum + die, modifier)) {
    throw new Error(getT()('simulation:runtime.ttrpg.checkTotalMismatch'))
  }
  if (success !== (total >= dc)) throw new Error(getT()('simulation:runtime.ttrpg.checkSuccessMismatch'))
  return {
    eventSequence,
    actorKey,
    skill,
    expression: parsed.normalized,
    dice: normalizedDice,
    modifier,
    total,
    dc,
    success: Boolean(success),
  }
}

function assertTtrpgResource(value: unknown): SimulationTtrpgResource {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.ttrpg.resourceMustBeObject'))
  const current = assertFiniteInteger(value.current, getT()('simulation:runtime.labels.resourceCurrent'), 0, 1_000_000_000)
  const maximum = assertFiniteInteger(value.maximum, getT()('simulation:runtime.labels.resourceMaximum'), 1, 1_000_000_000)
  if (current > maximum) throw new Error(getT()('simulation:runtime.ttrpg.resourceCurrentExceedsMax'))
  return { current, maximum }
}

function assertTtrpgCondition(value: unknown): SimulationTtrpgCondition {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.ttrpg.conditionMustBeObject'))
  const conditionId = String(value.conditionId ?? '').trim()
  const name = String(value.name ?? '').trim()
  const description = String(value.description ?? '').trim()
  const duration = value.duration == null
    ? null
    : assertFiniteInteger(value.duration, getT()('simulation:runtime.labels.conditionDurationRounds'), 0, 1_000_000)
  const stacks = assertFiniteInteger(value.stacks ?? 1, getT()('simulation:runtime.labels.conditionStacks'), 1, 1_000)
  if (!conditionId || conditionId.length > 160) throw new Error(getT()('simulation:runtime.ttrpg.conditionMissingId'))
  if (!name || name.length > 120) throw new Error(getT()('simulation:runtime.ttrpg.conditionNameInvalid'))
  if (description.length > 2_000) throw new Error(getT()('simulation:runtime.ttrpg.conditionDescriptionTooLong'))
  return { conditionId, name, description, duration, stacks }
}

function assertTtrpgCombatant(value: unknown): SimulationTtrpgCombatant {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.ttrpg.combatantMustBeObject'))
  const entityKey = String(value.entityKey ?? '').trim()
  const initiative = assertFiniteInteger(value.initiative, getT()('simulation:runtime.labels.initiative'), 0, 1_000)
  const armorClass = assertFiniteInteger(value.armorClass, getT()('simulation:runtime.labels.armorClass'), 0, 1_000)
  if (!entityKey || entityKey.length > 160) throw new Error(getT()('simulation:runtime.ttrpg.combatantMissingEntityKey'))
  if (!isObject(value.resources)) throw new Error(getT()('simulation:runtime.ttrpg.combatResourcesMustBeObject'))
  const resources: Record<string, SimulationTtrpgResource> = {}
  for (const [key, resource] of Object.entries(value.resources)) {
    if (!key.trim() || key.length > 80) throw new Error(getT()('simulation:runtime.ttrpg.combatResourceKeyInvalid'))
    resources[key] = assertTtrpgResource(resource)
  }
  if (!resources.hp) throw new Error(getT()('simulation:runtime.ttrpg.combatantMissingHp'))
  if (!Array.isArray(value.conditions)) throw new Error(getT()('simulation:runtime.ttrpg.combatConditionsMustBeArray'))
  const conditions = value.conditions.map(assertTtrpgCondition)
  if (new Set(conditions.map(condition => condition.conditionId)).size !== conditions.length) {
    throw new Error(getT()('simulation:runtime.ttrpg.combatConditionsDuplicate'))
  }
  return { entityKey, initiative, armorClass, resources, conditions }
}

function assertTtrpgEncounter(value: unknown): SimulationTtrpgEncounter {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.ttrpg.encounterMustBeObject'))
  const encounterId = String(value.encounterId ?? '').trim()
  const title = String(value.title ?? '').trim()
  const description = String(value.description ?? '').trim()
  const status = String(value.status ?? 'active')
  const round = assertFiniteInteger(value.round, getT()('simulation:runtime.labels.combatRound'), 1, Number.MAX_SAFE_INTEGER)
  const activeActorKey = value.activeActorKey == null ? null : String(value.activeActorKey).trim() || null
  if (!encounterId || encounterId.length > 160) throw new Error(getT()('simulation:runtime.ttrpg.encounterMissingId'))
  if (!title || title.length > 200) throw new Error(getT()('simulation:runtime.ttrpg.encounterTitleInvalid'))
  if (description.length > 8_000) throw new Error(getT()('simulation:runtime.ttrpg.encounterDescriptionTooLong'))
  if (status !== 'active' && status !== 'resolved') throw new Error(getT()('simulation:runtime.ttrpg.encounterStatusInvalid'))
  if (!Array.isArray(value.turnOrder) || value.turnOrder.length === 0) throw new Error(getT()('simulation:runtime.ttrpg.encounterRequiresTurnOrder'))
  const turnOrder = value.turnOrder.map(raw => String(raw).trim())
  if (turnOrder.some(key => !key || key.length > 160) || new Set(turnOrder).size !== turnOrder.length) {
    throw new Error(getT()('simulation:runtime.ttrpg.encounterTurnOrderInvalidOrDuplicate'))
  }
  if (activeActorKey != null && !turnOrder.includes(activeActorKey)) throw new Error(getT()('simulation:runtime.ttrpg.encounterActiveActorNotInTurnOrder'))
  if (!isObject(value.combatants)) throw new Error(getT()('simulation:runtime.ttrpg.encounterMissingCombatants'))
  const combatants: Record<string, SimulationTtrpgCombatant> = {}
  for (const [key, raw] of Object.entries(value.combatants)) {
    const combatant = assertTtrpgCombatant(raw)
    if (combatant.entityKey !== key) throw new Error(getT()('simulation:runtime.ttrpg.encounterCombatantIndexMismatch', { key: key }))
    combatants[key] = combatant
  }
  if (turnOrder.some(key => !combatants[key]) || Object.keys(combatants).some(key => !turnOrder.includes(key))) {
    throw new Error(getT()('simulation:runtime.ttrpg.encounterTurnOrderCombatantMismatch'))
  }
  return { encounterId, title, description, status: status as SimulationTtrpgEncounter['status'], round, activeActorKey, turnOrder, combatants }
}

function assertTtrpgAttackResult(value: unknown): SimulationTtrpgAttackResult {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.ttrpg.attackMustBeObject'))
  const actorKey = String(value.actorKey ?? '').trim()
  const targetKey = String(value.targetKey ?? '').trim()
  const attackExpression = String(value.attackExpression ?? '').trim()
  const damageExpression = value.damageExpression == null ? null : String(value.damageExpression).trim() || null
  const resourceKey = String(value.resourceKey ?? 'hp').trim()
  const reason = String(value.reason ?? '').trim()
  if (!actorKey || !targetKey || actorKey.length > 160 || targetKey.length > 160) throw new Error(getT()('simulation:runtime.ttrpg.attackMissingActorOrTarget'))
  const attack = parseDiceExpression(attackExpression)
  const attackDice = value.attackDice
  if (!Array.isArray(attackDice) || attackDice.length !== attack.count) throw new Error(getT()('simulation:runtime.ttrpg.attackDiceCountMismatch'))
  const normalizedAttackDice = attackDice.map(die => assertFiniteInteger(die, getT()('simulation:runtime.labels.attackDiceValue'), 1, attack.sides))
  const attackModifier = Number(value.attackModifier)
  const attackTotal = Number(value.attackTotal)
  const armorClass = assertFiniteInteger(value.armorClass, getT()('simulation:runtime.labels.armorClass'), 0, 1_000)
  const hit = value.hit
  if (attackModifier !== attack.modifier || attackTotal !== normalizedAttackDice.reduce((sum, die) => sum + die, attackModifier)) {
    throw new Error(getT()('simulation:runtime.ttrpg.attackTotalMismatch'))
  }
  if (hit !== (attackTotal >= armorClass)) throw new Error(getT()('simulation:runtime.ttrpg.attackHitMismatch'))
  let normalizedDamageExpression: string | null = null
  let damageDice: number[] = []
  let damageModifier = 0
  const damageTotal = Number(value.damageTotal ?? 0)
  if (damageExpression) {
    const damage = parseDiceExpression(damageExpression)
    if (!Array.isArray(value.damageDice) || value.damageDice.length !== damage.count) throw new Error(getT()('simulation:runtime.ttrpg.damageDiceCountMismatch'))
    damageDice = value.damageDice.map(die => assertFiniteInteger(die, getT()('simulation:runtime.labels.damageDiceValue'), 1, damage.sides))
    damageModifier = Number(value.damageModifier)
    if (damageModifier !== damage.modifier || damageTotal !== damageDice.reduce((sum, die) => sum + die, damageModifier)) {
      throw new Error(getT()('simulation:runtime.ttrpg.damageTotalMismatch'))
    }
    if (damageTotal < 0) throw new Error(getT()('simulation:runtime.ttrpg.damageTotalNegative'))
    normalizedDamageExpression = damage.normalized
  } else if (damageTotal !== 0 || (Array.isArray(value.damageDice) && value.damageDice.length > 0)) {
    throw new Error(getT()('simulation:runtime.ttrpg.damageWithoutExpression'))
  }
  const resourceDelta = assertFiniteInteger(value.resourceDelta, getT()('simulation:runtime.labels.resourceDelta'), -1_000_000_000, 1_000_000_000)
  if (!hit && (damageTotal !== 0 || resourceDelta !== 0)) throw new Error(getT()('simulation:runtime.ttrpg.missCannotDealDamage'))
  if (hit && resourceDelta !== -damageTotal) throw new Error(getT()('simulation:runtime.ttrpg.resourceDeltaMustEqualNegativeDamage'))
  if (!resourceKey || resourceKey.length > 80) throw new Error(getT()('simulation:runtime.ttrpg.attackResourceKeyInvalid'))
  if (reason.length > 2_000) throw new Error(getT()('simulation:runtime.ttrpg.attackReasonTooLong'))
  return { actorKey, targetKey, attackExpression: attack.normalized, attackDice: normalizedAttackDice, attackModifier, attackTotal, armorClass, hit: Boolean(hit), damageExpression: normalizedDamageExpression, damageDice, damageModifier, damageTotal, resourceKey, resourceDelta, reason }
}

function emptyTtrpgState(): SimulationTtrpgState {
  return {
    scene: null,
    round: 0,
    activeActorKey: null,
    turnOrder: [],
    actions: [],
    checks: [],
    attacks: [],
    encounter: null,
    campaign: emptyTtrpgCampaignState(),
  }
}

function parseTtrpgState(value: unknown): SimulationTtrpgState | null {
  if (value == null) return null
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.ttrpg.stateMustBeObjectOrNull'))
  const scene = value.scene == null ? null : assertTtrpgScene(value.scene)
  const round = assertFiniteInteger(value.round, getT()('simulation:runtime.labels.ttrpgRound'), 0, Number.MAX_SAFE_INTEGER)
  const activeActorKey = value.activeActorKey == null ? null : String(value.activeActorKey).trim() || null
  if (!Array.isArray(value.turnOrder)) throw new Error(getT()('simulation:runtime.ttrpg.turnOrderMustBeArray'))
  const turnOrder = value.turnOrder.map(raw => String(raw).trim())
  if (turnOrder.some(key => !key || key.length > 160) || new Set(turnOrder).size !== turnOrder.length) {
    throw new Error(getT()('simulation:runtime.ttrpg.turnOrderInvalidOrDuplicate'))
  }
  if (activeActorKey != null && !turnOrder.includes(activeActorKey)) throw new Error(getT()('simulation:runtime.ttrpg.activeActorNotInTurnOrder'))
  if (!Array.isArray(value.actions) || !Array.isArray(value.checks)) throw new Error(getT()('simulation:runtime.ttrpg.actionsAndChecksMustBeArrays'))
  if (value.attacks != null && !Array.isArray(value.attacks)) throw new Error(getT()('simulation:runtime.ttrpg.attacksMustBeArray'))
  return {
    scene,
    round,
    activeActorKey,
    turnOrder,
    actions: value.actions.map(assertTtrpgAction),
    checks: value.checks.map(assertTtrpgCheck),
    attacks: (value.attacks ?? []).map(assertTtrpgAttackResult),
    encounter: value.encounter == null ? null : assertTtrpgEncounter(value.encounter),
    campaign: parseTtrpgCampaignState(value.campaign),
  }
}

function emptyTtrpgCampaignState(): SimulationTtrpgCampaignState {
  return { summary: '', quests: [], npcSchedules: [] }
}

function assertTtrpgQuest(value: unknown): SimulationTtrpgQuest {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.ttrpg.questMustBeObject'))
  const questId = String(value.questId ?? '').trim()
  const title = String(value.title ?? '').trim()
  const description = String(value.description ?? '').trim()
  const status = String(value.status ?? '') as SimulationTtrpgQuestStatus
  if (!questId || questId.length > 160) throw new Error(getT()('simulation:runtime.ttrpg.questIdInvalid'))
  if (!title || title.length > 240) throw new Error(getT()('simulation:runtime.ttrpg.questTitleInvalid'))
  if (description.length > 8_000) throw new Error(getT()('simulation:runtime.ttrpg.questDescriptionTooLong'))
  if (!SIMULATION_TTRPG_QUEST_STATUSES.includes(status)) throw new Error(getT()('simulation:runtime.ttrpg.questUnknownStatus', { status: status }))
  const dueClock = value.dueClock == null ? null : assertFiniteInteger(value.dueClock, getT()('simulation:runtime.labels.questDueClock'), 0, Number.MAX_SAFE_INTEGER)
  return {
    questId,
    title,
    description,
    status,
    priority: assertFiniteInteger(value.priority ?? 0, getT()('simulation:runtime.labels.questPriority'), 0, 5),
    dueClock,
    updatedSequence: assertFiniteInteger(value.updatedSequence, getT()('simulation:runtime.labels.questUpdatedSequence'), 1, Number.MAX_SAFE_INTEGER),
  }
}

function assertTtrpgNpcSchedule(value: unknown): SimulationTtrpgNpcSchedule {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.ttrpg.scheduleMustBeObject'))
  const scheduleId = String(value.scheduleId ?? '').trim()
  const entityKey = String(value.entityKey ?? '').trim()
  const activity = String(value.activity ?? '').trim()
  const recurrence = String(value.recurrence ?? 'once')
  if (!scheduleId || scheduleId.length > 160) throw new Error(getT()('simulation:runtime.ttrpg.scheduleIdInvalid'))
  if (!entityKey || entityKey.length > 160) throw new Error(getT()('simulation:runtime.ttrpg.scheduleMissingNpc'))
  if (!activity || activity.length > 2_000) throw new Error(getT()('simulation:runtime.ttrpg.scheduleActivityInvalid'))
  if (!['once', 'daily', 'weekly'].includes(recurrence)) throw new Error(getT()('simulation:runtime.ttrpg.scheduleUnknownRecurrence', { recurrence: recurrence }))
  const startClock = assertFiniteInteger(value.startClock, getT()('simulation:runtime.labels.npcScheduleStartClock'), 0, Number.MAX_SAFE_INTEGER)
  const endClock = value.endClock == null ? null : assertFiniteInteger(value.endClock, getT()('simulation:runtime.labels.npcScheduleEndClock'), startClock, Number.MAX_SAFE_INTEGER)
  const locationKey = value.locationKey == null ? null : String(value.locationKey).trim() || null
  return {
    scheduleId,
    entityKey,
    startClock,
    endClock,
    locationKey,
    activity,
    recurrence: recurrence as SimulationTtrpgNpcSchedule['recurrence'],
    updatedSequence: assertFiniteInteger(value.updatedSequence, getT()('simulation:runtime.labels.scheduleUpdatedSequence'), 1, Number.MAX_SAFE_INTEGER),
  }
}

function parseTtrpgCampaignState(value: unknown): SimulationTtrpgCampaignState {
  if (value == null) return emptyTtrpgCampaignState()
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.ttrpg.campaignMustBeObject'))
  const summary = String(value.summary ?? '').trim()
  if (summary.length > 20_000) throw new Error(getT()('simulation:runtime.ttrpg.campaignSummaryTooLong'))
  if (!Array.isArray(value.quests) || !Array.isArray(value.npcSchedules)) {
    throw new Error(getT()('simulation:runtime.ttrpg.campaignQuestsAndSchedulesMustBeArrays'))
  }
  const quests = value.quests.map(assertTtrpgQuest)
  const npcSchedules = value.npcSchedules.map(assertTtrpgNpcSchedule)
  if (new Set(quests.map(quest => quest.questId)).size !== quests.length) throw new Error(getT()('simulation:runtime.ttrpg.questIdDuplicate'))
  if (new Set(npcSchedules.map(schedule => schedule.scheduleId)).size !== npcSchedules.length) throw new Error(getT()('simulation:runtime.ttrpg.scheduleIdDuplicate'))
  return { summary, quests, npcSchedules }
}

function assertChatIdentity(value: unknown): SimulationChatIdentity {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.chat.identityMustBeObject'))
  const name = String(value.name ?? '').trim()
  const description = String(value.description ?? '').trim()
  if (!name || name.length > 160) throw new Error(getT()('simulation:runtime.chat.identityNameInvalid'))
  if (description.length > 2_000) throw new Error(getT()('simulation:runtime.chat.identityDescriptionTooLong'))
  return { name, description }
}

function assertChatScene(value: unknown): SimulationChatScene {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.chat.sceneMustBeObject'))
  const title = String(value.title ?? '').trim()
  const description = String(value.description ?? '').trim()
  if (!title || title.length > 200) throw new Error(getT()('simulation:runtime.chat.sceneTitleInvalid'))
  if (description.length > 8_000) throw new Error(getT()('simulation:runtime.chat.sceneDescriptionTooLong'))
  return { title, description }
}

function assertChatMessage(value: unknown): SimulationChatMessage {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.chat.messageMustBeObject'))
  const messageId = String(value.messageId ?? '').trim()
  const eventSequence = assertFiniteInteger(value.eventSequence, getT()('simulation:runtime.labels.chatMessageEventSequence'), 1, Number.MAX_SAFE_INTEGER)
  const role = String(value.role ?? '')
  const speakerKey = value.speakerKey == null ? null : String(value.speakerKey).trim() || null
  const text = String(value.text ?? '').trim()
  const replyToSequence = value.replyToSequence == null
    ? null
    : assertFiniteInteger(value.replyToSequence, getT()('simulation:runtime.labels.chatReplyTargetSequence'), 1, Number.MAX_SAFE_INTEGER)
  const supersededBySequence = value.supersededBySequence == null
    ? null
    : assertFiniteInteger(value.supersededBySequence, getT()('simulation:runtime.labels.chatSupersededSequence'), 1, Number.MAX_SAFE_INTEGER)
  if (!messageId || messageId.length > 160) throw new Error(getT()('simulation:runtime.chat.messageIdInvalid'))
  if (role !== 'user' && role !== 'character') throw new Error(getT()('simulation:runtime.chat.messageRoleInvalid'))
  if (role === 'user' && speakerKey != null) throw new Error(getT()('simulation:runtime.chat.userMessageCannotBindCharacter'))
  if (role === 'character' && !speakerKey) throw new Error(getT()('simulation:runtime.chat.characterReplyMissingCharacter'))
  if (!text || text.length > 20_000) throw new Error(getT()('simulation:runtime.chat.messageTextInvalid'))
  if (role === 'user' && replyToSequence != null) throw new Error(getT()('simulation:runtime.chat.userMessageCannotReplyTo'))
  if (role === 'character' && replyToSequence == null) throw new Error(getT()('simulation:runtime.chat.characterReplyMustReferenceUser'))
  return { messageId, eventSequence, role: role as SimulationChatMessage['role'], speakerKey, text, replyToSequence, supersededBySequence }
}

function parseChatState(value: unknown): SimulationChatState | null {
  if (value == null) return null
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.chat.stateMustBeObject'))
  const characterKey = String(value.characterKey ?? '').trim()
  if (!characterKey || characterKey.length > 160) throw new Error(getT()('simulation:runtime.chat.missingCharacter'))
  const identity = assertChatIdentity(value.identity)
  const scene = assertChatScene(value.scene)
  if (!Array.isArray(value.messages)) throw new Error(getT()('simulation:runtime.chat.messagesMustBeArray'))
  const messages = value.messages.map(assertChatMessage)
  if (new Set(messages.map(message => message.messageId)).size !== messages.length) {
    throw new Error(getT()('simulation:runtime.chat.messageIdDuplicate'))
  }
  return { characterKey, identity, scene, messages }
}

function requireChatState(state: SimulationRuntimeState): SimulationChatState {
  if (!state.chat) throw new Error(getT()('simulation:runtime.chat.notConfigured'))
  return state.chat
}

function requireTtrpgState(state: SimulationRuntimeState): SimulationTtrpgState {
  if (!state.ttrpg) state.ttrpg = emptyTtrpgState()
  return state.ttrpg
}

export function parseSimulationTtrpgTurnCandidate(value: unknown): SimulationTtrpgTurnCandidate {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.ttrpg.turnCandidateMustBeObject'))
  const allowed = new Set(['baseSequence', 'actorKey', 'action', 'narrative', 'check', 'outcomes', 'nextActorKey'])
  const unknown = Object.keys(value).filter(key => !allowed.has(key))
  if (unknown.length) throw new Error(getT()('simulation:runtime.ttrpg.turnCandidateUnknownFields', { fields: unknown.join(', ') }))
  const baseSequence = assertFiniteInteger(value.baseSequence, getT()('simulation:runtime.labels.ttrpgTurnCandidateBaselineSequence'), 0, Number.MAX_SAFE_INTEGER)
  const actorKey = String(value.actorKey ?? '').trim()
  const action = String(value.action ?? '').trim()
  const narrative = String(value.narrative ?? '').trim()
  const nextActorKey = value.nextActorKey == null ? null : String(value.nextActorKey).trim() || null
  if (!actorKey || actorKey.length > 160) throw new Error(getT()('simulation:runtime.ttrpg.turnCandidateMissingActor'))
  if (!action || action.length > 4_000) throw new Error(getT()('simulation:runtime.ttrpg.turnCandidateActionInvalid'))
  if (!narrative || narrative.length > 20_000) throw new Error(getT()('simulation:runtime.ttrpg.turnCandidateNarrativeInvalid'))
  let check: SimulationTtrpgCheckRequest | null = null
  if (value.check != null) {
    if (!isObject(value.check)) throw new Error(getT()('simulation:runtime.ttrpg.turnCandidateCheckMustBeObjectOrNull'))
    const skill = String(value.check.skill ?? '').trim()
    const expression = String(value.check.expression ?? '').trim()
    const reason = String(value.check.reason ?? '').trim()
    const dc = assertFiniteInteger(value.check.dc, getT()('simulation:runtime.labels.checkDc'), 0, 1_000)
    parseDiceExpression(expression)
    if (!skill || skill.length > 120) throw new Error(getT()('simulation:runtime.ttrpg.turnCandidateSkillInvalid'))
    if (!reason || reason.length > 1_000) throw new Error(getT()('simulation:runtime.ttrpg.turnCandidateCheckReasonInvalid'))
    check = { skill, expression, dc, reason }
  }
  let outcomes: SimulationTtrpgTurnCandidate['outcomes'] = null
  if (value.outcomes != null) {
    if (!isObject(value.outcomes)) throw new Error(getT()('simulation:runtime.ttrpg.turnCandidateOutcomesMustBeObjectOrNull'))
    const success = String(value.outcomes.success ?? '').trim()
    const failure = String(value.outcomes.failure ?? '').trim()
    if (!success || !failure || success.length > 20_000 || failure.length > 20_000) {
      throw new Error(getT()('simulation:runtime.ttrpg.turnCandidateOutcomesInvalid'))
    }
    outcomes = { success, failure }
  }
  if ((check == null) !== (outcomes == null)) throw new Error(getT()('simulation:runtime.ttrpg.turnCandidateCheckOutcomesPairing'))
  return { baseSequence, actorKey, action, narrative, check, outcomes, nextActorKey }
}

export function parseSimulationState(value: string | SimulationRuntimeState): SimulationRuntimeState {
  const parsed = typeof value === 'string' ? parseJsonObject(value, getT()('simulation:runtime.labels.runtimeStateLabel')) : value
  if (parsed.version !== 1) throw new Error(getT()('simulation:runtime.state.unsupportedVersion'))
  const clock = assertFiniteInteger(parsed.clock, getT()('simulation:runtime.labels.runtimeClock'), 0, Number.MAX_SAFE_INTEGER)
  const lastSequence = assertFiniteInteger(
    parsed.lastSequence,
    'lastSequence',
    0,
    Number.MAX_SAFE_INTEGER,
  )
  if (!isObject(parsed.entities)) throw new Error(getT()('simulation:runtime.state.entitiesMustBeObject'))
  const entities: Record<string, RuntimeEntityState> = {}
  for (const [key, raw] of Object.entries(parsed.entities)) {
    const entity = assertRuntimeEntity(raw)
    if (entity.entityKey !== key) throw new Error(getT()('simulation:runtime.entity.indexMismatch', { key: key }))
    entities[key] = entity
  }
  if (!Array.isArray(parsed.memories)) throw new Error(getT()('simulation:runtime.state.memoriesMustBeArray'))
  if (!Array.isArray(parsed.narratives)) throw new Error(getT()('simulation:runtime.state.narrativesMustBeArray'))
  const memories = parsed.memories.map(assertRuntimeMemory)
  const narratives = parsed.narratives.map(raw => {
    if (!isObject(raw)) throw new Error(getT()('simulation:runtime.narrative.mustBeObject'))
    const text = String(raw.text ?? '').trim()
    if (!text || text.length > 20_000) throw new Error(getT()('simulation:runtime.narrative.textInvalid'))
    return {
      eventSequence: assertFiniteInteger(
        raw.eventSequence,
        'narrative.eventSequence',
        1,
        Number.MAX_SAFE_INTEGER,
      ),
      text,
    }
  })
  return {
    version: 1,
    clock,
    entities,
    memories,
    narratives,
    ttrpg: parseTtrpgState(parsed.ttrpg),
    chat: parseChatState(parsed.chat),
    lastSequence,
  }
}

function cloneState(state: SimulationRuntimeState): SimulationRuntimeState {
  return structuredClone(state)
}

function parseEventPayload(event: SimulationEvent): JsonObject {
  if (!SIMULATION_EVENT_TYPES.includes(event.type)) {
    throw new Error(getT()('simulation:runtime.event.unknownType', { type: event.type }))
  }
  return parseJsonObject(event.payloadJson, getT()('simulation:runtime.labels.simulationEventPayloadLabel', { type: event.type }))
}

export function applySimulationEvent(
  current: SimulationRuntimeState,
  event: SimulationEvent,
): SimulationRuntimeState {
  const state = cloneState(parseSimulationState(current))
  if (event.sequence !== state.lastSequence + 1) {
    throw new Error(getT()('simulation:runtime.event.sequenceGap', { expected: state.lastSequence + 1, received: event.sequence }))
  }
  const payload = parseEventPayload(event)
  switch (event.type) {
    case 'time.advanced': {
      const amount = assertFiniteInteger(payload.amount, getT()('simulation:runtime.labels.timeAdvanceAmount'), 1, 1_000_000_000)
      if (state.clock + amount > Number.MAX_SAFE_INTEGER) throw new Error(getT()('simulation:runtime.state.clockOverflow'))
      state.clock += amount
      break
    }
    case 'entity.upserted': {
      const entity = assertRuntimeEntity(payload.entity)
      state.entities[entity.entityKey] = entity
      break
    }
    case 'entity.patched': {
      const entityKey = String(payload.entityKey ?? '').trim()
      const existing = state.entities[entityKey]
      if (!existing) throw new Error(getT()('simulation:runtime.entity.notFound', { entityKey: entityKey }))
      if (!isObject(payload.patch)) throw new Error(getT()('simulation:runtime.entity.patchMustBeObject'))
      const allowed = new Set(['name', 'locationKey', 'lifecycleStatus', 'attributes'])
      for (const key of Object.keys(payload.patch)) {
        if (!allowed.has(key)) throw new Error(getT()('simulation:runtime.entity.patchForbiddenField', { key: key }))
      }
      state.entities[entityKey] = assertRuntimeEntity({
        ...existing,
        ...payload.patch,
        entityKey,
        kind: existing.kind,
        sourceId: existing.sourceId,
        attributes: payload.patch.attributes == null
          ? existing.attributes
          : { ...existing.attributes, ...assertRuntimeAttributes(payload.patch.attributes) },
      })
      break
    }
    case 'entity.removed': {
      const entityKey = String(payload.entityKey ?? '').trim()
      if (!state.entities[entityKey]) throw new Error(getT()('simulation:runtime.entity.notFound', { entityKey: entityKey }))
      delete state.entities[entityKey]
      break
    }
    case 'memory.recorded': {
      const memory = assertRuntimeMemory(payload.memory)
      if (memory.sourceEventSequence !== event.sequence) {
        throw new Error(getT()('simulation:runtime.memory.selfReferenceRequired'))
      }
      const index = state.memories.findIndex(row => row.id === memory.id)
      if (index >= 0) state.memories[index] = memory
      else state.memories.push(memory)
      break
    }
    case 'random.resolved': {
      assertDiceResolution(payload)
      break
    }
    case 'narrative.recorded': {
      const text = String(payload.text ?? '').trim()
      if (!text || text.length > 20_000) throw new Error(getT()('simulation:runtime.narrative.textInvalid'))
      state.narratives.push({ eventSequence: event.sequence, text })
      break
    }
    case 'chat.session.configured': {
      const characterKey = String(payload.characterKey ?? '').trim()
      const character = state.entities[characterKey]
      if (!character || !['character', 'npc'].includes(character.kind)) {
        throw new Error(getT()('simulation:runtime.chat.characterNotFoundOrUnsupported', { characterKey: characterKey }))
      }
      const identity = assertChatIdentity(payload.identity)
      const scene = assertChatScene(payload.scene)
      const current = state.chat
      if (current && current.messages.length > 0 && current.characterKey !== characterKey) {
        throw new Error(getT()('simulation:runtime.chat.cannotSwitchCharacterWithMessages'))
      }
      state.chat = {
        characterKey,
        identity,
        scene,
        messages: current?.messages ?? [],
      }
      break
    }
    case 'chat.message.recorded': {
      const chat = requireChatState(state)
      if (chat.messages.some(message => message.role === 'user' && message.supersededBySequence == null && message.replyToSequence == null)) {
        const last = chat.messages[chat.messages.length - 1]
        if (last?.role === 'user') throw new Error(getT()('simulation:runtime.chat.previousUserMessageUnreplied'))
      }
      const message = assertChatMessage({
        ...payload,
        eventSequence: event.sequence,
        role: 'user',
        speakerKey: null,
        replyToSequence: null,
        supersededBySequence: null,
      })
      chat.messages.push(message)
      break
    }
    case 'chat.reply.recorded': {
      const chat = requireChatState(state)
      const replyToSequence = assertFiniteInteger(payload.replyToSequence, getT()('simulation:runtime.labels.chatReplyTargetSequence'), 1, event.sequence - 1)
      const target = chat.messages.find(message => message.eventSequence === replyToSequence)
      if (!target || target.role !== 'user') throw new Error(getT()('simulation:runtime.chat.replyMustReferenceCurrentUserMessage'))
      const activeReply = chat.messages.find(message => (
        message.role === 'character'
        && message.replyToSequence === replyToSequence
        && message.supersededBySequence == null
      ))
      const supersedesSequence = payload.supersedesSequence == null
        ? null
        : assertFiniteInteger(payload.supersedesSequence, getT()('simulation:runtime.labels.chatReplySupersedesSequence'), 1, event.sequence - 1)
      if (activeReply && supersedesSequence !== activeReply.eventSequence) {
        throw new Error(getT()('simulation:runtime.chat.existingReplyMustSupersede'))
      }
      if (supersedesSequence != null) {
        const superseded = chat.messages.find(message => message.eventSequence === supersedesSequence)
        if (!superseded || superseded.role !== 'character' || superseded.replyToSequence !== replyToSequence || superseded.supersededBySequence != null) {
          throw new Error(getT()('simulation:runtime.chat.supersededReplyInvalidOrAlreadySuperseded'))
        }
        superseded.supersededBySequence = event.sequence
      }
      const message = assertChatMessage({
        ...payload,
        eventSequence: event.sequence,
        messageId: payload.messageId ?? `chat:${event.sequence}`,
        role: 'character',
        speakerKey: chat.characterKey,
        replyToSequence,
        supersededBySequence: null,
      })
      chat.messages.push(message)
      break
    }
    case 'ttrpg.scene.opened': {
      const ttrpg = requireTtrpgState(state)
      const scene = assertTtrpgScene(payload.scene)
      const rawTurnOrder = payload.turnOrder
      if (!Array.isArray(rawTurnOrder) || rawTurnOrder.length === 0) {
        throw new Error(getT()('simulation:runtime.ttrpg.sceneRequiresAtLeastOneActor'))
      }
      const turnOrder = rawTurnOrder.map(raw => String(raw).trim())
      if (new Set(turnOrder).size !== turnOrder.length) throw new Error(getT()('simulation:runtime.ttrpg.turnOrderCannotDuplicate'))
      for (const actorKey of turnOrder) {
        const actor = state.entities[actorKey]
        if (!actor || !['player', 'character', 'npc'].includes(actor.kind)) {
          throw new Error(getT()('simulation:runtime.ttrpg.actorNotFoundOrUnsupported', { actorKey: actorKey }))
        }
      }
      if (scene.locationKey != null) {
        const location = state.entities[scene.locationKey]
        if (!location || location.kind !== 'location') throw new Error(getT()('simulation:runtime.ttrpg.sceneLocationNotFound', { locationKey: scene.locationKey }))
      }
      ttrpg.scene = scene
      ttrpg.round = 1
      ttrpg.activeActorKey = turnOrder[0]
      ttrpg.turnOrder = turnOrder
      ttrpg.actions = []
      ttrpg.checks = []
      ttrpg.attacks = []
      ttrpg.encounter = null
      break
    }
    case 'ttrpg.action.recorded': {
      const ttrpg = requireTtrpgState(state)
      if (!ttrpg.scene || ttrpg.scene.status !== 'active') throw new Error(getT()('simulation:runtime.ttrpg.requireActiveScene'))
      const action = assertTtrpgAction({
        eventSequence: event.sequence,
        actorKey: payload.actorKey,
        text: payload.text,
      })
      if (!ttrpg.turnOrder.includes(action.actorKey)) throw new Error(getT()('simulation:runtime.ttrpg.actionActorNotInTurnOrder'))
      if (ttrpg.activeActorKey !== action.actorKey) throw new Error(getT()('simulation:runtime.ttrpg.notActorsTurn'))
      ttrpg.actions.push(action)
      break
    }
    case 'ttrpg.check.resolved': {
      const ttrpg = requireTtrpgState(state)
      if (!isObject(payload.check)) throw new Error(getT()('simulation:runtime.ttrpg.checkMissingObject'))
      const check = assertTtrpgCheck({ ...payload.check, eventSequence: event.sequence })
      if (!ttrpg.turnOrder.includes(check.actorKey)) throw new Error(getT()('simulation:runtime.ttrpg.checkActorNotInTurnOrder'))
      ttrpg.checks.push(check)
      break
    }
    case 'ttrpg.gm.response.recorded': {
      const ttrpg = requireTtrpgState(state)
      if (!ttrpg.scene || ttrpg.scene.status !== 'active') throw new Error(getT()('simulation:runtime.ttrpg.requireActiveScene'))
      const actionSequence = assertFiniteInteger(payload.actionSequence, getT()('simulation:runtime.labels.ttrpgActionSequence'), 1, event.sequence - 1)
      if (!ttrpg.actions.some(action => action.eventSequence === actionSequence)) {
        throw new Error(getT()('simulation:runtime.ttrpg.gmNarrativeNoMatchingAction'))
      }
      if (payload.checkSequence != null) {
        const checkSequence = assertFiniteInteger(payload.checkSequence, getT()('simulation:runtime.labels.ttrpgCheckSequence'), 1, event.sequence - 1)
        if (!ttrpg.checks.some(check => check.eventSequence === checkSequence)) {
          throw new Error(getT()('simulation:runtime.ttrpg.gmNarrativeReferencesMissingCheck'))
        }
      }
      const text = String(payload.text ?? '').trim()
      if (!text || text.length > 20_000) throw new Error(getT()('simulation:runtime.ttrpg.gmNarrativeTextInvalid'))
      state.narratives.push({ eventSequence: event.sequence, text })
      break
    }
    case 'ttrpg.turn.advanced': {
      const ttrpg = requireTtrpgState(state)
      if (!ttrpg.scene || ttrpg.scene.status !== 'active') throw new Error(getT()('simulation:runtime.ttrpg.requireActiveScene'))
      const nextActorKey = String(payload.nextActorKey ?? '').trim()
      const round = assertFiniteInteger(payload.round, getT()('simulation:runtime.labels.ttrpgRound'), 1, Number.MAX_SAFE_INTEGER)
      if (!ttrpg.turnOrder.includes(nextActorKey)) throw new Error(getT()('simulation:runtime.ttrpg.nextActorNotInTurnOrder'))
      const currentIndex = ttrpg.turnOrder.indexOf(ttrpg.activeActorKey ?? '')
      const nextIndex = (currentIndex + 1) % ttrpg.turnOrder.length
      const expectedActorKey = ttrpg.turnOrder[nextIndex]
      const expectedRound = ttrpg.round + (nextIndex === 0 ? 1 : 0)
      if (nextActorKey !== expectedActorKey || round !== expectedRound) {
        throw new Error(getT()('simulation:runtime.ttrpg.turnAdvanceMismatch'))
      }
      ttrpg.activeActorKey = nextActorKey
      ttrpg.round = round
      break
    }
    case 'ttrpg.encounter.started': {
      const ttrpg = requireTtrpgState(state)
      if (!ttrpg.scene || ttrpg.scene.status !== 'active') throw new Error(getT()('simulation:runtime.ttrpg.requireSceneFirst'))
      if (ttrpg.encounter?.status === 'active') throw new Error(getT()('simulation:runtime.ttrpg.encounterAlreadyActive'))
      const encounter = assertTtrpgEncounter(payload.encounter)
      for (const actorKey of encounter.turnOrder) {
        const actor = state.entities[actorKey]
        if (!actor || !['player', 'character', 'npc'].includes(actor.kind)) {
          throw new Error(getT()('simulation:runtime.ttrpg.encounterParticipantNotFoundOrUnsupported', { actorKey: actorKey }))
        }
      }
      if (encounter.activeActorKey !== encounter.turnOrder[0]) throw new Error(getT()('simulation:runtime.ttrpg.encounterMustStartWithHighestInitiative'))
      ttrpg.encounter = encounter
      break
    }
    case 'ttrpg.encounter.resolved': {
      const ttrpg = requireTtrpgState(state)
      const encounter = ttrpg.encounter
      if (!encounter || encounter.status !== 'active') throw new Error(getT()('simulation:runtime.ttrpg.noActiveEncounter'))
      const reason = String(payload.reason ?? '').trim()
      if (reason.length > 2_000) throw new Error(getT()('simulation:runtime.ttrpg.encounterEndReasonTooLong'))
      encounter.status = 'resolved'
      encounter.activeActorKey = null
      if (reason) state.narratives.push({ eventSequence: event.sequence, text: getT()('simulation:runtime.ttrpg.encounterEndNarrative', { reason: reason }) })
      break
    }
    case 'ttrpg.combat.attack.resolved': {
      const ttrpg = requireTtrpgState(state)
      const encounter = ttrpg.encounter
      if (!encounter || encounter.status !== 'active') throw new Error(getT()('simulation:runtime.ttrpg.requireActiveEncounter'))
      const attack = assertTtrpgAttackResult(payload.attack)
      if (attack.actorKey !== event.actorKey || attack.targetKey !== event.targetKey) {
        throw new Error(getT()('simulation:runtime.ttrpg.attackActorOrTargetMismatch'))
      }
      if (encounter.activeActorKey !== attack.actorKey) throw new Error(getT()('simulation:runtime.ttrpg.notCombatActorsTurn'))
      if (!encounter.combatants[attack.actorKey] || !encounter.combatants[attack.targetKey]) {
        throw new Error(getT()('simulation:runtime.ttrpg.combatantNotInEncounter'))
      }
      ttrpg.attacks.push(attack)
      break
    }
    case 'ttrpg.combat.resource.changed': {
      const ttrpg = requireTtrpgState(state)
      const encounter = ttrpg.encounter
      if (!encounter || encounter.status !== 'active') throw new Error(getT()('simulation:runtime.ttrpg.requireActiveEncounter'))
      const entityKey = String(payload.entityKey ?? '').trim()
      const resourceKey = String(payload.resourceKey ?? '').trim()
      const delta = assertFiniteInteger(payload.delta, getT()('simulation:runtime.labels.resourceDelta'), -1_000_000_000, 1_000_000_000)
      const combatant = encounter.combatants[entityKey]
      if (!combatant || !resourceKey || resourceKey.length > 80) throw new Error(getT()('simulation:runtime.ttrpg.resourceChangeTargetInvalid'))
      if (event.targetKey !== entityKey) throw new Error(getT()('simulation:runtime.ttrpg.resourceChangeEventTargetMismatch'))
      const resource = combatant.resources[resourceKey]
      if (!resource) throw new Error(getT()('simulation:runtime.ttrpg.combatantMissingResource', { resourceKey: resourceKey }))
      const expectedCurrent = Math.max(0, Math.min(resource.maximum, resource.current + delta))
      const current = assertFiniteInteger(payload.current, getT()('simulation:runtime.labels.resourceCurrent'), 0, resource.maximum)
      if (current !== expectedCurrent) throw new Error(getT()('simulation:runtime.ttrpg.resourceChangeResultMismatch'))
      combatant.resources[resourceKey] = { ...resource, current }
      break
    }
    case 'ttrpg.combat.condition.applied': {
      const ttrpg = requireTtrpgState(state)
      const encounter = ttrpg.encounter
      if (!encounter || encounter.status !== 'active') throw new Error(getT()('simulation:runtime.ttrpg.requireActiveEncounter'))
      const entityKey = String(payload.entityKey ?? '').trim()
      const combatant = encounter.combatants[entityKey]
      if (!combatant) throw new Error(getT()('simulation:runtime.ttrpg.conditionTargetNotInEncounter'))
      if (event.targetKey !== entityKey) throw new Error(getT()('simulation:runtime.ttrpg.conditionEventTargetMismatch'))
      const condition = assertTtrpgCondition(payload.condition)
      const existing = combatant.conditions.find(item => item.conditionId === condition.conditionId)
      if (existing) {
        existing.stacks = Math.min(1_000, existing.stacks + condition.stacks)
        existing.duration = condition.duration
        existing.description = condition.description
      } else {
        combatant.conditions.push(condition)
      }
      break
    }
    case 'ttrpg.combat.condition.removed': {
      const ttrpg = requireTtrpgState(state)
      const encounter = ttrpg.encounter
      if (!encounter || encounter.status !== 'active') throw new Error(getT()('simulation:runtime.ttrpg.requireActiveEncounter'))
      const entityKey = String(payload.entityKey ?? '').trim()
      const conditionId = String(payload.conditionId ?? '').trim()
      const combatant = encounter.combatants[entityKey]
      if (!combatant || !conditionId) throw new Error(getT()('simulation:runtime.ttrpg.conditionRemoveTargetInvalid'))
      if (event.targetKey !== entityKey) throw new Error(getT()('simulation:runtime.ttrpg.conditionEventTargetMismatch'))
      combatant.conditions = combatant.conditions.filter(condition => condition.conditionId !== conditionId)
      break
    }
    case 'ttrpg.combat.turn.advanced': {
      const ttrpg = requireTtrpgState(state)
      const encounter = ttrpg.encounter
      if (!encounter || encounter.status !== 'active') throw new Error(getT()('simulation:runtime.ttrpg.requireActiveEncounter'))
      const nextActorKey = String(payload.nextActorKey ?? '').trim()
      const round = assertFiniteInteger(payload.round, getT()('simulation:runtime.labels.combatRound'), 1, Number.MAX_SAFE_INTEGER)
      if (!encounter.turnOrder.includes(nextActorKey)) throw new Error(getT()('simulation:runtime.ttrpg.nextCombatActorNotInEncounter'))
      const currentIndex = encounter.turnOrder.indexOf(encounter.activeActorKey ?? '')
      const nextIndex = (currentIndex + 1) % encounter.turnOrder.length
      const expectedActorKey = encounter.turnOrder[nextIndex]
      const expectedRound = encounter.round + (nextIndex === 0 ? 1 : 0)
      if (nextActorKey !== expectedActorKey || round !== expectedRound) throw new Error(getT()('simulation:runtime.ttrpg.combatTurnAdvanceMismatch'))
      const leaving = encounter.activeActorKey ? encounter.combatants[encounter.activeActorKey] : null
      if (leaving) {
        leaving.conditions = leaving.conditions
          .map(condition => condition.duration == null ? condition : { ...condition, duration: condition.duration - 1 })
          .filter(condition => condition.duration == null || condition.duration > 0)
      }
      encounter.activeActorKey = nextActorKey
      encounter.round = round
      break
    }
    case 'ttrpg.campaign.summary.updated': {
      const ttrpg = requireTtrpgState(state)
      const baseSequence = assertFiniteInteger(payload.baseSequence, getT()('simulation:runtime.labels.campaignSummaryBaselineSequence'), 0, event.sequence - 1)
      if (baseSequence !== event.sequence - 1) throw new Error(getT()('simulation:runtime.ttrpg.campaignSummaryBaseMismatch'))
      const summary = String(payload.summary ?? '').trim()
      if (summary.length > 20_000) throw new Error(getT()('simulation:runtime.ttrpg.campaignSummaryTooLong'))
      ttrpg.campaign = ttrpg.campaign ?? emptyTtrpgCampaignState()
      ttrpg.campaign.summary = summary
      break
    }
    case 'ttrpg.campaign.quest.upserted': {
      const ttrpg = requireTtrpgState(state)
      const quest = assertTtrpgQuest(payload.quest)
      if (quest.updatedSequence !== event.sequence) throw new Error(getT()('simulation:runtime.ttrpg.questUpdatedSequenceMismatch'))
      ttrpg.campaign = ttrpg.campaign ?? emptyTtrpgCampaignState()
      const index = ttrpg.campaign.quests.findIndex(item => item.questId === quest.questId)
      if (index >= 0) ttrpg.campaign.quests[index] = quest
      else ttrpg.campaign.quests.push(quest)
      break
    }
    case 'ttrpg.campaign.schedule.upserted': {
      const ttrpg = requireTtrpgState(state)
      const schedule = assertTtrpgNpcSchedule(payload.schedule)
      if (schedule.updatedSequence !== event.sequence) throw new Error(getT()('simulation:runtime.ttrpg.scheduleUpdatedSequenceMismatch'))
      const npc = state.entities[schedule.entityKey]
      if (!npc || !isNpcRuntimeEntity(npc)) throw new Error(getT()('simulation:runtime.ttrpg.scheduleTargetNotNpc'))
      if (schedule.locationKey != null) {
        const location = state.entities[schedule.locationKey]
        if (!location || location.kind !== 'location') throw new Error(getT()('simulation:runtime.ttrpg.scheduleLocationNotRuntimeLocation'))
      }
      ttrpg.campaign = ttrpg.campaign ?? emptyTtrpgCampaignState()
      const index = ttrpg.campaign.npcSchedules.findIndex(item => item.scheduleId === schedule.scheduleId)
      if (index >= 0) ttrpg.campaign.npcSchedules[index] = schedule
      else ttrpg.campaign.npcSchedules.push(schedule)
      break
    }
    case 'npc.evolution.proposed': {
      const candidate = parseSimulationNpcEvolutionCandidate(payload.candidate)
      if (candidate.baseSequence !== state.lastSequence) {
        throw new Error(getT()('simulation:runtime.npc.baseMismatch'))
      }
      prepareNpcEvolution(state, candidate)
      break
    }
    case 'npc.evolution.accepted': {
      const proposalSequence = assertFiniteInteger(
        payload.proposalSequence,
        getT()('simulation:runtime.labels.npcEvolutionProposalSequence'),
        1,
        event.sequence - 1,
      )
      if (state.lastSequence !== proposalSequence) {
        throw new Error(getT()('simulation:runtime.npc.candidateExpired'))
      }
      const candidate = parseSimulationNpcEvolutionCandidate(payload.candidate)
      if (candidate.baseSequence !== proposalSequence - 1) {
        throw new Error(getT()('simulation:runtime.npc.candidateProposalMismatch'))
      }
      applyNpcEvolution(state, candidate, event.sequence)
      break
    }
    case 'npc.evolution.rejected': {
      assertFiniteInteger(
        payload.proposalSequence,
        getT()('simulation:runtime.labels.npcEvolutionProposalSequence'),
        1,
        event.sequence - 1,
      )
      const reason = String(payload.reason ?? '').trim()
      if (reason.length > 1_000) throw new Error(getT()('simulation:runtime.npc.rejectReasonTooLong'))
      break
    }
  }
  state.lastSequence = event.sequence
  return state
}

export function replaySimulationEvents(
  initialState: SimulationRuntimeState,
  events: readonly SimulationEvent[],
  throughSequence = Number.MAX_SAFE_INTEGER,
): SimulationRuntimeState {
  let state = cloneState(parseSimulationState(initialState))
  const ordered = [...events]
    .filter(event => event.sequence <= throughSequence)
    .sort((a, b) => a.sequence - b.sequence)
  for (const event of ordered) state = applySimulationEvent(state, event)
  return state
}

async function assertSessionScope(input: {
  projectId: number
  worldGroupId?: number | null
}): Promise<void> {
  if (!await db.projects.get(input.projectId)) throw new Error(getT()('simulation:runtime.session.projectNotFound'))
  if (input.worldGroupId != null) {
    const world = await db.worldGroups.get(input.worldGroupId)
    if (!world || world.projectId !== input.projectId) {
      throw new Error(getT()('simulation:runtime.session.worldNotFoundOrMismatch'))
    }
  }
}

function defaultSeed(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

export async function createSimulationSession(
  input: CreateSimulationSessionInput,
): Promise<SimulationSession> {
  await assertSessionScope(input)
  if (!SIMULATION_SESSION_KINDS.includes(input.kind)) throw new Error(getT()('simulation:runtime.session.unknownKind'))
  const title = input.title.trim()
  if (!title || title.length > 200) throw new Error(getT()('simulation:runtime.session.titleInvalid'))
  const initialState = parseSimulationState(input.initialState ?? EMPTY_SIMULATION_STATE)
  if (initialState.lastSequence !== 0) throw new Error(getT()('simulation:runtime.session.initialLastSequenceNotZero'))
  const canonSnapshot = input.canonSnapshot ?? { version: 1, sources: [] }
  if (!isObject(canonSnapshot)) throw new Error(getT()('simulation:runtime.session.canonSnapshotMustBeObject'))
  const now = Date.now()
  const session: SimulationSession = {
    projectId: input.projectId,
    worldGroupId: input.worldGroupId ?? null,
    kind: input.kind,
    title,
    status: 'active',
    rulesetVersion: 1,
    seed: input.seed?.trim() || defaultSeed(),
    canonSnapshotJson: JSON.stringify(canonSnapshot),
    initialStateJson: JSON.stringify(initialState),
    parentSessionId: null,
    parentThroughSequence: null,
    createdAt: now,
    updatedAt: now,
  }
  session.id = await db.simulationSessions.add(session) as number
  return session
}

async function readSessionEvents(
  session: SimulationSession,
  throughSequence = Number.MAX_SAFE_INTEGER,
): Promise<SimulationEvent[]> {
  const events = await db.simulationEvents.where('sessionId').equals(session.id!).toArray()
  for (const event of events) {
    if (
      event.projectId !== session.projectId
      || (event.worldGroupId ?? null) !== (session.worldGroupId ?? null)
    ) {
      throw new Error(getT()('simulation:runtime.event.scopeMismatch', { id: event.id ?? '?' }))
    }
  }
  return events.filter(event => event.sequence <= throughSequence)
}

export async function readSimulationState(
  sessionId: number,
  throughSequence = Number.MAX_SAFE_INTEGER,
): Promise<SimulationRuntimeState> {
  const session = await db.simulationSessions.get(sessionId)
  if (!session) throw new Error(getT()('simulation:runtime.session.notFound'))
  const events = await readSessionEvents(session, throughSequence)
  return replaySimulationEvents(parseSimulationState(session.initialStateJson), events, throughSequence)
}

async function appendBuiltEvent(
  sessionId: number,
  build: (input: {
    session: SimulationSession
    state: SimulationRuntimeState
    events: SimulationEvent[]
    sequence: number
  }) => Omit<SimulationEvent, 'id' | 'projectId' | 'worldGroupId' | 'sessionId' | 'sequence' | 'createdAt'>,
): Promise<SimulationEvent> {
  return db.transaction(
    'rw',
    db.simulationSessions,
    db.simulationEvents,
    async () => {
      const session = await db.simulationSessions.get(sessionId)
      if (!session) throw new Error(getT()('simulation:runtime.session.notFound'))
      if (session.status !== 'active') throw new Error(getT()('simulation:runtime.session.onlyActiveCanAppend'))
      const events = await readSessionEvents(session)
      const state = replaySimulationEvents(parseSimulationState(session.initialStateJson), events)
      const sequence = state.lastSequence + 1
      const built = build({ session, state, events, sequence })
      const event: SimulationEvent = {
        projectId: session.projectId,
        worldGroupId: session.worldGroupId ?? null,
        sessionId,
        sequence,
        ...built,
        createdAt: Date.now(),
      }
      applySimulationEvent(state, event)
      event.id = await db.simulationEvents.add(event) as number
      await db.simulationSessions.update(sessionId, { updatedAt: event.createdAt })
      return event
    },
  )
}

export async function appendSimulationEvent(input: {
  sessionId: number
  type: SimulationEventType
  actorKey?: string | null
  targetKey?: string | null
  payload: unknown
}): Promise<SimulationEvent> {
  if (input.type === 'random.resolved') {
    throw new Error(getT()('simulation:runtime.event.randomOnlyViaResolver'))
  }
  if (
    input.type === 'npc.evolution.proposed'
    || input.type === 'npc.evolution.accepted'
    || input.type === 'npc.evolution.rejected'
    || input.type === 'ttrpg.scene.opened'
    || input.type === 'ttrpg.action.recorded'
    || input.type === 'ttrpg.check.resolved'
    || input.type === 'ttrpg.gm.response.recorded'
    || input.type === 'ttrpg.turn.advanced'
    || input.type === 'ttrpg.encounter.started'
    || input.type === 'ttrpg.encounter.resolved'
    || input.type === 'ttrpg.combat.attack.resolved'
    || input.type === 'ttrpg.combat.resource.changed'
    || input.type === 'ttrpg.combat.condition.applied'
    || input.type === 'ttrpg.combat.condition.removed'
    || input.type === 'ttrpg.combat.turn.advanced'
    || input.type === 'ttrpg.campaign.summary.updated'
    || input.type === 'ttrpg.campaign.quest.upserted'
    || input.type === 'ttrpg.campaign.schedule.upserted'
    || input.type === 'chat.session.configured'
    || input.type === 'chat.message.recorded'
    || input.type === 'chat.reply.recorded'
  ) {
    throw new Error(getT()('simulation:runtime.event.governedOnlyViaApi'))
  }
  return appendBuiltEvent(input.sessionId, ({ sequence }) => {
    let payload = input.payload
    if (
      input.type === 'memory.recorded'
      && isObject(payload)
      && isObject(payload.memory)
    ) {
      payload = {
        ...payload,
        memory: {
          ...payload.memory,
          sourceEventSequence: sequence,
        },
      }
    }
    return {
      type: input.type,
      actorKey: input.actorKey ?? null,
      targetKey: input.targetKey ?? null,
      payloadJson: JSON.stringify(payload),
    }
  })
}

export async function configureChatSession(input: {
  sessionId: number
  characterKey: string
  identity: SimulationChatIdentity
  scene: SimulationChatScene
  baseSequence?: number
}): Promise<SimulationEvent> {
  const characterKey = input.characterKey.trim()
  const identity = assertChatIdentity(input.identity)
  const scene = assertChatScene(input.scene)
  return appendBuiltEvent(input.sessionId, ({ session, state }) => {
    if (session.kind !== 'chatgame') throw new Error(getT()('simulation:runtime.chat.onlyChatgameSessionCanConfigure'))
    if (input.baseSequence != null && input.baseSequence !== state.lastSequence) {
      throw new Error(getT()('simulation:runtime.chat.sessionChangedDuringSceneConfig'))
    }
    const character = state.entities[characterKey]
    if (!character || !['character', 'npc'].includes(character.kind)) {
      throw new Error(getT()('simulation:runtime.chat.mustBindCharacterOrNpc'))
    }
    return {
      type: 'chat.session.configured',
      actorKey: characterKey,
      targetKey: characterKey,
      payloadJson: JSON.stringify({ characterKey, identity, scene }),
    }
  })
}

export async function appendChatMessage(input: {
  sessionId: number
  text: string
}): Promise<SimulationEvent> {
  const text = input.text.trim()
  if (!text || text.length > 12_000) throw new Error(getT()('simulation:runtime.chat.userMessageInvalid'))
  return appendBuiltEvent(input.sessionId, ({ session, state, sequence }) => {
    if (session.kind !== 'chatgame') throw new Error(getT()('simulation:runtime.chat.onlyChatgameSessionCanSendMessage'))
    const chat = requireChatState(state)
    const last = chat.messages[chat.messages.length - 1]
    if (last?.role === 'user' && last.supersededBySequence == null) {
      throw new Error(getT()('simulation:runtime.chat.previousUserMessageUnreplied'))
    }
    return {
      type: 'chat.message.recorded',
      payloadJson: JSON.stringify({ messageId: `chat:${sequence}`, text }),
    }
  })
}

export async function appendChatReply(input: {
  sessionId: number
  replyToSequence: number
  text: string
  baseSequence: number
  supersedesSequence?: number | null
}): Promise<SimulationEvent> {
  const text = input.text.trim()
  if (!text || text.length > 20_000) throw new Error(getT()('simulation:runtime.chat.characterReplyInvalid'))
  return appendBuiltEvent(input.sessionId, ({ session, state, sequence }) => {
    if (session.kind !== 'chatgame') throw new Error(getT()('simulation:runtime.chat.onlyChatgameSessionCanReply'))
    const chat = requireChatState(state)
    if (input.baseSequence !== state.lastSequence) throw new Error(getT()('simulation:runtime.chat.sessionChangedDuringReplyGeneration'))
    const target = chat.messages.find(message => message.eventSequence === input.replyToSequence)
    if (!target || target.role !== 'user') throw new Error(getT()('simulation:runtime.chat.replyTargetGone'))
    const activeReply = chat.messages.find(message => (
      message.role === 'character'
      && message.replyToSequence === input.replyToSequence
      && message.supersededBySequence == null
    ))
    const supersedesSequence = input.supersedesSequence ?? null
    if (activeReply && supersedesSequence !== activeReply.eventSequence) {
      throw new Error(getT()('simulation:runtime.chat.existingReplyMustBeSuperseded'))
    }
    if (!activeReply && supersedesSequence != null) throw new Error(getT()('simulation:runtime.chat.noReplyToSupersede'))
    return {
      type: 'chat.reply.recorded',
      actorKey: chat.characterKey,
      targetKey: chat.characterKey,
      payloadJson: JSON.stringify({
        messageId: `chat:${sequence}`,
        replyToSequence: input.replyToSequence,
        supersedesSequence,
        text,
      }),
    }
  })
}

function proposalSequenceFromResolution(event: SimulationEvent): number | null {
  if (
    event.type !== 'npc.evolution.accepted'
    && event.type !== 'npc.evolution.rejected'
  ) return null
  const payload = parseEventPayload(event)
  return Number.isInteger(payload.proposalSequence) ? Number(payload.proposalSequence) : null
}

export function readPendingNpcEvolutionProposals(
  events: readonly SimulationEvent[],
): SimulationNpcEvolutionProposal[] {
  const resolved = new Set(events.flatMap(event => {
    const sequence = proposalSequenceFromResolution(event)
    return sequence == null ? [] : [sequence]
  }))
  return events
    .filter(event => event.type === 'npc.evolution.proposed' && !resolved.has(event.sequence))
    .map(event => ({
      ...parseSimulationNpcEvolutionCandidate(parseEventPayload(event).candidate),
      proposalSequence: event.sequence,
    }))
    .sort((left, right) => left.proposalSequence - right.proposalSequence)
}

export async function appendNpcEvolutionProposal(input: {
  sessionId: number
  candidate: SimulationNpcEvolutionCandidate
}): Promise<SimulationEvent> {
  const candidate = parseSimulationNpcEvolutionCandidate(input.candidate)
  return appendBuiltEvent(input.sessionId, ({ session, state }) => {
    if (session.kind !== 'npc-evolution') {
      throw new Error(getT()('simulation:runtime.npc.onlyNpcEvolutionSession'))
    }
    if (candidate.baseSequence !== state.lastSequence) {
      throw new Error(getT()('simulation:runtime.npc.sessionChangedDuringGeneration'))
    }
    prepareNpcEvolution(state, candidate)
    return {
      type: 'npc.evolution.proposed',
      actorKey: candidate.entityKey,
      targetKey: candidate.entityKey,
      payloadJson: JSON.stringify({ candidate }),
    }
  })
}

export async function acceptNpcEvolutionProposal(input: {
  sessionId: number
  proposalSequence: number
}): Promise<SimulationEvent> {
  return appendBuiltEvent(input.sessionId, ({ session, state, events }) => {
    if (session.kind !== 'npc-evolution') throw new Error(getT()('simulation:runtime.npc.notNpcEvolutionSession'))
    const proposal = events.find(event => (
      event.sequence === input.proposalSequence
      && event.type === 'npc.evolution.proposed'
    ))
    if (!proposal) throw new Error(getT()('simulation:runtime.npc.proposalNotFound'))
    if (events.some(event => proposalSequenceFromResolution(event) === input.proposalSequence)) {
      throw new Error(getT()('simulation:runtime.npc.proposalAlreadyHandled'))
    }
    if (state.lastSequence !== input.proposalSequence) {
      throw new Error(getT()('simulation:runtime.npc.candidateExpired'))
    }
    const candidate = parseSimulationNpcEvolutionCandidate(parseEventPayload(proposal).candidate)
    return {
      type: 'npc.evolution.accepted',
      actorKey: candidate.entityKey,
      targetKey: candidate.entityKey,
      payloadJson: JSON.stringify({ proposalSequence: input.proposalSequence, candidate }),
    }
  })
}

export async function rejectNpcEvolutionProposal(input: {
  sessionId: number
  proposalSequence: number
  reason?: string
}): Promise<SimulationEvent> {
  const reason = input.reason?.trim() ?? ''
  if (reason.length > 1_000) throw new Error(getT()('simulation:runtime.npc.rejectReasonTooLong'))
  return appendBuiltEvent(input.sessionId, ({ session, events }) => {
    if (session.kind !== 'npc-evolution') throw new Error(getT()('simulation:runtime.npc.notNpcEvolutionSession'))
    const proposal = events.find(event => (
      event.sequence === input.proposalSequence
      && event.type === 'npc.evolution.proposed'
    ))
    if (!proposal) throw new Error(getT()('simulation:runtime.npc.proposalNotFound'))
    if (events.some(event => proposalSequenceFromResolution(event) === input.proposalSequence)) {
      throw new Error(getT()('simulation:runtime.npc.proposalAlreadyHandled'))
    }
    return {
      type: 'npc.evolution.rejected',
      actorKey: proposal.actorKey ?? null,
      targetKey: proposal.targetKey ?? null,
      payloadJson: JSON.stringify({ proposalSequence: input.proposalSequence, reason }),
    }
  })
}

function hash32(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  hash ^= hash >>> 16
  return hash >>> 0
}

function deterministicDie(seed: string, sides: number): number {
  let value = hash32(seed)
  value += 0x6d2b79f5
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) % sides + 1
}

function parseDiceExpression(expression: string): {
  normalized: string
  count: number
  sides: number
  modifier: number
} {
  const match = expression.trim().toLowerCase().match(/^(\d{1,3})d(\d{1,4})(?:([+-])(\d{1,7}))?$/)
  if (!match) throw new Error(getT()('simulation:runtime.dice.expressionFormat'))
  const count = assertFiniteInteger(Number(match[1]), getT()('simulation:runtime.labels.diceCount'), 1, 100)
  const sides = assertFiniteInteger(Number(match[2]), getT()('simulation:runtime.labels.diceSides'), 2, 1_000)
  const rawModifier = match[4] ? Number(match[4]) : 0
  const modifier = match[3] === '-' ? -rawModifier : rawModifier
  if (Math.abs(modifier) > 1_000_000) throw new Error(getT()('simulation:runtime.dice.modifierTooLarge'))
  const normalized = `${count}d${sides}${modifier > 0 ? `+${modifier}` : modifier < 0 ? modifier : ''}`
  return { normalized, count, sides, modifier }
}

function assertDiceResolution(value: unknown): DiceResolution {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.dice.resolutionMustBeObject'))
  const parsed = parseDiceExpression(String(value.expression ?? ''))
  if (!Array.isArray(value.dice) || value.dice.length !== parsed.count) {
    throw new Error(getT()('simulation:runtime.dice.resolutionDiceCountMismatch'))
  }
  const dice = value.dice.map(die => assertFiniteInteger(die, getT()('simulation:runtime.labels.diceValue'), 1, parsed.sides))
  const modifier = Number(value.modifier)
  const total = Number(value.total)
  if (modifier !== parsed.modifier || total !== dice.reduce((sum, die) => sum + die, modifier)) {
    throw new Error(getT()('simulation:runtime.dice.resolutionTotalMismatch'))
  }
  return {
    expression: parsed.normalized,
    dice,
    modifier,
    total,
    nonce: String(value.nonce ?? ''),
  }
}

function buildDiceResolution(input: {
  seed: string
  sequence: number
  expression: ReturnType<typeof parseDiceExpression>
  nonce: string
}): DiceResolution {
  const dice = Array.from({ length: input.expression.count }, (_, index) => (
    deterministicDie(
      `${input.seed}\u0000${input.sequence}\u0000${input.expression.normalized}\u0000${input.nonce}\u0000${index}`,
      input.expression.sides,
    )
  ))
  return {
    expression: input.expression.normalized,
    dice,
    modifier: input.expression.modifier,
    total: dice.reduce((sum, die) => sum + die, input.expression.modifier),
    nonce: input.nonce,
  }
}

export async function resolveSimulationDice(input: {
  sessionId: number
  expression: string
  nonce?: string
  actorKey?: string | null
  targetKey?: string | null
}): Promise<SimulationEvent> {
  const parsed = parseDiceExpression(input.expression)
  const nonce = input.nonce?.trim() ?? ''
  if (nonce.length > 200) throw new Error(getT()('simulation:runtime.dice.nonceTooLong'))
  return appendBuiltEvent(input.sessionId, ({ session, sequence }) => {
    const resolution = buildDiceResolution({ seed: session.seed, sequence, expression: parsed, nonce })
    return {
      type: 'random.resolved',
      actorKey: input.actorKey ?? null,
      targetKey: input.targetKey ?? null,
      payloadJson: JSON.stringify(resolution),
    }
  })
}

function assertTtrpgActor(state: SimulationRuntimeState, actorKey: string): void {
  const actor = state.entities[actorKey]
  if (!actor || !['player', 'character', 'npc'].includes(actor.kind)) {
    throw new Error(getT()('simulation:runtime.ttrpg.actorNotFoundOrUnsupported', { actorKey: actorKey }))
  }
  const ttrpg = state.ttrpg
  if (!ttrpg?.scene || ttrpg.scene.status !== 'active') throw new Error(getT()('simulation:runtime.ttrpg.requireSceneFirst'))
  if (!ttrpg.turnOrder.includes(actorKey)) throw new Error(getT()('simulation:runtime.ttrpg.actorNotInTurnOrder'))
  if (ttrpg.activeActorKey !== actorKey) throw new Error(getT()('simulation:runtime.ttrpg.notActorsTurn'))
}

export async function openTtrpgScene(input: {
  sessionId: number
  title: string
  description: string
  locationKey?: string | null
  turnOrder: string[]
}): Promise<SimulationEvent> {
  const title = input.title.trim()
  const description = input.description.trim()
  const turnOrder = [...new Set(input.turnOrder.map(key => key.trim()).filter(Boolean))]
  if (!title || title.length > 200) throw new Error(getT()('simulation:runtime.ttrpg.sceneTitleInvalid'))
  if (description.length > 8_000) throw new Error(getT()('simulation:runtime.ttrpg.sceneDescriptionTooLong'))
  if (turnOrder.length === 0) throw new Error(getT()('simulation:runtime.ttrpg.sceneRequiresAtLeastOneActor'))
  const scene: SimulationTtrpgScene = {
    sceneId: globalThis.crypto?.randomUUID?.() ?? `scene-${Date.now()}-${Math.random()}`,
    title,
    description,
    locationKey: input.locationKey?.trim() || null,
    status: 'active',
  }
  return appendBuiltEvent(input.sessionId, ({ session, state }) => {
    if (session.kind !== 'ttrpg') throw new Error(getT()('simulation:runtime.ttrpg.onlyTtrpgSessionCanStartScene'))
    for (const actorKey of turnOrder) {
      const actor = state.entities[actorKey]
      if (!actor || !['player', 'character', 'npc'].includes(actor.kind)) {
        throw new Error(getT()('simulation:runtime.ttrpg.actorNotFoundOrUnsupported', { actorKey: actorKey }))
      }
    }
    if (scene.locationKey != null) {
      const location = state.entities[scene.locationKey]
      if (!location || location.kind !== 'location') throw new Error(getT()('simulation:runtime.ttrpg.sceneLocationNotFound', { locationKey: scene.locationKey }))
    }
    return {
      type: 'ttrpg.scene.opened',
      actorKey: turnOrder[0],
      targetKey: scene.locationKey,
      payloadJson: JSON.stringify({ scene, turnOrder }),
    }
  })
}

export async function resolveTtrpgCheck(input: {
  sessionId: number
  actorKey: string
  skill: string
  expression: string
  dc: number
  nonce?: string
}): Promise<SimulationEvent> {
  const actorKey = input.actorKey.trim()
  const skill = input.skill.trim()
  const parsed = parseDiceExpression(input.expression)
  const dc = assertFiniteInteger(input.dc, getT()('simulation:runtime.labels.checkDc'), 0, 1_000)
  const nonce = input.nonce?.trim() || `check:${skill}`
  if (!skill || skill.length > 120) throw new Error(getT()('simulation:runtime.dice.checkSkillInvalid'))
  if (nonce.length > 200) throw new Error(getT()('simulation:runtime.dice.checkNonceTooLong'))
  return appendBuiltEvent(input.sessionId, ({ session, state, sequence }) => {
    if (session.kind !== 'ttrpg') throw new Error(getT()('simulation:runtime.ttrpg.onlyTtrpgSessionCanRollCheck'))
    assertTtrpgActor(state, actorKey)
    const resolution = buildDiceResolution({ seed: session.seed, sequence, expression: parsed, nonce })
    return {
      type: 'ttrpg.check.resolved',
      actorKey,
      targetKey: actorKey,
      payloadJson: JSON.stringify({
        check: {
          actorKey,
          skill,
          expression: resolution.expression,
          dice: resolution.dice,
          modifier: resolution.modifier,
          total: resolution.total,
          dc,
          success: resolution.total >= dc,
        },
      }),
    }
  })
}

export function parseSimulationTtrpgEncounterCandidate(value: unknown): SimulationTtrpgEncounterCandidate {
  if (!isObject(value)) throw new Error(getT()('simulation:runtime.ttrpg.encounterCandidateMustBeObject'))
  const allowed = new Set(['baseSequence', 'title', 'description', 'participantKeys'])
  const unknown = Object.keys(value).filter(key => !allowed.has(key))
  if (unknown.length) throw new Error(getT()('simulation:runtime.ttrpg.encounterCandidateUnknownFields', { fields: unknown.join(', ') }))
  const baseSequence = assertFiniteInteger(value.baseSequence, getT()('simulation:runtime.labels.encounterCandidateBaselineSequence'), 0, Number.MAX_SAFE_INTEGER)
  const title = String(value.title ?? '').trim()
  const description = String(value.description ?? '').trim()
  if (!title || title.length > 200) throw new Error(getT()('simulation:runtime.ttrpg.encounterCandidateTitleInvalid'))
  if (!description || description.length > 8_000) throw new Error(getT()('simulation:runtime.ttrpg.encounterCandidateDescriptionInvalid'))
  if (!Array.isArray(value.participantKeys)) throw new Error(getT()('simulation:runtime.ttrpg.encounterCandidateRequiresParticipants'))
  const participantKeys = value.participantKeys.map(raw => String(raw).trim())
  if (participantKeys.length < 2 || participantKeys.length > 40 || participantKeys.some(key => !key || key.length > 160)) {
    throw new Error(getT()('simulation:runtime.ttrpg.encounterCandidateParticipantsRange'))
  }
  if (new Set(participantKeys).size !== participantKeys.length) throw new Error(getT()('simulation:runtime.ttrpg.encounterCandidateParticipantsDuplicate'))
  return { baseSequence, title, description, participantKeys }
}

function numericAttribute(entity: RuntimeEntityState, keys: string[], fallback: number, min: number, max: number): number {
  for (const key of keys) {
    const value = entity.attributes[key]
    if (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max) return value
  }
  return fallback
}

function combatantFromEntity(entity: RuntimeEntityState, initiative: number): SimulationTtrpgCombatant {
  const maximumHp = numericAttribute(entity, ['maxHp', 'hp'], 10, 1, 1_000_000_000)
  const currentHp = numericAttribute(entity, ['hp'], maximumHp, 0, maximumHp)
  const resources: Record<string, SimulationTtrpgResource> = {
    hp: { current: currentHp, maximum: maximumHp },
  }
  for (const key of ['mana', 'stamina', 'actionPoints']) {
    const maximum = numericAttribute(entity, [`max${key[0].toUpperCase()}${key.slice(1)}`, key], 0, 0, 1_000_000_000)
    if (maximum > 0) resources[key] = { current: numericAttribute(entity, [key], maximum, 0, maximum), maximum }
  }
  return {
    entityKey: entity.entityKey,
    initiative,
    armorClass: numericAttribute(entity, ['armorClass', 'ac'], 10, 0, 1_000),
    resources,
    conditions: [],
  }
}

export async function startTtrpgEncounter(input: {
  sessionId: number
  candidate: SimulationTtrpgEncounterCandidate
}): Promise<SimulationEvent> {
  const candidate = parseSimulationTtrpgEncounterCandidate(input.candidate)
  return appendBuiltEvent(input.sessionId, ({ session, state, sequence }) => {
    if (session.kind !== 'ttrpg') throw new Error(getT()('simulation:runtime.ttrpg.onlyTtrpgSessionCanStartEncounter'))
    const ttrpg = state.ttrpg
    if (!ttrpg?.scene || ttrpg.scene.status !== 'active') throw new Error(getT()('simulation:runtime.ttrpg.requireSceneFirst'))
    if (candidate.baseSequence !== state.lastSequence) throw new Error(getT()('simulation:runtime.ttrpg.encounterCandidateExpired'))
    if (ttrpg.encounter?.status === 'active') throw new Error(getT()('simulation:runtime.ttrpg.encounterAlreadyActive'))
    const combatants: Record<string, SimulationTtrpgCombatant> = {}
    for (const entityKey of candidate.participantKeys) {
      const entity = state.entities[entityKey]
      if (!entity || !['player', 'character', 'npc'].includes(entity.kind)) throw new Error(getT()('simulation:runtime.ttrpg.encounterParticipantNotFoundOrUnsupported', { actorKey: entityKey }))
      const initiative = numericAttribute(entity, ['initiative'], deterministicDie(`${session.seed}\u0000${sequence}\u0000initiative:${entityKey}`, 20), 0, 1_000)
      combatants[entityKey] = combatantFromEntity(entity, initiative)
    }
    const turnOrder = Object.values(combatants)
      .sort((left, right) => right.initiative - left.initiative || left.entityKey.localeCompare(right.entityKey))
      .map(combatant => combatant.entityKey)
    const encounter: SimulationTtrpgEncounter = {
      encounterId: globalThis.crypto?.randomUUID?.() ?? `encounter-${Date.now()}-${Math.random()}`,
      title: candidate.title,
      description: candidate.description,
      status: 'active',
      round: 1,
      activeActorKey: turnOrder[0],
      turnOrder,
      combatants,
    }
    return {
      type: 'ttrpg.encounter.started',
      actorKey: turnOrder[0],
      targetKey: null,
      payloadJson: JSON.stringify({ encounter }),
    }
  })
}

export async function resolveTtrpgEncounter(input: {
  sessionId: number
  reason?: string
}): Promise<SimulationEvent> {
  const reason = input.reason?.trim() ?? ''
  if (reason.length > 2_000) throw new Error(getT()('simulation:runtime.ttrpg.encounterEndReasonTooLong'))
  return appendBuiltEvent(input.sessionId, ({ session, state }) => {
    if (session.kind !== 'ttrpg') throw new Error(getT()('simulation:runtime.ttrpg.onlyTtrpgSessionCanEndEncounter'))
    if (!state.ttrpg?.encounter || state.ttrpg.encounter.status !== 'active') throw new Error(getT()('simulation:runtime.ttrpg.noActiveEncounter'))
    return {
      type: 'ttrpg.encounter.resolved',
      actorKey: null,
      targetKey: null,
      payloadJson: JSON.stringify({ reason }),
    }
  })
}

export async function changeTtrpgResource(input: {
  sessionId: number
  entityKey: string
  resourceKey: string
  delta: number
  reason?: string
}): Promise<SimulationEvent> {
  const entityKey = input.entityKey.trim()
  const resourceKey = input.resourceKey.trim()
  const delta = assertFiniteInteger(input.delta, getT()('simulation:runtime.labels.resourceDelta'), -1_000_000_000, 1_000_000_000)
  const reason = input.reason?.trim() ?? ''
  if (!entityKey || !resourceKey || resourceKey.length > 80) throw new Error(getT()('simulation:runtime.ttrpg.resourceChangeTargetInvalid'))
  if (reason.length > 2_000) throw new Error(getT()('simulation:runtime.ttrpg.resourceChangeReasonTooLong'))
  return appendBuiltEvent(input.sessionId, ({ session, state }) => {
    if (session.kind !== 'ttrpg') throw new Error(getT()('simulation:runtime.ttrpg.onlyTtrpgSessionCanAdjustResource'))
    const encounter = state.ttrpg?.encounter
    const resource = encounter?.combatants[entityKey]?.resources[resourceKey]
    if (!encounter || encounter.status !== 'active' || !resource) throw new Error(getT()('simulation:runtime.ttrpg.resourceTargetNotInActiveEncounter'))
    const current = Math.max(0, Math.min(resource.maximum, resource.current + delta))
    return {
      type: 'ttrpg.combat.resource.changed',
      actorKey: entityKey,
      targetKey: entityKey,
      payloadJson: JSON.stringify({ entityKey, resourceKey, delta, current, reason }),
    }
  })
}

export async function applyTtrpgCondition(input: {
  sessionId: number
  entityKey: string
  condition: SimulationTtrpgCondition
}): Promise<SimulationEvent> {
  const entityKey = input.entityKey.trim()
  const condition = assertTtrpgCondition(input.condition)
  return appendBuiltEvent(input.sessionId, ({ session, state }) => {
    if (session.kind !== 'ttrpg') throw new Error(getT()('simulation:runtime.ttrpg.onlyTtrpgSessionCanApplyCondition'))
    if (!state.ttrpg?.encounter?.combatants[entityKey]) throw new Error(getT()('simulation:runtime.ttrpg.conditionTargetNotInEncounter'))
    return {
      type: 'ttrpg.combat.condition.applied',
      actorKey: entityKey,
      targetKey: entityKey,
      payloadJson: JSON.stringify({ entityKey, condition }),
    }
  })
}

export async function removeTtrpgCondition(input: {
  sessionId: number
  entityKey: string
  conditionId: string
}): Promise<SimulationEvent> {
  const entityKey = input.entityKey.trim()
  const conditionId = input.conditionId.trim()
  if (!entityKey || !conditionId) throw new Error(getT()('simulation:runtime.ttrpg.conditionRemoveTargetInvalid'))
  return appendBuiltEvent(input.sessionId, ({ session, state }) => {
    if (session.kind !== 'ttrpg') throw new Error(getT()('simulation:runtime.ttrpg.onlyTtrpgSessionCanRemoveCondition'))
    if (!state.ttrpg?.encounter?.combatants[entityKey]) throw new Error(getT()('simulation:runtime.ttrpg.conditionTargetNotInEncounter'))
    return {
      type: 'ttrpg.combat.condition.removed',
      actorKey: entityKey,
      targetKey: entityKey,
      payloadJson: JSON.stringify({ entityKey, conditionId }),
    }
  })
}

export async function resolveTtrpgAttack(input: {
  sessionId: number
  actorKey: string
  targetKey: string
  attackExpression: string
  damageExpression?: string | null
  resourceKey?: string
  reason?: string
}): Promise<SimulationEvent[]> {
  const actorKey = input.actorKey.trim()
  const targetKey = input.targetKey.trim()
  const attackExpression = parseDiceExpression(input.attackExpression)
  const damageExpression = input.damageExpression?.trim() ? parseDiceExpression(input.damageExpression) : null
  const resourceKey = input.resourceKey?.trim() || 'hp'
  const reason = input.reason?.trim() ?? ''
  if (!actorKey || !targetKey || actorKey === targetKey) throw new Error(getT()('simulation:runtime.ttrpg.attackerAndTargetMustDiffer'))
  if (resourceKey.length > 80) throw new Error(getT()('simulation:runtime.ttrpg.attackResourceKeyInvalid'))
  if (reason.length > 2_000) throw new Error(getT()('simulation:runtime.ttrpg.attackReasonTooLong'))
  return db.transaction('rw', db.simulationSessions, db.simulationEvents, async () => {
    const session = await db.simulationSessions.get(input.sessionId)
    if (!session) throw new Error(getT()('simulation:runtime.session.notFound'))
    if (session.status !== 'active') throw new Error(getT()('simulation:runtime.session.onlyActiveCanAppend'))
    if (session.kind !== 'ttrpg') throw new Error(getT()('simulation:runtime.ttrpg.onlyTtrpgSessionCanAttack'))
    const events = await readSessionEvents(session)
    let state = replaySimulationEvents(parseSimulationState(session.initialStateJson), events)
    const encounter = state.ttrpg?.encounter
    if (!encounter || encounter.status !== 'active') throw new Error(getT()('simulation:runtime.ttrpg.requireActiveEncounterForAttack'))
    if (encounter.activeActorKey !== actorKey) throw new Error(getT()('simulation:runtime.ttrpg.notCombatActorsTurn'))
    const actor = encounter.combatants[actorKey]
    const target = encounter.combatants[targetKey]
    if (!actor || !target) throw new Error(getT()('simulation:runtime.ttrpg.combatantNotInEncounter'))
    const targetResource = target.resources[resourceKey]
    if (!targetResource) throw new Error(getT()('simulation:runtime.ttrpg.targetMissingResource', { resourceKey: resourceKey }))
    const attackSequence = state.lastSequence + 1
    const attackDice = Array.from({ length: attackExpression.count }, (_, index) => deterministicDie(`${session.seed}\u0000${attackSequence}\u0000${attackExpression.normalized}\u0000attack:${actorKey}:${targetKey}\u0000${index}`, attackExpression.sides))
    const attackTotal = attackDice.reduce((sum, die) => sum + die, attackExpression.modifier)
    const hit = attackTotal >= target.armorClass
    const damageDice = hit && damageExpression
      ? Array.from({ length: damageExpression.count }, (_, index) => deterministicDie(`${session.seed}\u0000${attackSequence}\u0000${damageExpression.normalized}\u0000damage:${actorKey}:${targetKey}\u0000${index}`, damageExpression.sides))
      : []
    const damageTotal = hit && damageExpression ? damageDice.reduce((sum, die) => sum + die, damageExpression.modifier) : 0
    if (damageTotal < 0) throw new Error(getT()('simulation:runtime.ttrpg.damageExpressionCannotProduceNegative'))
    const resourceDelta = -damageTotal
    const attack: SimulationTtrpgAttackResult = {
      actorKey,
      targetKey,
      attackExpression: attackExpression.normalized,
      attackDice,
      attackModifier: attackExpression.modifier,
      attackTotal,
      armorClass: target.armorClass,
      hit,
      damageExpression: hit && damageExpression ? damageExpression.normalized : null,
      damageDice,
      damageModifier: damageExpression?.modifier ?? 0,
      damageTotal,
      resourceKey,
      resourceDelta,
      reason,
    }
    const appended: SimulationEvent[] = []
    const appendLocal = (eventInput: { type: SimulationEventType; actorKey?: string | null; targetKey?: string | null; payload: unknown }) => {
      const event: SimulationEvent = {
        projectId: session.projectId,
        worldGroupId: session.worldGroupId ?? null,
        sessionId: input.sessionId,
        sequence: state.lastSequence + 1,
        type: eventInput.type,
        actorKey: eventInput.actorKey ?? null,
        targetKey: eventInput.targetKey ?? null,
        payloadJson: JSON.stringify(eventInput.payload),
        createdAt: Date.now(),
      }
      state = applySimulationEvent(state, event)
      appended.push(event)
    }
    appendLocal({ type: 'ttrpg.combat.attack.resolved', actorKey, targetKey, payload: { attack } })
    if (hit && damageTotal > 0) {
      const current = Math.max(0, Math.min(targetResource.maximum, targetResource.current + resourceDelta))
      appendLocal({
        type: 'ttrpg.combat.resource.changed',
        actorKey,
        targetKey,
        payload: { entityKey: targetKey, resourceKey, delta: resourceDelta, current, reason: reason || '攻击伤害' },
      })
    }
    const currentIndex = encounter.turnOrder.indexOf(actorKey)
    const nextIndex = (currentIndex + 1) % encounter.turnOrder.length
    const nextActorKey = encounter.turnOrder[nextIndex]
    const nextRound = encounter.round + (nextIndex === 0 ? 1 : 0)
    appendLocal({
      type: 'ttrpg.combat.turn.advanced',
      actorKey,
      targetKey: nextActorKey,
      payload: { nextActorKey, round: nextRound },
    })
    for (const event of appended) event.id = await db.simulationEvents.add(event) as number
    await db.simulationSessions.update(input.sessionId, { updatedAt: appended[appended.length - 1].createdAt })
    return appended
  })
}

export async function updateTtrpgCampaignSummary(input: {
  sessionId: number
  summary: string
  baseSequence?: number
}): Promise<SimulationEvent> {
  const summary = input.summary.trim()
  if (summary.length > 20_000) throw new Error(getT()('simulation:runtime.ttrpg.campaignSummaryTooLongForUpdate'))
  return appendBuiltEvent(input.sessionId, ({ session, state }) => {
    if (session.kind !== 'ttrpg') throw new Error(getT()('simulation:runtime.ttrpg.onlyTtrpgSessionCanUpdateCampaignSummary'))
    const baseSequence = input.baseSequence ?? state.lastSequence
    if (baseSequence !== state.lastSequence) throw new Error(getT()('simulation:runtime.ttrpg.campaignSummaryBaselineChanged'))
    return {
      type: 'ttrpg.campaign.summary.updated',
      actorKey: null,
      targetKey: null,
      payloadJson: JSON.stringify({ baseSequence, summary }),
    }
  })
}

export async function upsertTtrpgQuest(input: {
  sessionId: number
  questId: string
  title: string
  description: string
  status: SimulationTtrpgQuest['status']
  priority?: number
  dueClock?: number | null
}): Promise<SimulationEvent> {
  return appendBuiltEvent(input.sessionId, ({ session, sequence }) => {
    if (session.kind !== 'ttrpg') throw new Error(getT()('simulation:runtime.ttrpg.onlyTtrpgSessionCanManageQuests'))
    const quest = assertTtrpgQuest({
      questId: input.questId,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority ?? 0,
      dueClock: input.dueClock ?? null,
      updatedSequence: sequence,
    })
    return {
      type: 'ttrpg.campaign.quest.upserted',
      actorKey: null,
      targetKey: quest.questId,
      payloadJson: JSON.stringify({ quest }),
    }
  })
}

export async function upsertTtrpgNpcSchedule(input: {
  sessionId: number
  scheduleId: string
  entityKey: string
  startClock: number
  endClock?: number | null
  locationKey?: string | null
  activity: string
  recurrence?: SimulationTtrpgNpcSchedule['recurrence']
}): Promise<SimulationEvent> {
  return appendBuiltEvent(input.sessionId, ({ session, state, sequence }) => {
    if (session.kind !== 'ttrpg') throw new Error(getT()('simulation:runtime.ttrpg.onlyTtrpgSessionCanManageSchedules'))
    const entityKey = input.entityKey.trim()
    const npc = state.entities[entityKey]
    if (!npc || !isNpcRuntimeEntity(npc)) throw new Error(getT()('simulation:runtime.ttrpg.scheduleTargetNotNpc'))
    const locationKey = input.locationKey?.trim() || null
    if (locationKey != null) {
      const location = state.entities[locationKey]
      if (!location || location.kind !== 'location') throw new Error(getT()('simulation:runtime.ttrpg.scheduleLocationNotRuntimeLocation'))
    }
    const schedule = assertTtrpgNpcSchedule({
      scheduleId: input.scheduleId,
      entityKey,
      startClock: input.startClock,
      endClock: input.endClock ?? null,
      locationKey,
      activity: input.activity,
      recurrence: input.recurrence ?? 'once',
      updatedSequence: sequence,
    })
    return {
      type: 'ttrpg.campaign.schedule.upserted',
      actorKey: entityKey,
      targetKey: locationKey,
      payloadJson: JSON.stringify({ schedule }),
    }
  })
}

export async function appendTtrpgTurn(input: {
  sessionId: number
  candidate: SimulationTtrpgTurnCandidate
}): Promise<SimulationEvent[]> {
  const candidate = parseSimulationTtrpgTurnCandidate(input.candidate)
  return db.transaction('rw', db.simulationSessions, db.simulationEvents, async () => {
    const session = await db.simulationSessions.get(input.sessionId)
    if (!session) throw new Error(getT()('simulation:runtime.session.notFound'))
    if (session.status !== 'active') throw new Error(getT()('simulation:runtime.session.onlyActiveCanAppend'))
    if (session.kind !== 'ttrpg') throw new Error(getT()('simulation:runtime.ttrpg.onlyTtrpgSessionCanRecordTurn'))
    const events = await readSessionEvents(session)
    let state = replaySimulationEvents(parseSimulationState(session.initialStateJson), events)
    if (candidate.baseSequence !== state.lastSequence) throw new Error(getT()('simulation:runtime.ttrpg.turnCandidateExpired'))
    assertTtrpgActor(state, candidate.actorKey)
    const ttrpg = state.ttrpg!
    const currentIndex = ttrpg.turnOrder.indexOf(ttrpg.activeActorKey!)
    const nextIndex = (currentIndex + 1) % ttrpg.turnOrder.length
    const expectedNextActorKey = ttrpg.turnOrder[nextIndex]
    const expectedRound = ttrpg.round + (nextIndex === 0 ? 1 : 0)
    if (candidate.nextActorKey != null && candidate.nextActorKey !== expectedNextActorKey) {
      throw new Error(getT()('simulation:runtime.ttrpg.turnCandidateAltersDeterministicOrder'))
    }
    if (candidate.check) parseDiceExpression(candidate.check.expression)
    const appended: SimulationEvent[] = []
    const appendLocal = (inputEvent: {
      type: SimulationEventType
      actorKey?: string | null
      targetKey?: string | null
      payload: unknown
    }) => {
      const event: SimulationEvent = {
        projectId: session.projectId,
        worldGroupId: session.worldGroupId ?? null,
        sessionId: input.sessionId,
        sequence: state.lastSequence + 1,
        type: inputEvent.type,
        actorKey: inputEvent.actorKey ?? null,
        targetKey: inputEvent.targetKey ?? null,
        payloadJson: JSON.stringify(inputEvent.payload),
        createdAt: Date.now(),
      }
      state = applySimulationEvent(state, event)
      appended.push(event)
    }
    appendLocal({
      type: 'ttrpg.action.recorded',
      actorKey: candidate.actorKey,
      targetKey: candidate.actorKey,
      payload: { actorKey: candidate.actorKey, text: candidate.action },
    })
    let checkSequence: number | null = null
    let resolvedNarrative = candidate.narrative
    if (candidate.check) {
      const expression = parseDiceExpression(candidate.check.expression)
      const sequence = state.lastSequence + 1
      const resolution = buildDiceResolution({
        seed: session.seed,
        sequence,
        expression,
        nonce: `check:${candidate.check.skill}`,
      })
      checkSequence = sequence
      resolvedNarrative = [
        candidate.narrative,
        resolution.total >= candidate.check.dc ? candidate.outcomes!.success : candidate.outcomes!.failure,
      ].filter(Boolean).join('\n\n')
      appendLocal({
        type: 'ttrpg.check.resolved',
        actorKey: candidate.actorKey,
        targetKey: candidate.actorKey,
        payload: {
          check: {
            actorKey: candidate.actorKey,
            skill: candidate.check.skill,
            expression: resolution.expression,
            dice: resolution.dice,
            modifier: resolution.modifier,
            total: resolution.total,
            dc: candidate.check.dc,
            success: resolution.total >= candidate.check.dc,
          },
        },
      })
    }
    const actionSequence = appended[0].sequence
    appendLocal({
      type: 'ttrpg.gm.response.recorded',
      actorKey: null,
      targetKey: candidate.actorKey,
      payload: {
        actionSequence,
        checkSequence,
        text: resolvedNarrative,
      },
    })
    appendLocal({
      type: 'ttrpg.turn.advanced',
      actorKey: candidate.actorKey,
      targetKey: expectedNextActorKey,
      payload: { nextActorKey: expectedNextActorKey, round: expectedRound },
    })
    for (const event of appended) event.id = await db.simulationEvents.add(event) as number
    await db.simulationSessions.update(input.sessionId, { updatedAt: appended[appended.length - 1].createdAt })
    return appended
  })
}

async function hashStateJson(stateJson: string): Promise<string> {
  const data = new TextEncoder().encode(stateJson)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function createSimulationCheckpoint(input: {
  sessionId: number
  name: string
  throughSequence?: number
}): Promise<SimulationCheckpoint> {
  const session = await db.simulationSessions.get(input.sessionId)
  if (!session) throw new Error(getT()('simulation:runtime.session.notFound'))
  const events = await readSessionEvents(session)
  const latest = events.reduce((max, event) => Math.max(max, event.sequence), 0)
  const throughSequence = input.throughSequence ?? latest
  if (!Number.isInteger(throughSequence) || throughSequence < 0 || throughSequence > latest) {
    throw new Error(getT()('simulation:runtime.checkpoint.sequenceOutOfRange'))
  }
  const state = replaySimulationEvents(
    parseSimulationState(session.initialStateJson),
    events,
    throughSequence,
  )
  const stateJson = JSON.stringify(state)
  const name = input.name.trim() || getT()('simulation:runtime.checkpoint.defaultName', { throughSequence: throughSequence })
  if (name.length > 200) throw new Error(getT()('simulation:runtime.checkpoint.nameTooLong'))
  const checkpoint: SimulationCheckpoint = {
    projectId: session.projectId,
    worldGroupId: session.worldGroupId ?? null,
    sessionId: session.id!,
    throughSequence,
    name,
    stateJson,
    stateHash: await hashStateJson(stateJson),
    createdAt: Date.now(),
  }
  checkpoint.id = await db.simulationCheckpoints.add(checkpoint) as number
  return checkpoint
}

export async function verifySimulationCheckpoint(checkpointId: number): Promise<boolean> {
  const checkpoint = await db.simulationCheckpoints.get(checkpointId)
  if (!checkpoint) return false
  const session = await db.simulationSessions.get(checkpoint.sessionId)
  if (
    !session
    || session.projectId !== checkpoint.projectId
    || (session.worldGroupId ?? null) !== (checkpoint.worldGroupId ?? null)
  ) return false
  const replayed = await readSimulationState(checkpoint.sessionId, checkpoint.throughSequence)
  const stateJson = JSON.stringify(replayed)
  return stateJson === checkpoint.stateJson
    && await hashStateJson(stateJson) === checkpoint.stateHash
}

export async function branchSimulationSession(input: {
  parentSessionId: number
  throughSequence: number
  title: string
  seed?: string
}): Promise<SimulationSession> {
  const parent = await db.simulationSessions.get(input.parentSessionId)
  if (!parent) throw new Error(getT()('simulation:runtime.session.parentNotFound'))
  const events = await readSessionEvents(parent)
  const latest = events.reduce((max, event) => Math.max(max, event.sequence), 0)
  if (
    !Number.isInteger(input.throughSequence)
    || input.throughSequence < 0
    || input.throughSequence > latest
  ) throw new Error(getT()('simulation:runtime.branch.sequenceOutOfRange'))
  const state = replaySimulationEvents(
    parseSimulationState(parent.initialStateJson),
    events,
    input.throughSequence,
  )
  state.lastSequence = 0
  const child = await createSimulationSession({
    projectId: parent.projectId,
    worldGroupId: parent.worldGroupId ?? null,
    kind: parent.kind,
    title: input.title,
    seed: input.seed,
    canonSnapshot: parseJsonObject(parent.canonSnapshotJson, getT()('simulation:runtime.labels.canonFrozenSnapshotLabel')),
    initialState: state,
  })
  await db.simulationSessions.update(child.id!, {
    parentSessionId: parent.id!,
    parentThroughSequence: input.throughSequence,
  })
  return {
    ...child,
    parentSessionId: parent.id!,
    parentThroughSequence: input.throughSequence,
  }
}

export async function deleteSimulationSession(sessionId: number): Promise<void> {
  await db.transaction('rw', transactionTablesForReferences('simulationSessions'), async () => {
    await db.simulationEvents.where('sessionId').equals(sessionId).delete()
    await db.simulationCheckpoints.where('sessionId').equals(sessionId).delete()
    const children = await db.simulationSessions.where('parentSessionId').equals(sessionId).toArray()
    for (const child of children) {
      if (child.id != null) {
        await db.simulationSessions.update(child.id, {
          parentSessionId: null,
          parentThroughSequence: null,
        })
      }
    }
    await db.simulationSessions.delete(sessionId)
  })
}
