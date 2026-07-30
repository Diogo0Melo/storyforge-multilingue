import { Pencil, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AIConfigPreset } from '../../lib/types'

interface Props {
  presets: AIConfigPreset[]
  activePresetId: string | null
  editingPreset: AIConfigPreset | null
  savingPreset: boolean
  presetName: string
  onPresetNameChange: (name: string) => void
  onStartSaving: () => void
  onCancelSaving: () => void
  onSavePreset: () => void
  onApplyPreset: (id: string) => void
  onUpdatePreset: (id: string) => void
  onRenamePreset: (id: string, name: string) => void
  onDeletePreset: (id: string, name: string) => void
}

export default function AIConfigPresetSection({
  presets,
  activePresetId,
  editingPreset,
  savingPreset,
  presetName,
  onPresetNameChange,
  onStartSaving,
  onCancelSaving,
  onSavePreset,
  onApplyPreset,
  onUpdatePreset,
  onRenamePreset,
  onDeletePreset,
}: Props) {
  const { t } = useTranslation('settings')
  return (
    <div className="mb-4 pb-4 border-b border-border/50">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm text-text-secondary">{t('presets.title')}</label>
        {editingPreset && !savingPreset ? (
          <div className="flex items-center gap-1.5">
            <button onClick={() => onUpdatePreset(editingPreset.id)}
              title={t('presets.saveToPresetTitle', { name: editingPreset.name })}
              className="text-xs px-2.5 py-1 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors">
              {t('presets.saveToPreset', { name: editingPreset.name })}
            </button>
            <button onClick={onStartSaving}
              className="text-xs px-2.5 py-1 rounded-lg bg-bg-elevated text-text-secondary border border-border hover:text-accent hover:border-accent/50 transition-colors">
              {t('presets.saveAsNew')}
            </button>
          </div>
        ) : savingPreset ? (
          <div className="flex items-center gap-1.5">
            <input autoFocus value={presetName} onChange={event => onPresetNameChange(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') onSavePreset()
                if (event.key === 'Escape') onCancelSaving()
              }}
              placeholder={t('presets.presetNamePlaceholder')}
              className="px-2 py-1 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent w-44" />
            <button onClick={onSavePreset} className="px-2 py-1 text-xs bg-accent text-white rounded hover:bg-accent-hover">{t('presets.save')}</button>
            <button onClick={onCancelSaving} className="px-2 py-1 text-xs text-text-muted hover:text-text-primary">{t('presets.cancel')}</button>
          </div>
        ) : (
          <button onClick={onStartSaving}
            className="text-xs px-2.5 py-1 rounded-lg bg-bg-elevated text-text-secondary border border-border hover:text-accent hover:border-accent/50 transition-colors">
            {t('presets.saveCurrentAsPreset')}
          </button>
        )}
      </div>

      {presets.length === 0 ? (
        <p className="text-xs text-text-muted">{t('presets.emptyHint')}</p>
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap">
          {presets.map(preset => (
            <div key={preset.id}
              className={`group flex items-center gap-1 pl-2.5 pr-1 py-1 text-xs rounded-full border transition-colors ${
                activePresetId === preset.id
                  ? 'bg-accent text-white border-accent'
                  : 'bg-bg-base text-text-secondary border-border hover:border-accent/50'
              }`}>
              <button onClick={() => onApplyPreset(preset.id)} title={`${preset.config.provider} · ${preset.config.model}`}>{preset.name}</button>
              {activePresetId === preset.id && (
                <button onClick={() => onUpdatePreset(preset.id)} title={t('presets.updatePresetTitle')} className="opacity-70 hover:opacity-100">{t('presets.updatePreset')}</button>
              )}
              <button onClick={() => onRenamePreset(preset.id, preset.name)} title={t('presets.rename')}
                className="opacity-0 group-hover:opacity-70 hover:opacity-100" aria-label={`${t('presets.rename')} ${preset.name}`}>
                <Pencil className="h-3 w-3" />
              </button>
              <button onClick={() => onDeletePreset(preset.id, preset.name)} title={t('presets.delete')}
                className="opacity-0 group-hover:opacity-70 hover:opacity-100 hover:text-red-400" aria-label={`${t('presets.delete')} ${preset.name}`}>
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {presets.length > 0 && (
        <p className="mt-2 text-[11px] text-text-muted">{t('presets.applyHint')}</p>
      )}
    </div>
  )
}
