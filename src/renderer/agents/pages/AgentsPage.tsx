/**
 * AgentsPage - Agent 管理页面（增强版：包含「开始对话」入口）
 */

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Box, Button, Card, Group, Text, Stack, Badge, ActionIcon, Modal, Menu } from '@mantine/core'
import { IconPlus, IconTrash, IconEdit, IconRobot, IconMessage, IconDots } from '@tabler/icons-react'
import Page from '@/components/layout/Page'
import { useAgents, useDeleteAgent } from '../hooks/useAgents'
import type { AgentEntity } from '../../../shared/agents/types'
import { PERMISSION_MODE_INFO } from '../../../shared/agents/types'
import AgentFormPage from './AgentFormPage'

export default function AgentsPage() {
  const { data: agents, isLoading } = useAgents()
  const deleteAgent = useDeleteAgent()
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [editingAgent, setEditingAgent] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const navigate = useNavigate()

  if (showForm) {
    return (
      <AgentFormPage
        agentId={editingAgent || undefined}
        onCancel={() => {
          setShowForm(false)
          setEditingAgent(null)
        }}
      />
    )
  }

  const handleEdit = (agentId: string) => {
    setEditingAgent(agentId)
    setShowForm(true)
  }

  const handleCreate = () => {
    setEditingAgent(null)
    setShowForm(true)
  }

  const handleChat = (agentId: string) => {
    navigate({ to: `/agent-chat/${agentId}` as any })
  }

  return (
    <Page
      title="🤖 Agents 管理"
      right={
        <Button size="sm" leftSection={<IconPlus size={16} />} onClick={handleCreate}>
          新建 Agent
        </Button>
      }
    >
      <Box p="md">
        {isLoading ? (
          <Text c="dimmed">加载中...</Text>
        ) : !agents?.length ? (
          <Card withBorder p="xl" ta="center">
            <IconRobot size={48} style={{ opacity: 0.3 }} />
            <Text mt="md" c="dimmed">
              暂无 Agent，点击上方按钮创建
            </Text>
          </Card>
        ) : (
          <Stack>
            {agents.map((agent: AgentEntity) => (
              <Card key={agent.id} withBorder shadow="sm">
                <Group justify="space-between" align="flex-start">
                  <Group>
                    <Text size="xl">{agent.icon}</Text>
                    <div>
                      <Text fw={600}>{agent.name}</Text>
                      <Text size="sm" c="dimmed">
                        {agent.description || '无描述'}
                      </Text>
                      <Group gap="xs" mt={4}>
                        <Badge size="sm" variant="light">
                          🤖 {agent.model}
                        </Badge>
                        <Badge size="sm" variant="light" color="grape">
                          {PERMISSION_MODE_INFO[agent.permissionMode].label}
                        </Badge>
                        <Badge size="sm" variant="light" color="blue">
                          ⚡ {agent.enabledTools.length || '全部'} 个工具
                        </Badge>
                        {agent.gitBashPath && (
                          <Badge size="sm" variant="light" color="green">
                            💻 Git Bash
                          </Badge>
                        )}
                        {agent.autonomousMode && (
                          <Badge size="sm" variant="light" color="orange">
                            🤖 自主模式
                          </Badge>
                        )}
                      </Group>
                    </div>
                  </Group>
                  <Group gap="xs">
                    <Button
                      variant="filled"
                      color="blue"
                      size="sm"
                      leftSection={<IconMessage size={14} />}
                      onClick={() => handleChat(agent.id)}
                    >
                      开始对话
                    </Button>
                    <Menu shadow="md" position="bottom-end">
                      <Menu.Target>
                        <ActionIcon variant="light" size="lg">
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => handleEdit(agent.id)}>
                          编辑
                        </Menu.Item>
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={() => setDeleteConfirm(agent.id)}
                        >
                          删除
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        )}

        <Modal opened={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="确认删除">
          <Text>确定要删除这个 Agent 吗？此操作不可撤销。</Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setDeleteConfirm(null)}>
              取消
            </Button>
            <Button
              color="red"
              onClick={() => {
                if (deleteConfirm) deleteAgent.mutate(deleteConfirm)
                setDeleteConfirm(null)
              }}
            >
              删除
            </Button>
          </Group>
        </Modal>
      </Box>
    </Page>
  )
}
