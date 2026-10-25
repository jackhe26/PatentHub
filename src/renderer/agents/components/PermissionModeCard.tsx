/**
 * PermissionModeCard - 权限模式卡片（迁移 Cherry-Studio 截图风格）
 */

import { Card, Group, Text, Stack, Box, Badge } from '@mantine/core'
import { IconCheck, IconAlertTriangle } from '@tabler/icons-react'
import type { AgentPermissionMode } from '../../../shared/agents/types'
import { PERMISSION_MODE_INFO } from '../../../shared/agents/types'

interface PermissionModeCardProps {
  mode: AgentPermissionMode
  selected: AgentPermissionMode
  onSelect: (mode: AgentPermissionMode) => void
}

export function PermissionModeCard({ mode, selected, onSelect }: PermissionModeCardProps) {
  const info = PERMISSION_MODE_INFO[mode]
  const isSelected = selected === mode

  return (
    <Card
      withBorder
      shadow={isSelected ? 'sm' : undefined}
      style={{
        cursor: 'pointer',
        borderColor: isSelected ? 'var(--mantine-color-green-5)' : undefined,
        borderWidth: isSelected ? 2 : 1,
        transition: 'all 0.15s ease',
      }}
      onClick={() => onSelect(mode)}
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={4} style={{ flex: 1 }}>
          <Group gap="xs" wrap="nowrap">
            <Text fw={600} size="sm">{info.label}</Text>
            {info.dangerous && (
              <Badge size="xs" color="orange" variant="light">危险</Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">{info.description}</Text>
          {info.dangerous && (
            <Group gap={4} mt={4}>
              <IconAlertTriangle size={14} color="var(--mantine-color-orange-6)" />
              <Text size="xs" c="orange">所有工具都会在无审批情况下执行</Text>
            </Group>
          )}
        </Stack>
        {isSelected && (
          <Box style={{ flexShrink: 0 }}>
            <IconCheck size={20} color="var(--mantine-color-green-6)" />
          </Box>
        )}
      </Group>
    </Card>
  )
}