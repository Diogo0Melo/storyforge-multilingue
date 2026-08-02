import { X, BookOpen, PenTool, Globe, Users, Heart, MapPin, Eye, FileText, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useOutlineStore } from '../../stores/outline'
import { useChapterStore } from '../../stores/chapter'
import { useCharacterStore } from '../../stores/character'
import { useCharacterRelationStore } from '../../stores/character-relation'
import { useGeographyStore } from '../../stores/project-singletons'
import { useForeshadowStore } from '../../stores/foreshadow'
import { formatDateTime } from '../../i18n/format'
import type { SidebarModule } from './Sidebar'

interface Props {
  activeModule: SidebarModule
  onClose: () => void
}

function formatDate(ts: number) {
  return formatDateTime(new Date(ts), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-border last:border-0">
      <span className="text-xs text-text-muted shrink-0">{label}</span>
      <span className="text-xs text-text-primary text-right">{value}</span>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5 text-accent" />
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{title}</span>
      </div>
      <div className="bg-bg-elevated rounded-lg px-3 py-1">
        {children}
      </div>
    </div>
  )
}

/** 大纲 & 写作 属性 */
function OutlineProps() {
  const { t } = useTranslation('panels')
  const { nodes } = useOutlineStore()
  const { chapters, currentChapter } = useChapterStore()

  const volumes = nodes.filter(n => n.type === 'volume').length
  const arcs = nodes.filter(n => n.type === 'arc').length
  const chapterNodes = nodes.filter(n => n.type === 'chapter').length
  const totalWords = chapters.reduce((s, c) => s + (c.wordCount || 0), 0)
  const writtenChapters = chapters.filter(c => c.wordCount > 0).length

  return (
    <>
      <Section title={t('properties.outlineStats')} icon={BookOpen}>
        <Stat label={t('properties.volumes')} value={volumes} />
        <Stat label={t('properties.arcs')} value={arcs} />
        <Stat label={t('properties.chapters')} value={chapterNodes} />
        <Stat label={t('properties.writtenChapters')} value={`${writtenChapters} / ${chapterNodes}`} />
        <Stat label={t('properties.totalWords')} value={`${totalWords.toLocaleString()} ${t('properties.wordsUnit')}`} />
      </Section>
      {currentChapter && (
        <Section title={t('properties.currentChapter')} icon={PenTool}>
          <Stat label={t('properties.chapterTitle')} value={currentChapter.title} />
          <Stat label={t('properties.status')} value={currentChapter.status} />
          <Stat label={t('properties.wordCount')} value={`${currentChapter.wordCount.toLocaleString()} ${t('properties.wordsUnit')}`} />
          <Stat label={t('properties.updateTime')} value={formatDate(currentChapter.updatedAt)} />
        </Section>
      )}
    </>
  )
}

/** 角色属性 */
function CharacterProps() {
  const { t } = useTranslation('panels')
  const { characters } = useCharacterStore()
  const { relations } = useCharacterRelationStore()

  const weightCount = {
    main: characters.filter(c => c.roleWeight === 'main').length,
    secondary: characters.filter(c => c.roleWeight === 'secondary').length,
    npc: characters.filter(c => c.roleWeight === 'npc').length,
    extra: characters.filter(c => c.roleWeight === 'extra').length,
  }
  const moralCount = {
    good: characters.filter(c => c.moralAxis === 'good').length,
    neutral: characters.filter(c => c.moralAxis === 'neutral').length,
    evil: characters.filter(c => c.moralAxis === 'evil').length,
  }

  return (
    <Section title={t('properties.characterStats')} icon={Users}>
      <Stat label={t('properties.totalCharacters')} value={characters.length} />
      <Stat label={t('properties.mainSecondary')} value={`${weightCount.main} / ${weightCount.secondary}`} />
      <Stat label={t('properties.npcExtra')} value={`${weightCount.npc} / ${weightCount.extra}`} />
      <Stat label={t('properties.goodNeutralEvil')} value={`${moralCount.good} / ${moralCount.neutral} / ${moralCount.evil}`} />
      <Stat label={t('properties.relationLines')} value={relations.length} />
    </Section>
  )
}

/** 角色关系属性 */
function RelationProps() {
  const { t } = useTranslation('panels')
  const { relations } = useCharacterRelationStore()
  const { characters } = useCharacterStore()

  const typeCount: Record<string, number> = {}
  relations.forEach(r => { typeCount[r.relationType] = (typeCount[r.relationType] || 0) + 1 })
  const topType = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0]

  return (
    <Section title={t('properties.relationStats')} icon={Heart}>
      <Stat label={t('properties.characterCount')} value={characters.length} />
      <Stat label={t('properties.totalRelations')} value={relations.length} />
      <Stat label={t('properties.bidirectional')} value={relations.filter(r => r.isBidirectional).length} />
      <Stat label={t('properties.unidirectional')} value={relations.filter(r => !r.isBidirectional).length} />
      {topType && <Stat label={t('properties.mostType')} value={t('properties.mostType', { type: topType[0], count: topType[1] })} />}
    </Section>
  )
}

/** 地理属性 */
function GeographyProps() {
  const { t } = useTranslation('panels')
  const { geography } = useGeographyStore()

  let locations: { type: string }[] = []
  try { locations = JSON.parse(geography?.locations || '[]') } catch { /* ignore */ }

  const typeCount: Record<string, number> = {}
  locations.forEach((l) => { typeCount[l.type] = (typeCount[l.type] || 0) + 1 })

  return (
    <Section title={t('properties.geographyStats')} icon={MapPin}>
      <Stat label={t('properties.totalLocations')} value={locations.length} />
      {Object.entries(typeCount).map(([type, count]) => (
        <Stat key={type} label={type} value={count} />
      ))}
    </Section>
  )
}

/** 伏笔属性 */
function ForeshadowProps() {
  const { t } = useTranslation('panels')
  const { foreshadows } = useForeshadowStore()

  const planned = foreshadows.filter(f => f.status === 'planned').length
  const planted = foreshadows.filter(f => f.status === 'planted').length
  const echoed = foreshadows.filter(f => f.status === 'echoed').length
  const resolved = foreshadows.filter(f => f.status === 'resolved').length

  return (
    <Section title={t('properties.foreshadowStats')} icon={Eye}>
      <Stat label={t('properties.totalForeshadows')} value={foreshadows.length} />
      <Stat label={t('properties.planned')} value={planned} />
      <Stat label={t('properties.planted')} value={planted} />
      <Stat label={t('properties.echoed')} value={echoed} />
      <Stat label={t('properties.resolved')} value={resolved} />
      <Stat label={t('properties.unresolved')} value={planned + planted + echoed} />
    </Section>
  )
}

/** 通用提示 */
function GenericProps({ module }: { module: SidebarModule }) {
  const { t } = useTranslation('panels')
  const tips: Record<string, { icon: React.ComponentType<{ className?: string }>; title: string; tips: string[] }> = {
    worldview: {
      icon: Globe,
      title: t('properties.tipWorldview'),
      tips: [t('properties.tipWorldview1'), t('properties.tipWorldview2'), t('properties.tipWorldview3')],
    },
    'story-core': {
      icon: FileText,
      title: t('properties.tipStoryCore'),
      tips: [t('properties.tipStoryCore1'), t('properties.tipStoryCore2')],
    },
    'power-system': {
      icon: Info,
      title: t('properties.tipPowerSystem'),
      tips: [t('properties.tipPowerSystem1'), t('properties.tipPowerSystem2')],
    },
    history: {
      icon: Info,
      title: t('properties.tipHistory'),
      tips: [t('properties.tipHistory1'), t('properties.tipHistory2')],
    },
    rules: {
      icon: Info,
      title: t('properties.tipRules'),
      tips: [t('properties.tipRules1'), t('properties.tipRules2')],
    },
    backup: {
      icon: Info,
      title: t('properties.tipBackup'),
      tips: [t('properties.tipBackup1'), t('properties.tipBackup2')],
    },
    export: {
      icon: Info,
      title: t('properties.tipExport'),
      tips: [t('properties.tipExport1'), t('properties.tipExport2')],
    },
    settings: {
      icon: Info,
      title: t('properties.tipSettings'),
      tips: [t('properties.tipSettings1'), t('properties.tipSettings2')],
    },
    info: {
      icon: FileText,
      title: t('properties.tipInfo'),
      tips: [t('properties.tipInfo1'), t('properties.tipInfo2')],
    },
  }

  const data = tips[module]
  if (!data) return null
  const Icon = data.icon

  return (
    <Section title={data.title} icon={Icon}>
      <div className="py-1 space-y-2">
        {data.tips.map((tip, i) => (
          <p key={i} className="text-xs text-text-muted leading-relaxed">
            · {tip}
          </p>
        ))}
      </div>
    </Section>
  )
}

/** 属性面板主体 */
export default function PropertiesPanel({ activeModule, onClose }: Props) {
  const { t } = useTranslation('panels')
  const renderContent = () => {
    switch (activeModule) {
      case 'outline':
      case 'editor':
        return <OutlineProps />
      case 'characters':
        return <CharacterProps />
      case 'relations':
        return <RelationProps />
      case 'geography':
        return <GeographyProps />
      case 'foreshadow':
        return <ForeshadowProps />
      default:
        return <GenericProps module={activeModule} />
    }
  }

  return (
    <aside className="w-60 bg-bg-surface border-l border-border flex flex-col h-full shrink-0">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{t('properties.title')}</span>
        <button
          onClick={onClose}
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-3">
        {renderContent()}
      </div>
    </aside>
  )
}
