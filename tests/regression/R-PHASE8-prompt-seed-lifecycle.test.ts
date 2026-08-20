import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { CORE_PROMPT_SEEDS } from '../../src/lib/ai/prompt-seeds-core'
import { TOOL_PROMPT_SEEDS } from '../../src/lib/ai/prompt-seeds-tools'
import { GENRE_PACK_SEEDS } from '../../src/lib/ai/prompt-seeds-genre-packs'
import { EXTENDED_GENRE_PACK_SEEDS } from '../../src/lib/ai/prompt-seeds-genre-packs-extended'
import { SYSTEM_PROMPT_SEEDS } from '../../src/lib/ai/prompt-seeds'
import { NOVEL_CONTENT_PROMPT_SEEDS } from '../../src/lib/ai/prompt-seeds-novel'
import type { PromptSeed } from '../../src/lib/ai/prompt-seed-type'

type SeedFamily = 'core' | 'tools' | 'genre-base' | 'genre-extended' | 'novel'

type ManifestEntry = {
  identity: string
  family: SeedFamily
  order: number
  seed: Record<string, unknown>
}

const DYNAMIC_FIELDS = new Set(['id', 'createdAt', 'updatedAt'])

const genreBaseSeeds = GENRE_PACK_SEEDS.filter(seed => !EXTENDED_GENRE_PACK_SEEDS.includes(seed))
const preloadGroups: Array<{ family: SeedFamily; seeds: PromptSeed[] }> = [
  { family: 'core', seeds: CORE_PROMPT_SEEDS },
  { family: 'tools', seeds: TOOL_PROMPT_SEEDS },
  { family: 'genre-base', seeds: genreBaseSeeds },
  { family: 'genre-extended', seeds: EXTENDED_GENRE_PACK_SEEDS },
  { family: 'novel', seeds: NOVEL_CONTENT_PROMPT_SEEDS },
]

function withoutDynamicFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutDynamicFields)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !DYNAMIC_FIELDS.has(key))
        .map(([key, nested]) => [key, withoutDynamicFields(nested)]),
    )
  }
  return value
}

function identityFor(family: SeedFamily, seed: PromptSeed): string {
  if (family === 'novel') {
    if (typeof seed.assetId !== 'string' || seed.assetId.length === 0) {
      throw new Error(`novel seed without assetId: ${seed.name}`)
    }
    return `prompt-seed/v1/novel/${seed.assetId}`
  }
  if (family === 'genre-base' || family === 'genre-extended') {
    if (!seed.genres || seed.genres.length !== 1) {
      throw new Error(`genre seed without exactly one genreSlug: ${seed.name}`)
    }
    return `prompt-seed/v1/${family}/${seed.genres[0]}/${seed.moduleKey}`
  }
  return `prompt-seed/v1/${family}/${seed.moduleKey}`
}

/** Pure manifest projection: it receives arrays and has no DB/store dependency. */
function projectManifest(
  groups: Array<{ family: SeedFamily; seeds: PromptSeed[] }>,
  inactivePreview = false,
): ManifestEntry[] {
  return groups.flatMap(({ family, seeds }) => seeds.map((seed, index) => ({
    identity: identityFor(family, seed),
    family,
    order: groups.slice(0, groups.findIndex(group => group.family === family))
      .reduce((total, group) => total + group.seeds.length, 0) + index,
    // An inactive lifecycle preview is a copied projection; it deliberately
    // does not mutate the source arrays or persist anything.
    seed: inactivePreview
      ? { ...withoutDynamicFields(seed) as Record<string, unknown>, isActive: false }
      : withoutDynamicFields(seed) as Record<string, unknown>,
  })))
}

function sortKeysRecursively(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysRecursively)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>).sort()
        .map(key => [key, sortKeysRecursively((value as Record<string, unknown>)[key])]),
    )
  }
  return value
}

function canonicalDigest(manifest: ManifestEntry[]): string {
  return createHash('sha256')
    .update(JSON.stringify(sortKeysRecursively(manifest)), 'utf8')
    .digest('hex')
}

describe('R-PHASE8 · prompt seed lifecycle seguro', () => {
  it('confirma o inventário real e a ordem de preload principal + novel', () => {
    expect(CORE_PROMPT_SEEDS).toHaveLength(17)
    expect(TOOL_PROMPT_SEEDS).toHaveLength(22)
    expect(genreBaseSeeds).toHaveLength(31)
    expect(EXTENDED_GENRE_PACK_SEEDS).toHaveLength(18)
    expect(SYSTEM_PROMPT_SEEDS).toHaveLength(88)
    expect(NOVEL_CONTENT_PROMPT_SEEDS).toHaveLength(118)

    const allSeeds = [...SYSTEM_PROMPT_SEEDS, ...NOVEL_CONTENT_PROMPT_SEEDS]
    expect(allSeeds).toHaveLength(206)
    expect(SYSTEM_PROMPT_SEEDS).toEqual([
      ...CORE_PROMPT_SEEDS,
      ...TOOL_PROMPT_SEEDS,
      ...GENRE_PACK_SEEDS,
    ])
    expect(allSeeds.slice(0, 88)).toEqual(SYSTEM_PROMPT_SEEDS)
    expect(allSeeds.slice(88)).toEqual(NOVEL_CONTENT_PROMPT_SEEDS)
  })

  it('mantém os seeds como templates system inativos e sem campos dinâmicos', () => {
    const allSeeds = [...SYSTEM_PROMPT_SEEDS, ...NOVEL_CONTENT_PROMPT_SEEDS]
    const manifest = projectManifest(preloadGroups, true)
    for (const seed of allSeeds) {
      expect(seed.scope, seed.name).toBe('system')
      expect('id' in seed, seed.name).toBe(false)
      expect('createdAt' in seed, seed.name).toBe(false)
      expect('updatedAt' in seed, seed.name).toBe(false)
    }
    expect(manifest.every(entry => entry.seed.scope === 'system' && entry.seed.isActive === false)).toBe(true)

    const assetIds = NOVEL_CONTENT_PROMPT_SEEDS.map(seed => seed.assetId)
    expect(assetIds.every(assetId => typeof assetId === 'string' && assetId.length > 0)).toBe(true)
    expect(new Set(assetIds).size).toBe(118)
    for (const seed of NOVEL_CONTENT_PROMPT_SEEDS) {
      expect(seed.variableBindings, seed.assetId).toBeDefined()
      const variables = seed.variableBindings!.map(binding => binding.variable)
      expect(new Set(variables).size, seed.assetId).toBe(variables.length)
    }
  })

  it('deriva identidades únicas e preserva somente a colisão de nome conhecida', () => {
    const manifest = projectManifest(preloadGroups)
    expect(new Set(manifest.map(entry => entry.identity)).size).toBe(206)

    const allSeeds = [...SYSTEM_PROMPT_SEEDS, ...NOVEL_CONTENT_PROMPT_SEEDS]
    const duplicateNames = allSeeds.filter((seed, index) => allSeeds
      .findIndex(candidate => candidate.name === seed.name) !== index)
      .map(seed => seed.name)
    expect(new Set(duplicateNames)).toEqual(new Set(['历史包-章节正文']))
    expect(allSeeds.filter(seed => seed.name === '历史包-章节正文')).toHaveLength(2)

    const collisionEntries = manifest.filter(entry => entry.seed.name === '历史包-章节正文')
    expect(collisionEntries.map(entry => entry.family)).toEqual(['genre-base', 'genre-extended'])
    expect(new Set(collisionEntries.map(entry => entry.identity)).size).toBe(2)
  })

  it('fixa o digest legado dos 88 e o digest canônico combinado dos 206', () => {
    const legacyDigest = createHash('sha256')
      .update(JSON.stringify(SYSTEM_PROMPT_SEEDS), 'utf8')
      .digest('hex')
    expect(legacyDigest).toBe('ecadb0be270b13bc871e54ca81032c2f8a06a71bc9d67c8330447a1f82768251')

    const manifest = projectManifest(preloadGroups)
    expect(canonicalDigest(manifest)).toBe('bc35903cd454c44338279df807b13abcc042c0526eb3873a74f6d878790f2499')
  })

  it('projeta um manifesto puro, sem DB/store e sem alterar os arrays reais', () => {
    const before = JSON.stringify(preloadGroups)
    const manifest = projectManifest(preloadGroups)

    expect(manifest).toHaveLength(206)
    expect(JSON.stringify(preloadGroups)).toBe(before)
    expect(projectManifest.toString()).not.toMatch(/\b(?:db|store|usePromptStore)\b/i)
  })
})
