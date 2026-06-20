/**
 * MinerU PDF 转换器 (v7.10 简化版)
 *
 * 设计原则：与 src/main/knowledge-base/parsers/mineru-parser.ts 独立
 *
 * v7.10 重构:
 *   - 不再输出 PDF OCR 文件 (排版糟糕, 已弃用)
 *   - 只调 MinerU API 获取 ZIP, 保存到原 PDF 同目录
 *   - HTML 生成交给 ipc-handlers 的 pdf-convert:build-html
 *
 * API 调用流程参考 mineru-parser.ts，但代码完全独立维护。
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
 * 生成 ZIP 文件路径（在原 PDF 同目录）
 * 格式：{原PDF基名}_mineru_{时间戳}.zip
 * 示例：WOSA_PCT_mineru_20260620_000630.zip
 */
function generateZipPath(originalPdfPath: string): string {
  const dir = path.dirname(originalPdfPath)
  const baseName = path.basename(originalPdfPath, path.extname(originalPdfPath))
  const now = new Date()
  const timestamp =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0')
  return path.join(dir, `${baseName}_mineru_${timestamp}.zip`)
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
   * v7.10: 只下载 ZIP, 不再重建 PDF
   * 返回: outputPath = ZIP 路径, debugZipPath = 同样 ZIP 路径
   * HTML 生成由 pdf-convert:build-html handler 处理
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

    // 4. 下载 ZIP 并保存到原 PDF 同目录
    onProgress({ progress: 80, message: '下载结果 ZIP...' })
    const zipPath = generateZipPath(filePath)
    await this.downloadZip(extractResult.full_zip_url, zipPath)
    console.log(`[MinerUConverter] ✅ ZIP 已保存到: ${zipPath}`)

    // 5. 读取 markdown (如果有)
    let markdown = ''
    try {
      const tempDir = path.join(os.tmpdir(), `mineru-read-md-${Date.now()}`)
      await fs.promises.mkdir(tempDir, { recursive: true })
      try {
        const AdmZip: any = getAdmZip()
        const zip = new AdmZip(zipPath)
        const mdEntry = zip.getEntries().find((e: any) => e.entryName.endsWith('.md') && !e.isDirectory)
        if (mdEntry) {
          markdown = mdEntry.getData().toString('utf-8')
          console.log(`[MinerUConverter] 📄 读取 markdown: ${markdown.length} 字符`)
        }
      } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
      }
    } catch (err) {
      console.warn('[MinerUConverter] 读取 markdown 失败:', err)
    }

    onProgress({ progress: 100, message: '转换完成！' })

    return {
      outputPath: zipPath,        // v7.10: outputPath 现在是 ZIP 路径
      markdown,
      debugZipPath: zipPath,       // v7.10: 同样提供 debugZipPath
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
   * 下载 ZIP 到本地路径
   */
  private async downloadZip(zipUrl: string, destPath: string): Promise<void> {
    const response = await fetch(zipUrl)
    if (!response.ok) {
      throw new Error(`下载结果失败: HTTP ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()

    // 确保目录存在
    const dir = path.dirname(destPath)
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true })
    }

    // 写入文件 (转 Uint8Array 避免 Buffer 类型冲突)
    await fs.promises.writeFile(destPath, new Uint8Array(arrayBuffer))
  }
}
