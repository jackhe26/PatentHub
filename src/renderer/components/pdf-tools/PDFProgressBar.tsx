import { Box, Flex, Progress, Text } from '@mantine/core'

/**
 * PDF 处理进度条组件
 *
 * 由 PDF 翻译 Tab 与 PDF 格式转换 Tab 共享。
 * 状态文本为空时显示 "准备就绪"。
 */

export interface PDFProgressBarProps {
  /** 当前状态消息 */
  statusText?: string
  /** 当前处理的页码（可省略，如格式转换场景） */
  currentPage?: number
  /** 总页数（可省略） */
  totalPages?: number
  /** 进度百分比 0-100 */
  progress: number
  /** 错误消息（如有则红字显示） */
  error?: string | null
}

export function PDFProgressBar(props: PDFProgressBarProps) {
  const { statusText, currentPage = 0, totalPages = 0, progress, error } = props
  const showPages = totalPages > 0
  const displayText = statusText || '准备就绪'

  return (
    <Box>
      <Flex justify="space-between" mb={4}>
        <Text size="sm">{displayText}</Text>
        {showPages ? (
          <Text size="sm">
            {currentPage}/{totalPages} 页
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            {Math.round(progress)}%
          </Text>
        )}
      </Flex>
      <Progress value={progress} size="sm" />
      {error && (
        <Text size="sm" c="red" mt={4}>
          {error}
        </Text>
      )}
    </Box>
  )
}