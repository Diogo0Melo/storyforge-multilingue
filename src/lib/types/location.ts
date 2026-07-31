import type { RagDocumentMetadata } from './rag-library'

/**
 * Phase 25.3 — 重要地点模块
 * 取代旧的「地理环境」面板，使用多标签组合替代单选下拉
 */

/** 自然地形标签 */
export const TERRAIN_TAGS = [
  '大陆', '半岛', '岛屿', '群岛', '高原', '平原', '盆地', '丘陵',
  '峡谷', '山脉', '山峰', '火山', '戈壁', '沙漠', '冰原', '草原',
  '森林', '雨林', '沼泽', '绿洲', '洞穴', '海洋', '海峡', '海湾',
  '湖泊', '河流', '瀑布', '温泉', '冰川', '浮空岛', '虚空', '异界裂隙',
] as const

/** 人文场所标签 */
export const PLACE_TAGS = [
  '村庄', '城镇', '城市', '都城', '部落', '营地', '关隘', '要塞',
  '军营', '战场', '神殿', '寺庙', '学院', '集市', '酒楼', '拍卖行',
  '黑市', '矿场', '港口', '驿站', '废墟', '遗迹', '古墓', '迷宫',
  '禁地', '秘境', '宗门', '洞府', '灵脉',
] as const

export type TerrainTag = typeof TERRAIN_TAGS[number]
export type PlaceTag = typeof PLACE_TAGS[number]
export type LocationTag = TerrainTag | PlaceTag

/** 所有标签（合并） */
export const ALL_LOCATION_TAGS: readonly LocationTag[] = [...TERRAIN_TAGS, ...PLACE_TAGS]

/** i18n key map — Chinese identifiers → translation keys (display only) */
export const TAG_I18N_KEY: Record<LocationTag, string> = {
  // 自然地形
  '大陆': 'location.terrain.continent',
  '半岛': 'location.terrain.peninsula',
  '岛屿': 'location.terrain.island',
  '群岛': 'location.terrain.archipelago',
  '高原': 'location.terrain.plateau',
  '平原': 'location.terrain.plain',
  '盆地': 'location.terrain.basin',
  '丘陵': 'location.terrain.hills',
  '峡谷': 'location.terrain.canyon',
  '山脉': 'location.terrain.mountainRange',
  '山峰': 'location.terrain.peak',
  '火山': 'location.terrain.volcano',
  '戈壁': 'location.terrain.gobi',
  '沙漠': 'location.terrain.desert',
  '冰原': 'location.terrain.icefield',
  '草原': 'location.terrain.grassland',
  '森林': 'location.terrain.forest',
  '雨林': 'location.terrain.rainforest',
  '沼泽': 'location.terrain.swamp',
  '绿洲': 'location.terrain.oasis',
  '洞穴': 'location.terrain.cave',
  '海洋': 'location.terrain.ocean',
  '海峡': 'location.terrain.strait',
  '海湾': 'location.terrain.bay',
  '湖泊': 'location.terrain.lake',
  '河流': 'location.terrain.river',
  '瀑布': 'location.terrain.waterfall',
  '温泉': 'location.terrain.hotspring',
  '冰川': 'location.terrain.glacier',
  '浮空岛': 'location.terrain.floatingIsland',
  '虚空': 'location.terrain.void',
  '异界裂隙': 'location.terrain.planarRift',
  // 人文场所
  '村庄': 'location.place.village',
  '城镇': 'location.place.town',
  '城市': 'location.place.city',
  '都城': 'location.place.capital',
  '部落': 'location.place.tribe',
  '营地': 'location.place.camp',
  '关隘': 'location.place.pass',
  '要塞': 'location.place.fortress',
  '军营': 'location.place.barracks',
  '战场': 'location.place.battlefield',
  '神殿': 'location.place.shrine',
  '寺庙': 'location.place.temple',
  '学院': 'location.place.academy',
  '集市': 'location.place.market',
  '酒楼': 'location.place.tavern',
  '拍卖行': 'location.place.auctionHouse',
  '黑市': 'location.place.blackMarket',
  '矿场': 'location.place.mine',
  '港口': 'location.place.port',
  '驿站': 'location.place.relayStation',
  '废墟': 'location.place.ruins',
  '遗迹': 'location.place.relics',
  '古墓': 'location.place.tomb',
  '迷宫': 'location.place.labyrinth',
  '禁地': 'location.place.forbiddenZone',
  '秘境': 'location.place.secretRealm',
  '宗门': 'location.place.sect',
  '洞府': 'location.place.caveDwelling',
  '灵脉': 'location.place.spiritVein',
}

/** i18n keys for category labels */
export const CATEGORY_I18N_KEYS = {
  terrain: 'location.categoryTerrain',
  place: 'location.categoryPlace',
} as const

/** 标签分类信息 */
export const TAG_CATEGORIES = [
  { label: '自然地形', tags: TERRAIN_TAGS, color: '#14b8a6' },
  { label: '人文场所', tags: PLACE_TAGS, color: '#f59e0b' },
] as const

/** 标签对应的 emoji */
export const TAG_EMOJI: Partial<Record<LocationTag, string>> = {
  // 自然
  '大陆': '🌍', '半岛': '🏝️', '岛屿': '🏝️', '群岛': '🏝️',
  '高原': '🏔️', '平原': '🌾', '盆地': '🏞️', '丘陵': '⛰️',
  '峡谷': '🏜️', '山脉': '🏔️', '山峰': '⛰️', '火山': '🌋',
  '戈壁': '🏜️', '沙漠': '🏜️', '冰原': '🧊', '草原': '🌿',
  '森林': '🌲', '雨林': '🌴', '沼泽': '💧', '绿洲': '🌴',
  '洞穴': '🕳️', '海洋': '🌊', '海峡': '🌊', '海湾': '🏖️',
  '湖泊': '💎', '河流': '🏞️', '瀑布': '💦', '温泉': '♨️',
  '冰川': '🧊', '浮空岛': '☁️', '虚空': '🌌', '异界裂隙': '🌀',
  // 人文
  '村庄': '🏘️', '城镇': '🏘️', '城市': '🏙️', '都城': '🏯',
  '部落': '⛺', '营地': '🏕️', '关隘': '🚧', '要塞': '🏰',
  '军营': '⚔️', '战场': '🔥', '神殿': '⛩️', '寺庙': '🛕',
  '学院': '🏫', '集市': '🛒', '酒楼': '🍶', '拍卖行': '🔨',
  '黑市': '🕶️', '矿场': '⛏️', '港口': '⚓', '驿站': '🐴',
  '废墟': '🏚️', '遗迹': '🗿', '古墓': '⚰️', '迷宫': '🌀',
  '禁地': '⛔', '秘境': '✨', '宗门': '🏯', '洞府': '🕳️', '灵脉': '💎',
}

/** 重要地点 */
export interface ImportantLocation extends RagDocumentMetadata {
  id?: number
  projectId: number
  /** 地点名称 */
  name: string
  /** 标签组合（自然地形 + 人文场所可混搭） */
  tags: string            // JSON string: LocationTag[]
  /** 地点描述 */
  description: string
  /** 剧情重要性 / 在故事中的作用 */
  significance: string
  /** 父地点 ID（支持树状层级） */
  parentId: number | null
  /** 同级排序 */
  sortOrder: number
  createdAt: number
  updatedAt: number
}
