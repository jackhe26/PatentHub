import { autoUpdater } from 'electron-updater'
import { getSettings } from './store-node'
import { getLogger } from './util'

const log = getLogger('app-updater')

/**
 * 自动更新源（构建期注入，见 electron.vite.config.ts 的 define）。
 *
 * 背景：上游 Chatbox 把更新源硬编码为 chatboxai.app，PatentHub 打包后仍会访问这些地址，
 * 运行日志中会出现 `Found version 1.23.5 (url: Chatbox-1.23.5-Setup.exe)`，
 * 存在把 PatentHub 覆盖安装成 Chatbox 的风险。
 *
 * 现改为「默认关闭 + 显式配置」：
 * - 未配置（默认）：完全不发起更新检查，也不访问任何 Chatbox 更新域名；
 * - 已配置：只访问自家的 generic 更新源（目录下需提供 latest.yml / beta.yml）。
 *
 * 构建时启用示例（PowerShell）：
 *   $env:PATENTHUB_UPDATE_URL = 'https://patents.example.com/patenthub/updates'
 *   pnpm run build; npx electron-builder build --publish never --win
 */
const UPDATE_FEED_URL = (process.env.PATENTHUB_UPDATE_URL || '').trim()

/** 是否启用自动更新；未配置更新源时为 false（屏蔽自动更新）。 */
export const isAutoUpdateEnabled = UPDATE_FEED_URL.length > 0

export class AppUpdater {
  private updateDownloaded = false

  constructor(onUpdateDownloaded: () => void) {
    log.transports.file.level = 'info'
    autoUpdater.logger = log

    autoUpdater.once('update-downloaded', () => {
      // Notify renderer process about the update
      this.updateDownloaded = true
      onUpdateDownloaded()
    })

    if (!isAutoUpdateEnabled) {
      log.info('auto update disabled: PATENTHUB_UPDATE_URL is not configured')
      return
    }

    if (!getSettings().autoUpdate) {
      log.info('auto update disabled by user settings')
      return
    }

    // 立即检查一次更新
    void this.tryUpdate()

    // 设置定时器，每小时检查一次更新
    setInterval(
      () => {
        void this.tryUpdate()
      },
      1000 * 60 * 60
    )

    log.info(`Update timer started (feed: ${UPDATE_FEED_URL}), checking every hour`)
  }

  /** 是否已下载完更新包（`install-update` 的安全校验） */
  get hasUpdateDownloaded(): boolean {
    return this.updateDownloaded
  }

  async tryUpdate() {
    if (!isAutoUpdateEnabled) {
      return null
    }
    try {
      autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_FEED_URL })
      const settings = getSettings()

      autoUpdater.channel = settings.betaUpdate ? 'beta' : 'latest'
      autoUpdater.allowDowngrade = false

      return await autoUpdater.checkForUpdatesAndNotify()
    } catch (e) {
      log.error('auto_updater: check failed', e)
      return null
    }
  }
}
