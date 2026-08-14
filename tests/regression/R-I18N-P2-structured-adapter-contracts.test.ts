/**
 * Phase 2 i18n · fix-8 结构化适配器字段契约
 *
 * 结构化 JSON 不是语言中立的：每个字段必须明确分类——
 *   - 规范闭集/canonical 值（机器枚举，locale 无关，禁止本地化或改名）；
 *   - 源保留文本（逐字来自原文/作者数据，禁止事后翻译或改写）；
 *   - 作者面向 prose（原样渲染，parser 不翻译）。
 *
 * 覆盖 state / inventory / relation 三个适配器：
 *   1. 闭集/canonical 值精确匹配，未知值拒绝而非静默改写；
 *   2. JSON 修复（recovery）分支必须重走与正常路径相同的过滤；
 *   3. 源保留字段在任意 locale 输入下逐字保留，不被翻译。
 */
import { describe, expect, it } from 'vitest'
import { parseConsistencyAuditResult } from '../../src/lib/ai/adapters/consistency-audit-adapter'
import { parseInventoryEvents } from '../../src/lib/ai/adapters/inventory-extract-adapter'
import { parseStateDiffs } from '../../src/lib/ai/adapters/state-extract-adapter'
import { parseRelationOutput, RELATION_TYPE_CODES } from '../../src/lib/ai/relation-extractor'
import type { RelationType } from '../../src/lib/types'

// ── state-extract ────────────────────────────────────────────────────────

describe('I18N-P2 · parseStateDiffs 字段契约', () => {
  const registered = ['沈璃', 'Kael']

  it('正常路径：category 闭集 + 角色 allowlist + 源保留值逐字保留', () => {
    const raw = JSON.stringify([
      { entityName: 'Kael', category: 'character', field: '位置', oldValue: 'Long Pond', newValue: 'Vale Verde' },
      { entityName: '黑潮港', category: 'location', field: '状态', oldValue: null, newValue: '封锁' },
      { entityName: '未登记角色', category: 'character', field: '状态', oldValue: null, newValue: '死亡' },
    ])
    const { diffs, error } = parseStateDiffs(raw, registered)
    expect(error).toBeNull()
    expect(diffs).toHaveLength(1)
    // 源保留文本逐字保留，不翻译、不改写
    expect(diffs[0]).toMatchObject({
      entityName: 'Kael',
      category: 'character',
      field: '位置',
      oldValue: 'Long Pond',
      newValue: 'Vale Verde',
    })
  })

  it('截断 JSON 修复后仍须重走 category 闭集与 allowlist 过滤（recovery 不变量）', () => {
    // 尾部对象被截断（无闭合 }，正文残留 ]）→ JSON.parse 失败 →
    // recovery 截取到最后一个完整对象。修复结果里混入 location 类目与未登记
    // 角色，必须与正常路径一样被过滤，不得绕过闭集约束。
    const raw = '['
      + '{"entityName":"沈璃","category":"character","field":"位置","oldValue":"城外","newValue":"黑潮港"},'
      + '{"entityName":"黑潮港","category":"location","field":"状态","oldValue":null,"newValue":"封锁"},'
      + '{"entityName":"未登记角色","category":"character","field":"状态","oldValue":null,"newValue":"死亡"},'
      + '{"entityName":"沈璃","category":"character","field":"身体状态","oldValue":null,"newValue":"重]'
    const { diffs, error } = parseStateDiffs(raw, registered)
    expect(error).toBeNull()
    expect(diffs).toHaveLength(1)
    expect(diffs[0]).toMatchObject({
      entityName: '沈璃',
      category: 'character',
      field: '位置',
      oldValue: '城外',
      newValue: '黑潮港',
    })
  })

  it('recovery 分支不得绕过必填字段检查', () => {
    const raw = '['
      + '{"category":"character","field":"状态","oldValue":null,"newValue":"缺名字"},'
      + '{"entityName":"沈璃","category":"character","field":"目标","oldValue":null,"newValue":"寻人]'
    const { diffs, error } = parseStateDiffs(raw, registered)
    expect(error).toBeNull()
    expect(diffs).toHaveLength(0)
  })

  it('oldValue 空白归一为 null，非空值逐字保留（新实体 vs 变更）', () => {
    const raw = JSON.stringify([
      { entityName: '沈璃', category: 'character', field: '持有物', oldValue: '  ', newValue: '青铜铃' },
      { entityName: '沈璃', category: 'character', field: '位置', oldValue: '长安', newValue: '洛阳' },
    ])
    const { diffs } = parseStateDiffs(raw, registered)
    expect(diffs[0].oldValue).toBeNull()
    expect(diffs[1].oldValue).toBe('长安')
  })

  it('登记名是规范值：模型大小写变体回写登记的精确拼写，源保留值不受影响', () => {
    const raw = JSON.stringify([
      { entityName: 'KAEL', category: 'character', field: '位置', oldValue: null, newValue: 'Vale Verde' },
      { entityName: 'kael', category: 'character', field: '身体状态', oldValue: null, newValue: 'ferido' },
    ])
    const { diffs, error } = parseStateDiffs(raw, registered)
    expect(error).toBeNull()
    expect(diffs.map(d => d.entityName)).toEqual(['Kael', 'Kael'])
    // 源保留文本不因名字归一而改变
    expect(diffs[0].newValue).toBe('Vale Verde')
    expect(diffs[1].newValue).toBe('ferido')
  })

  it('recovery 分支同样回写规范拼写（修复后不泄漏模型大小写变体）', () => {
    const raw = '['
      + '{"entityName":"kael","category":"character","field":"位置","oldValue":null,"newValue":"Vale Verde"},'
      + '{"entityName":"沈璃","category":"character","field":"目标","oldValue":null,"newValue":"寻人]'
    const { diffs, error } = parseStateDiffs(raw, registered)
    expect(error).toBeNull()
    expect(diffs).toHaveLength(1)
    expect(diffs[0].entityName).toBe('Kael')
  })
})

// ── inventory-extract ────────────────────────────────────────────────────

describe('I18N-P2 · parseInventoryEvents 字段契约', () => {
  it('action 规范闭集：非法值整条拒绝，绝不静默转为 gain', () => {
    const raw = JSON.stringify([
      { itemName: '剑', heldByName: '张铁', action: 'weird', quantity: 1, note: '' },
      { itemName: '剑', heldByName: '张铁', action: '', quantity: 1, note: '' },
      { itemName: '剑', heldByName: '张铁', quantity: 1, note: '' },
      { itemName: '剑', heldByName: '张铁', action: '获得', quantity: 1, note: '' },
      { itemName: '剑', heldByName: '张铁', action: 'ganhar', quantity: 1, note: '' },
    ])
    expect(parseInventoryEvents(raw)).toHaveLength(0)
  })

  it('合法 action 与源保留文本在任意 locale 输入下逐字保留', () => {
    const raw = JSON.stringify([
      { itemName: 'Espada Lunar', heldByName: 'Kael', action: 'gain', quantity: 1, note: 'encontrada na caverna' },
      { itemName: '疗伤丹', heldByName: '林风', action: 'consume', quantity: 2, note: '赠予张铁' },
    ])
    const events = parseInventoryEvents(raw)
    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({
      itemName: 'Espada Lunar',
      heldByName: 'Kael',
      action: 'gain',
      quantity: 1,
      note: 'encontrada na caverna',
    })
    expect(events[1]).toEqual({
      itemName: '疗伤丹',
      heldByName: '林风',
      action: 'consume',
      quantity: 2,
      note: '赠予张铁',
    })
  })

  it('混合数组：无效 action 条目被剔除，不连累合法条目', () => {
    const raw = JSON.stringify([
      { itemName: '剑', heldByName: '林风', action: 'gain', quantity: 1, note: '' },
      { itemName: '令牌', heldByName: '林风', action: 'transfer', quantity: 1, note: '' },
      { itemName: '丹药', heldByName: '张铁', action: 'consume', quantity: 2, note: '' },
    ])
    const events = parseInventoryEvents(raw)
    expect(events.map(e => [e.itemName, e.action])).toEqual([
      ['剑', 'gain'],
      ['丹药', 'consume'],
    ])
  })

  it('截断输出 fail-closed：不做修复，半截事件不泄漏（尾部无 ] 或有 ] 均返回空）', () => {
    const complete = { itemName: '剑', heldByName: '林风', action: 'gain', quantity: 1, note: '拾得' }
    // 尾部无 ]：整个数组未闭合
    const noBracket = JSON.stringify([complete, { itemName: '丹' }]).slice(0, -1)
    expect(parseInventoryEvents(noBracket)).toEqual([])
    // 尾部残留 ] 但最后一个对象被截断：JSON.parse 失败 → 空数组，
    // 即使第一个对象是完整的也不得部分泄漏
    const withBracket = `[${JSON.stringify(complete)},{"itemName":"丹]`
    expect(parseInventoryEvents(withBracket)).toEqual([])
  })

  it('quantity 有限/安全整数边界：Infinity、NaN、unsafe 值安全归一为 1', () => {
    const cases: Array<[string, number]> = [
      // 1e309 → JSON.parse 产生 Infinity → 守卫归一为 1
      ['[{"itemName":"剑","heldByName":"林风","action":"gain","quantity":1e309}]', 1],
      // string "Infinity" → Number("Infinity") = Infinity → 守卫归一为 1
      ['[{"itemName":"剑","heldByName":"林风","action":"gain","quantity":"Infinity"}]', 1],
      // string "NaN" → Number("NaN") = NaN → 守卫归一为 1
      ['[{"itemName":"剑","heldByName":"林风","action":"gain","quantity":"NaN"}]', 1],
      // 超出安全整数范围的大数
      [`[{"itemName":"剑","heldByName":"林风","action":"gain","quantity":${Number.MAX_SAFE_INTEGER + 100}}]`, 1],
      // 负数
      ['[{"itemName":"剑","heldByName":"林风","action":"gain","quantity":-5}]', 1],
      // 零
      ['[{"itemName":"剑","heldByName":"林风","action":"gain","quantity":0}]', 1],
      // 正常小数四舍五入
      ['[{"itemName":"剑","heldByName":"林风","action":"gain","quantity":2.7}]', 3],
      // 字符串数字
      ['[{"itemName":"剑","heldByName":"林风","action":"gain","quantity":"3"}]', 3],
    ]
    for (const [raw, expected] of cases) {
      const events = parseInventoryEvents(raw)
      expect(events, raw.slice(0, 80)).toHaveLength(1)
      expect(events[0].quantity, raw.slice(0, 80)).toBe(expected)
      // 确保结果始终是有限安全整数
      expect(Number.isSafeInteger(events[0].quantity), raw.slice(0, 80)).toBe(true)
    }
  })
})

// ── relation-extractor ───────────────────────────────────────────────────

// 持久化枚举 RelationType 的镜像（若枚举增删成员，此列表与闭集守卫须同步）
const PERSISTED_RELATION_TYPES = [
  'family', 'lover', 'friend', 'rival', 'enemy',
  'master', 'student', 'ally', 'subordinate', 'other',
] as const

describe('I18N-P2 · parseRelationOutput 字段契约', () => {
  // 编译期覆盖守卫：闭集必须可赋值给 readonly RelationType[]，
  // 即 RELATION_TYPE_CODES 的每个成员都是合法持久化类型（tsc 校验 src 时生效）
  const codes: readonly RelationType[] = RELATION_TYPE_CODES

  it('闭集精确覆盖持久化 RelationType 联合，禁止改名或扩充', () => {
    expect([...codes].sort()).toEqual([...PERSISTED_RELATION_TYPES].sort())
  })

  it('所有规范类型逐字通过解析', () => {
    for (const type of RELATION_TYPE_CODES) {
      const rels = parseRelationOutput(JSON.stringify([{ char1: '甲', char2: '乙', type }]))
      expect(rels, `type ${type}`).toHaveLength(1)
      expect(rels[0].type).toBe(type)
    }
  })

  it('本地化标签不是类型：中文/英文/葡文标签一律拒绝', () => {
    for (const type of ['朋友', 'Friend', 'amigo', 'INIMIGO', '师徒']) {
      expect(parseRelationOutput(JSON.stringify([{ char1: '甲', char2: '乙', type }])), `type ${type}`)
        .toHaveLength(0)
    }
  })

  it('label/description 为源保留作者 prose：逐字保留，不翻译', () => {
    const rels = parseRelationOutput(JSON.stringify([{
      char1: 'Kael',
      char2: 'Lira',
      type: 'ally',
      label: 'companheiros de armas',
      description: 'Kael e Lira lutaram juntos na queda de Vale Verde.',
      bidirectional: true,
    }]))
    expect(rels).toHaveLength(1)
    expect(rels[0]).toMatchObject({
      char1: 'Kael',
      char2: 'Lira',
      type: 'ally',
      label: 'companheiros de armas',
      description: 'Kael e Lira lutaram juntos na queda de Vale Verde.',
      bidirectional: true,
    })
  })

  it('截断输出 fail-closed：不做修复，半截关系不泄漏（尾部无 ] 或有 ] 均返回空）', () => {
    const complete = { char1: 'Kael', char2: 'Lira', type: 'ally', label: '战友', description: '并肩作战', bidirectional: true }
    // 尾部无 ]：数组未闭合
    const noBracket = JSON.stringify([complete, { char1: '甲' }]).slice(0, -1)
    expect(parseRelationOutput(noBracket)).toEqual([])
    // 尾部残留 ] 但最后一个对象被截断：JSON.parse 失败 → 空数组，
    // 即使第一个对象完整也不得部分泄漏
    const withBracket = `[${JSON.stringify(complete)},{"char1":"甲]`
    expect(parseRelationOutput(withBracket)).toEqual([])
  })
})

// ── consistency-audit ────────────────────────────────────────────────────

describe('I18N-P2 · parseConsistencyAuditResult evidence 规范字段与 fail-closed', () => {
  const chapter = '林寻说自己从未见过青铜铃，却从左袖取出了青铜铃。'
  const evidenceContext = '【物品流水证据】\n#7 第1章：消耗 青铜铃 ×1（已交给守门人）'
  const base = { mode: 'fast' as const, chapterContent: chapter, evidenceContext }

  const rawWithEvidence = (evidence: unknown) => JSON.stringify({
    findings: [{
      category: '持有物',
      severity: 'hard',
      quote: '从左袖取出了青铜铃',
      evidence,
      reason: '该物品此前已消耗',
    }],
  })

  it('合法规范证据逐字通过，severity 保持 hard', () => {
    const parsed = parseConsistencyAuditResult({
      ...base,
      raw: rawWithEvidence([{ sourceType: 'observation', sourceId: 7, quote: '消耗 青铜铃 ×1' }]),
    })
    expect(parsed?.findings[0]?.severity).toBe('hard')
    expect(parsed?.findings[0]?.evidence).toEqual([
      { sourceType: 'observation', sourceId: 7, quote: '消耗 青铜铃 ×1' },
    ])
  })

  it('非法 sourceType 拒绝该证据（不静默改写为 observation）；hard 缺证据降级 unknown', () => {
    for (const sourceType of ['编造', 'OBSERVATION', 'capítulo', '', null]) {
      const parsed = parseConsistencyAuditResult({
        ...base,
        raw: rawWithEvidence([{ sourceType, sourceId: 7, quote: '消耗 青铜铃 ×1' }]),
      })
      expect(parsed?.findings[0]?.evidence, `sourceType=${String(sourceType)}`).toEqual([])
      expect(parsed?.findings[0]?.severity, `sourceType=${String(sourceType)}`).toBe('unknown')
    }
  })

  it('非法 sourceId 拒绝该证据（不静默归零）；hard 缺证据降级 unknown', () => {
    for (const sourceId of [null, undefined, 'abc', -3, 1.5, '']) {
      const parsed = parseConsistencyAuditResult({
        ...base,
        raw: rawWithEvidence([{ sourceType: 'observation', sourceId, quote: '消耗 青铜铃 ×1' }]),
      })
      expect(parsed?.findings[0]?.evidence, `sourceId=${String(sourceId)}`).toEqual([])
      expect(parsed?.findings[0]?.severity, `sourceId=${String(sourceId)}`).toBe('unknown')
    }
  })

  it('数字字符串 sourceId 安全归一为整数（合法值不拒绝）', () => {
    const parsed = parseConsistencyAuditResult({
      ...base,
      raw: rawWithEvidence([{ sourceType: 'canon', sourceId: '7', quote: '消耗 青铜铃 ×1' }]),
    })
    expect(parsed?.findings[0]?.evidence).toEqual([
      { sourceType: 'canon', sourceId: 7, quote: '消耗 青铜铃 ×1' },
    ])
  })

  it('非十进制/unsafe sourceId 拒绝该证据（hex、指数、空白、超大值）', () => {
    for (const sourceId of [
      '0x10',           // hex
      '1e3',            // scientific notation
      ' 7',             // leading whitespace
      '7 ',             // trailing whitespace
      ' 7 ',            // both
      '+7',             // explicit sign
      Number.MAX_SAFE_INTEGER + 1,  // unsafe number
      '9007199254740993',           // unsafe decimal string (> MAX_SAFE_INTEGER)
    ]) {
      const parsed = parseConsistencyAuditResult({
        ...base,
        raw: rawWithEvidence([{ sourceType: 'observation', sourceId, quote: '消耗 青铜铃 ×1' }]),
      })
      expect(parsed?.findings[0]?.evidence, `sourceId=${String(sourceId)}`).toEqual([])
      expect(parsed?.findings[0]?.severity, `sourceId=${String(sourceId)}`).toBe('unknown')
    }
  })

  it('截断信封 fail-closed：内部已含完整 finding 也返回 null，不部分泄漏', () => {
    const full = rawWithEvidence([{ sourceType: 'observation', sourceId: 7, quote: '消耗 青铜铃 ×1' }])
    // 去掉末尾的 "]}"：findings 里的对象本身完整，但信封截断
    const truncated = full.slice(0, full.length - 2)
    expect(parseConsistencyAuditResult({ ...base, raw: truncated })).toBeNull()
    // 更短的截断（没有任何闭合大括号可配对）同样 fail-closed
    expect(parseConsistencyAuditResult({ ...base, raw: full.slice(0, 30) })).toBeNull()
  })
})
