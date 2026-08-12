import { CTextarea } from '../shared/CompositionInput'
import { useState } from 'react'
import { Save, X, ChevronDown } from 'lucide-react'
import { useProjectStore } from '../../stores/project'
import { useWorldGroupStore } from '../../stores/world-group'
import type { Project } from '../../lib/types'
import { GENRE_OPTIONS } from '../../lib/types'
import { useDomainT } from '../../i18n'

// Group by group
const GENRE_GROUPS = Array.from(
  GENRE_OPTIONS.reduce((map, opt) => {
    if (!map.has(opt.group)) map.set(opt.group, [])
    map.get(opt.group)!.push(opt)
    return map
  }, new Map<string, typeof GENRE_OPTIONS[number][]>())
)

interface ProjectInfoPanelProps {
  project: Project
  onUpdate: (project: Project) => void
}

export default function ProjectInfoPanel({ project, onUpdate }: ProjectInfoPanelProps) {
  const { t } = useDomainT('project')
  const { updateProject } = useProjectStore()
  const [form, setForm] = useState({
    name: project.name,
    genre: project.genre,
    genres: project.genres?.length ? project.genres : (project.genre ? [project.genre] : []),
    description: project.description,
    targetWordCount: project.targetWordCount,
  })
  const [saving, setSaving] = useState(false)
  const [showGenreDropdown, setShowGenreDropdown] = useState(false)

  const handleSave = async () => {
    if (!project.id) return
    setSaving(true)
    const updates = {
      name: form.name,
      genre: form.genres[0] || form.genre,
      genres: form.genres,
      description: form.description,
      targetWordCount: form.targetWordCount,
    }
    await updateProject(project.id, updates)
    onUpdate({ ...project, ...updates, updatedAt: Date.now() })
    setSaving(false)
  }

  const toggleGenre = (value: string) => {
    setForm(f => ({
      ...f,
      genres: f.genres.includes(value)
        ? f.genres.filter(g => g !== value)
        : [...f.genres, value],
    }))
  }

  const getGenreLabels = (genres: string[]) => {
    if (!genres || genres.length === 0) return t('projectInfo.genrePlaceholder')
    return genres
      .slice(0, 3)
      .map(v => {
        const opt = GENRE_OPTIONS.find(o => o.value === v)
        return opt ? t(`project:${opt.labelKey}`) : v
      })
      .join(' · ') + (genres.length > 3 ? ` +${genres.length - 3}` : '')
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-text-primary">{t('projectInfo.heading')}</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors text-sm font-medium"
        >
          <Save className="w-4 h-4" />
          {saving ? t('projectInfo.saving') : t('projectInfo.save')}
        </button>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-sm text-text-secondary mb-1.5">{t('projectInfo.nameLabel')}</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1.5">
            {t('projectInfo.genreLabel')}
            {form.genres.length > 0 && <span className="ml-1.5 text-accent text-xs">{' '}{t('projectInfo.genreSelected', { count: form.genres.length })}</span>}
          </label>
          {/* Selected tags */}
          {form.genres.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {form.genres.map(g => {
                const opt = GENRE_OPTIONS.find(o => o.value === g)
                return (
                  <span key={g} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                    {opt ? t(`project:${opt.labelKey}`) : g}
                    <button onClick={() => toggleGenre(g)} className="hover:text-error"><X className="w-2.5 h-2.5" /></button>
                  </span>
                )
              })}
            </div>
          )}
          {/* Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowGenreDropdown(!showGenreDropdown)}
              className="w-full flex items-center justify-between px-3 py-2 bg-bg-base border border-border rounded-lg text-sm text-text-secondary hover:border-accent/50 focus:outline-none transition-colors"
            >
              <span>{getGenreLabels(form.genres)}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showGenreDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showGenreDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-bg-surface border border-border rounded-lg shadow-lg z-30 max-h-64 overflow-y-auto">
                {GENRE_GROUPS.map(([group, opts]) => (
                  <div key={group}>
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-bg-elevated border-b border-border/50">
                      {t(`project:${opts[0]?.groupKey ?? ''}`) || group}
                    </div>
                    <div className="flex flex-wrap gap-1 p-2">
                      {opts.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => toggleGenre(opt.value)}
                          className={`text-xs px-2 py-1 rounded transition-colors ${
                            form.genres.includes(opt.value)
                              ? 'bg-accent text-white'
                              : 'bg-bg-base text-text-secondary hover:bg-bg-hover'
                          }`}
                        >
                          {t(`project:${opt.labelKey}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1.5">{t('projectInfo.descriptionLabel')}</label>
          <CTextarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
            className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent transition-colors resize-none"
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1.5">
            {t('projectInfo.targetWordCount', { count: Number((form.targetWordCount / 10000).toFixed(0)) })}
          </label>
          <input
            type="range"
            min={100000}
            max={5000000}
            step={100000}
            value={form.targetWordCount}
            onChange={(e) => setForm({ ...form, targetWordCount: Number(e.target.value) })}
            className="w-full accent-accent"
          />
        </div>

        {/* Multi-world toggle */}
        <div className="p-4 bg-bg-surface border border-border rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                {t('projectInfo.multiWorldToggle')}
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                {t('projectInfo.multiWorldDescription')}
              </p>
            </div>
            <button
              onClick={async () => {
                if (!project.id) return
                const next = !project.enableMultiWorld
                // When enabling: ensure primary world group + assign existing project-level data to it
                if (next) {
                  const migrated = await useWorldGroupStore.getState().migrateToMultiWorld(project.id)
                  if (!migrated) return
                }
                await updateProject(project.id, { enableMultiWorld: next })
                onUpdate({ ...project, enableMultiWorld: next, updatedAt: Date.now() })
              }}
              className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ml-4 ${
                project.enableMultiWorld ? 'bg-accent' : 'bg-border'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  project.enableMultiWorld ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <p className="text-text-muted text-xs">
            {t('projectInfo.timestamps', {
              created: new Date(project.createdAt).toLocaleString(),
              updated: new Date(project.updatedAt).toLocaleString(),
            })}
          </p>
        </div>
      </div>
    </div>
  )
}
