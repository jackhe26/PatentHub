/**
 * MinerU PDF 转换器 (v9.0 整合版)
 *
 * v9.0 改动:
 *   - 合并 MinerU-Office 能力: 默认 extra_formats: ['docx', 'html']
 *   - 下载 ZIP → 解压到 {baseName}_OCR_{N}/ → 删除 ZIP
 *   - HTML 渲染从解压目录读取 JSON/images（效果 > ZIP 自带 html）
 *   - 序号命名: {baseName}_OCR_{N} 替代时间戳
 */

// @ts-expect-error - adm-zip 没有官方类型
import AdmZip from 'adm-zip'
import { app } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {
  ConvertInput,
  ConvertResult,
  PDFConverter,
  ProgressCallback,
  TestConnectionResult,
} from './types'

const MINERU_API_BASE = 'https://mineru.net/api/v4'
const POLL_INTERVAL_MS = 10000
const MAX_POLL_ATTEMPTS = 30
const MAX_FILE_SIZE = 200 * 1024 * 1024
/** v9.0: 默认开启 docx + html 两种 Office 格式输出 */
const EXTRA_FORMATS = ['docx', 'html'] as const

interface BatchUploadResponse {
  code: number
  msg: string
  data: {
    batch_id: string
    file_urls: string[]
  }
}

interface ExtractResult {
  file_name: string
  data_id?: string
  state: 'waiting-file' | 'pending' | 'running' | 'done' | 'failed' | 'converting'
  full_zip_url?: string
  err_msg?: string
}

interface BatchResultResponse {
  code: number
  msg: string
  data: {
    batch_id: string
    extract_result: ExtractResult[]
  }
}

/**
 * v8.0: 安全加载 adm-zip（兼容打包后 asar.unpacked 环境）
 */
function getAdmZip(): any {
  try {
    return require('adm-zip')
  } catch (e) {
    const appPath = app.getAppPath()
    if (appPath.includes('.asar')) {
      const unpkgPath = appPath.replace('.asar', '.asar.unpacked')
      return require(path.join(unpkgPath, 'node_modules', 'adm-zip'))
    }
    throw e
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('操作已取消'))
      return
    }
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('操作已取消'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * 生成解压目录路径（在原 PDF 同目录）
 * 格式：{原PDF基名}_OCR_{序号}
 * 示例：WOSA_PCT_OCR_1/
 */
function generateExtractDirPath(originalPdfPath: string): string {
  const dir = path.dirname(originalPdfPath)
  const baseName = path.basename(originalPdfPath, path.extname(originalPdfPath))
  const n = getNextSequenceNumber(dir, baseName)
  return path.join(dir, `${baseName}_OCR_${n}`)
}

/**
 * 计算下一个可用序号
 * 扫描目录中 {baseName}_OCR_{N} 格式，取 max(N)+1
 */
function getNextSequenceNumber(dir: string, baseName: string): number {
  const esc = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&')
  const pattern = new RegExp(`^${esc}_OCR_(\\\\d+)$`)
  let maxN = 0
  try {
    for (const entry of fs.readdirSync(dir)) {
      const m = entry.match(pattern)
      if (m) {
        const n = parseInt(m[1], 10)
        if (!isNaN(n) && n > maxN) maxN = n
      }
    }
  } catch { /* 目录不存在或不可读，从 1 开始 */ }
  return maxN + 1
}

/**
 * 清理临时目录（安全删除）
 */
async function safeRm(dir: string): Promise<void> {
  try {
    await fs.promises.rm(dir, { recursive: true, force: true })
  } catch { /* 忽略删除失败 */ }
}

export class MineruConverter implements PDFConverter {
  readonly id = 'mineru'
  readonly displayName = 'MinerU'

  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'API Key 不能为空' }
    }

    try {
      const response = await fetch(`${MINERU_API_BASE}/file-urls/batch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: [],
          model_version: 'vlm',
          extra_formats: [...EXTRA_FORMATS],
        }),
      })

      const data: any = await response.json()

      if (data.msgCode === 'A0202' || data.msgCode === 'A0211') {
        return { success: false, error: 'Token 无效或已过期' }
      }

      if (!response.ok) {
        return { success: false, error: `网络错误: HTTP ${response.status}` }
      }

      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: `网络错误: ${message}` }
    }
  }

  /**
   * v9.0: 下载 ZIP → 解压到目录 → 删除 ZIP
   * 返回: outputPath = 解压目录, debugZipPath = 同样目录
   */
  async convert(
    input: ConvertInput,
    onProgress: ProgressCallback,
    signal?: AbortSignal
  ): Promise<ConvertResult> {
    const { filePath, apiKey } = input

    if (!apiKey) {
      throw new Error('API Key 不能为空')
    }

    // 0. 检查文件大小
    const stats = await fs.promises.stat(filePath)
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`文件过大: ${(stats.size / 1024 / 1024).toFixed(1)}MB > 200MB`)
    }

    const filename = path.basename(filePath)
    const dataId = `pdf-convert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    // 1. 获取上传链接
    onProgress({ progress: 5, message: '初始化任务...' })
    const { batchId, uploadUrl } = await this.getUploadUrl(
      apiKey,
      filename,
      dataId,
      signal
    )

    // 2. 上传文件
    onProgress({ progress: 15, message: '上传 PDF...' })
    await this.uploadFile(uploadUrl, filePath)

    // 3. 轮询结果
    onProgress({ progress: 25, message: '等待 OCR 处理...' })
    const extractResult = await this.pollResult(apiKey, batchId, dataId, onProgress, signal)

    if (!extractResult.full_zip_url) {
      throw new Error('MinerU 未返回结果链接')
    }

    // 4. 下载 ZIP 到临时位置
    onProgress({ progress: 80, message: '下载结果 ZIP...' })
    const tempDir = path.join(os.tmpdir(), `mineru-${Date.now()}`)
    await fs.promises.mkdir(tempDir, { recursive: true })
    const tempZipPath = path.join(tempDir, 'result.zip')

    try {
      await this.downloadZip(extractResult.full_zip_url, tempZipPath)

      // 5. 解压 ZIP 到原 PDF 同目录
      onProgress({ progress: 85, message: '解压文件...' })
      const extractDir = generateExtractDirPath(filePath)
      await fs.promises.mkdir(extractDir, { recursive: true })

      const AdmZip: any = getAdmZip()
      const zip = new AdmZip(tempZipPath)
      zip.extractAllTo(extractDir, true)
      console.log(`[MinerUConverter] ✅ ZIP 已解压到: ${extractDir}`)

      // 6. 删除 ZIP 文件（解压后不再需要）
      try {
        await fs.promises.unlink(tempZipPath)
        await safeRm(tempDir)
        console.log(`[MinerUConverter] 🗑️ ZIP 已删除`)
      } catch (err) {
        console.warn('[MinerUConverter] 删除 ZIP 失败:', err)
      }

      // 7. 从解压目录中提取 docx/html/md 路径
      onProgress({ progress: 92, message: '整理输出文件...' })
      const { outputDocxPath, outputHtmlPath, markdown } =
        await this.scanExtractedDir(extractDir)

      onProgress({ progress: 100, message: '转换完成！' })

      return {
        outputPath: extractDir,        // v9.0: 解压目录路径
        markdown,
        debugZipPath: extractDir,       // v9.0: 同样指向解压目录
        outputDocxPath,
        outputHtmlPath,
      }
    } catch (err) {
      // 出错时清理临时目录
      await safeRm(tempDir)
      throw err
    }
  }

  // ===== 私有方法 =====

  private async getUploadUrl(
    apiKey: string,
    filename: string,
    dataId: string,
    signal?: AbortSignal
  ): Promise<{ batchId: string; uploadUrl: string }> {
    const response = await fetch(`${MINERU_API_BASE}/file-urls/batch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: [{ name: filename, data_id: dataId }],
        model_version: 'vlm',
        enable_formula: true,
        enable_table: true,
        // v9.0: 默认开启 docx + html
        extra_formats: [...EXTRA_FORMATS],
      }),
      signal,
    })

    if (!response.ok) {
      throw new Error(`获取上传链接失败: HTTP ${response.status}`)
    }

    const data: BatchUploadResponse = await response.json()
    if (data.code !== 0) {
      throw new Error(data.msg || '获取上传链接失败')
    }

    return {
      batchId: data.data.batch_id,
      uploadUrl: data.data.file_urls[0],
    }
  }

  private async uploadFile(uploadUrl: string, filePath: string): Promise<void> {
    const fileBuffer = await fs.promises.readFile(filePath)
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: fileBuffer as any,
    })

    if (!response.ok) {
      throw new Error(`上传失败: HTTP ${response.status}`)
    }
  }

  private async pollResult(
    apiKey: string,
    batchId: string,
    dataId: string,
    onProgress: ProgressCallback,
    signal?: AbortSignal
  ): Promise<ExtractResult> {
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      if (signal?.aborted) {
        throw new Error('操作已取消')
      }

      await sleep(POLL_INTERVAL_MS, signal)

      if (signal?.aborted) {
        throw new Error('操作已取消')
      }

      const response = await fetch(`${MINERU_API_BASE}/extract-results/batch/${batchId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal,
      })

      if (!response.ok) {
        throw new Error(`查询任务失败: HTTP ${response.status}`)
      }

      const data: BatchResultResponse = await response.json()
      if (data.code !== 0) {
        throw new Error(data.msg || '查询任务失败')
      }

      const item = data.data.extract_result.find((r) => r.data_id === dataId)
      if (!item) continue

      const polledProgress = Math.min(25 + ((i + 1) / MAX_POLL_ATTEMPTS) * 55, 80)
      onProgress({
        progress: polledProgress,
        message: `OCR 处理中... (${i + 1}/${MAX_POLL_ATTEMPTS})`,
      })

      if (item.state === 'done') {
        return item
      }

      if (item.state === 'failed') {
        throw new Error(item.err_msg || 'OCR 任务失败')
      }
    }

    throw new Error(`OCR 处理超时（${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}秒）`)
  }

  /**
   * 下载 ZIP 到临时路径
   */
  private async downloadZip(zipUrl: string, destPath: string): Promise<void> {
    const response = await fetch(zipUrl)
    if (!response.ok) {
      throw new Error(`下载结果失败: HTTP ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const dir = path.dirname(destPath)
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true })
    }
    await fs.promises.writeFile(destPath, new Uint8Array(arrayBuffer))
  }

  /**
   * v9.0: 扫描解压目录，提取 docx/html/md 路径
   */
  private async scanExtractedDir(
    extractDir: string
  ): Promise<{ outputDocxPath?: string; outputHtmlPath?: string; markdown: string }> {
    let outputDocxPath: string | undefined
    let outputHtmlPath: string | undefined
    let markdown = ''

    try {
      const entries = await fs.promises.readdir(extractDir, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isDirectory()) continue
        const filePath = path.join(extractDir, entry.name)
        const lower = entry.name.toLowerCase()

        if (lower.endsWith('.docx')) {
          outputDocxPath = filePath
          console.log(`[MinerUConverter] 📄 发现 docx: ${filePath}`)
        } else if (lower.endsWith('.html')) {
          outputHtmlPath = filePath
          console.log(`[MinerUConverter] 🌐 发现 html: ${filePath}`)
        } else if (lower.endsWith('.md')) {
          markdown = await fs.promises.readFile(filePath, 'utf-8')
          console.log(`[MinerUConverter] 📄 读取 markdown: ${markdown.length} 字符`)
        }
      }

      // 如果没找到 md（MinerU 有时用其他命名），尝试读第一个 .md
      if (!markdown) {
        const mdFile = entries.find((e) => !e.isDirectory() && e.name.toLowerCase().endsWith('.md'))
        if (mdFile) {
          markdown = await fs.promises.readFile(path.join(extractDir, mdFile.name), 'utf-8')
        }
      }
    } catch (err) {
      console.warn('[MinerUConverter] 扫描解压目录失败:', err)
    }

    return { outputDocxPath, outputHtmlPath, markdown }
  }
}