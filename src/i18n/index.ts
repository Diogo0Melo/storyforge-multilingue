/**
 * StoryForge i18n 核心入口(react-i18next)
 *
 * - 单例 i18next,默认导出;使用 LanguageDetector + initReactI18next + resourcesToBackend。
 * - 资源加载:`import.meta.glob` 显式映射所有 locales/<lng>/<ns>.json → backend(lng, ns)。
 * - `initI18n(opts?)` 幂等守卫:已初始化直接返回;测试可注入 eager resources / 强制语言 /
 *   关闭检测器。
 * - `useDomainT(ns)` 组件钩子:自动叠加 common 命名空间,own-ns key 直写,common 用
 *   `common:key` 前缀。
 * - `getT()` 非 React 环境(stores/lib)取翻译。
 * - 切换语言时同步设置 `document.documentElement.lang`。
 *
 * Phase 1 运行时防护(仅视觉 UI 层,AI 提示词/输出语言仍由 output-language gate 治理):
 * - 作者语言 pt-BR/en 的视觉回退不再落到 zh-CN 源文案:缺失 key 按 i18next 缺省
 *   原样返回 key(三语 key 对齐 + value 翻译守卫保证健康态不命中;真命中时大声暴露)。
 *   zh-CN 仍是完整受支持语言,只是不再充当其他语言的视觉回退。
 * - 缺失插值变量由 `createMissingInterpolationHandler` 治理:dev/test 抛错(确定性
 *   暴露漏传),生产 console.warn + 原样保留占位符(绝不崩溃、绝不编造内容)。
 *
 * 升级说明:从 Phase 3.7 零依赖脚手架迁移到 react-i18next。旧 setLang/getLang/useTranslation
 * 已下线,调用方需改用 changeLanguage / i18n.language / useDomainT。
 */
import i18n from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import resourcesToBackend from 'i18next-resources-to-backend'
import type { I18nResources } from './i18next'

/** 支持的语言列表(与 detector / fallback 保持一致) */
export const SUPPORTED_LANGS = [
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '中文' },
] as const

export type SupportedLang = typeof SUPPORTED_LANGS[number]['code']

/**
 * 预加载的命名空间(根挂载 ErrorBoundary/Dialog/Toast/loading fallback 必需;
 * layout 为工作区冷挂载必需——Sidebar/ContentTypeBadge 的标签经 getT() 在
 * useMemo 里一次性求值,懒加载会导致首屏渲染原始 key 且 memo 不再重建)。
 */
export const PRELOAD_NS = ['common', 'nav', 'shared', 'errors', 'errors-lib', 'layout'] as const

/**
 * 通过 Vite glob 拿到所有 locale JSON 模块(懒加载)。键形如
 * `./locales/pt-BR/common.json`,值是无参函数,调用后返回动态 import Promise。
 */
const localeModules = import.meta.glob('./locales/*/*.json') as Record<
  string,
  () => Promise<{ default: unknown }>
>

/**
 * 真实懒加载 backend:(lng, ns) → 对应 locale JSON chunk。
 * 抽成模块级函数,供单例 initI18n 与回归测试用的 createBackendInstance 共用,
 * 保证两条路径的加载行为完全一致。
 */
function backendLoader(lng: string, ns: string) {
  const loader = localeModules[`./locales/${lng}/${ns}.json`]
  if (!loader) return Promise.reject(new Error(`missing locale ${lng}/${ns}`))
  return loader().then(mod => mod.default)
}

/**
 * Phase 1 runtime safeguard · 缺失插值保护钩子(missingInterpolationHandler)。
 *
 * locale 文案里的 `{{var}}` 在 t() 未收到对应变量(值为 undefined)时被调用。
 * i18next 缺省是静默保留占位符(skipOnVariables),这里把行为变成显式契约:
 *
 * - strict=true(dev/test):直接抛错——确定性暴露漏传变量,禁止静默渲染半成品文案。
 *   错误消息包含变量名与源文案,便于定位调用点或 locale 键。
 * - strict=false(生产):console.warn 并原样返回占位符(`match[0]`),渲染结果与
 *   i18next 缺省一致——绝不崩溃、绝不编造内容。
 *
 * 注意:i18next 对空串/ null 值不视为缺失(不触发本钩子),只有 undefined 触发。
 * 抽成工厂导出,便于测试分别断言两条分支的精确行为;buildConfig 按
 * `import.meta.env.PROD` 装配(与 output-language gate 的 dev/test 失败保险同款)。
 */
export function createMissingInterpolationHandler(strict: boolean) {
  return function missingInterpolationHandler(str: string, match: RegExpExecArray): string {
    const variable = match?.[1]?.trim() || '?'
    if (strict) {
      throw new Error(
        `[i18n] missing interpolation variable "{{${variable}}}" in "${str}". `
        + 'Pass the variable in the t() options, or remove the placeholder from the locale value.',
      )
    }
    console.warn(
      `[i18n] missing interpolation variable "{{${variable}}}" in "${str}" — placeholder kept (production safe mode)`,
    )
    return match?.[0] ?? ''
  }
}

/** 默认配置(测试可通过 opts 覆盖部分字段) */
function buildConfig(opts?: {
  resources?: Record<string, any>
  lng?: string
  detection?: boolean
}) {
  const useDetection = opts?.detection !== false
  return {
    ...(opts?.resources ? { resources: opts.resources } : {}),
    ...(opts?.lng ? { lng: opts.lng } : {}),
    // Phase 1 视觉回退策略:作者语言 pt-BR/en 缺 key 时绝不静默落到 zh-CN 源文案,
    // 各语言回退链为空 → 按 i18next 缺省原样返回 key。三语 key 对齐(i18n.test.ts)+
    // value 翻译守卫(i18n-values.test.ts)保证健康态不会命中;真命中时以原始 key
    // 大声暴露,而不是把中文渗透给 pt-BR/en 作者。zh-CN 仍是完整有效语言。
    // 注意:这只治理视觉 UI 层;AI 提示词/输出语言由 output-language gate 治理,不受影响。
    // default 分支同时是 detector 对未知浏览器语言的兜底 → pt-BR(默认语言)。
    fallbackLng: {
      'pt-BR': [],
      en: [],
      'zh-CN': [],
      default: ['pt-BR'],
    },
    supportedLngs: ['pt-BR', 'en', 'zh-CN'],
    // 只加载精确匹配的 locale 目录(locales/<lng>/);浏览器短码(pt、zh-TW)
    // 由 changeLanguage 内部的 getBestMatchFromCodes 归一到受支持代码。
    load: 'currentOnly' as const,
    defaultNS: 'common',
    // 注意:i18next 的 `preload` 是【语言】列表,不是命名空间。要在 init 时载入这些
    // 命名空间必须用 `ns`(defaultNS 只影响默认取值,不会反向补进加载列表)。
    // 设为 ns 后,init 会为当前语言及其 fallback 链载入这组命名空间;Phase 1 起
    // pt-BR/en 的回退链为空,故只载入当前语言自身(就绪语义见 tests/registry)。
    ns: [...PRELOAD_NS],
    interpolation: { escapeValue: false },
    // Phase 1 runtime safeguard:缺失插值变量。dev/test 抛错(确定性暴露漏传),
    // 生产 console.warn + 保留占位符(绝不崩溃)。见 createMissingInterpolationHandler。
    missingInterpolationHandler: createMissingInterpolationHandler(!import.meta.env.PROD),
    react: { useSuspense: false },
    ...(useDetection
      ? {
          detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: 'sf_lang',
          },
        }
      : {}),
  }
}

let initPromise: Promise<void> | null = null

/**
 * 幂等初始化 i18n。第二次调用直接返回首次的 Promise。
 *
 * @param opts.resources 测试注入的 eager 资源(跳过 backend)
 * @param opts.lng       强制语言(测试固定为 zh-CN)
 * @param opts.detection false 时禁用浏览器检测(测试环境)
 */
export async function initI18n(opts?: {
  resources?: Record<string, any>
  lng?: string
  detection?: boolean
}): Promise<void> {
  if (i18n.isInitialized) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    const config = buildConfig(opts)

    // 仅在未注入 eager resources 时使用 backend 懒加载
    if (!opts?.resources) {
      i18n.use(resourcesToBackend(backendLoader))
    }

    if (opts?.detection !== false) {
      i18n.use(LanguageDetector)
    }

    i18n.use(initReactI18next)

    await i18n.init(config)

    // 同步 document lang 属性与标题(SSR/Node 环境无 document,静默跳过)
    if (typeof document !== 'undefined') {
      document.documentElement.lang = i18n.language
      const applyTitle = () => {
        const title = i18n.t('common:appTitle')
        if (title && title !== 'common:appTitle') document.title = title
      }
      applyTitle()
      i18n.on('languageChanged', (lng: string) => {
        document.documentElement.lang = lng
        applyTitle()
      })
    }
  })()

  return initPromise
}

/**
 * 回归测试专用:构造一个挂载【真实懒加载 backend】的全新实例并完成 init。
 *
 * 与单例 initI18n 的区别:不走模块级单例守卫、不注入 eager resources、不挂
 * initReactI18next(测试不渲染 React)。目的是验证生产加载路径本身——即
 * `ns` 预加载 + fallback 链确实通过 backend 把资源载入,防止"配置了却没载入"
 * 这类被 eager-resource 单测掩盖的缺陷。
 */
export async function createBackendInstance(opts?: { lng?: string }) {
  const inst = i18n.createInstance()
  inst.use(resourcesToBackend(backendLoader))
  await inst.init(buildConfig({ lng: opts?.lng, detection: false }))
  return inst
}

/**
 * 领域翻译函数类型，用于在辅助函数签名中引用。
 *
 * TODO(i18n-type-scale) · 临时回退桥，不是长期契约：
 * - 此前本类型直接派生 `ReturnType<typeof useDomainT>['t']`（即 i18next 完整
 *   TFunction），在当前 locale 规模下触发 tsc 类型规模爆炸（递归展开）。
 * - 官方 `enableSelector: 'optimize'` 方案已调查并试证：产生 47 个 tsc 错误，
 *   其中 16 处 react-i18next `<Trans>` 调用点与 selector 模式不兼容（超出最小
 *   修复范围）而被回退；`<Trans>` 迁移完成前不得重试 selector 模式。
 * - 故此处改为轻量可调用契约，仅覆盖仓库现有调用形态：字符串 key（含
 *   `common:` 前缀）、插值 options 对象、i18next defaultValue 第二参。并在
 *   useDomainT 返回边界做一次显式收窄——运行时仍是 i18next/react-i18next
 *   提供的真实翻译函数，行为完全不变。无需 `any`：该签名已覆盖全部现存调用点。
 * - key 安全不依赖此静态类型：三语 locale 对齐（tests/registry/i18n.test.ts）、
 *   value 翻译守卫（tests/registry/i18n-values.test.ts）、namespace 用法与
 *   display-projection 注册表测试（tests/regression/R-i18n-display-projections.test.ts）
 *   仍是实际守卫。
 * - 退出条件：`<Trans>`/selector 调用点全部迁移完成后，删除本桥并恢复从
 *   useDomainT 派生精确类型。
 */
export type DomainTFunction = (
  key: string,
  optionsOrDefaultValue?: Record<string, unknown> | string,
  options?: Record<string, unknown>,
) => string

/**
 * 领域翻译钩子。组件只传自己的 ns,common 自动叠加。
 * own-ns key 直写,common key 用 `common:save` 形式。
 */
export function useDomainT(ns: keyof I18nResources) {
  const { t, ready, i18n: instance } = useTranslation([ns, 'common'])
  return {
    // 临时回退桥：仅在类型层收窄为 DomainTFunction（见其 TODO(i18n-type-scale)），
    // 运行时仍是 react-i18next 提供的真实 t 函数。
    t: t as unknown as DomainTFunction,
    ready,
    lang: instance.language,
    changeLanguage: instance.changeLanguage.bind(instance),
  }
}

/** 非 React 代码(stores/lib)获取翻译函数。使用前请确保 initI18n 已完成。 */
export function getT() {
  return i18n.t.bind(i18n)
}

/**
 * 非 React 代码(stores/lib)获取语言感知的列表连接格式化器。
 * React 组件内应优先用 useDomainT().lang 自行 useMemo 实例。
 */
export function getShortListFormatter(): Intl.ListFormat {
  return new Intl.ListFormat(i18n.language, { type: 'conjunction', style: 'short' })
}

/**
 * WS-2/G1: 返回当前 UI 语言,钳位到 SUPPORTED_LANGS;未知值回退 'pt-BR'。
 * 模块级 i18n 实例,React 内外均可安全调用。
 */
export function getSupportedUiLang(): SupportedLang {
  return (SUPPORTED_LANGS.some(l => l.code === i18n.language)
    ? i18n.language
    : 'pt-BR') as SupportedLang
}

export default i18n
