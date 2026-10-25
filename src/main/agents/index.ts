/**
 * Agents Module Entry - 注册 IPC handlers（重写版 v3）
 *
 * 修复点：
 * 1. 补齐 agents:selectDir（preload 引用了但 main 缺失）
 * 2. 移除 AgentExecutor 外部的事件转发（AgentExecutor 现在自己 broadcast）
 * 3. 保留必要的 IPC：CRUD / Skills 关联 / Git Bash / 权限响应 / Agent 运行控制
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import { agentService } from './AgentService'
import { detectGitBash } from './gitBashDetector'
import { permissionManager } from './PermissionManager'
import { getOrCreateExecutor, markAgentSessionRunning, removeExecutor } from './AgentExecutor'
import { attachmentService, type IncomingAttachmentFile } from './AttachmentService'
import type { AgentEntity, PermissionDecision } from '../../shared/agents/types'

/** 解析附件落盘的基目录：优先用 agent 的工作目录，否则用 userData 兜底 */
function resolveAgentBaseDir(agent: AgentEntity): string {
  if (agent.workingDirectories && agent.workingDirectories[0]) {
    return agent.workingDirectories[0]
  }
  const { app } = require('electron')
  return require('path').join(app.getPath('userData'), 'agent-attachments', agent.id)
}

export async function initializeAgentsModule() {
  // ============ CRUD ============
  ipcMain.handle('agents:list', async () => agentService.list())
  ipcMain.handle('agents:getById', async (_, id: string) => agentService.getById(id))
  ipcMain.handle('agents:create', async (_, data) => agentService.create(data))
  ipcMain.handle('agents:update', async (_, id: string, data) => agentService.update(id, data))
  ipcMain.handle('agents:delete', async (_, id: string) => agentService.delete(id))

  // ============ Skills 关联 ============
  ipcMain.handle('agents:getSkills', async (_, agentId: string) => agentService.getSkills(agentId))
  ipcMain.handle('agents:toggleSkill', async (_, agentId: string, skillId: string, isEnabled: boolean) =>
    agentService.toggleSkill(agentId, skillId, isEnabled)
  )

  // ============ Git Bash 自动发现 ============
  ipcMain.handle('agents:detectGitBash', async () => detectGitBash())
  ipcMain.handle('agents:selectGitBashPath', async () => {
    const windows = BrowserWindow.getAllWindows()
    const win = windows[0]
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      title: '选择 Git Bash 可执行文件',
      properties: ['openFile'],
      filters: [
        { name: 'Executable', extensions: ['exe'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ============ 工作目录选择（补齐缺失）============
  ipcMain.handle('agents:selectDir', async (_, defaultPath?: string) => {
    const windows = BrowserWindow.getAllWindows()
    const win = windows[0]
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      title: '选择工作目录',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: defaultPath || undefined,
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ============ 附件落盘（Agent 通用文件上传）============
  ipcMain.handle('agents:addAttachments', async (_, params: { agentId: string; sessionId: string; files: IncomingAttachmentFile[] }) => {
    const agent = await agentService.getById(params.agentId)
    if (!agent) throw new Error(`Agent 不存在: ${params.agentId}`)
    const baseDir = resolveAgentBaseDir(agent)
    return attachmentService.add({ baseDir, sessionId: params.sessionId, files: params.files || [] })
  })

  ipcMain.handle('agents:listAttachments', async (_, params: { agentId: string; sessionId: string }) => {
    const agent = await agentService.getById(params.agentId)
    if (!agent) return []
    const baseDir = resolveAgentBaseDir(agent)
    return attachmentService.list(baseDir, params.sessionId)
  })

  ipcMain.handle('agents:cleanupAttachments', async (_, params: { agentId: string; sessionId: string }) => {
    const agent = await agentService.getById(params.agentId)
    if (!agent) return true
    const baseDir = resolveAgentBaseDir(agent)
    attachmentService.cleanup(baseDir, params.sessionId)
    return true
  })

  // ============ 权限询问响应 ============
  ipcMain.handle('agents:respondPermission', async (_, eventId: string, decision: PermissionDecision, alwaysAllow?: boolean) => {
    const handled = permissionManager.respondToRequest(eventId, decision, alwaysAllow)
    if (handled && alwaysAllow && decision === 'allow') {
      // TODO: 持久化「始终允许」到数据库
      // 这里需要知道是哪个 agent + tool，简化版本暂不持久化
    }
    return handled
  })

  // ============ Agent 执行控制 ============
  ipcMain.handle('agents:runAgent', async (_, params: {
    agentId: string
    sessionId: string
    userMessage: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
    history?: any[]
    attachments?: import('../../shared/agents/types').AgentAttachment[]
    permissionMode?: import('../../shared/agents/types').AgentPermissionMode
  }) => {
    const agent = await agentService.getById(params.agentId)
    if (!agent) {
      throw new Error(`Agent 不存在: ${params.agentId}`)
    }

    // 会话级权限模式覆盖（不持久化到 agent 本身）
    const effectiveAgent = params.permissionMode
      ? { ...agent, permissionMode: params.permissionMode }
      : agent

    const executor = getOrCreateExecutor(params.sessionId)
    // 标记该会话为运行中：关闭窗口 / 退出应用前需要二次确认（见 main.ts 的 close-guard）
    markAgentSessionRunning(params.sessionId)

    // 注：AgentExecutor 内部已经自己 broadcast 所有事件到所有 BrowserWindow，
    // 这里不需要再额外转发，避免重复事件。

    // 异步执行，不阻塞 IPC
    executor
      .run({
        agent: effectiveAgent,
        sessionId: params.sessionId,
        userMessage: params.userMessage,
        history: params.history || [],
        attachments: params.attachments || [],
        agentBaseDir: resolveAgentBaseDir(agent),
        sessionIdOverride: params.sessionId,
      })
      .then((result) => {
        // 完成后通知 renderer
        BrowserWindow.getAllWindows().forEach((w) => {
          if (!w.isDestroyed()) {
            w.webContents.send('agent:complete', { sessionId: params.sessionId, ...result })
          }
        })
        removeExecutor(params.sessionId)
      })
      .catch((err) => {
        console.error('[Agents] runAgent error:', err)
        BrowserWindow.getAllWindows().forEach((w) => {
          if (!w.isDestroyed()) {
            w.webContents.send('agent:error', { sessionId: params.sessionId, error: err.message })
          }
        })
        removeExecutor(params.sessionId)
      })

    return { started: true, sessionId: params.sessionId }
  })

  ipcMain.handle('agents:stopAgent', async (_, sessionId: string) => {
    const executor = getOrCreateExecutor(sessionId)
    executor.abort()
    removeExecutor(sessionId)
    return true
  })

  // ============ 自动批准工具管理 ============
  ipcMain.handle('agents:setAutoApproveTools', async (_, agentId: string, toolNames: string[]) => {
    await agentService.setAutoApproveTools(agentId, toolNames as any)
    return true
  })

  ipcMain.handle('agents:getAutoApproveTools', async (_, agentId: string) => {
    return agentService.getAutoApproveTools(agentId)
  })

  console.log('[Agents] Module initialized')
}
