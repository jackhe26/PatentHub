import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Toast } from '@capacitor/toast'
import type { Exporter } from './interfaces'
import * as base64 from '@/packages/base64'

/**
 * 移动端导出器（Android/iOS）
 * 使用 Capacitor 原生 API 实现文件保存和分享
 *
 * 核心设计：
 * - 完全避免 Web Share API (navigator.share) —— 在 Capacitor Android WebView 中，
 *   异步函数链会使用户手势上下文过期，导致 navigator.share 静默失败。
 * - 统一使用 Capacitor 原生插件（Filesystem + Share + Toast），可靠稳定。
 * - 保存流程：写入 Cache 目录 → 调用系统分享面板 → 用户选择"保存到相册"/"下载"
 */
export default class MobileExporter implements Exporter {
  /**
   * 显示原生 Toast 提示
   */
  private async showToast(message: string) {
    console.log('MobileExporter:', message)
    try {
      await Toast.show({ text: message, duration: 'short' })
    } catch {
      // Toast 失败则派发自定义事件
      window.dispatchEvent(new CustomEvent('mobile-toast', { detail: { message } }))
    }
  }

  async exportBlob(filename: string, blob: Blob, _encoding?: 'utf8' | 'ascii' | 'utf16') {
    // 移动端：直接转 base64 后走统一保存流程
    const reader = new FileReader()
    reader.readAsDataURL(blob)
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Failed to read blob'))
    })
    await this.saveBase64ToDevice(filename, dataUrl)
  }

  async exportTextFile(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/plain' })
    await this.exportBlob(filename, blob)
  }

  async exportImageFile(basename: string, base64Data: string) {
    console.log('MobileExporter: exportImageFile called', { basename, dataLength: base64Data?.length })

    try {
      const { type, data } = base64.parseImage(base64Data)

      if (!data) {
        console.error('MobileExporter: invalid base64 data')
        await this.showToast('图片数据无效')
        return
      }

      // 如果是远程 URL，先下载成 blob 再处理
      if (data.startsWith('http://') || data.startsWith('https://')) {
        try {
          await this.showToast('正在下载图片...')
          const response = await fetch(data)
          const blob = await response.blob()
          const ext = (type.split('/')[1] || 'png').split('+')[0]
          await this.exportBlob(basename + '.' + ext, blob)
        } catch (error) {
          console.error('MobileExporter: Failed to download URL:', error)
          await this.showToast('下载图片失败，请重试')
        }
        return
      }

      // 本地 base64 图片：直接写入设备并分享
      const ext = (type.split('/')[1] || 'png').split('+')[0]
      const filename = basename + '.' + ext
      await this.saveBase64ToDevice(filename, base64Data)
    } catch (error) {
      console.error('MobileExporter: exportImageFile error:', error)
      await this.showToast('保存图片失败，请重试')
    }
  }

  async exportByUrl(filename: string, url: string) {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      await this.exportBlob(filename, blob)
    } catch (error) {
      console.error('MobileExporter: Failed to export by URL:', error)
    }
  }

  async exportStreamingJson(filename: string, dataCallback: () => AsyncGenerator<string, void, unknown>) {
    try {
      let content = ''
      const generator = dataCallback()
      for await (const chunk of generator) {
        content += chunk
      }
      await this.exportTextFile(filename, content)
    } catch (error) {
      console.error('MobileExporter: Failed to export streaming JSON:', error)
      throw error
    }
  }

  /**
   * 核心保存方法：
   * 1. 写入 Cache 目录（无需任何权限，Android 所有版本均可用）
   * 2. 调用 Capacitor Share 原生插件弹出系统分享面板
   *    用户在面板中选择"保存到相册"/"下载"即可
   */
  private async saveBase64ToDevice(filename: string, base64Data: string) {
    console.log('MobileExporter: saveBase64ToDevice', { filename })

    try {
      const { data } = base64.parseImage(base64Data)
      const pureBase64 = data || base64Data.replace(/^data:[^;]+;base64,/, '')
      const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')

      // 写入 Cache 目录（任何 Android 版本、无需权限）
      const savedFile = await Filesystem.writeFile({
        path: safeFilename,
        data: pureBase64,
        directory: Directory.Cache,
      })
      console.log('MobileExporter: File cached at', savedFile.uri)

      // 弹出系统分享面板，用户选择"保存到相册"或"下载"
      // 注意：Android 上必须用 files 数组传本地文件路径，url 参数只用于网页链接
      await Share.share({
        title: '保存图片',
        files: [savedFile.uri],
        dialogTitle: '保存图片到相册或下载',
      })
    } catch (error) {
      console.error('MobileExporter: saveBase64ToDevice error:', error)
      await this.showToast('保存失败，请重试')
    }
  }
}
