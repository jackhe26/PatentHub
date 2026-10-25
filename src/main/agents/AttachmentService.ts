/**
 * AttachmentService - Agent 通用文件上传落盘服务
 *
 * 核心原则：「附件即工作目录里的真实文件」。
 * 上传的文件会原样写入 baseDir/attachments/<sessionId>/，
 * 并同时用主进程 file-parser 抽取正文，供非视觉模型理解。
 *
 * 模型通过工具（Read/Bash/Glob/Skill）处理这些真实文件，
 * 让任意 skill（PPT、文档、代码等）都能工作。
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import type { AgentAttachment } from '../../shared/agents/types'
import { parseFile } from '../file-parser'

export interface IncomingAttachmentFile {
  name: string
  /** 点选/拖拽等拿得到真实路径时提供 */
  path?: string
  /** 无 path（如粘贴）时提供原始字节 */
  bytes?: Uint8Array
}

export interface AddAttachmentOptions {
  baseDir: string
  sessionId: string
  files: IncomingAttachmentFile[]
}

const kindFromExt = (name: string): AgentAttachment['kind'] => {
  const ext = path.extname(name).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) return 'image'
  if (ext === '.pdf') return 'pdf'
  if (['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.wps', '.dps', '.et', '.odt', '.odp', '.ods'].includes(ext))
    return 'doc'
  if (
    [
      '.txt',
      '.md',
      '.mdx',
      '.html',
      '.htm',
      '.xml',
      '.json',
      '.csv',
      '.tsv',
      '.log',
      '.yaml',
      '.yml',
      '.rtf',
      '.py',
      '.js',
      '.ts',
      '.go',
      '.java',
      '.c',
      '.cpp',
      '.sql',
    ].includes(ext)
  )
    return 'text'
  return 'other'
}

const sessionDir = (baseDir: string, sessionId: string) => path.join(baseDir, 'attachments', sessionId)

export class AttachmentService {
  /** 写入单个附件，返回落盘后的描述 */
  async writeOne(baseDir: string, sessionId: string, file: IncomingAttachmentFile): Promise<AgentAttachment> {
    const dir = sessionDir(baseDir, sessionId)
    fs.mkdirSync(dir, { recursive: true })

    const safeName = path.basename(file.name || 'file')
    const id = uuidv4()
    const fileName = `${id}-${safeName}`
    const absPath = path.join(dir, fileName)

    if (file.path) {
      fs.copyFileSync(file.path, absPath)
    } else if (file.bytes) {
      fs.writeFileSync(absPath, file.bytes as Uint8Array)
    } else {
      throw new Error('附件缺少文件内容(path 或 bytes)')
    }

    const stat = fs.statSync(absPath)
    const kind = kindFromExt(safeName)

    let text: string | undefined
    let ocrNeeded = false
    let pages: number | undefined

    // 仅对"可抽文本"的非图片文档抽取正文，供模型理解
    if (kind !== 'image') {
      try {
        const extracted = await parseFile(absPath)
        if (extracted && extracted.trim().length > 0) {
          text = extracted
        } else if (kind === 'pdf') {
          ocrNeeded = true
        }
      } catch (err) {
        // 解析失败不阻断：把文件落在磁盘，模型仍可自行处理
        console.warn('[AttachmentService] parseFile failed:', safeName, (err as Error)?.message)
        if (kind === 'pdf') ocrNeeded = true
      }
    }

    return {
      id,
      name: safeName,
      absPath,
      relPath: path.relative(baseDir, absPath),
      size: stat.size,
      mime: '',
      kind,
      text,
      isImage: kind === 'image',
      ocrNeeded,
      pages,
    }
  }

  /** 批量写入 */
  async add(options: AddAttachmentOptions): Promise<AgentAttachment[]> {
    const results: AgentAttachment[] = []
    for (const file of options.files) {
      const att = await this.writeOne(options.baseDir, options.sessionId, file)
      results.push(att)
    }
    return results
  }

  /** 列出某会话已落盘的附件（回读 manifest 或扫描目录） */
  list(baseDir: string, sessionId: string): AgentAttachment[] {
    const dir = sessionDir(baseDir, sessionId)
    if (!fs.existsSync(dir)) return []
    const manifestPath = path.join(dir, '.manifest.json')
    if (fs.existsSync(manifestPath)) {
      try {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as AgentAttachment[]
      } catch {
        // fallthrough to directory scan
      }
    }
    return []
  }

  /** 删除某会话的附件目录 */
  cleanup(baseDir: string, sessionId: string) {
    const dir = sessionDir(baseDir, sessionId)
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
}

export const attachmentService = new AttachmentService()
