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
    // 缺 key 时降级到 zh-CN 源文案(zh-CN 自身缺失则原样返回 key)。
    // default 分支同时是 detector 对未知浏览器语言的兜底 → pt-BR(默认语言)。
    fallbackLng: {
      'pt-BR': ['zh-CN'],
      en: ['zh-CN'],
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
    // 设为 ns 后,init 会为当前语言及其 fallback 链(→zh-CN)都载入这组命名空间。
    ns: [...PRELOAD_NS],
    interpolation: { escapeValue: false },
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

/** 领域翻译函数类型，用于在辅助函数签名中引用。 */
export type DomainTFunction = ReturnType<typeof useDomainT>['t']

/**
 * 领域翻译钩子。组件只传自己的 ns,common 自动叠加。
 * own-ns key 直写,common key 用 `common:save` 形式。
 */
export function useDomainT(ns: keyof I18nResources) {
  const { t, ready, i18n: instance } = useTranslation([ns, 'common'])
  return {
    t,
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

export default i18n
