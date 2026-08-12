/**
 * 系统种子显示层 i18n 解析(Gate 5 · B2/S1)。
 *
 * 系统提示词模板(CORE_PROMPT_SEEDS)与系统工作流(SYSTEM_WORKFLOW_SEEDS)把中文
 * 字面量作为 name/description 持久化进 IndexedDB——这是 seed 契约的一部分:
 * stores/prompt.ts 与 stores/workflow.ts 用 name 作系统种子刷新的唯一键,克隆也
 * 从 name 派生默认名,因此 DB 层必须保留原文。翻译只在 UI 显示层经 settings ns 的
 * promptTemplates.* / workflowSeeds.* 键解析;用户自建条目与未登记的种子保留原文。
 *
 * 标识符选择:id 为自增主键,不是种子标识;moduleKey 在题材包种子间共享
 * (chapter.content / outline.volume 有多套)。两个 store 的刷新逻辑均以 `name`
 * 为系统种子唯一键,故静态映射以种子名为键。
 *
 * 键基座对应 settings.json 的 promptTemplates.<id> / workflowSeeds.<id>,三语言
 * (zh-CN/pt-BR/en)键存在性已由登记时的键表核对保证;取值时以原文作 defaultValue,
 * 键缺失自动回退原文。
 */
import type { DomainTFunction } from '../../i18n'

/**
 * 系统提示词种子名 → settings ns 键基座。
 *
 * 覆盖 CORE_PROMPT_SEEDS(prompt-seeds-core.ts)、TOOL_PROMPT_SEEDS(prompt-seeds-tools.ts)、
 * GENRE_PACK_SEEDS(prompt-seeds-genre-packs.ts / -extended.ts)与
 * NOVEL_CONTENT_PROMPT_SEEDS(prompt-seeds-novel.ts)。题材包种子以
 * GENRE_PACKS 的包 id 作键前缀(xianxia/yanqing/lishi…);小说创作内容种子以
 * novel + 阶段编号/题材代号作键前缀(novelP00A…/novelMysteryA…),仅登记显示层,
 * AI payload(systemPrompt/userPromptTemplate)保持中文原文。注意:『历史包-章节正文』
 * 在基础包与扩展包中同名,刷新时扩展包后写生效,故仅登记一条、描述取扩展包版本。
 */
export const SYSTEM_PROMPT_SEED_I18N_BASE: Readonly<Record<string, string>> = {
  // ── core(prompt-seeds-core.ts)──
  '内置-世界观维度生成': 'promptTemplates.worldviewDimension',
  '内置-角色完整设计': 'promptTemplates.characterGenerate',
  '内置-角色维度补全': 'promptTemplates.characterDimension',
  '内置-卷级大纲生成': 'promptTemplates.outlineVolume',
  '内置-章节大纲展开': 'promptTemplates.outlineChapter',
  '内置-长篇连载（默认）': 'promptTemplates.chapterContent',
  '内置-章节续写': 'promptTemplates.chapterContinue',
  '内置-章节连续性记忆': 'promptTemplates.chapterMemory',
  '内置-文本润色': 'promptTemplates.chapterPolish',
  '内置-文本扩写': 'promptTemplates.chapterExpand',
  '内置-去 AI 味改写': 'promptTemplates.chapterDeAi',
  '内置-伏笔建议': 'promptTemplates.foreshadowGenerate',
  '内置-角色关系提取': 'promptTemplates.relationExtract',
  '内置-概念地图 SVG': 'promptTemplates.geographyConceptMap',
  '内置-地图图像 Prompt': 'promptTemplates.geographyImageMapPrompt',
  '内置-故事核心生成': 'promptTemplates.storyGenerate',
  '内置-创作规则生成': 'promptTemplates.rulesGenerate',
  // ── tools(prompt-seeds-tools.ts)──
  '内置-角色文档解析': 'promptTemplates.importParseCharacter',
  '内置-世界观文档解析': 'promptTemplates.importParseWorldview',
  '内置-大纲文档解析': 'promptTemplates.importParseOutline',
  '内置-智能统一解析': 'promptTemplates.importParseAll',
  '内置-分块解析（大文档流水线）': 'promptTemplates.importParseChunk',
  '内置-角色跨块合并': 'promptTemplates.importMergeCharacters',
  '内置-细纲场景生成': 'promptTemplates.detailScene',
  '内置-角色驱动剧情': 'promptTemplates.plotCharacterDriven',
  '内置-角色变更影响分析': 'promptTemplates.plotCharacterRevision',
  '内置-灵感反推': 'promptTemplates.inspirationReverse',
  '内置-多世界灵感反推': 'promptTemplates.inspirationReverseMultiworld',
  '内置-AI建议世界': 'promptTemplates.worldGroupSuggest',
  '内置-AI扩写世界': 'promptTemplates.worldGroupExpand',
  '内置-词条拆分提取': 'promptTemplates.codexExtract',
  '内置-重要地点提取': 'promptTemplates.locationExtract',
  '内置-物品栏提取': 'promptTemplates.inventoryExtract',
  '内置-故事年表提取': 'promptTemplates.storyTimelineExtract',
  '内置-场景考证': 'promptTemplates.sceneVerify',
  '内置-文风学习': 'promptTemplates.styleLearn',
  '内置-文风互动校准': 'promptTemplates.styleCalibrate',
  '内置-历史考据 agent': 'promptTemplates.historyConsult',
  '内置-头脑风暴 agent': 'promptTemplates.historyStorm',
  // ── genre packs(prompt-seeds-genre-packs.ts / -extended.ts)──
  '仙侠包-章节正文': 'promptTemplates.xianxiaChapterContent',
  '仙侠包-卷级大纲': 'promptTemplates.xianxiaVolumeOutline',
  '仙侠包-角色设计': 'promptTemplates.xianxiaCharacterDesign',
  '仙侠包-故事核心': 'promptTemplates.xianxiaStoryCore',
  '仙侠包-世界观维度': 'promptTemplates.xianxiaWorldviewDimension',
  '仙侠包-章节续写': 'promptTemplates.xianxiaChapterContinue',
  '言情包-章节正文': 'promptTemplates.yanqingChapterContent',
  '言情包-卷级大纲': 'promptTemplates.yanqingVolumeOutline',
  '言情包-角色设计': 'promptTemplates.yanqingCharacterDesign',
  '言情包-故事核心': 'promptTemplates.yanqingStoryCore',
  '言情包-世界观维度': 'promptTemplates.yanqingWorldviewDimension',
  '言情包-章节续写': 'promptTemplates.yanqingChapterContinue',
  '现实主义包-章节正文': 'promptTemplates.realismChapterContent',
  '现实主义包-卷级大纲': 'promptTemplates.realismVolumeOutline',
  '现实主义包-角色设计': 'promptTemplates.realismCharacterDesign',
  '现实主义包-故事核心': 'promptTemplates.realismStoryCore',
  '现实主义包-世界观维度': 'promptTemplates.realismWorldviewDimension',
  '现实主义包-章节续写': 'promptTemplates.realismChapterContinue',
  '悬疑推理包-章节正文': 'promptTemplates.suspenseChapterContent',
  '悬疑推理包-卷级大纲': 'promptTemplates.suspenseVolumeOutline',
  '悬疑推理包-角色设计': 'promptTemplates.suspenseCharacterDesign',
  '悬疑推理包-故事核心': 'promptTemplates.suspenseStoryCore',
  '悬疑推理包-世界观维度': 'promptTemplates.suspenseWorldviewDimension',
  '悬疑推理包-伏笔建议': 'promptTemplates.suspenseForeshadow',
  '悬疑推理包-章节续写': 'promptTemplates.suspenseChapterContinue',
  '历史包-章节正文': 'promptTemplates.lishiChapterContent',
  '历史包-卷级大纲': 'promptTemplates.lishiVolumeOutline',
  '历史包-角色设计': 'promptTemplates.lishiCharacterDesign',
  '历史包-故事核心': 'promptTemplates.lishiStoryCore',
  '历史包-世界观维度': 'promptTemplates.lishiWorldviewDimension',
  '历史包-章节续写': 'promptTemplates.lishiChapterContinue',
  '历史包-卷大纲': 'promptTemplates.lishiVolumeOutlineExt',
  '玄幻包-章节正文': 'promptTemplates.xuanhuanChapterContent',
  '玄幻包-卷级大纲': 'promptTemplates.xuanhuanVolumeOutline',
  '武侠包-章节正文': 'promptTemplates.wuxiaChapterContent',
  '都市包-章节正文': 'promptTemplates.dushiChapterContent',
  '科幻包-章节正文': 'promptTemplates.scifiChapterContent',
  '末世包-章节正文': 'promptTemplates.moshiChapterContent',
  '穿越包-章节正文': 'promptTemplates.chuanyueChapterContent',
  '重生包-章节正文': 'promptTemplates.chongshengChapterContent',
  '系统流包-章节正文': 'promptTemplates.xitongChapterContent',
  '无限流包-章节正文': 'promptTemplates.wuxianChapterContent',
  '赛博朋克包-章节正文': 'promptTemplates.cyberpunkChapterContent',
  '克苏鲁包-章节正文': 'promptTemplates.cthulhuChapterContent',
  '种田包-章节正文': 'promptTemplates.zhongtianChapterContent',
  '争霸包-章节正文': 'promptTemplates.zhengbaChapterContent',
  '西幻包-章节正文': 'promptTemplates.xifanChapterContent',
  '游戏包-章节正文': 'promptTemplates.youxiChapterContent',
  // ── novel(prompt-seeds-novel.ts)──
  '小说内容-P00-A-小说立项：创作任务简报与缺口诊断': 'promptTemplates.novelP00AProjectBrief',
  '小说内容-P01-A-灵感阶段：混杂素材净化与原创灵感卡': 'promptTemplates.novelP01AInspirationCards',
  '小说内容-P02-A-定位阶段：题材、读者承诺与差异化': 'promptTemplates.novelP02APositioning',
  '小说内容-P03-A-故事核心：概念筛选与前提压力测试': 'promptTemplates.novelP03AConceptSelection',
  '小说内容-P04-A-研究问题树与最小考证计划': 'promptTemplates.novelP04AResearchPlan',
  '小说内容-P04-B-来源冲突与事实边界裁决': 'promptTemplates.novelP04BSourceConflict',
  '小说内容-P04-C-事实转化为剧情条件': 'promptTemplates.novelP04CFactsToPlot',
  '小说内容-P05-A-叙事最小世界规格': 'promptTemplates.novelP05AMinimalWorld',
  '小说内容-P05-B-地理—资源—社会—冲突因果链': 'promptTemplates.novelP05BGeographyCausalChain',
  '小说内容-P05-C-文化与日常生活纹理': 'promptTemplates.novelP05CCultureTexture',
  '小说内容-P05-D-世界观矛盾与漏洞审计': 'promptTemplates.novelP05DWorldviewAudit',
  '小说内容-P06-A-核心人物压力模型': 'promptTemplates.novelP06ACharacterPressure',
  '小说内容-P06-B-对抗力量与反派正当性': 'promptTemplates.novelP06BAntagonist',
  '小说内容-P06-C-配角网络与关系动力': 'promptTemplates.novelP06CSupportingNetwork',
  '小说内容-P06-D-人物弧与阶段状态': 'promptTemplates.novelP06DCharacterArc',
  '小说内容-P07-A-目标—动机—冲突发动机': 'promptTemplates.novelP07APlotEngine',
  '小说内容-P07-B-升级阶梯与尝试—失败循环': 'promptTemplates.novelP07BEscalationLadder',
  '小说内容-P07-C-信息释放与悬念管理': 'promptTemplates.novelP07CInfoRelease',
  '小说内容-P07-D-复线编织与碰撞': 'promptTemplates.novelP07DSubplotWeave',
  '小说内容-P08-A-结构阶段：结构模型选择与全书转折': 'promptTemplates.novelP08AStructureModel',
  '小说内容-P09L-A-全书阶段与卷级架构': 'promptTemplates.novelP09LAVolumeArchitecture',
  '小说内容-P09L-B-卷级承诺—兑现账本': 'promptTemplates.novelP09LBPromiseLedger',
  '小说内容-P09L-C-长篇中段疲软诊断与重构': 'promptTemplates.novelP09LCMidsectionDiagnose',
  '小说内容-P09L-D-高潮阶梯与结局汇流': 'promptTemplates.novelP09LDClimaxLadder',
  '小说内容-P09S-A-短篇核心变化设计': 'promptTemplates.novelP09SACoreChange',
  '小说内容-P09S-B-短篇压缩与人物合并': 'promptTemplates.novelP09SBCompression',
  '小说内容-P09S-C-开场进入点与叙事范围': 'promptTemplates.novelP09SCOpening',
  '小说内容-P09S-D-短篇结尾与余震': 'promptTemplates.novelP09SDEnding',
  '小说内容-P09R-A-阶段阅读回报规划': 'promptTemplates.novelP09RASerialPayoff',
  '小说内容-P09R-B-章节断点设计': 'promptTemplates.novelP09RBChapterBreaks',
  '小说内容-P09R-C-连载生产缓冲与卷级排期': 'promptTemplates.novelP09RCSerialSchedule',
  '小说内容-P09R-D-读者反馈去噪': 'promptTemplates.novelP09RDFeedbackDenoise',
  '小说内容-P10-A-章节任务单': 'promptTemplates.novelP10AChapterTask',
  '小说内容-P10-B-场景卡与变化证明': 'promptTemplates.novelP10BSceneCard',
  '小说内容-P10-C-场景—反应—决定节奏选择': 'promptTemplates.novelP10CSceneSequel',
  '小说内容-P10-D-章节情绪节拍': 'promptTemplates.novelP10DEmotionBeats',
  '小说内容-P10-E-章节标题生成与筛选': 'promptTemplates.novelP10EChapterTitle',
  '小说内容-P11-A-首章草稿': 'promptTemplates.novelP11AFirstChapter',
  '小说内容-P11-B-按章场任务写正文': 'promptTemplates.novelP11BTaskDrafting',
  '小说内容-P11-C-连续续写': 'promptTemplates.novelP11CContinuousDraft',
  '小说内容-P11-D-对白与潜台词': 'promptTemplates.novelP11DDialogue',
  '小说内容-P11-E-动作与空间连续性': 'promptTemplates.novelP11EActionSpace',
  '小说内容-P11-F-描述、内心与转场配比': 'promptTemplates.novelP11FProseBalance',
  '小说内容-P12-A-章节记忆与结尾交接': 'promptTemplates.novelP12AChapterMemory',
  '小说内容-P12-B-人物与关系状态差分': 'promptTemplates.novelP12BCharacterStateDiff',
  '小说内容-P12-C-时间线、地点与物品账本': 'promptTemplates.novelP12CContinuityLedger',
  '小说内容-P12-D-伏笔生命周期更新': 'promptTemplates.novelP12DForeshadowLifecycle',
  '小说内容-P12-E-计划—正文对账': 'promptTemplates.novelP12EPlanReconcile',
  '小说内容-P12-F-跨章连续性审计': 'promptTemplates.novelP12FCrossChapterAudit',
  '小说内容-P13-A-全稿发展性诊断': 'promptTemplates.novelP13ADevelopmentalDiagnose',
  '小说内容-P13-B-因果链与情节漏洞审计': 'promptTemplates.novelP13BPlotHoleAudit',
  '小说内容-P13-C-人物弧漂移与角色功能重构': 'promptTemplates.novelP13CArcDrift',
  '小说内容-P13-D-删改移补修订路线图': 'promptTemplates.novelP13DRevisionRoadmap',
  '小说内容-P13-E-高潮与结局兑现审计': 'promptTemplates.novelP13EClimaxPayoffAudit',
  '小说内容-P14-A-场景级诊断与定向修订': 'promptTemplates.novelP14ASceneRevision',
  '小说内容-P14-B-对白去说明化与潜台词修订': 'promptTemplates.novelP14BDialogueRevision',
  '小说内容-P14-C-视角、叙事距离与知识边界': 'promptTemplates.novelP14CPovDistance',
  '小说内容-P14-D-节奏、句群与信息密度': 'promptTemplates.novelP14DPacingDensity',
  '小说内容-P14-E-展示、概述、解释与省略平衡': 'promptTemplates.novelP14EShowTellBalance',
  '小说内容-P14-F-保真润色、扩写与压缩': 'promptTemplates.novelP14FFaithfulPolish',
  '小说内容-P15-A-首章盲读轨迹': 'promptTemplates.novelP15ABlindRead',
  '小说内容-P15-B-体裁期待—兑现测试': 'promptTemplates.novelP15BGenrePromiseTest',
  '小说内容-P15-C-多视角贝塔读者模拟': 'promptTemplates.novelP15CBetaSimulation',
  '小说内容-P15-D-悬念与问题链体验': 'promptTemplates.novelP15DSuspenseExperience',
  '小说内容-P15-E-修改后 A/B 体验对比': 'promptTemplates.novelP15EAbComparison',
  '小说内容-P16-A-书名发散与筛选': 'promptTemplates.novelP16ATitleBrainstorm',
  '小说内容-P16-B-无剧透作品简介': 'promptTemplates.novelP16BSpoilerFreeBlurb',
  '小说内容-P16-C-完整剧情梗概': 'promptTemplates.novelP16CFullSynopsis',
  '小说内容-P16-D-标签、关键词与内容提示': 'promptTemplates.novelP16DTagsKeywords',
  '小说内容-P16-E-投稿说明/查询信素材': 'promptTemplates.novelP16EQueryLetter',
  '小说内容-P17-A-Prompt 运行复盘与差异归因': 'promptTemplates.novelP17ARunReview',
  '小说内容-P17-B-Prompt 版本 A/B 评测设计': 'promptTemplates.novelP17BAbEvaluation',
  '小说内容-P17-C-小说阶段 Prompt 生成器': 'promptTemplates.novelP17CPromptGenerator',
  '小说内容-P17-D-全库语义查重与合并决策': 'promptTemplates.novelP17DLibraryDedup',
  '小说内容-P17-E-发布前资产验收': 'promptTemplates.novelP17EReleaseAcceptance',
  '小说内容-G-MYSTERY-A-从谜底反推完整事实': 'promptTemplates.novelMysteryAReverseSolution',
  '小说内容-G-MYSTERY-B-公平线索矩阵': 'promptTemplates.novelMysteryBClueMatrix',
  '小说内容-G-MYSTERY-C-嫌疑人与红鲱鱼': 'promptTemplates.novelMysteryCSuspects',
  '小说内容-G-MYSTERY-D-调查节拍与揭示顺序': 'promptTemplates.novelMysteryDInvestigationBeats',
  '小说内容-G-MYSTERY-E-推理公平性审计': 'promptTemplates.novelMysteryEFairnessAudit',
  '小说内容-G-HISTORY-A-史实锚点与虚构空间': 'promptTemplates.novelHistoryAFactAnchors',
  '小说内容-G-HISTORY-B-时代生活与身份知识边界': 'promptTemplates.novelHistoryBEraKnowledge',
  '小说内容-G-HISTORY-C-历史人物与虚构人物共场': 'promptTemplates.novelHistoryCMixedCast',
  '小说内容-G-HISTORY-D-时代错置与现代价值投射审计': 'promptTemplates.novelHistoryDAnachronismAudit',
  '小说内容-G-COMEDY-A-喜剧发动机': 'promptTemplates.novelComedyAEngine',
  '小说内容-G-COMEDY-B-误会喜剧的公平信息': 'promptTemplates.novelComedyBFairMisunderstanding',
  '小说内容-G-COMEDY-C-喜剧节奏与回调': 'promptTemplates.novelComedyCTimingCallbacks',
  '小说内容-G-COMEDY-D-喜剧边界与人物尊严审计': 'promptTemplates.novelComedyDDignityAudit',
  '小说内容-G-FANTASY-A-魔法/超自然规则与叙事边界': 'promptTemplates.novelFantasyAMagicRules',
  '小说内容-G-FANTASY-B-神话、宗教与仪式的社会功能': 'promptTemplates.novelFantasyBMythFunction',
  '小说内容-G-FANTASY-C-奇观场景与因果功能': 'promptTemplates.novelFantasyCSpectacle',
  '小说内容-G-FANTASY-D-魔法漏洞与万能解法审计': 'promptTemplates.novelFantasyDMagicLoopholes',
  '小说内容-G-HORROR-A-恐怖来源与边界': 'promptTemplates.novelHorrorAFearSource',
  '小说内容-G-HORROR-B-威胁显露与升级': 'promptTemplates.novelHorrorBThreatReveal',
  '小说内容-G-HORROR-C-恐怖场景的主观感知': 'promptTemplates.novelHorrorCSubjectivePerception',
  '小说内容-G-HORROR-D-揭示程度与结尾余悸': 'promptTemplates.novelHorrorDRevealAftermath',
  '小说内容-G-PROGRESSION-A-成长系统与边界': 'promptTemplates.novelProgressionAGrowthSystem',
  '小说内容-G-PROGRESSION-B-资源经济与稀缺性': 'promptTemplates.novelProgressionBResourceEconomy',
  '小说内容-G-PROGRESSION-C-挑战阶梯与能力证明': 'promptTemplates.novelProgressionCChallengeLadder',
  '小说内容-G-PROGRESSION-D-训练、突破与奖励节拍': 'promptTemplates.novelProgressionDTrainingBeats',
  '小说内容-G-PROGRESSION-E-升级通胀与后期失控审计': 'promptTemplates.novelProgressionEPowerInflation',
  '小说内容-G-ROMANCE-A-双主角关系发动机': 'promptTemplates.novelRomanceARelationshipEngine',
  '小说内容-G-ROMANCE-B-关系节拍与新平衡': 'promptTemplates.novelRomanceBRelationshipBeats',
  '小说内容-G-ROMANCE-C-可信阻力与冲突修复': 'promptTemplates.novelRomanceCConflictRepair',
  '小说内容-G-ROMANCE-D-亲密场景的同意、脆弱与后果': 'promptTemplates.novelRomanceDIntimacy',
  '小说内容-G-ROMANCE-E-关系高潮与乐观结局兑现': 'promptTemplates.novelRomanceEHappilyEverAfter',
  '小说内容-G-LITERARY-A-日常处境中的结构压力': 'promptTemplates.novelLiteraryAStructuralPressure',
  '小说内容-G-LITERARY-B-弱情节/内在变化结构': 'promptTemplates.novelLiteraryBPlotlessStructure',
  '小说内容-G-LITERARY-C-细节选择与避免苦难消费': 'promptTemplates.novelLiteraryCDetailSelection',
  '小说内容-G-LITERARY-D-开放结局与主题余义': 'promptTemplates.novelLiteraryDOpenEnding',
  '小说内容-G-SCIFI-A-核心新设定与最小改变': 'promptTemplates.novelScifiACoreNovum',
  '小说内容-G-SCIFI-B-技术—制度—日常连锁推演': 'promptTemplates.novelScifiBCascadeExtrapolation',
  '小说内容-G-SCIFI-C-科学可信度与不确定性审计': 'promptTemplates.novelScifiCPlausibilityAudit',
  '小说内容-G-SCIFI-D-技术问题转化为人物冲突': 'promptTemplates.novelScifiDTechToConflict',
  '小说内容-G-ENSEMBLE-A-群像中心与角色权重': 'promptTemplates.novelEnsembleAWeighting',
  '小说内容-G-ENSEMBLE-B-多视角分配与切换': 'promptTemplates.novelEnsembleBPovAllocation',
  '小说内容-G-ENSEMBLE-C-信息拼图与视角偏差': 'promptTemplates.novelEnsembleCInfoPuzzle',
  '小说内容-G-ENSEMBLE-D-群像汇流与离场审计': 'promptTemplates.novelEnsembleDConvergence',
}

/** SYSTEM_WORKFLOW_SEEDS(workflow-seeds.ts)种子名 → settings ns 键基座 */
export const SYSTEM_WORKFLOW_SEED_I18N_BASE: Readonly<Record<string, string>> = {
  '极速起书 · 通用': 'workflowSeeds.fastStart',
  '单章深度生成': 'workflowSeeds.deepChapter',
  '伏笔体系搭建': 'workflowSeeds.foreshadowSystem',
}

/**
 * P1-5:模块键派生标签键的形态归一。
 *
 * 运行时 moduleKey 使用 kebab 段('parse-character'、'import.parse-all'、
 * 'world-group' 等),而 settings.json 的 promptGroupLabels / promptSubLabels /
 * promptModuleKeys 一律登记 camelCase 键;直接拿原文拼 t() 会因键缺失而整段
 * 泄漏原始 key。本函数把 `-`/`.` 分隔的片段归一成 camelCase
 * ('parse-character' → 'parseCharacter','import.parse-all' → 'importParseAll'),
 * 只变换键形——camelCase 键仍缺失时由调用方按原文回退,不新增翻译。
 */
export function toCamelLabelKey(raw: string): string {
  return raw.replace(/[-.]+([a-zA-Z0-9])/g, (_, ch: string) => ch.toUpperCase())
}

export interface SeedDisplayInput {
  scope?: string
  name: string
  description?: string
}

export interface SeedDisplayOutput {
  name: string
  description: string | undefined
}

/**
 * 解析系统种子的显示名/描述(仅显示层,绝不写回 DB)。
 * - scope !== 'system':用户自建,原样返回;
 * - name 不在静态映射(题材包/工具类等未登记种子):原样返回;
 * - 命中:tSettings(`<基座>.name|.description`, 原文),原文作 defaultValue。
 */
export function resolveSystemSeedDisplay(
  tSettings: DomainTFunction,
  kind: 'prompt' | 'workflow',
  seed: SeedDisplayInput,
): SeedDisplayOutput {
  const fallback: SeedDisplayOutput = { name: seed.name, description: seed.description }
  if (seed.scope !== 'system') return fallback
  const base = (kind === 'prompt' ? SYSTEM_PROMPT_SEED_I18N_BASE : SYSTEM_WORKFLOW_SEED_I18N_BASE)[seed.name]
  if (!base) return fallback
  return {
    name: tSettings(`${base}.name`, seed.name),
    description: seed.description
      ? tSettings(`${base}.description`, seed.description)
      : seed.description,
  }
}
