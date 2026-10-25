/**
 * AgentPromptTab - 提示词设置 Tab
 */

import { Stack, Textarea, Text } from '@mantine/core'

interface AgentPromptTabProps {
  value: string
  onChange: (value: string) => void
}

export function AgentPromptTab({ value, onChange }: AgentPromptTabProps) {
  return (
    <Stack gap="xs">
      <div>
        <Text size="sm" fw={500} mb={4}>系统提示词（System Prompt）</Text>
        <Text size="xs" c="dimmed" mb={8}>
          定义 Agent 的角色、能力和行为准则。这将作为 System Message 发送给 LLM。
        </Text>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={`例如：
你是一个专业的专利审查助手。
你的专长是：
1. 检索现有专利
2. 分析权利要求
3. 对比技术方案
4. 撰写审查意见

回答时请遵循以下原则：
- 引用具体专利号和法律条款
- 提供详细的分析依据
- 保持客观中立的立场`}
        autosize
        minRows={12}
        maxRows={30}
        styles={{
          input: {
            fontFamily: 'monospace',
            fontSize: 13,
            lineHeight: 1.6,
          },
        }}
      />
      <Text size="xs" c="dimmed">
        提示：当前字符数 {value.length}
      </Text>
    </Stack>
  )
}