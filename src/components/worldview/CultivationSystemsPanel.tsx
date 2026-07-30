import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitBranch, Plus, Trash2 } from 'lucide-react'
import type { Project } from '../../lib/types'
import {
  cultivationStageTiers,
  parseCultivationStages,
  stringifyCultivationStages,
  validateCultivationStages,
  type CultivationStage,
  type CultivationSystem,
} from '../../lib/types/cultivation'
import { useCultivationStore } from '../../stores/cultivation'
import { useWorldGroupStore } from '../../stores/world-group'
import { useDialog } from '../shared/Dialog'
import { useToast } from '../shared/Toast'
import { InlineInput, InlineTextarea } from '../shared/InlineEdit'

function nextStageId(): string {
  return `stage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export default function CultivationSystemsPanel({ project }: { project: Project }) {
  const { t } = useTranslation('panels')
  const dialog = useDialog()
  const toast = useToast()
  const { systems, loadAll, addSystem, updateSystem, deleteSystem } = useCultivationStore()
  const activeGroupId = useWorldGroupStore(state => state.activeGroupId)
  const groups = useWorldGroupStore(state => state.groups)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => { loadAll(project.id!) }, [loadAll, project.id])

  const activeBelongsToProject = groups.some(group =>
    group.projectId === project.id && group.id === activeGroupId)
  const worldGroupId = project.enableMultiWorld
    ? (activeBelongsToProject ? activeGroupId! : undefined)
    : null
  const scoped = useMemo(() => worldGroupId === undefined
    ? []
    : systems.filter(system => (system.worldGroupId ?? null) === worldGroupId),
  [systems, worldGroupId])
  const selected = scoped.find(system => system.id === selectedId) ?? scoped[0] ?? null

  useEffect(() => {
    if (selected?.id !== selectedId) setSelectedId(selected?.id ?? null)
  }, [selected, selectedId])

  const handleAdd = async () => {
    if (worldGroupId === undefined) {
      toast.error(t('cultivationSystem.emptyHint'))
      return
    }
    const name = (await dialog.prompt({
      title: t('cultivationSystem.addSystem'),
      placeholder: t('cultivationSystem.subtitle'),
    }))?.trim()
    if (!name) return
    const id = await addSystem({
      projectId: project.id!,
      worldGroupId,
      name,
      description: '',
      stages: '[]',
    })
    setSelectedId(id)
  }

  const handleDelete = async (system: CultivationSystem) => {
    if (!await dialog.confirm({
      title: t('cultivationSystem.deleteSystemAria'),
      message: t('cultivationSystem.subtitle'),
      confirmText: t('cultivationSystem.deleteSystemAria'),
    })) return
    await deleteSystem(system.id!)
  }

  return (
    <section className="mt-8 border-t border-border pt-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-accent" /> {t('cultivationSystem.title')}
          </h2>
          <p className="text-xs text-text-muted mt-1">
            {t('cultivationSystem.subtitle')}
          </p>
        </div>
        <button
          onClick={handleAdd}
          disabled={worldGroupId === undefined}
          className="px-3 py-1.5 text-xs rounded-md bg-accent text-white disabled:opacity-40 inline-flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> {t('cultivationSystem.addSystem')}
        </button>
      </div>

      {scoped.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl py-10 text-center text-sm text-text-muted">
          {t('cultivationSystem.emptyHint')}
        </div>
      ) : (
        <div className="grid grid-cols-[11rem_minmax(0,1fr)] gap-4 min-h-[26rem]">
          <div className="space-y-1">
            {scoped.map(system => (
              <button
                key={system.id}
                onClick={() => setSelectedId(system.id!)}
                className={`w-full px-3 py-2 rounded-lg text-left text-sm border ${
                  selected?.id === system.id
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-transparent hover:bg-bg-hover text-text-secondary'
                }`}
              >
                <span className="block truncate">{system.name}</span>
                <span className="text-[10px] text-text-muted">
                  {t('cultivationSystem.stageCount', { count: parseCultivationStages(system.stages).length })}
                </span>
              </button>
            ))}
          </div>
          {selected && (
            <CultivationSystemEditor
              key={selected.id}
              system={selected}
              onUpdate={patch => updateSystem(selected.id!, patch)}
              onDelete={() => handleDelete(selected)}
            />
          )}
        </div>
      )}
    </section>
  )
}

function CultivationSystemEditor({
  system,
  onUpdate,
  onDelete,
}: {
  system: CultivationSystem
  onUpdate: (patch: Partial<CultivationSystem>) => Promise<void>
  onDelete: () => void
}) {
  const { t } = useTranslation('panels')
  const toast = useToast()
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const stages = useMemo(() => parseCultivationStages(system.stages), [system.stages])
  const tiers = useMemo(() => cultivationStageTiers(stages), [stages])
  const maxTier = Math.max(0, ...tiers.values())
  const selectedStage = stages.find(stage => stage.id === selectedStageId) ?? null

  const saveStages = async (next: CultivationStage[]) => {
    const validation = validateCultivationStages(next)
    if (!validation.valid) {
      toast.error(validation.errors[0])
      return false
    }
    await onUpdate({ stages: stringifyCultivationStages(next) })
    return true
  }
  const patchStage = async (id: string, patch: Partial<CultivationStage>) => {
    await saveStages(stages.map(stage => stage.id === id ? { ...stage, ...patch } : stage))
  }
  const addStage = async () => {
    const id = nextStageId()
    const deepest = [...stages].sort((left, right) =>
      (tiers.get(right.id) ?? 0) - (tiers.get(left.id) ?? 0))[0]
    const next: CultivationStage = {
      id,
      name: t('cultivationSystem.newStage'),
      features: '',
      breakthrough: '',
      parentStageIds: deepest ? [deepest.id] : [],
      branchLabel: '',
    }
    if (await saveStages([...stages, next])) setSelectedStageId(id)
  }
  const removeStage = async (id: string) => {
    const next = stages
      .filter(stage => stage.id !== id)
      .map(stage => ({ ...stage, parentStageIds: stage.parentStageIds.filter(parentId => parentId !== id) }))
    if (await saveStages(next)) setSelectedStageId(null)
  }

  return (
    <div className="border border-border rounded-xl bg-bg-surface p-4 min-w-0">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <InlineInput
            value={system.name}
            onChange={name => onUpdate({ name: name.trim() || system.name })}
            className="text-lg font-semibold text-text-primary"
          />
          <InlineTextarea
            value={system.description}
            onChange={description => onUpdate({ description })}
            placeholder={t('cultivationSystem.descriptionPlaceholder')}
          />
        </div>
        <button onClick={onDelete} aria-label={t('cultivationSystem.deleteSystemAria')} className="p-1.5 text-text-muted hover:text-error">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center justify-between mt-5 mb-2">
        <h3 className="text-sm font-medium text-text-secondary">{t('cultivationSystem.stageDag')}</h3>
        <button onClick={addStage} className="text-xs text-accent inline-flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> {t('cultivationSystem.addNextStage')}
        </button>
      </div>
      <div className="overflow-x-auto border border-border rounded-lg bg-bg-base/50 p-3">
        {stages.length === 0 ? (
          <button onClick={addStage} className="w-full py-10 text-xs text-text-muted hover:text-accent">
            {t('cultivationSystem.addFirstStage')}
          </button>
        ) : (
          <div className="flex items-stretch gap-5 min-w-max">
            {Array.from({ length: maxTier + 1 }, (_, tier) => (
              <div key={tier} className="w-40 space-y-2">
                <div className="text-[10px] text-text-muted text-center">{t('cultivationSystem.tierLabel', { tier })}</div>
                {stages
                  .filter(stage => (tiers.get(stage.id) ?? 0) === tier)
                  .map(stage => (
                    <button
                      key={stage.id}
                      onClick={() => setSelectedStageId(stage.id)}
                      className={`w-full rounded-lg border p-2 text-left ${
                        selectedStageId === stage.id
                          ? 'border-accent bg-accent/10'
                          : 'border-border bg-bg-surface hover:border-accent/40'
                      }`}
                    >
                      <span className="block text-sm font-medium text-text-primary truncate">{stage.name}</span>
                      {stage.branchLabel && <span className="text-[10px] text-accent">{stage.branchLabel}</span>}
                      {stage.parentStageIds.length > 0 && (
                        <span className="block text-[10px] text-text-muted mt-1 truncate">
                          ← {stage.parentStageIds.map(id => stages.find(row => row.id === id)?.name ?? id).join(' + ')}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedStage && (
        <div className="mt-4 border border-border rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-[11px] text-text-muted mb-1">{t('cultivationSystem.stageName')}</label>
              <InlineInput
                value={selectedStage.name}
                onChange={name => patchStage(selectedStage.id, { name })}
                className="text-sm font-medium text-text-primary"
              />
            </div>
            <button
              onClick={() => removeStage(selectedStage.id)}
              aria-label={t('cultivationSystem.deleteStageAria')}
              className="p-1.5 text-text-muted hover:text-error"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="block text-[11px] text-text-muted mb-1">{t('cultivationSystem.branchLabel')}</label>
            <InlineInput
              value={selectedStage.branchLabel || ''}
              onChange={branchLabel => patchStage(selectedStage.id, { branchLabel })}
              placeholder={t('cultivationSystem.branchPlaceholder')}
              className="text-sm text-text-primary"
            />
          </div>
          <div>
            <label className="block text-[11px] text-text-muted mb-1">{t('cultivationSystem.featuresLabel')}</label>
            <InlineTextarea
              value={selectedStage.features || ''}
              onChange={features => patchStage(selectedStage.id, { features })}
              placeholder={t('cultivationSystem.featuresPlaceholder')}
            />
          </div>
          <div>
            <label className="block text-[11px] text-text-muted mb-1">{t('cultivationSystem.breakthroughLabel')}</label>
            <InlineTextarea
              value={selectedStage.breakthrough || ''}
              onChange={breakthrough => patchStage(selectedStage.id, { breakthrough })}
              placeholder={t('cultivationSystem.breakthroughPlaceholder')}
            />
          </div>
          <div>
            <label className="block text-[11px] text-text-muted mb-1">{t('cultivationSystem.prerequisiteLabel')}</label>
            <div className="flex flex-wrap gap-1.5">
              {stages.filter(stage => stage.id !== selectedStage.id).map(stage => (
                <label key={stage.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border">
                  <input
                    type="checkbox"
                    checked={selectedStage.parentStageIds.includes(stage.id)}
                    onChange={() => {
                      const current = selectedStage.parentStageIds
                      patchStage(selectedStage.id, {
                        parentStageIds: current.includes(stage.id)
                          ? current.filter(id => id !== stage.id)
                          : [...current, stage.id],
                      })
                    }}
                  />
                  {stage.name}
                </label>
              ))}
              {stages.length === 1 && <span className="text-xs text-text-muted">{t('cultivationSystem.noPrerequisite')}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
