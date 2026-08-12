import { Plus, X, Settings2 } from 'lucide-react'
import type { PromptParameter } from '../../../lib/types/prompt'
import { useDomainT } from '../../../i18n'

interface Props {
  parameters: PromptParameter[]
  onChange: (next: PromptParameter[]) => void
  readOnly?: boolean
}

const TYPE_KEYS = ['select', 'slider', 'number', 'text', 'boolean'] as const

export default function PromptParametersEditor({ parameters, onChange, readOnly }: Props) {
  const { t } = useDomainT('settings')

  const typeLabels: Record<string, string> = {
    select: t('promptParameters.typeLabels.select'),
    slider: t('promptParameters.typeLabels.slider'),
    number: t('promptParameters.typeLabels.number'),
    text: t('promptParameters.typeLabels.text'),
    boolean: t('promptParameters.typeLabels.boolean'),
  }

  const addParam = () => {
    onChange([
      ...parameters,
      {
        key: `param${parameters.length + 1}`,
        label: t('promptParameters.newParameterLabel'),
        type: 'text',
        default: '',
        optional: true,
      },
    ])
  }

  const updateParam = (idx: number, patch: Partial<PromptParameter>) => {
    const next = parameters.map((p, i) => (i === idx ? { ...p, ...patch } : p))
    onChange(next)
  }

  const removeParam = (idx: number) => {
    onChange(parameters.filter((_, i) => i !== idx))
  }

  return (
    <div className="bg-bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-text-secondary" />
          <label className="text-sm font-medium text-text-primary">
            {t('promptParameters.title')}
          </label>
          <span className="text-xs text-text-muted">({parameters.length})</span>
        </div>
        {!readOnly && (
          <button
            onClick={addParam}
            className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded"
          >
            <Plus className="w-3 h-3" /> {t('promptParameters.add')}
          </button>
        )}
      </div>

      {parameters.length === 0 ? (
        <p className="text-xs text-text-muted py-2">
          <span dangerouslySetInnerHTML={{ __html: t('promptParameters.empty') }} />
        </p>
      ) : (
        <div className="space-y-2">
          {parameters.map((p, idx) => (
            <div key={idx} className="bg-bg-base border border-border rounded p-2">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input
                  value={p.key}
                  onChange={e => updateParam(idx, { key: e.target.value })}
                  readOnly={readOnly}
                  placeholder={t('promptParameters.keyPlaceholder')}
                  className="px-2 py-1 bg-bg-surface border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:border-accent"
                />
                <input
                  value={p.label}
                  onChange={e => updateParam(idx, { label: e.target.value })}
                  readOnly={readOnly}
                  placeholder={t('promptParameters.labelPlaceholder')}
                  className="px-2 py-1 bg-bg-surface border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <select
                  value={p.type}
                  onChange={e => updateParam(idx, { type: e.target.value as PromptParameter['type'] })}
                  disabled={readOnly}
                  className="px-2 py-1 bg-bg-surface border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
                >
                  {TYPE_KEYS.map(k => (
                    <option key={k} value={k}>{typeLabels[k]}</option>
                  ))}
                </select>
                <input
                  value={String(p.default)}
                  onChange={e => updateParam(idx, { default: e.target.value })}
                  readOnly={readOnly}
                  placeholder={t('promptParameters.defaultPlaceholder')}
                  className="px-2 py-1 bg-bg-surface border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
                />
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={p.optional ?? false}
                    onChange={e => updateParam(idx, { optional: e.target.checked })}
                    disabled={readOnly}
                    className="accent-accent"
                  />
                  {t('promptParameters.optionalToggle')}
                </label>
              </div>
              {p.type === 'select' && (
                <input
                  value={(p.options || []).join(',')}
                  onChange={e => updateParam(idx, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  readOnly={readOnly}
                  placeholder={t('promptParameters.selectOptionsPlaceholder')}
                  className="w-full px-2 py-1 bg-bg-surface border border-border rounded text-xs text-text-primary mb-2 focus:outline-none focus:border-accent"
                />
              )}
              {(p.type === 'slider' || p.type === 'number') && (
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <input
                    type="number"
                    value={p.min ?? ''}
                    onChange={e => updateParam(idx, { min: e.target.value ? Number(e.target.value) : undefined })}
                    readOnly={readOnly}
                    placeholder="min"
                    className="px-2 py-1 bg-bg-surface border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
                  />
                  <input
                    type="number"
                    value={p.max ?? ''}
                    onChange={e => updateParam(idx, { max: e.target.value ? Number(e.target.value) : undefined })}
                    readOnly={readOnly}
                    placeholder="max"
                    className="px-2 py-1 bg-bg-surface border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
                  />
                  <input
                    type="number"
                    value={p.step ?? ''}
                    onChange={e => updateParam(idx, { step: e.target.value ? Number(e.target.value) : undefined })}
                    readOnly={readOnly}
                    placeholder="step"
                    className="px-2 py-1 bg-bg-surface border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  value={p.description ?? ''}
                  onChange={e => updateParam(idx, { description: e.target.value })}
                  readOnly={readOnly}
                  placeholder={t('promptParameters.descriptionPlaceholder')}
                  className="flex-1 px-2 py-1 bg-bg-surface border border-border rounded text-xs text-text-secondary focus:outline-none focus:border-accent"
                />
                {!readOnly && (
                  <button
                    onClick={() => removeParam(idx)}
                    className="p-1 text-text-muted hover:text-error"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
