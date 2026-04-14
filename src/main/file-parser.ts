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
 */
function getUnpackedModulePath(moduleName: string): string {
  const appPath = app.getAppPath()

  log.error(`[ModulePath] === 模块路径探测 ===`)
  log.error(`[ModulePath] app.getAppPath(): ${appPath}`)
  log.error(`[ModulePath] app.isPackaged: ${app.isPackaged}`)
  log.error(`[ModulePath] PORTABLE_EXECUTABLE_DIR: ${process.env.PORTABLE_EXECUTABLE_DIR}`)
  log.error(`[ModulePath] process.resourcesPath: ${process.resourcesPath}`)

  const baseUnpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked')
  const moduleBasePath = path.join(baseUnpackedPath, 'node_modules')
  const fullModulePath = path.join(moduleBasePath, moduleName)

  log.error(`[ModulePath] 检查完整模块路径: ${fullModulePath}`)

  if (fs.existsSync(fullModulePath)) {
    log.error(`[ModulePath] ✅ 找到模块目录: ${fullModulePath}`)
  } else {
    log.error(`[ModulePath] 模块目录不存在，尝试直接 require`)
  }

  return fullModulePath
}

/**
 * 安全加载 unpacked 模块
 * 方式2 直接解析 package.json 的 CJS 入口，兼容 Portable 版（临时目录路径）
 */
function requireUnpackedModule(moduleName: string): any {
  const errors: string[] = []

  // 方式1: 直接 require
  try {
    log.error(`[ModuleLoader] 方式1: 直接 require(${moduleName})`)
    return require(moduleName)
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    errors.push(`直接加载失败: ${err}`)
    log.error(`[ModuleLoader] ❌ 方式1失败 for ${moduleName}: ${err}`)
  }

  // 方式2: 使用 unpacked 路径，直接加载 CJS 文件（绕过 exports 字段解析，兼容 Portable 版）
  try {
    const moduleDir = getUnpackedModulePath(moduleName)
    log.error(`[ModuleLoader] 方式2: 尝试直接加载 CJS 文件 from ${moduleDir}`)
    const pkgJsonPath = path.join(moduleDir, 'package.json')
    if (fs.existsSync(pkgJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
      const cjsRelPath = pkg?.exports?.['.']?.require?.default || pkg.main
      if (cjsRelPath) {
        const cjsPath = path.join(moduleDir, cjsRelPath)
        log.error(`[ModuleLoader] 方式2: require("${cjsPath}")`)
        if (fs.existsSync(cjsPath)) {
          return require(cjsPath)
        }
      }
    }
    // 回退：直接加载目录
    log.error(`[ModuleLoader] 方式2 fallback: require("${moduleDir}")`)
    return require(moduleDir)
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    errors.push(`unpacked路径失败: ${err}`)
    log.error(`[ModuleLoader] ❌ 方式2失败 for ${moduleName}: ${err}`)
  }

  // 方式3: 尝试 /node 子路径
  try {
    const nodePath = `${moduleName}/node`
    log.error(`[ModuleLoader] 方式3: require("${nodePath}")`)
    return require(nodePath)
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    errors.push(`/node路径失败: ${err}`)
    log.error(`[ModuleLoader] ❌ 方式3失败 for ${moduleName}: ${err}`)
  }

  const detailedError = `无法加载模块 ${moduleName}，尝试过的方法: ${errors.join('; ')}`
  log.error(`[ModuleLoader] 最终失败: ${detailedError}`)
  throw new Error(detailedError)
}

// DOMMatrix polyfill for pdf-parse
function ensureDOMMatrix(): void {
  try {
    if (typeof (globalThis as any).DOMMatrix === 'undefined') {
      ;(globalThis as any).DOMMatrix = class DOMMatrix {
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
        m11 = 1; m12 = 0; m13 = 0; m14 = 0
        m21 = 0; m22 = 1; m23 = 0; m24 = 0
        m31 = 0; m32 = 0; m33 = 1; m34 = 0
        m41 = 0; m42 = 0; m43 = 0; m44 = 1
        constructor(input?: string | number[]) {
          if (input && typeof input === 'string') {
            const match = input.match(/matrix\(([^)]+)\)/)
            if (match) {
              const values = match[1].split(',').map(Number)
              if (values.length === 6) {
                this.a = values[0]; this.b = values[1]; this.c = values[2]
                this.d = values[3]; this.e = values[4]; this.f = values[5]
                this.m11 = values[0]; this.m12 = values[1]
                this.m21 = values[2]; this.m22 = values[3]
                this.m41 = values[4]; this.m42 = values[5]
              }
            }
          }
        }
        multiply(_other: any): any { return new (globalThis as any).DOMMatrix() }
        translate(_x: number, _y: number, _z?: number): any { return new (globalThis as any).DOMMatrix() }
        scale(_x?: number, _y?: number, _z?: number): any { return new (globalThis as any).DOMMatrix() }
        rotate(_x: number, _y?: number, _z?: number): any { return new (globalThis as any).DOMMatrix() }
        flipX(): any { return new (globalThis as any).DOMMatrix() }
        flipY(): any { return new (globalThis as any).DOMMatrix() }
        inverse(): any { return new (globalThis as any).DOMMatrix() }
        toString(): string { return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})` }
      }
    }
  } catch (e) {
    log.warn('Failed to create DOMMatrix polyfill:', e)
  }
}

// Parse PDF using pdf-parse 2.x
// pdf-parse 2.x API: new PDFParse({ data: Uint8Array }) => parser.getText() => Promise<TextResult>
async function parsePdfWithPdfParse2(filePath: string): Promise<string> {
  ensureDOMMatrix()

  let PDFParse: any
  const attempts: { strategy: string; result: string }[] = []

  // 策略1: 从 app.asar.unpacked 真实路径加载（__filename 是真实路径，动态 import 能正确解析 pdf.worker.mjs）
  if (!PDFParse) {
    try {
      const moduleDir = getUnpackedModulePath('pdf-parse')
      const pkgJsonPath = path.join(moduleDir, 'package.json')
      if (fs.existsSync(pkgJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
        const cjsRelPath = pkg?.exports?.['.']?.require?.default || pkg.main
        if (cjsRelPath) {
          const cjsPath = path.join(moduleDir, cjsRelPath)
          if (fs.existsSync(cjsPath)) {
            const m = require(cjsPath)
            PDFParse = m?.PDFParse || m?.default?.PDFParse
            if (PDFParse) {
              attempts.push({ strategy: `app.asar.unpacked 真实路径 ${cjsPath}`, result: '✅ 成功找到 PDFParse' })
              log.info(`[pdf-parse] Strategy 1 success (unpacked real path): ${cjsPath}`)
            } else {
              attempts.push({ strategy: `app.asar.unpacked 真实路径 ${cjsPath}`, result: `❌ 加载成功但未找到 PDFParse，导出: ${Object.keys(m || {}).join(', ')}` })
            }
          } else {
            attempts.push({ strategy: `app.asar.unpacked 真实路径`, result: `❌ CJS 文件不存在: ${cjsPath}` })
          }
        } else {
          attempts.push({ strategy: 'app.asar.unpacked 真实路径', result: '❌ package.json 中未找到 CJS 入口' })
        }
      } else {
        attempts.push({ strategy: 'app.asar.unpacked 真实路径', result: `❌ package.json 不存在: ${pkgJsonPath}` })
        log.warn(`[pdf-parse] Strategy 1: package.json not found at ${pkgJsonPath}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      attempts.push({ strategy: 'app.asar.unpacked 真实路径', result: `❌ 加载失败: ${msg}` })
      log.warn('[pdf-parse] Strategy 1 failed:', msg)
    }
  }

  // 策略2: require('pdf-parse') 主入口（开发模式 / 备用）
  if (!PDFParse) {
    try {
      const m = require('pdf-parse')
      PDFParse = m?.PDFParse || m?.default?.PDFParse
      if (PDFParse) {
        attempts.push({ strategy: 'require(pdf-parse)', result: '✅ 成功找到 PDFParse' })
        log.info('[pdf-parse] Strategy 2 success: require(pdf-parse)')
      } else {
        attempts.push({ strategy: 'require(pdf-parse)', result: `❌ 模块加载成功但未找到 PDFParse，导出内容: ${Object.keys(m || {}).join(', ')}` })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      attempts.push({ strategy: 'require(pdf-parse)', result: `❌ 加载失败: ${msg}` })
      log.warn('[pdf-parse] Strategy 2 failed:', msg)
    }
  }

  // 策略3: 直接拼接已知 CJS 路径（终极兜底）
  if (!PDFParse) {
    try {
      const moduleDir = getUnpackedModulePath('pdf-parse')
      const cjsPath = path.join(moduleDir, 'dist', 'pdf-parse', 'cjs', 'index.cjs')
      if (fs.existsSync(cjsPath)) {
        const m = require(cjsPath)
        PDFParse = m?.PDFParse || m?.default?.PDFParse
        if (PDFParse) {
          attempts.push({ strategy: `直接加载 ${cjsPath}`, result: '✅ 成功找到 PDFParse' })
          log.info(`[pdf-parse] Strategy 3 success: ${cjsPath}`)
        } else {
          attempts.push({ strategy: `直接加载 ${cjsPath}`, result: `❌ 文件加载成功但未找到 PDFParse，导出内容: ${Object.keys(m || {}).join(', ')}` })
        }
      } else {
        attempts.push({ strategy: `直接加载 ${cjsPath}`, result: '❌ 文件不存在' })
        log.warn(`[pdf-parse] Strategy 3: CJS file not found at ${cjsPath}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      attempts.push({ strategy: '直接加载 CJS 文件', result: `❌ 加载失败: ${msg}` })
      log.warn('[pdf-parse] Strategy 3 failed:', msg)
    }
  }

  if (!PDFParse) {
    const detail = attempts.map(a => `  [${a.strategy}] ${a.result}`).join('\n')
    log.error('[pdf-parse] All strategies failed:\n' + detail)
    throw new Error(`无法加载 pdf-parse 解析器，已尝试以下方式：\n${detail}`)
  }

  log.info(`[pdf-parse] PDFParse loaded, parsing: ${filePath}`)
  try {
    const dataBuffer = fs.readFileSync(filePath)
    const uint8Array = new Uint8Array(dataBuffer)
    const parser = new PDFParse({ data: uint8Array })
    const result = await parser.getText()
    await parser.destroy()
    return result.text as string
  } catch (parseError) {
    const msg = parseError instanceof Error ? parseError.message : String(parseError)
    log.error('[pdf-parse] PDF parsing failed:', msg)
    throw new Error(`PDF 解析失败: ${msg}`)
  }
}

// Helper function to decode HTML entities
function decodeHtmlEntities(text: string): string {
  text = text.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16))
    } catch (e) {
      return match
    }
  })

  text = text.replace(/&#(\d+);/g, (match, dec) => {
    try {
      return String.fromCharCode(parseInt(dec, 10))
    } catch (e) {
      return match
    }
  })

  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
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

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      }
    }
  }

  return results
}

export async function parseFile(filePath: string) {
  log.info(`[parseFile] Start parsing: ${filePath}`)

  if (isOfficeFilePath(filePath)) {
    const isPdfFile = filePath.toLowerCase().endsWith('.pdf')

    // 尝试使用 officeparser 解析
    try {
      const officeParser = requireUnpackedModule('officeparser')
      const parser = officeParser.default || officeParser
      const data = await parser.parseOfficeAsync(filePath)
      log.info(`[officeparser] ✅ Success: ${filePath}, extracted ${String(data).length} chars`)
      return data
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      log.warn(`[officeparser] ❌ Failed: ${errorMsg}`)

      // PDF 解析失败时，回退到 pdf-parse 2.x
      if (isPdfFile) {
        log.warn('officeparser failed for PDF, falling back to pdf-parse 2.x:', filePath)
        try {
          const pdfText = await parsePdfWithPdfParse2(filePath)
          if (pdfText && pdfText.length > 0) {
            log.info(`Successfully parsed PDF with pdf-parse 2.x: ${filePath}, extracted ${pdfText.length} characters`)
            return pdfText
          }
        } catch (pdfError) {
          const pdfErrorMsg = pdfError instanceof Error ? pdfError.message : String(pdfError)
          log.error('pdf-parse 2.x also failed:', pdfErrorMsg)
          throw new Error(`pdf-parse 解析失败: ${pdfErrorMsg}`)
        }
      }
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

  // Read first 4KB for encoding detection
  const stats = await fs.stat(filePath)
  const sampleSize = Math.min(4096, stats.size)

  const sampleBuffer = new Uint8Array(sampleSize)
  const fd = await fs.promises.open(filePath, 'r')
  await fd.read(sampleBuffer, 0, sampleSize, 0)
  await fd.close()

  const detectedEncoding = chardet.detect(sampleBuffer)
  const encoding = detectedEncoding || 'utf8'

  log.debug(`Detected encoding for ${filePath}: ${encoding}`)

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

            let plainText = chapterText.replace(/<[^>]*>/g, '')
            plainText = decodeHtmlEntities(plainText)
              .replace(/\s+/g, ' ')
              .trim()

            return plainText || null
          } catch (chapterError) {
            log.warn(`Failed to read chapter ${chapter.id}, skipping:`, chapterError)
            return null
          }
        }

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
