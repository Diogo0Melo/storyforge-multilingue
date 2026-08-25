import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  GitBranch,
  History,
  Library,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import type { FrozenNarrativeBeat, FrozenNarrativeChoice, Project, WorkspaceScope } from '../../lib/types'
import { currentPlayerReleases } from '../../lib/text-game/player-library'
import { useStoryGamePlayerStore } from '../../stores/story-game-player'
import { useDomainT } from '../../i18n'
import {
  NARRATIVE_BEAT_KIND_LABEL_KEYS,
  NARRATIVE_NODE_KIND_LABEL_KEYS,
  projectCanonicalLabel,
  type DisplayT,
} from '../../i18n/display-projection'
import { useDialog } from '../shared/Dialog'
import './player-roadshow.css'

type PlayerView = 'story' | 'history' | 'saves'
type ReaderTheme = 'paper' | 'night'

interface ReaderPreferences {
  fontScale: number
  lineHeight: number
  theme: ReaderTheme
}

interface ReaderCursor {
  sceneKey: string
  revealedStep: number
}

interface TypewriterState {
  beatKey: string
  visibleCharacters: number
}

interface DisplayBeat {
  label: string
  text: string
  dialogue: boolean
}

const DEFAULT_PREFERENCES: ReaderPreferences = { fontScale: 1, lineHeight: 1.85, theme: 'paper' }

function preferenceKey(projectId: number): string {
  return `storyforge.storygame.reader.${projectId}`
}

function cursorKey(sessionId: number): string {
  return `storyforge.storygame.cursor.${sessionId}`
}

function loadCursor(sessionId: number, sceneKey: string, maximumStep: number): ReaderCursor {
  try {
    const value = JSON.parse(localStorage.getItem(cursorKey(sessionId)) ?? '{}') as Partial<ReaderCursor>
    if (value.sceneKey === sceneKey && Number.isInteger(value.revealedStep)) {
      return {
        sceneKey,
        revealedStep: Math.min(maximumStep, Math.max(1, Number(value.revealedStep))),
      }
    }
  } catch { /* restart the current scene when a local cursor is invalid */ }
  return { sceneKey, revealedStep: 1 }
}

function saveCursor(sessionId: number, cursor: ReaderCursor): void {
  try { localStorage.setItem(cursorKey(sessionId), JSON.stringify(cursor)) } catch { /* reading can continue in memory */ }
}

function loadPreferences(projectId: number): ReaderPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey(projectId)) ?? '{}') as Partial<ReaderPreferences>
    return {
      fontScale: [0.9, 1, 1.15, 1.3].includes(value.fontScale ?? 0) ? value.fontScale! : 1,
      lineHeight: [1.6, 1.85, 2.1].includes(value.lineHeight ?? 0) ? value.lineHeight! : 1.85,
      theme: value.theme === 'night' ? 'night' : 'paper',
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

function attributedText(text: string): { speaker: string; text: string } | null {
  const match = text.trim().match(/^【([^】]+)】\s*([\s\S]*)$/)
  return match ? { speaker: match[1].trim(), text: match[2].trim() } : null
}

function displayBeat(beat: FrozenNarrativeBeat, speakers: Record<string, string>, t: DisplayT): DisplayBeat {
  const attributed = attributedText(beat.text)
  if (attributed) return { label: attributed.speaker, text: attributed.text, dialogue: true }
  if (beat.kind === 'dialogue') return {
    label: (beat.speakerKey ? speakers[beat.speakerKey] : null)
      ?? (Object.keys(speakers).length === 1 ? Object.values(speakers)[0] : t('textGame.common.player.unknownSpeaker')),
    text: beat.text,
    dialogue: true,
  }
  return { label: projectCanonicalLabel(t, NARRATIVE_BEAT_KIND_LABEL_KEYS, beat.kind), text: beat.text, dialogue: false }
}

function choiceForKey(choices: FrozenNarrativeChoice[], key: string): FrozenNarrativeChoice | null {
  return choices.find(choice => choice.choiceKey === key) ?? null
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(value)
}

export default function StoryGamePlayer(props: {
  project: Project
  scope: WorkspaceScope
  worldGroupId: number | null
}) {
  const store = useStoryGamePlayerStore()
  const dialog = useDialog()
  const { t } = useDomainT('simulation')
  const [view, setView] = useState<PlayerView>('story')
  const [showSettings, setShowSettings] = useState(false)
  const [catalogReleaseId, setCatalogReleaseId] = useState<number | null>(null)
  const [preferences, setPreferences] = useState(() => loadPreferences(props.project.id!))
  const [readerCursor, setReaderCursor] = useState<ReaderCursor>({ sceneKey: '', revealedStep: 1 })
  const [typewriter, setTypewriter] = useState<TypewriterState>({ beatKey: '', visibleCharacters: 0 })

  useEffect(() => {
    setCatalogReleaseId(null)
    void store.load(props.scope, props.worldGroupId, true)
  // Zustand actions are stable; the explicit scope is the reload boundary.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.scope.projectId, props.scope.worldId, props.scope.workId, props.worldGroupId])

  useEffect(() => {
    localStorage.setItem(preferenceKey(props.project.id!), JSON.stringify(preferences))
  }, [preferences, props.project.id])

  const selected = store.sessions.find(session => session.id === store.selectedSessionId) ?? null
  const catalog = useMemo(() => currentPlayerReleases(store.releases), [store.releases])
  const catalogRelease = catalog.find(item => item.release.id === catalogReleaseId) ?? null
  const selectedRelease = store.releases.find(item => item.release.id === selected?.gameReleaseId) ?? null
  const playerCharacter = selectedRelease?.playerCharacter ?? null
  const speakerNames = useMemo(() => ({
    ...(selectedRelease?.speakerNames ?? {}),
    ...store.speakerNames,
  }), [selectedRelease?.speakerNames, store.speakerNames])
  const narrative = store.runtimeState.narrative ?? null
  const isLegacy = narrative?.version === 1
  const currentNode = narrative?.nodes.find(node => node.key === narrative.currentNodeKey) ?? null
  const beats = useMemo(() => (narrative?.beats ?? [])
    .filter(beat => beat.nodeKey === currentNode?.key)
    .sort((left, right) => left.order - right.order), [currentNode?.key, narrative?.beats])
  const currentNodeVisit = narrative && currentNode
    ? narrative.visitedNodeKeys.filter(key => key === currentNode.key).length
    : 0
  const readerSceneKey = selected && currentNode ? `${selected.id}:${currentNode.key}:${currentNodeVisit}` : ''
  const maximumReadingStep = Math.max(1, beats.length + 1)
  const revealedStep = readerCursor.sceneKey === readerSceneKey
    ? Math.min(maximumReadingStep, Math.max(1, readerCursor.revealedStep))
    : 1
  const revealedBeatCount = beats.length === 0 ? 0 : Math.min(beats.length, revealedStep)
  const revealedBeats = useMemo(() => beats.slice(0, revealedBeatCount), [beats, revealedBeatCount])
  const nodeContentComplete = beats.length === 0 || revealedStep > beats.length
  const activeBeat = nodeContentComplete ? null : revealedBeats[revealedBeats.length - 1] ?? null
  const activeBeatText = activeBeat ? displayBeat(activeBeat, speakerNames, t).text : ''
  const activeTypewriterKey = activeBeat ? `${readerSceneKey}:${activeBeat.beatKey}` : ''
  const visibleCharacters = typewriter.beatKey === activeTypewriterKey
    ? Math.min(activeBeatText.length, typewriter.visibleCharacters)
    : 0
  const typewriterComplete = !activeBeat || visibleCharacters >= activeBeatText.length
  const visibleChoices = useMemo(() => (narrative?.visibleChoiceKeys ?? [])
    .map(key => choiceForKey(narrative?.choices ?? [], key))
    .filter((choice): choice is FrozenNarrativeChoice => choice != null), [narrative])
  const legacyChoices = useMemo(() => (narrative?.version === 1 ? narrative.availableNodeKeys : [])
    .map(key => narrative?.nodes.find(node => node.key === key))
    .filter((node): node is NonNullable<typeof node> => node != null), [narrative])
  const speakers = useMemo(() => Array.from(new Set([
    ...(playerCharacter ? [playerCharacter.name] : []),
    ...revealedBeats
    .map(beat => displayBeat(beat, speakerNames, t))
    .filter(beat => beat.dialogue)
    .map(beat => beat.label),
  ])), [playerCharacter, revealedBeats, speakerNames, t])
  const progress = narrative ? Math.min(100, Math.max(8, Math.round(
    narrative.visitedNodeKeys.length / Math.max(narrative.nodes.length, 1) * 100,
  ))) : 0

  useEffect(() => {
    if (!selected?.id || !readerSceneKey) return
    setReaderCursor(current => current.sceneKey === readerSceneKey
      ? current
      : loadCursor(selected.id!, readerSceneKey, maximumReadingStep))
  }, [maximumReadingStep, readerSceneKey, selected?.id])

  useEffect(() => {
    if (!activeTypewriterKey) return
    setTypewriter(current => current.beatKey === activeTypewriterKey
      ? current
      : { beatKey: activeTypewriterKey, visibleCharacters: 0 })
  }, [activeTypewriterKey])

  useEffect(() => {
    if (!activeTypewriterKey || typewriterComplete) return
    const timeout = window.setTimeout(() => {
      setTypewriter(current => current.beatKey === activeTypewriterKey
        ? { ...current, visibleCharacters: Math.min(activeBeatText.length, current.visibleCharacters + 1) }
        : current)
    }, 24)
    return () => window.clearTimeout(timeout)
  }, [activeBeatText.length, activeTypewriterKey, typewriterComplete, visibleCharacters])

  const run = async (action: () => Promise<unknown>) => {
    try { await action() } catch { /* store exposes the actionable error */ }
  }

  const advanceReader = () => {
    if (!selected?.id || !readerSceneKey || nodeContentComplete) return
    if (!typewriterComplete) {
      setTypewriter({ beatKey: activeTypewriterKey, visibleCharacters: activeBeatText.length })
      return
    }
    const next = {
      sceneKey: readerSceneKey,
      revealedStep: Math.min(maximumReadingStep, revealedStep + 1),
    }
    saveCursor(selected.id, next)
    setReaderCursor(next)
  }

  const beatBelongsToPlayer = (beat: FrozenNarrativeBeat, shown: DisplayBeat): boolean => (
    shown.dialogue
    && playerCharacter != null
    && (beat.speakerKey === playerCharacter.speakerKey || shown.label === playerCharacter.name)
  )

  const startGame = async (releaseId: number, title: string) => {
    await run(async () => {
      // 存档标题是写入存档表的持久数据（canonical stored value），不随 UI locale 投影。
      await store.start(releaseId, `${title} · ${new Date().toLocaleDateString('zh-CN')} 存档`)
      setView('story')
    })
  }

  const saveCheckpoint = async () => {
    const name = await dialog.prompt({
      title: t('textGame.story.player.saveCheckpointDialogTitle'),
      message: t('textGame.story.player.saveCheckpointDialogMessage'),
      defaultValue: currentNode?.title ? `${currentNode.title} · ${t('textGame.story.player.manualSaveDefault')}` : t('textGame.story.player.manualSaveDefault'),
      confirmText: t('textGame.story.player.dialogSave'),
    })
    if (name == null) return
    await run(() => store.saveCheckpoint(name))
  }

  const forkCheckpoint = async (checkpointId: number, checkpointName: string) => {
    const title = await dialog.prompt({
      title: t('textGame.story.player.forkDialogTitle'),
      message: t('textGame.story.player.forkDialogMessage'),
      defaultValue: `${selected?.title ?? t('textGame.story.player.sessionNameSuffix')} · ${checkpointName}`,
      confirmText: t('textGame.story.player.forkDialogConfirm'),
    })
    if (title == null) return
    await run(async () => {
      await store.forkCheckpoint(checkpointId, title)
      setView('story')
    })
  }

  const removeSession = async (sessionId: number, title: string) => {
    const confirmed = await dialog.confirm({
      title: t('textGame.story.player.deleteConfirmTitle', { title }),
      message: t('textGame.story.player.deleteConfirmMessage'),
      confirmText: t('textGame.story.player.deleteConfirmAction'),
      tone: 'danger',
    })
    if (confirmed) await run(async () => {
      await store.remove(sessionId)
      try { localStorage.removeItem(cursorKey(sessionId)) } catch { /* stale local cursor is harmless */ }
    })
  }

  if (store.loading && !selected) return <div className="storygame-launcher storygame-player-v2"><div className="storygame-empty"><Loader2 className="h-6 w-6 animate-spin" /><span>{t('textGame.story.player.restoringSaves')}</span></div></div>

  if (!selected || !narrative || !currentNode) return (
    <div className="storygame-launcher storygame-player-v2" data-testid="storygame-player">
      <div className="storygame-launcher-atmosphere" />
      <div className="storygame-launcher-content">
        <span className="storygame-launcher-kicker"><Library className="h-4 w-4" /> BRANCHING STORIES</span>
        <h2>{catalogRelease ? t('textGame.story.player.detailTitle') : t('textGame.story.player.libraryTitle')}</h2>
        <p>{catalogRelease ? t('textGame.story.player.detailIntro') : t('textGame.story.player.libraryIntro')}</p>
        {store.error && <div className="storygame-alert" role="alert"><span>{store.error}</span><button type="button" onClick={() => void store.load(props.scope, props.worldGroupId)}>{t('textGame.story.player.resync')}</button></div>}
        {catalogRelease ? <section className="textgame-title-page storygame-title-page" aria-label={t('textGame.story.player.titlePageAria')}>
          <button type="button" className="textgame-catalog-back" onClick={() => setCatalogReleaseId(null)}><ArrowLeft className="h-4 w-4" />{t('textGame.common.catalog.backToAllGames')}</button>
          <div className="textgame-title-art" aria-hidden="true"><BookOpen /><span>BRANCHING<br />NARRATIVE</span></div>
          <div className="textgame-title-copy">
            <small>{t('textGame.story.tag')} · {t('textGame.common.catalog.playableVersion')}</small>
            <h3>{catalogRelease.manifest?.definition.title ?? catalogRelease.release.label}</h3>
            <p>{catalogRelease.manifest?.definition.description || t('textGame.story.player.fallbackDescription')}</p>
            {catalogRelease.playerCharacter && <div className="textgame-player-role" aria-label={t('textGame.story.player.playAsAria', { name: catalogRelease.playerCharacter.name })}><i>{catalogRelease.playerCharacter.name.slice(0, 1)}</i><span><small>{t('textGame.story.player.playAsLabel')}</small><strong>{catalogRelease.playerCharacter.name}</strong>{catalogRelease.playerCharacter.description && <p>{catalogRelease.playerCharacter.description}</p>}</span></div>}
            {catalogRelease.manifest && <div className="textgame-title-stats"><span>{t('textGame.story.player.statsScenes', { count: catalogRelease.manifest.narrative.nodes.length })}</span><span>{t('textGame.story.player.statsChoices', { count: catalogRelease.manifest.narrative.choices.length })}</span><span>{t('textGame.story.player.statsEndings', { count: catalogRelease.manifest.narrative.nodes.filter(node => node.kind === 'ending').length })}</span></div>}
            {catalogRelease.error ? <span className="storygame-error-text">{catalogRelease.error}</span> : <div className="textgame-title-actions"><button type="button" className="textgame-start" onClick={() => void startGame(catalogRelease.release.id!, catalogRelease.manifest!.definition.title)} disabled={store.busy}><Plus className="h-4 w-4" />{t('textGame.common.catalog.startNew')}</button>{store.sessions.find(session => session.gameReleaseId === catalogRelease.release.id) && <button type="button" onClick={() => void store.select(store.sessions.find(session => session.gameReleaseId === catalogRelease.release.id)!.id!)}><Clock3 className="h-4 w-4" />{t('textGame.common.catalog.continueProgress')}</button>}</div>}
          </div>
        </section> : <>
          <div className="textgame-catalog-heading"><span>{t('textGame.common.catalog.allGames')}</span><small>{t('textGame.common.catalog.count', { count: catalog.length })}</small></div>
          <section className="textgame-catalog-list" aria-label={t('textGame.story.player.catalogListAria')}>
            {catalog.map(item => <article key={item.release.id}><button type="button" aria-label={t('textGame.common.catalog.viewGameAria', { title: item.manifest?.definition.title ?? item.release.label })} onClick={() => setCatalogReleaseId(item.release.id!)}><span className="textgame-catalog-icon"><GitBranch /></span><span className="textgame-catalog-copy"><small>{t('textGame.story.tag')}</small><strong>{item.manifest?.definition.title ?? item.release.label}</strong><p>{item.manifest?.definition.description || t('textGame.story.player.fallbackDescription')}</p>{item.manifest && <i>{t('textGame.story.player.catalogStatsLine', { scenes: item.manifest.narrative.nodes.length, choices: item.manifest.narrative.choices.length, endings: item.manifest.narrative.nodes.filter(node => node.kind === 'ending').length })}</i>}</span><span className="textgame-catalog-open">{t('textGame.common.catalog.viewDetails')}<ChevronRight /></span></button></article>)}
            {!catalog.length && <div className="storygame-empty-small">{t('textGame.story.player.emptyCatalog')}</div>}
          </section>
          {!!store.sessions.length && <section className="storygame-launcher-saves"><h3><Clock3 className="h-4 w-4" />{t('textGame.story.player.continueTitle')}</h3>{store.sessions.map(session => <div key={session.id}><button type="button" onClick={() => void store.select(session.id!)}><strong>{session.title}</strong><small>{formatTime(session.updatedAt)}{session.gameReleaseId == null ? ` · ${t('textGame.story.player.saveLegacyTag')}` : session.parentSessionId ? ` · ${t('textGame.story.player.saveBranchTag')}` : ` · ${t('textGame.story.player.saveAutoTag')}`}</small></button><button type="button" aria-label={t('textGame.story.player.deleteSaveAria', { title: session.title })} onClick={() => void removeSession(session.id!, session.title)}><Trash2 className="h-4 w-4" /></button></div>)}</section>}
        </>}
      </div>
    </div>
  )

  return (
    <div className={`storygame-shell storygame-player-v2 storygame-playing storygame-theme-${preferences.theme}`} data-testid="storygame-player">
      <section className="storygame-main" aria-label={t('textGame.story.player.mainAria')}>
        <header className="storygame-gamebar">
          <button type="button" className="textgame-player-exit" aria-label={t('textGame.common.player.exitGame')} onClick={() => void store.select(null)}><ArrowLeft className="h-4 w-4" /><span>{t('textGame.common.player.exitGame')}</span></button>
          <div className="storygame-game-title"><small>{narrative.moduleTitle}{playerCharacter ? ` · ${t('textGame.story.player.youAreSuffix', { name: playerCharacter.name })}` : ''}{isLegacy ? ` · ${t('textGame.story.player.legacyModeSuffix')}` : ''}</small><strong>{selectedRelease?.manifest?.definition.title ?? selected.title}</strong></div>
          <div className="storygame-progress" aria-label={t('textGame.story.player.progressAria', { progress })}><span style={{ width: `${progress}%` }} /></div>
          <nav aria-label={t('textGame.story.player.navAria')}>
            <button type="button" className={view === 'story' ? 'active' : ''} onClick={() => setView('story')}><BookOpen className="h-4 w-4" />{t('textGame.story.player.navStory')}</button>
            <button type="button" className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}><History className="h-4 w-4" />{t('textGame.story.player.navHistory')}</button>
            <button type="button" className={view === 'saves' ? 'active' : ''} onClick={() => setView('saves')}><Save className="h-4 w-4" />{t('textGame.story.player.navSaves')}</button>
            <button type="button" aria-label={t('textGame.story.player.readingSettingsAria')} onClick={() => setShowSettings(value => !value)}><Settings2 className="h-4 w-4" /></button>
            <button type="button" aria-label={t('textGame.story.player.refreshSavesAria')} onClick={() => void store.load(props.scope, props.worldGroupId)}><RefreshCw className="h-4 w-4" /></button>
          </nav>
        </header>

        {store.error && <div className="storygame-alert" role="alert"><span>{store.error}</span><button type="button" onClick={() => void store.load(props.scope, props.worldGroupId)}>{t('textGame.story.player.resync')}</button></div>}
        {view === 'story' && !narrative.completed && <section key={readerSceneKey} className="storygame-story-stage" aria-labelledby="storygame-node-title" style={{ fontSize: `${preferences.fontScale}rem`, lineHeight: preferences.lineHeight }}>
          <div className="storygame-stage-atmosphere"><span /><span /><span /></div>
          <div className="storygame-scene-meta"><span>{t('textGame.story.player.scenePosition', { visited: narrative.visitedNodeKeys.length, total: narrative.nodes.length })}</span><span>{t('textGame.story.player.autosavedLine', { sequence: store.runtimeState.lastSequence })}</span></div>
          <header><small>{t('textGame.story.player.currentSceneLabel')}</small><h2 id="storygame-node-title">{currentNode.title}</h2>{currentNode.summary && <p>{currentNode.summary}</p>}</header>
          {isLegacy && <div className="storygame-legacy-note">{t('textGame.story.player.legacyNote')}</div>}
          {playerCharacter && <div className="storygame-player-identity" aria-label={t('textGame.story.player.playingAsAria', { name: playerCharacter.name })}><span>{t('textGame.story.player.playingAsLabel')}</span><i>{playerCharacter.name.slice(0, 1)}</i><div><strong>{playerCharacter.name}</strong>{playerCharacter.description && <small>{playerCharacter.description}</small>}</div></div>}
          {!!speakers.length && <div className="storygame-cast" aria-label={t('textGame.story.player.castAria')}>{speakers.map(speaker => <span className={speaker === playerCharacter?.name ? 'is-player' : ''} key={speaker}><i>{speaker.slice(0, 1)}</i><b>{speaker}</b><small>{speaker === playerCharacter?.name ? t('textGame.story.player.castPlayerRole') : t('textGame.story.player.castSceneRole')}</small></span>)}</div>}
          <div className="storygame-beats" aria-live="polite">
            {revealedBeats.map(beat => {
              const shown = displayBeat(beat, speakerNames, t)
              const playerBeat = beatBelongsToPlayer(beat, shown)
              const typing = beat.beatKey === activeBeat?.beatKey && !typewriterComplete
              const text = beat.beatKey === activeBeat?.beatKey ? shown.text.slice(0, visibleCharacters) : shown.text
              return <article className={`storygame-beat storygame-beat-${beat.kind} ${shown.dialogue ? `is-dialogue ${playerBeat ? 'is-player side-right' : 'is-npc side-left'}` : ''}`} data-speaker-role={shown.dialogue ? playerBeat ? 'player' : 'npc' : undefined} key={beat.beatKey} aria-label={`${shown.label}：${shown.text}`}>
                {shown.dialogue && <span className="storygame-speaker-mark" aria-hidden="true">{shown.label.slice(0, 1)}</span>}
                <div><strong>{shown.label}</strong><p>{text}{typing && <span className="storygame-typewriter-caret" aria-hidden="true" />}</p></div>
              </article>
            })}
            {!beats.length && <p className="storygame-node-summary">{t('textGame.story.player.emptyBeatsHint')}</p>}
          </div>
          {!nodeContentComplete && <div className="storygame-reading-controls"><button type="button" onClick={advanceReader} disabled={store.busy} aria-label={!typewriterComplete ? t('textGame.story.player.revealFullAria') : revealedBeatCount < beats.length ? t('textGame.story.player.continueReadingAria') : t('textGame.story.player.toChoicesAria')}><span>{typewriterComplete && revealedBeatCount >= beats.length ? t('textGame.story.player.makeChoice') : t('textGame.story.player.continueButton')}</span><ChevronRight className="h-4 w-4" /></button></div>}
          {nodeContentComplete && <div className="storygame-choices" aria-label={t('textGame.story.player.choicesAria')}>
            <small>{t('textGame.story.player.yourChoiceLabel')}</small>
            {isLegacy ? legacyChoices.map((node, index) => <div key={node.key}><button type="button" onClick={() => void run(() => store.advanceLegacy(node.key))} disabled={store.busy}><span>{index + 1}</span><span><strong>{node.title}</strong>{node.summary && <small>{node.summary}</small>}</span><ChevronRight className="h-4 w-4" /></button></div>) : visibleChoices.map((choice, index) => {
              const available = narrative.availableChoiceKeys?.includes(choice.choiceKey) ?? false
              const reasonId = `choice-reason-${choice.choiceKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`
              return <div key={choice.choiceKey}><button type="button" onClick={() => void run(() => store.choose(choice.choiceKey))} disabled={!available || store.busy} aria-describedby={!available && choice.unavailableReason ? reasonId : undefined}><span>{index + 1}</span><span><strong>{choice.text}</strong>{choice.description && <small>{choice.description}</small>}</span><ChevronRight className="h-4 w-4" /></button>{!available && <p id={reasonId}>{choice.unavailableReason || t('textGame.story.player.conditionNotMet')}</p>}</div>
            })}
          </div>}
        </section>}

        {view === 'story' && narrative.completed && <section key={readerSceneKey} className="storygame-ending" aria-labelledby="storygame-ending-title"><CheckCircle2 className="h-10 w-10" /><small>{nodeContentComplete ? t('textGame.story.player.endingKickerReached') : t('textGame.story.player.endingKickerFinal')}</small><h2 id="storygame-ending-title">{currentNode.title}</h2>{revealedBeats.map(beat => { const shown = displayBeat(beat, speakerNames, t); const playerBeat = beatBelongsToPlayer(beat, shown); const typing = beat.beatKey === activeBeat?.beatKey && !typewriterComplete; const text = beat.beatKey === activeBeat?.beatKey ? shown.text.slice(0, visibleCharacters) : shown.text; return <div className={`storygame-beat storygame-beat-${beat.kind} ${shown.dialogue ? `is-dialogue ${playerBeat ? 'is-player side-right' : 'is-npc side-left'}` : ''}`} data-speaker-role={shown.dialogue ? playerBeat ? 'player' : 'npc' : undefined} key={beat.beatKey}><strong>{shown.label}</strong><p>{text}{typing && <span className="storygame-typewriter-caret" aria-hidden="true" />}</p></div> })}{!nodeContentComplete ? <div className="storygame-reading-controls"><button type="button" onClick={advanceReader} disabled={store.busy} aria-label={!typewriterComplete ? t('textGame.story.player.revealFullAria') : revealedBeatCount < beats.length ? t('textGame.story.player.continueReadingAria') : t('textGame.story.player.viewEndingAria')}><span>{typewriterComplete && revealedBeatCount >= beats.length ? t('textGame.story.player.viewEnding') : t('textGame.story.player.continueButton')}</span><ChevronRight className="h-4 w-4" /></button></div> : <><div className="storygame-ending-stats"><span>{t('textGame.story.player.statVisitedNodes', { count: narrative.visitedNodeKeys.length })}</span><span>{t('textGame.story.player.statKeyChoices', { count: narrative.choiceHistory?.length ?? 0 })}</span><span>{t('textGame.story.player.statReplayedEvents', { count: store.runtimeState.lastSequence })}</span></div><div className="storygame-ending-actions"><button type="button" onClick={() => setView('history')}><History className="h-4 w-4" />{t('textGame.story.player.reviewChoices')}</button><button type="button" onClick={() => setView('saves')}><GitBranch className="h-4 w-4" />{t('textGame.story.player.rechooseFromCheckpoint')}</button></div></>}</section>}

        {view !== 'story' && <div className="storygame-panel-backdrop" role="presentation"><section className="storygame-panel" aria-label={view === 'history' ? t('textGame.story.player.historyPanelAria') : t('textGame.story.player.savesPanelAria')}><header><div><small>{view === 'history' ? t('textGame.story.player.historyKicker') : t('textGame.story.player.savesKicker')}</small><h2>{view === 'history' ? t('textGame.story.player.historyHeading') : t('textGame.story.player.savesHeading')}</h2></div><button type="button" aria-label={t('textGame.common.player.closePanel')} onClick={() => setView('story')}><X className="h-4 w-4" /></button></header>{view === 'history' ? <div className="storygame-history">{narrative.visitedNodeKeys.map((nodeKey, index) => { const node = narrative.nodes.find(candidate => candidate.key === nodeKey); const allNodeBeats = (narrative.beats ?? []).filter(beat => beat.nodeKey === nodeKey).sort((left, right) => left.order - right.order); const nodeBeats = nodeKey === currentNode.key && index === narrative.visitedNodeKeys.length - 1 ? allNodeBeats.slice(0, revealedBeatCount) : allNodeBeats; const historyItem = narrative.choiceHistory?.[index]; const choice = historyItem ? choiceForKey(narrative.choices ?? [], historyItem.choiceKey) : null; return <article key={`${nodeKey}-${index}`}><span>{index + 1}</span><div><small>{node ? projectCanonicalLabel(t, NARRATIVE_NODE_KIND_LABEL_KEYS, node.kind) : projectCanonicalLabel(t, NARRATIVE_NODE_KIND_LABEL_KEYS, 'scene')}</small><strong>{node?.title ?? nodeKey}</strong>{nodeBeats.map(beat => { const shown = displayBeat(beat, speakerNames, t); return <p key={beat.beatKey}><b>{shown.label}</b>：{shown.text}</p> })}{choice && <p className="storygame-history-choice">{t('textGame.story.player.historyChoiceLine', { choice: choice.text, sequence: historyItem?.eventSequence })}</p>}</div></article>})}</div> : <div className="storygame-saves"><button type="button" className="storygame-primary-save" onClick={() => void saveCheckpoint()} disabled={store.busy}><Save className="h-4 w-4" />{t('textGame.story.player.saveCurrentCheckpoint')}</button><div className="storygame-save-list">{store.checkpoints.map(checkpoint => <article key={checkpoint.id}><div><strong>{checkpoint.name}</strong><span>{t('textGame.story.player.checkpointMetaLine', { sequence: checkpoint.throughSequence, time: formatTime(checkpoint.createdAt) })}</span></div><button type="button" onClick={() => void forkCheckpoint(checkpoint.id!, checkpoint.name)} disabled={store.busy}><GitBranch className="h-4 w-4" />{t('textGame.story.player.branchFromHere')}</button></article>)}</div><button type="button" className="storygame-secondary-action" onClick={() => void run(() => store.forkCurrent())} disabled={store.busy}><GitBranch className="h-4 w-4" />{t('textGame.story.player.branchFromCurrent')}</button></div>}</section></div>}

        {showSettings && <div className="storygame-settings-popover"><div><UserRound className="h-4 w-4" /><strong>{t('textGame.story.player.settingsTitle')}</strong></div><label>{t('textGame.story.player.fontSizeLabel')}<select value={preferences.fontScale} onChange={event => setPreferences(value => ({ ...value, fontScale: Number(event.target.value) }))}><option value={0.9}>{t('textGame.story.player.fontSmall')}</option><option value={1}>{t('textGame.story.player.fontStandard')}</option><option value={1.15}>{t('textGame.story.player.fontLarge')}</option><option value={1.3}>{t('textGame.story.player.fontXl')}</option></select></label><label>{t('textGame.story.player.lineHeightLabel')}<select value={preferences.lineHeight} onChange={event => setPreferences(value => ({ ...value, lineHeight: Number(event.target.value) }))}><option value={1.6}>{t('textGame.story.player.lineCompact')}</option><option value={1.85}>{t('textGame.story.player.lineCozy')}</option><option value={2.1}>{t('textGame.story.player.lineLoose')}</option></select></label><label>{t('textGame.story.player.themeLabel')}<select value={preferences.theme} onChange={event => setPreferences(value => ({ ...value, theme: event.target.value as ReaderTheme }))}><option value="paper">{t('textGame.story.player.themePaper')}</option><option value="night">{t('textGame.story.player.themeNight')}</option></select></label></div>}
      </section>
    </div>
  )
}
