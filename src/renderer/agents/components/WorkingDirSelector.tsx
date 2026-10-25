/**
 * WorkingDirSelector - 工作目录选择器
 */

import { Group, Button, TextInput, ActionIcon, Stack, Text } from '@mantine/core'
import { IconPlus, IconX, IconFolder } from '@tabler/icons-react'

interface WorkingDirSelectorProps {
  value: string[]
  onChange: (value: string[]) => void
  onSelectDir: () => Promise<string | null>
}

export function WorkingDirSelector({ value, onChange, onSelectDir }: WorkingDirSelectorProps) {
  const handleAdd = async () => {
    const dir = await onSelectDir()
    if (dir && !value.includes(dir)) {
      onChange([...value, dir])
    }
  }

  const handleRemove = (dir: string) => {
    onChange(value.filter((d) => d !== dir))
  }

  return (
    <Stack gap="xs">
      {value.map((dir, i) => (
        <Group key={i} gap="xs">
          <TextInput
            value={dir}
            readOnly
            leftSection={<IconFolder size={14} />}
            style={{ flex: 1 }}
          />
          <ActionIcon variant="subtle" color="red" onClick={() => handleRemove(dir)}>
            <IconX size={16} />
          </ActionIcon>
        </Group>
      ))}
      <Button
        variant="light"
        leftSection={<IconPlus size={16} />}
        onClick={handleAdd}
        fullWidth
      >
        添加目录
      </Button>
      {value.length === 0 && (
        <Text size="xs" c="dimmed">
          未指定时将自动创建默认工作目录
        </Text>
      )}
    </Stack>
  )
}