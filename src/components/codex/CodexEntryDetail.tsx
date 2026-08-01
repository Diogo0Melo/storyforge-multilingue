import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CInput, CTextarea } from '../shared/CompositionInput'
import {
  codexEntryInWorld,
  parseEntryFields,
  parseEntryRefs,
  parseFieldSchema,
  stringifyEntryFields,
  stringifyEntryRefs,
} from '../../lib/types/codex'
import type {
  CodexCategory,
  CodexEntry,
  CodexFieldDef,
} from '../../lib/types/codex'
import { parseCultivationStages } from '../../lib/types/cultivation'
import { useCultivationStore } from '../../stores/cultivation'
import { useLocationStore } from '../../stores/location'
import type { PanelsKeys } from '../../i18n/generated-resources'

interface Props {
  entry: CodexEntry
  category: CodexCategory
  allCategories: CodexCategory[]
  allEntries: CodexEntry[]
  nameDuplicate?: boolean
  onChange: (patch: Partial<CodexEntry>) => void
}

export default function CodexEntryDetail({
  entry,
  category,
  allCategories,
  allEntries,
  nameDuplicate,
  onChange,
}: Props) {
  const { t } = useTranslation('panels')
  const schema = useMemo(() => parseFieldSchema(category.fieldSchema), [category.fieldSchema])
  const fields = useMemo(() => parseEntryFields(entry.fields), [entry.fields])
  const refs = useMemo(() => parseEntryRefs(entry.refs), [entry.refs])
  const tags = useMemo(() => {
    try {
      const parsed = JSON.parse(entry.tags || '[]')
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  }, [entry.tags])

  const setField = (key: string, value: string) => {
    onChange({ fields: stringifyEntryFields({ ...fields, [key]: value }) })
  }
  const setRef = (key: string, ids: number[]) => {
    onChange({ refs: stringifyEntryRefs({ ...refs, [key]: ids }) })
  }

  return (
    <div className="p-4 space-y-3 max-w-2xl">
      <div className="flex items-center gap-2">
        <CInput
          value={entry.icon || ''}
          onChange={event => onChange({ icon: event.target.value })}
          placeholder={t('codex.entry.icon')}
          className="w-14 text-center px-2 py-2 rounded-lg bg-bg-elevated border border-border text-sm"
        />
        <div className="flex-1">
          <CInput
            value={entry.name}
            onChange={event => onChange({ name: event.target.value })}
            placeholder={t('codex.entry.name')}
            className={`w-full px-3 py-2 rounded-lg bg-bg-elevated border text-sm font-medium ${nameDuplicate ? 'border-amber-400/60' : 'border-border'}`}
          />
          {nameDuplicate && <p className="mt-1 text-[11px] text-amber-400">{t('codex.entry.dupWarning')}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted w-12">{t('codex.entry.importance')}</span>
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map(value => (
            <button
              key={value}
              type="button"
              title={t('codex.entry.starTitle', { count: value })}
              onClick={() => onChange({ importance: entry.importance === value ? 0 : value })}
              className="p-0.5 hover:scale-110 transition-transform"
            >
              <Star className={`w-4 h-4 ${(entry.importance ?? 0) >= value ? 'fill-amber-400 text-amber-400' : 'text-text-muted'}`} />
            </button>
          ))}
        </div>
        {(entry.importance ?? 0) > 0 && <span className="text-[11px] text-amber-400/80">{t('codex.entry.stars', { count: entry.importance ?? 0 })}</span>}
      </div>
      <CInput
        value={entry.summary}
        onChange={event => onChange({ summary: event.target.value })}
        placeholder={t('codex.entry.summaryPlaceholder')}
        className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm"
      />
      <CInput
        value={tags.join('、')}
        onChange={event => onChange({
          tags: JSON.stringify(event.target.value.split(/[、,，]/).map(tag => tag.trim()).filter(Boolean)),
        })}
        placeholder={t('codex.entry.tagsPlaceholder')}
        className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm"
      />
      <CTextarea
        value={entry.description}
        onChange={event => onChange({ description: event.target.value })}
        placeholder={t('codex.entry.descriptionPlaceholder')}
        rows={3}
        className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm resize-y"
      />

      {category.builtInKey === 'beast' && (
        <CodexCultivationLink entry={entry} onChange={onChange} />
      )}
      {category.builtInKey === 'city' && (
        <CodexImportantLocationLink entry={entry} onChange={onChange} />
      )}

      {schema.length > 0 && <div className="border-t border-border pt-3 text-xs text-text-muted">{t('codex.entry.customProps')}</div>}
      {schema.map(definition => (
        <CodexFieldRow
          key={definition.key}
          definition={definition}
          value={fields[definition.key] || ''}
          refIds={refs[definition.key] || []}
          allCategories={allCategories}
          allEntries={allEntries}
          currentEntryId={entry.id!}
          worldGroupId={entry.worldGroupId ?? null}
          onValue={value => setField(definition.key, value)}
          onRef={ids => setRef(definition.key, ids)}
        />
      ))}
    </div>
  )
}

function CodexImportantLocationLink({
  entry,
  onChange,
}: {
  entry: CodexEntry
  onChange: (patch: Partial<CodexEntry>) => void
}) {
  const { t } = useTranslation('panels')
  const locations = useLocationStore(state => state.locations)
  const loadAll = useLocationStore(state => state.loadAll)
  useEffect(() => { void loadAll(entry.projectId) }, [entry.projectId, loadAll])
  const projectLocations = locations.filter(location => location.projectId === entry.projectId)

  return (
    <label className="block border-t border-border pt-3">
      <span className="block text-xs text-text-muted mb-1">{t('codex.entry.structuredLocation')}</span>
      <select
        aria-label={t('codex.entry.locationAria')}
        value={entry.importantLocationId ?? ''}
        onChange={event => onChange({
          importantLocationId: event.target.value ? Number(event.target.value) : null,
        })}
        className="w-full px-3 py-1.5 rounded-lg bg-bg-elevated border border-border text-sm"
      >
        <option value="">{t('codex.entry.notLinked')}</option>
        {projectLocations.map(location => (
          <option key={location.id} value={location.id}>{location.name}</option>
        ))}
      </select>
      <span className="block mt-1 text-[11px] text-text-muted">
        {t('codex.entry.locationNote')}
      </span>
    </label>
  )
}

function CodexCultivationLink({
  entry,
  onChange,
}: {
  entry: CodexEntry
  onChange: (patch: Partial<CodexEntry>) => void
}) {
  const { t } = useTranslation('panels')
  const systems = useCultivationStore(state => state.systems)
  const loadAll = useCultivationStore(state => state.loadAll)
  useEffect(() => { loadAll(entry.projectId) }, [entry.projectId, loadAll])
  const visible = systems.filter(system =>
    (system.worldGroupId ?? null) === (entry.worldGroupId ?? null))
  const selected = visible.find(system => system.id === entry.cultivationSystemId)
  const stages = parseCultivationStages(selected?.stages)
  return (
    <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
      <label>
        <span className="block text-xs text-text-muted mb-1">{t('codex.entry.structuredSystem')}</span>
        <select
          aria-label={t('codex.entry.beastSystemAria')}
          value={entry.cultivationSystemId ?? ''}
          onChange={event => onChange({
            cultivationSystemId: event.target.value ? Number(event.target.value) : null,
            cultivationStageId: null,
          })}
          className="w-full px-3 py-1.5 rounded-lg bg-bg-elevated border border-border text-sm"
        >
          <option value="">{t('codex.entry.notLinked')}</option>
          {visible.map(system => <option key={system.id} value={system.id}>{system.name}</option>)}
        </select>
      </label>
      <label>
        <span className="block text-xs text-text-muted mb-1">{t('codex.entry.currentStage')}</span>
        <select
          aria-label={t('codex.entry.beastStageAria')}
          disabled={!selected}
          value={entry.cultivationStageId ?? ''}
          onChange={event => onChange({ cultivationStageId: event.target.value || null })}
          className="w-full px-3 py-1.5 rounded-lg bg-bg-elevated border border-border text-sm disabled:opacity-40"
        >
          <option value="">{t('codex.entry.notSpecified')}</option>
          {stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
        </select>
      </label>
    </div>
  )
}

function CodexFieldRow({
  definition,
  value,
  refIds,
  allCategories,
  allEntries,
  currentEntryId,
  worldGroupId,
  onValue,
  onRef,
}: {
  definition: CodexFieldDef
  value: string
  refIds: number[]
  allCategories: CodexCategory[]
  allEntries: CodexEntry[]
  currentEntryId: number
  worldGroupId: number | null
  onValue: (value: string) => void
  onRef: (ids: number[]) => void
}) {
  const { t } = useTranslation('panels')
  return (
    <div className="grid grid-cols-[5rem_1fr] gap-2 items-start">
      <label className="text-xs text-text-muted pt-2 text-right">{definition.labelKey ? t(definition.labelKey as PanelsKeys, definition.label) : definition.label}</label>
      <div className="min-w-0">
        {definition.type === 'longtext' && (
          <CTextarea value={value} onChange={event => onValue(event.target.value)} placeholder={definition.placeholder} rows={2}
            className="w-full px-3 py-1.5 rounded-lg bg-bg-elevated border border-border text-sm resize-y" />
        )}
        {definition.type === 'select' && (
          <select value={value} onChange={event => onValue(event.target.value)} aria-label={definition.labelKey ? t(definition.labelKey as PanelsKeys, definition.label) : definition.label}
            className="w-full px-3 py-1.5 rounded-lg bg-bg-elevated border border-border text-sm">
            <option value="">{t('codex.entry.notSelected')}</option>
            {(definition.options || []).map((option, i) => <option key={option} value={option}>{definition.optionKeys?.[i] ? t(definition.optionKeys[i] as PanelsKeys, option) : option}</option>)}
          </select>
        )}
        {definition.type === 'number' && (
          <CInput value={value} onChange={event => onValue(event.target.value)} placeholder={definition.placeholder}
            className="w-full px-3 py-1.5 rounded-lg bg-bg-elevated border border-border text-sm" />
        )}
        {definition.type === 'ref' && (
          <CodexRefSelector
            refCategory={definition.refCategory}
            multi={definition.refMulti !== false}
            value={refIds}
            allCategories={allCategories}
            allEntries={allEntries}
            currentEntryId={currentEntryId}
            worldGroupId={worldGroupId}
            onChange={onRef}
          />
        )}
        {definition.type === 'text' && (
          <CInput value={value} onChange={event => onValue(event.target.value)} placeholder={definition.placeholder}
            className="w-full px-3 py-1.5 rounded-lg bg-bg-elevated border border-border text-sm" />
        )}
      </div>
    </div>
  )
}

function CodexRefSelector({
  refCategory,
  multi,
  value,
  allCategories,
  allEntries,
  currentEntryId,
  worldGroupId,
  onChange,
}: {
  refCategory?: string
  multi: boolean
  value: number[]
  allCategories: CodexCategory[]
  allEntries: CodexEntry[]
  currentEntryId: number
  worldGroupId: number | null
  onChange: (ids: number[]) => void
}) {
  const { t } = useTranslation('panels')
  const [open, setOpen] = useState(false)
  const candidates = useMemo(() => {
    const hintCategoryIds = refCategory
      ? allCategories.filter(category => category.builtInKey === refCategory).map(category => category.id)
      : []
    return allEntries
      .filter(entry => entry.id !== currentEntryId)
      .filter(entry => codexEntryInWorld(entry, worldGroupId))
      .filter(entry => hintCategoryIds.length === 0 || hintCategoryIds.includes(entry.categoryId))
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [allCategories, allEntries, currentEntryId, refCategory, worldGroupId])
  const selected = allEntries.filter(entry => value.includes(entry.id!))

  const toggle = (id: number) => {
    if (multi) onChange(value.includes(id) ? value.filter(item => item !== id) : [...value, id])
    else {
      onChange(value.includes(id) ? [] : [id])
      setOpen(false)
    }
  }

  return (
    <div className="rounded-lg bg-bg-elevated border border-border">
      <button onClick={() => setOpen(current => !current)} className="w-full flex items-center gap-1.5 px-3 py-1.5 text-sm text-left">
        <ChevronRight className={`w-3.5 h-3.5 text-text-muted transition ${open ? 'rotate-90' : ''}`} />
        {selected.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {selected.map(entry => (
              <span key={entry.id} className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-xs">{entry.icon} {entry.name}</span>
            ))}
          </span>
        ) : <span className="text-text-muted">{t('codex.entry.clickToLink')}</span>}
      </button>
      {open && (
        <div className="border-t border-border max-h-48 overflow-y-auto p-1">
          {candidates.length === 0 && <p className="text-xs text-text-muted px-2 py-2">{t('codex.entry.noLinkable')}</p>}
          {candidates.map(entry => (
            <label key={entry.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-bg-hover cursor-pointer text-sm">
              <input type="checkbox" checked={value.includes(entry.id!)} onChange={() => toggle(entry.id!)} />
              <span>{entry.icon}</span>
              <span className="truncate">{entry.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
