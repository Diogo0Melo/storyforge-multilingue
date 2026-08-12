import { dimensionsByGroup, defaultDimensionsForWeight, CHARACTER_DIMENSIONS, getDimensionLabel, getDimensionGroupLabel, type CharacterDimensionKey } from '../../lib/character/character-dimensions'
import type { CharacterRoleWeight } from '../../lib/types/character'
import { useDomainT } from '../../i18n'

const WEIGHT_PRESET_KEYS = {
  main: 'dimensionPicker.presetMain',
  secondary: 'dimensionPicker.presetSecondary',
  npc: 'dimensionPicker.presetNpc',
  extra: 'dimensionPicker.presetExtra',
} as const satisfies Record<CharacterRoleWeight, string>

interface Props {
  selected: Set<CharacterDimensionKey>
  onChange: (next: Set<CharacterDimensionKey>) => void
}

/**
 * 角色维度勾选器(共享)——生成时选"要生成哪些维度"、补全时选"要补哪些"。
 * 维度全部来自 CHARACTER_DIMENSIONS,加一个维度这里自动出现。
 */
export default function CharacterDimensionPicker({ selected, onChange }: Props) {
  const { t } = useDomainT('character')
  const toggle = (key: CharacterDimensionKey) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChange(next)
  }
  const applyPreset = (weight: CharacterRoleWeight) => onChange(new Set(defaultDimensionsForWeight(weight)))
  const allKeys = CHARACTER_DIMENSIONS.map(d => d.key)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-text-muted">{t('dimensionPicker.byWeight')}</span>
        {(Object.entries(WEIGHT_PRESET_KEYS) as Array<[CharacterRoleWeight, typeof WEIGHT_PRESET_KEYS[CharacterRoleWeight]]>).map(([weight, key]) => (
          <button key={weight} onClick={() => applyPreset(weight)}
            className="px-2 py-0.5 text-[11px] rounded bg-bg-elevated border border-border text-text-secondary hover:text-accent hover:border-accent/50">
            {t(key)}
          </button>
        ))}
        <span className="mx-1 text-border">|</span>
        <button onClick={() => onChange(new Set(allKeys))} className="px-2 py-0.5 text-[11px] rounded text-text-secondary hover:text-accent">{t('dimensionPicker.selectAll')}</button>
        <button onClick={() => onChange(new Set())} className="px-2 py-0.5 text-[11px] rounded text-text-secondary hover:text-accent">{t('dimensionPicker.clearAll')}</button>
        <span className="ml-auto text-[11px] text-text-muted">{t('dimensionPicker.selectedCount', { current: selected.size, total: allKeys.length })}</span>
      </div>
      <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
        {dimensionsByGroup().map(({ groupKey, dims }) => (
          <div key={groupKey}>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-text-muted/70">{getDimensionGroupLabel(groupKey)}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {dims.map(d => (
                <label key={d.key} className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                  <input type="checkbox" checked={selected.has(d.key)} onChange={() => toggle(d.key)} className="accent-accent" />
                  {getDimensionLabel(d.key)}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
