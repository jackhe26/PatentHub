/**
 * PDF 格式转换服务统一接口
 *
 * 该模块独立于知识库的 mineru-parser.ts，专门服务于 PDF 转换 Tab 场景：
 *  - 输入：扫描/图片型 PDF
 *  - 输出：可搜索 PDF（保留原版式，文字可选中、可复制）
 *
 * 与知识库 MineruParser 的区别：
 *  - MineruParser：输出 Markdown 给 RAG 用
 *  - PDFConverter：输出可搜索 PDF 给用户下载
 *
 * 实现思路参考 src/main/knowledge-base/parsers/mineru-parser.ts，但代码独立。
 *
 * v8.0: 新增 myOCR (OCRmyPDF 本地) 服务商支持
 */

// ============================================================
// myOCR (OCRmyPDF) 配置与类型
// ============================================================

/**
 * myOCR 专用配置选项
 * 对应 OCRmyPDF 命令行参数
 */
export interface MyOcrOptions {
  /**
   * ISO 639-3 语言代码，支持多语言组合
   * e.g. ['eng', 'chi_sim'] → '-l eng+chi_sim'
   * @default ['eng', 'chi_sim']
   */
  languages?: string[]
  /**
   * --deskew：自动校正歪斜页面
   * @default true
   */
  deskew?: boolean
  /**
   * --rotate-pages：自动修正旋转方向错误的页面
   * @default true
   */
  rotatePages?: boolean
  /**
   * --output-type：输出 PDF 格式
   * - pdf: 普通 PDF
   * - pdfa: PDF/A-1b (默认)
   * - pdfa-1: PDF/A-1b
   * - pdfa-2: PDF/A-2b
   * @default 'pdfa-2'
   */
  outputType?: 'pdf' | 'pdfa' | 'pdfa-1' | 'pdfa-2'
  /**
   * --jobs：并行 worker 数，默认为 1（便于感知进度）
   * @default 1
   */
  jobs?: number
  /**
   * 自定义 ocrmypdf 可执行文件路径（留空=自动从 PATH 探测）
   */
  binaryPath?: string
  /**
   * 自定义 tesseract 可执行文件路径（留空=自动探测）
   */
  tesseractPath?: string
}

/**
 * 本地环境探测结果（供前端 UI Badge 显示）
 */
export interface EnvironmentStatus {
  /** 所有依赖是否就绪 */
  ok: boolean
  ocrmypdf?: {
    version: string
    path: string
  }
  tesseract?: {
    version: string
    path: string
    /** 已安装的语言代码列表 */
    languages: string[]
  }
  ghostscript?: {
    version: string
    path: string
  }
  /** 缺失的依赖名称列表 */
  missing: string[]
  /** 安装提示 */
  installHint?: string
}


export interface ProgressEvent {
  /** 进度百分比 0-100 */
  progress: number
  /** 当前状态消息 */
  message: string
  /** 当前处理页码（可选） */
  currentPage?: number
  /** 总页数（可选） */
  totalPages?: number
}

export type ProgressCallback = (event: ProgressEvent) => void

/**
 * PDF 重建模式
 *  - json: 从 layout.json / model.json / content_list*.json 重建 PDF，保留原版式
 *  - markdown: 从 Markdown 渲染 PDF，重排版路线，适用于需要美化输出或 JSON 重建效果不佳时
 *  - auto: 默认模式，优先尝试 JSON，失败时回退到 _model.pdf / _origin.pdf
 */
export type RebuildMode = 'auto' | 'json' | 'markdown'

export interface ConvertInput {
  /** 源 PDF 路径 */
  filePath: string
  /** API Key（用户在 UI 上填写） */
  apiKey: string
  /** 重建模式（默认 auto） */
  rebuildMode?: RebuildMode
  /**
   * v8.0: myOCR 专用配置（仅 myocr 服务商生效）
   * MinerU 服务商会忽略此字段
   */
  myOcrOptions?: MyOcrOptions
}


/**
 * PDF 类型
 *  - scanned:   扫描型 PDF（无文本层），需要 OCR
 *  - digital:   数字型 PDF（已有文本层），可直接使用
 */
export type PDFType = 'scanned' | 'digital'

export interface ConvertResult {
  /** v9.0: MinerU 不再输出 ZIP, outputPath 改为解压目录路径 */
  outputPath: string
  /** v7.10: 已废弃, 保留兼容 */
  outputPdf?: Buffer
  /** Markdown 内容 (如果有) */
  markdown?: string
  /** v7.10: 已废弃 */
  pdfType?: PDFType
  /**
   * v9.0: 解压后的目录路径（供 build-html 从目录读取 JSON + images）
   * 删除 ZIP 后，所有产物在解压目录内
   */
  debugZipPath: string
  /**
   * v9.0 (MinerU): 解压后的 docx 文件路径（来自 extra_formats=["docx","html"]）
   * 保存在解压目录内
   */
  outputDocxPath?: string
  /**
   * v9.0 (MinerU): 解压后的 html 文件路径（来自 extra_formats=["docx","html"]）
   * 保存在解压目录内
   */
  outputHtmlPath?: string
  /**
   * v8.0 (myOCR): 真实输出的可搜索 PDF 路径
   * 仅 myocr 服务商返回
   */
  outputPdfPath?: string
  /**
   * v8.0 (myOCR): 本地 OCR 环境探测结果
   * 仅 myocr 服务商返回，供前端显示环境状态 Badge
   */
  environment?: EnvironmentStatus
}


export interface TestConnectionResult {
  success: boolean
  error?: string
}

/**
 * PDF 转换器统一接口
 */
export interface PDFConverter {
  /** 服务商唯一 ID */
  readonly id: string
  /** 显示名称 */
  readonly displayName: string

  /**
   * 测试连接是否可用（验证 API Key / 本地环境）
   * MinerU: 验证 API Key
   * myOCR: 验证本地依赖 (ocrmypdf/tesseract/gs)
   */
  testConnection(apiKey: string): Promise<TestConnectionResult>

  /**
   * 执行转换
   */
  convert(
    input: ConvertInput,
    onProgress: ProgressCallback,
    signal?: AbortSignal
  ): Promise<ConvertResult>
}