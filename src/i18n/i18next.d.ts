/**
 * i18next 类型增强:预注册所有命名空间,后续重构波次无需再编辑本文件。
 * 资源类型取自 pt-BR JSON(作为结构基准)。
 */
import 'i18next'

export interface I18nResources {
  common: typeof import('./locales/pt-BR/common.json')
  nav: typeof import('./locales/pt-BR/nav.json')
  shared: typeof import('./locales/pt-BR/shared.json')
  errors: typeof import('./locales/pt-BR/errors.json')
  'errors-lib': typeof import('./locales/pt-BR/errors-lib.json')
  settings: typeof import('./locales/pt-BR/settings.json')
  editor: typeof import('./locales/pt-BR/editor.json')
  outline: typeof import('./locales/pt-BR/outline.json')
  project: typeof import('./locales/pt-BR/project.json')
  worldview: typeof import('./locales/pt-BR/worldview.json')
  system: typeof import('./locales/pt-BR/system.json')
  simulation: typeof import('./locales/pt-BR/simulation.json')
  geography: typeof import('./locales/pt-BR/geography.json')
  character: typeof import('./locales/pt-BR/character.json')
  history: typeof import('./locales/pt-BR/history.json')
  pages: typeof import('./locales/pt-BR/pages.json')
  layout: typeof import('./locales/pt-BR/layout.json')
  'world-group': typeof import('./locales/pt-BR/world-group.json')
  codex: typeof import('./locales/pt-BR/codex.json')
  data: typeof import('./locales/pt-BR/data.json')
  facts: typeof import('./locales/pt-BR/facts.json')
  'node-flow': typeof import('./locales/pt-BR/node-flow.json')
  foreshadow: typeof import('./locales/pt-BR/foreshadow.json')
  relations: typeof import('./locales/pt-BR/relations.json')
  location: typeof import('./locales/pt-BR/location.json')
  'node-authoring': typeof import('./locales/pt-BR/node-authoring.json')
  items: typeof import('./locales/pt-BR/items.json')
  style: typeof import('./locales/pt-BR/style.json')
  retrieval: typeof import('./locales/pt-BR/retrieval.json')
  state: typeof import('./locales/pt-BR/state.json')
  guide: typeof import('./locales/pt-BR/guide.json')
  rules: typeof import('./locales/pt-BR/rules.json')
  product: typeof import('./locales/pt-BR/product.json')
  cultivation: typeof import('./locales/pt-BR/cultivation.json')
  agent: typeof import('./locales/pt-BR/agent.json')
  scene: typeof import('./locales/pt-BR/scene.json')
  timeline: typeof import('./locales/pt-BR/timeline.json')
}

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    returnNull: false
    resources: I18nResources
  }
}
