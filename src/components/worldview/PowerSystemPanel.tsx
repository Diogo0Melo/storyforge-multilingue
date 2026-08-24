import { useState, useEffect } from 'react'
import { useDomainT } from '../../i18n'
import { useWorldviewStore } from '../../stores/worldview'
import { useWorldGroupStore } from '../../stores/world-group'
import WorldGroupSwitcher from '../world-group/WorldGroupSwitcher'
import type { Project } from '../../lib/types'
import CultivationSystemsPanel from './CultivationSystemsPanel'
import {
  INITIAL_RECORD_TARGET_CLASS,
  initialRecordTargetAttributes,
  useInitialRecordTarget,
} from '../shared/initial-record-target'

export interface PowerSystemInitialRecordTarget {
  table: 'powerSystems' | 'cultivationSystems'
  recordId: number
}

interface Props {
  project: Project
  initialRecordTarget?: PowerSystemInitialRecordTarget | null
}

export default function PowerSystemPanel({ project, initialRecordTarget }: Props) {
  const { t } = useDomainT('worldview')
  const { powerSystem, savePowerSystem, loadAll } = useWorldviewStore()
  const activeGroupId = useWorldGroupStore(s => s.activeGroupId)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [levels, setLevels] = useState('')
  const [rules, setRules] = useState('')
  const initialPowerSystemId = initialRecordTarget?.table === 'powerSystems'
    ? initialRecordTarget.recordId
    : null

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
  useInitialRecordTarget(initialPowerSystemId, powerSystem?.id === initialPowerSystemId)

  return (
    <div
      {...initialRecordTargetAttributes(powerSystem?.id === initialPowerSystemId, powerSystem?.id)}
      className={`max-w-3xl rounded-xl ${powerSystem?.id === initialPowerSystemId ? INITIAL_RECORD_TARGET_CLASS : ''}`}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-text-primary">{t('powerSystem.title')}</h2>
        {project.enableMultiWorld && <WorldGroupSwitcher />}
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">{t('powerSystem.nameLabel')}</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={handleSave}
            placeholder={t('powerSystem.namePlaceholder')}
            className="w-full px-3 py-2 bg-bg-surface border border-border rounded-md text-text-primary text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">{t('powerSystem.descriptionLabel')}</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            onBlur={handleSave}
            placeholder={t('powerSystem.descriptionPlaceholder')}
            rows={3}
            className="w-full p-3 bg-bg-surface border border-border rounded-lg text-text-primary text-sm resize-y focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">{t('powerSystem.levelsLabel')}</label>
          <textarea
            value={levels}
            onChange={e => setLevels(e.target.value)}
            onBlur={handleSave}
            placeholder={t('powerSystem.levelsPlaceholder')}
            rows={5}
            className="w-full p-3 bg-bg-surface border border-border rounded-lg text-text-primary text-sm resize-y focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">{t('powerSystem.rulesLabel')}</label>
          <textarea
            value={rules}
            onChange={e => setRules(e.target.value)}
            onBlur={handleSave}
            placeholder={t('powerSystem.rulesPlaceholder')}
            rows={4}
            className="w-full p-3 bg-bg-surface border border-border rounded-lg text-text-primary text-sm resize-y focus:outline-none focus:border-accent"
          />
        </div>
      </div>
      <CultivationSystemsPanel
        project={project}
        initialSystemId={initialRecordTarget?.table === 'cultivationSystems'
          ? initialRecordTarget.recordId
          : null}
      />
    </div>
  )
}
