import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorldviewStore } from '../../stores/worldview'
import { useWorldGroupStore } from '../../stores/world-group'
import WorldGroupSwitcher from '../world-group/WorldGroupSwitcher'
import type { Project } from '../../lib/types'
import CultivationSystemsPanel from './CultivationSystemsPanel'

interface Props {
  project: Project
}

export default function PowerSystemPanel({ project }: Props) {
  const { t } = useTranslation('panels')
  const { powerSystem, savePowerSystem, loadAll } = useWorldviewStore()
  const activeGroupId = useWorldGroupStore(s => s.activeGroupId)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [levels, setLevels] = useState('')
  const [rules, setRules] = useState('')

  useEffect(() => {
    loadAll(project.id!, project.enableMultiWorld ? activeGroupId : null)
  }, [project.id, project.enableMultiWorld, activeGroupId, loadAll])

  useEffect(() => {
    if (powerSystem) {
      setName(powerSystem.name || '')
      setDescription(powerSystem.description || '')
      setLevels(powerSystem.levels || '')
      setRules(powerSystem.rules || '')
    }
  }, [powerSystem])

  const handleSave = async () => {
    await savePowerSystem({ projectId: project.id!, name, description, levels, rules })
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-text-primary">⚡ {t('worldview.power.title' as any)}</h2>
        {project.enableMultiWorld && <WorldGroupSwitcher />}
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">{t('worldview.power.name' as any)}</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={handleSave}
            placeholder={t('worldview.power.namePlaceholder' as any)}
            className="w-full px-3 py-2 bg-bg-surface border border-border rounded-md text-text-primary text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">{t('worldview.power.description' as any)}</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            onBlur={handleSave}
            placeholder={t('worldview.power.descPlaceholder' as any)}
            rows={3}
            className="w-full p-3 bg-bg-surface border border-border rounded-lg text-text-primary text-sm resize-y focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">{t('worldview.power.levels' as any)}</label>
          <textarea
            value={levels}
            onChange={e => setLevels(e.target.value)}
            onBlur={handleSave}
            placeholder={t('worldview.power.levelsPlaceholder' as any)}
            rows={5}
            className="w-full p-3 bg-bg-surface border border-border rounded-lg text-text-primary text-sm resize-y focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">{t('worldview.power.rules' as any)}</label>
          <textarea
            value={rules}
            onChange={e => setRules(e.target.value)}
            onBlur={handleSave}
            placeholder={t('worldview.power.rulesPlaceholder' as any)}
            rows={4}
            className="w-full p-3 bg-bg-surface border border-border rounded-lg text-text-primary text-sm resize-y focus:outline-none focus:border-accent"
          />
        </div>
      </div>
      <CultivationSystemsPanel project={project} />
    </div>
  )
}
