/**
 * R-I18N-P2 · fix-7 —— 章纲工作坊语言契约回归。
 *
 * 覆盖：
 * 1. 五阶段全部显式声明输出意图（scan/motivation/collision/scenes = mixed，
 *    quality = functional-structured），不再走 client gate 过渡推导；
 * 2. 质量节点保持严格 JSON 协议与闭集枚举，并声明字段级 UI 语言指令
 *    （reason/suggestion 直接以 UI 语言书写；quote/键名/枚举/ID 不得翻译）；
 * 3. 字段角色契约：quote 源文保留、reason/suggestion 为 UI 散文、category 仅展示、
 *    ID/枚举为 canonical、场景钩子/概要为内容散文；
 * 4. 解析器恢复与闭集校验：quote 逐字校验、cognition/canon 闭集过滤、
 *    不可写清单与审计元数据不得充当剧情证据；
 * 5. Oracle fix-7 复审：prohibitions 是面向作者的守卫散文（非 canonical），
 *    场景卡 prompt 显式声明其语言契约，采纳持久化原样保留、无解析后翻译。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildOutlineWorkshopMessages,
  createOutlineWorkshopNode,
  evaluateWorkshopQuality,
  extractWorkshopSceneNarrative,
  OUTLINE_WORKSHOP_STAGES,
  OUTLINE_WORKSHOP_STAGE_CATEGORIES,
  OUTLINE_WORKSHOP_STAGE_OUTPUT_KINDS,
  WORKSHOP_QUALITY_FIELD_ROLES,
  WORKSHOP_SCENES_FIELD_ROLES,
  type OutlineWorkshopNodeInput,
} from '../../src/lib/outline/workshop'
import { adoptChapterOutlineWorkshopResult } from '../../src/lib/outline/adopt-workshop'
import { db } from '../../src/lib/db/schema'
import { getSupportedUiLang, SUPPORTED_LANGS } from '../../src/i18n'
import type { AssembleContextResult } from '../../src/lib/registry/types'
import type { TemporalFact } from '../../src/lib/types'

function assembled(): AssembleContextResult {
  return {
    text: '全部上下文',
    included: ['chapterOutline', 'characters'],
    segments: [
      { label: '章纲', layer: 'L1', content: '【本章大纲】夜探密室', tokens: 4, trimmable: false },
      { label: '角色', layer: 'L1', content: '【角色】[ID:1] 林舟', tokens: 3, trimmable: false },
    ],
    omitted: [],
    trimmed: [],
    totalInputTokens: 7,
    inputBudget: 48_000,
    overBudgetBeforeTrim: false,
    overBudgetAfterTrim: false,
  }
}

function nodeInput(): OutlineWorkshopNodeInput {
  return {
    chapterTitle: '第三章 夜探',
    chapterSummary: '林舟潜入密室',
    assembled: assembled(),
    artifacts: {
      scan: '林舟已有青铜钥匙。',
      motivation: '林舟想确认真相。',
      collision: '林舟推开石门。',
    },
    cognitionCatalog: '',
    canonCatalog: '',
  }
}

function canonFact(): TemporalFact {
  return {
    id: 9,
    projectId: 1,
    subjectName: '世界',
    predicate: 'magicSource',
    factKind: 'state',
    value: '月潮',
    sourceType: 'setting',
    status: 'confirmed',
    valueType: 'string',
    confidence: 1,
    sourceFingerprint: 'fp',
    createdAt: 1,
    updatedAt: 1,
  }
}

const QUALITY_EMPTY = { advisories: [], cognitionReferences: [], canonClaims: [] }

type QualityInput = Parameters<typeof evaluateWorkshopQuality>[0]

function qualityInput(overrides: Partial<QualityInput> = {}): QualityInput {
  return {
    raw: JSON.stringify(QUALITY_EMPTY),
    generatedDraft: '林舟推开石门，密室一片漆黑。',
    heldItems: [],
    knownCharacterNames: ['林舟'],
    cognition: { catalog: [], projected: [] },
    canonFacts: [],
    ...overrides,
  }
}

describe('I18N-P2 · fix-7 工作坊语言契约', () => {
  it('五阶段全部显式声明输出意图（无过渡推导）', () => {
    expect(OUTLINE_WORKSHOP_STAGE_OUTPUT_KINDS).toEqual({
      scan: 'mixed',
      motivation: 'mixed',
      collision: 'mixed',
      quality: 'functional-structured',
      scenes: 'mixed',
    })
    for (const stage of OUTLINE_WORKSHOP_STAGES) {
      expect(OUTLINE_WORKSHOP_STAGE_OUTPUT_KINDS[stage]).toBeTruthy()
      expect(OUTLINE_WORKSHOP_STAGE_CATEGORIES[stage]).toBeTruthy()
    }
  })

  for (const stage of OUTLINE_WORKSHOP_STAGES) {
    it(`阶段 ${stage} 的调用元数据携带显式 category + outputKind`, async () => {
      const start = vi.fn(async () => JSON.stringify(QUALITY_EMPTY))
      const node = createOutlineWorkshopNode({
        stage,
        projectId: 7,
        chapterIdentity: 3,
        ai: { start },
      })
      await node.run(node.assembleInput(nodeInput()))
      expect(start).toHaveBeenCalledTimes(1)
      expect(start.mock.calls[0][2]).toEqual({
        category: OUTLINE_WORKSHOP_STAGE_CATEGORIES[stage],
        projectId: 7,
        outputKind: OUTLINE_WORKSHOP_STAGE_OUTPUT_KINDS[stage],
      })
    })
  }

  it('质量节点保持严格 JSON 协议与闭集枚举，并声明字段级 UI 语言指令', () => {
    const system = buildOutlineWorkshopMessages('quality', nodeInput())[0].content
    // 严格 JSON 协议与顶层键不变
    expect(system).toContain('输出严格 JSON，不加代码块')
    expect(system).toContain('"advisories"')
    expect(system).toContain('"cognitionReferences"')
    expect(system).toContain('"canonClaims"')
    // category 闭集枚举保留中文原值（prompt 内部元数据合法）
    expect(system).toContain('反派降智|主角开天眼|巧合推进|轻易胜利|强行冲突|信息差滥用|工具人|时间冻结|其它')
    // 字段级语言指令：reason/suggestion 直接以当前 UI 语言书写（非事后翻译），
    // quote/键名/枚举/ID 保持原样
    const label = SUPPORTED_LANGS.find(item => item.code === getSupportedUiLang())!.label
    expect(system).toContain(`直接用${label}书写`)
    expect(system).toContain('不得事后翻译')
    expect(system).toContain('不得翻译或改写')
  })

  it('质量字段契约：quote 源文保留、reason/suggestion 为 UI 散文、category 仅展示、ID 为 canonical', () => {
    expect(WORKSHOP_QUALITY_FIELD_ROLES['advisories[].quote']).toBe('source-preserved')
    expect(WORKSHOP_QUALITY_FIELD_ROLES['advisories[].reason']).toBe('ui-prose')
    expect(WORKSHOP_QUALITY_FIELD_ROLES['advisories[].suggestion']).toBe('ui-prose')
    expect(WORKSHOP_QUALITY_FIELD_ROLES['advisories[].category']).toBe('display-only')
    expect(WORKSHOP_QUALITY_FIELD_ROLES['cognitionReferences[].characterId']).toBe('canonical')
    expect(WORKSHOP_QUALITY_FIELD_ROLES['cognitionReferences[].knowledgeKey']).toBe('canonical')
    expect(WORKSHOP_QUALITY_FIELD_ROLES['canonClaims[].factId']).toBe('canonical')
    expect(WORKSHOP_QUALITY_FIELD_ROLES['canonClaims[].proposedValue']).toBe('canonical')
    expect(WORKSHOP_QUALITY_FIELD_ROLES['canonClaims[].quote']).toBe('source-preserved')
  })

  it('场景卡字段契约：钩子/概要为内容散文，ID/闭集枚举为 canonical', () => {
    expect(WORKSHOP_SCENES_FIELD_ROLES.openingHook).toBe('content-prose')
    expect(WORKSHOP_SCENES_FIELD_ROLES.endingCliffhanger).toBe('content-prose')
    expect(WORKSHOP_SCENES_FIELD_ROLES['scenes[].summary']).toBe('content-prose')
    expect(WORKSHOP_SCENES_FIELD_ROLES.emotionArc).toBe('canonical')
    expect(WORKSHOP_SCENES_FIELD_ROLES['scenes[].pace']).toBe('canonical')
    expect(WORKSHOP_SCENES_FIELD_ROLES.appearingCharacterIds).toBe('canonical')
    expect(WORKSHOP_SCENES_FIELD_ROLES.foreshadowIds).toBe('canonical')
  })

  it('Oracle fix-7：prohibitions 是面向作者的守卫散文，不是 canonical 数据', () => {
    expect(WORKSHOP_SCENES_FIELD_ROLES.prohibitions).toBe('content-prose')
    expect(WORKSHOP_SCENES_FIELD_ROLES.prohibitions).not.toBe('canonical')
  })

  it('场景卡 prompt 字段语言契约：prohibitions 与场景文字同语言，键名/枚举/ID/quote 不翻译', () => {
    const system = buildOutlineWorkshopMessages('scenes', nodeInput())[0].content
    // JSON 协议骨架与闭集枚举保持不变
    expect(system).toContain('输出严格 JSON，不加代码块')
    expect(system).toContain('"prohibitions"')
    expect(system).toContain('rising|falling|flat|wave|climax')
    expect(system).toContain('slow|medium|fast|climax')
    // prohibitions 显式声明为散文（跟随 mixed 意图的内容语言），而非结构化元数据
    expect(system).toContain('prohibitions 是面向作者的守卫说明散文，与场景文字使用同一种语言书写')
    expect(system).toContain('不得翻译或改写')
  })

  it('源文保留：quote 不在草案中的 advisory/canonClaim 被过滤；闭集内 category 原样透传', () => {
    const generatedDraft = '林舟推开石门，密室一片漆黑。'
    const raw = JSON.stringify({
      advisories: [
        { category: '巧合推进', quote: '草案里不存在的话', reason: '引文无效', suggestion: '应被过滤' },
        { category: '工具人', quote: '密室一片漆黑', reason: '', suggestion: '缺 reason 也应过滤' },
        { category: '工具人', quote: '密室一片漆黑', reason: '成立', suggestion: '保留' },
      ],
      cognitionReferences: [],
      canonClaims: [
        { factId: 9, proposedValue: '太阳', quote: '草案里没有的引文' },
        { factId: 99, proposedValue: '月潮', quote: '密室一片漆黑' },
      ],
    })
    const evaluation = evaluateWorkshopQuality(qualityInput({ raw, generatedDraft, canonFacts: [canonFact()] }))
    // 只有 quote 命中且 reason 非空的 advisory 保留；AI 的枚举值原样透传（不在库层翻译）
    expect(evaluation.advisories).toHaveLength(1)
    expect(evaluation.advisories[0]).toMatchObject({ category: '工具人', quote: '密室一片漆黑', reason: '成立' })
    // 两条 canonClaim 分别被 quote 校验与闭集 factId 校验过滤 → 无 canon 闸门问题
    expect(evaluation.gate.issues.filter(issue => issue.code.startsWith('canon:'))).toHaveLength(0)
    expect(evaluation.gate.status).toBe('pass')
  })

  it('宪法冲突仍被硬查：quote 命中且设定值冲突时阻断', () => {
    const generatedDraft = '林舟说：魔法源自太阳。'
    const raw = JSON.stringify({
      advisories: [],
      cognitionReferences: [],
      canonClaims: [{ factId: 9, proposedValue: '太阳', quote: '魔法源自太阳' }],
    })
    const evaluation = evaluateWorkshopQuality(qualityInput({ raw, generatedDraft, canonFacts: [canonFact()] }))
    expect(evaluation.gate.status).toBe('blocked')
    expect(evaluation.gate.issues.map(issue => issue.code)).toContain('canon:0')
  })

  it('解析器恢复：JSON 被散文包裹时仍完成引用校验与闭集硬查', () => {
    const generatedDraft = '林舟说：魔法源自太阳。'
    const raw = `审查结果如下：\n${JSON.stringify({
      advisories: [{ category: '强行冲突', quote: '魔法源自太阳', reason: '与宪法冲突', suggestion: '改回月潮' }],
      cognitionReferences: [],
      canonClaims: [{ factId: 9, proposedValue: '太阳', quote: '魔法源自太阳' }],
    })}\n以上。`
    const evaluation = evaluateWorkshopQuality(qualityInput({ raw, generatedDraft, canonFacts: [canonFact()] }))
    expect(evaluation.advisories).toHaveLength(1)
    expect(evaluation.gate.status).toBe('blocked')
    expect(evaluation.gate.issues.map(issue => issue.code)).toContain('canon:0')
  })

  it('场景叙事提取只认内容字段：不可写清单与审计元数据不是剧情证据', () => {
    const raw = JSON.stringify({
      openingHook: '林舟走进密室。',
      endingCliffhanger: '门外传来脚步声。',
      sceneLocation: '密室',
      prohibitions: ['不能让林舟再次获得青铜钥匙'],
      scenes: [{ title: '试探', summary: '林舟观察石门。', location: '密室', conflict: '守卫将归' }],
      cognitionReferences: [{ characterId: 1, knowledgeKey: 'door-code', quote: '认知审计元数据' }],
      canonClaims: [{ factId: 9, proposedValue: '太阳', quote: '宪法审计元数据' }],
    })
    const narrative = extractWorkshopSceneNarrative(raw)
    expect(narrative).toContain('林舟走进密室')
    expect(narrative).toContain('门外传来脚步声')
    expect(narrative).toContain('林舟观察石门')
    expect(narrative).not.toContain('再次获得青铜钥匙')
    expect(narrative).not.toContain('认知审计元数据')
    expect(narrative).not.toContain('宪法审计元数据')
  })

  it('严格 JSON 边界：非对象/非 JSON 输出得到空解析而非假证据', () => {
    expect(extractWorkshopSceneNarrative('完全不是 JSON')).toBe('')
    const arrayOnly = evaluateWorkshopQuality(qualityInput({ raw: '[{"advisories":[]}]' }))
    expect(arrayOnly.advisories).toEqual([])
    expect(arrayOnly.gate.issues).toEqual([])
    const notJson = evaluateWorkshopQuality(qualityInput({ raw: '这次没有结构化输出' }))
    expect(notJson.advisories).toEqual([])
    expect(notJson.gate.issues).toEqual([])
  })
})

describe('I18N-P2 · fix-7 · prohibitions 持久化边界（adopt-workshop）', () => {
  async function seed() {
    const now = Date.now()
    const projectId = await db.projects.add({
      name: '工坊语言契约',
      genre: '',
      description: '',
      targetWordCount: 0,
      enableMultiWorld: false,
      createdAt: now,
      updatedAt: now,
    } as never) as number
    const outlineNodeId = await db.outlineNodes.add({
      projectId,
      parentId: null,
      type: 'chapter',
      title: '第一章',
      summary: '夜探',
      order: 0,
      createdAt: now,
      updatedAt: now,
    } as never) as number
    const characterId = await db.characters.add({
      projectId,
      name: '林舟',
      roleWeight: 'main',
      moralAxis: 'gray',
      orderAxis: 'neutral',
      createdAt: now,
      updatedAt: now,
    } as never) as number
    return { projectId, outlineNodeId, characterId }
  }

  beforeEach(async () => {
    await db.delete()
    await db.open()
  })
  afterEach(() => db.close())

  it('prohibitions 以源文散文持久化：无闭集改写、无解析后翻译，仅 trim/去重', async () => {
    const seeded = await seed()
    const raw = JSON.stringify({
      openingHook: '承接夜色',
      endingCliffhanger: '门后传来脚步',
      sceneLocation: '密室',
      emotionArc: 'rising',
      appearingCharacterIds: [seeded.characterId],
      foreshadowIds: [],
      // 混合语言的守卫散文必须逐字保留：任何解析后翻译或枚举改写都会破坏该断言
      prohibitions: [
        'Não revelar o segredo da chave',
        'Não revelar o segredo da chave',
        '林舟不能提前知道密码',
      ],
      scenes: [{
        title: '潜入',
        summary: '林舟潜入密室',
        location: '密室',
        conflict: '躲避守卫',
        pace: 'fast',
        characterIds: [seeded.characterId],
        estimatedWords: 1200,
      }],
    })
    const result = await adoptChapterOutlineWorkshopResult({
      raw,
      projectId: seeded.projectId,
      outlineNodeId: seeded.outlineNodeId,
      chapterSummary: '夜探',
      validCharacterIds: new Set([seeded.characterId]),
      validForeshadowIds: new Set(),
    })

    expect(result).toMatchObject({ ok: true, sceneCount: 1, prohibitionCount: 2 })
    const row = await db.detailedOutlines.where('outlineNodeId').equals(seeded.outlineNodeId).first()
    // 原样透传（仅去重），不被当作 canonical 闭集值校验或翻译
    expect(row?.prohibitions).toEqual([
      'Não revelar o segredo da chave',
      '林舟不能提前知道密码',
    ])
  })
})
