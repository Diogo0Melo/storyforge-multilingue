import type { ChatMessage } from '../../types'

/**
 * WS-3A：该常量由 src/lib/ai/output-language.ts 的 gate 构造器复用（zh-CN 分支
 * 字节级一致）。旧适配器散点注入（appendSimplifiedChineseOutputConstraint）已收口到
 * client gate；本常量待 WS-4 完成迁移后移除。
 */
export const SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT = [
  '【语言输出硬约束】',
  '除用户原文明确要求保留的专名、术语、代码、JSON key 外，所有面向读者的标题、summary、目标、说明和正文内容必须使用自然流畅的简体中文。',
  '禁止中英夹杂，禁止输出整句英文，禁止把英文变量名、英文示例或 prompt key 写进创作结果。',
  '如果输入资料中混有英文，请先在内部理解并转写为中文表达；不要原样扩散到大纲或正文。',
].join('\n')

/** Fase 1: delimitadores autoritativos e versionados da política textual. */
export const STORYFORGE_OUTPUT_POLICY_START = '[STORYFORGE_OUTPUT_POLICY:v1]'
export const STORYFORGE_OUTPUT_POLICY_END = '[/STORYFORGE_OUTPUT_POLICY:v1]'

export function buildStoryForgeOutputPolicyBlock(constraint: string): string {
  return [STORYFORGE_OUTPUT_POLICY_START, constraint, STORYFORGE_OUTPUT_POLICY_END].join('\n')
}

/**
 * Retorna somente um bloco completo, delimitado byte a byte pelos marcadores
 * StoryForge. Texto autoral que contenha apenas a constraint nunca casa aqui.
 */
export function findStoryForgeOutputPolicyBlock(content: string): string | undefined {
  let searchFrom = 0
  let lastBlock: string | undefined
  while (searchFrom < content.length) {
    const start = content.indexOf(STORYFORGE_OUTPUT_POLICY_START, searchFrom)
    if (start < 0) break
    const end = content.indexOf(
      STORYFORGE_OUTPUT_POLICY_END,
      start + STORYFORGE_OUTPUT_POLICY_START.length,
    )
    if (end < 0) break
    lastBlock = content.slice(start, end + STORYFORGE_OUTPUT_POLICY_END.length)
    searchFrom = end + STORYFORGE_OUTPUT_POLICY_END.length
  }
  return lastBlock
}

/** Remove todos os blocos completos, preservando exatamente o texto externo. */
export function removeStoryForgeOutputPolicyBlocks(content: string): string {
  let result = ''
  let cursor = 0
  let found = false

  while (cursor < content.length) {
    const start = content.indexOf(STORYFORGE_OUTPUT_POLICY_START, cursor)
    if (start < 0) break
    const end = content.indexOf(
      STORYFORGE_OUTPUT_POLICY_END,
      start + STORYFORGE_OUTPUT_POLICY_START.length,
    )
    if (end < 0) break
    result += content.slice(cursor, start)
    cursor = end + STORYFORGE_OUTPUT_POLICY_END.length
    found = true
  }

  return found ? result + content.slice(cursor) : content
}

export function appendUserConstraint(messages: ChatMessage[], constraint: string): ChatMessage[] {
  const next = messages.map(message => ({ ...message }))
  const user = [...next].reverse().find(message => message.role === 'user')
  if (user) user.content = `${user.content}\n\n${constraint}`
  return next
}
