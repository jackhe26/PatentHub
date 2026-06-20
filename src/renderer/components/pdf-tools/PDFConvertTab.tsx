import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Flex,
  Group,
  PasswordInput,
  Select,
  Switch,
  Text,
  Tooltip,
} from '@mantine/core'
import {
  IconFilePlus,
  IconPlayerPlay,
  IconEye,
  IconDownload,
  IconRefresh,
  IconCode,
  IconFileText,
  IconPrinter,
} from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  PDF_CONVERT_SERVICES,
  getServiceMeta,
} from '@shared/pdf-convert-services'
import { PDFDualViewCard } from './PDFDualViewCard'
import { PDFProgressBar } from './PDFProgressBar'

type PDFType = 'scanned' | 'digital'

export function PDFConvertTab() {
  const [filePath, setFilePath] = useState('')
  const [fileName, setFileName] = useState('')
  const [serviceId, setServiceId] = useState<string>('mineru-office')
  const [apiKey, setApiKey] = useState('')
  const [rebuildMode, setRebuildMode] = useState<'auto' | 'json' | 'markdown'>('auto')
  const [rememberKey, setRememberKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'failed'>('idle')
  const [connectionError, setConnectionError] = useState('')
  const [isConverting, setIsConverting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resultPath, setResultPath] = useState<string | null>(null)
  const [pdfType, setPdfType] = useState<PDFType | null>(null)
  const [debugZipPath, setDebugZipPath] = useState<string | null>(null)
  const [outputDocxPath, setOutputDocxPath] = useState<string | null>(null)
  const [outputHtmlPath, setOutputHtmlPath] = useState<string | null>(null)
  const [sourceRefreshKey, setSourceRefreshKey] = useState(0)
  const [resultRefreshKey, setResultRefreshKey] = useState(0)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [rightMode, setRightMode] = useState<'pdf' | 'html'>('pdf')
  const [previewFormat, setPreviewFormat] = useState<string>('')

  const currentService = getServiceMeta(serviceId)

  // 读取全局配置
  useEffect(() => {
    let cancelled = false
    const loadGlobalConfig = async () => {
      try {
        const cfg = await window.electronAPI.getPDFConvertGlobalConfig?.(serviceId)
        if (cancelled) return
        if (cfg?.apiKey) {
          setApiKey(cfg.apiKey)
          setRememberKey(true)
        } else {
          setRememberKey(false)
        }
        setConnectionStatus('idle')
        setConnectionError('')
      } catch (err) {
        console.warn('[PDFConvert] 读取全局配置失败:', err)
      }
    }
    loadGlobalConfig()
    return () => { cancelled = true }
  }, [serviceId])

  // 监听进度
  useEffect(() => {
    const unsubscribe = window.electronAPI.onPDFConvertProgress?.((data: any) => {
      setProgress(data.progress ?? 0)
      setStatusMessage(data.message ?? '处理中...')
    })
    return () => unsubscribe?.()
  }, [])

  // 从 ZIP 生成 HTML 预览的通用函数
  const tryRebuildHtml = useCallback((zipPath: string | null) => {
    if (!zipPath) return
    window.electronAPI.invoke('pdf-convert:build-html', { zipPath })
      .then((r: any) => {
        if (r?.success && r.html) {
          setPreviewHtml(r.html)
          setRightMode('html')
          setPreviewFormat(r.format ?? 'unknown')
          setResultRefreshKey(Date.now())
          toast.success(`HTML 预览生成成功 (${r.pageCount} 页, ${r.format})`)
        } else {
          // v8.0: 显式提示失败原因，便于打包后诊断
          const errMsg = r?.error || '未知错误'
          console.error('[PDFConvertTab] build-html failed:', errMsg, r)
          toast.error('生成 HTML 失败: ' + errMsg)
        }
      })
      .catch((e: any) => {
        console.error('[PDFConvertTab] build-html exception:', e)
        toast.error('生成 HTML 失败: ' + (e?.message || String(e)))
      })
  }, [])

  // 选择文件
  const handleSelectFile = useCallback(async () => {
    try {
      const result = await window.electronAPI.pdf.selectFile()
      if (result) {
        setFilePath(result.path)
        setFileName(result.name)
        setError(null)
        setResultPath(null)
        setPdfType(null)
        setDebugZipPath(null)
        setOutputDocxPath(null)
        setOutputHtmlPath(null)
        setPreviewHtml(null)
        setRightMode('pdf')
        setProgress(0)
        setStatusMessage('')
        setSourceRefreshKey(Date.now())
        setResultRefreshKey((k) => k + 1)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '选择文件失败')
    }
  }, [])

  // 测试连接
  const handleTestConnection = useCallback(async () => {
    if (!apiKey.trim()) { toast.error('请先填写 API Key'); return }
    setTesting(true)
    setConnectionStatus('idle')
    setConnectionError('')
    try {
      const result = await window.electronAPI.testPDFConnection?.({ service: serviceId, apiKey: apiKey.trim() })
      if (result?.success) { setConnectionStatus('success'); toast.success('连接成功') }
      else { setConnectionStatus('failed'); setConnectionError(result?.error || '连接失败') }
    } catch (err) {
      setConnectionStatus('failed')
      setConnectionError(err instanceof Error ? err.message : '测试失败')
    } finally { setTesting(false) }
  }, [serviceId, apiKey])

  // 转换
  const handleConvert = useCallback(async () => {
    if (!filePath) { toast.error('请先选择 PDF'); return }
    if (!apiKey.trim()) { toast.error('请填写 API Key'); return }

    setIsConverting(true)
    setProgress(0)
    setError(null)
    setStatusMessage('初始化任务...')
    setResultPath(null)
    setPdfType(null)
    setDebugZipPath(null)
    setOutputDocxPath(null)
    setOutputHtmlPath(null)
    setPreviewHtml(null)
    setRightMode('pdf')

    try {
      const result = await window.electronAPI.convertPDF({
        service: serviceId,
        filePath,
        apiKey: apiKey.trim(),
        rebuildMode: rebuildMode as any,
      } as any)

      if (result.success && result.outputPath) {
        setResultPath(result.outputPath)
        setPdfType(result.pdfType ?? null)
        setDebugZipPath(result.debugZipPath ?? null)
        setOutputDocxPath((result.outputDocxPath as string | undefined) ?? null)
        setOutputHtmlPath((result.outputHtmlPath as string | undefined) ?? null)
        setResultRefreshKey(Date.now())
        setStatusMessage('转换完成！')
        setProgress(100)

        if (result.pdfType === 'scanned') toast.success('OCR 扫描型 PDF 转换完成！')
        else if (result.pdfType === 'digital') toast.success('数字型 PDF 已处理（原 PDF 已含文本层）')
        else toast.success('PDF 转换完成！')

        // v8.0: MinerU-Office 有 outputHtmlPath → 直接读原始 HTML 渲染 (不走 rebuildHtml)
        if (result.outputHtmlPath) {
          window.electronAPI.invoke('pdf-convert:load-raw-html', { htmlPath: result.outputHtmlPath })
            .then((r: any) => {
              if (r?.success && r.html) {
                setPreviewHtml(r.html)
                setRightMode('html')
                setPreviewFormat('MinerU-Office')
                setResultRefreshKey(Date.now())
                toast.success('已加载 MinerU-Office HTML 预览')
              } else {
                tryRebuildHtml(result.debugZipPath as string | null)
              }
            })
            .catch(() => tryRebuildHtml(result.debugZipPath as string | null))
        } else if (result.debugZipPath) {
          // 普通 MinerU: 用 rebuildHtml 生成预览
          tryRebuildHtml(result.debugZipPath)
        }

        if (result.debugZipPath) {
          console.log(`[PDFConvert] 📦 MinerU ZIP: ${result.debugZipPath}`)
        }

        if (rememberKey) {
          try {
            await window.electronAPI.savePDFConvertGlobalConfig?.({
              service: serviceId,
              config: { apiKey: apiKey.trim() },
            })
          } catch (err) { console.warn('[PDFConvert] 保存全局配置失败:', err) }
        }
      } else {
        throw new Error(result.error || '转换失败')
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '转换失败'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setIsConverting(false)
    }
  }, [filePath, apiKey, serviceId, rememberKey, rebuildMode, tryRebuildHtml])

  // 打开/保存
  const handleOpenInNewWindow = useCallback(() => {
    if (!resultPath) return
    window.electronAPI.invoke('openLink', `file:///${resultPath.replace(/\\/g, '/')}`)
  }, [resultPath])

  const handleSaveAs = useCallback(async () => {
    if (!resultPath) return
    try {
      await window.electronAPI.invoke('pdf:export', { sourcePath: resultPath, type: 'mono' })
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }, [resultPath])

  // HTML 预览
  const handlePreviewHtml = useCallback(async () => {
    if (!debugZipPath) { toast.error('需要 MinerU 的调试 ZIP 才能生成 HTML 预览'); return }
    try {
      const result = await window.electronAPI.invoke('pdf-convert:build-html', { zipPath: debugZipPath })
      if (result?.success && result.html) {
        setPreviewHtml(result.html)
        setRightMode('html')
        setPreviewFormat(result.format ?? 'unknown')
        setResultRefreshKey(Date.now())
        toast.success(`HTML 预览生成成功 (${result.pageCount} 页, ${result.format})`)
      } else {
        throw new Error(result?.error || '生成 HTML 失败')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成 HTML 失败')
    }
  }, [debugZipPath])

  const handleShowPdf = useCallback(() => {
    setRightMode('pdf')
    setResultRefreshKey(Date.now())
  }, [])

  // HTML → PDF
  const handleExportHtmlAsPdf = useCallback(async () => {
    if (!previewHtml) { toast.error('请先生成 HTML 预览'); return }
    try {
      const basePath = resultPath ?? filePath
      const outPath = basePath.replace(/\.pdf$/i, '') + '_fromHTML.pdf'
      const res = await window.electronAPI.invoke('pdf-convert:html-to-pdf', {
        html: previewHtml, outputPath: outPath, format: 'A4',
      })
      if (res?.success) {
        toast.success(`已导出 PDF: ${res.path}`)
        setResultPath(res.path)
        setRightMode('pdf')
        setResultRefreshKey(Date.now())
      } else {
        throw new Error(res?.error || '导出 PDF 失败')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出 PDF 失败')
    }
  }, [previewHtml, resultPath, filePath])

  // 保存 HTML 文件
  const handleSaveHtmlFile = useCallback(async () => {
    if (!previewHtml) { toast.error('请先生成 HTML 预览'); return }
    try {
      const baseName = fileName.replace(/\.pdf$/i, '') || 'reconstructed'
      const res = await window.electronAPI.invoke('pdf-convert:save-html', {
        html: previewHtml, suggestedName: `${baseName}.html`,
      })
      if (res?.success) toast.success(`HTML 已保存到: ${res.path}`)
      else throw new Error(res?.error || '保存 HTML 失败')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存 HTML 失败')
    }
  }, [previewHtml, fileName])

  return (
    <Flex direction="column" h="100%" gap="xs" style={{ minHeight: 0 }}>
      {/* 工具栏 */}
      <Card shadow="sm" padding="xs" radius="md" withBorder>
        <Flex gap="sm" align="center" wrap="wrap">
          <Button variant="light" size="sm" onClick={handleSelectFile} leftSection={<IconFilePlus size={14} />} style={{ flex: '1 1 140px' }}>
            {fileName || '选择扫描 PDF'}
          </Button>
          <Select size="sm" value={serviceId} onChange={(v) => setServiceId(v || 'mineru-office')}
            data={PDF_CONVERT_SERVICES.map((s) => ({ value: s.id, label: s.displayName }))}
            style={{ flex: '1 1 120px' }} allowDeselect={false} />
          <PasswordInput size="sm" placeholder="API Key（必填）" value={apiKey}
            onChange={(e) => { setApiKey(e.currentTarget.value); setConnectionStatus('idle'); setConnectionError('') }}
            style={{ flex: '2 1 220px' }}
            rightSection={
              <Tooltip label={testing ? '测试中...' : '测试连接'}>
                <ActionIcon size="sm" variant="subtle" onClick={handleTestConnection} loading={testing}
                  color={connectionStatus === 'success' ? 'green' : connectionStatus === 'failed' ? 'red' : 'gray'} aria-label="测试连接">
                  <IconRefresh size={14} />
                </ActionIcon>
              </Tooltip>
            } />
          <Select size="sm" value={rebuildMode} onChange={(v) => setRebuildMode((v as any) || 'auto')}
            data={[{ value: 'auto', label: '🎨 智能优先' }, { value: 'markdown', label: '📝 MD 重建' }, { value: 'json', label: '🧩 JSON 重建' }]}
            style={{ flex: '1 1 110px' }} allowDeselect={false} />
          <Button size="sm" onClick={isConverting ? () => undefined : handleConvert}
            disabled={!filePath || !apiKey.trim()} color={isConverting ? 'red' : 'blue'}
            leftSection={<IconPlayerPlay size={14} />} style={{ minWidth: 90 }}>
            {isConverting ? '转换中' : '转换'}
          </Button>
        </Flex>
        <Flex gap="md" align="center" mt="xs" wrap="wrap">
          {currentService && (
            <>
              <Text size="xs" c="dimmed" style={{ flex: 1, minWidth: 200 }}>💡 {currentService.description}</Text>
              <Anchor href={currentService.homepage} target="_blank" size="xs">官网 ↗</Anchor>
            </>
          )}
          <Switch size="xs" label="记住 API Key" checked={rememberKey} onChange={(e) => setRememberKey(e.currentTarget.checked)} />
          {connectionStatus === 'success' && <Text size="xs" c="green">✅ 连接成功</Text>}
          {connectionStatus === 'failed' && <Text size="xs" c="red">❌ {connectionError}</Text>}
        </Flex>
      </Card>

      {/* 进度条 */}
      <PDFProgressBar statusText={statusMessage} progress={progress} error={error} />

      {/* 双卡片预览 */}
      <PDFDualViewCard
        leftTitle="原文（扫描/图片）" leftPath={filePath} leftRefreshKey={sourceRefreshKey}
        leftPlaceholder="请选择要转换的扫描型 PDF"
        rightTitle={rightMode === 'html' ? `HTML 预览 ${previewFormat ? `(${previewFormat})` : ''}` : '转换结果'}
        rightPath={rightMode === 'pdf' ? resultPath ?? undefined : undefined}
        rightHtml={rightMode === 'html' ? previewHtml ?? undefined : undefined}
        rightMode={rightMode} rightRefreshKey={resultRefreshKey}
        rightStatus={isConverting ? 'processing' : resultPath || previewHtml ? 'completed' : 'idle'}
        rightProgress={progress} rightStatusText={statusMessage}
        rightPlaceholder={rightMode === 'html' ? '等待生成 HTML 预览' : '等待转换'}
        rightActions={
          <Group gap="xs" wrap="nowrap">
            {rightMode === 'html' && <Badge size="sm" color="grape" variant="light">HTML 模式</Badge>}
            {rightMode === 'pdf' && pdfType && (
              <Badge size="sm" color={pdfType === 'scanned' ? 'blue' : 'green'} variant="light">
                {pdfType === 'scanned' ? 'OCR 扫描型' : '数字型（含文本）'}
              </Badge>
            )}
            {rightMode === 'pdf' && resultPath && <Text size="sm" c="green">✓ 完成</Text>}
          </Group>
        }
      />

      {/* 底部操作 */}
      {(resultPath || previewHtml) && (
        <Group justify="center" gap="md" wrap="wrap">
          {resultPath && rightMode === 'pdf' && (
            <>
              <Button variant="light" leftSection={<IconEye size={14} />} onClick={handleOpenInNewWindow}>在新窗口打开</Button>
              <Button variant="light" leftSection={<IconDownload size={14} />} onClick={handleSaveAs}>保存为新文件</Button>
            </>
          )}
          {debugZipPath && (
            <Tooltip label="从 MinerU ZIP 生成 HTML 预览（秒开,可在线选中复制）">
              <Button variant="filled" color="grape" leftSection={<IconCode size={14} />} onClick={handlePreviewHtml} disabled={rightMode === 'html'}>
                {rightMode === 'html' ? 'HTML 预览中' : 'HTML 预览 (秒开)'}
              </Button>
            </Tooltip>
          )}
          {rightMode === 'html' && previewHtml && (
            <>
              <Tooltip label="用 Electron printToPDF 走 Chromium 引擎, 质量 100% 等同 Chrome 打印">
                <Button variant="light" color="blue" leftSection={<IconPrinter size={14} />} onClick={handleExportHtmlAsPdf}>导出为 PDF</Button>
              </Tooltip>
              <Tooltip label="保存为独立的 .html 文件, 可在浏览器中独立打开">
                <Button variant="light" color="cyan" leftSection={<IconFileText size={14} />} onClick={handleSaveHtmlFile}>保存 HTML 文件</Button>
              </Tooltip>
            </>
          )}
        </Group>
      )}
    </Flex>
  )
}
