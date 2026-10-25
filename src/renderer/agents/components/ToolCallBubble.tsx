/**
 * ToolCallBubble - 工具调用展示气泡
 */

import { Card, Group, Text, Badge, Stack, Code, Box, Loader, ThemeIcon } from '@mantine/core'
import {
  IconCheck,
  IconX,
  IconAlertCircle,
  IconTerminal2,
  IconFileText,
  IconEdit,
  IconSearch,
  IconBolt,
  IconPhoto,
  IconBooks,
  IconWorld,
} from '@tabler/icons-react'
import type { ToolCall, AgentToolName } from '../../../shared/agents/types'
import { TOOL_DEFINITIONS } from '../../../shared/agents/tools'

interface ToolCallBubbleProps {
  toolCall: ToolCall
}

const TOOL_ICONS: Record<string, any> = {
  Bash: IconTerminal2,
  Read: IconFileText,
  Write: IconEdit,
  Edit: IconEdit,
  MultiEdit: IconEdit,
  Glob: IconSearch,
  Grep: IconSearch,
  Task: IconBolt,
  TodoWrite: IconBolt,
  Skill: IconBolt,
  SkillScript: IconBolt,
  ImageGen: IconPhoto,
  KnowledgeBase: IconBooks,
  WebSearch: IconWorld,
  WebFetch: IconWorld,
}

const STATUS_COLORS = {
  pending: 'gray',
  approved: 'blue',
  denied: 'red',
  running: 'blue',
  success: 'green',
  error: 'red',
} as const

const STATUS_LABELS = {
  pending: '等待',
  approved: '已批准',
  denied: '已拒绝',
  running: '执行中',
  success: '成功',
  error: '失败',
} as const

export function ToolCallBubble({ toolCall }: ToolCallBubbleProps) {
  const def = TOOL_DEFINITIONS[toolCall.name]
  const Icon = TOOL_ICONS[toolCall.name] || IconBolt
  const isRunning = toolCall.status === 'running' || toolCall.status === 'pending'

  return (
    <Card
      withBorder
      p="sm"
      style={{
        borderLeft: `4px solid var(--mantine-color-${STATUS_COLORS[toolCall.status]}-5)`,
      }}
    >
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <ThemeIcon size="sm" variant="light" color={STATUS_COLORS[toolCall.status]}>
              <Icon size={14} />
            </ThemeIcon>
            <Text fw={600} size="sm">{def?.displayName || toolCall.name}</Text>
            <Badge size="xs" variant="light" color={STATUS_COLORS[toolCall.status]}>
              {STATUS_LABELS[toolCall.status]}
            </Badge>
            {isRunning && <Loader size="xs" />}
          </Group>
          <Text size="xs" c="dimmed">
            {new Date(toolCall.timestamp).toLocaleTimeString()}
          </Text>
        </Group>

        {/* 参数 */}
        {Object.keys(toolCall.arguments).length > 0 && (
          <Box>
            <Text size="xs" c="dimmed" mb={2}>参数:</Text>
            <Code block style={{ fontSize: 11, maxHeight: 150, overflow: 'auto' }}>
              {JSON.stringify(toolCall.arguments, null, 2)}
            </Code>
          </Box>
        )}

        {/* 结果 */}
        {toolCall.result && (
          <Box>
            <Group gap={4} mb={2}>
              {toolCall.result.success ? (
                <IconCheck size={12} color="var(--mantine-color-green-6)" />
              ) : (
                <IconAlertCircle size={12} color="var(--mantine-color-red-6)" />
              )}
              <Text size="xs" fw={500} c={toolCall.result.success ? 'green' : 'red'}>
                {toolCall.result.success ? '执行成功' : '执行失败'}
              </Text>
            </Group>
            <Box
              p="xs"
              style={{
                background: 'var(--mantine-color-gray-0)',
                borderRadius: 4,
                fontSize: 12,
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                maxHeight: 200,
                overflow: 'auto',
              }}
            >
              {toolCall.result.content}
            </Box>
          </Box>
        )}
      </Stack>
    </Card>
  )
}