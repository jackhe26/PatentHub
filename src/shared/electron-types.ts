export interface ElectronIPC {
  invoke: (channel: string, ...args: any[]) => Promise<any>
  onSystemThemeChange: (callback: () => void) => () => void
  onWindowMaximizedChanged: (callback: (_: Electron.IpcRendererEvent, windowMaximized: boolean) => void) => () => void
  onWindowShow: (callback: () => void) => () => void
  onWindowFocused: (callback: () => void) => () => void
  onUpdateDownloaded: (callback: () => void) => () => void
  addMcpStdioTransportEventListener: (transportId: string, event: string, callback?: (...args: any[]) => void) => void
  onNavigate: (callback: (path: string) => void) => () => void
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
}
