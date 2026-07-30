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
import i18n from '../../i18n/i18n'

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

/** Returns content type definitions with labels/descriptions resolved via i18n. */
export function getModuleContentTypeDefinitions(): Record<ModuleContentType, ModuleContentTypeDefinition> {
  const t = (key: string): string => (i18n.t as (key: string) => string)(`nav:${key}`)
  return {
    upstream: {
      label: t('contentType.upstream'),
      description: t('contentType.upstreamDesc'),
    },
    writing: {
      label: t('contentType.writing'),
      description: t('contentType.writingDesc'),
    },
    downstream: {
      label: t('contentType.downstream'),
      description: t('contentType.downstreamDesc'),
    },
    tool: {
      label: t('contentType.tool'),
      description: t('contentType.toolDesc'),
    },
    experience: {
      label: t('contentType.experience'),
      description: t('contentType.experienceDesc'),
    },
    system: {
      label: t('contentType.system'),
      description: t('contentType.systemDesc'),
    },
  }
}

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

/** Build the navigation tree with labels resolved via i18n. Call on each render to pick up language changes. */
export function buildNavTree(): TreeSection[] {
  const t = (key: string): string => (i18n.t as (key: string) => string)(`nav:${key}`)
  return [
    {
      sectionId: 'project',
      label: t('section.info'),
      children: [
        leaf('info',         t('project.overview'), FileText),
        leaf('inspiration',  t('project.inspiration'), Sparkles),
        leaf('references',   t('project.reference'), Library),
      ],
    },
    {
      sectionId: 'lib',
      label: t('section.worldview'),
      children: [
        leaf('world-overview', t('worldview.overview'), Globe),
        {
          kind: 'branch',
          branchId: 'lib.worldview',
          label: t('worldview.overview'),
          icon: Globe,
          children: [
            leaf('world-rules',        t('worldview.reality'), Scale),
            leaf('worldview-origin',   t('worldview.origin'), Sparkles),
            leaf('worldview-natural',  t('worldview.nature'), Mountain),
            leaf('worldview-humanity', t('worldview.humanity'), Users2),
            leaf('history',            t('worldview.timeline'), Clock),
            leaf('world-map',          t('worldview.map'), Map),
          ],
        },
        leaf('story-design', t('storyDesign'), BookOpen),
        {
          kind: 'branch',
          branchId: 'lib.characters',
          label: t('characters.design'),
          icon: UsersRound,
          children: [
            leaf('characters',         t('characters.generate'), UserCircle),
            leaf('characters-main',    t('characters.main'), UserCircle),
            leaf('characters-minor',   t('characters.minor'), User),
            leaf('characters-npc',     t('characters.npc'),      UsersRound),
            leaf('characters-extra',   t('characters.extras'),     Footprints),
            leaf('relations',          t('characters.relations'),   Network),
          ],
        },
      ],
    },
    {
      sectionId: 'create',
      label: t('section.creation'),
      children: [
        leaf('rules',            t('creation.rules'), Ruler),
        leaf('outline',          t('creation.outline'),     BookOpen),
        leaf('character-driven-plot', t('creation.characterDriven'), Drama),
        leaf('rag-library',      t('creation.rag'), Database),
        leaf('visual-workflows', t('creation.nodeMode'), Workflow),
        leaf('story-arc',        t('creation.timeline'),   GitBranch),
        leaf('chapters-list',    t('creation.chapters'),     FilePen),
        leaf('foreshadow',       t('creation.foreshadow'),     Eye),
        leaf('style-learning',   t('creation.styleLearning'), Feather),
        leaf('locations',        t('creation.locations'), MapPin),
        leaf('state-table',      t('creation.state'),   ClipboardList),
        leaf('inventory',        t('creation.inventory'),   Package),
        leaf('fact-library',     t('creation.facts'),   Database),
        leaf('story-timeline',   t('creation.storyTimeline'), CalendarClock),
        leaf('cultivation-progress', t('creation.cultivation'), TrendingUp),
        leaf('scene-verify',     t('creation.sceneVerify'), ScanSearch),
      ],
    },
    {
      sectionId: 'experience',
      label: t('section.experience'),
      children: [
        leaf('simulation-runtime', t('experience.runtime'), Gamepad2),
      ],
    },
    // 作品学习已整合进「项目参考 → 深度分析」tab（Phase 20）
    {
      sectionId: 'prompts',
      label: t('section.prompts'),
      icon: FileCog,
      rootLeaf: leaf('prompts', t('prompts.library'), FileCog),
    },
    {
      sectionId: 'system',
      label: t('section.settings'),
      children: [
        leaf('version-history',  t('settings.versionHistory'), History),
        leaf('import-doc',       t('settings.docImport'), Upload),
        leaf('export',           t('settings.dataManagement'), Download),
        leaf('usage-stats',      t('settings.usageStats'), Coins),
        leaf('settings',         t('settings.general'),     Settings),
      ],
    },
  ]
}

/** Static accessor kept for backward compatibility — prefer buildNavTree() in React components. */
export const NAV_TREE: TreeSection[] = buildNavTree()

// ── 工具 ─────────────────────────────────────────────────────────────

/** 找到包含某 module 的所有 branch 的 branchId 链（用于默认展开） */
export function getBranchChain(target: SidebarModule): string[] {
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
  const tree = buildNavTree()
  for (const sec of tree) {
    if (sec.children && walk(sec.children, [])) break
    if (sec.rootLeaf?.id === target) break
  }
  return chain
}
