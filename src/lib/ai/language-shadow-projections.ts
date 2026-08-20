import type { SupportedLang } from '../../i18n'
import { getFieldRole } from '../registry/field-registry'
import type { FieldRole } from '../registry/types'
import type { CodexFieldDef } from '../types/codex'
import type {
  ReverseMultiWorldResult,
  ReverseResult,
} from './inspiration-reverse'
import type { SanitizedShadowField } from './language-shadow-validator'

export interface CodexShadowCandidate {
  summary?: unknown
  description?: unknown
  tags?: unknown
  fields?: unknown
  [key: string]: unknown
}

const CODEX_STANDARD_FIELDS = ['summary', 'description', 'tags'] as const

function objectValue(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null
    } catch {
      return null
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/**
 * Codex projection is intentionally shallow. Standard fields use the
 * registry; custom `fields` use only the role explicitly present in their
 * CodexFieldDef. Schema-less keys remain unregistered rather than inferred.
 */
export function projectCodexShadowFields(
  candidates: readonly CodexShadowCandidate[],
  schema: readonly CodexFieldDef[] = [],
): SanitizedShadowField[] {
  const projected: SanitizedShadowField[] = []
  for (const candidate of candidates) {
    for (const field of CODEX_STANDARD_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(candidate, field)) {
        projected.push({ role: getFieldRole('codexEntries', field), value: candidate[field] })
      }
    }
    const values = objectValue(candidate.fields)
    if (!values) continue
    for (const definition of schema) {
      if (!Object.prototype.hasOwnProperty.call(values, definition.key)) continue
      projected.push({ role: definition.role, value: values[definition.key] })
    }
    // Keys absent from the supplied schema are explicitly unregistered. The
    // value is carried only to the synchronous validator and never reported.
    for (const key of Object.keys(values)) {
      if (!schema.some(definition => definition.key === key)) {
        projected.push({ value: values[key] })
      }
    }
  }
  return projected
}

const WORLDVIEW_FIELDS = [
  'worldOrigin', 'powerHierarchy', 'continentLayout', 'climateByRegion',
  'historyLine', 'races', 'factionLayout',
] as const
const STORY_CORE_FIELDS = ['logline', 'theme', 'centralConflict', 'plotPattern', 'mainPlot'] as const
const CHARACTER_FIELDS = [
  'name', 'roleWeight', 'moralAxis', 'orderAxis', 'shortDescription',
  'personality', 'background', 'motivation', 'arc',
] as const
const MULTI_WORLD_FIELDS = [...WORLDVIEW_FIELDS, 'name', 'type', 'entryCondition', 'powerRestriction'] as const
const MULTI_WORLD_CHARACTER_FIELDS = [...CHARACTER_FIELDS, 'homeWorld', 'isCrossWorld'] as const

function projectRecordFields(
  target: string,
  record: Record<string, unknown>,
  fields: readonly string[],
): SanitizedShadowField[] {
  return fields
    .filter(field => Object.prototype.hasOwnProperty.call(record, field))
    .map(field => ({ role: getFieldRole(target, field), value: record[field] }))
}

/** Explicit registry-backed projection for both reverse result shapes. */
export function projectReverseShadowFields(
  result: ReverseResult | ReverseMultiWorldResult,
): SanitizedShadowField[] {
  const output: SanitizedShadowField[] = []
  const isMultiWorld = 'worlds' in result
  if (!isMultiWorld) {
    output.push(...projectRecordFields('worldviews', result.worldview as unknown as Record<string, unknown>, WORLDVIEW_FIELDS))
  } else {
    for (const world of result.worlds) {
      output.push(...projectRecordFields('worldviews', world as unknown as Record<string, unknown>, MULTI_WORLD_FIELDS))
    }
  }
  output.push(...projectRecordFields('storyCores', result.storyCore as unknown as Record<string, unknown>, STORY_CORE_FIELDS))
  for (const character of result.characters) {
    output.push(...projectRecordFields('characters', character as unknown as Record<string, unknown>, isMultiWorld
      ? MULTI_WORLD_CHARACTER_FIELDS
      : CHARACTER_FIELDS))
  }
  return output
}

/**
 * Agents must prepare fields at their existing confirmation boundary. This
 * helper deliberately accepts fields, not candidate objects, and performs no
 * name/type/value inference.
 */
export function projectAgentShadowFields(
  fields: ReadonlyArray<{ role?: FieldRole; value: unknown }>,
): SanitizedShadowField[] {
  return fields.map(field => ({ role: field.role, value: field.value }))
}

export function unregisteredAgentShadowField(value: unknown): SanitizedShadowField {
  return { value }
}

export type LanguageShadowTarget = SupportedLang
