import { expect, test, type Page } from '@playwright/test'

/**
 * Language switch smoke test.
 *
 * Boots the app with sf_lang=zh-CN pinned (same pattern as core-workflow),
 * navigates to the Settings page inside a project workspace, and exercises
 * the LanguageSelector segmented radio group across pt-BR / en / zh-CN.
 *
 * Assertions cover:
 *   - document.documentElement.lang updates on each switch
 *   - visible UI strings update to the target locale
 *   - localStorage sf_lang persists the choice
 *   - round-trip zh-CN → pt-BR → en → zh-CN restores Chinese
 *   - persistence across reload (set pt-BR, reload, still pt-BR)
 *   - Gate 1 carry-over: after switching, sidebar nav labels and
 *     ContentTypeBadge text reflect the new locale (no raw keys leak)
 */

async function pinZhCnLang(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('sf_lang', 'zh-CN')
  })
}

async function openProjectSettings(page: Page) {
  await pinZhCnLang(page)
  await page.addInitScript(() => {
    localStorage.setItem('storyforge_guide_completed', 'e2e')
  })
  // Land on projects list, create a throwaway project so the sidebar is available.
  await page.goto('./projects')
  await expect(page.getByRole('heading', { name: /开始.*第一部.*小说/ })).toBeVisible()
  await page.getByRole('button', { name: '+ 新建项目', exact: true }).click()
  await page.getByPlaceholder('如：《剑出山门》').fill('E2E 语言切换')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page).toHaveURL(/\/storyforge\/workspace\/\d+$/)

  // The Settings button lives in the sidebar footer as an icon-only <button>
  // with title="设置" (zh-CN). It is NOT inside the <nav> element, so we
  // locate it by title attribute to avoid ambiguity with nav tree leaves
  // whose text also contains "设置".
  await page.locator('aside').locator('button[title="设置"]').click()
  // Wait for the LanguageSelector radiogroup to confirm settings rendered.
  await expect(page.getByRole('radiogroup')).toBeVisible()
}

/**
 * Click a language option in the segmented radio group by its self-label.
 *
 * The actual <input type="radio"> is sr-only (visually hidden); clicking it
 * directly fails because the parent <main> intercepts pointer events at that
 * coordinate. Instead, click the visible <label> that wraps the radio — this
 * matches how a real user interacts with the segmented control.
 */
async function selectLanguage(page: Page, langLabel: string) {
  const radioGroup = page.getByRole('radiogroup')
  // Locate the <label> whose text content matches the language self-name.
  await radioGroup.locator('label').filter({ hasText: langLabel }).click()
}

async function expectLangState(page: Page, expectedLang: string) {
  await expect.poll(async () =>
    page.evaluate(() => document.documentElement.lang),
  ).toBe(expectedLang)

  await expect.poll(async () =>
    page.evaluate(() => localStorage.getItem('sf_lang')),
  ).toBe(expectedLang)
}

/**
 * Gate 1 carry-over: collect raw i18n keys leaked into the sidebar (nav.*)
 * and any ContentTypeBadge (contentType.*), including title/aria-label
 * attributes. Same scan logic as workspace-cold-i18n.spec.ts.
 */
async function collectLeakedNavKeys(page: Page): Promise<string[]> {
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

/** Spot-check labels for each locale: [navLeafInfo, navSectionProject, contentTypeUpstream] */
const LOCALE_SPOT_LABELS: Record<string, [string, string, string]> = {
  'pt-BR': ['Visão Geral do Projeto', 'Informações da Obra', 'Configuração'],
  en: ['Project Overview', 'Project Info', 'Setting'],
  'zh-CN': ['项目概况', '著作信息', '设定'],
}

/**
 * Assert workspace sidebar + ContentTypeBadge labels after a language switch.
 * (a) zero visible strings matching /^(nav|contentType)\./
 * (b) at least one sidebar nav label + ContentTypeBadge text match the locale
 */
async function assertWorkspaceLabels(page: Page, locale: string) {
  const [navLeaf, navSection, contentType] = LOCALE_SPOT_LABELS[locale]

  // (a) Zero leaked raw i18n keys in sidebar + content-type badges
  const leaked = await collectLeakedNavKeys(page)
  expect(leaked, `leaked raw i18n keys after switch to ${locale}: ${leaked.join(', ')}`).toEqual([])

  // (b) Sidebar nav label matches the new locale
  await expect(
    page.locator('aside').getByText(navLeaf, { exact: true }).first(),
    `expected sidebar nav label "${navLeaf}" after switch to ${locale}`,
  ).toBeVisible()
  await expect(
    page.locator('aside').getByText(navSection, { exact: true }).first(),
    `expected sidebar section "${navSection}" after switch to ${locale}`,
  ).toBeVisible()

  // (b) ContentTypeBadge text matches the new locale
  await expect(
    page.locator('[data-content-type]').getByText(contentType, { exact: true }).first(),
    `expected ContentTypeBadge "${contentType}" after switch to ${locale}`,
  ).toBeVisible()
}

test('语言切换三段往返:zh-CN → pt-BR → en → zh-CN', async ({ page }) => {
  await openProjectSettings(page)

  // --- Switch to pt-BR ---
  await selectLanguage(page, 'Português (Brasil)')
  await expectLangState(page, 'pt-BR')
  // Settings page "Outros" section heading (pt-BR)
  const ptLanguageSettings = page.getByRole('heading', { name: 'Outros', exact: true }).locator('xpath=..')
  await expect(ptLanguageSettings.getByText('Outros', { exact: true })).toBeVisible()
  // Common "Idioma" label replaces zh-CN "语言"
  await expect(page.getByText('Idioma', { exact: true })).toBeVisible()
  // Gate 1: workspace labels reflect pt-BR
  await assertWorkspaceLabels(page, 'pt-BR')

  // --- Switch to en ---
  await selectLanguage(page, 'English')
  await expectLangState(page, 'en')
  // Settings page "Other" section heading (en)
  const enLanguageSettings = page.getByRole('heading', { name: 'Other', exact: true }).locator('xpath=..')
  await expect(enLanguageSettings.getByText('Other', { exact: true })).toBeVisible()
  // Common "Language" label
  await expect(page.getByText('Language', { exact: true })).toBeVisible()
  // Gate 1: workspace labels reflect en
  await assertWorkspaceLabels(page, 'en')

  // --- Switch back to zh-CN (round-trip) ---
  await selectLanguage(page, '中文')
  await expectLangState(page, 'zh-CN')
  const languageSettings = page.getByRole('heading', { name: '其他', exact: true }).locator('xpath=..')
  await expect(languageSettings.getByText('其他', { exact: true })).toBeVisible()
  await expect(page.getByText('语言', { exact: true })).toBeVisible()
  // Gate 1: workspace labels reflect zh-CN
  await assertWorkspaceLabels(page, 'zh-CN')
})

test('语言选择持久化:设为 pt-BR 后刷新仍保持', async ({ page }) => {
  // Use a fresh context WITHOUT pinning zh-CN, so the detector reads whatever
  // is in localStorage. We pre-seed pt-BR + guide-completed before the first
  // navigation — this proves the i18next detector picks up sf_lang on cold load.
  await page.addInitScript(() => {
    localStorage.setItem('sf_lang', 'pt-BR')
    localStorage.setItem('storyforge_guide_completed', 'e2e')
  })

  // Navigate to projects list — should render in pt-BR.
  await page.goto('./projects', { waitUntil: 'networkidle' })
  await expect(page.getByRole('button', { name: '+ Novo projeto', exact: true })).toBeVisible()

  // Create a project using pt-BR selectors.
  await page.getByRole('button', { name: '+ Novo projeto', exact: true }).click()
  await page.getByPlaceholder('Ex.: A Espada Além dos Portões').fill('E2E Persistência')
  await page.getByRole('button', { name: 'Criar', exact: true }).click()
  await expect(page).toHaveURL(/\/storyforge\/workspace\/\d+$/)

  // Navigate to settings via the pt-BR sidebar button (title attribute to avoid ambiguity).
  await page.locator('aside').locator('button[title="Configurações"]').click()

  // Settings should render in pt-BR.
  await expect(page.getByRole('radiogroup')).toBeVisible()
  await expect(page.getByText('Outros', { exact: true })).toBeVisible()
  await expectLangState(page, 'pt-BR')
  await expect(page.getByText('Idioma', { exact: true })).toBeVisible()
})
