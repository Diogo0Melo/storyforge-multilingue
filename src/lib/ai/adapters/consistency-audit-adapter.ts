import type { ChatMessage } from '../../types'

export type ConsistencyAuditMode = 'fast' | 'deep'

/**
 * 严重度规范闭集（canonical enum，locale 无关的机器值，禁止本地化或改名）。
 * parser 只接受这三个值；未知值一律降级为 unknown。
 */
export const CONSISTENCY_SEVERITIES = ['hard', 'risk', 'unknown'] as const
export type ConsistencySeverity = typeof CONSISTENCY_SEVERITIES[number]

/**
 * 证据来源类型规范闭集（canonical enum，locale 无关的机器值，禁止本地化或改名）。
 */
export const CONSISTENCY_EVIDENCE_SOURCE_TYPES = ['canon', 'observation', 'chapter', 'summary'] as const
export type ConsistencyEvidenceSourceType = typeof CONSISTENCY_EVIDENCE_SOURCE_TYPES[number]

/**
 * 字段契约（结构化信封不是语言中立的，每个字段分类明确）：
 * - category：源保留展示标签（模型写作的语义分类，展示值而非机器枚举）。
 *   parser 原样保留、不重映射、不翻译；缺失/空白归一为空串，由渲染层给本地化兜底
 *   标签（见 ReviewPanel / R-I18N1）。
 * - severity：规范闭集枚举（CONSISTENCY_SEVERITIES）；hard 缺证据时降级 unknown。
 * - quote / evidence[].quote：源保留逐字引文——必须逐字出现在待审正文/证据上下文
 *   中，否则整条 finding 被拒。禁止翻译或改写源引文来"修复"校验。
 * - evidence[].sourceType / evidence[].sourceId：规范契约字段，指向证据上下文中的
 *   来源。sourceType 必须逐字命中 CONSISTENCY_EVIDENCE_SOURCE_TYPES；sourceId 必须
 *   是非负安全整数（Number.isSafeInteger），字符串形式仅接受纯十进制数字
 *   （/^[0-9]+$/），拒绝 hex（0x…）、指数（1e3）、空白、符号等非十进制写法。
 *   非法值按 fail-closed 丢弃该证据条目（不静默改写为 observation/0）；
 *   证据被丢弃后 hard 自动降级 unknown（见 severity 规则）。
 * - reason / suggestion：作者面向的 UI 散文，原样渲染（语言由输出意图决定，
 *   parser 不做事后翻译）。
 */
export interface ConsistencyFinding {
  category: string
  severity: ConsistencySeverity
  quote: string
  evidence: Array<{
    sourceType: ConsistencyEvidenceSourceType
    sourceId: number
    quote: string
  }>
  reason: string
  suggestion?: string
}

export interface ConsistencyAuditResult {
  mode: ConsistencyAuditMode
  findings: ConsistencyFinding[]
}

export function buildConsistencyAuditPrompt(args: {
  mode: ConsistencyAuditMode
  chapterTitle: string
  chapterContent: string
  evidenceContext: string
  cognitionCatalog?: string
  lifecycleCatalog?: string
}): ChatMessage[] {
  const focus = args.mode === 'fast'
    ? '只检查地点/世界归属、存亡、持有物数量、力量阶段、明确知识变化、绝对时间先后和直接规则冲突。目标是低误报；证据不足就不要报 hard。'
    : '检查因果链、角色动机与长期弧光、伏笔遗漏或错误回收、故事线推进、复杂时间关系、社会规范、世界规则和叙事软风险。'
  return [
    {
      role: 'system',
      content: `你是小说一致性证据审计器。${focus}

输出严格 JSON：
{"findings":[{"category":"分类","severity":"hard|risk|unknown","quote":"待审正文逐字引文","evidence":[{"sourceType":"chapter|summary|observation|canon","sourceId":0,"quote":"证据上下文逐字引文"}],"reason":"为何冲突或有风险","suggestion":"可选建议"}],"cognitionReferences":[{"characterId":1,"knowledgeKey":"闭集中的key","quote":"该角色运用或陈述该知识的正文逐字引文"}],"lifecycleReferences":[{"characterId":1,"activityType":"normal-activity","quote":"已死亡角色作为活人正常行动的正文逐字引文"}]}

规则：
1. quote 必须逐字来自待审正文；
2. evidence.quote 必须逐字来自证据上下文；
3. hard 必须有至少一条正确证据，且只能用于直接矛盾；
4. 创作选择、信息不足或可能解释得通的内容只能标 risk/unknown；
5. cognitionReferences 只能从提供的角色认知审计闭集中选择 characterId + knowledgeKey；quote 必须是正文逐字引文；不确定就不输出；
6. lifecycleReferences 只能从角色存亡审计闭集中选择 characterId；仅当该角色在当前场景作为活人正常行动时输出 normal-activity + 正文逐字引文。尸体、遗物、回忆、梦境、幻象、他人转述和明确复活均不得输出；
7. 不输出总分，不自动修改正文；没有问题返回空 findings。`,
    },
    {
      role: 'user',
      content: `【章节】${args.chapterTitle}\n\n【待审正文】\n${args.chapterContent}\n\n【只读证据上下文】\n${args.evidenceContext}\n\n${args.cognitionCatalog || '【角色认知审计闭集】无'}\n\n${args.lifecycleCatalog || '【角色存亡审计闭集】无'}\n\n请输出 JSON：`,
    },
  ]
}

/**
 * 解析一致性审计 JSON。
 *
 * 恢复策略（有意为之）：对畸形/截断输出 **fail-closed，不做 JSON 修复**。
 * 截断的信封即使内部已含完整 finding，也一律返回 null（调用方按解析失败处理），
 * 保证半截无效输出不会泄漏进审计结果。字段级 fail-closed 见 ConsistencyFinding
 * 字段契约（quote 失配拒整条 finding；evidence 的 sourceType/sourceId 非法拒该证据）。
 */
export function parseConsistencyAuditResult(args: {
  raw: string
  mode: ConsistencyAuditMode
  chapterContent: string
  evidenceContext: string
}): ConsistencyAuditResult | null {
  const start = args.raw.indexOf('{')
  const end = args.raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(args.raw.slice(start, end + 1)) as { findings?: unknown }
    if (!Array.isArray(parsed.findings)) return null
    const findings = parsed.findings.flatMap((raw): ConsistencyFinding[] => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
      const item = raw as Record<string, unknown>
      const quote = String(item.quote ?? '').trim()
      if (!quote || !args.chapterContent.includes(quote)) return []
      const evidence = Array.isArray(item.evidence)
        ? item.evidence.flatMap((entry): ConsistencyFinding['evidence'] => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
            const value = entry as Record<string, unknown>
            const evidenceQuote = String(value.quote ?? '').trim()
            if (!evidenceQuote || !args.evidenceContext.includes(evidenceQuote)) return []
            // sourceType 是规范闭集字段：非法值拒绝该证据，不静默改写为 observation
            const sourceTypeRaw = String(value.sourceType)
            if (!(CONSISTENCY_EVIDENCE_SOURCE_TYPES as readonly string[]).includes(sourceTypeRaw)) return []
            // sourceId 是规范契约字段：必须为非负安全整数，且字符串形式必须是
            // 纯十进制数字（拒绝 0x…、1e3、前导/嵌入空白等非十进制写法）。
            // 缺失/非法一律拒绝该证据，不静默归零
            const sourceIdRaw = value.sourceId
            let sourceId: number
            if (typeof sourceIdRaw === 'number') {
              sourceId = sourceIdRaw
            } else if (typeof sourceIdRaw === 'string' && /^[0-9]+$/.test(sourceIdRaw)) {
              // 纯十进制数字（无 hex/指数/空白/符号），安全转为 number
              sourceId = Number(sourceIdRaw)
            } else {
              sourceId = NaN
            }
            if (!Number.isSafeInteger(sourceId) || sourceId < 0) return []
            return [{
              sourceType: sourceTypeRaw as ConsistencyEvidenceSourceType,
              sourceId,
              quote: evidenceQuote,
            }]
          })
        : []
      // 严重度走规范闭集；未知/缺失值降级为 unknown，不接受任意字符串
      const requested = (CONSISTENCY_SEVERITIES as readonly string[]).includes(String(item.severity))
        ? String(item.severity) as ConsistencySeverity
        : 'unknown'
      const severity: ConsistencySeverity = requested === 'hard' && evidence.length === 0 ? 'unknown' : requested
      return [{
        // 语义值原样保留；缺失/空白归一为空串，由渲染层给本地化兜底标签
        category: String(item.category ?? '').trim(),
        severity,
        quote,
        evidence,
        reason: String(item.reason ?? '').trim(),
        suggestion: String(item.suggestion ?? '').trim() || undefined,
      }]
    })
    return { mode: args.mode, findings }
  } catch {
    return null
  }
}
