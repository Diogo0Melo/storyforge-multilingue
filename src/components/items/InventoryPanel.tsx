/**
 * 物品栏 — INV-1（按角色归属）
 *
 * AI 从已写章节正文中提取各角色的物品获得/消耗，
 * 聚合为「当前持有数量 + 获得/消耗历程」，支持按角色切换查看。
 */
import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Package, Sparkles, Loader2, Trash2, ChevronDown, ChevronRight, Plus, ArrowUpCircle, ArrowDownCircle } from 'lucide-react'
import { useItemLedgerStore } from '../../stores/item-ledger'
import { useChapterStore } from '../../stores/chapter'
import { useCharacterStore } from '../../stores/character'
import { useOutlineStore } from '../../stores/outline'
import { useAIConfigStore } from '../../stores/ai-config'
import { chat, resolveRequestConfig } from '../../lib/ai/client'
import { getAIConfigRequiredMessage, isAIConfigReady } from '../../lib/ai/config-readiness'
import {
  buildInventoryExtractPrompt, parseInventoryEvents, type ExtractedItemEvent,
} from '../../lib/ai/adapters/inventory-extract-adapter'
import { aggregateInventory, ITEM_LEDGER_ACTION_LABELS } from '../../lib/types/item-ledger'
import type { CharacterRoleWeight } from '../../lib/types/character'
import type { Project, ItemLedgerAction } from '../../lib/types'
import { splitExtractionText, uniqueBy } from '../../lib/ai/structured-extraction'
import { adopt } from '../../lib/registry/adopt'
import { assembleContext } from '../../lib/registry/assemble-context'
import {
  listInventoryExtractionChapters,
  selectInventoryExtractionChapters,
  type InventoryExtractionMode,
} from '../../lib/inventory/extraction-range'

interface Props {
  project: Project
}

const ROLE_WEIGHT_GROUPS: { weight: CharacterRoleWeight }[] = [
  { weight: 'main' },
  { weight: 'secondary' },
  { weight: 'npc' },
  { weight: 'extra' },
]

export default function InventoryPanel({ project }: Props) {
  const { t } = useTranslation('panels')
  const { entries, loading, loadAll, addEntry, updateEntry, deleteEntry, deleteByChapter } = useItemLedgerStore()
  const { chapters, loadAll: loadChapters } = useChapterStore()
  const { characters, loadAll: loadCharacters } = useCharacterStore()
  const { nodes: outlineNodes, loadAll: loadOutline } = useOutlineStore()
  const aiConfig = useAIConfigStore(s => s.config)

  const [extracting, setExtracting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null)
  const [extractMode, setExtractMode] = useState<InventoryExtractionMode>('all')
  const [extractStart, setExtractStart] = useState<number>(1)
  const [extractEnd, setExtractEnd] = useState<number>(1)

  useEffect(() => {
    loadAll(project.id!)
    loadChapters(project.id!)
    loadCharacters(project.id!)
    loadOutline(project.id!)
  }, [project.id, loadAll, loadChapters, loadCharacters, loadOutline])

  const visibleEntries = useMemo(
    () => selectedCharacterId != null
      ? entries
      : entries.filter(entry => !((entry.characterId ?? null) === null && entry.heldByName === '未知(历史数据)')),
    [entries, selectedCharacterId],
  )
  const inventory = useMemo(
    () => aggregateInventory(visibleEntries, selectedCharacterId ?? undefined),
    [visibleEntries, selectedCharacterId],
  )

  const inventoryStats = useMemo(() => ({
    activeKinds: inventory.filter(item => item.quantity > 0).length,
    totalHeld: inventory.reduce((sum, item) => sum + Math.max(0, item.quantity), 0),
    movements: inventory.reduce((sum, item) => sum + item.entries.length, 0),
  }), [inventory])

  const extractionChapters = useMemo(
    () => listInventoryExtractionChapters(chapters, outlineNodes),
    [chapters, outlineNodes],
  )

  useEffect(() => {
    if (extractionChapters.length === 0) return
    setExtractStart(current => Math.min(Math.max(current, 1), extractionChapters.length))
    setExtractEnd(current => current <= 1 ? extractionChapters.length : Math.min(current, extractionChapters.length))
  }, [extractionChapters.length])

  // 角色列表按 roleWeight 分组
  const groupedCharacters = useMemo(() => {
    const result: { weight: CharacterRoleWeight; chars: typeof characters }[] = []
    for (const group of ROLE_WEIGHT_GROUPS) {
      const chars = characters.filter(c => c.roleWeight === group.weight)
      if (chars.length > 0) result.push({ ...group, chars })
    }
    return result
  }, [characters])

  // 未归属条目（历史数据的 characterId === null && heldByName === '未知(历史数据)'）
  const unclaimedEntries = useMemo(
    () => entries.filter(e => (e.characterId ?? null) === null && e.heldByName === '未知(历史数据)'),
    [entries],
  )

  const handleExtract = async () => {
    const effectiveConfig = resolveRequestConfig(aiConfig, { category: 'inventory.extract' }).config
    if (!isAIConfigReady(effectiveConfig)) {
      setExtractError(getAIConfigRequiredMessage(effectiveConfig))
      return
    }
    const selection = selectInventoryExtractionChapters({
      chapters,
      outlineNodes,
      mode: extractMode,
      startOrdinal: extractStart,
      endOrdinal: extractEnd,
    })
    if (selection.error) {
      setExtractError(selection.error)
      return
    }
    const targetChapters = selection.chapters
    const characterNames = characters.map(c => c.name).filter(Boolean)
    const nameToId = new Map(characters.filter(c => c.name).map(c => [c.name.trim(), c.id!]))
    setExtracting(true)
    setExtractError(null)
    setProgress({ done: 0, total: targetChapters.length })
    try {
      for (let i = 0; i < targetChapters.length; i++) {
        const ch = targetChapters[i]
        try {
          const found: ExtractedItemEvent[] = []
          const knownNames = [...new Set(entries.map(entry => entry.itemName.trim()).filter(Boolean))]
          const chapterSource = await assembleContext({
            projectId: project.id!,
            chapterId: ch.id,
            sourceKeys: ['chapterContent'],
          })
          for (const chunk of splitExtractionText(chapterSource.text)) {
            const messages = buildInventoryExtractPrompt(
              ch.title,
              chunk,
              [...knownNames, ...found.map(event => event.itemName)],
              characterNames,
            )
            const raw = await chat(messages, aiConfig, { category: 'inventory.extract', projectId: project.id! })
            found.push(...parseInventoryEvents(raw))
          }
          const key = (ev: ExtractedItemEvent) => JSON.stringify([
            ev.itemName.trim().toLocaleLowerCase(),
            ev.heldByName.trim(),
            ev.action,
            ev.quantity,
            ev.note.trim(),
          ])
          const events = uniqueBy(found, key)
          if (ch.id != null) await deleteByChapter(project.id!, ch.id)
          if (events.length > 0) {
            await adopt({
              projectId: project.id!,
              target: 'itemLedger',
              mode: 'add-many',
              data: events.map(ev => ({
                itemName: ev.itemName,
                heldByName: ev.heldByName,
                characterId: nameToId.get(ev.heldByName.trim()) ?? null,
                action: ev.action,
                quantity: ev.quantity,
                chapterId: ch.id ?? null,
                chapterTitle: ch.title,
                note: ev.note || '',
              })),
            })
            await loadAll(project.id!)
          }
        } catch (err) {
          console.error('[Inventory] 章节提取失败:', ch.title, err)
        }
        setProgress({ done: i + 1, total: targetChapters.length })
      }
    } finally {
      setExtracting(false)
      setProgress(null)
    }
  }

  const selectedCharacter = selectedCharacterId != null ? characters.find(c => c.id === selectedCharacterId) : null

  const handleManualAdd = async () => {
    if (!selectedCharacter) {
      setExtractError(t('items.inventory.selectCharPlease'))
      return
    }
    await addEntry({
      projectId: project.id!,
      itemName: t('items.inventory.newItem'),
      heldByName: selectedCharacter.name,
      characterId: selectedCharacter.id ?? null,
      action: 'gain',
      quantity: 1,
      note: t('items.inventory.manualNote'),
    })
  }

  const handleUpdateQuantity = (id: number, value: string, fallback: number) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) return fallback
    const quantity = Math.max(0, Math.floor(parsed))
    void updateEntry(id, { quantity })
    return quantity
  }

  const handleUpdateItemName = (id: number, value: string, fallback: string) => {
    const itemName = value.trim()
    if (!itemName) return fallback
    void updateEntry(id, { itemName })
    return itemName
  }

  const handleUpdateHeldByName = (id: number, value: string) => {
    const heldByName = value.trim()
    if (!heldByName) return
    const match = characters.find(c => c.name.trim() === heldByName)
    void updateEntry(id, { heldByName, characterId: match?.id ?? null })
  }

  return (
    <div className="max-w-3xl space-y-5">
      {/* 顶部 */}
      <div className="pb-4 border-b border-border/40">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
              <Package className="w-5 h-5" /> {t('items.inventory.title')}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              {t('items.inventory.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleManualAdd}
              disabled={!selectedCharacter}
              title={selectedCharacter ? t('items.inventory.addFor', { name: selectedCharacter.name }) : t('items.inventory.selectCharFirst')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-bg-elevated text-text-secondary border border-border hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> {t('items.inventory.manualAdd')}
            </button>
            <button
              onClick={handleExtract}
              disabled={extracting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {extracting ? t('items.inventory.extracting', { done: progress?.done ?? 0, total: progress?.total ?? 0 }) : t('items.inventory.extractFromText')}
            </button>
          </div>
        </div>

        {/* 角色切换器 */}
        {characters.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-text-muted shrink-0">{t('items.inventory.viewCharacter')}</span>
            <select
              value={selectedCharacterId ?? ''}
              onChange={ev => setSelectedCharacterId(ev.target.value ? Number(ev.target.value) : null)}
              className="flex-1 max-w-xs bg-bg-base border border-border rounded-lg text-xs px-2 py-1.5 text-text-secondary"
            >
              <option value="">{t('items.inventory.allCharacters')}</option>
              {groupedCharacters.map(group => (
                <optgroup key={group.weight} label={t(`items.roleWeight.${group.weight}` as any)}>
                  {group.chars.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.roleWeight === 'main' ? t('items.inventory.mainRole') : ''}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {selectedCharacter && (
              <span className="text-xs text-accent">{t('items.inventory.currentBag', { name: selectedCharacter.name })}</span>
            )}
          </div>
        )}

        {/* 提取范围选择（QUICKWIN-3） */}
        {extractionChapters.length > 0 && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-text-muted">{t('items.inventory.extractRange')}</span>
            <select
              value={extractMode}
              onChange={ev => setExtractMode(ev.target.value as InventoryExtractionMode)}
              className="bg-bg-base border border-border rounded px-1.5 py-0.5 text-text-secondary"
            >
              <option value="all">{t('items.inventory.allChapters')}</option>
              <option value="range">{t('items.inventory.customRange')}</option>
            </select>
            {extractMode === 'range' && (
              <>
                <select
                  value={extractStart}
                  onChange={ev => setExtractStart(Number(ev.target.value))}
                  className="bg-bg-base border border-border rounded px-1.5 py-0.5 text-text-secondary max-w-40"
                >
                  {extractionChapters.map(item => (
                    <option key={item.chapter.id ?? item.ordinal} value={item.ordinal}>
                      {t('items.inventory.chapter', { ordinal: item.ordinal, title: item.chapter.title })}{item.hasWrittenContent ? '' : t('items.inventory.noContent')}
                    </option>
                  ))}
                </select>
                <span className="text-text-muted">{t('items.inventory.to')}</span>
                <select
                  value={extractEnd}
                  onChange={ev => setExtractEnd(Number(ev.target.value))}
                  className="bg-bg-base border border-border rounded px-1.5 py-0.5 text-text-secondary max-w-40"
                >
                  {extractionChapters.map(item => (
                    <option key={item.chapter.id ?? item.ordinal} value={item.ordinal}>
                      {t('items.inventory.chapter', { ordinal: item.ordinal, title: item.chapter.title })}{item.hasWrittenContent ? '' : t('items.inventory.noContent')}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        )}
      </div>

      {extractError && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">{extractError}</div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-bg-surface p-3">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">{t('items.inventory.activeKinds')}</p>
          <p className="text-xl font-semibold text-text-primary mt-1">{inventoryStats.activeKinds}</p>
        </div>
        <div className="rounded-xl border border-border bg-bg-surface p-3">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">{t('items.inventory.totalHeld')}</p>
          <p className="text-xl font-semibold text-green-400 mt-1">{inventoryStats.totalHeld}</p>
        </div>
        <div className="rounded-xl border border-border bg-bg-surface p-3">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">{t('items.inventory.movements')}</p>
          <p className="text-xl font-semibold text-accent mt-1">{inventoryStats.movements}</p>
        </div>
      </div>

      {extracting && progress && (
        <div className="p-3 bg-accent/10 border border-accent/20 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-accent mb-1.5">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('items.inventory.extractingProgress', { done: progress.done, total: progress.total })}
          </div>
          <div className="h-1.5 bg-bg-base rounded-full overflow-hidden">
            <div className="h-full bg-accent transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* 物品栏 */}
      {loading ? (
        <div className="text-text-muted text-sm py-8 text-center">{t('items.inventory.loading')}</div>
      ) : inventory.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t('items.inventory.empty')}</p>
          <p className="text-xs mt-1">{t('items.inventory.emptyHint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {inventory.map(item => {
            const inventoryKey = JSON.stringify([item.characterId ?? item.heldByName, item.itemName])
            const isOpen = expanded === inventoryKey
            const gained = item.entries.filter(entry => entry.action === 'gain').reduce((sum, entry) => sum + entry.quantity, 0)
            const consumed = item.entries.filter(entry => entry.action === 'consume').reduce((sum, entry) => sum + entry.quantity, 0)
            return (
              <div key={inventoryKey} className={`bg-bg-surface border rounded-xl overflow-hidden ${
                item.quantity > 0 ? 'border-border' : 'border-border/60 opacity-80'
              }`}>
                {/* 物品头部 */}
                <button
                  onClick={() => setExpanded(isOpen ? null : inventoryKey)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-bg-hover/40 transition-colors"
                >
                  {isOpen ? <ChevronDown className="w-4 h-4 text-text-muted shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />}
                  <span className="text-sm font-semibold text-text-primary min-w-0 truncate">{item.itemName}</span>
                  {item.heldByName && (
                    <span className="text-[10px] text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded shrink-0">{item.heldByName}</span>
                  )}
                  <span className="text-[10px] text-text-muted flex-1">
                    {t('items.inventory.cumulativeGain', { count: gained, count2: consumed })}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                    item.quantity > 0 ? 'bg-green-500/10 text-green-400'
                      : item.quantity === 0 ? 'bg-bg-elevated text-text-muted'
                      : 'bg-red-500/10 text-red-400'
                  }`}>
                    ×{item.quantity}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                    item.quantity > 0 ? 'bg-green-500/10 text-green-400' : 'bg-bg-elevated text-text-muted'
                  }`}>
                    {item.quantity > 0 ? t('items.inventory.holding') : item.quantity === 0 ? t('items.inventory.depleted') : t('items.inventory.needsCheck')}
                  </span>
                </button>

                {/* 流水历程 */}
                {isOpen && (
                  <div className="border-t border-border/50 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-text-muted mb-2">{t('items.inventory.gainConsumeTimeline')}</p>
                    <div className="relative ml-1 border-l border-border/70">
                    {item.entries.map(e => (
                      <div key={e.id} className="relative flex flex-wrap items-center gap-2 pl-4 py-2 text-xs group">
                        <span className={`absolute -left-1.5 w-3 h-3 rounded-full border-2 bg-bg-surface ${
                          e.action === 'gain' ? 'border-green-400' : 'border-red-400'
                        }`} />
                        {e.action === 'gain'
                          ? <ArrowUpCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                          : <ArrowDownCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                        <span className={`shrink-0 ${e.action === 'gain' ? 'text-green-400' : 'text-red-400'}`}>
                          {ITEM_LEDGER_ACTION_LABELS[e.action]} ×{e.quantity}
                        </span>
                        {e.chapterTitle && <span className="text-text-muted min-w-0 truncate">· {e.chapterTitle}</span>}
                        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                          <input
                            defaultValue={e.itemName}
                            onBlur={ev => {
                              ev.currentTarget.value = handleUpdateItemName(e.id!, ev.currentTarget.value, e.itemName)
                            }}
                            onKeyDown={ev => {
                              if (ev.key === 'Enter') ev.currentTarget.blur()
                            }}
                            title={t('items.inventory.editItemName')}
                            aria-label={t('items.inventory.editItemName')}
                            className="w-24 sm:w-28 bg-bg-base border border-border rounded text-[10px] px-1 py-0.5 text-text-secondary focus:outline-none focus:border-accent"
                          />
                          <input
                            defaultValue={e.heldByName ?? ''}
                            onBlur={ev => handleUpdateHeldByName(e.id!, ev.currentTarget.value)}
                            onKeyDown={ev => { if (ev.key === 'Enter') ev.currentTarget.blur() }}
                            placeholder={t('items.inventory.holderPlaceholder')}
                            title={t('items.inventory.editHolder')}
                            aria-label={t('items.inventory.editHolder')}
                            className="w-16 bg-bg-base border border-border rounded text-[10px] px-1 py-0.5 text-text-secondary focus:outline-none focus:border-accent"
                          />
                          <input
                            type="number"
                            min={0}
                            step={1}
                            defaultValue={e.quantity}
                            onBlur={ev => {
                              ev.currentTarget.value = String(handleUpdateQuantity(e.id!, ev.currentTarget.value, e.quantity))
                            }}
                            onKeyDown={ev => {
                              if (ev.key === 'Enter') ev.currentTarget.blur()
                            }}
                            title={t('items.inventory.editQuantity')}
                            aria-label={t('items.inventory.editQuantity')}
                            className="w-14 bg-bg-base border border-border rounded text-[10px] px-1 py-0.5 text-text-secondary focus:outline-none focus:border-accent"
                          />
                          <select
                            value={e.action}
                            onChange={ev => updateEntry(e.id!, { action: ev.target.value as ItemLedgerAction })}
                            className="bg-bg-base border border-border rounded text-[10px] px-1 py-0.5 text-text-secondary"
                          >
                            <option value="gain">{t('items.inventory.gain')}</option>
                            <option value="consume">{t('items.inventory.consume')}</option>
                          </select>
                          <button
                            onClick={() => deleteEntry(e.id!)}
                            title={t('items.inventory.deleteEntry')}
                            aria-label={t('items.inventory.deleteEntry')}
                            className="p-0.5 text-text-muted hover:text-red-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <input
                            defaultValue={e.note ?? ''}
                            onBlur={ev => updateEntry(e.id!, { note: ev.target.value.trim() })}
                            onKeyDown={ev => {
                              if (ev.key === 'Enter') ev.currentTarget.blur()
                            }}
                            placeholder={t('items.inventory.notePlaceholder')}
                            title={t('items.inventory.editNote')}
                            aria-label={t('items.inventory.editNote')}
                            className="w-24 sm:w-32 bg-bg-base border border-border rounded text-[10px] px-1 py-0.5 text-text-muted focus:outline-none focus:border-accent"
                          />
                        </div>
                      </div>
                    ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 未归属（历史数据） */}
      {unclaimedEntries.length > 0 && selectedCharacterId == null && (
        <div className="border border-dashed border-border/60 rounded-xl p-4 bg-bg-elevated/30">
          <p className="text-xs text-text-muted mb-2">
            {t('items.inventory.unclaimed')}
          </p>
          <div className="text-[10px] text-text-muted space-y-1">
            {unclaimedEntries.map(e => (
              <div key={e.id} className="flex items-center gap-2">
                <span>{e.itemName}</span>
                <span className="text-text-muted/60">{e.action === 'gain' ? t('items.inventory.gain') : t('items.inventory.consume')} ×{e.quantity}</span>
                {e.chapterTitle && <span className="text-text-muted/60">· {e.chapterTitle}</span>}
                <select
                  value=""
                  aria-label={t('items.inventory.claimAria', { name: e.itemName })}
                  onChange={event => {
                    const characterId = Number(event.target.value)
                    const character = characters.find(candidate => candidate.id === characterId)
                    if (character && e.id != null) {
                      void updateEntry(e.id, { characterId, heldByName: character.name })
                    }
                  }}
                  className="ml-auto bg-bg-base border border-border rounded px-1.5 py-0.5 text-text-secondary"
                >
                  <option value="">{t('items.inventory.selectCharToClaim')}</option>
                  {groupedCharacters.flatMap(group => group.chars).map(character => (
                    <option key={character.id} value={character.id}>{character.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
