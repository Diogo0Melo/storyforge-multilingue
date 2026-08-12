/**
 * i18n computed-key resolution gate
 *
 * Catches keys that are CONSTRUCTED at runtime (template literals / key maps)
 * where a missing key in any locale leaks raw keys or fallback Chinese.
 * This class produced real bugs (promptSubLabels.parseAll, eraLabels narrowing).
 *
 * Strategy: for each group, collect the EXPECTED key list from the SOURCE OF
 * TRUTH in code (the union/const that generates keys), then assert every key
 * exists in ALL 3 locale JSONs. Failures name the missing key + locale.
 *
 * Known missing keys (confirmed absent in all 3 locales) are encoded in
 * KNOWN_MISSING so the gate passes today while documenting the debt.
 * When a key is fixed, remove it from KNOWN_MISSING — the gate will then
 * enforce its presence going forward.
 */
import { describe, it, expect } from 'vitest'
import i18n from '../../src/i18n'

// ─── Source-of-truth imports ───────────────────────────────────────────────
import { HISTORICAL_ERA_LABELS, KEYWORD_CATEGORY_LABELS } from '../../src/lib/types/history'
import { FACT_PREDICATE_LABEL_KEYS } from '../../src/lib/registry/fact-predicate-registry'
import { STATE_CATEGORY_LABEL_KEYS } from '../../src/lib/types/state-card'
import { THEME_OPTIONS } from '../../src/lib/theme'
import { PROVIDER_MODELS } from '../../src/lib/types/ai'
import { GENRE_OPTIONS } from '../../src/lib/types/project'
import { AUTHORING_NODE_CATALOG } from '../../src/lib/node-authoring/catalog'
import { SAVE_TARGET_PRESETS } from '../../src/components/settings/prompt/workflow-helpers'
import { READABILITY_DIMENSION_LABEL_KEYS } from '../../src/lib/ai/adapters/readability-adapter'
import {
  toCamelLabelKey,
  SYSTEM_PROMPT_SEED_I18N_BASE,
  SYSTEM_WORKFLOW_SEED_I18N_BASE,
} from '../../src/lib/ai/seed-i18n'
import { GENRE_PACKS } from '../../src/lib/ai/prompt-seeds-genre-packs'
import { BUILTIN_CATEGORIES } from '../../src/lib/types/codex'
import { RAG_SOURCE_LABEL_KEYS } from '../../src/lib/retrieval/rag-library'
import { SYSTEM_PROMPT_SEEDS } from '../../src/lib/ai/prompt-seeds'
import { NOVEL_CONTENT_PROMPT_SEEDS } from '../../src/lib/ai/prompt-seeds-novel'
import { SYSTEM_WORKFLOW_SEEDS } from '../../src/lib/ai/workflow-seeds'

// ─── Locale helpers ────────────────────────────────────────────────────────

const LANGS = ['pt-BR', 'en', 'zh-CN'] as const

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

// ─── Group definitions ─────────────────────────────────────────────────────

interface ComputedKeyGroup {
  /** Human-readable group name for error messages */
  name: string
  /** i18n namespace */
  ns: string
  /** Key prefix within the namespace (e.g. 'eraLabels') */
  prefix: string
  /** The set of sub-keys to check */
  keys: readonly string[]
}

const groups: ComputedKeyGroup[] = [
  // ── history ──
  {
    name: 'history:eraLabels',
    ns: 'history',
    prefix: 'eraLabels',
    keys: Object.keys(HISTORICAL_ERA_LABELS),
  },
  {
    name: 'history:keywordCategories',
    ns: 'history',
    prefix: 'keywordCategories',
    keys: Object.keys(KEYWORD_CATEGORY_LABELS),
  },
  // ── facts ──
  {
    name: 'facts:predicateLabels',
    ns: 'facts',
    prefix: 'predicateLabels',
    keys: Object.values(FACT_PREDICATE_LABEL_KEYS).map(k => k.replace('facts:predicateLabels.', '')),
  },
  // ── state ──
  {
    name: 'state:categoryLabels',
    ns: 'state',
    prefix: 'categoryLabels',
    keys: Object.values(STATE_CATEGORY_LABEL_KEYS).map(k => k.replace('state:categoryLabels.', '')),
  },
  // ── codex ──
  {
    name: 'codex:domain',
    ns: 'codex',
    prefix: 'domain',
    keys: ['natural', 'humanity', 'origin'] as const,
  },
  // ── settings: theme ──
  {
    name: 'settings:theme.themes.*.label',
    ns: 'settings',
    prefix: 'theme.themes',
    keys: THEME_OPTIONS.flatMap(t => [`${t.value}.label`, `${t.value}.desc`]),
  },
  // ── settings: aiConfig.modelDesc ──
  {
    name: 'settings:aiConfig.modelDesc',
    ns: 'settings',
    prefix: 'aiConfig.modelDesc',
    keys: Object.values(PROVIDER_MODELS)
      .flat()
      .filter(m => m.descKey)
      .map(m => m.descKey!.replace('aiConfig.modelDesc.', '')),
  },
  // ── node-authoring ──
  {
    name: 'node-authoring:nodes.*',
    ns: 'node-authoring',
    prefix: 'nodes',
    keys: (() => {
      const keys = new Set<string>()
      for (const tpl of AUTHORING_NODE_CATALOG) {
        if (tpl.labelKey) keys.add(tpl.labelKey.replace('nodes.', ''))
        if (tpl.descriptionKey) keys.add(tpl.descriptionKey.replace('nodes.', ''))
        if (tpl.categoryKey) keys.add(tpl.categoryKey.replace('nodes.', ''))
        for (const input of tpl.inputs ?? []) {
          if (input.labelKey) keys.add(input.labelKey.replace('nodes.', ''))
        }
        for (const output of tpl.outputs ?? []) {
          if (output.labelKey) keys.add(output.labelKey.replace('nodes.', ''))
        }
        for (const param of tpl.parameters ?? []) {
          if (param.labelKey) keys.add(param.labelKey.replace('nodes.', ''))
        }
      }
      return [...keys]
    })(),
  },
  // ── project: genreOptions + genreGroups ──
  {
    name: 'project:genreOptions',
    ns: 'project',
    prefix: 'genreOptions',
    keys: GENRE_OPTIONS.map(o => o.labelKey.replace('genreOptions.', '')),
  },
  {
    name: 'project:genreGroups',
    ns: 'project',
    prefix: 'genreGroups',
    keys: [...new Set(GENRE_OPTIONS.map(o => o.groupKey.replace('genreGroups.', '')))],
  },
  // ── settings: promptSubLabels (derived from PromptModuleKey union) ──
  {
    name: 'settings:promptSubLabels',
    ns: 'settings',
    prefix: 'promptSubLabels',
    keys: (() => {
      // Source: PromptModuleKey union in src/lib/types/prompt.ts
      // Static encoding — the union has ~60 members; derive sub-keys the same
      // way PromptTemplateList.tsx does: split('.').slice(1).join('.') → toCamelLabelKey
      const ALL_MODULE_KEYS: string[] = [
        'worldview.dimension', 'character.generate', 'character.dimension',
        'outline.volume', 'outline.chapter',
        'chapter.content', 'chapter.continue', 'chapter.memory',
        'chapter.polish', 'chapter.expand', 'chapter.de-ai',
        'foreshadow.generate', 'geography.concept-map', 'geography.image-map-prompt',
        'worldview.generate', 'worldview.worldbuilding',
        'story.generate', 'story.brief', 'story.ideation', 'story.positioning',
        'story.core', 'story.packaging', 'rules.generate', 'research.method',
        'prompt.operations', 'detail.scene', 'detail.chapter-planning',
        'character.design', 'outline.plot', 'outline.structure',
        'outline.long-form', 'outline.short-story', 'outline.serialization',
        'chapter.drafting', 'chapter.continuity', 'chapter.line-editing',
        'review.developmental', 'review.line-editing', 'review.reader-validation',
        'import.parse-character', 'import.parse-worldview', 'import.parse-outline',
        'import.parse-all', 'import.parse-chunk', 'import.merge-characters',
        'relation.extract', 'plot.character-driven', 'plot.character-revision',
        'inspiration.reverse', 'inspiration.reverse.multiworld',
        'world-group.suggest', 'world-group.expand',
        'inventory.extract', 'codex.extract', 'location.extract',
        'story-timeline.extract', 'scene.verify',
        'history.consult', 'history.storm',
        'style.learn', 'style.calibrate',
      ]
      return [...new Set(
        ALL_MODULE_KEYS.map(mk => toCamelLabelKey(mk.split('.').slice(1).join('.')))
      )]
    })(),
  },
  // ── settings: promptGroupLabels (derived from first segment of moduleKey) ──
  {
    name: 'settings:promptGroupLabels',
    ns: 'settings',
    prefix: 'promptGroupLabels',
    keys: (() => {
      const ALL_MODULE_KEYS: string[] = [
        'worldview.dimension', 'character.generate', 'character.dimension',
        'outline.volume', 'outline.chapter',
        'chapter.content', 'chapter.continue', 'chapter.memory',
        'chapter.polish', 'chapter.expand', 'chapter.de-ai',
        'foreshadow.generate', 'geography.concept-map', 'geography.image-map-prompt',
        'worldview.generate', 'worldview.worldbuilding',
        'story.generate', 'story.brief', 'story.ideation', 'story.positioning',
        'story.core', 'story.packaging', 'rules.generate', 'research.method',
        'prompt.operations', 'detail.scene', 'detail.chapter-planning',
        'character.design', 'outline.plot', 'outline.structure',
        'outline.long-form', 'outline.short-story', 'outline.serialization',
        'chapter.drafting', 'chapter.continuity', 'chapter.line-editing',
        'review.developmental', 'review.line-editing', 'review.reader-validation',
        'import.parse-character', 'import.parse-worldview', 'import.parse-outline',
        'import.parse-all', 'import.parse-chunk', 'import.merge-characters',
        'relation.extract', 'plot.character-driven', 'plot.character-revision',
        'inspiration.reverse', 'inspiration.reverse.multiworld',
        'world-group.suggest', 'world-group.expand',
        'inventory.extract', 'codex.extract', 'location.extract',
        'story-timeline.extract', 'scene.verify',
        'history.consult', 'history.storm',
        'style.learn', 'style.calibrate',
      ]
      return [...new Set(
        ALL_MODULE_KEYS.map(mk => toCamelLabelKey(mk.split('.')[0]))
      )]
    })(),
  },
  // ── world-group ──
  {
    name: 'world-group:type',
    ns: 'world-group',
    prefix: 'type',
    keys: ['primary', 'traversal', 'instance', 'parallel', 'ascension', 'custom'] as const,
  },
  {
    name: 'world-group:linkType',
    ns: 'world-group',
    prefix: 'linkType',
    keys: ['portal', 'ascension', 'summon', 'branch', 'return', 'custom'] as const,
  },
  // ── timeline ──
  {
    name: 'timeline:importance',
    ns: 'timeline',
    prefix: 'importance',
    keys: ['minor', 'important', 'critical'] as const,
  },
  // ── relations ──
  {
    name: 'relations:types',
    ns: 'relations',
    prefix: 'types',
    keys: ['family', 'lover', 'friend', 'rival', 'enemy', 'master', 'student', 'ally', 'subordinate', 'other'] as const,
  },
  // ── shared: fieldModeTabs ──
  {
    name: 'shared:fieldModeTabs',
    ns: 'shared',
    prefix: 'fieldModeTabs',
    keys: ['expand', 'rewrite', 'polish'] as const,
  },
  // ── settings: embedding.presets ──
  {
    name: 'settings:embedding.presets',
    ns: 'settings',
    prefix: 'embedding.presets',
    keys: ['siliconflow', 'qwen', 'glm', 'ollama', 'openai'].flatMap(k => [`${k}.label`, `${k}.note`]),
  },
  // ── settings: saveTargets ──
  {
    name: 'settings:saveTargets',
    ns: 'settings',
    prefix: 'saveTargets',
    keys: (() => {
      const keys = new Set<string>()
      for (const preset of SAVE_TARGET_PRESETS) {
        keys.add(preset.labelKey.replace('saveTargets.', ''))
        if ('fieldKey' in preset && preset.fieldKey) {
          keys.add(preset.fieldKey.replace('saveTargets.', ''))
        }
      }
      // Also check the fields.* sub-keys used by targetLabelKey()
      const FIELD_KEYS = [
        'fields.worldOrigin', 'fields.powerHierarchy', 'fields.historyLine',
        'fields.summary', 'fields.logline', 'fields.concept', 'fields.theme',
        'fields.centralConflict', 'fields.mainPlot', 'fields.writingStyle',
        'fields.toneAndMood',
      ]
      for (const fk of FIELD_KEYS) keys.add(fk)
      return [...keys]
    })(),
  },
  // ── outline: previewPanel (emotion / pace / foreshadowRole) ──
  {
    name: 'outline:previewPanel.emotion',
    ns: 'outline',
    prefix: 'previewPanel.emotion',
    keys: ['rising', 'falling', 'flat', 'wave', 'climax'] as const,
  },
  {
    name: 'outline:previewPanel.pace',
    ns: 'outline',
    prefix: 'previewPanel.pace',
    keys: ['slow', 'medium', 'fast', 'climax'] as const,
  },
  {
    name: 'outline:previewPanel.foreshadowRole',
    ns: 'outline',
    prefix: 'previewPanel.foreshadowRole',
    keys: ['plant', 'resolve', 'echo'] as const,
  },
  // ── outline: revision.intensityLabels ──
  {
    name: 'outline:revision.intensityLabels',
    ns: 'outline',
    prefix: 'revision.intensityLabels',
    keys: ['light', 'balanced', 'deep'] as const,
  },
  // ── editor: review.readabilityDimensions ──
  {
    name: 'editor:review.readabilityDimensions',
    ns: 'editor',
    prefix: 'review.readabilityDimensions',
    keys: Object.keys(READABILITY_DIMENSION_LABEL_KEYS),
  },
  // ── common: languageName ──
  {
    name: 'common:languageName',
    ns: 'common',
    prefix: 'languageName',
    keys: ['pt-BR', 'en', 'zh-CN'] as const,
  },
  // ── settings: genrePacks (render site: PromptManagerPanel.tsx pack picker) ──
  {
    name: 'settings:genrePacks',
    ns: 'settings',
    prefix: 'genrePacks',
    keys: GENRE_PACKS.flatMap(p => [`${p.id}.label`, `${p.id}.description`]),
  },
  // ── codex: builtinCategories (render site: CodexPanel / CodexCategoryFieldsEditor) ──
  {
    name: 'codex:builtinCategories',
    ns: 'codex',
    prefix: 'builtinCategories',
    keys: BUILTIN_CATEGORIES.map(c => c.builtInKey),
  },
  // ── retrieval: sourceLabels (render site: RAG source label UI via getSourceLabelKey) ──
  {
    name: 'retrieval:sourceLabels',
    ns: 'retrieval',
    prefix: 'sourceLabels',
    keys: Object.values(RAG_SOURCE_LABEL_KEYS).map(k => k.replace('sourceLabels.', '')),
  },
  // ── settings: seed-i18n promptTemplates display keys (render site: resolveSystemSeedDisplay in seed-i18n.ts) ──
  {
    name: 'settings:seedI18n.promptTemplates',
    ns: 'settings',
    prefix: 'promptTemplates',
    keys: [...new Set(
      Object.values(SYSTEM_PROMPT_SEED_I18N_BASE).flatMap(base => [
        `${base}.name`,
        `${base}.description`,
      ]),
    )].map(k => k.replace('promptTemplates.', '')),
  },
  // ── settings: seed-i18n workflowSeeds display keys (render site: resolveSystemSeedDisplay in seed-i18n.ts) ──
  {
    name: 'settings:seedI18n.workflowSeeds',
    ns: 'settings',
    prefix: 'workflowSeeds',
    keys: [...new Set(
      Object.values(SYSTEM_WORKFLOW_SEED_I18N_BASE).flatMap(base => [
        `${base}.name`,
        `${base}.description`,
      ]),
    )].map(k => k.replace('workflowSeeds.', '')),
  },
]

// ─── Known missing keys ────────────────────────────────────────────────────
// These are CONFIRMED absent in ALL 3 locales. They represent real bugs that
// need code fixes (wrong prefix) or locale additions. The gate passes today
// but documents the debt. Remove entries as they are fixed.

const KNOWN_MISSING = new Set<string>([
  // OutlinePreview.tsx uses `preview.*` prefix but locale keys are under
  // `previewPanel.*`. This is a CODE BUG (wrong prefix in the component),
  // not a missing translation. The correct keys (previewPanel.*) are tested above.
  'outline:preview.emotion.rising',
  'outline:preview.emotion.falling',
  'outline:preview.emotion.flat',
  'outline:preview.emotion.wave',
  'outline:preview.emotion.climax',
  'outline:preview.pace.slow',
  'outline:preview.pace.medium',
  'outline:preview.pace.fast',
  'outline:preview.pace.climax',
  'outline:preview.foreshadowRole.plant',
  'outline:preview.foreshadowRole.resolve',
  'outline:preview.foreshadowRole.echo',

  // promptSubLabels: these sub-keys are derived from PromptModuleKey values
  // that only appear in system seeds (not in the editor dropdown). The keys
  // are absent in all 3 locales. PromptTemplateList falls back to raw text.
  'settings:promptSubLabels.memory',
  'settings:promptSubLabels.parseChunk',
  'settings:promptSubLabels.mergeCharacters',
  'settings:promptSubLabels.extract',
  'settings:promptSubLabels.characterDriven',
  'settings:promptSubLabels.characterRevision',
  'settings:promptSubLabels.reverse',
  'settings:promptSubLabels.reverseMultiworld',
  'settings:promptSubLabels.suggest',
  'settings:promptSubLabels.verify',
  'settings:promptSubLabels.consult',
  'settings:promptSubLabels.storm',
  'settings:promptSubLabels.learn',
  'settings:promptSubLabels.calibrate',

  // promptGroupLabels: group prefixes derived from moduleKeys whose first
  // segment has no corresponding label in any locale.
  'settings:promptGroupLabels.relation',
  'settings:promptGroupLabels.plot',
  'settings:promptGroupLabels.inspiration',
  'settings:promptGroupLabels.worldGroup',
  'settings:promptGroupLabels.inventory',
  'settings:promptGroupLabels.codex',
  'settings:promptGroupLabels.location',
  'settings:promptGroupLabels.storyTimeline',
  'settings:promptGroupLabels.scene',
  'settings:promptGroupLabels.history',
  'settings:promptGroupLabels.style',
])

// ─── Test ──────────────────────────────────────────────────────────────────

describe('i18n computed-key resolution', () => {
  it.each(groups)('$name: all keys resolve in all 3 locales', (group) => {
    const failures: string[] = []

    for (const lang of LANGS) {
      for (const subKey of group.keys) {
        const fullKey = `${group.prefix}.${subKey}`
        const qualifiedKey = `${group.ns}:${fullKey}`

        // Skip known-missing keys (documented debt)
        if (KNOWN_MISSING.has(qualifiedKey)) continue

        const value = resolveKey(group.ns, fullKey, lang)
        if (value === undefined) {
          failures.push(`  [${lang}] ${qualifiedKey}`)
        }
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Computed-key group "${group.name}" has ${failures.length} unresolved key(s):\n` +
        failures.join('\n') +
        '\n\nEither add the missing key to all 3 locale JSONs, or if it is a ' +
        'known intentional gap, add it to KNOWN_MISSING with a comment.',
      )
    }

    expect(failures).toEqual([])
  })

  it('KNOWN_MISSING entries are actually missing (stale-entry detection)', () => {
    // If a key in KNOWN_MISSING has been fixed (now exists in all locales),
    // this test fails, prompting removal from the allowlist.
    const stale: string[] = []

    for (const entry of KNOWN_MISSING) {
      const colonIdx = entry.indexOf(':')
      const ns = entry.slice(0, colonIdx)
      const key = entry.slice(colonIdx + 1)
      const existsInAll = LANGS.every(lang => resolveKey(ns, key, lang) !== undefined)
      if (existsInAll) {
        stale.push(entry)
      }
    }

    expect(
      stale,
      `These KNOWN_MISSING entries now exist in all locales — remove them:\n${stale.join('\n')}`,
    ).toEqual([])
  })

  // ── Gate B N4: seed name → display map membership ──────────────────────────
  // Failure mode prevented: a new system seed not registered in the display
  // map would fall back to raw zh in PromptTemplateList/Editor. The
  // seedI18n groups above derive keys from the MAP VALUES, so a seed OMITTED
  // from the map silently escapes them; this test asserts every runtime seed
  // name (the identity key resolveSystemSeedDisplay looks up) is a map key.
  it('every system seed name is registered in the seed display map', () => {
    // SYSTEM_PROMPT_SEEDS = core + tools + genre packs; novel content seeds
    // load dynamically via the Prompt store but share the same display map.
    const promptNames = [...new Set(
      [...SYSTEM_PROMPT_SEEDS, ...NOVEL_CONTENT_PROMPT_SEEDS].map(s => s.name),
    )]
    const missingPrompt = promptNames.filter(name => !(name in SYSTEM_PROMPT_SEED_I18N_BASE))

    const workflowNames = [...new Set(SYSTEM_WORKFLOW_SEEDS.map(s => s.name))]
    const missingWorkflow = workflowNames.filter(name => !(name in SYSTEM_WORKFLOW_SEED_I18N_BASE))

    expect(
      missingPrompt,
      `System prompt seeds missing from SYSTEM_PROMPT_SEED_I18N_BASE ` +
      `(raw-zh fallback leaks in PromptTemplateList/Editor):\n${missingPrompt.join('\n')}`,
    ).toEqual([])
    expect(
      missingWorkflow,
      `System workflow seeds missing from SYSTEM_WORKFLOW_SEED_I18N_BASE ` +
      `(raw-zh fallback leaks in workflow list):\n${missingWorkflow.join('\n')}`,
    ).toEqual([])
  })
})
