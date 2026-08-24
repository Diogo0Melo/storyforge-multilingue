import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import {
  Activity,
  ArrowRight,
  BookOpenText,
  Check,
  ChevronRight,
  Gamepad2,
  GitBranch,
  Globe2,
  Hash,
  LayoutDashboard,
  Menu,
  Map,
  MonitorPlay,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  Workflow,
  X,
} from 'lucide-react'
import type { Project, SimulationSessionKind, WorkspaceScope } from '../lib/types'
import { useProjectStore } from '../stores/project'
import { useWorldGroupStore } from '../stores/world-group'
import type { WorldProjection } from '../lib/world-engine/domain'
import { loadWorldProjections } from '../lib/world-engine/domain'
import WorldEngineWorkspace from '../components/world-engine/WorldEngineWorkspace'
import type { SidebarModule } from '../components/layout/sidebar-tree'
import WorldSharingPanel from '../components/product/WorldSharingPanel'
import { useDomainT, type DomainTFunction } from '../i18n'
import ProjectStorageFolderField from '../components/shared/ProjectStorageFolderField'
import { bindCreatedProjectStorageWorkspace } from '../lib/storage/project-storage-workspace'
import './product-hub.css'

const NodeAuthoringWorkspace = lazy(() => import('../components/node-authoring/NodeAuthoringWorkspace'))
const SimulationRuntimePanel = lazy(() => import('../components/simulation/SimulationRuntimePanel'))
const ChatGamePanel = lazy(() => import('../components/simulation/ChatGamePanel'))
const InteractionGameWorkbench = lazy(() => import('../components/character-interaction/InteractionGameWorkbench'))
const StoryGamePlayer = lazy(() => import('../components/text-game/StoryGamePlayer'))
const StoryGameWorkbench = lazy(() => import('../components/text-game/StoryGameWorkbench'))
const AdventureGamePlayer = lazy(() => import('../components/text-game/AdventureGamePlayer'))
const AdventureGameWorkbench = lazy(() => import('../components/text-game/AdventureGameWorkbench'))
const AvgGamePlayer = lazy(() => import('../components/text-game/AvgGamePlayer'))
const AvgGameWorkbench = lazy(() => import('../components/text-game/AvgGameWorkbench'))
const NarrativeSimulationPlayer = lazy(() => import('../components/text-game/NarrativeSimulationPlayer'))
const NarrativeSimulationWorkbench = lazy(() => import('../components/text-game/NarrativeSimulationWorkbench'))
const TextOpenWorldPlayer = lazy(() => import('../components/text-game/TextOpenWorldPlayer'))
const TextOpenWorldWorkbench = lazy(() => import('../components/text-game/TextOpenWorldWorkbench'))
const OutlinePanel = lazy(() => import('../components/outline/OutlinePanel'))
const ChaptersListPanel = lazy(() => import('../components/editor/ChaptersListPanel'))

type TabId = 'home' | 'worlds' | 'novel' | 'nodes' | 'ttrpg' | 'chat' | 'game'
type Accent = 'ochre' | 'teal' | 'blue' | 'violet' | 'rust'

type ProductWorld = {
  projectId: number
  code: string
  name: string
  description: string
  version: number
  source: string
  tags: string[]
  accent: Accent
  completeness: number
  project: Project
  projection?: WorldProjection
}

function scopeForProject(project: Project): WorkspaceScope | undefined {
  return project.id != null && project.activeWorldId != null && project.activeWorkId != null
    ? { projectId: project.id, worldId: project.activeWorldId, workId: project.activeWorkId }
    : undefined
}

function Button({
  children,
  onClick,
  variant = 'secondary',
  icon: Icon,
  disabled = false,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'quiet'
  icon?: typeof Plus
  disabled?: boolean
}) {
  return (
    <button className={`sf-button sf-button-${variant}`} onClick={onClick} disabled={disabled}>
      {Icon && <Icon className="h-4 w-4" />}
      <span>{children}</span>
    </button>
  )
}

function WorldGlyph({ accent, small = false }: { accent: Accent; small?: boolean }) {
  return (
    <div className={`sf-world-glyph sf-world-glyph-${accent} ${small ? 'sf-world-glyph-small' : ''}`} aria-hidden="true">
      <div className="sf-glyph-grid" />
      <div className="sf-glyph-land sf-glyph-land-one" />
      <div className="sf-glyph-land sf-glyph-land-two" />
      <div className="sf-glyph-line sf-glyph-line-one" />
      <div className="sf-glyph-line sf-glyph-line-two" />
      <span className="sf-glyph-mark" />
    </div>
  )
}

function StatusDot({ tone = 'success' }: { tone?: 'success' | 'warning' | 'neutral' }) {
  return <span className={`sf-status-dot sf-status-dot-${tone}`} aria-hidden="true" />
}

function projectToWorld(project: Project, index: number, t: DomainTFunction, projection?: WorldProjection): ProductWorld {
  const tags = (project.genres?.length ? project.genres : [project.genre]).filter(Boolean).slice(0, 2)
  const source = project.communityOrigin
    ? t('productHub.worldSourceCommunity', { code: project.communityOrigin.sourceWorldCode })
    : project.enableMultiWorld
      ? t('productHub.worldSourceMine')
      : t('productHub.worldSourceStep')
  return {
    projectId: project.id!,
    code: project.worldCode ?? t('productHub.worldUnassignedCode'),
    name: project.name,
    description: project.description || t('productHub.worldDefaultDesc'),
    version: project.worldVersion ?? 1,
    source,
    tags,
    accent: (['ochre', 'teal', 'blue', 'violet'] as Accent[])[index % 4],
    completeness: projection?.completeness ?? 0,
    project,
    projection,
  }
}

function ProductHeader({
  activeTab,
  onSelect,
  onOpenCreate,
  onOpenMobileNav,
  onOpenWorldPicker,
  t,
}: {
  activeTab: TabId
  onSelect: (tab: TabId) => void
  onOpenCreate: () => void
  onOpenMobileNav: () => void
  onOpenWorldPicker: () => void
  t: DomainTFunction
}) {
  const NAV_TABS: Array<{ id: TabId; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'home', label: t('productHub.navHome'), icon: LayoutDashboard },
    { id: 'worlds', label: t('productHub.navWorlds'), icon: Globe2 },
    { id: 'novel', label: t('productHub.navNovel'), icon: BookOpenText },
    { id: 'nodes', label: t('productHub.navNodes'), icon: Workflow },
    { id: 'ttrpg', label: t('productHub.navTtrpg'), icon: Swords },
    { id: 'chat', label: t('productHub.navChat'), icon: MessageCircle },
    { id: 'game', label: t('productHub.navGame'), icon: Gamepad2 },
  ]
  return (
    <header className="sf-header">
      <div className="sf-header-inner">
        <button className="sf-brand" onClick={() => onSelect('home')} aria-label={t('productHub.headerBackAria')}>
          <span className="sf-brand-mark"><Sparkles className="h-4 w-4" /></span>
          <span><span className="sf-brand-name">storyforge</span><span className="sf-brand-subtitle">{t('productHub.headerBrandSubtitle')}</span></span>
        </button>
        <nav className="sf-primary-nav" aria-label={t('productHub.headerNavAria')}>
          {NAV_TABS.map(tab => {
            const Icon = tab.icon
            return <button key={tab.id} onClick={() => onSelect(tab.id)} className={`sf-nav-tab ${activeTab === tab.id ? 'sf-nav-tab-active' : ''}`} data-testid={`product-tab-${tab.id}`} title={tab.label}><Icon className="h-4 w-4" /><span>{tab.label}</span></button>
          })}
        </nav>
        <div className="sf-header-actions">
          <button className="sf-icon-button sf-mobile-menu" onClick={onOpenMobileNav} title={t('productHub.headerMobileMenuTitle')} aria-label={t('productHub.headerMobileMenuAria')}><Menu className="h-4 w-4" /></button>
          <button className="sf-icon-button" onClick={onOpenWorldPicker} title={t('productHub.headerSearchTitle')} aria-label={t('productHub.headerSearchAria')}><Search className="h-4 w-4" /></button>
          <Button variant="primary" icon={Plus} onClick={onOpenCreate}>{t('productHub.headerCreate')}</Button>
          <button className="sf-avatar" title={t('productHub.headerAvatarTitle')} aria-label={t('productHub.headerAvatarAria')}>{t('productHub.headerAvatarLetter')}</button>
        </div>
      </div>
    </header>
  )
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="sf-page-heading"><div><div className="sf-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="sf-heading-action">{action}</div>}</div>
}

function BindingBanner({ world, onChange, t }: { world: ProductWorld; onChange: () => void; t: DomainTFunction }) {
  return <div className="sf-binding-banner"><span className="sf-binding-icon"><WorldGlyph accent={world.accent} small /></span><div><strong>{t('productHub.bindingBannerPrefix')}{world.name} <code>{world.code}@v{world.version}</code></strong><p>{t('productHub.bindingBannerNote')}</p></div><Button icon={Hash} onClick={onChange}>{t('productHub.bindingChange')}</Button></div>
}

function useSelectedWorldGroupId(project?: Project): number | null {
  const activeGroupId = useWorldGroupStore(state => state.activeGroupId)
  const loadAll = useWorldGroupStore(state => state.loadAll)
  useEffect(() => {
    if (project?.id && project.enableMultiWorld) void loadAll(project.id)
  }, [project?.id, project?.enableMultiWorld, loadAll])
  return project?.enableMultiWorld ? activeGroupId : null
}

function EmptyProjectState({ onCreate, t }: { onCreate: () => void; t: DomainTFunction }) {
  return <section className="sf-product-empty"><Globe2 className="h-8 w-8" /><h2>{t('productHub.emptyTitle')}</h2><p>{t('productHub.emptyDesc')}</p><Button variant="primary" icon={Plus} onClick={onCreate}>{t('productHub.emptyCreate')}</Button></section>
}

function FeaturePanelFallback({ t }: { t: DomainTFunction }) {
  return <div className="flex min-h-[20rem] items-center justify-center text-sm text-text-muted">{t('productHub.panelFallback')}</div>
}

function HomePage({ worlds, activeProject, onSelect, onSelectWorld, onOpenCreate, onOpenWorldPicker, t }: { worlds: ProductWorld[]; activeProject?: ProductWorld; onSelect: (id: TabId) => void; onSelectWorld: (world: ProductWorld) => void; onOpenCreate: () => void; onOpenWorldPicker: () => void; t: DomainTFunction }) {
  const FEATURE_META: Record<Exclude<TabId, 'home'>, { eyebrow: string; description: string; icon: typeof Globe2; accent: Accent }> = {
    worlds: { eyebrow: 'FOUNDATION', description: t('productHub.featureWorldsDesc'), icon: Globe2, accent: 'ochre' },
    novel: { eyebrow: 'AUTHORING', description: t('productHub.featureNovelDesc'), icon: BookOpenText, accent: 'rust' as Accent },
    nodes: { eyebrow: 'FLOW', description: t('productHub.featureNodesDesc'), icon: Workflow, accent: 'blue' },
    ttrpg: { eyebrow: 'PLAY', description: t('productHub.featureTtrpgDesc'), icon: Swords, accent: 'teal' },
    chat: { eyebrow: 'CHARACTERS', description: t('productHub.featureChatDesc'), icon: MessageCircle, accent: 'violet' },
    game: { eyebrow: 'STORY GAME', description: t('productHub.featureGameDesc'), icon: Gamepad2, accent: 'blue' },
  }
  const NAV_TABS: Array<{ id: TabId; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'home', label: t('productHub.navHome'), icon: LayoutDashboard },
    { id: 'worlds', label: t('productHub.navWorlds'), icon: Globe2 },
    { id: 'novel', label: t('productHub.navNovel'), icon: BookOpenText },
    { id: 'nodes', label: t('productHub.navNodes'), icon: Workflow },
    { id: 'ttrpg', label: t('productHub.navTtrpg'), icon: Swords },
    { id: 'chat', label: t('productHub.navChat'), icon: MessageCircle },
    { id: 'game', label: t('productHub.navGame'), icon: Gamepad2 },
  ]
  const getFeatureFooter = (id: Exclude<TabId, 'home'>) => {
    switch (id) {
      case 'worlds': return t('productHub.featureWorldsCount', { count: worlds.length })
      case 'novel': return t('productHub.featureNovelKeep')
      case 'nodes': return t('productHub.featureNodesDag')
      case 'ttrpg': return t('productHub.featureTtrpgReady')
      case 'chat': return t('productHub.featureChatReady')
      case 'game': return t('productHub.featureUpcoming')
    }
  }
  return <>
    <div className="sf-home-intro"><div><div className="sf-eyebrow">{t('productHub.homeIntroEyebrow')}</div><h1>{t('productHub.homeIntroTitle')}</h1><p>{t('productHub.homeIntroDesc')}</p></div><div className="sf-intro-actions"><Button icon={Hash} onClick={onOpenWorldPicker}>{t('productHub.homeUseCode')}</Button><Button variant="primary" icon={Plus} onClick={onOpenCreate}>{t('productHub.homeNewContent')}</Button></div></div>
    {activeProject ? <section className="sf-resume-grid"><article className="sf-resume-card sf-resume-primary"><div className="sf-resume-visual"><span className="sf-visual-label"><StatusDot /> {t('productHub.resumeCurrentWorld')}</span><span className="sf-visual-rule" /><span className="sf-visual-coordinate">{activeProject.code} · v{activeProject.version}</span></div><div className="sf-resume-content"><span className="sf-card-kicker"><Globe2 className="h-4 w-4" /> {t('productHub.resumeWorldEngine')}</span><h2>{activeProject.name}</h2><p>{activeProject.description}</p><div className="sf-progress"><span style={{ width: `${activeProject.completeness}%` }} /></div><div className="sf-resume-meta"><span>{t('productHub.resumeCompleteness', { percent: activeProject.completeness })}</span><span>{activeProject.source}</span></div><Button icon={ArrowRight} onClick={() => onSelect('worlds')}>{t('productHub.resumeEnterWorld')}</Button></div></article><article className="sf-resume-card sf-resume-secondary"><div className="sf-resume-secondary-head"><span className="sf-card-kicker"><BookOpenText className="h-4 w-4" /> {t('productHub.resumeRecentWork')}</span><StatusDot tone="neutral" /></div><div className="sf-campaign-avatar"><BookOpenText className="h-5 w-5" /></div><h2>{activeProject.name}</h2><p>{activeProject.project.currentWordCount ? t('productHub.resumeNovelSummary', { words: (activeProject.project.currentWordCount / 10000).toFixed(1) }) : t('productHub.resumeNovelEmpty')}</p><div className="sf-event-list"><div><StatusDot /><span>{t('productHub.resumeWorldRef')}</span></div><div><StatusDot tone="warning" /><span>{t('productHub.resumeContinueOutline')}</span></div></div><Button variant="quiet" icon={ArrowRight} onClick={() => onSelect('novel')}>{t('productHub.resumeContinueWriting')}</Button></article></section> : <EmptyProjectState onCreate={onOpenCreate} t={t} />}
    <section className="sf-section"><div className="sf-section-header"><div><div className="sf-eyebrow">{t('productHub.sectionStartEyebrow')}</div><h2>{t('productHub.sectionStartTitle')}</h2></div><button className="sf-text-button" onClick={onOpenCreate}>{t('productHub.sectionStartCreate')} <ArrowRight className="h-4 w-4" /></button></div><div className="sf-feature-grid">{(Object.keys(FEATURE_META) as Array<Exclude<TabId, 'home'>>).map(id => { const meta = FEATURE_META[id]; const Icon = meta.icon; return <button key={id} className="sf-feature-card" onClick={() => onSelect(id)}><span className={`sf-feature-icon sf-feature-${meta.accent}`}><Icon className="h-5 w-5" /></span><span className="sf-feature-copy"><span className="sf-eyebrow">{meta.eyebrow}</span><h3>{NAV_TABS.find(tab => tab.id === id)?.label}</h3><p>{meta.description}</p></span><span className="sf-feature-footer"><span>{getFeatureFooter(id)}</span><ArrowRight className="h-4 w-4" /></span></button> })}</div></section>
    <section className="sf-section"><div className="sf-section-header"><div><div className="sf-eyebrow">{t('productHub.sectionWorldLibEyebrow')}</div><h2>{t('productHub.sectionWorldLibTitle')}</h2></div><button className="sf-text-button" onClick={() => onSelect('worlds')}>{t('productHub.sectionWorldLibManage')} <ArrowRight className="h-4 w-4" /></button></div><div className="sf-world-grid">{worlds.slice(0, 3).map(world => <WorldCard key={world.code} world={world} onOpen={() => { onSelectWorld(world); onSelect('worlds') }} t={t} />)}<button className="sf-new-world-card" onClick={onOpenCreate}><span className="sf-new-world-plus"><Plus className="h-5 w-5" /></span><strong>{t('productHub.newWorldCardTitle')}</strong><span>{t('productHub.newWorldCardDesc')}</span></button></div></section>
  </>
}

function WorldCard({ world, onOpen, t }: { world: ProductWorld; onOpen: () => void; t: DomainTFunction }) {
  return <button className="sf-world-card" onClick={onOpen}><WorldGlyph accent={world.accent} /><div className="sf-world-card-body"><div className="sf-card-topline"><span className="sf-overline"><Hash className="h-3 w-3" /> {world.code}</span><span className="sf-version">v{world.version}</span></div><h3>{world.name}</h3><p>{world.description}</p><div className="sf-tag-row">{world.tags.map(tag => <span className="sf-tag" key={tag}>{tag}</span>)}</div><div className="sf-world-card-footer"><span className="sf-source"><StatusDot tone={world.source === t('productHub.worldSourceMine') ? 'success' : 'neutral'} />{world.source}</span><span className="sf-completeness">{world.completeness}%</span></div></div></button>
}

function WorldEnginePage({ worlds, activeWorld, onSelectWorld, onOpenCreate, onOpenWorldPicker, onImported, onOpenModule, onOpenGame, t }: { worlds: ProductWorld[]; activeWorld?: ProductWorld; onSelectWorld: (world: ProductWorld) => void; onOpenCreate: () => void; onOpenWorldPicker: () => void; onImported: (projectId: number) => void; onOpenModule: (module: SidebarModule) => void; onOpenGame: (product: 'storygame' | 'text-adventure' | 'avg') => void; t: DomainTFunction }) {
  if (!activeWorld) return <><PageHeading eyebrow={t('productHub.enginePageEyebrow')} title={t('productHub.enginePageTitle')} description={t('productHub.enginePageDescShort')} action={<Button variant="primary" icon={Plus} onClick={onOpenCreate}>{t('productHub.engineCreateZero')}</Button>} /><EmptyProjectState onCreate={onOpenCreate} t={t} /><WorldSharingPanel onImported={onImported} /></>
  return <>
    <PageHeading eyebrow={t('productHub.enginePageEyebrow')} title={t('productHub.enginePageTitle')} description={t('productHub.enginePageDescFull')} action={<><Button icon={Hash} onClick={onOpenWorldPicker}>{t('productHub.homeUseCode')}</Button><Button variant="primary" icon={Plus} onClick={onOpenCreate}>{t('productHub.engineCreateZero')}</Button></>} />
    <div className="sf-subnav">{worlds.map(world => <button key={world.code} className={world.code === activeWorld.code ? 'active' : ''} onClick={() => onSelectWorld(world)}><WorldGlyph accent={world.accent} small /><span>{world.name}</span><span>{world.code}</span></button>)}<span className="sf-subnav-spacer" /></div>
    <section className="sf-worlds-featured"><div className="sf-worlds-featured-visual"><WorldGlyph accent={activeWorld.accent} /></div><div className="sf-worlds-featured-copy"><span className="sf-overline">WORLD ENGINE · {activeWorld.source}</span><h2>{activeWorld.name}</h2><p>{activeWorld.description}</p><span className="sf-world-code-large"><Hash className="h-4 w-4" /> {activeWorld.code} · v{activeWorld.version}</span><div className="sf-worlds-featured-actions"><Button variant="primary" icon={ArrowRight} onClick={() => document.getElementById('world-engine-editor')?.scrollIntoView({ behavior: 'smooth' })}>{t('productHub.engineManageSettings')}</Button><Button icon={BookOpenText} onClick={() => onOpenModule('outline')}>{t('productHub.engineContinueStepWriting')}</Button></div></div><div className="sf-worlds-featured-stats"><div><strong>{activeWorld.completeness}%</strong><span>{t('productHub.engineStatsCompleteness')}</span></div><div><strong>v{activeWorld.version}</strong><span>{t('productHub.engineStatsVersion')}</span></div><div><strong>{activeWorld.project.enableMultiWorld ? t('productHub.engineStatsBaseActive') : t('productHub.engineStatsBasePending')}</strong><span>{t('productHub.engineStatsBaseLabel')}</span></div></div></section>
    <section id="world-engine-editor" className="sf-product-panel"><WorldEngineWorkspace project={activeWorld.project} projection={activeWorld.projection} activeWorkId={activeWorld.project.activeWorkId} onWorkChanged={() => onImported(activeWorld.projectId)} onOpenModule={onOpenModule} onOpenGame={onOpenGame} /></section>
    <WorldSharingPanel project={activeWorld.project} onImported={onImported} />
  </>
}

function NovelPage({ project, world, onOpenWorldPicker, onCreate, t }: { project?: Project; world?: ProductWorld; onOpenWorldPicker: () => void; onCreate: () => void; t: DomainTFunction }) {
  const [view, setView] = useState<'outline' | 'chapters'>('outline')
  const [nodeId, setNodeId] = useState<number | null>(null)
  if (!project || !world) return <><PageHeading eyebrow={t('productHub.novelPageEyebrow')} title={t('productHub.novelPageTitle')} description={t('productHub.novelPageDescShort')} /><EmptyProjectState onCreate={onCreate} t={t} /></>
  return <><PageHeading eyebrow={t('productHub.novelPageEyebrow')} title={t('productHub.novelPageTitle')} description={t('productHub.novelPageDescFull')} action={<Button variant="primary" icon={ArrowRight} onClick={() => setView('chapters')}>{t('productHub.novelOpenText')}</Button>} /><BindingBanner world={world} onChange={onOpenWorldPicker} t={t} /><div className="sf-subnav"><button className={view === 'outline' ? 'active' : ''} onClick={() => setView('outline')}><BookOpenText className="h-4 w-4" />{t('productHub.novelSubnavOutline')}</button><button className={view === 'chapters' ? 'active' : ''} onClick={() => setView('chapters')}><BookOpenText className="h-4 w-4" />{t('productHub.novelSubnavChapters')}</button><span className="sf-subnav-spacer" /><span className="sf-subnav-note">{project.name}</span></div><section className="sf-product-panel sf-novel-panel"><Suspense fallback={<FeaturePanelFallback t={t} />}>{view === 'outline' ? <OutlinePanel project={project} onOpenChapter={id => { setNodeId(id); setView('chapters') }} /> : <ChaptersListPanel project={project} initialNodeId={nodeId} />}</Suspense></section></>
}

function NodesPage({ project, world, onOpenWorldPicker, onCreate, t }: { project?: Project; world?: ProductWorld; onOpenWorldPicker: () => void; onCreate: () => void; t: DomainTFunction }) {
  const worldGroupId = useSelectedWorldGroupId(project)
  if (!project || !world) return <><PageHeading eyebrow={t('productHub.nodesPageEyebrow')} title={t('productHub.nodesPageTitle')} description={t('productHub.nodesPageDescShort')} /><EmptyProjectState onCreate={onCreate} t={t} /></>
  return <><PageHeading eyebrow={t('productHub.nodesPageEyebrow')} title={t('productHub.nodesPageTitle')} description={t('productHub.nodesPageDescFull')} /><BindingBanner world={world} onChange={onOpenWorldPicker} t={t} /><section className="sf-product-runtime-surface"><Suspense fallback={<FeaturePanelFallback t={t} />}><NodeAuthoringWorkspace project={project} worldGroupId={worldGroupId} /></Suspense></section></>
}

function TtrpgPage({ project, world, onOpenWorldPicker, onCreate, t }: { project?: Project; world?: ProductWorld; onOpenWorldPicker: () => void; onCreate: () => void; t: DomainTFunction }) {
  const worldGroupId = useSelectedWorldGroupId(project)
  if (!project || !world) return <><PageHeading eyebrow={t('productHub.ttrpgPageEyebrow')} title={t('productHub.ttrpgPageTitle')} description={t('productHub.ttrpgPageDescShort')} /><EmptyProjectState onCreate={onCreate} t={t} /></>
  return <><PageHeading eyebrow={t('productHub.ttrpgPageEyebrow')} title={t('productHub.ttrpgPageTitle')} description={t('productHub.ttrpgPageDescFull')} /><BindingBanner world={world} onChange={onOpenWorldPicker} t={t} /><section className="sf-product-runtime-surface"><Suspense fallback={<FeaturePanelFallback t={t} />}><SimulationRuntimePanel project={project} worldGroupId={worldGroupId} workspaceScope={scopeForProject(project)} sessionKind={'ttrpg' satisfies SimulationSessionKind} /></Suspense></section></>
}

function ChatGamePage({ project, world, onOpenWorldPicker, onCreate, t }: { project?: Project; world?: ProductWorld; onOpenWorldPicker: () => void; onCreate: () => void; t: DomainTFunction }) {
  const [mode, setMode] = useState<'play' | 'author'>('play')
  const worldGroupId = useSelectedWorldGroupId(project)
  if (!project || !world) return <><PageHeading eyebrow={t('productHub.chatPageEyebrow')} title={t('productHub.chatPageTitle')} description={t('productHub.chatPageDescShort')} /><EmptyProjectState onCreate={onCreate} t={t} /></>
  const scope = scopeForProject(project)
  if (!scope) return <><PageHeading eyebrow={t('productHub.chatPageEyebrow')} title={t('productHub.chatPageTitle')} description={t('productHub.chatPageDescShort')} /><BindingBanner world={world} onChange={onOpenWorldPicker} t={t} /><section className="sf-product-empty"><ShieldCheck className="h-8 w-8" /><h2>{t('productHub.engineStatusPending')}</h2><p>{t('productHub.engineInlineEmpty')}</p></section></>
  return <><PageHeading eyebrow={mode === 'play' ? t('productHub.chatPageEyebrow') : 'AUTHOR / CHATGAME-2'} title={t('productHub.chatPageTitle')} description={t('productHub.chatPageDescFull')} action={<div className="storygame-mode-actions"><Button variant={mode === 'play' ? 'primary' : 'secondary'} icon={Gamepad2} onClick={() => setMode('play')}>{t('productHub.navChat')}</Button><Button variant={mode === 'author' ? 'primary' : 'secondary'} icon={BookOpenText} onClick={() => setMode('author')}>{t('productHub.createPanelWorldsTitle')}</Button><Button icon={Hash} onClick={onOpenWorldPicker}>{t('productHub.chooseWorld')}</Button></div>} /><BindingBanner world={world} onChange={onOpenWorldPicker} t={t} /><section className="sf-product-runtime-surface"><Suspense fallback={<FeaturePanelFallback t={t} />}>{mode === 'play' ? <ChatGamePanel project={project} worldGroupId={worldGroupId} workspaceScope={scope} /> : <InteractionGameWorkbench scope={scope} />}</Suspense></section></>
}

function TextGamePage({ project, world, onOpenWorldPicker, onCreate, initialProduct = 'storygame', t }: { project?: Project; world?: ProductWorld; onOpenWorldPicker: () => void; onCreate: () => void; initialProduct?: 'storygame' | 'text-adventure' | 'avg'; t: DomainTFunction }) {
  const [mode, setMode] = useState<'play' | 'author'>('play')
  const [product, setProduct] = useState<'storygame' | 'text-adventure' | 'avg' | 'narrative-simulation' | 'text-open-world'>(initialProduct)
  const worldGroupId = useSelectedWorldGroupId(project)
  if (!project || !world) return <><PageHeading eyebrow={t('productHub.navGame')} title={t('productHub.navGame')} description={t('productHub.featureGameDesc')} /><EmptyProjectState onCreate={onCreate} t={t} /></>
  const scope = scopeForProject(project)
  if (!scope) return <><PageHeading eyebrow={t('productHub.navGame')} title={t('productHub.navGame')} description={t('productHub.featureGameDesc')} /><BindingBanner world={world} onChange={onOpenWorldPicker} t={t} /><section className="sf-product-empty"><ShieldCheck className="h-8 w-8" /><h2>{t('productHub.engineStatusPending')}</h2><p>{t('productHub.engineInlineEmpty')}</p></section></>
  const isAdventure = product === 'text-adventure'
  const isAvg = product === 'avg'
  const isSimulation = product === 'narrative-simulation'
  const isOpenWorld = product === 'text-open-world'
  const productCode = isAdventure ? 'TEXTADV-1' : isAvg ? 'AVG-1' : isSimulation ? 'TEXTSIM-1' : isOpenWorld ? 'TEXTWORLD-1' : 'STORYGAME'
  const productTitle = isAdventure ? 'TEXT ADVENTURE' : isAvg ? 'AVG' : isSimulation ? 'NARRATIVE SIMULATION' : isOpenWorld ? 'TEXT OPEN WORLD' : 'STORYGAME'
  const content = isAdventure
    ? (mode === 'play' ? <AdventureGamePlayer project={project} scope={scope} worldGroupId={worldGroupId} /> : <AdventureGameWorkbench scope={scope} />)
    : isAvg
      ? (mode === 'play' ? <AvgGamePlayer project={project} scope={scope} worldGroupId={worldGroupId} /> : <AvgGameWorkbench scope={scope} />)
      : isSimulation
        ? (mode === 'play' ? <NarrativeSimulationPlayer project={project} scope={scope} worldGroupId={worldGroupId} /> : <NarrativeSimulationWorkbench scope={scope} />)
        : isOpenWorld
          ? (mode === 'play' ? <TextOpenWorldPlayer project={project} scope={scope} worldGroupId={worldGroupId} /> : <TextOpenWorldWorkbench scope={scope} />)
          : (mode === 'play' ? <StoryGamePlayer project={project} scope={scope} worldGroupId={worldGroupId} /> : <StoryGameWorkbench scope={scope} />)
  return <><PageHeading eyebrow={`${mode === 'play' ? 'PLAY' : 'AUTHOR'} / ${productCode}`} title={productTitle} description={t('productHub.featureGameDesc')} action={<div className="storygame-mode-actions"><Button variant={product === 'storygame' ? 'primary' : 'secondary'} icon={GitBranch} onClick={() => setProduct('storygame')}>STORYGAME</Button><Button variant={isAdventure ? 'primary' : 'secondary'} icon={Map} onClick={() => setProduct('text-adventure')}>TEXTADV-1</Button><Button variant={isAvg ? 'primary' : 'secondary'} icon={MonitorPlay} onClick={() => setProduct('avg')}>AVG-1</Button><Button variant={isSimulation ? 'primary' : 'secondary'} icon={Activity} onClick={() => setProduct('narrative-simulation')}>TEXTSIM-1</Button><Button variant={isOpenWorld ? 'primary' : 'secondary'} icon={Globe2} onClick={() => setProduct('text-open-world')}>TEXTWORLD-1</Button><Button variant={mode === 'play' ? 'primary' : 'secondary'} icon={Gamepad2} onClick={() => setMode('play')}>PLAY</Button><Button variant={mode === 'author' ? 'primary' : 'secondary'} icon={BookOpenText} onClick={() => setMode('author')}>AUTHOR</Button><Button icon={Hash} onClick={onOpenWorldPicker}>{t('productHub.chooseWorld')}</Button></div>} /><BindingBanner world={world} onChange={onOpenWorldPicker} t={t} /><section className="sf-product-runtime-surface"><Suspense fallback={<FeaturePanelFallback t={t} />}>{content}</Suspense></section></>
}

function CreatePanel({ onClose, onCreated, t }: { onClose: () => void; onCreated: (kind: 'worlds' | 'novel', id: number) => void; t: DomainTFunction }) {
  const { createProject } = useProjectStore()
  const [kind, setKind] = useState<'choose' | 'worlds' | 'novel'>('choose')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [projectFolder, setProjectFolder] = useState<FileSystemDirectoryHandle | null>(null)
  const [busy, setBusy] = useState(false)
  const create = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      const id = await createProject({ name: name.trim(), genre: 'other', genres: ['other'], status: 'drafting', description: description.trim(), targetWordCount: 500000, enableMultiWorld: kind === 'worlds' })
      if (projectFolder) await bindCreatedProjectStorageWorkspace(id, projectFolder)
      onCreated(kind === 'worlds' ? 'worlds' : 'novel', id)
    } finally { setBusy(false) }
  }
  const label = kind === 'worlds' ? t('productHub.createPanelWorldsTitle') : t('productHub.createPanelNovelTitle')
  return <div className="sf-modal-backdrop" onMouseDown={onClose}><aside className="sf-create-panel" onMouseDown={event => event.stopPropagation()}><div className="sf-modal-header"><div><div className="sf-eyebrow">{t('productHub.createPanelEyebrow')}</div><h2>{kind === 'choose' ? t('productHub.createPanelChooseTitle') : label}</h2><p>{kind === 'choose' ? t('productHub.createPanelChooseDesc') : t('productHub.createPanelWorldsDesc')}</p></div><button className="sf-icon-button" onClick={onClose} title={t('common:close')} aria-label={t('common:close')}><X className="h-4 w-4" /></button></div>{kind === 'choose' ? <div className="sf-create-options"><button onClick={() => setKind('worlds')}><span className="sf-create-option-icon"><Globe2 className="h-5 w-5" /></span><span><strong>{t('productHub.createOptionWorldsTitle')}</strong><small>{t('productHub.createOptionWorldsDesc')}</small></span><ArrowRight className="h-4 w-4" /></button><button onClick={() => setKind('novel')}><span className="sf-create-option-icon"><BookOpenText className="h-5 w-5" /></span><span><strong>{t('productHub.createOptionNovelTitle')}</strong><small>{t('productHub.createOptionNovelDesc')}</small></span><ArrowRight className="h-4 w-4" /></button></div> : <div className="sf-create-form"><label>{t('productHub.createNameLabel')}<input value={name} onChange={event => setName(event.target.value)} placeholder={kind === 'worlds' ? t('productHub.createNamePlaceholderWorlds') : t('productHub.createNamePlaceholderNovel')} autoFocus /></label><label>{t('productHub.createDescLabel')}<textarea value={description} onChange={event => setDescription(event.target.value)} rows={4} placeholder={t('productHub.createDescPlaceholder')} /></label><ProjectStorageFolderField value={projectFolder} onChange={setProjectFolder} disabled={busy} /><div className="sf-create-form-actions"><Button onClick={() => setKind('choose')}>{t('productHub.createBack')}</Button><Button variant="primary" icon={Check} onClick={() => void create()} disabled={busy || !name.trim()}>{busy ? t('productHub.createBusy') : label}</Button></div></div>}</aside></div>
}

function WorldPicker({ worlds, onClose, onChoose, t }: { worlds: ProductWorld[]; onClose: () => void; onChoose: (world: ProductWorld) => void; t: DomainTFunction }) {
  const [query, setQuery] = useState('')
  const results = worlds.filter(world => `${world.name} ${world.code}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="sf-modal-backdrop" onMouseDown={onClose}><aside className="sf-picker-panel" onMouseDown={event => event.stopPropagation()}><div className="sf-modal-header"><div><div className="sf-eyebrow">{t('productHub.pickerEyebrow')}</div><h2>{t('productHub.pickerTitle')}</h2><p>{t('productHub.pickerDesc')}</p></div><button className="sf-icon-button" onClick={onClose} title={t('common:close')} aria-label={t('common:close')}><X className="h-4 w-4" /></button></div><div className="sf-picker-input"><Search className="h-4 w-4" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('productHub.pickerPlaceholder')} autoFocus /></div><div className="sf-picker-list">{results.map(world => <button key={world.code} onClick={() => { onChoose(world); onClose() }}><WorldGlyph accent={world.accent} small /><span><strong>{world.name}</strong><small><Hash className="h-3 w-3" />{world.code} · v{world.version}</small></span><ChevronRight className="h-4 w-4" /></button>)}{results.length === 0 && <div className="sf-picker-empty"><Search className="h-5 w-5" /><span>{t('productHub.pickerEmptyMain')}</span><small>{t('productHub.pickerEmptySub')}</small></div>}</div><div className="sf-picker-footer"><button disabled><ShieldCheck className="h-4 w-4" />{t('productHub.pickerCommunityPreparing')}</button></div></aside></div>
}

function MobileNavPanel({ activeTab, onClose, onSelect, t }: { activeTab: TabId; onClose: () => void; onSelect: (tab: TabId) => void; t: DomainTFunction }) {
  const NAV_TABS: Array<{ id: TabId; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'home', label: t('productHub.navHome'), icon: LayoutDashboard },
    { id: 'worlds', label: t('productHub.navWorlds'), icon: Globe2 },
    { id: 'novel', label: t('productHub.navNovel'), icon: BookOpenText },
    { id: 'nodes', label: t('productHub.navNodes'), icon: Workflow },
    { id: 'ttrpg', label: t('productHub.navTtrpg'), icon: Swords },
    { id: 'chat', label: t('productHub.navChat'), icon: MessageCircle },
    { id: 'game', label: t('productHub.navGame'), icon: Gamepad2 },
  ]
  return <div className="sf-modal-backdrop sf-mobile-nav-backdrop" onMouseDown={onClose}><aside className="sf-mobile-nav-panel" onMouseDown={event => event.stopPropagation()}><div className="sf-modal-header"><div><div className="sf-eyebrow">{t('productHub.mobileNavEyebrow')}</div><h2>{t('productHub.mobileNavTitle')}</h2></div><button className="sf-icon-button" onClick={onClose} title={t('common:close')} aria-label={t('common:close')}><X className="h-4 w-4" /></button></div><nav>{NAV_TABS.map(tab => { const Icon = tab.icon; return <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => { onSelect(tab.id); onClose() }}><span><Icon className="h-4 w-4" /></span><strong>{tab.label}</strong>{activeTab === tab.id ? <Check className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button> })}</nav></aside></div>
}

export default function ProductHubPage() {
  const navigate = useNavigate()
  const { projects, loadProjects } = useProjectStore()
  const { t } = useDomainT('pages')
  const [activeTab, setActiveTab] = useState<TabId>('home')
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showWorldPicker, setShowWorldPicker] = useState(false)
  const [showMobileNav, setShowMobileNav] = useState(false)
  const [gameProduct, setGameProduct] = useState<'storygame' | 'text-adventure' | 'avg'>('storygame')
  const [projections, setProjections] = useState<Record<number, WorldProjection>>({})

  useEffect(() => { void loadProjects() }, [loadProjects])
  useEffect(() => {
    if (activeProjectId != null && projects.some(project => project.id === activeProjectId)) return
    setActiveProjectId(projects[0]?.id ?? null)
  }, [activeProjectId, projects])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const loaded = await loadWorldProjections(projects.filter(project => project.id != null))
        if (!cancelled) setProjections(Object.fromEntries(loaded.map(projection => [projection.projectId, projection])))
      } catch (error) {
        console.error('[WORLD-2] failed to read world projections', error)
        if (!cancelled) setProjections({})
      }
    }
    void load()
    return () => { cancelled = true }
  }, [projects])

  const worlds = useMemo(() => projects.filter(project => project.id != null).map((project, index) => projectToWorld(project, index, t, projections[project.id!])), [projects, projections, t])
  const activeWorld = worlds.find(world => world.projectId === activeProjectId) ?? worlds[0]
  const activeProject = activeWorld?.project
  const selectWorld = (world: ProductWorld) => setActiveProjectId(world.projectId)
  const selectTab = (tab: TabId) => setActiveTab(tab)

  const renderPage = () => {
    switch (activeTab) {
      case 'worlds': return <WorldEnginePage worlds={worlds} activeWorld={activeWorld} onSelectWorld={selectWorld} onOpenCreate={() => setShowCreate(true)} onOpenWorldPicker={() => setShowWorldPicker(true)} onImported={async projectId => { await loadProjects(); setActiveProjectId(projectId); setActiveTab('worlds') }} onOpenModule={module => { if (activeProject?.id) navigate(`/workspace/${activeProject.id}?module=${module}`) }} onOpenGame={product => { setGameProduct(product); setActiveTab('game') }} t={t} />
      case 'novel': return <NovelPage project={activeProject} world={activeWorld} onOpenWorldPicker={() => setShowWorldPicker(true)} onCreate={() => setShowCreate(true)} t={t} />
      case 'nodes': return <NodesPage project={activeProject} world={activeWorld} onOpenWorldPicker={() => setShowWorldPicker(true)} onCreate={() => setShowCreate(true)} t={t} />
      case 'ttrpg': return <TtrpgPage project={activeProject} world={activeWorld} onOpenWorldPicker={() => setShowWorldPicker(true)} onCreate={() => setShowCreate(true)} t={t} />
      case 'chat': return <ChatGamePage project={activeProject} world={activeWorld} onOpenWorldPicker={() => setShowWorldPicker(true)} onCreate={() => setShowCreate(true)} t={t} />
      case 'game': return <TextGamePage project={activeProject} world={activeWorld} onOpenWorldPicker={() => setShowWorldPicker(true)} onCreate={() => setShowCreate(true)} initialProduct={gameProduct} t={t} />
      default: return <HomePage worlds={worlds} activeProject={activeWorld} onSelect={selectTab} onSelectWorld={selectWorld} onOpenCreate={() => setShowCreate(true)} onOpenWorldPicker={() => setShowWorldPicker(true)} t={t} />
    }
  }

  return <div className="sf-product-shell"><ProductHeader activeTab={activeTab} onSelect={selectTab} onOpenCreate={() => setShowCreate(true)} onOpenMobileNav={() => setShowMobileNav(true)} onOpenWorldPicker={() => setShowWorldPicker(true)} t={t} /><main className="sf-product-main">{renderPage()}</main><footer className="sf-product-footer"><span>{t('productHub.footerLeft')}</span><span><ShieldCheck className="h-3.5 w-3.5" />{t('productHub.footerRight')}</span></footer>{showCreate && <CreatePanel onClose={() => setShowCreate(false)} onCreated={(kind, id) => { setActiveProjectId(id); setActiveTab(kind); setShowCreate(false); if (kind === 'novel') navigate(`/workspace/${id}?module=outline`) }} t={t} />}{showWorldPicker && <WorldPicker worlds={worlds} onClose={() => setShowWorldPicker(false)} onChoose={selectWorld} t={t} />}{showMobileNav && <MobileNavPanel activeTab={activeTab} onClose={() => setShowMobileNav(false)} onSelect={selectTab} t={t} />}</div>
}
