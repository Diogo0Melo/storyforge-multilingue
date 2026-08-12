/**
 * WS-3A (D12) · 输出语言语义与 client gate 约束构造器。
 *
 * 架构契约（用户已批准）：
 * - 调用方通过 AICallMeta.outputKind 声明语义意图；client.ts 的 chat()/streamChat()
 *   是唯一网络边界执行点（ENFORCEMENT choke point），负责解析语言并注入约束，
 *   不自行发明语义。
 * - 注入规则：
 *   - creative / mixed        → 项目 RESOLVED contentLanguage（D1，经 content-language.ts）
 *   - functional-prose        → 当前 UI 语言
 *   - functional-structured / language-neutral → 不注入文本语言约束（schema/标记保持 zh，规则 D）
 * - 语言解析（D1）：meta.projectId → db.projects.get → resolveProjectContentLanguage(project, uiLocale)。
 *   无 projectId / 无项目行 → 回退 uiLocale（显式报告该选择）。
 * - 失败保险（D3/D12）：UNKNOWN category（classifyAITask → null）在 dev/test 必须抛错；
 *   生产构建 console.error + 跳过注入，绝不破坏用户调用。
 *
 * zh-CN 分支与 SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT 字节级一致（zh 项目完全保留现状）。
 * pt-BR / en 文案为初稿，G2A 复审。
 */
import type { ChatMessage } from '../types'
import { getSupportedUiLang, type SupportedLang } from '../../i18n'
import {
  SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT,
  appendUserConstraint,
} from './adapters/prompt-guards'
import { resolveProjectContentLanguage } from './content-language'
import { classifyAITask, type AITaskKind } from './task-routing'
import { db } from '../db/schema'
import type { AICallMeta } from './client'

/** D12：调用方声明的输出语义意图。 */
export type OutputKind =
  | 'creative'
  | 'functional-prose'
  | 'functional-structured'
  | 'mixed'
  | 'language-neutral'

/** pt-BR 输出约束（对应 zh 版意图；G2A 复审文案）。 */
export const PORTUGUESE_OUTPUT_CONSTRAINT = [
  '【Restrição rígida de idioma de saída】',
  'Exceto nomes próprios, termos técnicos, código e chaves JSON que o texto original do usuário pede explicitamente para preservar, todos os títulos, resumos, objetivos, explicações e o corpo do texto voltados ao leitor devem usar português brasileiro natural e fluente.',
  'É proibido misturar idiomas, é proibido produzir frases inteiras em outro idioma e é proibido inserir nomes de variáveis em inglês, exemplos em inglês ou chaves de prompt nos resultados criativos.',
  'Se o material de entrada contiver inglês ou outros idiomas, primeiro compreenda-o internamente e reescreva-o em português; não o propague diretamente para o outline ou para o corpo do texto.',
].join('\n')

/** en 输出约束（对应 zh 版意图；G2A 复审文案）。 */
export const ENGLISH_OUTPUT_CONSTRAINT = [
  '【Output Language Hard Constraint】',
  'Except for proper nouns, terminology, code, and JSON keys that the user\'s original text explicitly asks to preserve, all reader-facing titles, summaries, goals, explanations, and prose must use natural, fluent English.',
  'Do not mix languages, do not output entire sentences in another language, and do not write variable names, code examples, or prompt keys in other languages into creative results.',
  'If the input material contains Chinese or other languages, first understand it internally and render it into English; do not propagate it verbatim into outlines or prose.',
].join('\n')

/** 构造指定语言的输出约束文本。zh-CN 与既有常量字节级一致。 */
export function buildOutputLanguageConstraint(lang: SupportedLang): string {
  switch (lang) {
    case 'zh-CN':
      return SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT
    case 'pt-BR':
      return PORTUGUESE_OUTPUT_CONSTRAINT
    case 'en':
      return ENGLISH_OUTPUT_CONSTRAINT
  }
}

const ALL_OUTPUT_CONSTRAINTS: readonly string[] = [
  SIMPLIFIED_CHINESE_OUTPUT_CONSTRAINT,
  PORTUGUESE_OUTPUT_CONSTRAINT,
  ENGLISH_OUTPUT_CONSTRAINT,
]

/**
 * 沿用 appendUserConstraint 形状：克隆消息，把约束追加到最后一条 user 消息。
 */
export function appendOutputLanguageConstraint(
  messages: ChatMessage[],
  lang: SupportedLang,
): ChatMessage[] {
  return appendUserConstraint(messages, buildOutputLanguageConstraint(lang))
}

/**
 * 双重注入守卫：最后一条 user 消息已以任一语言约束结尾时返回 true。
 * 廉价检查，防止 WS-3B 过渡期同一调用被注入两次。
 */
export function hasOutputLanguageConstraint(messages: ChatMessage[]): boolean {
  const user = [...messages].reverse().find(message => message.role === 'user')
  if (!user) return false
  return ALL_OUTPUT_CONSTRAINTS.some(constraint => user.content.endsWith(constraint))
}

/**
 * WS-3A 过渡期缺省推导（D12）：meta.outputKind 缺失时由 classifyAITask 的 kind 推导。
 * WS-3B 将为各调用点显式声明并收紧。agent 角色 kind 暂不推导（不注入，保持现状）。
 */
const INTERIM_OUTPUT_KIND_BY_TASK_KIND: Partial<Record<AITaskKind, OutputKind>> = {
  creation: 'creative',
  extraction: 'functional-structured',
  analysis: 'functional-structured',
  review: 'functional-prose',
  // 'agent-*' 角色 kind 有意留空：WS-3B 显式声明。
}

/**
 * client gate：chat()/streamChat() 共用的唯一注入点。
 *
 * 流程：
 * 1. 解析 outputKind：显式 meta.outputKind → 缺省推导 → 失败保险。
 * 2. functional-structured / language-neutral（及过渡期未声明的 agent 角色）→ 不注入。
 * 3. 双重注入守卫。
 * 4. 解析语言并追加约束。
 */
export async function applyOutputLanguageGate(
  messages: ChatMessage[],
  meta?: AICallMeta,
): Promise<ChatMessage[]> {
  // 1) outputKind：显式声明优先
  let outputKind = meta?.outputKind
  if (!outputKind) {
    const taskKind = classifyAITask(meta?.category)
    if (!taskKind) {
      // 失败保险（D3/D12）：未登记 category 在 dev/test 必须暴露；生产绝不破坏调用。
      if (import.meta.env.PROD) {
        console.error(
          `[AI] output-language gate: unknown task category "${meta?.category ?? ''}" — skipping language constraint injection`,
        )
        return messages
      }
      throw new Error(
        `[AI] output-language gate: unknown task category "${meta?.category ?? ''}". `
        + 'Register it in task-routing.ts or declare outputKind explicitly in AICallMeta.',
      )
    }
    outputKind = INTERIM_OUTPUT_KIND_BY_TASK_KIND[taskKind]
  }

  // 2) 结构化 / 语言中立 / 过渡期未声明 → 不注入文本语言约束（规则 D）
  if (!outputKind || outputKind === 'functional-structured' || outputKind === 'language-neutral') {
    return messages
  }

  // 3) 双重注入守卫
  if (hasOutputLanguageConstraint(messages)) return messages

  // 4) 语言解析
  const uiLocale = getSupportedUiLang()
  let lang: SupportedLang
  if (outputKind === 'functional-prose') {
    lang = uiLocale
  } else {
    // creative / mixed → 项目 contentLanguage 的 RESOLVED 值（D1）
    const project = meta?.projectId != null ? await db.projects.get(meta.projectId) : undefined
    if (project) {
      lang = resolveProjectContentLanguage(project, uiLocale)
    } else {
      // 显式报告的选择：无项目行 / 无 projectId → uiLocale
      lang = uiLocale
      console.debug(
        `[AI] output-language gate: no project row (projectId=${meta?.projectId ?? 'none'}), falling back to UI locale "${uiLocale}"`,
      )
    }
  }
  return appendOutputLanguageConstraint(messages, lang)
}
