/**
 * Phase 1 i18n fallback/parser fixes · emotion beats
 *
 * - parseEmotionBeats 不再写中文兜底（未命名节拍）：缺省字段一律空串，
 *   错误返回 locale 无关码（parse:not-object / parse:fallback-beats / parse:json-failed）。
 * - normalizeEmotionTone 提供 locale 无关的基调归一（zh/en/pt-BR 自由文本 → 规范代码）。
 * - EmotionBeatCard 渲染层：空 label 显示本地化兜底；基调颜色按规范代码映射，
 *   与 UI 语言无关；未知基调给中性样式；空基调不渲染徽章。
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EmotionBeatCard from '../../src/components/editor/EmotionBeatCard'
import { DialogProvider } from '../../src/components/shared/Dialog'
import i18n from '../../src/i18n'
import enEditor from '../../src/i18n/locales/en/editor.json'
import ptEditor from '../../src/i18n/locales/pt-BR/editor.json'
import zhEditor from '../../src/i18n/locales/zh-CN/editor.json'
import {
  EMOTION_TONES,
  normalizeEmotionTone,
  parseEmotionBeats,
} from '../../src/lib/ai/adapters/emotion-beat-adapter'
import { db } from '../../src/lib/db/schema'
import { useEmotionBeatStore } from '../../src/stores/emotion-beat'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('I18N-1 · parseEmotionBeats fallbacks', () => {
  it('keeps semantic values, trims fields, and uses empty string instead of a Chinese label fallback', () => {
    const { overallArc, beats, error } = parseEmotionBeats(JSON.stringify({
      overallArc: ' 整章先抑后扬 ',
      beats: [
        { label: ' 开场 ', sceneGoal: '铺垫', emotionTone: ' 紧张 ', readerFeeling: '不安', characterGrowth: '' },
        { sceneGoal: '升级' },
      ],
    }))
    expect(error).toBeUndefined()
    expect(overallArc).toBe('整章先抑后扬')
    expect(beats).toEqual([
      { label: '开场', sceneGoal: '铺垫', emotionTone: '紧张', readerFeeling: '不安', characterGrowth: '' },
      { label: '', sceneGoal: '升级', emotionTone: '', readerFeeling: '', characterGrowth: '' },
    ])
    for (const beat of beats) {
      expect(beat.label).not.toContain('未命名')
    }
  })

  it('strips markdown fences before parsing', () => {
    const { beats } = parseEmotionBeats('```json\n{"overallArc":"弧线","beats":[{"label":"高潮"}]}\n```')
    expect(beats.map(beat => beat.label)).toEqual(['高潮'])
  })

  it('returns locale-independent error codes on failure paths', () => {
    expect(parseEmotionBeats('"只是一个字符串"')).toMatchObject({
      beats: [],
      error: 'parse:not-object',
    })
    expect(parseEmotionBeats('[1,2,3]')).toMatchObject({
      beats: [],
      error: 'parse:not-object',
    })

    const broken = '{"overallArc": "x", "beats": [{"label": "开场", "sceneGoal": "铺垫"}], "tail": oops'
    const fallback = parseEmotionBeats(broken)
    expect(fallback.error).toBe('parse:fallback-beats')
    expect(fallback.beats).toEqual([
      { label: '开场', sceneGoal: '铺垫', emotionTone: '', readerFeeling: '', characterGrowth: '' },
    ])

    expect(parseEmotionBeats('完全不是 JSON')).toMatchObject({
      beats: [],
      error: 'parse:json-failed',
    })
  })
})

describe('I18N-1 · normalizeEmotionTone', () => {
  it('maps zh-CN, en and pt-BR free text to canonical codes', () => {
    // zh-CN
    expect(normalizeEmotionTone('紧张')).toBe('tense')
    expect(normalizeEmotionTone('温馨')).toBe('warm')
    expect(normalizeEmotionTone('悲伤')).toBe('sad')
    expect(normalizeEmotionTone('欢乐')).toBe('joyful')
    expect(normalizeEmotionTone('愤怒')).toBe('angry')
    expect(normalizeEmotionTone('恐惧')).toBe('fear')
    expect(normalizeEmotionTone('平静')).toBe('calm')
    expect(normalizeEmotionTone('震撼')).toBe('shocking')
    expect(normalizeEmotionTone('期待')).toBe('anticipation')
    // en
    expect(normalizeEmotionTone('Tension')).toBe('tense')
    expect(normalizeEmotionTone('heartwarming')).toBe('warm')
    expect(normalizeEmotionTone('Grief')).toBe('sad')
    expect(normalizeEmotionTone('joyful')).toBe('joyful')
    expect(normalizeEmotionTone('Rage')).toBe('angry')
    expect(normalizeEmotionTone('dread')).toBe('fear')
    expect(normalizeEmotionTone('Serene')).toBe('calm')
    expect(normalizeEmotionTone('shocking')).toBe('shocking')
    expect(normalizeEmotionTone('Hopeful')).toBe('anticipation')
    // pt-BR
    expect(normalizeEmotionTone('tenso')).toBe('tense')
    expect(normalizeEmotionTone('aconchegante')).toBe('warm')
    expect(normalizeEmotionTone('Triste')).toBe('sad')
    expect(normalizeEmotionTone('alegria')).toBe('joyful')
    expect(normalizeEmotionTone('raiva')).toBe('angry')
    expect(normalizeEmotionTone('Medo')).toBe('fear')
    expect(normalizeEmotionTone('calmo')).toBe('calm')
    expect(normalizeEmotionTone('chocante')).toBe('shocking')
    expect(normalizeEmotionTone('expectativa')).toBe('anticipation')
  })

  it('accepts canonical codes verbatim and returns null for unknown/empty input', () => {
    for (const tone of EMOTION_TONES) {
      expect(normalizeEmotionTone(tone)).toBe(tone)
      expect(normalizeEmotionTone(tone.toUpperCase())).toBe(tone)
    }
    expect(normalizeEmotionTone('神秘莫测')).toBeNull()
    expect(normalizeEmotionTone('mysterious')).toBeNull()
    expect(normalizeEmotionTone('')).toBeNull()
    expect(normalizeEmotionTone('   ')).toBeNull()
  })
})

describe('I18N-1 · EmotionBeatCard render fallbacks', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(async () => {
    await db.delete()
    await db.open()
    useEmotionBeatStore.setState({ cards: [], loading: false })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    db.close()
    await i18n.changeLanguage('zh-CN')
  })

  async function seedAndExpand(lng: string): Promise<void> {
    await i18n.changeLanguage(lng)
    const now = Date.now()
    const projectId = await db.projects.add({
      name: `节拍渲染-${lng}`, genre: '', genres: [], status: 'drafting',
      description: '', targetWordCount: 0, enableMultiWorld: false,
      createdAt: now, updatedAt: now,
    } as any) as number
    const chapterId = await db.chapters.add({
      projectId, outlineNodeId: 0, title: '第一章', content: '',
      wordCount: 0, status: 'draft', order: 0, notes: '',
      createdAt: now, updatedAt: now,
    } as any) as number
    await db.emotionBeatCards.add({
      projectId,
      chapterId,
      chapterTitle: '第一章',
      overallArc: '先抑后扬',
      beats: JSON.stringify([
        { label: '', sceneGoal: '', emotionTone: '紧张', readerFeeling: '', characterGrowth: '' },
        { label: '转折', sceneGoal: '', emotionTone: 'Tense', readerFeeling: '', characterGrowth: '' },
        { label: '高潮', sceneGoal: '', emotionTone: '神秘莫测', readerFeeling: '', characterGrowth: '' },
        { label: '余韵', sceneGoal: '', emotionTone: '', readerFeeling: '', characterGrowth: '' },
      ]),
      source: 'ai',
      createdAt: now,
      updatedAt: now,
    } as any)

    await act(async () => {
      root.render(createElement(DialogProvider, null,
        createElement(EmotionBeatCard, {
          projectId,
          chapterId,
          chapterTitle: '第一章',
          chapterSummary: '',
          worldContext: '',
          characterContext: '',
          prevChapterEnding: '',
        })))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    // 等 loadAll 完成，避免点击时误触 AI 生成路径
    await act(async () => {
      await vi.waitFor(() => expect(useEmotionBeatStore.getState().cards.length).toBe(1))
    })
    const compactButton = host.querySelector('button')!
    await act(async () => {
      compactButton.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
  }

  const EXPECTED_FALLBACKS = [
    ['zh-CN', zhEditor.emotionBeat.untitledBeat],
    ['en', enEditor.emotionBeat.untitledBeat],
    ['pt-BR', ptEditor.emotionBeat.untitledBeat],
  ] as const

  it.each(EXPECTED_FALLBACKS)(
    'renders localized untitled-beat fallback (%s) while tone colors stay locale-independent',
    async (lng, expectedFallback) => {
      await seedAndExpand(lng)

      expect(host.textContent).toContain(expectedFallback)

      const badges = Array.from(host.querySelectorAll('span'))
        .filter(span => span.className.includes('rounded text-[10px]'))
      // 空基调不渲染徽章：4 条节拍只剩 3 个徽章
      expect(badges).toHaveLength(3)

      // 中文基调 → 红色（与原映射一致）
      const zhTone = badges.find(badge => badge.textContent === '紧张')!
      expect(zhTone.className).toContain('text-red-400')
      expect(zhTone.className).toContain('bg-red-500/15')

      // 英文基调映射到同一规范代码 → 同色，且存储的原文保持不变
      const enTone = badges.find(badge => badge.textContent === 'Tense')!
      expect(enTone.className).toContain('text-red-400')
      expect(host.textContent).toContain('Tense')

      // 未知基调 → 中性样式，原文保留
      const unknown = badges.find(badge => badge.textContent === '神秘莫测')!
      expect(unknown.className).toContain('text-text-muted')
    },
  )
})
