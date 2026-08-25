/**
 * R-I18N-P7 · output-language placement consolidation.
 *
 * The placement matrix is declarative: outline uses one terminal textual
 * fallback block, while simulation keeps its field-level system directive.
 */
import { describe, expect, it } from 'vitest'
import {
  applyOutputLanguageGate,
  hasOutputLanguageConstraint,
} from '../../src/lib/ai/output-language'
import {
  buildStoryForgeOutputPolicyBlock,
  SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT,
  STORYFORGE_OUTPUT_POLICY_END,
  STORYFORGE_OUTPUT_POLICY_START,
} from '../../src/lib/ai/adapters/prompt-guards'
import {
  buildChapterOutlinePrompt,
  buildVolumeOutlinePrompt,
} from '../../src/lib/ai/adapters/outline-adapter'
import {
  classifyAITask,
  OUTPUT_LANGUAGE_PLACEMENT_BY_CATEGORY,
  resolveAIConfigForTask,
  resolveOutputLanguagePlacement,
} from '../../src/lib/ai/task-routing'
import {
  buildNpcEvolutionPrompt,
} from '../../src/lib/simulation/npc-evolution'
import {
  buildTtrpgEncounterPrompt,
  buildTtrpgGmPrompt,
} from '../../src/lib/simulation/ttrpg'
import type { AIConfig, AIConfigPreset, ChatMessage } from '../../src/lib/types'

const DIRECTIVE_HEADER = '【叙事字段语言契约】'

function lastUser(messages: ChatMessage[]): ChatMessage {
  const message = [...messages].reverse().find(item => item.role === 'user')
  expect(message).toBeDefined()
  return message!
}

function countOccurrences(value: string, marker: string): number {
  return value.split(marker).length - 1
}

describe('R-I18N-P7 · declarative placement matrix', () => {
  it('maps the five exact categories and defaults to textual-fallback', () => {
    expect(OUTPUT_LANGUAGE_PLACEMENT_BY_CATEGORY).toEqual({
      'outline.volume': 'textual-fallback',
      'outline.chapter': 'textual-fallback',
      'simulation.ttrpg-encounter': 'native-system-field-contract',
      'simulation.ttrpg-gm': 'native-system-field-contract',
      'simulation.npc-evolution': 'native-system-field-contract',
    })
    expect(resolveOutputLanguagePlacement('outline.volume')).toBe('textual-fallback')
    expect(resolveOutputLanguagePlacement('simulation.ttrpg-gm')).toBe('native-system-field-contract')
    expect(resolveOutputLanguagePlacement('outline.volume:batch')).toBe('textual-fallback')
    expect(resolveOutputLanguagePlacement('unregistered.category')).toBe('textual-fallback')
  })

  it('outline volume/chapter receives exactly one terminal StoryForge block and keeps localized examples', async () => {
    const cases = [
      {
        category: 'outline.volume' as const,
        messages: buildVolumeOutlinePrompt(
          'Livro', 'fantasia', '世界', '主线', 500_000,
          '', undefined, '', '', undefined, 'pt-BR',
        ),
        example: 'Volume 1: O Começo',
      },
      {
        category: 'outline.volume' as const,
        messages: buildVolumeOutlinePrompt(
          'Book', 'fantasy', '世界', '主线', 500_000,
          '', undefined, '', '', undefined, 'en',
        ),
        example: 'Volume 1: The Beginning',
      },
      {
        category: 'outline.chapter' as const,
        messages: buildChapterOutlinePrompt(
          'Volume 1', 'Resumo', '世界', '', undefined, undefined, '', '', 'en',
        ),
        example: 'Chapter 1: Into the Fray',
      },
      {
        category: 'outline.chapter' as const,
        messages: buildChapterOutlinePrompt(
          'Volume 1', 'Resumo', '世界', '', undefined, undefined, '', '', 'pt-BR',
        ),
        example: 'Capítulo 1: Primeiros Passos',
      },
    ]

    for (const testCase of cases) {
      const result = await applyOutputLanguageGate(testCase.messages, {
        category: testCase.category,
        outputKind: 'mixed',
      })
      const content = lastUser(result).content
      const block = buildStoryForgeOutputPolicyBlock(
        // No project is supplied, so the test UI locale provides the textual policy.
        SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT,
      )
      expect(content).toContain(testCase.example)
      expect(countOccurrences(content, STORYFORGE_OUTPUT_POLICY_START)).toBe(1)
      expect(countOccurrences(content, STORYFORGE_OUTPUT_POLICY_END)).toBe(1)
      expect(content.endsWith(block)).toBe(true)
      expect(result.filter(message => message.role === 'user').at(-1)).toEqual(lastUser(result))
      expect(result.some(message => message.content.includes(DIRECTIVE_HEADER))).toBe(false)
      expect(hasOutputLanguageConstraint(result)).toBe(true)
    }
  })

  it('simulation keeps exactly one system directive and no StoryForge block', async () => {
    const prompts = [
      {
        category: 'simulation.npc-evolution' as const,
        messages: buildNpcEvolutionPrompt({
          authorRequest: '让他警惕起来',
          targetEntityKey: 'npc:gatekeeper',
          targetName: '守门人',
          runtimeContext: '冻结上下文',
          contentLanguage: 'pt-BR',
        }),
      },
      {
        category: 'simulation.ttrpg-gm' as const,
        messages: buildTtrpgGmPrompt({
          actorKey: 'character:linzhou',
          actorName: '林舟',
          action: '观察石门。',
          runtimeContext: '冻结上下文',
          contentLanguage: 'en',
        }),
      },
      {
        category: 'simulation.ttrpg-encounter' as const,
        messages: buildTtrpgEncounterPrompt({
          runtimeContext: '冻结上下文',
          participantKeys: ['character:linzhou', 'npc:watcher'],
          contentLanguage: 'zh-CN',
        }),
      },
    ]

    for (const testCase of prompts) {
      const result = await applyOutputLanguageGate(testCase.messages, {
        category: testCase.category,
        outputKind: 'language-neutral',
      })
      const system = result.find(message => message.role === 'system')
      expect(system).toBeDefined()
      expect(countOccurrences(system!.content, DIRECTIVE_HEADER)).toBe(1)
      expect(result.every(message => !message.content.includes(STORYFORGE_OUTPUT_POLICY_START))).toBe(true)
      expect(hasOutputLanguageConstraint(result)).toBe(false)

      const explicitNone = await applyOutputLanguageGate(testCase.messages, {
        category: testCase.category,
        outputKind: 'language-neutral',
        languagePolicy: 'none',
      })
      expect(explicitNone).toEqual(testCase.messages)
    }
  })

  it('field-contract routes reject textual policy before any second policy is injected, including none plus mixed', async () => {
    const cases = [
      { outputKind: 'mixed' as const },
      { outputKind: 'mixed' as const, languagePolicy: 'none' as const },
      { outputKind: 'language-neutral' as const, languagePolicy: 'project' as const },
      { outputKind: 'language-neutral' as const, languagePolicy: 'ui' as const },
    ]

    for (const policy of cases) {
      const messages: ChatMessage[] = [
        { role: 'system', content: `${DIRECTIVE_HEADER}\nexisting directive` },
        { role: 'user', content: 'strict JSON request' },
      ]
      await expect(applyOutputLanguageGate(messages, {
        category: 'simulation.ttrpg-gm',
        ...policy,
      })).rejects.toThrow(/native-system-field-contract placement/)
      expect(messages.every(message => !message.content.includes(STORYFORGE_OUTPUT_POLICY_START))).toBe(true)
    }
  })
})

describe('R-I18N-P7 · Lane A runtime allowlist placement contracts', () => {
  const RUNTIME_CREATIVE_CATEGORIES = [
    'runtime.prose.adventure-result-narrator',
    'runtime.character.interaction-reply',
    'runtime.prose.simulation-turn-briefing',
    'runtime.prose.simulation-advisor-performance',
    'runtime.prose.simulation-outcome-narrator',
    'runtime.prose.simulation-actor-action-suggestion',
    'runtime.prose.open-world-quest-expression',
    'runtime.prose.open-world-scene-narration',
  ] as const

  const RUNTIME_STRUCTURED_CATEGORIES = [
    'runtime.prose.adventure-intent-parser',
    'runtime.prose.interaction-scene-director',
    'runtime.character.interaction-memory-curator',
  ] as const

  it('all 11 runtime categories stay on the default textual-fallback placement', () => {
    for (const category of [...RUNTIME_CREATIVE_CATEGORIES, ...RUNTIME_STRUCTURED_CATEGORIES]) {
      expect(resolveOutputLanguagePlacement(category), category).toBe('textual-fallback')
      // No runtime category may leak into the native placement matrix.
      expect(category in OUTPUT_LANGUAGE_PLACEMENT_BY_CATEGORY, category).toBe(false)
    }
  })

  it('unknown runtime categories never classify and stay unrouted (no inherited policy)', () => {
    for (const category of ['runtime.unknown.fake-skill', 'runtime.prose.unknown']) {
      expect(classifyAITask(category), category).toBeNull()
    }
    // Exactness: even descendants of registered skills stay unclassified.
    expect(classifyAITask('runtime.prose.simulation-turn-briefing.descendant')).toBeNull()
  })

  it('registered runtime categories route through their semantic peer preset', () => {
    const globalConfig: AIConfig = {
      provider: 'deepseek',
      apiKey: 'global-key',
      model: 'global-model',
      baseUrl: 'https://global.example/v1',
      temperature: 0.7,
      maxTokens: 0,
    }
    const presets: AIConfigPreset[] = [
      {
        id: 'creation-preset',
        name: 'creation-preset',
        config: { ...globalConfig, provider: 'custom', apiKey: 'k', model: 'creative-model', baseUrl: 'https://creation.example/v1' },
      },
      {
        id: 'extraction-preset',
        name: 'extraction-preset',
        config: { ...globalConfig, provider: 'custom', apiKey: 'k', model: 'structured-model', baseUrl: 'https://extraction.example/v1' },
      },
    ]
    const routes = { creation: 'creation-preset', extraction: 'extraction-preset' }

    for (const category of RUNTIME_CREATIVE_CATEGORIES) {
      const resolved = resolveAIConfigForTask({
        category,
        requestedConfig: globalConfig,
        globalConfig,
        presets,
        routes,
      })
      expect(resolved.taskKind, category).toBe('creation')
      expect(resolved.config.model, category).toBe('creative-model')
    }

    for (const category of RUNTIME_STRUCTURED_CATEGORIES) {
      const resolved = resolveAIConfigForTask({
        category,
        requestedConfig: globalConfig,
        globalConfig,
        presets,
        routes,
      })
      expect(resolved.taskKind, category).toBe('extraction')
      expect(resolved.config.model, category).toBe('structured-model')
    }

    for (const category of ['runtime.unknown.fake-skill', 'runtime.prose.unknown']) {
      const unresolved = resolveAIConfigForTask({
        category,
        requestedConfig: globalConfig,
        globalConfig,
        presets,
        routes,
      })
      expect(unresolved.taskKind, category).toBeNull()
      expect(unresolved.config).toEqual(globalConfig)
    }
  })
})
