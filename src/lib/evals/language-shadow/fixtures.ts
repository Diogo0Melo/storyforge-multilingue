import type { LanguageShadowEvalFixture } from './types'

const free = (value: string) => ({ role: 'free-text' as const, value })
const preserve = (value: unknown) => ({ role: 'preserve' as const, value })
const unregistered = (value: unknown) => ({ value })

/** Synthetic, local-only fixtures. Their values are never copied to eval output. */
export const LANGUAGE_SHADOW_FIXTURES: readonly LanguageShadowEvalFixture[] = [
  // Codex
  { id: 'codex-proper-name', family: 'codex', targetLanguage: 'pt-BR', category: 'proper-name', fields: [preserve('Aurelia Nightfall')], expectedSignal: false },
  { id: 'codex-enum', family: 'codex', targetLanguage: 'pt-BR', category: 'enum', fields: [preserve('primary')], expectedSignal: false },
  { id: 'codex-id', family: 'codex', targetLanguage: 'pt-BR', category: 'id', fields: [preserve('codex-7f39-02')], expectedSignal: false },
  { id: 'codex-citation', family: 'codex', targetLanguage: 'pt-BR', category: 'citation', fields: [free('"The Moon Archive", DOI 10.1000/example')], expectedSignal: false },
  { id: 'codex-cjk-legitimate', family: 'codex', targetLanguage: 'zh-CN', category: 'legitimate-cjk', fields: [free('古老的月河在群山之间缓缓流淌，守护着城镇与远方的旅人。')], expectedSignal: false },
  { id: 'codex-zh-latin-mismatch', family: 'codex', targetLanguage: 'zh-CN', category: 'strong-mismatch', fields: [free('The ancient kingdom was guarded by a silent order with a long history.')], expectedSignal: true },
  { id: 'codex-cjk-isolated', family: 'codex', targetLanguage: 'pt-BR', category: 'isolated-cjk', fields: [free('東京')], expectedSignal: false },
  { id: 'codex-multilingual', family: 'codex', targetLanguage: 'en', category: 'multilingual', fields: [free('The quiet river crosses a cidade antiga and returns to the sea.')], expectedSignal: false },
  { id: 'codex-strong-mismatch', family: 'codex', targetLanguage: 'pt-BR', category: 'strong-mismatch', fields: [free('The ancient kingdom was guarded by a silent order with a long history.')], expectedSignal: true },
  // Reverse
  { id: 'reverse-proper-name', family: 'reverse', targetLanguage: 'en', category: 'proper-name', fields: [preserve('Mira Sol')], expectedSignal: false },
  { id: 'reverse-enum', family: 'reverse', targetLanguage: 'en', category: 'enum', fields: [preserve('chaotic')], expectedSignal: false },
  { id: 'reverse-id', family: 'reverse', targetLanguage: 'en', category: 'id', fields: [preserve('world-03')], expectedSignal: false },
  { id: 'reverse-citation', family: 'reverse', targetLanguage: 'en', category: 'citation', fields: [free('[Archive 12] "A short source"')], expectedSignal: false },
  { id: 'reverse-cjk-legitimate', family: 'reverse', targetLanguage: 'zh-CN', category: 'legitimate-cjk', fields: [free('月光照亮了古城的石墙，河流从北方穿过森林。')], expectedSignal: false },
  { id: 'reverse-cjk-isolated', family: 'reverse', targetLanguage: 'en', category: 'isolated-cjk', fields: [free('京都')], expectedSignal: false },
  { id: 'reverse-multilingual', family: 'reverse', targetLanguage: 'pt-BR', category: 'multilingual', fields: [free('The cidade is quiet e a new story begins beside the river.')], expectedSignal: false },
  { id: 'reverse-strong-mismatch', family: 'reverse', targetLanguage: 'en', category: 'strong-mismatch', fields: [free('A antiga cidade foi cercada por uma ordem silenciosa e os guardas esperaram durante muitos anos da história.')], expectedSignal: true },
  // Agents: one unregistered shape is retained to prove that no inference is made.
  { id: 'agents-proper-name', family: 'agents', targetLanguage: 'en', category: 'proper-name', fields: [preserve('Rook Vale')], expectedSignal: false },
  { id: 'agents-enum', family: 'agents', targetLanguage: 'en', category: 'enum', fields: [preserve('secondary')], expectedSignal: false },
  { id: 'agents-id', family: 'agents', targetLanguage: 'en', category: 'id', fields: [preserve('agent-node-19')], expectedSignal: false },
  { id: 'agents-citation', family: 'agents', targetLanguage: 'en', category: 'citation', fields: [free('"Quoted title", ISBN 978-1-4028-9462-6')], expectedSignal: false },
  { id: 'agents-cjk-legitimate', family: 'agents', targetLanguage: 'zh-CN', category: 'legitimate-cjk', fields: [free('山谷中的村庄沿着清澈的河流延伸，春天带来新的道路。')], expectedSignal: false },
  { id: 'agents-cjk-isolated', family: 'agents', targetLanguage: 'en', category: 'isolated-cjk', fields: [unregistered('東京')], expectedSignal: false },
  { id: 'agents-multilingual', family: 'agents', targetLanguage: 'en', category: 'multilingual', fields: [free('The hero walks through uma floresta and finds an old bridge.')], expectedSignal: false },
  { id: 'agents-strong-mismatch', family: 'agents', targetLanguage: 'pt-BR', category: 'strong-mismatch', fields: [free('The council gathered before dawn and discussed the future of the kingdom.')], expectedSignal: true },
]
