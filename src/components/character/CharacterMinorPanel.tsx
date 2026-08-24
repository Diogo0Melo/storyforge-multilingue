import { useState, useEffect } from 'react'
import { Plus, Trash2, User } from 'lucide-react'
import { useDomainT } from '../../i18n'
import { useCharacterStore } from '../../stores/character'
import type { Project, Character } from '../../lib/types'
import { filterCharactersByRoleWeight } from '../../lib/character/character-axes'
import CharacterDimensionFields from './CharacterDimensionFields'
import CharacterSupplementAction from './CharacterSupplementAction'
import { CInput, CTextarea } from '../shared/CompositionInput'

interface Props {
  project: Project
}

/** v3 §2.1 — 次要角色（小卡片网格视图） */
export default function CharacterMinorPanel({ project }: Props) {
  const { t } = useDomainT('character')
  const { characters, loadAll, addCharacter, updateCharacter, deleteCharacter } = useCharacterStore()
  const [editing, setEditing] = useState<number | null>(null)

  useEffect(() => { loadAll(project.id!) }, [project.id, loadAll])

  const list = filterCharactersByRoleWeight(characters, 'secondary')

  const handleAdd = async () => {
    const id = await addCharacter({
      projectId: project.id!,
      name: t('minor.defaultName'),
      roleWeight: 'secondary',
      moralAxis: 'neutral',
      orderAxis: 'neutral',
      shortDescription: '',
      appearance: '', personality: '', background: '',
      motivation: '', abilities: '', relationships: '', arc: '',
    })
    setEditing(id)
  }

  const update = (id: number, patch: Partial<Character>) => updateCharacter(id, patch)

  return (
    <div className="max-w-5xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary mb-1">{t('minor.title')}</h2>
          <p className="text-sm text-text-muted">{t('minor.subtitle')}</p>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-sm rounded hover:bg-accent-hover"
        >
          <Plus className="w-4 h-4" /> {t('minor.add')}
        </button>
      </div>

      {list.length === 0 ? (
        <div className="text-center py-12 text-text-muted text-sm">
          {t('minor.empty')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map(c => (
            <div
              key={c.id}
              className="bg-bg-surface border border-border rounded-xl p-3 hover:border-accent/50 transition-colors"
            >
              <div className="flex items-start gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-text-secondary" />
                </div>
                <CInput
                  value={c.name}
                  onChange={e => update(c.id!, { name: e.target.value })}
                  className="flex-1 px-2 py-1 bg-bg-base border border-border rounded text-sm font-medium text-text-primary focus:outline-none focus:border-accent"
                />
                <CharacterSupplementAction
                  character={c}
                  project={project}
                  worldGroupId={c.homeWorldGroupId ?? null}
                  onDone={() => loadAll(project.id!)}
                  compact
                />
                <button
                  onClick={() => deleteCharacter(c.id!)}
                  className="p-1 text-text-muted hover:text-error"
                  title={t('minor.deleteTitle')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <CTextarea
                value={c.shortDescription}
                onChange={e => update(c.id!, { shortDescription: e.target.value })}
                placeholder={t('minor.shortDescriptionPlaceholder')}
                rows={2}
                className="w-full px-2 py-1 bg-bg-base border border-border rounded text-xs text-text-primary resize-none focus:outline-none focus:border-accent"
              />
              {(editing === c.id) ? (
                <div className="mt-2 space-y-1.5">
                  <CharacterDimensionFields character={c} onChange={patch => update(c.id!, patch)} exclude={['shortDescription']} />
                  <button
                    onClick={() => setEditing(null)}
                    className="text-xs text-accent hover:underline"
                  >
                    {t('minor.collapse')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEditing(c.id!)}
                  className="mt-2 text-xs text-text-secondary hover:text-accent"
                >
                  {t('minor.expand')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
