import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Plus, Settings2, Trash2, X } from 'lucide-react'
import {
  parseFieldSchema,
  stringifyFieldSchema,
  BUILTIN_CATEGORIES,
} from '../../lib/types/codex'
import type { CodexCategory, CodexFieldDef } from '../../lib/types/codex'

const FIELD_TYPE_VALUES: CodexFieldDef['type'][] = ['text', 'longtext', 'select', 'number', 'ref']
const FIELD_TYPE_I18N: Record<CodexFieldDef['type'], string> = {
  text: 'codex.fields.typeText',
  longtext: 'codex.fields.typeLongtext',
  select: 'codex.fields.typeSelect',
  number: 'codex.fields.typeNumber',
  ref: 'codex.fields.typeRef',
}

interface Props {
  category: CodexCategory
  onClose: () => void
  onSave: (fieldSchema: string) => void
}

export default function CodexCategoryFieldsEditor({ category, onClose, onSave }: Props) {
  const { t } = useTranslation('panels')
  const [defs, setDefs] = useState<CodexFieldDef[]>(() => parseFieldSchema(category.fieldSchema))

  const fieldTypes = useMemo(() => FIELD_TYPE_VALUES.map(value => ({
    value,
    label: t(FIELD_TYPE_I18N[value] as any),
  })), [t])

  const update = (index: number, patch: Partial<CodexFieldDef>) => {
    setDefs(current => current.map((definition, itemIndex) => (
      itemIndex === index ? { ...definition, ...patch } : definition
    )))
  }
  const remove = (index: number) => setDefs(current => current.filter((_, itemIndex) => itemIndex !== index))
  const move = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= defs.length) return
    const next = [...defs]
    ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
    setDefs(next)
  }
  const add = () => setDefs(current => [...current, {
    key: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    label: t('codex.fields.newField' as any),
    type: 'text',
  }])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-bg-surface border border-border rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-accent" /> {(() => {
              const seed = category.builtInKey ? BUILTIN_CATEGORIES.find(c => c.builtInKey === category.builtInKey) : null
              return t('codex.fields.manageTitle' as any, { name: seed?.nameKey ? t(seed.nameKey, category.name) : category.name })
            })()}
          </h3>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary" aria-label={t('codex.fields.closeAria' as any)}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {defs.length === 0 && <p className="text-xs text-text-muted text-center py-4">{t('codex.fields.noFields' as any)}</p>}
          {defs.map((definition, index) => (
            <div key={definition.key} className="border border-border rounded-lg p-2 space-y-1.5 bg-bg-base">
              <div className="flex items-center gap-1.5">
                <input
                  value={definition.label}
                  onChange={event => update(index, { label: event.target.value })}
                  placeholder={t('codex.fields.fieldNamePlaceholder' as any)}
                  className="flex-1 px-2 py-1 text-sm rounded bg-bg-elevated border border-border focus:outline-none focus:border-accent"
                />
                <select
                  aria-label={`${t('codex.fields.fieldType' as any)}-${definition.label}`}
                  value={definition.type}
                  onChange={event => update(index, { type: event.target.value as CodexFieldDef['type'] })}
                  className="px-2 py-1 text-xs rounded bg-bg-elevated border border-border"
                >
                  {fieldTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
                <button onClick={() => move(index, -1)} disabled={index === 0} className="p-1 text-text-muted hover:text-text-primary disabled:opacity-30" aria-label={`${t('codex.fields.moveUp' as any)}${definition.label}`}>
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => move(index, 1)} disabled={index === defs.length - 1} className="p-1 text-text-muted hover:text-text-primary disabled:opacity-30" aria-label={`${t('codex.fields.moveDown' as any)}${definition.label}`}>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => remove(index)} className="p-1 text-text-muted hover:text-red-400" aria-label={`${t('codex.fields.deleteField' as any)}${definition.label}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {definition.type === 'select' && (
                <input
                  value={(definition.options || []).join(' / ')}
                  onChange={event => update(index, { options: event.target.value.split('/').map(item => item.trim()).filter(Boolean) })}
                  placeholder={t('codex.fields.selectOptionsPlaceholder' as any)}
                  className="w-full px-2 py-1 text-xs rounded bg-bg-elevated border border-border focus:outline-none focus:border-accent"
                />
              )}
              {definition.type === 'ref' && (
                <input
                  value={definition.refCategory || ''}
                  onChange={event => update(index, { refCategory: event.target.value.trim() || undefined })}
                  placeholder={t('codex.fields.refCategoryPlaceholder' as any)}
                  className="w-full px-2 py-1 text-xs rounded bg-bg-elevated border border-border focus:outline-none focus:border-accent"
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-3 py-2.5 border-t border-border">
          <button onClick={add} className="px-2.5 py-1.5 text-xs rounded-lg border border-dashed border-border text-text-muted hover:text-accent hover:border-accent/50 inline-flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> {t('codex.fields.addField' as any)}
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary">{t('codex.fields.cancel' as any)}</button>
            <button
              onClick={() => onSave(stringifyFieldSchema(defs.filter(definition => definition.label.trim())))}
              className="px-3 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent/90"
            >
              {t('codex.fields.save' as any)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
