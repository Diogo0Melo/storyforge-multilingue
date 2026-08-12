/**
 * G2A · 输出语言约束在上下文裁剪中的保留（Oracle 行为）
 *
 * 契约：
 * - chat()/streamChat() 仍是唯一网络边界执行点；gate 先注入约束，随后裁剪
 *   必须【预留约束的精确 token 预算 → 在削减后的输入预算下裁剪基础消息 →
 *   把精确约束按原样（字节级一致）重新追加到最后一条 user 消息末尾】。
 * - 约束本身放不下，或保护信封放不下 → 拒绝请求，绝不发送缺失约束的请求。
 * - 无约束（language-neutral 等）与既有调用方行为保持不变。
 *
 * 本文件用确定性 fetch-body 断言覆盖 chat() 与 streamChat() 在极小上下文窗口 +
 * creative/mixed outputKind 下的最终请求体：约束必须仍在末尾且不丢失。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chat, streamChat } from '../../src/lib/ai/client'
import { estimateTokens, trimMessagesToFit } from '../../src/lib/ai/context-budget'
import { SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT } from '../../src/lib/ai/adapters/prompt-guards'
import type { AIConfig, ChatMessage } from '../../src/lib/types'

const CONSTRAINT = SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT
const CONSTRAINT_TOKENS = estimateTokens(CONSTRAINT)
const MAX_TOKENS = 128

/** inputBudget(w) = w - maxTokens - round(5%w) */
function inputBudgetOf(window: number): number {
  return window - MAX_TOKENS - Math.round(window * 0.05)
}

/** 最大的使 inputBudget < 约束 token 的窗口（约束本身放不下 → 必须拒绝） */
function findRejectWindow(): number {
  let window = 210
  while (inputBudgetOf(window) < CONSTRAINT_TOKENS) window += 1
  return window - 1
}

/** 使 inputBudget ≥ 约束 token + 100 的窗口（约束放得下，基础消息被迫裁剪） */
function findFitWindow(rejectWindow: number): number {
  let window = rejectWindow + 1
  while (inputBudgetOf(window) < CONSTRAINT_TOKENS + 100) window += 1
  return window
}

const REJECT_WINDOW = findRejectWindow()
const FIT_WINDOW = findFitWindow(REJECT_WINDOW)

function makeConfig(contextWindow: number): AIConfig {
  return {
    provider: 'kimi',
    model: 'moonshot-v1-8k',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test',
    temperature: 0.7,
    maxTokens: MAX_TOKENS,
    contextWindow,
  }
}

/** 超大基础内容（约 6000 token），强制触发请求侧裁剪 */
function hugeMessages(): ChatMessage[] {
  return [
    { role: 'system', content: 'system-stays' },
    { role: 'user', content: `请基于以下资料续写。${'长'.repeat(4000)}` },
  ]
}

function jsonResponse(): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
    { status: 200 },
  )
}

function sseOkResponse(): Response {
  const payload = [
    'data: {"choices":[{"delta":{"content":"ok"}}]}',
    '',
    'data: [DONE]',
    '',
    '',
  ].join('\n')
  return new Response(payload, { status: 200 })
}

function sentMessages(fetchMock: ReturnType<typeof vi.fn>): ChatMessage[] {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
  expect(init?.body).toBeTruthy()
  const body = JSON.parse(String(init!.body)) as { messages: ChatMessage[] }
  return body.messages
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('G2A · trimMessagesToFit 受保护约束预算（纯函数层）', () => {
  it('预留约束预算 → 裁剪基础消息 → 精确约束字节级重新追加到末尾', () => {
    const gated: ChatMessage[] = [
      { role: 'system', content: 'system-stays' },
      { role: 'user', content: `${'长'.repeat(4000)}\n\n${CONSTRAINT}` },
    ]
    const result = trimMessagesToFit(gated, 'kimi', 'moonshot-v1-8k', MAX_TOKENS, FIT_WINDOW, CONSTRAINT)
    const lastUser = result.messages.at(-1)!.content

    expect(result.trimmed).toBe(true)
    expect(result.constraintPreserved).toBe(true)
    expect(result.protectedEnvelopePreserved).toBe(true)
    expect(result.totalInputTokens).toBeLessThanOrEqual(result.inputBudget)
    expect(result.messages[0].content).toBe('system-stays')
    // 字节级一致：末尾是精确约束文本，且只出现一次
    expect(lastUser.endsWith(CONSTRAINT)).toBe(true)
    expect(lastUser.split(CONSTRAINT).length - 1).toBe(1)
    // 基础内容确实被裁剪过
    expect(lastUser.length).toBeLessThan(4000)
    // 原数组不被修改
    expect(gated[1].content.endsWith(CONSTRAINT)).toBe(true)
    expect(gated[1].content.length).toBeGreaterThan(4000)
  })

  it('约束本身超出输入预算 → constraintPreserved=false（调用方必须拒绝）', () => {
    const gated: ChatMessage[] = [
      { role: 'system', content: 'system-stays' },
      { role: 'user', content: `请写一章。\n\n${CONSTRAINT}` },
    ]
    const result = trimMessagesToFit(gated, 'kimi', 'moonshot-v1-8k', MAX_TOKENS, REJECT_WINDOW, CONSTRAINT)
    expect(result.constraintPreserved).toBe(false)
    expect(result.protectedEnvelopePreserved).toBe(false)
  })

  it('未请求约束 → constraintPreserved 为 undefined，既有裁剪行为不变', () => {
    const result = trimMessagesToFit(
      [{ role: 'user', content: '长'.repeat(4000) }],
      'kimi', 'moonshot-v1-8k', MAX_TOKENS, FIT_WINDOW,
    )
    expect(result.constraintPreserved).toBeUndefined()
    expect(result.trimmed).toBe(true)
    expect(result.totalInputTokens).toBeLessThanOrEqual(result.inputBudget)
  })
})

describe('G2A · chat() fetch-body：极小窗口 + creative 下约束必须存活', () => {
  it('强制裁剪后，最终请求体最后一条 user 消息仍以精确约束结尾', async () => {
    const fetchMock = vi.fn(async () => jsonResponse())
    vi.stubGlobal('fetch', fetchMock)

    const reply = await chat(
      hugeMessages(),
      makeConfig(FIT_WINDOW),
      { category: 'chapter.content', outputKind: 'creative' },
    )

    expect(reply).toBe('ok')
    expect(fetchMock).toHaveBeenCalledOnce()

    const messages = sentMessages(fetchMock)
    expect(messages[0]).toEqual({ role: 'system', content: 'system-stays' })
    const lastUser = messages.at(-1)!
    expect(lastUser.role).toBe('user')
    // 字节级一致且仅出现一次（未被裁剪吞掉、未被重复注入）
    expect(lastUser.content.endsWith(CONSTRAINT)).toBe(true)
    expect(lastUser.content.split(CONSTRAINT).length - 1).toBe(1)
    // 基础内容被裁剪到预算内
    expect(lastUser.content.length).toBeLessThan(4000)
    // 整个请求体在输入预算内（约束计入后仍不超窗）
    const total = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0)
    expect(total).toBeLessThanOrEqual(inputBudgetOf(FIT_WINDOW))
  })

  it('窗口连约束都放不下 → 拒绝请求，绝不发出缺失约束的请求', async () => {
    const fetchMock = vi.fn(async () => jsonResponse())
    vi.stubGlobal('fetch', fetchMock)

    await expect(chat(
      hugeMessages(),
      makeConfig(REJECT_WINDOW),
      { category: 'chapter.content', outputKind: 'creative' },
    )).rejects.toThrow(/上下文窗口不足|context window/i)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('language-neutral 不受影响：无约束注入、无约束保护，行为保持现状', async () => {
    const fetchMock = vi.fn(async () => jsonResponse())
    vi.stubGlobal('fetch', fetchMock)

    await expect(chat(
      [{ role: 'user', content: 'ping' }],
      makeConfig(FIT_WINDOW),
      { outputKind: 'language-neutral' },
    )).resolves.toBe('ok')

    const messages = sentMessages(fetchMock)
    expect(messages.at(-1)!.content).toBe('ping')
    expect(messages.at(-1)!.content.endsWith(CONSTRAINT)).toBe(false)
  })
})

describe('G2A · 精确边界：重追加的分隔符/取整开销不得被加法口径漏算', () => {
  // estimateTokens 对拼接不严格可加：
  //   estimateTokens(base + '\n\n' + C) 可能比 estimateTokens(base) + estimateTokens(C)
  //   多 1 token（round() 取整 + '\n\n' 分隔符）。旧实现用 `total + constraintTokens`
  //   的加法口径，在 inputBudget 恰好等于旧总和时误判 fit，最终请求体实际超 1 token
  //   仍被发出。修正后必须按最终消息重算 → constraintPreserved=false → 拒绝。

  function separatorDelta(base: string): number {
    return estimateTokens(`${base}\n\n${CONSTRAINT}`) - estimateTokens(base) - CONSTRAINT_TOKENS
  }

  /** 找一个重追加后会产生 +1 取整/分隔符开销的基础文本（确定性探测固定候选）。 */
  function findBoundaryBase(): string {
    const candidates = ['续写', '续写a', '续写ab', '续写abc', '续', '续a', '续ab']
    const found = candidates.find(base => separatorDelta(base) >= 1)
    expect(found, 'expected a base whose re-append costs more than additive accounting').toBeTruthy()
    return found!
  }

  /** inputBudgetOf 单调且每步至多 +1，可精确命中目标预算。 */
  function findExactWindow(targetBudget: number): number {
    let window = 200
    while (inputBudgetOf(window) < targetBudget) window += 1
    expect(inputBudgetOf(window)).toBe(targetBudget)
    return window
  }

  it('trimMessagesToFit：旧加法口径报 fit、最终内容实际超 1 token → constraintPreserved=false', () => {
    const base = findBoundaryBase()
    const system = 'system-stays'
    const totalBase = estimateTokens(system) + estimateTokens(base)
    const boundaryWindow = findExactWindow(totalBase + CONSTRAINT_TOKENS)

    const gated: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: `${base}\n\n${CONSTRAINT}` },
    ]
    const result = trimMessagesToFit(gated, 'kimi', 'moonshot-v1-8k', MAX_TOKENS, boundaryWindow, CONSTRAINT)

    // 未触发基础裁剪（基础消息恰好等于削减后的预算）
    expect(result.trimmed).toBe(false)
    // 旧口径：totalBase + CONSTRAINT_TOKENS === inputBudget，会误判 fit
    expect(totalBase + CONSTRAINT_TOKENS).toBe(result.inputBudget)
    // 新口径：最终内容（含 '\n\n' 分隔符与取整）超出预算 → 必须拒绝
    expect(result.totalInputTokens).toBe(result.inputBudget + separatorDelta(base))
    expect(result.constraintPreserved).toBe(false)
    expect(result.protectedEnvelopePreserved).toBe(false)
    // 约束本身仍然字节级保留在末尾（拒绝原因是超窗，不是丢约束）
    expect(result.messages.at(-1)!.content.endsWith(CONSTRAINT)).toBe(true)
  })

  it('chat()：旧口径报 fit 的精确边界 → 拒绝且不发出请求', async () => {
    const base = findBoundaryBase()
    const system = 'system-stays'
    const totalBase = estimateTokens(system) + estimateTokens(base)
    const boundaryWindow = findExactWindow(totalBase + CONSTRAINT_TOKENS)

    const fetchMock = vi.fn(async () => jsonResponse())
    vi.stubGlobal('fetch', fetchMock)

    await expect(chat(
      [{ role: 'system', content: system }, { role: 'user', content: base }],
      makeConfig(boundaryWindow),
      { category: 'chapter.content', outputKind: 'creative' },
    )).rejects.toThrow(/上下文窗口不足|context window/i)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('streamChat()：旧口径报 fit 的精确边界 → 拒绝且不发出请求', async () => {
    const base = findBoundaryBase()
    const system = 'system-stays'
    const totalBase = estimateTokens(system) + estimateTokens(base)
    const boundaryWindow = findExactWindow(totalBase + CONSTRAINT_TOKENS)

    const fetchMock = vi.fn(async () => sseOkResponse())
    vi.stubGlobal('fetch', fetchMock)

    const gen = streamChat(
      [{ role: 'system', content: system }, { role: 'user', content: base }],
      makeConfig(boundaryWindow),
      undefined,
      undefined,
      { category: 'outline.volume', outputKind: 'mixed' },
    )
    await expect(gen.next()).rejects.toThrow(/上下文窗口不足|context window/i)

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('G2A · streamChat() fetch-body：极小窗口 + mixed 下约束必须存活', () => {
  it('强制裁剪后，最终请求体最后一条 user 消息仍以精确约束结尾', async () => {
    const fetchMock = vi.fn(async () => sseOkResponse())
    vi.stubGlobal('fetch', fetchMock)

    const chunks: string[] = []
    for await (const chunk of streamChat(
      hugeMessages(),
      makeConfig(FIT_WINDOW),
      undefined,
      undefined,
      { category: 'outline.volume', outputKind: 'mixed' },
    )) {
      chunks.push(chunk)
    }

    expect(chunks.join('')).toBe('ok')
    expect(fetchMock).toHaveBeenCalledOnce()

    const messages = sentMessages(fetchMock)
    expect(messages[0]).toEqual({ role: 'system', content: 'system-stays' })
    const lastUser = messages.at(-1)!
    expect(lastUser.role).toBe('user')
    expect(lastUser.content.endsWith(CONSTRAINT)).toBe(true)
    expect(lastUser.content.split(CONSTRAINT).length - 1).toBe(1)
    expect(lastUser.content.length).toBeLessThan(4000)
    const total = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0)
    expect(total).toBeLessThanOrEqual(inputBudgetOf(FIT_WINDOW))
  })

  it('窗口连约束都放不下 → 拒绝请求，绝不发出缺失约束的请求', async () => {
    const fetchMock = vi.fn(async () => sseOkResponse())
    vi.stubGlobal('fetch', fetchMock)

    const gen = streamChat(
      hugeMessages(),
      makeConfig(REJECT_WINDOW),
      undefined,
      undefined,
      { category: 'outline.volume', outputKind: 'mixed' },
    )
    await expect(gen.next()).rejects.toThrow(/上下文窗口不足|context window/i)

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
