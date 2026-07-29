import 'i18next'
import type common from '../../public/locales/zh-CN/common.json'
import type nav from '../../public/locales/zh-CN/nav.json'
import type project from '../../public/locales/zh-CN/project.json'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    returnNull: false
    resources: {
      common: typeof common
      nav: typeof nav
      project: typeof project
    }
  }
}
