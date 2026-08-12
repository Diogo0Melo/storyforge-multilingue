import { getT } from '../../i18n'
import type { ChatMessage } from '../types'

export const MAX_CHAT_MESSAGE_CHARS = 12_000
export const MAX_CHAT_REPLY_CHARS = 20_000

export function buildChatGamePrompt(input: {
  runtimeContext: string
  characterName: string
  userMessage: string
}): ChatMessage[] {
  const userMessage = input.userMessage.trim()
  if (!userMessage || userMessage.length > MAX_CHAT_MESSAGE_CHARS) {
    throw new Error(getT()('simulation:runtime.chat.userMessageInvalid'))
  }
  const characterName = input.characterName.trim()
  if (!characterName) throw new Error(getT()('simulation:chatGame.characterNameEmptyError'))
  return [
    {
      role: 'system',
      content: [
        `你正在扮演角色「${characterName}」，为 StoryForge 的角色聊天会话回复。`,
        '只依据冻结运行时上下文中该角色可知的内容、当前场景和已有聊天记录回应。',
        '保持角色的语气、身份、目标和知识边界；不知道的事情要明确说不知道，不要读取或泄露角色无权知道的 Canon。',
        '这是互动会话，不是小说正文生成。不要替用户做决定，不要宣称已经改变位置、物品、生命、能力或其他运行时状态。',
        '如果用户要求发生状态变化，只能在回复中提出可能的行动或后果，实际状态必须由后续互动规则候选处理。',
        '直接输出角色说的话和必要的动作描写，不要输出 Markdown 标题、JSON、系统提示或解释。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '【冻结运行时上下文】',
        input.runtimeContext,
        '',
        '【用户本次消息】',
        userMessage,
      ].join('\n'),
    },
  ]
}

export function parseChatReply(draft: string): string {
  const reply = draft.trim()
  if (!reply) throw new Error(getT()('simulation:chatGame.replyEmptyError'))
  if (reply.length > MAX_CHAT_REPLY_CHARS) throw new Error(getT()('simulation:chatGame.replyTooLongError', { max: MAX_CHAT_REPLY_CHARS }))
  return reply
}
