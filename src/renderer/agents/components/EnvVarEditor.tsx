/**
 * EnvVarEditor - 环境变量编辑器
 */

import { Textarea, Text } from '@mantine/core'

interface EnvVarEditorProps {
  value: string
  onChange: (value: string) => void
}

export function EnvVarEditor({ value, onChange }: EnvVarEditorProps) {
  return (
    <div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder="API_KEY=xxx&#10;DEBUG=true"
        autosize
        minRows={4}
        maxRows={12}
        styles={{
          input: {
            fontFamily: 'monospace',
            fontSize: 13,
          },
        }}
      />
      <Text size="xs" c="dimmed" mt={4}>
        输入自定义环境变量（每行一个，格式：KEY=value）
      </Text>
    </div>
  )
}