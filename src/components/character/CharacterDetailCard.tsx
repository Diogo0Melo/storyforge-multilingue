import { useState } from 'react'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Character, WorldGroup } from '../../lib/types'
import {
  MORAL_AXIS_LABEL_KEYS,
  ORDER_AXIS_LABEL_KEYS,
  ROLE_WEIGHT_LABEL_KEYS,
} from '../../lib/character/character-axes'
import { InlineInput, InlineTextarea } from '../shared/InlineEdit'
import CharacterAxesPicker from './CharacterAxesPicker'
import CharacterDimensionFields from './CharacterDimensionFields'
import CharacterStatusPanel from './CharacterStatusPanel'
import CharacterSupplementAction from './CharacterSupplementAction'
import CharacterWorldAffiliations from './CharacterWorldAffiliations'

interface Props {
  char: Character
  glyphColor: string
  projectId: number
  multiWorld?: boolean
  worldGroups?: WorldGroup[]
  onUpdateField: (field: keyof Character, value: string) => void
  onPatch: (patch: Partial<Character>) => void
  onReload: () => void
  onDelete: () => void
}

export default function CharacterDetailCard({
  char,
  glyphColor,
  projectId,
  multiWorld,
  worldGroups = [],
  onUpdateField,
  onPatch,
  onReload,
  onDelete,
}: Props) {
  const { t } = useTranslation('characters')
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-3xl font-serif font-bold shrink-0 ${glyphColor}`}>
          {char.name.charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-text-muted mb-0.5">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border border-border bg-bg-elevated text-text-secondary">
              {t(ROLE_WEIGHT_LABEL_KEYS[char.roleWeight])}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border border-border bg-bg-elevated text-text-secondary">
              {t(ORDER_AXIS_LABEL_KEYS[char.orderAxis])}{t(MORAL_AXIS_LABEL_KEYS[char.moralAxis])}
            </span>

            {multiWorld && (
              <select
                aria-label={t('detail.worldLabel')}
                value={char.isCrossWorld ? 'cross' : (char.homeWorldGroupId ?? '')}
                onChange={event => {
                  const value = event.target.value
                  onPatch(value === 'cross'
                    ? { isCrossWorld: true, homeWorldGroupId: null }
                    : {
                        isCrossWorld: false,
                        homeWorldGroupId: value ? Number(value) : null,
                        raceEntryId: null,
                        cultivationSystemId: null,
                        cultivationStageId: null,
                      })
                }}
                className="px-1.5 py-0.5 bg-bg-elevated text-text-secondary text-[10px] rounded border border-border focus:outline-none focus:border-accent cursor-pointer"
                title={t('detail.worldLabel')}
              >
                <option value="cross">🌐 {t('detail.crossWorld')}</option>
                {worldGroups.map(group => (
                  <option key={group.id} value={group.id}>{group.icon || '🌐'} {group.name}</option>
                ))}
              </select>
            )}
          </div>

          <InlineInput
            value={char.name}
            onChange={value => onUpdateField('name', value)}
            className="text-2xl font-bold font-serif text-text-primary"
          />
          <InlineInput
            value={char.shortDescription || ''}
            onChange={value => onUpdateField('shortDescription', value)}
            className={`text-sm mt-1 italic ${char.shortDescription ? 'text-text-secondary' : 'text-text-muted'}`}
            prefix={char.shortDescription ? '“' : undefined}
            suffix={char.shortDescription ? '”' : undefined}
            placeholder={t('detail.shortDescPlaceholder')}
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <CharacterSupplementAction
            character={char}
            projectId={projectId}
            worldGroupId={char.homeWorldGroupId ?? null}
            onDone={onReload}
          />
          <button
            onClick={() => setExpanded(value => !value)}
            className="p-1.5 text-text-muted hover:text-text-primary rounded transition-colors"
            aria-label={expanded ? t('detail.collapseDetail') : t('detail.expandDetail')}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-text-muted hover:text-error rounded transition-colors"
            aria-label={t('detail.deleteCharacter')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <CharacterAxesPicker
        roleWeight={char.roleWeight}
        moralAxis={char.moralAxis}
        orderAxis={char.orderAxis}
        onChange={axes => {
          if (!axes.roleWeight || !axes.moralAxis || !axes.orderAxis) return
          onPatch(axes as Pick<Character, 'roleWeight' | 'moralAxis' | 'orderAxis'>)
        }}
        compact
      />

      <CharacterStatusPanel projectId={projectId} characterName={char.name} />

      <CharacterWorldAffiliations
        character={char}
        projectId={projectId}
        worldGroups={worldGroups}
        onChange={onPatch}
      />

      {expanded && (
        <div className="space-y-4">
          <CharacterDimensionFields
            character={char}
            onChange={onPatch}
            exclude={['shortDescription']}
          />
          <div className="flex gap-2">
            <span className="w-20 flex-shrink-0 pt-1.5 text-xs text-text-muted">{t('detail.relationships')}</span>
            <div className="flex-1 min-w-0">
              <InlineTextarea
                value={char.relationships || ''}
                onChange={value => onUpdateField('relationships', value)}
                placeholder={t('detail.relationshipsPlaceholder')}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
