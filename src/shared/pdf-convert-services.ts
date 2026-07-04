/**
 * PDF 格式转换服务元数据
 *
 * 前端用此文件渲染服务商下拉框与说明文案。
 * 实际后端实现在 src/main/pdf-convert/registry.ts 中。
 */

export interface PDFConvertServiceMeta {
  /** 服务商唯一 ID，与后端 Converter.id 对应 */
  id: string
  /** 下拉框显示名称 */
  displayName: string
  /** 服务商说明（工具栏下方一行小字） */
  description: string
  /** 官网链接 */
  homepage: string
}

export const PDF_CONVERT_SERVICES: PDFConvertServiceMeta[] = [
  {
    id: 'mineru',
    displayName: 'MinerU',
    description: '开源PDF OCR · 扫描PDF解析为可复制文本 · 输出 docx/html/md/json 到同目录',
    homepage: 'https://mineru.net',
  },
  {
    id: 'myocr',
    displayName: 'myOCR (本地)',
    description: '本地 OCRmyPDF · 100% 离线 · 无需 API Key · 适合保密文档（需本机安装 Tesseract）',
    homepage: 'https://github.com/ocrmypdf/OCRmyPDF',
  },
  // 未来扩展：
  // { id: 'paddleocr', displayName: '百度 PaddleOCR', description: '...', homepage: '...' },
  // { id: 'docmind',   displayName: '阿里云 DocMind',   description: '...', homepage: '...' },
]

export function getServiceMeta(id: string): PDFConvertServiceMeta | undefined {
  return PDF_CONVERT_SERVICES.find((s) => s.id === id)
}