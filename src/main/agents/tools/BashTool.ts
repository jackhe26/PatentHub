/**
 * BashTool - Shell 命令执行
 */

import { runShell, type ShellRunResult } from '../shellRunner'
import type { ToolResult } from '../../../shared/agents/types'

export interface BashArgs {
  command: string
  cwd?: string
  timeout?: number
  run_in_background?: boolean
  description?: string
}

export interface BashContext {
  gitBashPath: string | null
  workingDir: string | null
  env: Record<string, string>
}

/**
 * 执行 Bash 命令
 */
export async function executeBash(
  args: BashArgs,
  context: BashContext
): Promise<ToolResult> {
  const { command, cwd, timeout, description } = args

  if (!command || typeof command !== 'string') {
    return {
      success: false,
      content: '错误：必须提供 command 参数',
      error: 'INVALID_ARGUMENT',
    }
  }

  const workDir = cwd || context.workingDir || undefined

  try {
    const result: ShellRunResult = await runShell({
      command,
      gitBashPath: context.gitBashPath,
      cwd: workDir,
      env: context.env,
      timeout: timeout || 30000,
    })

    let output = ''
    if (description) {
      output += `**${description}**\n\n`
    }

    if (result.stdout) {
      output += result.stdout
    }
    if (result.stderr) {
      output += (output ? '\n\n' : '') + '**[stderr]**\n' + result.stderr
    }

    if (result.timedOut) {
      output += (output ? '\n\n' : '') + '**[超时]** 命令执行超过 ' + (timeout || 30000) + 'ms'
    }

    if (!output.trim()) {
      output = result.success ? '(命令执行成功，无输出)' : '(命令执行失败，无输出)'
    }

    // 截断过长输出
    const maxLen = 50000
    if (output.length > maxLen) {
      output = output.slice(0, maxLen) + `\n\n... [输出截断，共 ${result.stdout.length + result.stderr.length} 字符]`
    }

    return {
      success: result.success,
      content: output,
      error: result.error,
      metadata: {
        exitCode: result.exitCode,
        duration: result.duration,
        timedOut: result.timedOut,
        cwd: workDir,
      },
    }
  } catch (err: any) {
    return {
      success: false,
      content: `Bash 执行异常: ${err.message}`,
      error: err.message,
    }
  }
}