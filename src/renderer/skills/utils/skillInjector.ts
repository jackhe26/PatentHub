/**
 * SkillInjector - 在 System Prompt 中注入已启用的 Skills
 */

import type { Message } from '@shared/types'
import { getMessageText } from '@shared/utils/message'

const SKILL_PREFIX = '\n\n---\n🔧 **以下 Skills 已启用，请在回答时遵循相关能力：**\n\n'

/**
 * 从 Agent 配置中提取启用的 Skills 内容，注入到 System Prompt
 * 参考 Cherry Studio: src/renderer/utils/skillManager.ts 的 useSkillPrompt
 */
export function injectSkillsToSystemPrompt(
  systemMsg: Message | undefined,
  skillContents: string[]
): Message | undefined {
  if (!systemMsg || skillContents.length === 0) {
    return systemMsg
  }

  const originalText = getMessageText(systemMsg, false, false)
  const skillBlock = SKILL_PREFIX + skillContents.map((c, i) => `**Skill ${i + 1}:**\n${c}`).join('\n\n')
  const newText = originalText + skillBlock

  // 更新 contentParts（Message 使用 contentParts 数组存储内容）
  const newContentParts = [...systemMsg.contentParts]
  const lastTextIx = newContentParts.findLastIndex((p: any) => p.type === 'text')
  if (lastTextIx >= 0) {
    newContentParts[lastTextIx] = { type: 'text', text: newText }
  } else {
    newContentParts.push({ type: 'text', text: newText })
  }

  return {
    ...systemMsg,
    contentParts: newContentParts,
  }
}

/**
 * 构建 Skills 内容（从 skill readmes 拼接）
 */
export function buildSkillContents(readmes: string[]): string[] {
  return readmes.filter((r) => r.trim().length > 0)
}