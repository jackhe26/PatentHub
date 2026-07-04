/**
 * myOCR PDF 转换器 (OCRmyPDF 本地版) - v9.1
 *
 * 设计定位：
 *   - 100% 离线，数据不出本机（适合保密专利文档）
 *   - 无需 API Key，免费无配额限制
 *   - 输出单个可搜索 PDF（PDF/A-2），保留原版式
 *
 * 跨平台路径探测（优先级从高到低）：
 *   1. resources/myocr/.venv（打包后，PatentHub 同级目录）
 *   2. __dirname/../../../resources/myocr/.venv（开发模式）
 *   3. PATH 中的 python + pip install ocrmypdf（兜底）
 *   4. 用户自定义路径（UI 配置）
 *
 * Tesseract 语言包下载：
 *   - 优先使用系统 tessdata（如 C:\Program Files\Tesseract-OCR\tessdata）
 *   - 用户下载的语言包保存到 %APPDATA%/PatentHub/tessdata/
 *   - 运行时通过 TESSDATA_PREFIX 环境变量指向用户目录
 *
 * 调用方式：
 *   python -m ocrmypdf [args]
 */

import { app } from 'electron'
import { execFileSync, execFile, spawn, ChildProcess } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type {
  ConvertInput,
  ConvertResult,
  PDFConverter,
  ProgressCallback,
  TestConnectionResult,
  MyOcrOptions,
  EnvironmentStatus,
} from './types'

// ============================================================
// 常量
// ============================================================

/** 默认参数（不预设语言，避免首次启动报错） */
const DEFAULT_OPTS: Required<MyOcrOptions> = {
  languages: [], // 不预设，依赖 Tesseract 默认
  deskew: true,
  rotatePages: true,
  outputType: 'pdfa-2',
  jobs: 1,
  binaryPath: '',
  tesseractPath: '',
}

/** Tesseract 语言包官方下载地址（tessdata 标准精度） */
const TESSDATA_URL = 'https://github.com/tesseract-ocr/tessdata/raw/main'

/** 语言包大小估算（MB） */
const LANG_SIZES: Record<string, number> = {
  chi_sim: 12, chi_tra: 11, jpn: 13, kor: 9,
  eng: 4, fra: 4, deu: 5, spa: 4, por: 4,
  ita: 4, rus: 9, ara: 3,
}

// ============================================================
// 路径探测（参照 BabelDOC 模式）
// ============================================================

/**
 * 获取 resources/myocr 目录（跨电脑部署）
 */
function getMyOcrDir(): string | null {
  const isDev = !app.isPackaged

  // 直接探测路径（开发模式）
  if (isDev) {
    const devPaths = [
      path.join(__dirname, '..', '..', '..', 'resources', 'myocr'),
      path.join(process.cwd(), 'resources', 'myocr'),
      path.join(app.getAppPath(), 'resources', 'myocr'),
    ]
    for (const p of devPaths) {
      if (fs.existsSync(p)) {
        console.log(`[MyOcrConverter] 开发模式找到 myocr: ${p}`)
        return p
      }
    }
  }

  // 生产模式探测
  const candidates = [
    path.join(process.resourcesPath!, 'resources', 'myocr'),
    path.join(process.resourcesPath!, 'myocr'),
    path.join(process.resourcesPath!, 'app.asar.unpacked', 'resources', 'myocr'),
    path.join(path.dirname(process.execPath!), 'resources', 'resources', 'myocr'),
    path.join(path.dirname(process.execPath!), 'resources', 'myocr'),
    path.join(path.dirname(process.execPath!), 'myocr'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      console.log(`[MyOcrConverter] 生产模式找到 myocr: ${p}`)
      return p
    }
  }

  console.log(`[MyOcrConverter] 未找到 myocr 目录`)
  return null
}

/**
 * 获取用户 tessdata 目录（%APPDATA%/PatentHub/tessdata/）
 */
function getUserTessdataDir(): string {
  return path.join(app.getPath('userData'), 'tessdata')
}

/**
 * 确保用户 tessdata 目录存在
 */
function ensureUserTessdataDir(): string {
  const dir = getUserTessdataDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * 获取完整系统环境变量（Windows 上 Electron 的 process.env 可能不完整）
 * 通过 cmd /c set 获取完整的环境变量，确保 PATH 等关键变量完整
 * 缓存结果，避免重复调用
 */
let _cachedSystemEnv: NodeJS.ProcessEnv | null = null

function getFullSystemEnv(): NodeJS.ProcessEnv {
  if (_cachedSystemEnv) return _cachedSystemEnv

  const isWin = process.platform === 'win32'
  if (!isWin) {
    _cachedSystemEnv = { ...process.env }
    return _cachedSystemEnv
  }

  try {
    const envOutput = execFileSync('cmd', ['/c', 'set'], {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 5000,
    })
    const systemEnv: NodeJS.ProcessEnv = {}
    for (const line of envOutput.split(/\r?\n/)) {
      const eq = line.indexOf('=')
      if (eq > 0) {
        systemEnv[line.substring(0, eq)] = line.substring(eq + 1)
      }
    }
    _cachedSystemEnv = systemEnv
    return _cachedSystemEnv
  } catch {
    _cachedSystemEnv = { ...process.env }
    return _cachedSystemEnv
  }
}

/**
 * 扫描系统所有 Python 安装（解决多版本环境问题）
 *
 * 策略：
 *   1. Windows: 通过 PowerShell Get-Command python -All 列出 PATH 中所有 python.exe
 *   2. 追加常见非标准安装路径（%LOCALAPPDATA%、Microsoft Store 等）
 *   3. 追加硬编码常见路径
 *   4. 去重后返回所有可执行 python 路径
 */
function findAllPythonInstallations(): string[] {
  const isWin = process.platform === 'win32'
  const found = new Set<string>()

  // 获取完整系统环境变量（确保 PowerShell/where/which 能看到完整 PATH）
  const systemEnv = getFullSystemEnv()

  if (isWin) {
    // 策略 1: PowerShell 列出 PATH 中所有 python.exe（支持 -All 获取所有匹配项）
    try {
      const psResult = execFileSync('powershell', [
        '-NoProfile',
        '-Command',
        '(Get-Command python -All -ErrorAction SilentlyContinue | ForEach-Object { $_.Source }) -join "`n"',
      ], {
        encoding: 'utf-8',
        windowsHide: true,
        timeout: 5000,
        env: systemEnv,
      })
      if (psResult?.trim()) {
        for (const line of psResult.split(/\r?\n/)) {
          const trimmed = line.trim()
          if (trimmed && fs.existsSync(trimmed)) {
            found.add(trimmed)
          }
        }
      }
    } catch { /* 忽略 */ }

    // 策略 2: 常见非标准安装路径
    const localAppData = process.env.LOCALAPPDATA || ''
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'

    const patternDirs = [
      // Microsoft Store Python
      path.join(localAppData, 'Microsoft', 'WindowsApps'),
      // 用户级安装
      path.join(localAppData, 'Programs', 'Python'),
      // 系统级安装
      path.join(programFiles, 'Python'),
      path.join(programFilesX86, 'Python'),
      // Conda / Miniconda
      path.join(localAppData, 'Continuum', 'miniconda3'),
      path.join(localAppData, 'Continuum', 'anaconda3'),
      path.join(programFiles, 'miniconda3'),
      // 硬编码常见版本
      'C:\\Python312',
      'C:\\Python311',
      'C:\\Python310',
      'C:\\Python313',
    ]

    for (const dir of patternDirs) {
      if (!dir) continue
      try {
        if (fs.existsSync(dir)) {
          const entries = fs.readdirSync(dir, { withFileTypes: true })
          for (const entry of entries) {
            // 直接文件: python.exe
            if (entry.isFile() && /^python3?\d*\.exe$/i.test(entry.name)) {
              const p = path.join(dir, entry.name)
              found.add(p)
            }
            // 子目录可能是 Python3xx/python.exe 或 Scripts/python.exe 结构
            if (entry.isDirectory() && /^Python3\d\d$/i.test(entry.name)) {
              const pyExe = path.join(dir, entry.name, 'python.exe')
              if (fs.existsSync(pyExe)) found.add(pyExe)
            }
          }
        }
      } catch { /* 忽略 */ }

      // 也检查目录下的 python.exe（如 C:\Python311\python.exe）
      const dirExe = path.join(dir, 'python.exe')
      try {
        if (fs.existsSync(dirExe)) found.add(dirExe)
      } catch { /* 忽略 */ }
    }
  }

  // 非 Windows: 简单扫描
  if (!isWin) {
    for (const name of ['python3', 'python']) {
      try {
        const result = execFileSync('which', [name], { encoding: 'utf-8', timeout: 3000, env: systemEnv })
        const trimmed = result.trim()
        if (trimmed) {
          // which 可能返回多行，每行一个
          for (const line of trimmed.split(/\r?\n/)) {
            if (line.trim()) found.add(line.trim())
          }
        }
      } catch { /* 忽略 */ }
    }
  }

  return Array.from(found)
}

/**
 * 检测 OCRmyPDF Python
 *
 * 探测优先级：
 *   1. resources/myocr/.venv（打包内置虚拟环境）
 *   2. 系统所有 Python 安装（全量扫描，解决多版本共存问题）
 *   3. python / python3 命令兜底
 */
function detectOcrPython(): { path: string; args: string[]; version: string; reason: string } | null {
  const isWin = process.platform === 'win32'
  const venvDir = getMyOcrDir()
  const venvPython = venvDir
    ? path.join(venvDir, isWin ? '.venv' : '.venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python3')
    : null

  // 获取完整系统环境变量（解决打包后 PATH 不完整导致找不到 python 的问题）
  const systemEnv = getFullSystemEnv()

  // 优先 .venv
  if (venvPython && fs.existsSync(venvPython)) {
    try {
      const result = runCmdSync(venvPython, ['--version'], systemEnv)
      if (result.exitCode === 0) {
        const pyVersion = (result.stdout.trim() || result.stderr.trim()).split('\n')[0]
        const ocrResult = runCmdSync(venvPython, ['-m', 'ocrmypdf', '--version'], systemEnv)
        if (ocrResult.exitCode === 0 && ocrResult.stdout.trim()) {
          return {
            path: venvPython,
            args: ['-m', 'ocrmypdf'],
            version: `${pyVersion} + ocrmypdf ${ocrResult.stdout.trim().split('\n')[0]}`,
            reason: `本地 .venv (${venvDir}) ✓`,
          }
        }
      }
    } catch { /* 继续 */ }
  }

  // 全量扫描系统所有 Python（解决多版本问题）
  const allPythons = findAllPythonInstallations()
  if (allPythons.length > 0) {
    console.log(`[MyOcrConverter] 发现 ${allPythons.length} 个 Python 安装: ${allPythons.join(', ')}`)
  }

  for (const py of allPythons) {
    try {
      const result = runCmdSync(py, ['--version'], systemEnv)
      if (result.exitCode !== 0) continue
      const pyVersion = (result.stdout.trim() || result.stderr.trim()).split('\n')[0]

      const ocrResult = runCmdSync(py, ['-m', 'ocrmypdf', '--version'], systemEnv)
      if (ocrResult.exitCode === 0 && ocrResult.stdout.trim()) {
        const ocrVersion = ocrResult.stdout.trim().split('\n')[0]
        return {
          path: py,
          args: ['-m', 'ocrmypdf'],
          version: `${pyVersion} + ocrmypdf ${ocrVersion}`,
          reason: `系统 Python (${py}) ✓`,
        }
      } else {
        console.log(`[MyOcrConverter] ${py} 存在，但 ocrmypdf 模块未安装`)
      }
    } catch { /* 继续下一个 */ }
  }

  // 兜底：尝试 PATH 中的 python / python3 命令
  const fallbackCommands = isWin ? ['python', 'python3'] : ['python3', 'python']
  for (const cmd of fallbackCommands) {
    try {
      const result = runCmdSync(cmd, ['--version'], systemEnv)
      if (result.exitCode !== 0) continue
      const pyVersion = (result.stdout.trim() || result.stderr.trim()).split('\n')[0]

      const ocrResult = runCmdSync(cmd, ['-m', 'ocrmypdf', '--version'], systemEnv)
      if (ocrResult.exitCode === 0 && ocrResult.stdout.trim()) {
        const ocrVersion = ocrResult.stdout.trim().split('\n')[0]
        return {
          path: cmd,
          args: ['-m', 'ocrmypdf'],
          version: `${pyVersion} + ocrmypdf ${ocrVersion}`,
          reason: `PATH 命令 '${cmd}' ✓`,
        }
      } else {
        console.log(`[MyOcrConverter] ${cmd} 存在，但 ocrmypdf 模块未安装`)
      }
    } catch { /* 继续下一个 */ }
  }

  console.log(`[MyOcrConverter] ❌ 未找到安装 ocrmypdf 的 Python`)
  return null
}

/**
 * 全量扫描系统可执行文件（类似 findAllPythonInstallations 但针对通用二进制）
 *
 * 策略：
 *   1. Windows: PowerShell Get-Command <name> -All 列出 PATH 中所有匹配项
 *   2. 追加常见安装路径
 *   3. 去重后返回所有存在的可执行文件
 */
function findAllBinaries(name: string, commonPaths: string[] = []): string[] {
  const isWin = process.platform === 'win32'
  const found = new Set<string>()

  // 获取完整系统环境变量（确保 PowerShell/where/which 能看到完整 PATH）
  const systemEnv = getFullSystemEnv()

  if (isWin) {
    const names = [name, `${name}.exe`, `${name}.cmd`, `${name}.bat`]

    // 策略 1: PowerShell Get-Command -All（列出 PATH 中所有匹配项）
    for (const n of names) {
      try {
        const psResult = execFileSync('powershell', [
          '-NoProfile',
          '-Command',
          `(Get-Command ${n} -All -ErrorAction SilentlyContinue | ForEach-Object { $_.Source }) -join "\`n"`,
        ], {
          encoding: 'utf-8',
          windowsHide: true,
          timeout: 5000,
          env: systemEnv,
        })
        if (psResult?.trim()) {
          for (const line of psResult.split(/\r?\n/)) {
            const trimmed = line.trim()
            if (trimmed && fs.existsSync(trimmed)) {
              found.add(trimmed)
            }
          }
        }
      } catch { /* 忽略 */ }
    }

    // 策略 2: where 命令回退
    if (found.size === 0) {
      for (const n of names) {
        try {
          const result = execFileSync('where', [n], {
            encoding: 'utf-8',
            windowsHide: true,
            timeout: 5000,
            env: systemEnv,
          })
          if (result?.trim()) {
            for (const line of result.split(/\r?\n/)) {
              const trimmed = line.trim()
              if (trimmed && fs.existsSync(trimmed)) {
                found.add(trimmed)
              }
            }
          }
        } catch { /* 忽略 */ }
      }
    }
  }

  // 非 Windows: which -a 列出所有
  if (!isWin) {
    for (const n of [name]) {
      try {
        const result = execFileSync('which', ['-a', n], {
          encoding: 'utf-8',
          timeout: 5000,
          env: systemEnv,
        })
        if (result?.trim()) {
          for (const line of result.split(/\r?\n/)) {
            const trimmed = line.trim()
            if (trimmed) found.add(trimmed)
          }
        }
      } catch { /* 忽略 */ }
    }
  }

  // 策略 3: 扫描常见安装路径
  for (const p of commonPaths) {
    if (p && fs.existsSync(p)) {
      found.add(p)
    }
  }

  // 策略 4: 在常见目录下递归查找（如 Program Files\Tesseract-OCR\）
  if (isWin && found.size === 0) {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    const patternDirs: string[] = []

    // 根据搜索目标构建目录探测列表
    const lowerName = name.toLowerCase()
    if (lowerName.includes('tesseract')) {
      patternDirs.push(
        path.join(programFiles, 'Tesseract-OCR'),
        path.join(programFilesX86, 'Tesseract-OCR'),
        'D:\\Program Files\\Tesseract-OCR',
      )
    }
    if (lowerName.includes('gs') || lowerName.includes('ghost')) {
      const localAppData = process.env.LOCALAPPDATA || ''
      patternDirs.push(
        path.join(programFiles, 'gs'),
        path.join(programFilesX86, 'gs'),
        'D:\\Program Files\\gs',
        'D:\\Program Files\\GPLGhostscript',
        path.join(localAppData, 'Programs', 'gs'),
      )
      // Ghostscript 版本化路径扫描
      const gsBaseDirs = ['D:\\Program Files\\GPLGhostscript', 'D:\\Program Files\\gs', 'C:\\Program Files\\gs']
      for (const baseDir of gsBaseDirs) {
        try {
          if (fs.existsSync(baseDir)) {
            const entries = fs.readdirSync(baseDir, { withFileTypes: true })
            for (const entry of entries) {
              if (entry.isDirectory()) {
                const binDir = path.join(baseDir, entry.name, 'bin')
                if (fs.existsSync(binDir)) {
                  patternDirs.push(binDir)
                }
              }
            }
          }
        } catch { /* 忽略 */ }
      }
    }

    for (const dir of patternDirs) {
      try {
        if (fs.existsSync(dir)) {
          const entries = fs.readdirSync(dir, { withFileTypes: true })
          for (const entry of entries) {
            if (entry.isFile()) {
              for (const n of [name, `${name}.exe`, `${name}.cmd`, `${name}.bat`]) {
                if (entry.name.toLowerCase() === n.toLowerCase()) {
                  found.add(path.join(dir, entry.name))
                }
              }
            }
          }
        }
      } catch { /* 忽略 */ }
    }
  }

  return Array.from(found)
}

/**
 * 在 PATH / 常见路径中查找可执行文件
 */
function findBinary(name: string, commonPaths: string[] = []): { path: string | null; reason: string } {
  // 全量扫描（解决多版本/非标准路径安装问题）
  const allFound = findAllBinaries(name, commonPaths)
  if (allFound.length > 0) {
    console.log(`[MyOcrConverter] findBinary('${name}'): 找到 ${allFound.length} 个: ${allFound.join(', ')}`)
    return { path: allFound[0], reason: `全量扫描: ${allFound[0]}` }
  }

  return { path: null, reason: `未找到 ${name}` }
}

/**
 * 探测 Tesseract 可用语言（合并系统 + 用户目录）
 */
function probeTesseractLanguages(tesseractPath: string): string[] {
  const isWin = process.platform === 'win32'
  const tessDir = path.dirname(tesseractPath)
  const tessdataDir = path.join(tessDir, 'tessdata')
  const userTessdataDir = getUserTessdataDir()

  const languages = new Set<string>()

  // 系统 tessdata
  try {
    if (fs.existsSync(tessdataDir)) {
      const files = fs.readdirSync(tessdataDir)
      for (const f of files) {
        if (f.endsWith('.traineddata')) {
          languages.add(f.replace('.traineddata', ''))
        }
      }
    }
  } catch { /* 忽略 */ }

  // 用户 tessdata
  try {
    if (fs.existsSync(userTessdataDir)) {
      const files = fs.readdirSync(userTessdataDir)
      for (const f of files) {
        if (f.endsWith('.traineddata')) {
          languages.add(f.replace('.traineddata', ''))
        }
      }
    }
  } catch { /* 忽略 */ }

  return Array.from(languages).sort()
}

/**
 * 探测可执行文件版本
 */
function probeVersion(binPath: string): string | null {
  for (const arg of ['--version', '-v', '-V']) {
    try {
      const result = runCmdSync(binPath, arg.split(' '))
      if (result.exitCode === 0 && result.stdout.trim()) {
        return result.stdout.split(/\r?\n/)[0].trim()
      }
    } catch { /* 忽略 */ }
  }
  return null
}

/**
 * 同步运行命令（使用 execFileSync 实现真正的同步）
 */
function runCmdSync(
  cmd: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): { stdout: string; stderr: string; exitCode: number | null } {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 30000,
      env: env || undefined,
    })
    return { stdout: stdout ?? '', stderr: '', exitCode: 0 }
  } catch (err: any) {
    // execFileSync 失败时，exitCode 在 err.status 中
    const exitCode = err.status ?? 1
    // Windows 上 stderr 通常为空，因为错误会抛到异常
    return { stdout: '', stderr: err.message ?? '', exitCode }
  }
}

/**
 * 异步运行命令
 */
function runCmd(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32'
    const shellCmd = isWin ? 'cmd' : '/bin/sh'
    const shellArgs = isWin ? ['/c', cmd, ...args] : ['-c', `${cmd} ${args.join(' ')}`]

    const child = spawn(shellCmd, shellArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (d) => { stdout += d.toString() })
    child.stderr?.on('data', (d) => { stderr += d.toString() })
    child.on('close', (c) => { resolve({ stdout, stderr, exitCode: c }) })
    child.on('error', () => { resolve({ stdout, stderr, exitCode: null }) })
  })
}

// ============================================================
// MyOcrConverter 主类
// ============================================================

export class MyOcrConverter implements PDFConverter {
  readonly id = 'myocr'
  readonly displayName = 'myOCR (本地)'

  /**
   * 探测本地 OCR 环境
   */
  async detectEnvironment(
    customOcrPath?: string,
    customTessPath?: string,
  ): Promise<EnvironmentStatus> {
    const isWin = process.platform === 'win32'
    void customOcrPath // 暂不支持自定义 OCR 路径

    // ---- 1. ocrmypdf ----
    const ocrResult = detectOcrPython()
    let ocrmypdfInfo: EnvironmentStatus['ocrmypdf']

    if (ocrResult) {
      ocrmypdfInfo = {
        version: ocrResult.version,
        path: ocrResult.path,
      }
    }

    // ---- 2. tesseract ----
    const tessResult = findBinary(
      customTessPath || 'tesseract',
      isWin
        ? [
            'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
            'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe',
            'D:\\Program Files\\Tesseract-OCR\\tesseract.exe',
          ]
        : [
            '/usr/bin/tesseract',
            '/usr/local/bin/tesseract',
            '/opt/homebrew/bin/tesseract',
          ],
    )
    let tesseractInfo: EnvironmentStatus['tesseract']

    if (tessResult.path) {
      const version = probeVersion(tessResult.path)
      const languages = probeTesseractLanguages(tessResult.path)
      tesseractInfo = {
        version: version?.split(/\r?\n/)[0] ?? 'unknown',
        path: tessResult.path,
        languages,
      }
    }

    // ---- 3. ghostscript ----
    const gsResult = findBinary(
      isWin ? 'gswin64c' : 'gs',
      isWin
        ? [
            'D:\\Program Files\\GPLGhostscript\\gs10.05.0\\bin\\gswin64c.exe',
            'D:\\Program Files\\gs\\gs10.03.0\\bin\\gswin64c.exe',
            'D:\\Program Files\\gs\\gs10.02.0\\bin\\gswin64c.exe',
            'D:\\Program Files\\gs\\gs9.56.1\\bin\\gswin64c.exe',
            'C:\\Program Files\\gs\\gs10.03.0\\bin\\gswin64c.exe',
            'C:\\Program Files\\gs\\bin\\gswin64c.exe',
          ]
        : ['/usr/bin/gs', '/usr/local/bin/gs'],
    )
    let ghostscriptInfo: EnvironmentStatus['ghostscript']

    if (gsResult.path) {
      const version = probeVersion(gsResult.path)
      ghostscriptInfo = {
        version: version?.split(/\r?\n/)[0] ?? 'unknown',
        path: gsResult.path,
      }
    }

    // ---- 汇总 ----
    const missing: string[] = []
    if (!ocrmypdfInfo) missing.push('ocrmypdf (Python + ocrmypdf)')
    if (!tesseractInfo) missing.push('tesseract')
    if (!ghostscriptInfo) missing.push('Ghostscript')

    const diagnostics: string[] = []
    if (!ocrmypdfInfo) {
      const localVenv = getMyOcrDir()
        ? path.join(getMyOcrDir()!, isWin ? '.venv\\Scripts\\python.exe' : '.venv/bin/python')
        : null
      diagnostics.push(
        `请选择以下任一方式安装 OCRmyPDF:\n` +
        `方式1（本地部署）: 将 OCRmyPDF .venv 复制到 resources/myocr/.venv\n` +
        `方式2（pip 安装）: pip install ocrmypdf -i https://pypi.tuna.tsinghua.edu.cn/simple\n` +
        (localVenv ? `推荐 .venv 路径: ${localVenv}` : ''),
      )
    }
    if (!tesseractInfo) {
      diagnostics.push(`请安装 Tesseract: https://github.com/UB-Mannheim/tesseract/releases`)
    }
    if (!ghostscriptInfo) {
      diagnostics.push(`请安装 Ghostscript: https://ghostscript.com/download/gsdn.html`)
    }

    return {
      ok: missing.length === 0,
      ocrmypdf: ocrmypdfInfo,
      tesseract: tesseractInfo,
      ghostscript: ghostscriptInfo,
      missing,
      installHint: diagnostics.join('\n'),
    }
  }

  /**
   * 安装 Tesseract 语言包（同步下载）
   */
  async installLanguage(langCode: string): Promise<{ success: boolean; path?: string; size?: number; error?: string }> {
    const lang = langCode.replace(/\.traineddata$/, '') // 去掉可能的后缀
    const userDir = ensureUserTessdataDir()
    const destPath = path.join(userDir, `${lang}.traineddata`)

    // 已存在则跳过
    if (fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath)
      return { success: true, path: destPath, size: stats.size }
    }

    // 下载语言包（tessdata 标准精度）
    const url = `${TESSDATA_URL}/${lang}.traineddata`
    console.log(`[MyOcrConverter] 下载语言包: ${url}`)

    try {
      const result = await runCmd('curl', [
        '-L', '-o', destPath,
        '--progress-bar',
        '--max-filesize', '20000000', // 限制 20MB
        url,
      ])

      if (result.exitCode !== 0) {
        // curl 失败，尝试 PowerShell
        console.log(`[MyOcrConverter] curl 失败，尝试 PowerShell 下载...`)
        const psResult = await runCmd('powershell', [
          '-Command',
          `Invoke-WebRequest -Uri '${url}' -OutFile '${destPath}' -MaximumFileSize 20000000`,
        ])

        if (psResult.exitCode !== 0) {
          // 清理失败文件
          if (fs.existsSync(destPath)) {
            try { fs.unlinkSync(destPath) } catch { /* ignore */ }
          }
          return { success: false, error: `下载失败: ${psResult.stderr || '网络错误'}` }
        }
      }

      if (!fs.existsSync(destPath)) {
        return { success: false, error: '下载后文件不存在' }
      }

      const stats = fs.statSync(destPath)
      // 文件太小说明下载失败
      if (stats.size < 100000) {
        try { fs.unlinkSync(destPath) } catch { /* ignore */ }
        return { success: false, error: '下载文件过小，可能下载失败' }
      }

      console.log(`[MyOcrConverter] ✅ 语言包下载完成: ${destPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`)
      return { success: true, path: destPath, size: stats.size }
    } catch (err) {
      if (fs.existsSync(destPath)) {
        try { fs.unlinkSync(destPath) } catch { /* ignore */ }
      }
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * 测试连接
   */
  async testConnection(_apiKey: string): Promise<TestConnectionResult> {
    void _apiKey
    const env = await this.detectEnvironment()
    if (!env.ok) {
      return {
        success: false,
        error: env.installHint ?? `环境缺失: ${env.missing.join(', ')}`,
      }
    }
    return { success: true }
  }

  /**
   * 获取环境状态
   */
  async getEnvironmentStatus(): Promise<EnvironmentStatus> {
    return this.detectEnvironment()
  }

  /**
   * 执行 OCR 转换
   */
  async convert(
    input: ConvertInput,
    onProgress: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<ConvertResult> {
    const { filePath, myOcrOptions = {} } = input
    const opts: Required<MyOcrOptions> = {
      ...DEFAULT_OPTS,
      ...myOcrOptions,
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`PDF 文件不存在: ${filePath}`)
    }

    const stats = await fs.promises.stat(filePath)
    if (stats.size === 0) {
      throw new Error('PDF 文件为空')
    }

    // 1. 环境探测
    const env = await this.detectEnvironment(opts.binaryPath, opts.tesseractPath)
    if (!env.ok) {
      throw new Error(`环境缺失: ${env.missing.join(', ')}\n${env.installHint}`)
    }

    // 2. 检查语言是否可用（合并系统 + 用户目录）
    if (opts.languages.length > 0) {
      const available = new Set(env.tesseract?.languages ?? [])
      for (const lang of opts.languages) {
        // 支持 "chi_sim+eng" 格式，拆开检查
        const langs = lang.split('+')
        for (const l of langs) {
          if (!available.has(l)) {
            const sizeMB = LANG_SIZES[l] ?? 5
            throw new Error(
              `语言 "${l}" 未安装。\n` +
              `请先点击语言下拉框，选择"${l}"进行下载（约 ${sizeMB}MB）。\n` +
              `或手动下载: https://github.com/tesseract-ocr/tessdata/raw/main/${l}.traineddata`
            )
          }
        }
      }
    }

    // 3. 生成输出路径
    const baseName = path.basename(filePath, path.extname(filePath))
    const dir = path.dirname(filePath)
    const ts = genTimestamp()
    const outputPath = path.join(dir, `${baseName}_myocr_${ts}.pdf`)

    // 4. 构建命令
    const pythonPath = env.ocrmypdf?.path ?? 'python'
    const pythonArgs = ['-m', 'ocrmypdf']
    const ocrArgs = this.buildArgs(filePath, outputPath, opts)

    console.log(
      `[MyOcrConverter] 🚀 启动: ${pythonPath} ${pythonArgs.join(' ')} ${ocrArgs.join(' ')}`,
    )

    // 5. 启动子进程
    onProgress({ progress: 5, message: '启动 OCRmyPDF...' })

    try {
      await this.runProcess(
        pythonPath,
        [...pythonArgs, ...ocrArgs],
        opts,
        onProgress,
        signal,
      )
    } catch (err) {
      if (signal?.aborted) throw new Error('操作已取消')
      throw err
    }

    // 6. 验证输出文件
    if (!fs.existsSync(outputPath)) {
      throw new Error('OCRmyPDF 未生成输出文件')
    }

    const outputStats = await fs.promises.stat(outputPath)
    console.log(
      `[MyOcrConverter] ✅ 完成: ${outputPath} (${(outputStats.size / 1024 / 1024).toFixed(2)} MB)`,
    )

    onProgress({ progress: 100, message: 'OCR 完成！' })

    return {
      outputPath,
      outputPdfPath: outputPath,
      debugZipPath: outputPath,
      pdfType: 'scanned',
      environment: env,
    }
  }

  // ========================================================
  // 私有方法
  // ========================================================

  private buildArgs(
    inputPath: string,
    outputPath: string,
    opts: Required<MyOcrOptions>,
  ): string[] {
    const args: string[] = []

    if (opts.languages.length > 0) {
      args.push('-l', opts.languages.join('+'))
    }

    args.push('--output-type', opts.outputType)

    // 强制单线程，避免 Windows 上并发导致的临时文件问题
    args.push('--jobs', String(opts.jobs))

    if (opts.deskew) args.push('--deskew')
    // 注意：--rotate-pages 在 Windows + Python 3.10 环境下会导致 hOCR 处理错误，暂时禁用
    // if (opts.rotatePages) args.push('--rotate-pages')
    args.push('--skip-text')
    args.push('--', inputPath, outputPath)

    return args
  }

  private runProcess(
    binPath: string,
    args: string[],
    opts: Required<MyOcrOptions>,
    onProgress: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const isWin = process.platform === 'win32'

      // 使用完整系统环境变量（Electron 的 process.env 可能不完整）
      const systemEnv = getFullSystemEnv()
      const env: NodeJS.ProcessEnv = { ...systemEnv }

      // 确保 tesseract 在 PATH 中
      if (opts.tesseractPath) {
        const tessDir = path.dirname(opts.tesseractPath)
        const sep = isWin ? ';' : ':'
        env.PATH = tessDir + sep + (env.PATH ?? '')
      }

      // 设置 TESSDATA_PREFIX 指向用户目录（包含下载的语言包）
      const userTessdata = getUserTessdataDir()
      if (fs.existsSync(userTessdata)) {
        env.TESSDATA_PREFIX = userTessdata
        console.log(`[MyOcrConverter] TESSDATA_PREFIX: ${userTessdata}`)
      }

      // 设置临时目录（避免 Windows 短路径问题）
      const customTempDir = path.join(app.getPath('userData'), 'temp')
      if (!fs.existsSync(customTempDir)) {
        fs.mkdirSync(customTempDir, { recursive: true })
      }
      env.TEMP = customTempDir
      env.TMP = customTempDir
      env.TMPDIR = customTempDir

      // 构建完整命令
      const fullArgs = [...args]
      console.log(`[MyOcrConverter] 环境变量检查:`)
      console.log(`  TEMP: ${env.TEMP}`)
      console.log(`  TESSDATA_PREFIX: ${env.TESSDATA_PREFIX}`)
      console.log(`  PATH (前100字符): ${(env.PATH || '').substring(0, 100)}...`)

      // 设置工作目录为 PDF 所在目录（避免路径问题）
      const cwd = path.dirname(fullArgs[fullArgs.length - 2])
      console.log(`[MyOcrConverter] 工作目录: ${cwd}`)

      // 使用 execFile 并通过 shell 运行（确保环境变量正确传递）
      let killed = false

      // 构建命令字符串（供 shell 使用）
      const shellCmd = `"${binPath}" ${fullArgs.map(a => `"${a}"`).join(' ')}`

      console.log(`[MyOcrConverter] Shell 命令: ${shellCmd.substring(0, 200)}...`)

      const child = execFile(binPath, fullArgs, {
        env,
        windowsHide: true,
        cwd: fs.existsSync(cwd) ? cwd : undefined,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        shell: true,  // 通过 shell 运行
      }, (error, stdout, stderr) => {
        if (killed) return

        if (signal?.aborted) {
          reject(new Error('操作已取消'))
          return
        }

        if (error) {
          const ctx = stderr.slice(-800).trim()
          reject(new Error(`OCRmyPDF 退出码 ${(error as any).code ?? 'unknown'}${ctx ? ': ' + ctx : ''}`))
        } else {
          resolve()
        }
      })

      if (signal) {
        const abortHandler = () => {
          killed = true
          child.kill('SIGTERM')
          setTimeout(() => {
            if (!killed) return
            try { child.kill('SIGKILL') } catch { /* ignore */ }
          }, 3000)
        }
        signal.addEventListener('abort', abortHandler, { once: true })
      }
    })
  }
}

// ============================================================
// 工具函数
// ============================================================

function genTimestamp(): string {
  const now = new Date()
  return (
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    '_' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0')
  )
}
