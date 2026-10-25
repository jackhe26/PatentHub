/**
 * Skills API - 前端 IPC 调用封装
 */

import type { InstalledSkill, SkillSearchResult } from '../../../shared/skills/types'

export const skillApi = {
  list: (): Promise<InstalledSkill[]> => window.electronAPI.skills.list(),
  getById: (id: string): Promise<InstalledSkill | null> => window.electronAPI.skills.getById(id),
  install: (source: string): Promise<InstalledSkill> => window.electronAPI.skills.install(source),
  installFromZip: (zipPath: string): Promise<InstalledSkill> => window.electronAPI.skills.installFromZip(zipPath),
  installFromDirectory: (dirPath: string): Promise<InstalledSkill> => window.electronAPI.skills.installFromDirectory(dirPath),
  uninstall: (id: string): Promise<void> => window.electronAPI.skills.uninstall(id),
  search: (query: string): Promise<SkillSearchResult[]> => window.electronAPI.skills.search(query),
}