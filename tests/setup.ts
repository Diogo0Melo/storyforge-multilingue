/**
 * Vitest 全局 setup
 *
 * - 加载 fake-indexeddb 让 Dexie 在 Node 测试环境中可用
 * - 任何依赖 IndexedDB 的测试(stores / lifecycle / 反例测试)直接 import db 即可
 * - mock react-i18next：t() 直接返回 key，Trans 透传 children
 * - mock src/i18n/i18n：非 React 文件的 i18n.t() 也返回 key
 */
import 'fake-indexeddb/auto'
import { vi } from 'vitest'

vi.mock('react-i18next', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-i18next')>()
  return {
    ...mod,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { language: 'zh-CN', changeLanguage: () => Promise.resolve() },
    }),
    Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
    initReactI18next: { type: '3rdParty', init: () => {} },
  }
})

// 非 React 文件通过 import i18n from '../i18n/i18n' 使用翻译
// 必须 mock 掉真实初始化（HttpBackend + LanguageDetector 在 Node 测试中不可用）
vi.mock('../src/i18n/i18n', () => ({
  default: {
    t: (key: string) => key,
    language: 'zh-CN',
    changeLanguage: () => Promise.resolve(),
    on: () => {},
    off: () => {},
    exists: () => true,
  },
}))
