import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { useCharacterDrivenPlanStore } from '../../src/stores/character-driven-plan'
import { useCharacterStore } from '../../src/stores/character'
import {
  parseCharacterDrivenPlanArcs,
  parseCharacterDrivenPlotVolumes,
} from '../../src/lib/types'
import { assembleContext } from '../../src/lib/registry/assemble-context'
import { adoptCharacterDrivenVolumes } from '../../src/lib/story-planning/character-driven-adoption'

async function seedProject() {
  return await db.projects.add({
    name: '角色驱动测试',
    genre: 'fantasy',
    genres: ['fantasy'],
    status: 'drafting',
    description: '',
    targetWordCount: 100_000,
    createdAt: 1,
    updatedAt: 1,
  })
}

const generated = [{
  volumeTitle: '第一卷 归乡',
  volumeSummary: '主角回到故乡并直面旧案。',
  characterArcs: '林舟从逃避转向承担。',
  chapters: [{
    title: '第一章 故人',
    summary: '林舟遇见昔日同伴。',
    keyCharacters: ['林舟'],
    arcProgress: '林舟第一次承认自己仍在意故乡。',
  }],
}]

describe('R-CF9C · 持久化角色驱动工作区', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    useCharacterDrivenPlanStore.setState({
      plans: [],
      currentPlanId: null,
      activePlanId: null,
      loading: false,
    })
    useCharacterStore.setState({ characters: [], loading: false })
  })

  afterEach(async () => {
    db.close()
  })

  it('CRUD、版本复制、生成结果和 active 方案均持久化', async () => {
    const projectId = await seedProject()
    const characterId = await db.characters.add({
      projectId,
      name: '林舟',
      role: 'protagonist',
      roleWeight: 'main',
      moralAxis: 'good',
      orderAxis: 'neutral',
      createdAt: 1,
      updatedAt: 1,
    } as any)
    const store = useCharacterDrivenPlanStore.getState()
    const planId = await store.createPlan(projectId, '归乡方案')
    await useCharacterDrivenPlanStore.getState().saveInputs(planId, {
      arcs: [{
        characterId,
        name: '林舟',
        role: '主角',
        initialState: '逃避过去',
        targetState: '承担责任',
      }],
      userHint: '主线不可改写',
    })
    await useCharacterDrivenPlanStore.getState().saveGenerated(planId, generated)
    await useCharacterDrivenPlanStore.getState().setActivePlan(projectId, planId)
    const copyId = await useCharacterDrivenPlanStore.getState().copyAsNewVersion(planId)

    const source = await db.characterDrivenPlans.get(planId)
    const copy = await db.characterDrivenPlans.get(copyId)
    expect(source?.status).toBe('generated')
    expect(parseCharacterDrivenPlotVolumes(source?.generatedVolumes)).toEqual(generated)
    expect(copy).toMatchObject({
      parentPlanId: planId,
      version: 2,
      status: 'generated',
    })
    expect((await db.projects.get(projectId))?.activeCharacterDrivenPlanId).toBe(planId)

    await useCharacterDrivenPlanStore.getState().deletePlan(planId)
    expect(await db.characterDrivenPlans.get(planId)).toBeUndefined()
    expect((await db.characterDrivenPlans.get(copyId))?.parentPlanId).toBeNull()
    expect((await db.projects.get(projectId))?.activeCharacterDrivenPlanId).toBeNull()
  })

  it('只读取显式 active 方案；改名用当前名+快照提示，删除角色后保留方案快照', async () => {
    const projectId = await seedProject()
    const characterId = await db.characters.add({
      projectId,
      name: '林舟（新名）',
      role: 'protagonist',
      roleWeight: 'main',
      moralAxis: 'good',
      orderAxis: 'neutral',
      createdAt: 1,
      updatedAt: 1,
    } as any)
    const planId = await useCharacterDrivenPlanStore.getState().createPlan(projectId, '归乡方案')
    await useCharacterDrivenPlanStore.getState().saveInputs(planId, {
      arcs: [{
        characterId,
        name: '林舟',
        role: '主角',
        initialState: '逃避',
        targetState: '承担',
      }],
      userHint: '',
    })

    const inactive = await assembleContext({
      projectId,
      sourceKeys: ['characterDrivenPlan'],
    })
    expect(inactive.text).toBe('')

    await useCharacterDrivenPlanStore.getState().setActivePlan(projectId, planId)
    const renamed = await assembleContext({
      projectId,
      sourceKeys: ['characterDrivenPlan'],
    })
    expect(renamed.text).toContain('林舟（新名）')
    expect(renamed.text).toContain('方案快照名：林舟')

    await useCharacterStore.getState().deleteCharacter(characterId)
    // 面板若仍持有删除前的本地 arc，store 写入边界也不能复活悬空 ID。
    await useCharacterDrivenPlanStore.getState().saveInputs(planId, {
      arcs: [{
        characterId,
        name: '林舟',
        role: '主角',
        initialState: '逃避',
        targetState: '承担',
      }],
      userHint: '',
    })
    const stored = await db.characterDrivenPlans.get(planId)
    expect(parseCharacterDrivenPlanArcs(stored?.arcs)[0]).toMatchObject({
      characterId: null,
      name: '林舟',
    })
    const deleted = await assembleContext({
      projectId,
      sourceKeys: ['characterDrivenPlan'],
    })
    expect(deleted.text).toContain('原角色已删除，仅保留方案快照')
  })

  it('采纳只新增大纲节点，不改 storyCore 或既有正文，并且重复采纳幂等', async () => {
    const projectId = await seedProject()
    const storyCoreId = await db.storyCores.add({
      projectId,
      mainPlot: '不可覆盖的主线',
      createdAt: 1,
      updatedAt: 1,
    } as any)
    const existingNodeId = await db.outlineNodes.add({
      projectId,
      parentId: null,
      type: 'volume',
      title: '既有卷',
      summary: '既有摘要',
      order: 0,
      createdAt: 1,
      updatedAt: 1,
    } as any)
    const chapterId = await db.chapters.add({
      projectId,
      outlineNodeId: existingNodeId,
      title: '已有正文',
      content: '<p>不能修改</p>',
      wordCount: 4,
      status: 'draft',
      order: 0,
      createdAt: 1,
      updatedAt: 1,
    } as any)

    const first = await adoptCharacterDrivenVolumes({ projectId, volumes: generated })
    const second = await adoptCharacterDrivenVolumes({ projectId, volumes: generated })
    expect(first.volumeIds).toHaveLength(1)
    expect(first.chapterIds).toHaveLength(1)
    expect(second.volumeIds).toEqual(first.volumeIds)
    expect(second.chapterIds).toHaveLength(0)
    expect(await db.outlineNodes.where('projectId').equals(projectId).count()).toBe(3)
    expect((await db.storyCores.get(storyCoreId))?.mainPlot).toBe('不可覆盖的主线')
    expect((await db.chapters.get(chapterId))?.content).toBe('<p>不能修改</p>')

    // (a) 新采纳章节摘要必须原样保留，不得拼接【角色弧光推进】等内部标记
    const adoptedChapter = await db.outlineNodes.get(first.chapterIds[0])
    expect(adoptedChapter?.summary).toBe('林舟遇见昔日同伴。')
    expect(adoptedChapter?.summary).not.toContain('【角色弧光推进】')
    expect(adoptedChapter?.summary).not.toContain('林舟第一次承认自己仍在意故乡。')
    const adoptedVolume = await db.outlineNodes.get(first.volumeIds[0])
    expect(adoptedVolume?.summary).toBe('主角回到故乡并直面旧案。')

    // (b) 结构化 arcProgress 保留在方案 JSON 中，采纳生命周期不丢失
    const planId = await useCharacterDrivenPlanStore.getState().createPlan(projectId, '归乡方案')
    await useCharacterDrivenPlanStore.getState().saveGenerated(planId, generated)
    await useCharacterDrivenPlanStore.getState().markAdopted(planId)
    const storedPlan = await db.characterDrivenPlans.get(planId)
    expect(storedPlan?.status).toBe('adopted')
    expect(parseCharacterDrivenPlotVolumes(storedPlan?.generatedVolumes)).toEqual(generated)
    expect(parseCharacterDrivenPlotVolumes(storedPlan?.generatedVolumes)[0]?.chapters[0]?.arcProgress)
      .toBe('林舟第一次承认自己仍在意故乡。')
  })

  it('历史遗留带【角色弧光推进】标记的大纲行在采纳与重复采纳后保持字节不变', async () => {
    const projectId = await seedProject()
    const legacySummary = '林舟遇见昔日同伴。\n\n【角色弧光推进】林舟第一次承认自己仍在意故乡。'
    const legacyVolumeId = await db.outlineNodes.add({
      projectId,
      parentId: null,
      type: 'volume',
      title: '第一卷 归乡',
      summary: '主角回到故乡并直面旧案。',
      order: 0,
      createdAt: 1,
      updatedAt: 1,
    } as any)
    const legacyChapterId = await db.outlineNodes.add({
      projectId,
      parentId: legacyVolumeId,
      type: 'chapter',
      title: '第一章 故人',
      summary: legacySummary,
      order: 0,
      createdAt: 1,
      updatedAt: 1,
    } as any)
    const before = {
      volume: JSON.stringify(await db.outlineNodes.get(legacyVolumeId)),
      chapter: JSON.stringify(await db.outlineNodes.get(legacyChapterId)),
    }

    const first = await adoptCharacterDrivenVolumes({ projectId, volumes: generated })
    const second = await adoptCharacterDrivenVolumes({ projectId, volumes: generated })

    // 重复卷复用既有节点而非改写或重建；章节按 skip 策略跳过
    expect(first.volumeIds).toEqual([legacyVolumeId])
    expect(first.chapterIds).toHaveLength(0)
    expect(second.volumeIds).toEqual([legacyVolumeId])
    expect(second.chapterIds).toHaveLength(0)
    // (c) 遗留行不被重写：字节完全一致，不清洗也不追加
    expect(JSON.stringify(await db.outlineNodes.get(legacyVolumeId))).toBe(before.volume)
    expect(JSON.stringify(await db.outlineNodes.get(legacyChapterId))).toBe(before.chapter)
    expect((await db.outlineNodes.get(legacyChapterId))?.summary).toBe(legacySummary)
    expect(await db.outlineNodes.where('projectId').equals(projectId).count()).toBe(2)
  })
})
