/**
 * IntegrationTools - 集成工具
 *
 * 包含：ImageGen（图片生成）、KnowledgeBase（知识库）、WebSearch（联网）、WebFetch（网页抓取）
 *
 * 这些工具包装 PatentHub 现有的功能模块。
 *
 * 注意：IntegrationTools 位于主进程，但 imageGenerationStore / knowledgeBase / webSearch
 * 位于渲染进程。为了让主进程可调用，使用 IPC 转发（通过 LLM Bridge 类似的模式）。
 * 简化方案：使用 @ts-expect-error 标记跨进程动态 import。
 */

import type { ToolResult } from '../../../shared/agents/types'

// ============================================================================
// ImageGen Tool
// ============================================================================

export interface ImageGenArgs {
  prompt: string
  model?: string
  size?: '1024x1024' | '1024x1792' | '1792x1024'
}

/**
 * 图片生成：通过 IPC 转发到渲染进程调用
 */
export async function executeImageGen(args: ImageGenArgs): Promise<ToolResult> {
  const { prompt, model, size = '1024x1024' } = args

  if (!prompt) {
    return { success: false, content: '错误：必须提供 prompt 参数', error: 'INVALID_ARGUMENT' }
  }

  try {
    // 主进程通过 IPC 触发渲染进程执行图片生成
    const api = (global as any).api || (require('electron').ipcMain ? null : null)
    // 简化方案：返回提示（实际生产应通过 IPC 桥接）
    return {
      success: false,
      content: `图片生成需要渲染进程支持。请通过 IPC 桥接调用 imageGenManager.generate()。
参数：prompt="${prompt}", model="${model || 'default'}", size="${size}"

MVP 阶段：可通过 webContents.send 转发到 renderer 端处理`,
      error: 'NOT_IMPLEMENTED_IN_MAIN',
    }
  } catch (err: any) {
    return {
      success: false,
      content: `图片生成失败: ${err.message}`,
      error: err.message,
    }
  }
}

// ============================================================================
// KnowledgeBase Tool
// ============================================================================

export interface KnowledgeBaseArgs {
  query: string
  kbId?: string
  topK?: number
}

/**
 * 知识库检索：通过 IPC 转发到渲染进程
 */
export async function executeKnowledgeBase(args: KnowledgeBaseArgs): Promise<ToolResult> {
  const { query, kbId, topK = 5 } = args

  if (!query) {
    return { success: false, content: '错误：必须提供 query 参数', error: 'INVALID_ARGUMENT' }
  }

  try {
    return {
      success: false,
      content: `知识库检索需要通过 IPC 桥接调用渲染进程模块。
参数：query="${query}", kbId="${kbId || ''}", topK=${topK}`,
      error: 'NOT_IMPLEMENTED_IN_MAIN',
    }
  } catch (err: any) {
    return {
      success: false,
      content: `知识库检索失败: ${err.message}`,
      error: err.message,
    }
  }
}

// ============================================================================
// WebSearch Tool
// ============================================================================

export interface WebSearchArgs {
  query: string
}

/**
 * 联网搜索：直接通过 fetch 实现（无需跨进程）
 */
export async function executeWebSearch(args: WebSearchArgs): Promise<ToolResult> {
  const { query } = args

  if (!query) {
    return { success: false, content: '错误：必须提供 query 参数', error: 'INVALID_ARGUMENT' }
  }

  try {
    // MVP: 直接通过 fetch 尝试通用搜索引擎（可在 production 替换为 PatentHub 现有 webSearch 服务）
    return {
      success: false,
      content: `联网搜索需要通过 IPC 桥接调用渲染进程的 webSearchService。
参数：query="${query}"

建议：实现 IPC 转发模式，将请求发送给渲染进程调用现有 webSearchService。`,
      error: 'NOT_IMPLEMENTED_IN_MAIN',
    }
  } catch (err: any) {
    return {
      success: false,
      content: `联网搜索失败: ${err.message}`,
      error: err.message,
    }
  }
}

// ============================================================================
// WebFetch Tool
// ============================================================================

export interface WebFetchArgs {
  url: string
  prompt?: string
}

/**
 * 网页抓取：主进程可直接用 fetch 实现
 */
export async function executeWebFetch(args: WebFetchArgs): Promise<ToolResult> {
  const { url, prompt } = args

  if (!url) {
    return { success: false, content: '错误：必须提供 url 参数', error: 'INVALID_ARGUMENT' }
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { success: false, content: `不支持的协议: ${parsedUrl.protocol}`, error: 'INVALID_URL' }
    }
  } catch (err: any) {
    return { success: false, content: `无效的 URL: ${url}`, error: 'INVALID_URL' }
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PatentHub-Agent/1.0)',
      },
      redirect: 'follow',
    })

    if (!response.ok) {
      return {
        success: false,
        content: `HTTP ${response.status}: ${response.statusText}`,
        error: `HTTP_${response.status}`,
      }
    }

    const contentType = response.headers.get('content-type') || ''
    let content = await response.text()

    if (contentType.includes('text/html')) {
      content = stripHtml(content)
    }

    const maxLen = 30000
    const truncated = content.length > maxLen
    content = truncated ? content.slice(0, maxLen) + '\n\n...[内容截断]' : content

    let output = `# 网页内容: ${url}\n\n类型: ${contentType}\n大小: ${content.length} 字符\n\n`
    if (prompt) {
      output += `**提取重点**: ${prompt}\n\n`
    }
    output += content

    return {
      success: true,
      content: output,
      metadata: {
        url,
        contentType,
        sizeBytes: content.length,
        truncated,
      },
    }
  } catch (err: any) {
    return {
      success: false,
      content: `抓取失败: ${err.message}`,
      error: err.message,
    }
  }
}

/**
 * 简单 HTML 标签剥离
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}