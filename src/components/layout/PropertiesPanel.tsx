import { X, BookOpen, PenTool, Globe, Users, Heart, MapPin, Eye, FileText, Info } from 'lucide-react'
import { useOutlineStore } from '../../stores/outline'
import { useChapterStore } from '../../stores/chapter'
import { useCharacterStore } from '../../stores/character'
import { useCharacterRelationStore } from '../../stores/character-relation'
import { useGeographyStore } from '../../stores/project-singletons'
import { useForeshadowStore } from '../../stores/foreshadow'
import type { SidebarModule } from './Sidebar'
import { useDomainT } from '../../i18n'
import {
  projectCanonicalLabel,
  CHAPTER_STATUS_LABEL_KEYS,
  LAYOUT_RELATION_TYPE_LABEL_KEYS,
  LAYOUT_LOCATION_TYPE_LABEL_KEYS,
} from '../../i18n/display-projection'

interface Props {
  activeModule: SidebarModule
  onClose: () => void
}

function formatDate(ts: number, lang: string) {
  return new Date(ts).toLocaleDateString(lang, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
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
  const { nodes } = useOutlineStore()
  const { chapters, currentChapter } = useChapterStore()
  const { t, lang } = useDomainT('layout')

  const volumes = nodes.filter(n => n.type === 'volume').length
  const arcs = nodes.filter(n => n.type === 'arc').length
  const chapterNodes = nodes.filter(n => n.type === 'chapter').length
  const totalWords = chapters.reduce((s, c) => s + (c.wordCount || 0), 0)
  const writtenChapters = chapters.filter(c => c.wordCount > 0).length

  return (
    <>
      <Section title={t('propertiesPanel.outlineStats')} icon={BookOpen}>
        <Stat label={t('propertiesPanel.volumeCount')} value={volumes} />
        <Stat label={t('propertiesPanel.arcCount')} value={arcs} />
        <Stat label={t('propertiesPanel.chapterCount')} value={chapterNodes} />
        <Stat label={t('propertiesPanel.writtenChapters')} value={`${writtenChapters} / ${chapterNodes}`} />
        <Stat label={t('propertiesPanel.totalWords')} value={t('propertiesPanel.wordsUnit', { count: totalWords.toLocaleString() })} />
      </Section>
      {currentChapter && (
        <Section title={t('propertiesPanel.currentChapter')} icon={PenTool}>
          <Stat label={t('propertiesPanel.chapterTitle')} value={currentChapter.title} />
          <Stat label={t('propertiesPanel.chapterStatus')} value={projectCanonicalLabel(t, CHAPTER_STATUS_LABEL_KEYS, currentChapter.status)} />
          <Stat label={t('propertiesPanel.chapterWords')} value={t('propertiesPanel.wordsUnit', { count: currentChapter.wordCount.toLocaleString() })} />
          <Stat label={t('propertiesPanel.chapterUpdatedAt')} value={formatDate(currentChapter.updatedAt, lang)} />
        </Section>
      )}
    </>
  )
}

/** 角色属性 */
function CharacterProps() {
  const { characters } = useCharacterStore()
  const { relations } = useCharacterRelationStore()
  const { t } = useDomainT('layout')

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
    <Section title={t('propertiesPanel.characterStats')} icon={Users}>
      <Stat label={t('propertiesPanel.totalCharacters')} value={characters.length} />
      <Stat label={t('propertiesPanel.mainSecondary')} value={`${weightCount.main} / ${weightCount.secondary}`} />
      <Stat label={t('propertiesPanel.npcExtra')} value={`${weightCount.npc} / ${weightCount.extra}`} />
      <Stat label={t('propertiesPanel.moralAxis')} value={`${moralCount.good} / ${moralCount.neutral} / ${moralCount.evil}`} />
      <Stat label={t('propertiesPanel.relationLines')} value={relations.length} />
    </Section>
  )
}

/** 角色关系属性 */
function RelationProps() {
  const { relations } = useCharacterRelationStore()
  const { characters } = useCharacterStore()
  const { t } = useDomainT('layout')

  const typeCount: Record<string, number> = {}
  relations.forEach(r => { typeCount[r.relationType] = (typeCount[r.relationType] || 0) + 1 })
  const topType = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0]

  return (
    <Section title={t('propertiesPanel.relationStats')} icon={Heart}>
      <Stat label={t('propertiesPanel.characterCount')} value={characters.length} />
      <Stat label={t('propertiesPanel.totalRelations')} value={relations.length} />
      <Stat label={t('propertiesPanel.bidirectional')} value={relations.filter(r => r.isBidirectional).length} />
      <Stat label={t('propertiesPanel.unidirectional')} value={relations.filter(r => !r.isBidirectional).length} />
      {topType && <Stat label={t('propertiesPanel.topRelationType')} value={t('propertiesPanel.topRelationTypeValue', { type: projectCanonicalLabel(t, LAYOUT_RELATION_TYPE_LABEL_KEYS, topType[0]), count: topType[1] })} />}
    </Section>
  )
}

/** 地理属性 */
function GeographyProps() {
  const { geography } = useGeographyStore()
  const { t } = useDomainT('layout')

  let locations: { type: string }[] = []
  try { locations = JSON.parse(geography?.locations || '[]') } catch { /* ignore */ }

  const typeCount: Record<string, number> = {}
  locations.forEach((l) => { typeCount[l.type] = (typeCount[l.type] || 0) + 1 })

  return (
    <Section title={t('propertiesPanel.geographyStats')} icon={MapPin}>
      <Stat label={t('propertiesPanel.locationTotal')} value={locations.length} />
      {Object.entries(typeCount).map(([type, count]) => (
        <Stat key={type} label={projectCanonicalLabel(t, LAYOUT_LOCATION_TYPE_LABEL_KEYS, type)} value={count} />
      ))}
    </Section>
  )
}

/** 伏笔属性 */
function ForeshadowProps() {
  const { foreshadows } = useForeshadowStore()
  const { t } = useDomainT('layout')

  const planned = foreshadows.filter(f => f.status === 'planned').length
  const planted = foreshadows.filter(f => f.status === 'planted').length
  const echoed = foreshadows.filter(f => f.status === 'echoed').length
  const resolved = foreshadows.filter(f => f.status === 'resolved').length

  return (
    <Section title={t('propertiesPanel.foreshadowStats')} icon={Eye}>
      <Stat label={t('propertiesPanel.totalForeshadows')} value={foreshadows.length} />
      <Stat label={t('propertiesPanel.planned')} value={planned} />
      <Stat label={t('propertiesPanel.planted')} value={planted} />
      <Stat label={t('propertiesPanel.echoed')} value={echoed} />
      <Stat label={t('propertiesPanel.resolved')} value={resolved} />
      <Stat label={t('propertiesPanel.unresolved')} value={planned + planted + echoed} />
    </Section>
  )
}

/** 通用提示 — 静态 key 映射（避免 computed key，满足 typed t()） */
interface TipsEntry {
  icon: React.ComponentType<{ className?: string }>
  titleKey: 'propertiesPanel.tips.worldview.title' | 'propertiesPanel.tips.storyCore.title' | 'propertiesPanel.tips.powerSystem.title' | 'propertiesPanel.tips.history.title' | 'propertiesPanel.tips.rules.title' | 'propertiesPanel.tips.backup.title' | 'propertiesPanel.tips.export.title' | 'propertiesPanel.tips.settings.title' | 'propertiesPanel.tips.info.title'
  itemsKey: 'propertiesPanel.tips.worldview.items' | 'propertiesPanel.tips.storyCore.items' | 'propertiesPanel.tips.powerSystem.items' | 'propertiesPanel.tips.history.items' | 'propertiesPanel.tips.rules.items' | 'propertiesPanel.tips.backup.items' | 'propertiesPanel.tips.export.items' | 'propertiesPanel.tips.settings.items' | 'propertiesPanel.tips.info.items'
}

const TIPS_MAP: Record<string, TipsEntry> = {
  worldview:     { icon: Globe,    titleKey: 'propertiesPanel.tips.worldview.title',     itemsKey: 'propertiesPanel.tips.worldview.items' },
  'story-core':  { icon: FileText, titleKey: 'propertiesPanel.tips.storyCore.title',     itemsKey: 'propertiesPanel.tips.storyCore.items' },
  'power-system':{ icon: Info,     titleKey: 'propertiesPanel.tips.powerSystem.title',   itemsKey: 'propertiesPanel.tips.powerSystem.items' },
  history:       { icon: Info,     titleKey: 'propertiesPanel.tips.history.title',       itemsKey: 'propertiesPanel.tips.history.items' },
  rules:         { icon: Info,     titleKey: 'propertiesPanel.tips.rules.title',         itemsKey: 'propertiesPanel.tips.rules.items' },
  backup:        { icon: Info,     titleKey: 'propertiesPanel.tips.backup.title',        itemsKey: 'propertiesPanel.tips.backup.items' },
  export:        { icon: Info,     titleKey: 'propertiesPanel.tips.export.title',        itemsKey: 'propertiesPanel.tips.export.items' },
  settings:      { icon: Info,     titleKey: 'propertiesPanel.tips.settings.title',      itemsKey: 'propertiesPanel.tips.settings.items' },
  info:          { icon: FileText, titleKey: 'propertiesPanel.tips.info.title',          itemsKey: 'propertiesPanel.tips.info.items' },
}

/** 通用提示 */
function GenericProps({ module }: { module: SidebarModule }) {
  const { t } = useDomainT('layout')
  const entry = TIPS_MAP[module]
  if (!entry) return null

  const Icon = entry.icon
  const title = t(entry.titleKey)
  const items = t(entry.itemsKey, { returnObjects: true }) as unknown as string[]

  if (!Array.isArray(items)) return null

  return (
    <Section title={title} icon={Icon}>
      <div className="py-1 space-y-2">
        {items.map((tip, i) => (
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
  const { t } = useDomainT('layout')

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
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{t('propertiesPanel.title')}</span>
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
