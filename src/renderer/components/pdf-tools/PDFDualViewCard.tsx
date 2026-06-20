import { ActionIcon, Box, Card, Flex, Group, Progress, Text, Tooltip } from '@mantine/core'
import { IconEye, IconZoomIn, IconZoomOut, IconZoomReset } from '@tabler/icons-react'
import { useEffect, useState, type ReactNode } from 'react'

/**
 * 双卡片 PDF 预览组件
 *
 * 用于左侧显示原文 PDF、右侧显示处理结果 PDF。
 * 支持以下状态：
 *  - idle:      默认占位状态
 *  - processing: 正在处理（显示进度条 + 状态文本）
 *  - completed: 处理完成（右侧显示 ✓）
 *  - error:     处理出错（通过 statusText 展示）
 *
 * v7.0: HTML 模式新增缩放工具栏 (50%-200%, 步进 25%)
 *
 * 由 PDF 翻译 Tab 与 PDF 格式转换 Tab 共享。
 *
 * 注意：组件本身需要 flex: 1 的父容器才能撑满剩余空间。
 * 不要在 Box 上设置 minHeight，会破坏弹性布局。
 */

export type ViewStatus = 'idle' | 'processing' | 'completed' | 'error'

interface CardAreaProps {
  title: string
  path: string | undefined
  refreshKey: number
  placeholder: string
  status: ViewStatus
  progress?: number
  statusText?: string
  extraActions?: ReactNode
  /** HTML 内容（与 path 二选一） */
  html?: string
  /** 渲染模式：'pdf' (默认) | 'html' */
  mode?: 'pdf' | 'html'
}

export interface PDFDualViewCardProps {
  // 左侧（原文）
  leftTitle?: string
  leftPath?: string
  leftRefreshKey?: number
  leftPlaceholder?: string
  leftActions?: ReactNode

  // 右侧（结果）
  rightTitle: string
  rightPath?: string
  rightRefreshKey?: number
  rightStatus?: ViewStatus
  rightProgress?: number
  rightStatusText?: string
  rightPlaceholder?: string
  rightActions?: ReactNode
  /** 右侧 HTML 预览内容（启用 HTML 模式） */
  rightHtml?: string
  /** 右侧渲染模式 */
  rightMode?: 'pdf' | 'html'
}

function buildFileUrl(path: string | undefined, key: number): string | undefined {
  if (!path) return undefined
  const normalized = path.replace(/\\/g, '/')
  return `file:///${normalized}?t=${key}`
}

function openInNewWindow(path: string | undefined) {
  if (!path) return
  const normalized = path.replace(/\\/g, '/')
  window.electronAPI.invoke('openLink', `file:///${normalized}`)
}

function PDFCardArea(props: CardAreaProps) {
  const { title, path, refreshKey, placeholder, status, progress, statusText, extraActions, html, mode = 'pdf' } = props
  const fileUrl = buildFileUrl(path, refreshKey)
  const isHtmlMode = mode === 'html' && !!html

  // v8.0: 用 Blob URL 替代 srcDoc，解决打包后 file:// 协议下 iframe 安全隔离导致样式丢失的问题
  const [blobUrl, setBlobUrl] = useState<string>('')

  useEffect(() => {
    if (!html) {
      setBlobUrl('')
      return
    }
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [html, refreshKey])

  // v7.9: HTML 模式缩放控制 (60% - 200%, 默认 135%)
  // 1 PDF pt = 1.333 CSS px (96 DPI/72 DPI)
  // 135% 接近原 PDF 视觉, 不会再变 200%
  const [zoom, setZoom] = useState(135)
  const [userHasAdjusted, setUserHasAdjusted] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(1200)
  
  // 智能 zoom 计算: 根据视口宽度, 但兜底 135%, 上限 135%
  useEffect(() => {
    if (!isHtmlMode) return
    if (userHasAdjusted) return  // 用户调过就不自动算了
    // 永远保持 135% 默认值
    setZoom(135)
  }, [userHasAdjusted, isHtmlMode])
  
  // 监听窗口 resize
  useEffect(() => {
    const handler = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  
  // 包装 setZoom 让用户能自由缩放
  const userSetZoom = (newZoom: number | ((prev: number) => number)) => {
    setUserHasAdjusted(true)
    setZoom(newZoom)
  }
  
  // 每次新内容加载时, 重置 zoom 为 135% 默认值
  useEffect(() => {
    setZoom(135)
    setUserHasAdjusted(false)
  }, [html, refreshKey])
  
  // 监听窗口 resize
  useEffect(() => {
    const handler = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return (
    <Card
      shadow="sm"
      padding="xs"
      radius="md"
      withBorder
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
    >
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Text size="md" fw="bold" style={{ flex: 1, minWidth: 0 }}>
          {title}
        </Text>
        <Group gap="xs" wrap="nowrap">
          {extraActions}
          {/* v7.9: HTML 模式缩放工具栏 (60%-200%, 默认 135%) */}
          {isHtmlMode && (
            <Group gap={2} wrap="nowrap">
              <Tooltip label="缩小 (60%)">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  onClick={() => userSetZoom(z => Math.max(60, z - 15))}
                  disabled={zoom <= 60}
                  aria-label="缩小"
                >
                  <IconZoomOut size={14} />
                </ActionIcon>
              </Tooltip>
              <Text size="xs" c="dimmed" style={{ minWidth: 40, textAlign: 'center' }}>
                {zoom}%
              </Text>
              <Tooltip label="放大 (200%)">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  onClick={() => userSetZoom(z => Math.min(200, z + 15))}
                  disabled={zoom >= 200}
                  aria-label="放大"
                >
                  <IconZoomIn size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="重置 (135%)">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  onClick={() => setZoom(135)}
                  disabled={zoom === 135}
                  aria-label="重置缩放"
                >
                  <IconZoomReset size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          )}
          {path && (
            <ActionIcon size="sm" variant="subtle" onClick={() => openInNewWindow(path)} title="在新窗口打开">
              <IconEye size={14} />
            </ActionIcon>
          )}
        </Group>
      </Group>
      <Box
        style={{
          flex: 1,
          background: '#f5f5f5',
          borderRadius: 4,
          overflow: 'auto',  // v7.0: 改 auto 让缩放后能滚动
          minHeight: 0,
          position: 'relative',
        }}
      >
        {status === 'processing' ? (
          <Flex align="center" justify="center" h="100%" direction="column">
            <Progress value={progress ?? 0} size="lg" style={{ width: '60%' }} mb="md" />
            <Text size="md" c="dimmed">
              {statusText || '处理中...'}
            </Text>
          </Flex>
        ) : isHtmlMode ? (
          // ★★★ v7.0: HTML 模式 + 缩放 (用 CSS transform: scale) ★★★
          <div
            style={{
              width: `${100 / (zoom / 100)}%`,
              height: `${100 / (zoom / 100)}%`,
              transform: `scale(${zoom / 100})`,
              transformOrigin: '0 0',
            }}
          >
            <iframe
              key={`html-${title}-${refreshKey}-${zoom}`}
              src={blobUrl}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: 'white' }}
              title={title}
            />
          </div>
        ) : fileUrl ? (
          <iframe
            key={`${title}-${refreshKey}`}
            src={fileUrl}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        ) : (
          <Flex align="center" justify="center" h="100%">
            <Text size="sm" c="dimmed">
              {placeholder}
            </Text>
          </Flex>
        )}
      </Box>
    </Card>
  )
}

export function PDFDualViewCard(props: PDFDualViewCardProps) {
  const {
    leftTitle = '原文',
    leftPath,
    leftRefreshKey = 0,
    leftPlaceholder = '请选择PDF文件',
    leftActions,
    rightTitle,
    rightPath,
    rightRefreshKey = 0,
    rightStatus = 'idle',
    rightProgress = 0,
    rightStatusText,
    rightPlaceholder = '等待处理',
    rightActions,
    rightHtml,
    rightMode = 'pdf',
  } = props

  return (
    <Flex gap="sm" style={{ flex: 1, minHeight: 0 }}>
      <PDFCardArea
        title={leftTitle}
        path={leftPath}
        refreshKey={leftRefreshKey}
        placeholder={leftPlaceholder}
        status="idle"
        extraActions={leftActions}
      />
      <PDFCardArea
        title={rightTitle}
        path={rightPath}
        refreshKey={rightRefreshKey}
        placeholder={rightPlaceholder}
        status={rightStatus}
        progress={rightProgress}
        statusText={rightStatusText}
        extraActions={rightActions}
        html={rightHtml}
        mode={rightMode}
      />
    </Flex>
  )
}
