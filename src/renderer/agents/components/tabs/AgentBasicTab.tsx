/**
 * AgentBasicTab - 基础设置 Tab（v2：动态读取 PatentHub 模型）
 *
 * 包含：名称、图标、模型（动态）、Git Bash、自动发现、自主模式
 */

import { useMemo } from 'react'
import { Stack, TextInput, Select, Group, Button, Text, Switch, Card, Alert, Box } from '@mantine/core'
import { IconCheck, IconFolder, IconBolt, IconAlertCircle, IconSettings } from '@tabler/icons-react'
import { useProviders } from '@/hooks/useProviders'

interface AgentBasicTabProps {
  form: {
    name: string
    icon: string
    model: string
    gitBashPath: string | null
    autoDetectGitBash: boolean
    autonomousMode: boolean
  }
  onChange: (field: string, value: any) => void
  onAutoDetect: () => void
  onSelectBashPath: () => void
  detecting: boolean
}

const EMOJI_OPTIONS = ['🤖', '👨‍💻', '🧠', '🔬', '📚', '💡', '🎯', '🚀', '⚡', '🔧', '🎨', '📊', '🔍', '💬', '🌟']

export function AgentBasicTab({ form, onChange, onAutoDetect, onSelectBashPath, detecting }: AgentBasicTabProps) {
  // 使用 PatentHub 的 useProviders hook 获取已合并的 Providers 列表
  // （系统 Providers + 自定义 Providers + 已配置的 apiKey）
  const { providers } = useProviders()

  // 动态从已配置的 Provider 列表生成模型下拉选项
  // Mantine v7 的 Select/Combobox 需要严格的 data 格式：
  //   - 纯字符串数组，或
  //   - { value, label, disabled? }[] 平铺，或
  //   - { group: string, items: { value, label }[] }[] 嵌套
  // 这里用嵌套分组格式让模型按 Provider 分组显示
  const modelOptions = useMemo(() => {
    const groupMap = new Map<string, Array<{ value: string; label: string }>>()

    for (const provider of providers) {
      const providerName = provider.name || provider.id || 'Provider'
      const models = provider.models || []

      const groupItems: Array<{ value: string; label: string }> = []
      for (const model of models) {
        const value = `${provider.id}:${model.modelId}`
        const modelLabel = (model as any).displayName || (model as any).nickname || model.modelId
        const isChat = !model.type || model.type === 'chat'
        if (isChat) {
          groupItems.push({
            value,
            label: modelLabel,
          })
        }
      }

      if (groupItems.length > 0) {
        const existing = groupMap.get(providerName) || []
        groupMap.set(providerName, [...existing, ...groupItems])
      }
    }

    // 转为 Mantine 接受的嵌套分组格式
    return Array.from(groupMap.entries()).map(([group, items]) => ({
      group,
      items,
    }))
  }, [providers])

  // 扁平化后的总数量，用于描述
  const totalModelCount = useMemo(
    () => modelOptions.reduce((sum, g) => sum + g.items.length, 0),
    [modelOptions]
  )

  const hasProviders = modelOptions.length > 0

  return (
    <Stack gap="md">
      <TextInput
        label="名称"
        required
        value={form.name}
        onChange={(e) => onChange('name', e.currentTarget.value)}
        placeholder="例如：专利检索助手"
      />

      <div>
        <Text size="sm" fw={500} mb={6}>图标</Text>
        <Group gap="xs">
          {EMOJI_OPTIONS.map((emoji) => (
            <Button
              key={emoji}
              variant={form.icon === emoji ? 'filled' : 'light'}
              size="sm"
              onClick={() => onChange('icon', emoji)}
            >
              {emoji}
            </Button>
          ))}
        </Group>
      </div>

      {hasProviders ? (
        <Select
          label="模型"
          required
          placeholder="选择模型（来自已配置的 Provider）"
          data={modelOptions}
          value={form.model}
          onChange={(v) => v && onChange('model', v)}
          searchable
          maxDropdownHeight={300}
          description={`从 ${totalModelCount} 个已配置的模型中选择`}
        />
      ) : (
        <Alert color="yellow" icon={<IconAlertCircle size={16} />} title="未配置任何 LLM Provider">
          <Text size="sm" mb="xs">
            请先在「设置 → AI Provider」中添加至少一个 Provider（如 OpenAI、Anthropic、DeepSeek 等），然后再配置 Agent。
          </Text>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconSettings size={14} />}
            onClick={() => window.dispatchEvent(new CustomEvent('navigate-to', { detail: '/settings' }))}
          >
            前往设置
          </Button>
        </Alert>
      )}

      <Card withBorder>
        <Stack gap="xs">
          <Group justify="space-between">
            <Group gap="xs">
              <Text size="sm" fw={500}>
                Git Bash <Text component="span" c="red">*</Text>
              </Text>
              <Text size="xs" c="dimmed">
                启用 Shell 工具时必需
              </Text>
            </Group>
            <Switch
              label="自动发现"
              size="xs"
              checked={form.autoDetectGitBash}
              onChange={(e) => {
                onChange('autoDetectGitBash', e.currentTarget.checked)
                if (e.currentTarget.checked) onAutoDetect()
              }}
            />
          </Group>
          <Group gap="xs">
            <TextInput
              style={{ flex: 1 }}
              value={form.gitBashPath || ''}
              onChange={(e) => onChange('gitBashPath', e.currentTarget.value)}
              placeholder={detecting ? '正在检测...' : '例如: D:\\Program Files\\Git\\bin\\bash.exe'}
              leftSection={<IconBolt size={14} />}
            />
            <Button variant="default" leftSection={<IconFolder size={14} />} onClick={onSelectBashPath}>
              选择
            </Button>
          </Group>
          {form.gitBashPath && (
            <Group gap={4}>
              <IconCheck size={14} color="var(--mantine-color-green-6)" />
              <Text size="xs" c="green">已配置: {form.gitBashPath}</Text>
            </Group>
          )}
        </Stack>
      </Card>

      <Switch
        label="自主模式（Agent 自主执行多步骤任务，无需逐步确认）"
        checked={form.autonomousMode}
        onChange={(e) => onChange('autonomousMode', e.currentTarget.checked)}
      />
    </Stack>
  )
}