/**
 * PDF 转换服务注册表
 *
 * 集中管理所有 PDFConverter 实现。前端通过 IPC 传入 service id，
 * 后端根据 id 在此注册表中找到对应实现。
 *
 * v9.0: 合并 MinerU-Office 到 MinerU，默认输出 docx/html，删除 ZIP
 * v8.0: 新增 myOCR (OCRmyPDF 本地版) 服务商
 */

import { MineruConverter } from './mineru-converter'
import { MyOcrConverter } from './myocr-converter'
import type { PDFConverter } from './types'

const converters: PDFConverter[] = [
  new MineruConverter(),  // v9.0: 默认服务, 自带 extra_formats docx/html, 解压后删除 ZIP
  new MyOcrConverter(),   // v8.0: 本地 OCRmyPDF，100% 离线，无需 API Key
  // 未来扩展：
  // new PaddleOCRConverter(),
  // new DocMindConverter(),
]

export function getConverter(id: string): PDFConverter | undefined {
  return converters.find((c) => c.id === id)
}

export function listConverters(): PDFConverter[] {
  return converters
}