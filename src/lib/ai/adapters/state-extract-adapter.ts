/**
 * 状态提取适配器 — 章节完成后提取实体状态变更
 * 输入：当前状态表 + 章节正文
 * 输出：JSON 格式的 StateDiffItem[]
 */
import type { ChatMessage } from '../../types'

/**
 * 构建状态提取 prompt
 * @param stateContext 当前状态表文本（来自 buildStateContext）
 * @param chapterTitle 章节标题
 * @param chapterText 章节正文（纯文本）
 * @param maxChars 章节文本最大截取长度
 */
export function buildStateExtractPrompt(
  stateContext: string,
  chapterTitle: string,
  chapterText: string,
  characterNames: string[] = [],
  maxChars = 6000,
): ChatMessage[] {
  const trimmedText = chapterText.length > maxChars
    ? chapterText.slice(0, maxChars) + '\n…（后文省略）'
    : chapterText

  const systemPrompt = `你是一个小说角色状态追踪器。你的任务是阅读章节内容，对比当前状态表，只提取已登记角色发生的状态变化。

规则：
1. 只提取本章中**明确发生变化**的状态，不要重复已有状态
2. entityName 必须严格取自“已登记角色名单”；地点、物品、文件夹、组织、事件都不能作为角色
3. category 必须固定为 character
4. field 用简短中文词汇，如：位置、身体状态、境界、目标、所属势力、持有物、关系
5. oldValue 填变化前的值（从状态表中读取），新实体填 null
6. 如果本章没有任何状态变化，返回空数组 []

输出格式：严格 JSON 数组，不要加 markdown 代码块，不要加任何解释文字。
示例：
[{"entityName":"李明远","category":"character","field":"位置","oldValue":"长安","newValue":"洛阳"},{"entityName":"萧寒","category":"character","field":"持有物","oldValue":null,"newValue":"残破令牌"}]`

  const userPrompt = `【已登记角色名单】
${characterNames.join('、') || '无（返回空数组）'}

${stateContext ? stateContext + '\n\n' : '（当前没有角色状态记录）\n\n'}【章节标题】${chapterTitle}\n\n【章节内容】\n${trimmedText}\n\n请只提取名单内角色的状态变更：`

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
}

/**
 * 从 AI 输出中解析 StateDiffItem[]
 * 容错处理：尝试多种格式
 *
 * 字段契约（结构化信封不是语言中立的）：
 * - entityName：规范值——已登记角色名是 canonical 拼写。匹配为安全起见忽略
 *   大小写（trim + toLocaleLowerCase 比较），但输出一律回写名单中的精确拼写，
 *   不持久化模型的大小写变体；不在名单内的实体整条丢弃。名单为空时原样保留
 *   模型文本（仅 trim）。
 * - category：规范 schema 标签，此提取器只接受 'character'（prompt 规则 3），
 *   其它值整条丢弃而非静默改写。
 * - field：规范 schema 字段标签（如 位置/身体状态/境界），原样保留展示。
 * - oldValue / newValue：源保留文本，原样保留（仅 trim），禁止事后翻译或改写。
 *   oldValue 为 null/空白表示新实体或无旧值。
 * - 派生的过渡元数据（如 diff 审核状态）保持规范值，不进入本 parser。
 *
 * 恢复不变量：正常解析与截断修复（recovery）分支必须走同一套
 * category/allowlist/必填字段过滤；修复后的 JSON 不得绕过任何闭集约束。
 */
export function parseStateDiffs(raw: string, allowedCharacterNames: string[] = []): {
  diffs: Array<{
    entityName: string
    category: string
    field: string
    oldValue: string | null
    newValue: string
  }>
  error: string | null
} {
  const trimmed = raw.trim()

  // 去除可能的 markdown 代码块
  let jsonStr = trimmed
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim()
  }

  // 尝试找到 JSON 数组
  const arrStart = jsonStr.indexOf('[')
  const arrEnd = jsonStr.lastIndexOf(']')
  if (arrStart === -1 || arrEnd === -1 || arrEnd <= arrStart) {
    console.warn('[StateExtract] 未找到 JSON 数组:', jsonStr.slice(0, 200))
    return { diffs: [], error: '未能从 AI 输出中解析到 JSON 数组' }
  }

  jsonStr = jsonStr.slice(arrStart, arrEnd + 1)

  // 单一过滤入口：正常路径与 recovery 路径共用，保证闭集约束在修复后仍然生效。
  // 已登记角色名是规范值（canonical）：匹配为安全起见忽略大小写，但输出一律
  // 回写登记名单中的精确拼写，不把模型的大小写变体持久化进状态表。
  const canonicalByName = new Map<string, string>()
  for (const name of allowedCharacterNames) {
    const trimmed = name.trim()
    if (!trimmed) continue
    const key = trimmed.toLocaleLowerCase()
    if (!canonicalByName.has(key)) canonicalByName.set(key, trimmed)
  }
  const validate = (parsed: unknown): Array<{
    entityName: string
    category: string
    field: string
    oldValue: string | null
    newValue: string
  }> | null => {
    if (!Array.isArray(parsed)) return null
    const valid = parsed.filter((item: Record<string, unknown>) => {
      if (!item.entityName || !item.category || !item.field || item.newValue === undefined) {
        console.warn('[StateExtract] 跳过不完整的 diff item:', item)
        return false
      }
      if (item.category !== 'character') {
        console.warn('[StateExtract] 无效的 category:', item.category)
        return false
      }
      if (canonicalByName.size > 0 && !canonicalByName.has(String(item.entityName).trim().toLocaleLowerCase())) {
        console.warn('[StateExtract] 跳过未登记角色:', item.entityName)
        return false
      }
      return true
    })
    // 源保留字段仅 trim，不翻译、不改写；oldValue 空白归一为 null（新实体）。
    // entityName 命中名单时回写规范拼写（见 canonicalByName 说明）。
    return valid.map((item: Record<string, unknown>) => {
      const oldValue = item.oldValue === undefined || item.oldValue === null ? null : String(item.oldValue).trim()
      const trimmedName = String(item.entityName).trim()
      const canonicalName = canonicalByName.get(trimmedName.toLocaleLowerCase())
      return {
        entityName: canonicalByName.size > 0 && canonicalName ? canonicalName : trimmedName,
        category: 'character',
        field: String(item.field).trim(),
        oldValue: oldValue !== null && oldValue.trim() === '' ? null : oldValue,
        newValue: String(item.newValue).trim(),
      }
    })
  }

  try {
    const parsed = JSON.parse(jsonStr)
    const valid = validate(parsed)
    if (!valid) {
      console.error('[StateExtract] 解析结果不是数组:', typeof parsed)
      return { diffs: [], error: '解析结果不是数组' }
    }

    console.log(`[StateExtract] 解析成功：${valid.length}/${Array.isArray(parsed) ? parsed.length : 0} 条有效`)
    return { diffs: valid, error: null }
  } catch (err) {
    console.error('[StateExtract] JSON 解析失败:', err, jsonStr.slice(0, 300))
    // 尝试修复截断的 JSON；修复结果必须通过与正常路径完全相同的过滤
    try {
      const repaired = jsonStr.slice(0, jsonStr.lastIndexOf('}') + 1) + ']'
      const valid = validate(JSON.parse(repaired))
      if (valid) {
        console.log('[StateExtract] JSON 修复成功，解析到', valid.length, '条')
        return { diffs: valid, error: null }
      }
    } catch {
      // 修复也失败了
    }
    return { diffs: [], error: `JSON 解析失败：${(err as Error).message}` }
  }
}
