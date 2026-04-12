import { app } from 'electron'
import * as chardet from 'chardet'
import Epub from 'epub'
import * as fs from 'fs-extra'
import * as iconv from 'iconv-lite'
import * as path from 'path'
import { isEpubFilePath, isOfficeFilePath } from '../shared/file-extensions'
import { getLogger } from './util'

const log = getLogger('file-parser')

/**
 * 获取 asar.unpacked 目录中的模块路径
 * 解决打包后 asar 内代码无法访问 asar.unpacked 中模块的问题
 */
function getUnpackedModulePath(moduleName: string): string {
  // 获取应用基础路径
  const appPath = app.getAppPath()
  
  // 记录详细的调试信息
  log.error(`[ModulePath] === 模块路径探测 ===`)
  log.error(`[ModulePath] app.getAppPath(): ${appPath}`)
  log.error(`[ModulePath] app.isPackaged: ${app.isPackaged}`)
  log.error(`[ModulePath] PORTABLE_EXECUTABLE_DIR: ${process.env.PORTABLE_EXECUTABLE_DIR}`)
  log.error(`[ModulePath] process.resourcesPath: ${process.resourcesPath}`)
  
  let unpkgPath: string = ''
  
  // 关键修复：优先使用 process.resourcesPath，它是应用资源文件的实际位置
  // 对于 Portable 版本和普通安装版本都适用
  // process.resourcesPath 指向包含 app.asar.unpacked 的 resources 目录
  
  // 直接使用 process.resourcesPath，这是最可靠的方式
  const baseUnpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked')
  
  log.error(`[ModulePath] 基础 unpacked 路径: ${baseUnpackedPath}`)
  
  // 直接检查 node_modules 下的模块
  const moduleBasePath = path.join(baseUnpackedPath, 'node_modules')
  const fullModulePath = path.join(moduleBasePath, moduleName)
  
  log.error(`[ModulePath] 检查模块基础路径: ${moduleBasePath}`)
  log.error(`[ModulePath] 检查完整模块路径: ${fullModulePath}`)
  
  // 先检查目录是否存在
  if (fs.existsSync(moduleBasePath)) {
    log.error(`[ModulePath] ✅ node_modules 目录存在: ${moduleBasePath}`)
  } else {
    log.error(`[ModulePath] ❌ node_modules 目录不存在: ${moduleBasePath}`)
  }
  
  // 检查模块目录
  if (fs.existsSync(fullModulePath)) {
    log.error(`[ModulePath] ✅ 找到模块目录: ${fullModulePath}`)
    unpkgPath = moduleBasePath
  } else {
    // 尝试直接 require，可能 Electron 已经处理了路径
    log.error(`[ModulePath] 模块目录不存在，尝试直接 require`)
    unpkgPath = moduleBasePath
  }
  
  log.error(`[ModulePath] 最终模块路径 for ${moduleName}: ${fullModulePath}`)
  return fullModulePath
}

/**
 * 安全加载 unpacked 模块
 * 尝试多种加载方式以兼容开发和打包环境
 * 记录所有错误原因，以便在错误弹窗中显示
 */
function requireUnpackedModule(moduleName: string): any {
  const errors: string[] = []
  
  // 方式1: 直接 require (可能在打包后失败)
  try {
    log.error(`[ModuleLoader] 方式1: 直接 require(${moduleName})`)
    return require(moduleName)
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    errors.push(`直接加载失败: ${err}`)
    log.error(`[ModuleLoader] ❌ 方式1失败 for ${moduleName}: ${err}`)
  }
  
  // 方式2: 使用 unpacked 路径
  try {
    const unpkgPath = getUnpackedModulePath(moduleName)
    log.error(`[ModuleLoader] 方式2: require("${unpkgPath}")`)
    return require(unpkgPath)
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    errors.push(`unpacked路径失败: ${err}`)
    log.error(`[ModuleLoader] ❌ 方式2失败 for ${moduleName}: ${err}`)
  }
  
  // 方式3: 尝试 Node.js 版本的 pdf-parse
  try {
    const nodePath = `${moduleName}/node`
    log.error(`[ModuleLoader] 方式3: require("${nodePath}")`)
    return require(nodePath)
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    errors.push(`/node路径失败: ${err}`)
    log.error(`[ModuleLoader] ❌ 方式3失败 for ${moduleName}: ${err}`)
  }
  
  // 汇总所有错误原因并抛出详细错误信息
  const detailedError = `无法加载模块 ${moduleName}，尝试过的方法: ${errors.join('; ')}`
  log.error(`[ModuleLoader] 最终失败: ${detailedError}`)
  throw new Error(detailedError)
}

// DOMMatrix polyfill for pdf-parse
function ensureDOMMatrix(): void {
  try {
    if (typeof (globalThis as any).DOMMatrix === 'undefined') {
      ;(globalThis as any).DOMMatrix = class DOMMatrix {
        a = 1
        b = 0
        c = 0
        d = 1
        e = 0
        f = 0
        m11 = 1
        m12 = 0
        m13 = 0
        m14 = 0
        m21 = 0
        m22 = 1
        m23 = 0
        m24 = 0
        m31 = 0
        m32 = 0
        m33 = 1
        m34 = 0
        m41 = 0
        m42 = 0
        m43 = 0
        m44 = 1
        constructor(input?: string | number[]) {
          if (input && typeof input === 'string') {
            const match = input.match(/matrix\(([^)]+)\)/)
            if (match) {
              const values = match[1].split(',').map(Number)
              if (values.length === 6) {
                this.a = values[0]
                this.b = values[1]
                this.c = values[2]
                this.d = values[3]
                this.e = values[4]
                this.f = values[5]
                this.m11 = values[0]
                this.m12 = values[1]
                this.m21 = values[2]
                this.m22 = values[3]
                this.m41 = values[4]
                this.m42 = values[5]
              }
            }
          }
        }
        multiply(other: any): any {
          return new (globalThis as any).DOMMatrix()
        }
        translate(x: number, y: number, z?: number): any {
          return new (globalThis as any).DOMMatrix()
        }
        scale(x?: number, y?: number, z?: number): any {
          return new (globalThis as any).DOMMatrix()
        }
        rotate(x: number, y?: number, z?: number): any {
          return new (globalThis as any).DOMMatrix()
        }
        flipX(): any {
          return new (globalThis as any).DOMMatrix()
        }
        flipY(): any {
          return new (globalThis as any).DOMMatrix()
        }
        inverse(): any {
          return new (globalThis as any).DOMMatrix()
        }
        toString(): string {
          return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`
        }
      }
    }
  } catch (e) {
    log.warn('Failed to create DOMMatrix polyfill:', e)
  }
}

// Parse PDF using pdf-parse 2.x
// 使用安全的模块加载方式，兼容开发和打包环境
function parsePdfWithPdfParse2(filePath: string): string {
  ensureDOMMatrix()
  
  let PDFParse: any
  try {
    // 尝试使用安全的模块加载
    const pdfParseModule = requireUnpackedModule('pdf-parse')
    PDFParse = pdfParseModule.PDFParse
  } catch (loadError) {
    log.error('[pdf-parse] Failed to load pdf-parse module:', loadError)
    throw new Error(`Failed to load pdf-parse: ${loadError}`)
  }
  
  if (!PDFParse) {
    throw new Error('pdf-parse module loaded but PDFParse not found')
  }
  
  try {
    const dataBuffer = fs.readFileSync(filePath)
    const uint8Array = new Uint8Array(dataBuffer) // Key: Buffer -> Uint8Array
    const parser = new PDFParse({ data: uint8Array })
    const result = parser.getTextSync() // 使用同步方法
    parser.destroy()
    return result.text
  } catch (parseError) {
    log.error('[pdf-parse] Failed to parse PDF:', parseError)
    throw parseError
  }
}

// Helper function to decode HTML entities
function decodeHtmlEntities(text: string): string {
  // Handle hexadecimal entities like &#x6b64;
  text = text.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16))
    } catch (e) {
      return match // Return original if conversion fails
    }
  })

  // Handle decimal entities like &#123;
  text = text.replace(/&#(\d+);/g, (match, dec) => {
    try {
      return String.fromCharCode(parseInt(dec, 10))
    } catch (e) {
      return match // Return original if conversion fails
    }
  })

  // Handle named entities
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/'/g, "'")
}

// Simple concurrent map implementation using native Promise.allSettled
async function concurrentMap<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number = 8
): Promise<R[]> {
  const results: R[] = []

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchNumber = Math.floor(i / concurrency) + 1
    const totalBatches = Math.ceil(items.length / concurrency)

    log.debug(`Processing batch ${batchNumber}/${totalBatches} with ${batch.length} items`)

    const batchResults = await Promise.allSettled(batch.map((item, batchIndex) => mapper(item, i + batchIndex)))

    // Extract successful results
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      }
    }
  }

  return results
}

export async function parseFile(filePath: string) {
  if (isOfficeFilePath(filePath)) {
    const isPdfFile = filePath.toLowerCase().endsWith('.pdf')

    // 尝试使用 officeparser 解析
    let officeParser: any
    try {
      officeParser = requireUnpackedModule('officeparser')
      // 如果是 default 导出
      const parser = officeParser.default || officeParser
      const data = await parser.parseOfficeAsync(filePath)
      return data
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      log.warn('[officeparser] Failed to parse file:', errorMsg)
      
      // If PDF parsing fails and it's a PDF file, try fallback to pdf-parse 2.x
      if (isPdfFile) {
        log.warn('officeparser failed for PDF, falling back to pdf-parse 2.x:', filePath)
        try {
          // 直接调用同步版本
          const pdfText = parsePdfWithPdfParse2(filePath)
          if (pdfText && pdfText.length > 0) {
            log.info(`Successfully parsed PDF with pdf-parse 2.x: ${filePath}, extracted ${pdfText.length} characters`)
            return pdfText
          }
        } catch (pdfError) {
          const pdfErrorMsg = pdfError instanceof Error ? pdfError.message : String(pdfError)
          log.error('pdf-parse 2.x also failed:', pdfErrorMsg)
          // Throw a proper error with the PDF error message
          throw new Error(`pdf-parse 解析失败: ${pdfErrorMsg}`)
        }
      }
      // Throw a proper error with the original error message
      throw new Error(`officeparser 解析失败: ${errorMsg}`)
    }
  }

  if (isEpubFilePath(filePath)) {
    try {
      const data = await parseEpub(filePath)
      return data
    } catch (error) {
      log.error(error)
      throw error
    }
  }

  // Read first 4KB for encoding detection to avoid memory issues with large files
  const stats = await fs.stat(filePath)
  const sampleSize = Math.min(4096, stats.size)

  // Read sample using createReadStream for partial file reading
  const sampleBuffer = new Uint8Array(sampleSize)
  const fd = await fs.promises.open(filePath, 'r')
  await fd.read(sampleBuffer, 0, sampleSize, 0)
  await fd.close()

  // Detect encoding from sample
  const detectedEncoding = chardet.detect(sampleBuffer)
  const encoding = detectedEncoding || 'utf8'

  log.debug(`Detected encoding for ${filePath}: ${encoding}`)

  // Read full file as buffer and convert with detected encoding
  const fileBuffer = await fs.readFile(filePath)
  const data = iconv.decode(fileBuffer, encoding)
  return data
}

export async function parseEpub(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const epub = new Epub(filePath)

    epub.on('error', (error) => {
      log.error('EPUB parsing error:', error)
      reject(error)
    })

    epub.on('end', async () => {
      try {
        const metadata = epub.metadata as { title?: string; creator?: string; language?: string }
        log.info('EPUB metadata:', {
          title: metadata.title,
          creator: metadata.creator,
          language: metadata.language,
          chapters: epub.flow.length,
        })

        // Helper function to process a single chapter
        const processChapter = async (chapter: { id: string }): Promise<string | null> => {
          try {
            const chapterText = await new Promise<string>((resolveChapter, rejectChapter) => {
              epub.getChapter(chapter.id, (error, text) => {
                if (error) {
                  log.error(`Error reading chapter ${chapter.id}:`, error)
                  rejectChapter(error)
                } else {
                  resolveChapter(text || '')
                }
              })
            })

            // Remove HTML tags and extract plain text
            let plainText = chapterText.replace(/<[^>]*>/g, '') // Remove HTML tags

            // Decode HTML entities (including hex)
            plainText = decodeHtmlEntities(plainText)
              .replace(/\s+/g, ' ') // Replace multiple whitespaces with single space
              .trim()

            return plainText || null
          } catch (chapterError) {
            log.warn(`Failed to read chapter ${chapter.id}, skipping:`, chapterError)
            return null // Return null for failed chapters to continue processing
          }
        }

        // Extract text from all chapters using concurrent processing
        log.info(`Starting concurrent processing of ${epub.flow.length} chapters with concurrency: 8`)

        const chapterResults = await concurrentMap(epub.flow as { id: string }[], processChapter, 8)
        const chapterTexts = chapterResults.filter((text: string | null) => text !== null) as string[]
        log.info(`Successfully processed ${chapterTexts.length}/${epub.flow.length} chapters`)

        const fullText = chapterTexts.join('\n\n')

        if (!fullText) {
          throw new Error('No readable text content found in EPUB file')
        }

        log.info(`Successfully extracted ${fullText.length} characters from ${chapterTexts.length} chapters`)
        resolve(fullText)
      } catch (error) {
        log.error('Error extracting EPUB content:', error)
        reject(error)
      }
    })

    epub.parse()
  })
}
