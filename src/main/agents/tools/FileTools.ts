/**
 * FileTools - 文件读写编辑工具集
 *
 * 包含：Read, Write, Edit, MultiEdit, Glob, Grep
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ToolResult } from '../../../shared/agents/types'

// ============================================================================
// Read Tool
// ============================================================================

export interface ReadArgs {
  file_path: string
  offset?: number
  limit?: number
}

export async function executeRead(args: ReadArgs): Promise<ToolResult> {
  const { file_path, offset = 0, limit } = args

  if (!file_path) {
    return { success: false, content: '错误：必须提供 file_path 参数', error: 'INVALID_ARGUMENT' }
  }

  try {
    if (!fs.existsSync(file_path)) {
      return {
        success: false,
        content: `文件不存在: ${file_path}`,
        error: 'FILE_NOT_FOUND',
      }
    }

    const stat = fs.statSync(file_path)
    if (stat.isDirectory()) {
      return {
        success: false,
        content: `路径是目录而非文件: ${file_path}`,
        error: 'IS_DIRECTORY',
      }
    }

    const sizeKB = stat.size / 1024
    if (sizeKB > 1024 && !limit) {
      return {
        success: false,
        content: `文件过大 (${sizeKB.toFixed(1)}KB)。请使用 offset 和 limit 参数分段读取。`,
        error: 'FILE_TOO_LARGE',
      }
    }

    const content = fs.readFileSync(file_path, 'utf-8')
    const lines = content.split(/\r?\n/)

    let resultLines = lines
    if (offset > 0 || limit !== undefined) {
      const end = limit !== undefined ? Math.min(offset + limit, lines.length) : lines.length
      resultLines = lines.slice(offset, end)
    }

    const numberedLines = resultLines.map((line, idx) => {
      const lineNum = (offset + idx + 1).toString().padStart(5, ' ')
      return `${lineNum}\t${line}`
    })

    let output = `文件: ${file_path}\n共 ${lines.length} 行，显示 ${resultLines.length} 行\n\n`
    output += numberedLines.join('\n')

    return {
      success: true,
      content: output,
      metadata: {
        filePath: file_path,
        totalLines: lines.length,
        sizeBytes: stat.size,
      },
    }
  } catch (err: any) {
    return {
      success: false,
      content: `读取文件失败: ${err.message}`,
      error: err.message,
    }
  }
}

// ============================================================================
// Write Tool
// ============================================================================

export interface WriteArgs {
  file_path: string
  content: string
}

export async function executeWrite(args: WriteArgs): Promise<ToolResult> {
  const { file_path, content } = args

  if (!file_path || content === undefined) {
    return {
      success: false,
      content: '错误：必须提供 file_path 和 content 参数',
      error: 'INVALID_ARGUMENT',
    }
  }

  try {
    const dir = path.dirname(file_path)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(file_path, content, 'utf-8')
    const stat = fs.statSync(file_path)

    return {
      success: true,
      content: `文件已写入: ${file_path} (${(stat.size / 1024).toFixed(2)}KB)`,
      metadata: {
        filePath: file_path,
        sizeBytes: stat.size,
      },
      outputFiles: [file_path],
    }
  } catch (err: any) {
    return {
      success: false,
      content: `写入文件失败: ${err.message}`,
      error: err.message,
    }
  }
}

// ============================================================================
// Edit Tool
// ============================================================================

export interface EditArgs {
  file_path: string
  old_string: string
  new_string: string
}

export async function executeEdit(args: EditArgs): Promise<ToolResult> {
  const { file_path, old_string, new_string } = args

  if (!file_path || old_string === undefined || new_string === undefined) {
    return {
      success: false,
      content: '错误：必须提供 file_path、old_string 和 new_string 参数',
      error: 'INVALID_ARGUMENT',
    }
  }

  try {
    if (!fs.existsSync(file_path)) {
      return {
        success: false,
        content: `文件不存在: ${file_path}`,
        error: 'FILE_NOT_FOUND',
      }
    }

    const content = fs.readFileSync(file_path, 'utf-8')

    let occurrences = 0
    let idx = -1
    let searchFrom = 0
    while (true) {
      const found = content.indexOf(old_string, searchFrom)
      if (found === -1) break
      occurrences++
      idx = found
      searchFrom = found + old_string.length
    }

    if (occurrences === 0) {
      return {
        success: false,
        content: `未找到要替换的字符串。请检查 old_string 是否完全匹配文件内容。`,
        error: 'STRING_NOT_FOUND',
      }
    }

    if (occurrences > 1) {
      return {
        success: false,
        content: `找到 ${occurrences} 处匹配，无法确定替换位置。请提供更具体的 old_string。`,
        error: 'MULTIPLE_MATCHES',
      }
    }

    const newContent = content.slice(0, idx) + new_string + content.slice(idx + old_string.length)
    fs.writeFileSync(file_path, newContent, 'utf-8')

    return {
      success: true,
      content: `文件已编辑: ${file_path}\n位置: 第 ${content.slice(0, idx).split('\n').length} 行`,
      metadata: { filePath: file_path, position: idx },
      outputFiles: [file_path],
    }
  } catch (err: any) {
    return {
      success: false,
      content: `编辑文件失败: ${err.message}`,
      error: err.message,
    }
  }
}

// ============================================================================
// MultiEdit Tool
// ============================================================================

export interface MultiEditArgs {
  file_path: string
  edits: Array<{ old_string: string; new_string: string }>
}

export async function executeMultiEdit(args: MultiEditArgs): Promise<ToolResult> {
  const { file_path, edits } = args

  if (!file_path || !edits || !Array.isArray(edits) || edits.length === 0) {
    return {
      success: false,
      content: '错误：必须提供 file_path 和至少一个 edit 操作',
      error: 'INVALID_ARGUMENT',
    }
  }

  try {
    if (!fs.existsSync(file_path)) {
      return {
        success: false,
        content: `文件不存在: ${file_path}`,
        error: 'FILE_NOT_FOUND',
      }
    }

    let content = fs.readFileSync(file_path, 'utf-8')

    const editsWithPos = edits.map((e) => {
      const idx = content.indexOf(e.old_string)
      if (idx === -1) {
        throw new Error(`未找到字符串: "${e.old_string.slice(0, 50)}..."`)
      }
      return { ...e, idx }
    })

    editsWithPos.sort((a, b) => b.idx - a.idx)
    for (let i = 1; i < editsWithPos.length; i++) {
      const prev = editsWithPos[i - 1]
      const curr = editsWithPos[i]
      if (curr.idx + curr.old_string.length > prev.idx) {
        throw new Error('编辑范围存在重叠')
      }
    }

    for (const e of editsWithPos) {
      content = content.slice(0, e.idx) + e.new_string + content.slice(e.idx + e.old_string.length)
    }

    fs.writeFileSync(file_path, content, 'utf-8')

    return {
      success: true,
      content: `文件已应用 ${edits.length} 处编辑: ${file_path}`,
      metadata: { filePath: file_path, editCount: edits.length },
      outputFiles: [file_path],
    }
  } catch (err: any) {
    return {
      success: false,
      content: `MultiEdit 失败: ${err.message}`,
      error: err.message,
    }
  }
}

// ============================================================================
// Glob Tool
// ============================================================================

export interface GlobArgs {
  pattern: string
  path?: string
}

export async function executeGlob(args: GlobArgs, context: { workingDir: string | null }): Promise<ToolResult> {
  const { pattern, path } = args

  if (!pattern) {
    return { success: false, content: '错误：必须提供 pattern 参数', error: 'INVALID_ARGUMENT' }
  }

  const searchDir = path || context.workingDir || process.cwd()

  try {
    const files = globSync(searchDir, pattern)
    const sorted = files.sort()

    if (sorted.length === 0) {
      return {
        success: true,
        content: `未找到匹配 "${pattern}" 的文件（搜索目录: ${searchDir}）`,
        metadata: { searchDir, pattern, count: 0 },
      }
    }

    return {
      success: true,
      content: `找到 ${sorted.length} 个匹配文件:\n\n` + sorted.join('\n'),
      metadata: { searchDir, pattern, count: sorted.length },
    }
  } catch (err: any) {
    return {
      success: false,
      content: `Glob 失败: ${err.message}`,
      error: err.message,
    }
  }
}

/**
 * 简易 glob 匹配实现（支持 **、*、?）
 */
function globSync(baseDir: string, pattern: string): string[] {
  const results: string[] = []

  // 解析 glob 模式为正则
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // 转义正则特殊字符
    .replace(/\\\*\\\*/g, '::DOUBLESTAR::')
    .replace(/\\\*/g, '[^/]*')
    .replace(/::DOUBLESTAR::/g, '.*')
    .replace(/\\\?/g, '[^/]')
  const regex = new RegExp('^' + regexStr + '$')

  // 递归遍历目录
  const walk = (dir: string, relBase: string) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      // 跳过隐藏目录和 node_modules
      if (entry.name.startsWith('.') && entry.name !== '.') continue
      if (entry.name === 'node_modules') continue
      if (entry.name === '__pycache__') continue

      const fullPath = path.join(dir, entry.name)
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        walk(fullPath, relPath)
      } else if (entry.isFile()) {
        if (regex.test(relPath)) {
          results.push(relPath)
        }
      }
    }
  }

  walk(baseDir, '')

  // 限制结果数量
  return results.slice(0, 1000)
}

// ============================================================================
// Grep Tool
// ============================================================================

export interface GrepArgs {
  pattern: string
  path?: string
  include_glob?: string
  output_mode?: 'content' | 'files_with_matches' | 'count'
  context_lines?: number
}

export async function executeGrep(args: GrepArgs, context: { workingDir: string | null }): Promise<ToolResult> {
  const { pattern, path, include_glob, output_mode = 'content', context_lines = 2 } = args

  if (!pattern) {
    return { success: false, content: '错误：必须提供 pattern 参数', error: 'INVALID_ARGUMENT' }
  }

  const searchDir = path || context.workingDir || process.cwd()

  try {
    let regex: RegExp
    try {
      regex = new RegExp(pattern, 'g')
    } catch (err: any) {
      return { success: false, content: `无效的正则表达式: ${err.message}`, error: 'INVALID_REGEX' }
    }

    const matches: Array<{ file: string; line: number; content: string; contextBefore?: string[]; contextAfter?: string[] }> = []
    const fileMatches = new Set<string>()

    const allFiles = walkFiles(searchDir)

    // 应用 include_glob 过滤
    const filtered = include_glob
      ? allFiles.filter((f) => matchesGlob(f, include_glob))
      : allFiles

    for (const relFile of filtered) {
      // @ts-expect-error - path 模块类型推断
      const fullPath = path.join(searchDir || process.cwd(), relFile)
      let content: string
      try {
        content = fs.readFileSync(fullPath, 'utf-8')
      } catch {
        continue
      }

      const lines = content.split(/\r?\n/)
      const localMatches: number[] = []

      for (let i = 0; i < lines.length; i++) {
        regex.lastIndex = 0
        if (regex.test(lines[i])) {
          localMatches.push(i)
          fileMatches.add(relFile)
        }
      }

      if (output_mode === 'files_with_matches') continue

      for (const lineIdx of localMatches) {
        const beforeStart = Math.max(0, lineIdx - context_lines)
        const afterEnd = Math.min(lines.length, lineIdx + context_lines + 1)
        matches.push({
          file: relFile,
          line: lineIdx + 1,
          content: lines[lineIdx],
          contextBefore: lines.slice(beforeStart, lineIdx),
          contextAfter: lines.slice(lineIdx + 1, afterEnd),
        })
      }
    }

    if (output_mode === 'count') {
      const countByFile = new Map<string, number>()
      matches.forEach((m) => countByFile.set(m.file, (countByFile.get(m.file) || 0) + 1))
      const lines = Array.from(countByFile.entries()).map(([f, c]) => `${f}: ${c}`)
      return {
        success: true,
        content: `共 ${matches.length} 处匹配:\n\n` + lines.join('\n'),
        metadata: { totalMatches: matches.length, files: fileMatches.size },
      }
    }

    if (output_mode === 'files_with_matches') {
      return {
        success: true,
        content: `匹配 ${fileMatches.size} 个文件:\n\n` + Array.from(fileMatches).sort().join('\n'),
        metadata: { files: fileMatches.size },
      }
    }

    if (matches.length === 0) {
      return {
        success: true,
        content: `未找到匹配 "${pattern}" 的内容`,
        metadata: { count: 0 },
      }
    }

    const formatted = matches
      .slice(0, 200)
      .map((m) => {
        const before = m.contextBefore?.map((l) => `  ${l}`).join('\n') || ''
        const after = m.contextAfter?.map((l) => `  ${l}`).join('\n') || ''
        return `${m.file}:${m.line}\n${before}\n> ${m.content}\n${after}`
      })
      .join('\n---\n')

    return {
      success: true,
      content: `找到 ${matches.length} 处匹配${matches.length > 200 ? '（仅显示前 200）' : ''}:\n\n${formatted}`,
      metadata: { totalMatches: matches.length, files: fileMatches.size },
    }
  } catch (err: any) {
    return {
      success: false,
      content: `Grep 失败: ${err.message}`,
      error: err.message,
    }
  }
}

function walkFiles(dir: string): string[] {
  const results: string[] = []
  const walk = (d: string, base: string) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue
      if (entry.name === 'node_modules') continue
      if (entry.name === '__pycache__') continue

      const full = path.join(d, entry.name)
      const rel = base ? `${base}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        walk(full, rel)
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(full)
          if (stat.size < 1024 * 1024) {
            results.push(rel)
          }
        } catch {}
      }
    }
  }
  walk(dir, '')
  return results
}

function matchesGlob(filePath: string, globPattern: string): boolean {
  const regexStr = globPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\*\\\*/g, '::DOUBLESTAR::')
    .replace(/\\\*/g, '[^/]*')
    .replace(/::DOUBLESTAR::/g, '.*')
    .replace(/\\\?/g, '[^/]')
  const regex = new RegExp('^' + regexStr + '$')
  return regex.test(filePath)
}