/**
 * attachmentPreprocess - Agent 附件预处理（渲染层）
 *
 * 职责：
 * 1. 分类文件（图片/文档/文本/其他）
 * 2. 图片 → 读取为 dataURL（供预览与视觉模型 image_url）
 * 3. 文档/文本 → 通过主进程落盘（agents:addAttachments），得到 AgentAttachment 描述
 * 4. 简单判断模型是否视觉能力（决定是否把图片作为 image_url 注入消息）
 */

import type { AgentAttachment } from '../../../shared/agents/types'
import { allSupportedExts } from '@shared/file-extensions'

const api = (
  window as unknown as {
    electronAPI: {
      agents: {
        addAttachments: (params: {
          agentId: string
          sessionId: string
          files: Array<{ name: string; path?: string; bytes?: Uint8Array }>
        }) => Promise<AgentAttachment[]>
        cleanupAttachments: (params: { agentId: string; sessionId: string }) => Promise<boolean>
      }
    }
  }
).electronAPI

/**
 * 输入框 accept 串：图片 + 主程序支持的全部文档/文本类型
 *
 * 说明：早期这里是手写的短列表（缺少 .wps/.et/.dps/.odt/.ods/.odp/.mdx/.yaml 等），
 * 会导致「添加附件」时 Windows 文件对话框把用户实际拥有的文件全部过滤掉（文件列表看起来是空白）。
 * 现在复用 `@shared/file-extensions` 的权威列表，保证与「设置 → 文档解析」支持的格式一致。
 */
export const AGENT_ATTACHMENT_ACCEPT = Array.from(
  new Set([
    // 图片（Agent 附件按钮同时支持图片，主程序的图片上传是独立入口，故此处单独补充）
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.bmp',
    '.svg',
    // 文档 / 文本 / 代码（与主程序支持的格式保持一致）
    ...allSupportedExts,
  ])
).join(',')

export type AttachmentKind = 'image' | 'pdf' | 'doc' | 'text' | 'other'

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']
const DOC_EXT = [
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.wps',
  '.dps',
  '.et',
  '.odt',
  '.odp',
  '.ods',
]
const TEXT_EXT = [
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
  '.tsx',
  '.jsx',
  '.go',
  '.java',
  '.c',
  '.cpp',
  '.sql',
  '.conf',
  '.ini',
]

export function classify(name: string, mime = ''): AttachmentKind {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (
    mime.startsWith('image/') ||
    IMAGE_EXT.includes(`.${ext}`) ||
    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)
  ) {
    return 'image'
  }
  if (DOC_EXT.includes(`.${ext}`) || mime === 'application/pdf') return ext === 'pdf' ? 'pdf' : 'doc'
  if (TEXT_EXT.includes(`.${ext}`) || mime.startsWith('text/')) return 'text'
  return 'other'
}

export function isImageFile(file: File): boolean {
  return classify(file.name, file.type) === 'image'
}

/** 读取图片为 dataURL（供预览与 image_url） */
export function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

/** 简单判断模型是否具有视觉能力（关键词启发式） */
export function isVisionModel(modelId: string): boolean {
  const id = (modelId || '').toLowerCase()
  const tokens = [
    'vl',
    'vision',
    '4o',
    '4.5',
    'gemini',
    'glm-4v',
    'qvq',
    'internvl',
    'minicpm-v',
    'llava',
    'gpt-4o',
    'omni',
  ]
  return tokens.some((t) => id.includes(t))
}

/** 把文件落盘到主进程，返回 AgentAttachment[]（无 path 时读 bytes 传输） */
export async function ingestToDisk(params: {
  agentId: string
  sessionId: string
  files: File[]
}): Promise<AgentAttachment[]> {
  // 对没有原生 path 的文件，先转成 Uint8Array（IPC 只序列化可结构化克隆的内容）
  const files = await Promise.all(
    params.files.map(async (file) => {
      const nativePath = (file as File & { path?: string }).path
      if (nativePath) return { name: file.name, path: nativePath }
      const buf = await file.arrayBuffer()
      return { name: file.name, bytes: new Uint8Array(buf) }
    })
  )

  return api.agents.addAttachments({ agentId: params.agentId, sessionId: params.sessionId, files })
}

/** 会话结束后清理附件 */
export async function cleanupAttachments(params: { agentId: string; sessionId: string }): Promise<void> {
  try {
    await api.agents.cleanupAttachments(params)
  } catch (err) {
    console.warn('[attachmentPreprocess] cleanup failed', err)
  }
}
