import { useEffect, useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { useDomainT } from '../../i18n'
import { useCharacterStore } from '../../stores/character'
import type { Project, Character } from '../../lib/types'
import { filterCharactersByRoleWeight } from '../../lib/character/character-axes'
import CharacterDimensionFields from './CharacterDimensionFields'
import CharacterSupplementAction from './CharacterSupplementAction'
import { filledDimensions } from '../../lib/character/character-dimensions'
import { CInput } from '../shared/CompositionInput'

interface Props {
  project: Project
}

/** v3 §2.1 — NPC（紧凑列表视图 + 可展开完整设定） */
export default function CharacterNPCPanel({ project }: Props) {
  const { t } = useDomainT('character')
  const { characters, loadAll, addCharacter, updateCharacter, deleteCharacter } = useCharacterStore()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  useEffect(() => { loadAll(project.id!) }, [project.id, loadAll])

  const toggle = (id: number) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const list = filterCharactersByRoleWeight(characters, 'npc')

  const handleAdd = () => addCharacter({
    projectId: project.id!,
    name: t('npc.defaultName'),
    roleWeight: 'npc',
    moralAxis: 'neutral',
    orderAxis: 'neutral',
    shortDescription: '',
    appearance: '', personality: '', background: '',
    motivation: '', abilities: '', relationships: '', arc: '',
  })

  const update = (id: number, patch: Partial<Character>) => updateCharacter(id, patch)

  return (
    <div className="max-w-5xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary mb-1">{t('npc.title')}</h2>
          <p className="text-sm text-text-muted">{t('npc.subtitle')}</p>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-sm rounded hover:bg-accent-hover"
        >
          <Plus className="w-4 h-4" /> {t('npc.add')}
        </button>
      </div>

      {list.length === 0 ? (
        <div className="text-center py-12 text-text-muted text-sm">
          {t('npc.empty')}
        </div>
      ) : (
        <div className="bg-bg-surface border border-border rounded-xl divide-y divide-border">
          {list.map(c => {
            const filled = filledDimensions(c).filter(k => k !== 'shortDescription' && k !== 'location').length
            const isOpen = expanded.has(c.id!)
            return (
            <div key={c.id} className="p-3 hover:bg-bg-hover transition-colors">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggle(c.id!)}
                  className="p-1 text-text-muted hover:text-accent"
                  title={isOpen ? t('npc.collapseTitle') : t('npc.expandTitle')}
                >
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <CInput
                  value={c.name}
                  onChange={e => update(c.id!, { name: e.target.value })}
                  placeholder={t('npc.namePlaceholder')}
                  className="w-32 px-2 py-1 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
                />
                <CInput
                  value={c.location || ''}
                  onChange={e => update(c.id!, { location: e.target.value })}
                  placeholder={t('npc.locationPlaceholder')}
                  className="w-24 px-2 py-1 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
                />
                <CInput
                  value={c.shortDescription || ''}
                  onChange={e => update(c.id!, { shortDescription: e.target.value })}
                  placeholder={t('npc.descriptionPlaceholder')}
                  className="flex-1 min-w-0 px-2 py-1 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
                />
                <span className="flex-shrink-0 text-[11px] text-text-muted whitespace-nowrap" title={t('npc.filledTitle')}>{t('npc.filledCount', { count: filled })}</span>
                <CharacterSupplementAction
                  character={c}
                  project={project}
                  worldGroupId={c.homeWorldGroupId ?? null}
                  onDone={() => loadAll(project.id!)}
                  compact
                />
                <button
                  onClick={() => deleteCharacter(c.id!)}
                  className="p-1 text-text-muted hover:text-error flex-shrink-0"
                  title={t('npc.deleteTitle')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {isOpen && (
                <div className="mt-3 pl-7">
                  <CharacterDimensionFields character={c} onChange={patch => update(c.id!, patch)} exclude={['shortDescription', 'location']} />
                </div>
              )}
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
