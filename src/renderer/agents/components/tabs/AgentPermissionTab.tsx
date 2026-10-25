/**
 * AgentPermissionTab - 权限模式 Tab（迁移 Cherry-Studio 截图）
 */

import { Stack, Text } from '@mantine/core'
import { PermissionModeCard } from '../PermissionModeCard'
import type { AgentPermissionMode } from '../../../../shared/agents/types'

interface AgentPermissionTabProps {
  value: AgentPermissionMode
  onChange: (mode: AgentPermissionMode) => void
}

const MODES: AgentPermissionMode[] = [
  'default',
  'plan',
  'acceptEdits',
  'bypassPermissions',
]

export function AgentPermissionTab({ value, onChange }: AgentPermissionTabProps) {
  return (
    <Stack gap="xs">
      <Text size="sm" c="dimmed" mb="sm">
        指定智能体如何处理工具使用授权
      </Text>
      {MODES.map((mode) => (
        <PermissionModeCard
          key={mode}
          mode={mode}
          selected={value}
          onSelect={onChange}
        />
      ))}
    </Stack>
  )
}