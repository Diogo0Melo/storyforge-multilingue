import type { ChatMessage } from '../../types'
import type { SupportedLang } from '../../../i18n'
import { usePromptStore } from '../../../stores/prompt'
import { renderPrompt } from '../prompt-engine'
import { appendUserConstraint } from './prompt-guards'

export interface RunOptions {
  parameterValues?: Record<string, unknown>
  overrides?: { systemPrompt?: string; userPromptTemplate?: string }
}

/**
 * Phase 3 · 大纲标题示例解析（按项目内容语言）。
 *
 * 核心卷/章纲种子模板不再硬编码「第1卷/第2卷」「第1章/第2章」输出示例；
 * 改由 prompt 边界（本适配器）按项目 RESOLVED contentLanguage 注入对应语言
 * 的标题示例，避免 pt-BR/en 项目收到中文序数示例。未提供语言时回退到
 * 语言无关占位符（直接/单测调用方安全）。示例只影响 few-shot 文案；输出
 * 语言约束仍由 client gate 按 outputKind 注入，JSON 键名与解析器行为不变。
 */
export interface OutlineTitleExamples {
  /** 卷标题行内示例（不含外层引号） */
  volumeTitleExample: string
  /** 卷级大纲完整 JSON 示例数组（单行） */
  volumeOutputExample: string
  /** 章节标题行内示例（不含外层引号） */
  chapterTitleExample: string
  /** 章节大纲完整 JSON 示例数组（单行） */
  chapterOutputExample: string
}

const OUTLINE_TITLE_EXAMPLES: Record<SupportedLang, OutlineTitleExamples> = {
  'zh-CN': {
    volumeTitleExample: '第1卷：XXX',
    volumeOutputExample: '[{"title":"第1卷：起始之章","summary":"..."},{"title":"第2卷：风云再起","summary":"..."}]',
    chapterTitleExample: '第1章：XXX',
    chapterOutputExample: '[{"title":"第1章：初入江湖","summary":"..."},{"title":"第2章：暗潮涌动","summary":"..."}]',
  },
  'pt-BR': {
    volumeTitleExample: 'Volume 1: XXX',
    volumeOutputExample: '[{"title":"Volume 1: O Começo","summary":"..."},{"title":"Volume 2: A Tempestade","summary":"..."}]',
    chapterTitleExample: 'Capítulo 1: XXX',
    chapterOutputExample: '[{"title":"Capítulo 1: Primeiros Passos","summary":"..."},{"title":"Capítulo 2: Maré Alta","summary":"..."}]',
  },
  en: {
    volumeTitleExample: 'Volume 1: XXX',
    volumeOutputExample: '[{"title":"Volume 1: The Beginning","summary":"..."},{"title":"Volume 2: Rising Storm","summary":"..."}]',
    chapterTitleExample: 'Chapter 1: XXX',
    chapterOutputExample: '[{"title":"Chapter 1: Into the Fray","summary":"..."},{"title":"Chapter 2: Undercurrents","summary":"..."}]',
  },
}

/** 语言无关占位符：只演示 JSON 结构，不暗示任何语言的序数命名。 */
const NEUTRAL_OUTLINE_TITLE_EXAMPLES: OutlineTitleExamples = {
  volumeTitleExample: '...',
  volumeOutputExample: '[{"title":"...","summary":"..."},{"title":"...","summary":"..."}]',
  chapterTitleExample: '...',
  chapterOutputExample: '[{"title":"...","summary":"..."},{"title":"...","summary":"..."}]',
}

export function resolveOutlineTitleExamples(contentLanguage?: SupportedLang): OutlineTitleExamples {
  if (contentLanguage && contentLanguage in OUTLINE_TITLE_EXAMPLES) {
    return OUTLINE_TITLE_EXAMPLES[contentLanguage]
  }
  return NEUTRAL_OUTLINE_TITLE_EXAMPLES
}

export interface VolumeOutlineRequest {
  existingVolumesContext?: string
  existingVolumeCount?: number
  targetVolumeTitle?: string
}

/** 生成卷级大纲 */
export function buildVolumeOutlinePrompt(
  projectName: string,
  genre: string,
  worldContext: string,
  storyCoreContext: string,
  targetWordCount: number,
  userHint?: string,
  options?: RunOptions,
  characterContext?: string,
  /** Phase 32: 世界规则清单（替代旧 historicalContext + creativeMode） */
  worldRulesContext?: string,
  request?: VolumeOutlineRequest,
  /** Phase 3: 项目 RESOLVED 内容语言，用于注入对应语言的卷标题示例；缺省回退语言无关占位符 */
  contentLanguage?: SupportedLang,
): ChatMessage[] {
  const rawVolumeCount = options?.parameterValues?.volumeCount
  const explicitVolumeCount = Number(rawVolumeCount)
  const hasExplicitVolumeCount =
    !request?.targetVolumeTitle &&
    rawVolumeCount !== '' && rawVolumeCount != null &&
    Number.isFinite(explicitVolumeCount) && explicitVolumeCount > 0
  const existingVolumeCount = request?.existingVolumeCount ?? 0
  const normalizedOptions: RunOptions = {
    ...options,
    parameterValues: {
      ...(options?.parameterValues ?? {}),
      volumeCount: hasExplicitVolumeCount ? Math.floor(explicitVolumeCount) : '',
    },
  }
  const tpl = usePromptStore.getState().getActive('outline.volume')
  const examples = resolveOutlineTitleExamples(contentLanguage)
  const { messages } = renderPrompt(tpl, {
    projectName,
    genres: genre,
    targetWordCount,
    estimatedVolumes: hasExplicitVolumeCount ? Math.floor(explicitVolumeCount) : '由 AI 合理规划',
    worldContext: worldContext || '（暂无，请自由发挥）',
    storyCore: storyCoreContext || '（暂无，请自由发挥）',
    characterContext: characterContext || '',
    worldRulesContext: worldRulesContext || '',
    existingVolumesContext: request?.existingVolumesContext || '',
    existingVolumeCount,
    volumeTitleExample: examples.volumeTitleExample,
    volumeOutputExample: examples.volumeOutputExample,
    userHint,
  }, normalizedOptions)

  const constraints: string[] = ['【本次卷纲生成硬约束】']
  constraints.push(`【全局骨架先行】生成前先在内部对齐四条既有事实链：
1. 一句话主线：从「故事核心 / 主线」提炼主角身份、核心行动和驱动动机；每卷必须推进其中一个明确阶段。
2. 成长坐标：结合力量体系、世界规则和角色弧光，标明每卷结束时主角能力/认知/关系的实际变化，禁止无依据越级。
3. 角色进退场：只使用上文已创建角色安排核心作用、登场、转变或阶段性退场；新增角色必须服务主线，不能挤掉既有核心角色。
4. 伏笔收放：若上文含「伏笔状态」，安排已有伏笔的埋设/呼应/回收节奏，避免重复另造同义伏笔或长期只埋不收。
这四条只用于规划每卷 summary，不要额外输出骨架表，不得改变规定的 JSON 数组格式。`)
  // CF-3：故事主线/核心非空时，强制以主线为骨架，避免自动卷纲偏离用户已填主线。
  if (storyCoreContext.trim()) {
    constraints.push('【主线一致性·硬约束】必须严格以上文「故事核心 / 主线」为骨架展开：每一卷的 summary 都要明确说明它推进了主线的哪一阶段；禁止另起新主线、禁止与已填主线冲突，不得把故事核心当作可有可无的参考。')
  }
  if (request?.existingVolumesContext) {
    constraints.push(request.existingVolumesContext)
    constraints.push(request.targetVolumeTitle
      ? `除本次指定补全的空卷《${request.targetVolumeTitle}》外，禁止改写、复述或重新生成其他已有卷。`
      : '必须从已有卷之后继续规划；禁止改写、复述或重新生成已有卷。新卷剧情必须承接已有卷末状态。')
  }
  if (worldContext.includes('【本卷已写正文进度')) {
    constraints.push('【已写正文优先·硬约束】上文「本卷已写正文进度」来自用户已保存正文，是事实边界。补卷纲时必须承认并承接这些已写事件；不得否认、重排、要求重写已写章节；若旧规划与已写正文冲突，以已写正文为准。')
  }
  if (request?.targetVolumeTitle) {
    constraints.push(`本次只补全现有空卷《${request.targetVolumeTitle}》的卷纲。`)
    constraints.push(`只输出 1 个 JSON 元素；title 必须保持为“${request.targetVolumeTitle}”，summary 写完整的本卷核心冲突、情绪走向、主角状态变化和卷末钩子。`)
  } else if (hasExplicitVolumeCount) {
    const remaining = Math.max(0, Math.floor(explicitVolumeCount) - existingVolumeCount)
    constraints.push(`用户明确设定全书最终总卷数为 ${Math.floor(explicitVolumeCount)} 卷，这是强约束。`)
    constraints.push(`当前已有 ${existingVolumeCount} 卷，本次必须只生成后续缺少的 ${remaining} 卷，最终总数恰好为 ${Math.floor(explicitVolumeCount)} 卷。`)
  } else {
    constraints.push('用户未指定卷数。请根据目标字数、世界观、故事核心、主线阶段和已有卷进度合理决定后续卷数；不得套用固定 2 卷或其他固定值。')
  }
  const pace = options?.parameterValues?.pace
  if (typeof pace === 'string' && pace.trim()) {
    constraints.push(`用户设定整体节奏为「${pace.trim()}」，卷纲设计必须体现这个信息密度与冲突推进速度。`)
  }
  // WS-3A：输出语言约束改由 client gate 按 outputKind 注入（调用方声明 mixed）
  return appendUserConstraint(messages, constraints.join('\n'))
}

/** 将卷展开为章节大纲 */
export function buildChapterOutlinePrompt(
  volumeTitle: string,
  volumeSummary: string,
  worldContext: string,
  prevVolumeSummary: string,
  userHint?: string,
  options?: RunOptions,
  characterContext?: string,
  /** Phase 32: 世界规则清单 */
  worldRulesContext?: string,
  /** Phase 3: 项目 RESOLVED 内容语言，用于注入对应语言的章标题示例；缺省回退语言无关占位符 */
  contentLanguage?: SupportedLang,
): ChatMessage[] {
  const tpl = usePromptStore.getState().getActive('outline.chapter')
  const examples = resolveOutlineTitleExamples(contentLanguage)
  const { messages } = renderPrompt(tpl, {
    volumeTitle,
    volumeSummary,
    worldContext: worldContext || '（暂无）',
    prevVolumeSummary: prevVolumeSummary || '（这是第一卷）',
    characterContext: characterContext || '',
    worldRulesContext: worldRulesContext || '',
    chapterTitleExample: examples.chapterTitleExample,
    chapterOutputExample: examples.chapterOutputExample,
    userHint,
  }, options)
  // CF-3：章纲必须服从本卷 summary 所承载的主线方向，不得另起支线压过主线。
  const constraints = ['【主线一致性·硬约束】本卷大纲已承载故事主线，章纲必须服从本卷 summary 的主线方向：每章 summary 说明它推进了本卷/主线的哪一步；可以有支线，但不得另起或让支线压过主线。']
  if (worldContext.includes('【本卷已写正文进度')) {
    constraints.push('【已写正文优先·硬约束】上文「本卷已写正文进度」来自用户已保存正文，是本次章纲生成的事实边界。已写章节不得被重写、否认或重排；只为未写/目标章节补后续章纲，并承接已写正文的结尾状态、角色状态和实际剧情进展。')
  }
  // WS-3A：输出语言约束改由 client gate 按 outputKind 注入（调用方声明 mixed）
  return appendUserConstraint(
    messages,
    constraints.join('\n'),
  )
}

/** 补全一个已存在的空章节章纲，不重建整卷。 */
export function buildSingleChapterOutlinePrompt(
  volumeTitle: string,
  volumeSummary: string,
  chapterTitle: string,
  siblingChaptersContext: string,
  worldContext: string,
  prevVolumeSummary: string,
  userHint?: string,
  options?: RunOptions,
  characterContext?: string,
  worldRulesContext?: string,
  /** Phase 3: 项目 RESOLVED 内容语言（透传给章纲模板示例）；缺省回退语言无关占位符 */
  contentLanguage?: SupportedLang,
): ChatMessage[] {
  const messages = buildChapterOutlinePrompt(
    volumeTitle,
    volumeSummary,
    worldContext,
    prevVolumeSummary,
    userHint,
    {
      ...options,
      parameterValues: {
        ...(options?.parameterValues ?? {}),
        chaptersPerVolume: 1,
      },
    },
    characterContext,
    worldRulesContext,
    contentLanguage,
  )
  // WS-3A：输出语言约束改由 client gate 按 outputKind 注入（调用方声明 mixed）
  return appendUserConstraint(messages, `【本次单章补全硬约束】
本次不是重建整卷，只补全现有空章节《${chapterTitle}》的章纲。
${siblingChaptersContext || '本卷暂无其他章节可供衔接。'}
只输出 1 个 JSON 元素；title 必须保持为“${chapterTitle}”，summary 用 1-3 句写清本章事件、冲突、推进作用与结尾衔接，不得生成其他章节。`)
}
