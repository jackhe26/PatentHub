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

  /**
   * PDF 格式转换（OCR）相关接口。
   * 与知识库的 mineru-parser 解耦，独立实现于 src/main/pdf-convert/。
   * v8.0: 新增 myOCR (OCRmyPDF 本地版)
   */
  convertPDF: (params: {
    service: string
    filePath: string
    apiKey: string
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
  }) => Promise<{
    success: boolean
    outputPath?: string
    /**
     * PDF 类型：
     *  - scanned:   扫描型 PDF（OCR 处理后）
     *  - digital:   数字型 PDF（原 PDF，已有文本层）
     */
    pdfType?: 'scanned' | 'digital'
    /**
     * 调试用：MinerU 原始返回的 ZIP 文件路径
     */
    debugZipPath?: string
    /**
     * v7.12 (MinerU-Office): docx 文件绝对路径
     * 仅 MinerU-Office 服务商返回, 通过 extra_formats=["docx","html"] 生成
     */
    outputDocxPath?: string
    /**
     * v7.12 (MinerU-Office): html 文件绝对路径
     * 仅 MinerU-Office 服务商返回, MinerU 服务端生成的 HTML
     */
    outputHtmlPath?: string
    /**
     * v8.0 (myOCR): 真实输出的可搜索 PDF 路径
     * 仅 myocr 服务商返回
     */
    outputPdfPath?: string
    /**
     * v8.0 (myOCR): 本地 OCR 环境探测结果
     */
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

  /**
   * v8.0: 检测 myOCR 本地环境状态（ocrmypdf / tesseract / ghostscript）
   */
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

  /**
   * 测试服务商连接（验证 API Key）。
   */
  testPDFConnection: (params: {
    service: string
    apiKey: string
  }) => Promise<{ success: boolean; error?: string }>

  /**
   * 读取全局 PDF 转换配置。
   */
  getPDFConvertGlobalConfig: (service: string) => Promise<{ apiKey?: string }>

  /**
   * 保存全局 PDF 转换配置。
   */
  savePDFConvertGlobalConfig: (params: {
    service: string
    config: { apiKey?: string }
  }) => Promise<{ success: boolean; error?: string }>
}