import type { Session, SessionMeta } from '@shared/types'
import { mapValues } from 'lodash'
import { migrateMessage } from '../../shared/utils/message'

/**
 * 内置审查搭档 ID 重编号映射（一次性迁移）。
 *
 * 2026-10 起「科普大白」插入第 2 位，其余内置搭档顺延一位，ID 中的编号同步调整。
 * 会话里持久化的 `copilotId` 仍是旧编号，读取时统一改写，避免以下问题：
 * - 顶部搭档按钮 / 菜单高亮失效（显示「选择搭档」）
 * - InputBox 搭档 Chip 不显示
 * - 手动「移除搭档」时 `detachCopilot` 的 expectedPrompt 比对失败，system 提示词残留
 *
 * 注意：只做「单次查表」，不能按顺序反复 replace，否则 02→03 会继续被 03→04 命中。
 */
const COPILOT_ID_RENAMES: Record<string, string> = {
  // 当前版本（v1.4.5 及以前）→ 重编号后
  'patent-copilot:02-search-elements': 'patent-copilot:03-search-elements',
  'patent-copilot:03-non-patent-search': 'patent-copilot:04-non-patent-search',
  'patent-copilot:04-office-action-writing': 'patent-copilot:05-office-action-writing',
  'patent-copilot:05-disclosure-sufficiency': 'patent-copilot:06-disclosure-sufficiency',
  'patent-copilot:06-formality-defects': 'patent-copilot:07-formality-defects',
  'patent-copilot:07-office-action-response': 'patent-copilot:08-office-action-response',
  'patent-copilot:08-claim-cgk': 'patent-copilot:09-claim-cgk',
  'patent-copilot:09-translation': 'patent-copilot:10-translation',
  // V1 时期遗留 id（更早版本，此前未做过迁移）
  'patent-copilot:02-claim-cgk': 'patent-copilot:09-claim-cgk',
  'patent-copilot:03-translation': 'patent-copilot:10-translation',
  'patent-copilot:04-search-expression': 'patent-copilot:03-search-elements',
  'patent-copilot:08-creative-review': 'patent-copilot:05-office-action-writing',
}

/** 把会话上持久化的旧搭档 id 迁移为当前 id；未收录的 id 原样返回。 */
export function migrateCopilotId(copilotId?: string): string | undefined {
  if (!copilotId) return copilotId
  return COPILOT_ID_RENAMES[copilotId] ?? copilotId
}

export function migrateSession(session: Session): Session {
  return {
    ...session,
    copilotId: migrateCopilotId(session.copilotId),
    settings: {
      // temperature未设置的时候使用默认值undefined，这样才能覆盖全局设置
      temperature: undefined,
      ...session.settings,
    },
    messages: session.messages?.map((m) => migrateMessage(m)) || [],
    threads: session.threads?.map((t) => ({
      ...t,
      messages: t.messages.map((m) => migrateMessage(m)) || [],
    })),
    messageForksHash: mapValues(session.messageForksHash || {}, (forks) => ({
      ...forks,
      lists:
        forks.lists?.map((list) => ({
          ...list,
          messages: list.messages?.map((m) => migrateMessage(m)) || [],
        })) || [],
    })),
  }
}

export function sortSessions(sessions: SessionMeta[]): SessionMeta[] {
  const reversed: SessionMeta[] = []
  const pinned: SessionMeta[] = []
  for (const sess of sessions) {
    // Skip hidden sessions (e.g., migrated picture sessions)
    if (sess.hidden) {
      continue
    }
    if (sess.starred) {
      pinned.push(sess)
      continue
    }
    reversed.unshift(sess)
  }
  return pinned.concat(reversed)
}
