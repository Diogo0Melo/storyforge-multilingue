import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  Bot,
  Check,
  GitBranch,
  Gamepad2,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  WandSparkles,
} from 'lucide-react'
import type {
  NarrativeModule,
  Project,
  SimulationSessionKind,
  WorldRelease,
  WorldReleaseManifestV2,
  WorldRevision,
  WorkspaceScope,
} from '../../lib/types'
import type { WorldReleaseSection } from '../../lib/registry/types'
import {
  createStarterNarrativeModule,
  projectStoryArcsToNarrative,
  validateNarrativeModule,
} from '../../lib/narrative/blueprint'
import { readOwnedRows, resolveScopeLike } from '../../lib/world-engine/scope'
import { selectWorkNarrativeModule } from '../../lib/world-engine/works'
import {
  createWorldRevision,
  diffWorldRevisions,
  listWorldReleases,
  listWorldRevisions,
  publishWorldRevision,
  WORLD_RELEASE_SECTIONS,
  worldReleaseSectionTables,
} from '../../lib/world-engine/releases'
import { publishStoryGameDraft } from '../../lib/text-game/authoring'
import { publishAdventureGameDraft } from '../../lib/adventure/authoring'
import { publishAvgGame } from '../../lib/avg/authoring'
import {
  generateAdventureGameFromWorldRelease,
  generateAvgGameFromWorldRelease,
  generateStoryGameFromWorldRelease,
  loadWorldGameSourceCatalog,
} from '../../lib/text-game/world-generation'
import type { WorldGameSourceCatalog } from '../../lib/text-game/world-generation'
import { createWorldInstance } from '../../lib/world-engine/instances'
import { installMistHarborDemoWorld } from '../../lib/world-engine/mist-harbor-demo'
import { changeRecordScope } from '../../lib/world-engine/scope-conversion'
import { db } from '../../lib/db/schema'
import { useDialog } from '../shared/Dialog'
import { useMasterCopilot } from '../agent/useMasterCopilot'
import { useDomainT } from '../../i18n'
import {
  NARRATIVE_MODULE_KIND_LABEL_KEYS,
  SIMULATION_SESSION_KIND_LABEL_KEYS,
  projectCanonicalLabel,
} from '../../i18n/display-projection'
import {
  createWorldGameTargetInstructionV1,
} from '../../lib/agent/world-game-copilot'
import type { WorldGameCopilotSnapshotV1 } from '../../lib/agent/world-game-copilot'
import type { WorldGameAuthoringProductV1 } from '../../lib/text-game/agent-contract'

/**
 * 显示投影单一事实源：叙事模块 kind 与互动实例 kind 的 label 键位归 simulation
 * 命名空间所有（src/i18n/display-projection.ts），本面板只消费、不复制字典。
 * 持久化值保持 canonical；未知/缺 key 时按 display-projection 的 ora-2 契约
 * 回退为持久化值本身。面板自身的 UI 文案仍走 worldview 命名空间。
 */

/** 实例类型下拉保持既有顺序（仅 canonical 值，label 渲染时经 simulation 投影）。 */
const INSTANCE_KIND_OPTIONS: readonly SimulationSessionKind[] = ['ttrpg', 'chatgame', 'npc-evolution']

interface Props {
  project: Project
  projectId: number
  worldGroupId?: number | null
  activeWorkId?: number | null
  onChanged: () => Promise<void> | void
  onOpenRuntime: () => void
  onOpenGame: (product: 'storygame' | 'text-adventure' | 'avg') => void
}

export default function WorldNarrativeReleasePanel({ project, projectId, worldGroupId = null, activeWorkId, onChanged, onOpenRuntime, onOpenGame }: Props) {
  const dialog = useDialog()
  const { t, lang } = useDomainT('worldview')
  // 渲染期列表连接：跟随 UI locale（表名等 canonical 技术标识只被连接、不被翻译）。
  const listFormat = useMemo(() => new Intl.ListFormat(lang, { type: 'conjunction', style: 'short' }), [lang])
  // 共享 canonical kind 投影归 simulation 命名空间所有（见文件头注释）；
  // 面板自身 UI 文案继续走 worldview t。
  const { t: simulationT } = useDomainT('simulation')
  const kindLabel = (kind: NarrativeModule['kind']) => projectCanonicalLabel(simulationT, NARRATIVE_MODULE_KIND_LABEL_KEYS, kind)
  const instanceKindLabel = (kind: SimulationSessionKind) => projectCanonicalLabel(simulationT, SIMULATION_SESSION_KIND_LABEL_KEYS, kind)
  const gameCopilot = useMasterCopilot({ project, worldGroupId: null })
  const [scope, setScope] = useState<WorkspaceScope | null>(null)
  const [modules, setModules] = useState<NarrativeModule[]>([])
  const [validity, setValidity] = useState<Record<number, boolean>>({})
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [activeModuleId, setActiveModuleId] = useState<number | null>(null)
  const [revisions, setRevisions] = useState<WorldRevision[]>([])
  const [releases, setReleases] = useState<WorldRelease[]>([])
  const [revisionLabel, setRevisionLabel] = useState('')
  const [instanceKind, setInstanceKind] = useState<SimulationSessionKind>('ttrpg')
  const [instanceTitle, setInstanceTitle] = useState('')
  const [releaseId, setReleaseId] = useState<number | null>(null)
  const [releaseNarrativeExportId, setReleaseNarrativeExportId] = useState<number | null>(null)
  const [newModuleKind, setNewModuleKind] = useState<NarrativeModule['kind']>('quest')
  const [newModuleTitle, setNewModuleTitle] = useState('')
  const [selectedSections, setSelectedSections] = useState<Set<WorldReleaseSection>>(
    () => new Set(WORLD_RELEASE_SECTIONS.map(section => section.key)),
  )
  const [revisionDiff, setRevisionDiff] = useState<{
    added: string[]
    removed: string[]
    changed: string[]
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [generatedStoryTitle, setGeneratedStoryTitle] = useState('')
  const [generatedProduct, setGeneratedProduct] = useState<'storygame' | 'text-adventure' | 'avg'>('storygame')
  const [sourceCatalog, setSourceCatalog] = useState<WorldGameSourceCatalog | null>(null)
  const [selectedCharacterExportIds, setSelectedCharacterExportIds] = useState<Set<number>>(new Set())
  const [selectedLocationExportIds, setSelectedLocationExportIds] = useState<Set<number>>(new Set())
  const [selectedArtifactExportIds, setSelectedArtifactExportIds] = useState<Set<number>>(new Set())
  const [selectedLoreExportIds, setSelectedLoreExportIds] = useState<Set<number>>(new Set())
  const [selectedMediaExportIds, setSelectedMediaExportIds] = useState<Set<number>>(new Set())
  const [aiProduct, setAiProduct] = useState<WorldGameAuthoringProductV1>('storygame')
  // 创作简报是作者输入的持久化数据：不得用固定文案（更不得用 UI locale 文案）预置。
  const [creativeBrief, setCreativeBrief] = useState('')

  const load = useCallback(async () => {
    const resolved = await resolveScopeLike(projectId)
    const [rows, work, revisionRows, releaseRows] = await Promise.all([
      readOwnedRows<NarrativeModule>(resolved, 'narrativeModules'),
      db.works.get(resolved.workId),
      listWorldRevisions(resolved),
      listWorldReleases(resolved),
    ])
    const checks = await Promise.all(rows.map(async module => [
      module.id!,
      (await validateNarrativeModule(resolved, module.id!)).valid,
    ] as const))
    setScope(resolved)
    setModules(rows)
    setValidity(Object.fromEntries(checks))
    setActiveModuleId(work?.activeNarrativeModuleId ?? null)
    setSelectedIds(previous => {
      const available = new Set(rows.map(module => module.id!))
      const retained = [...previous].filter(id => available.has(id))
      return new Set(retained.length ? retained : rows.map(module => module.id!))
    })
    setRevisions(revisionRows)
    setReleases(releaseRows)
    setRevisionDiff(revisionRows.length > 1
      ? await diffWorldRevisions(revisionRows[1].id!, revisionRows[0].id!)
      : null)
    setReleaseId(previous => releaseRows.some(release => release.id === previous)
      ? previous
      : releaseRows[0]?.id ?? null)
  }, [projectId])

  useEffect(() => {
    void load().catch(cause => {
      // 原始错误只进开发者控制台；用户界面呈现本地化通用错误。
      console.error('[world-narrative] blueprint load failed', cause)
      setMessage(t('worldNarrative.loadBlueprintFailedError'))
    })
  }, [activeWorkId, load, t])

  const latestRevision = revisions[0] ?? null
  const latestRelease = releases[0] ?? null
  const selectedRelease = releases.find(release => release.id === releaseId) ?? null
  const releaseNarrativeModules = useMemo(() => {
    if (!selectedRelease) return []
    try {
      return (JSON.parse(selectedRelease.manifestJson) as WorldReleaseManifestV2).selectedNarrativeModules
    } catch { return [] }
  }, [selectedRelease])
  const selectedReleaseModule = releaseNarrativeModules.find(module => module.exportId === releaseNarrativeExportId) ?? null
  const canRevise = selectedSections.size > 0 && [...selectedIds].every(id => validity[id])

  useEffect(() => {
    setReleaseNarrativeExportId(previous => releaseNarrativeModules.some(module => module.exportId === previous)
      ? previous
      : releaseNarrativeModules[0]?.exportId ?? null)
  }, [releaseNarrativeModules])

  useEffect(() => {
    let cancelled = false
    if (!scope || !releaseId) { setSourceCatalog(null); return () => { cancelled = true } }
    void loadWorldGameSourceCatalog({ scope, worldReleaseId: releaseId }).then(catalog => {
      if (cancelled) return
      setSourceCatalog(catalog)
      setSelectedCharacterExportIds(new Set(catalog.characters.map(item => item.exportId)))
      setSelectedLocationExportIds(new Set(catalog.locations.map(item => item.exportId)))
      setSelectedArtifactExportIds(new Set(catalog.artifacts.map(item => item.exportId)))
      setSelectedLoreExportIds(new Set(catalog.loreEntries.map(item => item.exportId)))
      setSelectedMediaExportIds(new Set(catalog.mediaAssets.map(item => item.exportId)))
    }).catch(cause => {
      if (!cancelled) {
        console.error('[world-narrative] frozen asset catalog load failed', cause)
        setSourceCatalog(null)
        setMessage(t('worldNarrative.loadAssetsFailedError'))
      }
    })
    return () => { cancelled = true }
  }, [scope, releaseId, t])

  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setMessage('')
    try { await action() } catch (cause) {
      console.error('[world-narrative] operation failed', cause)
      setMessage(t('worldNarrative.operationFailedError'))
    } finally { setBusy(false) }
  }

  const projectArcs = () => run(async () => {
    if (!scope) return
    const projected = await projectStoryArcsToNarrative(scope)
    setMessage(projected.length ? t('worldNarrative.syncArcsDone', { total: projected.length }) : t('worldNarrative.syncArcsEmpty'))
    await load()
  })

  const createModule = () => run(async () => {
    if (!scope || !newModuleTitle.trim()) return
    const created = await createStarterNarrativeModule({
      scope,
      owner: 'work',
      kind: newModuleKind,
      title: newModuleTitle,
    })
    await selectWorkNarrativeModule(scope, created.id!)
    setNewModuleTitle('')
    setMessage(t('worldNarrative.moduleCreated', { kind: kindLabel(created.kind), title: created.title }))
    await load()
  })

  const createRevision = () => run(async () => {
    if (!scope || !canRevise) return
    await createWorldRevision({
      scope,
      label: revisionLabel,
      parentRevisionId: latestRevision?.id ?? null,
      selectedTables: [...selectedSections].flatMap(worldReleaseSectionTables),
      selectedNarrativeModuleIds: [...selectedIds],
    })
    setRevisionLabel('')
    setMessage(t('worldNarrative.revisionFrozen'))
    await load()
  })

  const publish = () => run(async () => {
    if (!latestRevision?.id) return
    const confirmed = await dialog.confirm({
      title: t('worldNarrative.publishConfirmTitle', { revision: latestRevision.revision }),
      message: t('worldNarrative.publishConfirmMessage'),
      confirmText: t('worldNarrative.publishVersion'),
    })
    if (!confirmed) return
    await publishWorldRevision(latestRevision.id)
    setMessage(t('worldNarrative.versionPublished'))
    await load()
    await onChanged()
  })

  const startInstance = () => run(async () => {
    if (!scope || !releaseId || releaseNarrativeExportId == null || !selectedReleaseModule) return
    const instance = await createWorldInstance({
      scope,
      kind: instanceKind,
      // 持久化标题只来自作者输入或既有 canonical/作者化标题，禁止拼接 UI locale 文案。
      title: instanceTitle.trim() || selectedReleaseModule.title,
      releaseId,
      releaseNarrativeModuleExportId: releaseNarrativeExportId,
      worldGroupId,
    })
    setMessage(t('worldNarrative.instanceCreated', { title: instance.title }))
    setInstanceTitle('')
    await onChanged()
  })

  const generateStoryGame = () => run(async () => {
    if (!scope || !releaseId || releaseNarrativeExportId == null || !selectedReleaseModule) return
    const generated = await generateStoryGameFromWorldRelease({
      scope,
      worldReleaseId: releaseId,
      narrativeModuleExportId: releaseNarrativeExportId,
      title: selectedReleaseModule.title,
    })
    const publication = await publishStoryGameDraft({
      scope,
      gameDefinitionId: generated.definition.id!,
      // 持久化 release label 只复用生成 definition 的作者化标题本身；
      // 禁止 UI locale 派生后缀或新增 canonical 中文标记。
      label: generated.definition.title,
    })
    setGeneratedStoryTitle(generated.definition.title)
    setGeneratedProduct('storygame')
    setMessage(t('worldNarrative.storygamePublished', { title: generated.definition.title, version: publication.gameRelease.version }))
    await load()
    await onChanged()
  })

  const generateAdventureGame = () => run(async () => {
    if (!scope || !releaseId || releaseNarrativeExportId == null || !selectedReleaseModule) return
    const generated = await generateAdventureGameFromWorldRelease({
      scope,
      worldReleaseId: releaseId,
      narrativeModuleExportId: releaseNarrativeExportId,
      characterExportIds: [...selectedCharacterExportIds],
      locationExportIds: [...selectedLocationExportIds],
      artifactExportIds: [...selectedArtifactExportIds],
      codexEntryExportIds: [...selectedLoreExportIds],
    })
    const publication = await publishAdventureGameDraft({
      scope,
      gameDefinitionId: generated.definition.id!,
      // 持久化 release label 只复用生成 definition 的作者化标题本身；
      // 禁止 UI locale 派生后缀或新增 canonical 中文标记。
      label: generated.definition.title,
    })
    setGeneratedStoryTitle(generated.definition.title)
    setGeneratedProduct('text-adventure')
    setMessage(t('worldNarrative.adventurePublished', { title: generated.definition.title, version: publication.gameRelease.version }))
    await load()
    await onChanged()
  })

  const generateAvgGame = () => run(async () => {
    if (!scope || !releaseId || releaseNarrativeExportId == null || !selectedReleaseModule) return
    const generated = await generateAvgGameFromWorldRelease({
      scope,
      worldReleaseId: releaseId,
      narrativeModuleExportId: releaseNarrativeExportId,
      characterExportIds: [...selectedCharacterExportIds],
      mediaAssetExportIds: [...selectedMediaExportIds],
    })
    const publication = await publishAvgGame({
      scope,
      gameDefinitionId: generated.definition.id!,
      // 持久化 release label 只复用生成 definition 的作者化标题本身；
      // 禁止 UI locale 派生后缀或新增 canonical 中文标记。
      label: generated.definition.title,
    })
    setGeneratedStoryTitle(generated.definition.title)
    setGeneratedProduct('avg')
    setMessage(t('worldNarrative.avgPublished', { title: generated.definition.title, version: publication.gameRelease.version, warning: generated.warnings[0] ?? '' }))
    await load()
    await onChanged()
  })

  const startAiGameAuthoring = () => run(async () => {
    if (!scope || !selectedRelease?.id || releaseNarrativeExportId == null || !sourceCatalog) return
    const selectedCharacters = new Set(selectedCharacterExportIds)
    const request = {
      schema: 'storyforge.world-game-authoring-request',
      version: 1,
      productType: aiProduct,
      worldReleaseId: selectedRelease.id,
      worldContentHash: selectedRelease.contentHash,
      narrativeModuleExportId: releaseNarrativeExportId,
      characterExportIds: [...selectedCharacterExportIds].sort((a, b) => a - b),
      characterRelationExportIds: sourceCatalog.relationships
        .filter(item => selectedCharacters.has(item.fromCharacterExportId) && selectedCharacters.has(item.toCharacterExportId))
        .map(item => item.exportId)
        .sort((a, b) => a - b),
      importantLocationExportIds: [...selectedLocationExportIds].sort((a, b) => a - b),
      artifactExportIds: [...selectedArtifactExportIds].sort((a, b) => a - b),
      codexEntryExportIds: [...selectedLoreExportIds].sort((a, b) => a - b),
      storyArcExportIds: sourceCatalog.storyArcs.map(item => item.exportId).sort((a, b) => a - b),
      avgMediaAssetExportIds: [...selectedMediaExportIds].sort((a, b) => a - b),
      creativeBrief: creativeBrief.trim(),
    } as const
    const instruction = createWorldGameTargetInstructionV1(request)
    await gameCopilot.submitTargetedRequest(instruction, {
      agentId: 'outline',
      skillId: 'outline.world-game',
      instruction,
      id: `world-game-${aiProduct}`,
    })
    setMessage(t('worldNarrative.dispatched'))
  })

  const aiCandidates = gameCopilot.pendingCandidates.filter(candidate => (
    candidate.payload.skillId === 'outline.world-game'
  ))

  const adoptAndPublishAiGame = (candidate: typeof aiCandidates[number]) => run(async () => {
    if (!scope || !selectedRelease) return
    const candidateRequest = (candidate.payload.baseSnapshot as WorldGameCopilotSnapshotV1).request
    if (candidateRequest.worldReleaseId !== selectedRelease.id
      || candidateRequest.worldContentHash !== selectedRelease.contentHash) {
      throw new Error(t('worldNarrative.candidateMismatchError'))
    }
    const candidateProduct = candidateRequest.productType
    const adopted = await gameCopilot.adoptCandidate(candidate)
    if (!adopted) throw new Error(gameCopilot.error || t('worldNarrative.adoptFailedError'))
    const definitions = await db.gameDefinitions.where('workId').equals(scope.workId).toArray()
    const definition = definitions
      .filter(item => item.productType === candidateProduct && item.sourceWorldContentHash === selectedRelease.contentHash)
      .sort((left, right) => right.updatedAt - left.updatedAt)[0]
    if (!definition?.id) throw new Error(t('worldNarrative.adoptedDraftMissingError'))
    if (candidateProduct === 'storygame') {
      await publishStoryGameDraft({ scope, gameDefinitionId: definition.id, label: definition.title })
    } else if (candidateProduct === 'text-adventure') {
      await publishAdventureGameDraft({ scope, gameDefinitionId: definition.id, label: definition.title })
    } else {
      await publishAvgGame({ scope, gameDefinitionId: definition.id, label: definition.title })
    }
    setGeneratedStoryTitle(definition.title)
    setGeneratedProduct(candidateProduct)
    setMessage(t('worldNarrative.aiGamePublished', { title: definition.title }))
    await load()
    await onChanged()
  })

  const installMistHarbor = () => run(async () => {
    if (!scope) return
    const confirmed = await dialog.confirm({
      title: t('worldNarrative.demoConfirmTitle'),
      message: t('worldNarrative.demoConfirmMessage'),
      confirmText: t('worldNarrative.demoConfirmText'),
    })
    if (!confirmed) return
    const result = await installMistHarborDemoWorld({ scope })
    setSelectedIds(previous => new Set([...previous, result.narrativeModuleId]))
    setMessage(t('worldNarrative.demoReady', {
      characters: result.characterCount,
      locations: result.locationCount,
      rules: result.worldRuleEntryCount,
      chapters: result.chapterCount,
      outlines: result.detailedOutlineCount,
      foreshadows: result.foreshadowCount,
      artifacts: result.artifactCount,
      media: result.mediaAssetCount,
    }))
    await load()
    await onChanged()
  })

  const toggleExportId = (setter: Dispatch<SetStateAction<Set<number>>>, exportId: number) => {
    setter(previous => {
      const next = new Set(previous)
      if (next.has(exportId)) next.delete(exportId); else next.add(exportId)
      return next
    })
  }

  return (
    <section className="sf-world-pipeline" aria-label={t('worldNarrative.ariaLabel')}>
      <div className="sf-world-pipeline-heading">
        <div><span className="sf-card-kicker"><GitBranch className="h-4 w-4" /> {t('worldNarrative.kicker')}</span><h3>{t('worldNarrative.heading')}</h3></div>
        <button className="sf-button sf-button-secondary" onClick={projectArcs} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{t('worldNarrative.syncArcs')}
        </button>
      </div>

      <div className="sf-world-pipeline-grid">
        <div className="sf-world-pipeline-stage">
          <div className="sf-world-pipeline-stage-head"><span>1</span><div><strong>{t('worldNarrative.stage1Title')}</strong><small>{t('worldNarrative.stage1Description')}</small></div></div>
          <div className="sf-world-module-create">
            <select aria-label={t('worldNarrative.newModuleKindAria')} value={newModuleKind} onChange={event => setNewModuleKind(event.target.value as NarrativeModule['kind'])}>
              {(Object.keys(NARRATIVE_MODULE_KIND_LABEL_KEYS) as Array<NarrativeModule['kind']>).map(kind => <option key={kind} value={kind}>{kindLabel(kind)}</option>)}
            </select>
            <input aria-label={t('worldNarrative.newModuleTitleAria')} value={newModuleTitle} onChange={event => setNewModuleTitle(event.target.value)} placeholder={t('worldNarrative.newModuleTitlePlaceholder')} />
            <button className="sf-icon-button" title={t('worldNarrative.createModuleAria')} aria-label={t('worldNarrative.createModuleAria')} onClick={createModule} disabled={busy || !newModuleTitle.trim()}><Plus className="h-4 w-4" /></button>
          </div>
          <div className="sf-world-module-list">
            {modules.map(module => (
              <div key={module.id} className={`sf-world-module-row ${module.id === activeModuleId ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  aria-label={t('worldNarrative.includeInReleaseAria', { title: module.title })}
                  checked={selectedIds.has(module.id!)}
                  onChange={event => setSelectedIds(previous => {
                    const next = new Set(previous)
                    if (event.target.checked) next.add(module.id!); else next.delete(module.id!)
                    return next
                  })}
                />
                <button onClick={() => run(async () => {
                  if (!scope) return
                  await selectWorkNarrativeModule(scope, module.id!)
                  setActiveModuleId(module.id!)
                  setMessage(t('worldNarrative.moduleSelected', { kind: kindLabel(module.kind), title: module.title }))
                })}>
                  <span><strong>{module.title}</strong><small>{kindLabel(module.kind)}</small></span>
                  <span className={validity[module.id!] ? 'ready' : 'warning'}>{validity[module.id!] ? t('worldNarrative.moduleReady') : t('worldNarrative.modulePending')}</span>
                </button>
                <select
                  aria-label={t('worldNarrative.scopeAria', { title: module.title })}
                  value={module.worldId != null ? 'world' : 'work'}
                  disabled={busy}
                  onChange={event => run(async () => {
                    if (!scope) return
                    const targetOwner = event.target.value as 'world' | 'work'
                    await changeRecordScope({ scope, tableName: 'narrativeModules', recordId: module.id!, targetOwner })
                    setMessage(targetOwner === 'world'
                      ? t('worldNarrative.scopeChangedWorld', { title: module.title })
                      : t('worldNarrative.scopeChangedWork', { title: module.title }))
                    await load()
                  })}
                >
                  <option value="work">{t('worldNarrative.scopeWork')}</option>
                  <option value="world">{t('worldNarrative.scopeWorld')}</option>
                </select>
              </div>
            ))}
            {!modules.length && <p>{t('worldNarrative.emptyModulesHint')}</p>}
          </div>
        </div>

        <div className="sf-world-pipeline-stage">
          <div className="sf-world-pipeline-stage-head"><span>2</span><div><strong>{t('worldNarrative.stage2Title')}</strong><small>{t('worldNarrative.stage2Description')}</small></div></div>
          <fieldset className="sf-world-release-sections">
            <legend>{t('worldNarrative.sectionsLegend')}</legend>
            {WORLD_RELEASE_SECTIONS.map(section => (
              <label key={section.key} title={t(section.descriptionKey, section.description)}>
                <input
                  type="checkbox"
                  checked={selectedSections.has(section.key)}
                  onChange={event => setSelectedSections(previous => {
                    const next = new Set(previous)
                    if (event.target.checked) next.add(section.key); else next.delete(section.key)
                    return next
                  })}
                />
                <span>{t(section.labelKey, section.label)}</span>
              </label>
            ))}
          </fieldset>
          <label className="sf-world-pipeline-field">{t('worldNarrative.revisionLabel')}<input value={revisionLabel} onChange={event => setRevisionLabel(event.target.value)} placeholder={t('worldNarrative.revisionPlaceholder', { total: revisions.length + 1 })} /></label>
          <div className="sf-world-pipeline-actions">
            <button className="sf-button sf-button-secondary" onClick={createRevision} disabled={busy || !canRevise}><ShieldCheck className="h-4 w-4" />{t('worldNarrative.freezeRevision')}</button>
            <button className="sf-button sf-button-primary" onClick={publish} disabled={busy || !latestRevision?.id || latestRelease?.revisionId === latestRevision.id}><Rocket className="h-4 w-4" />{t('worldNarrative.publishVersion')}</button>
          </div>
          <div className="sf-world-pipeline-status"><span>{t('worldNarrative.revisionsCount', { total: revisions.length })}</span><span>{t('worldNarrative.releasesCount', { total: releases.length })}</span>{latestRelease && <span>{t('worldNarrative.currentVersion', { version: latestRelease.version })}</span>}</div>
          {revisionDiff && (
            <div className="sf-world-revision-diff" role="region" aria-label={t('worldNarrative.diffAria')}>
              <strong>{t('worldNarrative.diffAgainst', { revision: revisions[1]?.revision })}</strong>
              <span>{t('worldNarrative.diffAdded', { total: revisionDiff.added.length })}</span>
              <span>{t('worldNarrative.diffChanged', { total: revisionDiff.changed.length })}</span>
              <span>{t('worldNarrative.diffRemoved', { total: revisionDiff.removed.length })}</span>
              {!!revisionDiff.changed.length && <small title={revisionDiff.changed.join(', ')}>{listFormat.format(revisionDiff.changed)}</small>}
            </div>
          )}
        </div>

        <div className="sf-world-pipeline-stage">
          <div className="sf-world-pipeline-stage-head"><span>3</span><div><strong>{t('worldNarrative.stage3Title')}</strong><small>{t('worldNarrative.stage3Description')}</small></div></div>
          <p className="sf-world-pipeline-note">{t('worldNarrative.stage3Note')}</p>
          <div className="sf-world-pipeline-selects">
            <select aria-label={t('worldNarrative.instanceKindAria')} value={instanceKind} onChange={event => setInstanceKind(event.target.value as SimulationSessionKind)}>{INSTANCE_KIND_OPTIONS.map(kind => <option key={kind} value={kind}>{instanceKindLabel(kind)}</option>)}</select>
            <select value={releaseId ?? ''} onChange={event => setReleaseId(Number(event.target.value) || null)}><option value="">{t('worldNarrative.chooseReleaseOption')}</option>{releases.map(release => <option key={release.id} value={release.id}>v{release.version} · {release.label}</option>)}</select>
          </div>
          <label className="sf-world-pipeline-field">{t('worldNarrative.frozenNarrativeLabel')}<select value={releaseNarrativeExportId ?? ''} onChange={event => setReleaseNarrativeExportId(event.target.value === '' ? null : Number(event.target.value))}><option value="">{t('worldNarrative.chooseNarrativeOption')}</option>{releaseNarrativeModules.map(module => <option key={module.exportId} value={module.exportId}>{kindLabel(module.kind)} · {module.title}</option>)}</select></label>
          <label className="sf-world-pipeline-field">{t('worldNarrative.instanceTitleLabel')}<input value={instanceTitle} onChange={event => setInstanceTitle(event.target.value)} placeholder={selectedReleaseModule ? t('worldNarrative.instanceTitlePlaceholderWithModule', { title: selectedReleaseModule.title }) : t('worldNarrative.instanceTitlePlaceholderEmpty')} /></label>
          <div className="sf-world-pipeline-actions">
            <button className="sf-button sf-button-primary" onClick={startInstance} disabled={busy || !releaseId || !selectedReleaseModule}><Play className="h-4 w-4" />{t('worldNarrative.createInstance')}</button>
            <button className="sf-button sf-button-secondary" onClick={onOpenRuntime}><Check className="h-4 w-4" />{t('worldNarrative.viewInstances')}</button>
          </div>
        </div>
      </div>
      <section className="sf-world-game-bridge" aria-label={t('worldNarrative.gameBridgeAriaLabel')}>
        <div>
          <span className="sf-card-kicker"><Gamepad2 className="h-4 w-4" /> {t('worldNarrative.gameBridgeKicker')}</span>
          <h3>{t('worldNarrative.gameBridgeTitle')}</h3>
          <p>{t('worldNarrative.gameBridgeDescription')}</p>
          <button className="sf-button sf-button-secondary" onClick={installMistHarbor} disabled={busy}>
            <WandSparkles className="h-4 w-4" />{t('worldNarrative.installDemo')}
          </button>
        </div>
        <div className="sf-world-game-bridge-source">
          <strong>{selectedRelease ? t('worldNarrative.releaseMeta', { version: selectedRelease.version, label: selectedRelease.label }) : t('worldNarrative.noReleaseSelected')}</strong>
          <span>{selectedReleaseModule ? t('worldNarrative.moduleMeta', { kind: kindLabel(selectedReleaseModule.kind), title: selectedReleaseModule.title }) : t('worldNarrative.noNarrativeSelected')}</span>
          {selectedRelease && <code>{selectedRelease.contentHash.slice(0, 16)}…</code>}
        </div>
        {sourceCatalog && (
          <div className="sf-world-game-selection" aria-label={t('worldNarrative.assetSelectionAria')}>
            <fieldset>
              <legend>{t('worldNarrative.legendCharacters', { selected: selectedCharacterExportIds.size, total: sourceCatalog.characters.length })}</legend>
              {sourceCatalog.characters.map(item => <label key={item.exportId}><input type="checkbox" checked={selectedCharacterExportIds.has(item.exportId)} onChange={() => toggleExportId(setSelectedCharacterExportIds, item.exportId)} /><span>{item.name}</span></label>)}
            </fieldset>
            <fieldset>
              <legend>{t('worldNarrative.legendLocations', { selected: selectedLocationExportIds.size, total: sourceCatalog.locations.length })}</legend>
              {sourceCatalog.locations.map(item => <label key={item.exportId}><input type="checkbox" checked={selectedLocationExportIds.has(item.exportId)} onChange={() => toggleExportId(setSelectedLocationExportIds, item.exportId)} /><span>{item.name}</span></label>)}
            </fieldset>
            <fieldset>
              <legend>{t('worldNarrative.legendArtifacts', { selected: selectedArtifactExportIds.size, total: sourceCatalog.artifacts.length })}</legend>
              {sourceCatalog.artifacts.map(item => <label key={item.exportId}><input type="checkbox" checked={selectedArtifactExportIds.has(item.exportId)} onChange={() => toggleExportId(setSelectedArtifactExportIds, item.exportId)} /><span>{item.name}</span></label>)}
            </fieldset>
            <fieldset>
              <legend>{t('worldNarrative.legendLore', { selected: selectedLoreExportIds.size, total: sourceCatalog.loreEntries.length })}</legend>
              {sourceCatalog.loreEntries.map(item => <label key={item.exportId}><input type="checkbox" checked={selectedLoreExportIds.has(item.exportId)} onChange={() => toggleExportId(setSelectedLoreExportIds, item.exportId)} /><span>{item.name}</span></label>)}
            </fieldset>
            <fieldset>
              <legend>{t('worldNarrative.legendMedia', { selected: selectedMediaExportIds.size, total: sourceCatalog.mediaAssets.length })}</legend>
              {sourceCatalog.mediaAssets.map(item => <label key={item.exportId}><input type="checkbox" checked={selectedMediaExportIds.has(item.exportId)} onChange={() => toggleExportId(setSelectedMediaExportIds, item.exportId)} /><span>{item.name}</span></label>)}
            </fieldset>
          </div>
        )}
        <div className="sf-world-pipeline-stage">
          <div className="sf-world-pipeline-stage-head"><span><Bot className="h-4 w-4" /></span><div><strong>{t('worldNarrative.agentStageTitle')}</strong><small>{t('worldNarrative.agentStageDescription')}</small></div></div>
          <div className="sf-world-pipeline-selects">
            <select aria-label={t('worldNarrative.aiProductAria')} value={aiProduct} disabled={aiCandidates.length > 0} onChange={event => setAiProduct(event.target.value as WorldGameAuthoringProductV1)}>
              <option value="storygame">{t('worldNarrative.productStorygame')}</option>
              <option value="text-adventure">{t('worldNarrative.productAdventure')}</option>
              <option value="avg">{t('worldNarrative.productAvg')}</option>
            </select>
          </div>
          <label className="sf-world-pipeline-field">{t('worldNarrative.creativeBriefLabel')}
            <textarea aria-label={t('worldNarrative.creativeBriefAria')} rows={4} maxLength={2000} value={creativeBrief} onChange={event => setCreativeBrief(event.target.value)} />
          </label>
          <div className="sf-world-pipeline-actions">
            <button className="sf-button sf-button-primary" onClick={startAiGameAuthoring} disabled={busy || gameCopilot.busy || gameCopilot.loading || !releaseId || !selectedReleaseModule || !creativeBrief.trim() || gameCopilot.pendingCandidates.length > 0}>
              {gameCopilot.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}{t('worldNarrative.generateCandidates')}
            </button>
            <button className="sf-button sf-button-secondary" onClick={() => onOpenGame(generatedProduct)} disabled={busy || gameCopilot.busy || !generatedStoryTitle}><Play className="h-4 w-4" />{t('worldNarrative.playNow')}</button>
          </div>
          {gameCopilot.error && <p className="sf-product-message" role="alert">{gameCopilot.error}</p>}
          {aiCandidates.map(candidate => (
            <div key={candidate.event.id} className="sf-world-game-ai-candidate">
              <strong>{t('worldNarrative.candidatePending', { label: candidate.payload.label })}</strong>
              <small>{t('worldNarrative.candidateNotice')}</small>
              <textarea aria-label={t('worldNarrative.candidateContentAria')} rows={16} value={candidate.event.content} disabled={busy || gameCopilot.busy} onChange={event => { void gameCopilot.updateCandidate(candidate.event.id!, event.target.value) }} />
              <div className="sf-world-pipeline-actions">
                <button className="sf-button sf-button-secondary" disabled={busy || gameCopilot.busy} onClick={() => { void gameCopilot.rejectCandidate(candidate) }}>{t('worldNarrative.rejectCandidate')}</button>
                <button className="sf-button sf-button-primary" disabled={busy || gameCopilot.busy} onClick={() => adoptAndPublishAiGame(candidate)}><Rocket className="h-4 w-4" />{t('worldNarrative.adoptPublishPlay')}</button>
              </div>
            </div>
          ))}
        </div>
        <details className="sf-world-game-fallback">
          <summary>{t('worldNarrative.quickMapSummary')}</summary>
          <p>{t('worldNarrative.quickMapDescription')}</p>
          <div className="sf-world-pipeline-actions">
            <button className="sf-button sf-button-secondary" onClick={generateStoryGame} disabled={busy || !releaseId || !selectedReleaseModule}><GitBranch className="h-4 w-4" />{t('worldNarrative.quickMapStorygame')}</button>
            <button className="sf-button sf-button-secondary" onClick={generateAdventureGame} disabled={busy || !releaseId || !selectedReleaseModule}><Gamepad2 className="h-4 w-4" />{t('worldNarrative.quickMapAdventure')}</button>
            <button className="sf-button sf-button-secondary" onClick={generateAvgGame} disabled={busy || !releaseId || !selectedReleaseModule}><Play className="h-4 w-4" />{t('worldNarrative.quickMapAvg')}</button>
          </div>
        </details>
      </section>
      {message && <p className="sf-product-message" role="status">{message}</p>}
    </section>
  )
}
