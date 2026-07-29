import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BookMarked,
  ChevronDown,
  ChevronRight,
  Globe,
  ListTree,
  Microscope,
  Trash2,
  Users2,
} from 'lucide-react'
import type { Reference, ReferenceType } from '../../lib/types'
import { InlineInput, InlineTextarea } from '../shared/InlineEdit'
import ReferenceDeepAnalysisTab from './ReferenceDeepAnalysisTab'
import {
  REFERENCE_GLYPH_COLORS,
  REFERENCE_TYPE_CONFIG,
} from './reference-view'

type DetailTab = 'worldview' | 'characters' | 'outline' | 'deep-analysis' | 'info'

interface Props {
  reference: Reference
  referenceIndex: number
  onUpdate: (data: Partial<Reference>) => void
  onDelete: () => void
}

export default function ReferenceDetailCard({ reference, referenceIndex, onUpdate, onDelete }: Props) {
  const { t } = useTranslation('project')
  const data = reference.importedData
  const glyphColor = REFERENCE_GLYPH_COLORS[referenceIndex % REFERENCE_GLYPH_COLORS.length]
  const config = REFERENCE_TYPE_CONFIG[reference.type]
  const worldviewEntries = data?.worldview ? Object.entries(data.worldview).filter(([, value]) => value?.trim()) : []
  const characters = data?.characters || []
  const outline = data?.outline || []

  const WORLDVIEW_LABELS: Record<string, string> = {
    worldOrigin: t('refDetail.wv.worldOrigin'),
    powerHierarchy: t('refDetail.wv.powerHierarchy'),
    worldStructure: t('refDetail.wv.worldStructure'),
    worldDimensions: t('refDetail.wv.worldDimensions'),
    continentLayout: t('refDetail.wv.continentLayout'),
    regionDimensions: t('refDetail.wv.regionDimensions'),
    mountainsRivers: t('refDetail.wv.mountainsRivers'),
    climateByRegion: t('refDetail.wv.climateByRegion'),
    historyLine: t('refDetail.wv.historyLine'),
    worldEvents: t('refDetail.wv.worldEvents'),
    races: t('refDetail.wv.races'),
    factionLayout: t('refDetail.wv.factionLayout'),
    politicsEconomyCulture: t('refDetail.wv.politicsEconomyCulture'),
    internalConflicts: t('refDetail.wv.internalConflicts'),
    itemDesign: t('refDetail.wv.itemDesign'),
  }

  const availableTabs = useMemo(() => {
    const tabs: { key: DetailTab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
      { key: 'deep-analysis', label: t('refDetail.tabAnalysis'), icon: Microscope },
    ]
    if (data) {
      if (worldviewEntries.length > 0) tabs.push({ key: 'worldview', label: t('refDetail.tabWorldview'), icon: Globe, count: worldviewEntries.length })
      if (characters.length > 0) tabs.push({ key: 'characters', label: t('refDetail.tabCharacters'), icon: Users2, count: characters.length })
      if (outline.length > 0) tabs.push({ key: 'outline', label: t('refDetail.tabOutline'), icon: ListTree, count: outline.length })
    }
    tabs.push({ key: 'info', label: t('refDetail.tabInfo'), icon: BookMarked })
    return tabs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characters.length, data, outline.length, worldviewEntries.length, t])
  const [activeTab, setActiveTab] = useState<DetailTab>(availableTabs[0]?.key || 'info')

  useEffect(() => {
    const validTabs = availableTabs.map(tab => tab.key)
    if (!validTabs.includes(activeTab)) setActiveTab(validTabs[0] || 'info')
  }, [activeTab, availableTabs])

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-serif font-bold shrink-0 ${glyphColor}`}>
          {reference.title.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs mb-0.5">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${config.color}`}>{config.label}</span>
            {data && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-blue-400/30 text-blue-400 bg-blue-400/10">{t('refDetail.imported')}</span>
            )}
          </div>
          <h3 className="text-xl font-bold font-serif text-text-primary">{reference.title}</h3>
          {reference.author && <p className="text-sm text-text-muted">{reference.author}</p>}
          {data?.sourceFilename && (
            <p className="text-[10px] text-text-muted mt-0.5">
              {t('refDetail.sourceFile')}{data.sourceFilename}
              {data.importedAt && ` · ${t('refDetail.importedAt')} ${new Date(data.importedAt).toLocaleString('zh-CN')}`}
            </p>
          )}
        </div>
        <button onClick={onDelete} className="p-1.5 text-text-muted hover:text-error rounded transition-colors shrink-0" aria-label={t('refDetail.delete')}>
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {availableTabs.length > 1 && (
        <div className="flex gap-1 border-b border-border pb-0">
          {availableTabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                aria-pressed={activeTab === tab.key}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-t transition-colors border-b-2 ${
                  activeTab === tab.key
                    ? 'border-accent text-accent font-medium'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {tab.label}
                {tab.count != null && <span className="opacity-60">({tab.count})</span>}
              </button>
            )
          })}
        </div>
      )}

      <div>
        {activeTab === 'info' && <ReferenceInfoTab reference={reference} onUpdate={onUpdate} t={t} />}
        {activeTab === 'worldview' && <ReferenceWorldviewTab entries={worldviewEntries} WORLDVIEW_LABELS={WORLDVIEW_LABELS} />}
        {activeTab === 'characters' && <ReferenceCharactersTab characters={characters} t={t} />}
        {activeTab === 'outline' && <ReferenceOutlineTab outline={outline} t={t} />}
        {activeTab === 'deep-analysis' && <ReferenceDeepAnalysisTab reference={reference} />}
      </div>
    </div>
  )
}

function ReferenceInfoTab({ reference, onUpdate, t }: { reference: Reference; onUpdate: (data: Partial<Reference>) => void; t: ReturnType<typeof useTranslation>['t'] }) {
  return (
    <div className="space-y-0 divide-y divide-border/40">
      <ReferenceInfoRow label={t('refDetail.titleLabel')}>
        <InlineInput value={reference.title} onChange={value => onUpdate({ title: value })} className="text-sm font-medium text-text-primary" />
      </ReferenceInfoRow>
      <ReferenceInfoRow label={t('refDetail.authorLabel')}>
        <InlineInput value={reference.author} onChange={value => onUpdate({ author: value })} placeholder={t('refDetail.authorPlaceholder')} className="text-sm text-text-primary" />
      </ReferenceInfoRow>
      <ReferenceInfoRow label={t('refDetail.typeLabel')}>
        <select value={reference.type} onChange={event => onUpdate({ type: event.target.value as ReferenceType })}
          aria-label={t('refDetail.refTypeLabel')} className="bg-bg-elevated border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent">
          <option value="story">{t('refDetail.typeStory')}</option>
          <option value="style">{t('refDetail.typeStyle')}</option>
          <option value="historical">{t('refDetail.typeHistorical')}</option>
        </select>
      </ReferenceInfoRow>
      <ReferenceInfoRow label={t('refDetail.notesLabel')}>
        <InlineTextarea value={reference.note} onChange={value => onUpdate({ note: value })} placeholder={t('refDetail.notesPlaceholder')} />
      </ReferenceInfoRow>
    </div>
  )
}

function ReferenceInfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-3">
      <span className="w-16 shrink-0 text-xs text-text-muted pt-0.5 text-right">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function ReferenceWorldviewTab({ entries, WORLDVIEW_LABELS }: { entries: [string, string][]; WORLDVIEW_LABELS: Record<string, string> }) {
  return (
    <div className="space-y-0 divide-y divide-border/40">
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-4 py-3">
          <span className="w-24 shrink-0 text-xs text-accent pt-0.5 text-right font-medium">{WORLDVIEW_LABELS[key] || key}</span>
          <div className="flex-1 min-w-0 text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{value}</div>
        </div>
      ))}
    </div>
  )
}

function ReferenceCharactersTab({ characters, t }: { characters: Array<Record<string, unknown>>; t: ReturnType<typeof useTranslation>['t'] }) {
  const [expanded, setExpanded] = useState<number | null>(null)
  return (
    <div className="space-y-0.5">
      {characters.map((character, index) => {
        const name = String(character.name || t('refDetail.unnamed'))
        const role = String(character.role || '')
        const description = character.shortDescription ? String(character.shortDescription) : ''
        const details = [
          [t('refDetail.charAppearance'), character.appearance], [t('refDetail.charPersonality'), character.personality], [t('refDetail.charBackground'), character.background],
          [t('refDetail.charMotivation'), character.motivation], [t('refDetail.charAbility'), character.abilities], [t('refDetail.charRelations'), character.relationships], [t('refDetail.charArc'), character.arc],
        ].filter(([, value]) => value && String(value).trim()) as [string, unknown][]
        const isExpanded = expanded === index
        return (
          <div key={index}>
            <button onClick={() => setExpanded(isExpanded ? null : index)}
              className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all ${isExpanded ? 'bg-accent/8' : 'hover:bg-bg-hover'}`}>
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${REFERENCE_GLYPH_COLORS[index % REFERENCE_GLYPH_COLORS.length]}`}>{name.charAt(0)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">{name}</p>
                {description && <p className="text-[10px] text-text-muted truncate">{description}</p>}
              </div>
              {role && <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-text-muted shrink-0">{role}</span>}
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />}
            </button>
            {isExpanded && details.length > 0 && (
              <div className="ml-12 space-y-0 divide-y divide-border/30 mb-2">
                {details.map(([label, value]) => (
                  <div key={label} className="flex gap-4 py-2">
                    <span className="w-12 shrink-0 text-xs text-text-muted text-right">{label}</span>
                    <div className="flex-1 text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{String(value)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ReferenceOutlineTab({ outline, t }: { outline: Array<Record<string, unknown>>; t: ReturnType<typeof useTranslation>['t'] }) {
  return <div className="space-y-1">{outline.map((node, index) => <ReferenceOutlineNode key={index} node={node} depth={0} t={t} />)}</div>
}

function ReferenceOutlineNode({ node, depth, t }: { node: Record<string, unknown>; depth: number; t: ReturnType<typeof useTranslation>['t'] }) {
  const title = String(node.title || t('refDetail.unnamed'))
  const summary = node.summary ? String(node.summary) : ''
  const children = Array.isArray(node.children) ? node.children : []
  const [collapsed, setCollapsed] = useState(depth > 1)
  return (
    <div style={{ paddingLeft: depth * 16 }}>
      <button onClick={() => children.length > 0 && setCollapsed(current => !current)}
        className="w-full text-left flex items-center gap-1.5 py-1.5 px-2 rounded hover:bg-bg-hover transition-colors">
        {children.length > 0 && (collapsed
          ? <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />
          : <ChevronDown className="w-3 h-3 text-text-muted shrink-0" />)}
        <span className="text-sm font-medium text-text-primary">{title}</span>
      </button>
      {summary && <p className="text-xs text-text-muted pl-8 pb-1">{summary}</p>}
      {!collapsed && children.map((child, index) => (
        <ReferenceOutlineNode key={index} node={child as Record<string, unknown>} depth={depth + 1} t={t} />
      ))}
    </div>
  )
}
