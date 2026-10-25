/**
 * ShellRunner - Shell 命令执行器
 *
 * 跨平台 Shell 命令执行，支持：
 * - 工作目录设置
 * - 环境变量注入
 * - 超时控制
 * - stdout/stderr/exitCode 捕获
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { getShellInfo } from './gitBashDetector'

export interface ShellRunOptions {
  /** Shell 命令 */
  command: string
  /** Git Bash 路径（Windows 必需） */
  gitBashPath: string | null
  /** 工作目录 */
  cwd?: string
  /** 环境变量（与 process.env 合并） */
  env?: Record<string, string>
  /** 超时（毫秒），默认 30000 */
  timeout?: number
}

export interface ShellRunResult {
  success: boolean
  /** stdout 内容 */
  stdout: string
  /** stderr 内容 */
  stderr: string
  /** 退出码 */
  exitCode: number | null
  /** 是否超时 */
  timedOut: boolean
  /** 错误信息（如有） */
  error?: string
  /** 执行耗时（毫秒） */
  duration: number
}

/**
 * 执行 Shell 命令
 */
export async function runShell(options: ShellRunOptions): Promise<ShellRunResult> {
  const { command, gitBashPath, cwd, env, timeout = 30000 } = options
  const startTime = Date.now()

  let cmd: string
  let shellArgs: string[]
  try {
    const info = getShellInfo(gitBashPath)
    cmd = info.cmd
    shellArgs = [...info.args, command]
  } catch (err: any) {
    return {
      success: false,
      stdout: '',
      stderr: '',
      exitCode: null,
      timedOut: false,
      error: err.message,
      duration: Date.now() - startTime,
    }
  }

  return new Promise((resolve) => {
    let child: ChildProcess
    try {
      child = spawn(cmd, shellArgs, {
        cwd: cwd || process.cwd(),
        env: { ...process.env, ...(env || {}) },
        shell: false,
        windowsHide: true,
      })
    } catch (err: any) {
      resolve({
        success: false,
        stdout: '',
        stderr: '',
        exitCode: null,
        timedOut: false,
        error: `启动子进程失败: ${err.message}`,
        duration: Date.now() - startTime,
      })
      return
    }

    let stdout = ''
    let stderr = ''
    let timedOut = false

    // 超时控制
    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGTERM')
        setTimeout(() => {
          try {
            child.kill('SIGKILL')
          } catch {}
        }, 5000)
      } catch {}
    }, timeout)

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
      // 防止输出过大，最多保留最后 100KB
      if (stdout.length > 100000) {
        stdout = stdout.slice(-100000)
      }
    })

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
      if (stderr.length > 50000) {
        stderr = stderr.slice(-50000)
      }
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        success: !timedOut && code === 0,
        stdout,
        stderr,
        exitCode: code,
        timedOut,
        duration: Date.now() - startTime,
      })
    })

    child.on('error', (err: Error) => {
      clearTimeout(timer)
      resolve({
        success: false,
        stdout,
        stderr,
        exitCode: null,
        timedOut,
        error: err.message,
        duration: Date.now() - startTime,
      })
    })
  })
}

/**
 * 解析环境变量文本（每行 KEY=value）
 */
export function parseEnvVars(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  if (!text) return result

  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue

    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()

    // 去除值的引号
    const unquoted = value.replace(/^["']|["']$/g, '')

    if (key) {
      result[key] = unquoted
    }
  }
  return result
}

/**
 * 将环境变量对象转换为文本格式
 */
export function stringifyEnvVars(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
}