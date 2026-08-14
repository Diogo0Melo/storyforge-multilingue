/**
 * Phase 1 runtime i18n safeguards(registry 契约)
 *
 * 与 src/i18n/index.ts 的 Phase 1 运行时防护一一对应,只治理【视觉 UI】层;
 * AI 提示词/输出语言由 output-language gate 治理(output-language-gate.test.ts),
 * 本文件不重复覆盖,也不得碰 prompt 语言行为。
 *
 * ① 视觉回退策略:作者语言 pt-BR/en 缺失 key 时绝不静默落到 zh-CN 源文案
 *    (回退链为空 → 原样返回 key);zh-CN 仍是完整有效语言。
 * ② 缺失插值保护(missingInterpolationHandler):dev/test strict 抛错(确定性),
 *    生产分支 console.warn + 保留占位符(绝不崩溃)。两条分支的精确行为都在此定型。
 * ③ 命名空间就绪契约:就绪 = bundle 真实驻留(hasResourceBundle /
 *    hasLoadedNamespace)+ loadNamespaces 可把领域 ns 转为就绪;禁止用"提前翻译
 *    并缓存文本"的旁路伪造就绪——t() 必须每次现查资源(init 后新增 key 立即可见)。
 */
import { describe, it, expect, afterEach } from 'vitest'
import i18next from 'i18next'
import i18n, {
  PRELOAD_NS,
  SUPPORTED_LANGS,
  createBackendInstance,
  createMissingInterpolationHandler,
} from '../../src/i18n'

// 用例间复位语言,避免串扰(与 i18n.test.ts 同约定)
afterEach(async () => {
  if (i18n.language !== 'zh-CN') await i18n.changeLanguage('zh-CN')
})

describe('Phase 1 视觉回退策略:pt-BR/en 不落到 zh-CN', () => {
  it('zh-CN 仍是受支持的完整语言(在 SUPPORTED_LANGS 中且自身 key 可解析)', async () => {
    expect(SUPPORTED_LANGS.map(l => l.code)).toContain('zh-CN')
    await i18n.changeLanguage('zh-CN')
    i18n.addResource('zh-CN', 'common', '__zhOnlySafeguard', '仅中文文案')
    expect(i18n.t('common:__zhOnlySafeguard')).toBe('仅中文文案')
  })

  it.each(['pt-BR', 'en'] as const)('%s 缺失 key 原样返回,绝不渲染 zh-CN 文案', async (lng) => {
    // 只存在于 zh-CN 的探针 key(键名唯一,留驻不删,不污染其他用例)
    i18n.addResource('zh-CN', 'common', '__zhOnlyLeakProbe', '不应渗透给作者')
    await i18n.changeLanguage(lng)
    const out = i18n.t('common:__zhOnlyLeakProbe')
    expect(out).toBe('__zhOnlyLeakProbe')
    expect(out).not.toContain('不应渗透')
  })

  it('语言解析层级(pt-BR/en/zh-CN)只含自身,无跨语言视觉回退', () => {
    const utils = i18n.services.languageUtils
    for (const lng of ['pt-BR', 'en', 'zh-CN'] as const) {
      expect(utils.toResolveHierarchy(lng), `${lng} 的解析层级`).toEqual([lng])
    }
  })

  it('detector 兜底保留:未知语言 → pt-BR;变体归一不受影响', () => {
    const resolve = (lng: string) => i18n.services.languageUtils.getBestMatchFromCodes([lng])
    expect(resolve('ja')).toBe('pt-BR')
    expect(resolve('pt')).toBe('pt-BR')
    expect(resolve('zh-TW')).toBe('zh-CN')
    expect(resolve('en-US')).toBe('en')
  })

  it('真实 backend 路径:pt-BR 实例对 zh-only key 返回 key,zh-CN 实例正常命中', async () => {
    const pt = await createBackendInstance({ lng: 'pt-BR' })
    pt.addResource('zh-CN', 'common', '__zhOnlyBackendProbe', '仅中文')
    expect(pt.t('common:__zhOnlyBackendProbe')).toBe('__zhOnlyBackendProbe')
    expect(pt.t('common:save')).toBe('Salvar')

    const zh = await createBackendInstance({ lng: 'zh-CN' })
    expect(zh.t('common:save')).toBe('保存')
  })
})

describe('Phase 1 缺失插值保护(missingInterpolationHandler)', () => {
  const makeMatch = (text: string): RegExpExecArray => {
    const m = /\{\{(\w+)\}\}/.exec(text)
    if (!m) throw new Error('test fixture broken: no {{var}} in ' + text)
    return m
  }

  it('strict 分支(dev/test):抛错,消息包含变量名与源文案(精确定型)', () => {
    const strict = createMissingInterpolationHandler(true)
    expect(() => strict('Hello {{name}}!', makeMatch('Hello {{name}}!'), {} as never)).toThrow(
      '[i18n] missing interpolation variable "{{name}}" in "Hello {{name}}!"',
    )
  })

  it('生产分支:不抛错,原样返回占位符(与 i18next 缺省渲染一致)', () => {
    const lenient = createMissingInterpolationHandler(false)
    expect(lenient('Hello {{name}}!', makeMatch('Hello {{name}}!'), {} as never)).toBe('{{name}}')
  })

  it('单例在测试环境装配为 strict:真实 t() 漏传变量抛错,传参正常', async () => {
    i18n.addResource('zh-CN', 'common', '__interpSafeguard', '你好 {{name}}!')
    await i18n.changeLanguage('zh-CN')
    expect(() => i18n.t('common:__interpSafeguard')).toThrow(
      /missing interpolation variable "\{\{name\}\}"/,
    )
    expect(i18n.t('common:__interpSafeguard', { name: '世界' })).toBe('你好 世界!')
  })

  it('显式传空串不算缺失(i18next 契约:undefined 才触发钩子),strict 不抛错', async () => {
    i18n.addResource('zh-CN', 'common', '__interpEmpty', '甲{{x}}乙')
    await i18n.changeLanguage('zh-CN')
    expect(i18n.t('common:__interpEmpty', { x: '' })).toBe('甲乙')
  })

  it('生产装配的实例:漏传变量保留占位符、绝不崩溃,传参正常', async () => {
    const inst = i18next.createInstance()
    await inst.init({
      lng: 'en',
      fallbackLng: false,
      resources: { en: { common: { keep: 'A {{x}} B' } } },
      interpolation: { escapeValue: false },
      missingInterpolationHandler: createMissingInterpolationHandler(false),
    })
    expect(inst.t('common:keep')).toBe('A {{x}} B')
    expect(inst.t('common:keep', { x: 'ok' })).toBe('A ok B')
  })
})

describe('Phase 1 命名空间就绪契约(真实 backend,不缓存提前翻译)', () => {
  it('init 后 PRELOAD_NS 在当前语言就绪(bundle 驻留 + hasLoadedNamespace)', async () => {
    const inst = await createBackendInstance({ lng: 'pt-BR' })
    expect(inst.isInitialized).toBe(true)
    for (const ns of PRELOAD_NS) {
      expect(inst.hasResourceBundle('pt-BR', ns), `pt-BR/${ns} 未驻留`).toBe(true)
      expect(inst.hasLoadedNamespace(ns, { lng: 'pt-BR' }), `${ns} 未就绪`).toBe(true)
    }
    expect(inst.t('common:save')).toBe('Salvar')
  })

  it('就绪不依赖 zh-CN:pt-BR 实例无 zh-CN bundle 也能全预载组就绪', async () => {
    const inst = await createBackendInstance({ lng: 'pt-BR' })
    expect(inst.hasResourceBundle('zh-CN', 'common')).toBe(false)
    for (const ns of PRELOAD_NS) {
      expect(inst.hasLoadedNamespace(ns, { lng: 'pt-BR' })).toBe(true)
    }
  })

  it('zh-CN 独立就绪:无回退链也完成预载组加载且源文案可达', async () => {
    const inst = await createBackendInstance({ lng: 'zh-CN' })
    for (const ns of PRELOAD_NS) {
      expect(inst.hasResourceBundle('zh-CN', ns), `zh-CN/${ns} 未驻留`).toBe(true)
      expect(inst.hasLoadedNamespace(ns, { lng: 'zh-CN' })).toBe(true)
    }
    expect(inst.t('common:save')).toBe('保存')
  })

  it('领域 ns 加载前未就绪,loadNamespaces 后就绪且可翻译(useDomainT [ns,common] 契约)', async () => {
    const inst = await createBackendInstance({ lng: 'pt-BR' })
    expect(inst.hasLoadedNamespace('editor', { lng: 'pt-BR' })).toBe(false)
    // useDomainT(ns) 依赖 [ns, 'common'] 双命名空间就绪
    await inst.loadNamespaces(['editor', 'common'])
    expect(inst.hasLoadedNamespace('editor', { lng: 'pt-BR' })).toBe(true)
    expect(inst.hasLoadedNamespace('common', { lng: 'pt-BR' })).toBe(true)
    // 载入后翻译真实可达(非空壳、非原始 key)
    expect(inst.t('editor:notePanel.title')).toBe('📝 Notas')
  })

  it('t() 每次现查资源:init 后新增 key 立即可见(禁止提前翻译缓存伪造就绪)', async () => {
    const inst = await createBackendInstance({ lng: 'pt-BR' })
    // 新增前:缺失 → 原样返回 key
    expect(inst.t('common:__lateSafeguard')).toBe('__lateSafeguard')
    inst.addResource('pt-BR', 'common', '__lateSafeguard', 'chegou tarde')
    // 新增后:无需重建/重新 init,立即可见 → 翻译是现查而非快照
    expect(inst.t('common:__lateSafeguard')).toBe('chegou tarde')
    // 单例(eager resources 路径)同样现查
    i18n.addResource('zh-CN', 'common', '__lateSafeguardSingleton', '迟到文案')
    expect(i18n.t('common:__lateSafeguardSingleton')).toBe('迟到文案')
  })
})
