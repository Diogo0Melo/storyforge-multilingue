import { chat, type AICallMeta, type ChatResult } from '../ai/client'
import type { AIConfig } from '../types'
import { runReadOnlyAgent, type RunReadOnlyAgentInput } from './runner'

export interface RunReadOnlyAgentWithClientInput extends Omit<RunReadOnlyAgentInput, 'model'> {
  config: AIConfig
  meta?: AICallMeta
}

/**
 * Provider-neutral protocol transport.
 *
 * The safe baseline is strict JSON actions over the existing text client, so every configured
 * text-capable provider shares one auditable behavior. Native tools can be added later as a
 * capability-probed optimization without changing Runner.
 */
export function runReadOnlyAgentWithClient(input: RunReadOnlyAgentWithClientInput) {
  return runReadOnlyAgent({
    ...input,
    model: {
      complete: async (messages, signal) => {
        const result: ChatResult = {}
        const content = await chat(
          messages,
          input.config,
          {
            ...input.meta,
            category: 'agent.readonly',
            projectId: input.context.projectId,
            // WS-3B：只读协议输出是严格 JSON，固定 functional-structured。
            // 该语义意图不允许被调用方 meta 覆盖，client gate 不注入自然语言约束。
            outputKind: 'functional-structured',
            contextOverflowPolicy: 'reject',
          },
          signal,
          result,
        )
        return { content, usage: result.usage }
      },
    },
  })
}
