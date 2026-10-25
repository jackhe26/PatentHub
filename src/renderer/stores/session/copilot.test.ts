import type { Message, Session } from '@shared/types'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { detachCopilot } from './copilot'

const { sessions } = vi.hoisted(() => ({ sessions: new Map<string, Session>() }))

vi.mock('../chatStore', () => ({
  getSession: vi.fn((id: string) => Promise.resolve(sessions.get(id) ?? null)),
  updateSession: vi.fn((id: string, updater: unknown) =>
    Promise.resolve().then(() => {
      const session = sessions.get(id)
      if (!session) throw new Error(`Session ${id} not found`)
      const patch = (typeof updater === 'function' ? updater(session) : updater) as Partial<Session>
      const updated = { ...session, ...patch }
      sessions.set(id, updated)
      return updated
    })
  ),
  updateMessages: vi.fn((id: string, updater: unknown) =>
    Promise.resolve().then(() => {
      const session = sessions.get(id)
      if (!session) throw new Error(`Session ${id} not found`)
      const next = (typeof updater === 'function' ? updater(session.messages) : updater) as Message[] | undefined
      const updated = { ...session, messages: next ?? [] }
      sessions.set(id, updated)
      return updated
    })
  ),
}))

const SESSION_ID = 'session-1'
const COPILOT_PROMPT = '你是审查员'

function systemMessage(text = COPILOT_PROMPT): Message {
  return { id: 'sys-1', role: 'system', contentParts: [{ type: 'text', text }] }
}

function userMessage(): Message {
  return { id: 'user-1', role: 'user', contentParts: [{ type: 'text', text: '你好' }] }
}

function seedSession(partial: Partial<Session> = {}) {
  const session: Session = {
    id: SESSION_ID,
    name: '测试会话',
    messages: [systemMessage(), userMessage()],
    copilotId: 'patent-copilot:04',
    picUrl: 'copilot.png',
    ...partial,
  }
  sessions.set(SESSION_ID, session)
  return session
}

describe('detachCopilot', () => {
  beforeEach(() => {
    sessions.clear()
  })

  test('未挂载搭档时不做任何修改', async () => {
    seedSession({ copilotId: undefined, messages: [userMessage()] })

    await detachCopilot(SESSION_ID)

    const session = sessions.get(SESSION_ID)
    expect(session?.messages).toHaveLength(1)
    expect(session?.messages[0].id).toBe('user-1')
  })

  test('默认行为：清空搭档字段并删掉那条 system 消息', async () => {
    seedSession()

    await detachCopilot(SESSION_ID)

    const session = sessions.get(SESSION_ID)
    expect(session?.copilotId).toBeUndefined()
    expect(session?.picUrl).toBeUndefined()
    expect(session?.copilotPinned).toBeUndefined()
    expect(session?.messages).toHaveLength(1)
    expect(session?.messages[0].id).toBe('user-1')
  })

  test('expectedPrompt 匹配时才删除 system 消息（手动摘除路径）', async () => {
    seedSession()

    await detachCopilot(SESSION_ID, { expectedPrompt: COPILOT_PROMPT })

    const session = sessions.get(SESSION_ID)
    expect(session?.copilotId).toBeUndefined()
    expect(session?.messages).toHaveLength(1)
    expect(session?.messages[0].id).toBe('user-1')
  })

  test('expectedPrompt 不匹配时保留 system 消息，避免误删自定义 system', async () => {
    seedSession({ messages: [systemMessage('用户自定义的 system'), userMessage()] })

    await detachCopilot(SESSION_ID, { expectedPrompt: COPILOT_PROMPT })

    const session = sessions.get(SESSION_ID)
    expect(session?.copilotId).toBeUndefined()
    expect(session?.messages).toHaveLength(2)
    expect(session?.messages[0].id).toBe('sys-1')
  })

  test('没有 system 消息时只清空搭档字段', async () => {
    seedSession({ messages: [userMessage()] })

    await detachCopilot(SESSION_ID)

    const session = sessions.get(SESSION_ID)
    expect(session?.copilotId).toBeUndefined()
    expect(session?.messages).toHaveLength(1)
    expect(session?.messages[0].id).toBe('user-1')
  })

  test('会话不存在时安全返回', async () => {
    await expect(detachCopilot('missing-session')).resolves.toBeUndefined()
    expect(sessions.size).toBe(0)
  })
})
