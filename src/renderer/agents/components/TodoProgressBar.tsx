/**
 * TodoProgressBar - 任务进度条（迁移 Cherry-Studio 截图）
 */

import { Group, Stack, Text, Progress, Box, Checkbox, Indicator } from '@mantine/core'

export interface TodoItemData {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

interface TodoProgressBarProps {
  todos: TodoItemData[]
  title?: string
}

export function TodoProgressBar({ todos, title = '任务进度' }: TodoProgressBarProps) {
  const completed = todos.filter((t) => t.status === 'completed').length
  const total = todos.length
  const percent = total > 0 ? (completed / total) * 100 : 0

  return (
    <Stack gap="xs" p="sm" style={{ background: 'var(--mantine-color-gray-0)', borderRadius: 8 }}>
      <Group justify="space-between">
        <Text size="sm" fw={600}>{title}</Text>
        <Text size="sm" c="dimmed">{completed}/{total}</Text>
      </Group>
      <Progress value={percent} size="sm" />
      <Stack gap={4}>
        {todos.map((todo, i) => (
          <Group key={i} gap="xs" wrap="nowrap" align="flex-start">
            <Indicator
              color={todo.status === 'in_progress' ? 'blue' : 'transparent'}
              processing={todo.status === 'in_progress'}
              size={8}
            >
              <Checkbox
                checked={todo.status === 'completed'}
                size="xs"
                readOnly
                styles={{
                  input: { cursor: 'default' },
                }}
              />
            </Indicator>
            <Box style={{ flex: 1 }}>
              <Text
                size="sm"
                c={todo.status === 'completed' ? 'dimmed' : undefined}
                td={todo.status === 'completed' ? 'line-through' : undefined}
              >
                {todo.content}
              </Text>
              {todo.activeForm && todo.status === 'in_progress' && (
                <Text size="xs" c="blue">{todo.activeForm}</Text>
              )}
            </Box>
          </Group>
        ))}
      </Stack>
    </Stack>
  )
}