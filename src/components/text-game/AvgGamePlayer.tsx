import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BookOpen, ChevronRight, Eye, EyeOff, FastForward, Gauge, GitBranch, History, ImageOff, Maximize2, Play, Plus, RotateCcw, Save, Settings2, SkipForward, Trash2, Volume2, VolumeX, X } from 'lucide-react'
import type { FrozenNarrativeChoice, Project, WorkspaceScope } from '../../lib/types'
import { useAvgGamePlayerStore } from '../../stores/avg-game-player'
import { preloadAvgReleaseMedia } from '../../lib/avg/media'
import { applyAvgCue } from '../../lib/avg/runtime'
import { currentPlayerReleases } from '../../lib/text-game/player-library'
import { useDomainT } from '../../i18n'
import { NARRATIVE_BEAT_KIND_LABEL_KEYS, projectCanonicalLabel } from '../../i18n/display-projection'
import { useDialog } from '../shared/Dialog'
import './player-roadshow.css'

interface Preferences { muted: boolean; reducedMotion: boolean; images: boolean; auto: boolean; fast: boolean; textSpeed: number; volume: number }
type PlayerPanel = 'history' | 'saves' | null
const DEFAULTS: Preferences = { muted: false, reducedMotion: false, images: true, auto: false, fast: false, textSpeed: 35, volume: .8 }
const CUE_PHASES = ['before', 'during', 'after']

function splitAttributedText(text: string): { speaker: string; text: string } | null {
  const match = text.match(/^【([^】]+)】\s*([\s\S]*)$/)
  return match ? { speaker: match[1].trim(), text: match[2].trimStart() } : null
}

export default function AvgGamePlayer(props: { project: Project; scope: WorkspaceScope; worldGroupId: number | null }) {
  const store = useAvgGamePlayerStore()
  const dialog = useDialog()
  const { t } = useDomainT('simulation')
  const [prefs, setPrefs] = useState<Preferences>(() => ({ ...DEFAULTS, reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches }))
  const [panel, setPanel] = useState<PlayerPanel>(null)
  const [uiHidden, setUiHidden] = useState(false)
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({})
  const [mediaFailures, setMediaFailures] = useState<Array<{ assetKey: string; reason: string }>>([])
  const [visibleCharacters, setVisibleCharacters] = useState(0)
  const [sceneTitleVisible, setSceneTitleVisible] = useState(false)
  const [notice, setNotice] = useState('')
  const [catalogReleaseId, setCatalogReleaseId] = useState<number | null>(null)

  useEffect(() => { setCatalogReleaseId(null); void store.load(props.scope, props.worldGroupId, true) }, [props.scope.projectId, props.scope.worldId, props.scope.workId, props.worldGroupId]) // eslint-disable-line react-hooks/exhaustive-deps
  const catalog = useMemo(() => currentPlayerReleases(store.releases), [store.releases])
  const catalogRelease = catalog.find(item => item.release.id === catalogReleaseId) ?? null
  const mediaCacheKey = `${store.selectedSessionId ?? 'title'}:${store.selectedManifest?.presentation.assets.map(asset => `${asset.assetKey}@${asset.version}:${asset.contentHash}`).join('|') ?? ''}`
  useEffect(() => {
    let cancelled = false
    if (!store.selectedManifest) { setMediaUrls({}); setMediaFailures([]); return }
    void preloadAvgReleaseMedia({ scope: props.scope, assets: store.selectedManifest.presentation.assets }).then(result => {
      if (!cancelled) {
        setMediaUrls(result.urls)
        setMediaFailures(result.failures)
        void store.recordMediaFailures(result.failures).catch(() => undefined)
      }
    })
    return () => { cancelled = true }
  }, [mediaCacheKey, props.scope.projectId, props.scope.worldId, props.scope.workId]) // eslint-disable-line react-hooks/exhaustive-deps

  const narrative = store.runtimeState.narrative
  const presentation = store.runtimeState.presentation
  const node = narrative?.nodes.find(item => item.key === narrative.currentNodeKey)
  const beats = useMemo(() => (narrative?.beats ?? []).filter(beat => beat.nodeKey === narrative?.currentNodeKey).sort((a, b) => a.order - b.order), [narrative])
  const reachedBeatKey = presentation?.currentNodeKey === narrative?.currentNodeKey ? presentation?.currentBeatKey : null
  const reachedIndex = reachedBeatKey ? beats.findIndex(beat => beat.beatKey === reachedBeatKey) : -1
  const currentBeat = beats[reachedIndex + 1] ?? null
  const choices = [...new Set(narrative?.visibleChoiceKeys ?? [])].map(key => narrative?.choices?.find(item => item.choiceKey === key)).filter((item): item is FrozenNarrativeChoice => !!item)
  const stage = presentation?.stage
  const visualStage = useMemo(() => {
    if (!stage || !presentation || !currentBeat) return stage
    return presentation.cues.filter(cue => cue.beatKey === currentBeat.beatKey)
      .sort((a, b) => CUE_PHASES.indexOf(a.phase) - CUE_PHASES.indexOf(b.phase) || a.order - b.order || a.cueKey.localeCompare(b.cueKey))
      .reduce((next, cue) => applyAvgCue(next, cue, presentation.assets, presentation.snapshots), stage)
  }, [stage, presentation, currentBeat])
  const currentCues = presentation?.cues.filter(cue => cue.beatKey === currentBeat?.beatKey) ?? []
  const cueDuration = Math.max(240, ...currentCues.map(cue => cue.durationMs))
  const attributedText = currentBeat ? splitAttributedText(currentBeat.text) : null
  const dialogueText = attributedText?.text ?? currentBeat?.text ?? ''
  const speakerLabel = currentBeat?.kind === 'dialogue'
    ? store.speakerNames[currentBeat.speakerKey ?? ''] ?? t('textGame.common.player.unknownSpeaker')
    : attributedText?.speaker ?? null
  const activeSpeakerKey = currentBeat?.kind === 'dialogue'
    ? currentBeat.speakerKey
    : attributedText ? Object.entries(store.speakerNames).find(([, name]) => name === attributedText.speaker)?.[0] ?? null : null
  const background = prefs.images && visualStage?.backgroundAssetKey ? visualStage.backgroundAssetKey : null
  const textComplete = !currentBeat || visibleCharacters >= dialogueText.length
  const visibleText = dialogueText.slice(0, visibleCharacters)
  const historyBeats = (narrative?.beats ?? []).filter(beat => presentation?.readBeatKeys.includes(beat.beatKey))
  const run = async (fn: () => Promise<unknown>) => { try { await fn() } catch { /* store exposes error */ } }

  useEffect(() => {
    if (!currentBeat) { setVisibleCharacters(0); return }
    if (prefs.reducedMotion) { setVisibleCharacters(dialogueText.length); return }
    setVisibleCharacters(0)
    const interval = window.setInterval(() => setVisibleCharacters(value => {
      if (value >= dialogueText.length) { window.clearInterval(interval); return value }
      return Math.min(dialogueText.length, value + 1)
    }), Math.max(12, Math.round(1000 / prefs.textSpeed)))
    return () => window.clearInterval(interval)
  }, [currentBeat, dialogueText, prefs.textSpeed, prefs.reducedMotion])

  useEffect(() => {
    if (!node?.key) return
    setSceneTitleVisible(true)
    const timer = window.setTimeout(() => setSceneTitleVisible(false), prefs.reducedMotion ? 900 : 1800)
    return () => window.clearTimeout(timer)
  }, [node?.key, prefs.reducedMotion])

  const advance = (force = false) => {
    if (!currentBeat || store.busy) return
    if (!force && !textComplete) { setVisibleCharacters(dialogueText.length); return }
    void run(() => store.reachBeat(currentBeat.beatKey))
  }
  useEffect(() => {
    if (!prefs.auto || !currentBeat || store.busy || !textComplete) return
    const timer = window.setTimeout(() => advance(true), 650)
    return () => window.clearTimeout(timer)
  }, [prefs.auto, currentBeat?.beatKey, store.busy, textComplete]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!prefs.fast || !currentBeat || store.busy) return
    if (!presentation?.readBeatKeys.includes(currentBeat.beatKey)) { setPrefs(value => ({ ...value, fast: false })); return }
    const timer = window.setTimeout(() => advance(true), 80)
    return () => window.clearTimeout(timer)
  }, [prefs.fast, currentBeat?.beatKey, presentation?.readBeatKeys, store.busy]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!store.selectedSessionId || store.busy || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === 'Escape') {
        if (panel) setPanel(null)
        else if (uiHidden) setUiHidden(false)
        return
      }
      if ((event.key === ' ' || event.key === 'Enter') && currentBeat && !panel) { event.preventDefault(); advance() }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [store.selectedSessionId, store.busy, currentBeat?.beatKey, textComplete, panel, uiHidden]) // eslint-disable-line react-hooks/exhaustive-deps

  const fullscreen = () => {
    if (document.fullscreenElement) { void document.exitFullscreen(); return }
    const target = document.querySelector('[data-testid="avg-player"]')
    if (target instanceof HTMLElement && target.requestFullscreen) void target.requestFullscreen()
  }
  const quickSave = async () => {
    try {
      // 检查点名是写入存档表的持久数据（canonical stored value），不随 UI locale 投影。
      await store.saveCheckpoint(`快速存档 · ${node?.title ?? ''}`)
      setNotice(t('textGame.avg.preferences.quickSavedNotice'))
      window.setTimeout(() => setNotice(''), 1500)
    } catch { /* store exposes error */ }
  }
  const leaveToTitle = () => {
    setPanel(null)
    setUiHidden(false)
    setPrefs(value => ({ ...value, auto: false, fast: false }))
    if (document.fullscreenElement) void document.exitFullscreen()
    void store.select(null)
  }

  if (!store.selectedSessionId) return <div className="avg-player avg-title-screen" data-testid="avg-player">
    <div className="avg-title-atmosphere" aria-hidden="true" />
    <main className="avg-title-content">
      <span className="avg-title-kicker">{t('textGame.avg.launcher.kicker')}</span>
      <h2>{catalogRelease ? t('textGame.avg.launcher.detailTitle') : t('textGame.avg.launcher.libraryTitle')}</h2>
      <p>{catalogRelease ? t('textGame.avg.launcher.detailIntro') : t('textGame.avg.launcher.libraryIntro')}</p>
      {store.error && <div role="alert" className="avg-alert">{store.error}</div>}
      {catalogRelease ? <section className="textgame-title-page avg-game-title-page" aria-label={t('textGame.avg.launcher.titlePageAria')}>
        <button type="button" className="textgame-catalog-back" onClick={() => setCatalogReleaseId(null)}><ArrowLeft />{t('textGame.common.catalog.backToAllGames')}</button>
        <div className="textgame-title-art" aria-hidden="true"><BookOpen /><span>VISUAL<br />NOVEL</span></div>
        <div className="textgame-title-copy">
          <small>{t('textGame.avg.launcher.tag')} · {t('textGame.common.catalog.playableVersion')}</small>
          <h3>{catalogRelease.manifest?.definition.title ?? catalogRelease.release.label}</h3>
          <p>{catalogRelease.manifest?.definition.description || t('textGame.avg.launcher.fallbackDescription')}</p>
          {catalogRelease.manifest && <div className="textgame-title-stats"><span>{t('textGame.avg.launcher.statsScenes', { count: catalogRelease.manifest.narrative.nodes.length })}</span><span>{t('textGame.avg.launcher.statsDialogueLines', { count: catalogRelease.manifest.narrative.beats.length })}</span><span>{t('textGame.avg.launcher.statsArtAssets', { count: catalogRelease.manifest.presentation.assets.length })}</span><span>{t('textGame.avg.launcher.statsStageCues', { count: catalogRelease.manifest.presentation.cues.length })}</span></div>}
          {catalogRelease.error ? <small>{catalogRelease.error}</small> : <div className="textgame-title-actions"><button type="button" className="textgame-start" disabled={!catalogRelease.manifest || store.busy} onClick={() => void run(() => store.start(catalogRelease.release.id!))}><Plus />{t('textGame.common.catalog.startNew')}</button>{store.sessions.find(session => session.gameReleaseId === catalogRelease.release.id) && <button type="button" onClick={() => void store.select(store.sessions.find(session => session.gameReleaseId === catalogRelease.release.id)!.id!)}><Save />{t('textGame.common.catalog.continueProgress')}</button>}</div>}
        </div>
      </section> : <>
        <div className="textgame-catalog-heading"><span>{t('textGame.common.catalog.allGames')}</span><small>{t('textGame.common.catalog.count', { count: catalog.length })}</small></div>
        <section className="textgame-catalog-list" aria-label={t('textGame.avg.launcher.catalogListAria')}>
          {catalog.map(item => <article key={item.release.id}><button type="button" aria-label={t('textGame.common.catalog.viewGameAria', { title: item.manifest?.definition.title ?? item.release.label })} onClick={() => setCatalogReleaseId(item.release.id!)}><span className="textgame-catalog-icon"><BookOpen /></span><span className="textgame-catalog-copy"><small>{t('textGame.avg.launcher.tag')}</small><strong>{item.manifest?.definition.title ?? item.release.label}</strong><p>{item.manifest?.definition.description || t('textGame.avg.launcher.fallbackDescription')}</p>{item.manifest && <i>{t('textGame.avg.launcher.catalogStatsLine', { scenes: item.manifest.narrative.nodes.length, dialogue: item.manifest.narrative.beats.length, art: item.manifest.presentation.assets.length, cues: item.manifest.presentation.cues.length })}</i>}</span><span className="textgame-catalog-open">{t('textGame.common.catalog.viewDetails')}<ChevronRight /></span></button></article>)}
          {!catalog.length && <div className="avg-title-empty"><BookOpen /><span>{t('textGame.avg.launcher.emptyCatalog')}</span></div>}
        </section>
        {store.sessions.length > 0 && <section className="avg-title-sessions" aria-label={t('textGame.avg.launcher.sessionsAria')}><h3>{t('textGame.avg.launcher.continueTitle')}</h3>{store.sessions.map(session => <button onClick={() => void store.select(session.id!)} key={session.id}><span>{session.title}</span><small>{t('textGame.avg.launcher.continueTimeline')}</small></button>)}</section>}
      </>}
    </main>
  </div>

  return <div className={`avg-player avg-playing ${prefs.reducedMotion ? 'avg-reduced-motion' : ''} ${uiHidden ? 'avg-ui-hidden' : ''}`} data-testid="avg-player">
    <section className="avg-main">
      <header className="avg-toolbar">
        <div className="avg-game-title"><small>VISUAL NOVEL</small><strong>{store.selectedManifest?.definition.title ?? t('textGame.avg.launcher.playerTitleFallback')}</strong></div>
        <nav aria-label={t('textGame.avg.preferences.controlsAria')}>
          <button className="avg-exit-game" title={t('textGame.common.player.exitGame')} aria-label={t('textGame.common.player.exitGame')} onClick={leaveToTitle}><ArrowLeft /><span>{t('textGame.common.player.exitGame')}</span></button>
          <button title={t('textGame.avg.preferences.historyTitle')} aria-label={t('textGame.avg.preferences.historyTitle')} onClick={() => setPanel(panel === 'history' ? null : 'history')}><History /><span>{t('textGame.avg.preferences.historyTitle')}</span></button>
          <button title={t('textGame.avg.preferences.savesTitle')} aria-label={t('textGame.avg.preferences.savesTitle')} onClick={() => setPanel(panel === 'saves' ? null : 'saves')}><Save /><span>{t('textGame.avg.preferences.savesTitle')}</span></button>
          <button title={t('textGame.avg.preferences.quickSaveTitle')} aria-label={t('textGame.avg.preferences.quickSaveTitle')} disabled={store.busy} onClick={() => void quickSave()}><Save /><span>{t('textGame.avg.preferences.quickSaveTitle')}</span></button>
          <button title={t('textGame.avg.preferences.autoPlayTitle')} aria-label={t('textGame.avg.preferences.autoPlayTitle')} aria-pressed={prefs.auto} onClick={() => setPrefs(value => ({ ...value, auto: !value.auto, fast: false }))}><Play /><span>{t('textGame.avg.preferences.autoPlayLabel')}</span></button>
          <button title={t('textGame.avg.preferences.fastForwardTitle')} aria-label={t('textGame.avg.preferences.fastForwardTitle')} aria-pressed={prefs.fast} disabled={!currentBeat || !presentation?.readBeatKeys.includes(currentBeat.beatKey)} onClick={() => setPrefs(value => ({ ...value, fast: !value.fast, auto: false }))}><FastForward /><span>{t('textGame.avg.preferences.fastForwardLabel')}</span></button>
          <button title={t('textGame.avg.preferences.fullscreenTitle')} aria-label={t('textGame.avg.preferences.fullscreenTitle')} onClick={fullscreen}><Maximize2 /><span>{t('textGame.avg.preferences.fullscreenTitle')}</span></button>
          <details className="avg-settings">
            <summary aria-label={t('textGame.avg.preferences.settingsTitle')} title={t('textGame.avg.preferences.settingsTitle')}><Settings2 /><span>{t('textGame.avg.preferences.settingsTitle')}</span></summary>
            <div>
              <button onClick={() => setPrefs(value => ({ ...value, images: !value.images }))}>{prefs.images ? <Eye /> : <EyeOff />}{t('textGame.avg.preferences.toggleImages')}</button>
              <button onClick={() => setPrefs(value => ({ ...value, muted: !value.muted }))}>{prefs.muted ? <VolumeX /> : <Volume2 />}{t('textGame.avg.preferences.toggleSound')}</button>
              <label className="avg-volume">{t('textGame.avg.preferences.volumeLabel')}<input aria-label={t('textGame.avg.preferences.volumeLabel')} type="range" min="0" max="1" step="0.05" value={prefs.volume} onChange={event => setPrefs(value => ({ ...value, volume: Number(event.target.value) }))} /></label>
              <button onClick={() => setPrefs(value => ({ ...value, reducedMotion: !value.reducedMotion }))}><Gauge />{t('textGame.avg.preferences.reduceMotion')}</button>
              <button onClick={() => setPrefs(value => ({ ...value, textSpeed: value.textSpeed === 35 ? 80 : 35 }))}>{t('textGame.avg.preferences.textSpeedToggle', { mode: prefs.textSpeed === 35 ? t('textGame.avg.preferences.textSpeedStandard') : t('textGame.avg.preferences.textSpeedFast') })}</button>
              <button onClick={() => setUiHidden(true)}><EyeOff />{t('textGame.avg.preferences.hideUi')}</button>
              <button onClick={leaveToTitle}><RotateCcw />{t('textGame.avg.preferences.backToTitle')}</button>
            </div>
          </details>
        </nav>
      </header>
      {store.error && <div role="alert" className="avg-alert">{store.error}</div>}
      <div className="avg-stage" data-tone={visualStage?.tone ?? 'normal'} data-transition={visualStage?.lastTransition ?? 'none'} onClick={event => {
        if (event.target instanceof HTMLElement && event.target.closest('button, input, summary, details')) return
        if (currentBeat && !panel) advance()
      }} aria-label={background ? t('textGame.avg.stage.backgroundAria', { asset: background }) : t('textGame.avg.stage.textOnlyStageAria')}>
        <div className={`avg-stage-scene avg-effect-${visualStage?.lastTransition ?? 'none'}`} style={{ transform: `translate(${(visualStage?.camera.x ?? 0) * -2}%, ${(visualStage?.camera.y ?? 0) * -2}%) scale(${visualStage?.camera.scale ?? 1})`, transitionDuration: `${cueDuration}ms` }}>
          {background && <div key={background} className="avg-background" data-asset-key={background}>{mediaUrls[background] ? <img src={mediaUrls[background]} alt={presentation?.assets.find(asset => asset.assetKey === background)?.altText || background} /> : <span>{background}</span>}</div>}
          {prefs.images && visualStage?.cgAssetKey && <div key={visualStage.cgAssetKey} className="avg-cg" data-asset-key={visualStage.cgAssetKey}>{mediaUrls[visualStage.cgAssetKey] ? <img src={mediaUrls[visualStage.cgAssetKey]} alt={presentation?.assets.find(asset => asset.assetKey === visualStage.cgAssetKey)?.altText || visualStage.cgAssetKey} /> : visualStage.cgAssetKey}</div>}
          {prefs.images && visualStage?.actors.map((actor, index) => {
            const speaking = !!activeSpeakerKey && actor.actorKey === activeSpeakerKey
            const displaySlot = visualStage.actors.length === 2 ? index === 0 ? 'left' : 'right' : actor.slot
            return <div key={`${actor.actorKey}:${actor.assetKey}`} className={`avg-actor avg-slot-${displaySlot} ${activeSpeakerKey ? speaking ? 'is-speaking' : 'is-listening' : ''}`} style={{ opacity: actor.opacity, transform: `translate(calc(-50% + ${actor.x * 20}px),${actor.y * 20}px) scale(${actor.scale})`, transitionDuration: `${cueDuration}ms` }} aria-label={t('textGame.avg.stage.actorAria', { actor: actor.actorKey })}>{mediaUrls[actor.assetKey] ? <img src={mediaUrls[actor.assetKey]} alt={presentation?.assets.find(asset => asset.assetKey === actor.assetKey)?.altText || actor.actorKey} /> : actor.assetKey}</div>
          })}
          {prefs.images && visualStage?.overlayAssetKey && <div className="avg-overlay" data-asset-key={visualStage.overlayAssetKey}>{mediaUrls[visualStage.overlayAssetKey] ? <img src={mediaUrls[visualStage.overlayAssetKey]} alt={presentation?.assets.find(asset => asset.assetKey === visualStage.overlayAssetKey)?.altText || visualStage.overlayAssetKey} /> : visualStage.overlayAssetKey}</div>}
        </div>
        {visualStage?.mask && <div className="avg-mask" data-mask={visualStage.mask} />}
        {visualStage?.lastTransition === 'flash' && <div key={`flash:${currentBeat?.beatKey}`} className="avg-flash" />}
        {sceneTitleVisible && node?.title && <div key={`scene:${node.key}`} className="avg-scene-title" aria-label={t('textGame.avg.stage.sceneAria', { title: node.title })}><span>SCENE</span><strong>{node.title}</strong></div>}
        {!prefs.muted && visualStage?.activeAudio.map(audio => mediaUrls[audio.assetKey] ? <audio key={`${audio.channel}:${audio.assetKey}`} src={mediaUrls[audio.assetKey]} autoPlay loop={audio.loop} data-channel={audio.channel} onLoadedMetadata={event => { event.currentTarget.volume = Math.min(1, audio.volume * prefs.volume) }} /> : null)}
        {(prefs.muted || prefs.reducedMotion) && <div className="avg-stage-status"><span>{prefs.muted ? t('textGame.avg.preferences.mutedStatus') : ''}</span><span>{prefs.reducedMotion ? t('textGame.avg.preferences.reduceMotion') : ''}</span></div>}
        <section key={`dialogue:${currentBeat?.beatKey ?? narrative?.currentNodeKey}`} className={`avg-dialogue ${speakerLabel ? 'is-dialogue' : 'is-narration'} ${!currentBeat ? 'is-choice' : ''}`} aria-live="polite">
          {currentBeat ? <>
            {speakerLabel && <strong className="avg-speaker">{speakerLabel}</strong>}
            <p>{visibleText}<span className={`avg-text-cursor ${textComplete ? 'is-complete' : ''}`} aria-hidden="true" /></p>
            <button className="avg-continue" aria-label={t('textGame.avg.dialogue.continueLabel')} disabled={store.busy} onClick={() => advance(true)}><SkipForward /><span className="avg-visually-hidden">{t('textGame.avg.dialogue.continueLabel')}</span></button>
          </> : narrative?.completed ? <div className="avg-ending"><small>ENDING</small><h2>{node?.title}</h2><p>{t('textGame.avg.ending.completedLine')}</p></div> : <div className="avg-choices"><small>{t('textGame.avg.choices.heading')}</small>{choices.map(choice => <button key={choice.choiceKey} disabled={store.busy || !narrative?.availableChoiceKeys?.includes(choice.choiceKey)} onClick={() => void run(() => store.choose(choice.choiceKey))}>{choice.text}</button>)}</div>}
        </section>
        {notice && <div className="avg-notice" role="status">{notice}</div>}
      </div>

      {panel && <div className="avg-panel-backdrop" onMouseDown={() => setPanel(null)}>
        <section className="avg-panel" role="dialog" aria-modal="true" aria-label={panel === 'history' ? t('textGame.avg.preferences.historyTitle') : t('textGame.avg.preferences.savesTitle')} onMouseDown={event => event.stopPropagation()}>
          <header><div><small>{panel === 'history' ? 'DIALOGUE LOG' : 'SAVE & LOAD'}</small><h2>{panel === 'history' ? t('textGame.avg.preferences.historyTitle') : t('textGame.avg.preferences.savesTitle')}</h2></div><button aria-label={t('textGame.avg.preferences.closePanel')} onClick={() => setPanel(null)}><X /></button></header>
          {panel === 'history' ? <div className="avg-history">{historyBeats.map(beat => { const attributed = splitAttributedText(beat.text); return <article key={beat.beatKey}><strong>{beat.kind === 'dialogue' ? store.speakerNames[beat.speakerKey ?? ''] ?? t('textGame.common.player.unknownSpeaker') : attributed?.speaker ?? projectCanonicalLabel(t, NARRATIVE_BEAT_KIND_LABEL_KEYS, 'narration')}</strong><p>{attributed?.text ?? beat.text}</p></article> })}{historyBeats.length === 0 && <p>{t('textGame.avg.history.empty')}</p>}</div> : <div className="avg-saves">
            <div className="avg-save-actions"><button disabled={store.busy} onClick={() => void quickSave()}><Save />{t('textGame.avg.saves.saveCurrentProgress')}</button></div>
            <h3>{t('textGame.avg.saves.checkpointsHeading')}</h3>
            {store.checkpoints.map(checkpoint => <article key={checkpoint.id}><div><strong>{checkpoint.name}</strong><small>{t('textGame.avg.saves.checkpointEventLine', { sequence: checkpoint.throughSequence })}</small></div><button disabled={store.busy} onClick={() => void run(async () => { await store.forkCheckpoint(checkpoint.id!); setPanel(null) })}><GitBranch />{t('textGame.avg.saves.forkFromHere')}</button></article>)}
            {store.checkpoints.length === 0 && <p>{t('textGame.avg.saves.checkpointsEmpty')}</p>}
            <h3>{t('textGame.avg.saves.otherSessionsHeading')}</h3>
            {store.sessions.filter(session => session.id !== store.selectedSessionId).map(session => <article key={session.id}><div><strong>{session.title}</strong><small>{t('textGame.avg.saves.independentTimeline')}</small></div><button onClick={() => { void store.select(session.id!); setPanel(null) }}>{t('textGame.avg.saves.loadSession')}</button></article>)}
            {store.sessions.filter(session => session.id !== store.selectedSessionId).length === 0 && <p>{t('textGame.avg.saves.otherSessionsEmpty')}</p>}
            <button className="danger" onClick={() => void run(async () => { const confirmed = await dialog.confirm({ title: t('textGame.avg.saves.deleteConfirmTitle'), message: t('textGame.avg.saves.deleteConfirmMessage'), confirmText: t('textGame.avg.saves.deleteConfirmAction'), tone: 'danger' }); if (confirmed) { await store.remove(store.selectedSessionId!); setPanel(null) } })}><Trash2 />{t('textGame.avg.saves.deleteCurrentSession')}</button>
          </div>}
        </section>
      </div>}
      {!prefs.images && <div className="avg-degraded"><ImageOff />{t('textGame.avg.preferences.imagesOffNotice')}</div>}
      {mediaFailures.length > 0 && <div className="avg-degraded" role="status"><ImageOff />{t('textGame.avg.preferences.mediaMissingNotice', { count: mediaFailures.length })}</div>}
      {uiHidden && <button className="avg-ui-restore" onClick={() => setUiHidden(false)} aria-label={t('textGame.avg.preferences.showUi')}><Eye />{t('textGame.avg.preferences.showUi')}</button>}
    </section>
  </div>
}
