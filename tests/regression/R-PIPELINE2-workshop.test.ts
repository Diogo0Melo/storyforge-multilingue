import { describe, expect, it, vi } from 'vitest'
import {
  buildOutlineWorkshopMessages,
  confirmWorkshopArtifact,
  createOutlineWorkshopNode,
  evaluateWorkshopQuality,
  extractWorkshopSceneNarrative,
  rewindWorkshopArtifacts,
  type OutlineWorkshopNodeInput,
} from '../../src/lib/outline/workshop'
import {
  prepareGenerationNode,
  runGenerationNode,
} from '../../src/lib/generation/generation-node'
import type { AssembleContextResult } from '../../src/lib/registry/types'
import type { TemporalFact } from '../../src/lib/types'

function assembled(): AssembleContextResult {
  return {
    text: '全部上下文',
    included: ['chapterOutline', 'characters', 'characterKnowledge', 'heldItems', 'canonAssertions'],
    segments: [
      { label: '章纲', layer: 'L1', content: '【本章大纲】夜探密室', tokens: 4, trimmable: false },
      { label: '角色', layer: 'L1', content: '【角色】[ID:1] 林舟', tokens: 3, trimmable: true },
      { label: '认知', layer: 'L1', content: '【认知】林舟不知道密门密码', tokens: 4, trimmable: false },
      { label: '物品', layer: 'L1', content: '【持有】林舟：青铜钥匙', tokens: 4, trimmable: false },
      { label: '宪法', layer: 'L1', content: '【宪法】魔法源自月潮', tokens: 4, trimmable: false },
    ],
    omitted: [],
    trimmed: [],
    totalInputTokens: 19,
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
      motivation: '林舟想在不惊动守卫的情况下确认真相。',
      collision: '林舟再次获得青铜钥匙。魔法源自太阳。他直接说出密门密码。',
    },
    cognitionCatalog: '【角色认知审计闭集】\n- characterId=1 | knowledgeKey=door-code | 林舟 | 密门密码',
    canonCatalog: '【世界宪法闭集】\n- factId=9 | 世界 | magicSource | 月潮',
  }
}

describe('PIPELINE-2 · 五阶段章纲工坊', () => {
  it('后续节点只锚定已确认前序产物，并按阶段裁剪登记上下文', () => {
    const input = nodeInput()
    const motivation = buildOutlineWorkshopMessages('motivation', input)
      .map(message => message.content).join('\n')
    expect(motivation).toContain('已确认·现状扫描')
    expect(motivation).toContain('林舟已有青铜钥匙')
    expect(motivation).toContain('林舟不知道密门密码')
    expect(motivation).not.toContain('魔法源自月潮')

    const collision = buildOutlineWorkshopMessages('collision', input)
      .map(message => message.content).join('\n')
    expect(collision).toContain('已确认·现状扫描')
    expect(collision).toContain('已确认·动机推演')
    expect(collision).not.toContain('已确认·碰撞预演')

    const scenes = buildOutlineWorkshopMessages('scenes', input)
      .map(message => message.content).join('\n')
    expect(scenes).toContain('prohibitions')
    expect(scenes).toContain('林舟再次获得青铜钥匙')
  })

  it('物品重复获得、提前知情和宪法冲突由确定性 gate 一并阻断', () => {
    const generatedDraft = nodeInput().artifacts.collision!
    const canonFacts: TemporalFact[] = [{
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
    }]
    const raw = JSON.stringify({
      advisories: [{
        category: '主角开天眼',
        quote: '他直接说出密门密码',
        reason: '缺少获知过程',
        suggestion: '先寻找线索',
      }],
      cognitionReferences: [{
        characterId: 1,
        knowledgeKey: 'door-code',
        quote: '他直接说出密门密码',
      }],
      canonClaims: [{
        factId: 9,
        proposedValue: '太阳',
        quote: '魔法源自太阳',
      }],
    })
    const evaluation = evaluateWorkshopQuality({
      raw,
      generatedDraft,
      heldItems: [{
        itemName: '青铜钥匙',
        quantity: 1,
        heldByName: '林舟',
        characterId: 1,
        evidence: [{
          id: 3,
          projectId: 1,
          chapterId: 1,
          chapterTitle: '第一章',
          itemName: '青铜钥匙',
          action: 'gain',
          quantity: 1,
          heldByName: '林舟',
          characterId: 1,
          note: '',
          createdAt: 1,
        }],
      }],
      knownCharacterNames: ['林舟'],
      cognition: {
        catalog: [{
          characterId: 1,
          characterName: '林舟',
          knowledgeKey: 'door-code',
          statement: '密门密码',
        }],
        projected: [],
      },
      canonFacts,
    })

    expect(evaluation.gate.status).toBe('blocked')
    expect(evaluation.gate.issues.map(issue => issue.code)).toEqual([
      'held-item:0',
      'cognition:0',
      'canon:0',
    ])
    expect(evaluation.advisories).toHaveLength(1)
  })

  it('质量节点通过统一运行器执行 review 分类并返回 gate', async () => {
    const output = JSON.stringify({ advisories: [], cognitionReferences: [], canonClaims: [] })
    const start = vi.fn(async () => output)
    const node = createOutlineWorkshopNode({
      stage: 'quality',
      projectId: 1,
      chapterIdentity: 3,
      ai: { start },
      qualityGate: () => ({ status: 'pass', issues: [] }),
    })
    const result = await runGenerationNode(
      node,
      prepareGenerationNode(node, nodeInput()),
    )

    expect(start.mock.calls[0][2]).toEqual({
      category: 'review.outline-workshop',
      projectId: 1,
      outputKind: 'functional-structured',
    })
    expect(result.gate).toEqual({ status: 'pass', issues: [] })
    expect(result.adopted).toBe(false)
  })

  it('最终场景 gate 排除不可写清单和审计元数据，引用不能自证', () => {
    const raw = JSON.stringify({
      openingHook: '林舟走进密室。',
      prohibitions: ['不能让林舟再次获得青铜钥匙'],
      scenes: [{
        title: '试探',
        summary: '林舟观察石门。',
        location: '密室',
        conflict: '守卫即将返回',
      }],
      cognitionReferences: [{
        characterId: 1,
        knowledgeKey: 'door-code',
        quote: '林舟直接说出密门密码',
      }],
      canonClaims: [],
    })
    const narrative = extractWorkshopSceneNarrative(raw)

    expect(narrative).toContain('林舟观察石门')
    expect(narrative).not.toContain('再次获得青铜钥匙')
    expect(narrative).not.toContain('密门密码')

    const evaluation = evaluateWorkshopQuality({
      raw,
      generatedDraft: narrative,
      heldItems: [{
        itemName: '青铜钥匙',
        quantity: 1,
        heldByName: '林舟',
        characterId: 1,
        evidence: [{
          id: 3,
          projectId: 1,
          chapterId: 1,
          chapterTitle: '第一章',
          itemName: '青铜钥匙',
          action: 'gain',
          quantity: 1,
          heldByName: '林舟',
          characterId: 1,
          note: '',
          createdAt: 1,
        }],
      }],
      knownCharacterNames: ['林舟'],
      cognition: {
        catalog: [{
          characterId: 1,
          characterName: '林舟',
          knowledgeKey: 'door-code',
          statement: '密门密码',
        }],
        projected: [],
      },
      canonFacts: [],
    })

    expect(evaluation.gate).toEqual({ status: 'pass', issues: [] })
  })

  it('节点顺序不可跳级，重做会清掉当前及后续会话产物', () => {
    expect(() => confirmWorkshopArtifact({}, 'collision', '直接跳到碰撞'))
      .toThrow(/必须先确认["""]现状扫描["""]/)
    const scan = confirmWorkshopArtifact({}, 'scan', '现状').artifacts
    const motivation = confirmWorkshopArtifact(scan, 'motivation', '动机').artifacts
    const collision = confirmWorkshopArtifact(motivation, 'collision', '碰撞').artifacts
    const quality = confirmWorkshopArtifact(collision, 'quality', '质检').artifacts

    expect(rewindWorkshopArtifacts(quality, 'collision')).toEqual({
      scan: '现状',
      motivation: '动机',
    })
  })
})
