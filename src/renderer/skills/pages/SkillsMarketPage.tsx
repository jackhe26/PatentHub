/**
 * Skills 市场页面
 */

import { useState } from 'react'
import { Box, Button, Card, Group, Text, Title, Stack, Badge, TextInput, ActionIcon, Tabs } from '@mantine/core'
import { IconSearch, IconDownload, IconTrash, IconPackage } from '@tabler/icons-react'
import { useSkills, useInstallSkill, useUninstallSkill, useSearchSkills } from '../hooks/useSkills'
import type { InstalledSkill, SkillSearchResult } from '../../../shared/skills/types'

export default function SkillsMarketPage() {
  const { data: installedSkills, isLoading: loadingInstalled } = useSkills()
  const installSkill = useInstallSkill()
  const uninstallSkill = useUninstallSkill()
  const searchSkills = useSearchSkills()
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearch = () => {
    if (searchQuery.trim()) {
      searchSkills.mutate(searchQuery.trim())
    }
  }

  return (
    <Box p="md">
      <Title order={2} mb="lg">⚡ Skills 市场</Title>

      <Group mb="lg">
        <TextInput
          placeholder="搜索技能..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          leftSection={<IconSearch size={16} />}
          style={{ flex: 1 }}
        />
        <Button onClick={handleSearch} loading={searchSkills.isPending}>
          搜索
        </Button>
      </Group>

      <Tabs defaultValue="installed">
        <Tabs.List>
          <Tabs.Tab value="installed">已安装 ({installedSkills?.length || 0})</Tabs.Tab>
          <Tabs.Tab value="search">搜索结果 ({searchSkills.data?.length || 0})</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="installed" pt="md">
          {loadingInstalled ? (
            <Text c="dimmed">加载中...</Text>
          ) : !installedSkills?.length ? (
            <Card withBorder p="xl" ta="center">
              <IconPackage size={48} style={{ opacity: 0.3 }} />
              <Text mt="md" c="dimmed">暂无已安装 Skills</Text>
            </Card>
          ) : (
            <Stack>
              {installedSkills.map((skill: InstalledSkill) => (
                <Card key={skill.id} withBorder shadow="sm">
                  <Group justify="space-between">
                    <div>
                      <Text fw={600}>{skill.name}</Text>
                      <Text size="sm" c="dimmed">{skill.description || '无描述'}</Text>
                      <Group gap="xs" mt={4}>
                        <Badge size="sm" variant="light">{skill.source}</Badge>
                        {skill.author && <Badge size="sm" variant="light" color="blue">👤 {skill.author}</Badge>}
                      </Group>
                    </div>
                    <ActionIcon variant="light" color="red" onClick={() => uninstallSkill.mutate(skill.id)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Card>
              ))}
            </Stack>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="search" pt="md">
          {searchSkills.isPending ? (
            <Text c="dimmed">搜索中...</Text>
          ) : !searchSkills.data?.length ? (
            <Card withBorder p="xl" ta="center">
              <IconSearch size={48} style={{ opacity: 0.3 }} />
              <Text mt="md" c="dimmed">输入关键词搜索 Skills</Text>
            </Card>
          ) : (
            <Stack>
              {searchSkills.data.map((result: SkillSearchResult) => (
                <Card key={result.slug} withBorder shadow="sm">
                  <Group justify="space-between">
                    <div>
                      <Text fw={600}>{result.name}</Text>
                      <Text size="sm" c="dimmed">{result.description || '无描述'}</Text>
                      <Group gap="xs" mt={4}>
                        <Badge size="sm" variant="light">{result.sourceRegistry}</Badge>
                        {result.stars > 0 && <Badge size="sm" variant="light" color="yellow">⭐ {result.stars}</Badge>}
                        {result.downloads > 0 && <Badge size="sm" variant="light" color="green">📥 {result.downloads}</Badge>}
                      </Group>
                    </div>
                    <Button
                      size="sm"
                      leftSection={<IconDownload size={16} />}
                      onClick={() => installSkill.mutate(result.installSource)}
                      loading={installSkill.isPending}
                    >
                      安装
                    </Button>
                  </Group>
                </Card>
              ))}
            </Stack>
          )}
        </Tabs.Panel>
      </Tabs>
    </Box>
  )
}