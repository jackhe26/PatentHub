/**
 * PDF 格式转换 IPC Handler
 *
 * 独立于 src/main/pdf-translate/ 与 src/main/knowledge-base/。
 * 仅服务于 PDF 转换 Tab 的 IPC 通信。
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getConverter } from './registry'
import { getServiceGlobalConfig, saveServiceGlobalConfig } from './settings'
import type { ProgressEvent } from './types'
import { normalizeJson } from './pdf-rebuilder'
import { rebuildHtml } from './html-renderer'

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

  // ============ HTML 预览 (新增 v6) ============
  // 输入：JSON 文件路径 或 MinerU ZIP 路径 → 返回 HTML 字符串
  // 0 依赖, 0 后端转换, < 100ms 返回
  ipcMain.handle(
    'pdf-convert:build-html',
    async (_event, params: { jsonPath?: string; zipPath?: string }) => {
      try {
        let jsonData: any = null
        let sourceLabel = ''

        if (params.jsonPath && fs.existsSync(params.jsonPath)) {
          // 直接读 JSON
          const raw = await fs.promises.readFile(params.jsonPath, 'utf-8')
          jsonData = JSON.parse(raw)
          sourceLabel = params.jsonPath
        } else if (params.zipPath && fs.existsSync(params.zipPath)) {
          // 从 ZIP 中提取优先的 JSON
          // adm-zip 没有官方类型,用 getAdmZip 兜底（兼容 asar.unpacked）
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const AdmZip: any = getAdmZip()
          const zip = new AdmZip(params.zipPath)
          const entries: any[] = zip.getEntries()

          // 按优先级查找 (与 mineru-converter.ts 一致)
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

          // v6.2: 顺便读 images/ 目录所有图片转 base64 (绝对定位模式需要)
          const imageEntries = entries.filter(
            (e: any) => e.entryName.startsWith('images/') && /\.(jpg|jpeg|png|gif|webp)$/i.test(e.entryName)
          )
          console.log(`[PDFConvert] 🖼️ 找到 ${imageEntries.length} 张图片`)

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const imageBase64Map: Record<string, string> = {}
          for (const imgEntry of imageEntries) {
            try {
              const buf = imgEntry.getData()  // Buffer
              const ext = (imgEntry.entryName.split('.').pop() ?? 'jpg').toLowerCase()
              const mime = ext === 'jpg' ? 'jpeg' : ext
              const b64 = `data:image/${mime};base64,${buf.toString('base64')}`
              // 支持多种路径表示 (images/xxx.jpg 或只有文件名)
              const fileName = imgEntry.entryName.split('/').pop() ?? imgEntry.entryName
              imageBase64Map[imgEntry.entryName] = b64
              imageBase64Map[fileName] = b64
              // 也支持 'images/xxx.jpg' (MinerU img_path 格式)
              if (!imgEntry.entryName.startsWith('images/')) {
                imageBase64Map[`images/${fileName}`] = b64
              }
            } catch (e) {
              console.warn(`[PDFConvert] 读图片失败: ${imgEntry.entryName}`, e)
            }
          }
          console.log(`[PDFConvert] ✅ 加载 ${Object.keys(imageBase64Map).length} 张图片到 base64 map`)

          // 调用 rebuildHtml 启用绝对定位 + base64 图片
          const { pages, format } = normalizeJson(jsonData)
          const html = rebuildHtml(pages, {
            embedStyles: true,
            tableAsHtml: true,
            embedImages: true,
            imageBase64Map,
            layoutMode: 'absolute',  // v6.2: 精准还原 PDF 布局
          })
          console.log(
            `[PDFConvert] ✅ HTML 生成成功 (绝对定位模式): ${pages.length} 页, ${html.length} 字节 (源: ${sourceLabel}, 格式: ${format}, 图片: ${Object.keys(imageBase64Map).length})`
          )
          return { success: true, html, pageCount: pages.length, format, imageCount: imageEntries.length }
        } else {
          return { success: false, error: 'jsonPath 和 zipPath 都未提供或不存在' }
        }

        // 走 jsonPath 分支 (无 images, 用相对路径)
        const { pages, format } = normalizeJson(jsonData)
        const html = rebuildHtml(pages, { embedStyles: true, tableAsHtml: true })
        console.log(
          `[PDFConvert] ✅ HTML 生成成功: ${pages.length} 页, ${html.length} 字节 (源: ${sourceLabel}, 格式: ${format})`
        )
        return { success: true, html, pageCount: pages.length, format }
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
        // printToPDF 内部会用 Chromium 的打印引擎
        const pdfBuffer = await win.webContents.printToPDF({
          pageSize: format,
          printBackground: true,
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
