import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db/schema'
import {
  DOMAIN_DEFINITIONS,
  loadWorldProjection,
  loadWorldProjections,
} from '../../src/lib/world-engine/domain'
import type { Project } from '../../src/lib/types'

function project(name: string, now: number): Project {
  return {
    name,
    genre: 'other',
    genres: ['other'],
    status: 'drafting',
    description: '',
    targetWordCount: 500000,
    currentWordCount: 500000,
    enableMultiWorld: false,
    worldCode: 'W-TEST-01',
    worldVersion: 1,
    createdAt: now,
    updatedAt: now,
  }
}

describe('WORLD-2 · 世界领域投影', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    db.close()
  })

  it('世界完整度来自世界域数据，不来自正文进度或简介', async () => {
    const id = await db.projects.add(project('空世界', Date.now())) as number
    const projection = await loadWorldProjection({ ...project('空世界', Date.now()), id })

    expect(projection.completeness).toBe(0)
    expect(projection.readiness).toBe('empty')
    expect(projection.work.currentWordCount).toBe(500000)
  })

  it('从注册表派生基础、资产和叙事覆盖，并保留状态实例统计', async () => {
    const now = Date.now()
    const id = await db.projects.add(project('完整度世界', now)) as number
    const otherId = await db.projects.add(project('另一个世界', now + 1)) as number
    const current = { ...project('完整度世界', now), id }

    await db.worldviews.add({ projectId: id, worldOrigin: '潮汐从月面升起' } as any)
    await db.worldviews.add({ projectId: otherId, worldOrigin: '不应混入' } as any)
    await db.worldRulesProfiles.add({ projectId: id, worldGroupId: null, realityMode: 'fantasy' } as any)
    await db.characters.add({ projectId: id, name: '守门人', role: 'main', createdAt: now, updatedAt: now } as any)
    await db.storyCores.add({ projectId: id, theme: '回家', premise: '穿越潮汐' } as any)
    await db.outlineNodes.add({ projectId: id, type: 'volume', title: '第一卷', summary: '', parentId: null, order: 0 } as any)
    await db.simulationSessions.add({ projectId: id, worldGroupId: null, kind: 'ttrpg', status: 'active', createdAt: now, updatedAt: now } as any)
    await db.simulationEvents.add({ projectId: id, worldGroupId: null, sessionId: 1, sequence: 1, type: 'state', createdAt: now } as any)
    await db.simulationCheckpoints.add({ projectId: id, worldGroupId: null, sessionId: 1, throughSequence: 1, name: '起点', createdAt: now } as any)

    const projection = await loadWorldProjection(current)

    expect(projection.domains.foundation.rowCount).toBe(2)
    expect(projection.domains.assets.rowCount).toBe(1)
    expect(projection.domains.narrative.rowCount).toBe(2)
    expect(projection.domains.runtime.rowCount).toBe(3)
    expect(projection.runtime).toEqual({ instanceCount: 1, eventCount: 1, checkpointCount: 1 })
    expect(projection.completeness).toBeGreaterThan(0)
    expect(projection.readiness).toBe('usable')
  })

  it('项目之间严格隔离，世界结构是可选域而不是世界引擎开关', async () => {
    const now = Date.now()
    const firstId = await db.projects.add(project('甲世界', now)) as number
    const secondId = await db.projects.add(project('乙世界', now + 1)) as number
    await db.worldGroups.add({ projectId: secondId, name: '乙主世界', description: '', type: 'primary', order: 0, createdAt: now, updatedAt: now } as any)
    const worldviewsScan = vi.spyOn(db.worldviews, 'toArray')

    const [first, second] = await loadWorldProjections([
      { ...project('甲世界', now), id: firstId },
      { ...project('乙世界', now + 1), id: secondId },
    ])

    expect(first.domains.structure.rowCount).toBe(0)
    expect(second.domains.structure.rowCount).toBe(1)
    expect(first.completeness).toBe(second.completeness)
    expect(worldviewsScan).toHaveBeenCalledTimes(1)
  })

  it('版本记录和空规则壳不能冒充可创作的世界基础', async () => {
    const now = Date.now()
    const id = await db.projects.add(project('只有技术记录的世界', now)) as number
    await db.worldRulesProfiles.add({ projectId: id, worldGroupId: null, entries: {}, customNodes: [], globalNote: '', createdAt: now, updatedAt: now } as any)
    await db.worldRevisions.add({ projectId: id, label: '空修订', manifestJson: '{}', createdAt: now, updatedAt: now } as any)
    await db.characters.add({ projectId: id, name: '占位角色', role: 'npc', createdAt: now, updatedAt: now } as any)
    await db.storyArcs.add({ projectId: id, name: '占位故事线', type: 'main', stages: '[]', createdAt: now, updatedAt: now } as any)

    const projection = await loadWorldProjection({ ...project('只有技术记录的世界', now), id })

    expect(projection.domains.foundation.activeTableCount).toBe(2)
    expect(projection.domains.foundation.status).toBe('partial')
    expect(projection.domains.narrative.status).toBe('partial')
    expect(projection.readiness).toBe('building')
  })

  it('i18n Unit A · 缺失编号/简介保留 canonical 空缺语义，不注入合成显示文案', async () => {
    const now = Date.now()
    // worldCode / description 故意缺省：投影必须保留空缺，不得写入翻译占位。
    const base = { ...project('空缺世界', now), worldCode: undefined, description: '' }
    const id = await db.projects.add(base) as number
    const projection = await loadWorldProjection({ ...base, id })

    expect(projection.code).toBe('')
    expect(projection.description).toBe('')
    expect(projection.code).not.toBe('待分配编号')
    expect(projection.description).not.toBe('这个世界还没有写下简介。')

    // 有编号时逐字保留，不做任何改写。
    const withCode = await loadWorldProjection({ ...project('编号世界', now), id })
    expect(withCode.code).toBe('W-TEST-01')
  })

  it('i18n Unit A · 领域摘要携带稳定 labelKey/descriptionKey，legacy 字段保留', async () => {
    const now = Date.now()
    const id = await db.projects.add(project('元数据世界', now)) as number
    const projection = await loadWorldProjection({ ...project('元数据世界', now), id })

    // 投影加载全程不依赖也不调用 i18n（本用例未初始化任何翻译即通过）。
    for (const definition of DOMAIN_DEFINITIONS) {
      const summary = projection.domains[definition.key]
      expect(summary.labelKey).toBe(`worldEngine.domainDefinitions.${definition.key}.label`)
      expect(summary.descriptionKey).toBe(`worldEngine.domainDefinitions.${definition.key}.description`)
      // legacy canonical label/description 保留，兼容旧消费者并作为缺 key 回退。
      expect(summary.label).toBe(definition.label)
      expect(summary.description).toBe(definition.description)
    }
    // canonical key 集合稳定。
    expect(Object.keys(projection.domains)).toEqual([
      'foundation', 'assets', 'narrative', 'structure', 'runtime',
    ])
  })
})
