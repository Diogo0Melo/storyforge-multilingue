import { getT } from '../../i18n'
import type { DetailedOutline, EmotionArc } from '../types'
import {
  normalizeParsedScenes,
  parseEnhancedDetailResult,
} from '../ai/adapters/detail-scene-adapter'
import { adopt } from '../registry/adopt'
import type { WorkspaceScope } from '../types/world-ownership'

export interface AdoptWorkshopResult {
  ok: boolean
  sceneCount: number
  prohibitionCount: number
  reason?: string
}

const VALID_EMOTION_ARCS: EmotionArc[] = ['rising', 'falling', 'flat', 'wave', 'climax']

export async function adoptChapterOutlineWorkshopResult(input: {
  raw: string
  projectId: number
  scope?: WorkspaceScope
  outlineNodeId: number
  chapterSummary: string
  validCharacterIds: Set<number>
  validForeshadowIds: Set<number>
}): Promise<AdoptWorkshopResult> {
  // 作者确认的是屏幕上这份 JSON；采纳阶段不得悄悄再调用模型改写。
  const parsed = parseEnhancedDetailResult(input.raw)
  if (!parsed) {
    return { ok: false, sceneCount: 0, prohibitionCount: 0, reason: getT()('outline:detailed.workshopParseFailed') }
  }
  const scenes = normalizeParsedScenes(
    parsed.scenes,
    ids => [...new Set(ids.filter(id => input.validCharacterIds.has(id)))],
  )
  if (scenes.length === 0) {
    return { ok: false, sceneCount: 0, prohibitionCount: 0, reason: getT()('outline:detailed.workshopNoScenes') }
  }
  const prohibitions = Array.isArray(parsed.prohibitions)
    ? [...new Set(parsed.prohibitions.map(item => String(item).trim()).filter(Boolean))].slice(0, 40)
    : []
  const emotionArc = VALID_EMOTION_ARCS.includes(parsed.emotionArc as EmotionArc)
    ? parsed.emotionArc as EmotionArc
    : undefined
  const patch: Partial<DetailedOutline> = {
    scenes,
    openingHook: parsed.openingHook?.trim() || '',
    endingCliffhanger: parsed.endingCliffhanger?.trim() || '',
    sceneLocation: parsed.sceneLocation?.trim() || '',
    emotionArc,
    appearingCharacterIds: Array.isArray(parsed.appearingCharacterIds)
      ? [...new Set(parsed.appearingCharacterIds.filter(id => input.validCharacterIds.has(id)))]
      : [],
    foreshadowIds: Array.isArray(parsed.foreshadowIds)
      ? [...new Set(parsed.foreshadowIds.filter(id => input.validForeshadowIds.has(id)))]
      : [],
    prohibitions,
    lastUsedSummary: input.chapterSummary,
  }
  const result = await adopt({
    projectId: input.projectId,
    scope: input.scope,
    target: 'detailedOutlines',
    mode: 'add',
    data: { outlineNodeId: input.outlineNodeId, ...patch },
  })
  if (result.written.length === 0) {
    const reason = [
      ...result.typeErrors.map(item => getT()('outline:detailed.workshopTypeError', { field: item.field })),
      ...result.fkErrors.map(item => getT()('outline:detailed.workshopFkError', { field: item.field })),
      ...result.skipped.map(item => item.reason),
    ][0] ?? getT()('outline:detailed.workshopWriteNoop')
    return { ok: false, sceneCount: 0, prohibitionCount: 0, reason }
  }
  return {
    ok: true,
    sceneCount: scenes.length,
    prohibitionCount: prohibitions.length,
  }
}
