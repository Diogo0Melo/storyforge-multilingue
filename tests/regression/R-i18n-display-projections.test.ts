/**
 * Phase 1 + Phase 3 (i18n) — canonical → localized display projection
 * regression tests.
 *
 * Validates:
 * ① Every canonical value in each projection map resolves to a present locale
 *    key in ALL 3 languages (no silent fallback to raw value for valid data).
 * ② Invalid/corrupted values fall back to the raw persisted value (never a
 *    raw i18n key, never the forbidden `t(key) || raw` pattern). Missing-key
 *    safety (ora-2): when a MAPPED key is missing (t echoes the key back or
 *    returns an equivalent missing-key result), the canonical persisted value
 *    is shown instead — a known canonical value never surfaces a raw key.
 * ③ Batch stage codes are stable language-neutral identifiers.
 * ④ zh-CN behavior is legitimate (keys exist and return Chinese text).
 * ⑤ Phase 3 (docs/I18N-UPSTREAM-MERGE-INVENTORY-20260824.md §4): work status,
 *    narrative module/node/beat kinds, AVG media kinds, adventure
 *    action/quest/outcome kinds and simulation session kinds map every
 *    supported canonical value to a NON-EMPTY localized label in all UI
 *    locales; expected values are derived from source constant arrays.
 * ⑥ TEXTSIM/TEXTWORLD locale wave: narrative simulation turn phases, issue
 *    kind (issue/crisis), issue evolution status (resolved/evolving) and all
 *    Open World region attention levels, region knowledge stages, discovery
 *    triggers and quest categories map every supported canonical value
 *    to a NON-EMPTY localized label in all UI locales; expected values are
 *    transcribed from the SOURCE unions, and the same ora-2 fallback +
 *    missing-key safety contract applies.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import i18n from '../../src/i18n'
import {
  projectCanonicalLabel,
  projectOutlineBatchStage,
  projectDetailedBatchStage,
  projectCharacterDrivenPlanStatus,
  locationTagLabel,
  CHAPTER_STATUS_LABEL_KEYS,
  LAYOUT_RELATION_TYPE_LABEL_KEYS,
  LAYOUT_LOCATION_TYPE_LABEL_KEYS,
  RELATION_TYPE_LABEL_KEYS,
  RELATION_TYPE_LEGEND_LABEL_KEYS,
  SESSION_STATUS_LABEL_KEYS,
  QUEST_STATUS_LABEL_KEYS,
  NODE_RUN_STATUS_LABEL_KEYS,
  CULTIVATION_PROGRESS_STATUS_LABEL_KEYS,
  LOCATION_TAG_LABEL_KEYS,
  OUTLINE_BATCH_STAGE_LABEL_KEYS,
  DETAILED_BATCH_STAGE_LABEL_KEYS,
  CHARACTER_DRIVEN_PLAN_STATUS_LABEL_KEYS,
  WORK_STATUS_LABEL_KEYS,
  INTERACTION_MEMORY_KIND_LABEL_KEYS,
  SIMULATION_SESSION_KIND_LABEL_KEYS,
  NARRATIVE_MODULE_KIND_LABEL_KEYS,
  NARRATIVE_NODE_KIND_LABEL_KEYS,
  NARRATIVE_BEAT_KIND_LABEL_KEYS,
  AVG_MEDIA_KIND_LABEL_KEYS,
  ADVENTURE_ACTION_KIND_LABEL_KEYS,
  ADVENTURE_QUEST_STATUS_LABEL_KEYS,
  ADVENTURE_CHECK_OUTCOME_LABEL_KEYS,
  NARRATIVE_SIMULATION_PHASE_LABEL_KEYS,
  NARRATIVE_SIMULATION_ISSUE_KIND_LABEL_KEYS,
  NARRATIVE_SIMULATION_ISSUE_STATUS_LABEL_KEYS,
  OPEN_WORLD_ATTENTION_LEVEL_LABEL_KEYS,
  OPEN_WORLD_DISCOVERY_TRIGGER_LABEL_KEYS,
  OPEN_WORLD_QUEST_CATEGORY_LABEL_KEYS,
  OPEN_WORLD_REGION_KNOWLEDGE_LABEL_KEYS,
  type DisplayT,
  type NarrativeSimulationIssueKind,
  type NarrativeSimulationIssueStatus,
  type NarrativeSimulationPhase,
} from '../../src/i18n/display-projection'
import { OUTLINE_BATCH_STAGES } from '../../src/lib/ai/batch-outline-runner'
import { BATCH_RUN_STAGES } from '../../src/lib/ai/batch-detail-runner'
import { NARRATIVE_MODULE_KINDS, NARRATIVE_NODE_KINDS } from '../../src/lib/types/narrative-blueprint'
import { NARRATIVE_BEAT_KINDS } from '../../src/lib/types/text-game'
import { AVG_MEDIA_KINDS } from '../../src/lib/types/avg'
import { ADVENTURE_ACTION_KINDS } from '../../src/lib/types/adventure'
import { SIMULATION_SESSION_KINDS } from '../../src/lib/types/simulation-runtime'
import type { ChapterStatus } from '../../src/lib/types/outline'
import type { RelationType } from '../../src/lib/types/character-relation'
import type { LocationTag } from '../../src/lib/types/location'
import type {
  SimulationSessionStatus,
  SimulationTtrpgQuestStatus,
} from '../../src/lib/types/simulation-runtime'
import type { NodeRunStatus } from '../../src/lib/types/node-flow'
import type { CultivationProgressStatus } from '../../src/lib/types/cultivation-progress'
import type { LocationType } from '../../src/lib/types/geography'
import type { CharacterDrivenPlanStatus } from '../../src/lib/types/character-driven-plan'
// Phase 3 (i18n-upstream) canonical sets.
import type { ProjectStatus } from '../../src/lib/types/project'
import type {
  AdventureCheckOutcome,
  AdventureQuestStatus,
} from '../../src/lib/types/adventure'
// TEXTSIM/TEXTWORLD locale wave canonical sets.
import type {
  OpenWorldAttentionLevel,
  OpenWorldDiscoveryTrigger,
  OpenWorldQuestCategory,
  OpenWorldRegionKnowledge,
} from '../../src/lib/types/open-world'

const LANGS = ['pt-BR', 'en', 'zh-CN'] as const

/** Resolve a dotted key within a namespace bundle for a given language. */
function resolveKey(ns: string, key: string, lang: string): unknown {
  const bundle = i18n.getResourceBundle(lang, ns)
  if (!bundle) return undefined
  const parts = key.split('.')
  let current: unknown = bundle
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/** Assert every key in a map exists in all 3 locale bundles for the given ns. */
function assertAllKeysPresent(ns: string, keyMap: Record<string, string>, groupName: string) {
  const failures: string[] = []
  for (const [value, key] of Object.entries(keyMap)) {
    for (const lang of LANGS) {
      const resolved = resolveKey(ns, key, lang)
      if (resolved === undefined) {
        failures.push(`[${lang}] ${ns}:${key} (canonical: "${value}")`)
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Projection group "${groupName}" has ${failures.length} missing locale key(s):\n` +
      failures.join('\n'),
    )
  }
}

/**
 * Stronger presence check (Phase 3): every mapped key must resolve to a
 * NON-EMPTY string label in all supported UI locales — presence alone is not
 * enough; an empty label would render nothing for valid canonical data.
 */
function assertAllLabelsNonEmpty(ns: string, keyMap: Record<string, string>, groupName: string) {
  const failures: string[] = []
  for (const [value, key] of Object.entries(keyMap)) {
    for (const lang of LANGS) {
      const resolved = resolveKey(ns, key, lang)
      if (typeof resolved !== 'string' || resolved.trim() === '') {
        failures.push(`[${lang}] ${ns}:${key} (canonical: "${value}") → ${JSON.stringify(resolved) ?? 'undefined'}`)
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Projection group "${groupName}" has ${failures.length} empty/non-string label(s):\n` +
      failures.join('\n'),
    )
  }
}

// ── ① Key presence: all canonical values resolve in all 3 locales ──────────

describe('display projection key presence', () => {
  it('layout: chapterStatusValue covers all ChapterStatus values', () => {
    assertAllKeysPresent('layout', CHAPTER_STATUS_LABEL_KEYS, 'layout.chapterStatusValue')
  })

  it('layout: relationTypes covers all RelationType values', () => {
    assertAllKeysPresent('layout', LAYOUT_RELATION_TYPE_LABEL_KEYS, 'layout.relationTypes')
  })

  it('layout: locationTypes covers all LocationType values', () => {
    assertAllKeysPresent('layout', LAYOUT_LOCATION_TYPE_LABEL_KEYS, 'layout.locationTypes')
  })

  it('relations: types covers all RelationType values', () => {
    assertAllKeysPresent('relations', RELATION_TYPE_LABEL_KEYS, 'relations.types')
  })

  it('relations: graphLegend covers all RelationType values', () => {
    assertAllKeysPresent('relations', RELATION_TYPE_LEGEND_LABEL_KEYS, 'relations.graphLegend')
  })

  it('simulation: sessionStatus covers all SimulationSessionStatus values', () => {
    assertAllKeysPresent('simulation', SESSION_STATUS_LABEL_KEYS, 'simulation.sessionStatus')
  })

  it('simulation: questStatus keys (reused from campaign.*) cover all quest statuses', () => {
    assertAllKeysPresent('simulation', QUEST_STATUS_LABEL_KEYS, 'simulation.questStatus')
  })

  it('node-authoring + node-flow: runStatus covers all NodeRunStatus values', () => {
    assertAllKeysPresent('node-authoring', NODE_RUN_STATUS_LABEL_KEYS, 'node-authoring.runStatus')
    assertAllKeysPresent('node-flow', NODE_RUN_STATUS_LABEL_KEYS, 'node-flow.runStatus')
  })

  it('cultivation: eventStatus covers all CultivationProgressStatus values', () => {
    assertAllKeysPresent('cultivation', CULTIVATION_PROGRESS_STATUS_LABEL_KEYS, 'cultivation.eventStatus')
  })

  it('location: tags covers all 61 canonical LocationTag values', () => {
    assertAllKeysPresent('location', LOCATION_TAG_LABEL_KEYS, 'location.tags')
    // Ensure the map has exactly the expected count
    expect(Object.keys(LOCATION_TAG_LABEL_KEYS)).toHaveLength(61)
  })

  it('outline: batch.stage keys cover all known stage codes', () => {
    assertAllKeysPresent('outline', OUTLINE_BATCH_STAGE_LABEL_KEYS, 'outline.batch.stage')
  })

  it('outline: detailed.batchStage keys cover all known detail stage codes', () => {
    assertAllKeysPresent('outline', DETAILED_BATCH_STAGE_LABEL_KEYS, 'outline.detailed.batchStage')
  })

  it('outline: characterDriven.planStatus keys cover all plan statuses', () => {
    assertAllKeysPresent('outline', CHARACTER_DRIVEN_PLAN_STATUS_LABEL_KEYS, 'outline.characterDriven.planStatus')
  })
})

// ── ② Invalid value fallback: raw value shown, never a key ────────────────

describe('display projection invalid-value fallback', () => {
  const fakeT = (...args: any[]): string => {
    // Simulate i18next behavior: return the key if not found
    const key = typeof args[0] === 'string' ? args[0] : ''
    return key
  }

  it('projectCanonicalLabel returns raw value for unknown canonical', () => {
    const result = projectCanonicalLabel(fakeT, CHAPTER_STATUS_LABEL_KEYS, 'nonexistent-status')
    expect(result).toBe('nonexistent-status')
  })

  it('projectCanonicalLabel returns raw value for empty string', () => {
    const result = projectCanonicalLabel(fakeT, RELATION_TYPE_LABEL_KEYS, '')
    expect(result).toBe('')
  })

  it('locationTagLabel returns raw value for unknown tag', () => {
    const result = locationTagLabel(fakeT, '不存在的标签')
    expect(result).toBe('不存在的标签')
  })

  it('projectOutlineBatchStage returns legacy prose unchanged for unknown codes', () => {
    const progress = {
      stage: '正在生成「某卷」的章节大纲...',
      currentVolumeTitle: '某卷',
      parsedChapters: [],
    }
    const result = projectOutlineBatchStage(fakeT, progress)
    expect(result).toBe('正在生成「某卷」的章节大纲...')
  })

  it('projectDetailedBatchStage returns legacy prose unchanged for unknown codes', () => {
    const progress = {
      stage: '正在生成第二章',
      currentTitle: '第二章',
    }
    const result = projectDetailedBatchStage(fakeT, progress)
    expect(result).toBe('正在生成第二章')
  })

  it('projectCharacterDrivenPlanStatus returns raw value for unknown legacy status', () => {
    const result = projectCharacterDrivenPlanStatus(fakeT, 'some-legacy-status')
    expect(result).toBe('some-legacy-status')
  })

  it('projectCanonicalLabel falls back to the canonical value when the mapped key is missing (t echoes the key)', () => {
    // fakeT simulates i18next missing-key behavior (returns the key itself).
    // ora-2: a known canonical value must NEVER surface a raw i18n key — the
    // canonical persisted value is the visible fallback.
    for (const value of Object.keys(CHAPTER_STATUS_LABEL_KEYS)) {
      const result = projectCanonicalLabel(fakeT, CHAPTER_STATUS_LABEL_KEYS, value)
      expect(result).toBe(value)
      expect(result).not.toContain('.')
    }
  })

  it('projectCanonicalLabel falls back to the canonical value for empty/null missing-key results', () => {
    const emptyT = (..._args: any[]): string => ''
    expect(projectCanonicalLabel(emptyT, CHAPTER_STATUS_LABEL_KEYS, 'draft')).toBe('draft')
    const nullT = (() => null) as unknown as DisplayT
    expect(projectCanonicalLabel(nullT, CHAPTER_STATUS_LABEL_KEYS, 'draft')).toBe('draft')
  })

  it('projectCanonicalLabel still returns the localized value when the key is present', () => {
    const localizedT = (...args: any[]): string => `<${typeof args[0] === 'string' ? args[0] : ''}>`
    expect(projectCanonicalLabel(localizedT, CHAPTER_STATUS_LABEL_KEYS, 'draft'))
      .toBe(`<${CHAPTER_STATUS_LABEL_KEYS.draft}>`)
    expect(projectCharacterDrivenPlanStatus(localizedT, 'adopted'))
      .toBe(`<${CHARACTER_DRIVEN_PLAN_STATUS_LABEL_KEYS.adopted}>`)
    expect(locationTagLabel(localizedT, '大陆'))
      .toBe(`<${LOCATION_TAG_LABEL_KEYS['大陆']}>`)
  })

  it('projectOutlineBatchStage returns canonical stage code when mapped key is missing (t echoes key)', () => {
    // fakeT echoes the key back — simulates missing translation.
    for (const code of Object.keys(OUTLINE_BATCH_STAGE_LABEL_KEYS)) {
      const result = projectOutlineBatchStage(fakeT, {
        stage: code,
        currentVolumeTitle: '某卷',
        parsedChapters: [{}, {}],
      })
      expect(result).toBe(code)
      expect(result).not.toContain('.')
    }
  })

  it('projectDetailedBatchStage returns canonical stage code when mapped key is missing (t echoes key)', () => {
    // fakeT echoes the key back — simulates missing translation.
    for (const code of Object.keys(DETAILED_BATCH_STAGE_LABEL_KEYS)) {
      const result = projectDetailedBatchStage(fakeT, {
        stage: code,
        currentTitle: '某章',
        generated: 3,
        skipped: 1,
      })
      expect(result).toBe(code)
      expect(result).not.toContain('.')
    }
  })

  it('projectOutlineBatchStage returns canonical stage code for empty missing-key result', () => {
    const emptyT = (..._args: any[]): string => ''
    expect(projectOutlineBatchStage(emptyT, {
      stage: 'generating-volume',
      currentVolumeTitle: '某卷',
      parsedChapters: [],
    })).toBe('generating-volume')
  })

  it('projectDetailedBatchStage returns canonical stage code for empty missing-key result', () => {
    const emptyT = (..._args: any[]): string => ''
    expect(projectDetailedBatchStage(emptyT, {
      stage: 'generating-detail',
      currentTitle: '某章',
    })).toBe('generating-detail')
  })
})

// ── ③ Batch stage codes are stable language-neutral identifiers ────────────

describe('batch stage code stability', () => {
  const CJK_REGEX = /[\u4e00-\u9fff]/

  it('OUTLINE_BATCH_STAGE_LABEL_KEYS keys are kebab-case identifiers', () => {
    for (const code of Object.keys(OUTLINE_BATCH_STAGE_LABEL_KEYS)) {
      expect(code).toMatch(/^[a-z]+(-[a-z]+)*$/)
    }
  })

  it('DETAILED_BATCH_STAGE_LABEL_KEYS keys are kebab-case identifiers', () => {
    for (const code of Object.keys(DETAILED_BATCH_STAGE_LABEL_KEYS)) {
      expect(code).toMatch(/^[a-z]+(-[a-z]+)*$/)
    }
  })

  it('stage codes do not contain CJK or translated prose', () => {
    for (const code of [
      ...Object.keys(OUTLINE_BATCH_STAGE_LABEL_KEYS),
      ...Object.keys(DETAILED_BATCH_STAGE_LABEL_KEYS),
      ...OUTLINE_BATCH_STAGES,
      ...BATCH_RUN_STAGES,
    ]) {
      expect(CJK_REGEX.test(code)).toBe(false)
    }
  })

  it('batch-outline-runner emits stable stage codes, not Chinese progress prose', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/lib/ai/batch-outline-runner.ts'),
      'utf8',
    )
    // The known legacy prose fragments must be gone from the source.
    for (const legacy of ['正在生成「', '完成，生成了', '生成失败，已跳过']) {
      expect(source).not.toContain(legacy)
    }
    // Every registered stable code is emitted by the runner.
    for (const code of OUTLINE_BATCH_STAGES) {
      expect(source).toContain(`stage: '${code}'`)
    }
  })
})

// ── ③b Canonical projection at render time (interpolation parity) ─────────

describe('outline display projection render-time mapping', () => {
  const recordingT = (...args: any[]): string => {
    const key = typeof args[0] === 'string' ? args[0] : ''
    const opts = (args[1] ?? {}) as Record<string, unknown>
    const flat = Object.entries(opts)
      .map(([name, value]) => `${name}=${value}`)
      .sort()
      .join('&')
    return flat ? `${key}?${flat}` : key
  }

  it('projectCharacterDrivenPlanStatus projects all canonical statuses to outline keys', () => {
    // Non-echoing t: a raw key echo is treated as a missing key (ora-2) and
    // falls back to the canonical value, so record through a marker wrapper.
    const localizedRecordingT = (...args: any[]): string => `⟨${recordingT(...args)}⟩`
    expect(projectCharacterDrivenPlanStatus(localizedRecordingT, 'draft')).toBe('⟨characterDriven.planStatus.draft⟩')
    expect(projectCharacterDrivenPlanStatus(localizedRecordingT, 'generated')).toBe('⟨characterDriven.planStatus.generated⟩')
    expect(projectCharacterDrivenPlanStatus(localizedRecordingT, 'adopted')).toBe('⟨characterDriven.planStatus.adopted⟩')
  })

  it('projectOutlineBatchStage projects canonical codes with title/count interpolation', () => {
    expect(projectOutlineBatchStage(recordingT, {
      stage: 'generating-volume',
      currentVolumeTitle: '第一卷',
      parsedChapters: [],
    })).toBe('batch.stage.generatingVolume?title=第一卷')

    expect(projectOutlineBatchStage(recordingT, {
      stage: 'volume-complete',
      currentVolumeTitle: '第一卷',
      parsedChapters: [{}, {}],
    })).toBe('batch.stage.volumeComplete?count=2&title=第一卷')

    expect(projectOutlineBatchStage(recordingT, {
      stage: 'volume-failed',
      currentVolumeTitle: '第一卷',
      parsedChapters: [],
    })).toBe('batch.stage.volumeFailed?title=第一卷')
  })

  it('projectDetailedBatchStage projects canonical codes; done interpolates generated/skipped', () => {
    expect(projectDetailedBatchStage(recordingT, {
      stage: 'generating-detail',
      currentTitle: '第二章',
    })).toBe('detailed.batchStage.generatingDetail?title=第二章')

    expect(projectDetailedBatchStage(recordingT, {
      stage: 'generating-chapter',
      currentTitle: '第三章',
    })).toBe('detailed.batchStage.generatingChapter?title=第三章')

    expect(projectDetailedBatchStage(recordingT, {
      stage: 'done',
      currentTitle: '',
      generated: 5,
      skipped: 2,
    })).toBe('detailed.batchStage.done?generated=5&skipped=2')
  })

  it('outline batch stage and plan status labels keep interpolation parity across all 3 locales', () => {
    const groups = [
      OUTLINE_BATCH_STAGE_LABEL_KEYS,
      DETAILED_BATCH_STAGE_LABEL_KEYS,
      CHARACTER_DRIVEN_PLAN_STATUS_LABEL_KEYS,
    ]
    for (const keyMap of groups) {
      for (const key of Object.values(keyMap)) {
        const placeholderSets = LANGS.map(lang => {
          const value = resolveKey('outline', key, lang)
          expect(typeof value).toBe('string')
          const placeholders = [...String(value).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()
          return JSON.stringify(placeholders)
        })
        expect(new Set(placeholderSets).size).toBe(1)
      }
    }
  })
})

// ── ④ zh-CN behavior is legitimate ────────────────────────────────────────

describe('zh-CN display projection legitimacy', () => {
  it('zh-CN location tags resolve to Chinese text', () => {
    const sampleTags: LocationTag[] = ['大陆', '森林', '村庄', '宗门']
    for (const tag of sampleTags) {
      const key = LOCATION_TAG_LABEL_KEYS[tag]
      expect(key).toBeDefined()
      const value = resolveKey('location', key, 'zh-CN')
      expect(typeof value).toBe('string')
      expect((value as string).length).toBeGreaterThan(0)
    }
  })

  it('zh-CN relation types resolve to Chinese text', () => {
    const sampleTypes: RelationType[] = ['family', 'enemy', 'master']
    for (const type of sampleTypes) {
      const key = RELATION_TYPE_LABEL_KEYS[type]
      const value = resolveKey('relations', key, 'zh-CN')
      expect(typeof value).toBe('string')
      expect((value as string).length).toBeGreaterThan(0)
    }
  })

  it('zh-CN session statuses resolve to Chinese text', () => {
    for (const status of ['active', 'paused', 'archived'] as SimulationSessionStatus[]) {
      const key = SESSION_STATUS_LABEL_KEYS[status]
      const value = resolveKey('simulation', key, 'zh-CN')
      expect(typeof value).toBe('string')
      expect((value as string).length).toBeGreaterThan(0)
    }
  })
})

// ── ⑤ Map completeness: maps cover the full canonical enum ────────────────

describe('projection map completeness', () => {
  it('CHAPTER_STATUS_LABEL_KEYS covers all 5 chapter statuses', () => {
    const expected: ChapterStatus[] = ['outline', 'draft', 'revised', 'polished', 'final']
    expect(Object.keys(CHAPTER_STATUS_LABEL_KEYS).sort()).toEqual(expected.sort())
  })

  it('RELATION_TYPE_LABEL_KEYS covers all 10 relation types', () => {
    const expected: RelationType[] = ['family', 'lover', 'friend', 'rival', 'enemy', 'master', 'student', 'ally', 'subordinate', 'other']
    expect(Object.keys(RELATION_TYPE_LABEL_KEYS).sort()).toEqual(expected.sort())
  })

  it('SESSION_STATUS_LABEL_KEYS covers all 3 session statuses', () => {
    const expected: SimulationSessionStatus[] = ['active', 'paused', 'archived']
    expect(Object.keys(SESSION_STATUS_LABEL_KEYS).sort()).toEqual(expected.sort())
  })

  it('QUEST_STATUS_LABEL_KEYS covers all 4 quest statuses', () => {
    const expected: SimulationTtrpgQuestStatus[] = ['active', 'paused', 'completed', 'failed']
    expect(Object.keys(QUEST_STATUS_LABEL_KEYS).sort()).toEqual(expected.sort())
  })

  it('NODE_RUN_STATUS_LABEL_KEYS covers all 5 run statuses', () => {
    const expected: NodeRunStatus[] = ['running', 'paused', 'completed', 'failed', 'cancelled']
    expect(Object.keys(NODE_RUN_STATUS_LABEL_KEYS).sort()).toEqual(expected.sort())
  })

  it('CULTIVATION_PROGRESS_STATUS_LABEL_KEYS covers all 3 progress statuses', () => {
    const expected: CultivationProgressStatus[] = ['confirmed', 'stale', 'source-missing']
    expect(Object.keys(CULTIVATION_PROGRESS_STATUS_LABEL_KEYS).sort()).toEqual(expected.sort())
  })

  it('LAYOUT_LOCATION_TYPE_LABEL_KEYS covers all 10 location types', () => {
    const expected: LocationType[] = ['continent', 'country', 'city', 'sect', 'secret', 'ruin', 'battlefield', 'nature', 'building', 'other']
    expect(Object.keys(LAYOUT_LOCATION_TYPE_LABEL_KEYS).sort()).toEqual(expected.sort())
  })

  it('CHARACTER_DRIVEN_PLAN_STATUS_LABEL_KEYS covers all 3 plan statuses', () => {
    const expected: CharacterDrivenPlanStatus[] = ['draft', 'generated', 'adopted']
    expect(Object.keys(CHARACTER_DRIVEN_PLAN_STATUS_LABEL_KEYS).sort()).toEqual(expected.sort())
  })

  it('OUTLINE_BATCH_STAGE_LABEL_KEYS covers exactly the runner OUTLINE_BATCH_STAGES codes', () => {
    expect(Object.keys(OUTLINE_BATCH_STAGE_LABEL_KEYS).sort()).toEqual([...OUTLINE_BATCH_STAGES].sort())
  })

  it('DETAILED_BATCH_STAGE_LABEL_KEYS covers exactly the BATCH_RUN_STAGES codes', () => {
    expect(Object.keys(DETAILED_BATCH_STAGE_LABEL_KEYS).sort()).toEqual([...BATCH_RUN_STAGES].sort())
  })
})

// ── ⑥ Readiness gating: consumers check ready before rendering ────────────

describe('outline sidebar readiness gating (ora-blocker)', () => {
  it('OutlineVolumeSidebar destructures ready from useDomainT and gates render', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/components/outline/OutlineVolumeSidebar.tsx'),
      'utf8',
    )
    // Must destructure ready alongside t
    expect(source).toContain('ready')
    expect(source).toMatch(/useDomainT\(['"]outline['"]\)/)
    // Must have an early return before the main render
    expect(source).toMatch(/if\s*\(\s*!ready\s*\)\s*return\s+null/)
  })

  it('DetailedOutlineSidebar destructures ready from useDomainT and gates render', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/components/outline/DetailedOutlineSidebar.tsx'),
      'utf8',
    )
    // Must destructure ready alongside t
    expect(source).toContain('ready')
    expect(source).toMatch(/useDomainT\(['"]outline['"]\)/)
    // Must have an early return before the main render
    expect(source).toMatch(/if\s*\(\s*!ready\s*\)\s*return\s+null/)
  })
})

// ── ⑦ Stage helpers never return raw i18n keys (ora-2 for stage maps) ────

describe('stage projection missing-key safety (ora-2)', () => {
  it('projectOutlineBatchStage never surfaces a raw key for known canonical codes', () => {
    // keyEchoT returns the key itself — worst-case missing translation
    const keyEchoT = (...args: any[]): string => (typeof args[0] === 'string' ? args[0] : '')
    for (const code of Object.keys(OUTLINE_BATCH_STAGE_LABEL_KEYS)) {
      const result = projectOutlineBatchStage(keyEchoT, {
        stage: code,
        currentVolumeTitle: '测试卷',
        parsedChapters: [{}],
      })
      // Must be the canonical code, NOT the dotted locale key
      expect(result).toBe(code)
      expect(result).not.toBe(OUTLINE_BATCH_STAGE_LABEL_KEYS[code])
      expect(result).not.toContain('.')
    }
  })

  it('projectDetailedBatchStage never surfaces a raw key for known canonical codes', () => {
    const keyEchoT = (...args: any[]): string => (typeof args[0] === 'string' ? args[0] : '')
    for (const code of Object.keys(DETAILED_BATCH_STAGE_LABEL_KEYS)) {
      const result = projectDetailedBatchStage(keyEchoT, {
        stage: code,
        currentTitle: '测试章',
        generated: 1,
        skipped: 0,
      })
      expect(result).toBe(code)
      expect(result).not.toBe(DETAILED_BATCH_STAGE_LABEL_KEYS[code])
      expect(result).not.toContain('.')
    }
  })
})

// ── ⑧ Phase 3 (i18n-upstream): work status + interactive product kinds ────
//
// Canonical sets from docs/I18N-UPSTREAM-MERGE-INVENTORY-20260824.md §4.
// Expected values are derived from the SOURCE constant arrays (never from the
// manifest prose), so an upstream rename/spelling change fails loudly here.

/** All Phase 3 shared maps, with the single ns each is bound to. */
const PHASE_3_PROJECTIONS: Array<{ ns: string; map: Record<string, string>; name: string }> = [
  { ns: 'pages', map: WORK_STATUS_LABEL_KEYS, name: 'workStatus' },
  { ns: 'simulation', map: INTERACTION_MEMORY_KIND_LABEL_KEYS, name: 'interactionMemoryKind' },
  { ns: 'simulation', map: SIMULATION_SESSION_KIND_LABEL_KEYS, name: 'sessionKind' },
  { ns: 'simulation', map: NARRATIVE_MODULE_KIND_LABEL_KEYS, name: 'moduleKind' },
  { ns: 'simulation', map: NARRATIVE_NODE_KIND_LABEL_KEYS, name: 'nodeKind' },
  { ns: 'simulation', map: NARRATIVE_BEAT_KIND_LABEL_KEYS, name: 'beatKind' },
  { ns: 'simulation', map: AVG_MEDIA_KIND_LABEL_KEYS, name: 'mediaKind' },
  { ns: 'simulation', map: ADVENTURE_ACTION_KIND_LABEL_KEYS, name: 'adventure.actionKind' },
  { ns: 'simulation', map: ADVENTURE_QUEST_STATUS_LABEL_KEYS, name: 'adventure.questStatus' },
  { ns: 'simulation', map: ADVENTURE_CHECK_OUTCOME_LABEL_KEYS, name: 'adventure.checkOutcome' },
]

describe('phase 3 projection label coverage', () => {
  for (const { ns, map, name } of PHASE_3_PROJECTIONS) {
    it(`${ns}: ${name} maps every supported canonical value to a non-empty localized label in all UI locales`, () => {
      assertAllKeysPresent(ns, map, `phase3.${name}`)
      assertAllLabelsNonEmpty(ns, map, `phase3.${name}`)
    })
  }

  it('AvgMediaKind source spelling is pinned (derived from src/lib/types/avg.ts)', () => {
    // Guards against silent upstream renames: the manifest spelling was NOT
    // trusted — this list is transcribed from AVG_MEDIA_KINDS and both sides
    // must stay in lockstep with the shared projection map.
    expect([...AVG_MEDIA_KINDS].sort()).toEqual([
      'ambience', 'background', 'bgm', 'cg', 'character-expression',
      'character-pose', 'sfx', 'ui', 'voice',
    ].sort())
    expect(Object.keys(AVG_MEDIA_KIND_LABEL_KEYS).sort()).toEqual([...AVG_MEDIA_KINDS].sort())
  })
})

describe('phase 3 map completeness vs canonical sources', () => {
  it('WORK_STATUS_LABEL_KEYS covers all ProjectStatus values', () => {
    const expected: ProjectStatus[] = ['drafting', 'ongoing', 'paused', 'completed']
    expect(Object.keys(WORK_STATUS_LABEL_KEYS).sort()).toEqual(expected.sort())
  })

  it('SIMULATION_SESSION_KIND_LABEL_KEYS covers exactly SIMULATION_SESSION_KINDS', () => {
    expect(Object.keys(SIMULATION_SESSION_KIND_LABEL_KEYS).sort()).toEqual([...SIMULATION_SESSION_KINDS].sort())
  })

  it('INTERACTION_MEMORY_KIND_LABEL_KEYS covers exactly the canonical memory kinds', () => {
    expect(Object.keys(INTERACTION_MEMORY_KIND_LABEL_KEYS).sort()).toEqual([
      'scene-summary', 'key-memory', 'commitment', 'secret', 'conflict', 'gift',
    ].sort())
  })

  it('NARRATIVE_MODULE_KIND_LABEL_KEYS covers exactly NARRATIVE_MODULE_KINDS', () => {
    expect(Object.keys(NARRATIVE_MODULE_KIND_LABEL_KEYS).sort()).toEqual([...NARRATIVE_MODULE_KINDS].sort())
  })

  it('NARRATIVE_NODE_KIND_LABEL_KEYS covers exactly NARRATIVE_NODE_KINDS', () => {
    expect(Object.keys(NARRATIVE_NODE_KIND_LABEL_KEYS).sort()).toEqual([...NARRATIVE_NODE_KINDS].sort())
  })

  it('NARRATIVE_BEAT_KIND_LABEL_KEYS covers exactly NARRATIVE_BEAT_KINDS', () => {
    expect(Object.keys(NARRATIVE_BEAT_KIND_LABEL_KEYS).sort()).toEqual([...NARRATIVE_BEAT_KINDS].sort())
  })

  it('ADVENTURE_ACTION_KIND_LABEL_KEYS covers exactly ADVENTURE_ACTION_KINDS', () => {
    expect(Object.keys(ADVENTURE_ACTION_KIND_LABEL_KEYS).sort()).toEqual([...ADVENTURE_ACTION_KINDS].sort())
  })

  it('ADVENTURE_QUEST_STATUS_LABEL_KEYS covers all AdventureQuestStatus values', () => {
    const expected: AdventureQuestStatus[] = ['locked', 'available', 'active', 'completed', 'failed']
    expect(Object.keys(ADVENTURE_QUEST_STATUS_LABEL_KEYS).sort()).toEqual(expected.sort())
  })

  it('ADVENTURE_CHECK_OUTCOME_LABEL_KEYS covers all AdventureCheckOutcome values', () => {
    const expected: AdventureCheckOutcome[] = ['success', 'costly-success', 'failure', 'not-attempted']
    expect(Object.keys(ADVENTURE_CHECK_OUTCOME_LABEL_KEYS).sort()).toEqual(expected.sort())
  })
})

describe('phase 3 invalid-value fallback (ora-2)', () => {
  const keyEchoT = (...args: any[]): string => (typeof args[0] === 'string' ? args[0] : '')

  it('unknown/corrupted canonical values fall back to the raw persisted value', () => {
    expect(projectCanonicalLabel(keyEchoT, WORK_STATUS_LABEL_KEYS, 'corrupted-status')).toBe('corrupted-status')
    expect(projectCanonicalLabel(keyEchoT, SIMULATION_SESSION_KIND_LABEL_KEYS, 'no-such-kind')).toBe('no-such-kind')
    expect(projectCanonicalLabel(keyEchoT, INTERACTION_MEMORY_KIND_LABEL_KEYS, 'unknown-memory-kind')).toBe('unknown-memory-kind')
    expect(projectCanonicalLabel(keyEchoT, NARRATIVE_MODULE_KIND_LABEL_KEYS, '')).toBe('')
    expect(projectCanonicalLabel(keyEchoT, NARRATIVE_NODE_KIND_LABEL_KEYS, 'legacy-node')).toBe('legacy-node')
    expect(projectCanonicalLabel(keyEchoT, NARRATIVE_BEAT_KIND_LABEL_KEYS, 'song')).toBe('song')
    expect(projectCanonicalLabel(keyEchoT, AVG_MEDIA_KIND_LABEL_KEYS, 'hologram')).toBe('hologram')
    expect(projectCanonicalLabel(keyEchoT, ADVENTURE_ACTION_KIND_LABEL_KEYS, 'fly')).toBe('fly')
    expect(projectCanonicalLabel(keyEchoT, ADVENTURE_QUEST_STATUS_LABEL_KEYS, 'expired')).toBe('expired')
    expect(projectCanonicalLabel(keyEchoT, ADVENTURE_CHECK_OUTCOME_LABEL_KEYS, 'critical')).toBe('critical')
  })

  it('a known canonical value NEVER surfaces a raw i18n key when its mapped key is missing', () => {
    // Worst case: t() echoes the mapped dotted key back. The projection must
    // return the canonical persisted value instead — never the dotted key.
    for (const { map, name } of PHASE_3_PROJECTIONS) {
      for (const value of Object.keys(map)) {
        const result = projectCanonicalLabel(keyEchoT, map, value)
        expect(result, `${name}:${value}`).toBe(value)
        expect(result, `${name}:${value}`).not.toContain('.')
      }
    }
  })

  it('empty/null missing-key results also fall back to the canonical value', () => {
    const emptyT = (..._args: any[]): string => ''
    const nullT = (() => null) as unknown as DisplayT
    for (const { map } of PHASE_3_PROJECTIONS) {
      for (const value of Object.keys(map)) {
        expect(projectCanonicalLabel(emptyT, map, value)).toBe(value)
        expect(projectCanonicalLabel(nullT, map, value)).toBe(value)
      }
    }
  })

  it('known values still project through t() when the key resolves', () => {
    const localizedT = (...args: any[]): string => `<${typeof args[0] === 'string' ? args[0] : ''}>`
    expect(projectCanonicalLabel(localizedT, SIMULATION_SESSION_KIND_LABEL_KEYS, 'textadventure'))
      .toBe(`<${SIMULATION_SESSION_KIND_LABEL_KEYS.textadventure}>`)
    expect(projectCanonicalLabel(localizedT, AVG_MEDIA_KIND_LABEL_KEYS, 'character-pose'))
      .toBe(`<${AVG_MEDIA_KIND_LABEL_KEYS['character-pose']}>`)
    expect(projectCanonicalLabel(localizedT, WORK_STATUS_LABEL_KEYS, 'drafting'))
      .toBe(`<${WORK_STATUS_LABEL_KEYS.drafting}>`)
  })

  it('zh-CN phase 3 labels resolve to Chinese text (legitimacy spot check)', () => {
    expect(resolveKey('simulation', 'kind.textadventure', 'zh-CN')).toBe('文字冒险')
    expect(resolveKey('simulation', 'beatKind.narration', 'zh-CN')).toBe('旁白')
    expect(resolveKey('simulation', 'adventure.questStatus.locked', 'zh-CN')).toBe('未解锁')
    expect(resolveKey('pages', 'home.statusDrafting', 'zh-CN')).toBe('构思中')
  })
})

// ── ⑨ TEXTSIM/TEXTWORLD locale wave: narrative simulation + open world ────
//
// Canonical sets rendered by NarrativeSimulationPlayer (TEXTSIM-1) and
// TextOpenWorldPlayer (TEXTWORLD-1). Expected values are transcribed from
// the SOURCE unions — `SimulationNarrativeSimulationState['phase']` and
// `NarrativeSimulationIssueDefinition.crisis` /
// `NarrativeSimulationIssueState.resolved`
// (src/lib/types/narrative-simulation.ts) plus `OpenWorldAttentionLevel`,
// `OpenWorldRegionKnowledge`, `OpenWorldDiscoveryTrigger` and
// `OpenWorldQuestCategory` (src/lib/types/open-world.ts) — never from
// locale prose, so an upstream rename/spelling change fails loudly here.

/** All TEXTSIM/TEXTWORLD shared maps, with the single ns each is bound to. */
const TEXTSIM_TEXTWORLD_PROJECTIONS: Array<{ ns: string; map: Record<string, string>; name: string }> = [
  { ns: 'simulation', map: NARRATIVE_SIMULATION_PHASE_LABEL_KEYS, name: 'phase' },
  { ns: 'simulation', map: NARRATIVE_SIMULATION_ISSUE_KIND_LABEL_KEYS, name: 'issueKind' },
  { ns: 'simulation', map: NARRATIVE_SIMULATION_ISSUE_STATUS_LABEL_KEYS, name: 'issueStatus' },
  { ns: 'simulation', map: OPEN_WORLD_ATTENTION_LEVEL_LABEL_KEYS, name: 'openWorld.attentionLevel' },
  { ns: 'simulation', map: OPEN_WORLD_REGION_KNOWLEDGE_LABEL_KEYS, name: 'openWorld.regionKnowledge' },
  { ns: 'simulation', map: OPEN_WORLD_DISCOVERY_TRIGGER_LABEL_KEYS, name: 'openWorld.trigger' },
  { ns: 'simulation', map: OPEN_WORLD_QUEST_CATEGORY_LABEL_KEYS, name: 'openWorld.questCategory' },
]

describe('textsim/textworld projection label coverage', () => {
  for (const { ns, map, name } of TEXTSIM_TEXTWORLD_PROJECTIONS) {
    it(`${ns}: ${name} maps every supported canonical value to a non-empty localized label in all UI locales`, () => {
      assertAllKeysPresent(ns, map, `textsim-textworld.${name}`)
      assertAllLabelsNonEmpty(ns, map, `textsim-textworld.${name}`)
    })
  }
})

describe('textsim/textworld map completeness vs canonical sources', () => {
  it('NARRATIVE_SIMULATION_PHASE_LABEL_KEYS covers all SimulationNarrativeSimulationState phase values', () => {
    const expected: NarrativeSimulationPhase[] = ['planning', 'resolving', 'ended']
    expect(Object.keys(NARRATIVE_SIMULATION_PHASE_LABEL_KEYS).sort()).toEqual(expected.sort())
  })

  it('NARRATIVE_SIMULATION_ISSUE_KIND_LABEL_KEYS covers issue/crisis', () => {
    const expected: NarrativeSimulationIssueKind[] = ['issue', 'crisis']
    expect(Object.keys(NARRATIVE_SIMULATION_ISSUE_KIND_LABEL_KEYS).sort()).toEqual(expected.sort())
  })

  it('NARRATIVE_SIMULATION_ISSUE_STATUS_LABEL_KEYS covers resolved/evolving', () => {
    const expected: NarrativeSimulationIssueStatus[] = ['resolved', 'evolving']
    expect(Object.keys(NARRATIVE_SIMULATION_ISSUE_STATUS_LABEL_KEYS).sort()).toEqual(expected.sort())
  })

  it('OPEN_WORLD_ATTENTION_LEVEL_LABEL_KEYS covers all OpenWorldAttentionLevel values', () => {
    const expected: OpenWorldAttentionLevel[] = ['focus', 'active', 'background']
    expect(Object.keys(OPEN_WORLD_ATTENTION_LEVEL_LABEL_KEYS).sort()).toEqual(expected.sort())
  })

  it('OPEN_WORLD_REGION_KNOWLEDGE_LABEL_KEYS covers all OpenWorldRegionKnowledge values', () => {
    const expected: OpenWorldRegionKnowledge[] = ['unknown', 'heard', 'visited', 'familiar']
    expect(Object.keys(OPEN_WORLD_REGION_KNOWLEDGE_LABEL_KEYS).sort()).toEqual(expected.sort())
  })

  it('OPEN_WORLD_DISCOVERY_TRIGGER_LABEL_KEYS covers all OpenWorldDiscoveryTrigger values', () => {
    const expected: OpenWorldDiscoveryTrigger[] = ['observe', 'social', 'explore', 'rest', 'travel', 'combat']
    expect(Object.keys(OPEN_WORLD_DISCOVERY_TRIGGER_LABEL_KEYS).sort()).toEqual(expected.sort())
  })

  it('OPEN_WORLD_QUEST_CATEGORY_LABEL_KEYS covers all OpenWorldQuestCategory values', () => {
    const expected: OpenWorldQuestCategory[] = [
      'mainline', 'issue', 'character', 'exploration', 'growth', 'resource', 'crisis', 'consequence',
    ]
    expect(Object.keys(OPEN_WORLD_QUEST_CATEGORY_LABEL_KEYS).sort()).toEqual(expected.sort())
  })
})

describe('textsim/textworld invalid-value fallback (ora-2)', () => {
  const keyEchoT = (...args: any[]): string => (typeof args[0] === 'string' ? args[0] : '')

  it('unknown/corrupted canonical values fall back to the raw persisted value', () => {
    expect(projectCanonicalLabel(keyEchoT, NARRATIVE_SIMULATION_PHASE_LABEL_KEYS, 'paused')).toBe('paused')
    expect(projectCanonicalLabel(keyEchoT, NARRATIVE_SIMULATION_ISSUE_KIND_LABEL_KEYS, 'incident')).toBe('incident')
    expect(projectCanonicalLabel(keyEchoT, NARRATIVE_SIMULATION_ISSUE_STATUS_LABEL_KEYS, '')).toBe('')
    expect(projectCanonicalLabel(keyEchoT, OPEN_WORLD_ATTENTION_LEVEL_LABEL_KEYS, 'dormant')).toBe('dormant')
    expect(projectCanonicalLabel(keyEchoT, OPEN_WORLD_REGION_KNOWLEDGE_LABEL_KEYS, 'mapped')).toBe('mapped')
    expect(projectCanonicalLabel(keyEchoT, OPEN_WORLD_DISCOVERY_TRIGGER_LABEL_KEYS, 'legacy-trigger')).toBe('legacy-trigger')
    expect(projectCanonicalLabel(keyEchoT, OPEN_WORLD_QUEST_CATEGORY_LABEL_KEYS, 'side')).toBe('side')
  })

  it('a known canonical value NEVER surfaces a raw i18n key when its mapped key is missing', () => {
    // Worst case: t() echoes the mapped dotted key back. The projection must
    // return the canonical persisted value instead — never the dotted key.
    for (const { map, name } of TEXTSIM_TEXTWORLD_PROJECTIONS) {
      for (const value of Object.keys(map)) {
        const result = projectCanonicalLabel(keyEchoT, map, value)
        expect(result, `${name}:${value}`).toBe(value)
        expect(result, `${name}:${value}`).not.toContain('.')
      }
    }
  })

  it('empty/null missing-key results also fall back to the canonical value', () => {
    const emptyT = (..._args: any[]): string => ''
    const nullT = (() => null) as unknown as DisplayT
    for (const { map } of TEXTSIM_TEXTWORLD_PROJECTIONS) {
      for (const value of Object.keys(map)) {
        expect(projectCanonicalLabel(emptyT, map, value)).toBe(value)
        expect(projectCanonicalLabel(nullT, map, value)).toBe(value)
      }
    }
  })

  it('known values still project through t() when the key resolves', () => {
    const localizedT = (...args: any[]): string => `<${typeof args[0] === 'string' ? args[0] : ''}>`
    expect(projectCanonicalLabel(localizedT, NARRATIVE_SIMULATION_PHASE_LABEL_KEYS, 'planning'))
      .toBe(`<${NARRATIVE_SIMULATION_PHASE_LABEL_KEYS.planning}>`)
    expect(projectCanonicalLabel(localizedT, NARRATIVE_SIMULATION_ISSUE_KIND_LABEL_KEYS, 'crisis'))
      .toBe(`<${NARRATIVE_SIMULATION_ISSUE_KIND_LABEL_KEYS.crisis}>`)
    expect(projectCanonicalLabel(localizedT, NARRATIVE_SIMULATION_ISSUE_STATUS_LABEL_KEYS, 'evolving'))
      .toBe(`<${NARRATIVE_SIMULATION_ISSUE_STATUS_LABEL_KEYS.evolving}>`)
    expect(projectCanonicalLabel(localizedT, OPEN_WORLD_ATTENTION_LEVEL_LABEL_KEYS, 'focus'))
      .toBe(`<${OPEN_WORLD_ATTENTION_LEVEL_LABEL_KEYS.focus}>`)
    expect(projectCanonicalLabel(localizedT, OPEN_WORLD_REGION_KNOWLEDGE_LABEL_KEYS, 'familiar'))
      .toBe(`<${OPEN_WORLD_REGION_KNOWLEDGE_LABEL_KEYS.familiar}>`)
    expect(projectCanonicalLabel(localizedT, OPEN_WORLD_DISCOVERY_TRIGGER_LABEL_KEYS, 'combat'))
      .toBe(`<${OPEN_WORLD_DISCOVERY_TRIGGER_LABEL_KEYS.combat}>`)
    expect(projectCanonicalLabel(localizedT, OPEN_WORLD_QUEST_CATEGORY_LABEL_KEYS, 'mainline'))
      .toBe(`<${OPEN_WORLD_QUEST_CATEGORY_LABEL_KEYS.mainline}>`)
  })

  it('zh-CN textsim/textworld labels resolve to Chinese text (legitimacy spot check)', () => {
    expect(resolveKey('simulation', 'phase.planning', 'zh-CN')).toBe('规划')
    expect(resolveKey('simulation', 'phase.resolving', 'zh-CN')).toBe('结算中')
    expect(resolveKey('simulation', 'phase.ended', 'zh-CN')).toBe('已结束')
    expect(resolveKey('simulation', 'issueKind.issue', 'zh-CN')).toBe('问题')
    expect(resolveKey('simulation', 'issueKind.crisis', 'zh-CN')).toBe('危机')
    expect(resolveKey('simulation', 'issueStatus.resolved', 'zh-CN')).toBe('已解决')
    expect(resolveKey('simulation', 'issueStatus.evolving', 'zh-CN')).toBe('演化中')
    expect(resolveKey('simulation', 'openWorld.attentionLevel.focus', 'zh-CN')).toBe('聚焦')
    expect(resolveKey('simulation', 'openWorld.regionKnowledge.unknown', 'zh-CN')).toBe('未知')
    expect(resolveKey('simulation', 'openWorld.trigger.combat', 'zh-CN')).toBe('战斗')
    expect(resolveKey('simulation', 'openWorld.questCategory.mainline', 'zh-CN')).toBe('主线')
  })
})

// ── ⑩ Canonical projection ownership guard (Oracle NO-GO remediation) ──────
//
// WorldNarrativeReleasePanel must CONSUME the simulation-owned shared
// projections (NARRATIVE_MODULE_KIND_LABEL_KEYS / SIMULATION_SESSION_KIND_LABEL_KEYS)
// and must not re-create a parallel worldview-owned label dictionary. It also
// must not interpolate t() into persisted titles/labels (locale never enters
// user data), and InteractionGameWorkbench diagnostics must render localized
// text derived from stable codes, never the raw engine-language item.message.
describe('canonical projection ownership guard (panel + workbench sources)', () => {
  const readSource = (rel: string): string => readFileSync(resolve(process.cwd(), rel), 'utf8')

  it('WorldNarrativeReleasePanel imports both canonical maps from display-projection and defines no local kind dictionary', () => {
    const source = readSource('src/components/world-engine/WorldNarrativeReleasePanel.tsx')
    expect(source).toContain("from '../../i18n/display-projection'")
    expect(source).toContain('NARRATIVE_MODULE_KIND_LABEL_KEYS')
    expect(source).toContain('SIMULATION_SESSION_KIND_LABEL_KEYS')
    // No parallel label dictionary: no worldNarrative.kind.* / instanceKind.*
    // key literals and no local Record<...kind..., string> label tables.
    expect(source).not.toMatch(/worldNarrative\.kind\./)
    expect(source).not.toMatch(/worldNarrative\.instanceKind\./)
    expect(source).not.toMatch(/Record<NarrativeModule\['kind'\], string>/)
  })

  it('WorldNarrativeReleasePanel never interpolates t() into persisted titles/labels', () => {
    const source = readSource('src/components/world-engine/WorldNarrativeReleasePanel.tsx')
    // Persisted instance title falls back to the authored module title only.
    expect(source).toContain('instanceTitle.trim() || selectedReleaseModule.title')
    // Persisted release labels reuse the authored/generated definition title
    // verbatim: no UI-locale-derived suffixes and no canonical Chinese tokens.
    expect(source).toContain('label: generated.definition.title')
    expect(source).toContain('label: definition.title')
    expect(source).not.toContain('WORLD_PROJECTION_LABEL_TOKEN')
    expect(source).not.toContain('AI_EVOLUTION_RELEASE_TOKEN')
    expect(source).not.toContain('世界投影')
    expect(source).not.toContain('AI 演化发布')
    expect(source).not.toContain("t('worldNarrative.worldProjectionSuffix')")
    expect(source).not.toContain("t('worldNarrative.aiEvolutionSuffix')")
    // The creative brief is author input and starts empty — never seeded from
    // a fixed locale-authored prompt.
    expect(source).toContain("useState('')")
  })

  it('InteractionGameWorkbench renders diagnostics via code→locale mapping, never raw item.message', () => {
    const source = readSource('src/components/character-interaction/InteractionGameWorkbench.tsx')
    expect(source).toContain('INTERACTION_DIAGNOSTIC_KEYS')
    expect(source).toContain('interactionDiagnosticLine(t, item)')
    expect(source).not.toContain('{item.message}')
    // The new-game title input is author input: empty initial state, no t() seed.
    expect(source).toContain("const [title, setTitle] = useState('')")
    expect(source).not.toContain('untitledGameDefault')
  })

  it('removed worldview label keys stay absent from all three worldview bundles', () => {
    for (const lang of LANGS) {
      expect(resolveKey('worldview', 'worldNarrative.kind.main', lang)).toBeUndefined()
      expect(resolveKey('worldview', 'worldNarrative.instanceKind.ttrpg', lang)).toBeUndefined()
      expect(resolveKey('worldview', 'worldNarrative.interactionFallback', lang)).toBeUndefined()
      expect(resolveKey('worldview', 'worldNarrative.worldProjectionSuffix', lang)).toBeUndefined()
      expect(resolveKey('worldview', 'worldNarrative.aiEvolutionSuffix', lang)).toBeUndefined()
      expect(resolveKey('simulation', 'interactionAuthor.untitledGameDefault', lang)).toBeUndefined()
    }
  })
})
