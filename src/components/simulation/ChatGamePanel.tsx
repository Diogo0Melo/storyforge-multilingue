import { useEffect, useMemo, useState } from 'react'
import {
  Bot,
  Check,
  GitBranch,
  Loader2,
  MapPin,
  MessageCircle,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Snowflake,
  Square,
  UserRound,
} from 'lucide-react'
import type { Project, SimulationCanonCandidate, SimulationChatState } from '../../lib/types'
import { assembleContext } from '../../lib/registry/assemble-context'
import { buildChatGamePrompt, parseChatReply } from '../../lib/simulation/chatgame'
import { loadSimulationCanonCandidates, repairCanonSourceName } from '../../lib/simulation/canon-snapshot'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { useAIConfigStore } from '../../stores/ai-config'
import { useAIStream } from '../../hooks/useAIStream'
import { isAIConfigReady } from '../../lib/ai/config-readiness'
import { resolveRequestConfig } from '../../lib/ai/client'
import { useSimulationRuntimeStore } from '../../stores/simulation-runtime'
import { getT, useDomainT } from '../../i18n'

export default function ChatGamePanel({ project, worldGroupId }: { project: Project; worldGroupId: number | null }) {
  const store = useSimulationRuntimeStore()
  const { config } = useAIConfigStore()
  const { t } = useDomainT('simulation')
  const [candidates, setCandidates] = useState<SimulationCanonCandidate[]>([])
  const [canonWorldLabel, setCanonWorldLabel] = useState('')
  const [canonLoading, setCanonLoading] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [characterKey, setCharacterKey] = useState('')
  const [identityName, setIdentityName] = useState(() => getT()('common:defaults.chatIdentityName'))
  const [identityDescription, setIdentityDescription] = useState('')
  const [sceneTitle, setSceneTitle] = useState(() => getT()('common:defaults.chatSceneTitle'))
  const [sceneDescription, setSceneDescription] = useState('')
  const [selectedSourceKeys, setSelectedSourceKeys] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [checkpointName, setCheckpointName] = useState('')
  const [branchTitle, setBranchTitle] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    void store.load(project.id!, worldGroupId)
  // Zustand action identity is stable; project/world is the reload boundary.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, worldGroupId])

  useEffect(() => {
    let cancelled = false
    setCanonLoading(true)
    void loadSimulationCanonCandidates({ projectId: project.id!, worldGroupId })
      .then(result => { if (!cancelled) { setCandidates(result.candidates); setCanonWorldLabel(result.worldLabel) } })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (!cancelled) setCanonLoading(false) })
    return () => { cancelled = true }
  }, [project.id, worldGroupId])

  const sessions = useMemo(
    () => store.sessions.filter(session => session.kind === 'chatgame' && session.projectId === project.id && (session.worldGroupId ?? null) === worldGroupId),
    [project.id, store.sessions, worldGroupId],
  )
  const selected = sessions.find(session => session.id === store.selectedSessionId) ?? null
  const chat = (selected?.kind === 'chatgame' ? store.runtimeState.chat : null) ?? null
  const characterCandidates = useMemo(() => candidates.filter(candidate => candidate.kind === 'character'), [candidates])
  const selectedCharacter = characterCandidates.find(candidate => candidate.sourceKey === characterKey) ?? characterCandidates[0]
  const visibleMessages = useMemo(
    () => chat?.messages.filter(item => item.supersededBySequence == null) ?? [],
    [chat],
  )
  const ai = useAIStream(createAISessionKey(project.id!, 'simulation.chatgame', selected?.id ?? 'none'))
  const {
    loading: sessionsLoading,
    projectId: loadedProjectId,
    worldGroupId: loadedWorldGroupId,
    selectedSessionId,
    select: selectSession,
  } = store

  useEffect(() => {
    if (sessionsLoading || loadedProjectId !== project.id || loadedWorldGroupId !== worldGroupId) return
    if (selectedSessionId == null && sessions.length === 0) return
    if (selectedSessionId != null && sessions.some(session => session.id === selectedSessionId)) return
    void selectSession(sessions[0]?.id ?? null)
  }, [loadedProjectId, loadedWorldGroupId, project.id, selectSession, selectedSessionId, sessions, sessionsLoading, worldGroupId])

  useEffect(() => {
    if (!characterKey && characterCandidates[0]) setCharacterKey(characterCandidates[0].sourceKey)
  }, [characterCandidates, characterKey])

  useEffect(() => {
    const current = store.runtimeState.chat
    if (!current) {
      setEditing(true)
      return
    }
    setCharacterKey(current.characterKey)
    setIdentityName(current.identity.name)
    setIdentityDescription(current.identity.description)
    setSceneTitle(current.scene.title)
    setSceneDescription(current.scene.description)
    setEditing(!current)
  }, [selected?.id, store.runtimeState.chat])

  useEffect(() => {
    if (!selectedSourceKeys.size && candidates.length) {
      const world = candidates.find(candidate => candidate.kind === 'world')
      const character = candidates.find(candidate => candidate.kind === 'character')
      setSelectedSourceKeys(new Set([world?.sourceKey, character?.sourceKey].filter(Boolean) as string[]))
    }
  }, [candidates, selectedSourceKeys.size])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try { await action() } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } finally { setBusy(false) }
  }

  const toggleSource = (key: string) => {
    setSelectedSourceKeys(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const create = async () => {
    if (!newTitle.trim() || !selectedCharacter || !identityName.trim() || !sceneTitle.trim()) return
    if (!selectedSourceKeys.has(selectedCharacter.sourceKey)) {
      throw new Error(t('chatGame.freezeCharacterRequiredError'))
    }
    await store.createSession({
      projectId: project.id!,
      worldGroupId,
      kind: 'chatgame',
      title: newTitle.trim(),
      sourceKeys: [...selectedSourceKeys],
      chatConfig: {
        characterKey: selectedCharacter.sourceKey,
        identity: { name: identityName.trim(), description: identityDescription.trim() },
        scene: { title: sceneTitle.trim(), description: sceneDescription.trim() },
      },
    })
    setNewTitle('')
  }

  const saveConfig = async () => {
    if (!selected || !selectedCharacter) return
    await store.configureChat({
      characterKey: selectedCharacter.sourceKey,
      identity: { name: identityName.trim(), description: identityDescription.trim() },
      scene: { title: sceneTitle.trim(), description: sceneDescription.trim() },
    })
    setEditing(false)
  }

  const send = async () => {
    if (!selected || !chat || !message.trim() || ai.isStreaming || !isAIConfigReady(resolveRequestConfig(config, { category: 'simulation.chatgame' }).config)) return
    const text = message.trim()
    const character = store.runtimeState.entities[chat.characterKey]
    if (!character) throw new Error(t('chatGame.characterMissingError'))
    const userSequence = await store.recordChatMessage(text)
    setMessage('')
    const runtimeContext = await assembleContext({
      projectId: project.id!,
      worldGroupId,
      simulationSessionId: selected.id,
      sourceKeys: ['simulationRuntime'],
      provider: config.provider,
      model: config.model,
    })
    const draft = await ai.start(buildChatGamePrompt({
      runtimeContext: runtimeContext.text,
      characterName: character.name,
      userMessage: text,
    }), undefined, { category: 'simulation.chatgame', outputKind: 'creative', projectId: project.id!, contextOverflowPolicy: 'reject' })
    if (!draft.trim()) return
    await store.recordChatReply({ replyToSequence: userSequence, text: parseChatReply(draft), baseSequence: userSequence })
  }

  const regenerate = async (reply: SimulationChatState['messages'][number]) => {
    if (!selected || !chat || reply.role !== 'character' || reply.replyToSequence == null || ai.isStreaming) return
    const target = chat.messages.find(item => item.eventSequence === reply.replyToSequence)
    const character = store.runtimeState.entities[chat.characterKey]
    if (!target || target.role !== 'user' || !character) throw new Error(t('chatGame.originalMessageMissingError'))
    const baseSequence = store.runtimeState.lastSequence
    const runtimeContext = await assembleContext({ projectId: project.id!, worldGroupId, simulationSessionId: selected.id, sourceKeys: ['simulationRuntime'], provider: config.provider, model: config.model })
    const draft = await ai.start(buildChatGamePrompt({ runtimeContext: runtimeContext.text, characterName: character.name, userMessage: target.text }), undefined, { category: 'simulation.chatgame', outputKind: 'creative', projectId: project.id!, contextOverflowPolicy: 'reject' })
    if (!draft.trim()) return
    await store.recordChatReply({ replyToSequence: target.eventSequence, text: parseChatReply(draft), baseSequence, supersedesSequence: reply.eventSequence })
  }

  if (!selected) {
    return <div className="flex min-h-[38rem] flex-col gap-5 bg-bg-base p-5 lg:flex-row">
      <aside className="w-full shrink-0 rounded-lg border border-border bg-bg-surface p-4 lg:w-80">
        <div className="mb-4 flex items-center gap-2"><MessageCircle className="h-4 w-4 text-accent" /><h2 className="font-semibold text-text-primary">{t('chatGame.createHeading')}</h2></div>
        <p className="mb-4 text-xs leading-relaxed text-text-muted">{t('chatGame.createDescription')}</p>
        <div className="space-y-3">
          <input value={newTitle} onChange={event => setNewTitle(event.target.value)} placeholder={t('chatGame.sessionNamePlaceholder')} className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-sm" />
          <label className="block text-xs text-text-muted">{t('chatGame.characterLabel')}<select value={selectedCharacter?.sourceKey ?? ''} onChange={event => { setCharacterKey(event.target.value); setSelectedSourceKeys(current => new Set(current).add(event.target.value)) }} className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary"><option value="">{t('chatGame.noCharacterOption')}</option>{characterCandidates.map(candidate => <option key={candidate.sourceKey} value={candidate.sourceKey}>{candidate.name}</option>)}</select></label>
          <label className="block text-xs text-text-muted">{t('chatGame.identityLabel')}<input value={identityName} onChange={event => setIdentityName(event.target.value)} className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary" /></label>
          <textarea value={identityDescription} onChange={event => setIdentityDescription(event.target.value)} placeholder={t('chatGame.identityDescriptionPlaceholder')} rows={2} className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary" />
          <label className="block text-xs text-text-muted">{t('chatGame.initialSceneLabel')}<input value={sceneTitle} onChange={event => setSceneTitle(event.target.value)} className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary" /></label>
          <textarea value={sceneDescription} onChange={event => setSceneDescription(event.target.value)} placeholder={t('chatGame.sceneDescriptionPlaceholderOptional')} rows={3} className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary" />
          <fieldset className="space-y-1 border-t border-border pt-3"><legend className="flex items-center gap-1 text-xs text-text-muted"><Snowflake className="h-3.5 w-3.5" />{t('chatGame.freezeSourcesLegend')}</legend>{candidates.slice(0, 24).map(candidate => <label key={candidate.sourceKey} className="flex items-start gap-2 rounded px-1 py-1 text-xs hover:bg-bg-hover"><input type="checkbox" checked={selectedSourceKeys.has(candidate.sourceKey)} onChange={() => toggleSource(candidate.sourceKey)} className="mt-0.5" /><span className="min-w-0 flex-1 truncate text-text-secondary">{repairCanonSourceName(candidate.name, canonWorldLabel)}</span></label>)}{canonLoading && <span className="text-[11px] text-text-muted">{t('sidebar.loading')}</span>}</fieldset>
          <button disabled={busy || canonLoading || !newTitle.trim() || !selectedCharacter || !selectedSourceKeys.has(selectedCharacter.sourceKey)} onClick={() => void run(create)} className="flex w-full items-center justify-center gap-1.5 rounded bg-accent px-3 py-2 text-sm text-white disabled:opacity-40"><Plus className="h-4 w-4" />{t('chatGame.createChatArchive')}</button>
        </div>
      </aside>
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-muted">{t('chatGame.workspacePlaceholder')}</div>
    </div>
  }

  return <div className="flex min-h-[38rem] flex-col bg-bg-base lg:flex-row">
    <aside className="max-h-[26rem] w-full shrink-0 overflow-y-auto border-b border-border bg-bg-surface p-4 lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r">
      <div className="mb-4 flex items-center gap-2"><MessageCircle className="h-4 w-4 text-accent" /><h2 className="font-semibold text-text-primary">{t('chatGame.sidebarHeading')}</h2></div>
      <p className="mb-4 text-xs leading-relaxed text-text-muted">{t('chatGame.sidebarDescription')}</p>
      <button onClick={() => store.select(null)} className="mb-3 flex w-full items-center justify-center gap-1.5 rounded border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-hover"><Plus className="h-3.5 w-3.5" />{t('chatGame.newSession')}</button>
      <div className="space-y-1">{sessions.map(session => <button key={session.id} onClick={() => void store.select(session.id!)} className={`w-full rounded px-3 py-2 text-left ${session.id === selected.id ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-hover'}`}><div className="truncate text-sm font-medium">{session.title}</div><div className="mt-0.5 text-[11px] text-text-muted">{t('chatGame.eventsLabel')} {session.id === selected.id ? store.runtimeState.lastSequence : '—'}</div></button>)}</div>
    </aside>
    <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-4xl space-y-4">
      {error && <div className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      <header className="flex flex-wrap items-start justify-between gap-3"><div><div className="mb-1 text-xs text-text-muted">{t('chatGame.experienceCenterChat')}</div><h1 className="text-xl font-semibold text-text-primary">{selected.title}</h1><p className="mt-1 text-xs text-text-muted">{chat ? `${chat.identity.name} ${t('chatGame.identityCharacterConnector')} ${store.runtimeState.entities[chat.characterKey]?.name ?? chat.characterKey} · ${t('chatGame.eventsLabel')} ${store.runtimeState.lastSequence}` : t('chatGame.unconfiguredScene')}</p></div><button onClick={() => setEditing(value => !value)} className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-hover"><Settings2 className="h-3.5 w-3.5" />{t('chatGame.sceneSettings')}</button></header>
      {(editing || !chat) && <section className="rounded-lg border border-border bg-bg-surface p-4"><div className="grid gap-3 md:grid-cols-2"><label className="text-xs text-text-muted">{t('chatGame.characterLabel')}<select value={characterKey} onChange={event => setCharacterKey(event.target.value)} disabled={!!chat?.messages.length} className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary">{characterCandidates.map(candidate => <option key={candidate.sourceKey} value={candidate.sourceKey}>{candidate.name}</option>)}</select></label><label className="text-xs text-text-muted">{t('chatGame.identityLabel')}<input value={identityName} onChange={event => setIdentityName(event.target.value)} className="mt-1 w-full rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary" /></label><textarea value={identityDescription} onChange={event => setIdentityDescription(event.target.value)} placeholder={t('chatGame.identityDescriptionPlaceholderShort')} rows={2} className="rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary" /><div className="space-y-2"><input value={sceneTitle} onChange={event => setSceneTitle(event.target.value)} placeholder={t('chatGame.sceneTitlePlaceholder')} className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary" /><textarea value={sceneDescription} onChange={event => setSceneDescription(event.target.value)} placeholder={t('chatGame.sceneDescriptionPlaceholder')} rows={2} className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-sm text-text-primary" /></div></div><button disabled={busy || !characterKey || !identityName.trim() || !sceneTitle.trim()} onClick={() => void run(saveConfig)} className="mt-3 flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-40"><Check className="h-3.5 w-3.5" />{t('chatGame.saveSettings')}</button></section>}
      {chat && <section className="rounded-lg border border-border bg-bg-surface"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3"><div className="flex items-center gap-2 text-sm font-semibold text-text-primary"><MapPin className="h-4 w-4 text-accent" />{chat.scene.title}<span className="text-xs font-normal text-text-muted">· {store.runtimeState.entities[chat.characterKey]?.name ?? chat.characterKey}</span></div><span className="flex items-center gap-1 text-[10px] text-text-muted"><Snowflake className="h-3 w-3" />{t('chatGame.freezeSourcesLegend')} · {selected.canonSnapshotJson ? t('chatGame.snapshotSaved') : t('chatGame.snapshotLegacy')}</span></div><div className="max-h-[32rem] space-y-3 overflow-y-auto p-4">{visibleMessages.map(item => <div key={item.messageId} className={`flex gap-2 ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${item.role === 'user' ? 'bg-accent/15 text-text-primary' : 'bg-bg-base text-text-secondary'}`}><div className="mb-1 flex items-center gap-1 text-[10px] text-text-muted">{item.role === 'user' ? <UserRound className="h-3 w-3" /> : <Bot className="h-3 w-3" />}{item.role === 'user' ? chat.identity.name : (store.runtimeState.entities[item.speakerKey ?? '']?.name ?? t('chatGame.speakerFallback'))}<span className="font-mono">#{item.eventSequence}</span></div><p className="whitespace-pre-wrap break-words">{item.text}</p>{item.role === 'character' && <button disabled={busy || ai.isStreaming} onClick={() => void run(() => regenerate(item))} className="mt-2 flex items-center gap-1 text-[11px] text-text-muted hover:text-accent disabled:opacity-40"><RefreshCw className="h-3 w-3" />{t('chatGame.regenerate')}</button>}</div></div>)}{ai.isStreaming && <div className="flex items-center gap-2 text-xs text-text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('chatGame.streamingIndicator')}</div>}{!visibleMessages.length && <p className="py-10 text-center text-sm text-text-muted">{t('chatGame.emptyMessages')}</p>}</div><div className="border-t border-border p-3"><textarea value={message} onChange={event => setMessage(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void run(send) } }} placeholder={t('chatGame.messagePlaceholder', { character: store.runtimeState.entities[chat.characterKey]?.name ?? t('chatGame.speakerFallback') })} rows={3} disabled={ai.isStreaming} className="w-full resize-y rounded border border-border bg-bg-base px-3 py-2 text-sm text-text-primary disabled:opacity-60" /><div className="mt-2 flex items-center justify-between gap-2"><span className="text-[10px] text-text-muted">{t('chatGame.inputHint')}{ai.tokenUsage ? ` · ${ai.tokenUsage.inputTokens + ai.tokenUsage.outputTokens} tokens` : ''}</span><div className="flex gap-2">{ai.isStreaming && <button onClick={ai.stop} className="flex items-center gap-1 rounded border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-hover"><Square className="h-3 w-3" />{t('chatGame.stopStreaming')}</button>}<button disabled={busy || ai.isStreaming || !message.trim() || !isAIConfigReady(resolveRequestConfig(config, { category: 'simulation.chatgame' }).config)} onClick={() => void run(send)} className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-40"><Send className="h-3.5 w-3.5" />{t('chatGame.send')}</button></div></div>{ai.error && <p className="mt-2 text-xs text-danger">{ai.error}</p>}</div></section>}
      <section className="grid gap-3 md:grid-cols-2"><div className="rounded-lg border border-border bg-bg-surface p-4"><div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary"><Save className="h-4 w-4 text-accent" />{t('chatGame.checkpointHeading')}</div><div className="flex gap-2"><input value={checkpointName} onChange={event => setCheckpointName(event.target.value)} placeholder={t('chatGame.checkpointPlaceholder')} className="min-w-0 flex-1 rounded border border-border bg-bg-base px-2 py-1.5 text-sm" /><button disabled={busy || !checkpointName.trim()} onClick={() => void run(async () => { await store.checkpoint(checkpointName.trim()); setCheckpointName('') })} className="rounded border border-border px-3 py-1.5 text-sm hover:bg-bg-hover disabled:opacity-40">{t('chatGame.saveCheckpoint')}</button></div></div><div className="rounded-lg border border-border bg-bg-surface p-4"><div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary"><GitBranch className="h-4 w-4 text-accent" />{t('chatGame.branchHeading')}</div><div className="flex gap-2"><input value={branchTitle} onChange={event => setBranchTitle(event.target.value)} placeholder={t('chatGame.branchPlaceholder')} className="min-w-0 flex-1 rounded border border-border bg-bg-base px-2 py-1.5 text-sm" /><button disabled={busy || !branchTitle.trim()} onClick={() => void run(async () => { await store.branch(branchTitle.trim()); setBranchTitle('') })} className="rounded border border-border px-3 py-1.5 text-sm hover:bg-bg-hover disabled:opacity-40">{t('chatGame.branchAction')}</button></div></div></section>
      <section className="rounded-lg border border-border bg-bg-surface"><div className="border-b border-border px-4 py-3 text-sm font-semibold text-text-primary">{t('chatGame.protectionHeading')}</div><div className="grid gap-2 p-4 text-xs text-text-muted sm:grid-cols-3"><span>{t('chatGame.freezeSourcesLegend')} {selected.canonSnapshotJson ? t('chatGame.protectionVerified') : t('chatGame.protectionLegacy')}</span><span>{t('chatGame.protectionCharacterSafe')}</span><span>{t('chatGame.protectionReplyScope')}</span></div></section>
    </div></main>
  </div>
}
