/**
 * AgentChatPage - Agent 聊天页（简化版 MVP）
 *
 * 通过 props 接收 agentId，避免依赖 useParams 路由上下文
 */

import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Image,
  Loader,
  ScrollArea,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core'
import { IconArrowLeft, IconBolt, IconPaperclip, IconRobot, IconSend, IconShieldLock } from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type {
  AgentEntity,
  AgentPermissionMode,
  AgentUserContentPart,
  TodoItem,
  ToolCall,
} from '../../../shared/agents/types'
import { PERMISSION_MODE_INFO } from '../../../shared/agents/types'
import FileIcon from '@/components/FileIcon'
import WindowControls from '@/components/layout/WindowControls'
import { AttachmentBar, type UiAttachment } from '../components/AttachmentBar'
import { PermissionModal, type PermissionRequestData } from '../components/PermissionModal'
import { TodoProgressBar } from '../components/TodoProgressBar'
import { ToolCallBubble } from '../components/ToolCallBubble'
import {
  AGENT_ATTACHMENT_ACCEPT,
  ingestToDisk,
  isVisionModel,
  readImageAsDataUrl,
} from '../services/attachmentPreprocess'

const api = (window as any).electronAPI

const PERMISSION_OPTIONS = (Object.keys(PERMISSION_MODE_INFO) as AgentPermissionMode[]).map((m) => ({
  value: m,
  label: PERMISSION_MODE_INFO[m].label,
}))

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCall[]
  attachments?: Array<{ id: string; name: string; isImage: boolean; dataUrl?: string }>
  timestamp: number
}

interface AgentChatPageProps {
  agentIdOverride?: string
}

export default function AgentChatPage({ agentIdOverride }: AgentChatPageProps = {}) {
  const navigate = useNavigate()
  const agentId = agentIdOverride || ''

  const [agent, setAgent] = useState<AgentEntity | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [streaming, setStreaming] = useState('')
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([])
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequestData | null>(null)
  const [sessionId] = useState<string>(() => `agent-session-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const [usage, setUsage] = useState({ inputTokens: 0, outputTokens: 0, totalTokens: 0 })

  // 附件（通用文件上传）
  const [attachments, setAttachments] = useState<UiAttachment[]>([])
  const [attachmentParsing, setAttachmentParsing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const toolCallsRef = useRef<ToolCall[]>([])
  useEffect(() => {
    toolCallsRef.current = toolCalls
  }, [toolCalls])

  useEffect(() => {
    if (!agentId) return
    api.agents.getById(agentId).then((a: AgentEntity) => setAgent(a))
  }, [agentId])

  useEffect(() => {
    if (!agentId) return

    // v3 新架构：main 端流式推送 chunk
    const unsubChunk = api.agents.onAgentChunk?.((event: { sessionId: string; content: string }) => {
      if (event.sessionId !== sessionId) return
      setStreaming((prev) => prev + (event.content || ''))
    })

    // 兼容：某些 Provider 可能不发 chunk，只发完整消息
    const unsubMessage = api.agents.onAgentMessage?.((event: any) => {
      if (event.sessionId !== sessionId) return
      if (event.content) setStreaming((prev) => (prev ? prev + event.content : event.content))
    })

    const unsubComplete = api.agents.onAgentComplete?.((event: any) => {
      if (event.sessionId !== sessionId) return
      setStreaming('')
      if (event.usage) setUsage(event.usage)
      if (event.finalMessage) {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: event.finalMessage,
            toolCalls: toolCallsRef.current,
            timestamp: Date.now(),
          },
        ])
        setToolCalls([])
      }
      setSending(false)
    })

    // v3 新增错误事件
    const unsubError = api.agents.onAgentError?.((event: { sessionId: string; error: string }) => {
      if (event.sessionId !== sessionId) return
      setStreaming('')
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-error-${Date.now()}`,
          role: 'assistant',
          content: `**错误**: ${event.error}`,
          timestamp: Date.now(),
        },
      ])
      setSending(false)
    })

    // v3 新增中止事件
    const unsubAborted = api.agents.onAgentAborted?.(() => {
      setSending(false)
      setStreaming('')
    })

    const unsubToolStart = api.agents.onToolStart?.((event: any) => {
      if (event.sessionId !== sessionId) return
      setToolCalls((prev) => [...prev, event.toolCall])
    })
    const unsubToolComplete = api.agents.onToolComplete?.((event: any) => {
      if (event.sessionId !== sessionId) return
      setToolCalls((prev) => prev.map((tc) => (tc.id === event.toolCall.id ? event.toolCall : tc)))
    })
    const unsubTodo = api.agents.onTodoUpdate?.((event: any) => {
      if (event.sessionId !== sessionId) return
      setTodos(event.todos || [])
    })
    const unsubPermission = api.agents.onPermissionRequest?.((request: any) => {
      if (request.agentId === agentId) {
        setPermissionRequest(request)
      }
    })

    return () => {
      unsubChunk?.()
      unsubMessage?.()
      unsubComplete?.()
      unsubError?.()
      unsubAborted?.()
      unsubToolStart?.()
      unsubToolComplete?.()
      unsubTodo?.()
      unsubPermission?.()
    }
  }, [sessionId, agentId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streaming, toolCalls])

  /** 选择/拖入文件 → 落盘 + 读取图片预览 */
  const handlePickFiles = async (files: File[]) => {
    if (!files || files.length === 0 || !agent) return
    setAttachmentParsing(true)
    try {
      const ingested = await ingestToDisk({ agentId, sessionId, files })
      const newAtts: UiAttachment[] = await Promise.all(
        ingested.map(async (att) => {
          const srcFile = files.find((f) => f.name === att.name)
          let dataUrl: string | undefined
          if (att.isImage && srcFile) {
            try {
              dataUrl = await readImageAsDataUrl(srcFile)
            } catch {
              dataUrl = undefined
            }
          }
          return { ...att, dataUrl, status: 'ready' as const }
        })
      )
      setAttachments((prev) => [...prev, ...newAtts])
    } catch (err) {
      console.error('[AgentChat] 附件落盘失败', err)
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-error-${Date.now()}`,
          role: 'assistant',
          content: `**附件处理失败**: ${(err as Error)?.message || err}`,
          timestamp: Date.now(),
        },
      ])
    } finally {
      setAttachmentParsing(false)
    }
  }

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || !agent) return

    // 记录附件到用户消息（气泡回显）
    const userAttachments = attachments.map((att) => ({
      id: att.id,
      name: att.name,
      isImage: att.isImage,
      dataUrl: att.dataUrl,
    }))
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input,
      attachments: userAttachments,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, userMessage])

    // 组装多模态 userMessage（文字 + 视觉模型的 image_url）
    const parts: AgentUserContentPart[] = []
    if (input.trim()) parts.push({ type: 'text', text: input })
    const vision = isVisionModel(agent.model)
    for (const att of attachments) {
      if (att.isImage && att.dataUrl && vision) {
        parts.push({ type: 'image_url', image_url: { url: att.dataUrl } })
      }
    }
    const userContent = parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts

    // 传给主进程的附件描述（去掉 UI 字段）
    const attachmentDescriptors = attachments.map((att) => ({
      id: att.id,
      name: att.name,
      absPath: att.absPath,
      relPath: att.relPath,
      size: att.size,
      mime: att.mime,
      kind: att.kind,
      text: att.text,
      isImage: att.isImage,
      ocrNeeded: att.ocrNeeded,
      pages: att.pages,
    }))

    setInput('')
    setSending(true)
    setToolCalls([])
    setTodos([])
    setAttachments([])

    try {
      await api.agents.runAgent({
        agentId,
        sessionId,
        userMessage: userContent,
        attachments: attachmentDescriptors,
      })
    } catch (err: any) {
      setSending(false)
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-error-${Date.now()}`,
          role: 'assistant',
          content: `**错误**: ${err.message}`,
          timestamp: Date.now(),
        },
      ])
    }
  }

  /** 会话级权限模式切换（持久化到 agent） */
  const handlePermissionModeChange = (mode: string | null) => {
    if (!mode || !agent) return
    const next = mode as AgentPermissionMode
    api.agents
      .update(agentId, { permissionMode: next })
      .then((updated: AgentEntity) => {
        if (updated) setAgent((prev) => (prev ? { ...prev, permissionMode: next } : prev))
      })
      .catch((err: unknown) => {
        console.error('[AgentChat] 切换权限模式失败', err)
      })
  }

  const handlePermissionRespond = (decision: 'allow' | 'deny' | 'allow_always') => {
    if (!permissionRequest) return
    api.agents.respondPermission(permissionRequest.eventId, decision, decision === 'allow_always')
    setPermissionRequest(null)
  }

  if (!agentId || !agent) {
    return (
      <Stack align="center" justify="center" h="100vh">
        <Loader />
        <Text c="dimmed">{agentId ? '加载 Agent...' : 'Agent ID 缺失'}</Text>
      </Stack>
    )
  }

  return (
    <Stack h="100vh" gap={0}>
      <Group
        h={54}
        px="md"
        gap="md"
        wrap="nowrap"
        className="title-bar flex-none"
        style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}
      >
        <ActionIcon variant="subtle" onClick={() => navigate({ to: '/agents' as any })}>
          <IconArrowLeft size={20} />
        </ActionIcon>
        <Text size="xl">{agent.icon}</Text>
        <Stack gap={0}>
          <Text fw={600}>{agent.name}</Text>
          <Group gap={4}>
            <Badge size="xs" variant="light">
              🤖 {agent.model}
            </Badge>
            <Badge size="xs" variant="light" color="grape">
              {PERMISSION_MODE_INFO[agent.permissionMode].label}
            </Badge>
            {agent.gitBashPath && (
              <Badge size="xs" variant="light" color="green">
                💻 Bash
              </Badge>
            )}
          </Group>
        </Stack>
        <WindowControls className="ml-auto" />
      </Group>

      <ScrollArea style={{ flex: 1 }} viewportRef={scrollRef} px="md" py="sm">
        <Stack gap="md" maw={900} mx="auto">
          {messages.length === 0 && !streaming && toolCalls.length === 0 && (
            <Card withBorder p="xl" ta="center">
              <IconRobot size={48} style={{ opacity: 0.3 }} />
              <Title order={4} mt="md">
                {agent.name}
              </Title>
              <Text c="dimmed" mt="xs">
                {agent.description || 'AI 助手已准备就绪，向我提问吧！'}
              </Text>
              <Group justify="center" mt="md" gap="xs">
                {agent.gitBashPath && (
                  <Badge leftSection={<IconBolt size={12} />} variant="light" color="blue">
                    已启用工具
                  </Badge>
                )}
                {agent.autonomousMode && (
                  <Badge variant="light" color="orange">
                    🤖 自主模式
                  </Badge>
                )}
              </Group>
            </Card>
          )}

          {messages.map((msg) => (
            <Box key={msg.id}>
              {msg.role === 'user' ? (
                <Card
                  withBorder
                  p="sm"
                  style={{ background: 'var(--mantine-color-blue-0)', borderColor: 'var(--mantine-color-blue-3)' }}
                >
                  <Group gap="xs" mb={4}>
                    <Text fw={600} size="sm" c="blue">
                      你
                    </Text>
                    <Text size="xs" c="dimmed">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </Text>
                  </Group>
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </Text>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <Group gap="xs" wrap="wrap" mt={6}>
                      {msg.attachments.map((a) =>
                        a.isImage && a.dataUrl ? (
                          <Image key={a.id} src={a.dataUrl} width={48} height={48} fit="cover" radius={4} />
                        ) : (
                          <Badge
                            key={a.id}
                            size="xs"
                            variant="light"
                            color="blue"
                            leftSection={<FileIcon filename={a.name} className="w-3 h-3" />}
                          >
                            {a.name}
                          </Badge>
                        )
                      )}
                    </Group>
                  )}
                </Card>
              ) : (
                <Stack gap="xs">
                  <Group gap="xs">
                    <Text size="lg">{agent.icon}</Text>
                    <Text fw={600} size="sm">
                      {agent.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </Text>
                  </Group>
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <Stack gap="xs" pl="xl">
                      {msg.toolCalls.map((tc) => (
                        <ToolCallBubble key={tc.id} toolCall={tc} />
                      ))}
                    </Stack>
                  )}
                  <Card withBorder p="sm">
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                      {msg.content}
                    </Text>
                  </Card>
                </Stack>
              )}
            </Box>
          ))}

          {toolCalls.length > 0 && (
            <Stack gap="xs" pl="xl">
              {toolCalls.map((tc) => (
                <ToolCallBubble key={tc.id} toolCall={tc} />
              ))}
            </Stack>
          )}

          {streaming && (
            <Stack gap="xs" pl="xl">
              <Group gap="xs">
                <Text size="lg">{agent.icon}</Text>
                <Text fw={600} size="sm">
                  {agent.name}
                </Text>
                <Loader size="xs" />
              </Group>
              <Card withBorder p="sm">
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {streaming}▍
                </Text>
              </Card>
            </Stack>
          )}

          {todos.length > 0 && <TodoProgressBar todos={todos} />}
        </Stack>
      </ScrollArea>

      <Divider />

      <Box p="md" style={{ background: 'var(--mantine-color-gray-0)' }}>
        <Box maw={900} mx="auto">
          <AttachmentBar attachments={attachments} onRemove={handleRemoveAttachment} />
          <Group gap="xs" align="flex-end">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={AGENT_ATTACHMENT_ACCEPT}
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = e.target.files ? Array.from(e.target.files) : []
                void handlePickFiles(files)
                e.target.value = ''
              }}
            />
            <ActionIcon
              variant="subtle"
              size="lg"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || attachmentParsing}
              title="添加附件"
            >
              {attachmentParsing ? <Loader size="sm" /> : <IconPaperclip size={20} />}
            </ActionIcon>
            <Textarea
              style={{ flex: 1 }}
              placeholder={
                attachments.length > 0 ? '可继续输入，或直接发送' : '输入消息，按 Enter 发送 · Shift+Enter 换行'
              }
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              autosize
              minRows={2}
              maxRows={6}
              disabled={sending}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleSend()
                }
              }}
            />
            <Stack gap={4}>
              <Button
                leftSection={<IconSend size={16} />}
                onClick={handleSend}
                disabled={sending || (!input.trim() && attachments.length === 0)}
                loading={sending}
              >
                发送
              </Button>
              {sending && (
                <Button size="xs" variant="subtle" color="red" onClick={() => api.agents.stopAgent(sessionId)}>
                  停止
                </Button>
              )}
            </Stack>
          </Group>
          <Group justify="space-between" mt="xs">
            <Group gap="xs">
              <Select
                size="xs"
                w={130}
                value={agent.permissionMode}
                data={PERMISSION_OPTIONS}
                onChange={handlePermissionModeChange}
                leftSection={<IconShieldLock size={13} />}
                comboboxProps={{ withinPortal: false }}
              />
              {agent.gitBashPath && (
                <Badge size="xs" variant="light" leftSection={<IconBolt size={10} />}>
                  工具: {agent.enabledTools.length || '全部'}
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed">
              Tokens: {usage.inputTokens.toLocaleString()} / {usage.outputTokens.toLocaleString()} /{' '}
              {usage.totalTokens.toLocaleString()}
            </Text>
          </Group>
        </Box>
      </Box>

      {permissionRequest && <PermissionModal request={permissionRequest} onRespond={handlePermissionRespond} />}
    </Stack>
  )
}
