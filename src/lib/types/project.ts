/** 写作状态 */
export type ProjectStatus = 'drafting' | 'ongoing' | 'paused' | 'completed'

/**
 * 流派标签（多选字符串，取代旧的单选 NovelGenre 枚举）
 * 参考起点、纵横、晋江分类体系
 * labelKey/groupKey: i18n keys for UI display (resolved at render time; label/group remain as data keys)
 */
export const GENRE_OPTIONS = [
  // 玄幻
  { group: '玄幻', groupKey: 'genreGroups.xuanhuan', value: 'xuanhuan',       label: '玄幻', labelKey: 'genreOptions.xuanhuan' },
  { group: '玄幻', groupKey: 'genreGroups.xuanhuan', value: 'dongfang',       label: '东方玄幻', labelKey: 'genreOptions.dongfang' },
  { group: '玄幻', groupKey: 'genreGroups.xuanhuan', value: 'yishi',          label: '异世大陆', labelKey: 'genreOptions.yishi' },
  { group: '玄幻', groupKey: 'genreGroups.xuanhuan', value: 'wangchao',       label: '王朝争霸', labelKey: 'genreOptions.wangchao' },
  { group: '玄幻', groupKey: 'genreGroups.xuanhuan', value: 'gaowu',          label: '高武世界', labelKey: 'genreOptions.gaowu' },
  // 仙侠
  { group: '仙侠', groupKey: 'genreGroups.xianxia', value: 'xianxia',        label: '仙侠', labelKey: 'genreOptions.xianxia' },
  { group: '仙侠', groupKey: 'genreGroups.xianxia', value: 'xiuzhen',        label: '修真文明', labelKey: 'genreOptions.xiuzhen' },
  { group: '仙侠', groupKey: 'genreGroups.xianxia', value: 'huanxiu',        label: '幻想修仙', labelKey: 'genreOptions.huanxiu' },
  { group: '仙侠', groupKey: 'genreGroups.xianxia', value: 'gudian',         label: '古典仙侠', labelKey: 'genreOptions.gudian' },
  // 武侠
  { group: '武侠', groupKey: 'genreGroups.wuxia', value: 'wuxia',          label: '武侠', labelKey: 'genreOptions.wuxia' },
  { group: '武侠', groupKey: 'genreGroups.wuxia', value: 'chuantong',      label: '传统武侠', labelKey: 'genreOptions.chuantong' },
  { group: '武侠', groupKey: 'genreGroups.wuxia', value: 'xiandaiwu',      label: '现代武侠', labelKey: 'genreOptions.xiandaiwu' },
  // 科幻
  { group: '科幻', groupKey: 'genreGroups.kehuan', value: 'kehuan',         label: '科幻', labelKey: 'genreOptions.kehuan' },
  { group: '科幻', groupKey: 'genreGroups.kehuan', value: 'xingji',         label: '星际战争', labelKey: 'genreOptions.xingji' },
  { group: '科幻', groupKey: 'genreGroups.kehuan', value: 'weilai',         label: '未来世界', labelKey: 'genreOptions.weilai' },
  { group: '科幻', groupKey: 'genreGroups.kehuan', value: 'shikong',        label: '时空穿梭', labelKey: 'genreOptions.shikong' },
  { group: '科幻', groupKey: 'genreGroups.kehuan', value: 'chaoji',         label: '超级科技', labelKey: 'genreOptions.chaoji' },
  { group: '科幻', groupKey: 'genreGroups.kehuan', value: 'moshi',          label: '末世危机', labelKey: 'genreOptions.moshi' },
  // 奇幻
  { group: '奇幻', groupKey: 'genreGroups.qihuan', value: 'qihuan',         label: '奇幻', labelKey: 'genreOptions.qihuan' },
  { group: '奇幻', groupKey: 'genreGroups.qihuan', value: 'xifang',         label: '西方魔幻', labelKey: 'genreOptions.xifang' },
  { group: '奇幻', groupKey: 'genreGroups.qihuan', value: 'shishi',         label: '史诗奇幻', labelKey: 'genreOptions.shishi' },
  { group: '奇幻', groupKey: 'genreGroups.qihuan', value: 'heian',          label: '黑暗奇幻', labelKey: 'genreOptions.heian' },
  // 都市
  { group: '都市', groupKey: 'genreGroups.dushi', value: 'dushi',          label: '都市', labelKey: 'genreOptions.dushi' },
  { group: '都市', groupKey: 'genreGroups.dushi', value: 'dushenghuo',     label: '都市生活', labelKey: 'genreOptions.dushenghuo' },
  { group: '都市', groupKey: 'genreGroups.dushi', value: 'duyineng',       label: '都市异能', labelKey: 'genreOptions.duyineng' },
  { group: '都市', groupKey: 'genreGroups.dushi', value: 'yule',           label: '娱乐明星', labelKey: 'genreOptions.yule' },
  { group: '都市', groupKey: 'genreGroups.dushi', value: 'shangzhan',      label: '商战职场', labelKey: 'genreOptions.shangzhan' },
  { group: '都市', groupKey: 'genreGroups.dushi', value: 'yishu',          label: '异术超能', labelKey: 'genreOptions.yishu' },
  // 历史
  { group: '历史', groupKey: 'genreGroups.lishi', value: 'lishi',          label: '历史', labelKey: 'genreOptions.lishi' },
  { group: '历史', groupKey: 'genreGroups.lishi', value: 'jiakong',        label: '架空历史', labelKey: 'genreOptions.jiakong' },
  { group: '历史', groupKey: 'genreGroups.lishi', value: 'zhuanji',        label: '历史传记', labelKey: 'genreOptions.zhuanji' },
  { group: '历史', groupKey: 'genreGroups.lishi', value: 'songmingqing',   label: '两宋元明', labelKey: 'genreOptions.songmingqing' },
  { group: '历史', groupKey: 'genreGroups.lishi', value: 'qinhan',         label: '秦汉三国', labelKey: 'genreOptions.qinhan' },
  // 游戏
  { group: '游戏', groupKey: 'genreGroups.youxi', value: 'youxi',          label: '游戏', labelKey: 'genreOptions.youxi' },
  { group: '游戏', groupKey: 'genreGroups.youxi', value: 'youxiyijie',     label: '游戏异界', labelKey: 'genreOptions.youxiyijie' },
  { group: '游戏', groupKey: 'genreGroups.youxi', value: 'dianjing',       label: '电子竞技', labelKey: 'genreOptions.dianjing' },
  { group: '游戏', groupKey: 'genreGroups.youxi', value: 'xuni',           label: '虚拟网游', labelKey: 'genreOptions.xuni' },
  // 轻小说
  { group: '轻小说', groupKey: 'genreGroups.qingxiaoshuo', value: 'qingxiaoshuo', label: '轻小说', labelKey: 'genreOptions.qingxiaoshuo' },
  { group: '轻小说', groupKey: 'genreGroups.qingxiaoshuo', value: 'riben',        label: '日系轻小说', labelKey: 'genreOptions.riben' },
  { group: '轻小说', groupKey: 'genreGroups.qingxiaoshuo', value: 'xueyuan',      label: '校园青春', labelKey: 'genreOptions.xueyuan' },
  // 其他
  { group: '其他', groupKey: 'genreGroups.other', value: 'xuanyi',         label: '悬疑灵异', labelKey: 'genreOptions.xuanyi' },
  { group: '其他', groupKey: 'genreGroups.other', value: 'zhentan',        label: '侦探推理', labelKey: 'genreOptions.zhentan' },
  { group: '其他', groupKey: 'genreGroups.other', value: 'kongbu',         label: '恐怖惊悚', labelKey: 'genreOptions.kongbu' },
  { group: '其他', groupKey: 'genreGroups.other', value: 'other',          label: '其他', labelKey: 'genreOptions.other' },
] as const

/** 旧的单选类型（保留兼容性） */
export type NovelGenre = string

/** 创作模式 */
export type CreativeMode = 'fantasy' | 'historical'

export type CommunityWorldLicense =
  | 'CC-BY-4.0'
  | 'CC-BY-SA-4.0'
  | 'CC-BY-NC-4.0'
  | 'ALL-RIGHTS-RESERVED'

export interface CommunityWorldOrigin {
  packageId: string
  sourceWorldCode: string
  sourceWorldVersion: number
  authorName: string
  license: CommunityWorldLicense
  importedAt: number
}

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

  /** 世界引擎公开编号。旧项目缺失时由项目 store 生成并持久化。 */
  worldCode?: string
  /** 世界引擎当前发布版本，首版为 1。 */
  worldVersion?: number
  /** PLATFORM-1：从社区世界包导入时保留来源，本地副本仍分配自己的 worldCode。 */
  communityOrigin?: CommunityWorldOrigin

  /** Phase 34：把作者确认的正文修炼进度注入后续 AI 写作；默认关闭。 */
  includeCultivationProgressInAI?: boolean

  /** STORY-1：作者明确设为后续 AI 参考的角色驱动方案；不自动猜最近方案。 */
  activeCharacterDrivenPlanId?: number | null

  /**
   * WS-2：AI 生成内容的目标语言（可选）。
   * 新项目创建时显式写入当前 UI 语言；旧项目保持 undefined，
   * 由 resolveProjectContentLanguage() 在调用时回退到当前 UI 语言。
   * 不做回填、不做迁移、不加 Dexie 版本（非索引可选字段，v44 先例）。
   */
  contentLanguage?: 'pt-BR' | 'en' | 'zh-CN'

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
