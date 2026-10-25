// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronIPC } from 'src/shared/electron-types'

const electronHandler: ElectronIPC = {
  invoke: ipcRenderer.invoke,
  onSystemThemeChange: (callback: () => void) => {
    ipcRenderer.on('system-theme-updated', callback)
    return () => ipcRenderer.off('system-theme-updated', callback)
  },
  onWindowMaximizedChanged: (callback: (_: Electron.IpcRendererEvent, windowMaximized: boolean) => void) => {
    ipcRenderer.on('window:maximized-changed', callback)
    return () => ipcRenderer.off('window:maximized-changed', callback)
  },
  onWindowFocused: (callback: (_: Electron.IpcRendererEvent) => void) => {
    ipcRenderer.on('window:focused', callback)
    return () => ipcRenderer.off('window:focused', callback)
  },
  onWindowShow: (callback: () => void) => {
    ipcRenderer.on('window-show', callback)
    return () => ipcRenderer.off('window-show', callback)
  },
  onUpdateDownloaded: (callback: () => void) => {
    ipcRenderer.on('update-downloaded', callback)
    return () => ipcRenderer.off('update-downloaded', callback)
  },
  addMcpStdioTransportEventListener: (transportId: string, event: string, callback?: (...args: any[]) => void) => {
    ipcRenderer.on(`mcp:stdio-transport:${transportId}:${event}`, (_event, ...args) => {
      callback?.(...args)
    })
  },
  onNavigate: (callback: (path: string) => void) => {
    const listener = (_event: unknown, path: string) => {
      callback(path)
    }
    ipcRenderer.on('navigate-to', listener)
    return () => ipcRenderer.off('navigate-to', listener)
  },

  // ========== Skills ==========
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    getById: (id: string) => ipcRenderer.invoke('skills:getById', id),
    install: (source: string) => ipcRenderer.invoke('skills:install', source),
    installFromZip: (zipPath: string) => ipcRenderer.invoke('skills:installFromZip', zipPath),
    installFromDirectory: (dirPath: string) => ipcRenderer.invoke('skills:installFromDirectory', dirPath),
    uninstall: (id: string) => ipcRenderer.invoke('skills:uninstall', id),
    search: (query: string) => ipcRenderer.invoke('skills:search', query),
    readFile: (skillId: string, filename: string) => ipcRenderer.invoke('skills:readFile', skillId, filename),
    listFiles: (skillId: string) => ipcRenderer.invoke('skills:listFiles', skillId),
  },

  // ========== Agents ==========
  agents: {
    list: () => ipcRenderer.invoke('agents:list'),
    getById: (id: string) => ipcRenderer.invoke('agents:getById', id),
    create: (data: any) => ipcRenderer.invoke('agents:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('agents:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('agents:delete', id),
    getSkills: (agentId: string) => ipcRenderer.invoke('agents:getSkills', agentId),
    toggleSkill: (agentId: string, skillId: string, isEnabled: boolean) =>
      ipcRenderer.invoke('agents:toggleSkill', agentId, skillId, isEnabled),

    // v2 扩展
    detectGitBash: () => ipcRenderer.invoke('agents:detectGitBash'),
    selectGitBashPath: () => ipcRenderer.invoke('agents:selectGitBashPath'),
    selectDir: () => ipcRenderer.invoke('agents:selectDir'),
    setAutoApproveTools: (agentId: string, toolNames: string[]) =>
      ipcRenderer.invoke('agents:setAutoApproveTools', agentId, toolNames),
    getAutoApproveTools: (agentId: string) =>
      ipcRenderer.invoke('agents:getAutoApproveTools', agentId),

    // 权限询问响应
    respondPermission: (eventId: string, decision: 'allow' | 'deny', alwaysAllow?: boolean) =>
      ipcRenderer.invoke('agents:respondPermission', eventId, decision, alwaysAllow),

    // 附件落盘（Agent 通用文件上传）
    addAttachments: (params: { agentId: string; sessionId: string; files: Array<{ name: string; path?: string; bytes?: Uint8Array }> }) =>
      ipcRenderer.invoke('agents:addAttachments', params),
    listAttachments: (params: { agentId: string; sessionId: string }) =>
      ipcRenderer.invoke('agents:listAttachments', params),
    cleanupAttachments: (params: { agentId: string; sessionId: string }) =>
      ipcRenderer.invoke('agents:cleanupAttachments', params),

    // Agent 运行控制
    runAgent: (params: {
      agentId: string
      sessionId: string
      userMessage: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
      attachments?: Array<{ id: string; name: string; absPath: string; relPath: string; size: number; mime: string; kind: string; text?: string; isImage: boolean; ocrNeeded?: boolean; pages?: number }>
      permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
    }) => ipcRenderer.invoke('agents:runAgent', params),
    stopAgent: (sessionId: string) => ipcRenderer.invoke('agents:stopAgent', sessionId),

    // 事件订阅
    onPermissionRequest: (callback: (request: any) => void) => {
      const listener = (_event: any, request: any) => callback(request)
      ipcRenderer.on('agent:permission:request', listener)
      return () => ipcRenderer.off('agent:permission:request', listener)
    },
    onToolStart: (callback: (event: any) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('agent:tool:start', listener)
      return () => ipcRenderer.off('agent:tool:start', listener)
    },
    onToolComplete: (callback: (event: any) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('agent:tool:complete', listener)
      return () => ipcRenderer.off('agent:tool:complete', listener)
    },
    onAgentMessage: (callback: (event: any) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('agent:message', listener)
      return () => ipcRenderer.off('agent:message', listener)
    },
    onAgentComplete: (callback: (event: any) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('agent:complete', listener)
      return () => ipcRenderer.off('agent:complete', listener)
    },
    onTodoUpdate: (callback: (event: any) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('agent:todo:update', listener)
      return () => ipcRenderer.off('agent:todo:update', listener)
    },
    /**
     * 新增：LLM 流式 chunk 事件订阅（v3）
     * 用于实时显示 LLM 输出的每个 token 片段
     */
    onAgentChunk: (callback: (event: { sessionId: string; content: string }) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('agent:llm-chunk', listener)
      return () => ipcRenderer.off('agent:llm-chunk', listener)
    },
    /**
     * 新增：Agent 错误事件（v3）
     */
    onAgentError: (callback: (event: { sessionId: string; error: string }) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('agent:error', listener)
      return () => ipcRenderer.off('agent:error', listener)
    },
    /**
     * 新增：Agent 中止事件（v3）
     */
    onAgentAborted: (callback: (event: { sessionId: string }) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('agent:aborted', listener)
      return () => ipcRenderer.off('agent:aborted', listener)
    },

    // ============ 以下为已废弃的反模式 API（v2 遗留）============
    // 旧版通过 renderer 转发 LLM 请求的设计已废弃，新版 main 端直连 LLM
    // 保留仅为兼容可能的旧调用方，新代码请使用 onAgentChunk + runAgent
    onLLMRequest: (callback: (request: any) => void) => {
      console.warn('[electronAPI.agents.onLLMRequest] 已废弃，请使用 onAgentChunk')
      const listener = (_event: any, request: any) => callback(request)
      ipcRenderer.on('ipc:agent-llm-request', listener)
      return () => ipcRenderer.off('ipc:agent-llm-request', listener)
    },
    respondLLM: (eventId: string, data: any, error?: string) => {
      console.warn('[electronAPI.agents.respondLLM] 已废弃')
      ipcRenderer.send('ipc:agent-llm-response', { eventId, data, error })
    },
  },

  pdf: {
    selectFile: () => ipcRenderer.invoke('pdf:selectFile'),
    translate: (params: any) => ipcRenderer.invoke('pdf:translate', params),
    cancel: (sessionId: string) => ipcRenderer.invoke('pdf:cancel', sessionId),
    export: (params: any) => ipcRenderer.invoke('pdf:export', params),
    getPageCount: (filePath: string) => ipcRenderer.invoke('pdf:getPageCount', filePath),
    cleanup: (sessionId: string) => ipcRenderer.invoke('pdf:cleanup', sessionId),
    onProgress: (callback: (progress: any) => void) => {
      const listener = (_event: any, progress: any) => {
        callback(progress)
      }
      ipcRenderer.on('pdf:progress', listener)
      return () => ipcRenderer.off('pdf:progress', listener)
    },
  },

  convertPDF: (params: {
    service: string
    filePath: string
    apiKey: string
    rebuildMode?: 'auto' | 'json' | 'markdown'
    myOcrOptions?: {
      languages?: string[]
      deskew?: boolean
      rotatePages?: boolean
      outputType?: 'pdf' | 'pdfa' | 'pdfa-1' | 'pdfa-2'
      jobs?: number
      binaryPath?: string
      tesseractPath?: string
    }
  }) => ipcRenderer.invoke('pdf-convert:convert', params),

  detectMyOcrEnv: () => ipcRenderer.invoke('pdf-convert:detect-myocr-env'),

  onPDFConvertProgress: (callback: (data: { progress: number; message: string; currentPage?: number; totalPages?: number }) => void) => {
    const listener = (_event: any, data: { progress: number; message: string; currentPage?: number; totalPages?: number }) => {
      callback(data)
    }
    ipcRenderer.on('pdf-convert:progress', listener)
    return () => ipcRenderer.off('pdf-convert:progress', listener)
  },

  testPDFConnection: (params: { service: string; apiKey: string }) =>
    ipcRenderer.invoke('pdf-convert:test-connection', params),

  getPDFConvertGlobalConfig: (service: string) =>
    ipcRenderer.invoke('pdf-convert:get-global-config', service),

  savePDFConvertGlobalConfig: (params: { service: string; config: { apiKey?: string } }) =>
    ipcRenderer.invoke('pdf-convert:save-global-config', params),
}

contextBridge.exposeInMainWorld('electronAPI', electronHandler)