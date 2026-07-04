/**
 * PDF 格式转换 IPC Handler
 *
 * 独立于 src/main/pdf-translate/ 与 src/main/knowledge-base/。
 * 仅服务于 PDF 转换 Tab 的 IPC 通信。
 */

import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getConverter } from './registry'
import { getServiceGlobalConfig, saveServiceGlobalConfig } from './settings'
import type { ProgressEvent, MyOcrOptions } from './types'
import { normalizeJson } from './pdf-rebuilder'
import { rebuildHtml } from './html-renderer'
import { MyOcrConverter } from './myocr-converter'

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

/**
 * 注册 PDF 转换相关的 IPC handler
 */
export function registerPDFConvertHandlers(): void {
  // 执行转换
  ipcMain.handle(
    'pdf-convert:convert',
    async (_event, params: {
      service: string
      filePath: string
      apiKey: string
      rebuildMode?: 'auto' | 'json' | 'markdown'
      /** v8.0: myOCR 专用参数 */
      myOcrOptions?: MyOcrOptions
    }) => {
      try {
        const converter = getConverter(params.service)
        if (!converter) {
          return {
            success: false,
            error: `未知的 PDF 转换服务: ${params.service}`,
          }
        }

        // 进度回调
        const sendProgress = (data: ProgressEvent) => {
          const wins = BrowserWindow.getAllWindows()
          for (const win of wins) {
            try {
              win.webContents.send('pdf-convert:progress', data)
            } catch {
              // 窗口可能已关闭，忽略
            }
          }
        }

        const result = await converter.convert(
          {
            filePath: params.filePath,
            apiKey: params.apiKey,
            rebuildMode: params.rebuildMode ?? 'auto',
            // v8.0: myOCR 专用参数透传
            myOcrOptions: params.myOcrOptions,
          },
          sendProgress
        )

        return {
          success: true,
          outputPath: result.outputPath,
          pdfType: result.pdfType,
          debugZipPath: result.debugZipPath,
          // v7.12: MinerU-Office 额外返回 docx/html 路径
          outputDocxPath: result.outputDocxPath,
          outputHtmlPath: result.outputHtmlPath,
          // v8.0: myOCR 返回真实 PDF 路径和环境状态
          outputPdfPath: result.outputPdfPath,
          environment: result.environment,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[PDF Convert] failed:', message)
        return {
          success: false,
          error: message,
        }
      }
    }
  )

  // ============ v8.0: myOCR 环境检测 ============
  ipcMain.handle(
    'pdf-convert:detect-myocr-env',
    async () => {
      try {
        const myOcr = new MyOcrConverter()
        const env = await myOcr.getEnvironmentStatus()
        return { success: true, env }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { success: false, error: message }
      }
    }
  )

  // ============ v9.1: myOCR 下载 Tesseract 语言包 ============
  ipcMain.handle(
    'pdf-convert:install-tesseract-lang',
    async (_event, params: { langCode: string }) => {
      try {
        const myOcr = new MyOcrConverter()
        const result = await myOcr.installLanguage(params.langCode)
        if (result.success) {
          return {
            success: true,
            path: result.path,
            size: result.size,
            sizeMB: result.size ? (result.size / 1024 / 1024).toFixed(1) : undefined,
          }
        } else {
          return { success: false, error: result.error }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { success: false, error: message }
      }
    }
  )

  // 测试连接
  ipcMain.handle(
    'pdf-convert:test-connection',
    async (_event, params: { service: string; apiKey: string }) => {
      try {
        const converter = getConverter(params.service)
        if (!converter) {
          return { success: false, error: `未知的服务商: ${params.service}` }
        }
        return await converter.testConnection(params.apiKey)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { success: false, error: message }
      }
    }
  )

  // 读取全局配置
  ipcMain.handle(
    'pdf-convert:get-global-config',
    async (_event, service: string) => {
      try {
        return getServiceGlobalConfig(service)
      } catch (err) {
        console.error('[PDF Convert] get-global-config failed:', err)
        return {}
      }
    }
  )

  // 保存全局配置
  ipcMain.handle(
    'pdf-convert:save-global-config',
    async (_event, params: { service: string; config: { apiKey?: string } }) => {
      try {
        saveServiceGlobalConfig(params.service, params.config)
        return { success: true }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[PDF Convert] save-global-config failed:', message)
        return { success: false, error: message }
      }
    }
  )

  // ============ HTML 预览 (新增 v6, v9.0 扩展) ============
  // 输入：JSON 文件路径 / MinerU ZIP 路径 / 解压目录路径 → 返回 HTML 字符串
  // 0 依赖, 0 后端转换, < 100ms 返回
  ipcMain.handle(
    'pdf-convert:build-html',
    async (_event, params: { jsonPath?: string; zipPath?: string; dirPath?: string }) => {
      try {
        let jsonData: any = null
        let sourceLabel = ''
        let imageBase64Map: Record<string, string> = {}

        // v9.0: 优先从解压目录读取（最快，MinerU 默认模式）
        if (params.dirPath && fs.existsSync(params.dirPath)) {
          const dir = params.dirPath

          // 1. 按优先级查找 JSON 文件
          // 顺序: layout.json > content_list_v2.json > model.json > content_list.json
          const candidates = [
            path.join(dir, 'layout.json'),
            path.join(dir, `${path.basename(dir).replace(/_OCR_\\d+$/, '')}_layout.json`),
          ]
          // 扫描目录内所有 _content_list_v2.json / model.json / content_list.json
          const entries = await fs.promises.readdir(dir, { withFileTypes: true })
          for (const e of entries) {
            if (e.isDirectory()) continue
            // v9.1: 用 push 保持正确优先级（layout.json 在前）
            if (e.name.endsWith('_content_list_v2.json')) candidates.push(path.join(dir, e.name))
            if (e.name.endsWith('model.json') && !e.name.includes('middle')) candidates.push(path.join(dir, e.name))
            if (e.name.endsWith('_content_list.json') && !e.name.includes('_v2')) candidates.push(path.join(dir, e.name))
          }

          for (const cand of candidates) {
            if (fs.existsSync(cand)) {
              const raw = await fs.promises.readFile(cand, 'utf-8')
              jsonData = JSON.parse(raw)
              sourceLabel = cand
              break
            }
          }

          if (!jsonData) {
            return { success: false, error: '解压目录中未找到任何 JSON 文件' }
          }

          // 2. 读 images/ 目录所有图片转 base64
          const imagesDir = path.join(dir, 'images')
          if (fs.existsSync(imagesDir)) {
            const imgEntries = await fs.promises.readdir(imagesDir, { withFileTypes: true })
            for (const e of imgEntries) {
              if (e.isDirectory()) continue
              // v9.2: 匹配常见图片格式
              if (!/\.(jpg|jpeg|png|gif|webp|bmp|tiff|svg)$/i.test(e.name)) continue
              try {
                const buf = await fs.promises.readFile(path.join(imagesDir, e.name))
                const ext = (e.name.split('.').pop() ?? 'jpg').toLowerCase()
                const mime = ext === 'jpg' ? 'jpeg' : ext
                const b64 = `data:image/${mime};base64,${buf.toString('base64')}`
                // v9.2: 存 4 个 key 变体，覆盖所有平台和转义
                imageBase64Map[e.name] = b64                          // 1. 裸文件名
                imageBase64Map[`images/${e.name}`] = b64              // 2. 正斜杠 images
                imageBase64Map[`images\\${e.name}`] = b64             // 3. 反斜杠 images (Windows)
                imageBase64Map[path.join('images', e.name).replace(/\\\\/g, '/')] = b64 // 4. 平台原生
              } catch (err) {
                console.warn(`[PDFConvert] 读图片失败: ${e.name}`, err)
              }
            }
            // v9.2: 每个文件存了 4 个 key，真实文件数 = 总数 / 4
            const fileCount = Math.floor(Object.keys(imageBase64Map).length / 4)
            console.log(`[PDFConvert] ✅ 从目录加载 ${fileCount} 张图片 (共 ${Object.keys(imageBase64Map).length} 个 key 变体)`)
          }
        } else if (params.jsonPath && fs.existsSync(params.jsonPath)) {
          // 直接读 JSON
          const raw = await fs.promises.readFile(params.jsonPath, 'utf-8')
          jsonData = JSON.parse(raw)
          sourceLabel = params.jsonPath
        } else if (params.zipPath && fs.existsSync(params.zipPath)) {
          // 从 ZIP 中提取（兼容旧模式）
          const AdmZip: any = getAdmZip()
          const zip = new AdmZip(params.zipPath)
          const entries: any[] = zip.getEntries()

          const layoutJson = entries.find(
            (e: any) => e.entryName.endsWith('layout.json') && !e.entryName.endsWith('_layout.json')
          )
          const contentV2 = entries.find((e: any) => e.entryName.endsWith('_content_list_v2.json'))
          const modelJson = entries.find(
            (e: any) => e.entryName.endsWith('model.json') && !e.entryName.endsWith('middle.json')
          )
          const contentList = entries.find(
            (e: any) => e.entryName.endsWith('_content_list.json') && !e.entryName.endsWith('_v2.json')
          )
          const target = layoutJson ?? contentV2 ?? modelJson ?? contentList
          if (!target) {
            return { success: false, error: 'ZIP 中未找到任何 JSON 文件' }
          }
          jsonData = JSON.parse(target.getData().toString('utf-8'))
          sourceLabel = `${params.zipPath} -> ${target.entryName}`

          const imageEntries = entries.filter(
            (e: any) => e.entryName.startsWith('images/') && /\\.(jpg|jpeg|png|gif|webp)$/i.test(e.entryName)
          )
          for (const imgEntry of imageEntries) {
            try {
              const buf = imgEntry.getData()
              const ext = (imgEntry.entryName.split('.').pop() ?? 'jpg').toLowerCase()
              const mime = ext === 'jpg' ? 'jpeg' : ext
              const b64 = `data:image/${mime};base64,${buf.toString('base64')}`
              const fileName = imgEntry.entryName.split('/').pop() ?? imgEntry.entryName
              imageBase64Map[imgEntry.entryName] = b64
              imageBase64Map[fileName] = b64
              if (!imgEntry.entryName.startsWith('images/')) {
                imageBase64Map[`images/${fileName}`] = b64
              }
            } catch (e) {
              console.warn(`[PDFConvert] 读图片失败: ${imgEntry.entryName}`, e)
            }
          }
        } else {
          return { success: false, error: 'dirPath / jsonPath / zipPath 都未提供或不存在' }
        }

        // 统一调用 rebuildHtml
        const { pages, format } = normalizeJson(jsonData)
        const html = rebuildHtml(pages, {
          embedStyles: true,
          // @ts-ignore - tableAsHtml 为预存在字段，HtmlRebuildOptions 接口暂未声明
          tableAsHtml: true,
          embedImages: Object.keys(imageBase64Map).length > 0,
          imageBase64Map: Object.keys(imageBase64Map).length > 0 ? imageBase64Map : undefined,
          layoutMode: 'absolute',
        })
        console.log(
          `[PDFConvert] ✅ HTML 生成成功: ${pages.length} 页, ${html.length} 字节 (源: ${sourceLabel}, 格式: ${format}, 图片: ${Object.keys(imageBase64Map).length})`
        )
        return { success: true, html, pageCount: pages.length, format, imageCount: Object.keys(imageBase64Map).length }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[PDFConvert] build-html failed:', message)
        return { success: false, error: message }
      }
    }
  )

  // ============ HTML → PDF (新增 v6, 0 依赖) ============
  // 用 Electron BrowserWindow.printToPDF 走 Chromium 内置引擎
  ipcMain.handle(
    'pdf-convert:html-to-pdf',
    async (_event, params: { html: string; outputPath: string; format?: 'A4' | 'A3' | 'Letter' }) => {
      let win: BrowserWindow | null = null
      try {
        const { html, outputPath, format = 'A4' } = params
        if (!html) return { success: false, error: 'HTML 内容为空' }

        // 创建隐藏的 BrowserWindow
        win = new BrowserWindow({
          show: false,
          webPreferences: {
            sandbox: true,
            nodeIntegration: false,
            contextIsolation: true,
            javascript: false, // 安全: HTML 中不执行 JS
          },
        })

        // 加载 HTML (用 data URL 避免文件依赖)
        const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
        await win.loadURL(dataUrl)

        // 等待渲染完成后调用 printToPDF
        // v9.2: 优先用 CSS 定义的 @page 尺寸（mm），不受 pageSize 限制
        const pdfBuffer = await win.webContents.printToPDF({
          pageSize: format,
          printBackground: true,
          preferCSSPageSize: true,  // ★ 优先用 CSS 里的 width/height (mm)
          margins: { top: 0, bottom: 0, left: 0, right: 0 }, // 由 CSS 控制
        })

        // 写入磁盘
        const dir = path.dirname(outputPath)
        if (!fs.existsSync(dir)) {
          await fs.promises.mkdir(dir, { recursive: true })
        }
        // Buffer 转 Uint8Array 避免 TypeScript 类型问题
        await fs.promises.writeFile(outputPath, new Uint8Array(pdfBuffer))

        console.log(`[PDFConvert] ✅ HTML→PDF 成功: ${outputPath} (${pdfBuffer.length} 字节)`)
        return { success: true, path: outputPath, size: pdfBuffer.length }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[PDFConvert] html-to-pdf failed:', message)
        return { success: false, error: message }
      } finally {
        // 务必关闭隐藏窗口
        if (win && !win.isDestroyed()) {
          win.close()
        }
      }
    }
  )

  // ============ 聊天导出 → PDF (新增, 独立于 pdf-convert, 支持 CDN) ============
  // 用临时文件 + loadFile 绕过 data URL 2MB 限制, 允许 JS 加载 KaTeX CDN
  ipcMain.handle(
    'export:html-to-pdf',
    async (_event, params: { html: string; outputPath?: string; format?: 'A4' | 'A3' | 'Letter' }) => {
      let win: BrowserWindow | null = null
      try {
        const { html, outputPath: _outputPath, format = 'A4' } = params
        const outputPath = _outputPath || path.join(os.tmpdir(), `patenthub-chat-export-${Date.now()}.pdf`)
        if (!html) return { success: false, error: 'HTML 内容为空' }

        // 写 HTML 到临时文件（绕过 data URL 2MB 上限）
        const tempHtmlPath = path.join(os.tmpdir(), `patenthub-chat-export-${Date.now()}.html`)
        await fs.promises.writeFile(tempHtmlPath, html, 'utf-8')

        // 创建隐藏 BrowserWindow（允许 JS 运行 CDN 脚本）
        win = new BrowserWindow({
          show: false,
          webPreferences: {
            sandbox: false,
            nodeIntegration: false,
            contextIsolation: true,
            javascript: true,
          },
        })

        await win.loadFile(tempHtmlPath)

        // 清理临时文件
        try { await fs.promises.unlink(tempHtmlPath) } catch { /* ignore */ }

        const pdfBuffer = await win.webContents.printToPDF({
          pageSize: format,
          printBackground: true,
          preferCSSPageSize: true,
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        })

        const dir = path.dirname(outputPath)
        if (!fs.existsSync(dir)) {
          await fs.promises.mkdir(dir, { recursive: true })
        }
        await fs.promises.writeFile(outputPath, new Uint8Array(pdfBuffer))

        console.log(`[Export] ✅ HTML→PDF 成功: ${outputPath} (${pdfBuffer.length} 字节)`)
        return { success: true, path: outputPath, size: pdfBuffer.length }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[Export] html-to-pdf failed:', message)
        return { success: false, error: message }
      } finally {
        if (win && !win.isDestroyed()) {
          win.close()
        }
      }
    }
  )

  // ============ 聊天导出 → PDF（带保存对话框）(新增) ============
  // 生成 PDF 后弹出 save dialog，让用户选择保存位置，不再走临时目录 + shell:openPath
  ipcMain.handle(
    'export:save-pdf',
    async (_event, params: { html: string; suggestedName?: string; format?: 'A4' | 'A3' | 'Letter' }) => {
      let win: BrowserWindow | null = null
      try {
        const { html, suggestedName = 'export.pdf', format = 'A4' } = params
        if (!html) return { success: false, error: 'HTML 内容为空' }

        // 写 HTML 到临时文件（绕过 data URL 2MB 上限，允许 JS 加载 CDN）
        const tempHtmlPath = path.join(os.tmpdir(), `patenthub-chat-export-${Date.now()}.html`)
        await fs.promises.writeFile(tempHtmlPath, html, 'utf-8')

        // 创建隐藏 BrowserWindow（允许 JS 运行 CDN 脚本）
        win = new BrowserWindow({
          show: false,
          webPreferences: {
            sandbox: false,
            nodeIntegration: false,
            contextIsolation: true,
            javascript: true,
          },
        })

        await win.loadFile(tempHtmlPath)

        // 清理临时文件
        try { await fs.promises.unlink(tempHtmlPath) } catch { /* ignore */ }

        const pdfBuffer = await win.webContents.printToPDF({
          pageSize: format,
          printBackground: true,
          preferCSSPageSize: true,
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        })

        // 关闭隐藏窗口（提前释放，再弹对话框）
        if (win && !win.isDestroyed()) {
          win.close()
          win = null
        }

        // 弹保存对话框
        const saveResult = await dialog.showSaveDialog({
          title: '保存 PDF 文件',
          defaultPath: suggestedName.endsWith('.pdf') ? suggestedName : `${suggestedName}.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        })

        if (saveResult.canceled || !saveResult.filePath) {
          return { success: false, canceled: true }
        }

        await fs.promises.writeFile(saveResult.filePath, new Uint8Array(pdfBuffer))
        console.log(`[Export] ✅ PDF 保存成功: ${saveResult.filePath} (${pdfBuffer.length} 字节)`)
        return { success: true, path: saveResult.filePath, size: pdfBuffer.length }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[Export] save-pdf failed:', message)
        return { success: false, error: message }
      } finally {
        if (win && !win.isDestroyed()) {
          win.close()
        }
      }
    }
  )

  // ============ HTML 另存为 HTML 文件 (新增 v6) ============
  // 让用户能"下载 HTML 文件"
  ipcMain.handle(
    'pdf-convert:save-html',
    async (_event, params: { html: string; suggestedName?: string }) => {
      try {
        const { html, suggestedName = 'reconstructed.html' } = params
        if (!html) return { success: false, error: 'HTML 内容为空' }

        // 让用户选保存位置
        const { dialog } = await import('electron')
        const result = await dialog.showSaveDialog({
          title: '保存 HTML 文件',
          defaultPath: suggestedName,
          filters: [{ name: 'HTML', extensions: ['html'] }],
        })

        if (result.canceled || !result.filePath) {
          return { success: false, error: '用户取消保存' }
        }

        await fs.promises.writeFile(result.filePath, html, 'utf-8')
        console.log(`[PDFConvert] ✅ HTML 保存成功: ${result.filePath}`)
        return { success: true, path: result.filePath }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[PDFConvert] save-html failed:', message)
        return { success: false, error: message }
      }
    }
  )

  // 保留 os 导入,避免 lint 警告
  void os
}

// ============ v8.0: 读取 MinerU-Office 原始生成的 HTML 文件 (直接渲染,不走 rebuildHtml) ============
ipcMain.handle(
  'pdf-convert:load-raw-html',
  async (_event, params: { htmlPath: string }) => {
    try {
      const { htmlPath } = params
      if (!htmlPath || !fs.existsSync(htmlPath)) {
        return { success: false, error: 'HTML 文件不存在' }
      }
      const html = await fs.promises.readFile(htmlPath, 'utf-8')
      console.log(`[PDFConvert] ✅ 加载 MinerU-Office 原始 HTML: ${htmlPath} (${html.length} 字节)`)
      return { success: true, html }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[PDFConvert] load-raw-html failed:', message)
      return { success: false, error: message }
    }
  }
)
