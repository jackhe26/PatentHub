import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, Box, Button, Card, Menu, Stack, Text, Group } from '@mantine/core'
import { IconFileTypePdf, IconFileOff, IconMessage } from '@tabler/icons-react'
import type { CopilotDetail, Message, ModelProvider, MessageFile } from '@shared/types'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const firstUserMessage = session.messages.find((m) => m.role === 'user')
  if (!firstUserMessage) return null
  const pdfFiles = firstUserMessage.files?.filter((f) => f.name.toLowerCase().endsWith('.pdf')) || []
  return pdfFiles.length === 1 ? pdfFiles[0] : null
}

// Safe base64 decode function that handles Unicode characters and Data URL prefixes
function safeBase64Decode(base64: string): Uint8Array {
  const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64
  const normalized = cleanBase64.replace(/\s/g, '')
  try {
    const binaryString = atob(normalized)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes
  } catch {
    return new TextEncoder().encode(normalized)
  }
}

// PDF Preview Component (Desktop: iframe, Mobile: native plugin)
function PDFPreviewPanel({ pdfFile }: { pdfFile: MessageFile }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pageImage, setPageImage] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1.1)
  const [translateX, setTranslateX] = useState(0)
  const [translateY, setTranslateY] = useState(0)
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const touchStartDist = useRef<number>(0)
  const baseScale = useRef(1.1)
  const startTransX = useRef<number>(0)
  const startTransY = useRef<number>(0)
  const lastTapTime = useRef<number>(0)
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>()
  const [pageTexts, setPageTexts] = useState<string[]>([])
  const [showTextModal, setShowTextModal] = useState(false)
  const [longPressY, setLongPressY] = useState<number>(0.5)
  const [longPressX, setLongPressX] = useState<number>(0.5)
  const [renderedW, setRenderedW] = useState(0)
  const [renderedH, setRenderedH] = useState(0)
  const [textBlocks, setTextBlocks] = useState<any[][]>([])
  const [allParagraphsList, setAllParagraphsList] = useState<{ start: number; end: number; text: string; blocks: any[] }[]>([])
  const [nearestParaIdx, setNearestParaIdx] = useState<number>(-1)
  const [expandedIdx, setExpandedIdx] = useState<number>(-1)
  const [copiedIdx, setCopiedIdx] = useState<number>(-1)

  const storageKey = pdfFile.storageKey
  const filePath = pdfFile.url
  const isMobile = platform.type === 'mobile'

  // Desktop: load via file:// or IndexedDB blob
  useEffect(() => {
    if (isMobile) return
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

  // Mobile: native renderer
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
        let rawRef = await storage.getBlob(`${storageKey}_pdf_raw`)
        if (!rawRef) {
          setError('PDF preview data not found. Please re-upload the PDF file.')
          setLoading(false)
          return
        }
        let cleanBase64 = rawRef.includes(',') ? rawRef.split(',')[1] : rawRef
        cleanBase64 = cleanBase64.replace(/\s/g, '')
        const openResult = await pdfRenderer.openWithBase64(cleanBase64)
        setTotalPages(openResult.pageCount)
        setCurrentPage(0)
        const pageResult = await pdfRenderer.renderPage(0, 2.0)
        setPageImage(pageResult.base64)
        setRenderedW(pageResult.width || 0)
        setRenderedH(pageResult.height || 0)
        try {
          const pagesJson = await storage.getBlob(`${storageKey}_pdf_pages`)
          if (pagesJson) setPageTexts(JSON.parse(pagesJson) as string[])
        } catch (textErr) {
          console.warn('[PDF Preview] Failed to load page texts:', textErr)
        }
        try {
          const blocksJson = await storage.getBlob(`${storageKey}_pdf_blocks`)
          if (blocksJson) setTextBlocks(JSON.parse(blocksJson) as any[][])
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

  // Compute paragraphs (mobile)
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
    const xBuckets: Record<string, number> = {}
    for (const b of pageBlocks) {
      const bucket = Math.round((b.xPdf || 0) / 5) * 5
      xBuckets[bucket] = (xBuckets[bucket] || 0) + 1
    }
    const bodyLeftX = Object.entries(xBuckets).reduce(
      (best, [xStr, count]) => (count > best.count ? { x: parseFloat(xStr), count } : best),
      { x: 0, count: 0 }
    ).x
    const gaps: number[] = []
    for (let i = 1; i < pageBlocks.length; i++) {
      const dy = Math.abs(pageBlocks[i].yRatio - pageBlocks[i - 1].yRatio)
      if (dy > 0 && dy < 0.1) gaps.push(dy)
    }
    gaps.sort((a, b) => a - b)
    const p50 = gaps.length > 0 ? gaps[Math.floor(gaps.length * 0.5)] : 0.05
    const gapThreshold = p50 * 1.5
    const indentThreshold = bodyLeftX + 10
    const paragraphs: { start: number; end: number; text: string; blocks: any[] }[] = []
    let paraStart = 0
    for (let i = 1; i <= pageBlocks.length; i++) {
      const isEndOfBlocks = i === pageBlocks.length
      const prev = pageBlocks[i - 1]
      const curr = pageBlocks[i]
      const gap = !isEndOfBlocks ? Math.abs((curr?.yRatio || 0) - (prev?.yRatio || 0)) : 0
      const isBigGap = gap > gapThreshold
      const isIndentedParaEnd = !isEndOfBlocks && (curr?.xPdf || 0) >= indentThreshold && gap > p50 * 0.5
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
    let nearestIdx = 0
    let minDist = Infinity
    for (let pi = 0; pi < paragraphs.length; pi++) {
      const para = paragraphs[pi]
      const paraBlocks = pageBlocks.slice(para.start, para.end)
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
    setExpandedIdx(nearestIdx)
  }, [showTextModal, textBlocks, currentPage, longPressY, longPressX])

  const goToPage = async (delta: number) => {
    const newPage = currentPage + delta
    if (newPage < 0 || newPage >= totalPages) return
    setCurrentPage(newPage)
    setTranslateX(0)
    setTranslateY(0)
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

  if (isMobile) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div
          style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#f3f4f6', touchAction: 'none' }}
          onTouchStart={(e) => {
            if (e.touches.length === 1 && pageTexts.length > 0) {
              const containerHeight = (e.currentTarget as HTMLElement).clientHeight
              const containerWidth = (e.currentTarget as HTMLElement).clientWidth
              const rawY = e.touches[0].clientY - translateY
              const rawX = e.touches[0].clientX - translateX
              const scaleToFit =
                renderedW > 0 && renderedH > 0 ? Math.min(containerWidth / renderedW, containerHeight / renderedH) : 1
              const displayW = renderedW * scaleToFit
              const displayH = renderedH * scaleToFit
              const offsetX = (containerWidth - displayW) / 2
              const offsetY = (containerHeight - displayH) / 2
              const imgY = (rawY - offsetY) / scale / displayH
              const imgX = (rawX - offsetX) / scale / displayW
              setLongPressY(imgY)
              setLongPressX(imgX)
              longPressTimer.current = setTimeout(() => setShowTextModal(true), 600)
            }
            if (e.touches.length === 1) {
              touchStartX.current = e.touches[0].clientX
              touchStartY.current = e.touches[0].clientY
              startTransX.current = translateX
              startTransY.current = translateY
            } else if (e.touches.length === 2) {
              if (longPressTimer.current) clearTimeout(longPressTimer.current)
              const dx = e.touches[0].clientX - e.touches[1].clientX
              const dy = e.touches[0].clientY - e.touches[1].clientY
              touchStartDist.current = Math.sqrt(dx * dx + dy * dy)
              baseScale.current = scale
            }
          }}
          onTouchMove={(e) => {
            if (e.touches.length === 1 && longPressTimer.current) {
              const dx = e.touches[0].clientX - touchStartX.current
              const dy = e.touches[0].clientY - touchStartY.current
              if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearTimeout(longPressTimer.current)
            }
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
            }
          }}
          onTouchEnd={(e) => {
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
              setScale(1.1)
              setTranslateX(0)
              setTranslateY(0)
              lastTapTime.current = 0
            } else {
              lastTapTime.current = now
            }
            if (longPressTimer.current) clearTimeout(longPressTimer.current)
            if (e.touches.length === 0 && scale <= 1.11) {
              setTranslateX(0)
              setTranslateY(0)
            }
            if (e.changedTouches.length === 1 && e.touches.length === 0 && scale <= 1.11) {
              const dx = e.changedTouches[0].clientX - touchStartX.current
              const dy = e.changedTouches[0].clientY - touchStartY.current
              if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                if (dx < 0) goToPage(1)
                else goToPage(-1)
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
              {totalPages > 0 && (
                <div
                  style={{
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
                  }}
                >
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>第 {currentPage + 1} 页 · 目标段落 ± 1</span>
                <button
                  onClick={() => setShowTextModal(false)}
                  style={{ background: '#f3f4f6', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, color: '#6b7280', cursor: 'pointer' }}
                >
                  关闭
                </button>
              </div>
              <div style={{ flex: 1, overflow: 'hidden', padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
                {allParagraphsList.length === 0 || nearestParaIdx < 0 ? (
                  <div style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: 13 }}>未找到目标段落</div>
                ) : (
                  (() => {
                    const startIdx = Math.max(0, nearestParaIdx - 1)
                    const endIdx = Math.min(allParagraphsList.length - 1, nearestParaIdx + 1)
                    const slices = allParagraphsList.slice(startIdx, endIdx + 1)
                    const combinedText = slices.map((p, i) => (i > 0 ? '\n\n' : '') + p.text).join('')
                    return (
                      <>
                        <div style={{ fontSize: 11, color: '#9ca3af', paddingBottom: 8, flexShrink: 0 }}>第 {startIdx + 1}–{endIdx + 1} 段</div>
                        <div style={{ flex: 1, overflowY: 'auto', fontSize: 13, color: '#1f2937', lineHeight: 1.9, background: '#fafafa', borderRadius: 8, padding: '12px 14px', border: '1px solid #e5e7eb', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {combinedText}
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
      scrollActions.scrollToBottom('auto')
    }, 200)
  }, [])

  useEffect(() => {
    if (currentSession) {
      if (currentSession.type === 'chat' && currentSession.settings) {
        const { provider, modelId } = currentSession.settings
        if (provider && modelId) setLastUsedChatModel(provider, modelId)
      }
      if (currentSession.type === 'picture' && currentSession.settings) {
        const { provider, modelId } = currentSession.settings
        if (provider && modelId) setLastUsedPictureModel(provider, modelId)
      }
    }
  }, [currentSession?.settings, currentSession?.type, currentSession, setLastUsedChatModel, setLastUsedPictureModel])

  const onSelectModel = useCallback(
    (provider: ModelProvider, modelId: string) => {
      if (!currentSession) return
      void updateSessionStore(currentSession.id, {
        settings: { ...(currentSession.settings || {}), provider, modelId },
      })
    },
    [currentSession]
  )

  const onStartNewThread = useCallback(() => {
    if (!currentSession) return false
    void startNewThread(currentSession.id)
    return true
  }, [currentSession])

  const onRollbackThread = useCallback(() => {
    if (!currentSession) return false
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
      if (!currentSession) return
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
    if (!currentSession) return false
    NiceModal.show('session-settings', { session: currentSession })
    return true
  }, [currentSession])

  const onStopGenerating = useCallback(() => {
    if (!currentSession) return false
    if (lastGeneratingMessage?.generating) {
      lastGeneratingMessage?.cancel?.()
      void modifyMessage(currentSession.id, { ...lastGeneratingMessage, generating: false }, true)
    }
    return true
  }, [currentSession, lastGeneratingMessage])

  const model = useMemo(() => {
    if (!currentSession?.settings?.modelId || !currentSession?.settings?.provider) return undefined
    return { provider: currentSession.settings.provider, modelId: currentSession.settings.modelId }
  }, [currentSession?.settings?.provider, currentSession?.settings?.modelId])

  const { copilots: myCopilots } = useMyCopilots()
  const { copilots: remoteCopilots } = useRemoteCopilots()
  const selectedCopilotId = currentSession?.copilotId

  const selectedCopilot = useMemo(
    () => myCopilots.find((c) => c.id === selectedCopilotId) || remoteCopilots.find((c) => c.id === selectedCopilotId),
    [myCopilots, remoteCopilots, selectedCopilotId]
  )

  const handleSelectCopilot = useCallback(
    async (copilot: CopilotDetail | undefined) => {
      if (!currentSession || !copilot) return
      if (lastGeneratingMessage?.generating) {
        lastGeneratingMessage?.cancel?.()
      }
      const currentMessages = currentSession.messages || []
      const newMessages = [...currentMessages]
      const systemMsgIndex = newMessages.findIndex((m) => m.role === 'system')
      const newSystemMessage = {
        id: systemMsgIndex >= 0 ? newMessages[systemMsgIndex].id : crypto.randomUUID(),
        role: 'system' as const,
        contentParts: [{ type: 'text' as const, text: copilot.prompt }],
      }
      if (systemMsgIndex >= 0) newMessages[systemMsgIndex] = newSystemMessage
      else newMessages.unshift(newSystemMessage)
      void updateSessionStore(currentSession.id, {
        picUrl: copilot.picUrl,
        copilotId: copilot.id,
        messages: newMessages,
      })
      setTimeout(async () => {
        const userMessage: Message = {
          id: crypto.randomUUID(),
          role: 'user',
          contentParts: [{ type: 'text', text: '你好，' + copilot.name + '！' }],
          timestamp: Date.now(),
        }
        messageListRef.current?.scrollToBottom('instant')
        await submitNewUserMessage(currentSession.id, {
          newUserMsg: userMessage,
          needGenerating: true,
        })
      }, 500)
    },
    [currentSession, lastGeneratingMessage]
  )

  const singlePdfFile = useMemo(() => {
    if (!currentSession) return null
    return getSinglePDFFile(currentSession)
  }, [currentSession])

  // 公共：搭档选择器 Menu（用于 Header 中央）
  const copilotMenu = (
    <Menu shadow="lg" width={240} position="bottom-start">
      <Menu.Target>
        <Button variant="light" color="gray" size="sm" radius="md" className="font-semibold controls">
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
  )

  // 公共：PDF 切换按钮
  const pdfToggleButton = (
    <ActionIcon
      variant="subtle"
      color={showPdfPanel ? 'blue' : 'gray'}
      onClick={() => setShowPdfPanel(!showPdfPanel)}
      title={showPdfPanel ? '隐藏PDF预览' : '显示PDF预览'}
      className="controls"
    >
      {showPdfPanel ? (platform.type === 'mobile' ? <IconMessage size={20} /> : <IconFileTypePdf size={20} />) : <IconFileOff size={20} />}
    </ActionIcon>
  )

  if (singlePdfFile && currentSession) {
    const isMobile = platform.type === 'mobile'
    const pdfWidth = showPdfPanel ? (isMobile ? '100%' : '45%') : '0%'
    const chatWidth = showPdfPanel ? (isMobile ? '0%' : '55%') : '100%'

    return (
      <div className="flex flex-col h-full">
        <Header session={currentSession} leftActions={pdfToggleButton} copilotSelector={copilotMenu} />
        <div className="flex flex-1 min-h-0" style={{ flex: 1 }}>
          <div style={{ width: pdfWidth, padding: isMobile ? 0 : '0 8px', display: showPdfPanel ? 'block' : 'none', transition: 'width 0.2s ease' }}>
            <PDFPreviewPanel pdfFile={singlePdfFile} />
          </div>
          <div style={{ width: chatWidth, padding: '0 8px', display: 'flex', flexDirection: 'column', transition: 'width 0.2s ease' }}>
            <MessageList ref={messageListRef} key={`message-list${currentSessionId}`} currentSession={currentSession} />
          </div>
        </div>
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

  return currentSession ? (
    <div className="flex flex-col h-full">
      <Header session={currentSession} copilotSelector={copilotMenu} />
      <MessageList ref={messageListRef} key={`message-list${currentSessionId}`} currentSession={currentSession} />
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
