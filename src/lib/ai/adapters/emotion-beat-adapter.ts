/**
 * 情感节拍卡 AI 适配器
 * 根据章节大纲 + 上下文生成情感节拍规划
 */
import type { ChatMessage } from '../../types'
import type { EmotionBeat } from '../../types/emotion-beat'

/**
 * 规范情感基调枚举（locale 无关）。AI 自由文本通过 normalizeEmotionTone
 * 映射到这些代码；渲染层再按代码取颜色/本地化标签。禁止在存储里写翻译文案。
 */
export const EMOTION_TONES = [
  'tense',
  'warm',
  'sad',
  'joyful',
  'angry',
  'fear',
  'calm',
  'shocking',
  'anticipation',
] as const
export type EmotionTone = typeof EMOTION_TONES[number]

/** 每个规范基调的多语言关键词（zh/en/pt 子串匹配，均按小写比较）。 */
const TONE_KEYWORDS: Record<EmotionTone, readonly string[]> = {
  tense: ['紧张', 'tense', 'tension', 'suspense', 'thrill', 'tenso', 'nervos', 'ansied'],
  warm: ['温馨', 'warm', 'heartwarming', 'tender', 'caloroso', 'aconcheg', 'ternura'],
  sad: ['悲伤', '哀伤', 'sad', 'sorrow', 'grief', 'mourn', 'triste', 'melanc', 'luto'],
  joyful: ['欢乐', '喜悦', 'joy', 'happy', 'cheerful', 'celebrat', 'alegr', 'feliz', 'divertid'],
  angry: ['愤怒', '怒火', 'anger', 'angry', 'fury', 'rage', 'outrag', 'raiva', 'furios'],
  fear: ['恐惧', '惊恐', 'fear', 'horror', 'dread', 'terror', 'medo', 'temor', 'assust'],
  calm: ['平静', '宁静', 'calm', 'peaceful', 'serene', 'tranquil', 'calmo', 'sereno', 'sosseg'],
  shocking: ['震撼', 'shock', 'stunning', 'overwhelming', 'chocante', 'impactante', 'impressionante'],
  anticipation: ['期待', 'anticipat', 'expectant', 'hopeful', 'expectativa', 'esperan'],
}

/**
 * 将任意语言的基调自由文本归一为规范代码。
 * 无法识别时返回 null（渲染层给中性样式），绝不猜测。
 */
export function normalizeEmotionTone(raw: string): EmotionTone | null {
  const text = raw.trim().toLowerCase()
  if (!text) return null
  if ((EMOTION_TONES as readonly string[]).includes(text)) return text as EmotionTone
  for (const tone of EMOTION_TONES) {
    if (TONE_KEYWORDS[tone].some(keyword => text.includes(keyword))) return tone
  }
  return null
}

/** 把 AI 返回的单条节拍归一为 EmotionBeat（缺省一律空串，不写翻译兜底文案）。 */
function normalizeBeat(raw: unknown): EmotionBeat {
  const beat = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  return {
    label: String(beat.label ?? '').trim(),
    sceneGoal: String(beat.sceneGoal ?? '').trim(),
    emotionTone: String(beat.emotionTone ?? '').trim(),
    readerFeeling: String(beat.readerFeeling ?? '').trim(),
    characterGrowth: String(beat.characterGrowth ?? '').trim(),
  }
}

export function buildEmotionBeatPrompt(
  chapterTitle: string,
  chapterSummary: string,
  worldContext: string,
  characterContext: string,
  prevChapterEnding: string,
): ChatMessage[] {
  const system = `你是一位资深小说编辑，擅长分析和规划章节的情感节奏。
你的任务是为即将创作的章节生成一份「情感节拍卡」，帮助作者在写作前理清叙事节奏。

要求：
1. 将章节拆分为 3~6 个关键节拍（如"开场铺垫"、"冲突升级"、"情感转折"、"高潮"、"余韵"等）
2. 每个节拍需要说明：场景目标、情感基调、期望读者感受、角色变化
3. 整体要形成完整的情感弧线（有起有伏）
4. 节拍之间要有情感的递进或反转，避免单调
5. 用简洁有力的语言

输出严格的 JSON 格式（不要 markdown 围栏）：
{
  "overallArc": "整章情感概述（1-2句）",
  "beats": [
    {
      "label": "节拍名称",
      "sceneGoal": "这个段落要完成什么叙事任务",
      "emotionTone": "情感基调关键词",
      "readerFeeling": "期望读者产生什么感受",
      "characterGrowth": "角色在此处的变化或展现"
    }
  ]
}`

  const userParts: string[] = []
  userParts.push(`## 章节：${chapterTitle}`)
  userParts.push(`## 大纲摘要：\n${chapterSummary}`)
  if (worldContext) userParts.push(`## 世界观背景：\n${worldContext.slice(0, 1500)}`)
  if (characterContext) userParts.push(`## 涉及角色：\n${characterContext.slice(0, 1000)}`)
  if (prevChapterEnding) userParts.push(`## 上一章结尾：\n${prevChapterEnding}`)
  userParts.push('\n请为该章节生成情感节拍卡。')

  return [
    { role: 'system', content: system },
    { role: 'user', content: userParts.join('\n\n') },
  ]
}

/**
 * 解析 AI 返回的情感节拍 JSON。
 *
 * error 返回 locale 无关的错误码（parse:not-object / parse:fallback-beats /
 * parse:json-failed），不返回翻译文案；缺省字段一律空串，渲染层负责本地化兜底。
 */
export function parseEmotionBeats(raw: string): {
  overallArc: string
  beats: EmotionBeat[]
  error?: string
} {
  try {
    // 移除 markdown 围栏
    let cleaned = raw.trim()
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '')
    }

    const parsed = JSON.parse(cleaned)

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.error('[EmotionBeat] 解析结果不是对象:', cleaned.slice(0, 200))
      return { overallArc: '', beats: [], error: 'parse:not-object' }
    }

    const overallArc = String(parsed.overallArc ?? '').trim()
    const beats = Array.isArray(parsed.beats) ? parsed.beats.map(normalizeBeat) : []

    console.log(`[EmotionBeat] 解析成功: ${beats.length} 个节拍`)
    return { overallArc, beats }
  } catch (err) {
    console.error('[EmotionBeat] JSON 解析失败:', err, raw.slice(0, 300))

    // 尝试从部分 JSON 中提取
    try {
      const arrMatch = raw.match(/"beats"\s*:\s*(\[[\s\S]*?\])/)?.[1]
      if (arrMatch) {
        const parsed = JSON.parse(arrMatch) as unknown[]
        const beats = Array.isArray(parsed) ? parsed.map(normalizeBeat) : []
        console.log(`[EmotionBeat] 回退解析: 提取到 ${beats.length} 个节拍`)
        return { overallArc: '', beats, error: 'parse:fallback-beats' }
      }
    } catch {
      // ignore
    }

    return { overallArc: '', beats: [], error: 'parse:json-failed' }
  }
}
