import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { createContextManifestV1 } from '../../src/lib/agent/run/context-manifest'
import { readAgentRunV1, type AgentRunSnapshotV1 } from '../../src/lib/agent/run/event-store'
import {
  beginProseGenerationStepV1,
  createProseGenerationDurableRunV1,
  failProseGenerationStepV1,
  PROSE_GENERATION_STEP_ID_V1,
} from '../../src/lib/agent/run/prose-generation-durable'
import {
  beginChapterOrganizationDurableStepV1,
  CHAPTER_ORGANIZATION_DURABLE_STEP_ID_V1,
  createChapterOrganizationDurableRunV1,
  failChapterOrganizationDurableStepV1,
} from '../../src/lib/agent/run/chapter-organization-durable'
import { hashCanonicalValue } from '../../src/lib/agent/run/hash'
import { hashChapterText } from '../../src/lib/ai/chapter-memory/text-normalization'
import {
  AgentRunFailureError,
  classifyAgentRunFailureV1,
} from '../../src/lib/agent/run/failure-policy'
import { AIError } from '../../src/lib/types/ai'
import type { AnyAgentRunEventV1 } from '../../src/lib/types/agent-run'
import type { WorkspaceScope } from '../../src/lib/types'

/**
 * R-ORACLE3 · 正文生成与整理本章的 durable step.failed 证据必须语言环境无关。
 *
 * R-ORACLE1 只证明分类器本身稳定；本套件驱动真实持久化路径：
 * create*RunV1 → begin*StepV1（step 进入 running）→ 分类错误 →
 * failProseGenerationStepV1 / failChapterOrganizationDurableStepV1 →
 * 从 event store 重新读取 run，断言落库的 step.failed 事件 code/retryable
 * 在两种本地化展示文案下完全一致，且本地化文案从未进入 durable ledger。
 * 这正是 ChapterEditor 修复后的接线：先 classify，再以稳定 code/retryable
 * 写失败事件，绝不把 Error.message 当作 code。
 */

type StepFailedEventV1 = Extract<AnyAgentRunEventV1, { type: 'step.failed' }>

function stepFailedEvents(snapshot: AgentRunSnapshotV1): StepFailedEventV1[] {
  return snapshot.events.filter(
    (event): event is StepFailedEventV1 => event.type === 'step.failed',
  )
}

async function createWorkspace(label: string): Promise<{
  scope: WorkspaceScope
  worldGroupId: number
  outlineNodeId: number
  chapterId: number
  content: string
}> {
  const now = Date.now()
  const projectId = await db.projects.add({
    name: label,
    genre: 'fantasy',
    genres: ['fantasy'],
    status: 'drafting',
    description: '',
    targetWordCount: 100_000,
    worldCode: `world-${label}`,
    worldVersion: 1,
    createdAt: now,
    updatedAt: now,
  } as any) as number
  const worldId = await db.worlds.add({
    projectId,
    code: `world-${label}`,
    name: `${label}世界`,
    description: '',
    currentVersion: 1,
    createdAt: now,
    updatedAt: now,
  }) as number
  const workId = await db.works.add({
    projectId,
    worldId,
    title: label,
    description: '',
    genres: ['fantasy'],
    status: 'drafting',
    targetWordCount: 100_000,
    createdAt: now,
    updatedAt: now,
  }) as number
  await db.projects.update(projectId, {
    activeWorldId: worldId,
    activeWorkId: workId,
    ownershipSchemaVersion: 1,
  })
  const worldGroupId = await db.worldGroups.add({
    projectId,
    name: '主世界',
    type: 'primary',
    order: 0,
    createdAt: now,
    updatedAt: now,
  } as any) as number
  const outlineNodeId = await db.outlineNodes.add({
    projectId,
    workId,
    worldGroupId,
    parentId: null,
    type: 'chapter',
    title: '潮门',
    summary: '守灯人抵达潮门。',
    order: 0,
    createdAt: now,
    updatedAt: now,
  } as any) as number
  const content = '<p>守灯人抵达潮门。</p>'
  const chapterId = await db.chapters.add({
    projectId,
    workId,
    outlineNodeId,
    title: '潮门',
    content,
    wordCount: 9,
    status: 'draft',
    order: 0,
    notes: '',
    createdAt: now,
    updatedAt: now,
  } as any) as number
  return { scope: { projectId, worldId, workId }, worldGroupId, outlineNodeId, chapterId, content }
}

/** 最小但合法的 Context Manifest：省略来源即可满足 schema，避免整套上下文装配。 */
async function minimalManifest(input: {
  runId: number
  stepId: string
  projectId: number
  worldGroupId: number
  sourceKey: string
}) {
  return createContextManifestV1({
    version: 1,
    runId: input.runId,
    stepId: input.stepId,
    attempt: 1,
    scope: { projectId: input.projectId, worldGroupId: input.worldGroupId },
    inputBudget: 24_000,
    totalInputTokens: 0,
    sources: [{ key: input.sourceKey, status: 'omitted', tokens: 0 }],
  })
}

async function beginRunningProseStep(label: string) {
  const fixture = await createWorkspace(label)
  let snapshot = await createProseGenerationDurableRunV1({
    scope: fixture.scope,
    worldGroupId: fixture.worldGroupId,
    chapterId: fixture.chapterId,
    operation: 'generate',
  })
  const manifest = await minimalManifest({
    runId: snapshot.run.id,
    stepId: PROSE_GENERATION_STEP_ID_V1,
    projectId: fixture.scope.projectId,
    worldGroupId: fixture.worldGroupId,
    sourceKey: 'chapterOutline',
  })
  snapshot = await beginProseGenerationStepV1({
    scope: fixture.scope,
    snapshot,
    contextManifest: manifest,
    binding: {
      operation: 'generate',
      sourceTextHash: await hashChapterText(fixture.content),
      promptHash: await hashCanonicalValue([{ role: 'user', content: '生成潮门正文' }]),
    },
  })
  expect(snapshot.projection.steps[PROSE_GENERATION_STEP_ID_V1]?.status).toBe('running')
  return { fixture, snapshot }
}

async function beginRunningOrganizationStep(label: string) {
  const fixture = await createWorkspace(label)
  let snapshot = await createChapterOrganizationDurableRunV1({
    scope: fixture.scope,
    worldGroupId: fixture.worldGroupId,
    chapterId: fixture.chapterId,
  })
  const manifest = await minimalManifest({
    runId: snapshot.run.id,
    stepId: CHAPTER_ORGANIZATION_DURABLE_STEP_ID_V1,
    projectId: fixture.scope.projectId,
    worldGroupId: fixture.worldGroupId,
    sourceKey: 'chapterContent',
  })
  snapshot = await beginChapterOrganizationDurableStepV1({
    scope: fixture.scope,
    snapshot,
    contextManifest: manifest,
  })
  expect(snapshot.projection.steps[CHAPTER_ORGANIZATION_DURABLE_STEP_ID_V1]?.status).toBe('running')
  return { fixture, snapshot }
}

describe.sequential('R-ORACLE3 · durable step.failed 证据必须语言环境无关', { timeout: 15_000 }, () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(() => db.close())

  it('正文生成：同一逻辑失败在两种语言下持久化相同的 code/retryable', async () => {
    // ChapterEditor 空输出抛出的正是这个编码失败；展示文案来自各自 locale。
    const zhDisplay = '模型没有返回可采纳的正文候选。'
    const ptDisplay = 'Modelo não retornou candidato de manuscrito adotável.'
    const zhError = new AgentRunFailureError({
      code: 'prose_generation_no_output',
      category: 'protocol',
      action: 'retry',
      retryable: true,
      displayMessage: zhDisplay,
    })
    const ptError = new AgentRunFailureError({
      code: 'prose_generation_no_output',
      category: 'protocol',
      action: 'retry',
      retryable: true,
      displayMessage: ptDisplay,
    })
    expect(zhError.message).not.toBe(ptError.message)

    const zh = await beginRunningProseStep('prose-locale-zh')
    const pt = await beginRunningProseStep('prose-locale-pt')

    // 与修复后的 ChapterEditor.stepFailed 接线一致：先分类，再落稳定证据。
    const zhFailure = await classifyAgentRunFailureV1(zhError)
    const ptFailure = await classifyAgentRunFailureV1(ptError)
    await failProseGenerationStepV1({
      scope: zh.fixture.scope,
      snapshot: zh.snapshot,
      code: zhFailure.code,
      retryable: zhFailure.retryable,
    })
    await failProseGenerationStepV1({
      scope: pt.fixture.scope,
      snapshot: pt.snapshot,
      code: ptFailure.code,
      retryable: ptFailure.retryable,
    })

    // 从 event store 重新读取，断言的是真实落库事件而非内存返回。
    const zhReloaded = await readAgentRunV1(zh.fixture.scope, zh.snapshot.run.id)
    const ptReloaded = await readAgentRunV1(pt.fixture.scope, pt.snapshot.run.id)
    const zhFailed = stepFailedEvents(zhReloaded)
    const ptFailed = stepFailedEvents(ptReloaded)
    expect(zhFailed).toHaveLength(1)
    expect(ptFailed).toHaveLength(1)
    expect(zhFailed[0].payload).toMatchObject({
      stepId: PROSE_GENERATION_STEP_ID_V1,
      code: 'prose_generation_no_output',
      retryable: true,
    })
    expect(ptFailed[0].payload).toMatchObject({
      stepId: PROSE_GENERATION_STEP_ID_V1,
      code: 'prose_generation_no_output',
      retryable: true,
    })
    expect(ptFailed[0].payload.code).toBe(zhFailed[0].payload.code)
    expect(ptFailed[0].payload.retryable).toBe(zhFailed[0].payload.retryable)
    expect(zhReloaded.projection.steps[PROSE_GENERATION_STEP_ID_V1].status).toBe('failed')
    expect(ptReloaded.projection.steps[PROSE_GENERATION_STEP_ID_V1].status).toBe('failed')

    // 旧缺陷会把 error.message 当 code；本地化文案绝不能出现在 durable ledger。
    const zhLedger = JSON.stringify(zhReloaded.events)
    const ptLedger = JSON.stringify(ptReloaded.events)
    expect(zhLedger).not.toContain(zhDisplay)
    expect(ptLedger).not.toContain(ptDisplay)
  })

  it('整理本章：同一逻辑失败在两种语言下持久化相同的 code/retryable', async () => {
    const zhDisplay = '服务暂不可用，请稍后重试。'
    const ptDisplay = 'Serviço temporariamente indisponível; tente novamente mais tarde.'
    const zhError = new AgentRunFailureError({
      code: 'provider_transient',
      category: 'transient',
      action: 'retry',
      retryable: true,
      displayMessage: zhDisplay,
    })
    const ptError = new AgentRunFailureError({
      code: 'provider_transient',
      category: 'transient',
      action: 'retry',
      retryable: true,
      displayMessage: ptDisplay,
    })
    expect(zhError.message).not.toBe(ptError.message)

    const zh = await beginRunningOrganizationStep('org-locale-zh')
    const pt = await beginRunningOrganizationStep('org-locale-pt')

    // 与修复后的 ChapterEditor 整理本章 catch 接线一致：先分类，再落稳定证据。
    const zhFailure = await classifyAgentRunFailureV1(zhError)
    const ptFailure = await classifyAgentRunFailureV1(ptError)
    await failChapterOrganizationDurableStepV1({
      scope: zh.fixture.scope,
      snapshot: zh.snapshot,
      code: zhFailure.code,
      retryable: zhFailure.retryable,
    })
    await failChapterOrganizationDurableStepV1({
      scope: pt.fixture.scope,
      snapshot: pt.snapshot,
      code: ptFailure.code,
      retryable: ptFailure.retryable,
    })

    const zhReloaded = await readAgentRunV1(zh.fixture.scope, zh.snapshot.run.id)
    const ptReloaded = await readAgentRunV1(pt.fixture.scope, pt.snapshot.run.id)
    const zhFailed = stepFailedEvents(zhReloaded)
    const ptFailed = stepFailedEvents(ptReloaded)
    expect(zhFailed).toHaveLength(1)
    expect(ptFailed).toHaveLength(1)
    expect(zhFailed[0].payload).toMatchObject({
      stepId: CHAPTER_ORGANIZATION_DURABLE_STEP_ID_V1,
      code: 'provider_transient',
      retryable: true,
    })
    expect(ptFailed[0].payload).toMatchObject({
      stepId: CHAPTER_ORGANIZATION_DURABLE_STEP_ID_V1,
      code: 'provider_transient',
      retryable: true,
    })
    expect(ptFailed[0].payload.code).toBe(zhFailed[0].payload.code)
    expect(ptFailed[0].payload.retryable).toBe(zhFailed[0].payload.retryable)
    expect(zhReloaded.projection.steps[CHAPTER_ORGANIZATION_DURABLE_STEP_ID_V1].status).toBe('failed')
    expect(ptReloaded.projection.steps[CHAPTER_ORGANIZATION_DURABLE_STEP_ID_V1].status).toBe('failed')

    const zhLedger = JSON.stringify(zhReloaded.events)
    const ptLedger = JSON.stringify(ptReloaded.events)
    expect(zhLedger).not.toContain(zhDisplay)
    expect(ptLedger).not.toContain(ptDisplay)
  })

  it('retryable 取自分类结论而非硬编码 true（provider 401 不可重试）', async () => {
    const zh = await beginRunningProseStep('prose-auth-zh')
    const pt = await beginRunningProseStep('prose-auth-pt')

    const zhFailure = await classifyAgentRunFailureV1(new AIError(401, '访问令牌无效'))
    const ptFailure = await classifyAgentRunFailureV1(new AIError(401, 'token de acesso inválido'))
    expect(zhFailure.code).toBe('provider_authorization')
    expect(ptFailure.code).toBe('provider_authorization')

    await failProseGenerationStepV1({
      scope: zh.fixture.scope,
      snapshot: zh.snapshot,
      code: zhFailure.code,
      retryable: zhFailure.retryable,
    })
    await failProseGenerationStepV1({
      scope: pt.fixture.scope,
      snapshot: pt.snapshot,
      code: ptFailure.code,
      retryable: ptFailure.retryable,
    })

    const zhReloaded = await readAgentRunV1(zh.fixture.scope, zh.snapshot.run.id)
    const ptReloaded = await readAgentRunV1(pt.fixture.scope, pt.snapshot.run.id)
    const zhFailed = stepFailedEvents(zhReloaded)
    const ptFailed = stepFailedEvents(ptReloaded)
    expect(zhFailed[0].payload).toMatchObject({ code: 'provider_authorization', retryable: false })
    expect(ptFailed[0].payload).toMatchObject({ code: 'provider_authorization', retryable: false })
    expect(ptFailed[0].payload.retryable).toBe(zhFailed[0].payload.retryable)
  })
})
