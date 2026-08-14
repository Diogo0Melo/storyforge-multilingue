import type { Chapter, OutlineNode } from '../types'
import { resolveCanonicalChapterSequence } from '../ai/chapter-memory/canonical-chapter-sequence'
import { htmlToPlainText } from '../utils/html'
import { getT } from '../../i18n'

export type InventoryExtractionMode = 'all' | 'range'

export interface InventoryExtractionChapter {
  chapter: Chapter
  /** 在完整规范章序中的 1-based 序号，包括尚未写正文的章节。 */
  ordinal: number
  hasWrittenContent: boolean
}

export interface InventoryExtractionSelection {
  chapters: Chapter[]
  error: string | null
}

export function listInventoryExtractionChapters(
  chapters: Chapter[],
  outlineNodes: OutlineNode[],
): InventoryExtractionChapter[] {
  return resolveCanonicalChapterSequence(outlineNodes, chapters).sequence.map((entry, index) => ({
    chapter: entry.chapter,
    ordinal: index + 1,
    hasWrittenContent: htmlToPlainText(entry.chapter.content ?? '').trim().length > 50,
  }))
}

export function selectInventoryExtractionChapters(input: {
  chapters: Chapter[]
  outlineNodes: OutlineNode[]
  mode: InventoryExtractionMode
  startOrdinal?: number
  endOrdinal?: number
}): InventoryExtractionSelection {
  const available = listInventoryExtractionChapters(input.chapters, input.outlineNodes)
  // 错误文案在 lib 侧经 getT() 解析（与 getAIConfigRequiredMessage 同一消费路径：
  // InventoryPanel 直接把返回字符串塞进 setExtractError，渲染侧不再翻译）。
  // 键必须取自【预加载】的 errors-lib：timeline 是组件域懒加载 ns，首次错误
  // 触发时可能尚未载入，会把原始 key 冻进 error 状态（I18N.md 禁止 lib 读组件域 ns）。
  const t = getT()

  if (input.mode === 'range') {
    const start = input.startOrdinal ?? 0
    const end = input.endOrdinal ?? 0
    if (start < 1 || end < 1) return { chapters: [], error: t('errors-lib:inventory.invalidRange') }
    if (start > end) return { chapters: [], error: t('errors-lib:inventory.startAfterEnd') }
    const chapters = available
      .filter(item => item.ordinal >= start && item.ordinal <= end && item.hasWrittenContent)
      .map(item => item.chapter)
    return {
      chapters,
      error: chapters.length > 0 ? null : t('errors-lib:inventory.noWrittenInRange'),
    }
  }

  const chapters = available.filter(item => item.hasWrittenContent).map(item => item.chapter)
  return {
    chapters,
    error: chapters.length > 0 ? null : t('errors-lib:inventory.noWrittenChapters'),
  }
}
