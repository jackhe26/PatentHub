import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, Flex, Title, Tooltip } from '@mantine/core'
import type { Session } from '@shared/types'
import { IconLayoutSidebarLeftExpand, IconMenu2, IconPencil } from '@tabler/icons-react'
import clsx from 'clsx'
import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import useNeedRoomForWinControls from '@/hooks/useNeedRoomForWinControls'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { scheduleGenerateNameAndThreadName, scheduleGenerateThreadName } from '@/stores/sessionActions'
import * as settingActions from '@/stores/settingActions'
import { useUIStore } from '@/stores/uiStore'
import Divider from '../common/Divider'
import { ScalableIcon } from '../common/ScalableIcon'
import Toolbar from './Toolbar'
import WindowControls from './WindowControls'

type HeaderProps = {
  session: Session
  /** 渲染在侧边栏按钮和 Session Name 之间的额外操作（如 PDF 切换按钮） */
  leftActions?: ReactNode
  /** 中央位置渲染的搭档选择器 */
  copilotSelector?: ReactNode
}

export default function Header(props: HeaderProps) {
  const { t } = useTranslation()
  const showSidebar = useUIStore((s) => s.showSidebar)
  const setShowSidebar = useUIStore((s) => s.setShowSidebar)

  const isSmallScreen = useIsSmallScreen()
  const { needRoomForMacWindowControls } = useNeedRoomForWinControls()

  const { session: currentSession, leftActions, copilotSelector } = props

  // 会话名称自动生成
  useEffect(() => {
    const autoGenerateTitle = settingActions.getAutoGenerateTitle()
    if (!autoGenerateTitle) {
      return
    }

    const hasGeneratingMessage = currentSession.messages.some((msg) => msg.generating)

    if (hasGeneratingMessage || currentSession.messages.length < 2) {
      return
    }

    if (currentSession.name === 'Untitled') {
      scheduleGenerateNameAndThreadName(currentSession.id)
    } else if (!currentSession.threadName) {
      scheduleGenerateThreadName(currentSession.id)
    }
  }, [currentSession])

  const editCurrentSession = () => {
    if (!currentSession) {
      return
    }
    NiceModal.show('session-settings', { session: currentSession })
  }

  return (
    <>
      <Flex
        h={54}
        align="center"
        px="sm"
        gap="sm"
        className={clsx('flex-none title-bar')}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* 左侧：侧边栏按钮 + 额外操作（PDF 按钮） */}
        <Flex align="center" gap="xs" style={{ flexShrink: 0 }}>
          {(!showSidebar || isSmallScreen) && (
            <ActionIcon
              className="controls"
              variant="subtle"
              size={isSmallScreen ? 24 : 20}
              color={isSmallScreen ? 'chatbox-secondary' : 'chatbox-tertiary'}
              onClick={() => setShowSidebar(!showSidebar)}
            >
              {isSmallScreen ? <IconMenu2 /> : <IconLayoutSidebarLeftExpand />}
            </ActionIcon>
          )}
          {leftActions}
        </Flex>

        {/* 中间左：Session Name 区域（flex:1 但有 maxWidth 限制）*/}
        <Flex
          align="center"
          gap="xxs"
          style={{
            flex: '1 1 0',
            minWidth: 0,
            maxWidth: isSmallScreen ? '50%' : '35%',
          }}
        >
          <Title order={4} fz={!isSmallScreen ? 20 : undefined} lineClamp={1} style={{ minWidth: 0 }}>
            {currentSession?.name}
          </Title>

          <Tooltip label={t('Customize settings for the current conversation')}>
            <ActionIcon
              className="controls"
              variant="subtle"
              color="chatbox-tertiary"
              size={20}
              onClick={() => {
                editCurrentSession()
              }}
            >
              <ScalableIcon icon={IconPencil} size={20} />
            </ActionIcon>
          </Tooltip>
        </Flex>

        {/* 中间：搭档选择器（自然居于 PDF 区域和聊天区域之间）*/}
        {copilotSelector && (
          <Flex align="center" style={{ flexShrink: 0 }}>
            {copilotSelector}
          </Flex>
        )}

        {/* 右侧：用 marginLeft:auto 推到右边，容器只包裹内容不撑满空白，保留拖拽区域 */}
        <Flex align="center" gap="sm" style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <Toolbar sessionId={currentSession.id} />
          <WindowControls className={needRoomForMacWindowControls ? 'ml-2' : 'ml-0'} />
        </Flex>
      </Flex>

      <Divider />
    </>
  )
}
