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

  // ========== PDF 格式转换（OCR）新增接口 ==========
  /**
   * 调用 PDF 转换服务（当前支持 MinerU / myOCR），将扫描/图片型 PDF 转为可搜索 PDF。
   * v8.0: 新增 myOCR (OCRmyPDF 本地版)，不需要 API Key，但需要 myOcrOptions
   */
  convertPDF: (params: {
    service: string
    filePath: string
    apiKey: string
    rebuildMode?: 'auto' | 'json' | 'markdown'
    /** v8.0: myOCR 专用参数 */
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

  /**
   * v8.0: 检测 myOCR 本地环境状态（ocrmypdf / tesseract / ghostscript）
   */
  detectMyOcrEnv: () => ipcRenderer.invoke('pdf-convert:detect-myocr-env'),

  /**
   * 监听 PDF 转换进度事件。
   */
  onPDFConvertProgress: (callback: (data: { progress: number; message: string; currentPage?: number; totalPages?: number }) => void) => {
    const listener = (_event: any, data: { progress: number; message: string; currentPage?: number; totalPages?: number }) => {
      callback(data)
    }
    ipcRenderer.on('pdf-convert:progress', listener)
    return () => ipcRenderer.off('pdf-convert:progress', listener)
  },

  /**
   * 测试服务商连接（验证 API Key）。
   */
  testPDFConnection: (params: { service: string; apiKey: string }) =>
    ipcRenderer.invoke('pdf-convert:test-connection', params),

  /**
   * 读取全局 PDF 转换配置（如 API Key）。
   */
  getPDFConvertGlobalConfig: (service: string) =>
    ipcRenderer.invoke('pdf-convert:get-global-config', service),

  /**
   * 保存全局 PDF 转换配置。
   */
  savePDFConvertGlobalConfig: (params: { service: string; config: { apiKey?: string } }) =>
    ipcRenderer.invoke('pdf-convert:save-global-config', params),
}

contextBridge.exposeInMainWorld('electronAPI', electronHandler)