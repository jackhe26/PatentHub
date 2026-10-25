/**
 * AgentFormPage - Agent 创建/编辑表单（多 Tab 结构）
 *
 * 参考 Cherry-Studio 截图风格：
 * - 左侧：基础设置 / 提示词设置 / 权限模式 / 工具 / 高级设置
 * - 右侧：当前 Tab 的内容
 */

import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Box, Group, Button, Stack, Tabs, Text, TextInput, Switch } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import Page from '@/components/layout/Page'
import { useCreateAgent, useAgentSkills, useToggleAgentSkill } from '../hooks/useAgents'
import { useSkills } from '../../skills/hooks/useSkills'
import type { AgentPermissionMode, AgentToolName, CreateAgentDto } from '../../../shared/agents/types'
import { AgentBasicTab } from '../components/tabs/AgentBasicTab'
import { AgentPromptTab } from '../components/tabs/AgentPromptTab'
import { AgentPermissionTab } from '../components/tabs/AgentPermissionTab'
import { AgentToolsTab } from '../components/tabs/AgentToolsTab'
import { AgentAdvancedTab } from '../components/tabs/AgentAdvancedTab'

// 全局 API 类型
const api = (window as any).electronAPI

export default function AgentFormPage({ agentId, onCancel }: { agentId?: string; onCancel?: () => void }) {
  const navigate = useNavigate()
  const isEdit = !!agentId
  const createAgent = useCreateAgent()
  const { data: allSkills } = useSkills()
  const { data: agentSkills } = useAgentSkills(agentId || '')
  const toggleSkill = useToggleAgentSkill()

  const [activeTab, setActiveTab] = useState<string>('basic')
  const [form, setForm] = useState({
    name: '',
    description: '',
    instructions: '',
    model: 'gpt-4o',
    icon: '🤖',
    permissionMode: 'default' as AgentPermissionMode,
    gitBashPath: null as string | null,
    autoDetectGitBash: false,
    autonomousMode: true,
    workingDirectories: [] as string[],
    environmentVariables: '',
    enabledTools: [] as AgentToolName[],
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [detecting, setDetecting] = useState(false)

  useEffect(() => {
    if (agentId && agentSkills) {
      api.agents.getById(agentId).then((agent: any) => {
        if (agent) {
          setForm({
            name: agent.name,
            description: agent.description || '',
            instructions: agent.instructions || '',
            model: agent.model,
            icon: agent.icon,
            permissionMode: agent.permissionMode,
            gitBashPath: agent.gitBashPath,
            autoDetectGitBash: agent.autoDetectGitBash,
            autonomousMode: agent.autonomousMode,
            workingDirectories: agent.workingDirectories || [],
            environmentVariables: agent.environmentVariables || '',
            enabledTools: agent.enabledTools || [],
          })
        }
      })
    }
  }, [agentId, agentSkills])

  const updateForm = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleAutoDetect = async () => {
    setDetecting(true)
    try {
      const result = await api.agents.detectGitBash()
      if (result.found && result.path) {
        updateForm('gitBashPath', result.path)
      }
    } catch (err) {
      console.error('Git Bash 检测失败:', err)
    } finally {
      setDetecting(false)
    }
  }

  const handleSelectBashPath = async () => {
    const path = await api.agents.selectGitBashPath()
    if (path) {
      updateForm('gitBashPath', path)
    }
  }

  const handleSelectDir = async () => {
    try {
      const dir = await api.agents.selectDir()
      return dir
    } catch (err) {
      console.error('选择目录失败:', err)
      return null
    }
  }

  const toggleTool = (name: AgentToolName, enabled: boolean) => {
    setForm((prev) => {
      const current = new Set(prev.enabledTools)
      if (enabled) {
        current.add(name)
      } else {
        current.delete(name)
      }
      return { ...prev, enabledTools: Array.from(current) }
    })
  }

  const handleSave = async () => {
    const newErrors: Record<string, string> = {}
    if (!form.name.trim()) newErrors.name = '名称不能为空'
    if (!form.instructions.trim()) newErrors.instructions = '指令不能为空'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setActiveTab('basic')
      return
    }

    try {
      await createAgent.mutateAsync({
        name: form.name,
        description: form.description,
        instructions: form.instructions,
        model: form.model,
        icon: form.icon,
        permissionMode: form.permissionMode,
        gitBashPath: form.gitBashPath,
        autoDetectGitBash: form.autoDetectGitBash,
        autonomousMode: form.autonomousMode,
        workingDirectories: form.workingDirectories,
        environmentVariables: form.environmentVariables,
        enabledTools: form.enabledTools,
      } as CreateAgentDto)

      if (onCancel) {
        onCancel()
      } else {
        navigate({ to: '/agents' as any })
      }
    } catch (e) {
      console.error('创建 Agent 失败:', e)
    }
  }

  const toggleSkillForAgent = (skillId: string) => {
    const isEnabled = agentSkills?.some((s) => s.skillId === skillId && s.isEnabled)
    toggleSkill.mutate({ agentId: agentId || '', skillId, isEnabled: !isEnabled })
  }

  return (
    <Page title={isEdit ? '编辑 Agent' : '新建 Agent'}>
      <Box p="md" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Group mb="lg">
          <Button
            variant="light"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => (onCancel ? onCancel() : navigate({ to: '/agents' as any }))}
          >
            返回
          </Button>
        </Group>

        <Group align="flex-start" gap="md" wrap="nowrap">
          <Box style={{ width: 200, flexShrink: 0 }}>
            <Tabs value={activeTab} onChange={(v) => v && setActiveTab(v)} orientation="vertical" variant="pills">
              <Tabs.List>
                <Tabs.Tab value="basic">基础设置</Tabs.Tab>
                <Tabs.Tab value="prompt">提示词设置</Tabs.Tab>
                <Tabs.Tab value="permission">权限模式</Tabs.Tab>
                <Tabs.Tab value="tools">工具</Tabs.Tab>
                <Tabs.Tab value="skills">Skills</Tabs.Tab>
                <Tabs.Tab value="advanced">高级设置</Tabs.Tab>
              </Tabs.List>
            </Tabs>
          </Box>

          <Box style={{ flex: 1, minWidth: 0 }}>
            <Stack gap="md">
              {activeTab === 'basic' && (
                <AgentBasicTab
                  form={{
                    name: form.name,
                    icon: form.icon,
                    model: form.model,
                    gitBashPath: form.gitBashPath,
                    autoDetectGitBash: form.autoDetectGitBash,
                    autonomousMode: form.autonomousMode,
                  }}
                  onChange={updateForm}
                  onAutoDetect={handleAutoDetect}
                  onSelectBashPath={handleSelectBashPath}
                  detecting={detecting}
                />
              )}

              {activeTab === 'prompt' && (
                <Stack gap="md">
                  <TextInput
                    label="描述"
                    placeholder="简短描述这个 Agent 的用途"
                    value={form.description}
                    onChange={(e) => updateForm('description', e.currentTarget.value)}
                  />
                  <AgentPromptTab value={form.instructions} onChange={(v) => updateForm('instructions', v)} />
                  {errors.instructions && (
                    <Text size="xs" c="red">
                      {errors.instructions}
                    </Text>
                  )}
                </Stack>
              )}

              {activeTab === 'permission' && (
                <AgentPermissionTab value={form.permissionMode} onChange={(v) => updateForm('permissionMode', v)} />
              )}

              {activeTab === 'tools' && <AgentToolsTab enabledTools={form.enabledTools} onToggle={toggleTool} />}

              {activeTab === 'skills' && (
                <Stack gap="md">
                  <Text size="sm" c="dimmed">
                    关联 Skills - 启用后 Agent 可通过 Skill 工具调用其 SKILL.md 内容
                  </Text>
                  {!allSkills?.length ? (
                    <Text c="dimmed" size="sm">
                      暂无已安装 Skills，请先前往 Skills 市场安装
                    </Text>
                  ) : (
                    <Stack gap="xs">
                      {allSkills.map((skill) => {
                        const isEnabled = agentSkills?.some((s) => s.skillId === skill.id && s.isEnabled)
                        return (
                          <Group
                            key={skill.id}
                            justify="space-between"
                            p="sm"
                            style={{ borderRadius: 4, background: 'var(--mantine-color-gray-0)' }}
                          >
                            <Group gap="sm">
                              <Text size="md">⚡</Text>
                              <Text size="sm" fw={500}>
                                {skill.name}
                              </Text>
                              {skill.source && (
                                <Text size="xs" c="dimmed">
                                  ({skill.source})
                                </Text>
                              )}
                            </Group>
                            <Switch
                              checked={isEnabled || false}
                              onChange={() => toggleSkillForAgent(skill.id)}
                              label={isEnabled ? '已启用' : '未启用'}
                            />
                          </Group>
                        )
                      })}
                    </Stack>
                  )}
                </Stack>
              )}

              {activeTab === 'advanced' && (
                <AgentAdvancedTab
                  workingDirectories={form.workingDirectories}
                  environmentVariables={form.environmentVariables}
                  onWorkingDirsChange={(dirs) => updateForm('workingDirectories', dirs)}
                  onEnvVarsChange={(env) => updateForm('environmentVariables', env)}
                  onSelectDir={handleSelectDir}
                />
              )}

              <Group justify="flex-end" mt="lg">
                <Button variant="default" onClick={() => (onCancel ? onCancel() : navigate({ to: '/agents' as any }))}>
                  取消
                </Button>
                <Button onClick={handleSave} loading={createAgent.isPending}>
                  {isEdit ? '保存' : '创建'}
                </Button>
              </Group>
            </Stack>
          </Box>
        </Group>
      </Box>
    </Page>
  )
}
