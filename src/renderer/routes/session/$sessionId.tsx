import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, Avatar, Box, Button, Card, Menu, Stack, Text, Group } from '@mantine/core'
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
import storage from '@/storage'

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

// Safe base64 decode function that handles Unicode characters
function safeBase64Decode(base64: string): Uint8Array {
  // Decode using atob, but handle Unicode characters properly
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

// PDF Preview Component - 优先使用文件路径加载，否则从 IndexedDB 加载
function PDFPreviewPanel({ pdfFile }: { pdfFile: MessageFile }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // 获取 PDF 的 storageKey 和文件路径
  const storageKey = pdfFile.storageKey
  const filePath = pdfFile.url  // Electron 文件路径
  
  console.log('[PDF Preview] filePath:', filePath, 'storageKey:', storageKey)
  
  useEffect(() => {
    let url: string | null = null
    
    const loadPdf = async () => {
      console.log('[PDF Preview] Loading PDF, filePath:', filePath)
      
      // 优先使用文件路径加载 PDF（Electron 环境下）
      if (filePath) {
        try {
          // 使用 file:// 协议加载本地文件
          const fileUrl = `file:///${filePath.replace(/\\/g, '/')}`
          console.log('[PDF Preview] Using file URL:', fileUrl)
          setBlobUrl(fileUrl)
          setLoading(false)
          return
        } catch (err) {
          console.error('[PDF Preview] Failed to load PDF from file path:', err)
          // 回退到从 storage 加载
        }
      }
      
      // 回退：从 IndexedDB 获取 blob
      if (!storageKey) {
        setError('No storage key or file path available')
        setLoading(false)
        return
      }
      
      try {
        // 从 IndexedDB 获取 blob
        const blob = await storage.getBlob(storageKey)
        if (blob) {
          let pdfBlob: Blob
          
          if (typeof blob === 'string') {
            try {
              // 尝试使用安全的 base64 解码
              const bytes = safeBase64Decode(blob)
              pdfBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
            } catch (decodeErr) {
              // 如果 base64 解码失败，尝试直接作为二进制数据处理
              console.error('[PDF Preview] Base64 decode failed, trying raw binary:', decodeErr)
              const encoder = new TextEncoder()
              pdfBlob = new Blob([encoder.encode(blob)], { type: 'application/pdf' })
            }
          } else if (ArrayBuffer.isView(blob)) {
            // 是 TypedArray
            pdfBlob = new Blob([blob], { type: 'application/pdf' })
          } else {
            // 尝试作为 Blob 处理（假设是 Blob 或 ArrayBuffer）
            try {
              pdfBlob = new Blob([blob as BlobPart], { type: 'application/pdf' })
            } catch {
              // 最后尝试字符串转换
              pdfBlob = new Blob([String(blob)], { type: 'application/pdf' })
            }
          }
          
          // 创建 blob URL
          url = URL.createObjectURL(pdfBlob)
          setBlobUrl(url)
        } else {
          setError('PDF file not found in storage')
        }
      } catch (err) {
        console.error('[PDF Preview] Error loading PDF:', err)
        setError(err instanceof Error ? err.message : 'Failed to load PDF')
      } finally {
        setLoading(false)
      }
    }
    
    loadPdf()
    
    // 清理 blob URL
    return () => {
      if (url) {
        URL.revokeObjectURL(url)
      }
    }
  }, [storageKey, filePath])

  return (
    <Card shadow="sm" padding="sm" radius="md" withBorder style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>
        <Group justify="space-between">
          <Text size="sm" fw="bold">PDF Preview</Text>
          <Text size="xs" c="dimmed">{pdfFile.name}</Text>
        </Group>
        
        <Box style={{ flex: 1, minHeight: 0, background: '#f5f5f5', borderRadius: 4 }}>
          {loading ? (
            <Box style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Text size="sm" c="dimmed">Loading PDF...</Text>
            </Box>
          ) : error ? (
            <Box style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Text size="sm" c="red">{error}</Text>
            </Box>
          ) : blobUrl ? (
            <iframe
              src={blobUrl}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                borderRadius: '4px'
              }}
              title="PDF Preview"
            />
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
    return (
      <div className="flex flex-col h-full">
        {/* 搭档选择器 - 显示在Header下方 */}
        <Box px="sm" py="xs" className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div style={{ marginLeft: '40%' }}>
            <Menu shadow="lg" width={240} position="bottom-start">
              <Menu.Target>
                <Button 
                  variant="gradient" 
                  gradient={{ from: 'blue', to: 'cyan', deg: 135 }} 
                  size="sm" 
                  radius="md"
                  leftSection={currentCopilotEmoji ? (
                    <Text fw={700} size="lg">{currentCopilotEmoji}</Text>
                  ) : (
                    <Avatar size={20} color="white">{(selectedCopilot?.name || '?').slice(0, 1)}</Avatar>
                  )}
                  className="font-semibold"
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
        
        {/* Left: PDF Preview, Right: Chat */}
        <div className="flex flex-1 min-h-0" style={{ flex: 1 }}>
          {/* Left: PDF Preview */}
          <div style={{ width: '50%', padding: '0 8px' }}>
            <PDFPreviewPanel pdfFile={singlePdfFile} />
          </div>
          
          {/* Right: Chat area */}
          <div style={{ width: '50%', padding: '0 8px', display: 'flex', flexDirection: 'column' }}>
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
      {/* 搭档选择器 - 显示在Header下方 */}
      <Box px="sm" py="xs" className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <Menu shadow="lg" width={240} position="bottom-start">
          <Menu.Target>
            <Button 
              variant="gradient" 
              gradient={{ from: 'blue', to: 'cyan', deg: 135 }} 
              size="sm" 
              radius="md"
              leftSection={currentCopilotEmoji ? (
                <Text fw={700} size="lg">{currentCopilotEmoji}</Text>
              ) : (
                <Avatar size={20} color="white">{(selectedCopilot?.name || '?').slice(0, 1)}</Avatar>
              )}
              className="font-semibold"
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
