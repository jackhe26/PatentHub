import * as chatStore from '../chatStore'

/**
 * 摘除会话上的审查搭档。
 *
 * 搭档的提示词是以「首条 system 消息」的形式存在历史里的（见 applyCopilot），
 * 所以摘除 = 清掉 copilotId 等会话字段 + 删掉那条 system 消息。
 *
 * @param sessionId 会话 id
 * @param options.expectedPrompt 传入时表示「只有当前 system 消息确实是这个提示词才删」，
 *   用于用户手动摘除（避免误删自定义 system）；不传表示无条件按 copilotId 摘除，
 *   用于发送后的自动摘除。
 */
export async function detachCopilot(sessionId: string, options?: { expectedPrompt?: string }) {
  const session = await chatStore.getSession(sessionId)
  // 没有挂载搭档时什么都不做，避免误删自定义 system 消息
  if (!session?.copilotId) return

  const messages = session.messages || []
  const systemMessage = messages.find((message) => message.role === 'system')

  await chatStore.updateSession(sessionId, {
    copilotId: undefined,
    picUrl: undefined,
    copilotPinned: undefined,
  })

  if (!systemMessage) return

  if (options) {
    const firstPart = systemMessage.contentParts?.[0]
    const isCopilotPrompt =
      Boolean(options.expectedPrompt) && firstPart?.type === 'text' && firstPart.text === options.expectedPrompt
    if (!isCopilotPrompt) return
  }

  const systemMessageId = systemMessage.id
  await chatStore.updateMessages(sessionId, (list) => (list ?? []).filter((message) => message.id !== systemMessageId))
}
