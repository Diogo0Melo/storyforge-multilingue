/* global console */

/**
 * AI receiver 通用调用点扫描器(i18n Phase 4 · R-PHASE4)
 *
 * "AI 调用点"检测的单一事实源,供两处消费:
 *   - scripts/generate-ai-manual.mjs  (四、AI 调用点 category 表)
 *   - scripts/check-architecture.mjs  (④ category meta 必备守卫)
 *
 * 检测对象(旧字面量扫描的超集):
 *   ① 裸入口:chat(...)、streamChat(...) —— src/lib/ai/client.ts 导出
 *   ② receiver 入口:<receiver>.start(...),receiver 遵循 useAIStream 绑定约定:
 *      - 字面量 ai(const ai = useAIStream(...))
 *      - 或以大写 AI 结尾的命名空间 receiver(npcAI/ttrpgAI/stateAI/memoryAI/
 *        enhanceAI/encounterAI/consultAI/stormAI…)
 *
 * 误报防御:
 *   - 落在注释/字符串字面量/模板文本中的匹配不报(buildNoiseMask)
 *   - 同名函数声明不报(function / export async function / function*)
 *   - 同一调用被多条规则命中只报一次(按 start 偏移去重)
 *
 * 豁免(与旧行为一致):
 *   - AI_CLIENT_FILE 自身(实现侧,不是调用点)
 *   - AI_META_FORWARDERS 中转发 meta 参数的调用(转发器,不是发起点)
 */

/** AI 客户端实现文件:其中的 chat/streamChat 是定义而非调用点,整体豁免。 */
export const AI_CLIENT_FILE = 'src/lib/ai/client.ts'

/** meta 转发器:调用文本里带 meta 参数的属于透传,不算独立发起点。 */
export const AI_META_FORWARDERS = new Set([
  'src/hooks/useAIStream.ts',
  'src/lib/import/chat-with-abort.ts',
  'src/lib/reference-analysis/pipeline.ts',
])

/** client.ts 导出的裸入口函数 */
const BARE_CALLEES = ['chat', 'streamChat']

/** receiver 入口:<identifier>.start( —— receiver 是否 AI 由 isAiReceiver 判定 */
const RECEIVER_START_RE = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\.\s*start\s*\(/g

function isAiReceiver(name) {
  // useAIStream 绑定约定:字面量 ai,或以大写 AI 结尾的命名空间 receiver。
  // 小写 ai 结尾的普通单词(如 samurai)不算,避免误报。
  return name === 'ai' || /AI$/.test(name)
}

/**
 * 标记"非代码"区域:行注释、块注释、字符串字面量、模板字面量文本。
 * 模板 `${...}` 表达式内部是代码,不标记(嵌套模板用栈处理)。
 *
 * @param {string} src 源文本
 * @returns {Uint8Array} 与 src 等长;1 = 该偏移属于注释/字符串/模板文本
 */
export function buildNoiseMask(src) {
  const n = src.length
  const mask = new Uint8Array(n)
  let inTemplate = false
  /** 每个打开的 `${` 一项,记录该表达式内的花括号深度 */
  const exprBraces = []

  let i = 0
  while (i < n) {
    const ch = src[i]
    const next = i + 1 < n ? src[i + 1] : ''

    // 模板字面量文本区域:整体掩码,直到 ` 或 ${
    if (inTemplate) {
      if (ch === '\\') {
        mask[i] = 1
        if (i + 1 < n) mask[i + 1] = 1
        i += 2
        continue
      }
      if (ch === '`') {
        mask[i] = 1
        inTemplate = false
        i++
        continue
      }
      if (ch === '$' && next === '{') {
        mask[i] = 1
        mask[i + 1] = 1
        inTemplate = false
        exprBraces.push(0)
        i += 2
        continue
      }
      mask[i] = 1
      i++
      continue
    }

    // 代码区域(顶层或模板 ${...} 表达式内);注释/字符串优先于花括号计数
    if (ch === '/' && next === '/') {
      const start = i
      while (i < n && src[i] !== '\n') i++
      mask.fill(1, start, i)
      continue
    }
    if (ch === '/' && next === '*') {
      const start = i
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++
      i = Math.min(n, i + 2)
      mask.fill(1, start, i)
      continue
    }
    if (ch === "'" || ch === '"') {
      const start = i
      i++
      while (i < n && src[i] !== ch && src[i] !== '\n') {
        if (src[i] === '\\') i++
        i++
      }
      if (i < n && src[i] === ch) i++
      mask.fill(1, start, i)
      continue
    }
    if (ch === '`') {
      mask[i] = 1
      inTemplate = true
      i++
      continue
    }

    // 模板 ${...} 表达式内:追踪花括号深度,深度归零的 } 表示回到模板文本
    if (exprBraces.length > 0) {
      if (ch === '{') {
        exprBraces[exprBraces.length - 1]++
      } else if (ch === '}') {
        const depth = exprBraces[exprBraces.length - 1]
        if (depth === 0) {
          exprBraces.pop()
          mask[i] = 1
          inTemplate = true
          i++
          continue
        }
        exprBraces[exprBraces.length - 1] = depth - 1
      }
    }
    i++
  }
  return mask
}

/** 匹配位置之前是否为函数声明头(function / export async function / function*) */
function isFunctionDeclarationPrefix(src, index) {
  const prefix = src.slice(Math.max(0, index - 24), index)
  return /\bfunction\s*\**\s*$/.test(prefix)
}

/**
 * 从开括号位置按括号配对提取完整调用文本(跳过引号内容),返回结束偏移(不含)。
 *
 * @param {string} src
 * @param {number} openParenIndex '(' 的下标
 * @returns {number} 结束偏移;未配对返回 -1
 */
function extractBalancedCallEnd(src, openParenIndex) {
  let depth = 0
  let quote = null
  let escaped = false
  for (let i = openParenIndex; i < src.length; i++) {
    const ch = src[i]
    if (quote) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch
    else if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

function pushBalancedRange(ranges, src, matchIndex, matchText) {
  if (isFunctionDeclarationPrefix(src, matchIndex)) return
  const end = extractBalancedCallEnd(src, matchIndex + matchText.length - 1)
  if (end < 0) return
  ranges.push({ start: matchIndex, end, text: src.slice(matchIndex, end) })
}

/**
 * 按字面量 callee 查找调用区间(保持 Phase 3 旧语义,叠加声明头排除)。
 *
 * @param {string} src
 * @param {string} callee 如 'chat'、'streamChat'
 * @returns {{ start: number, end: number, text: string }[]}
 */
export function findCallRanges(src, callee) {
  const ranges = []
  const re = new RegExp(`\\b${callee.replace('.', '\\.')}\\s*\\(`, 'g')
  let m
  while ((m = re.exec(src))) {
    pushBalancedRange(ranges, src, m.index, m[0])
  }
  return ranges
}

/**
 * 扫描源文本中的全部 AI 调用点。
 *
 * 返回按 start 升序、去重后的调用点;每个调用点形如:
 *   { start, end, text, callee, receiver, method, line }
 * 其中 callee 用于报告(如 'npcAI.start'、'chat'),line 为 1 起始行号。
 *
 * @param {string} src 文件内容
 * @param {string} [rel] POSIX 相对路径,用于豁免判定;可省略
 * @returns {{ start: number, end: number, text: string, callee: string, receiver: string | null, method: string, line: number }[]}
 */
export function scanAiCallSites(src, rel = '') {
  if (rel === AI_CLIENT_FILE) return []
  const mask = buildNoiseMask(src)
  const byStart = new Map()

  const consider = (range, callee, receiver, method) => {
    if (byStart.has(range.start)) return // 同一调用被多条规则命中 → 只报一次
    if (mask[range.start]) return // 落在注释/字符串/模板文本中
    if (rel && AI_META_FORWARDERS.has(rel) && /\bmeta\b/.test(range.text)) return
    const line = src.slice(0, range.start).split('\n').length
    byStart.set(range.start, { ...range, callee, receiver, method, line })
  }

  for (const callee of BARE_CALLEES) {
    for (const range of findCallRanges(src, callee)) consider(range, callee, null, callee)
  }

  RECEIVER_START_RE.lastIndex = 0
  let m
  while ((m = RECEIVER_START_RE.exec(src))) {
    const receiver = m[1]
    if (!isAiReceiver(receiver)) continue
    const ranges = []
    pushBalancedRange(ranges, src, m.index, m[0])
    for (const range of ranges) consider(range, `${receiver}.start`, receiver, 'start')
  }

  return [...byStart.values()].sort((a, b) => a.start - b.start)
}
