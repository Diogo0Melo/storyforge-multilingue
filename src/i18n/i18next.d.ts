import 'i18next'
import type common from '../../public/locales/zh-CN/common.json'
import type nav from '../../public/locales/zh-CN/nav.json'
import type project from '../../public/locales/zh-CN/project.json'
import type editor from '../../public/locales/zh-CN/editor.json'
import type outline from '../../public/locales/zh-CN/outline.json'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    returnNull: false
    resources: {
      common: typeof common
      nav: typeof nav
      project: typeof project
      editor: typeof editor
      outline: typeof outline
    }
  }
}
