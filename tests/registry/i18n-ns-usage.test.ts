/**
 * i18n 命名空间静态纪律检查
 *
 * 扫描 src/components/**, src/pages/**, src/App.tsx 中的 useDomainT / useTranslation 调用,
 * 断言:
 *   (a) 每个 ns 参数都是字符串字面量,且属于已注册命名空间集合;
 *   (b) 该字面量要么匹配文件自身领域(src/components/<domain>/** → <domain>),
 *       要么属于预加载集合(common/nav/shared/errors/errors-lib/layout)。
 *
 * 尚未迁移的文件不会调用这些钩子,因此当前通过;重构波次引入新调用时自动约束。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SRC_ROOT = join(process.cwd(), 'src')

/** 与 i18next.d.ts / ALL_NS 保持一致 */
const REGISTERED_NS = new Set([
  'common', 'nav', 'shared', 'errors', 'errors-lib',
  'settings', 'editor', 'outline', 'project', 'worldview', 'system',
  'simulation', 'geography', 'character', 'history', 'pages', 'layout',
  'world-group', 'codex', 'data', 'facts', 'node-flow', 'foreshadow',
  'relations', 'location', 'node-authoring', 'items', 'style',
  'retrieval', 'state', 'guide', 'rules', 'product', 'cultivation',
  'agent', 'scene', 'timeline',
])

const PRELOADED_NS = new Set(['common', 'nav', 'shared', 'errors', 'errors-lib', 'layout'])

/**
 * 跨域 ns 显式入口白名单(架构守卫认可,带理由与复审边界)。
 * CONTEXT_SOURCES.labelKey 作为 UI 侧来源名的单一事实源统一登记在 outline 域
 * (outline:contextSources.*);node-flow / node-authoring 的来源选择器复用同一份
 * 注册表翻译,避免平行维护多套来源文案。
 * PromptRunPanel 是创作区调参浮窗(shared 域),但需渲染 settings ns 的系统提示词
 * 种子名与参数文案(promptTemplates.* / promptParams.*);经 own-ns 钩子
 * useDomainT('settings') 保证 bundle 加载,避免未访问过设置页的路由回退中文
 * (Gate 5 · S1)。新增条目前必须经架构复审。
 */
const CROSS_NS_ALLOWLIST: Record<string, ReadonlySet<string>> = {
  // Settings exposes the shared agent reliability labels through an explicit
  // cross-domain entry; it is not a namespace fallback.
  'components/settings/AITaskRoutingSection.tsx': new Set(['agent']),
  // Workspace-level candidate/task status messages are owned by the agent ns.
  'pages/WorkspacePage.tsx': new Set(['agent']),
  'components/node-flow/NodeInspector.tsx': new Set(['outline']),
  'components/node-authoring/NodeAuthoringWorkspace.tsx': new Set(['outline']),
  'components/shared/PromptRunPanel.tsx': new Set(['settings']),
  // Phase-3 canonical product projections: the text-game players/workbenches
  // read the simulation ns by design; local label copies are not permitted.
  'components/text-game/StoryGamePlayer.tsx': new Set(['simulation']),
  'components/text-game/StoryGameWorkbench.tsx': new Set(['simulation']),
  'components/text-game/AdventureGamePlayer.tsx': new Set(['simulation']),
  'components/text-game/AdventureGameWorkbench.tsx': new Set(['simulation']),
  'components/text-game/AvgGamePlayer.tsx': new Set(['simulation']),
  'components/text-game/AvgGameWorkbench.tsx': new Set(['simulation']),
}

function slashRelative(absPath: string): string {
  return relative(SRC_ROOT, absPath).split(sep).join('/')
}

function collectTargets(root: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(root)) {
    const full = join(root, entry)
    const st = statSync(full)
    if (st.isDirectory()) files.push(...collectTargets(full))
    else if (/\.(?:tsx?|jsx?)$/.test(entry)) files.push(full)
  }
  return files
}

function targetFiles(): string[] {
  const out: string[] = []
  out.push(...collectTargets(join(SRC_ROOT, 'components')))
  out.push(...collectTargets(join(SRC_ROOT, 'pages')))
  const app = join(SRC_ROOT, 'App.tsx')
  try {
    if (statSync(app).isFile()) out.push(app)
  } catch { /* optional */ }
  return out
}

/**
 * 提取文件中所有 useDomainT('ns') / useTranslation('ns') / useTranslation(['ns', ...])
 * 的字符串字面量 ns。简化正则足够(我们只关心字面量,变量传参视为违规由 reviewer 捕获)。
 */
function extractNsArgs(source: string): Array<{ ns: string; line: number }> {
  const results: Array<{ ns: string; line: number }> = []
  const lines = source.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // useDomainT('ns') or useDomainT("ns")
    for (const m of line.matchAll(/useDomainT\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      results.push({ ns: m[1], line: i + 1 })
    }
    // useTranslation('ns') or useTranslation(["ns", ...])
    for (const m of line.matchAll(/useTranslation\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      results.push({ ns: m[1], line: i + 1 })
    }
    for (const m of line.matchAll(/useTranslation\(\s*\[([^\]]+)\]/g)) {
      const inner = m[1]
      for (const lit of inner.matchAll(/['"]([^'"]+)['"]/g)) {
        results.push({ ns: lit[1], line: i + 1 })
      }
    }
  }
  return results
}

function expectedDomainForFile(absPath: string): string | null {
  const rel = relative(SRC_ROOT, absPath).split(sep)
  if (rel[0] === 'components' && rel.length >= 2) return rel[1]
  if (rel[0] === 'pages') return 'pages'
  if (rel[0] === 'App.tsx') return 'pages'
  return null
}

describe('i18n namespace static discipline', () => {
  it('所有 useDomainT/useTranslation ns 字面量均合法且归属正确', () => {
    const violations: string[] = []
    for (const file of targetFiles()) {
      const source = readFileSync(file, 'utf8')
      const args = extractNsArgs(source)
      const domain = expectedDomainForFile(file)
      for (const { ns, line } of args) {
        if (!REGISTERED_NS.has(ns)) {
          violations.push(`${relative(process.cwd(), file)}:${line} unknown ns "${ns}"`)
          continue
        }
        if (PRELOADED_NS.has(ns)) continue // 预加载集豁免
        if (CROSS_NS_ALLOWLIST[slashRelative(file)]?.has(ns)) continue // 显式跨域入口豁免
        if (domain && ns !== domain) {
          violations.push(
            `${relative(process.cwd(), file)}:${line} ns "${ns}" does not match domain "${domain}"`,
          )
        }
      }
    }
    expect(violations).toEqual([])
  })
})
