/**
 * AgentAdvancedTab - 高级设置 Tab
 *
 * 包含：工作目录、环境变量
 */

import { Stack, Title, Text } from '@mantine/core'
import { WorkingDirSelector } from '../WorkingDirSelector'
import { EnvVarEditor } from '../EnvVarEditor'

interface AgentAdvancedTabProps {
  workingDirectories: string[]
  environmentVariables: string
  onWorkingDirsChange: (dirs: string[]) => void
  onEnvVarsChange: (env: string) => void
  onSelectDir: () => Promise<string | null>
}

export function AgentAdvancedTab({
  workingDirectories,
  environmentVariables,
  onWorkingDirsChange,
  onEnvVarsChange,
  onSelectDir,
}: AgentAdvancedTabProps) {
  return (
    <Stack gap="lg">
      <div>
        <Title order={6} mb="xs">工作目录</Title>
        <Text size="xs" c="dimmed" mb="sm">
          Agent 执行命令时的工作根目录。可添加多个目录。
        </Text>
        <WorkingDirSelector
          value={workingDirectories}
          onChange={onWorkingDirsChange}
          onSelectDir={onSelectDir}
        />
      </div>

      <div>
        <Title order={6} mb="xs">环境变量</Title>
        <Text size="xs" c="dimmed" mb="sm">
          指定智能体如何处理工具使用授权
        </Text>
        <EnvVarEditor value={environmentVariables} onChange={onEnvVarsChange} />
      </div>
    </Stack>
  )
}