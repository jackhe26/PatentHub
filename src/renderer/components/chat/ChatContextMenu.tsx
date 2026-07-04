import { Menu } from '@mantine/core'
import { IconCode, IconFileTypePdf, IconFileText } from '@tabler/icons-react'
import type { Session } from '@shared/types'
import type { ExportChatFormat } from '@shared/types'
import { type FC, type ReactNode, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { exportSessionChat } from '@/stores/sessionActions'
import { ScalableIcon } from '../common/ScalableIcon'

interface ChatContextMenuProps {
  session: Session
  children: ReactNode
}

export const ChatContextMenu: FC<ChatContextMenuProps> = ({ session, children }) => {
  const { t } = useTranslation()
  const [opened, setOpened] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // 用户选中了文本 → 保留浏览器默认菜单（复制/全选/粘贴等）
      const selection = window.getSelection()?.toString() || ''
      if (selection.length > 0) {
        return
      }

      // 阻止默认菜单，显示自定义导出菜单
      e.preventDefault()
      setPosition({ x: e.clientX, y: e.clientY })
      setOpened(true)
    },
    []
  )

  const handleExport = useCallback(
    (format: ExportChatFormat) => {
      setOpened(false)
      void exportSessionChat(session.id, 'current_thread', format)
    },
    [session.id]
  )

  // 关闭菜单
  const handleClose = useCallback(() => {
    setOpened(false)
  }, [])

  return (
    <div onContextMenu={handleContextMenu} className="h-full">
      {children}
      <Menu
        opened={opened}
        onClose={handleClose}
        position="bottom-start"
        closeOnItemClick
        closeOnClickOutside
      >
        <Menu.Target>
          <div
            style={{
              position: 'fixed',
              left: position.x,
              top: position.y,
              width: 1,
              height: 1,
              pointerEvents: 'none',
            }}
          />
        </Menu.Target>
        <Menu.Dropdown miw={160}>
          <Menu.Item
            leftSection={<ScalableIcon icon={IconCode} size={16} />}
            onClick={() => handleExport('HTML')}
          >
            {t('Export as HTML')}
          </Menu.Item>
          <Menu.Item
            leftSection={<ScalableIcon icon={IconFileTypePdf} size={16} />}
            onClick={() => handleExport('PDF')}
          >
            {t('Export as PDF')}
          </Menu.Item>
          <Menu.Item
            leftSection={<ScalableIcon icon={IconFileText} size={16} />}
            onClick={() => handleExport('DOCX')}
          >
            {t('Export as DOCX')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  )
}