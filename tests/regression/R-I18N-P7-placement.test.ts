/**
 * R-I18N-P7 · output-language placement consolidation.
 *
 * The placement matrix is declarative: outline uses one terminal textual
 * fallback block, while simulation keeps its field-level system directive.
 */
import { describe, expect, it } from 'vitest'
import i18n from '../../src/i18n'
import {
  applyOutputLanguageGate,
  buildOutputLanguageConstraint,
  detectOutputLanguagePolicyBlock,
  hasOutputLanguageConstraint,
} from '../../src/lib/ai/output-language'
import { trimMessagesToFit } from '../../src/lib/ai/context-budget'
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
import { buildChatGamePrompt } from '../../src/lib/simulation/chatgame'
import {
  OUTPUT_LANGUAGE_PLACEMENT_BY_CATEGORY,
  resolveOutputLanguagePlacement,
} from '../../src/lib/ai/task-routing'
import {
  buildNpcEvolutionPrompt,
} from '../../src/lib/simulation/npc-evolution'
import {
  buildTtrpgEncounterPrompt,
  buildTtrpgGmPrompt,
} from '../../src/lib/simulation/ttrpg'
import type { ChatMessage } from '../../src/lib/types'

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
  it('maps the six exact categories and defaults to textual-fallback', () => {
    expect(OUTPUT_LANGUAGE_PLACEMENT_BY_CATEGORY).toEqual({
      'outline.volume': 'textual-fallback',
      'outline.chapter': 'textual-fallback',
      'simulation.chatgame': 'native-system',
      'simulation.ttrpg-encounter': 'native-system-field-contract',
      'simulation.ttrpg-gm': 'native-system-field-contract',
      'simulation.npc-evolution': 'native-system-field-contract',
    })
    expect(resolveOutputLanguagePlacement('outline.volume')).toBe('textual-fallback')
    expect(resolveOutputLanguagePlacement('simulation.chatgame')).toBe('native-system')
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

  it('native-system chatgame receives one localized system block and no user block', async () => {
    const messages = buildChatGamePrompt({
      runtimeContext: '冻结上下文',
      characterName: '守门人',
      userMessage: '你是谁？',
    })
    const once = await applyOutputLanguageGate(messages, {
      category: 'simulation.chatgame',
      outputKind: 'creative',
    })
    const system = once.find(message => message.role === 'system')
    const user = lastUser(once)
    const block = buildStoryForgeOutputPolicyBlock(SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT)
    expect(system).toBeDefined()
    expect(system!.content.endsWith(block)).toBe(true)
    expect(countOccurrences(system!.content, STORYFORGE_OUTPUT_POLICY_START)).toBe(1)
    expect(countOccurrences(user.content, STORYFORGE_OUTPUT_POLICY_START)).toBe(0)

    const twice = await applyOutputLanguageGate(once, {
      category: 'simulation.chatgame',
      outputKind: 'creative',
    })
    expect(twice).toEqual(once)

    const explicitNone = await applyOutputLanguageGate(messages, {
      category: 'simulation.chatgame',
      outputKind: 'creative',
      languagePolicy: 'none',
    })
    expect(explicitNone).toEqual(messages)
  })

  it.each(['pt-BR', 'en'] as const)('native-system chatgame localizes the system block for %s only', async lang => {
    try {
      await i18n.changeLanguage(lang)
      const result = await applyOutputLanguageGate(buildChatGamePrompt({
        runtimeContext: 'frozen runtime context',
        characterName: 'Gatekeeper',
        userMessage: 'Who are you?',
      }), {
        category: 'simulation.chatgame',
        outputKind: 'creative',
      })
      const system = result.find(message => message.role === 'system')
      const user = lastUser(result)
      const block = buildStoryForgeOutputPolicyBlock(buildOutputLanguageConstraint(lang))

      expect(system).toBeDefined()
      expect(countOccurrences(system!.content, block)).toBe(1)
      expect(countOccurrences(system!.content, STORYFORGE_OUTPUT_POLICY_START)).toBe(1)
      expect(user.content).not.toContain(STORYFORGE_OUTPUT_POLICY_START)
      expect(detectOutputLanguagePolicyBlock(result)).toBeUndefined()
    } finally {
      await i18n.changeLanguage('zh-CN')
    }
  })

  it('native-system chatgame keeps its system block intact after final trimming', async () => {
    const result = await applyOutputLanguageGate(buildChatGamePrompt({
      runtimeContext: 'frozen runtime context '.repeat(1_200),
      characterName: '守门人',
      userMessage: '你是谁？',
    }), {
      category: 'simulation.chatgame',
      outputKind: 'creative',
    })
    const system = result.find(message => message.role === 'system')
    expect(system).toBeDefined()

    const trimmed = trimMessagesToFit(
      result,
      'qwen',
      'qwen3.7-plus-thinking',
      128,
      1_024,
    )
    const trimmedSystem = trimmed.messages.find(message => message.role === 'system')
    const trimmedUser = lastUser(trimmed.messages)

    expect(trimmed.trimmed).toBe(true)
    expect(trimmedSystem).toEqual(system)
    expect(countOccurrences(trimmedSystem!.content, STORYFORGE_OUTPUT_POLICY_START)).toBe(1)
    expect(trimmedUser.content).not.toContain(STORYFORGE_OUTPUT_POLICY_START)
    expect(detectOutputLanguagePolicyBlock(trimmed.messages)).toBeUndefined()
  })

  it('native-system cria system no início quando o prompt não possui um', async () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'pedido autoral' }]
    const result = await applyOutputLanguageGate(messages, {
      category: 'simulation.chatgame',
      outputKind: 'creative',
    })
    expect(result[0].role).toBe('system')
    expect(result[1]).toEqual(messages[0])
    expect(countOccurrences(result[0].content, STORYFORGE_OUTPUT_POLICY_START)).toBe(1)
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
