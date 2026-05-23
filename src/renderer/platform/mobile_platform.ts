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
