import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Alert, Button, Stack, Text } from '@mantine/core'
import { IconAlertCircle, IconSettings } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { ScalableIcon } from '@/components/common/ScalableIcon'
import { navigateToSettings } from '@/modals/Settings'
import platform from '@/platform'

interface FileParseErrorProps {
  errorCode: string
  fileName?: string
}

/**
 * 将技术错误码映射为用户可理解的中文提示
 * 覆盖桌面端和移动端所有可能的解析失败场景
 */
function getHumanReadableError(errorCode: string, t: (key: string) => string): {
  title: string
  detail: string
  action?: 'settings' | 'retry' | 'cloud' | 'none'
} {
  const raw = errorCode || ''

  // ============ 1. 解析器未配置 ============
  if (raw === 'document_parser_not_configured') {
    return {
      title: '文档解析功能未开启',
      detail: '当前未配置任何文档解析服务。请在设置中启用本机解析或云解析服务来解析PDF、Word等文档。',
      action: 'settings',
    }
  }

  // ============ 2. 移动端 PDF 解析失败 ============
  if (raw.startsWith('mobile_pdf_parsing_failed')) {
    const inner = raw.replace('mobile_pdf_parsing_failed:', '').trim()

    // 2a. pdf.js 库加载失败
    if (inner.includes('PDF解析库加载失败') || inner.includes('not loaded correctly')) {
      return {
        title: 'PDF解析引擎加载失败',
        detail: 'PDF解析组件未能正确加载，可能是应用打包时缺少必要的库文件。建议尝试使用云解析或重新安装应用。',
        action: 'cloud',
      }
    }

    // 2b. 文件读取失败
    if (inner.includes('文件读取失败')) {
      return {
        title: '文件读取失败',
        detail: `无法读取PDF文件内容：${inner}。请确认文件未损坏且存储权限已授予。`,
        action: 'retry',
      }
    }

    // 2c. 文件为空
    if (inner.includes('PDF文件为空')) {
      return {
        title: 'PDF文件为空',
        detail: '选择的PDF文件大小为0或内容为空，请确认文件完整性后重试。',
        action: 'retry',
      }
    }

    // 2d. PDF格式错误
    if (inner.includes('PDF文件格式错误') || inner.includes('无法加载PDF文件')) {
      return {
        title: 'PDF格式无效',
        detail: `PDF文件格式无法识别：${inner}。文件可能已损坏或不是有效的PDF格式。`,
        action: 'retry',
      }
    }

    // 2e. 文本提取失败（扫描版PDF）
    if (inner.includes('PDF文本提取失败') || inner.includes('扫描版')) {
      return {
        title: 'PDF文本提取失败',
        detail: '该PDF可能是扫描版或纯图片格式，本机解析无法提取其中的文字。建议使用支持OCR的云解析服务。',
        action: 'cloud',
      }
    }

    // 2f. Worker 加载失败
    if (inner.includes('Worker')) {
      return {
        title: 'PDF解析Worker加载失败',
        detail: 'PDF解析的后台工作线程未能启动。这在移动端WebView中偶有发生，建议重试或使用云解析。',
        action: 'retry',
      }
    }

    // 2g. 网络问题
    if (inner.includes('网络') || inner.includes('Failed to fetch')) {
      return {
        title: '网络连接异常',
        detail: 'PDF解析过程中网络连接中断，请检查网络连接后重试。使用本机解析可避免此问题。',
        action: 'retry',
      }
    }

    // 2h. 泛用移动端PDF解析失败
    return {
      title: 'PDF解析失败',
      detail: `移动端PDF解析出错：${inner}。可尝试以下解决方案：\n1. 检查文件是否完整\n2. 重试解析\n3. 切换到云解析服务`,
      action: 'retry',
    }
  }

  // ============ 3. ChatboxAI 云解析失败 ============
  if (raw === 'chatbox_ai_parser_failed') {
    return {
      title: '云解析服务异常',
      detail: 'ChatboxAI云解析服务暂时不可用，请稍后再试。您也可以切换到本机解析（移动端支持PDF本地解析）。',
      action: 'retry',
    }
  }

  // ============ 4. MinerU 相关错误 ============
  if (raw === 'mineru_api_token_required') {
    return {
      title: 'MinerU API密钥未配置',
      detail: '使用MinerU解析需要在设置中配置有效的API Token。请在设置页面中填写您的MinerU API密钥。',
      action: 'settings',
    }
  }
  if (raw === 'third_party_parser_not_supported_in_chat') {
    return {
      title: '第三方解析器不支持',
      detail: '当前平台不支持MinerU第三方解析器。MinerU仅支持桌面端使用，移动端请使用本机解析或ChatboxAI云解析。',
      action: 'settings',
    }
  }
  if (raw === 'third_party_parser_failed') {
    return {
      title: '第三方解析服务异常',
      detail: 'MinerU解析服务请求失败。请检查API Token是否正确，或切换到其他解析方式。',
      action: 'settings',
    }
  }

  // ============ 5. 桌面端本机解析失败（officeparser） ============
  if (raw.includes('officeparser') && raw.includes('解析失败')) {
    return {
      title: '文档解析失败',
      detail: `本机文档解析引擎处理失败。${raw.includes('PDF') ? 'PDF文件可能已损坏或使用了不兼容的格式。' : '请确认文件未损坏。'}`,
      action: 'retry',
    }
  }

  // ============ 6. pdf-parse 解析失败（桌面端pdf回退方案） ============
  if (raw.includes('pdf-parse') && raw.includes('解析失败')) {
    return {
      title: 'PDF解析失败',
      detail: '本机PDF解析引擎处理失败，文件可能已损坏或格式不受支持。可尝试使用云解析服务。',
      action: 'cloud',
    }
  }

  // ============ 7. 未知解析错误（含pdf-parse加载失败） ============
  if (raw.includes('无法加载 pdf-parse') || raw.includes('pdf-parse')) {
    return {
      title: 'PDF解析组件加载失败',
      detail: 'PDF解析依赖库未能正确加载，可能是应用打包问题。建议重新安装或使用云解析。',
      action: 'cloud',
    }
  }

  // ============ 8. 泛用兜底 ============
  // 如果错误信息已经是中文，直接显示；否则给出通用建议
  const hasChinese = /[\u4e00-\u9fff]/.test(raw)
  if (hasChinese) {
    return {
      title: '文件解析失败',
      detail: raw,
      action: platform.type === 'mobile' ? 'cloud' : 'retry',
    }
  }

  return {
    title: '文件解析失败',
    detail: `解析过程中遇到错误：${raw || '未知错误'}\n\n建议尝试：\n• 重新选择文件\n• 检查文件是否损坏\n• 在设置中切换解析方式`,
    action: 'retry',
  }
}

const FileParseError = NiceModal.create(({ errorCode, fileName }: FileParseErrorProps) => {
  const modal = useModal()
  const { t } = useTranslation()

  const onClose = () => {
    modal.resolve()
    modal.hide()
  }

  const { title, detail, action } = getHumanReadableError(errorCode, t)

  const handleSettings = () => {
    onClose()
    // Navigate directly to document parser settings on all platforms
    navigateToSettings('/document-parser')
  }

  return (
    <AdaptiveModal opened={modal.visible} onClose={onClose} size="md" centered title={title}>
      <Stack gap="md">
        {fileName && (
          <Text size="sm" c="chatbox-secondary">
            {t('File')}: {fileName}
          </Text>
        )}

        <Alert icon={<ScalableIcon size={20} icon={IconAlertCircle} />} color="orange" variant="light">
          <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
            {detail}
          </Text>
        </Alert>

        <AdaptiveModal.Actions>
          {action && action !== 'retry' && (
            <Button variant="light" leftSection={<ScalableIcon size={16} icon={IconSettings} />} onClick={handleSettings}>
              {action === 'cloud' ? '切换到云解析' : '打开设置'}
            </Button>
          )}
          <AdaptiveModal.CloseButton onClick={onClose} />
        </AdaptiveModal.Actions>
      </Stack>
    </AdaptiveModal>
  )
})

export default FileParseError