export interface ElectronIPC {
  invoke: (channel: string, ...args: any[]) => Promise<any>
  onSystemThemeChange: (callback: () => void) => () => void
  onWindowMaximizedChanged: (callback: (_: Electron.IpcRendererEvent, windowMaximized: boolean) => void) => () => void
  onWindowShow: (callback: () => void) => () => void
  onWindowFocused: (callback: () => void) => () => void
  onUpdateDownloaded: (callback: () => void) => () => void
  addMcpStdioTransportEventListener: (transportId: string, event: string, callback?: (...args: any[]) => void) => void
  onNavigate: (callback: (path: string) => void) => () => void

  // Skills & Agents APIs
  skills: {
    list: () => Promise<any[]>
    getById: (id: string) => Promise<any | null>
    install: (source: string) => Promise<any>
    installFromZip: (zipPath: string) => Promise<any>
    installFromDirectory: (dirPath: string) => Promise<any>
    uninstall: (id: string) => Promise<void>
    search: (query: string) => Promise<any[]>
    readFile: (skillId: string, filename: string) => Promise<string | null>
    listFiles: (skillId: string) => Promise<any[]>
  }

  agents: {
    list: () => Promise<any[]>
    getById: (id: string) => Promise<any | null>
    create: (data: any) => Promise<any>
    update: (id: string, data: any) => Promise<any>
    delete: (id: string) => Promise<void>
    getSkills: (agentId: string) => Promise<any[]>
    toggleSkill: (agentId: string, skillId: string, isEnabled: boolean) => Promise<void>

    // v2 扩展
    detectGitBash: () => Promise<{ found: boolean; path?: string }>
    selectGitBashPath: () => Promise<string | null>
    selectDir: (defaultPath?: string) => Promise<string | null>
    setAutoApproveTools: (agentId: string, toolNames: string[]) => Promise<boolean>
    getAutoApproveTools: (agentId: string) => Promise<string[]>

    // 权限询问响应
    respondPermission: (eventId: string, decision: 'allow' | 'deny', alwaysAllow?: boolean) => Promise<boolean>

    // Agent 附件落盘（通用文件上传）
    addAttachments: (params: { agentId: string; sessionId: string; files: Array<{ name: string; path?: string; bytes?: Uint8Array }> }) => Promise<
      Array<{ id: string; name: string; absPath: string; relPath: string; size: number; mime: string; kind: string; text?: string; isImage: boolean; ocrNeeded?: boolean; pages?: number }>
    >
    listAttachments: (params: { agentId: string; sessionId: string }) => Promise<Array<{ id: string; name: string; absPath: string; relPath: string; size: number; mime: string; kind: string; text?: string; isImage: boolean; ocrNeeded?: boolean; pages?: number }>>
    cleanupAttachments: (params: { agentId: string; sessionId: string }) => Promise<boolean>

    // Agent 运行控制
    runAgent: (params: {
      agentId: string
      sessionId: string
      userMessage: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
      attachments?: Array<{
        id: string
        name: string
        absPath: string
        relPath: string
        size: number
        mime: string
        kind: 'text' | 'pdf' | 'doc' | 'image' | 'other'
        text?: string
        isImage: boolean
        ocrNeeded?: boolean
        pages?: number
      }>
      permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
    }) => Promise<{ started: boolean; sessionId: string }>
    stopAgent: (sessionId: string) => Promise<boolean>

    // 事件订阅
    onPermissionRequest: (callback: (request: any) => void) => () => void
    onToolStart: (callback: (event: any) => void) => () => void
    onToolComplete: (callback: (event: any) => void) => () => void
    onAgentMessage: (callback: (event: any) => void) => () => void
    onAgentComplete: (callback: (event: any) => void) => () => void
    onTodoUpdate: (callback: (event: any) => void) => () => void

    // v3 新增事件
    onAgentChunk: (callback: (event: { sessionId: string; content: string }) => void) => () => void
    onAgentError: (callback: (event: { sessionId: string; error: string }) => void) => () => void
    onAgentAborted: (callback: (event: { sessionId: string }) => void) => () => void

    // LLM 转发回调（已废弃，新代码请使用 onAgentChunk + runAgent）
    onLLMRequest: (callback: (request: any) => void) => () => void
    respondLLM: (eventId: string, data: any, error?: string) => void
  }

  pdf: {
    selectFile: () => Promise<{ path: string; name: string; size: number } | null>
    translate: (params: {
      sessionId: string
      filePath: string
      model: string
      langIn: string
      langOut: string
      apiKey: string
      baseUrl: string
      qps?: number
      outputType?: 'mono' | 'dual' | 'both'
      watermark?: 'watermarked' | 'no_watermark'
      autoOcr?: boolean
      maxPagesPerPart?: number
      glossaryFiles?: string[]
      ignoreCache?: boolean
      minTextLength?: number
      splitShortLines?: boolean
      alternatingPages?: boolean
      autoExtractGlossary?: boolean
      customPrompt?: string
    }) => Promise<{ success: boolean; monoPath?: string; dualPath?: string; error?: string }>
    cancel: (sessionId: string) => Promise<boolean>
    export: (params: { sourcePath: string; type: 'mono' | 'dual' }) => Promise<{ success: boolean; path?: string; error?: string }>
    getPageCount: (filePath: string) => Promise<{ success: boolean; count?: number; error?: string }>
    cleanup: (sessionId: string) => Promise<{ success: boolean }>
    onProgress: (callback: (progress: {
      sessionId: string
      currentPage: number
      totalPages: number
      progress: number
      stage: string
      stageCurrent: number
      stageTotal: number
      overallProgress: number
      message: string
    }) => void) => () => void
  }

  convertPDF: (params: {
    service: string
    filePath: string
    apiKey: string
    myOcrOptions?: {
      languages?: string[]
      deskew?: boolean
      rotatePages?: boolean
      outputType?: 'pdf' | 'pdfa' | 'pdfa-1' | 'pdfa-2'
      jobs?: number
      binaryPath?: string
      tesseractPath?: string
    }
  }) => Promise<{
    success: boolean
    outputPath?: string
    pdfType?: 'scanned' | 'digital'
    debugZipPath?: string
    outputDocxPath?: string
    outputHtmlPath?: string
    outputPdfPath?: string
    environment?: {
      ok: boolean
      ocrmypdf?: { version: string; path: string }
      tesseract?: { version: string; path: string; languages: string[] }
      ghostscript?: { version: string; path: string }
      missing: string[]
      installHint?: string
    }
    error?: string
  }>

  detectMyOcrEnv: () => Promise<{
    success: boolean
    env?: {
      ok: boolean
      ocrmypdf?: { version: string; path: string }
      tesseract?: { version: string; path: string; languages: string[] }
      ghostscript?: { version: string; path: string }
      missing: string[]
      installHint?: string
    }
    error?: string
  }>
  onPDFConvertProgress: (callback: (data: {
    progress: number
    message: string
    currentPage?: number
    totalPages?: number
  }) => void) => () => void

  testPDFConnection: (params: { service: string; apiKey: string }) =>
    Promise<{ success: boolean; error?: string }>

  getPDFConvertGlobalConfig: (service: string) => Promise<{ apiKey?: string }>

  savePDFConvertGlobalConfig: (params: { service: string; config: { apiKey?: string } }) =>
    Promise<{ success: boolean; error?: string }>
}