import {
  Button,
  Card,
  Flex,
  Progress,
  Select,
  Slider,
  Group,
  Text,
  ActionIcon,
  Switch,
  Box,
  TextInput,
} from '@mantine/core'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconFilePlus, IconPlayerPlay, IconEye } from '@tabler/icons-react'
import { toast } from 'sonner'
import ModelSelector from '@/components/ModelSelector'
import { useProviders } from '@/hooks/useProviders'
import { getSession, updateSession } from '@/stores/chatStore'
import queryClient from '@/stores/queryClient'
import { PDFDualViewCard } from './PDFDualViewCard'
import { PDFProgressBar } from './PDFProgressBar'

/**
 * PDF 翻译 Tab 内容组件
 *
 * 从原 src/renderer/routes/pdf-translate/index.tsx 抽出，行为保持完全一致：
 * - 顶部工具栏：选择 PDF / 模型 / 目标语言 / 输出类型 / 提示词 / OCR / QPS / 翻译按钮
 * - 进度条
 * - 双卡片：原文 + 译文
 * - 底部：导出单语 / 导出双语 PDF
 * - Session 持久化（progress / translatedPath / 设置 等）
 */

interface Props {
  sessionId?: string
}

export function PDFTranslateTab({ sessionId }: Props) {
  const { providers } = useProviders()

  // ============ 状态 ============
  const [filePath, setFilePath] = useState('')
  const [fileName, setFileName] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [selectedModel, setSelectedModel] = useState<string>('')

  // 语言：只设置目标语言，源语言自动检测
  const [langOut, setLangOut] = useState('zh')
  const [qps, setQps] = useState(50)

  // 默认设置：单语、OCR
  const [outputType, setOutputType] = useState<'mono' | 'dual' | 'both'>('mono')
  const [autoOcr, setAutoOcr] = useState(true)

  const [isTranslating, setIsTranslating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [translatedResult, setTranslatedResult] = useState<{
    monoPath?: string
    dualPath?: string
  } | null>(null)

  // 用于强制刷新 PDF iframe 的计数器
  const [sourceRefreshKey, setSourceRefreshKey] = useState(0)
  const [translatedRefreshKey, setTranslatedRefreshKey] = useState(0)
  const [translatedPath, setTranslatedPath] = useState<string | null>(null)

  // 翻译提示词（可选）
  const [customPrompt, setCustomPrompt] = useState('')

  // ============ 从 Session 加载数据 ============
  useEffect(() => {
    let isMounted = true

    const loadSessionData = async () => {
      console.log('[PDF Translate] loadSessionData called, sessionId:', sessionId)

      if (!sessionId) {
        console.log('[PDF Translate] No sessionId, returning')
        return
      }

      try {
        // 强制刷新缓存 - 完全重置该查询
        await queryClient.resetQueries({ queryKey: ['chat-session', sessionId] })
        const session = await getSession(sessionId)
        console.log('[PDF Translate] Session loaded:', session?.id, 'pdfData:', session?.pdfData)

        if (!isMounted) {
          console.log('[PDF Translate] Component unmounted, aborting')
          return
        }

        // 如果没有 pdfData，说明是新 session，直接返回空状态
        if (!session?.pdfData) {
          console.log('[PDF Translate] No pdfData in session, clearing state')
          setFilePath('')
          setFileName('')
          setTranslatedResult(null)
          setTranslatedPath(null)
          setProgress(0)
          setCurrentPage(0)
          setTotalPages(0)
          setStatusMessage('')
          setError(null)
          return
        }

        const pdfData = session.pdfData
        console.log('[PDF Translate] sourceFilePath:', pdfData.sourceFilePath)

        // 恢复文件信息 - 使用时间戳确保 iframe 强制重新加载
        if (pdfData.sourceFilePath) {
          const newKey = Date.now()
          console.log('[PDF Translate] Setting filePath:', pdfData.sourceFilePath, 'refreshKey:', newKey)
          setFilePath(pdfData.sourceFilePath)
          setFileName(pdfData.sourceFileName || '')
          setSourceRefreshKey(newKey)
        } else {
          setFilePath('')
          setFileName('')
        }

        // 恢复翻译设置
        if (pdfData.langOut) setLangOut(pdfData.langOut)
        if (pdfData.outputType) setOutputType(pdfData.outputType)
        if (pdfData.qps) setQps(pdfData.qps)
        if (pdfData.autoOcr !== undefined) setAutoOcr(pdfData.autoOcr)
        if (pdfData.customPrompt) setCustomPrompt(pdfData.customPrompt)
        if (pdfData.provider) setSelectedProvider(pdfData.provider)
        if (pdfData.model) setSelectedModel(pdfData.model)

        // 恢复翻译结果并刷新译文 PDF
        if (pdfData.translatedMonoPath || pdfData.translatedDualPath) {
          setTranslatedResult({
            monoPath: pdfData.translatedMonoPath,
            dualPath: pdfData.translatedDualPath,
          })
          setTranslatedPath(pdfData.translatedMonoPath || pdfData.translatedDualPath || null)
          setTranslatedRefreshKey(Date.now())
        }

        // 恢复进度
        if (pdfData.progress) setProgress(pdfData.progress)
        if (pdfData.currentPage) setCurrentPage(pdfData.currentPage)
        if (pdfData.totalPages) setTotalPages(pdfData.totalPages)

        // 如果正在翻译中，恢复状态
        if (pdfData.status === 'translating') {
          setIsTranslating(true)
          setStatusMessage('翻译进行中...')
        }
      } catch (err) {
        console.error('Failed to load session data:', err)
      }
    }

    loadSessionData()

    return () => {
      isMounted = false
    }
  }, [sessionId])

  // ============ 保存数据到 Session ============
  const saveToSession = useCallback(
    async (data: {
      status?: 'idle' | 'translating' | 'completed' | 'error'
      progress?: number
      currentPage?: number
      totalPages?: number
      sourceFilePath?: string
      sourceFileName?: string
      langOut?: string
      outputType?: 'mono' | 'dual' | 'both'
      translatedMonoPath?: string
      translatedDualPath?: string
      model?: string
      provider?: string
      customPrompt?: string
      qps?: number
      autoOcr?: boolean
      error?: string
      startedAt?: number
      completedAt?: number
    }) => {
      if (!sessionId) return

      try {
        const currentSession = await getSession(sessionId)
        const currentPdfData = currentSession?.pdfData || {}

        const mergedData = {
          ...currentPdfData,
          ...data,
        }

        console.log('[PDF Translate] saveToSession - merging data:', {
          current: currentPdfData,
          new: data,
          merged: mergedData,
        })

        await updateSession(sessionId, {
          pdfData: mergedData,
        })
      } catch (err) {
        console.error('Failed to save session data:', err)
      }
    },
    [sessionId]
  )

  // ============ 辅助函数 ============
  const modelDisplayText = useMemo(() => {
    if (!selectedProvider || !selectedModel) return '选择模型'
    const provider = providers.find((p) => p.id === selectedProvider)
    const model = provider?.models?.find((m) => m.modelId === selectedModel)
    const modelName = model?.nickname || model?.modelId || selectedModel
    return `${provider?.name || selectedProvider} - ${modelName}`
  }, [selectedProvider, selectedModel, providers])

  const handleModelSelect = useCallback((provider: string, model: string) => {
    setSelectedProvider(provider)
    setSelectedModel(model)
  }, [])

  const getProviderConfig = useCallback(
    (providerId: string) => {
      const provider = providers.find((p) => p.id === providerId)
      if (provider) {
        return {
          apiKey: provider.apiKey || provider.defaultSettings?.apiKey,
          baseUrl: provider.apiHost || provider.defaultSettings?.apiHost,
        }
      }
      return {}
    },
    [providers]
  )

  // 更新 session 名称
  const updateSessionName = useCallback(
    async (name: string) => {
      if (!sessionId) return
      try {
        await updateSession(sessionId, { name })
      } catch (err) {
        console.error('Failed to update session name:', err)
      }
    },
    [sessionId]
  )

  // ============ 文件选择 ============
  const handleSelectFile = useCallback(async () => {
    try {
      const result = await window.electronAPI.pdf.selectFile()
      if (result) {
        setFilePath(result.path)
        setFileName(result.name)
        setError(null)
        setTranslatedResult(null)
        setTranslatedPath(null)
        setProgress(0)
        setCurrentPage(0)
        setStatusMessage('')
        setSourceRefreshKey(Date.now())
        setTranslatedRefreshKey((prev) => prev + 1)

        const pageResult = await window.electronAPI.pdf.getPageCount(result.path)
        if (pageResult.success && pageResult.count) {
          setTotalPages(pageResult.count)
        }

        await saveToSession({
          status: 'idle',
          sourceFilePath: result.path,
          sourceFileName: result.name,
          progress: 0,
          currentPage: 0,
          totalPages: pageResult.count || 0,
        })

        const pdfName = result.name.replace(/\.pdf$/i, '')
        await updateSessionName(pdfName)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '选择文件失败')
    }
  }, [updateSessionName, saveToSession])

  // ============ 翻译 ============
  const handleTranslate = useCallback(async () => {
    if (!filePath || !selectedProvider || !selectedModel) return

    const translateSessionId = sessionId || `pdf-${Date.now()}`

    setIsTranslating(true)
    setProgress(0)
    setCurrentPage(0)
    setError(null)
    setStatusMessage('正在初始化...')

    await saveToSession({
      status: 'translating',
      sourceFilePath: filePath,
      sourceFileName: fileName,
      langOut,
      outputType,
      qps,
      autoOcr,
      customPrompt,
      model: selectedModel,
      provider: selectedProvider,
      progress: 0,
      currentPage: 0,
      totalPages,
      startedAt: Date.now(),
    })

    try {
      const config = getProviderConfig(selectedProvider)
      const apiKey = config.apiKey || ''
      const baseUrl = config.baseUrl || 'https://api.siliconflow.cn/v1'

      const result = await window.electronAPI.pdf.translate({
        sessionId: translateSessionId,
        filePath,
        model: selectedModel,
        langIn: 'auto',
        langOut,
        apiKey,
        baseUrl,
        qps,
        outputType,
        autoOcr,
        maxPagesPerPart: 50,
        customPrompt: customPrompt || undefined,
      })

      if (result.success) {
        setTranslatedPath(null)

        setTimeout(() => {
          const newPath = result.monoPath || result.dualPath || null
          setTranslatedPath(newPath)
          setTranslatedRefreshKey((prev) => prev + 1)
        }, 100)

        setTranslatedResult({
          monoPath: result.monoPath,
          dualPath: result.dualPath,
        })
        setStatusMessage('翻译完成!')
        setProgress(100)

        await saveToSession({
          status: 'completed',
          progress: 100,
          translatedMonoPath: result.monoPath,
          translatedDualPath: result.dualPath,
          completedAt: Date.now(),
        })
      } else {
        throw new Error(result.error || '翻译失败')
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '翻译失败'
      setError(errorMsg)

      await saveToSession({
        status: 'error',
        error: errorMsg,
      })
    } finally {
      setIsTranslating(false)
    }
  }, [
    filePath,
    selectedProvider,
    selectedModel,
    langOut,
    qps,
    outputType,
    autoOcr,
    customPrompt,
    getProviderConfig,
    sessionId,
    fileName,
    totalPages,
    saveToSession,
  ])

  // ============ 取消翻译 ============
  const handleCancel = useCallback(async () => {
    if (filePath) {
      await window.electronAPI.pdf.cancel(filePath)
    }
    setIsTranslating(false)
    setProgress(0)
    setCurrentPage(0)
    setStatusMessage('已取消')

    if (sessionId) {
      await saveToSession({ status: 'idle' })
    }
  }, [filePath, sessionId, saveToSession])

  // ============ 重置 ============
  const handleReset = useCallback(async () => {
    setFilePath('')
    setFileName('')
    setSelectedProvider('')
    setSelectedModel('')
    setTranslatedResult(null)
    setTranslatedPath(null)
    setProgress(0)
    setCurrentPage(0)
    setStatusMessage('')
    setError(null)

    if (sessionId) {
      await saveToSession({
        status: 'idle',
        sourceFilePath: undefined,
        sourceFileName: undefined,
        translatedMonoPath: undefined,
        translatedDualPath: undefined,
        progress: 0,
        currentPage: 0,
        totalPages: 0,
        error: undefined,
      })
    }
  }, [sessionId, saveToSession])

  // ============ 导出 ============
  const handleExport = useCallback(
    async (type: 'mono' | 'dual') => {
      const path = type === 'mono' ? translatedResult?.monoPath : translatedResult?.dualPath
      if (!path) return
      try {
        await window.electronAPI.pdf.export({ sourcePath: path, type })
      } catch (err) {
        setError(err instanceof Error ? err.message : '导出失败')
      }
    },
    [translatedResult]
  )

  // ============ 监听进度更新 ============
  useEffect(() => {
    const unsubscribe = window.electronAPI.pdf.onProgress((progressData) => {
      console.log('Progress received:', progressData)
      setProgress(progressData.overallProgress || 0)
      setCurrentPage(progressData.stageCurrent || 0)
      setTotalPages(progressData.stageTotal || 0)
      setStatusMessage(progressData.message || '翻译中...')
    })
    return () => unsubscribe()
  }, [])

  // ============ 目标语言选项 ============
  const langOptions = [
    { value: 'zh', label: '中文' },
    { value: 'en', label: 'English' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
    { value: 'ru', label: 'Русский' },
    { value: 'es', label: 'Español' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
    { value: 'ar', label: 'العربية' },
  ]

  return (
    <Flex direction="column" h="100%" gap="xs">
      {/* 顶部工具栏 */}
      <Card shadow="sm" padding="sm" radius="md" withBorder>
        <Flex gap="sm" align="center" wrap="wrap">
          <Button
            variant="light"
            size="sm"
            onClick={handleSelectFile}
            leftSection={<IconFilePlus size={14} />}
            style={{ flex: '1 1 100px' }}
          >
            {fileName || '选择PDF'}
          </Button>

          <Box style={{ flex: '1 1 120px' }}>
            <ModelSelector
              onSelect={handleModelSelect}
              selectedProviderId={selectedProvider}
              selectedModelId={selectedModel}
            >
              <Button variant="light" size="sm" style={{ width: '100%' }}>
                {modelDisplayText || '选择模型'}
              </Button>
            </ModelSelector>
          </Box>

          <Select
            size="sm"
            value={langOut}
            onChange={(v) => setLangOut(v || 'zh')}
            data={langOptions}
            style={{ flex: '1 1 60px' }}
          />

          <Select
            size="sm"
            value={outputType}
            onChange={(v) => setOutputType(v as 'mono' | 'dual' | 'both')}
            data={[
              { value: 'mono', label: '单语' },
              { value: 'dual', label: '双语' },
              { value: 'both', label: '双版' },
            ]}
            style={{ flex: '1 1 60px' }}
          />

          <TextInput
            size="sm"
            placeholder="提示词(可选)"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.currentTarget.value)}
            style={{ flex: '1 1 100px' }}
            styles={{ input: { minHeight: 24 } }}
          />

          <Switch
            size="sm"
            label="OCR"
            checked={autoOcr}
            onChange={(e) => setAutoOcr(e.currentTarget.checked)}
          />

          <Box style={{ flex: '1 1 80px' }}>
            <Text size="xs">Q:{qps}</Text>
            <Slider value={qps} onChange={setQps} min={10} max={200} step={10} size="sm" />
          </Box>

          <Button
            size="sm"
            onClick={isTranslating ? handleCancel : handleTranslate}
            disabled={!filePath || !selectedProvider || !selectedModel}
            color={isTranslating ? 'red' : 'blue'}
            leftSection={<IconPlayerPlay size={14} />}
            style={{ minWidth: 60 }}
          >
            {isTranslating ? '停止' : '翻译'}
          </Button>
        </Flex>
      </Card>

      {/* 进度条 */}
      <PDFProgressBar
        statusText={statusMessage}
        currentPage={currentPage}
        totalPages={totalPages}
        progress={progress}
        error={error}
      />

      {/* 双卡片 */}
      <PDFDualViewCard
        leftTitle="原文"
        leftPath={filePath}
        leftRefreshKey={sourceRefreshKey}
        leftPlaceholder="请选择PDF文件"
        leftActions={
          filePath ? (
            <ActionIcon
              size="sm"
              variant="subtle"
              onClick={() =>
                window.electronAPI.invoke('openLink', `file:///${filePath.replace(/\\/g, '/')}`)
              }
              title="在新窗口打开"
            >
              <IconEye size={14} />
            </ActionIcon>
          ) : undefined
        }
        rightTitle="译文"
        rightPath={translatedPath ?? undefined}
        rightRefreshKey={translatedRefreshKey}
        rightStatus={isTranslating ? 'processing' : translatedPath ? 'completed' : 'idle'}
        rightProgress={progress}
        rightStatusText={statusMessage}
        rightPlaceholder="等待翻译"
        rightActions={
          translatedResult ? (
            <Text size="sm" c="green">
              ✓ 完成
            </Text>
          ) : undefined
        }
      />

      {/* 导出按钮 */}
      {translatedResult && (
        <Box>
          <Group justify="center" gap="md">
            {translatedResult.monoPath && (
              <Button size="md" variant="light" onClick={() => handleExport('mono')}>
                导出单语PDF
              </Button>
            )}
            {translatedResult.dualPath && (
              <Button size="md" variant="light" onClick={() => handleExport('dual')}>
                导出双语PDF
              </Button>
            )}
          </Group>
          <Text size="xs" c="dimmed" mt="xs" ta="center">
            输出路径: {translatedResult.monoPath || translatedResult.dualPath}
          </Text>
        </Box>
      )}
    </Flex>
  )
}