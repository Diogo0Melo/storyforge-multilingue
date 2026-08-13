import type { UseAIStreamReturn } from '../../hooks/useAIStream'
import { isOutputKind, type OutputKind } from '../ai/output-language'
import type { ChatMessage } from '../types'
import type { GenerationNode } from './generation-node'

/**
 * WS-3B · 持久化/导入的步骤数据可能携带无效 outputKind（导入层只做类型断言）。
 * 合法值原样放行；无效值丢弃为 undefined（Auto），交由 client gate 的过渡期
 * 推导/失败保险处理。未知/自定义分类绝不得被静默标记为 creative。
 */
export function sanitizeWorkflowOutputKind(value: unknown): OutputKind | undefined {
  if (isOutputKind(value)) return value
  if (value !== undefined) {
    console.warn(`[workflow] invalid step outputKind discarded (fallback to Auto): ${JSON.stringify(value)}`)
  }
  return undefined
}

/**
 * 既有 PromptWorkflow 步骤到 GenerationNode 的兼容适配器。
 * category 仍来自已登记的 promptModuleKey；写回继续由 WorkflowRunner 的
 * 作者确认按钮触发，不在节点 run 阶段自动执行。
 * WS-3B：步骤显式 outputKind 经 AICallMeta 原样转发；Auto 保持 undefined，
 * 让 client gate 使用过渡期分类/失败保险。
 */
export function createWorkflowGenerationNode(input: {
  workflowId: number | string
  stepId: string
  category: string
  projectId?: number
  /** 作者显式声明的步骤输出意图；undefined = Auto/legacy（client gate 过渡推导） */
  outputKind?: OutputKind
  ai: Pick<UseAIStreamReturn, 'start'>
}): GenerationNode<ChatMessage[], string> {
  const { workflowId, stepId, category, projectId, ai } = input
  // 防御无效持久化/导入值：无效 → Auto（undefined），而不是任何默认语义。
  const outputKind = sanitizeWorkflowOutputKind(input.outputKind)
  return {
    id: `workflow.${workflowId}.${stepId}`,
    kind: category,
    editableInput: true,
    assembleInput: messages => messages.map(message => ({ ...message })),
    run: messages => ai.start(messages, undefined, {
      category: category,
      projectId,
      // Auto 时不挂 outputKind 键，保持 undefined 语义给 client gate
      ...(outputKind !== undefined ? { outputKind } : {}),
    }),
  }
}
