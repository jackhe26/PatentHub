/**
 * AgentToolsTab - 工具列表 Tab（迁移 Cherry-Studio 截图）
 *
 * 展示预授权工具列表，每个工具有独立开关。
 * 搜索框用于快速查找工具。
 */

import { useState, useMemo } from 'react'
import { Stack, TextInput, Text, Stack as MantineStack, Box, Title } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { ToolRow } from '../ToolRow'
import { TOOL_DEFINITIONS, TOOL_CATEGORIES } from '../../../../shared/agents/tools'
import type { AgentToolName } from '../../../../shared/agents/types'

interface AgentToolsTabProps {
  enabledTools: AgentToolName[]
  onToggle: (toolName: AgentToolName, enabled: boolean) => void
}

export function AgentToolsTab({ enabledTools, onToggle }: AgentToolsTabProps) {
  const [search, setSearch] = useState('')

  const isEnabled = (name: AgentToolName) => {
    if (enabledTools.length === 0) return true
    return enabledTools.includes(name)
  }

  const handleToggle = (name: AgentToolName, enabled: boolean) => {
    onToggle(name, enabled)
  }

  const filteredCategories = useMemo(() => {
    return Object.entries(TOOL_CATEGORIES).map(([key, cat]) => {
      const tools = cat.tools
        .map((name) => TOOL_DEFINITIONS[name])
        .filter((tool) => {
          if (!search) return true
          const q = search.toLowerCase()
          return (
            tool.displayName.toLowerCase().includes(q) ||
            tool.description.toLowerCase().includes(q) ||
            tool.name.toLowerCase().includes(q)
          )
        })
      return { key, ...cat, tools }
    }).filter((cat) => cat.tools.length > 0)
  }, [search])

  return (
    <Stack gap="md">
      <TextInput
        leftSection={<IconSearch size={14} />}
        placeholder="搜索工具（按名称/描述过滤）"
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
      />

      <MantineStack gap="lg">
        {filteredCategories.map((cat) => (
          <Box key={cat.key}>
            <Title order={6} mb="xs">
              <span style={{ marginRight: 8 }}>{cat.icon}</span>
              {cat.label}
              <Text component="span" c="dimmed" size="xs" ml="xs">
                ({cat.tools.length})
              </Text>
            </Title>
            <MantineStack gap="xs">
              {cat.tools.map((tool) => (
                <ToolRow
                  key={tool.name}
                  tool={tool}
                  enabled={isEnabled(tool.name)}
                  onToggle={(enabled) => handleToggle(tool.name, enabled)}
                />
              ))}
            </MantineStack>
          </Box>
        ))}
      </MantineStack>
    </Stack>
  )
}