/**
 * Skills Search - 跨注册中心搜索
 * 参考 Cherry Studio: src/renderer/utils/skillSearch.ts
 * 但改为 main 进程执行（避免跨域）
 */

import { net } from 'electron'
import type { SkillSearchResult } from '../../shared/skills/types'

const CLAUDE_PLUGINS_API = 'https://api.claude-plugins.dev/api/skills'
const SKILLS_SH_API = 'https://skills.sh/api/search'
const CLAWHUB_API = 'https://clawhub.ai/api/v1/search'
const REQUEST_TIMEOUT = 15000

async function fetchWithTimeout(url: string): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  try {
    const response = await net.fetch(url, {
      signal: controller.signal as any,
      headers: { 'User-Agent': 'PatentHub/1.3' },
    })
    clearTimeout(timer)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (error) {
    clearTimeout(timer)
    throw error
  }
}

async function searchClaudePlugins(query: string): Promise<SkillSearchResult[]> {
  try {
    const url = `${CLAUDE_PLUGINS_API}?q=${encodeURIComponent(query)}&limit=20`
    const data = await fetchWithTimeout(url)
    return (data.skills || []).map((s: any) => ({
      slug: s.id,
      name: s.name,
      description: s.description || null,
      author: s.author || s.namespace || null,
      stars: s.stars || 0,
      downloads: s.installs || 0,
      sourceRegistry: 'claude-plugins.dev' as const,
      sourceUrl: s.sourceUrl || null,
      installSource: `claude-plugins:${s.metadata?.repoOwner || ''}/${s.metadata?.repoName || ''}/${s.metadata?.directoryPath || ''}`,
    }))
  } catch {
    return []
  }
}

async function searchSkillsSh(query: string): Promise<SkillSearchResult[]> {
  try {
    const url = `${SKILLS_SH_API}?q=${encodeURIComponent(query)}`
    const data = await fetchWithTimeout(url)
    return (data.skills || []).map((s: any) => ({
      slug: s.id,
      name: s.name,
      description: null,
      author: s.source?.split('/')[0] || null,
      stars: 0,
      downloads: s.installs || 0,
      sourceRegistry: 'skills.sh' as const,
      sourceUrl: s.source ? `https://github.com/${s.source}` : null,
      installSource: `skills.sh:${s.id}`,
    }))
  } catch {
    return []
  }
}

async function searchClawhub(query: string): Promise<SkillSearchResult[]> {
  try {
    const url = `${CLAWHUB_API}?q=${encodeURIComponent(query)}`
    const data = await fetchWithTimeout(url)
    return (data.results || []).map((s: any) => ({
      slug: s.slug,
      name: s.displayName,
      description: s.summary || null,
      author: null,
      stars: 0,
      downloads: 0,
      sourceRegistry: 'clawhub.ai' as const,
      sourceUrl: `https://clawhub.ai/skills/${s.slug}`,
      installSource: `clawhub:${s.slug}`,
    }))
  } catch {
    return []
  }
}

export async function searchSkills(query: string): Promise<SkillSearchResult[]> {
  if (!query.trim()) return []

  const results = await Promise.allSettled([
    searchSkillsSh(query),
    searchClaudePlugins(query),
    searchClawhub(query),
  ])

  const allResults: SkillSearchResult[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value)
    }
  }

  // 按名称去重（保留第一个）
  const seen = new Set<string>()
  return allResults.filter((r) => {
    const key = r.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}