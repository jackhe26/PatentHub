import type { Exporter } from './interfaces'
import * as base64 from '@/packages/base64'

export default class WebExporter implements Exporter {
  constructor() {}

  async exportBlob(filename: string, blob: Blob, encoding?: 'utf8' | 'ascii' | 'utf16') {
    var eleLink = document.createElement('a')
    eleLink.download = filename
    eleLink.style.display = 'none'
    eleLink.href = URL.createObjectURL(blob)
    document.body.appendChild(eleLink)
    eleLink.click()
    document.body.removeChild(eleLink)
  }

  async exportTextFile(filename: string, content: string) {
    var eleLink = document.createElement('a')
    eleLink.download = filename
    eleLink.style.display = 'none'
    var blob = new Blob([content])
    eleLink.href = URL.createObjectURL(blob)
    document.body.appendChild(eleLink)
    eleLink.click()
    document.body.removeChild(eleLink)
  }

  async exportImageFile(basename: string, base64Data: string) {
    try {
      // 解析 base64 数据
      const { type, data } = base64.parseImage(base64Data)
      
      if (!data) {
        console.error('exportImageFile: invalid base64 data')
        return
      }

      // 检查是否是 URL（需要特殊处理）
      if (data.startsWith('http://') || data.startsWith('https://')) {
        // 如果是 URL，使用 URL 直接下载
        const ext = (type.split('/')[1] || 'png').split('+')[0]
        const filename = basename + '.' + ext
        await this.exportByUrl(filename, data)
        return
      }

      const ext = (type.split('/')[1] || 'png').split('+')[0]
      const filename = basename + '.' + ext

      try {
        const raw = window.atob(data)
        const rawLength = raw.length
        const uInt8Array = new Uint8Array(rawLength)
        for (let i = 0; i < rawLength; ++i) {
          uInt8Array[i] = raw.charCodeAt(i)
        }
        const blob = new Blob([uInt8Array], { type })
        var eleLink = document.createElement('a')
        eleLink.download = filename
        eleLink.style.display = 'none'
        eleLink.href = URL.createObjectURL(blob)
        document.body.appendChild(eleLink)
        eleLink.click()
        document.body.removeChild(eleLink)
      } catch (atobError) {
        console.error('Failed to decode base64 data:', atobError)
        // 如果 atob 失败，尝试将原始数据作为 data URL 直接使用
        const blob = new Blob([base64Data], { type })
        var eleLink = document.createElement('a')
        eleLink.download = filename
        eleLink.style.display = 'none'
        eleLink.href = URL.createObjectURL(blob)
        document.body.appendChild(eleLink)
        eleLink.click()
        document.body.removeChild(eleLink)
      }
    } catch (error) {
      console.error('Failed to export image:', error)
    }
  }

  async exportByUrl(filename: string, url: string) {
    var eleLink = document.createElement('a')
    eleLink.style.display = 'none'
    eleLink.download = filename
    eleLink.href = url
    document.body.appendChild(eleLink)
    eleLink.click()
    document.body.removeChild(eleLink)
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
      console.error('Failed to export streaming JSON:', error)
      throw error
    }
  }
}
