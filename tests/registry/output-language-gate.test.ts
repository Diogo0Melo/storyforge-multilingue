/**
 * WS-3A · 输出语言 client gate 矩阵测试
 *
 * 契约（用户批准）：
 * - creative / mixed → 项目 resolved contentLanguage（D1）
 * - functional-prose → 当前 UI 语言
 * - functional-structured / language-neutral → 不注入
 * - UNKNOWN category（classifyAITask → null）→ dev/test 抛错（fail-safe D3/D12）
 * - zh-CN 约束与 SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT 字节级一致
 * - 双重注入守卫：已带约束的消息不再重复注入
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../src/i18n'
import { db } from '../../src/lib/db/schema'
import {
  applyOutputLanguageGate,
  appendOutputLanguageConstraint,
  buildOutputLanguageConstraint,
  hasOutputLanguageConstraint,
  ENGLISH_OUTPUT_CONSTRAINT,
  PORTUGUESE_OUTPUT_CONSTRAINT,
} from '../../src/lib/ai/output-language'
import { SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT } from '../../src/lib/ai/adapters/prompt-guards'
import { classifyAITask } from '../../src/lib/ai/task-routing'
import type { ChatMessage } from '../../src/lib/types'

const now = 1_800_000_000_000

const baseMessages = (): ChatMessage[] => [
  { role: 'system', content: '你是写作助手。' },
  { role: 'user', content: '请写一章。' },
]

const lastUser = (messages: ChatMessage[]) =>
  [...messages].reverse().find(m => m.role === 'user')!.content

async function addProject(contentLanguage?: string): Promise<number> {
  return await db.projects.add({
    name: 'GATE',
    genre: '',
    description: '',
    targetWordCount: 0,
    enableMultiWorld: false,
    createdAt: now,
    updatedAt: now,
    ...(contentLanguage !== undefined ? { contentLanguage } : {}),
  } as never) as number
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(async () => {
  if (i18n.language !== 'zh-CN') await i18n.changeLanguage('zh-CN')
  await db.delete()
  await db.open()
})

describe('WS-3A buildOutputLanguageConstraint', () => {
  it('zh-CN 输出与 SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT 字节级一致', () => {
    expect(buildOutputLanguageConstraint('zh-CN')).toBe(SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT)
  })

  it('pt-BR 约束非空、独立，且包含目标语言指令', () => {
    const constraint = buildOutputLanguageConstraint('pt-BR')
    expect(constraint.length).toBeGreaterThan(0)
    expect(constraint).toBe(PORTUGUESE_OUTPUT_CONSTRAINT)
    expect(constraint).not.toBe(SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT)
    expect(constraint).not.toBe(ENGLISH_OUTPUT_CONSTRAINT)
    expect(constraint.toLowerCase()).toContain('português')
  })

  it('en 约束非空、独立，且包含目标语言指令', () => {
    const constraint = buildOutputLanguageConstraint('en')
    expect(constraint.length).toBeGreaterThan(0)
    expect(constraint).toBe(ENGLISH_OUTPUT_CONSTRAINT)
    expect(constraint).not.toBe(SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT)
    expect(constraint).not.toBe(PORTUGUESE_OUTPUT_CONSTRAINT)
    expect(constraint).toContain('English')
  })

  it('appendOutputLanguageConstraint 克隆消息并追加到最后一条 user 消息', () => {
    const original = baseMessages()
    const result = appendOutputLanguageConstraint(original, 'pt-BR')
    expect(result).not.toBe(original)
    expect(lastUser(result)).toBe(`请写一章。\n\n${PORTUGUESE_OUTPUT_CONSTRAINT}`)
    // 原数组不被修改
    expect(lastUser(original)).toBe('请写一章。')
  })
})

describe('WS-3A gate 注入矩阵（uiLocale=zh-CN）', () => {
  it('creative + 项目 contentLanguage=pt-BR → 注入 pt-BR 约束', async () => {
    const projectId = await addProject('pt-BR')
    const result = await applyOutputLanguageGate(baseMessages(), {
      category: 'chapter.content',
      projectId,
      outputKind: 'creative',
    })
    expect(lastUser(result).endsWith(PORTUGUESE_OUTPUT_CONSTRAINT)).toBe(true)
  })

  it('mixed + 项目 contentLanguage=en → 注入 en 约束', async () => {
    const projectId = await addProject('en')
    const result = await applyOutputLanguageGate(baseMessages(), {
      category: 'outline.volume',
      projectId,
      outputKind: 'mixed',
    })
    expect(lastUser(result).endsWith(ENGLISH_OUTPUT_CONSTRAINT)).toBe(true)
  })

  it('creative + contentLanguage 未回填（undefined）→ 回退 uiLocale（zh-CN）约束', async () => {
    const projectId = await addProject(undefined)
    const result = await applyOutputLanguageGate(baseMessages(), {
      category: 'chapter.content',
      projectId,
      outputKind: 'creative',
    })
    expect(lastUser(result).endsWith(SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT)).toBe(true)
  })

  it('creative + 无 projectId → uiLocale 约束', async () => {
    const result = await applyOutputLanguageGate(baseMessages(), { outputKind: 'creative' })
    expect(lastUser(result).endsWith(SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT)).toBe(true)
  })

  it('creative + projectId 无对应行 → uiLocale 约束', async () => {
    const result = await applyOutputLanguageGate(baseMessages(), {
      outputKind: 'creative',
      projectId: 999_999,
    })
    expect(lastUser(result).endsWith(SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT)).toBe(true)
  })

  it('functional-prose → 始终 uiLocale 约束（忽略项目 contentLanguage）', async () => {
    const projectId = await addProject('pt-BR')
    const result = await applyOutputLanguageGate(baseMessages(), {
      category: 'review.quality',
      projectId,
      outputKind: 'functional-prose',
    })
    expect(lastUser(result).endsWith(SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT)).toBe(true)
  })

  it('functional-structured → 不注入', async () => {
    const messages = baseMessages()
    const result = await applyOutputLanguageGate(messages, {
      category: 'canon.setting.extract',
      outputKind: 'functional-structured',
    })
    expect(result).toEqual(messages)
    expect(hasOutputLanguageConstraint(result)).toBe(false)
  })

  it('language-neutral → 不注入', async () => {
    const messages = baseMessages()
    const result = await applyOutputLanguageGate(messages, { outputKind: 'language-neutral' })
    expect(result).toEqual(messages)
    expect(hasOutputLanguageConstraint(result)).toBe(false)
  })
})

describe('WS-3A gate 跟随 UI 语言变化', () => {
  it('functional-prose 在 uiLocale=pt-BR 时注入 pt-BR 约束', async () => {
    await i18n.changeLanguage('pt-BR')
    const result = await applyOutputLanguageGate(baseMessages(), { outputKind: 'functional-prose' })
    expect(lastUser(result).endsWith(PORTUGUESE_OUTPUT_CONSTRAINT)).toBe(true)
  })

  it('creative + 未回填项目 在 uiLocale=pt-BR 时回退 pt-BR 约束', async () => {
    await i18n.changeLanguage('pt-BR')
    const projectId = await addProject(undefined)
    const result = await applyOutputLanguageGate(baseMessages(), {
      projectId,
      outputKind: 'creative',
    })
    expect(lastUser(result).endsWith(PORTUGUESE_OUTPUT_CONSTRAINT)).toBe(true)
  })
})

describe('WS-3A fail-safe：UNKNOWN category', () => {
  it('未登记 category 在测试环境抛错', async () => {
    await expect(
      applyOutputLanguageGate(baseMessages(), { category: 'definitely.not.registered' }),
    ).rejects.toThrow(/unknown task category/)
  })

  it('缺失 category 且无 outputKind 在测试环境抛错', async () => {
    await expect(applyOutputLanguageGate(baseMessages(), {})).rejects.toThrow(/unknown task category/)
    await expect(applyOutputLanguageGate(baseMessages())).rejects.toThrow(/unknown task category/)
  })

  it('显式 outputKind 优先：未登记 category 也不抛错', async () => {
    const result = await applyOutputLanguageGate(baseMessages(), {
      category: 'definitely.not.registered',
      outputKind: 'language-neutral',
    })
    expect(result).toEqual(baseMessages())
  })
})

describe('WS-3A 过渡期缺省推导（classifyAITask → interim OutputKind）', () => {
  it('creation kind（chapter.content）→ creative → 注入约束', async () => {
    const projectId = await addProject('zh-CN')
    const result = await applyOutputLanguageGate(baseMessages(), {
      category: 'chapter.content',
      projectId,
    })
    expect(lastUser(result).endsWith(SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT)).toBe(true)
  })

  it('review kind（review.quality）→ functional-prose → uiLocale 约束', async () => {
    const projectId = await addProject('pt-BR')
    const result = await applyOutputLanguageGate(baseMessages(), {
      category: 'review.quality',
      projectId,
    })
    expect(lastUser(result).endsWith(SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT)).toBe(true)
  })

  it('新登记的结构化 category → 不注入', async () => {
    const projectId = await addProject('pt-BR')
    for (const category of [
      'canon.setting.extract',
      'storyline-progress.map',
      'cultivation.progress',
      'eval.ns0',
      'eval.ns1',
      'eval.ns1.judge',
    ]) {
      const result = await applyOutputLanguageGate(baseMessages(), { category, projectId })
      expect(hasOutputLanguageConstraint(result), category).toBe(false)
      expect(result).toEqual(baseMessages())
    }
  })

  it('agent 角色 kind 过渡期不推导 → 不注入（WS-3B 显式声明）', async () => {
    const result = await applyOutputLanguageGate(baseMessages(), { category: 'agent.prose' })
    expect(hasOutputLanguageConstraint(result)).toBe(false)
    expect(result).toEqual(baseMessages())
  })
})

describe('WS-3A task-routing 新分类', () => {
  it('新登记 category 返回预期 kind', () => {
    expect(classifyAITask('canon.setting.extract')).toBe('extraction')
    expect(classifyAITask('storyline-progress.map')).toBe('extraction')
    expect(classifyAITask('cultivation.progress')).toBe('extraction')
    expect(classifyAITask('eval.ns0')).toBe('analysis')
    expect(classifyAITask('eval.ns1')).toBe('analysis')
    expect(classifyAITask('eval.ns1.judge')).toBe('analysis')
  })
})

describe('WS-3A 双重注入守卫', () => {
  it('已带 zh 约束的消息不被 gate 重复注入', async () => {
    const preConstrained = appendOutputLanguageConstraint(baseMessages(), 'zh-CN')
    const projectId = await addProject('pt-BR')
    const result = await applyOutputLanguageGate(preConstrained, {
      category: 'chapter.content',
      projectId,
      outputKind: 'creative',
    })
    expect(result).toEqual(preConstrained)
    expect(lastUser(result).split(SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT).length - 1).toBe(1)
  })

  it('已带 pt-BR 约束的消息不被 gate 重复注入', async () => {
    const preConstrained = appendOutputLanguageConstraint(baseMessages(), 'pt-BR')
    const result = await applyOutputLanguageGate(preConstrained, { outputKind: 'creative' })
    expect(result).toEqual(preConstrained)
  })

  it('hasOutputLanguageConstraint 识别三种约束签名', () => {
    expect(hasOutputLanguageConstraint(baseMessages())).toBe(false)
    expect(hasOutputLanguageConstraint(appendOutputLanguageConstraint(baseMessages(), 'zh-CN'))).toBe(true)
    expect(hasOutputLanguageConstraint(appendOutputLanguageConstraint(baseMessages(), 'pt-BR'))).toBe(true)
    expect(hasOutputLanguageConstraint(appendOutputLanguageConstraint(baseMessages(), 'en'))).toBe(true)
  })
})
