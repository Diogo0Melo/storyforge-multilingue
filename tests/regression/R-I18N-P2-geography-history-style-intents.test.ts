/**
 * WS-3B Phase 2 · fix-5b lane — geography / history / style 调用点显式 outputKind。
 *
 * 契约（orchestrator 批准）：
 * - geography.concept-map / geography.world-map 是混合信封：JSON 键名、坐标、枚举、
 *   seed 与证据引文等协议字段必须原样保留，新增的作者面向散文跟随项目 RESOLVED
 *   contentLanguage → 调用点显式声明 outputKind: 'mixed'。
 * - history.consult 是面向作者的考据/审校散文，跟随 UI 语言；持久化史料/上下文文本
 *   作为输入原样保留 → 调用点显式声明 outputKind: 'functional-prose'。
 * - style.learn 的画像说明是面向 UI 的分析散文；章节样本/改稿对照作为源文本保留
 *   → 调用点显式声明 outputKind: 'functional-prose'。
 * - category/projectId 转发形状其余部分不变；history.storm 既有 creative 声明不削弱；
 *   StyleLearningPanel 的 resolveRequestConfig 配置解析点（非 AI 调用 meta）保持原形状。
 * - 世界地图 JSON 的字段级语言契约只在 prompt builder 内以协议兼容方式声明，
 *   绝不在接收后翻译已解析 JSON（parseVoronoiMapConfig 不改写协议字段）。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildStyleLearnPrompt } from '../../src/lib/ai/adapters/style-adapter'
import {
  buildVoronoiMapPrompt,
  parseVoronoiMapConfig,
} from '../../src/lib/ai/adapters/voronoi-map-adapter'
import { buildHistoryAIMessages, buildHistoryManualContext } from '../../src/lib/history/ai-plan'
import type { PromptTemplate } from '../../src/lib/types'
import type { HistoricalTimelineEvent } from '../../src/lib/types/history'

const readSource = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

/** needle 在源码中的每一处出现，其后 300 字符窗口都必须声明期望的 outputKind。 */
function expectAllOccurrencesDeclare(
  source: string,
  needle: string,
  file: string,
  outputKind: string,
): void {
  let index = source.indexOf(needle)
  expect(index, `${file} 应包含 ${needle}`).toBeGreaterThanOrEqual(0)
  while (index >= 0) {
    const callSite = source.slice(index, index + 300)
    expect(
      callSite,
      `${file} @${index} 处的 ${needle} 未声明 ${outputKind}`,
    ).toContain(`outputKind: '${outputKind}'`)
    index = source.indexOf(needle, index + needle.length)
  }
}

describe('fix-5b · geography/history/style 调用点 outputKind 源码锚定', () => {
  it('geography.concept-map 声明 mixed（SVG 信封：结构/坐标为协议字段，地名说明为作者面向散文）', () => {
    const source = readSource('src/components/geography/GeographyPanel.tsx')
    expectAllOccurrencesDeclare(source, "category: 'geography.concept-map'", 'GeographyPanel.tsx', 'mixed')
    expect(source).toContain(
      "{ category: 'geography.concept-map', projectId: project.id!, outputKind: 'mixed' }",
    )
  })

  it('geography.world-map 声明 mixed（JSON 信封：枚举/数值/seed/证据为协议字段，补全地名为作者面向）', () => {
    const source = readSource('src/components/geography/WorldMapPanel.tsx')
    expectAllOccurrencesDeclare(source, "category: 'geography.world-map'", 'WorldMapPanel.tsx', 'mixed')
    expect(source).toContain(
      "{ category: 'geography.world-map', projectId: project.id!, outputKind: 'mixed' }",
    )
  })

  it('history.consult 声明 functional-prose（作者面向考据散文跟随 UI 语言），storm 既有 creative 不削弱', () => {
    const source = readSource('src/components/history/useHistoryAI.ts')
    expectAllOccurrencesDeclare(source, "category: 'history.consult'", 'useHistoryAI.ts', 'functional-prose')
    expect(source).toContain(
      "{ category: 'history.consult', projectId, outputKind: 'functional-prose' }",
    )
    expect(source).toContain("{ category: 'history.storm', projectId, outputKind: 'creative' }")
  })

  it('style.learn 的 chat 调用声明 functional-prose；resolveRequestConfig 配置解析点保持原形状', () => {
    const source = readSource('src/components/style/StyleLearningPanel.tsx')
    expect(source).toContain(
      "const out = await chat(messages, aiConfig, { category: 'style.learn', projectId: project.id!, outputKind: 'functional-prose' })",
    )
    // 非 AI 调用的配置解析出现点不挂 outputKind
    expect(source).toContain("resolveRequestConfig(aiConfig, { category: 'style.learn' })")
  })
})

describe('fix-5b · 世界地图 JSON 信封 canonical 字段处理（mixed 契约）', () => {
  it('buildVoronoiMapPrompt 在 system prompt 声明字段级语言契约：协议字段禁翻译，证据逐字保留', () => {
    const [system] = buildVoronoiMapPrompt(null, '', [], '')
    expect(system.role).toBe('system')
    expect(system.content).toContain('字段语言契约')
    expect(system.content).toContain('禁止翻译或改写')
    expect(system.content).toContain('evidenceQuote 必须保持用户资料中的逐字原文')
  })

  it('parseVoronoiMapConfig 原样保留键名/枚举/数值/seed 与逐字证据；伪造证据降级为 inferred', () => {
    const sourceText = '天南帝国以天南城为都。落雁镇在天南城西北百里。'
    const raw = JSON.stringify({
      seed: 'seed-42',
      mapName: '九州',
      pointCount: 12000,
      landRatio: 0.45,
      heightmapTemplate: 'continents',
      namingStyle: 'chinese',
      stateNames: ['天南帝国'],
      burgNames: ['天南城', '落雁镇'],
      spatialEntities: [
        {
          name: '天南帝国',
          kind: 'state',
          scaleTier: 'empire',
          capitalName: '天南城',
          source: 'explicit',
          evidenceQuote: '天南帝国以天南城为都',
        },
        {
          name: '天南城',
          kind: 'settlement',
          scaleTier: 'metropolis',
          source: 'explicit',
          evidenceQuote: '天南城',
        },
        {
          name: '落雁镇',
          kind: 'settlement',
          scaleTier: 'town',
          source: 'explicit',
          evidenceQuote: '落雁镇在天南城西北百里',
        },
        {
          name: '新北城',
          kind: 'settlement',
          scaleTier: 'city',
          source: 'explicit',
          evidenceQuote: '资料里根本不存在的伪造证据',
        },
      ],
      spatialRelations: [
        {
          from: '落雁镇',
          to: '天南城',
          direction: 'north-west',
          distanceTier: 'far',
          distanceValue: 100,
          distanceUnit: 'li',
          source: 'explicit',
          evidenceQuote: '落雁镇在天南城西北百里',
        },
      ],
    })

    const config = parseVoronoiMapConfig(raw, sourceText)

    // 协议字段原样通过：seed / 数值 / 枚举 / 名称列表
    expect(config.seed).toBe('seed-42')
    expect(config.mapName).toBe('九州')
    expect(config.pointCount).toBe(12000)
    expect(config.heightmapTemplate).toBe('continents')
    expect(config.namingStyle).toBe('chinese')
    expect(config.stateNames).toEqual(['天南帝国'])
    expect(config.burgNames).toEqual(['天南城', '落雁镇'])

    // 逐字证据命中 → explicit 原样保留
    const entities = config.spatialEntities ?? []
    const empire = entities.find(entity => entity.name === '天南帝国')
    expect(empire).toMatchObject({
      kind: 'state',
      scaleTier: 'empire',
      capitalName: '天南城',
      source: 'explicit',
      evidenceQuote: '天南帝国以天南城为都',
    })

    // 伪造证据 → 降级 inferred 且不落证据字段（绝不把改写文本当成证据）
    const fabricated = entities.find(entity => entity.name === '新北城')
    expect(fabricated).toBeDefined()
    expect(fabricated!.source).toBe('inferred')
    expect(fabricated!.evidenceQuote).toBeUndefined()

    // 空间关系的枚举/数值/单位原样保留
    const relations = config.spatialRelations ?? []
    expect(relations).toHaveLength(1)
    expect(relations[0]).toMatchObject({
      from: '落雁镇',
      to: '天南城',
      direction: 'north-west',
      distanceTier: 'far',
      distanceValue: 100,
      distanceUnit: 'li',
      source: 'explicit',
    })
  })

  it('非法枚举值（如被翻译过的值）一律丢弃，协议形状不被语言约束弯曲', () => {
    const raw = JSON.stringify({
      seed: 'seed-x',
      heightmapTemplate: 'continentes-traduzidos',
      namingStyle: 'portugues-brasileiro',
      pointCount: 99999,
    })
    const config = parseVoronoiMapConfig(raw, '')
    expect(config.seed).toBe('seed-x')
    expect(config.heightmapTemplate).toBeUndefined()
    expect(config.namingStyle).toBeUndefined()
    expect(config.pointCount).toBe(20000)
  })
})

describe('fix-5b · functional-prose 输入源文本逐字保留（prompt 契约）', () => {
  const consultTemplate: PromptTemplate = {
    scope: 'system',
    moduleKey: 'history.consult',
    promptType: 'consult',
    name: 'R-I18N-P2 fixture',
    description: 'fix-5b regression fixture',
    systemPrompt: '你是历史考据顾问。',
    userPromptTemplate: [
      '【条目】',
      '{{itemMeta}}',
      '【定稿】',
      '{{finalText}}',
      '【构想】',
      '{{conceptNote}}',
      '【咨询要求】',
      '{{consultPrompt}}',
      '【世界资料】',
      '{{worldContext}}',
    ].join('\n'),
    variables: ['itemMeta', 'finalText', 'conceptNote', 'consultPrompt', 'worldContext'],
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
  }

  it('history.consult：持久化史料与装配上下文逐字进入 prompt，不被改写', () => {
    const event: HistoricalTimelineEvent = {
      id: 7,
      projectId: 1,
      era: 'custom',
      year: 712,
      date: '开元元年',
      title: '玄宗即位',
      description: '李隆基即位，改元开元。',
      conceptNote: '强调励精图治的开端。',
      isHistorical: true,
      source: '《旧唐书》',
      consultPrompt: '请核实改元时间。',
      createdAt: 0,
      updatedAt: 0,
    }
    const worldContext = buildHistoryManualContext('大唐开元盛世。', '以帝王纪年。')
    const messages = buildHistoryAIMessages({
      mode: 'consult',
      target: { kind: 'event', item: event },
      worldContext,
      template: consultTemplate,
    })
    const user = messages.find(message => message.role === 'user')?.content ?? ''
    // 持久化源文本逐字保留
    expect(user).toContain('李隆基即位，改元开元。')
    expect(user).toContain('强调励精图治的开端。')
    expect(user).toContain('请核实改元时间。')
    expect(user).toContain('现有史料来源：《旧唐书》')
    // 装配的世界上下文逐字保留
    expect(user).toContain('【历史总述】大唐开元盛世。')
    expect(user).toContain('【纪年体系】以帝王纪年。')
  })

  it('style.learn：章节样本作为源文本逐字进入 prompt，不被改写', () => {
    const samples = [
      '【样本 1·测试章】',
      '他沉默地走过长街。',
      '',
      '────────',
      '',
      '【样本 2·另一章】',
      '雪落在旧城墙上。',
    ].join('\n')
    const messages = buildStyleLearnPrompt(samples, 2, 20)
    const all = messages.map(message => message.content).join('\n\n')
    expect(all).toContain('他沉默地走过长街。')
    expect(all).toContain('雪落在旧城墙上。')
  })
})
