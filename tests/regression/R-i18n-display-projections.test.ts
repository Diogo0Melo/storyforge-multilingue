/**
 * Phase 1 (i18n) — canonical → localized display projection regression tests.
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
  type DisplayT,
} from '../../src/i18n/display-projection'
import { OUTLINE_BATCH_STAGES } from '../../src/lib/ai/batch-outline-runner'
import { BATCH_RUN_STAGES } from '../../src/lib/ai/batch-detail-runner'
import type { ChapterStatus } from '../../src/lib/types/outline'
import type { RelationType } from '../../src/lib/types/character-relation'
import type { LocationTag } from '../../src/lib/types/location'
import type { SimulationSessionStatus, SimulationTtrpgQuestStatus } from '../../src/lib/types/simulation-runtime'
import type { NodeRunStatus } from '../../src/lib/types/node-flow'
import type { CultivationProgressStatus } from '../../src/lib/types/cultivation-progress'
import type { LocationType } from '../../src/lib/types/geography'
import type { CharacterDrivenPlanStatus } from '../../src/lib/types/character-driven-plan'

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
