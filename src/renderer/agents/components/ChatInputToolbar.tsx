/**
 * ChatInputToolbar - 聊天输入框工具栏
 *
 * 包含：附件按钮、斜杠命令菜单、模式切换、模型选择、Skills 切换、资源切换
 */
import { useMemo, useState } from 'react'
import { Group, ActionIcon, Menu, Text, Tooltip, Box, Select, Switch } from '@mantine/core'
import { IconPaperclip, IconSlash, IconShieldLock, IconBolt, IconFile, IconWorld, IconBookmark, IconChevronUp } from '@tabler/icons-react'
import type { AgentEntity } from '../../../shared/agents/types'
import { PERMISSION_MODE_INFO } from '../../../shared/agents/types'
import { useProviders } from '@/hooks/useProviders'

interface ChatInputToolbarProps {
  agent: AgentEntity
  value: string
  onChange: (value: string) => void
  sending: boolean
  onSend: () => void
}

const SLASH_COMMANDS = [
  { command: '/help', description: '显示帮助' },
  { command: '/clear', description: '清空对话' },
  { command: '/save', description: '保存当前会话' },
  { command: '/export', description: '导出会话' },
  { command: '/search', description: '联网搜索' },
  { command: '/image', description: '生成图片' },
  { command: '/skills', description: '查看 Skills' },
  { command: '/tools', description: '查看工具列表' },
]

export default function ChatInputToolbar({ agent, value, onChange, sending, onSend }: ChatInputToolbarProps) {
  const [modelOpen, setModelOpen] = useState(false)
  const [resourceOpen, setResourceOpen] = useState(false)
  const { providers } = useProviders()

  // 动态从已配置的 Provider 列表生成模型下拉选项
  const modelOptions = useMemo(
    () =>
      providers.flatMap((p: any) =>
        (p.models || [])
          .filter((m: any) => !m.type || m.type === 'chat')
          .map((m: any) => ({
            value: `${p.id}:${m.modelId}`,
            label: `${p.name} / ${(m.displayName || m.nickname || m.modelId)}`,
          }))
      ),
    [providers]
  )

  // 斜杠命令处理
  const handleSlashClick = (cmd: string) => {
    onChange(cmd + ' ')
  }

  // 附件按钮（占位）
  const handleAttachment = () => {
    onChange(value + '\n[附件] ')
  }

  // 模型切换
  const handleModelChange = (newModel: string | null) => {
    if (newModel) {
      // 通过 IPC 更新 agent 模型（需要新 IPC handler）
      console.log('Switch model to:', newModel)
    }
    setModelOpen(false)
  }

  return (
    <Group gap={4} justify="space-between" wrap="nowrap">
      <Group gap={2}>
        {/* 附件按钮 */}
        <Tooltip label="添加附件">
          <ActionIcon variant="subtle" size="sm" onClick={handleAttachment} disabled={sending}>
            <IconPaperclip size={16} />
          </ActionIcon>
        </Tooltip>

        {/* 斜杠命令菜单 */}
        <Menu shadow="md" position="bottom-start">
          <Menu.Target>
            <Tooltip label="斜杠命令">
              <ActionIcon variant="subtle" size="sm" disabled={sending}>
                <IconSlash size={16} />
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>斜杠命令</Menu.Label>
            {SLASH_COMMANDS.map((cmd) => (
              <Menu.Item key={cmd.command} onClick={() => handleSlashClick(cmd.command)}>
                <Text size="sm" fw={500}>{cmd.command}</Text>
                <Text size="xs" c="dimmed">{cmd.description}</Text>
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>

        {/* Skills 切换 */}
        <Tooltip label={`已启用 ${agent.enabledTools.length || '全部'} 个工具`}>
          <ActionIcon variant="subtle" size="sm" disabled={sending} color="grape">
            <IconBolt size={16} />
          </ActionIcon>
        </Tooltip>

        {/* 资源面板切换 */}
        <Menu shadow="md" position="bottom-start">
          <Menu.Target>
            <Tooltip label="资源">
              <ActionIcon variant="subtle" size="sm" disabled={sending}>
                <IconBookmark size={16} />
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconFile size={14} />} onClick={() => setResourceOpen(true)}>
              文件资源
            </Menu.Item>
            <Menu.Item leftSection={<IconWorld size={14} />}>
              联网搜索
            </Menu.Item>
            <Menu.Item leftSection={<IconBookmark size={14} />}>
              知识库检索
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      <Group gap={4}>
        {/* 模型选择 */}
        {modelOptions.length > 0 ? (
          <Select
            value={agent.model}
            data={modelOptions}
            onChange={handleModelChange}
            size="xs"
            placeholder="选择模型"
            w={160}
            comboboxProps={{ withinPortal: false }}
          />
        ) : (
          <Tooltip label="未配置 LLM Provider">
            <Text size="xs" c="orange">⚠ 未配置模型</Text>
          </Tooltip>
        )}

        {/* 模式指示器（只读） */}
        <Tooltip label={`权限模式: ${PERMISSION_MODE_INFO[agent.permissionMode].label}`}>
          <Box style={{
            padding: '2px 6px',
            borderRadius: 4,
            background: 'var(--mantine-color-grape-light)',
            color: 'var(--mantine-color-grape-filled)',
            fontSize: 11,
            fontWeight: 500,
            cursor: 'help',
          }}>
            <IconShieldLock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            {PERMISSION_MODE_INFO[agent.permissionMode].label}
          </Box>
        </Tooltip>
      </Group>
    </Group>
  )
}
