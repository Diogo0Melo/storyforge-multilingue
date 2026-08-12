/**
 * Vitest 全局 setup
 *
 * - 加载 fake-indexeddb 让 Dexie 在 Node 测试环境中可用
 * - 任何依赖 IndexedDB 的测试(stores / lifecycle / 反例测试)直接 import db 即可
 * - 同步初始化 i18n:把所有 locale JSON eager 载入并注入 initI18n,确保现有 205 个
 *   断言中文字符串的测试继续通过。
 */
// ── localStorage 兜底 stub ──
// 部分环境(本仓库 happy-dom + Node 实验性 accessor 组合)下全局 localStorage 为
// undefined,而 src/stores/ai-config.ts 等模块在 import 阶段就会读它。这里提供
// 内存版 stub;ESM 的 import 会先于本语句求值,但业务模块(测试文件的 import)
// 都在 setup 之后执行,所以 stub 一定先于 ai-config 生效。
if (typeof localStorage === 'undefined' || localStorage === null) {
  const store = new Map<string, string>()
  const stub = {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => { store.set(key, String(value)) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size },
  }
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      value: stub,
      configurable: true,
      writable: true,
    })
  } catch {
    ;(globalThis as Record<string, unknown>).localStorage = stub
  }
}

import 'fake-indexeddb/auto'
import { initI18n } from '../src/i18n'

// Vite test 环境支持 import.meta.glob;eager:true 让所有 JSON 同步可用。
const localeModules = import.meta.glob('../src/i18n/locales/*/*.json', {
  eager: true,
}) as Record<string, { default: unknown }>

function buildEagerResources() {
  const resources: Record<string, Record<string, unknown>> = {}
  for (const [path, mod] of Object.entries(localeModules)) {
    // path 形如 ../src/i18n/locales/pt-BR/common.json
    const match = path.match(/locales\/([^/]+)\/([^.]+)\.json$/)
    if (!match) continue
    const [, lng, ns] = match
    ;(resources[lng] ??= {})[ns] = mod.default
  }
  return resources
}

// 同步调用:传入 eager resources + 固定语言 + 关闭检测器 → init 立即 resolve。
void initI18n({
  resources: buildEagerResources(),
  lng: 'zh-CN',
  detection: false,
})
