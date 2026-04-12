/**
 * PDF Translation Module - Main Process
 * 
 * Handles PDF translation via IPC communication with renderer process.
 * Uses BabelDOC (Python) for actual translation.
 */

import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { spawn, ChildProcess } from 'child_process'
import log from 'electron-log'

// Translation progress callback type
type ProgressCallback = (progress: {
  currentPage: number
  totalPages: number
  progress: number
  stage: string
  stageCurrent: number
  stageTotal: number
  overallProgress: number
  message: string
}) => void

// Active translation processes
const activeProcesses: Map<string, { process: ChildProcess; abortController: AbortController }> = new Map()

/**
 * Get BabelDOC path
 */
function getBabelDocPath(): string {
  const isDev = !app.isPackaged
  
  if (isDev) {
    return path.join(__dirname, '../../resources/babeldoc')
  } else {
    const possiblePaths = [
      path.join(process.resourcesPath, 'resources', 'babeldoc'),
      path.join(process.resourcesPath, 'babeldoc'),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'babeldoc'),
      path.join(path.dirname(process.execPath), 'resources', 'resources', 'babeldoc'),
      path.join(path.dirname(process.execPath), 'resources', 'babeldoc'),
      path.join(path.dirname(process.execPath), 'app', 'resources', 'babeldoc'),
    ]
    
    log.info('[PDF Translate] Trying BabelDOC paths:')
    for (const p of possiblePaths) {
      const exists = fs.existsSync(p)
      log.info(`  ${p} - ${exists ? 'EXISTS' : 'NOT FOUND'}`)
      if (exists) {
        return p
      }
    }
    
    log.warn('[PDF Translate] Using default path:', possiblePaths[0])
    return possiblePaths[0]
  }
}

/**
 * Get BabelDOC parent directory (for PYTHONPATH)
 */
function getBabelDocParentPath(): string {
  const isDev = !app.isPackaged
  
  if (isDev) {
    return path.join(__dirname, '../../resources')
  } else {
    const possiblePaths = [
      path.join(process.resourcesPath, 'resources'),
      process.resourcesPath,
      path.join(process.resourcesPath, 'app.asar.unpacked', 'resources'),
      path.join(path.dirname(process.execPath), 'resources', 'resources'),
      path.join(path.dirname(process.execPath), 'resources'),
      path.join(path.dirname(process.execPath), 'app', 'resources'),
    ]
    
    log.info('[PDF Translate] Trying BabelDOC parent paths:')
    for (const p of possiblePaths) {
      const exists = fs.existsSync(p)
      log.info(`  ${p} - ${exists ? 'EXISTS' : 'NOT FOUND'}`)
      if (exists) {
        return p
      }
    }
    
    log.warn('[PDF Translate] Using default parent path:', possiblePaths[0])
    return possiblePaths[0]
  }
}

/**
 * Get output directory - same as source PDF
 */
function getOutputDir(sourceFilePath: string): string {
  return path.dirname(sourceFilePath)
}

/**
 * Select a PDF file using native file dialog
 */
async function selectPDFFile(): Promise<{ path: string; name: string } | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'PDF Files', extensions: ['pdf', 'PDF'] }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const filePath = result.filePaths[0]
  const fileName = path.basename(filePath)
  
  return { path: filePath, name: fileName }
}

/**
 * Cleanup temporary files for a session
 */
async function cleanupTempFiles(sessionId: string): Promise<void> {
  // TODO: Implement cleanup logic if needed
  log.info(`Cleaning up temp files for session: ${sessionId}`)
}

/**
 * Parse progress from BabelDOC output
 */
function parseBabelDocProgress(data: string, progressCallback: ProgressCallback): boolean {
  try {
    const event = JSON.parse(data)
    
    if (event.type === 'progress_update') {
      progressCallback({
        currentPage: event.stage_current || 0,
        totalPages: event.stage_total || 0,
        progress: (event.overall_progress || 0) / 100,
        stage: event.stage || 'translating',
        stageCurrent: event.stage_current || 0,
        stageTotal: event.stage_total || 0,
        overallProgress: event.overall_progress || 0,
        message: event.stage ? `${event.stage} (${event.stage_current || 0}/${event.stage_total || 0})` : '翻译中...'
      })
      return true
    } else if (event.type === 'progress_start') {
      progressCallback({
        currentPage: 0,
        totalPages: event.stage_total || 0,
        progress: 0,
        stage: event.stage || 'starting',
        stageCurrent: 0,
        stageTotal: event.stage_total || 0,
        overallProgress: 0,
        message: `开始: ${event.stage || '翻译'}`
      })
      return true
    } else if (event.type === 'progress_end') {
      progressCallback({
        currentPage: event.stage_total || 0,
        totalPages: event.stage_total || 0,
        progress: 1,
        stage: event.stage || 'complete',
        stageCurrent: event.stage_total || 0,
        stageTotal: event.stage_total || 0,
        overallProgress: 100,
        message: '完成'
      })
      return true
    }
  } catch (e) {
    // Not a JSON line
  }
  return false
}

/**
 * Rename file to remove .no_watermark from filename
 */
function renameNoWatermarkFile(filePath: string): string {
  if (filePath && filePath.includes('.no_watermark')) {
    // 处理 .no_watermark.zh.mono.pdf -> .zh.mono.pdf
    const newPath = filePath.replace('.no_watermark', '')
    if (newPath !== filePath) {
      try {
        fs.renameSync(filePath, newPath)
        log.info(`Renamed file: ${filePath} -> ${newPath}`)
        return newPath
      } catch (e) {
        log.error(`Failed to rename file: ${filePath}`, e)
      }
    }
  }
  return filePath
}

/**
 * Find the output PDF files based on the source filename and output language
 * Uses exact filename matching instead of modification time to avoid conflicts with old files
 */
function findOutputFiles(outputDir: string, outputName: string, outputLang: string = 'zh'): { monoPath: string; dualPath: string } {
  let monoPath = ''
  let dualPath = ''
  
  try {
    const files = fs.readdirSync(outputDir)
    log.info(`Output files in ${outputDir}:`, files)
    log.info(`Looking for files matching: ${outputName}.${outputLang}.mono.pdf or ${outputName}.${outputLang}.dual.pdf`)
    
    // 精确匹配输出文件名
    for (const file of files) {
      // 查找 mono PDF: outputname.lang.mono.pdf 或 outputname.no_watermark.lang.mono.pdf
      const monoMatch = file.match(new RegExp(`^${outputName}\\.(no_watermark\\.)?${outputLang}\\.mono\\.pdf$`))
      if (monoMatch && !monoPath) {
        const filePath = path.join(outputDir, file)
        // 重命名 .no_watermark 文件
        monoPath = renameNoWatermarkFile(filePath)
        log.info(`Found mono file: ${file} -> ${monoPath}`)
      }
      
      // 查找 dual PDF: outputname.lang.dual.pdf 或 outputname.no_watermark.lang.dual.pdf
      const dualMatch = file.match(new RegExp(`^${outputName}\\.(no_watermark\\.)?${outputLang}\\.dual\\.pdf$`))
      if (dualMatch && !dualPath) {
        const filePath = path.join(outputDir, file)
        // 重命名 .no_watermark 文件
        dualPath = renameNoWatermarkFile(filePath)
        log.info(`Found dual file: ${file} -> ${dualPath}`)
      }
    }
    
    log.info(`Found output files - Mono: ${monoPath}, Dual: ${dualPath}`)
  } catch (e) {
    log.error('Error finding output files:', e)
  }
  
  return { monoPath, dualPath }
}

/**
 * Translate PDF file using BabelDOC
 */
async function translatePDF(
  sessionId: string,
  filePath: string,
  options: {
    model: string
    langIn: string
    langOut: string
    apiKey: string
    baseUrl: string
    qps?: number
    outputType?: 'mono' | 'dual' | 'both'
    watermark?: 'watermarked' | 'no_watermark'
    autoOcr?: boolean
    maxPagesPerPart?: number
    customPrompt?: string
  },
  progressCallback: ProgressCallback
): Promise<{ monoPath: string; dualPath: string }> {
  const outputDir = getOutputDir(filePath)
  const outputName = path.basename(filePath, '.pdf')
  const babeldocPath = getBabelDocPath()
  const babeldocParentPath = getBabelDocParentPath()

  log.info(`BabelDOC path: ${babeldocPath}`)
  log.info(`BabelDOC parent path: ${babeldocParentPath}`)
  log.info(`Output directory: ${outputDir}`)
  log.info(`Source file: ${filePath}`)
  
  // 调试：显示 customPrompt
  log.info(`[DEBUG] customPrompt received: "${options.customPrompt}"`)
  log.info(`[DEBUG] customPrompt trimmed: "${options.customPrompt?.trim()}"`)
  log.info(`[DEBUG] customPrompt is valid: ${!!(options.customPrompt && options.customPrompt.trim())}`)

  const env = {
    ...process.env,
    OPENAI_API_KEY: options.apiKey,
    PYTHONPATH: babeldocParentPath,
  }

  const args: string[] = [
    '-m', 'babeldoc.main',
    '--openai',
  ]

  if (options.model) {
    args.push('--openai-model', options.model)
  }
  if (options.baseUrl) {
    args.push('--openai-base-url', options.baseUrl)
  }
  if (options.apiKey) {
    args.push('--openai-api-key', options.apiKey)
  }
  
  args.push('-li', options.langIn)
  args.push('-lo', options.langOut)
  args.push('-o', outputDir)

  if (options.qps) {
    args.push('--qps', String(options.qps))
  }

  if (options.outputType === 'mono') {
    args.push('--no-dual')
  } else if (options.outputType === 'dual') {
    args.push('--no-mono')
  }

  args.push('--watermark-output-mode', 'no_watermark')

  // debug 模式会导致 PDF 有框框，暂时移除
  // args.push('--debug')

  if (options.autoOcr) {
    args.push('--auto-enable-ocr-workaround')
  }

  if (options.maxPagesPerPart && options.maxPagesPerPart > 0) {
    args.push('--max-pages-per-part', String(options.maxPagesPerPart))
  }

  // 添加自定义翻译提示词（确保有实际内容才传递）
  if (options.customPrompt && options.customPrompt.trim()) {
    args.push('--custom-system-prompt', options.customPrompt.trim())
  }

  args.push('--files', filePath)

  const cmdStr = `python ${args.join(' ')}`
  log.info(`Starting BabelDOC: ${cmdStr}`)
  
  progressCallback({
    currentPage: 0,
    totalPages: 0,
    progress: 0,
    stage: 'starting',
    stageCurrent: 0,
    stageTotal: 0,
    overallProgress: 0,
    message: '正在启动翻译...'
  })

  // Try multiple Python commands
  const pythonCommands = process.platform === 'win32' 
    ? ['python', 'py', 'python3', 'python3.11', 'python3.10']
    : ['python3', 'python3.11', 'python3.10']
  
  return new Promise((resolve, reject) => {
    let currentCmdIndex = 0
    let proc: ChildProcess | null = null
    let stdoutBuffer = ''
    let stderrBuffer = ''
    let lastProgressSent = 0
    let babeldocProgressReceived = false
    let progressInterval: NodeJS.Timeout | null = null
    
    // 分析 stderr 错误并生成友好的错误消息
    const analyzeError = (stderr: string): { title: string; message: string; solution: string } => {
      const errorLower = stderr.toLowerCase()
      
      // 1. Python 未找到
      if (errorLower.includes('python') && (errorLower.includes('not found') || errorLower.includes('is not recognized'))) {
        return {
          title: '未找到 Python',
          message: '系统找不到 Python 解释器',
          solution: '请安装 Python 3.10+ 并确保添加到 PATH 环境变量。\n下载链接: https://www.python.org/downloads/'
        }
      }
      
      // 2. 缺少 Python 包
      if (errorLower.includes('modulenotfounderror') || errorLower.includes('importerror')) {
        // 提取缺失的包名
        const moduleMatch = stderr.match(/(?:No module named|import error:|ModuleNotFoundError:) ['"]?(\w+)['"]?/)
        const missingModule = moduleMatch ? moduleMatch[1] : '未知模块'
        
        return {
          title: '缺少 Python 依赖包',
          message: `缺少必要的 Python 包: ${missingModule}`,
          solution: '请在命令行运行以下命令安装依赖:\npip install -r requirements.txt\n\n或者运行: pip install babeldoc'
        }
      }
      
      // 3. BabelDOC 路径问题
      if (errorLower.includes('babeldoc') && (errorLower.includes('not found') || errorLower.includes('no such file'))) {
        return {
          title: 'BabelDOC 文件未找到',
          message: '翻译引擎文件缺失',
          solution: '请重新下载安装 PatentHub Portable 版本'
        }
      }
      
      // 4. API Key 问题
      if (errorLower.includes('api key') || errorLower.includes('authentication')) {
        return {
          title: 'API 密钥错误',
          message: 'AI 翻译服务的 API 密钥无效',
          solution: '请检查设置中的 API Key 是否正确'
        }
      }
      
      // 5. 网络问题
      if (errorLower.includes('connection') || errorLower.includes('timeout') || errorLower.includes('network')) {
        return {
          title: '网络连接失败',
          message: '无法连接到 AI 翻译服务',
          solution: '请检查网络连接，或尝试更换 API 服务商'
        }
      }
      
      // 6. PDF 文件问题
      if (errorLower.includes('pdf') && (errorLower.includes('error') || errorLower.includes('invalid'))) {
        return {
          title: 'PDF 文件错误',
          message: '无法读取或处理 PDF 文件',
          solution: '请确保 PDF 文件没有损坏，且不是加密的扫描件'
        }
      }
      
      // 7. 磁盘空间不足
      if (errorLower.includes('disk') || errorLower.includes('space') || errorLower.includes('permission')) {
        return {
          title: '磁盘或权限问题',
          message: '写入文件时出错',
          solution: '请检查磁盘空间是否充足，以及是否有文件写入权限'
        }
      }
      
      // 默认错误
      return {
        title: '翻译失败',
        message: `发生未知错误 (错误代码: ${stderr.slice(0, 100)})`,
        solution: '请查看详细日志或联系技术支持'
      }
    }

    const tryNextPython = (): void => {
      if (currentCmdIndex >= pythonCommands.length) {
        const errorInfo = analyzeError('')
        progressCallback({
          currentPage: 0,
          totalPages: 0,
          progress: 0,
          stage: 'error',
          stageCurrent: 0,
          stageTotal: 0,
          overallProgress: 0,
          message: `${errorInfo.title}: ${errorInfo.message}\n\n解决方案: ${errorInfo.solution}`
        })
        reject(new Error('No Python found. Please install Python 3.10+ and add it to PATH. Download from: https://www.python.org/downloads/'))
        return
      }
      
      const pythonCmd = pythonCommands[currentCmdIndex++]
      log.info(`[PDF Translate] Trying Python command: ${pythonCmd}`)
      
      const checkProc = spawn(pythonCmd, ['--version'], { stdio: 'pipe' })
      
      checkProc.on('error', () => {
        log.info(`[PDF Translate] ${pythonCmd} not found, trying next...`)
        tryNextPython()
      })
      
      checkProc.on('close', (code) => {
        if (code === 0) {
          log.info(`[PDF Translate] Using Python: ${pythonCmd}`)
          startTranslation(pythonCmd)
        } else {
          log.info(`[PDF Translate] ${pythonCmd} failed with code ${code}, trying next...`)
          tryNextPython()
        }
      })
    }
    
    const startTranslation = (pythonCmd: string): void => {
      // 打印完整的调试信息
      log.info(`[PDF Translate] Full command: ${pythonCmd} ${args.join(' ')}`)
      log.info(`[PDF Translate] PYTHONPATH: ${babeldocParentPath}`)
      log.info(`[PDF Translate] cwd: ${babeldocParentPath}`)
      
      // 【修复】不使用 shell，而是直接传递参数数组，避免 Windows 命令行中文编码问题
      proc = spawn(pythonCmd, args, {
        cwd: babeldocParentPath,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false
      })

      activeProcesses.set(sessionId, { process: proc, abortController: new AbortController() })

      stdoutBuffer = ''
      stderrBuffer = ''
      lastProgressSent = 0
      babeldocProgressReceived = false

      // 阶段状态跟踪
      let currentStage = '初始化'
      let stageStartTime = Date.now()
      
      // 从 INFO 日志中检测当前阶段
      const detectStageFromLog = (text: string): string | null => {
        // 检测各种阶段的日志模式
        const stagePatterns: Array<{ pattern: RegExp; stage: string }> = [
          { pattern: /start to translate/i, stage: '开始翻译' },
          { pattern: /Loading ONNX model/i, stage: '加载模型' },
          { pattern: /Split points determined/i, stage: '分析文档' },
          { pattern: /Parse PDF|Parse Page Layout|Parse Paragraphs/i, stage: '解析PDF' },
          { pattern: /Automatic Term Extraction/i, stage: '提取术语' },
          { pattern: /Translate Paragraphs|Translation completed/i, stage: '翻译段落' },
          { pattern: /Typesetting/i, stage: '排版' },
          { pattern: /Font subsetting|Add Fonts/i, stage: '处理字体' },
          { pattern: /Generate drawing instructions/i, stage: '生成指令' },
          { pattern: /PDF save with clean|Save PDF/i, stage: '保存PDF' },
          { pattern: /finish translate/i, stage: '完成翻译' },
        ]
        
        for (const { pattern, stage } of stagePatterns) {
          if (pattern.test(text)) {
            return stage
          }
        }
        return null
      }
      
      progressInterval = setInterval(() => {
        if (activeProcesses.has(sessionId)) {
          if (!babeldocProgressReceived) {
            // 根据时间估算进度，显示当前阶段
            const elapsed = Date.now() - stageStartTime
            const estimatedTotal = 120000 // 假设总时间2分钟
            const estimatedProgress = Math.min(90, Math.round((elapsed / estimatedTotal) * 100))
            
            progressCallback({
              currentPage: 0,
              totalPages: 1,
              progress: estimatedProgress / 100,
              stage: currentStage,
              stageCurrent: 0,
              stageTotal: 1,
              overallProgress: estimatedProgress,
              message: `${currentStage}...`
            })
          }
        }
      }, 2000)

      // 解析 BabelDOC 文本进度输出
      // 格式: 
      // 1. "translate 0/100 0:00:00" (rich 进度条格式)
      // 2. DEBUG JSON: {'type': 'progress_update', 'stage': '...', 'overall_progress': xx, ...}
      // 3. {'type': 'stage_summary', 'stages': [...]}
      const parseBabelDocTextProgress = (text: string): boolean => {
        // 清理文本 - 移除乱码字符
        const cleanText = text.replace(/[\r\u0000]/g, '').trim()
        
        if (!cleanText || cleanText.length < 5) return false
        
        // 尝试解析 JSON 格式的调试输出
        // 格式: DEBUG ... __main__:{...} 或直接 {..}
        const jsonMatch = cleanText.match(/__main__:(\{.*\})$/) || cleanText.match(/^\{.*\}$/)
        if (jsonMatch) {
          try {
            const event = JSON.parse(jsonMatch[1])
            log.info(`[Progress] JSON event parsed: type=${event.type}`)
            
            if (event.type === 'progress_update' || event.type === 'progress_start') {
              const stageName = event.stage || '翻译中'
              const stageCurrent = event.stage_current || 0
              const stageTotal = event.stage_total || 1
              const overallProgress = Math.round(event.overall_progress || 0)
              
              babeldocProgressReceived = true
              const stageCN = translateStageName(stageName)
              
              progressCallback({
                currentPage: stageCurrent,
                totalPages: stageTotal,
                progress: overallProgress / 100,
                stage: stageCN,
                stageCurrent: stageCurrent,
                stageTotal: stageTotal,
                overallProgress: overallProgress,
                message: `${stageCN} (${stageCurrent}/${stageTotal}) - ${overallProgress}%`
              })
              return true
            } else if (event.type === 'stage_summary' && event.stages) {
              // stage_summary 包含所有阶段的权重信息
              // 我们可以根据当前进度计算总体进度
              const stages = event.stages
              log.info(`[Progress] Stage summary: ${stages.length} stages`)
              // 不直接发送这个消息，但可以记录
              return false
            } else if (event.type === 'error') {
              log.error(`[Progress] Translation error: ${event.error}`)
              return false
            }
          } catch (e) {
            // JSON 解析失败，继续尝试其他模式
          }
        }
        
        // 模式1: "translate 0/100 0:00:00" (rich 进度条格式)
        let match = cleanText.match(/^([a-zA-Z\s]+?)\s+(\d+)\/(\d+)\s+(\d+:\d+:\d+)/)
        if (match) {
          const stageName = match[1].trim()
          const current = parseInt(match[2])
          const total = parseInt(match[3])
          
          log.info(`[Progress] Rich progress matched: stage="${stageName}", current=${current}, total=${total}`)
          
          if (total > 0 && total < 100000) {
            const stageProgress = getStageProgress(stageName, current, total)
            babeldocProgressReceived = true
            
            const stageCN = translateStageName(stageName)
            
            progressCallback({
              currentPage: current,
              totalPages: total,
              progress: stageProgress / 100,
              stage: stageCN,
              stageCurrent: current,
              stageTotal: total,
              overallProgress: stageProgress,
              message: `${stageCN} (${current}/${total})`
            })
            return true
          }
        }
        
        // 模式2: "StageName (part/total) ----- current/total"
        match = cleanText.match(/^(.+?)\s+\((\d+)\/(\d+)\)\s*[-]+\s*(\d+)\/(\d+)/)
        if (match) {
          const stageName = match[1].trim()
          const current = parseInt(match[4])
          const total = parseInt(match[5])
          
          if (total > 0 && total < 100000) {
            const stageProgress = getStageProgress(stageName, current, total)
            babeldocProgressReceived = true
            
            const stageCN = translateStageName(stageName)
            
            progressCallback({
              currentPage: current,
              totalPages: total,
              progress: stageProgress / 100,
              stage: stageCN,
              stageCurrent: current,
              stageTotal: total,
              overallProgress: stageProgress,
              message: `${stageCN} (${current}/${total})`
            })
            return true
          }
        }
        
        // 模式3: 只看 "current/total"，忽略阶段名
        match = cleanText.match(/[-]+\s*(\d+)\/(\d+)/)
        if (match) {
          const current = parseInt(match[1])
          const total = parseInt(match[2])
          
          if (total > 0 && total < 100000) {
            const stagePart = cleanText.split('-----')[0].trim()
            const stageProgress = getStageProgress(stagePart, current, total)
            babeldocProgressReceived = true
            
            const stageCN = translateStageName(stagePart)
            
            progressCallback({
              currentPage: current,
              totalPages: total,
              progress: stageProgress / 100,
              stage: stageCN,
              stageCurrent: current,
              stageTotal: total,
              overallProgress: stageProgress,
              message: `${stageCN} (${current}/${total})`
            })
            return true
          }
        }
        
        return false
      }
      
      // 根据阶段名称和进度计算总体进度百分比
      const getStageProgress = (stageName: string, current: number, total: number): number => {
        // 所有阶段的顺序和权重
        const stages = [
          { name: 'Parse PDF and Create Intermediate Representation', weight: 5 },
          { name: 'DetectScannedFile', weight: 3 },
          { name: 'Parse Page Layout', weight: 5 },
          { name: 'Parse Paragraphs', weight: 5 },
          { name: 'Parse Formulas and Styles', weight: 5 },
          { name: 'Automatic Term Extraction', weight: 15 },
          { name: 'Translate Paragraphs', weight: 45 },
          { name: 'Typesetting', weight: 5 },
          { name: 'Add Fonts', weight: 5 },
          { name: 'Generate drawing instructions', weight: 4 },
          { name: 'Subset font', weight: 2 },
          { name: 'Save PDF', weight: 1 },
        ]
        
        // 查找当前阶段索引
        let currentStageIndex = stages.findIndex(s => stageName.includes(s.name))
        if (currentStageIndex === -1) {
          // 尝试模糊匹配
          currentStageIndex = stages.findIndex(s => s.name.toLowerCase().includes(stageName.toLowerCase().split(' ')[0]))
        }
        
        if (currentStageIndex === -1) {
          // 未知阶段，使用线性进度
          return Math.round((current / total) * 100)
        }
        
        // 计算已完成阶段的权重
        let completedWeight = 0
        for (let i = 0; i < currentStageIndex; i++) {
          completedWeight += stages[i].weight
        }
        
        // 计算当前阶段的进度
        const currentStageWeight = stages[currentStageIndex].weight
        const currentProgressInStage = total > 0 ? (current / total) * currentStageWeight : 0
        
        // 总权重
        const totalWeight = stages.reduce((sum, s) => sum + s.weight, 0)
        
        // 计算总体进度
        const progress = Math.round(((completedWeight + currentProgressInStage) / totalWeight) * 100)
        return Math.min(99, progress) // 最大99%，最后一阶段完成时是100%
      }
      
      // 翻译阶段名称为中文
      const translateStageName = (enName: string): string => {
        const stageMap: Record<string, string> = {
          'Parse PDF and Create Intermediate Representation': '解析PDF',
          'DetectScannedFile': '检测扫描件',
          'Parse Page Layout': '解析页面布局',
          'Parse Paragraphs': '解析段落',
          'Parse Formulas and Styles': '解析公式和样式',
          'Automatic Term Extraction': '提取术语',
          'Translate Paragraphs': '翻译段落',
          'Typesetting': '排版',
          'Add Fonts': '添加字体',
          'Generate drawing instructions': '生成绘图指令',
          'Subset font': '子集化字体',
          'Save PDF': '保存PDF',
          'translate': '翻译中',
        }
        return stageMap[enName] || enName || '翻译中'
      }

      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString()
        stdoutBuffer += text
        log.info('BabelDOC stdout:', text)
        
        // 检测当前阶段
        const detectedStage = detectStageFromLog(text)
        if (detectedStage) {
          currentStage = detectedStage
          log.info(`[Progress] Stage detected: ${currentStage}`)
        }
        
        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() || ''
        
        for (const line of lines) {
          if (line.trim()) {
            if (parseBabelDocProgress(line, progressCallback)) {
              babeldocProgressReceived = true
              lastProgressSent = 100
            } else if (parseBabelDocTextProgress(line)) {
              // handled
            }
          }
        }
      })

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString()
        stderrBuffer += text
        log.info('BabelDOC stderr:', text)
        
        // 检测当前阶段
        const detectedStage = detectStageFromLog(text)
        if (detectedStage) {
          currentStage = detectedStage
          log.info(`[Progress] Stage detected: ${currentStage}`)
        }
        
        const lines = stderrBuffer.split('\n')
        stderrBuffer = lines.pop() || ''
        
        for (const line of lines) {
          if (line.trim()) {
            if (parseBabelDocProgress(line, progressCallback)) {
              babeldocProgressReceived = true
              lastProgressSent = 100
            } else if (parseBabelDocTextProgress(line)) {
              // handled
            }
          }
        }
      })

      proc.on('close', (code) => {
        if (progressInterval) {
          clearInterval(progressInterval)
        }
        log.info(`BabelDOC process closed with code: ${code}`)
        activeProcesses.delete(sessionId)

        if (code === 0) {
          const outputLang = options.langOut || 'zh'
          
          // 传递 outputLang 参数
          const found = findOutputFiles(outputDir, outputName, outputLang)
          let finalMonoPath = found.monoPath
          let finalDualPath = found.dualPath

          // 如果没有找到，尝试直接构建路径（处理 .no_watermark 情况）
          if (!finalMonoPath) {
            // 先尝试不带 .no_watermark 的路径
            let monoPath = path.join(outputDir, `${outputName}.${outputLang}.mono.pdf`)
            if (fs.existsSync(monoPath)) {
              finalMonoPath = monoPath
            } else {
              // 再尝试带 .no_watermark 的路径，然后重命名
              const noWatermarkPath = path.join(outputDir, `${outputName}.no_watermark.${outputLang}.mono.pdf`)
              if (fs.existsSync(noWatermarkPath)) {
                finalMonoPath = renameNoWatermarkFile(noWatermarkPath)
              }
            }
          }
          if (!finalDualPath) {
            // 先尝试不带 .no_watermark 的路径
            let dualPath = path.join(outputDir, `${outputName}.${outputLang}.dual.pdf`)
            if (fs.existsSync(dualPath)) {
              finalDualPath = dualPath
            } else {
              // 再尝试带 .no_watermark 的路径，然后重命名
              const noWatermarkPath = path.join(outputDir, `${outputName}.no_watermark.${outputLang}.dual.pdf`)
              if (fs.existsSync(noWatermarkPath)) {
                finalDualPath = renameNoWatermarkFile(noWatermarkPath)
              }
            }
          }

          progressCallback({
            currentPage: 1,
            totalPages: 1,
            progress: 1,
            stage: 'complete',
            stageCurrent: 1,
            stageTotal: 1,
            overallProgress: 100,
            message: '翻译完成!'
          })

          log.info(`Translation complete. Mono: ${finalMonoPath}, Dual: ${finalDualPath}`)

          resolve({ 
            monoPath: finalMonoPath, 
            dualPath: finalDualPath 
          })
        } else {
          // 分析错误并提供友好的错误消息
          const errorInfo = analyzeError(stderrBuffer)
          progressCallback({
            currentPage: 0,
            totalPages: 0,
            progress: 0,
            stage: 'error',
            stageCurrent: 0,
            stageTotal: 0,
            overallProgress: 0,
            message: `${errorInfo.title}: ${errorInfo.message}\n\n解决方案: ${errorInfo.solution}`
          })
          reject(new Error(`Translation process exited with code ${code}. ${errorInfo.title}: ${errorInfo.message}. Solution: ${errorInfo.solution}`))
        }
      })

      proc.on('error', (error) => {
        if (progressInterval) {
          clearInterval(progressInterval)
        }
        log.error('BabelDOC process error:', error)
        activeProcesses.delete(sessionId)
        
        progressCallback({
          currentPage: 0,
          totalPages: 0,
          progress: 0,
          stage: 'error',
          stageCurrent: 0,
          stageTotal: 0,
          overallProgress: 0,
          message: error.message
        })
        
        reject(error)
      })
    }
    
    tryNextPython()
  })
}

/**
 * Cancel ongoing translation
 */
async function cancelTranslation(sessionId: string): Promise<boolean> {
  const active = activeProcesses.get(sessionId)
  if (active) {
    active.process.kill('SIGTERM')
    activeProcesses.delete(sessionId)
    await cleanupTempFiles(sessionId)
    return true
  }
  return false
}

/**
 * Export translated PDF to user-specified location
 */
async function exportPDF(
  sourcePath: string,
  type: 'mono' | 'dual'
): Promise<string | null> {
  const result = await dialog.showSaveDialog({
    defaultPath: path.basename(sourcePath),
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] }
    ]
  })

  if (result.canceled || !result.filePath) {
    return null
  }

  fs.copyFileSync(sourcePath, result.filePath)
  return result.filePath
}

/**
 * Get page count of a PDF
 */
async function getPDFPageCount(filePath: string): Promise<number> {
  try {
    const stats = fs.statSync(filePath)
    return Math.max(1, Math.round(stats.size / 100000))
  } catch (error) {
    log.error('Failed to get page count:', error)
    return 1
  }
}

/**
 * Register IPC handlers
 */
export function registerIPCHandlers(): void {
  log.info('Registering BabelDOC PDF translation IPC handlers')

  ipcMain.handle('pdf:selectFile', async () => {
    try {
      return await selectPDFFile()
    } catch (error) {
      log.error('pdf:selectFile error:', error)
      return null
    }
  })

  ipcMain.handle('pdf:translate', async (event, params: {
    sessionId: string
    filePath: string
    model: string
    langIn: string
    langOut: string
    apiKey: string
    baseUrl: string
    qps?: number
    outputType?: 'mono' | 'dual' | 'both'
    watermark?: 'watermarked' | 'no_watermark'
    autoOcr?: boolean
    maxPagesPerPart?: number
    customPrompt?: string
  }) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender)
      
      const result = await translatePDF(
        params.sessionId,
        params.filePath,
        {
          model: params.model,
          langIn: params.langIn,
          langOut: params.langOut,
          apiKey: params.apiKey,
          baseUrl: params.baseUrl,
          qps: params.qps,
          outputType: params.outputType,
          watermark: params.watermark,
          autoOcr: params.autoOcr,
          maxPagesPerPart: params.maxPagesPerPart,
          customPrompt: params.customPrompt,
        },
        (progress) => {
          if (window && !window.isDestroyed()) {
            window.webContents.send('pdf:progress', {
              sessionId: params.sessionId,
              ...progress
            })
          }
        }
      )

      return {
        success: true,
        monoPath: result.monoPath,
        dualPath: result.dualPath
      }
    } catch (error) {
      log.error('pdf:translate error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Translation failed'
      }
    }
  })

  ipcMain.handle('pdf:cancel', async (_, sessionId: string) => {
    return await cancelTranslation(sessionId)
  })

  ipcMain.handle('pdf:export', async (_, params: {
    sourcePath: string
    type: 'mono' | 'dual'
  }) => {
    try {
      const savedPath = await exportPDF(params.sourcePath, params.type)
      return { success: true, path: savedPath }
    } catch (error) {
      log.error('pdf:export error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Export failed' }
    }
  })

  ipcMain.handle('pdf:getPageCount', async (_, filePath: string) => {
    try {
      const count = await getPDFPageCount(filePath)
      return { success: true, count }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get page count' }
    }
  })

  ipcMain.handle('pdf:cleanup', async (_, sessionId: string) => {
    await cleanupTempFiles(sessionId)
    return { success: true }
  })

  log.info('BabelDOC PDF translation IPC handlers registered')
}

/**
 * Cleanup all active processes on shutdown
 */
export function cleanup(): void {
  for (const [sessionId, active] of activeProcesses) {
    active.process.kill('SIGTERM')
    cleanupTempFiles(sessionId)
  }
  activeProcesses.clear()
}
