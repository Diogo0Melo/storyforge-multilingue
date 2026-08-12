import type { ComponentType } from 'react'
import {
  FileText, Library, Globe, Mountain, Users2, Sparkles,
  UserCircle, UsersRound, User, Footprints, Network,
  Ruler, BookOpen, FilePen, Eye,
  FileCog, History, Upload, Download, Settings,
  Map, ClipboardList, GitBranch, Clock, MapPin, Scale,
  Drama, Package, CalendarClock, ScanSearch, Coins, Feather, Database, TrendingUp, Workflow,
  Gamepad2,
} from 'lucide-react'
import { getT } from '../../i18n'

/**
 * Phase 4 起的侧边栏模块 ID。
 * 一个叶子 = 一个 panel。新加的占位叶子也在这里登记。
 */
export type SidebarModule =
  // 著作信息
  | 'info'
  | 'references'
  | 'inspiration'              // Phase 26.4 — 灵感反推

  // 设定库
  | 'world-overview'        // Phase 25.4 — 世界总览（多世界）
  | 'world-rules'           // Phase 32 — 真实与幻想
  | 'worldview-origin'      // 占位 (P5)
  | 'worldview-natural'     // 占位 (P5)
  | 'worldview-humanity'    // 占位 (P6)
  | 'story-design'          // = 旧 story-core
  | 'characters'            // 角色生成
  | 'characters-main'       // 主要角色
  | 'characters-minor'      // 占位 (P7)
  | 'characters-npc'        // 占位 (P7)
  | 'characters-extra'      // 占位 (P7)
  | 'relations'             // 关系网
  | 'geography'             // 地理环境（legacy）
  | 'locations'             // 重要地点（Phase 25.3）
  | 'history'               // 历史年表
  // 'codex' 独立侧栏入口已于 C4 移除：词条改在「自然环境」「人文环境」面板内就地编辑

  // 创作区
  | 'rules'
  | 'outline'
  | 'character-driven-plot'  // Phase 26.3 — 角色驱动剧情
  | 'visual-workflows'       // FLOW-1 — 可视化节点创作工作流
  | 'rag-library'            // RAG-1 — 可见资料与检索管理
  | 'simulation-runtime'     // SIM-1 — NPC/跑团/角色聊天共享运行时
  | 'detailed-outline'      // 占位 (P8)
  | 'chapters-list'         // 占位 (P8)
  | 'editor'
  | 'foreshadow'
  | 'style-learning'        // FB-5 自适应文风学习

  // 作品学习（一级）
  | 'master-studies'

  // 提示词库（一级）
  | 'prompts'

  // 设置区
  | 'version-history'       // 占位 (P9)
  | 'import-doc'            // 占位 (P10)
  | 'export'                // = DataManagementPanel (export 入口)
  | 'usage-stats'           // = UsageStatsPage（AI 消耗统计）
  | 'settings'              // = AIConfigPanel
  | 'data-management'       // 数据管理

  // 状态表（A1）
  | 'state-table'

  // 物品栏（Phase 25.5.2-b）
  | 'inventory'

  // 事实库（NS-4 时序事实账本）
  | 'fact-library'

  // 故事进程年表（Phase 25.5.2-a）
  | 'story-timeline'

  // Phase 34 正文修炼阶段追踪
  | 'cultivation-progress'

  // 场景考证（Phase 27.2a）
  | 'scene-verify'

  // 全局故事线（Phase B）
  | 'story-arc'

  // 世界地图（Phase 20）
  | 'world-map'
  // legacy aliases，路由仍兼容但不再出现在 sidebar
  | 'power-system'
  | 'story-core' | 'backup'

export type ModuleContentType = 'upstream' | 'writing' | 'downstream' | 'tool' | 'experience' | 'system'

export interface ModuleContentTypeDefinition {
  label: string
  description: string
}

/**
 * 构建模块内容类型定义（label + description）。
 * 调用时通过 getT() 取当前语言翻译；非 React 上下文安全。
 */
export function buildModuleContentTypeDefinitions(): Record<ModuleContentType, ModuleContentTypeDefinition> {
  const t = getT()
  return {
    upstream: {
      label: t('layout:contentType.upstream.label'),
      description: t('layout:contentType.upstream.description'),
    },
    writing: {
      label: t('layout:contentType.writing.label'),
      description: t('layout:contentType.writing.description'),
    },
    downstream: {
      label: t('layout:contentType.downstream.label'),
      description: t('layout:contentType.downstream.description'),
    },
    tool: {
      label: t('layout:contentType.tool.label'),
      description: t('layout:contentType.tool.description'),
    },
    experience: {
      label: t('layout:contentType.experience.label'),
      description: t('layout:contentType.experience.description'),
    },
    system: {
      label: t('layout:contentType.system.label'),
      description: t('layout:contentType.system.description'),
    },
  }
}

// 兼容导出已移除：模块级常量会在 i18n 初始化前求值，导致标签显示原始 key。
// 请在组件内调用 buildModuleContentTypeDefinitions()，并以 useDomainT('layout')
// 返回的 lang（react-i18next 响应式订阅）作为缓存键；直读 i18n.language 单例
// 不构成订阅，冷挂载时 memo 不会随 ns 到达而重建（P0-1）。

/**
 * Phase 36 的模块内容类型单一事实源。
 * legacy 路由也必须显式登记，避免从旧入口进入时丢失标记。
 */
export const MODULE_CONTENT_TYPES: Record<SidebarModule, ModuleContentType> = {
  info: 'upstream',
  references: 'upstream',
  inspiration: 'tool',
  'world-overview': 'upstream',
  'world-rules': 'upstream',
  'worldview-origin': 'upstream',
  'worldview-natural': 'upstream',
  'worldview-humanity': 'upstream',
  'story-design': 'upstream',
  characters: 'upstream',
  'characters-main': 'upstream',
  'characters-minor': 'upstream',
  'characters-npc': 'upstream',
  'characters-extra': 'upstream',
  relations: 'upstream',
  geography: 'upstream',
  locations: 'upstream',
  history: 'upstream',
  rules: 'upstream',
  outline: 'upstream',
  'character-driven-plot': 'tool',
  'visual-workflows': 'tool',
  'rag-library': 'tool',
  'simulation-runtime': 'experience',
  'detailed-outline': 'upstream',
  'chapters-list': 'writing',
  editor: 'writing',
  foreshadow: 'upstream',
  'style-learning': 'tool',
  'master-studies': 'tool',
  prompts: 'system',
  'version-history': 'system',
  'import-doc': 'system',
  export: 'system',
  'usage-stats': 'system',
  settings: 'system',
  'data-management': 'system',
  'state-table': 'downstream',
  inventory: 'downstream',
  'fact-library': 'downstream',
  'story-timeline': 'downstream',
  'cultivation-progress': 'downstream',
  'scene-verify': 'tool',
  'story-arc': 'upstream',
  'world-map': 'upstream',
  'power-system': 'upstream',
  'story-core': 'upstream',
  backup: 'system',
}

export function getModuleContentType(module: SidebarModule): ModuleContentType {
  return MODULE_CONTENT_TYPES[module]
}

// ── 树节点 ────────────────────────────────────────────────────────────

export interface TreeLeaf {
  kind: 'leaf'
  id: SidebarModule
  label: string
  icon: ComponentType<{ className?: string }>
  contentType: ModuleContentType
}

export interface TreeBranch {
  kind: 'branch'
  /** 折叠状态 key，需保证唯一 */
  branchId: string
  label: string
  icon?: ComponentType<{ className?: string }>
  children: TreeNode[]
}

export type TreeNode = TreeLeaf | TreeBranch

export interface TreeSection {
  /** section 标识，section 一级也可能是个直接叶子（如 提示词库） */
  sectionId: string
  label: string
  icon?: ComponentType<{ className?: string }>
  /** 一级直接是叶子（提示词库）—— 单击进入对应 panel */
  rootLeaf?: TreeLeaf
  /** 否则有树形结构 */
  children?: TreeNode[]
}

// ── 数据 ─────────────────────────────────────────────────────────────

const leaf = (id: SidebarModule, label: string, icon: ComponentType<{ className?: string }>): TreeLeaf =>
  ({ kind: 'leaf', id, label, icon, contentType: getModuleContentType(id) })

/**
 * 构建导航树（标签已翻译）。每次调用都通过 getT() 取最新语言。
 */
export function buildNavTree(): TreeSection[] {
  const t = getT()
  return [
    {
      sectionId: 'project',
      label: t('layout:nav.sectionProject'),
      children: [
        leaf('info',         t('layout:nav.leafInfo'), FileText),
        leaf('inspiration',  t('layout:nav.leafInspiration'), Sparkles),
        leaf('references',   t('layout:nav.leafReferences'), Library),
      ],
    },
    {
      sectionId: 'lib',
      label: t('layout:nav.sectionLib'),
      children: [
        leaf('world-overview', t('layout:nav.leafWorldOverview'), Globe),
        {
          kind: 'branch',
          branchId: 'lib.worldview',
          label: t('layout:nav.branchWorldview'),
          icon: Globe,
          children: [
            leaf('world-rules',        t('layout:nav.leafWorldRules'), Scale),
            leaf('worldview-origin',   t('layout:nav.leafWorldviewOrigin'), Sparkles),
            leaf('worldview-natural',  t('layout:nav.leafWorldviewNatural'), Mountain),
            leaf('worldview-humanity', t('layout:nav.leafWorldviewHumanity'), Users2),
            leaf('history',            t('layout:nav.leafHistory'), Clock),
            leaf('world-map',          t('layout:nav.leafWorldMap'), Map),
          ],
        },
        leaf('story-design', t('layout:nav.leafStoryDesign'), BookOpen),
        {
          kind: 'branch',
          branchId: 'lib.characters',
          label: t('layout:nav.branchCharacters'),
          icon: UsersRound,
          children: [
            leaf('characters',         t('layout:nav.leafCharacters'), UserCircle),
            leaf('characters-main',    t('layout:nav.leafCharactersMain'), UserCircle),
            leaf('characters-minor',   t('layout:nav.leafCharactersMinor'), User),
            leaf('characters-npc',     t('layout:nav.leafCharactersNpc'), UsersRound),
            leaf('characters-extra',   t('layout:nav.leafCharactersExtra'), Footprints),
            leaf('relations',          t('layout:nav.leafRelations'), Network),
          ],
        },
      ],
    },
    {
      sectionId: 'create',
      label: t('layout:nav.sectionCreate'),
      children: [
        leaf('rules',            t('layout:nav.leafRules'), Ruler),
        leaf('outline',          t('layout:nav.leafOutline'), BookOpen),
        leaf('character-driven-plot', t('layout:nav.leafCharacterDrivenPlot'), Drama),
        leaf('rag-library',      t('layout:nav.leafRagLibrary'), Database),
        leaf('visual-workflows', t('layout:nav.leafVisualWorkflows'), Workflow),
        leaf('story-arc',        t('layout:nav.leafStoryArc'), GitBranch),
        leaf('chapters-list',    t('layout:nav.leafChaptersList'), FilePen),
        leaf('foreshadow',       t('layout:nav.leafForeshadow'), Eye),
        leaf('style-learning',   t('layout:nav.leafStyleLearning'), Feather),
        leaf('locations',        t('layout:nav.leafLocations'), MapPin),
        leaf('state-table',      t('layout:nav.leafStateTable'), ClipboardList),
        leaf('inventory',        t('layout:nav.leafInventory'), Package),
        leaf('fact-library',     t('layout:nav.leafFactLibrary'), Database),
        leaf('story-timeline',   t('layout:nav.leafStoryTimeline'), CalendarClock),
        leaf('cultivation-progress', t('layout:nav.leafCultivationProgress'), TrendingUp),
        leaf('scene-verify',     t('layout:nav.leafSceneVerify'), ScanSearch),
      ],
    },
    {
      sectionId: 'experience',
      label: t('layout:nav.sectionExperience'),
      children: [
        leaf('simulation-runtime', t('layout:nav.leafSimulationRuntime'), Gamepad2),
      ],
    },
    // 作品学习已整合进「项目参考 → 深度分析」tab（Phase 20）
    {
      sectionId: 'prompts',
      label: t('layout:nav.sectionPrompts'),
      icon: FileCog,
      rootLeaf: leaf('prompts', t('layout:nav.leafPrompts'), FileCog),
    },
    {
      sectionId: 'system',
      label: t('layout:nav.sectionSystem'),
      children: [
        leaf('version-history',  t('layout:nav.leafVersionHistory'), History),
        leaf('import-doc',       t('layout:nav.leafImportDoc'), Upload),
        leaf('export',           t('layout:nav.leafExport'), Download),
        leaf('usage-stats',      t('layout:nav.leafUsageStats'), Coins),
        leaf('settings',         t('layout:nav.leafSettings'), Settings),
      ],
    },
  ]
}

// 兼容导出已移除：模块级常量会在 i18n 初始化前求值，导致标签显示原始 key。
// 请在组件内调用 buildNavTree()，并以 i18n.language 作为缓存键。

// ── 工具 ─────────────────────────────────────────────────────────────

/** 找到包含某 module 的所有 branch 的 branchId 链（用于默认展开） */
export function getBranchChain(target: SidebarModule, tree: TreeSection[] = buildNavTree()): string[] {
  const chain: string[] = []
  function walk(nodes: TreeNode[], path: string[]): boolean {
    for (const n of nodes) {
      if (n.kind === 'leaf' && n.id === target) {
        chain.push(...path)
        return true
      }
      if (n.kind === 'branch' && walk(n.children, [...path, n.branchId])) {
        return true
      }
    }
    return false
  }
  for (const sec of tree) {
    if (sec.children && walk(sec.children, [])) break
    if (sec.rootLeaf?.id === target) break
  }
  return chain
}
