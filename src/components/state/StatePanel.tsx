/**
 * C-4 角色状态卡聚合视图。
 *
 * 不改 DB schema：以 characters 为主卡，聚合 stateCards、章节、物品流水、
 * 角色基础地点与势力词条。旧的非角色状态卡保留在库中，但不再作为正式 UI 展示。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight, BookOpenCheck, Download, Edit3, MapPin, Package, Save, Shield, Sparkles, UserRound, X,
} from 'lucide-react'
import type { Character, Project, StateCard, StateField } from '../../lib/types'
import { parseFields, stringifyFields } from '../../lib/types/state-card'
import { useStateCardStore } from '../../stores/state-card'
import { useCharacterStore } from '../../stores/character'
import { useChapterStore } from '../../stores/chapter'
import { useItemLedgerStore } from '../../stores/item-ledger'
import { useCodexStore } from '../../stores/codex'
import { aggregateInventory } from '../../lib/types/item-ledger'
import { CInput } from '../shared/CompositionInput'

interface Props {
  project: Project
  onOpenInventory?: () => void
}

const LOCATION_KEYS = ['位置', '地点', '所在地', '当前地点', 'location']
const FACTION_KEYS = ['势力', '所属势力', '归属', '阵营', 'faction']
const ITEM_KEYS = ['持有物', '物品', '装备', '随身物品', 'item']

function findField(fields: StateField[], keys: string[]): string {
  const normalized = keys.map(key => key.toLocaleLowerCase())
  return fields.find(field => normalized.some(key => field.key.toLocaleLowerCase().includes(key)))?.value || ''
}

export default function StatePanel({ project, onOpenInventory }: Props) {
  const { t } = useTranslation('panels')
  const projectId = project.id!
  const { cards, loading, loadAll, addCard, updateCard, buildStateContext } = useStateCardStore()
  const { characters, loadAll: loadCharacters } = useCharacterStore()
  const { chapters, loadAll: loadChapters } = useChapterStore()
  const { entries: itemEntries, loadAll: loadItems } = useItemLedgerStore()
  const { categories, entries: codexEntries, loadAll: loadCodex } = useCodexStore()
  const [editingCharacter, setEditingCharacter] = useState<number | null>(null)

  useEffect(() => {
    void Promise.all([
      loadAll(projectId),
      loadCharacters(projectId),
      loadChapters(projectId),
      loadItems(projectId),
      loadCodex(projectId),
    ])
  }, [projectId, loadAll, loadCharacters, loadChapters, loadItems, loadCodex])

  const characterCards = useMemo(
    () => cards.filter(card => card.category === 'character'),
    [cards],
  )
  const charInventory = useCallback(
    (characterId: number) => aggregateInventory(itemEntries, characterId).filter(item => item.quantity > 0),
    [itemEntries],
  )
  const chapterById = useMemo(
    () => new Map(chapters.filter(chapter => chapter.id != null).map(chapter => [chapter.id!, chapter])),
    [chapters],
  )
  const factionNames = useMemo(() => {
    const factionCategoryIds = new Set(
      categories.filter(category => category.builtInKey === 'faction').map(category => category.id),
    )
    return codexEntries
      .filter(entry => factionCategoryIds.has(entry.categoryId))
      .map(entry => entry.name)
  }, [categories, codexEntries])

  const handleExportText = () => {
    const text = buildStateContext()
    if (!text) return
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${project.name}_角色状态卡.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-3 pb-4 border-b border-border/40">
        <div>
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <UserRound className="w-5 h-5" /> {t('state.panel.title' as any)}
          </h2>
          <p className="text-xs text-text-muted mt-1">
            {t('state.panel.subtitle' as any)}
          </p>
        </div>
        <button
          onClick={handleExportText}
          disabled={!characterCards.length}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border bg-bg-elevated text-text-secondary disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5" /> {t('state.panel.export' as any)}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Summary label={t('state.panel.totalCharacters' as any)} value={characters.length} />
        <Summary label={t('state.panel.establishedState' as any)} value={characterCards.length} accent />
        <Summary label={t('state.panel.pendingState' as any)} value={Math.max(0, characters.length - characterCards.length)} />
      </div>

      {loading ? (
        <div className="text-sm text-text-muted text-center py-10">{t('state.panel.loading' as any)}</div>
      ) : characters.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <UserRound className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t('state.panel.noCharacters' as any)}</p>
          <p className="text-xs mt-1">{t('state.panel.noCharactersHint' as any)}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {characters.map(character => {
            const card = characterCards.find(item => item.entityName === character.name) || null
            return (
              <CharacterStateCard
                key={character.id}
                character={character}
                card={card}
                chapterTitle={card?.lastChapterId ? chapterById.get(card.lastChapterId)?.title : undefined}
                protagonistItems={(() => { const items = charInventory(character.id!); return items.map(item => `${item.itemName} ×${item.quantity}`) })()}
                inventoryBacked={charInventory(character.id!).length > 0}
                onOpenInventory={onOpenInventory}
                knownFactions={factionNames}
                editing={editingCharacter === character.id}
                onToggleEdit={() => setEditingCharacter(editingCharacter === character.id ? null : character.id!)}
                onSave={async fields => {
                  if (card?.id) {
                    await updateCard(card.id, { fields: stringifyFields(fields) })
                  } else {
                    await addCard({
                      projectId,
                      category: 'character',
                      entityName: character.name,
                      fields: stringifyFields(fields),
                    })
                  }
                  setEditingCharacter(null)
                }}
                t={t}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function Summary({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-bg-surface p-3">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`text-xl font-semibold mt-1 ${accent ? 'text-accent' : 'text-text-primary'}`}>{value}</p>
    </div>
  )
}

function CharacterStateCard({
  character, card, chapterTitle, protagonistItems, inventoryBacked, onOpenInventory,
  knownFactions, editing, onToggleEdit, onSave, t,
}: {
  character: Character
  card: StateCard | null
  chapterTitle?: string
  protagonistItems: string[]
  inventoryBacked: boolean
  onOpenInventory?: () => void
  knownFactions: string[]
  editing: boolean
  onToggleEdit: () => void
  onSave: (fields: StateField[]) => Promise<void>
  t: any
}) {
  const fields = useMemo(() => parseFields(card?.fields || '[]'), [card?.fields])
  const [draft, setDraft] = useState<StateField[]>(fields)

  useEffect(() => {
    if (editing) setDraft(fields.length ? fields : [{ key: '当前状态', value: '' }])
  }, [editing, fields])

  const location = findField(fields, LOCATION_KEYS) || character.location || t('state.panel.notRecorded' as any)
  const faction = findField(fields, FACTION_KEYS)
    || knownFactions.find(name => fields.some(field => field.value.includes(name)))
    || t('state.panel.notRecorded' as any)
  const stateItems = findField(fields, ITEM_KEYS)
  const heldItems = protagonistItems.length ? protagonistItems.join('、') : stateItems || t('state.panel.notRecorded' as any)
  const coreFields = fields.filter(field =>
    ![...LOCATION_KEYS, ...FACTION_KEYS, ...ITEM_KEYS]
      .some(key => field.key.toLocaleLowerCase().includes(key.toLocaleLowerCase())),
  )

  return (
    <article className="rounded-xl border border-border bg-bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center font-semibold">
          {character.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-text-primary truncate">{character.name}</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">{character.role}</span>
            {!card && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">{t('state.panel.pendingExtract' as any)}</span>}
          </div>
          <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{character.shortDescription || t('state.panel.noBio' as any)}</p>
        </div>
        <button onClick={onToggleEdit} className="p-1 text-text-muted hover:text-accent" title={t('state.panel.editStateAria' as any)}>
          {editing ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
        </button>
      </div>

      {editing ? (
        <div className="mt-4 space-y-2">
          {draft.map((field, index) => (
            <div key={index} className="flex gap-2">
              <CInput
                value={field.key}
                onChange={event => setDraft(current => current.map((item, i) => i === index ? { ...item, key: event.target.value } : item))}
                placeholder={t('state.panel.fieldPlaceholder' as any)}
                className="w-28 px-2 py-1.5 rounded border border-border bg-bg-base text-xs"
              />
              <CInput
                value={field.value}
                onChange={event => setDraft(current => current.map((item, i) => i === index ? { ...item, value: event.target.value } : item))}
                placeholder={t('state.panel.valuePlaceholder' as any)}
                className="flex-1 px-2 py-1.5 rounded border border-border bg-bg-base text-xs"
              />
              <button onClick={() => setDraft(current => current.filter((_, i) => i !== index))} className="p-1 text-text-muted hover:text-red-400">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button onClick={() => setDraft(current => [...current, { key: '', value: '' }])} className="text-xs text-accent">{t('state.panel.addField' as any)}</button>
            <button
              onClick={() => onSave(draft.filter(field => field.key.trim() && field.value.trim()))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-accent text-white text-xs"
            >
              <Save className="w-3.5 h-3.5" /> {t('state.panel.save' as any)}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Fact icon={MapPin} label={t('state.panel.location' as any)} value={location} />
            <Fact icon={Shield} label={t('state.panel.faction' as any)} value={faction} />
            <Fact icon={BookOpenCheck} label={t('state.panel.storyProgress' as any)} value={chapterTitle || t('state.panel.notRecorded' as any)} />
            <InventoryFact
              value={heldItems}
              source={inventoryBacked ? 'inventory' : 'state'}
              onOpenInventory={onOpenInventory}
              t={t}
            />
          </div>
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-[10px] uppercase tracking-wide text-text-muted flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> {t('state.panel.currentStatus' as any)}
            </p>
            {coreFields.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {coreFields.map((field, index) => (
                  <span key={index} className="px-2 py-1 rounded-lg bg-bg-elevated text-xs text-text-secondary">
                    <span className="text-text-muted">{field.key}：</span>{field.value}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted mt-2">{t('state.panel.noDynamicStatus' as any)}</p>
            )}
          </div>
        </>
      )}
    </article>
  )
}

export function InventoryFact({
  value,
  source,
  onOpenInventory,
  t,
}: {
  value: string
  source: 'inventory' | 'state'
  onOpenInventory?: () => void
  t: any
}) {
  return (
    <div className="rounded-lg bg-bg-elevated/60 p-2.5 min-w-0" data-testid="state-inventory-fact">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-text-muted flex min-w-0 items-center gap-1">
          <Package className="w-3 h-3 shrink-0" /> {t('state.panel.heldItems' as any)}
          <span className="truncate text-[9px] text-text-muted/70">
            · {source === 'inventory' ? t('state.panel.fromInventory' as any) : t('state.panel.fromState' as any)}
          </span>
        </p>
        {onOpenInventory && (
          <button
            type="button"
            onClick={onOpenInventory}
            title={t('state.panel.goToInventory' as any)}
            aria-label={t('state.panel.goToInventoryAria' as any)}
            className="shrink-0 rounded p-0.5 text-text-muted hover:bg-accent/10 hover:text-accent"
          >
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
      <p className="text-xs text-text-secondary mt-1 line-clamp-2">{value}</p>
    </div>
  )
}

function Fact({ icon: Icon, label, value }: {
  icon: typeof MapPin
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg bg-bg-elevated/60 p-2.5 min-w-0">
      <p className="text-[10px] text-text-muted flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </p>
      <p className="text-xs text-text-secondary mt-1 line-clamp-2">{value}</p>
    </div>
  )
}
