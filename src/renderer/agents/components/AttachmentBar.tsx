/**
 * AttachmentBar - Agent 输入框上方的附件条
 * 展示已上传的附件：图片缩略图、文档 chip、解析状态、删除按钮
 */

import { ActionIcon, Badge, Box, Group, Image, Loader, Text, Tooltip } from '@mantine/core'
import { IconPhoto, IconX } from '@tabler/icons-react'
import FileIcon from '@/components/FileIcon'
import { formatFileSize, getFileTypeLabel } from '@/components/InputBox/Attachments'
import type { AgentAttachment } from '../../../shared/agents/types'

export interface UiAttachment extends AgentAttachment {
  dataUrl?: string
  status: 'parsing' | 'ready' | 'error'
  error?: string
}

interface AttachmentBarProps {
  attachments: UiAttachment[]
  onRemove: (id: string) => void
}

export function AttachmentBar({ attachments, onRemove }: AttachmentBarProps) {
  if (attachments.length === 0) return null

  return (
    <Group gap="xs" wrap="wrap" mb="xs">
      {attachments.map((att) => {
        const typeLabel = getFileTypeLabel(att.name, att.mime)
        const sizeLabel = formatFileSize(att.size)
        const subtitle = [typeLabel, sizeLabel].filter(Boolean).join(' · ')
        return (
          <Box
            key={att.id}
            style={{
              position: 'relative',
              borderRadius: 8,
              padding: 4,
              background: 'var(--mantine-color-gray-1)',
              minWidth: 56,
              maxWidth: 200,
              textAlign: 'center',
            }}
          >
            {att.isImage && att.dataUrl ? (
              <Image
                src={att.dataUrl}
                radius={6}
                height={56}
                width={56}
                fit="cover"
                style={{ display: 'inline-block' }}
              />
            ) : (
              <Box style={{ height: 56, width: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {att.status === 'parsing' ? (
                  <Loader size="xs" />
                ) : att.isImage ? (
                  <IconPhoto size={22} stroke={1.5} />
                ) : (
                  <FileIcon filename={att.name} className="w-8 h-8" />
                )}
              </Box>
            )}

            <Tooltip label={att.status === 'error' ? att.error || '解析失败' : att.name}>
              <Text size="xs" truncate style={{ maxWidth: 120, display: 'block', marginTop: 2 }}>
                {att.name}
              </Text>
            </Tooltip>

            {subtitle && (
              <Text c="dimmed" truncate style={{ maxWidth: 120, display: 'block', fontSize: 10, lineHeight: 1.4 }}>
                {subtitle}
              </Text>
            )}

            {att.status === 'error' && (
              <Badge size="xs" color="red" variant="light" style={{ marginTop: 2 }}>
                失败
              </Badge>
            )}

            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              onClick={() => onRemove(att.id)}
              style={{ position: 'absolute', top: -6, right: -6, background: 'var(--mantine-color-body)' }}
            >
              <IconX size={14} />
            </ActionIcon>
          </Box>
        )
      })}
    </Group>
  )
}
