/**
 * Git Bash 自动发现器
 *
 * 在 Windows 上检测常见的 Git Bash 安装位置
 * 在 macOS/Linux 上直接返回 /bin/bash
 */

import * as fs from 'node:fs'

// Windows 上常见的 Git Bash 路径
const WINDOWS_GIT_BASH_PATHS = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  'D:\\Program Files\\Git\\bin\\bash.exe',
  'D:\\Program Files (x86)\\Git\\bin\\bash.exe',
  'E:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
  'C:\\Program Files\\Git\\mingw64\\bin\\bash.exe',
  // 通过环境变量
]

/**
 * 自动检测 Git Bash 路径
 */
export function detectGitBash(): { found: boolean; path?: string } {
  // macOS / Linux 直接使用 /bin/bash
  if (process.platform !== 'win32') {
    const unixBash = '/bin/bash'
    if (fs.existsSync(unixBash)) {
      return { found: true, path: unixBash }
    }
    return { found: false }
  }

  // 检查常见路径
  for (const p of WINDOWS_GIT_BASH_PATHS) {
    if (fs.existsSync(p)) {
      return { found: true, path: p }
    }
  }

  // 尝试通过环境变量 PATH 中的 git 反查
  try {
    const pathEnv = process.env.PATH || process.env.Path || ''
    const paths = pathEnv.split(process.platform === 'win32' ? ';' : ':')
    for (const dir of paths) {
      if (!dir) continue
      const candidates = ['bash.exe', 'bash']
      for (const c of candidates) {
        const full = `${dir}${process.platform === 'win32' ? '\\' : '/'}${c}`
        if (fs.existsSync(full)) {
          return { found: true, path: full }
        }
      }
    }
  } catch {
    // ignore
  }

  return { found: false }
}

/**
 * 校验路径是否为可用的 Shell
 */
export function isValidShellPath(path: string): boolean {
  if (!path) return false
  try {
    return fs.existsSync(path)
  } catch {
    return false
  }
}

/**
 * 选择 Shell（统一接口）
 */
export function getShellInfo(gitBashPath: string | null): {
  cmd: string
  args: string[]
} {
  if (process.platform === 'win32') {
    if (!gitBashPath) {
      throw new Error('Git Bash 路径未配置。请在 Agent 设置中指定 Git Bash 路径。')
    }
    if (!fs.existsSync(gitBashPath)) {
      throw new Error(`Git Bash 不存在: ${gitBashPath}`)
    }
    return { cmd: gitBashPath, args: ['-c'] }
  } else {
    return { cmd: '/bin/bash', args: ['-c'] }
  }
}