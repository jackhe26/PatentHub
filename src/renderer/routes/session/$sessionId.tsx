import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, Avatar, Box, Button, Card, Menu, Stack, Text, Group } from '@mantine/core'
import { IconFileTypePdf, IconFileOff, IconChevronLeft, IconChevronRight, IconMessage } from '@tabler/icons-react'
import type { CopilotDetail, Message, ModelProvider, MessageFile } from '@shared/types'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ForwardedRef, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from 'zustand'
import MessageList, { type MessageListRef } from '@/components/chat/MessageList'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import InputBox from '@/components/InputBox/InputBox'
import Header from '@/components/layout/Header'
import ThreadHistoryDrawer from '@/components/session/ThreadHistoryDrawer'
import { useMyCopilots, useRemoteCopilots } from '@/hooks/useCopilots'
import { updateSession as updateSessionStore, useSession } from '@/stores/chatStore'
import { lastUsedModelStore } from '@/stores/lastUsedModelStore'
import * as scrollActions from '@/stores/scrollActions'
import { modifyMessage, removeCurrentThread, startNewThread, submitNewUserMessage } from '@/stores/sessionActions'
import { getAllMessageList } from '@/stores/sessionHelpers'
import platform from '@/platform'
import storage from '@/storage'
import { pdfRenderer } from '@/platform/PdfRendererBridge'

export const Route = createFileRoute('/session/$sessionId')({
  component: RouteComponent,
})

// Helper function: Get the single PDF file from session's first user message
function getSinglePDFFile(session: { messages: Message[] }): MessageFile | null {
  // Find the first user message
  const firstUserMessage = session.messages.find(m => m.role === 'user')
  if (!firstUserMessage) return null
  
  // Get all PDF files from the message
  const pdfFiles = firstUserMessage.files?.filter(f => f.name.toLowerCase().endsWith('.pdf')) || []
  
  // Return only if there's exactly 1 PDF
  return pdfFiles.length === 1 ? pdfFiles[0] : null
}

// Safe base64 decode function that handles Unicode characters and Data URL prefixes
function safeBase64Decode(base64: string): Uint8Array {
  // Strip Data URL prefix if present (e.g. "data:application/pdf;base64,xxxxx")
  const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64
  // Remove any whitespace (newlines, spaces) that would cause atob to fail
  const normalized = cleanBase64.replace(/\s/g, '')

  try {
    const binaryString = atob(normalized)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes
  } catch {
    // atob failed — the stored value is a plain UTF-8 string, not base64
    return new TextEncoder().encode(normalized)
  }
}

// Extract pure base64 string from a value that may be a Data URL or raw base64
function extractBase64(value: string): string {
  if (value.includes(',')) {
    // Data URL format: "data:<mime>;base64,<data>"
    return value.split(',')[1] || ''
  }
  return value
}

// PDF Preview Component — Desktop: iframe, Mobile: Capacitor PdfRenderer native plugin
function PDFPreviewPanel({ pdfFile }: { pdfFile: MessageFile }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Mobile native rendering state
  const [pageImage, setPageImage] = useState<string | null>(null)
  const [renderedW, setRenderedW] = useState(0)   // renderPage returns actual pixel width
  const [renderedH, setRenderedH] = useState(0)   // renderPage returns actual pixel height
  const [currentPage, setCurrentPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  // Feature 3: Per-page full text for textarea + auto-select paragraph
  const [pageTexts, setPageTexts] = useState<string[]>([])  // Per-page full text (for textarea display)
  const [textBlocks, setTextBlocks] = useState<any[][]>([])  // Text blocks with Y coordinates, charOffset, hasEOL
  const [showTextModal, setShowTextModal] = useState(false)
  const [longPressY, setLongPressY] = useState<number>(0.5)  // Y ratio for paragraph location (0=top, 1=bottom)
  const [longPressX, setLongPressX] = useState<number>(0.5)  // X ratio for paragraph location (0=left, 1=right)
  // Accordion state: which paragraph index is expanded (-1 = none, default = nearestParaIdx)
  const [expandedIdx, setExpandedIdx] = useState<number>(-1)
  // Copy feedback: which paragraph idx shows "✅ 已复制" (cleared after 1.5s)
  const [copiedIdx, setCopiedIdx] = useState<number>(-1)

  // All paragraphs + nearest paragraph (recomputed when modal opens or position changes)
  const [allParagraphsList, setAllParagraphsList] = useState<{ start: number; end: number; text: string; blocks: any[] }[]>([])
  const [nearestParaIdx, setNearestParaIdx] = useState<number>(-1)

  // Compute all paragraphs + nearest paragraph whenever modal opens or position changes
  useEffect(() => {
    if (!showTextModal || textBlocks.length === 0) {
      setAllParagraphsList([])
      setNearestParaIdx(-1)
      setExpandedIdx(-1)
      return
    }

    const pageBlocks = textBlocks[currentPage]
    if (!pageBlocks || pageBlocks.length === 0) {
      setAllParagraphsList([])
      setNearestParaIdx(-1)
      setExpandedIdx(-1)
      return
    }

    // === Step 1: Build all paragraphs using 首行缩进 + 行距双峰算法 ===
    // 两个段落边界条件（满足任意一个）：
    // A. 段落间距 > p75 * 1.5（段落间距明显大于行距）
    // B. 这一行有首行缩进（X > 正文左边距 + 阈值）

    // 1A: 计算正文左边距（X坐标众数，精度5px归并）
    const xBuckets: Record<string, number> = {}
    for (const b of pageBlocks) {
      const bucket = Math.round((b.xPdf || 0) / 5) * 5  // 5px精度归并
      xBuckets[bucket] = (xBuckets[bucket] || 0) + 1
    }
    const bodyLeftX = Object.entries(xBuckets).reduce((best, [xStr, count]) => {
      return count > best.count ? { x: parseFloat(xStr), count } : best
    }, { x: 0, count: 0 }).x

    // 1B: 计算行距中位数（p50）阈值
    const gaps: number[] = []
    for (let i = 1; i < pageBlocks.length; i++) {
      const dy = Math.abs(pageBlocks[i].yRatio - pageBlocks[i - 1].yRatio)
      if (dy > 0 && dy < 0.1) gaps.push(dy)  // 正常行距范围
    }
    gaps.sort((a, b) => a - b)
    const p50 = gaps.length > 0 ? gaps[Math.floor(gaps.length * 0.5)] : 0.05
    const gapThreshold = p50 * 1.5
    const indentThreshold = bodyLeftX + 10  // 首行缩进检测阈值

    // 1C: 扫描切割段落（两个条件 OR：间距 OR 下一行首行缩进）
    const paragraphs: { start: number; end: number; text: string; blocks: any[] }[] = []
    let paraStart = 0
    for (let i = 1; i <= pageBlocks.length; i++) {
      const isEndOfBlocks = i === pageBlocks.length
      const prev = pageBlocks[i - 1]
      const curr = pageBlocks[i]
      const gap = !isEndOfBlocks ? Math.abs((curr?.yRatio || 0) - (prev?.yRatio || 0)) : 0

      // 条件A: 段落间距明显大于行距
      const isBigGap = gap > gapThreshold
      // 条件B: 【下一行】有首行缩进，且间距不为同一行内的多个item（Y间距 > p50*0.5）
      const isIndentedParaEnd = !isEndOfBlocks && (curr?.xPdf || 0) >= indentThreshold && gap > (p50 * 0.5)

      if (isEndOfBlocks || isBigGap || isIndentedParaEnd) {
        const end = isEndOfBlocks ? pageBlocks.length : i
        const paraBlocks = pageBlocks.slice(paraStart, end)
        const text = paraBlocks
          .map((b: any) => b.text || '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (text) {
          paragraphs.push({ start: paraStart, end, text, blocks: paraBlocks })
        }
        if (!isEndOfBlocks) paraStart = i
      }
    }

    // 计算基准字号（众数，精度1归并），用于字号比例缩放
    const fontSizeBuckets: Record<string, number> = {}
    for (const block of pageBlocks) {
      const bucket = Math.round(block.fontSize || 12)  // 精度1
      fontSizeBuckets[bucket] = (fontSizeBuckets[bucket] || 0) + 1
    }
    const baseFontSize = Object.entries(fontSizeBuckets).reduce((best, [fs, count]) => {
      return count > best.count ? { fontSize: parseInt(fs), count } : best
    }, { fontSize: 12, count: 0 }).fontSize

    // Step 3: Find nearest paragraph using X+Y euclidean distance (X weight 2x)
    let nearestIdx = 0
    let minDist = Infinity
    for (let pi = 0; pi < paragraphs.length; pi++) {
      const para = paragraphs[pi]
      const paraBlocks = pageBlocks.slice(para.start, para.end)
      // Fix: use Y-coordinate average of all blocks in paragraph, not index midpoint
      const avgY = paraBlocks.reduce((s: number, b: any) => s + (b.yRatio || 0), 0) / paraBlocks.length
      const avgX = paraBlocks.reduce((s: number, b: any) => s + (b.xRatio || 0.5), 0) / paraBlocks.length
      const dx = avgX - longPressX
      const dy = avgY - longPressY
      const dist = Math.sqrt(dx * dx * 4 + dy * dy)
      if (dist < minDist) {
        minDist = dist
        nearestIdx = pi
      }
    }

    setAllParagraphsList(paragraphs)
    setNearestParaIdx(nearestIdx)
    // Default expanded paragraph = nearest paragraph
    setExpandedIdx(nearestIdx)

    console.log('[PDF Preview] Nearest para:', nearestIdx, '/', paragraphs.length, 'dist:', minDist.toFixed(3))
  }, [showTextModal, textBlocks, currentPage, longPressY, longPressX])

  // Touch gesture state
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const touchStartDist = useRef<number>(0)
  const [scale, setScale] = useState(1.1)
  const baseScale = useRef(1.1)

  // Feature 2: Finger-centered zoom (translate to keep pinch center under fingers)
  const [translateX, setTranslateX] = useState(0)
  const [translateY, setTranslateY] = useState(0)
  const pinchOriginX = useRef<number>(0)
  const pinchOriginY = useRef<number>(0)
  const startTransX = useRef<number>(0)
  const startTransY = useRef<number>(0)

  // Feature 3: Long-press timer for text modal
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>()

  // Feature 4 (bonus): Double-tap to reset scale + translate
  const lastTapTime = useRef<number>(0)

  const storageKey = pdfFile.storageKey
  const filePath = pdfFile.url
  const isMobile = platform.type === 'mobile'

  console.log('[PDF Preview] filePath:', filePath, 'storageKey:', storageKey, 'isMobile:', isMobile)

  // Desktop: load via file:// or IndexedDB blob
  useEffect(() => {
    if (isMobile) return // mobile uses native renderer below

    let url: string | null = null

    const loadPdf = async () => {
      if (filePath) {
        try {
          const fileUrl = `file:///${filePath.replace(/\\/g, '/')}`
          setBlobUrl(fileUrl)
          setLoading(false)
          return
        } catch (err) {
          console.error('[PDF Preview] Failed to load from file path:', err)
        }
      }

      if (!storageKey) {
        setError('No storage key or file path')
        setLoading(false)
        return
      }

      try {
        const blob = await storage.getBlob(storageKey)
        if (blob) {
          let pdfBlob: Blob
          if (typeof blob === 'string') {
            try {
              const bytes = safeBase64Decode(blob)
              pdfBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
            } catch {
              pdfBlob = new Blob([new TextEncoder().encode(blob)], { type: 'application/pdf' })
            }
          } else if (ArrayBuffer.isView(blob)) {
            pdfBlob = new Blob([blob], { type: 'application/pdf' })
          } else {
            pdfBlob = new Blob([blob as BlobPart], { type: 'application/pdf' })
          }
          url = URL.createObjectURL(pdfBlob)
          setBlobUrl(url)
        } else {
          setError('PDF file not found in storage')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load PDF')
      } finally {
        setLoading(false)
      }
    }

    loadPdf()
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [storageKey, filePath, isMobile])

  // Mobile: use native PdfRenderer plugin via openWithBase64 (bypasses WebView btoa issues)
  useEffect(() => {
    if (!isMobile) return

    const loadNative = async () => {
      setLoading(true)
      try {
        if (!storageKey) {
          setError('No storage key available')
          setLoading(false)
          return
        }

        // Read raw PDF bytes stored by preprocessFile (key = storageKey + '_pdf_raw')
        // storageKey itself holds the parsed text content (for AI), not the PDF binary.
        let rawRef = await storage.getBlob(`${storageKey}_pdf_raw`)
        if (!rawRef) {
          setError('PDF preview data not found. Please re-upload the PDF file.')
          setLoading(false)
          return
        }

        // Use base64 directly (stored by preprocessFile using FileReader.readAsDataURL)
        let cleanBase64 = rawRef.includes(',') ? rawRef.split(',')[1] : rawRef
        cleanBase64 = cleanBase64.replace(/\s/g, '')

        // Sanity check: valid PDF base64 starts with "JVBERi" ("%PDF")
        console.log('[PDF Preview] base64 prefix:', cleanBase64.substring(0, 8))
        if (!cleanBase64.startsWith('JVBERi')) {
          console.warn('[PDF Preview] base64 does not look like a PDF, prefix:', cleanBase64.substring(0, 8))
        }

        // Open PDF directly with base64 — Java handles Base64.decode, no WebView btoa
        const openResult = await pdfRenderer.openWithBase64(cleanBase64)
        console.log('[PDF Preview] Opened PDF, pages:', openResult.pageCount)
        setTotalPages(openResult.pageCount)
        setCurrentPage(0)

        // Render first page and store actual pixel dimensions
        const pageResult = await pdfRenderer.renderPage(0, 2.0)
        setPageImage(pageResult.base64)
        setRenderedW(pageResult.width || 0)
        setRenderedH(pageResult.height || 0)

        // Feature 3: Load per-page text and text blocks with Y coordinates
        try {
          const pagesJson = await storage.getBlob(`${storageKey}_pdf_pages`)
          if (pagesJson) {
            const pages = JSON.parse(pagesJson) as string[]
            setPageTexts(pages)
            console.log('[PDF Preview] Loaded page texts:', pages.length, 'pages')
          }
        } catch (textErr) {
          console.warn('[PDF Preview] Failed to load page texts:', textErr)
        }

        // Load text blocks with Y coordinates for paragraph location
        try {
          const blocksJson = await storage.getBlob(`${storageKey}_pdf_blocks`)
          if (blocksJson) {
            const blocks = JSON.parse(blocksJson) as any[][]
            setTextBlocks(blocks)
            console.log('[PDF Preview] Loaded text blocks with Y coordinates:', blocks.length, 'pages')
          }
        } catch (blocksErr) {
          console.warn('[PDF Preview] Failed to load text blocks:', blocksErr)
        }

        setLoading(false)

      } catch (err) {
        console.error('[PDF Preview] Native render error:', err)
        setError(err instanceof Error ? err.message : 'Native PDF render failed')
        setLoading(false)
      }
    }

    loadNative()

    return () => {
      pdfRenderer.close().catch(() => {})
    }
  }, [storageKey, pdfFile.name, isMobile])

  // Navigate pages (mobile)
  const goToPage = async (delta: number) => {
    const newPage = currentPage + delta
    if (newPage < 0 || newPage >= totalPages) return
    setCurrentPage(newPage)
    // Feature 4: Reset translate when page changes (so new page starts at center)
    setTranslateX(0)
    setTranslateY(0)
    // Reset scale to default 1.1 when page changes
    setScale(1.1)
    setLoading(true)
    try {
      const result = await pdfRenderer.renderPage(newPage, 2.0)
      setPageImage(result.base64)
      setRenderedW(result.width || 0)
      setRenderedH(result.height || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to render page')
    } finally {
      setLoading(false)
    }
  }

  // Mobile: full-screen, no card padding/border
  if (isMobile) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        {/* PDF content area — full width, no scrollbars */}
        <div
          style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#f3f4f6', touchAction: 'none' }}
          onTouchStart={(e) => {
            // Feature 3: Start long-press timer for text modal
            if (e.touches.length === 1 && pageTexts.length > 0) {
              const containerHeight = (e.currentTarget as HTMLElement).clientHeight
              const containerWidth = (e.currentTarget as HTMLElement).clientWidth
              const rawY = e.touches[0].clientY - translateY
              const rawX = e.touches[0].clientX - translateX
              // Fix: letterbox correction — objectFit:contain creates top/left letterbox if aspect ratios differ
              const scaleToFit = renderedW > 0 && renderedH > 0
                ? Math.min(containerWidth / renderedW, containerHeight / renderedH)
                : 1
              const displayW = renderedW * scaleToFit
              const displayH = renderedH * scaleToFit
              const offsetX = (containerWidth - displayW) / 2
              const offsetY = (containerHeight - displayH) / 2
              const imgY = ((rawY - offsetY) / scale) / displayH
              const imgX = ((rawX - offsetX) / scale) / displayW
              setLongPressY(imgY)
              setLongPressX(imgX)

              longPressTimer.current = setTimeout(() => {
                setShowTextModal(true)
              }, 600)
            }

            if (e.touches.length === 1) {
              touchStartX.current = e.touches[0].clientX
              touchStartY.current = e.touches[0].clientY
              // Feature 4: Record current translate as pan start
              startTransX.current = translateX
              startTransY.current = translateY
            } else if (e.touches.length === 2) {
              // Cancel long-press when pinch starts
              if (longPressTimer.current) {
                clearTimeout(longPressTimer.current)
              }
              const dx = e.touches[0].clientX - e.touches[1].clientX
              const dy = e.touches[0].clientY - e.touches[1].clientY
              touchStartDist.current = Math.sqrt(dx * dx + dy * dy)
              baseScale.current = scale

              // Feature 2: Record pinch center point for finger-centered zoom
              pinchOriginX.current = (e.touches[0].clientX + e.touches[1].clientX) / 2
              pinchOriginY.current = (e.touches[0].clientY + e.touches[1].clientY) / 2
              startTransX.current = translateX
              startTransY.current = translateY
            }
          }}
          onTouchMove={(e) => {
            // Cancel long-press if finger moves (not a tap)
            if (e.touches.length === 1 && longPressTimer.current) {
              const dx = e.touches[0].clientX - touchStartX.current
              const dy = e.touches[0].clientY - touchStartY.current
              if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                clearTimeout(longPressTimer.current)
              }
            }

            // Feature 4: When zoomed (scale > 1.1), single finger pans instead of triggering page turn
            if (e.touches.length === 1 && scale > 1.1) {
              const dx = e.touches[0].clientX - touchStartX.current
              const dy = e.touches[0].clientY - touchStartY.current
              setTranslateX(startTransX.current + dx)
              setTranslateY(startTransY.current + dy)
            }

            if (e.touches.length === 2) {
              const dx = e.touches[0].clientX - e.touches[1].clientX
              const dy = e.touches[0].clientY - e.touches[1].clientY
              const dist = Math.sqrt(dx * dx + dy * dy)
              const ratio = dist / touchStartDist.current
              const newScale = Math.min(4.0, Math.max(0.8, baseScale.current * ratio))
              setScale(newScale)

              // Feature 2: Keep pinch center point under fingers by adjusting translate
              // newTranslateX = pinchCenter - (pinchCenter - startTranslate) * (newScale / startScale)
              if (baseScale.current > 0) {
                const scaleFactor = newScale / baseScale.current
                const newTransX = pinchOriginX.current - (pinchOriginX.current - startTransX.current) * scaleFactor
                const newTransY = pinchOriginY.current - (pinchOriginY.current - startTransY.current) * scaleFactor
                setTranslateX(newTransX)
                setTranslateY(newTransY)
              }
            }
          }}
          onTouchEnd={(e) => {
            // Feature 4: Double-tap detection — reset scale + translate to defaults
            const now = Date.now()
            const dx = e.changedTouches[0]?.clientX - touchStartX.current
            const dy = e.changedTouches[0]?.clientY - touchStartY.current
            const dist = Math.sqrt((dx || 0) ** 2 + (dy || 0) ** 2)
            if (
              e.changedTouches.length === 1 &&
              e.touches.length === 0 &&
              now - lastTapTime.current < 300 &&
              dist < 10
            ) {
              // Double-tap: reset to defaults
              setScale(1.1)
              setTranslateX(0)
              setTranslateY(0)
              lastTapTime.current = 0
            } else {
              lastTapTime.current = now
            }

            // Cancel long-press timer
            if (longPressTimer.current) {
              clearTimeout(longPressTimer.current)
            }

            // Feature 2 & 4: Reset translate when scale returns to <= 1.1
            if (e.touches.length === 0 && scale <= 1.11) {
              setTranslateX(0)
              setTranslateY(0)
            }

            // Feature 4: Only handle single-finger swipe for page turn when scale <= 1.1
            // When scale > 1.1, single finger pans instead of page turn
            if (e.changedTouches.length === 1 && e.touches.length === 0 && scale <= 1.11) {
              const dx = e.changedTouches[0].clientX - touchStartX.current
              const dy = e.changedTouches[0].clientY - touchStartY.current
              if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                if (dx < 0) goToPage(1)   // swipe left → next page
                else goToPage(-1)          // swipe right → prev page
              }
            }
          }}
        >
          {loading ? (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14, color: '#9ca3af' }}>Loading PDF...</span>
            </div>
          ) : error ? (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <span style={{ fontSize: 13, color: '#ef4444', textAlign: 'center' }}>{error}</span>
            </div>
          ) : pageImage ? (
            <>
              <img
                src={pageImage}
                alt={`Page ${currentPage + 1}`}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block',
                  transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
                  transformOrigin: 'top left',
                }}
              />
              {/* UI: Page indicator overlay at bottom-right */}
              {totalPages > 0 && (
                <div style={{
                  position: 'absolute',
                  bottom: 8,
                  right: 8,
                  background: 'rgba(0,0,0,0.5)',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '2px 8px',
                  fontSize: 11,
                  pointerEvents: 'none',
                  zIndex: 10,
                }}>
                  {currentPage + 1} / {totalPages}
                </div>
              )}
            </>
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14, color: '#9ca3af' }}>PDF 正在加载…</span>
            </div>
          )}
        </div>

        {/* Feature 3: 3段纯文本弹窗（目标段落 ± 1，越界保护） */}
        {showTextModal && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={() => setShowTextModal(false)}
          >
            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                width: '85%',
                height: '65%',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>
                  第 {currentPage + 1} 页 · 目标段落 ± 1
                </span>
                <button
                  onClick={() => setShowTextModal(false)}
                  style={{
                    background: '#f3f4f6',
                    border: 'none',
                    borderRadius: 6,
                    padding: '4px 12px',
                    fontSize: 12,
                    color: '#6b7280',
                    cursor: 'pointer',
                  }}
                >
                  关闭
                </button>
              </div>

              {/* 3段纯文本区域 */}
              <div style={{ flex: 1, overflow: 'hidden', padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
                {allParagraphsList.length === 0 || nearestParaIdx < 0 ? (
                  <div style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: 13 }}>
                    未找到目标段落
                  </div>
                ) : (
                  (() => {
                    // 取目标段落 ± 1，共3段，越界保护
                    const startIdx = Math.max(0, nearestParaIdx - 1)
                    const endIdx = Math.min(allParagraphsList.length - 1, nearestParaIdx + 1)
                    const slices = allParagraphsList.slice(startIdx, endIdx + 1)

                    // 计算基准字号（众数，精度1归并）
                    const fontSizeBuckets: Record<string, number> = {}
                    for (const para of slices) {
                      for (const block of para.blocks || []) {
                        const bucket = Math.round(block.fontSize || 12)
                        fontSizeBuckets[bucket] = (fontSizeBuckets[bucket] || 0) + 1
                      }
                    }
                    const baseFontSize = Object.entries(fontSizeBuckets).reduce((best, [fs, count]) => {
                      return count > best.count ? { fontSize: parseInt(fs), count } : best
                    }, { fontSize: 12, count: 0 }).fontSize

                    return (
                      <>
                        <div style={{ fontSize: 11, color: '#9ca3af', paddingBottom: 8, flexShrink: 0 }}>
                          第 {startIdx + 1}–{endIdx + 1} 段（点击区域可复制）
                        </div>
                        <div
                          style={{
                            flex: 1,
                            overflowY: 'auto',
                            background: '#fafafa',
                            borderRadius: 8,
                            padding: '12px 14px',
                            border: '1px solid #e5e7eb',
                            userSelect: 'text',
                            WebkitUserSelect: 'text',
                          }}
                        >
                          {slices.map((para, paraIdx) => {
                            const paraBlocks = para.blocks || []
                            // 段落内行间距用 Y 间距还原
                            const paraElements: ReactNode[] = []
                            for (let bi = 0; bi < paraBlocks.length; bi++) {
                              const block = paraBlocks[bi]
                              const fontSize = Math.round((block.fontSize || 12) / baseFontSize * 13)
                              const displaySize = Math.min(Math.max(fontSize, 9), 22)  // 限制范围 9-22px
                              paraElements.push(
                                <span
                                  key={`${bi}`}
                                  style={{
                                    fontSize: displaySize,
                                    color: '#1f2937',
                                    lineHeight: 1.9,
                                  }}
                                >
                                  {block.text}{' '}
                                </span>
                              )
                              // 行尾或段落尾不加换行，让空白自然处理
                              if (block.hasEOL) {
                                paraElements.push(<br key={`br-${bi}`} />)
                              }
                            }
                            return (
                              <div key={`para-${paraIdx}`} style={{ marginBottom: paraIdx < slices.length - 1 ? 16 : 0 }}>
                                {paraElements}
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )
                  })()
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Desktop: card with iframe
  return (
    <Card shadow="sm" padding="sm" radius="md" withBorder style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>
        <Group justify="space-between">
          <Text size="sm" fw="bold">PDF Preview</Text>
          <Text size="xs" c="dimmed">{pdfFile.name}</Text>
        </Group>
        <Box style={{ flex: 1, minHeight: 0, background: '#f5f5f5', borderRadius: 4, overflow: 'hidden' }}>
          {loading ? (
            <Box style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Text size="sm" c="dimmed">Loading PDF...</Text>
            </Box>
          ) : error ? (
            <Box style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <Text size="sm" c="red" ta="center">{error}</Text>
            </Box>
          ) : blobUrl ? (
            <iframe src={blobUrl} style={{ width: '100%', height: '100%', border: 'none', borderRadius: '4px' }} title="PDF Preview" />
          ) : null}
        </Box>
      </Stack>
    </Card>
  )
}

function RouteComponent() {
  const { t } = useTranslation()
  const { sessionId: currentSessionId } = Route.useParams()
  const navigate = useNavigate()
  const { session: currentSession, isFetching } = useSession(currentSessionId)
  const setLastUsedChatModel = useStore(lastUsedModelStore, (state) => state.setChatModel)
  const setLastUsedPictureModel = useStore(lastUsedModelStore, (state) => state.setPictureModel)

  // PDF面板显示/隐藏状态（移动端默认隐藏，避免双栏布局在小屏幕上显示空白iframe）
  const [showPdfPanel, setShowPdfPanel] = useState(platform.type !== 'mobile')

  const currentMessageList = useMemo(() => (currentSession ? getAllMessageList(currentSession) : []), [currentSession])
  const lastGeneratingMessage = useMemo(
    () => currentMessageList.find((m: Message) => m.generating),
    [currentMessageList]
  )

  const messageListRef = useRef<MessageListRef>(null)

  const goHome = useCallback(() => {
    navigate({ to: '/', replace: true })
  }, [navigate])

  useEffect(() => {
    setTimeout(() => {
      scrollActions.scrollToBottom('auto') // 每次启动时自动滚动到底部
    }, 200)
  }, [])

  // currentSession变化时（包括session settings变化），存下当前的settings作为新Session的默认值
  useEffect(() => {
    if (currentSession) {
      if (currentSession.type === 'chat' && currentSession.settings) {
        const { provider, modelId } = currentSession.settings
        if (provider && modelId) {
          setLastUsedChatModel(provider, modelId)
        }
      }
      if (currentSession.type === 'picture' && currentSession.settings) {
        const { provider, modelId } = currentSession.settings
        if (provider && modelId) {
          setLastUsedPictureModel(provider, modelId)
        }
      }
    }
  }, [currentSession?.settings, currentSession?.type, currentSession, setLastUsedChatModel, setLastUsedPictureModel])

  const onSelectModel = useCallback(
    (provider: ModelProvider, modelId: string) => {
      if (!currentSession) {
        return
      }
      void updateSessionStore(currentSession.id, {
        settings: {
          ...(currentSession.settings || {}),
          provider,
          modelId,
        },
      })
    },
    [currentSession]
  )

  const onStartNewThread = useCallback(() => {
    if (!currentSession) {
      return false
    }
    void startNewThread(currentSession.id)
    return true
  }, [currentSession])

  const onRollbackThread = useCallback(() => {
    if (!currentSession) {
      return false
    }
    void removeCurrentThread(currentSession.id)
    return true
  }, [currentSession])

  const onSubmit = useCallback(
    async ({
      constructedMessage,
      needGenerating = true,
      onUserMessageReady,
    }: {
      constructedMessage: Message
      needGenerating?: boolean
      onUserMessageReady?: () => void
    }) => {
      if (!currentSession) {
        return
      }
      messageListRef.current?.scrollToBottom('instant')
      await submitNewUserMessage(currentSession.id, {
        newUserMsg: constructedMessage,
        needGenerating,
        onUserMessageReady,
      })
    },
    [currentSession]
  )

  const onClickSessionSettings = useCallback(() => {
    if (!currentSession) {
      return false
    }
    NiceModal.show('session-settings', {
      session: currentSession,
    })
    return true
  }, [currentSession])

  const onStopGenerating = useCallback(() => {
    if (!currentSession) {
      return false
    }
    if (lastGeneratingMessage?.generating) {
      lastGeneratingMessage?.cancel?.()
      void modifyMessage(currentSession.id, { ...lastGeneratingMessage, generating: false }, true)
    }
    return true
  }, [currentSession, lastGeneratingMessage])

  const model = useMemo(() => {
    if (!currentSession?.settings?.modelId || !currentSession?.settings?.provider) {
      return undefined
    }
    return {
      provider: currentSession.settings.provider,
      modelId: currentSession.settings.modelId,
    }
  }, [currentSession?.settings?.provider, currentSession?.settings?.modelId])

  // 获取搭档列表和当前搭档
  const { copilots: myCopilots } = useMyCopilots()
  const { copilots: remoteCopilots } = useRemoteCopilots()
  const selectedCopilotId = currentSession?.copilotId
  
  const selectedCopilot = useMemo(
    () => myCopilots.find((c) => c.id === selectedCopilotId) || remoteCopilots.find((c) => c.id === selectedCopilotId),
    [myCopilots, remoteCopilots, selectedCopilotId]
  )

  // 提取emoji头像
  const currentCopilotName = currentSession?.name || ''
  const emojiMatch = currentCopilotName.match(/^./su)
  const currentCopilotEmoji = emojiMatch ? emojiMatch[1] : null

  // 辅助函数：获取搭档头像文字（跳过表情符号）
  const getCopilotAvatarText = (name?: string) => {
    if (!name) return '?'
    // 移除常见表情符号后取第一个字符
    return name.replace(/^[📋🔍✍️🔬📄💬⚖️🌐]/u, '').slice(0, 1) || '?'
  }

  // 切换搭档
  const handleSelectCopilot = useCallback(async (copilot: CopilotDetail | undefined) => {
    if (!currentSession || !copilot) {
      return
    }
    
    // 如果正在生成中，先停止
    if (lastGeneratingMessage?.generating) {
      lastGeneratingMessage?.cancel?.()
    }
    
    // 获取当前消息列表
    const currentMessages = currentSession.messages || []
    const newMessages = [...currentMessages]
    
    // 找到或创建 system message
    const systemMsgIndex = newMessages.findIndex((m) => m.role === 'system')
    const newSystemMessage = {
      id: systemMsgIndex >= 0 ? newMessages[systemMsgIndex].id : crypto.randomUUID(),
      role: 'system' as const,
      contentParts: [
        {
          type: 'text' as const,
          text: copilot.prompt,
        },
      ],
    }
    
    if (systemMsgIndex >= 0) {
      newMessages[systemMsgIndex] = newSystemMessage
    } else {
      newMessages.unshift(newSystemMessage)
    }
    
    // 更新 session：只更新 copilotId、picUrl 和 messages，不更新 name（避免更改 session 名称）
    void updateSessionStore(currentSession.id, {
      // name: copilot.name,  // 移除：选择搭档时不更改 session 名称
      picUrl: copilot.picUrl,
      copilotId: copilot.id,
      messages: newMessages,
    })
    
    // 延迟一下，然后发送用户消息触发大模型回复
    setTimeout(async () => {
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        contentParts: [
          {
            type: 'text',
            text: '你好，' + copilot.name + '！',
          },
        ],
        timestamp: Date.now(),
      }
      
      messageListRef.current?.scrollToBottom('instant')
      await submitNewUserMessage(currentSession.id, {
        newUserMsg: userMessage,
        needGenerating: true,
      })
    }, 500)
  }, [currentSession, lastGeneratingMessage])

  // Check if session has exactly one PDF file in the first user message
  const singlePdfFile = useMemo(() => {
    if (!currentSession) return null
    return getSinglePDFFile(currentSession)
  }, [currentSession])

  // If there's exactly one PDF file, show dual-pane layout
  if (singlePdfFile && currentSession) {
    // 计算宽度 — 桌面端双栏并排，手机端全屏切换（一个按钮切换 PDF ↔ 聊天）
    const isMobile = platform.type === 'mobile'
    const pdfWidth = showPdfPanel ? (isMobile ? '100%' : '45%') : '0%'
    const chatWidth = showPdfPanel ? (isMobile ? '0%' : '55%') : '100%'
    
    return (
      <div className="flex flex-col h-full">
        {/* 搭档选择器 - 显示在Header下方，添加title-bar类支持窗口拖拽 */}
        <Box px="sm" py="xs" className="title-bar flex items-center gap-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          {/* PDF切换按钮 */}
          <ActionIcon
            variant="subtle"
            color={showPdfPanel ? 'blue' : 'gray'}
            onClick={() => setShowPdfPanel(!showPdfPanel)}
            title={showPdfPanel ? '隐藏PDF预览' : '显示PDF预览'}
            className="controls"
          >
            {showPdfPanel ? (platform.type === 'mobile' ? <IconMessage size={20} /> : <IconFileTypePdf size={20} />) : <IconFileOff size={20} />}
          </ActionIcon>
          <div style={{ marginLeft: '35%' }}>
            <Menu shadow="lg" width={240} position="bottom-start">
              <Menu.Target>
                <Button 
                  variant="light" 
                  color="gray"
                  size="sm" 
                  radius="md"
                  className="font-semibold controls"
                >
                  我的审查搭档
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{t('我的搭档')}</Menu.Label>
                {myCopilots.map((copilot, index) => (
                  <Menu.Item
                    key={copilot.id}
                    onClick={() => handleSelectCopilot(copilot)}
                    fw={copilot.id === selectedCopilotId ? 700 : 400}
                    color={copilot.id === selectedCopilotId ? 'blue' : undefined}
                    // 第一个选项添加上边距，解决 hover 区域问题
                    style={{ marginTop: index === 0 ? 8 : 0 }}
                  >
                    {copilot.name}
                  </Menu.Item>
                ))}
                {remoteCopilots.length > 0 && <Menu.Divider />}
                {remoteCopilots.slice(0, 5).map((copilot) => (
                  <Menu.Item
                    key={copilot.id}
                    onClick={() => handleSelectCopilot(copilot)}
                    fw={copilot.id === selectedCopilotId ? 700 : 400}
                    color={copilot.id === selectedCopilotId ? 'blue' : undefined}
                  >
                    {copilot.name}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          </div>
        </Box>
        <Header session={currentSession} />
        
        {/* Left: PDF Preview, Right: Chat - 根据showPdfPanel动态调整宽度 */}
        <div className="flex flex-1 min-h-0" style={{ flex: 1 }}>
          {/* Left: PDF Preview - 显示/隐藏；移动端去掉 padding 让 PDF 真正全屏 */}
          <div style={{ width: pdfWidth, padding: isMobile ? 0 : '0 8px', display: showPdfPanel ? 'block' : 'none', transition: 'width 0.2s ease' }}>
            <PDFPreviewPanel pdfFile={singlePdfFile} />
          </div>
          
          {/* Right: Chat area - 根据showPdfPanel动态调整宽度 */}
          <div style={{ width: chatWidth, padding: '0 8px', display: 'flex', flexDirection: 'column', transition: 'width 0.2s ease' }}>
            <MessageList ref={messageListRef} key={`message-list${currentSessionId}`} currentSession={currentSession} />
          </div>
        </div>
        
        {/* Input box */}
        <ErrorBoundary name="session-inputbox">
          <InputBox
            key={`input-box${currentSession.id}`}
            sessionId={currentSession.id}
            sessionType={currentSession.type}
            model={model}
            onStartNewThread={onStartNewThread}
            onRollbackThread={onRollbackThread}
            onSelectModel={onSelectModel}
            onClickSessionSettings={onClickSessionSettings}
            generating={!!lastGeneratingMessage}
            onSubmit={onSubmit}
            onStopGenerating={onStopGenerating}
          />
        </ErrorBoundary>
        <ThreadHistoryDrawer session={currentSession} />
      </div>
    )
  }

  // For regular chat sessions (0 or >=2 PDFs), use normal layout
  return currentSession ? (
    <div className="flex flex-col h-full">
      {/* 搭档选择器 - 显示在Header下方，添加title-bar类支持窗口拖拽 */}
      <Box px="sm" py="xs" className="title-bar flex items-center gap-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <Menu shadow="lg" width={240} position="bottom-start">
          <Menu.Target>
            <Button 
              variant="light" 
              color="gray"
              size="sm" 
              radius="md"
              className="font-semibold controls"
            >
              {selectedCopilot ? selectedCopilot.name : t('选择搭档')}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>{t('我的搭档')}</Menu.Label>
            {myCopilots.map((copilot, index) => (
              <Menu.Item
                key={copilot.id}
                onClick={() => handleSelectCopilot(copilot)}
                fw={copilot.id === selectedCopilotId ? 700 : 400}
                color={copilot.id === selectedCopilotId ? 'blue' : undefined}
                // 第一个选项添加上边距，解决 hover 区域问题
                style={{ marginTop: index === 0 ? 8 : 0 }}
              >
                {copilot.name}
              </Menu.Item>
            ))}
            {remoteCopilots.length > 0 && <Menu.Divider />}
            {remoteCopilots.slice(0, 5).map((copilot) => (
              <Menu.Item
                key={copilot.id}
                onClick={() => handleSelectCopilot(copilot)}
                fw={copilot.id === selectedCopilotId ? 700 : 400}
                color={copilot.id === selectedCopilotId ? 'blue' : undefined}
              >
                {copilot.name}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </Box>
      <Header session={currentSession} />

      {/* MessageList 设置 key，确保每个 session 对应新的 MessageList 实例 */}
      <MessageList ref={messageListRef} key={`message-list${currentSessionId}`} currentSession={currentSession} />

      {/* <ScrollButtons /> */}
      <ErrorBoundary name="session-inputbox">
        <InputBox
          key={`input-box${currentSession.id}`}
          sessionId={currentSession.id}
          sessionType={currentSession.type}
          model={model}
          onStartNewThread={onStartNewThread}
          onRollbackThread={onRollbackThread}
          onSelectModel={onSelectModel}
          onClickSessionSettings={onClickSessionSettings}
          generating={!!lastGeneratingMessage}
          onSubmit={onSubmit}
          onStopGenerating={onStopGenerating}
        />
      </ErrorBoundary>
      <ThreadHistoryDrawer session={currentSession} />
    </div>
  ) : (
    !isFetching && (
      <div className="flex flex-1 flex-col items-center justify-center min-h-[60vh]">
        <div className="text-2xl font-semibold text-gray-700 mb-4">{t('Conversation not found')}</div>
        <Button variant="outline" onClick={goHome}>
          {t('Back to HomePage')}
        </Button>
      </div>
    )
  )
}
