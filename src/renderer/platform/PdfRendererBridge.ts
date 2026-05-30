/**
 * TypeScript bridge for the Capacitor PdfRenderer native plugin.
 * Wraps Android's android.graphics.pdf.PdfRenderer API for WebView use.
 */
import { registerPlugin } from '@capacitor/core'

export interface PdfRendererPlugin {
  open(options: { filePath: string }): Promise<{ pageCount: number; filePath: string }>
  openWithBase64(options: { data: string }): Promise<{ pageCount: number; filePath: string }>
  renderPage(options: { pageIndex: number; scale?: number }): Promise<{ base64: string; width: number; height: number; pageIndex: number }>
  getPageCount(): Promise<{ pageCount: number }>
  close(): Promise<void>
}

const NativePdfRenderer = registerPlugin<PdfRendererPlugin>('PdfRenderer')

class PdfRendererBridge {
  private ensureAvailable(): PdfRendererPlugin {
    return NativePdfRenderer
  }

  /** Open a PDF file and get page count */
  async open(filePath: string) {
    const plugin = this.ensureAvailable()
    const result = await plugin.open({ filePath })
    console.log('[PdfRendererBridge] Opened PDF, pages:', result.pageCount)
    return result
  }

  /** Open PDF directly from base64 string — Android native Base64.decode, no WebView btoa */
  async openWithBase64(base64Data: string) {
    const plugin = this.ensureAvailable()
    const result = await plugin.openWithBase64({ data: base64Data })
    console.log('[PdfRendererBridge] Opened PDF from base64, pages:', result.pageCount)
    return result
  }

  /** Render a single page to JPEG base64 image */
  async renderPage(pageIndex: number, scale: number = 2.0) {
    const plugin = this.ensureAvailable()
    const result = await plugin.renderPage({ pageIndex, scale })
    console.log('[PdfRendererBridge] Rendered page:', pageIndex)
    return result
  }

  /** Get total page count */
  async getPageCount(): Promise<number> {
    const plugin = this.ensureAvailable()
    const result = await plugin.getPageCount()
    return result.pageCount
  }

  /** Close the PDF renderer */
  async close(): Promise<void> {
    try {
      const plugin = this.ensureAvailable()
      await plugin.close()
      console.log('[PdfRendererBridge] Closed')
    } catch (e) {
      console.warn('[PdfRendererBridge] Close error (ignored):', e)
    }
  }
}

export const pdfRenderer = new PdfRendererBridge()