/**
 * PDF 转换全局配置（API Key 等）
 *
 * 复用项目现有的 electron-store（store-node）。
 * 配置按服务商 ID 分类存储，便于将来扩展多服务商。
 */

import { store } from '../store-node'

const KEY = 'pdfConvertGlobalConfig'

export interface PDFConvertGlobalConfig {
  /** v9.0: MinerU 服务配置 (默认输出 docx/html/md/json，解压后删除 ZIP) */
  mineru?: { apiKey?: string }
  /**
   * v8.0: myOCR (OCRmyPDF 本地) 服务商配置
   * 不需要 apiKey，存储用户偏好的 OCR 参数
   */
  myocr?: {
    /** OCR 语言代码，逗号分隔 */
    languages?: string[]
    /** 自动歪斜校正 */
    deskew?: boolean
    /** 自动旋转修正 */
    rotatePages?: boolean
    /** PDF/A 输出格式 */
    outputType?: 'pdf' | 'pdfa' | 'pdfa-1' | 'pdfa-2'
    /** 并行 worker 数 */
    jobs?: number
    /** 自定义 ocrmypdf 路径 */
    binaryPath?: string
  }
  // 未来扩展：
  // paddleocr?: { apiKey?: string; secretKey?: string }
  // docmind?:   { accessKeyId?: string; accessKeySecret?: string }
}

export function getGlobalConfig(): PDFConvertGlobalConfig {
  return (store.get(KEY) as PDFConvertGlobalConfig) || {}
}

export function saveGlobalConfig(config: PDFConvertGlobalConfig): void {
  store.set(KEY, config)
}

export function getServiceGlobalConfig(service: string): { apiKey?: string } {
  const all = getGlobalConfig()
  const cfg = all[service as keyof PDFConvertGlobalConfig]
  return (cfg as { apiKey?: string }) || {}
}

export function saveServiceGlobalConfig(
  service: string,
  config: { apiKey?: string }
): void {
  const all = getGlobalConfig()
  if (service === 'mineru') {
    all.mineru = { apiKey: config.apiKey }
  } else if (service === 'myocr') {
    // v8.0: myOCR 配置不包含 apiKey，只存参数
    all.myocr = { ...all.myocr, ...config } as any
  }
  // 未来扩展其他服务商的字段
  saveGlobalConfig(all)
}
