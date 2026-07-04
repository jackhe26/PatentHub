import { app } from 'electron'
import * as chardet from 'chardet'
import Epub from 'epub'
import * as fs from 'fs-extra'
import * as iconv from 'iconv-lite'
import * as path from 'path'
import { isEpubFilePath, isOfficeFilePath } from '../shared/file-extensions'
import { getLogger } from './util'
import * as os from 'os'
import * as crypto from 'crypto'

// js-ppt: SheetJS PowerPoint 97-2003 (.ppt) Binary Format Parser
// Source: https://github.com/SheetJS/js-ppt (Apache 2.0)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const log = getLogger('file-parser')

// Pre-load cfb/codepage as globals BEFORE PPTParser loads
// ppt-parser.js checks: if(typeof CFB === 'undefined') CFB = require('cf'+'b')
// Use requireUnpackedModule to support both dev and packaged (asar/asar.unpacked) modes
// MUST run after `log` and `requireUnpackedModule` are initialized (the function uses `log` internally)
;(globalThis as any).CFB = requireUnpackedModule('cfb')
;(globalThis as any).cptable = requireUnpackedModule('codepage')

const PPTParser = (() => {
  if (!app.isPackaged) {
    return require(path.join(__dirname, '..', '..', 'src', 'main', 'ppt-parser.js'))
  }
  return require(path.join(process.resourcesPath, 'parsers', 'ppt-parser.js'))
})()

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

  // HTML entity decoding — using a map to avoid auto-formatter corrupting HTML entities in string literals
  const entities: Record<string, string> = {
    ['&' + 'nbsp;']: ' ',
    ['&' + 'amp;']: '&',
    ['&' + 'lt;']: '<',
    ['&' + 'gt;']: '>',
    ['&' + 'quot;']: '"',
    ['&' + '#39;']: "'",
    ['&' + 'apos;']: "'",
  }
  for (const [entity, char] of Object.entries(entities)) {
    text = text.replace(new RegExp(entity, 'g'), char)
  }
  return text
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

// ===== OLE2 二进制文档解析 (doc/xls/ppt/wps/et/dps) =====

// WPS 文件与微软旧版 Office 格式底层都是 OLE2 复合文档
// officeparser 只支持 OOXML(ZIP),不支持 OLE2,需要专用解析器
const OLE2_DOC_EXTENSIONS = ['.doc', '.wps']      // Word 文档
const OLE2_XLS_EXTENSIONS = ['.xls', '.et']       // Excel 表格
const OLE2_PPT_EXTENSIONS = ['.ppt', '.dps']      // PowerPoint 演示

function isOle2DocFile(filePath: string): boolean {
  return OLE2_DOC_EXTENSIONS.some(ext => filePath.toLowerCase().endsWith(ext))
}

function isOle2XlsFile(filePath: string): boolean {
  return OLE2_XLS_EXTENSIONS.some(ext => filePath.toLowerCase().endsWith(ext))
}

function isOle2PptFile(filePath: string): boolean {
  return OLE2_PPT_EXTENSIONS.some(ext => filePath.toLowerCase().endsWith(ext))
}

/**
 * 解析 Word 文档 (.doc / .wps)
 * 使用 word-extractor 库,它可以读取 OLE2 复合文档
 */
async function parseOle2DocFile(filePath: string): Promise<string> {
  const fileName = path.basename(filePath)
  const ext = path.extname(filePath).toLowerCase()

  log.info(`[OLE2-DOC] Starting: ${fileName} (${ext})`)

  try {
    const WordExtractor = require('word-extractor')
    const extractor = new WordExtractor()
    const result = await extractor.extract(filePath)

    const text = result.getBody() || ''
    log.info(`[OLE2-DOC] ✅ Success: ${fileName}, extracted ${text.length} chars`)
    return text
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    log.error(`[OLE2-DOC] ❌ Failed: ${fileName}: ${errorMsg}`)

    // 友好错误提示
    const hint = ext === '.wps'
      ? '请在 WPS 文字中将文件另存为 .docx 格式后再上传'
      : '请在 Microsoft Word 中将文件另存为 .docx 格式后再上传'

    throw new Error(`Word 文档解析失败: ${errorMsg}\n提示: ${hint}`)
  }
}

/**
 * 解析 Excel 表格 (.xls / .et)
 * 使用 SheetJS (xlsx) 库,它支持旧版 .xls 格式
 */
async function parseOle2XlsFile(filePath: string): Promise<string> {
  const fileName = path.basename(filePath)
  const ext = path.extname(filePath).toLowerCase()

  log.info(`[OLE2-XLS] Starting: ${fileName} (${ext})`)

  try {
    const XLSX = require('xlsx')
    const workbook = XLSX.readFile(filePath)
    const textParts: string[] = []

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const sheetText = XLSX.utils.sheet_to_csv(sheet)
      if (sheetText.trim()) {
        textParts.push(`[Sheet: ${sheetName}]`)
        textParts.push(sheetText)
      }
    }

    const text = textParts.join('\n')
    log.info(`[OLE2-XLS] ✅ Success: ${fileName}, extracted ${text.length} chars from ${workbook.SheetNames.length} sheets`)
    return text
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    log.error(`[OLE2-XLS] ❌ Failed: ${fileName}: ${errorMsg}`)

    const hint = ext === '.et'
      ? '请在 WPS 表格中将文件另存为 .xlsx 格式后再上传'
      : '请在 Microsoft Excel 中将文件另存为 .xlsx 格式后再上传'

    throw new Error(`Excel 表格解析失败: ${errorMsg}\n提示: ${hint}`)
  }
}

// ===== .ppt 解析：优先转换为 .pptx，回退 js-ppt =====

/**
 * 快速预检：Python + pywin32 环境是否可用（2 秒超时）
 * 避免无效等待 60 秒
 */
import { execFile } from 'child_process'

/**
 * 查找可用的 Python 可执行文件路径
 * Electron 打包环境下 PATH 可能不完整，需尝试多个名称
 */
function findPythonPath(): string {
  const candidates = ['python', 'python3', 'py']
  for (const name of candidates) {
    // Try System32 first (most reliable on Windows)
    const sys32Path = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', name + '.exe')
    if (fs.existsSync(sys32Path)) return sys32Path
    // Try 'where' command
    try {
      const result = require('child_process').execSync(`where ${name} 2>nul`, { encoding: 'utf8', timeout: 2000 })
      const lines = result.trim().split('\n')
      if (lines[0] && fs.existsSync(lines[0].trim())) return lines[0].trim()
    } catch { /* continue */ }
  }
  return 'python' // fallback
}

async function isPythonConvertAvailable(): Promise<boolean> {
  const pythonPath = findPythonPath()
  log.info(`[PPT-CONVERT] Checking Python at: ${pythonPath}`)

  return new Promise((resolve) => {
    execFile(pythonPath, ['-c', 'import win32com.client'], {
      timeout: 5000,
      windowsHide: true,
    }, (error, _stdout, stderr) => {
      if (error) {
        log.info(`[PPT-CONVERT] Python/pywin32 not available: ${error.message?.slice(0, 100)}`)
        if (stderr) log.info(`[PPT-CONVERT] stderr: ${stderr.trim().slice(0, 200)}`)
        resolve(false)
      } else {
        log.info(`[PPT-CONVERT] ✅ Python + pywin32 OK (${pythonPath})`)
        resolve(true)
      }
    })
  })
}

async function convertPptToPptxViaPython(pptPath: string): Promise<string | null> {
  const pptxPath = pptPath.replace(/\.ppt$/i, '_converted.pptx')
  const pythonPath = findPythonPath()

  return new Promise((resolve) => {
    // 开发模式：src/main/ → scripts/ ；打包模式：app.asar.unpacked → resources/scripts/
    const scriptPath = app.isPackaged
      ? path.join(process.resourcesPath, 'scripts', 'ppt2pptx.py')
      : path.join(__dirname, '..', '..', 'scripts', 'ppt2pptx.py')

    if (!fs.existsSync(scriptPath)) {
      log.warn('[PPT-CONVERT] ppt2pptx.py not found, skipping conversion')
      resolve(null)
      return
    }

    log.info(`[PPT-CONVERT] Running: ${pythonPath} ${scriptPath} ${pptPath}`)

    execFile(pythonPath, [scriptPath, pptPath, pptxPath], {
      timeout: 15000,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        log.warn(`[PPT-CONVERT] Conversion failed (code=${(error as any)?.code}): ${error.message?.slice(0, 150)}`)
        if (stderr) log.warn(`[PPT-CONVERT] stderr: ${stderr.trim().slice(0, 300)}`)
        resolve(null)
        return
      }

      if (stdout) log.info(`[PPT-CONVERT] stdout: ${stdout.trim().slice(0, 200)}`)

      if (fs.existsSync(pptxPath) && fs.statSync(pptxPath).size > 0) {
        log.info(`[PPT-CONVERT] ✅ Converted to ${pptxPath} (${fs.statSync(pptxPath).size} bytes)`)
        resolve(pptxPath)
      } else {
        log.warn('[PPT-CONVERT] Output file missing or empty after conversion')
        resolve(null)
      }
    })
  })
}

/**
 * 解析 OLE2 PowerPoint (.ppt) 二进制文件
 * 
 * 策略 (优先级):
 *   1. 快速预检 Python 环境 (2s) → 若可用，尝试 .ppt → .pptx 转换 (8s)
 *      如果成功 → 用 officeparser 解析 .pptx（文本完整度最高）
 *   2. 转换失败/不可用 → 回退到 SheetJS js-ppt 库解析
 *      - 合并 SlideListWithText + Shape 遍历两种策略的结果
 *
 * 支持的 .ppt 版本: PowerPoint 97-2003 (OLE2 格式)
 */
async function parseOle2PptBinary(filePath: string): Promise<string> {
  const fileName = path.basename(filePath)
  const ext = path.extname(filePath).toLowerCase()

  log.info(`[OLE2-PPT-BINARY] Starting: ${fileName} (${ext})`)

  // 策略1: 快速预检 → 尝试转换为 .pptx 再解析
  if (await isPythonConvertAvailable()) {
    const pptxPath = await convertPptToPptxViaPython(filePath)
    
    if (pptxPath) {
      try {
        const officeParser = requireUnpackedModule('officeparser')
        const parser = officeParser.default || officeParser
        const data = await parser.parseOfficeAsync(pptxPath)
        
        try { fs.unlinkSync(pptxPath) } catch { /* ignore */ }
        
        log.info(`[OLE2-PPT-BINARY] ✅ Success via PPTX conversion: ${fileName}, extracted ${String(data).length} chars`)
        return `[PPT→PPTX 转换解析结果 - ${fileName}]\n\n${data}`
      } catch (officeError) {
        try { fs.unlinkSync(pptxPath) } catch { /* ignore */ }
        const msg = officeError instanceof Error ? officeError.message : String(officeError)
        log.warn(`[OLE2-PPT-BINARY] PPTX conversion succeeded but officeparser failed: ${msg}, falling back to js-ppt`)
      }
    }
  }

  // 策略2: js-ppt 回退 — 合并双策略文本
  try {
    const pres = PPTParser.readFile(filePath)
    
    // 同时收集 SlideListWithText 和 Shape 遍历的文本，取并集
    const textSet = new Set<string>()
    
    // 2a: SlideListWithText（文档级聚合文本）
    if (pres.docs) {
      for (const doc of pres.docs) {
        try {
          const slideList = doc.slideList
          if (Array.isArray(slideList)) {
            for (const item of slideList) {
              if (typeof item === 'string' && item.trim()) textSet.add(item.trim())
            }
          }
        } catch { /* continue */ }
      }
    }
    
    // 2b: Shape 遍历（幻灯片内形状文本）
    if (pres.slides) {
      for (const slide of pres.slides) {
        try {
          const groupShape = slide.drawing?.groupShape
          if (Array.isArray(groupShape)) {
            for (const shape of groupShape) {
              const text = shape?.clientTextbox?.t
              if (typeof text === 'string' && text.trim()) textSet.add(text.trim())
            }
          }
        } catch { /* continue */ }
      }
    }
    
    const textArray = [...textSet]
    
    if (textArray.length === 0) {
      throw new Error(
        '未能从 PowerPoint 文档中提取到文本内容，' +
        '文档可能仅包含图片/图表而无文字'
      )
    }

    const text = textArray.join('\n\n')
    log.info(`[OLE2-PPT-BINARY] ✅ Success via js-ppt fallback: ${fileName}, extracted ${text.length} chars from ${textArray.length} text segments`)

    return `[PPT 解析结果 - ${fileName}]\n\n${text}`
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    log.error(`[OLE2-PPT-BINARY] ❌ Failed: ${fileName}: ${errorMsg}`)

    throw new Error(
      `PowerPoint 演示文稿(.ppt)解析失败: ${errorMsg}\n` +
      `提示: 请在 Microsoft PowerPoint 中将文件另存为 .pptx 格式后再上传`
    )
  }
}

/**
 * 解析 PowerPoint 演示文稿 (.pptx)
 * 使用 jszip 库直接读取 OOXML XML 内容,提取 <a:t> 文本节点
 * 适用于 .pptx (OOXML) 和 .dps (WPS 演示,也是 OOXML)
 */
async function parsePptxWithJszip(filePath: string): Promise<string> {
  const fileName = path.basename(filePath)
  const ext = path.extname(filePath).toLowerCase()

  log.info(`[PPTX-JSZIP] Starting: ${fileName} (${ext})`)

  try {
    const JSZip = require('jszip')
    const fileBuffer = await fs.readFile(filePath)
    const zip = await JSZip.loadAsync(fileBuffer)

    const textParts: string[] = []
    let slideCount = 0

    // 查找所有幻灯片文件: ppt/slides/slide*.xml
    const slideFiles = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/i)?.[1] || '0')
        const numB = parseInt(b.match(/slide(\d+)/i)?.[1] || '0')
        return numA - numB
      })

    for (const slidePath of slideFiles) {
      slideCount++
      const slideXml = await zip.file(slidePath)?.async('string')

      if (slideXml) {
        // 提取所有 <a:t> 标签中的文本内容
        // 正则匹配 <a:t>文本内容</a:t> 或 <a:t xml:space="preserve">文本</a:t>
        const textMatches = slideXml.match(/<a:t[^>]*>([^<]*)<\/a:t>/gi) || []

        const slideTexts = textMatches
          .map((match: string) => {
            // 提取标签内容
            const content = match.replace(/<a:t[^>]*>/i, '').replace(/<\/a:t>/i, '')
            return content.trim()
          })
          .filter((text: string) => text.length > 0)

        if (slideTexts.length > 0) {
          textParts.push(`[Slide ${slideCount}]`)
          textParts.push(slideTexts.join(' '))
        }
      }
    }

    // 也尝试提取幻灯片母版和布局中的文本(如果有的话)
    const masterFiles = Object.keys(zip.files)
      .filter(name => /^ppt\/slideMasters\/slideMaster\d+\.xml$/i.test(name))

    for (const masterPath of masterFiles) {
      const masterXml = await zip.file(masterPath)?.async('string')
      if (masterXml) {
        const textMatches = masterXml.match(/<a:t[^>]*>([^<]*)<\/a:t>/gi) || []
        const masterTexts = textMatches
          .map((match: string) => {
            const content = match.replace(/<a:t[^>]*>/i, '').replace(/<\/a:t>/i, '')
            return content.trim()
          })
          .filter((text: string) => text.length > 0)

        if (masterTexts.length > 0) {
          textParts.push(...masterTexts)
        }
      }
    }

    const text = textParts.join('\n\n')
    log.info(`[PPTX-JSZIP] ✅ Success: ${fileName}, extracted ${text.length} chars from ${slideCount} slides`)
    return text
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    log.error(`[PPTX-JSZIP] ❌ Failed: ${fileName}: ${errorMsg}`)

    throw new Error(`PowerPoint 演示文稿解析失败: ${errorMsg}\n提示: 请确保文件是有效的 .pptx 格式`)
  }
}

/**
 * 解析 OLE2 PowerPoint (.ppt) 和 OOXML PowerPoint (.pptx/.dps)
 * - .pptx / .dps: OOXML 格式，使用 jszip 自研解析器提取 <a:t> 文本节点
 * - .ppt: OLE2 二进制格式，使用 cfb + PPT Binary Record 解析器
 */
async function parseOle2PptFile(filePath: string): Promise<string> {
  const fileName = path.basename(filePath)
  const ext = path.extname(filePath).toLowerCase()

  log.info(`[OLE2-PPT] Starting: ${fileName} (${ext})`)

  // .pptx 和 .dps 是 OOXML 格式,使用 jszip 解析
  if (ext === '.pptx' || ext === '.dps') {
    return await parsePptxWithJszip(filePath)
  }

  // .ppt 是旧版 OLE2 二进制格式，使用 cfb + PPT Binary Record 解析器
  return await parseOle2PptBinary(filePath)
}

export async function parseFile(filePath: string) {
  log.info(`[parseFile] Start parsing: ${filePath}`)

  const isPdfFile = filePath.toLowerCase().endsWith('.pdf')

  if (isPdfFile) {
    // PDF 直接走 pdf-parse，绕过 officeparser（避免 pdfjs 的 worker 初始化开销）
    try {
      const pdfText = await parsePdfWithPdfParse2(filePath)
      if (pdfText && pdfText.length > 0) {
        log.info(`[pdf-parse] ✅ Success: ${filePath}, extracted ${pdfText.length} chars`)
        return pdfText
      }
    } catch (pdfError) {
      const pdfErrorMsg = pdfError instanceof Error ? pdfError.message : String(pdfError)
      log.error('[pdf-parse] ❌ Failed:', pdfErrorMsg)
      throw new Error(`PDF 解析失败: ${pdfErrorMsg}`)
    }
  }

  // OLE2 二进制格式解析(Word/Excel/PowerPoint/WPS 私有格式)
  if (isOle2DocFile(filePath)) {
    return await parseOle2DocFile(filePath)
  }
  if (isOle2XlsFile(filePath)) {
    return await parseOle2XlsFile(filePath)
  }
  if (isOle2PptFile(filePath)) {
    return await parseOle2PptFile(filePath)
  }

  // OOXML 格式(docx/xlsx/pptx/odt/odp/ods/pdf)
  if (isOfficeFilePath(filePath)) {
    try {
      const officeParser = requireUnpackedModule('officeparser')
      const parser = officeParser.default || officeParser
      const data = await parser.parseOfficeAsync(filePath)
      log.info(`[officeparser] ✅ Success: ${filePath}, extracted ${String(data).length} chars`)
      return data
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      log.warn(`[officeparser] ❌ Failed: ${errorMsg}`)
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