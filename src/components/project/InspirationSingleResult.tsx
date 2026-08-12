import {
  ArrowDownToLine,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Globe,
  Loader2,
  UserCircle,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { ReverseCharacter, ReverseResult } from '../../lib/ai/inspiration-reverse'
import { characterAxesLabel } from '../../lib/character/character-axes'
import { useDomainT } from '../../i18n'

interface Props {
  result: ReverseResult
  expandedSections: ReadonlySet<string>
  adoptedSections: ReadonlySet<string>
  selectedChars: ReadonlySet<number>
  adopting: boolean
  adoptionLocked?: boolean
  onToggleSection: (key: string) => void
  onToggleCharacter: (index: number) => void
  onAdoptWorldview: () => void
  onAdoptStoryCore: () => void
  onAdoptCharacters: () => void
  onAdoptAll: () => void
}

export default function InspirationSingleResult({
  result,
  expandedSections,
  adoptedSections,
  selectedChars,
  adopting,
  adoptionLocked = false,
  onToggleSection,
  onToggleCharacter,
  onAdoptWorldview,
  onAdoptStoryCore,
  onAdoptCharacters,
  onAdoptAll,
}: Props) {
  const { t } = useDomainT('project')
  const allAdopted = adoptedSections.has('worldview')
    && adoptedSections.has('storyCore')
    && adoptedSections.has('characters')

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">{t('singleResult.heading')}</h3>
        {!allAdopted && (
          <button
            onClick={onAdoptAll}
            disabled={adopting || adoptionLocked}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-40 transition-colors"
          >
            {adopting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowDownToLine className="w-3 h-3" />}
            {adoptionLocked ? t('singleResult.confirmFusionFirst') : t('singleResult.adoptAll')}
          </button>
        )}
      </div>

      <ResultCard
        title={t('singleResult.worldviewTitle')}
        icon={<Globe className="w-4 h-4 text-blue-500" />}
        expanded={expandedSections.has('worldview')}
        onToggle={() => onToggleSection('worldview')}
        adopted={adoptedSections.has('worldview')}
        onAdopt={onAdoptWorldview}
        adopting={adopting}
        adoptionLocked={adoptionLocked}
        adoptLabel={t('singleResult.adoptWorldview')}
      >
        <div className="space-y-2 text-sm">
          {result.worldview.worldOrigin && <FieldRow label={t('singleResult.fieldWorldOrigin')} value={result.worldview.worldOrigin} />}
          {result.worldview.powerHierarchy && <FieldRow label={t('singleResult.fieldPowerHierarchy')} value={result.worldview.powerHierarchy} />}
          {result.worldview.continentLayout && <FieldRow label={t('singleResult.fieldContinentLayout')} value={result.worldview.continentLayout} />}
          {result.worldview.climateByRegion && <FieldRow label={t('singleResult.fieldClimateByRegion')} value={result.worldview.climateByRegion} />}
          {result.worldview.historyLine && <FieldRow label={t('singleResult.fieldHistoryLine')} value={result.worldview.historyLine} />}
          {result.worldview.races && <FieldRow label={t('singleResult.fieldRaces')} value={result.worldview.races} />}
          {result.worldview.factionLayout && <FieldRow label={t('singleResult.fieldFactionLayout')} value={result.worldview.factionLayout} />}
        </div>
      </ResultCard>

      <ResultCard
        title={t('singleResult.storyCoreTitle')}
        icon={<BookOpen className="w-4 h-4 text-purple-500" />}
        expanded={expandedSections.has('storyCore')}
        onToggle={() => onToggleSection('storyCore')}
        adopted={adoptedSections.has('storyCore')}
        onAdopt={onAdoptStoryCore}
        adopting={adopting}
        adoptionLocked={adoptionLocked}
        adoptLabel={t('singleResult.adoptStoryCore')}
      >
        <div className="space-y-2 text-sm">
          {result.storyCore.logline && <FieldRow label={t('singleResult.fieldLogline')} value={result.storyCore.logline} highlight />}
          {result.storyCore.theme && <FieldRow label={t('singleResult.fieldTheme')} value={result.storyCore.theme} />}
          {result.storyCore.centralConflict && <FieldRow label={t('singleResult.fieldCentralConflict')} value={result.storyCore.centralConflict} />}
          {result.storyCore.plotPattern && <FieldRow label={t('singleResult.fieldPlotPattern')} value={result.storyCore.plotPattern} />}
          {result.storyCore.mainPlot && <FieldRow label={t('singleResult.fieldMainPlot')} value={result.storyCore.mainPlot} />}
        </div>
      </ResultCard>

      <ResultCard
        title={t('singleResult.charactersTitle', { count: result.characters.length })}
        icon={<UserCircle className="w-4 h-4 text-orange-500" />}
        expanded={expandedSections.has('characters')}
        onToggle={() => onToggleSection('characters')}
        adopted={adoptedSections.has('characters')}
        onAdopt={onAdoptCharacters}
        adopting={adopting}
        adoptionLocked={adoptionLocked}
        adoptLabel={t('singleResult.adoptCharacters', { count: selectedChars.size })}
      >
        <div className="space-y-3">
          {result.characters.map((character, index) => (
            <CharacterCard
              key={index}
              char={character}
              selected={selectedChars.has(index)}
              onToggle={() => onToggleCharacter(index)}
              adopted={adoptedSections.has('characters')}
            />
          ))}
        </div>
      </ResultCard>
    </section>
  )
}

function ResultCard({
  title,
  icon,
  expanded,
  onToggle,
  adopted,
  onAdopt,
  adopting,
  adoptionLocked,
  adoptLabel,
  children,
}: {
  title: string
  icon: ReactNode
  expanded: boolean
  onToggle: () => void
  adopted: boolean
  onAdopt: () => void
  adopting: boolean
  adoptionLocked: boolean
  adoptLabel: string
  children: ReactNode
}) {
  const { t } = useDomainT('project')
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-2.5 bg-bg-surface cursor-pointer hover:bg-bg-hover transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-text-muted" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />}
          {icon}
          <span className="text-sm font-medium text-text-primary">{title}</span>
        </div>
        {adopted ? (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Check className="w-3.5 h-3.5" /> {t('singleResult.adopted')}
          </span>
        ) : (
          <button
            onClick={event => {
              event.stopPropagation()
              onAdopt()
            }}
            disabled={adopting || adoptionLocked}
            className="flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-40 transition-colors"
          >
            {adopting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowDownToLine className="w-3 h-3" />}
            {adoptionLocked ? t('singleResult.confirmFusionFirst') : adoptLabel}
          </button>
        )}
      </div>
      {expanded && <div className="px-4 py-3 border-t border-border">{children}</div>}
    </div>
  )
}

function FieldRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <span className="text-xs text-text-muted">{label}: </span>
      <span className={`text-text-primary ${highlight ? 'font-medium text-accent' : ''}`}>{value}</span>
    </div>
  )
}

function CharacterCard({
  char,
  selected,
  onToggle,
  adopted,
}: {
  char: ReverseCharacter
  selected: boolean
  onToggle: () => void
  adopted: boolean
}) {
  const { t } = useDomainT('project')
  return (
    <div className={`border rounded-lg p-3 transition-colors ${selected ? 'border-accent bg-accent/10' : 'border-border'}`}>
      <div className="flex items-center gap-2 mb-2">
        {!adopted && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="accent-accent"
          />
        )}
        <span className="text-sm font-medium text-text-primary">{char.name}</span>
        <span className="text-xs px-1.5 py-0.5 bg-bg-hover rounded text-text-muted">
          {characterAxesLabel(char)}
        </span>
      </div>
      {char.shortDescription && <p className="text-xs text-accent mb-1">{char.shortDescription}</p>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-muted">
        {char.personality && <span>{t('singleResult.personality')}: {char.personality}</span>}
        {char.motivation && <span>{t('singleResult.motivation')}: {char.motivation}</span>}
        {char.background && <span className="col-span-2">{t('singleResult.background')}: {char.background}</span>}
        {char.arc && <span className="col-span-2">{t('singleResult.arc')}: {char.arc}</span>}
      </div>
    </div>
  )
}
