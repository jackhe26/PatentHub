import type { CopilotDetail } from '@shared/types'
import { getPinyin } from './pinyinIndex'

export type CopilotCandidate = {
  copilot: CopilotDetail
  /** 1-based 序号，与 UI 徽章一致，用于 /1 ~ /9 检索 */
  index: number
  /** 归一化后的名称（小写、去空白） */
  name: string
  initials: string
  full: string
}

const WHITESPACE_RE = /[\s\u3000]+/g

function normalize(value: string): string {
  return value.toLowerCase().replace(WHITESPACE_RE, '')
}

export function buildCandidates(copilots: CopilotDetail[]): CopilotCandidate[] {
  return copilots.map((copilot, position) => {
    const pinyin = getPinyin(copilot.name)
    return {
      copilot,
      index: position + 1,
      name: normalize(copilot.name),
      initials: pinyin.initials.toLowerCase(),
      full: pinyin.full.toLowerCase(),
    }
  })
}

/** 单个 token 打分；返回 -1 表示不匹配 */
function scoreToken(candidate: CopilotCandidate, token: string): number {
  if (/^\d+$/.test(token)) {
    return Number(token) === candidate.index ? 1000 : -1
  }

  const position = candidate.name.indexOf(token)
  if (position >= 0) return 900 - position

  if (candidate.initials?.startsWith(token)) return 800
  if (candidate.full?.startsWith(token)) return 750
  if (candidate.initials?.includes(token)) return 700
  if (candidate.full?.includes(token)) return 650

  return -1
}

/**
 * 按关键词（中文 / 拼音首字母 / 全拼 / 序号）过滤并排序搭档。
 * 多个 token 之间为 AND 关系，例：/通知书 撰写、/tzs fz。
 */
export function matchCopilots(candidates: CopilotCandidate[], query: string): CopilotCandidate[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return candidates

  const tokens = trimmed.split(WHITESPACE_RE).map(normalize).filter(Boolean)
  if (!tokens.length) return candidates

  const scored: Array<{ candidate: CopilotCandidate; score: number }> = []
  for (const candidate of candidates) {
    let score = 0
    let matched = true
    for (const token of tokens) {
      const tokenScore = scoreToken(candidate, token)
      if (tokenScore < 0) {
        matched = false
        break
      }
      score += tokenScore
    }
    if (matched) scored.push({ candidate, score })
  }

  scored.sort((a, b) => b.score - a.score || a.candidate.index - b.candidate.index)
  return scored.map((entry) => entry.candidate)
}
