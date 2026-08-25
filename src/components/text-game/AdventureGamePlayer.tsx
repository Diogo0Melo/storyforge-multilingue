import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  ArrowLeft,
  Backpack,
  BookOpenCheck,
  Check,
  ChevronRight,
  CircleDot,
  Compass,
  Gem,
  GitBranch,
  History,
  KeyRound,
  Loader2,
  Map,
  PackageOpen,
  Plus,
  Save,
  ScrollText,
  Send,
  Sparkles,
  Square,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react'
import { isAIConfigReady } from '../../lib/ai/config-readiness'
import { resolveRequestConfig } from '../../lib/ai/client'
import {
  parseAdventureNarrativeBlocks,
  parseAdventurePlayerCommand,
  projectAdventureTranscript,
  resolveAdventurePlayerIdentity,
  type AdventureNarrativeBlock,
  type AdventureSystemCommand,
} from '../../lib/adventure/player-experience'
import { currentPlayerReleases } from '../../lib/text-game/player-library'
import type { AdventureGameReleaseManifestV1, Project, WorkspaceScope } from '../../lib/types'
import { useDomainT } from '../../i18n'
import {
  ADVENTURE_ACTION_KIND_LABEL_KEYS,
  ADVENTURE_CHECK_OUTCOME_LABEL_KEYS,
  ADVENTURE_QUEST_STATUS_LABEL_KEYS,
  projectCanonicalLabel,
} from '../../i18n/display-projection'
import { useAdventureGamePlayerStore, selectAdventureActions } from '../../stores/adventure-game-player'
import { useAIConfigStore } from '../../stores/ai-config'
import { useDialog } from '../shared/Dialog'
import './player-roadshow.css'

type AdventurePanel = 'inventory' | 'skills' | 'quests' | 'journal' | 'saves' | null

interface AdventureNarrativePlayback {
  eventSequence: number
  unitIndex: number
  visibleCharacters: number
}

// 样例世界（雾港潮汐钟）的键名兜底显示名：属于样例世界数据而非 UI chrome，
// 保持为组件内数据；locale 未预分配对应键，缺失键已单独上报。
const COMMON_LABELS: Record<string, string> = {
  notice: '失物告示', gate: '集市门闩', ledger: '档案簿', lock: '档案柜锁',
  grate: '水渠格栅', mechanism: '水渠机关', keeper: '守钟人', beacon: '旧灯塔',
  rope: '旧绳', 'brass-key': '黄铜钥匙', 'ledger-page': '档案抄页', 'lamp-oil': '灯油',
  herb: '水渠草药', seal: '旧印章', gear: '备用齿轮', letter: '未寄出的信',
  coin: '港币', 'bell-shard': '潮汐钟片', observe: '观察', agility: '灵巧',
  reason: '推理', empathy: '共情', wounded: '受伤', inspired: '振奋', wanted: '被通缉',
}

function friendlyName(title: string | undefined, key: string): string {
  const value = title?.trim()
  return !value || value.toLowerCase() === key.toLowerCase() ? COMMON_LABELS[key] ?? value ?? key : value
}

function friendlyDescription(
  t: ReturnType<typeof useDomainT>['t'],
  description: string | undefined,
  key: string,
  kind: 'object' | 'item' | 'ability' | 'condition',
): string {
  const value = description?.trim() ?? ''
  if (value && !value.toLowerCase().startsWith(key.toLowerCase())) return value
  if (kind === 'object') return t('textGame.adventure.console.friendlyObjectDescription')
  if (kind === 'item') return t('textGame.adventure.console.friendlyItemDescription')
  if (kind === 'condition') return t('textGame.adventure.console.friendlyConditionDescription')
  // 各能力专属说明文案未预分配 locale 键，保持为样例世界数据；缺失键已单独上报。
  const abilityCopy: Record<string, string> = {
    observe: '发现环境细节与未被说出的线索。', agility: '完成需要身手与反应的行动。',
    reason: '分析记录、机关与相互矛盾的证据。', empathy: '理解人物动机并建立信任。',
  }
  return abilityCopy[key] ?? t('textGame.adventure.console.friendlyAbilityFallback')
}

function itemIcon(tags: string[], key: string) {
  const text = `${tags.join(' ')} ${key}`.toLowerCase()
  if (text.includes('key') || text.includes('钥')) return <KeyRound />
  if (text.includes('record') || text.includes('document') || text.includes('记录')) return <ScrollText />
  if (text.includes('artifact') || text.includes('bell') || text.includes('宝物')) return <Gem />
  return <PackageOpen />
}

function gauge(value: number, minimum: number, maximum: number): number {
  if (maximum <= minimum) return 100
  return Math.min(100, Math.max(0, (value - minimum) / (maximum - minimum) * 100))
}

function formatTime(lang: string, value: number): string {
  return new Intl.DateTimeFormat(lang, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(value)
}

function adventureNpcCount(manifest: AdventureGameReleaseManifestV1): number {
  const player = resolveAdventurePlayerIdentity(manifest)
  return manifest.interaction.profiles.filter(profile => profile.participantKey !== player?.participantKey).length
}

function splitNarrativeSentences(value: string): string[] {
  const result: string[] = []
  const closingMarks = '”’」』】》）)]'
  let sentence = ''
  for (let index = 0; index < value.length; index += 1) {
    sentence += value[index]
    if (!'。！？!?;；…'.includes(value[index])) continue
    while (index + 1 < value.length && closingMarks.includes(value[index + 1])) {
      index += 1
      sentence += value[index]
    }
    if (sentence.trim()) result.push(sentence.trim())
    sentence = ''
  }
  if (sentence.trim()) result.push(sentence.trim())
  return result.length ? result : [value]
}

function sequenceNarrativeBlocks(blocks: AdventureNarrativeBlock[]): AdventureNarrativeBlock[] {
  return blocks.flatMap(block => splitNarrativeSentences(block.text).map(text => ({ ...block, text })))
}

export default function AdventureGamePlayer(props: {
  project: Project
  scope: WorkspaceScope
  worldGroupId: number | null
}) {
  const store = useAdventureGamePlayerStore()
  const { config } = useAIConfigStore()
  const dialog = useDialog()
  const { t, lang } = useDomainT('simulation')
  const [panel, setPanel] = useState<AdventurePanel>(null)
  const [commandText, setCommandText] = useState('')
  const [consoleResponse, setConsoleResponse] = useState<{ command: string; text: string } | null>(null)
  const [narrativePlayback, setNarrativePlayback] = useState<AdventureNarrativePlayback | null>(null)
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyCursor, setHistoryCursor] = useState(-1)
  const [checkpointName, setCheckpointName] = useState('')
  const [branchTitle, setBranchTitle] = useState('')
  const [localError, setLocalError] = useState('')
  const [catalogReleaseId, setCatalogReleaseId] = useState<number | null>(null)
  const playbackSessionRef = useRef<number | null>(null)
  const transcriptHydratedRef = useRef(false)
  const knownTranscriptSequencesRef = useRef<Set<number>>(new Set())
  const generatedNarrativeRef = useRef('')

  useEffect(() => {
    setCatalogReleaseId(null)
    void store.load(props.scope, props.worldGroupId, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.scope.projectId, props.scope.worldId, props.scope.workId, props.worldGroupId])

  const selected = store.sessions.find(item => item.id === store.selectedSessionId) ?? null
  const catalog = useMemo(() => currentPlayerReleases(store.releases), [store.releases])
  const catalogRelease = catalog.find(item => item.release.id === catalogReleaseId) ?? null
  const adventure = store.runtimeState.adventure
  const manifest = store.selectedManifest
  const playerIdentity = useMemo(() => manifest ? resolveAdventurePlayerIdentity(manifest) : null, [manifest])
  const location = manifest?.adventure.locations.find(item => item.key === adventure?.currentLocationKey) ?? null
  const objects = useMemo(() => manifest?.adventure.objects.filter(item => item.locationKey === location?.key) ?? [], [manifest, location?.key])
  const actions = selectAdventureActions(store).filter(item => (
    !playerIdentity?.participantKey || item.action.interaction?.participantKey !== playerIdentity.participantKey
  ))
  const availableActions = actions.filter(item => item.available)
  const endingKeys = new Set((store.runtimeState.narrative?.nodes ?? []).filter(node => node.kind === 'ending').map(node => node.key))
  const endingChoices = (store.runtimeState.narrative?.choices ?? []).filter(choice => (
    endingKeys.has(choice.targetNodeKey)
      && store.runtimeState.narrative?.visibleChoiceKeys?.includes(choice.choiceKey)
      && store.runtimeState.narrative?.availableChoiceKeys?.includes(choice.choiceKey)
  ))
  const resolved = resolveRequestConfig(config, { category: 'runtime.prose.adventure-intent-parser' })
  const aiReady = isAIConfigReady(resolved.config)
  const generating = store.generatingRunId != null
  const error = localError || store.error
  const lastAction = adventure?.actionHistory[adventure.actionHistory.length - 1] ?? null
  const playerItems = adventure?.inventory.filter(item => item.ownerKey === 'player') ?? []
  const currentParticipantKeys = useMemo(() => new Set(actions
    .filter(item => item.action.locationKey === location?.key && item.action.interaction)
    .map(item => item.action.interaction!.participantKey)), [actions, location?.key])
  const currentProfiles = useMemo(() => {
    const profiles = manifest?.interaction.profiles ?? []
    const nonPlayers = profiles.filter(profile => profile.participantKey !== playerIdentity?.participantKey)
    const present = nonPlayers.filter(profile => currentParticipantKeys.has(profile.participantKey))
    return present.length ? present : nonPlayers
  }, [currentParticipantKeys, manifest?.interaction.profiles, playerIdentity?.participantKey])
  const transcript = useMemo(() => manifest && adventure
    ? projectAdventureTranscript(manifest, adventure.actionHistory, store.events)
    : [], [adventure, manifest, store.events])

  useLayoutEffect(() => {
    if (playbackSessionRef.current === store.selectedSessionId) return
    playbackSessionRef.current = store.selectedSessionId
    transcriptHydratedRef.current = false
    knownTranscriptSequencesRef.current = new Set()
    generatedNarrativeRef.current = ''
    setNarrativePlayback(null)
  }, [store.selectedSessionId])

  useLayoutEffect(() => {
    if (store.loading) return
    const sequences = new Set(transcript.map(entry => entry.eventSequence))
    if (!transcriptHydratedRef.current) {
      transcriptHydratedRef.current = true
      knownTranscriptSequencesRef.current = sequences
      return
    }
    const added = transcript.filter(entry => !knownTranscriptSequencesRef.current.has(entry.eventSequence))
    knownTranscriptSequencesRef.current = sequences
    const latestAdded = added[added.length - 1]
    if (latestAdded) setNarrativePlayback({ eventSequence: latestAdded.eventSequence, unitIndex: 0, visibleCharacters: 0 })
  }, [store.loading, store.selectedSessionId, transcript])

  useLayoutEffect(() => {
    const candidate = store.generatedNarrative
    const identity = candidate ? `${candidate.runId}:${candidate.narrative}` : ''
    if (!identity || identity === generatedNarrativeRef.current) {
      generatedNarrativeRef.current = identity
      return
    }
    generatedNarrativeRef.current = identity
    if (candidate && lastAction && candidate.evidenceEventSequences.includes(lastAction.eventSequence)) {
      setNarrativePlayback({ eventSequence: lastAction.eventSequence, unitIndex: 0, visibleCharacters: 0 })
    }
  }, [lastAction, store.generatedNarrative])

  const playbackEventSequence = narrativePlayback?.eventSequence ?? null
  const activeNarrativeUnits = useMemo(() => {
    if (playbackEventSequence == null) return []
    const entry = transcript.find(item => item.eventSequence === playbackEventSequence)
    if (!entry) return []
    const generatedText = store.generatedNarrative?.evidenceEventSequences.includes(entry.eventSequence)
      ? store.generatedNarrative.narrative
      : ''
    return sequenceNarrativeBlocks(generatedText ? parseAdventureNarrativeBlocks(generatedText) : entry.blocks)
  }, [playbackEventSequence, store.generatedNarrative, transcript])
  const activeNarrativeUnit = narrativePlayback ? activeNarrativeUnits[narrativePlayback.unitIndex] : null
  const narrativeReading = narrativePlayback != null && activeNarrativeUnit != null

  useEffect(() => {
    if (!narrativePlayback || !activeNarrativeUnit || narrativePlayback.visibleCharacters >= activeNarrativeUnit.text.length) return
    const timer = window.setTimeout(() => setNarrativePlayback(current => {
      if (!current
        || current.eventSequence !== narrativePlayback.eventSequence
        || current.unitIndex !== narrativePlayback.unitIndex) return current
      return { ...current, visibleCharacters: Math.min(activeNarrativeUnit.text.length, current.visibleCharacters + 1) }
    }), 22)
    return () => window.clearTimeout(timer)
  }, [activeNarrativeUnit, narrativePlayback])

  const run = async (action: () => Promise<unknown>) => {
    setLocalError('')
    try { await action() } catch (reason) { setLocalError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const systemResponse = (command: AdventureSystemCommand): string => {
    if (!adventure || !manifest || !location) return t('textGame.adventure.console.notReadyResponse')
    if (command === 'help') return t('textGame.adventure.console.helpResponse', { location: location.title })
    if (command === 'status') {
      const resources = Object.entries(adventure.resources).map(([key, value]) => `${manifest.adventure.resources.find(item => item.key === key)?.title ?? key} ${value}`).join('；')
      const conditions = adventure.conditions.map(item => manifest.adventure.conditions.find(value => value.key === item.conditionKey)?.title ?? item.conditionKey).join('、')
      return [
        t('textGame.adventure.console.statusLocationLine', { location: location.title }),
        `${resources || t('textGame.adventure.console.statusResourcesNone')}。`,
        conditions ? t('textGame.adventure.console.statusConditionsLine', { conditions }) : t('textGame.adventure.console.statusNoConditions'),
      ].join('')
    }
    if (command === 'inventory') return playerItems.length
      ? t('textGame.adventure.console.inventoryLine', { items: playerItems.map(item => `${friendlyName(manifest.adventure.items.find(value => value.key === item.itemKey)?.title, item.itemKey)} ×${item.quantity}${item.state === 'equipped' ? `（${t('textGame.adventure.console.equippedLabel')}）` : ''}`).join('；') })
      : t('textGame.adventure.console.inventoryEmptyResponse')
    if (command === 'skills') return t('textGame.adventure.console.skillsLine', { abilities: Object.entries(adventure.abilities).map(([key, value]) => `${friendlyName(manifest.adventure.abilities.find(item => item.key === key)?.title, key)} ${value}`).join('；') })
    if (command === 'quests') return adventure.quests.map(quest => {
      const definition = manifest.adventure.quests.find(item => item.key === quest.questKey)
      const completed = quest.objectives.filter(item => item.completed).length
      return t('textGame.adventure.console.questEntryLine', {
        title: definition?.title ?? quest.questKey,
        status: projectCanonicalLabel(t, ADVENTURE_QUEST_STATUS_LABEL_KEYS, quest.status),
        done: completed,
        total: quest.objectives.length,
      })
    }).join('；') || t('textGame.adventure.console.questsNoneResponse')
    if (command === 'history') return transcript.length
      ? t('textGame.adventure.console.historyCountResponse', { count: transcript.length, action: transcript[transcript.length - 1]?.actionLabel })
      : t('textGame.adventure.console.historyEmptyResponse')
    setPanel('saves')
    return t('textGame.adventure.console.savesOpenedResponse')
  }

  const executeAction = async (actionKey: string) => {
    if (narrativeReading) return
    setConsoleResponse(null)
    await run(() => store.act(actionKey))
  }

  const submitCommand = async (event?: FormEvent) => {
    event?.preventDefault()
    const value = commandText.trim()
    if (!value || store.busy || generating || narrativeReading) return
    setCommandHistory(current => [...current.filter(item => item !== value), value].slice(-30))
    setHistoryCursor(-1)
    setCommandText('')
    const parsed = parseAdventurePlayerCommand(value, actions)
    if (parsed.kind === 'system') {
      setConsoleResponse({ command: value, text: systemResponse(parsed.command) })
      return
    }
    if (parsed.kind === 'action') {
      if (!parsed.available) {
        setConsoleResponse({ command: value, text: parsed.reason || t('textGame.adventure.console.actionUnavailableResponse') })
        return
      }
      await executeAction(parsed.action.key)
      return
    }
    if (aiReady) {
      setConsoleResponse({ command: value, text: t('textGame.adventure.console.intentMappingResponse') })
      await run(() => store.generateIntent(value, resolved.config))
      return
    }
    setConsoleResponse({
      command: value,
      text: parsed.suggestions.length
        ? t('textGame.adventure.console.unrecognizedWithSuggestions', { suggestions: parsed.suggestions.join('、') })
        : t('textGame.adventure.console.unrecognizedNoActions'),
    })
  }

  const navigateCommandHistory = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!commandHistory.length || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    const next = event.key === 'ArrowUp'
      ? Math.min(commandHistory.length - 1, historyCursor + 1)
      : Math.max(-1, historyCursor - 1)
    setHistoryCursor(next)
    setCommandText(next < 0 ? '' : commandHistory[commandHistory.length - 1 - next])
  }

  const advanceNarrative = () => {
    setNarrativePlayback(current => {
      if (!current) return current
      const unit = activeNarrativeUnits[current.unitIndex]
      if (!unit) return null
      if (current.visibleCharacters < unit.text.length) return { ...current, visibleCharacters: unit.text.length }
      if (current.unitIndex < activeNarrativeUnits.length - 1) {
        return { ...current, unitIndex: current.unitIndex + 1, visibleCharacters: 0 }
      }
      return null
    })
  }

  const removeSession = async (sessionId: number, title: string) => {
    const confirmed = await dialog.confirm({
      title: t('textGame.adventure.launcher.deleteConfirmTitle', { title }),
      message: t('textGame.adventure.launcher.deleteConfirmMessage'),
      confirmText: t('textGame.adventure.launcher.deleteConfirmAction'), tone: 'danger',
    })
    if (confirmed) await run(() => store.remove(sessionId))
  }

  if (store.loading && !selected) return <div className="adventure-launcher adventure-player-v2"><Loader2 className="adventure-loading" /><span>{t('textGame.adventure.launcher.loading')}</span></div>

  if (!selected || !adventure || !manifest || !location) return <div className="adventure-launcher adventure-player-v2" data-testid="adventure-game-player">
    <div className="adventure-launcher-atmosphere" />
    <div className="adventure-launcher-content">
      <span className="adventure-kicker"><Compass /> {t('textGame.adventure.launcher.kicker')}</span>
      <h2>{catalogRelease ? t('textGame.adventure.launcher.detailTitle') : t('textGame.adventure.launcher.libraryTitle')}</h2>
      <p>{catalogRelease ? t('textGame.adventure.launcher.detailIntro') : t('textGame.adventure.launcher.libraryIntro')}</p>
      {error && <div role="alert" className="adventure-alert">{error}</div>}
      {catalogRelease ? <section className="textgame-title-page adventure-title-page" aria-label={t('textGame.adventure.launcher.titlePageAria')}>
        <button type="button" className="textgame-catalog-back" onClick={() => setCatalogReleaseId(null)}><ArrowLeft />{t('textGame.common.catalog.backToAllGames')}</button>
        <div className="textgame-title-art" aria-hidden="true"><Compass /><span>EXPLORE<br />THE UNKNOWN</span></div>
        <div className="textgame-title-copy">
          <small>{t('textGame.adventure.launcher.tag')} · {t('textGame.common.catalog.playableVersion')}</small>
          <h3>{catalogRelease.manifest?.definition.title ?? catalogRelease.release.label}</h3>
          <p>{catalogRelease.manifest?.definition.description || t('textGame.adventure.launcher.fallbackDescription')}</p>
          {catalogRelease.manifest && <div className="textgame-title-stats"><span>{t('textGame.adventure.launcher.statsLocations', { count: catalogRelease.manifest.adventure.locations.length })}</span><span>{t('textGame.adventure.launcher.statsCharacters', { count: adventureNpcCount(catalogRelease.manifest) })}</span><span>{t('textGame.adventure.launcher.statsItems', { count: catalogRelease.manifest.adventure.items.length })}</span><span>{t('textGame.adventure.launcher.statsAbilities', { count: catalogRelease.manifest.adventure.abilities.length })}</span><span>{t('textGame.adventure.launcher.statsQuests', { count: catalogRelease.manifest.adventure.quests.length })}</span></div>}
          {catalogRelease.error ? <p className="adventure-error">{catalogRelease.error}</p> : <div className="textgame-title-actions"><button type="button" className="textgame-start" disabled={!catalogRelease.manifest || store.busy} onClick={() => void run(() => store.start(catalogRelease.release.id!))}><Plus />{t('textGame.adventure.launcher.startNewAdventure')}</button>{store.sessions.find(session => session.gameReleaseId === catalogRelease.release.id) && <button type="button" onClick={() => void store.select(store.sessions.find(session => session.gameReleaseId === catalogRelease.release.id)!.id!)}><Save />{t('textGame.common.catalog.continueProgress')}</button>}</div>}
        </div>
      </section> : <>
        <div className="textgame-catalog-heading"><span>{t('textGame.common.catalog.allGames')}</span><small>{t('textGame.common.catalog.count_other', { count: catalog.length })}</small></div>
        <section className="textgame-catalog-list" aria-label={t('textGame.adventure.launcher.listAria')}>
          {catalog.map(item => <article key={item.release.id}><button type="button" aria-label={t('textGame.common.catalog.viewGameAria', { title: item.manifest?.definition.title ?? item.release.label })} onClick={() => setCatalogReleaseId(item.release.id!)}><span className="textgame-catalog-icon"><Map /></span><span className="textgame-catalog-copy"><small>{t('textGame.adventure.launcher.tag')}</small><strong>{item.manifest?.definition.title ?? item.release.label}</strong><p>{item.manifest?.definition.description || t('textGame.adventure.launcher.fallbackDescription')}</p>{item.manifest && <i>{t('textGame.adventure.launcher.catalogStatsLine', { locations: item.manifest.adventure.locations.length, characters: adventureNpcCount(item.manifest), items: item.manifest.adventure.items.length, quests: item.manifest.adventure.quests.length })}</i>}</span><span className="textgame-catalog-open">{t('textGame.common.catalog.viewDetails')}<ChevronRight /></span></button></article>)}
          {!catalog.length && <div className="adventure-empty">{t('textGame.adventure.launcher.emptyCatalog')}</div>}
        </section>
        {!!store.sessions.length && <section className="adventure-launcher-saves"><h3><Save />{t('textGame.adventure.launcher.continueTitle')}</h3>{store.sessions.map(session => <div key={session.id}><button onClick={() => void store.select(session.id!)}><strong>{session.title}</strong><small>{formatTime(lang, session.updatedAt)} · {t('textGame.adventure.launcher.resumableTag')}</small></button><button aria-label={t('textGame.adventure.launcher.deleteSaveAria')} onClick={() => void removeSession(session.id!, session.title)}><Trash2 /></button></div>)}</section>}
      </>}
    </div>
  </div>

  return <div className="adventure-game adventure-player-v2" data-testid="adventure-game-player">
    <header className="adventure-gamebar adventure-console-bar">
      <button className="textgame-player-exit" aria-label={t('textGame.common.player.exitGame')} onClick={() => void store.select(null)}><ArrowLeft /><span>{t('textGame.common.player.exitGame')}</span></button>
      <div><small>{manifest.definition.title}</small><strong>{location.title}</strong></div>
      <span className="adventure-autosave"><CircleDot />{t('textGame.adventure.console.autosaveOn')}</span>
      <nav aria-label={t('textGame.adventure.console.navAria')}>
        <button onClick={() => setPanel('inventory')}><Backpack />{t('textGame.adventure.console.navInventory')} <b>{playerItems.reduce((sum, item) => sum + item.quantity, 0)}</b></button>
        <button onClick={() => setPanel('skills')}><WandSparkles />{t('textGame.adventure.console.navSkills')}</button>
        <button onClick={() => setPanel('quests')}><ScrollText />{t('textGame.adventure.console.navQuests')}</button>
        <button onClick={() => setPanel('journal')}><History />{t('textGame.adventure.console.navJournal')}</button>
        <button onClick={() => setPanel('saves')}><Save />{t('textGame.adventure.console.navSaves')}</button>
      </nav>
    </header>

    {error && <div role="alert" className="adventure-alert adventure-game-alert">{error}</div>}
    <main className="adventure-console-shell">
      <div className="adventure-console">
        <section className="adventure-console-prologue">
          <small>{t('textGame.adventure.console.identityPrefix')} · {playerIdentity ? t('textGame.adventure.console.identityPlayedBy', { name: playerIdentity.name }) : t('textGame.adventure.console.identitySoleProtagonist')} · {selected.title}</small>
          <h1>{location.title}</h1>
          <p>{location.description}</p>
          <dl>
            <div><dt>{t('textGame.adventure.console.presentLabel')}</dt><dd>{currentProfiles.filter(profile => currentParticipantKeys.has(profile.participantKey)).map(profile => profile.name).join('、') || t('textGame.adventure.console.nobodyToTalk')}</dd></div>
            <div><dt>{t('textGame.adventure.console.inspectableLabel')}</dt><dd>{objects.map(item => friendlyName(item.title, item.key)).join('、') || t('textGame.adventure.console.nothingNoticeable')}</dd></div>
            <div><dt>{t('textGame.adventure.console.statusLabel')}</dt><dd>{Object.entries(adventure.resources).map(([key, value]) => `${manifest.adventure.resources.find(item => item.key === key)?.title ?? key} ${value}`).join(' · ')}</dd></div>
          </dl>
        </section>

        <section className="adventure-console-log" role="log" aria-label={t('textGame.adventure.console.logAria')} aria-live="polite">
          {!transcript.length && <article className="adventure-console-system"><p>{t('textGame.adventure.console.prologueHint')}</p></article>}
          {transcript.map(entry => {
            const generatedText = store.generatedNarrative?.evidenceEventSequences.includes(entry.eventSequence)
              ? store.generatedNarrative.narrative
              : ''
            const blocks = generatedText ? parseAdventureNarrativeBlocks(generatedText) : entry.blocks
            const playback = narrativePlayback?.eventSequence === entry.eventSequence ? narrativePlayback : null
            const sequencedBlocks = playback ? sequenceNarrativeBlocks(blocks) : blocks
            const visibleBlocks = playback
              ? sequencedBlocks.slice(0, playback.unitIndex + 1).map((block, index) => (
                index === playback.unitIndex
                  ? { ...block, text: block.text.slice(0, playback.visibleCharacters) }
                  : block
              ))
              : sequencedBlocks
            const currentUnitComplete = playback != null
              && activeNarrativeUnit != null
              && playback.visibleCharacters >= activeNarrativeUnit.text.length
            return <article className={`adventure-console-entry outcome-${entry.outcome}${playback ? ' is-playing' : ''}`} key={entry.eventSequence}>
              <header className="adventure-player-command"><span>&gt;</span><strong>{entry.actionLabel}</strong><small>{t('textGame.adventure.console.commandActorYou')} · {projectCanonicalLabel(t, ADVENTURE_ACTION_KIND_LABEL_KEYS, manifest.adventure.actions.find(item => item.key === entry.actionKey)?.kind ?? 'look')}</small></header>
              <div className="adventure-console-prose" aria-live={playback ? 'off' : undefined}>{visibleBlocks.map((block, index) => block.kind === 'dialogue'
                ? <blockquote className={block.speaker === playerIdentity?.name ? 'player-dialogue' : ''} key={index}><small>{block.speaker}</small><p>{block.text}{playback && index === playback.unitIndex && <span className="adventure-typewriter-caret" aria-hidden="true" />}</p></blockquote>
                : <p className={`adventure-${block.kind}`} key={index}>{block.text}{playback && index === playback.unitIndex && <span className="adventure-typewriter-caret" aria-hidden="true" />}</p>)}</div>
              {playback && <button
                type="button"
                className="adventure-narrative-continue"
                aria-label={currentUnitComplete
                  ? playback.unitIndex < sequencedBlocks.length - 1 ? t('textGame.adventure.console.narrationContinueAria') : t('textGame.adventure.console.narrationFinishAria')
                  : t('textGame.adventure.console.showFullSentenceAria')}
                onClick={advanceNarrative}
              >{currentUnitComplete
                  ? playback.unitIndex < sequencedBlocks.length - 1 ? t('textGame.adventure.console.narrationContinue') : t('textGame.adventure.console.narrationFinishSegment')
                  : t('textGame.adventure.console.skipTyping')}<ChevronRight /></button>}
              {!playback && !!entry.changes.length && <ul>{entry.changes.map((change, index) => <li key={`${entry.eventSequence}:${index}`}>{change}</li>)}</ul>}
              {!playback && entry.eventSequence === lastAction?.eventSequence && aiReady && <button className="adventure-console-polish" disabled={store.busy || generating} onClick={() => void run(() => store.narrateLastResult(resolved.config))}><Sparkles />{t('textGame.adventure.console.polishButton')}</button>}
            </article>
          })}
          {consoleResponse && <article className="adventure-console-entry adventure-console-response"><header className="adventure-player-command"><span>&gt;</span><strong>{consoleResponse.command}</strong><small>{t('textGame.adventure.console.commandActorYou')} · {t('textGame.adventure.console.commandKindCommand')}</small></header><div className="adventure-console-prose"><p className="adventure-system-response">{consoleResponse.text}</p></div></article>}
          {generating && <article className="adventure-console-system"><Loader2 /><p>{t('textGame.adventure.console.generatingLine')}</p><button onClick={() => void store.cancelGeneration()}><Square />{t('textGame.adventure.console.cancel')}</button></article>}
          {store.pendingIntent && <article className="adventure-console-intent"><small>{t('textGame.adventure.console.pendingIntentTitle')}</small><strong>{manifest.adventure.actions.find(item => item.key === store.pendingIntent?.actionKey)?.label ?? store.pendingIntent.actionKey}</strong><p>{store.pendingIntent.rationale}</p><div><button onClick={() => void run(async () => { await store.adoptPendingIntent(); setConsoleResponse(null) })}><Check />{t('textGame.adventure.console.execute')}</button><button onClick={() => void run(() => store.rejectPendingIntent())}>{t('textGame.adventure.console.cancel')}</button></div></article>}
          {!!store.recoverableRunIds.length && <details className="adventure-console-recovery"><summary>{t('textGame.adventure.console.recoverySummary')}</summary><p>{t('textGame.adventure.console.recoveryExplanation')}</p>{store.recoverableRunIds.map(runId => <button key={runId} disabled={store.busy || generating} onClick={() => void run(() => store.resumeRun(runId))}>{t('textGame.adventure.console.recoverRun', { id: runId })}</button>)}</details>}
        </section>

        {!!endingChoices.length && !store.runtimeState.narrative?.completed && <section className="adventure-console-choices"><small>{t('textGame.adventure.console.endingChoicesUnlocked')}</small>{endingChoices.map(choice => <button key={choice.choiceKey} disabled={store.busy || narrativeReading} onClick={() => void run(() => store.choose(choice.choiceKey))}>{choice.text}<ChevronRight /></button>)}</section>}
        {store.runtimeState.narrative?.completed && <section className="adventure-console-ending"><BookOpenCheck /><div><small>{t('textGame.adventure.console.endingKicker')}</small><h2>{store.runtimeState.narrative.nodes.find(item => item.key === store.runtimeState.narrative?.endingKey)?.title}</h2><p>{t('textGame.adventure.console.endingNote')}</p></div><button onClick={() => setPanel('saves')}><GitBranch />{t('textGame.adventure.console.viewTimeline')}</button></section>}

        {!store.runtimeState.narrative?.completed && <section className={`adventure-command-center${narrativeReading ? ' is-reading' : ''}`} aria-label={t('textGame.adventure.console.commandCenterAria')} aria-busy={narrativeReading}>
          <header><div><small>{narrativeReading ? t('textGame.adventure.console.promptReading') : t('textGame.adventure.console.promptIdle')}</small><p>{narrativeReading ? t('textGame.adventure.console.readingNote') : t('textGame.adventure.console.idleNote')}</p></div><span>{narrativeReading ? t('textGame.adventure.console.readingStatus') : aiReady ? t('textGame.adventure.console.aiConnectedStatus') : t('textGame.adventure.console.offlineStatus')}</span></header>
          <div className="adventure-command-suggestions">{availableActions.slice(0, 8).map((item, index) => <button key={item.action.key} disabled={store.busy || generating || narrativeReading} title={item.action.description} onClick={() => void executeAction(item.action.key)}><kbd>{index + 1}</kbd>{item.action.label}</button>)}</div>
          <form onSubmit={(event) => void submitCommand(event)}>
            <span>&gt;</span>
            <input aria-label={t('textGame.adventure.console.commandInputAria')} value={commandText} onChange={event => setCommandText(event.target.value)} onKeyDown={navigateCommandHistory} disabled={store.busy || generating || narrativeReading} autoComplete="off" placeholder={narrativeReading ? t('textGame.adventure.console.inputReadingPlaceholder') : t('textGame.adventure.console.inputExamplePlaceholder', { location: location.title })} />
            <button type="submit" disabled={!commandText.trim() || store.busy || generating || narrativeReading}><Send />{t('textGame.adventure.console.execute')}</button>
          </form>
        </section>}
      </div>
    </main>

    <nav className="adventure-mobile-dock" aria-label={t('textGame.adventure.console.dockAria')}><button onClick={() => setPanel('inventory')}><Backpack /><span>{t('textGame.adventure.console.navInventory')}</span></button><button onClick={() => setPanel('skills')}><WandSparkles /><span>{t('textGame.adventure.console.navSkills')}</span></button><button onClick={() => setPanel('quests')}><ScrollText /><span>{t('textGame.adventure.console.navQuests')}</span></button><button onClick={() => setPanel('journal')}><History /><span>{t('textGame.adventure.console.navJournal')}</span></button><button onClick={() => setPanel('saves')}><Save /><span>{t('textGame.adventure.console.navSaves')}</span></button></nav>

    {panel && <div className="adventure-panel-backdrop" role="presentation"><section className="adventure-panel" aria-label={{ inventory: t('textGame.adventure.console.navInventory'), skills: t('textGame.adventure.console.navSkills'), quests: t('textGame.adventure.console.navQuests'), journal: t('textGame.adventure.console.panelJournalHeading'), saves: t('textGame.adventure.console.panelSavesHeading') }[panel]}><header><div><small>{t('textGame.adventure.console.journalKicker')}</small><h2>{{ inventory: t('textGame.adventure.console.panelInventoryHeading'), skills: t('textGame.adventure.console.panelSkillsHeading'), quests: t('textGame.adventure.console.panelQuestsHeading'), journal: t('textGame.adventure.console.panelJournalHeading'), saves: t('textGame.adventure.console.panelSavesHeading') }[panel]}</h2></div><button aria-label={t('textGame.common.player.closePanel')} onClick={() => setPanel(null)}><X /></button></header><div className="adventure-panel-content">
      {panel === 'inventory' && <div className="adventure-inventory-grid">{playerItems.map(item => { const definition = manifest.adventure.items.find(value => value.key === item.itemKey); return <article key={`${item.itemKey}:${item.state}`}><i>{itemIcon(definition?.tags ?? [], item.itemKey)}</i><div><small>{item.state === 'equipped' ? t('textGame.adventure.console.equippedLabel') : definition?.consumable ? t('textGame.adventure.console.itemConsumable') : t('textGame.adventure.console.itemCarried')}</small><strong>{friendlyName(definition?.title, item.itemKey)}</strong><p>{friendlyDescription(t, definition?.description, item.itemKey, 'item')}</p></div><b>×{item.quantity}</b></article> })}{!playerItems.length && <div className="adventure-empty">{t('textGame.adventure.console.inventoryEmptyPanel')}</div>}</div>}
      {panel === 'skills' && <div className="adventure-skills-grid">{Object.entries(adventure.abilities).map(([key, value]) => { const definition = manifest.adventure.abilities.find(item => item.key === key); return <article key={key}><i><WandSparkles /></i><div><small>{t('textGame.adventure.console.abilityLevel', { level: value })}</small><strong>{friendlyName(definition?.title, key)}</strong><p>{friendlyDescription(t, definition?.description, key, 'ability')}</p><span><b style={{ width: `${gauge(value, definition?.minimum ?? 0, definition?.maximum ?? 10)}%` }} /></span></div></article> })}</div>}
      {panel === 'quests' && <div className="adventure-quest-list">{adventure.quests.map(quest => { const definition = manifest.adventure.quests.find(item => item.key === quest.questKey); return <article className={`status-${quest.status}`} key={quest.questKey}><header><span>{projectCanonicalLabel(t, ADVENTURE_QUEST_STATUS_LABEL_KEYS, quest.status)}</span><strong>{definition?.title ?? quest.questKey}</strong></header><p>{definition?.description}</p><ul>{quest.objectives.map(item => <li className={item.completed ? 'done' : ''} key={item.objectiveKey}>{item.completed ? <Check /> : <CircleDot />}{definition?.objectives.find(value => value.key === item.objectiveKey)?.title ?? item.objectiveKey}</li>)}</ul></article> })}</div>}
      {panel === 'journal' && <div className="adventure-journal">{[...adventure.actionHistory].reverse().map(item => <article key={item.eventSequence}><i>{item.eventSequence}</i><div><small>{projectCanonicalLabel(t, ADVENTURE_ACTION_KIND_LABEL_KEYS, item.kind)} · {item.outcome === 'success' ? t('textGame.adventure.console.journalOutcomeSuccess') : projectCanonicalLabel(t, ADVENTURE_CHECK_OUTCOME_LABEL_KEYS, item.outcome)}</small><strong>{manifest.adventure.actions.find(value => value.key === item.actionKey)?.label ?? item.actionKey}</strong><p>{item.narrative}</p></div></article>)}{!adventure.actionHistory.length && <div className="adventure-empty">{t('textGame.adventure.console.journalEmpty')}</div>}</div>}
      {panel === 'saves' && <div className="adventure-save-panel"><section><h3><Save />{t('textGame.adventure.console.checkpointHeading')}</h3><div><input value={checkpointName} onChange={event => setCheckpointName(event.target.value)} placeholder={t('textGame.adventure.console.checkpointNamePlaceholder')} /><button disabled={!checkpointName.trim()} onClick={() => void run(async () => { await store.saveCheckpoint(checkpointName); setCheckpointName('') })}>{t('textGame.adventure.console.save')}</button></div></section><section><h3><GitBranch />{t('textGame.adventure.console.checkpointsHeading')}</h3>{store.checkpoints.map(item => <button key={item.id} onClick={() => void run(() => store.forkCheckpoint(item.id!))}><span><strong>{item.name}</strong><small>{t('textGame.adventure.console.checkpointMetaLine', { sequence: item.throughSequence, time: formatTime(lang, item.createdAt) })}</small></span><b>{t('textGame.adventure.console.branchHere')}</b></button>)}{!store.checkpoints.length && <p>{t('textGame.adventure.console.checkpointsEmptyHint')}</p>}</section><section><h3><GitBranch />{t('textGame.adventure.console.timelineBranchHeading')}</h3><div><input value={branchTitle} onChange={event => setBranchTitle(event.target.value)} placeholder={t('textGame.adventure.console.branchNamePlaceholder')} /><button disabled={!branchTitle.trim()} onClick={() => void run(async () => { await store.forkCurrent(branchTitle); setBranchTitle(''); setPanel(null) })}>{t('textGame.adventure.console.createBranch')}</button></div></section></div>}
    </div></section></div>}
  </div>
}
