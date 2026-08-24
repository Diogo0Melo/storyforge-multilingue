/**
 * Phase 3 · 大纲标题示例跟随项目内容语言（title/seed slice）
 *
 * 背景：核心卷/章纲种子模板曾把「第1卷/第2卷」「第1章/第2章」写死在输出示例里，
 * pt-BR/en 项目因此收到中文序数示例。本切片把示例改为模板变量，由 prompt 边界
 * （outline-adapter）按项目 RESOLVED contentLanguage 注入对应语言的示例：
 *   - zh-CN 保留原中文示例；pt-BR/en 用各自语言示例；无语言时回退语言无关占位符。
 *   - generation-plan / batch-generation 两条路径都传递项目内容语言。
 *   - JSON 输出键名、解析器行为、种子 name 与 outputKind 保持不变。
 *   - 任何路径不得改写已持久化的卷/章标题。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n, { getSupportedUiLang } from '../../src/i18n'
import { db } from '../../src/lib/db/schema'
import { CORE_PROMPT_SEEDS } from '../../src/lib/ai/prompt-seeds-core'
import {
  buildChapterOutlinePrompt,
  buildVolumeOutlinePrompt,
  resolveOutlineTitleExamples,
} from '../../src/lib/ai/adapters/outline-adapter'
import { buildOutlineGenerationPlan } from '../../src/lib/outline/generation-plan'
import { runBatchOutlineGeneration } from '../../src/lib/ai/batch-outline-runner'
import type { AssembleContextResult } from '../../src/lib/registry/types'
import type { ChatMessage, OutlineNode, Project } from '../../src/lib/types'

// ── 批量 runner 的 chat() mock：捕获发出的 messages，不触网 ──────────────────
const chatMock = vi.hoisted(() => ({
  calls: [] as ChatMessage[][],
  reply: '```json\n[{"title":"Capítulo 9","summary":"-resumo-"}]\n```',
}))

vi.mock('../../src/lib/ai/client', () => ({
  chat: vi.fn(async (messages: ChatMessage[]) => {
    chatMock.calls.push(messages)
    return chatMock.reply
  }),
  streamChat: vi.fn(),
  resolveRequestConfig: vi.fn(),
}))

const textOf = (messages: ChatMessage[]) => messages.map(message => message.content).join('\n\n')

function volumeSeed() {
  const seed = CORE_PROMPT_SEEDS.find(item => item.moduleKey === 'outline.volume' && item.name === '内置-卷级大纲生成')
  expect(seed, '核心卷纲种子必须存在且 name 保持规范值').toBeTruthy()
  return seed!
}

function chapterSeed() {
  const seed = CORE_PROMPT_SEEDS.find(item => item.moduleKey === 'outline.chapter' && item.name === '内置-章节大纲展开')
  expect(seed, '核心章纲种子必须存在且 name 保持规范值').toBeTruthy()
  return seed!
}

afterEach(async () => {
  chatMock.calls = []
  if (i18n.language !== 'zh-CN') await i18n.changeLanguage('zh-CN')
})

async function seedBatchProject(contentLanguage?: Project['contentLanguage']): Promise<Project> {
  await db.delete()
  await db.open()
  const now = 1
  const projectId = await db.projects.add({
    ...makeProject(contentLanguage),
  } as never) as number
  const worldId = await db.worlds.add({
    projectId, code: 'batch-outline-world', name: '批量章纲世界', description: '',
    currentVersion: 1, createdAt: now, updatedAt: now,
  } as never) as number
  const workId = await db.works.add({
    projectId, worldId, title: '批量章纲作品', description: '', genres: ['玄幻'],
    status: 'drafting', targetWordCount: 500_000, createdAt: now, updatedAt: now,
  } as never) as number
  for (const volume of makeVolumes(projectId)) {
    await db.outlineNodes.add({ ...volume, workId, worldGroupId: null } as never)
  }
  await db.projects.update(projectId, {
    activeWorldId: worldId, activeWorkId: workId, ownershipSchemaVersion: 1,
    worldCode: 'batch-outline-world', worldVersion: 1,
  })
  return { ...makeProject(contentLanguage), id: projectId, activeWorldId: worldId, activeWorkId: workId,
    ownershipSchemaVersion: 1, worldCode: 'batch-outline-world', worldVersion: 1 }
}

describe('Phase 3 · 核心种子模板不再硬编码中文序数示例', () => {
  it('卷纲种子：移除 第1卷/第2卷，改引用示例变量，且声明新变量', () => {
    const seed = volumeSeed()
    expect(seed.userPromptTemplate).not.toContain('第1卷')
    expect(seed.userPromptTemplate).not.toContain('第2卷')
    expect(seed.userPromptTemplate).toContain('{{volumeTitleExample}}')
    expect(seed.userPromptTemplate).toContain('{{volumeOutputExample}}')
    expect(seed.variables).toContain('volumeTitleExample')
    expect(seed.variables).toContain('volumeOutputExample')
    // JSON 输出契约文案不变：键名与代码块要求保留
    expect(seed.userPromptTemplate).toContain('每个元素包含 title')
    expect(seed.userPromptTemplate).toContain('请严格输出 JSON 数组')
  })

  it('章纲种子：移除 第1章/第2章，改引用示例变量，且声明新变量', () => {
    const seed = chapterSeed()
    expect(seed.userPromptTemplate).not.toContain('第1章')
    expect(seed.userPromptTemplate).not.toContain('第2章')
    expect(seed.userPromptTemplate).toContain('{{chapterTitleExample}}')
    expect(seed.userPromptTemplate).toContain('{{chapterOutputExample}}')
    expect(seed.variables).toContain('chapterTitleExample')
    expect(seed.variables).toContain('chapterOutputExample')
    expect(seed.userPromptTemplate).toContain('每个元素包含 title')
    expect(seed.userPromptTemplate).toContain('请严格输出 JSON 数组')
  })

  it('示例解析器：三种语言各自示例 + 无语言回退语言无关占位符', () => {
    expect(resolveOutlineTitleExamples('zh-CN').volumeOutputExample).toContain('第1卷：起始之章')
    expect(resolveOutlineTitleExamples('pt-BR').volumeOutputExample).toContain('Volume 1: O Começo')
    expect(resolveOutlineTitleExamples('en').chapterOutputExample).toContain('Chapter 1: Into the Fray')

    const neutral = resolveOutlineTitleExamples(undefined)
    expect(neutral.volumeOutputExample).toBe('[{"title":"...","summary":"..."},{"title":"...","summary":"..."}]')
    expect(neutral.chapterOutputExample).toBe('[{"title":"...","summary":"..."},{"title":"...","summary":"..."}]')
    expect(neutral.volumeTitleExample).not.toContain('第')
    expect(neutral.chapterTitleExample).not.toContain('Chapter')
  })
})

describe('Phase 3 · 适配器按 contentLanguage 渲染标题示例', () => {
  it('pt-BR / en 卷纲不再出现中文序数示例；zh-CN 保持原示例', () => {
    const pt = textOf(buildVolumeOutlinePrompt('Livro', 'fantasia', '世界', '主线', 500_000, '', undefined, '', '', undefined, 'pt-BR'))
    expect(pt).toContain('Volume 1: O Começo')
    expect(pt).not.toContain('第1卷')
    expect(pt).not.toContain('第2卷')

    const en = textOf(buildVolumeOutlinePrompt('Book', 'fantasy', '世界', '主线', 500_000, '', undefined, '', '', undefined, 'en'))
    expect(en).toContain('Volume 1: The Beginning')
    expect(en).not.toContain('第1卷')
    expect(en).not.toContain('第2卷')

    const zh = textOf(buildVolumeOutlinePrompt('书', '玄幻', '世界', '主线', 500_000, '', undefined, '', '', undefined, 'zh-CN'))
    expect(zh).toContain('第1卷：起始之章')
    expect(zh).toContain('第2卷：风云再起')
  })

  it('pt-BR / en 章纲不再出现中文序数示例；zh-CN 保持原示例', () => {
    const pt = textOf(buildChapterOutlinePrompt('卷一', '摘要', '世界', '', undefined, undefined, '', '', 'pt-BR'))
    expect(pt).toContain('Capítulo 1: Primeiros Passos')
    expect(pt).not.toContain('第1章')
    expect(pt).not.toContain('第2章')

    const en = textOf(buildChapterOutlinePrompt('卷一', '摘要', '世界', '', undefined, undefined, '', '', 'en'))
    expect(en).toContain('Chapter 1: Into the Fray')
    expect(en).not.toContain('第1章')
    expect(en).not.toContain('第2章')

    const zh = textOf(buildChapterOutlinePrompt('卷一', '摘要', '世界', '', undefined, undefined, '', '', 'zh-CN'))
    expect(zh).toContain('第1章：初入江湖')
    expect(zh).toContain('第2章：暗潮涌动')
  })

  it('未提供语言的直接/单测调用方回退语言无关占位符（安全，不泄漏中文序数）', () => {
    const volumeText = textOf(buildVolumeOutlinePrompt('书', '玄幻', '世界', '主线', 500_000))
    expect(volumeText).toContain('[{"title":"...","summary":"..."},{"title":"...","summary":"..."}]')
    expect(volumeText).not.toContain('第1卷')
    expect(volumeText).not.toContain('第2卷')

    const chapterText = textOf(buildChapterOutlinePrompt('卷一', '摘要', '世界', ''))
    expect(chapterText).toContain('[{"title":"...","summary":"..."},{"title":"...","summary":"..."}]')
    expect(chapterText).not.toContain('第1章')
    expect(chapterText).not.toContain('第2章')
  })

  it('输出 JSON 键名与代码块契约在所有语言下保持不变', () => {
    for (const lang of ['zh-CN', 'pt-BR', 'en', undefined] as const) {
      const volumeText = textOf(buildVolumeOutlinePrompt('书', '玄幻', '世界', '主线', 500_000, '', undefined, '', '', undefined, lang))
      expect(volumeText, `volume lang=${lang}`).toContain('"title"')
      expect(volumeText, `volume lang=${lang}`).toContain('"summary"')
      expect(volumeText, `volume lang=${lang}`).toContain('```json')
      const chapterText = textOf(buildChapterOutlinePrompt('卷一', '摘要', '世界', '', undefined, undefined, '', '', lang))
      expect(chapterText, `chapter lang=${lang}`).toContain('"title"')
      expect(chapterText, `chapter lang=${lang}`).toContain('"summary"')
      expect(chapterText, `chapter lang=${lang}`).toContain('```json')
    }
  })
})

// ── generation-plan / batch 共用的最小夹具 ──────────────────────────────────

function makeProject(contentLanguage?: Project['contentLanguage']): Project {
  return {
    id: 1,
    name: '语言传播测试',
    genre: '玄幻',
    genres: ['玄幻'],
    status: 'drafting',
    description: '',
    targetWordCount: 500_000,
    enableMultiWorld: false,
    contentLanguage,
    createdAt: 1,
    updatedAt: 1,
  }
}

function makeVolumes(projectId = 1): OutlineNode[] {
  return [
    { id: 1, projectId, type: 'volume', parentId: null, title: '第一卷·原样标题', summary: '主角入世', order: 0, createdAt: 1, updatedAt: 1 },
    { id: 2, projectId, type: 'volume', parentId: null, title: '第二卷', summary: '宗门大战', order: 1, createdAt: 1, updatedAt: 1 },
  ]
}

function makeAssembled(): AssembleContextResult {
  return {
    text: '【世界观】九州',
    included: ['storyCore', 'characters', 'worldRules', 'existingVolumeOutlines'],
    segments: [
      { label: '故事核心', layer: 'L1', content: '【故事核心】统一九州', tokens: 2, trimmable: true },
      { label: '角色档案', layer: 'L1', content: '【角色档案】林舟', tokens: 2, trimmable: true },
      { label: '世界规则', layer: 'L1', content: '【世界规则】不可越级', tokens: 2, trimmable: true },
      { label: '已有卷纲', layer: 'L1', content: '【已有卷大纲】第一卷：入世', tokens: 2, trimmable: true },
    ],
    omitted: [],
    trimmed: [],
    totalInputTokens: 8,
    inputBudget: 48_000,
    overBudgetBeforeTrim: false,
    overBudgetAfterTrim: false,
  }
}

describe('Phase 3 · generation-plan 传播项目内容语言', () => {
  it('project.contentLanguage=pt-BR 时卷纲/章纲计划使用葡语示例，且不改写持久化标题', () => {
    const project = makeProject('pt-BR')
    const volumes = makeVolumes()
    const nodes = [...volumes]
    const projectSnapshot = structuredClone(project)
    const volumesSnapshot = structuredClone(volumes)

    const volumePlan = buildOutlineGenerationPlan({
      request: { kind: 'volumes' },
      project,
      nodes,
      volumes,
      assembled: makeAssembled(),
      hint: '',
      options: {},
    })
    expect(volumePlan.status).toBe('ready')
    if (volumePlan.status !== 'ready') return
    const volumePrompt = textOf(volumePlan.messages)
    expect(volumePrompt).toContain('Volume 1: O Começo')
    expect(volumePrompt).not.toContain('第1卷')

    const chapterPlan = buildOutlineGenerationPlan({
      request: { kind: 'chapters', volumeId: 1 },
      project,
      nodes,
      volumes,
      assembled: makeAssembled(),
      hint: '',
      options: {},
    })
    expect(chapterPlan.status).toBe('ready')
    if (chapterPlan.status !== 'ready') return
    const chapterPrompt = textOf(chapterPlan.messages)
    expect(chapterPrompt).toContain('Capítulo 1: Primeiros Passos')
    expect(chapterPrompt).not.toContain('第1章')
    // 持久化标题原样进入 prompt，且调用后输入未被改写
    expect(chapterPrompt).toContain('第一卷·原样标题')
    expect(project).toEqual(projectSnapshot)
    expect(volumes).toEqual(volumesSnapshot)
  })

  it('project.contentLanguage=zh-CN 时保留中文示例（zh 项目完全保留现状）', () => {
    const volumes = makeVolumes()
    const plan = buildOutlineGenerationPlan({
      request: { kind: 'volumes' },
      project: makeProject('zh-CN'),
      nodes: [...volumes],
      volumes,
      assembled: makeAssembled(),
      hint: '',
      options: {},
    })
    expect(plan.status).toBe('ready')
    if (plan.status !== 'ready') return
    const prompt = textOf(plan.messages)
    expect(prompt).toContain('第1卷：起始之章')
    expect(prompt).toContain('第2卷：风云再起')
  })

  it('project.contentLanguage 缺失时回退 UI 语言（D1 语义），且项目语言优先于 UI 语言', async () => {
    await i18n.changeLanguage('en')
    expect(getSupportedUiLang()).toBe('en')

    // 未回填项目 → 回退 UI 语言 en
    const fallbackPlan = buildOutlineGenerationPlan({
      request: { kind: 'chapters', volumeId: 1 },
      project: makeProject(undefined),
      nodes: makeVolumes(),
      volumes: makeVolumes(),
      assembled: makeAssembled(),
      hint: '',
      options: {},
    })
    expect(fallbackPlan.status).toBe('ready')
    if (fallbackPlan.status !== 'ready') return
    const fallbackPrompt = textOf(fallbackPlan.messages)
    expect(fallbackPrompt).toContain('Chapter 1: Into the Fray')
    expect(fallbackPrompt).not.toContain('第1章')

    // 项目语言 zh-CN 优先于 UI 语言 en
    const overridePlan = buildOutlineGenerationPlan({
      request: { kind: 'chapters', volumeId: 1 },
      project: makeProject('zh-CN'),
      nodes: makeVolumes(),
      volumes: makeVolumes(),
      assembled: makeAssembled(),
      hint: '',
      options: {},
    })
    expect(overridePlan.status).toBe('ready')
    if (overridePlan.status !== 'ready') return
    const overridePrompt = textOf(overridePlan.messages)
    expect(overridePrompt).toContain('第1章：初入江湖')
    expect(overridePrompt).not.toContain('Chapter 1: Into the Fray')
  })
})

describe('Phase 3 · batch-outline-runner 传播项目内容语言', () => {
  it('contentLanguage=pt-BR 时批量章纲 prompt 使用葡语示例，标题原样且不被改写', async () => {
    const project = await seedBatchProject('pt-BR')
    const volumes = makeVolumes(project.id)
    const volumesSnapshot = structuredClone(volumes)

    const result = await runBatchOutlineGeneration({
      project,
      nodes: volumes,
      volumes,
      assembleContext: async () => makeAssembled(),
      contentLanguage: 'pt-BR',
    })

    expect(result.cancelled).toBe(false)
    expect(chatMock.calls.length).toBe(2)
    for (const messages of chatMock.calls) {
      const prompt = textOf(messages)
      expect(prompt).toContain('Capítulo 1: Primeiros Passos')
      expect(prompt).not.toContain('第1章')
    }
    // 持久化卷标题原样进入 prompt 且未被 runner 改写
    expect(textOf(chatMock.calls[0])).toContain('第一卷·原样标题')
    expect(volumes).toEqual(volumesSnapshot)

    // 解析器行为不变：mocked JSON 输出被原样解析（键名 title/summary）
    const parsed = result.chaptersByVolume.get(1)
    expect(parsed).toEqual([{ title: 'Capítulo 9', summary: '-resumo-' }])
  })

  it('contentLanguage=zh-CN 时批量章纲保留中文示例', async () => {
    const project = await seedBatchProject('zh-CN')
    await runBatchOutlineGeneration({
      project,
      nodes: makeVolumes(project.id),
      volumes: makeVolumes(project.id),
      assembleContext: async () => makeAssembled(),
      contentLanguage: 'zh-CN',
    })
    expect(chatMock.calls.length).toBe(2)
    const prompt = textOf(chatMock.calls[0])
    expect(prompt).toContain('第1章：初入江湖')
    expect(prompt).toContain('第2章：暗潮涌动')
  })

  it('未提供 contentLanguage 的直接调用方回退语言无关占位符', async () => {
    const project = await seedBatchProject()
    await runBatchOutlineGeneration({
      project,
      nodes: makeVolumes(project.id),
      volumes: makeVolumes(project.id),
      assembleContext: async () => makeAssembled(),
    })
    const prompt = textOf(chatMock.calls[0])
    expect(prompt).toContain('[{"title":"...","summary":"..."},{"title":"...","summary":"..."}]')
    expect(prompt).not.toContain('第1章')
  })
})
