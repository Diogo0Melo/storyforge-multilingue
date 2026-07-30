import 'i18next'
import type { FlatResources } from './generated-resources'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    returnNull: false
    resources: FlatResources
  }
}
