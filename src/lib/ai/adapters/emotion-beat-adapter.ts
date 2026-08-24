/**
 * 情感节拍卡 AI 适配器
 * 根据受控上下文生成情感节拍规划，并为渲染层提供 locale 无关的基调代码。
 */
import type { ChatMessage } from '../../types'
import type { EmotionBeat } from '../../types/emotion-beat'

export interface ParsedEmotionBeats {
  overallArc: string
  beats: EmotionBeat[]
  error?: 'parse:not-object' | 'parse:fallback-beats' | 'parse:json-failed'
}

const EMOTION_BEAT_KEYS: readonly (keyof EmotionBeat)[] = [
  'label', 'sceneGoal', 'emotionTone', 'readerFeeling', 'characterGrowth',
]

function normalizeBeat(value: unknown): EmotionBeat | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  return Object.fromEntries(EMOTION_BEAT_KEYS.map(key => [
    key,
    typeof row[key] === 'string' ? row[key].trim() : '',
  ])) as unknown as EmotionBeat
}

function extractFallbackBeats(source: string): EmotionBeat[] {
  const match = source.match(/"beats"\s*:\s*\[([\s\S]*)\]\s*(?:,\s*"[^"\\]+"\s*:\s*[^}]*)?$/)
  if (!match) return []
  const beats: EmotionBeat[] = []
  for (const candidate of match[1].matchAll(/\{([\s\S]*?)\}/g)) {
    try {
      const beat = normalizeBeat(JSON.parse(`{${candidate[1]}}`))
      if (beat) beats.push(beat)
    } catch {
      // Preserve only independently parseable beat objects from a damaged tail.
    }
  }
  return beats
}

/** Legacy parser seam: normalize model output without locale text. */
export function parseEmotionBeats(output: string): ParsedEmotionBeats {
  let source = output.trim()
  const fenced = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenced) source = fenced[1]
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    const fallbackBeats = extractFallbackBeats(source)
    return fallbackBeats.length > 0
      ? { overallArc: '', beats: fallbackBeats, error: 'parse:fallback-beats' }
      : { overallArc: '', beats: [], error: 'parse:json-failed' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { overallArc: '', beats: [], error: 'parse:not-object' }
  }
  const row = parsed as Record<string, unknown>
  return {
    overallArc: typeof row.overallArc === 'string' ? row.overallArc.trim() : '',
    beats: Array.isArray(row.beats)
      ? row.beats.map(normalizeBeat).filter((beat): beat is EmotionBeat => beat !== null)
      : [],
  }
}

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

const EMOTION_BEAT_SYSTEM_PROMPT = `你是一位资深小说编辑，擅长分析和规划章节的情感节奏。
你的任务是为即将创作的章节生成一份「情感节拍卡」，帮助作者在写作前理清叙事节奏。

要求：
1. 将章节拆分为 3~6 个关键节拍
2. 每个节拍说明场景目标、情感基调、期望读者感受、角色变化
3. 整体形成有起伏的完整情感弧线
4. 节拍之间有情感递进或反转
5. 只能使用给定上下文，不得把未确认细节写成既定事实

输出严格 JSON（不要 markdown 围栏）：
{
  "overallArc": "整章情感概述",
  "beats": [{
    "label": "节拍名称",
    "sceneGoal": "叙事任务",
    "emotionTone": "情感基调",
    "readerFeeling": "期望读者感受",
    "characterGrowth": "角色变化或展现"
  }]
}`

/** HARNESS-61: prompt 只消费 Context Gateway 已装配和裁剪的文本。 */
export function buildEmotionBeatPromptFromContext(contextText: string): ChatMessage[] {
  return [
    { role: 'system', content: EMOTION_BEAT_SYSTEM_PROMPT },
    { role: 'user', content: `${contextText}\n\n请为该章生成情感节拍卡。` },
  ]
}
