/**
 * AI 消耗统计 — 持久化每次 AI 调用的 token 用量与费用
 *
 * 在 AI 调用链路（client.ts streamChat/chat）的唯一出口记录，按「消耗类型」分类。
 * 类型来源于各 AI 行为的 moduleKey（如 chapter.content / worldview.dimension），
 * 标签已迁到 pages.usageStats.categories.*;运行时通过 getT() 解析。
 */
import { db } from '../db/schema'
import type { AIProvider } from '../types'
import type { AITaskKind } from './task-routing'
import { getT } from '../../i18n'

/** 一条 AI 消耗记录 */
export interface AIUsageEntry {
  id?: number
  projectId?: number | null
  timestamp: number
  /** 消耗类型标识（moduleKey 或显式 category，如 'chapter.content'） */
  category: string
  /** 实际发出请求的 provider；旧记录可能没有。 */
  provider?: AIProvider
  model: string
  /** 统一任务路由分类；旧记录和未知 category 可能没有。 */
  taskKind?: AITaskKind
  inputTokens: number
  outputTokens: number
  /** 计算所得费用（美元） */
  costUsd: number
}

// ── 消耗类型 → 友好标签 + 配色 ────────────────────────────────

interface CategoryMeta { label: string; color: string }

/**
 * 类别 ID → 静态 i18n key(对应 pages.usageStats.categories.*)。
 * ID 由匹配规则派生,与 UI 展示解耦;颜色保留在规则侧(非 i18n 内容)。
 */
const CATEGORY_I18N_KEYS = {
  chapterContent: 'pages:usageStats.categories.chapterContent',
  chapterPolish: 'pages:usageStats.categories.chapterPolish',
  outlineGeneration: 'pages:usageStats.categories.outlineGeneration',
  detailOutline: 'pages:usageStats.categories.detailOutline',
  worldviewGeneration: 'pages:usageStats.categories.worldviewGeneration',
  storyTimeline: 'pages:usageStats.categories.storyTimeline',
  storyDesign: 'pages:usageStats.categories.storyDesign',
  creativeRules: 'pages:usageStats.categories.creativeRules',
  characterGeneration: 'pages:usageStats.categories.characterGeneration',
  foreshadow: 'pages:usageStats.categories.foreshadow',
  storyArc: 'pages:usageStats.categories.storyArc',
  stateExtract: 'pages:usageStats.categories.stateExtract',
  factExtract: 'pages:usageStats.categories.factExtract',
  retrievalEmbed: 'pages:usageStats.categories.retrievalEmbed',
  inventory: 'pages:usageStats.categories.inventory',
  relation: 'pages:usageStats.categories.relation',
  sceneVerify: 'pages:usageStats.categories.sceneVerify',
  agentTeam: 'pages:usageStats.categories.agentTeam',
  review: 'pages:usageStats.categories.review',
  codex: 'pages:usageStats.categories.codex',
  summary: 'pages:usageStats.categories.summary',
  inspiration: 'pages:usageStats.categories.inspiration',
  worldGroup: 'pages:usageStats.categories.worldGroup',
  import: 'pages:usageStats.categories.import',
  reference: 'pages:usageStats.categories.reference',
  test: 'pages:usageStats.categories.test',
  other: 'pages:usageStats.categories.other',
} as const

type CategoryId = keyof typeof CATEGORY_I18N_KEYS

/** moduleKey 前缀 → 类别 ID + 配色。未命中归 other。 */
const CATEGORY_RULES: Array<{ test: (k: string) => boolean; id: CategoryId; color: string }> = [
  { test: k => k.startsWith('chapter.content') || k.startsWith('chapter.continue'), id: 'chapterContent', color: '#6E8BdE' },
  { test: k => k.startsWith('chapter.'), id: 'chapterPolish', color: '#7BA0C8' },
  { test: k => k.startsWith('outline.'), id: 'outlineGeneration', color: '#C8956E' },
  { test: k => k.startsWith('detail.'), id: 'detailOutline', color: '#C8A86E' },
  { test: k => k.startsWith('worldview.'), id: 'worldviewGeneration', color: '#5EA88A' },
  { test: k => k.startsWith('story.timeline'), id: 'storyTimeline', color: '#9B8BC0' },
  { test: k => k.startsWith('story.'), id: 'storyDesign', color: '#7B9BC0' },
  { test: k => k.startsWith('rules.'), id: 'creativeRules', color: '#B0926E' },
  { test: k => k.startsWith('character.'), id: 'characterGeneration', color: '#B06B9B' },
  { test: k => k.startsWith('foreshadow.'), id: 'foreshadow', color: '#6EB0A8' },
  { test: k => k.startsWith('storyArc') || k.startsWith('story-arc'), id: 'storyArc', color: '#8BA86E' },
  { test: k => k.startsWith('state.extract'), id: 'stateExtract', color: '#C07B7B' },
  { test: k => k.startsWith('fact.extract'), id: 'factExtract', color: '#7B9BC0' },
  { test: k => k.startsWith('retrieval.embed'), id: 'retrievalEmbed', color: '#6EA8B0' },
  { test: k => k.startsWith('inventory'), id: 'inventory', color: '#C09B6E' },
  { test: k => k.startsWith('relation'), id: 'relation', color: '#9B6EB0' },
  { test: k => k.startsWith('scene.verify'), id: 'sceneVerify', color: '#6E9BC0' },
  { test: k => k.startsWith('agent.'), id: 'agentTeam', color: '#6E8FA8' },
  { test: k => k.startsWith('review') || k.startsWith('readability'), id: 'review', color: '#A88B5E' },
  { test: k => k.startsWith('codex'), id: 'codex', color: '#5E9BA8' },
  { test: k => k.startsWith('summary'), id: 'summary', color: '#8B8B8B' },
  { test: k => k.startsWith('inspiration'), id: 'inspiration', color: '#C0A05E' },
  { test: k => k.startsWith('world-group'), id: 'worldGroup', color: '#5EA8A0' },
  { test: k => k.startsWith('import'), id: 'import', color: '#8B7BB0' },
  { test: k => k.startsWith('reference') || k.startsWith('master'), id: 'reference', color: '#A07B8B' },
  { test: k => k === 'test', id: 'test', color: '#888888' },
]

/** 解析类别 ID 的本地化 label。 */
function resolveCategoryLabel(id: CategoryId): string {
  const t = getT()
  const k = CATEGORY_I18N_KEYS[id]
  const v = (t as any)(k)
  return typeof v === 'string' && v !== k ? v : id
}

export function categoryMeta(category: string | undefined): CategoryMeta {
  if (!category) return { label: resolveCategoryLabel('other'), color: '#999999' }
  const rule = CATEGORY_RULES.find(r => r.test(category))
  if (!rule) return { label: resolveCategoryLabel('other'), color: '#999999' }
  return { label: resolveCategoryLabel(rule.id), color: rule.color }
}

// ── 价格表（每 1M token 的美元单价；按模型名子串匹配，估算值，可在页面调汇率） ──

interface ModelPrice { input: number; output: number }

const MODEL_PRICING: Array<{ match: (m: string) => boolean; price: ModelPrice }> = [
  { match: m => /gemini.*flash/i.test(m), price: { input: 0.3, output: 2.5 } },
  { match: m => /gemini/i.test(m), price: { input: 1.6, output: 6.0 } },        // 截图：$1.6/1M 输入
  { match: m => /gpt-4o-mini|4o-mini/i.test(m), price: { input: 0.15, output: 0.6 } },
  { match: m => /gpt-4o|gpt-4\.1/i.test(m), price: { input: 2.5, output: 10 } },
  { match: m => /o1|o3/i.test(m), price: { input: 15, output: 60 } },
  { match: m => /claude.*haiku/i.test(m), price: { input: 0.8, output: 4 } },
  { match: m => /claude.*opus/i.test(m), price: { input: 15, output: 75 } },
  { match: m => /claude/i.test(m), price: { input: 3, output: 15 } },
  { match: m => /deepseek/i.test(m), price: { input: 0.27, output: 1.1 } },
  { match: m => /qwen|通义/i.test(m), price: { input: 0.5, output: 2 } },
  { match: m => /kimi|moonshot/i.test(m), price: { input: 1, output: 3 } },
  { match: m => /doubao|豆包/i.test(m), price: { input: 0.3, output: 1 } },
]

const DEFAULT_PRICE: ModelPrice = { input: 1.0, output: 3.0 }

export function modelPrice(model: string): ModelPrice {
  return MODEL_PRICING.find(p => p.match(model || ''))?.price ?? DEFAULT_PRICE
}

/**
 * Returns null when StoryForge has no explicit price entry. Creative evidence
 * must not present the legacy fallback price as if it were the provider's bill.
 */
export function knownModelPrice(model: string): ModelPrice | null {
  return MODEL_PRICING.find(p => p.match(model || ''))?.price ?? null
}

/** 按 token 数 + 模型计算美元费用 */
export function computeCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = modelPrice(model)
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
}

export function computeKnownCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const p = knownModelPrice(model)
  return p
    ? (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
    : null
}

// ── 汇率（美元→人民币），可在页面调整，存 localStorage ──

const RATE_KEY = 'sf-usd-cny-rate'
const DEFAULT_RATE = 7.2

export function getUsdCnyRate(): number {
  const v = Number(localStorage.getItem(RATE_KEY))
  return v > 0 ? v : DEFAULT_RATE
}
export function setUsdCnyRate(rate: number) {
  localStorage.setItem(RATE_KEY, String(rate))
}

// ── 记录入口（client.ts 在拿到 usage 后调用，失败静默不影响主流程） ──

let _enabled = true
export function setUsageLoggingEnabled(on: boolean) { _enabled = on }

export async function recordUsage(entry: Omit<AIUsageEntry, 'id' | 'costUsd'> & { costUsd?: number }): Promise<void> {
  if (!_enabled) return
  try {
    const costUsd = entry.costUsd ?? computeCostUsd(entry.model, entry.inputTokens, entry.outputTokens)
    await db.aiUsageLog.add({ ...entry, costUsd })
  } catch (err) {
    console.warn('[UsageLog] 记录失败（不影响生成）:', err)
  }
}
