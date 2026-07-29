import 'i18next'
import type common from '../../public/locales/zh-CN/common.json'
import type nav from '../../public/locales/zh-CN/nav.json'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    returnNull: false
    resources: {
      common: typeof common
      nav: typeof nav
    }
  }
}
