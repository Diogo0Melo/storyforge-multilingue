/**
 * Phase 1 i18n fallback/parser fixes · consistency audit category
 *
 * - parseConsistencyAuditResult 不再注入中文兜底 '未分类'：缺失/空白分类归一为空串，
 *   已知/语义分类原样保留。
 * - ReviewPanel 渲染层：空分类显示本地化兜底标签（zh-CN/en/pt-BR），
 *   规范/语义分类原样展示。
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ReviewPanel from '../../src/components/editor/ReviewPanel'
import i18n from '../../src/i18n'
import enEditor from '../../src/i18n/locales/en/editor.json'
import ptEditor from '../../src/i18n/locales/pt-BR/editor.json'
import zhEditor from '../../src/i18n/locales/zh-CN/editor.json'
import { parseConsistencyAuditResult } from '../../src/lib/ai/adapters/consistency-audit-adapter'
import { useReviewResultStore } from '../../src/stores/review-result'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const chapter = '林寻说自己从未见过青铜铃，却从左袖取出了青铜铃。'
const evidence = '【物品流水证据】\n#7 第1章：消耗 青铜铃 ×1（已交给守门人）'

function rawWithCategory(category: unknown): string {
  return JSON.stringify({
    findings: [{
      category,
      severity: 'risk',
      quote: '从左袖取出了青铜铃',
      evidence: [{ sourceType: 'observation', sourceId: 7, quote: '消耗 青铜铃 ×1' }],
      reason: '该物品此前已消耗',
    }],
  })
}

describe('I18N-1 · parseConsistencyAuditResult category fallback', () => {
  it('keeps canonical/semantic categories untouched', () => {
    const parsed = parseConsistencyAuditResult({
      mode: 'fast',
      chapterContent: chapter,
      evidenceContext: evidence,
      raw: rawWithCategory('持有物'),
    })
    expect(parsed?.findings[0]?.category).toBe('持有物')
  })

  it('normalizes missing, null and whitespace categories to empty string instead of 未分类', () => {
    for (const category of [undefined, null, '   ']) {
      const parsed = parseConsistencyAuditResult({
        mode: 'fast',
        chapterContent: chapter,
        evidenceContext: evidence,
        raw: rawWithCategory(category),
      })
      expect(parsed?.findings[0]?.category).toBe('')
      expect(parsed?.findings[0]?.category).not.toContain('未分类')
    }
  })
})

describe('I18N-1 · ReviewPanel category render fallback', () => {
  const chapterId = 42
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN')
    useReviewResultStore.setState({ byChapter: {} })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    useReviewResultStore.setState({ byChapter: {} })
    await i18n.changeLanguage('zh-CN')
  })

  async function seedAndMount(lng: string): Promise<void> {
    await i18n.changeLanguage(lng)
    useReviewResultStore.getState().setConsistency(chapterId, {
      mode: 'fast',
      findings: [
        { category: '', severity: 'risk', quote: '从左袖取出了青铜铃', evidence: [], reason: '空分类走本地化兜底' },
        { category: '持有物', severity: 'hard', quote: '从左袖取出了青铜铃', evidence: [], reason: '已知分类原样展示' },
      ],
    })
    useReviewResultStore.getState().setActiveTab(chapterId, 'consistency')
    await act(async () => {
      root.render(createElement(ReviewPanel, {
        projectId: 1,
        chapterId,
        chapterContent: chapter,
        chapterTitle: '测试章节',
        worldContext: '',
        characterContext: '',
        prevChapterSummary: '',
        nextChapterSummary: '',
        foreshadowContext: '',
        stateContext: '',
        onClose: () => {},
      }))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
  }

  it('shows the zh-CN localized fallback for empty categories and keeps known categories verbatim', async () => {
    await seedAndMount('zh-CN')
    expect(host.textContent).toContain(zhEditor.review.categoryUncategorized)
    expect(host.textContent).toContain('持有物')
    expect(host.textContent).not.toContain('review.categoryUncategorized')
  })

  it('shows the en localized fallback for empty categories', async () => {
    await seedAndMount('en')
    expect(host.textContent).toContain(enEditor.review.categoryUncategorized)
    expect(host.textContent).toContain('持有物')
  })

  it('shows the pt-BR localized fallback for empty categories', async () => {
    await seedAndMount('pt-BR')
    expect(host.textContent).toContain(ptEditor.review.categoryUncategorized)
    expect(host.textContent).toContain('持有物')
  })
})
