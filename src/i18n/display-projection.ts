/**
 * Phase 1 (i18n) — canonical → localized display projection.
 *
 * Persisted enums and tags (chapter/run/session/quest/cultivation statuses,
 * relation types, canonical Chinese location tags, batch stage codes) stay
 * CANONICAL in storage. Localized labels are resolved only at render time:
 *
 *   - known canonical value → explicit locale key (presence in all 3 locales
 *     is enforced by tests/regression/R-i18n-display-projections.test.ts); if
 *     the mapped key is nevertheless missing at render time (t() echoes the
 *     key back), the canonical persisted value is shown instead — a known
 *     canonical value never leaks a raw i18n key;
 *   - truly invalid value  → the raw persisted value is shown as-is. That is
 *     the safe visible fallback, and it never uses the forbidden
 *     `t(key) || raw` truthiness pattern, which would hide a broken
 *     translation behind the canonical value without a missing-key signal.
 *
 * Each map is bound to ONE namespace (documented per map) so render sites can
 * only reach it through their own `useDomainT` ns, respecting the namespace
 * discipline gate (tests/registry/i18n-ns-usage.test.ts).
 */
import type { ChapterStatus } from '../lib/types/outline'
import type { LocationType } from '../lib/types/geography'
import type { RelationType } from '../lib/types/character-relation'
import type { LocationTag } from '../lib/types/location'
import type {
  SimulationSessionStatus,
  SimulationTtrpgQuestStatus,
} from '../lib/types/simulation-runtime'
import type { NodeRunStatus } from '../lib/types/node-flow'
import type { CultivationProgressStatus } from '../lib/types/cultivation-progress'
import type { CharacterDrivenPlanStatus } from '../lib/types/character-driven-plan'
// Phase 3 (i18n-upstream) canonical sets.
import type { ProjectStatus } from '../lib/types/project'
import type {
  NarrativeModuleKind,
  NarrativeNodeKind,
} from '../lib/types/narrative-blueprint'
import type { NarrativeBeatKind } from '../lib/types/text-game'
import type { AvgMediaKind } from '../lib/types/avg'
import type {
  AdventureActionKind,
  AdventureCheckOutcome,
  AdventureQuestStatus,
} from '../lib/types/adventure'
import type { SimulationSessionKind } from '../lib/types/simulation-runtime'

/**
 * Minimal translation function shape accepted by the projection helpers.
 * Component-bound `t` from `useDomainT` is assignable to it; key correctness
 * is enforced by the explicit maps below plus the locale-presence tests.
 */
export type DisplayT = (...args: any[]) => string

/**
 * Safe translation with interpolation and key-echo detection (ora-2).
 * Calls t(key, opts); if the result echoes the key, is empty, or is not a
 * string (missing-key under non-default i18next configs), returns `fallback`.
 * This is key-echo detection, NOT the forbidden `t(key) || raw` truthiness
 * pattern: a present translation is always used as-is.
 */
function safeTranslate(
  t: DisplayT,
  key: string,
  opts: Record<string, unknown>,
  fallback: string,
): string {
  const translated = t(key, opts)
  if (typeof translated !== 'string' || translated === '' || translated === key) return fallback
  return translated
}

/**
 * Resolve the display label of a persisted canonical value.
 * Known values go through the explicit key map; anything else (corrupted or
 * legacy data outside the canonical set) is returned unchanged.
 *
 * Missing-key safety (ora-2): a KNOWN canonical value must never surface a
 * raw i18n key. When the mapped key is missing — i18next echoes the key
 * itself back, or yields an equivalent missing-key result (empty string,
 * null/undefined under non-default configs) — the canonical persisted value
 * is returned as the visible fallback.
 */
export function projectCanonicalLabel(
  t: DisplayT,
  keyByValue: Record<string, string>,
  value: string,
): string {
  const key = Object.prototype.hasOwnProperty.call(keyByValue, value)
    ? keyByValue[value]
    : undefined
  if (!key) return value
  return safeTranslate(t, key, {}, value)
}

// ── layout ns · PropertiesPanel ────────────────────────────────────────────

/** Chapter workflow status (layout ns → propertiesPanel.chapterStatusValue.*). */
export const CHAPTER_STATUS_LABEL_KEYS: Record<ChapterStatus, string> = {
  outline: 'propertiesPanel.chapterStatusValue.outline',
  draft: 'propertiesPanel.chapterStatusValue.draft',
  revised: 'propertiesPanel.chapterStatusValue.revised',
  polished: 'propertiesPanel.chapterStatusValue.polished',
  final: 'propertiesPanel.chapterStatusValue.final',
}

/** Relation type labels for the properties panel (layout ns → propertiesPanel.relationTypes.*). */
export const LAYOUT_RELATION_TYPE_LABEL_KEYS: Record<RelationType, string> = {
  family: 'propertiesPanel.relationTypes.family',
  lover: 'propertiesPanel.relationTypes.lover',
  friend: 'propertiesPanel.relationTypes.friend',
  rival: 'propertiesPanel.relationTypes.rival',
  enemy: 'propertiesPanel.relationTypes.enemy',
  master: 'propertiesPanel.relationTypes.master',
  student: 'propertiesPanel.relationTypes.student',
  ally: 'propertiesPanel.relationTypes.ally',
  subordinate: 'propertiesPanel.relationTypes.subordinate',
  other: 'propertiesPanel.relationTypes.other',
}

/** Legacy geography location types shown in the properties panel (layout ns → propertiesPanel.locationTypes.*). */
export const LAYOUT_LOCATION_TYPE_LABEL_KEYS: Record<LocationType, string> = {
  continent: 'propertiesPanel.locationTypes.continent',
  country: 'propertiesPanel.locationTypes.country',
  city: 'propertiesPanel.locationTypes.city',
  sect: 'propertiesPanel.locationTypes.sect',
  secret: 'propertiesPanel.locationTypes.secret',
  ruin: 'propertiesPanel.locationTypes.ruin',
  battlefield: 'propertiesPanel.locationTypes.battlefield',
  nature: 'propertiesPanel.locationTypes.nature',
  building: 'propertiesPanel.locationTypes.building',
  other: 'propertiesPanel.locationTypes.other',
}

// ── relations ns · CharacterRelationPanel / RelationGraph ──────────────────

/** Relation type labels WITH emoji (relations ns → types.*). */
export const RELATION_TYPE_LABEL_KEYS: Record<RelationType, string> = {
  family: 'types.family',
  lover: 'types.lover',
  friend: 'types.friend',
  rival: 'types.rival',
  enemy: 'types.enemy',
  master: 'types.master',
  student: 'types.student',
  ally: 'types.ally',
  subordinate: 'types.subordinate',
  other: 'types.other',
}

/** Relation type labels WITHOUT emoji for the graph legend (relations ns → graphLegend.*). */
export const RELATION_TYPE_LEGEND_LABEL_KEYS: Record<RelationType, string> = {
  family: 'graphLegend.family',
  lover: 'graphLegend.lover',
  friend: 'graphLegend.friend',
  rival: 'graphLegend.rival',
  enemy: 'graphLegend.enemy',
  master: 'graphLegend.master',
  student: 'graphLegend.student',
  ally: 'graphLegend.ally',
  subordinate: 'graphLegend.subordinate',
  other: 'graphLegend.other',
}

// ── simulation ns · SimulationRuntimePanel ─────────────────────────────────

/** Interactive session status (simulation ns → sessionStatus.*). */
export const SESSION_STATUS_LABEL_KEYS: Record<SimulationSessionStatus, string> = {
  active: 'sessionStatus.active',
  paused: 'sessionStatus.paused',
  archived: 'sessionStatus.archived',
}

/** TTRPG campaign quest status (simulation ns → reuses campaign.questStatus*). */
export const QUEST_STATUS_LABEL_KEYS: Record<SimulationTtrpgQuestStatus, string> = {
  active: 'campaign.questStatusActive',
  paused: 'campaign.questStatusPaused',
  completed: 'campaign.questStatusCompleted',
  failed: 'campaign.questStatusFailed',
}

// ── node-authoring / node-flow ns · run history lines ─────────────────────

/**
 * Node run status. BOTH node-authoring.json and node-flow.json define
 * workspace.runStatus.* (each workspace renders through its own ns).
 */
export const NODE_RUN_STATUS_LABEL_KEYS: Record<NodeRunStatus, string> = {
  running: 'workspace.runStatus.running',
  paused: 'workspace.runStatus.paused',
  completed: 'workspace.runStatus.completed',
  failed: 'workspace.runStatus.failed',
  cancelled: 'workspace.runStatus.cancelled',
}

// ── cultivation ns · CultivationProgressPanel ──────────────────────────────

/** Cultivation progress event status (cultivation ns → eventStatus.*). */
export const CULTIVATION_PROGRESS_STATUS_LABEL_KEYS: Record<CultivationProgressStatus, string> = {
  confirmed: 'eventStatus.confirmed',
  stale: 'eventStatus.stale',
  'source-missing': 'eventStatus.sourceMissing',
}

// ── location ns · LocationPanel / LocationTagPicker ────────────────────────

/**
 * Canonical Chinese LocationTag values → locale keys (location ns → tags.*).
 * The Chinese tag itself remains the persisted data key; only display is
 * projected.
 */
export const LOCATION_TAG_LABEL_KEYS: Record<LocationTag, string> = {
  // 自然地形
  '大陆': 'tags.continent',
  '半岛': 'tags.peninsula',
  '岛屿': 'tags.island',
  '群岛': 'tags.archipelago',
  '高原': 'tags.plateau',
  '平原': 'tags.plain',
  '盆地': 'tags.basin',
  '丘陵': 'tags.hills',
  '峡谷': 'tags.canyon',
  '山脉': 'tags.mountainRange',
  '山峰': 'tags.peak',
  '火山': 'tags.volcano',
  '戈壁': 'tags.gobi',
  '沙漠': 'tags.desert',
  '冰原': 'tags.iceField',
  '草原': 'tags.grassland',
  '森林': 'tags.forest',
  '雨林': 'tags.rainforest',
  '沼泽': 'tags.swamp',
  '绿洲': 'tags.oasis',
  '洞穴': 'tags.cave',
  '海洋': 'tags.ocean',
  '海峡': 'tags.strait',
  '海湾': 'tags.bay',
  '湖泊': 'tags.lake',
  '河流': 'tags.river',
  '瀑布': 'tags.waterfall',
  '温泉': 'tags.hotSpring',
  '冰川': 'tags.glacier',
  '浮空岛': 'tags.floatingIsland',
  '虚空': 'tags.void',
  '异界裂隙': 'tags.rift',
  // 人文场所
  '村庄': 'tags.village',
  '城镇': 'tags.town',
  '城市': 'tags.city',
  '都城': 'tags.capital',
  '部落': 'tags.tribe',
  '营地': 'tags.camp',
  '关隘': 'tags.pass',
  '要塞': 'tags.fortress',
  '军营': 'tags.militaryCamp',
  '战场': 'tags.battlefield',
  '神殿': 'tags.shrine',
  '寺庙': 'tags.temple',
  '学院': 'tags.academy',
  '集市': 'tags.market',
  '酒楼': 'tags.tavern',
  '拍卖行': 'tags.auctionHouse',
  '黑市': 'tags.blackMarket',
  '矿场': 'tags.mine',
  '港口': 'tags.port',
  '驿站': 'tags.waystation',
  '废墟': 'tags.ruins',
  '遗迹': 'tags.ancientRuins',
  '古墓': 'tags.tomb',
  '迷宫': 'tags.labyrinth',
  '禁地': 'tags.forbiddenZone',
  '秘境': 'tags.secretRealm',
  '宗门': 'tags.sect',
  '洞府': 'tags.caveDwelling',
  '灵脉': 'tags.spiritVein',
}

/** Display label for a persisted canonical LocationTag (or raw if invalid). */
export function locationTagLabel(t: DisplayT, tag: string): string {
  return projectCanonicalLabel(t, LOCATION_TAG_LABEL_KEYS, tag)
}

// ── outline ns · OutlineVolumeSidebar batch stages ─────────────────────────

/**
 * Canonical batch stage codes for volume outline batch generation →
 * locale keys (outline ns → batch.stage.*).
 *
 * Contract for src/lib/ai/batch-outline-runner.ts: the runner emits these
 * stable language-neutral codes in BatchOutlineProgress.stage (registered in
 * OUTLINE_BATCH_STAGES); render sites localize via projectOutlineBatchStage.
 * Legacy prose from historical/in-flight data falls through unchanged.
 */
export const OUTLINE_BATCH_STAGE_LABEL_KEYS: Record<string, string> = {
  'generating-volume': 'batch.stage.generatingVolume',
  'volume-complete': 'batch.stage.volumeComplete',
  'volume-failed': 'batch.stage.volumeFailed',
}

/**
 * Project the outline batch stage line at render time. Known canonical codes
 * resolve to localized messages; anything else (legacy prose or truly invalid
 * data) is shown as-is, preserving runtime compatibility.
 * Missing-key safety (ora-2): if the mapped key is missing, the canonical
 * stage code is returned — never a raw i18n key.
 */
export function projectOutlineBatchStage(
  t: DisplayT,
  progress: { stage: string; currentVolumeTitle: string; parsedChapters: readonly unknown[] },
): string {
  const key = Object.prototype.hasOwnProperty.call(OUTLINE_BATCH_STAGE_LABEL_KEYS, progress.stage)
    ? OUTLINE_BATCH_STAGE_LABEL_KEYS[progress.stage]
    : undefined
  if (!key) return progress.stage
  const opts: Record<string, unknown> = { title: progress.currentVolumeTitle }
  if (progress.stage === 'volume-complete') {
    opts.count = progress.parsedChapters.length
  }
  return safeTranslate(t, key, opts, progress.stage)
}

// ── outline ns · DetailedOutlineSidebar batch stages ───────────────────────

/**
 * Canonical batch stage codes for detailed-outline / chapter-content batch
 * runs (BatchRunStage from src/lib/ai/batch-detail-runner.ts) → locale keys
 * (outline ns → detailed.batchStage.*). The runner already emits stable
 * codes; render sites localize via projectDetailedBatchStage. Legacy prose
 * from historical/in-flight data falls through unchanged.
 */
export const DETAILED_BATCH_STAGE_LABEL_KEYS: Record<string, string> = {
  'generating-detail': 'detailed.batchStage.generatingDetail',
  'generating-chapter': 'detailed.batchStage.generatingChapter',
  done: 'detailed.batchStage.done',
}

/**
 * Project the detailed-outline batch stage line at render time. Known
 * canonical codes resolve to localized messages; anything else is shown
 * as-is, preserving runtime compatibility.
 * Missing-key safety (ora-2): if the mapped key is missing, the canonical
 * stage code is returned — never a raw i18n key.
 */
export function projectDetailedBatchStage(
  t: DisplayT,
  progress: { stage: string; currentTitle: string; generated?: number; skipped?: number },
): string {
  const key = Object.prototype.hasOwnProperty.call(DETAILED_BATCH_STAGE_LABEL_KEYS, progress.stage)
    ? DETAILED_BATCH_STAGE_LABEL_KEYS[progress.stage]
    : undefined
  if (!key) return progress.stage
  const opts: Record<string, unknown> =
    progress.stage === 'done'
      ? { generated: progress.generated ?? 0, skipped: progress.skipped ?? 0 }
      : { title: progress.currentTitle }
  return safeTranslate(t, key, opts, progress.stage)
}

// ── outline ns · CharacterDrivenPlotPanel plan status ──────────────────────

/**
 * Character-driven plan status (outline ns → characterDriven.planStatus.*).
 * The persisted enum stays canonical; only display is projected.
 */
export const CHARACTER_DRIVEN_PLAN_STATUS_LABEL_KEYS: Record<CharacterDrivenPlanStatus, string> = {
  draft: 'characterDriven.planStatus.draft',
  generated: 'characterDriven.planStatus.generated',
  adopted: 'characterDriven.planStatus.adopted',
}

/** Display label for a persisted plan status (or raw if invalid/legacy). */
export function projectCharacterDrivenPlanStatus(t: DisplayT, status: string): string {
  return projectCanonicalLabel(t, CHARACTER_DRIVEN_PLAN_STATUS_LABEL_KEYS, status)
}

// ── Phase 3 (i18n-upstream) · work status + interactive product kinds ──────
//
// Canonical sets from docs/I18N-UPSTREAM-MERGE-INVENTORY-20260824.md §4.
// Persisted values stay canonical; only display is projected through the
// shared `projectCanonicalLabel` helper (same ora-2 fallback contract as
// above). Locale presence + non-empty labels in all 3 UI locales are enforced
// by tests/regression/R-i18n-display-projections.test.ts (Phase 3 section).

/**
 * Work status — `Work.status` reuses `ProjectStatus`
 * (src/lib/types/world-ownership.ts → src/lib/types/project.ts).
 * Binds to the pages ns and REUSES the existing stable home-page keys
 * (`home.statusDrafting` etc.) so the work manager renders exactly the same
 * labels as project creation — no parallel label set.
 */
export const WORK_STATUS_LABEL_KEYS: Record<ProjectStatus, string> = {
  drafting: 'home.statusDrafting',
  ongoing: 'home.statusOngoing',
  paused: 'home.statusPaused',
  completed: 'home.statusCompleted',
}

/**
 * Simulation session kinds (simulation ns → kind.*). The four launch kinds
 * reuse the existing keys already rendered by SimulationRuntimePanel; the
 * upstream product kinds extend the same object — one shared map, no
 * duplicated local KIND_LABELS/KIND_FALLBACK_LABELS tables.
 */
export const SIMULATION_SESSION_KIND_LABEL_KEYS: Record<SimulationSessionKind, string> = {
  sandbox: 'kind.sandbox',
  'npc-evolution': 'kind.npcEvolution',
  ttrpg: 'kind.ttrpg',
  chatgame: 'kind.chatgame',
  storygame: 'kind.storygame',
  textadventure: 'kind.textadventure',
  avg: 'kind.avg',
  textsimulation: 'kind.textsimulation',
  textworld: 'kind.textworld',
}

/** Narrative module kinds (simulation ns → moduleKind.*). */
export const NARRATIVE_MODULE_KIND_LABEL_KEYS: Record<NarrativeModuleKind, string> = {
  main: 'moduleKind.main',
  side: 'moduleKind.side',
  quest: 'moduleKind.quest',
  opening: 'moduleKind.opening',
  free: 'moduleKind.free',
}

/** Narrative node kinds (simulation ns → nodeKind.*). */
export const NARRATIVE_NODE_KIND_LABEL_KEYS: Record<NarrativeNodeKind, string> = {
  entry: 'nodeKind.entry',
  scene: 'nodeKind.scene',
  choice: 'nodeKind.choice',
  ending: 'nodeKind.ending',
}

/** Narrative beat kinds (simulation ns → beatKind.*). */
export const NARRATIVE_BEAT_KIND_LABEL_KEYS: Record<NarrativeBeatKind, string> = {
  narration: 'beatKind.narration',
  dialogue: 'beatKind.dialogue',
  action: 'beatKind.action',
  system: 'beatKind.system',
}

/**
 * AVG media asset kinds (simulation ns → mediaKind.*). Values are derived
 * from AVG_MEDIA_KINDS in src/lib/types/avg.ts; dotted canonical values map
 * to camelCase key suffixes ('character-pose' → mediaKind.characterPose).
 */
export const AVG_MEDIA_KIND_LABEL_KEYS: Record<AvgMediaKind, string> = {
  background: 'mediaKind.background',
  'character-pose': 'mediaKind.characterPose',
  'character-expression': 'mediaKind.characterExpression',
  cg: 'mediaKind.cg',
  ui: 'mediaKind.ui',
  bgm: 'mediaKind.bgm',
  ambience: 'mediaKind.ambience',
  sfx: 'mediaKind.sfx',
  voice: 'mediaKind.voice',
}

/** Text-adventure action kinds (simulation ns → adventure.actionKind.*). */
export const ADVENTURE_ACTION_KIND_LABEL_KEYS: Record<AdventureActionKind, string> = {
  look: 'adventure.actionKind.look',
  move: 'adventure.actionKind.move',
  talk: 'adventure.actionKind.talk',
  take: 'adventure.actionKind.take',
  give: 'adventure.actionKind.give',
  use: 'adventure.actionKind.use',
  inspect: 'adventure.actionKind.inspect',
  attempt: 'adventure.actionKind.attempt',
  rest: 'adventure.actionKind.rest',
  'quest-action': 'adventure.actionKind.questAction',
}

/** Text-adventure quest statuses (simulation ns → adventure.questStatus.*). */
export const ADVENTURE_QUEST_STATUS_LABEL_KEYS: Record<AdventureQuestStatus, string> = {
  locked: 'adventure.questStatus.locked',
  available: 'adventure.questStatus.available',
  active: 'adventure.questStatus.active',
  completed: 'adventure.questStatus.completed',
  failed: 'adventure.questStatus.failed',
}

/** Text-adventure check outcomes (simulation ns → adventure.checkOutcome.*). */
export const ADVENTURE_CHECK_OUTCOME_LABEL_KEYS: Record<AdventureCheckOutcome, string> = {
  success: 'adventure.checkOutcome.success',
  'costly-success': 'adventure.checkOutcome.costlySuccess',
  failure: 'adventure.checkOutcome.failure',
  'not-attempted': 'adventure.checkOutcome.notAttempted',
}
