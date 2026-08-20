import { describe, expect, it } from 'vitest'
import { FIELD_REGISTRY, getFieldRole, getFieldSpec } from '../../src/lib/registry/field-registry'
import type { FieldRole } from '../../src/lib/registry/types'

describe('FIELD_REGISTRY field roles', () => {
  it('uses only the declared role vocabulary', () => {
    const valid: FieldRole[] = ['free-text', 'preserve', 'canonical-id']
    for (const field of FIELD_REGISTRY) {
      if (field.role !== undefined) expect(valid).toContain(field.role)
    }
  })

  it('resolves canonical fields and aliases through the central lookup', () => {
    expect(getFieldSpec('worldviews', 'worldOrigin')?.field).toBe('worldOrigin')
    expect(getFieldSpec('worldviews', 'summary')?.field).toBe('worldOrigin')
    expect(getFieldRole('worldviews', 'summary')).toBe('free-text')
    expect(getFieldRole('codexEntries', '词条名')).toBe('preserve')
  })

  it('does not let a legacy canonical field get shadowed by an alias', () => {
    expect(getFieldSpec('worldviews', 'history')?.field).toBe('history')
    expect(getFieldRole('worldviews', 'history')).toBeUndefined()
    expect(getFieldRole('worldviews', 'historyLine')).toBe('free-text')
  })

  it('marks audited names, IDs, closed enums, and free text explicitly', () => {
    expect(getFieldRole('codexEntries', 'name')).toBe('preserve')
    expect(getFieldRole('codexEntries', 'categoryId')).toBe('preserve')
    expect(getFieldRole('codexEntries', 'tags')).toBe('free-text')
    expect(getFieldRole('characters', 'roleWeight')).toBe('canonical-id')
    expect(getFieldRole('characters', 'moralAxis')).toBe('canonical-id')
    expect(getFieldRole('characters', 'orderAxis')).toBe('canonical-id')
    expect(getFieldRole('storyCores', 'mainPlot')).toBe('free-text')
    expect(getFieldRole('importantLocations', 'name')).toBe('preserve')
  })

  it('does not infer a role for un-audited or opaque fields', () => {
    expect(getFieldRole('codexEntries', 'fields')).toBeUndefined()
    expect(getFieldRole('codexEntries', 'refs')).toBeUndefined()
    expect(getFieldRole('codexCategories', 'fieldSchema')).toBeUndefined()
    expect(getFieldRole('characters', 'appearance')).toBeUndefined()
    expect(getFieldRole('unknownTarget', 'name')).toBeUndefined()
    expect(getFieldSpec('codexEntries', 'notRegistered')).toBeUndefined()
  })
})
