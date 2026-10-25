/**
 * ToolRow - 工具行（迁移 Cherry-Studio 截图风格）
 */

import { Switch, Group, Text, Badge, Stack, Box } from '@mantine/core'
import type { ToolDefinition } from '../../../shared/agents/tools'

interface ToolRowProps {
  tool: ToolDefinition
  enabled: boolean
  onToggle: (enabled: boolean) => void
}

export function ToolRow({ tool, enabled, onToggle }: ToolRowProps) {
  return (
    <Box
      p="md"
      style={{
        borderRadius: 8,
        border: '1px solid var(--mantine-color-gray-3)',
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={6} style={{ flex: 1 }}>
          <Group gap="xs" wrap="nowrap">
            <Text style={{ fontSize: 18 }}>{tool.icon}</Text>
            <Text fw={600} size="sm">{tool.displayName}</Text>
            <Badge size="xs" variant="light" color="green">模式自动添加</Badge>
            {tool.requiresApprovalWhenDisabled && (
              <Badge size="xs" variant="light" color="orange">禁用时需要人工审批</Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">{tool.description}</Text>
        </Stack>
        <Switch
          checked={enabled}
          onChange={(e) => onToggle(e.currentTarget.checked)}
          size="md"
        />
      </Group>
    </Box>
  )
}