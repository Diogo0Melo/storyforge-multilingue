import { expect, test, type Page } from '@playwright/test'

/**
 * P0-1 regression gate: cold workspace mount must render translated labels.
 *
 * Background (.i18n-audit/report.md §3): the `layout` namespace was lazy and
 * absent from PRELOAD_NS, so on every COLD workspace mount Sidebar nav labels
 * (nav.*) and ContentTypeBadge labels (contentType.*) rendered as raw i18n
 * keys — buildNavTree()/buildModuleContentTypeDefinitions() resolve through
 * non-reactive getT() inside a memo keyed on `lang`, which never rebuilds
 * once the lazy namespace arrives (lang unchanged). Warm remount self-healed,
 * hiding the bug from warm-flow e2e specs.
 *
 * Each locale runs in a fresh context: pin sf_lang via localStorage (same
 * pattern as language-switch.spec.ts), create a project through the app flow
 * (a workspace needs an ID), then force a COLD mount with a full page.goto
 * back to the workspace URL and assert zero raw `nav.*` / `contentType.*`
 * keys survive in the sidebar and content-type badges.
 */

type Locale = 'pt-BR' | 'en' | 'zh-CN'

interface LocaleFlow {
  newProjectButton: string
  namePlaceholder: string
  createButton: string
  /** sectionProject / leafInfo / contentType.upstream.label for the locale */
  spotLabels: [string, string, string]
}

const FLOWS: Record<Locale, LocaleFlow> = {
  'pt-BR': {
    newProjectButton: '+ Novo projeto',
    namePlaceholder: 'Ex.: A Espada Além dos Portões',
    createButton: 'Criar',
    spotLabels: ['Informações da Obra', 'Visão Geral do Projeto', 'Configuração'],
  },
  en: {
    newProjectButton: '+ New project',
    namePlaceholder: 'E.g., Sword Beyond the Gates',
    createButton: 'Create',
    spotLabels: ['Project Info', 'Project Overview', 'Setting'],
  },
  'zh-CN': {
    newProjectButton: '+ 新建项目',
    namePlaceholder: '如：《剑出山门》',
    createButton: '创建',
    spotLabels: ['著作信息', '项目概况', '设定'],
  },
}

/**
 * Collect raw i18n keys leaked into the sidebar (nav.*) and any
 * ContentTypeBadge (contentType.*), including title/aria-label attributes
 * (compact badges carry label + description in `title`).
 */
async function collectLeakedI18nKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const pattern = /(?:layout:)?(?:nav|contentType)\.[A-Za-z][\w.]*/g
    const found = new Set<string>()

    const scan = (root: ParentNode) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (const m of (node.textContent ?? '').matchAll(pattern)) found.add(m[0])
      }
      for (const el of root.querySelectorAll('[title],[aria-label]')) {
        for (const attr of ['title', 'aria-label']) {
          for (const m of (el.getAttribute(attr) ?? '').matchAll(pattern)) found.add(m[0])
        }
      }
    }

    const sidebar = document.querySelector('aside')
    if (sidebar) scan(sidebar)
    for (const badge of document.querySelectorAll('[data-content-type]')) scan(badge)

    return [...found].sort()
  })
}

for (const locale of ['pt-BR', 'en', 'zh-CN'] as Locale[]) {
  test(`冷挂载工作区侧边栏与内容类型徽标无原始 i18n key(${locale})`, async ({ page }) => {
    const flow = FLOWS[locale]
    await page.addInitScript((lng) => {
      localStorage.setItem('sf_lang', lng)
      localStorage.setItem('storyforge_guide_completed', 'e2e')
    }, locale)

    // Warm phase: create a project through the app flow so a workspace ID exists.
    await page.goto('./projects')
    await page.getByRole('button', { name: flow.newProjectButton, exact: true }).click()
    await page.getByPlaceholder(flow.namePlaceholder).fill(`E2E 冷挂载 ${locale}`)
    await page.getByRole('button', { name: flow.createButton, exact: true }).click()
    await expect(page).toHaveURL(/\/storyforge\/workspace\/\d+$/)
    const workspaceUrl = page.url()

    // COLD mount: full navigation re-bootstraps the app (fresh i18n init),
    // unlike the warm client-side route transition above.
    await page.goto(workspaceUrl)

    // Wait until the sidebar nav rendered its leaf buttons (labels may still
    // be raw keys in the buggy state — we scan next).
    await expect(page.locator('aside nav button').first()).toBeVisible()

    // Zero leaked raw keys in sidebar + content-type badges.
    const leaked = await collectLeakedI18nKeys(page)
    expect(leaked, `cold mount leaked raw i18n keys: ${leaked.join(', ')}`).toEqual([])

    // Spot-assert translated labels (section / leaf / contentType.upstream).
    for (const label of flow.spotLabels) {
      await expect(
        page.locator('aside').getByText(label, { exact: true }).first(),
        `expected translated label "${label}" in sidebar (${locale})`,
      ).toBeVisible()
    }
  })
}
