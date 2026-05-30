import localforage from 'localforage'
import { v4 as uuidv4 } from 'uuid'
import { CHATBOX_BUILD_PLATFORM } from '@/variables'
import * as defaults from '@shared/defaults'
import type { Config, Settings, ShortcutSetting } from '@shared/types'
import { parseLocale } from '@/i18n/parser'
import { type ImageGenerationStorage, IndexedDBImageGenerationStorage } from '@/storage/ImageGenerationStorage'
import { getBrowser } from '../packages/navigator'
import type { Platform, PlatformType } from './interfaces'
import type { KnowledgeBaseController } from './knowledge-base/interface'
import { IndexedDBStorage } from './storages'
import MobileExporter from './mobile_exporter'
import webLogger from './web_logger'
import { parseTextFileLocally } from './web_platform_utils'

/**
 * 移动端平台实现（Android / iOS）
 * 使用 Capacitor 原生插件提供文件系统访问、分享等功能
 */
export default class MobilePlatform extends IndexedDBStorage implements Platform {
  public type: PlatformType = 'mobile'

  public exporter = new MobileExporter()

  private imageGenerationStorage: ImageGenerationStorage | null = null

  constructor() {
    super()
    webLogger.init().catch((e) => console.error('Failed to init web logger:', e))
  }

  public async getVersion(): Promise<string> {
    return 'mobile'
  }
  public async getPlatform(): Promise<string> {
    return CHATBOX_BUILD_PLATFORM || 'android'
  }
  public async getArch(): Promise<string> {
    return 'mobile'
  }
  public async shouldUseDarkColors(): Promise<boolean> {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  public onSystemThemeChange(callback: () => void): () => void {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', callback)
    return () => {
      window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', callback)
    }
  }
  public onWindowShow(_callback: () => void): () => void {
    return () => null
  }
  public onWindowFocused(_callback: () => void): () => void {
    return () => null
  }
  public onUpdateDownloaded(_callback: () => void): () => void {
    return () => null
  }
  public async openLink(url: string): Promise<void> {
    // 使用 Capacitor Browser 打开链接
    try {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url })
    } catch {
      window.open(url, '_system')
    }
  }
  public async getDeviceName(): Promise<string> {
    try {
      const { Device } = await import('@capacitor/device')
      const info = await Device.getInfo()
      return info.model || 'Android Device'
    } catch {
      return getBrowser() || 'Mobile Device'
    }
  }
  public async getInstanceName(): Promise<string> {
    const platform = await this.getPlatform()
    return `Mobile (${platform})`
  }
  public async getLocale() {
    const lang = window.navigator.language
    return parseLocale(lang)
  }
  public async ensureShortcutConfig(_config: ShortcutSetting): Promise<void> {
    return
  }
  public async ensureProxyConfig(_config: { proxy?: string }): Promise<void> {
    return
  }
  public async relaunch(): Promise<void> {
    // 移动端无法直接 relaunch，尝试重新加载
    try {
      const { App } = await import('@capacitor/app')
      await App.exitApp()
    } catch {
      location.reload()
    }
  }

  public async getConfig(): Promise<Config> {
    let value: Config = await this.getStoreValue('configs')
    if (value === undefined || value === null) {
      value = defaults.newConfigs()
      await this.setStoreValue('configs', value)
    }
    return value
  }
  public async getSettings(): Promise<Settings> {
    let value: Settings = await this.getStoreValue('settings')
    if (value === undefined || value === null) {
      value = defaults.settings()
      await this.setStoreValue('settings', value)
    }
    return value
  }

  public async getStoreBlob(key: string): Promise<string | null> {
    return localforage.getItem<string>(key)
  }
  public async setStoreBlob(key: string, value: string): Promise<void> {
    await localforage.setItem(key, value)
  }
  public async delStoreBlob(key: string) {
    return localforage.removeItem(key)
  }
  public async listStoreBlobKeys(): Promise<string[]> {
    return localforage.keys()
  }

  public async initTracking() {
    // 移动端暂不初始化跟踪
  }
  public trackingEvent(_name: string, _params: { [key: string]: string }) {
    // 移动端暂不跟踪
  }

  public async shouldShowAboutDialogWhenStartUp(): Promise<boolean> {
    return false
  }

  public async appLog(level: string, message: string): Promise<void> {
    webLogger.log(level, message)
  }

  public async exportLogs(): Promise<string> {
    return webLogger.exportLogs()
  }

  public async clearLogs(): Promise<void> {
    return webLogger.clearLogs()
  }

  public async ensureAutoLaunch(_enable: boolean) {
    return
  }

  async parseFileLocally(file: File): Promise<{ key?: string; isSupported: boolean; error?: string }> {
    const result = await parseTextFileLocally(file)
    if (!result.isSupported) {
      return { isSupported: false }
    }
    const key = `parseFile-${uuidv4()}`
    await this.setStoreBlob(key, result.text)
    return { key, isSupported: true }
  }

  /**
   * 使用 pdfjs-dist 在移动端解析 PDF 文件
   * 
   * 方案：通过动态脚本注入加载 pdf.js（静态资源，绕过 Vite 打包）
   * 原因：Vite 对 pdfjs-dist ESM 模块的二次打包会破坏 GlobalWorkerOptions，
   *       导致 workerSrc 赋值无效，pdf.js 内部抛出 "NO 'GlobalWorkerOptions.workerSrc' specified."
   * 
   * @param file PDF 文件对象
   * @returns 解析结果
   */
  async parsePdfWithPdfJs(file: File): Promise<{ content: string; error?: string }> {
    console.log('[MobilePlatform] Starting PDF parsing, file:', file.name, 'size:', file.size)
    
    try {
      // 步骤1：动态加载 pdf.js bridge（静态资源，不被 Vite 处理）
      console.log('[MobilePlatform] Loading pdf.js via script injection...')
      let pdfjsLib = (window as any).pdfjsLib
      
      if (!pdfjsLib) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.type = 'module'
          script.src = '/pdfjs/pdf-bridge.mjs'
          script.onload = () => {
            console.log('[MobilePlatform] pdf.js bridge loaded')
            pdfjsLib = (window as any).pdfjsLib
            resolve()
          }
          script.onerror = (e) => {
            console.error('[MobilePlatform] Failed to load pdf.js bridge:', e)
            reject(new Error('PDF解析库加载失败'))
          }
          document.head.appendChild(script)
        })
      }

      // 检查 pdfjsLib 是否正确加载
      if (!pdfjsLib || !pdfjsLib.getDocument) {
        console.error('[MobilePlatform] pdfjs-dist not loaded, pdfjsLib:', typeof pdfjsLib)
        return { content: '', error: 'PDF解析库加载失败，请尝试使用云解析' }
      }
      console.log('[MobilePlatform] pdfjsLib ready, workerSrc:', pdfjsLib.GlobalWorkerOptions?.workerSrc)

      // 步骤2：将 File 对象转为 ArrayBuffer
      console.log('[MobilePlatform] Converting file to ArrayBuffer...')
      let arrayBuffer: ArrayBuffer
      
      try {
        arrayBuffer = await file.arrayBuffer()
        console.log('[MobilePlatform] ArrayBuffer created, length:', arrayBuffer.byteLength)
      } catch (arrayBufferError) {
        console.error('[MobilePlatform] ArrayBuffer error:', arrayBufferError)
        return { content: '', error: `文件读取失败: ${arrayBufferError instanceof Error ? arrayBufferError.message : '未知错误'}` }
      }

      // 检查 ArrayBuffer 是否有效
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        return { content: '', error: 'PDF文件为空或读取失败' }
      }

      // 步骤3：加载 PDF 文档
      console.log('[MobilePlatform] Loading PDF document...')
      let pdf: any
      try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
        pdf = await loadingTask.promise
        console.log('[MobilePlatform] PDF loaded, pages:', pdf.numPages)
      } catch (pdfLoadError) {
        console.error('[MobilePlatform] PDF load error:', pdfLoadError)
        return { content: '', error: `PDF文件格式错误: ${pdfLoadError instanceof Error ? pdfLoadError.message : '无法加载PDF文件'}` }
      }

      // 提取每一页的文本
      const textParts: string[] = []

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        console.log('[MobilePlatform] Processing page:', pageNum)
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()

        // 合并文本项
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()

        if (pageText) {
          textParts.push(pageText)
        }
      }

      const fullText = textParts.join('\n\n')
      console.log('[MobilePlatform] Extracted text length:', fullText.length)

      if (!fullText || fullText.length === 0) {
        return { content: '', error: 'PDF文本提取失败：PDF可能是扫描版或图片格式，请尝试使用云解析' }
      }

      return { content: fullText }
    } catch (error) {
      console.error('[MobilePlatform] PDF parsing error:', error)
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      
      // 根据错误类型返回友好的错误信息
      if (errorMessage.includes('Worker') || errorMessage.includes('worker')) {
        return { content: '', error: 'PDF解析Worker加载失败，请尝试使用云解析' }
      }
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('network')) {
        return { content: '', error: '网络连接失败，请检查网络后重试' }
      }
      
      return { content: '', error: `PDF解析失败: ${errorMessage}` }
    }
  }

  public async isFullscreen() {
    return true
  }

  public async setFullscreen(_enabled: boolean): Promise<void> {
    return
  }

  installUpdate(): Promise<void> {
    return Promise.resolve()
  }

  public getKnowledgeBaseController(): KnowledgeBaseController {
    throw new Error('Method not implemented.')
  }

  public getImageGenerationStorage(): ImageGenerationStorage {
    if (!this.imageGenerationStorage) {
      this.imageGenerationStorage = new IndexedDBImageGenerationStorage()
    }
    return this.imageGenerationStorage
  }

  public minimize() {
    return Promise.resolve()
  }

  public maximize() {
    return Promise.resolve()
  }

  public unmaximize() {
    return Promise.resolve()
  }

  public closeWindow() {
    return Promise.resolve()
  }

  public isMaximized() {
    return Promise.resolve(true)
  }

  public onMaximizedChange() {
    return () => null
  }
}
