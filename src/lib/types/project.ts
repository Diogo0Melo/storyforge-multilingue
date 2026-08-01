import type { ProjectKeys } from '../../i18n/generated-resources'

/** 写作状态 */
export type ProjectStatus = 'drafting' | 'ongoing' | 'paused' | 'completed'

/** 项目状态标签键 */
export const PROJECT_STATUS_LABEL_KEYS = {
  drafting:  'status.drafting',
  ongoing:   'status.ongoing',
  paused:    'status.paused',
  completed: 'status.completed',
} as const satisfies Record<ProjectStatus, ProjectKeys>

/** 项目状态标签 */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  drafting:  '构思中',
  ongoing:   '连载中',
  paused:    '暂停',
  completed: '已完结',
}

/**
 * 流派标签（多选字符串，取代旧的单选 NovelGenre 枚举）
 * 参考起点、纵横、晋江分类体系
 */
export interface GenreOption {
  readonly group: string
  readonly groupKey?: string
  readonly value: string
  readonly label: string
  readonly labelKey?: string
}

export const GENRE_OPTIONS: readonly GenreOption[] = [
  // 玄幻
  { group: '玄幻', value: 'xuanhuan',       label: '玄幻',       labelKey: 'metadata:genre.xuanhuan' },
  { group: '玄幻', value: 'dongfang',       label: '东方玄幻',   labelKey: 'metadata:genre.dongfang' },
  { group: '玄幻', value: 'yishi',          label: '异世大陆',   labelKey: 'metadata:genre.yishi' },
  { group: '玄幻', value: 'wangchao',       label: '王朝争霸',   labelKey: 'metadata:genre.wangchao' },
  { group: '玄幻', value: 'gaowu',          label: '高武世界',   labelKey: 'metadata:genre.gaowu' },
  // 仙侠
  { group: '仙侠', value: 'xianxia',        label: '仙侠',       labelKey: 'metadata:genre.xianxia' },
  { group: '仙侠', value: 'xiuzhen',        label: '修真文明',   labelKey: 'metadata:genre.xiuzhen' },
  { group: '仙侠', value: 'huanxiu',        label: '幻想修仙',   labelKey: 'metadata:genre.huanxiu' },
  { group: '仙侠', value: 'gudian',         label: '古典仙侠',   labelKey: 'metadata:genre.gudian' },
  // 武侠
  { group: '武侠', value: 'wuxia',          label: '武侠',       labelKey: 'metadata:genre.wuxia' },
  { group: '武侠', value: 'chuantong',      label: '传统武侠',   labelKey: 'metadata:genre.chuantong' },
  { group: '武侠', value: 'xiandaiwu',      label: '现代武侠',   labelKey: 'metadata:genre.xiandaiwu' },
  // 科幻
  { group: '科幻', value: 'kehuan',         label: '科幻',       labelKey: 'metadata:genre.kehuan' },
  { group: '科幻', value: 'xingji',         label: '星际战争',   labelKey: 'metadata:genre.xingji' },
  { group: '科幻', value: 'weilai',         label: '未来世界',   labelKey: 'metadata:genre.weilai' },
  { group: '科幻', value: 'shikong',        label: '时空穿梭',   labelKey: 'metadata:genre.shikong' },
  { group: '科幻', value: 'chaoji',         label: '超级科技',   labelKey: 'metadata:genre.chaoji' },
  { group: '科幻', value: 'moshi',          label: '末世危机',   labelKey: 'metadata:genre.moshi' },
  // 奇幻
  { group: '奇幻', value: 'qihuan',         label: '奇幻',       labelKey: 'metadata:genre.qihuan' },
  { group: '奇幻', value: 'xifang',         label: '西方魔幻',   labelKey: 'metadata:genre.xifan' },
  { group: '奇幻', value: 'shishi',         label: '史诗奇幻',   labelKey: 'metadata:genre.shishi' },
  { group: '奇幻', value: 'heian',          label: '黑暗奇幻',   labelKey: 'metadata:genre.heian' },
  // 都市
  { group: '都市', value: 'dushi',          label: '都市',       labelKey: 'metadata:genre.dushi' },
  { group: '都市', value: 'dushenghuo',     label: '都市生活',   labelKey: 'metadata:genre.dushenghuo' },
  { group: '都市', value: 'duyineng',       label: '都市异能',   labelKey: 'metadata:genre.duyineng' },
  { group: '都市', value: 'yule',           label: '娱乐明星',   labelKey: 'metadata:genre.yule' },
  { group: '都市', value: 'shangzhan',      label: '商战职场',   labelKey: 'metadata:genre.shangzhan' },
  { group: '都市', value: 'yishu',          label: '异术超能',   labelKey: 'metadata:genre.yishu' },
  // 历史
  { group: '历史', value: 'lishi',          label: '历史',       labelKey: 'metadata:genre.lishi' },
  { group: '历史', value: 'jiakong',        label: '架空历史',   labelKey: 'metadata:genre.jiakong' },
  { group: '历史', value: 'zhuanji',        label: '历史传记',   labelKey: 'metadata:genre.zhuanji' },
  { group: '历史', value: 'songmingqing',   label: '两宋元明',   labelKey: 'metadata:genre.songmingqing' },
  { group: '历史', value: 'qinhan',         label: '秦汉三国',   labelKey: 'metadata:genre.qinhan' },
  // 游戏
  { group: '游戏', value: 'youxi',          label: '游戏',       labelKey: 'metadata:genre.youxi' },
  { group: '游戏', value: 'youxiyijie',     label: '游戏异界',   labelKey: 'metadata:genre.youxiyijie' },
  { group: '游戏', value: 'dianjing',       label: '电子竞技',   labelKey: 'metadata:genre.dianjing' },
  { group: '游戏', value: 'xuni',           label: '虚拟网游',   labelKey: 'metadata:genre.xuni' },
  // 轻小说
  { group: '轻小说', value: 'qingxiaoshuo', label: '轻小说',     labelKey: 'metadata:genre.qingxiaoshuo' },
  { group: '轻小说', value: 'riben',        label: '日系轻小说', labelKey: 'metadata:genre.riben' },
  { group: '轻小说', value: 'xueyuan',      label: '校园青春',   labelKey: 'metadata:genre.xueyuan' },
  // 其他
  { group: '其他', value: 'xuanyi',         label: '悬疑灵异',   labelKey: 'metadata:genre.xuanyi' },
  { group: '其他', value: 'zhentan',        label: '侦探推理',   labelKey: 'metadata:genre.zhentan' },
  { group: '其他', value: 'kongbu',         label: '恐怖惊悚',   labelKey: 'metadata:genre.kongbu' },
  { group: '其他', value: 'other',          label: '其他',       labelKey: 'metadata:genre.other' },
]

/** Chinese group name → metadata.json genreGroup key */
export const GENRE_GROUP_LABEL_KEYS: Record<string, string> = {
  '玄幻': 'genreGroup.xuanhuan',
  '仙侠': 'genreGroup.xianxia',
  '武侠': 'genreGroup.wuxia',
  '科幻': 'genreGroup.kehuan',
  '奇幻': 'genreGroup.qihuan',
  '都市': 'genreGroup.dushi',
  '历史': 'genreGroup.lishi',
  '游戏': 'genreGroup.youxi',
  '轻小说': 'genreGroup.qingxiaoshuo',
  '其他': 'genreGroup.other',
}

/** 旧的单选类型（保留兼容性） */
export type NovelGenre = string

/** 创作模式 */
export type CreativeMode = 'fantasy' | 'historical'

/** 项目 */
export interface Project {
  id?: number
  name: string
  /** 兼容旧数据的单选流派（保留此字段避免旧代码报错，值始终有效） */
  genre: string
  /** 多选流派标签 */
  genres: string[]
  /** 用户在 GENRE_OPTIONS 之外自定义的流派标签（v3 §2.2，多选时显示在最末） */
  customGenre?: string
  /** 写作状态 */
  status: ProjectStatus
  description: string
  targetWordCount: number  // 目标字数
  /** 当前已写字数（v3 §2.2 状态栏，由 chapter 字数累加得到） */
  currentWordCount?: number
  /** 封面图（base64 或 object URL） */
  coverImage?: string

  // ── Phase E 新字段 ──
  /** 写作风格预设 ID */
  writingStyleId?: string
  /** 创作方法论 ID */
  methodologyId?: string

  // ── PHASE-H4 新字段 ──
  /** 创作模式：fantasy=玄幻/幻想模式，historical=历史/考证模式 */
  creativeMode?: CreativeMode

  // ── Phase 25.4 多世界 ──
  /** 是否启用多世界模式（默认 false） */
  enableMultiWorld?: boolean

  /** Phase 34：把作者确认的正文修炼进度注入后续 AI 写作；默认关闭。 */
  includeCultivationProgressInAI?: boolean

  /** STORY-1：作者明确设为后续 AI 参考的角色驱动方案；不自动猜最近方案。 */
  activeCharacterDrivenPlanId?: number | null

  createdAt: number        // timestamp
  updatedAt: number        // timestamp
}

/** 创建项目入参 */
export type CreateProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt'>

/** 将旧数据迁移：确保 genres[]、status、genre 字段始终有效 */
export function migrateGenre(p: Project): Project {
  const genres = p.genres && p.genres.length > 0
    ? p.genres
    : p.genre ? [p.genre] : ['other']
  const genre = p.genre || (genres[0] ?? 'other')
  return { ...p, genre, genres, status: p.status ?? 'drafting' }
}
