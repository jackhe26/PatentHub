import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, Avatar, Box, Button, Card, Menu, Stack, Text, Group } from '@mantine/core'
import { IconFileTypePdf, IconFileOff, IconChevronLeft, IconChevronRight, IconMessage } from '@tabler/icons-react'
import type { CopilotDetail, Message, ModelProvider, MessageFile } from '@shared/types'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ForwardedRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const [currentPage, setCurrentPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  // Touch gesture state
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const touchStartDist = useRef<number>(0)
  const [scale, setScale] = useState(1.3)
  const baseScale = useRef(1.3)

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
        const rawBase64 = await storage.getBlob(`${storageKey}_pdf_raw`)
        if (!rawBase64) {
          setError('PDF raw data not found. Please re-upload the PDF file.')
          setLoading(false)
          return
        }

        // rawBase64 is a pure base64 string (no Data URL prefix) stored by sessionHelpers
        // Strip any accidental prefix and whitespace just in case
        let base64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64
        base64 = base64.replace(/\s/g, '')

        // Sanity check: valid PDF base64 starts with "JVBERi" ("%PDF")
        console.log('[PDF Preview] base64 prefix:', base64.substring(0, 8))
        if (!base64.startsWith('JVBERi')) {
          console.warn('[PDF Preview] base64 does not look like a PDF, prefix:', base64.substring(0, 8))
        }

        // Open PDF directly with base64 — Java handles Base64.decode, no WebView btoa
        const openResult = await pdfRenderer.openWithBase64(base64)
        console.log('[PDF Preview] Opened PDF, pages:', openResult.pageCount)
        setTotalPages(openResult.pageCount)
        setCurrentPage(0)

        // Render first page
        const pageResult = await pdfRenderer.renderPage(0, 2.0)
        setPageImage(pageResult.base64)
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
    setLoading(true)
    try {
      const result = await pdfRenderer.renderPage(newPage, 2.0)
      setPageImage(result.base64)
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
        {/* Title bar: PDF name left, page indicator right */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderBottom: '1px solid #e5e7eb', flexShrink: 0, background: '#fff' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
            {pdfFile.name}
          </span>
          {totalPages > 0 && (
            <span style={{ fontSize: 12, color: '#6b7280', flexShrink: 0 }}>
              {currentPage + 1} / {totalPages}
            </span>
          )}
        </div>

        {/* PDF content area — full width, no scrollbars */}
        <div
          style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#f3f4f6', touchAction: 'none' }}
          onTouchStart={(e) => {
            if (e.touches.length === 1) {
              touchStartX.current = e.touches[0].clientX
              touchStartY.current = e.touches[0].clientY
            } else if (e.touches.length === 2) {
              const dx = e.touches[0].clientX - e.touches[1].clientX
              const dy = e.touches[0].clientY - e.touches[1].clientY
              touchStartDist.current = Math.sqrt(dx * dx + dy * dy)
              baseScale.current = scale
            }
          }}
          onTouchMove={(e) => {
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
            // Only handle single-finger swipe for page turn (not after pinch)
            if (e.changedTouches.length === 1 && e.touches.length === 0) {
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
            <img
              src={pageImage}
              alt={`Page ${currentPage + 1}`}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
                transform: `scale(${scale})`,
                transformOrigin: 'top center',
              }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14, color: '#9ca3af' }}>PDF 正在加载…</span>
            </div>
          )}
        </div>
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
  const emojiMatch = currentCopilotName.match(/^([\u{1F300}-\u{1F9FF}])/u)
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
          <Text size="xs" c="chatbox-tertiary">
            {selectedCopilot ? `当前: ${selectedCopilot.name}` : t('点击切换搭档')}
          </Text>
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
        <Text size="xs" c="chatbox-tertiary">
          {selectedCopilot ? `当前: ${selectedCopilot.name}` : t('点击切换搭档')}
        </Text>
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
