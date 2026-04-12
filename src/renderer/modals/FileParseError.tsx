import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Alert, Stack, Text } from '@mantine/core'
import { ChatboxAIAPIError } from '@shared/models/errors'
import { IconAlertCircle } from '@tabler/icons-react'
import { Trans, useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import LinkTargetBlank from '@/components/common/Link'
import { ScalableIcon } from '@/components/common/ScalableIcon'
import { navigateToSettings } from '@/modals/Settings'
import { trackingEvent } from '@/packages/event'
import platform from '@/platform'

interface FileParseErrorProps {
  errorCode: string
  fileName?: string
}

const FileParseError = NiceModal.create(({ errorCode, fileName }: FileParseErrorProps) => {
  const modal = useModal()
  const { t } = useTranslation()

  const onClose = () => {
    modal.resolve()
    modal.hide()
  }

  // 始终直接显示原始错误信息，不使用 i18n 翻译和链接
  const renderErrorTips = () => {
    return <Text>{errorCode || t('Failed to parse file. Please try again or use a different file format.')}</Text>
  }

  return (
    <AdaptiveModal opened={modal.visible} onClose={onClose} size="md" centered title={t('File Processing Error')}>
      <Stack gap="md">
        {fileName && (
          <Text size="sm" c="chatbox-secondary">
            {t('File')}: {fileName}
          </Text>
        )}

        <Alert icon={<ScalableIcon size={20} icon={IconAlertCircle} />} color="orange" variant="light">
          {renderErrorTips()}
        </Alert>

        <AdaptiveModal.Actions>
          <AdaptiveModal.CloseButton onClick={onClose} />
        </AdaptiveModal.Actions>
      </Stack>
    </AdaptiveModal>
  )
})

export default FileParseError
