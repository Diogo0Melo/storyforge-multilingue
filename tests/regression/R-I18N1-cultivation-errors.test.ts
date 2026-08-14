/**
 * Phase 1 i18n fallback/parser fixes · cultivation accept errors
 *
 * - acceptCultivationProgressCandidate 的可见错误经【预加载】errors-lib 命名空间
 *   (cultivation.accept* / cultivation.transition*)解析,不再依赖懒加载的
 *   cultivation:* 命名空间;冷读取时 cultivation bundle 未驻留也能给出完整本地化文案。
 * - zh-CN 文案与传统文案逐字一致,且与 cultivation.json 的懒加载副本逐字等价;
 *   原有 rejects.toThrow('正文证据已变化') 断言不受影响。
 * - transitionMismatch 的 {{expected}} 插入本地化 transition 标签(预加载键),
 *   而非裸枚举码。
 * - errors-lib 的 cultivation 键集三语一致、非空、插值平价。
 * - 冷/就绪回归(ora-2):真实懒加载 backend + 静态源码扫描证明验收路径不依赖
 *   懒加载 cultivation 命名空间。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import enCultivation from '../../src/i18n/locales/en/cultivation.json'
import ptCultivation from '../../src/i18n/locales/pt-BR/cultivation.json'
import zhCultivation from '../../src/i18n/locales/zh-CN/cultivation.json'
import enErrorsLib from '../../src/i18n/locales/en/errors-lib.json'
import ptErrorsLib from '../../src/i18n/locales/pt-BR/errors-lib.json'
import zhErrorsLib from '../../src/i18n/locales/zh-CN/errors-lib.json'
import { createBackendInstance } from '../../src/i18n'
import {
  acceptCultivationProgressCandidate,
  CULTIVATION_ACCEPT_ERROR_KEYS,
  CULTIVATION_TRANSITION_LABEL_KEYS,
} from '../../src/lib/cultivation/progress'
import { db } from '../../src/lib/db/schema'
import { stringifyCultivationStages, type CultivationStage } from '../../src/lib/types'

const now = 1_800_000_000_000
const stages: CultivationStage[] = [
  { id: 'body', name: '炼体', parentStageIds: [] },
  { id: 'sword', name: '剑胎', parentStageIds: ['body'] },
]

async function seed() {
  const projectId = await db.projects.add({
    name: '修炼错误文案测试',
    genre: '',
    genres: [],
    status: 'drafting',
    description: '',
    targetWordCount: 0,
    includeCultivationProgressInAI: false,
    createdAt: now,
    updatedAt: now,
  } as any) as number
  const volumeId = await db.outlineNodes.add({
    projectId, parentId: null, type: 'volume', title: '第一卷', summary: '',
    order: 0, createdAt: now, updatedAt: now,
  } as any) as number
  const firstNode = await db.outlineNodes.add({
    projectId, parentId: volumeId, type: 'chapter', title: '炼体', summary: '',
    order: 0, createdAt: now, updatedAt: now,
  } as any) as number
  const secondNode = await db.outlineNodes.add({
    projectId, parentId: volumeId, type: 'chapter', title: '剑胎', summary: '',
    order: 1, createdAt: now, updatedAt: now,
  } as any) as number
  const firstChapter = await db.chapters.add({
    projectId, outlineNodeId: firstNode, title: '炼体',
    content: '<p>林舟在雷雨中淬体，正式踏入炼体境。</p>',
    wordCount: 18, status: 'draft', order: 0, notes: '', createdAt: now, updatedAt: now,
  } as any) as number
  const secondChapter = await db.chapters.add({
    projectId, outlineNodeId: secondNode, title: '剑胎',
    content: '<p>林舟悟透剑意，丹田中凝成剑胎。</p>',
    wordCount: 18, status: 'draft', order: 1, notes: '', createdAt: now, updatedAt: now,
  } as any) as number
  const systemId = await db.cultivationSystems.add({
    projectId, worldGroupId: null, name: '剑修', description: '',
    stages: stringifyCultivationStages(stages), createdAt: now, updatedAt: now,
  }) as number
  const characterId = await db.characters.add({
    projectId, name: '林舟', role: 'protagonist', roleWeight: 'main',
    moralAxis: 'good', orderAxis: 'lawful', homeWorldGroupId: null, isCrossWorld: false,
    cultivationSystemId: systemId, cultivationStageId: 'body',
    createdAt: now, updatedAt: now,
  } as any) as number
  return { projectId, firstChapter, secondChapter, characterId, systemId }
}

describe('I18N-1 · cultivation accept errors are localized (errors-lib preloaded path)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })
  afterEach(() => db.close())

  it('missing chapter rejects with the zh-CN localized message (test language)', async () => {
    const seeded = await seed()
    await expect(acceptCultivationProgressCandidate({
      projectId: seeded.projectId,
      chapterId: 999_999,
      candidate: {
        characterId: seeded.characterId,
        cultivationSystemId: seeded.systemId,
        stageId: 'body',
        transition: 'enter',
        trigger: '',
        evidenceQuote: '正式踏入炼体境',
        sourceOffset: 0,
      },
    })).rejects.toThrow(zhErrorsLib.cultivation.acceptChapterMissing)
  })

  it('changed evidence rejects with the localized message and keeps the legacy zh wording', async () => {
    const seeded = await seed()
    const promise = acceptCultivationProgressCandidate({
      projectId: seeded.projectId,
      chapterId: seeded.firstChapter,
      candidate: {
        characterId: seeded.characterId,
        cultivationSystemId: seeded.systemId,
        stageId: 'body',
        transition: 'enter',
        trigger: '',
        evidenceQuote: '正文里不存在的证据',
        sourceOffset: 0,
      },
    })
    await expect(promise).rejects.toThrow(zhErrorsLib.cultivation.acceptEvidenceChanged)
    await expect(promise).rejects.toThrow('正文证据已变化')
  })

  it('transition mismatch interpolates the localized transition label, not the raw enum code', async () => {
    const seeded = await seed()
    await acceptCultivationProgressCandidate({
      projectId: seeded.projectId,
      chapterId: seeded.firstChapter,
      candidate: {
        characterId: seeded.characterId,
        cultivationSystemId: seeded.systemId,
        stageId: 'body',
        transition: 'enter',
        trigger: '雷雨淬体',
        evidenceQuote: '正式踏入炼体境',
        sourceOffset: 0,
      },
    })
    const expectedMessage = zhErrorsLib.cultivation.acceptTransitionMismatch
      .replace('{{expected}}', zhErrorsLib.cultivation.transitionAdvance)
    await expect(acceptCultivationProgressCandidate({
      projectId: seeded.projectId,
      chapterId: seeded.secondChapter,
      candidate: {
        characterId: seeded.characterId,
        cultivationSystemId: seeded.systemId,
        stageId: 'sword',
        transition: 'regress',
        trigger: '悟透剑意',
        evidenceQuote: '丹田中凝成剑胎',
        sourceOffset: 0,
      },
    })).rejects.toThrow(expectedMessage)
    expect(expectedMessage).not.toContain('advance')
  })
})

describe('I18N-1 · errors-lib cultivation locale parity', () => {
  it('zh-CN, en and pt-BR expose the same non-empty cultivation keys', () => {
    const zhKeys = Object.keys(zhErrorsLib.cultivation).sort()
    expect(zhKeys.length).toBe(15)
    expect(Object.keys(enErrorsLib.cultivation).sort()).toEqual(zhKeys)
    expect(Object.keys(ptErrorsLib.cultivation).sort()).toEqual(zhKeys)
    for (const key of zhKeys) {
      const typedKey = key as keyof typeof zhErrorsLib.cultivation
      expect(zhErrorsLib.cultivation[typedKey].trim()).not.toBe('')
      expect(enErrorsLib.cultivation[typedKey].trim()).not.toBe('')
      expect(ptErrorsLib.cultivation[typedKey].trim()).not.toBe('')
    }
  })

  it('acceptTransitionMismatch keeps {{expected}} interpolation parity across all 3 locales', () => {
    for (const bundle of [zhErrorsLib, enErrorsLib, ptErrorsLib]) {
      const placeholders = [...bundle.cultivation.acceptTransitionMismatch.matchAll(/\{\{(\w+)\}\}/g)]
        .map(match => match[1])
      expect(placeholders).toEqual(['expected'])
    }
  })

  it.each([
    ['zh-CN', zhErrorsLib, zhCultivation] as const,
    ['en', enErrorsLib, enCultivation] as const,
    ['pt-BR', ptErrorsLib, ptCultivation] as const,
  ])('%s: errors-lib wording matches the lazy cultivation.json copies verbatim', (_lng, errorsLib, cultivation) => {
    expect(errorsLib.cultivation.acceptChapterMissing).toBe(cultivation.acceptErrors.chapterMissing)
    expect(errorsLib.cultivation.acceptCharacterMissing).toBe(cultivation.acceptErrors.characterMissing)
    expect(errorsLib.cultivation.acceptSystemMissing).toBe(cultivation.acceptErrors.systemMissing)
    expect(errorsLib.cultivation.acceptSystemChanged).toBe(cultivation.acceptErrors.systemChanged)
    expect(errorsLib.cultivation.acceptWorldMismatchSystem).toBe(cultivation.acceptErrors.worldMismatchSystem)
    expect(errorsLib.cultivation.acceptWorldMismatchCharacter).toBe(cultivation.acceptErrors.worldMismatchCharacter)
    expect(errorsLib.cultivation.acceptEvidenceChanged).toBe(cultivation.acceptErrors.evidenceChanged)
    expect(errorsLib.cultivation.acceptStageRemoved).toBe(cultivation.acceptErrors.stageRemoved)
    expect(errorsLib.cultivation.acceptAlreadyConfirmed).toBe(cultivation.acceptErrors.alreadyConfirmed)
    expect(errorsLib.cultivation.acceptTransitionMismatch).toBe(cultivation.acceptErrors.transitionMismatch)
    expect(errorsLib.cultivation.acceptWriteFailed).toBe(cultivation.acceptErrors.writeFailed)
    expect(errorsLib.cultivation.transitionEnter).toBe(cultivation.transition.enter)
    expect(errorsLib.cultivation.transitionAdvance).toBe(cultivation.transition.advance)
    expect(errorsLib.cultivation.transitionRegress).toBe(cultivation.transition.regress)
    expect(errorsLib.cultivation.transitionSwitch).toBe(cultivation.transition.switch)
  })
})

describe('I18N-1 · cold readiness: acceptance path never relies on the lazy cultivation ns', () => {
  it('progress.ts source has no lazy cultivation:* namespace lookups', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/lib/cultivation/progress.ts'),
      'utf8',
    )
    // Quoted namespace lookups only — errors-lib:cultivation.* must NOT match.
    expect(source.match(/['"`]cultivation:/)).toBeNull()
    // Positive control: the acceptance path is registered on the preloaded ns.
    expect(source).toContain('errors-lib:cultivation.acceptChapterMissing')
    expect(source).toContain('errors-lib:cultivation.transitionEnter')
  })

  it.each([
    ['pt-BR', ptErrorsLib] as const,
    ['en', enErrorsLib] as const,
    ['zh-CN', zhErrorsLib] as const,
  ])('%s: every acceptance key resolves cold (errors-lib preloaded, cultivation NOT resident)', async (lng, bundle) => {
    const inst = await createBackendInstance({ lng })
    // The lazy cultivation namespace must not be resident on a cold instance…
    expect(inst.hasResourceBundle(lng, 'cultivation')).toBe(false)
    // …yet every error/transition label the acceptance path can throw resolves
    // to its exact localized wording (never the raw key, no leftover {{ }}).
    const allKeys = [
      ...Object.values(CULTIVATION_ACCEPT_ERROR_KEYS),
      ...Object.values(CULTIVATION_TRANSITION_LABEL_KEYS),
    ]
    expect(allKeys).toHaveLength(15)
    for (const key of allKeys) {
      const leaf = key.replace('errors-lib:cultivation.', '')
      const raw = (bundle.cultivation as Record<string, string>)[leaf]
      // transitionMismatch requires its {{expected}} interpolation variable;
      // resolving it without one must throw under the strict test handler.
      const isTransitionMismatch = key === CULTIVATION_ACCEPT_ERROR_KEYS.transitionMismatch
      const resolved = isTransitionMismatch
        ? inst.t(key, { expected: inst.t(CULTIVATION_TRANSITION_LABEL_KEYS.advance) })
        : inst.t(key)
      const expectedText = isTransitionMismatch
        ? raw.replace('{{expected}}', bundle.cultivation.transitionAdvance)
        : raw
      expect(resolved, `${lng} ${key}`).toBe(expectedText)
      expect(resolved).not.toBe(key)
      expect(resolved).not.toContain('{{')
    }
  })

  it.each([
    ['pt-BR', ptErrorsLib] as const,
    ['en', enErrorsLib] as const,
    ['zh-CN', zhErrorsLib] as const,
  ])('%s: transitionMismatch interpolates the cold-resolved transition label', async (lng, bundle) => {
    const inst = await createBackendInstance({ lng })
    expect(inst.hasResourceBundle(lng, 'cultivation')).toBe(false)
    const expectedLabel = inst.t(CULTIVATION_TRANSITION_LABEL_KEYS.advance)
    const message = inst.t(CULTIVATION_ACCEPT_ERROR_KEYS.transitionMismatch, { expected: expectedLabel })
    expect(message).toBe(
      bundle.cultivation.acceptTransitionMismatch.replace('{{expected}}', bundle.cultivation.transitionAdvance),
    )
    expect(message).toContain(bundle.cultivation.transitionAdvance)
    expect(message).not.toContain('{{')
    expect(message).not.toContain('advance')
  })
})
