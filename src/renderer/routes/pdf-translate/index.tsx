import { ActionIcon, Flex, Group, Tabs, Text } from '@mantine/core'
import {
  IconLanguage,
  IconFileSearch,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react'
import { createFileRoute, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { zodValidator } from '@tanstack/zod-adapter'
import { PDFConvertTab } from '@/components/pdf-tools/PDFConvertTab'
import { PDFTranslateTab } from '@/components/pdf-tools/PDFTranslateTab'
import WindowControls from '@/components/layout/WindowControls'
import useNeedRoomForWinControls from '@/hooks/useNeedRoomForWinControls'
import { router } from '@/router'
import { useUIStore } from '@/stores/uiStore'
import { featureFlags } from '@/utils/feature-flags'

/**
 * PDF 页面（Tab 容器）
 *
 * 该页面承载两个 Tab：
 *  - translate: PDF 翻译（保持原有全部功能）
 *  - convert:   PDF 格式转换（基于 MinerU API，将扫描型 PDF 转为可搜索 PDF）
 *
 * Tab 状态用 local state 管理。
 *
 * 布局策略：
 *  - 整页用 Flex column + gap，主体区域 (Tabs) 占 flex:1
 *  - Tabs.Panel 也占 flex:1，保证内部 PDFDualViewCard 能撑满
 */

type TabValue = 'translate' | 'convert'

// 从 URL 获取 sessionId
function usePDFTranslateParams() {
  return useSearch({ from: '/pdf-translate/' })
}

export function PDFPage() {
  const { sessionId } = usePDFTranslateParams()
  const [activeTab, setActiveTab] = useState<TabValue>('translate')

  const showSidebar = useUIStore((s) => s.showSidebar)
  const setShowSidebar = useUIStore((s) => s.setShowSidebar)
  const { needRoomForMacWindowControls } = useNeedRoomForWinControls()

  // 路由守卫：PDF 功能仅在桌面端可用
  useEffect(() => {
    if (!featureFlags.pdfTranslate) {
      toast.error('PDF 功能仅在桌面端可用')
      router.navigate({ to: '/' })
    }
  }, [])

  return (
    <Flex direction="column" h="100%" p="xs" gap="xs">
      {/* 头部 */}
      <Group justify="space-between" className="title-bar" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={() => setShowSidebar(!showSidebar)}
            className={`controls ${needRoomForMacWindowControls ? 'pl-20' : ''}`}
          >
            {showSidebar ? (
              <IconLayoutSidebarLeftCollapse size={16} />
            ) : (
              <IconLayoutSidebarLeftExpand size={16} />
            )}
          </ActionIcon>
          <Text size="lg" fw="bold">
            PDF
          </Text>
        </Group>
        <WindowControls className="controls" />
      </Group>

      {/* Tab 容器：flex:1 让整体占据剩余空间 */}
      <Tabs
        value={activeTab}
        onChange={(v) => setActiveTab((v as TabValue) ?? 'translate')}
        variant="outline"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        <Tabs.List>
          <Tabs.Tab value="translate" leftSection={<IconLanguage size={14} />}>
            PDF 翻译
          </Tabs.Tab>
          <Tabs.Tab value="convert" leftSection={<IconFileSearch size={14} />}>
            PDF 格式转换
          </Tabs.Tab>
        </Tabs.List>

        {/* pt={0} 去掉顶部默认 padding，flex:1 让面板撑满 */}
        <Tabs.Panel
          value="translate"
          pt={0}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <PDFTranslateTab sessionId={sessionId as string | undefined} />
        </Tabs.Panel>

        <Tabs.Panel
          value="convert"
          pt={0}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <PDFConvertTab />
        </Tabs.Panel>
      </Tabs>
    </Flex>
  )
}

export const Route = createFileRoute('/pdf-translate/')({
  component: PDFPage,
  validateSearch: zodValidator(
    z.object({
      sessionId: z.string().optional(),
    })
  ),
})