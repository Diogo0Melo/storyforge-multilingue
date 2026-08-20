import { describe, it, expect } from 'vitest'
import {
  parseReverseMultiWorldOutput,
  parseReverseOutput,
} from '../../src/lib/ai/inspiration-reverse'

// 一份最小可用的反推 JSON（字段可空，解析器只要能取到对象即可）
const REVERSE_JSON = {
  worldview: { worldOrigin: '灵界崩塌', powerHierarchy: '灵阶九品' },
  storyCore: { logline: '少年逆袭', theme: '成长', centralConflict: '与灵界世家的世仇' },
  characters: [
    { name: '林尘', roleWeight: 'main', moralAxis: 'neutral', orderAxis: 'lawful', personality: '坚韧' },
  ],
}
const JSON_STR = JSON.stringify(REVERSE_JSON)

describe('R-inspiration-parse（灵感反推解析健壮性 · 社区反馈"第一遍不出来"根因）', () => {
  it('纯 JSON → 解析成功', () => {
    const r = parseReverseOutput(JSON_STR)
    expect(r).not.toBeNull()
    expect(r!.worldview.worldOrigin).toBe('灵界崩塌')
    expect(r!.characters).toHaveLength(1)
  })

  it('```json 围栏包裹 → 解析成功', () => {
    const r = parseReverseOutput('这是你要的设定：\n```json\n' + JSON_STR + '\n```\n希望满意~')
    expect(r).not.toBeNull()
    expect(r!.storyCore.logline).toBe('少年逆袭')
  })

  it('带前后文、无围栏（旧代码会 JSON.parse 失败→null→第一遍不显示）→ 现在能解析', () => {
    const r = parseReverseOutput('好的，以下是根据你的灵感反推的结果：\n' + JSON_STR + '\n\n如需调整请告诉我。')
    expect(r).not.toBeNull()                       // ← 这是本次修复的关键断言
    expect(r!.worldview.worldOrigin).toBe('灵界崩塌')
    expect(r!.characters[0].name).toBe('林尘')
  })

  it('未闭合围栏（被 maxTokens 截断）→ 尽量修复解析，不直接崩', () => {
    // 截断到 characters 之前但结构可修复
    const truncated = '```json\n{"worldview":{"worldOrigin":"灵界崩塌"},"storyCore":{"logline":"少年逆袭"},"characters":[]'
    const r = parseReverseOutput(truncated)
    expect(r).not.toBeNull()
    expect(r!.worldview.worldOrigin).toBe('灵界崩塌')
  })

  it('完整对象偶发使用单引号 → JSON5 兼容解析后仍走闭集整形', () => {
    const output = `\`\`\`json
{
  "worldview": {"worldOrigin": "潮汐旧城"},
  "storyCore": {"logline": '守塔人保存所有被遗忘的名字', "theme": "记忆"},
  "characters": [],
}
\`\`\``
    const r = parseReverseOutput(output)
    expect(r?.storyCore.logline).toBe('守塔人保存所有被遗忘的名字')
    expect(r?.worldview.worldOrigin).toBe('潮汐旧城')
  })

  it('模型把文本字段返回成对象数组时可读整形，不出现 [object Object]', () => {
    const output = JSON.stringify({
      worldview: {
        worldOrigin: '潮汐旧城',
        races: [{ name: '潮生者', trait: '能听见海的低语' }],
        factionLayout: [{ name: '档案局', goal: '保存名字' }],
      },
      storyCore: { logline: '保存名字' },
      characters: [],
    })
    const r = parseReverseOutput(output)
    expect(r?.worldview.races).toContain('潮生者')
    expect(r?.worldview.races).toContain('能听见海的低语')
    expect(r?.worldview.factionLayout).not.toContain('[object Object]')
  })

  it('完全不是 JSON（模型拒答）→ 返回 null，不抛异常', () => {
    expect(parseReverseOutput('抱歉，我无法根据这个灵感生成设定。')).toBeNull()
    expect(parseReverseOutput('')).toBeNull()
  })

  it('多世界解析保留多语言自由文本值的字面量', () => {
    const output = JSON.stringify({
      storyCore: {
        logline: 'A cidade guarda memórias / 城市保存记忆',
        theme: 'mémoire et esperança',
        centralConflict: '記憶を失うことと希望の選択',
        plotPattern: '旅と帰還',
        mainPlot: 'The archive opens at dawn.',
      },
      worlds: [{
        name: 'Lúmen-界',
        type: 'primary',
        worldOrigin: 'Uma maré de luz atravessa 雾海。',
        powerHierarchy: '階位 / níveis de poder',
        continentLayout: '西岸—costa oeste',
        climateByRegion: '暖流与 chuva tropical',
        historyLine: 'La ville n’oublie personne.',
        races: '人类 / humanos / 人間',
        factionLayout: 'Arquivo Azul · 青档案局',
        entryCondition: 'Only by invitation / 仅限邀请',
        powerRestriction: 'sem tradução: 禁止跨界',
      }],
      characters: [{
        name: 'Mira 星',
        roleWeight: 'main',
        moralAxis: 'neutral',
        orderAxis: 'lawful',
        shortDescription: 'une cartographe / 一名制图师',
        personality: 'curieuse e 坚韧',
        background: 'Née près de 海港。',
        motivation: 'Encontrar la última puerta',
        arc: '从怀疑到信任',
        homeWorld: 'Lúmen-界',
        isCrossWorld: false,
      }],
    })

    const parsed = parseReverseMultiWorldOutput(output)
    expect(parsed).not.toBeNull()
    expect(parsed!.storyCore.logline).toBe('A cidade guarda memórias / 城市保存记忆')
    expect(parsed!.worlds[0].name).toBe('Lúmen-界')
    expect(parsed!.worlds[0].factionLayout).toBe('Arquivo Azul · 青档案局')
    expect(parsed!.worlds[0].entryCondition).toBe('Only by invitation / 仅限邀请')
    expect(parsed!.characters[0].personality).toBe('curieuse e 坚韧')
    expect(parsed!.characters[0].homeWorld).toBe('Lúmen-界')
  })
})
