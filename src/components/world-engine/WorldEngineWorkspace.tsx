import {
  ArrowRight,
  BookOpen,
  Clock3,
  Compass,
  Layers3,
  Map,
  Network,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { SidebarModule } from '../layout/sidebar-tree'
import type { WorldDomainArea } from '../../lib/registry/types'
import type { WorldDomainSummary, WorldProjection } from '../../lib/world-engine/domain'
import type { Project } from '../../lib/types'
import { useWorldGroupStore } from '../../stores/world-group'
import { useDomainT } from '../../i18n'
import WorldWorkManager from './WorldWorkManager'
import WorldNarrativeReleasePanel from './WorldNarrativeReleasePanel'

interface Props {
  projection?: WorldProjection
  project: Project
  onOpenModule: (module: SidebarModule) => void
  activeWorkId?: number | null
  onWorkChanged?: () => Promise<void> | void
  onOpenGame?: (product: 'storygame' | 'text-adventure' | 'avg') => void
}

interface DomainModuleLink {
  module: SidebarModule
  labelKey: string
}

const DOMAIN_META: Record<WorldDomainArea, { icon: LucideIcon; modules: readonly DomainModuleLink[] }> = {
  foundation: {
    icon: Sparkles,
    modules: [
      { module: 'world-rules', labelKey: 'worldRules' },
      { module: 'worldview-origin', labelKey: 'worldviewOrigin' },
      { module: 'worldview-natural', labelKey: 'worldviewNatural' },
      { module: 'worldview-humanity', labelKey: 'worldviewHumanity' },
      { module: 'history', labelKey: 'history' },
      { module: 'world-map', labelKey: 'worldMap' },
    ],
  },
  assets: {
    icon: Users,
    modules: [
      { module: 'characters', labelKey: 'characters' },
      { module: 'relations', labelKey: 'relations' },
      { module: 'locations', labelKey: 'locations' },
    ],
  },
  narrative: {
    icon: BookOpen,
    modules: [
      { module: 'story-design', labelKey: 'storyDesign' },
      { module: 'story-arc', labelKey: 'storyArc' },
      { module: 'outline', labelKey: 'outline' },
      { module: 'foreshadow', labelKey: 'foreshadow' },
    ],
  },
  structure: {
    icon: Network,
    modules: [{ module: 'world-overview', labelKey: 'worldOverview' }],
  },
  runtime: {
    icon: Clock3,
    modules: [{ module: 'simulation-runtime', labelKey: 'simulationRuntime' }],
  },
}

const STATUS_TONES: Record<WorldDomainSummary['status'], string> = {
  empty: 'neutral',
  partial: 'warning',
  ready: 'success',
}

const TABLE_DISPLAY_PRIORITY: Record<WorldDomainSummary['key'], readonly string[]> = {
  foundation: ['worldviews', 'worldRulesProfiles', 'geographies', 'histories', 'powerSystems', 'historicalTimelineEvents', 'historicalKeywords', 'importantLocations', 'worldReleases', 'worldRevisions'],
  assets: ['characters', 'characterRelations', 'importantLocations', 'codexEntries', 'avgMediaAssets', 'avgMediaBlobs'],
  narrative: ['storyCores', 'storyArcs', 'outlineNodes', 'detailedOutlines', 'foreshadows', 'narrativeModules', 'narrativeNodes', 'narrativeBeats', 'narrativeChoices', 'gameDefinitions', 'gameReleases'],
  structure: ['worldGroups', 'worldGroupLinks', 'worldNodes'],
  runtime: ['simulationSessions', 'simulationEvents', 'simulationCheckpoints'],
}

function DomainCard({ summary, onOpenModule }: { summary: WorldDomainSummary; onOpenModule: Props['onOpenModule'] }) {
  const { t } = useDomainT('worldview')
  const meta = DOMAIN_META[summary.key]
  const Icon = meta.icon
  const priority = TABLE_DISPLAY_PRIORITY[summary.key]
  const activeTables = summary.tables
    .filter(table => table.rowCount > 0)
    .sort((left, right) => {
      const leftIndex = priority.indexOf(left.name)
      const rightIndex = priority.indexOf(right.name)
      return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
    })
  return (
    <article className="sf-feature-card sf-world-domain-card">
      <span className={`sf-feature-icon sf-feature-${summary.key === 'foundation' ? 'ochre' : summary.key === 'assets' ? 'teal' : summary.key === 'narrative' ? 'rust' : summary.key === 'structure' ? 'blue' : 'violet'}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="sf-feature-copy">
        <div className="sf-world-domain-heading">
          <h3>{summary.label}</h3>
          <span className={`sf-world-domain-status sf-world-domain-status-${STATUS_TONES[summary.status]}`}>
            {t(`worldEngine.domainStatus.${summary.status}`)}
          </span>
        </div>
        <p>{summary.description}</p>
      </div>
      <div className="sf-world-domain-progress" aria-label={t('worldEngine.domain.coverageAria', { label: summary.label, coverage: summary.coverage })}>
        <span style={{ width: `${summary.coverage}%` }} />
      </div>
      <div className="sf-world-domain-meta">
        <span>{t('worldEngine.domain.activeTables', { active: summary.activeTableCount, total: summary.tableCount })}</span>
        <span>{t('worldEngine.domain.rowCount', { count: summary.rowCount })}</span>
      </div>
      <div className="sf-world-domain-tables">
        {activeTables.length > 0
          ? activeTables.slice(0, 4).map(table => (
            <span key={table.name}>
              {t(`worldEngine.tables.${table.name}`, { defaultValue: t('worldEngine.genericTableLabel') })} · {table.rowCount}
            </span>
          ))
          : <span>{t('worldEngine.domain.emptyTablesHint')}</span>}
      </div>
      <div className="sf-world-domain-modules" aria-label={t('worldEngine.domain.moduleLinksAria', { label: summary.label })}>
        {meta.modules.map(item => (
          <button key={item.module} onClick={() => onOpenModule(item.module)}>
            <span>{t(`worldEngine.moduleLinks.${item.labelKey}`)}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </article>
  )
}

export default function WorldEngineWorkspace({ projection, project, onOpenModule, activeWorkId, onWorkChanged, onOpenGame }: Props) {
  const { t } = useDomainT('worldview')
  const activeGroupId = useWorldGroupStore(state => state.activeGroupId)
  const worldGroupId = project.enableMultiWorld ? activeGroupId : null
  if (!projection) {
    return <div className="flex min-h-[20rem] items-center justify-center text-sm text-text-muted">{t('worldEngine.loading')}</div>
  }
  const domains = Object.values(projection.domains)
  return (
    <div className="sf-world-engine-workspace">
      <div className="sf-section-header">
        <div>
          <div className="sf-eyebrow">{t('worldEngine.eyebrow')}</div>
          <h2>{t('worldEngine.title')}</h2>
        </div>
        <span className="sf-project-status">
          <ShieldCheck className="h-3.5 w-3.5" />
          {projection.readiness === 'usable' ? t('worldEngine.readiness.usable') : projection.readiness === 'building' ? t('worldEngine.readiness.building') : t('worldEngine.readiness.start')}
        </span>
      </div>
      <div className="sf-world-domain-grid">
        {domains.map(summary => <DomainCard key={summary.key} summary={summary} onOpenModule={onOpenModule} />)}
      </div>
      <WorldWorkManager projectId={projection.projectId} activeWorkId={activeWorkId} onChanged={onWorkChanged ?? (() => {})} />
      <WorldNarrativeReleasePanel
        project={project}
        projectId={projection.projectId}
        worldGroupId={worldGroupId}
        activeWorkId={activeWorkId}
        onChanged={onWorkChanged ?? (() => {})}
        onOpenRuntime={() => onOpenModule('simulation-runtime')}
        onOpenGame={onOpenGame ?? (() => {})}
      />
      <div className="sf-world-engine-lower-grid">
        <section className="sf-world-engine-bridge">
          <div className="sf-card-kicker"><Layers3 className="h-4 w-4" /> {t('worldEngine.bridge.kicker')}</div>
          <h3>{t('worldEngine.bridge.title')}</h3>
          <div className="sf-world-engine-bridge-links">
            <button className="sf-action-tile" onClick={() => onOpenModule('outline')}><span className="sf-action-tile-icon"><BookOpen className="h-4 w-4" /></span><span><strong>{t('worldEngine.bridge.narrativeTitle')}</strong><small>{t('worldEngine.bridge.narrativeDesc')}</small></span><ArrowRight className="h-4 w-4" /></button>
            <button className="sf-action-tile" onClick={() => onOpenModule('world-map')}><span className="sf-action-tile-icon"><Map className="h-4 w-4" /></span><span><strong>{t('worldEngine.bridge.spatialTitle')}</strong><small>{t('worldEngine.bridge.spatialDesc')}</small></span><ArrowRight className="h-4 w-4" /></button>
            <button className="sf-action-tile" onClick={() => onOpenModule('characters')}><span className="sf-action-tile-icon"><Users className="h-4 w-4" /></span><span><strong>{t('worldEngine.bridge.assetsTitle')}</strong><small>{t('worldEngine.bridge.assetsDesc')}</small></span><ArrowRight className="h-4 w-4" /></button>
          </div>
        </section>
        <aside className="sf-world-engine-runtime">
          <div className="sf-card-kicker"><Compass className="h-4 w-4" /> {t('worldEngine.runtime.kicker')}</div>
          <h3>{t('worldEngine.runtime.title')}</h3>
          <div className="sf-world-runtime-stat"><strong>{projection.runtime.instanceCount}</strong><span>{t('worldEngine.runtime.statInstances')}</span></div>
          <div className="sf-world-runtime-stat"><strong>{projection.runtime.eventCount}</strong><span>{t('worldEngine.runtime.statEvents')}</span></div>
          <div className="sf-world-runtime-stat"><strong>{projection.runtime.checkpointCount}</strong><span>{t('worldEngine.runtime.statCheckpoints')}</span></div>
          <button className="sf-text-button" onClick={() => onOpenModule('simulation-runtime')}>{t('worldEngine.runtime.openRuntime')} <ArrowRight className="h-4 w-4" /></button>
        </aside>
      </div>
    </div>
  )
}
