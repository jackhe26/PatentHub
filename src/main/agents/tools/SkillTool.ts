/**
 * SkillTool - Skills 作为工具调用
 *
 * 提供两个工具：
 * - Skill: 读取 SKILL.md 全文
 * - SkillScript: 执行 Skill 中的脚本
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import type { ToolResult } from '../../../shared/agents/types'
import { runShell } from '../shellRunner'
import { getDatabase } from '../../skills/database'

const SKILLS_DIR = () => path.join(app.getPath('userData'), 'agents-skills', 'skills')

// ============================================================================
// Skill Tool - 读取 SKILL.md
// ============================================================================

export interface SkillArgs {
  skillId: string
}

export async function executeSkillTool(
  args: SkillArgs,
  context: { agentId: string }
): Promise<ToolResult> {
  const { skillId } = args

  if (!skillId) {
    return { success: false, content: '错误：必须提供 skillId 参数', error: 'INVALID_ARGUMENT' }
  }

  try {
    const db = getDatabase()
    const queryResult = await db.execute({
      sql: 'SELECT id, name, description, folder_name FROM agent_skills WHERE id = ?',
      args: [skillId],
    })

    if (queryResult.rows.length === 0) {
      return {
        success: false,
        content: `Skill 不存在: ${skillId}`,
        error: 'SKILL_NOT_FOUND',
      }
    }

    const skill = queryResult.rows[0]
    const folderName = skill.folder_name as string
    const skillMdPath = path.join(SKILLS_DIR(), folderName, 'SKILL.md')

    if (!fs.existsSync(skillMdPath)) {
      return {
        success: false,
        content: `SKILL.md 不存在: ${skillMdPath}`,
        error: 'SKILL_FILE_NOT_FOUND',
      }
    }

    const content = fs.readFileSync(skillMdPath, 'utf-8')
    const maxLen = 30000
    const truncated = content.length > maxLen
    const output = truncated ? content.slice(0, maxLen) + '\n\n...[内容截断]' : content

    return {
      success: true,
      content: `# Skill: ${skill.name}\n\n${output}`,
      metadata: {
        skillId,
        name: skill.name,
        description: skill.description,
        folderName,
        sizeBytes: content.length,
        truncated,
      },
    }
  } catch (err: any) {
    return {
      success: false,
      content: `读取 Skill 失败: ${err.message}`,
      error: err.message,
    }
  }
}

// ============================================================================
// SkillScript Tool - 执行 Skill 中的脚本
// ============================================================================

export interface SkillScriptArgs {
  skillId: string
  scriptName: string
  args?: string[]
}

export async function executeSkillScript(
  args: SkillScriptArgs,
  context: { gitBashPath: string | null; workingDir: string | null; env: Record<string, string> }
): Promise<ToolResult> {
  const { skillId, scriptName, args: scriptArgs = [] } = args

  if (!skillId || !scriptName) {
    return {
      success: false,
      content: '错误：必须提供 skillId 和 scriptName 参数',
      error: 'INVALID_ARGUMENT',
    }
  }

  try {
    const db = getDatabase()
    const queryResult = await db.execute({
      sql: 'SELECT folder_name FROM agent_skills WHERE id = ?',
      args: [skillId],
    })

    if (queryResult.rows.length === 0) {
      return {
        success: false,
        content: `Skill 不存在: ${skillId}`,
        error: 'SKILL_NOT_FOUND',
      }
    }

    const folderName = queryResult.rows[0].folder_name as string
    const scriptPath = path.join(SKILLS_DIR(), folderName, scriptName)

    if (!fs.existsSync(scriptPath)) {
      return {
        success: false,
        content: `脚本不存在: ${scriptName}`,
        error: 'SCRIPT_NOT_FOUND',
      }
    }

    const ext = path.extname(scriptName).toLowerCase()

    let cmd: string
    let cmdArgs: string[]

    if (ext === '.sh' || ext === '.bash') {
      cmd = process.platform === 'win32' ? context.gitBashPath || 'bash' : '/bin/bash'
      cmdArgs = [scriptPath, ...scriptArgs]
    } else if (ext === '.py') {
      cmd = process.platform === 'win32' ? 'python' : 'python3'
      cmdArgs = [scriptPath, ...scriptArgs]
    } else if (ext === '.js' || ext === '.mjs') {
      cmd = 'node'
      cmdArgs = [scriptPath, ...scriptArgs]
    } else {
      return {
        success: false,
        content: `不支持的脚本类型: ${ext}`,
        error: 'UNSUPPORTED_SCRIPT_TYPE',
      }
    }

    const cmdLine = `${cmd} ${cmdArgs.map(a => `"${a}"`).join(' ')}`
    const shellResult = await runShell({
      command: cmdLine,
      gitBashPath: context.gitBashPath,
      cwd: context.workingDir || path.dirname(scriptPath),
      env: context.env,
      timeout: 60000,
    })

    let output = ''
    if (shellResult.stdout) output += shellResult.stdout
    if (shellResult.stderr) output += (output ? '\n\n' : '') + '**[stderr]**\n' + shellResult.stderr
    if (!output.trim()) output = '(脚本执行完成，无输出)'

    return {
      success: shellResult.success,
      content: output,
      error: shellResult.error,
      metadata: {
        scriptPath,
        exitCode: shellResult.exitCode,
        duration: shellResult.duration,
      },
    }
  } catch (err: any) {
    return {
      success: false,
      content: `执行 Skill 脚本失败: ${err.message}`,
      error: err.message,
    }
  }
}