/**
 * PermissionModal - 权限询问弹窗
 */

import { Modal, Stack, Alert, Group, Button, Text, Code, Card, Badge } from '@mantine/core'
import { IconAlertTriangle, IconShieldLock } from '@tabler/icons-react'

export interface PermissionRequestData {
  eventId: string
  agentId: string
  toolName: string
  toolDisplayName: string
  toolDescription: string
  arguments: Record<string, any>
  requiredPermission: 'read' | 'write' | 'execute' | 'network'
}

interface PermissionModalProps {
  request: PermissionRequestData
  onRespond: (decision: 'allow' | 'deny' | 'allow_always') => void
}

const PERMISSION_COLORS = {
  read: 'blue',
  write: 'yellow',
  execute: 'red',
  network: 'cyan',
} as const

const PERMISSION_LABELS = {
  read: '读取',
  write: '写入',
  execute: '执行',
  network: '联网',
} as const

export function PermissionModal({ request, onRespond }: PermissionModalProps) {
  return (
    <Modal
      opened
      onClose={() => onRespond('deny')}
      title={
        <Group gap="xs">
          <IconShieldLock size={20} />
          <Text fw={600}>权限确认</Text>
        </Group>
      }
      centered
      size="lg"
    >
      <Stack gap="md">
        <Alert color="orange" icon={<IconAlertTriangle />}>
          Agent 想要执行以下操作，需要您的授权：
        </Alert>

        <Card withBorder>
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" c="dimmed">工具</Text>
              <Group gap="xs">
                <Text fw={600}>{request.toolDisplayName}</Text>
                <Badge
                  size="xs"
                  variant="light"
                  color={PERMISSION_COLORS[request.requiredPermission]}
                >
                  {PERMISSION_LABELS[request.requiredPermission]}
                </Badge>
              </Group>
            </Group>

            <div>
              <Text size="sm" c="dimmed" mb={4}>描述</Text>
              <Text size="sm">{request.toolDescription}</Text>
            </div>

            {Object.keys(request.arguments).length > 0 && (
              <div>
                <Text size="sm" c="dimmed" mb={4}>参数</Text>
                <Code block style={{ maxHeight: 200, overflow: 'auto' }}>
                  {JSON.stringify(request.arguments, null, 2)}
                </Code>
              </div>
            )}
          </Stack>
        </Card>

        <Text size="xs" c="dimmed">
          提示：选择「始终允许」将永久信任此工具的后续调用（可在 Agent 设置中撤销）。
        </Text>

        <Group justify="flex-end">
          <Button variant="default" onClick={() => onRespond('deny')}>
            取消
          </Button>
          <Button variant="light" onClick={() => onRespond('allow')}>
            允许一次
          </Button>
          <Button color="orange" onClick={() => onRespond('allow_always')}>
            始终允许
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}