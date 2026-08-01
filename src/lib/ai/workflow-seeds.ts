import type { PromptWorkflow } from '../types'

export type WorkflowSeed = Omit<PromptWorkflow, 'id' | 'createdAt' | 'updatedAt'>

const uid = () => `s-${Math.random().toString(36).slice(2, 10)}`

/**
 * 内置工作流种子。
 * 借鉴蛙蛙写作的"链式工作流"理念：一键跑完一段创作流程，每步可暂停。
 */
export const SYSTEM_WORKFLOW_SEEDS: WorkflowSeed[] = [
  // 1. 极速起书（通用版）
  {
    scope: 'system',
    name: '极速起书 · 通用',
    nameKey: 'workflow.seed.quickStart.name',
    description: '从零到第一章：故事核心 → 世界观 → 主要角色 → 卷大纲 → 第一章正文。每步可暂停审核。',
    descriptionKey: 'workflow.seed.quickStart.description',
    isDefault: true,
    steps: [
      {
        stepId: uid(),
        label: '一句话故事',
        labelKey: 'workflow.seed.quickStart.step.logline',
        promptModuleKey: 'story.generate',
        userHint: '请用一句话讲清楚这部小说要讲什么',
        userConfirmRequired: false,
        saveTarget: { type: 'storyCore-field', field: 'logline', mode: 'replace' },
      },
      {
        stepId: uid(),
        label: '世界起源',
        labelKey: 'workflow.seed.quickStart.step.worldOrigin',
        promptModuleKey: 'worldview.dimension',
        inputMapping: { previousOutput: 'storyCore' },
        userHint: '基于上一步的故事核心，构思世界的来源和力量体系',
        userConfirmRequired: true,
        saveTarget: { type: 'worldview-field', field: 'worldOrigin', mode: 'replace' },
      },
      {
        stepId: uid(),
        label: '主要角色',
        labelKey: 'workflow.seed.quickStart.step.mainCharacter',
        promptModuleKey: 'character.generate',
        inputMapping: { previousOutput: 'worldContext' },
        userHint: '设计一位与该世界观契合的主角',
        userConfirmRequired: true,
      },
      {
        stepId: uid(),
        label: '卷级大纲',
        labelKey: 'workflow.seed.quickStart.step.volumeOutline',
        promptModuleKey: 'outline.volume',
        inputMapping: { previousOutput: 'characters' },
        userHint: '基于上面的设定生成 3-5 卷的大纲',
        userConfirmRequired: true,
      },
      {
        stepId: uid(),
        label: '第一章正文',
        labelKey: 'workflow.seed.quickStart.step.firstChapter',
        promptModuleKey: 'chapter.content',
        inputMapping: { previousOutput: 'chapterSummary' },
        userHint: '写第一卷第一章的正文，约 2500 字',
        userConfirmRequired: true,
      },
    ],
  },

  // 2. 单章深度生成
  {
    scope: 'system',
    name: '单章深度生成',
    nameKey: 'workflow.seed.singleChapter.name',
    description: '把一个章节大纲展开为细纲场景 → 写正文 → 润色 → 去 AI 味。适合精雕细琢一章。',
    descriptionKey: 'workflow.seed.singleChapter.description',
    steps: [
      {
        stepId: uid(),
        label: '细纲拆场景',
        labelKey: 'workflow.seed.singleChapter.step.detailScene',
        promptModuleKey: 'detail.scene',
        userHint: '把章节大纲拆成 4-5 个场景节拍',
        userConfirmRequired: false,
      },
      {
        stepId: uid(),
        label: '写正文',
        labelKey: 'workflow.seed.singleChapter.step.writeProse',
        promptModuleKey: 'chapter.content',
        inputMapping: { previousOutput: 'chapterSummary' },
        userConfirmRequired: true,
      },
      {
        stepId: uid(),
        label: '润色',
        labelKey: 'workflow.seed.singleChapter.step.polish',
        promptModuleKey: 'chapter.polish',
        inputMapping: { previousOutput: 'text' },
        userHint: '让节奏更紧凑，去掉冗余描写',
        userConfirmRequired: true,
      },
      {
        stepId: uid(),
        label: '去 AI 味',
        labelKey: 'workflow.seed.singleChapter.step.deai',
        promptModuleKey: 'chapter.de-ai',
        inputMapping: { previousOutput: 'text' },
        userConfirmRequired: false,
      },
    ],
  },

  // 3. 伏笔体系搭建
  {
    scope: 'system',
    name: '伏笔体系搭建',
    nameKey: 'workflow.seed.foreshadow.name',
    description: '基于已有世界观和角色，建议一套精心设计的伏笔。',
    descriptionKey: 'workflow.seed.foreshadow.description',
    steps: [
      {
        stepId: uid(),
        label: '世界观摘要',
        labelKey: 'workflow.seed.foreshadow.step.worldviewSummary',
        promptModuleKey: 'worldview.dimension',
        userHint: '生成 200-400 字的世界观精华摘要，用于后续 AI 上下文',
        userConfirmRequired: false,
        saveTarget: { type: 'worldview-field', field: 'summary', mode: 'replace' },
      },
      {
        stepId: uid(),
        label: '伏笔建议',
        labelKey: 'workflow.seed.foreshadow.step.foreshadowSuggestions',
        promptModuleKey: 'foreshadow.generate',
        inputMapping: { previousOutput: 'worldContext' },
        userHint: '基于世界观和角色，建议 5-8 个层次分明的伏笔',
        userConfirmRequired: true,
      },
    ],
  },
]
