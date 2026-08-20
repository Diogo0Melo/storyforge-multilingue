import type { UseAIStreamReturn } from '../../hooks/useAIStream'
import type { GenerationNode } from '../generation/generation-node'
import type { AssembleContextResult } from '../registry/types'
import type { OutlineNode, Project } from '../types'
import type { RunOptions } from '../ai/adapters/outline-adapter'
import { buildOutlineGenerationPlan } from './generation-plan'
import {
  encodeGenerationOperation,
  outlineGenerationModuleKey,
  type OutlineGenerationRequest,
} from './generation-request'

type OutlineGenerationAI = Pick<UseAIStreamReturn, 'start'>

export class OutlineGenerationSkipError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OutlineGenerationSkipError'
  }
}

export function createOutlineGenerationNode(input: {
  request: OutlineGenerationRequest
  project: Project
  nodes: OutlineNode[]
  volumes: OutlineNode[]
  hint: string
  runOptions: RunOptions
  ai: OutlineGenerationAI
}): GenerationNode<AssembleContextResult, string> {
  const { request, project, nodes, volumes, hint, runOptions, ai } = input
  const category = outlineGenerationModuleKey(request)
  return {
    id: encodeGenerationOperation(request),
    kind: category,
    editableInput: true,
    assembleInput: assembled => {
      const plan = buildOutlineGenerationPlan({
        request,
        project,
        nodes,
        volumes,
        assembled,
        hint,
        options: runOptions,
      })
      if (plan.status === 'skip') throw new OutlineGenerationSkipError(plan.reason)
      return plan.messages
    },
    // WS-3A：大纲生成（JSON 骨架 + 自然语言 summary）→ mixed；其唯一 placement
    // 由 task-routing 的声明式矩阵收口到 textual-fallback。
    run: messages => category === 'outline.volume'
      ? ai.start(messages, undefined, {
        category: 'outline.volume',
        projectId: project.id!,
        outputKind: 'mixed',
      })
      : ai.start(messages, undefined, {
        category: 'outline.chapter',
        projectId: project.id!,
        outputKind: 'mixed',
      }),
  }
}
