import type { Session } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { migrateCopilotId, migrateSession } from './session-utils'

describe('migrateCopilotId', () => {
  it('把当前版本的旧编号映射为重编号后的 id', () => {
    expect(migrateCopilotId('patent-copilot:02-search-elements')).toBe('patent-copilot:03-search-elements')
    expect(migrateCopilotId('patent-copilot:03-non-patent-search')).toBe('patent-copilot:04-non-patent-search')
    expect(migrateCopilotId('patent-copilot:04-office-action-writing')).toBe('patent-copilot:05-office-action-writing')
    expect(migrateCopilotId('patent-copilot:05-disclosure-sufficiency')).toBe(
      'patent-copilot:06-disclosure-sufficiency'
    )
    expect(migrateCopilotId('patent-copilot:06-formality-defects')).toBe('patent-copilot:07-formality-defects')
    expect(migrateCopilotId('patent-copilot:07-office-action-response')).toBe(
      'patent-copilot:08-office-action-response'
    )
    expect(migrateCopilotId('patent-copilot:08-claim-cgk')).toBe('patent-copilot:09-claim-cgk')
    expect(migrateCopilotId('patent-copilot:09-translation')).toBe('patent-copilot:10-translation')
  })

  it('只做单次查表，不做级联映射', () => {
    expect(migrateCopilotId('patent-copilot:02-search-elements')).not.toBe('patent-copilot:04-non-patent-search')
    expect(migrateCopilotId('patent-copilot:08-claim-cgk')).toBe('patent-copilot:09-claim-cgk')
  })

  it('兼容 V1 时期遗留 id', () => {
    expect(migrateCopilotId('patent-copilot:02-claim-cgk')).toBe('patent-copilot:09-claim-cgk')
    expect(migrateCopilotId('patent-copilot:03-translation')).toBe('patent-copilot:10-translation')
    expect(migrateCopilotId('patent-copilot:04-search-expression')).toBe('patent-copilot:03-search-elements')
    expect(migrateCopilotId('patent-copilot:08-creative-review')).toBe('patent-copilot:05-office-action-writing')
  })

  it('当前编号、自定义搭档与远程搭档 id 原样返回', () => {
    expect(migrateCopilotId('patent-copilot:01-invention')).toBe('patent-copilot:01-invention')
    expect(migrateCopilotId('patent-copilot:02-popular-science')).toBe('patent-copilot:02-popular-science')
    expect(migrateCopilotId('patent-copilot:10-translation')).toBe('patent-copilot:10-translation')
    expect(migrateCopilotId('my-copilot-01-invention-search')).toBe('my-copilot-01-invention-search')
  })

  it('未挂载搭档（undefined）保持 undefined', () => {
    expect(migrateCopilotId(undefined)).toBeUndefined()
  })
})

describe('migrateSession', () => {
  it('重写 copilotId 并保留其余字段', () => {
    const session = {
      id: 'session-1',
      name: '测试会话',
      messages: [{ id: 'm1', role: 'user', contentParts: [{ type: 'text', text: '你好' }] }],
      copilotId: 'patent-copilot:09-translation',
      copilotPinned: true,
    } as unknown as Session

    const migrated = migrateSession(session)

    expect(migrated.copilotId).toBe('patent-copilot:10-translation')
    expect(migrated.copilotPinned).toBe(true)
    expect(migrated.id).toBe('session-1')
    expect(migrated.messages).toHaveLength(1)
  })

  it('未挂载搭档时 copilotId 保持 undefined', () => {
    const session = { id: 'session-2', name: '空会话', messages: [] } as unknown as Session

    expect(migrateSession(session).copilotId).toBeUndefined()
  })
})
