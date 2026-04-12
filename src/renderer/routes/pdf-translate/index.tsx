import { Button, Card, Flex, Progress, Select, Slider, Group, Text, ActionIcon, Switch, Box, TextInput } from '@mantine/core'
import { useCallback, useEffect, useState, useMemo } from 'react'
import { IconFilePlus, IconPlayerPlay, IconEye, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconMessageCircle } from '@tabler/icons-react'
import { createFileRoute, useSearch } from '@tanstack/react-router'
import ModelSelector from '@/components/ModelSelector'
import { useProviders } from '@/hooks/useProviders'
import { useUIStore } from '@/stores/uiStore'
import useNeedRoomForWinControls from '@/hooks/useNeedRoomForWinControls'
import WindowControls from '@/components/layout/WindowControls'
import { getSession, updateSession } from '@/stores/chatStore'
import queryClient from '@/stores/queryClient'

// 从 URL 获取 sessionId
function usePDFTranslateParams() {
  return useSearch({ from: '/pdf-translate/' })
}

export function PDFTranslatePage() {
  const { sessionId } = usePDFTranslateParams()
  const { providers } = useProviders()
  
  // 侧边栏状态
  const showSidebar = useUIStore((s) => s.showSidebar)
  const setShowSidebar = useUIStore((s) => s.setShowSidebar)
  const { needRoomForMacWindowControls } = useNeedRoomForWinControls()
  
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

  // 从 Session 加载数据
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
          // 清空状态，确保新 session 显示空白
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
          // 强制刷新原文 PDF
          setSourceRefreshKey(newKey)
        } else {
          // 如果没有源文件路径，清空状态
          console.log('[PDF Translate] No sourceFilePath, clearing file state')
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
          // 强制刷新译文 PDF
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
    
    // 清理函数：组件卸载时标记为已卸载
    return () => {
      isMounted = false
    }
  }, [sessionId])

  // 保存数据到 Session - 使用合并策略，保留未提供的字段
  const saveToSession = useCallback(async (data: {
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
      // 先获取当前 session 数据，然后合并
      const currentSession = await getSession(sessionId)
      const currentPdfData = currentSession?.pdfData || {}
      
      // 合并数据：只更新提供的字段，保留其他字段
      const mergedData = {
        ...currentPdfData,
        ...data,
      }
      
      console.log('[PDF Translate] saveToSession - merging data:', { 
        current: currentPdfData, 
        new: data, 
        merged: mergedData 
      })
      
      await updateSession(sessionId, {
        pdfData: mergedData,
      })
    } catch (err) {
      console.error('Failed to save session data:', err)
    }
  }, [sessionId])

  const modelDisplayText = useMemo(() => {
    if (!selectedProvider || !selectedModel) return '选择模型'
    const provider = providers.find(p => p.id === selectedProvider)
    const model = provider?.models?.find(m => m.modelId === selectedModel)
    const modelName = model?.nickname || model?.modelId || selectedModel
    return `${provider?.name || selectedProvider} - ${modelName}`
  }, [selectedProvider, selectedModel, providers])

  const handleModelSelect = useCallback((provider: string, model: string) => {
    setSelectedProvider(provider)
    setSelectedModel(model)
  }, [])

  const getProviderConfig = useCallback((providerId: string) => {
    const provider = providers.find(p => p.id === providerId)
    if (provider) {
      return {
        apiKey: provider.apiKey || provider.defaultSettings?.apiKey,
        baseUrl: provider.apiHost || provider.defaultSettings?.apiHost
      }
    }
    return {}
  }, [providers])

  // 更新 session 名称
  const updateSessionName = useCallback(async (name: string) => {
    if (!sessionId) return
    try {
      await updateSession(sessionId, { name })
    } catch (err) {
      console.error('Failed to update session name:', err)
    }
  }, [sessionId])

  const handleSelectFile = useCallback(async () => {
    try {
      const result = await window.electronAPI.pdf.selectFile()
      if (result) {
        setFilePath(result.path)
        setFileName(result.name)
        setError(null)
        setTranslatedResult(null)
        setTranslatedPath(null)
        // 重置所有状态
        setProgress(0)
        setCurrentPage(0)
        setStatusMessage('')
        // 更新原文 PDF 的刷新 key，强制重新加载
        setSourceRefreshKey(Date.now())
        setTranslatedRefreshKey(prev => prev + 1)
        
        const pageResult = await window.electronAPI.pdf.getPageCount(result.path)
        if (pageResult.success && pageResult.count) {
          setTotalPages(pageResult.count)
        }
        
        // 【关键修复】立即保存 PDF 路径到 session，防止切换 session 后数据丢失
        await saveToSession({
          status: 'idle',
          sourceFilePath: result.path,
          sourceFileName: result.name,
          progress: 0,
          currentPage: 0,
          totalPages: pageResult.count || 0,
        })
        
        // 更新 session 名称为 PDF 文件名（去掉扩展名）
        const pdfName = result.name.replace(/\.pdf$/i, '')
        await updateSessionName(pdfName)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '选择文件失败')
    }
  }, [updateSessionName, saveToSession])

  const handleTranslate = useCallback(async () => {
    if (!filePath || !selectedProvider || !selectedModel) return
    
    // 使用 sessionId 或生成临时 ID
    const translateSessionId = sessionId || `pdf-${Date.now()}`

    setIsTranslating(true)
    setProgress(0)
    setCurrentPage(0)
    setError(null)
    setStatusMessage('正在初始化...')

    // 保存初始状态到 Session
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
        langIn: 'auto',  // 源语言自动检测
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
        // 先清空当前显示
        setTranslatedPath(null)
        
        // 短暂延迟后设置新路径并刷新
        setTimeout(() => {
          const newPath = result.monoPath || result.dualPath || null
          setTranslatedPath(newPath)
          // 使用计数器确保唯一性
          setTranslatedRefreshKey(prev => prev + 1)
        }, 100)
        
        setTranslatedResult({
          monoPath: result.monoPath,
          dualPath: result.dualPath,
        })
        setStatusMessage('翻译完成!')
        setProgress(100)
        
        // 保存完成状态到 Session
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
      
      // 保存错误状态到 Session
      await saveToSession({
        status: 'error',
        error: errorMsg,
      })
    } finally {
      setIsTranslating(false)
    }
  }, [filePath, selectedProvider, selectedModel, langOut, qps, outputType, autoOcr, customPrompt, getProviderConfig, sessionId, fileName, totalPages, saveToSession])

  const handleCancel = useCallback(async () => {
    if (filePath) {
      await window.electronAPI.pdf.cancel(filePath)
    }
    setIsTranslating(false)
    setProgress(0)
    setCurrentPage(0)
    setStatusMessage('已取消')
    
    // 更新 Session 状态为 idle
    if (sessionId) {
      await saveToSession({ status: 'idle' })
    }
  }, [filePath, sessionId, saveToSession])

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
    
    // 清除 Session 中的 PDF 数据
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

  const handleExport = useCallback(async (type: 'mono' | 'dual') => {
    const path = type === 'mono' ? translatedResult?.monoPath : translatedResult?.dualPath
    if (!path) return
    try {
      await window.electronAPI.pdf.export({ sourcePath: path, type })
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败')
    }
  }, [translatedResult])

  // 监听进度更新
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

  const handleClose = useCallback(() => {
    window.history.back()
  }, [])

  const currentTranslatedPath = useMemo(() => {
    if (translatedResult?.monoPath) return translatedResult.monoPath
    if (translatedResult?.dualPath) return translatedResult.dualPath
    return null
  }, [translatedResult])

  // 目标语言选项
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
    <Flex direction="column" h="100%" p="xs" gap="xs">
      {/* 头部 - 添加 title-bar 类支持拖拽 */}
      <Group justify="space-between" className="title-bar">
        <Group gap="sm">
          {/* 侧边栏开关按钮 - 添加 controls 类 */}
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={() => setShowSidebar(!showSidebar)}
            className={`controls ${needRoomForMacWindowControls ? 'pl-20' : ''}`}
          >
            {showSidebar ? <IconLayoutSidebarLeftCollapse size={16} /> : <IconLayoutSidebarLeftExpand size={16} />}
          </ActionIcon>
          <Text size="lg" fw="bold">PDF翻译</Text>
        </Group>
        <Group gap="xs">
          {translatedResult && (
            <Button variant="subtle" size="sm" onClick={handleReset} className="controls">新翻译</Button>
          )}
          {/* 窗口控件 */}
          <WindowControls className="controls" />
        </Group>
      </Group>

      {/* 第一行：均匀分布，自适应宽度 */}
      <Card shadow="sm" padding="sm" radius="md" withBorder>
        <Flex gap="sm" align="center" wrap="wrap">
          {/* PDF选择 - flex自动伸展 */}
          <Button variant="light" size="sm" onClick={handleSelectFile} leftSection={<IconFilePlus size={14} />} style={{ flex: '1 1 100px' }}>
            {fileName || '选择PDF'}
          </Button>
          
          {/* 大模型选择 - flex自动伸展 */}
          <Box style={{ flex: '1 1 120px' }}>
            <ModelSelector onSelect={handleModelSelect} selectedProviderId={selectedProvider} selectedModelId={selectedModel}>
              <Button variant="light" size="sm" style={{ width: '100%' }}>
                {modelDisplayText || '选择模型'}
              </Button>
            </ModelSelector>
          </Box>
          
          {/* 目标语言 - flex自动伸展 */}
          <Select size="sm" value={langOut} onChange={(v) => setLangOut(v || 'zh')}
            data={langOptions}
            style={{ flex: '1 1 60px' }} />
          
          {/* 输出类型 - flex自动伸展 */}
          <Select size="sm" value={outputType} onChange={(v) => setOutputType(v as any)}
            data={[
              { value: 'mono', label: '单语' }, 
              { value: 'dual', label: '双语' }, 
              { value: 'both', label: '双版' }
            ]}
            style={{ flex: '1 1 60px' }}
          />
          
          {/* 翻译提示词 - flex自动伸展 */}
          <TextInput
            size="sm"
            placeholder="提示词(可选)"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.currentTarget.value)}
            style={{ flex: '1 1 100px' }}
            styles={{ input: { minHeight: 24 } }}
          />
          
          {/* OCR开关 */}
          <Switch size="sm" label="OCR" checked={autoOcr} onChange={(e) => setAutoOcr(e.currentTarget.checked)} />
          
          {/* 并发数 - flex自动伸展 */}
          <Box style={{ flex: '1 1 80px' }}>
            <Text size="xs">Q:{qps}</Text>
            <Slider value={qps} onChange={setQps} min={10} max={200} step={10} size="sm" />
          </Box>

          {/* 翻译按钮 - 固定宽度 */}
          <Button size="sm" onClick={isTranslating ? handleCancel : handleTranslate}
            disabled={!filePath || !selectedProvider || !selectedModel} color={isTranslating ? 'red' : 'blue'}
            leftSection={<IconPlayerPlay size={14} />} style={{ minWidth: 60 }}>
            {isTranslating ? '停止' : '翻译'}
          </Button>
        </Flex>
      </Card>

      {/* 进度条 - 始终显示 */}
      <Box>
        <Flex justify="space-between" mb={4}>
          <Text size="sm">{statusMessage || (isTranslating ? '等待...' : '准备就绪')}</Text>
          <Text size="sm">{currentPage}/{totalPages} 页</Text>
        </Flex>
        <Progress value={progress} size="sm" />
        {error && <Text size="sm" c="red" mt={4}>{error}</Text>}
      </Box>

      {/* PDF预览 */}
      <Flex gap="sm" style={{ flex: 1, minHeight: 0 }}>
        <Card shadow="sm" padding="sm" radius="md" withBorder style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Group justify="space-between" mb="xs">
            <Text size="md" fw="bold">原文</Text>
            {filePath && (
              <ActionIcon size="sm" variant="subtle" onClick={() => window.electronAPI.invoke('openLink', `file:///${filePath.replace(/\\/g, '/')}`)}>
                <IconEye size={14} />
              </ActionIcon>
            )}
          </Group>
          <Box style={{ flex: 1, background: '#f5f5f5', borderRadius: 4, overflow: 'hidden', minHeight: 200 }}>
            {filePath ? (
              <iframe 
                key={`source-${sourceRefreshKey}`} 
                src={`file:///${filePath.replace(/\\/g, '/')}?t=${sourceRefreshKey}`} 
                style={{ width: '100%', height: '100%', border: 'none' }} 
                onLoad={() => console.log('[PDF Translate] Source iframe loaded:', filePath)}
                onError={(e) => console.error('[PDF Translate] Source iframe error:', e)}
              />
            ) : (
              <Flex align="center" justify="center" h="100%"><Text size="sm" c="dimmed">请选择PDF文件</Text></Flex>
            )}
          </Box>
        </Card>

        <Card shadow="sm" padding="sm" radius="md" withBorder style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Group justify="space-between" mb="xs">
            <Text size="md" fw="bold">译文</Text>
            {translatedResult && <Text size="sm" c="green">✓ 完成</Text>}
          </Group>
          <Box style={{ flex: 1, background: '#f5f5f5', borderRadius: 4, overflow: 'hidden', minHeight: 200 }}>
            {isTranslating ? (
              <Flex align="center" justify="center" h="100%" direction="column">
                <Progress value={progress} size="lg" style={{ width: '60%' }} mb="md" />
                <Text size="md" c="dimmed">{statusMessage || '正在翻译...'}</Text>
              </Flex>
            ) : translatedPath ? (
              <>
                <iframe key={translatedRefreshKey} src={`file:///${translatedPath.replace(/\\/g, '/')}?t=${translatedRefreshKey}`} style={{ width: '100%', height: '100%', border: 'none' }} />
                <ActionIcon size="sm" variant="filled" style={{ position: 'absolute', top: 8, right: 8 }}
                  onClick={() => window.electronAPI.invoke('openLink', `file:///${translatedPath.replace(/\\/g, '/')}?t=${translatedRefreshKey}`)}>
                  <IconEye size={14} />
                </ActionIcon>
              </>
            ) : (
              <Flex align="center" justify="center" h="100%"><Text size="sm" c="dimmed">等待翻译</Text></Flex>
            )}
          </Box>
        </Card>
      </Flex>

      {/* 导出 */}
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

export const Route = createFileRoute('/pdf-translate/')({
  component: PDFTranslatePage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      sessionId: search.sessionId as string | undefined,
    }
  },
})
