import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Flex,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
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
import { type EnvironmentStatus } from './MyOcrOptionsPanel'

type PDFType = 'scanned' | 'digital'

/** myOCR 语言选项（OCRmyPDF Tesseract 格式） */
const MYOCR_LANGUAGES = [
  { value: 'eng', label: 'eng 英语' },
  { value: 'chi_sim', label: 'chi_sim 简体中文' },
  { value: 'chi_tra', label: 'chi_tra 繁体中文' },
  { value: 'chi_sim+eng', label: '简体中文+英文' },
  { value: 'chi_tra+eng', label: '繁体中文+英文' },
  { value: 'jpn', label: 'jpn 日语' },
  { value: 'jpn+eng', label: '日语+英文' },
  { value: 'kor', label: 'kor 韩语' },
  { value: 'kor+eng', label: '韩语+英文' },
  { value: 'fra', label: 'fra 法语' },
  { value: 'deu', label: 'deu 德语' },
  { value: 'spa', label: 'spa 西班牙语' },
  { value: 'ita', label: 'ita 意大利语' },
  { value: 'por', label: 'por 葡萄牙语' },
  { value: 'rus', label: 'rus 俄语' },
  { value: 'ara', label: 'ara 阿拉伯语' },
]

/** myOCR 默认参数 */
const DEFAULT_MYOCR = {
  languages: ['chi_sim+eng'] as string[],
  deskew: true,
  rotatePages: true,
  pdfa: true,
  jobs: 1,
}

export function PDFConvertTab() {
  const [filePath, setFilePath] = useState('')
  const [fileName, setFileName] = useState('')
  const [serviceId, setServiceId] = useState<string>('mineru')
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

  // ---- myOCR 专用状态 ----
  const [myOcrLanguages, setMyOcrLanguages] = useState<string[]>(DEFAULT_MYOCR.languages)
  const [myOcrDeskew, setMyOcrDeskew] = useState(true)
  const [myOcrRotate, setMyOcrRotate] = useState(true)
  const [myOcrPdfa, setMyOcrPdfa] = useState(true)
  const [myOcrJobs, setMyOcrJobs] = useState(1)
  const [envStatus, setEnvStatus] = useState<EnvironmentStatus | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)

  // ---- 语言下载弹窗状态 ----
  const [langDownloadOpen, setLangDownloadOpen] = useState(false)
  const [langDownloadTarget, setLangDownloadTarget] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)


  const currentService = getServiceMeta(serviceId)
  const isMyOcr = serviceId === 'myocr'
  const needsApiKey = !isMyOcr
  const canConvert = filePath && (!needsApiKey || apiKey.trim())

  // 切换服务商时重置状态
  useEffect(() => {
    if (isMyOcr) {
      setApiKey('')
      setConnectionStatus('idle')
      setConnectionError('')
      setRememberKey(false)
    } else {
      setEnvStatus(null)
    }
  }, [isMyOcr])

  // 读取全局配置
  useEffect(() => {
    let cancelled = false
    const loadGlobalConfig = async () => {
      try {
        if (isMyOcr) {
          const cfg = await window.electronAPI.getPDFConvertGlobalConfig?.(serviceId)
          if (cancelled) return
          if (cfg && Object.keys(cfg).length > 0) {
            setMyOcrLanguages((cfg as any).languages ?? DEFAULT_MYOCR.languages)
            setMyOcrDeskew((cfg as any).deskew ?? true)
            setMyOcrRotate((cfg as any).rotatePages ?? true)
            setMyOcrPdfa((cfg as any).pdfa ?? true)
            setMyOcrJobs((cfg as any).jobs ?? 1)
          }
        } else {
          const cfg = await window.electronAPI.getPDFConvertGlobalConfig?.(serviceId)
          if (cancelled) return
          if (cfg?.apiKey) { setApiKey(cfg.apiKey); setRememberKey(true) }
          else setRememberKey(false)
          setConnectionStatus('idle')
          setConnectionError('')
        }
      } catch (err) { console.warn('[PDFConvert] 读取全局配置失败:', err) }
    }
    loadGlobalConfig()
    return () => { cancelled = true }
  }, [serviceId, isMyOcr])

  // 监听进度
  useEffect(() => {
    const unsubscribe = window.electronAPI.onPDFConvertProgress?.((data: any) => {
      setProgress(data.progress ?? 0)
      setStatusMessage(data.message ?? '处理中...')
    })
    return () => unsubscribe?.()
  }, [])

  const tryRebuildHtml = useCallback((dirPath: string | null) => {
    if (!dirPath) return
    window.electronAPI.invoke('pdf-convert:build-html', { dirPath })
      .then((r: any) => {
        if (r?.success && r.html) {
          setPreviewHtml(r.html)
          setRightMode('html')
          setPreviewFormat(r.format ?? 'unknown')
          setResultRefreshKey(Date.now())
          toast.success(`HTML 预览生成成功 (${r.pageCount} 页, ${r.format})`)
        } else {
          toast.error('生成 HTML 失败: ' + (r?.error || '未知错误'))
        }
      })
      .catch((e: any) => { toast.error('生成 HTML 失败: ' + (e?.message || String(e))) })
  }, [])

  const handleSelectFile = useCallback(async () => {
    try {
      const result = await window.electronAPI.pdf.selectFile()
      if (result) {
        setFilePath(result.path)
        setFileName(result.name)
        setError(null); setResultPath(null); setPdfType(null)
        setDebugZipPath(null); setOutputDocxPath(null); setOutputHtmlPath(null)
        setPreviewHtml(null); setRightMode('pdf'); setProgress(0); setStatusMessage('')
        setSourceRefreshKey(Date.now())
        setResultRefreshKey((k) => k + 1)
      }
    } catch (err) { setError(err instanceof Error ? err.message : '选择文件失败') }
  }, [])

  const handleDetectEnv = useCallback(async () => {
    if (isDetecting) return
    setIsDetecting(true)
    setEnvStatus(null)
    try {
      const result = await window.electronAPI.detectMyOcrEnv?.()
      if (result?.success && result.env) {
        setEnvStatus(result.env)
        if (result.env.ok) toast.success('✅ 环境就绪，ocrmypdf / tesseract / ghostscript 均已安装')
        else toast.warning(`⚠️ 环境缺失: ${result.env.missing.join(', ')}`)
      } else {
        setEnvStatus({ ok: false, missing: ['检测失败'], installHint: result?.error })
      }
    } catch (err) {
      toast.error('检测环境失败: ' + (err instanceof Error ? err.message : String(err)))
    } finally { setIsDetecting(false) }
  }, [isDetecting])

  const handleTestConnection = useCallback(async () => {
    if (isMyOcr) { await handleDetectEnv(); return }
    if (!apiKey.trim()) { toast.error('请先填写 API Key'); return }
    setTesting(true); setConnectionStatus('idle'); setConnectionError('')
    try {
      const result = await window.electronAPI.testPDFConnection?.({ service: serviceId, apiKey: apiKey.trim() })
      if (result?.success) { setConnectionStatus('success'); toast.success('连接成功') }
      else { setConnectionStatus('failed'); setConnectionError(result?.error || '连接失败') }
    } catch (err) { setConnectionStatus('failed'); setConnectionError(err instanceof Error ? err.message : '测试失败') }
    finally { setTesting(false) }
  }, [isMyOcr, apiKey, serviceId, handleDetectEnv])

  const handleConvert = useCallback(async () => {
    if (!filePath) { toast.error('请先选择 PDF'); return }
    if (needsApiKey && !apiKey.trim()) { toast.error('请填写 API Key'); return }

    setIsConverting(true); setProgress(0); setError(null)
    setStatusMessage(isMyOcr ? '启动 OCRmyPDF...' : '初始化任务...')
    setResultPath(null); setPdfType(null); setDebugZipPath(null)
    setOutputDocxPath(null); setOutputHtmlPath(null); setPreviewHtml(null); setRightMode('pdf')

    try {
      const convertParams: any = {
        service: serviceId, filePath,
        apiKey: needsApiKey ? apiKey.trim() : '',
        rebuildMode: needsApiKey ? rebuildMode : undefined,
      }

      // myOCR 参数
      if (isMyOcr) {
        convertParams.myOcrOptions = {
          languages: myOcrLanguages,
          deskew: myOcrDeskew,
          rotatePages: myOcrRotate,
          outputType: myOcrPdfa ? 'pdfa-2' : 'pdf',
          jobs: myOcrJobs,
        }
      }

      const result = await window.electronAPI.convertPDF(convertParams)

      if (result.success && result.outputPath) {
        setResultPath(result.outputPath)
        setPdfType(result.pdfType ?? null)
        setDebugZipPath(result.debugZipPath ?? null)
        setOutputDocxPath((result.outputDocxPath as string | undefined) ?? null)
        setOutputHtmlPath((result.outputHtmlPath as string | undefined) ?? null)
        setResultRefreshKey(Date.now())
        setStatusMessage('转换完成！'); setProgress(100)

        if (result.pdfType === 'scanned') toast.success('OCR 扫描型 PDF 转换完成！')
        else if (result.pdfType === 'digital') toast.success('数字型 PDF 已处理（原 PDF 已含文本层）')
        else toast.success('PDF 转换完成！')

        if (isMyOcr) {
          setRightMode('pdf')
          setPreviewFormat('可搜索 PDF')
        } else if (result.debugZipPath) {
          // v9.0: 默认从解压目录的 layout.json 重建 HTML（效果最好）
          tryRebuildHtml(result.debugZipPath)
        }

        if (rememberKey && needsApiKey) {
          try {
            await window.electronAPI.savePDFConvertGlobalConfig?.({
              service: serviceId, config: { apiKey: apiKey.trim() },
            })
          } catch (err) { console.warn('[PDFConvert] 保存全局配置失败:', err) }
        }
      } else {
        throw new Error(result.error || '转换失败')
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '转换失败'
      setError(errorMsg); toast.error(errorMsg)
    } finally { setIsConverting(false) }
  }, [
    filePath, apiKey, serviceId, isMyOcr, needsApiKey,
    myOcrLanguages, myOcrDeskew, myOcrRotate, myOcrPdfa, myOcrJobs,
    rebuildMode, rememberKey, tryRebuildHtml,
  ])

  const handleOpenInNewWindow = useCallback(() => {
    if (!resultPath) return
    window.electronAPI.invoke('openLink', `file:///${resultPath.replace(/\\/g, '/')}`)
  }, [resultPath])

  const handlePreviewHtml = useCallback(async () => {
    if (!debugZipPath) { toast.error('需要解压目录才能生成 HTML 预览'); return }
    try {
      const result = await window.electronAPI.invoke('pdf-convert:build-html', { dirPath: debugZipPath })
      if (result?.success && result.html) {
        setPreviewHtml(result.html); setRightMode('html'); setPreviewFormat(result.format ?? 'unknown')
        setResultRefreshKey(Date.now())
        toast.success(`HTML 预览生成成功 (${result.pageCount} 页, ${result.format})`)
      } else throw new Error(result?.error || '生成 HTML 失败')
    } catch (err) { toast.error(err instanceof Error ? err.message : '生成 HTML 失败') }
  }, [debugZipPath])

  const handleShowPdf = useCallback(() => { setRightMode('pdf'); setResultRefreshKey(Date.now()) }, [])

  const handleExportHtmlAsPdf = useCallback(async () => {
    if (!previewHtml) { toast.error('请先生成 HTML 预览'); return }
    try {
      const basePath = resultPath ?? filePath
      const outPath = basePath.replace(/\.pdf$/i, '') + '_fromHTML.pdf'
      const res = await window.electronAPI.invoke('pdf-convert:html-to-pdf', { html: previewHtml, outputPath: outPath, format: 'A4' })
      if (res?.success) { toast.success(`已导出 PDF: ${res.path}`); setResultPath(res.path); setRightMode('pdf'); setResultRefreshKey(Date.now()) }
      else throw new Error(res?.error || '导出 PDF 失败')
    } catch (err) { toast.error(err instanceof Error ? err.message : '导出 PDF 失败') }
  }, [previewHtml, resultPath, filePath])

  const handleSaveHtmlFile = useCallback(async () => {
    if (!previewHtml) { toast.error('请先生成 HTML 预览'); return }
    try {
      const baseName = fileName.replace(/\.pdf$/i, '') || 'reconstructed'
      const res = await window.electronAPI.invoke('pdf-convert:save-html', { html: previewHtml, suggestedName: `${baseName}.html` })
      if (res?.success) toast.success(`HTML 已保存到: ${res.path}`)
      else throw new Error(res?.error || '保存 HTML 失败')
    } catch (err) { toast.error(err instanceof Error ? err.message : '保存 HTML 失败') }
  }, [previewHtml, fileName])

  const testTooltip = isMyOcr
    ? (isDetecting ? '检测中...' : '检测本机 OCRmyPDF / Tesseract / Ghostscript')
    : (testing ? '测试中...' : '测试连接')

  return (
    <Flex direction="column" h="100%" gap="xs" style={{ minHeight: 0 }}>
      <Card shadow="sm" padding="xs" radius="md" withBorder>
        {/* 第一行：核心控件（优化：紧凑布局） */}
        <Flex gap="xs" align="center" wrap="wrap">
          {/* 选择文件按钮 */}
          <Button variant="light" size="sm" onClick={handleSelectFile}
            leftSection={<IconFilePlus size={14} />} style={{ minWidth: 100, flex: '1 1 100px' }}>
            {fileName || '选择PDF'}
          </Button>

          {/* 服务商下拉 */}
          <Select size="sm" value={serviceId}
            onChange={(v) => setServiceId(v || 'mineru')}
            data={PDF_CONVERT_SERVICES.map((s) => ({ value: s.id, label: s.displayName }))}
            style={{ minWidth: 90, flex: '1 1 90px' }} allowDeselect={false}
          />

          {/* ★★★ 条件渲染：MinerU = API Key / myOCR = myOCR 参数 ★★★ */}
          {!isMyOcr ? (
            <>
              {/* MinerU: API Key */}
              <PasswordInput size="sm" placeholder="API Key" value={apiKey}
                onChange={(e) => { setApiKey(e.currentTarget.value); setConnectionStatus('idle'); setConnectionError('') }}
                style={{ minWidth: 140, flex: '2 1 140px' }}
                rightSection={
                  <Tooltip label={testTooltip}>
                    <ActionIcon size="sm" variant="subtle" onClick={handleTestConnection} loading={testing}
                      color={connectionStatus === 'success' ? 'green' : connectionStatus === 'failed' ? 'red' : 'gray'}
                      aria-label="测试连接">
                      <IconRefresh size={14} />
                    </ActionIcon>
                  </Tooltip>
                }
              />
              {/* MinerU: 重建模式 */}
              <Select size="sm" value={rebuildMode}
                onChange={(v) => setRebuildMode((v as any) || 'auto')}
                data={[
                  { value: 'auto', label: '🎨 智能' },
                  { value: 'markdown', label: '📝 MD' },
                  { value: 'json', label: '🧩 JSON' },
                ]}
                style={{ minWidth: 70, flex: '1 1 70px' }} allowDeselect={false}
              />
            </>
          ) : (
            <>
              {/* myOCR: 语言多选（flex 自适应，约占 1/5 空间） */}
              <MultiSelect size="sm"
                data={MYOCR_LANGUAGES.map((lang) => {
                  const langs = lang.value.split('+')
                  const allAvailable = langs.every((l) => envStatus?.tesseract?.languages?.includes(l))
                  return {
                    ...lang,
                    label: allAvailable ? lang.label : `📥 ${lang.label}`,
                  }
                })}
                value={myOcrLanguages}
                onChange={(vals) => {
                  // 找出用户新选中的语言中是否有未安装的
                  const newlySelected = vals.filter((v) => !myOcrLanguages.includes(v))
                  const firstNew = newlySelected[0]
                  if (firstNew) {
                    const langs = firstNew.split('+')
                    const unavailable = langs.find((l) => !envStatus?.tesseract?.languages?.includes(l))
                    if (unavailable) {
                      setLangDownloadTarget(unavailable)
                      setLangDownloadOpen(true)
                      // 不选中，等下载完成
                      return
                    }
                  }
                  setMyOcrLanguages(vals)
                }}
                placeholder="语言" searchable clearable maxDropdownHeight={220}
                style={{ minWidth: 100, flex: '1 1 100px' }}
                styles={{ input: { minHeight: 36 } }}
              />
              {/* myOCR: deskew */}
              <Switch size="sm" label="纠偏" checked={myOcrDeskew}
                onChange={(e) => setMyOcrDeskew(e.currentTarget.checked)}
                styles={{ label: { fontSize: 12, paddingLeft: 4 } }}
              />
              {/* myOCR: rotate */}
              <Switch size="sm" label="旋转" checked={myOcrRotate}
                onChange={(e) => setMyOcrRotate(e.currentTarget.checked)}
                styles={{ label: { fontSize: 12, paddingLeft: 4 } }}
              />
              {/* myOCR: PDF/A */}
              <Switch size="sm" label="PDF/A" checked={myOcrPdfa}
                onChange={(e) => setMyOcrPdfa(e.currentTarget.checked)}
                styles={{ label: { fontSize: 12, paddingLeft: 4 } }}
              />
              {/* myOCR: jobs */}
              <NumberInput size="sm" min={1} max={16} value={myOcrJobs}
                onChange={(v) => setMyOcrJobs(Number(v) || 1)}
                placeholder="jobs"
                style={{ minWidth: 60 }}
                styles={{ input: { minHeight: 36, fontSize: 12 } }}
              />
              {/* myOCR: 环境检测按钮 */}
              <Tooltip label={testTooltip}>
                <ActionIcon size="sm" variant="light" onClick={handleTestConnection}
                  loading={isDetecting}
                  color={envStatus?.ok ? 'green' : envStatus && !envStatus.ok ? 'red' : 'gray'}
                  aria-label="检测环境">
                  <IconRefresh size={15} />
                </ActionIcon>
              </Tooltip>
            </>
          )}

          {/* 转换按钮 */}
          <Button size="sm"
            onClick={isConverting ? () => undefined : handleConvert}
            disabled={!canConvert}
            color={isConverting ? 'red' : 'blue'}
            leftSection={<IconPlayerPlay size={14} />} style={{ minWidth: 80 }}>
            {isConverting ? '转换中' : '转换'}
          </Button>
        </Flex>

        {/* 第二行：描述文案 + 状态 */}
        <Flex gap="md" align="center" mt="xs" wrap="wrap">
          {currentService && (
            <>
              <Text size="xs" c="dimmed" style={{ flex: 1, minWidth: 180 }}>💡 {currentService.description}</Text>
              <Anchor href={currentService.homepage} target="_blank" size="xs">官网 ↗</Anchor>
            </>
          )}
          {!isMyOcr && (
            <Switch size="xs" label="记住 Key" checked={rememberKey}
              onChange={(e) => setRememberKey(e.currentTarget.checked)} />
          )}
          {!isMyOcr && connectionStatus === 'success' && <Text size="xs" c="green">✅ 连接成功</Text>}
          {!isMyOcr && connectionStatus === 'failed' && <Text size="xs" c="red">❌ {connectionError}</Text>}
          {isMyOcr && envStatus?.ok && <Text size="xs" c="green">✅ 环境就绪</Text>}
          {isMyOcr && envStatus && !envStatus.ok && (
            <Text size="xs" c="red" style={{ maxWidth: 400 }}>
              ❌ 缺失: {envStatus.missing.join(', ')}
            </Text>
          )}
        </Flex>
      </Card>

      {/* 进度条 */}
      <PDFProgressBar statusText={statusMessage} progress={progress} error={error} />

      {/* 双卡片预览 */}
      <PDFDualViewCard
        leftTitle="原文（扫描/图片）" leftPath={filePath} leftRefreshKey={sourceRefreshKey}
        leftPlaceholder="请选择要转换的扫描型 PDF"
        rightTitle={
          rightMode === 'html' ? `HTML 预览 ${previewFormat ? `(${previewFormat})` : ''}`
            : isMyOcr ? '转换结果（可搜索 PDF）' : '转换结果'
        }
        rightPath={rightMode === 'pdf' ? resultPath ?? undefined : undefined}
        rightHtml={rightMode === 'html' ? previewHtml ?? undefined : undefined}
        rightMode={rightMode} rightRefreshKey={resultRefreshKey}
        rightStatus={isConverting ? 'processing' : resultPath || previewHtml ? 'completed' : 'idle'}
        rightProgress={progress} rightStatusText={statusMessage}
        rightPlaceholder={rightMode === 'html' ? '等待生成 HTML 预览' : '等待转换'}
        rightActions={
          <Group gap="xs" wrap="nowrap">
            {rightMode === 'html' && <Badge size="sm" color="grape" variant="light">HTML 模式</Badge>}
            {isMyOcr && resultPath && <Badge size="sm" color="teal" variant="light">✅ 可搜索 PDF</Badge>}
            {!isMyOcr && rightMode === 'pdf' && pdfType && (
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
            <Button variant="light" leftSection={<IconEye size={14} />} onClick={handleOpenInNewWindow}>在新窗口打开</Button>
          )}
          {debugZipPath && !isMyOcr && (
            <Tooltip label="从 MinerU ZIP 生成 HTML 预览（秒开,可在线选中复制）">
              <Button variant="filled" color="grape" leftSection={<IconCode size={14} />}
                onClick={handlePreviewHtml} disabled={rightMode === 'html'}>
                {rightMode === 'html' ? 'HTML 预览中' : 'HTML 预览 (秒开)'}
              </Button>
            </Tooltip>
          )}
          {rightMode === 'html' && previewHtml && !isMyOcr && (
            <>
              <Tooltip label="用 Electron printToPDF 走 Chromium 引擎, 质量 100% 等同 Chrome 打印">
                <Button variant="light" color="blue" leftSection={<IconPrinter size={14} />} onClick={handleExportHtmlAsPdf}>导出为 PDF</Button>
              </Tooltip>
              <Tooltip label="保存为独立的 .html 文件, 可在浏览器中独立打开">
                <Button variant="light" color="cyan" leftSection={<IconFileText size={14} />} onClick={handleSaveHtmlFile}>保存 HTML 文件</Button>
              </Tooltip>
            </>
          )}
          {isMyOcr && resultPath && (
            <Text size="xs" c="dimmed">myOCR 输出为可搜索 PDF，可直接用上方按钮查看和保存</Text>
          )}
        </Group>
      )}

      {/* ========== v9.1: Tesseract 语言包下载弹窗 ========== */}
      <Modal
        opened={langDownloadOpen}
        onClose={() => { if (!isDownloading) setLangDownloadOpen(false) }}
        title={`下载 Tesseract 语言包`}
        centered size="sm"
        withCloseButton={!isDownloading}
        closeOnClickOutside={!isDownloading}
        closeOnEscape={!isDownloading}
      >
        {isDownloading ? (
          <Text size="sm" c="dimmed" ta="center" py="md">
            📥 正在下载 {langDownloadTarget}.traineddata...
          </Text>
        ) : (
          <>
            <Text size="sm" mb="xs">
              <b>{langDownloadTarget}</b> 语言包未安装，是否下载？
            </Text>
            <Text size="xs" c="dimmed" mb="xs">
              📦 约 10-15MB，来源：github.com/tesseract-ocr/tessdata
            </Text>
            <Text size="xs" c="dimmed" mb="md">
              💾 保存到：%APPDATA%/PatentHub/tessdata/
            </Text>
            <Group justify="flex-end">
              <Button variant="default" size="sm" onClick={() => setLangDownloadOpen(false)}>取消</Button>
              <Button size="sm" onClick={async () => {
                if (!langDownloadTarget) return
                setIsDownloading(true)
                try {
                  const result = await window.electronAPI.invoke('pdf-convert:install-tesseract-lang', {
                    langCode: langDownloadTarget,
                  })
                  if (result?.success) {
                    toast.success(`✅ ${langDownloadTarget} 下载完成 (${result.sizeMB ?? '?'} MB)`)
                    setLangDownloadOpen(false)
                    // 重新检测环境
                    await handleDetectEnv()
                  } else {
                    toast.error(`下载失败: ${result?.error ?? '未知错误'}`)
                  }
                } catch (err) {
                  toast.error('下载失败: ' + (err instanceof Error ? err.message : String(err)))
                } finally {
                  setIsDownloading(false)
                }
              }}>
                开始下载
              </Button>
            </Group>
          </>
        )}
      </Modal>
    </Flex>
  )
}
