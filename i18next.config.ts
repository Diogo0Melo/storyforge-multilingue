import { defineConfig } from 'i18next-cli'

export default defineConfig({
  locales: ['zh-CN', 'pt-BR'],
  extract: {
    input: ['src/**/*.{ts,tsx}'],
    output: 'public/locales/{{language}}/{{namespace}}.json',
    functions: ['t'],
    useTranslationNames: ['useTranslation'],
    transComponents: ['Trans'],
    defaultNS: 'common',
    nsSeparator: ':',
    keySeparator: '.',
    pluralSeparator: '_',
    contextSeparator: '_',
    removeUnusedKeys: false,
    sort: true,
    indentation: 2,
    primaryLanguage: 'zh-CN',
    secondaryLanguages: ['pt-BR'],
  },
})
