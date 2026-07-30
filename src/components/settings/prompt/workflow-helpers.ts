/**
 * 工作流面板 —— 公共常量 & 纯函数
 * ------------------------------------------------------------
 * 从 PromptWorkflowsPanel.tsx 抽出的无 React 依赖的部分：
 * - 模块键列表 / 保存目标预设
 * - SaveTarget ↔ select value 的互转
 * - saveTarget 的中文展示
 *
 * 对 UI 组件不做任何行为改变。
 */

import type { SaveTarget } from '../../../lib/types/workflow'
import type { WorkflowUpstreamInput } from '../../../lib/workflow/graph'
import {
  formatWorkflowUpstreamContext,
  groupWorkflowInputsByVariable,
} from '../../../lib/workflow/graph'
import i18n from '../../../i18n/i18n'

/**
 * FB-1 修复 · 工作流步骤上下文整形(纯函数,可单测)。
 *
 * IO 部分(从 ref 取上一步输出、调 assembleContext)留在 WorkflowRunner;
 * 本函数只负责「把各路上下文摆进模板变量槽位」的纯逻辑,因此能脱离 React/DB 直接测。
 *
 * 关键不变量:
 * - projectName/genres/dimension 必须有值(此前全空导致 AI 失去依据)
 * - worldContext 是所有工作流步骤模板共用的「前序上下文」槽位:
 *   已存项目设定(assembledContext)+ 上一步输出(prevOutput)都汇入这里,
 *   因此 step2「世界起源」一定能看到 step1「一句话故事」。
 * - 仍保留步骤自身 inputMapping 中非 worldContext 的特定变量(如 chapterSummary)。
 */
export function assembleWorkflowStepVars(params: {
  step: { label?: string; userHint?: string; inputMapping?: Record<string, string> }
  prevOutput: string
  projectName?: string
  genres?: string
  assembledContext?: string
  worldRulesContext?: string
  userInput?: string
  /** FLOW-1 显式图入边。提供时取代线性 prevOutput，但保留旧参数兼容。 */
  upstreamInputs?: WorkflowUpstreamInput[]
}): Record<string, string | number | undefined> {
  const {
    step,
    prevOutput,
    projectName,
    genres,
    assembledContext,
    worldRulesContext,
    userInput,
    upstreamInputs,
  } = params
  const ctx: Record<string, string | number | undefined> = {}

  ctx.projectName = projectName ?? ''
  ctx.genres = genres ?? ''
  ctx.dimension = step.label ?? ''
  const mergedUserHint = [step.userHint?.trim(), userInput?.trim()].filter(Boolean).join('\n')
  if (mergedUserHint) ctx.userHint = mergedUserHint

  const hasGraphInputs = upstreamInputs !== undefined
  const graphValues = hasGraphInputs ? groupWorkflowInputsByVariable(upstreamInputs) : {}
  for (const [variable, value] of Object.entries(graphValues)) {
    if (variable !== 'worldContext') ctx[variable] = value
  }

  // 旧线性工作流保留 inputMapping 中非 worldContext 的特定变量。
  if (!hasGraphInputs && step.inputMapping && prevOutput) {
    for (const [from, to] of Object.entries(step.inputMapping)) {
      if (from === 'previousOutput' && to !== 'worldContext') ctx[to] = prevOutput
    }
  }

  if (worldRulesContext) ctx.worldRulesContext = worldRulesContext

  // 通用前序上下文槽位：已存设定 + 显式图入边（或旧线性的上一步输出）。
  const upstreamContext = hasGraphInputs
    ? formatWorkflowUpstreamContext(upstreamInputs)
    : prevOutput
  const prior = [assembledContext, upstreamContext].filter(Boolean).join('\n\n')
  if (prior) ctx.worldContext = prior

  return ctx
}

/** WorkflowEditor 下拉选项使用的模块键列表（与 prompt-seeds 的 system moduleKey 保持一致） */
export const ALL_MODULE_KEYS_FOR_WORKFLOW = [
  'worldview.dimension', 'character.generate', 'character.dimension',
  'worldview.worldbuilding', 'character.design',
  'story.brief', 'story.ideation', 'story.positioning', 'story.core', 'story.packaging',
  'research.method', 'prompt.operations',
  'outline.volume', 'outline.chapter',
  'outline.plot', 'outline.structure', 'outline.long-form', 'outline.short-story', 'outline.serialization',
  'detail.chapter-planning',
  'chapter.content', 'chapter.continue', 'chapter.polish', 'chapter.expand', 'chapter.de-ai',
  'chapter.drafting', 'chapter.continuity', 'chapter.line-editing',
  'review.developmental', 'review.line-editing', 'review.reader-validation',
  'foreshadow.generate', 'story.generate', 'rules.generate', 'detail.scene',
  'geography.concept-map', 'geography.image-map-prompt',
] as const

/** WorkflowEditor "自动保存目标" 下拉预设 */
export const SAVE_TARGET_PRESETS = [
  { label: i18n.t('settings:prompt.workflow.saveTarget.noAutoSave'), value: '' },
  { label: i18n.t('settings:prompt.workflow.saveTarget.worldOrigin'), value: 'worldview-field:worldOrigin' },
  { label: i18n.t('settings:prompt.workflow.saveTarget.powerHierarchy'), value: 'worldview-field:powerHierarchy' },
  { label: i18n.t('settings:prompt.workflow.saveTarget.historyLine'), value: 'worldview-field:historyLine' },
  { label: i18n.t('settings:prompt.workflow.saveTarget.summary'), value: 'worldview-field:summary' },
  { label: i18n.t('settings:prompt.workflow.saveTarget.logline'), value: 'storyCore-field:logline' },
  { label: i18n.t('settings:prompt.workflow.saveTarget.concept'), value: 'storyCore-field:concept' },
  { label: i18n.t('settings:prompt.workflow.saveTarget.theme'), value: 'storyCore-field:theme' },
  { label: i18n.t('settings:prompt.workflow.saveTarget.centralConflict'), value: 'storyCore-field:centralConflict' },
  { label: i18n.t('settings:prompt.workflow.saveTarget.mainPlot'), value: 'storyCore-field:mainPlot' },
  { label: i18n.t('settings:prompt.workflow.saveTarget.writingStyle'), value: 'creativeRules-field:writingStyle' },
  { label: i18n.t('settings:prompt.workflow.saveTarget.toneAndMood'), value: 'creativeRules-field:toneAndMood' },
  { label: i18n.t('settings:prompt.workflow.saveTarget.createCharacters'), value: 'create-characters:_' },
  { label: i18n.t('settings:prompt.workflow.saveTarget.createOutlineNodes'), value: 'create-outline-nodes:_' },
  { label: i18n.t('settings:prompt.workflow.saveTarget.createForeshadows'), value: 'create-foreshadows:_' },
] as const

/** SaveTarget 转 select value 字符串（`type:field` 或 `type:_`） */
export function saveTargetToValue(st?: SaveTarget): string {
  if (!st) return ''
  if (
    st.type === 'create-characters' ||
    st.type === 'create-outline-nodes' ||
    st.type === 'create-foreshadows'
  ) {
    return `${st.type}:_`
  }
  return `${st.type}:${(st as { field: string }).field}`
}

/** select value 字符串反解为 SaveTarget */
export function valueToSaveTarget(v: string): SaveTarget | undefined {
  if (!v) return undefined
  const [type, field] = v.split(':')
  if (
    type === 'create-characters' ||
    type === 'create-outline-nodes' ||
    type === 'create-foreshadows'
  ) {
    return { type } as SaveTarget
  }
  return {
    type: type as 'worldview-field' | 'storyCore-field' | 'creativeRules-field',
    field,
    mode: 'replace',
  }
}

/** 字段 key → i18n key 的映射，供 targetLabel 使用 */
const SAVE_TARGET_FIELD_I18N_KEYS: Record<string, string> = {
  worldOrigin: 'worldOrigin', powerHierarchy: 'powerHierarchy',
  historyLine: 'historyLine', summary: 'summary',
  logline: 'logline', concept: 'concept', theme: 'theme',
  centralConflict: 'centralConflict', mainPlot: 'mainPlot',
  writingStyle: 'writingStyle', toneAndMood: 'toneAndMood',
}

/** 把 SaveTarget 格式化成运行时 UI 里展示的标签（国际化） */
export function targetLabel(target: SaveTarget): string {
  if (target.type === 'create-characters') return i18n.t('settings:prompt.workflow.editor.targetLabels.characters')
  if (target.type === 'create-outline-nodes') return i18n.t('settings:prompt.workflow.editor.targetLabels.outlineNodes')
  if (target.type === 'create-foreshadows') return i18n.t('settings:prompt.workflow.editor.targetLabels.foreshadows')
  const field = (target as { field?: string }).field || ''
  const fieldKey = SAVE_TARGET_FIELD_I18N_KEYS[field]
  const label = fieldKey ? (i18n.t as (key: string) => string)(`settings:prompt.workflow.editor.targetLabels.fields.${fieldKey}`) : field
  if (target.type === 'worldview-field') return i18n.t('settings:prompt.workflow.editor.targetLabels.worldview', { field: label })
  if (target.type === 'storyCore-field') return i18n.t('settings:prompt.workflow.editor.targetLabels.storyCore', { field: label })
  if (target.type === 'creativeRules-field') return i18n.t('settings:prompt.workflow.editor.targetLabels.creativeRules', { field: label })
  return ''
}
