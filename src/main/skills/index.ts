/**
 * Skills Module Entry - 注册 IPC handlers
 */

import { ipcMain } from 'electron'
import { initializeDatabase } from './database'
import { skillService } from './SkillService'
import { searchSkills } from './search'

export async function initializeSkillsModule() {
  // 初始化数据库
  await initializeDatabase()

  // 注册 IPC handlers
  ipcMain.handle('skills:list', async () => {
    return skillService.list()
  })

  ipcMain.handle('skills:getById', async (_, id: string) => {
    return skillService.getById(id)
  })

  ipcMain.handle('skills:install', async (_, installSource: string) => {
    return skillService.install(installSource)
  })

  ipcMain.handle('skills:installFromZip', async (_, zipPath: string) => {
    return skillService.installFromZip(zipPath)
  })

  ipcMain.handle('skills:installFromDirectory', async (_, dirPath: string) => {
    return skillService.installFromDirectory(dirPath)
  })

  ipcMain.handle('skills:uninstall', async (_, skillId: string) => {
    return skillService.uninstall(skillId)
  })

  ipcMain.handle('skills:search', async (_, query: string) => {
    return searchSkills(query)
  })

  console.log('[Skills] Module initialized')
}