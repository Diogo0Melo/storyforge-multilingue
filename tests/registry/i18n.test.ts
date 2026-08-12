/**
 * i18n 核心测试(react-i18next)
 *
 * 验证:
 * ① 三语言 × 全命名空间 key 对齐(CLRD 复数归一化)
 * ② fallback 链(en → zh-CN;缺失返回 key 本身)
 * ③ detector 映射(pt / pt-PT → pt-BR;zh-TW → zh-CN)
 * ④ 插值 + 复数烟雾
 * ⑤ detector 持久化(localStorage sf_lang)
 *
 * 注意:i18next 的 key 语法是 `ns:key`(冒号跨命名空间,点号是 ns 内嵌套)。
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import i18n, { initI18n, SUPPORTED_LANGS } from '../../src/i18n'

/** 全部已注册命名空间(与 i18next.d.ts 保持一致) */
const ALL_NS = [
  'common', 'nav', 'shared', 'errors', 'errors-lib',
  'settings', 'editor', 'outline', 'project', 'worldview', 'system',
  'simulation', 'geography', 'character', 'history', 'pages', 'layout',
  'world-group', 'codex', 'data', 'facts', 'node-flow', 'foreshadow',
  'relations', 'location', 'node-authoring', 'items', 'style',
  'retrieval', 'state', 'guide', 'rules', 'product', 'cultivation',
  'agent', 'scene', 'timeline',
] as const

const LANGS = ['pt-BR', 'en', 'zh-CN'] as const

/**
 * 把嵌套 JSON 扁平化为点路径。CLDR 复数后缀按语言归一化:
 * - en / pt-BR: `_one` + `_other` → base key(同一逻辑键的两个复数类别)
 * - zh-CN: CLDR 只有 `other` 类别 → 仅剥离 `_other` 归一到 base key;
 *   任何 zh `_one` 键都是非法的(运行时永远不会命中),会原样保留
 *   并在三语对齐检查中作为 extra key 暴露出来。
 */
function flattenKeys(obj: unknown, lang: string, prefix = ''): Set<string> {
  const keys = new Set<string>()
  if (!obj || typeof obj !== 'object') return keys
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const full = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const nested of flattenKeys(v, lang, full)) keys.add(nested)
    } else {
      const normalized = lang === 'zh-CN'
        ? full.replace(/_other$/, '')
        : full.replace(/_(?:one|other)$/, '')
      keys.add(normalized)
    }
  }
  return keys
}

beforeAll(async () => {
  await initI18n()
})

// 每个用例结束后把语言复位到 setup 的初始值,避免用例间串扰
afterEach(async () => {
  if (i18n.language !== 'zh-CN') await i18n.changeLanguage('zh-CN')
})

describe('i18n core', () => {
  it('SUPPORTED_LANGS 包含三种语言', () => {
    expect(SUPPORTED_LANGS.map(l => l.code).sort()).toEqual(['en', 'pt-BR', 'zh-CN'])
  })

  it.each(ALL_NS)('ns=%s 三语言 key 对齐(CLRD 归一)', (ns) => {
    const sets = LANGS.map(lang => {
      const bundle = i18n.getResourceBundle(lang, ns)
      return flattenKeys(bundle, lang)
    })
    const baseline = sets[0]
    for (let i = 1; i < sets.length; i++) {
      const missing = [...baseline].filter(k => !sets[i].has(k))
      const extra = [...sets[i]].filter(k => !baseline.has(k))
      expect(
        { missing, extra },
        `${LANGS[i]} vs ${LANGS[0]} mismatch in ns=${ns}`,
      ).toEqual({ missing: [], extra: [] })
    }
  })

  it('fallback: en 缺失时回退到 zh-CN 值', async () => {
    await i18n.changeLanguage('en')
    // common:save 在 en 存在,直接命中
    expect(i18n.t('common:save')).toBe('Save')
    // 构造一个只存在于 zh-CN 的 key(键名唯一,留驻不删,不污染其他用例)
    i18n.addResource('zh-CN', 'common', '__testOnlyZhFallback', '仅中文')
    expect(i18n.t('common:__testOnlyZhFallback')).toBe('仅中文')
  })

  it('key 全局缺失时返回 key 本身', async () => {
    await i18n.changeLanguage('en')
    expect(i18n.t('nonexistent.key.nowhere')).toBe('nonexistent.key.nowhere')
  })

  it('detector 映射:pt / pt-PT → pt-BR;zh-TW → zh-CN;未知语言 → pt-BR', () => {
    // getBestMatchFromCodes 把浏览器短码/变体归一到受支持代码;
    // 完全不支持的语言走 fallbackLng.default → pt-BR(默认语言)
    const services = i18n.services
    const resolve = (lng: string) => services.languageUtils.getBestMatchFromCodes([lng])
    expect(resolve('pt')).toBe('pt-BR')
    expect(resolve('pt-PT')).toBe('pt-BR')
    expect(resolve('en-US')).toBe('en')
    expect(resolve('zh-TW')).toBe('zh-CN')
    expect(resolve('ja')).toBe('pt-BR')
  })

  it('插值 {{var}} 工作', async () => {
    i18n.addResource('en', 'common', '__interp', 'Hello {{name}}!')
    await i18n.changeLanguage('en')
    expect(i18n.t('common:__interp', { name: 'World' })).toBe('Hello World!')
  })

  it('复数:en/pt-BR 区分 _one/_other;zh-CN 始终 _other', async () => {
    i18n.addResource('en', 'common', '__item_one', '{{count}} item')
    i18n.addResource('en', 'common', '__item_other', '{{count}} items')
    i18n.addResource('pt-BR', 'common', '__item_one', '{{count}} item')
    i18n.addResource('pt-BR', 'common', '__item_other', '{{count}} itens')
    i18n.addResource('zh-CN', 'common', '__item_other', '{{count}} 项')

    await i18n.changeLanguage('en')
    expect(i18n.t('common:__item', { count: 1 })).toBe('1 item')
    expect(i18n.t('common:__item', { count: 2 })).toBe('2 items')

    await i18n.changeLanguage('pt-BR')
    expect(i18n.t('common:__item', { count: 1 })).toBe('1 item')
    expect(i18n.t('common:__item', { count: 5 })).toBe('5 itens')

    await i18n.changeLanguage('zh-CN')
    expect(i18n.t('common:__item', { count: 1 })).toBe('1 项')
    expect(i18n.t('common:__item', { count: 99 })).toBe('99 项')
  })

  it('detector 持久化:changeLanguage 写入 localStorage sf_lang', async () => {
    // 共享实例在测试里 detection:false,所以用独立实例验证 detector 的
    // localStorage 缓存行为(配置与生产一致)。
    const inst = i18next.createInstance()
    inst.use(LanguageDetector)
    await inst.init({
      supportedLngs: ['pt-BR', 'en', 'zh-CN'],
      fallbackLng: 'pt-BR',
      defaultNS: 'common',
      interpolation: { escapeValue: false },
      detection: {
        order: ['localStorage'],
        caches: ['localStorage'],
        lookupLocalStorage: 'sf_lang',
      },
    })
    inst.addResourceBundle('pt-BR', 'common', { hi: 'oi' }, true, true)
    inst.addResourceBundle('en', 'common', { hi: 'hi' }, true, true)

    localStorage.removeItem('sf_lang')
    await inst.changeLanguage('pt-BR')
    expect(localStorage.getItem('sf_lang')).toBe('pt-BR')
    await inst.changeLanguage('en')
    expect(localStorage.getItem('sf_lang')).toBe('en')
    localStorage.removeItem('sf_lang')
  })
})
