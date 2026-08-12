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
import { getT } from '../../../i18n'

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

/** WorkflowEditor "自动保存目标" 下拉预设（labelKey 引用 settings.saveTargets.*） */
export const SAVE_TARGET_PRESETS = [
  { labelKey: 'saveTargets.none', value: '' },
  { labelKey: 'saveTargets.worldviewField', fieldKey: 'fields.worldOrigin', value: 'worldview-field:worldOrigin' },
  { labelKey: 'saveTargets.worldviewField', fieldKey: 'fields.powerHierarchy', value: 'worldview-field:powerHierarchy' },
  { labelKey: 'saveTargets.worldviewField', fieldKey: 'fields.historyLine', value: 'worldview-field:historyLine' },
  { labelKey: 'saveTargets.worldviewField', fieldKey: 'fields.summary', value: 'worldview-field:summary' },
  { labelKey: 'saveTargets.storyCoreField', fieldKey: 'fields.logline', value: 'storyCore-field:logline' },
  { labelKey: 'saveTargets.storyCoreField', fieldKey: 'fields.concept', value: 'storyCore-field:concept' },
  { labelKey: 'saveTargets.storyCoreField', fieldKey: 'fields.theme', value: 'storyCore-field:theme' },
  { labelKey: 'saveTargets.storyCoreField', fieldKey: 'fields.centralConflict', value: 'storyCore-field:centralConflict' },
  { labelKey: 'saveTargets.storyCoreField', fieldKey: 'fields.mainPlot', value: 'storyCore-field:mainPlot' },
  { labelKey: 'saveTargets.creativeRulesField', fieldKey: 'fields.writingStyle', value: 'creativeRules-field:writingStyle' },
  { labelKey: 'saveTargets.creativeRulesField', fieldKey: 'fields.toneAndMood', value: 'creativeRules-field:toneAndMood' },
  { labelKey: 'saveTargets.createCharacters', value: 'create-characters:_' },
  { labelKey: 'saveTargets.createOutlineNodes', value: 'create-outline-nodes:_' },
  { labelKey: 'saveTargets.createForeshadows', value: 'create-foreshadows:_' },
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

/** 字段 key → settings.saveTargets.fields.* 子键的映射，供 targetLabelKey 使用 */
const SAVE_TARGET_FIELD_KEY_MAP: Record<string, string> = {
  worldOrigin: 'fields.worldOrigin',
  powerHierarchy: 'fields.powerHierarchy',
  historyLine: 'fields.historyLine',
  summary: 'fields.summary',
  logline: 'fields.logline',
  concept: 'fields.concept',
  theme: 'fields.theme',
  centralConflict: 'fields.centralConflict',
  mainPlot: 'fields.mainPlot',
  writingStyle: 'fields.writingStyle',
  toneAndMood: 'fields.toneAndMood',
}

/**
 * 返回用于 t() 的 i18n key + 插值参数；调用方负责用 useDomainT('settings').t 渲染。
 * 非 React 场景可用 getT() 取翻译函数后传入。
 */
export function targetLabelKey(target: SaveTarget): { key: string; params?: Record<string, string> } | null {
  if (target.type === 'create-characters') return { key: 'saveTargets.createCharacters' }
  if (target.type === 'create-outline-nodes') return { key: 'saveTargets.createOutlineNodes' }
  if (target.type === 'create-foreshadows') return { key: 'saveTargets.createForeshadows' }
  const field = (target as { field?: string }).field || ''
  const fieldKey = SAVE_TARGET_FIELD_KEY_MAP[field]
  if (!fieldKey) return null
  if (target.type === 'worldview-field') return { key: 'saveTargets.worldviewField', params: { field: `__FIELD__${fieldKey}` } }
  if (target.type === 'storyCore-field') return { key: 'saveTargets.storyCoreField', params: { field: `__FIELD__${fieldKey}` } }
  if (target.type === 'creativeRules-field') return { key: 'saveTargets.creativeRulesField', params: { field: `__FIELD__${fieldKey}` } }
  return null
}

/**
 * 兼容旧调用点：直接返回已翻译字符串。main.tsx 保证 initI18n 在渲染前完成，
 * 因此运行时不会出现 i18n 未初始化的情况。若被单元测试直接导入且未初始化 i18n，
 * 返回空字符串（测试应自行初始化 i18n 或使用 targetLabelKey）。
 */
export function targetLabel(target: SaveTarget): string {
  try {
    // Keys are dynamically constructed by targetLabelKey(); cast needed for string-typed keys.
    const t = getT() as (key: string, opts?: Record<string, unknown>) => string
    const resolved = targetLabelKey(target)
    if (!resolved) return ''
    if (!resolved.params) return t(resolved.key)
    // Nested interpolation: first resolve the field sub-key, then inject into parent template.
    const fieldText = t(`saveTargets.${resolved.params.field}`)
    return t(resolved.key, { field: fieldText })
  } catch {
    // i18n not initialized — return empty; callers in test should init i18n first.
    return ''
  }
}
