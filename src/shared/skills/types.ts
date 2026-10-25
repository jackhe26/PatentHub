/**
 * Skills shared types - 跨进程共享的 Skill 类型
 * 参考 Cherry Studio: src/shared/types/skill.ts
 */

// ============================================================================
// Skill 安装源
// ============================================================================

export type SkillInstallSource =
  | { type: 'claude-plugins'; owner: string; repo: string; path?: string }
  | { type: 'skills-sh'; owner: string; repo: string }
  | { type: 'clawhub'; slug: string }
  | { type: 'zip'; path: string }
  | { type: 'directory'; path: string }

// ============================================================================
// 已安装 Skill (数据库实体)
// ============================================================================

export interface InstalledSkill {
  id: string
  name: string
  description: string | null
  folderName: string
  source: string
  sourceUrl: string | null
  author: string | null
  tags: string[]
  contentHash: string
  isEnabled: boolean
  createdAt: string
  updatedAt: string
}

// ============================================================================
// Skill 搜索相关
// ============================================================================

export interface SkillSearchResult {
  slug: string
  name: string
  description: string | null
  author: string | null
  stars: number
  downloads: number
  sourceRegistry: 'claude-plugins.dev' | 'skills.sh' | 'clawhub.ai'
  sourceUrl: string | null
  installSource: string // 序列化的安装源，如 "claude-plugins:owner/repo/path"
}

// ============================================================================
// Skill 文件节点 (用于文件浏览器)
// ============================================================================

export interface SkillFileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: SkillFileNode[]
}

// ============================================================================
// IPC API 类型
// ============================================================================

export interface SkillsApi {
  list: () => Promise<InstalledSkill[]>
  getById: (id: string) => Promise<InstalledSkill | null>
  install: (installSource: string) => Promise<InstalledSkill>
  installFromZip: (zipFilePath: string) => Promise<InstalledSkill>
  installFromDirectory: (directoryPath: string) => Promise<InstalledSkill>
  uninstall: (skillId: string) => Promise<void>
  search: (query: string) => Promise<SkillSearchResult[]>
  readFile: (skillId: string, filename: string) => Promise<string | null>
  listFiles: (skillId: string) => Promise<SkillFileNode[]>
}