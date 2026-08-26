import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FilePlus2,
  Loader2,
  Rocket,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react'
import type {
  InteractionCharacterProfile,
  InteractionSceneTemplate,
  WorkspaceScope,
} from '../../lib/types'
import {
  createInteractionAcceptanceSample,
  createStarterInteractionGame,
  deleteInteractionCharacterProfile,
  deleteInteractionGameDraft,
  deleteInteractionSceneTemplate,
  inspectInteractionContext,
  loadInteractionAuthoringSnapshot,
  publishInteractionGameDraft,
  saveInteractionCharacterProfile,
  saveInteractionSceneTemplate,
  validateInteractionGameDraft,
  type InteractionAuthoringSnapshot,
  type InteractionContextInspection,
  type InteractionDraftDiagnostic,
  type InteractionDraftReport,
} from '../../lib/character-interaction/authoring'
import { useDomainT, type DomainTFunction } from '../../i18n'
import { useDialog } from '../shared/Dialog'

const EMPTY: InteractionAuthoringSnapshot = {
  definitions: [], modules: [], nodes: [], profiles: [], scenes: [], releases: [], characters: [],
}

/**
 * 校验诊断只渲染稳定结构化字段：code → locale 键在渲染时解析，recordKey 存在时
 * 作为 {{key}} 插值；原始 message（可能携带引擎语言文本）永不进入 UI，仅在
 * 出现未登记 code 时输出到开发者控制台一次。
 */
const INTERACTION_DIAGNOSTIC_KEYS: Record<string, string> = {
  'profiles.empty': 'interactionAuthor.diagProfilesEmpty',
  'scenes.empty': 'interactionAuthor.diagScenesEmpty',
  'profile.duplicate-key': 'interactionAuthor.diagProfileDuplicateKey',
  'profile.incomplete': 'interactionAuthor.diagProfileIncomplete',
  'knowledge.conflicting-content': 'interactionAuthor.diagKnowledgeConflict',
  'profile.invalid': 'interactionAuthor.diagProfileInvalid',
  'scene.duplicate-key': 'interactionAuthor.diagSceneDuplicateKey',
  'scene.unknown-participant': 'interactionAuthor.diagSceneUnknownParticipant',
  'scene.unknown-knowledge': 'interactionAuthor.diagSceneUnknownKnowledge',
  'scene.unknown-opening-node': 'interactionAuthor.diagSceneUnknownOpeningNode',
  'scene.unknown-ending-node': 'interactionAuthor.diagSceneUnknownEndingNode',
  'scene.no-narrative-link': 'interactionAuthor.diagSceneNoNarrativeLink',
  'rule.unknown-participant': 'interactionAuthor.diagRuleUnknownParticipant',
  'rule.unknown-dimension': 'interactionAuthor.diagRuleUnknownDimension',
  'rule.large-change-without-evidence': 'interactionAuthor.diagRuleLargeChangeWithoutEvidence',
  'scene.invalid': 'interactionAuthor.diagSceneInvalid',
  'narrative.invalid': 'interactionAuthor.diagNarrativeInvalid',
}

const warnedInteractionDiagnosticCodes = new Set<string>()

function interactionDiagnosticLine(t: DomainTFunction, item: InteractionDraftDiagnostic): string {
  const key = INTERACTION_DIAGNOSTIC_KEYS[item.code]
  if (!key) {
    if (!warnedInteractionDiagnosticCodes.has(item.code)) {
      warnedInteractionDiagnosticCodes.add(item.code)
      console.warn(`[chatgame] 未登记的诊断 code:${item.code}`, item.message)
    }
    return t('interactionAuthor.diagnosticUnknown', { code: item.code })
  }
  return t(key, { key: item.recordKey ?? '' })
}

function ProfileEditor(props: {
  scope: WorkspaceScope
  profile: InteractionCharacterProfile
  characters: InteractionAuthoringSnapshot['characters']
  onChanged: () => Promise<void>
}) {
  const [participantKey, setParticipantKey] = useState(props.profile.participantKey)
  const [characterId, setCharacterId] = useState(props.profile.characterId ?? props.characters[0]?.id ?? 0)
  const [roleLabel, setRoleLabel] = useState(props.profile.roleLabel)
  const [voiceRules, setVoiceRules] = useState(props.profile.voiceRules)
  const [knowledge, setKnowledge] = useState(props.profile.initialKnowledgeJson)
  const [dimensions, setDimensions] = useState(props.profile.relationshipDimensionsJson)
  const [capacity, setCapacity] = useState(props.profile.maxMemoryEntries)
  const [busy, setBusy] = useState(false)
  const { t } = useDomainT('simulation')
  const save = async () => {
    setBusy(true)
    try {
      await saveInteractionCharacterProfile({
        scope: props.scope,
        gameDefinitionId: props.profile.gameDefinitionId,
        profileId: props.profile.id,
        characterId,
        participantKey,
        roleLabel,
        voiceRules,
        initialKnowledgeJson: knowledge,
        relationshipDimensionsJson: dimensions,
        maxMemoryEntries: capacity,
      })
      await props.onChanged()
    } finally { setBusy(false) }
  }
  return <article className="storygame-author-card"><div className="storygame-author-card-head"><code>{props.profile.participantKey}</code><label>{t('interactionAuthor.profileMemoryCapacityLabel')}<input type="number" value={capacity} onChange={event => setCapacity(Number(event.target.value))} /></label></div><div className="storygame-author-inline"><label>{t('interactionAuthor.profileCharacterLabel')}<select value={characterId} onChange={event => setCharacterId(Number(event.target.value))}>{props.characters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t('interactionAuthor.profileParticipantKeyLabel')}<input value={participantKey} onChange={event => setParticipantKey(event.target.value)} /></label></div><label>{t('interactionAuthor.profileRoleLabel')}<input value={roleLabel} onChange={event => setRoleLabel(event.target.value)} /></label><label>{t('interactionAuthor.profileVoiceRulesLabel')}<textarea rows={3} value={voiceRules} onChange={event => setVoiceRules(event.target.value)} /></label><div className="storygame-author-json-grid"><label>{t('interactionAuthor.profileInitialKnowledgeLabel')}<textarea rows={7} value={knowledge} onChange={event => setKnowledge(event.target.value)} /></label><label>{t('interactionAuthor.profileRelationshipDimensionsLabel')}<textarea rows={7} value={dimensions} onChange={event => setDimensions(event.target.value)} /></label></div><div className="storygame-author-actions"><button disabled={busy} onClick={() => void save()}><Save className="h-3.5 w-3.5" />{t('interactionAuthor.saveProfile')}</button><button className="danger" disabled={busy} onClick={() => void (async () => { setBusy(true); try { await deleteInteractionCharacterProfile({ scope: props.scope, profileId: props.profile.id! }); await props.onChanged() } finally { setBusy(false) } })()}><Trash2 className="h-3.5 w-3.5" />{t('common:delete')}</button></div></article>
}

function SceneEditor(props: {
  scope: WorkspaceScope
  scene: InteractionSceneTemplate
  nodes: InteractionAuthoringSnapshot['nodes']
  onChanged: () => Promise<void>
}) {
  const [draft, setDraft] = useState({
    sceneKey: props.scene.sceneKey, title: props.scene.title, purpose: props.scene.purpose,
    location: props.scene.location, timeLabel: props.scene.timeLabel,
    participantKeysJson: props.scene.participantKeysJson,
    publicKnowledgeKeysJson: props.scene.publicKnowledgeKeysJson,
    goalsJson: props.scene.goalsJson, endingConditionsJson: props.scene.endingConditionsJson,
    safetyBoundariesJson: props.scene.safetyBoundariesJson,
    relationshipRulesJson: props.scene.relationshipRulesJson ?? '[]',
    openingNodeKey: props.scene.openingNodeKey ?? '', endingNodeKey: props.scene.endingNodeKey ?? '',
    maxTurns: props.scene.maxTurns, directorBudget: props.scene.directorBudget, order: props.scene.order,
  })
  const [busy, setBusy] = useState(false)
  const { t } = useDomainT('simulation')
  const set = <K extends keyof typeof draft>(key: K, value: typeof draft[K]) => setDraft(current => ({ ...current, [key]: value }))
  const save = async () => {
    setBusy(true)
    try {
      await saveInteractionSceneTemplate({
        scope: props.scope,
        gameDefinitionId: props.scene.gameDefinitionId,
        sceneId: props.scene.id,
        ...draft,
      })
      await props.onChanged()
    } finally { setBusy(false) }
  }
  return <article className="storygame-author-card"><div className="storygame-author-card-head"><code>{props.scene.sceneKey}</code><label>{t('interactionAuthor.sceneOrderLabel')}<input type="number" value={draft.order} onChange={event => set('order', Number(event.target.value))} /></label></div><div className="storygame-author-inline"><label>{t('interactionAuthor.sceneKeyLabel')}<input value={draft.sceneKey} onChange={event => set('sceneKey', event.target.value)} /></label><label>{t('interactionAuthor.sceneTitleLabel')}<input value={draft.title} onChange={event => set('title', event.target.value)} /></label></div><label>{t('interactionAuthor.scenePurposeLabel')}<textarea rows={2} value={draft.purpose} onChange={event => set('purpose', event.target.value)} /></label><div className="storygame-author-inline"><label>{t('interactionAuthor.sceneLocationLabel')}<input value={draft.location} onChange={event => set('location', event.target.value)} /></label><label>{t('interactionAuthor.sceneTimeLabel')}<input value={draft.timeLabel} onChange={event => set('timeLabel', event.target.value)} /></label></div><div className="storygame-author-json-grid"><label>{t('interactionAuthor.sceneParticipantKeysLabel')}<textarea rows={4} value={draft.participantKeysJson} onChange={event => set('participantKeysJson', event.target.value)} /></label><label>{t('interactionAuthor.scenePublicKnowledgeLabel')}<textarea rows={4} value={draft.publicKnowledgeKeysJson} onChange={event => set('publicKnowledgeKeysJson', event.target.value)} /></label><label>{t('interactionAuthor.sceneGoalsLabel')}<textarea rows={4} value={draft.goalsJson} onChange={event => set('goalsJson', event.target.value)} /></label><label>{t('interactionAuthor.sceneEndingConditionsLabel')}<textarea rows={4} value={draft.endingConditionsJson} onChange={event => set('endingConditionsJson', event.target.value)} /></label><label>{t('interactionAuthor.sceneSafetyBoundariesLabel')}<textarea rows={4} value={draft.safetyBoundariesJson} onChange={event => set('safetyBoundariesJson', event.target.value)} /></label><label>{t('interactionAuthor.sceneRelationshipRulesLabel')}<textarea rows={7} value={draft.relationshipRulesJson} onChange={event => set('relationshipRulesJson', event.target.value)} /></label></div><div className="storygame-author-inline"><label>{t('interactionAuthor.sceneOpeningNodeLabel')}<select value={draft.openingNodeKey} onChange={event => set('openingNodeKey', event.target.value)}><option value="">{t('interactionAuthor.sceneUnbindOption')}</option>{props.nodes.map(item => <option key={item.key} value={item.key}>{item.title} · {item.key}</option>)}</select></label><label>{t('interactionAuthor.sceneEndingNodeLabel')}<select value={draft.endingNodeKey} onChange={event => set('endingNodeKey', event.target.value)}><option value="">{t('interactionAuthor.sceneUnbindOption')}</option>{props.nodes.map(item => <option key={item.key} value={item.key}>{item.title} · {item.key}</option>)}</select></label></div><div className="storygame-author-inline"><label>{t('interactionAuthor.sceneMaxTurnsLabel')}<input type="number" value={draft.maxTurns} onChange={event => set('maxTurns', Number(event.target.value))} /></label><label>{t('interactionAuthor.sceneDirectorBudgetLabel')}<input type="number" value={draft.directorBudget} onChange={event => set('directorBudget', Number(event.target.value))} /></label></div><div className="storygame-author-actions"><button disabled={busy} onClick={() => void save()}><Save className="h-3.5 w-3.5" />{t('interactionAuthor.saveScene')}</button><button className="danger" disabled={busy} onClick={() => void (async () => { setBusy(true); try { await deleteInteractionSceneTemplate({ scope: props.scope, sceneId: props.scene.id! }); await props.onChanged() } finally { setBusy(false) } })()}><Trash2 className="h-3.5 w-3.5" />{t('common:delete')}</button></div></article>
}

export default function InteractionGameWorkbench({ scope }: { scope: WorkspaceScope }) {
  const dialog = useDialog()
  const { t, lang } = useDomainT('simulation')
  // 语言感知的知识 key 列表连接（上下文检查摘要）
  const listFormat = useMemo(() => new Intl.ListFormat(lang, { type: 'unit' }), [lang])
  const [snapshot, setSnapshot] = useState<InteractionAuthoringSnapshot>(EMPTY)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<number[]>([])
  const [newProfileCharacterId, setNewProfileCharacterId] = useState<number | null>(null)
  // 新游戏标题是作者输入的持久化数据：初始为空，由作者显式输入或 service 的
  // canonical 默认值兜底；禁止用 t() 预置。
  const [title, setTitle] = useState('')
  const [view, setView] = useState<'profiles' | 'scenes' | 'context' | 'release'>('profiles')
  const [report, setReport] = useState<InteractionDraftReport | null>(null)
  const [inspection, setInspection] = useState<InteractionContextInspection | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const load = async () => {
    const result = await loadInteractionAuthoringSnapshot(scope)
    setSnapshot(result)
    setSelectedId(current => result.definitions.some(item => item.id === current) ? current : result.definitions[0]?.id ?? null)
    setSelectedCharacterIds(current => current.length ? current : result.characters.slice(0, 3).flatMap(item => item.id == null ? [] : [item.id]))
    setLoading(false)
  }
  useEffect(() => { setLoading(true); setError(''); void load().catch(reason => { console.error('[chatgame] author snapshot load failed', reason); setError(t('textGame.common.errors.loadFailed')); setLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.projectId, scope.worldId, scope.workId])
  const definition = snapshot.definitions.find(item => item.id === selectedId) ?? null
  const profiles = useMemo(() => snapshot.profiles.filter(item => item.gameDefinitionId === definition?.id), [definition?.id, snapshot.profiles])
  const scenes = useMemo(() => snapshot.scenes.filter(item => item.gameDefinitionId === definition?.id), [definition?.id, snapshot.scenes])
  const module = snapshot.modules.find(item => item.id === definition?.narrativeModuleId)
  const nodes = snapshot.nodes.filter(item => item.moduleId === module?.id)
  const releases = snapshot.releases.filter(item => item.gameDefinitionId === definition?.id)
  const availableCharacters = snapshot.characters.filter(item => !profiles.some(profile => profile.characterId === item.id))
  const run = async (action: () => Promise<void>) => { if (busy) return; setBusy(true); setError(''); setMessage(''); try { await action() } catch (reason) { console.error('[chatgame] authoring operation failed', reason); setError(t('textGame.common.errors.operationFailed')) } finally { setBusy(false) } }
  const refresh = async () => { await load(); setReport(null); setInspection(null) }
  const createGame = () => run(async () => {
    const created = await createStarterInteractionGame({ scope, title, characterIds: selectedCharacterIds })
    await load(); setSelectedId(created.id!); setMessage(t('interactionAuthor.createdMinimal'))
  })
  const createSample = () => run(async () => {
    const created = await createInteractionAcceptanceSample({ scope, characterIds: selectedCharacterIds.slice(0, 3) })
    await load(); setSelectedId(created.id!); setMessage(t('interactionAuthor.createdSample'))
  })
  const addProfile = () => run(async () => {
    if (!definition) return
    const character = snapshot.characters.find(item => item.id === (newProfileCharacterId ?? availableCharacters[0]?.id))
    if (!character?.id) throw new Error(t('interactionAuthor.noCharactersError'))
    const participantKey = `character-${character.id}`
    await saveInteractionCharacterProfile({
      scope, gameDefinitionId: definition.id!, characterId: character.id, participantKey,
      roleLabel: character.shortDescription.trim() || character.storyRole?.trim() || '互动角色',
      voiceRules: character.speechStyle?.trim() || '保持角色设定与自己的知识边界。',
      initialKnowledgeJson: JSON.stringify([{ key: `profile.${participantKey}`, content: character.shortDescription.trim() || `${character.name}参与当前场景。`, visibility: 'public', importance: 50 }]),
      relationshipDimensionsJson: JSON.stringify([
        { key: 'trust', label: '信任', minimum: -10, maximum: 10, initial: 0, largeChangeThreshold: 3 },
        { key: 'closeness', label: '亲近', minimum: -10, maximum: 10, initial: 0, largeChangeThreshold: 3 },
      ]),
      maxMemoryEntries: 24,
    })
    setNewProfileCharacterId(null); await refresh(); setMessage(t('interactionAuthor.profileAdded', { name: character.name }))
  })
  const addScene = () => run(async () => {
    if (!definition || !profiles.length) throw new Error(t('interactionAuthor.needProfileError'))
    const publicKnowledge = profiles.flatMap(profile => {
      try {
        return (JSON.parse(profile.initialKnowledgeJson) as Array<{ key: string; visibility: string }>)
          .filter(item => item.visibility === 'public').map(item => item.key)
      } catch { return [] }
    })
    const suffix = `${scenes.length + 1}-${Date.now().toString(36)}`
    await saveInteractionSceneTemplate({
      scope, gameDefinitionId: definition.id!, sceneKey: `scene-${suffix}`, title: `新场景 ${scenes.length + 1}`,
      purpose: '定义这个场景要推动的角色互动目标。', location: '待设置地点', timeLabel: '待设置时间',
      participantKeysJson: JSON.stringify(profiles.map(item => item.participantKey)),
      publicKnowledgeKeysJson: JSON.stringify([...new Set(publicKnowledge)]),
      goalsJson: '["完成一个明确的互动目标"]', endingConditionsJson: '["玩家主动结束场景"]',
      safetyBoundariesJson: '["不替玩家决定感受或行动"]', relationshipRulesJson: '[]',
      openingNodeKey: nodes.find(item => item.kind === 'entry')?.key ?? null,
      endingNodeKey: nodes.find(item => item.kind === 'ending')?.key ?? null,
      maxTurns: 20, directorBudget: Math.min(3, profiles.length), order: scenes.length,
    })
    await refresh(); setMessage(t('interactionAuthor.sceneAdded'))
  })
  if (loading) return <div className="storygame-author-empty"><Loader2 className="h-7 w-7 animate-spin" /><h2>{t('interactionAuthor.loadingTitle')}</h2></div>
  return <div className="storygame-author">
    <aside className="storygame-author-sidebar">
      <div className="storygame-author-sidebar-head"><strong>{t('interactionAuthor.sidebarTitle')}</strong><FilePlus2 className="h-4 w-4 text-accent" /></div>
      <div className="storygame-author-game-list">{snapshot.definitions.map(item => <button key={item.id} className={item.id === definition?.id ? 'active' : ''} onClick={() => { setSelectedId(item.id!); setReport(null); setInspection(null) }}><strong>{item.title}</strong><small>{item.gameKey}</small></button>)}</div>
      <div className="mt-4 space-y-2 border-t border-border pt-4">
        <input value={title} onChange={event => setTitle(event.target.value)} placeholder={t('interactionAuthor.newGamePlaceholder')} />
        <div className="max-h-36 space-y-1 overflow-y-auto">{snapshot.characters.map(item => <label key={item.id} className="flex items-start gap-2 text-[9px] text-text-secondary"><input type="checkbox" checked={selectedCharacterIds.includes(item.id!)} onChange={() => setSelectedCharacterIds(current => current.includes(item.id!) ? current.filter(id => id !== item.id) : [...current, item.id!])} />{item.name}</label>)}</div>
        <button className="storygame-author-create" disabled={!selectedCharacterIds.length || busy} onClick={createGame}><FilePlus2 className="h-3.5 w-3.5" />{t('interactionAuthor.createFromSelection')}</button>
        <button className="storygame-author-create" disabled={selectedCharacterIds.length < 3 || busy} onClick={createSample}><ShieldCheck className="h-3.5 w-3.5" />{t('interactionAuthor.createAcceptanceSample')}</button>
      </div>
      <p>{t('interactionAuthor.sidebarNote')}</p>
    </aside>
    <main className="storygame-author-main">
      {message && <div className="storygame-author-notice success"><CheckCircle2 className="h-4 w-4" /><span>{message}</span></div>}
      {error && <div className="storygame-author-notice error"><AlertTriangle className="h-4 w-4" /><span>{error}</span></div>}
      {!definition ? <div className="storygame-author-empty"><UserRound className="h-8 w-8" /><h2>{t('interactionAuthor.emptyTitle')}</h2><p>{t('interactionAuthor.emptyDescription')}</p></div> : <>
        <div className="storygame-author-toolbar"><div><strong>{definition.title}</strong><span>{t('interactionAuthor.countsSummary', { profiles: profiles.length, scenes: scenes.length, releases: releases.length })}</span></div><nav><button className={view === 'profiles' ? 'active' : ''} onClick={() => setView('profiles')}>{t('interactionAuthor.tabProfiles')}</button><button className={view === 'scenes' ? 'active' : ''} onClick={() => setView('scenes')}>{t('interactionAuthor.tabScenes')}</button><button className={view === 'context' ? 'active' : ''} onClick={() => setView('context')}>{t('interactionAuthor.tabContext')}</button><button className={view === 'release' ? 'active' : ''} onClick={() => setView('release')}>{t('interactionAuthor.tabRelease')}</button></nav></div>
        <section className="storygame-author-pane">
          {view === 'profiles' && <><div className="storygame-author-heading"><div><small>{t('interactionAuthor.profilesEyebrow')}</small><h2>{t('interactionAuthor.profilesHeading')}</h2></div><div className="storygame-author-actions">{!!availableCharacters.length && <><select value={newProfileCharacterId ?? availableCharacters[0]?.id ?? ''} onChange={event => setNewProfileCharacterId(Number(event.target.value))}>{availableCharacters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button disabled={busy} onClick={addProfile}><FilePlus2 className="h-3.5 w-3.5" />{t('interactionAuthor.addCharacter')}</button></>}</div></div>{profiles.map(profile => <ProfileEditor key={profile.id} scope={scope} profile={profile} characters={snapshot.characters} onChanged={refresh} />)}</>}
          {view === 'scenes' && <><div className="storygame-author-heading"><div><small>{t('interactionAuthor.scenesEyebrow')}</small><h2>{t('interactionAuthor.scenesHeading')}</h2></div><div className="storygame-author-actions"><button disabled={busy || !profiles.length} onClick={addScene}><FilePlus2 className="h-3.5 w-3.5" />{t('interactionAuthor.addScene')}</button></div></div>{scenes.map(scene => <SceneEditor key={scene.id} scope={scope} scene={scene} nodes={nodes} onChanged={refresh} />)}</>}
          {view === 'context' && <><div className="storygame-author-heading"><div><small>{t('interactionAuthor.contextEyebrow')}</small><h2>{t('interactionAuthor.contextHeading')}</h2></div></div><div className="storygame-author-actions">{profiles.map(profile => <button key={profile.id} aria-label={t('interactionAuthor.inspectCharacterAria', { name: snapshot.characters.find(item => item.id === profile.characterId)?.name ?? profile.participantKey })} onClick={() => void run(async () => { setInspection(await inspectInteractionContext({ scope, gameDefinitionId: definition.id!, participantKey: profile.participantKey })) })}><Eye className="h-3.5 w-3.5" />{snapshot.characters.find(item => item.id === profile.characterId)?.name ?? profile.participantKey}</button>)}</div>{inspection && <article className="storygame-author-contract"><Eye className="h-5 w-5" /><div><strong>{inspection.profile.characterName} · {inspection.participantKey}</strong><p>{t('interactionAuthor.inspectionSummary', { sources: listFormat.format(inspection.sourceKeys), visible: inspection.visibleKnowledgeKeys.length ? listFormat.format(inspection.visibleKnowledgeKeys) : t('interactionAuthor.noneLabel'), hidden: inspection.hiddenKnowledgeKeys.length ? listFormat.format(inspection.hiddenKnowledgeKeys) : t('interactionAuthor.noneLabel'), capacity: inspection.memoryCapacity })}</p></div></article>}</>}
          {view === 'release' && <><div className="storygame-author-heading"><div><small>{t('interactionAuthor.releaseEyebrow')}</small><h2>{t('interactionAuthor.releaseHeading')}</h2></div><div className="storygame-author-actions"><button onClick={() => void run(async () => { setReport(await validateInteractionGameDraft(scope, definition.id!)) })}><ShieldCheck className="h-3.5 w-3.5" />{t('interactionAuthor.runValidation')}</button><button disabled={busy} onClick={() => void run(async () => { const result = await publishInteractionGameDraft({ scope, gameDefinitionId: definition.id! }); setReport(result.report); await load(); setMessage(t('interactionAuthor.publishedVersion', { version: result.gameRelease.version })) })}><Rocket className="h-3.5 w-3.5" />{t('interactionAuthor.publishNewVersion')}</button></div></div>{report && <><div className={`storygame-graph-summary ${report.valid ? 'valid' : 'invalid'}`}>{report.valid ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}<div><strong>{report.valid ? t('interactionAuthor.reportValid') : t('interactionAuthor.reportInvalid')}</strong><span>{t('interactionAuthor.reportCounts', { participants: report.participantCount, scenes: report.sceneCount, status: report.narrative.valid ? t('interactionAuthor.narrativePass') : t('interactionAuthor.narrativeFail') })}</span></div></div><ul className="storygame-graph-issues">{report.diagnostics.map((item, index) => <li key={`${item.code}:${index}`}>{item.severity === 'error' ? t('interactionAuthor.diagnosticBlocking') : t('interactionAuthor.diagnosticHint')} · {interactionDiagnosticLine(t, item)}</li>)}</ul></>}<div className="storygame-version-list">{releases.map(item => <article key={item.id}><div><strong>{item.label}</strong><span>{t('interactionAuthor.gameReleaseVersion', { version: item.version })}</span></div><code>{item.contentHash.slice(0, 16)}…</code></article>)}</div><div className="storygame-author-actions mt-6"><button className="danger" onClick={() => void run(async () => { const ok = await dialog.confirm({ title: t('interactionAuthor.deleteConfirmTitle', { title: definition.title }), message: t('interactionAuthor.deleteConfirmMessage'), confirmText: t('interactionAuthor.deleteConfirmText'), tone: 'danger' }); if (!ok) return; await deleteInteractionGameDraft({ scope, gameDefinitionId: definition.id! }); await refresh(); setMessage(t('interactionAuthor.draftDeleted')) })}><Trash2 className="h-3.5 w-3.5" />{t('interactionAuthor.deleteDraft')}</button></div></>}
        </section>
      </>}
    </main>
  </div>
}
