/**
 * 物品栏提取适配器 — Phase 25.5.2-b
 * 从章节正文中提取各角色的物品获得/消耗事件。
 */
import type { ChatMessage, ItemLedgerAction } from '../../types'
import { usePromptStore } from '../../../stores/prompt'
import { renderPrompt } from '../prompt-engine'

/**
 * 字段契约（结构化信封不是语言中立的）：
 * - action：规范闭集枚举（'gain' | 'consume'）。闭集外的值（含缺失）
 *   必须整条拒绝/忽略，禁止静默强转为 'gain'——误记一笔获得会永久污染
 *   物品账本的持有数量。
 * - itemName / heldByName / note：源保留文本（仅 trim），禁止事后翻译或改写。
 * - quantity：规范正整数（有限 + 安全整数边界显式守卫）；
 *   缺省/非法/NaN/Infinity/unsafe 归一为 1，负数与 0 抬到 1。
 */
export interface ExtractedItemEvent {
  itemName: string
  heldByName: string
  action: ItemLedgerAction
  quantity: number
  note: string
}

/** action 规范闭集（与持久化枚举 ItemLedgerAction 一致，禁止改名或扩充） */
const ITEM_ACTIONS: readonly ItemLedgerAction[] = ['gain', 'consume']

/** 构建提取 prompt（调用方负责分块，禁止静默截断长章） */
export function buildInventoryExtractPrompt(
  chapterTitle: string,
  chapterText: string,
  knownItemNames: string[] = [],
  characterNames: string[] = [],
): ChatMessage[] {
  const tpl = usePromptStore.getState().getActive('inventory.extract')
  const { messages } = renderPrompt(tpl, {
    chapterTitle,
    chapterText,
    knownItemNames: knownItemNames.join('、') || '无',
    characterNames: characterNames.join('、') || '未提供',
  })
  return messages
}

/**
 * 解析 AI 输出为物品事件数组。
 *
 * 恢复策略（有意为之）：对畸形/截断输出 **fail-closed，不做 JSON 修复**。
 * 截断数组（无论尾部是否残留 ']'）JSON.parse 必然失败 → 返回空数组，
 * 保证半截/无效事件不会泄漏进物品账本。字段级闭集约束见 ExtractedItemEvent
 * 字段契约（action 必须逐字命中 gain/consume，否则整条拒绝）。
 */
export function parseInventoryEvents(raw: string): ExtractedItemEvent[] {
  const trimmed = raw.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  let jsonStr = fence ? fence[1].trim() : trimmed
  // 容错：截取第一个 [ 到最后一个 ]
  const start = jsonStr.indexOf('[')
  const end = jsonStr.lastIndexOf(']')
  if (start >= 0 && end > start) jsonStr = jsonStr.slice(start, end + 1)
  try {
    const arr = JSON.parse(jsonStr)
    if (!Array.isArray(arr)) return []
    return arr
      .map((e: Record<string, unknown>): ExtractedItemEvent | null => {
        // action 必须逐字命中规范闭集；无效值整条拒绝，绝不静默转为 gain
        if (!ITEM_ACTIONS.includes(e.action as ItemLedgerAction)) return null
        // itemName / heldByName / note 为源保留文本：仅 trim，不翻译、不改写
        // quantity：规范正整数——finite + safe-integer 边界显式守卫；
        // 缺省/非法/NaN/Infinity/负数/0 安全归一为 1
        const rawQty = Number(e.quantity)
        const rounded = Number.isFinite(rawQty) ? Math.round(rawQty) : NaN
        const quantity = Number.isSafeInteger(rounded) && rounded >= 1 ? rounded : 1
        return {
          itemName: String(e.itemName || '').trim(),
          heldByName: String(e.heldByName || '').trim(),
          action: e.action as ItemLedgerAction,
          quantity,
          note: String(e.note || '').trim(),
        }
      })
      .filter((e): e is ExtractedItemEvent => !!e && !!e.itemName && !!e.heldByName)
  } catch {
    return []
  }
}
