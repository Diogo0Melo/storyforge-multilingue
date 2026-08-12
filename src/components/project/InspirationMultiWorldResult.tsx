import { ArrowDownToLine, BookOpen, Check, Globe, Loader2, UserCircle } from 'lucide-react'
import type { ReverseMultiWorldResult } from '../../lib/ai/inspiration-reverse'
import { characterAxesLabel } from '../../lib/character/character-axes'
import { useDomainT } from '../../i18n'

interface Props {
  result: ReverseMultiWorldResult
  adopted: boolean
  adopting: boolean
  adoptionLocked?: boolean
  onAdopt: () => void
}

export default function InspirationMultiWorldResult({
  result,
  adopted,
  adopting,
  adoptionLocked = false,
  onAdopt,
}: Props) {
  const { t } = useDomainT('project')
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">{t('multiWorldResult.heading', { count: result.worlds.length })}</h3>
        <button
          onClick={onAdopt}
          disabled={adopting || adopted || adoptionLocked}
          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-40 transition-colors"
        >
          {adopting ? <Loader2 className="w-3 h-3 animate-spin" /> : adopted ? <Check className="w-3 h-3" /> : <ArrowDownToLine className="w-3 h-3" />}
          {adopted ? t('multiWorldResult.adopted') : adoptionLocked ? t('multiWorldResult.confirmFusionFirst') : t('multiWorldResult.createMultiWorld')}
        </button>
      </div>

      <div className="bg-bg-surface border border-border rounded-lg p-3 space-y-1 text-sm">
        <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1">
          <BookOpen className="w-3.5 h-3.5" /> {t('multiWorldResult.storylineHeading')}
        </div>
        {result.storyCore.logline && <FieldRow label={t('multiWorldResult.fieldLogline')} value={result.storyCore.logline} />}
        {result.storyCore.mainPlot && <FieldRow label={t('multiWorldResult.fieldMainPlot')} value={result.storyCore.mainPlot} />}
        {result.storyCore.centralConflict && <FieldRow label={t('multiWorldResult.fieldCentralConflict')} value={result.storyCore.centralConflict} />}
      </div>

      {result.worlds.map((world, index) => (
        <div key={index} className="bg-bg-surface border border-border rounded-lg p-3 space-y-1 text-sm">
          <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1">
            <Globe className="w-3.5 h-3.5" /> {world.name}
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-bg-elevated text-text-muted">{world.type}</span>
          </div>
          {world.worldOrigin && <FieldRow label={t('multiWorldResult.fieldWorldOrigin')} value={world.worldOrigin} />}
          {world.powerHierarchy && <FieldRow label={t('multiWorldResult.fieldPowerHierarchy')} value={world.powerHierarchy} />}
          {world.factionLayout && <FieldRow label={t('multiWorldResult.fieldFactionLayout')} value={world.factionLayout} />}
          {world.entryCondition && <FieldRow label={t('multiWorldResult.fieldEntryCondition')} value={world.entryCondition} />}
          {world.powerRestriction && <FieldRow label={t('multiWorldResult.fieldPowerRestriction')} value={world.powerRestriction} />}
        </div>
      ))}

      {result.characters.length > 0 && (
        <div className="bg-bg-surface border border-border rounded-lg p-3 space-y-1.5 text-sm">
          <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1">
            <UserCircle className="w-3.5 h-3.5" /> {t('multiWorldResult.initialCharacters', { count: result.characters.length })}
          </div>
          {result.characters.map((character, index) => (
            <div key={index} className="text-xs">
              <span className="text-text-primary font-medium">{character.name}</span>
              <span className="text-text-muted"> · {characterAxesLabel(character)}</span>
              {character.isCrossWorld
                ? <span className="ml-1 text-accent">{t('multiWorldResult.crossWorld')}</span>
                : character.homeWorld && <span className="ml-1 text-text-muted">@{character.homeWorld}</span>}
              {character.shortDescription && <span className="text-text-muted"> — {character.shortDescription}</span>}
            </div>
          ))}
        </div>
      )}

      {adopted && (
        <p className="text-xs text-green-400">
          {t('multiWorldResult.createdSuccess', { count: result.worlds.length })}
        </p>
      )}
    </section>
  )
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-text-muted">{label}: </span>
      <span className="text-text-primary">{value}</span>
    </div>
  )
}
