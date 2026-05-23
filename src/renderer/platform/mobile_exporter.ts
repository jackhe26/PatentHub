import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { Exporter } from './interfaces'
import * as base64 from '@/packages/base64'

/**
 * 移动端导出器（Android/iOS）
 * 使用 Capacitor 原生 API 实现文件保存和分享
 */
export default class MobileExporter implements Exporter {
  async exportBlob(filename: string, blob: Blob, _encoding?: 'utf8' | 'ascii' | 'utf16') {
    // 先尝试 Web Share API
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename)] })) {
      try {
        await navigator.share({
          files: [new File([blob], filename)],
        })
        return
      } catch {
        // 用户取消或分享失败，fallback 到 Capacitor 方式
      }
    }

    // 使用 Capacitor Filesystem 写入文件
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
    console.log('MobileExporter: Starting exportImageFile', { basename, dataLength: base64Data?.length })
    
    try {
      // 解析 base64 数据
      const { type, data } = base64.parseImage(base64Data)

      if (!data) {
        console.error('MobileExporter: invalid base64 data')
        this.showToast('图片数据无效')
        return
      }

      // 检查是否是 URL（需要特殊处理）
      if (data.startsWith('http://') || data.startsWith('https://')) {
        // 如果是 URL，先下载再保存
        try {
          const response = await fetch(data)
          const blob = await response.blob()
          const ext = (type.split('/')[1] || 'png').split('+')[0]
          const filename = basename + '.' + ext
          await this.exportBlob(filename, blob)
        } catch (error) {
          console.error('MobileExporter: Failed to download from URL:', error)
          this.showToast('下载图片失败')
        }
        return
      }

      const ext = (type.split('/')[1] || 'png').split('+')[0]
      const filename = basename + '.' + ext

      // 尝试使用 Web Share API 分享图片
      try {
        const raw = window.atob(data)
        const rawLength = raw.length
        const uInt8Array = new Uint8Array(rawLength)
        for (let i = 0; i < rawLength; ++i) {
          uInt8Array[i] = raw.charCodeAt(i)
        }
        const blob = new Blob([uInt8Array], { type })

        if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename)] })) {
          await navigator.share({
            files: [new File([blob], filename)],
            title: basename,
          })
          this.showToast('图片已保存')
          return
        }
      } catch (shareError) {
        console.log('MobileExporter: Web Share failed or cancelled:', shareError)
        // 分享失败或取消，fallback 到 Capacitor Filesystem
      }

      // 使用 Capacitor Filesystem 写入设备
      await this.saveBase64ToDevice(filename, base64Data)
    } catch (error) {
      console.error('MobileExporter: Failed to export image:', error)
      this.showToast('保存图片失败，请重试')
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
   * 显示简单的提示信息
   */
  private showToast(message: string) {
    // 尝试使用 Mantine 的通知系统，如果没有则使用原生 alert
    const toastEvent = new CustomEvent('mobile-toast', { detail: { message } })
    window.dispatchEvent(toastEvent)
    console.log('MobileExporter:', message)
  }

  /**
   * 将 base64 图像数据保存到设备，使用 Capacitor Filesystem
   * 首先尝试写入缓存目录，然后使用 Share 插件让用户选择保存位置
   */
  private async saveBase64ToDevice(filename: string, base64Data: string) {
    console.log('MobileExporter: saveBase64ToDevice called', { filename })
    
    try {
      const { type, data } = base64.parseImage(base64Data)
      const ext = (type.split('/')[1] || 'png').split('+')[0]
      const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')

      // 尝试写入外部存储目录（更方便用户找到）
      let savedFile: { uri: string } | null = null
      try {
        savedFile = await Filesystem.writeFile({
          path: safeFilename,
          data: data || base64Data.replace(/^data:image\/[^;]+;base64,/, ''),
          directory: Directory.External,
        })
        console.log('MobileExporter: File saved to external storage:', savedFile.uri)
      } catch (externalError) {
        console.log('MobileExporter: External storage failed, trying cache:', externalError)
        // 回退到缓存目录
        savedFile = await Filesystem.writeFile({
          path: safeFilename,
          data: data || base64Data.replace(/^data:image\/[^;]+;base64,/, ''),
          directory: Directory.Cache,
        })
        console.log('MobileExporter: File saved to cache:', savedFile.uri)
      }

      // 使用 Share 插件分享/保存文件
      try {
        await Share.share({
          title: '保存图片',
          text: '选择保存方式',
          url: savedFile.uri,
          dialogTitle: '保存图片到...',
        })
        this.showToast('图片已保存')
      } catch (shareError) {
        console.log('MobileExporter: Share cancelled or failed:', shareError)
        this.showToast('文件已保存到: ' + savedFile.uri)
      }
    } catch (error) {
      console.error('MobileExporter: Failed to save image to device:', error)
      // 最后fallback：尝试使用传统下载方式
      await this.fallbackDownload(base64Data)
    }
  }

  /**
   * 最后的回退方案：使用传统方式下载（在部分Android WebView中可能仍有效）
   */
  private async fallbackDownload(base64Data: string) {
    console.log('MobileExporter: Trying fallback download')
    try {
      const eleLink = document.createElement('a')
      eleLink.download = `image_${Date.now()}.png`
      eleLink.style.display = 'none'
      eleLink.href = base64Data
      document.body.appendChild(eleLink)
      eleLink.click()
      document.body.removeChild(eleLink)
      this.showToast('图片已通过浏览器下载')
    } catch (error) {
      console.error('MobileExporter: Fallback download also failed:', error)
      this.showToast('所有保存方式均失败')
    }
  }
}
