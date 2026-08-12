/**
 * WS-2: 项目 AI 内容语言解析器（单一语义入口）。
 *
 * 语义契约（D1）：
 * - project.contentLanguage 已持久化且有效 → 返回该值
 * - project.contentLanguage 为 undefined（旧项目，未回填）→ 返回 uiLocale
 * - project.contentLanguage 值无效（防御性）→ 视为 undefined → 返回 uiLocale
 *
 * 所有需要读取"项目 AI 内容语言"的调用方（AI client gate、适配器等）
 * 必须经由此函数，不得自行读取 project.contentLanguage。
 */
import { SUPPORTED_LANGS } from '../../i18n'
import type { SupportedLang } from '../../i18n'
import type { Project } from '../types'

const SUPPORTED_CODES: ReadonlySet<string> = new Set(SUPPORTED_LANGS.map(l => l.code))

/**
 * 解析项目的 AI 内容语言。
 *
 * @param project 项目对象（仅需 contentLanguage 字段）
 * @param uiLocale 当前 UI 语言（调用方保证为有效 SupportedLang）
 * @returns 有效的 SupportedLang；持久化值缺失或无效时回退到 uiLocale
 */
export function resolveProjectContentLanguage(
  project: Pick<Project, 'contentLanguage'>,
  uiLocale: SupportedLang,
): SupportedLang {
  const persisted = project.contentLanguage
  if (persisted !== undefined && SUPPORTED_CODES.has(persisted)) {
    return persisted
  }
  return uiLocale
}
