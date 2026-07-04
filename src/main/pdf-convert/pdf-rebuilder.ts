/**
 * JSON 标准化器 v7.10 (只保留 normalizeJson, 移除 PDF 重建)
 *
 * 支持 MinerU 返回的 4 种 JSON 格式:
 *   1. layout.json         - { pdf_info: [{ preproc_blocks, discarded_blocks, page_size, page_idx }] }
 *   2. content_list_v2.json - [[item, item], [item, item], ...] 嵌套数组
 *   3. model.json          - [[block, block], ...] 嵌套数组, 相对坐标
 *   4. content_list.json   - [item, item, ...] 扁平数组（按 page_idx 分组）
 *
 * v7.10 重构:
 *   - 删除 PDF 重建函数 (rebuildPdfFromLayout, rebuildSearchablePdf, generatePdfFromMarkdown)
 *   - 删除所有 pdf-lib / font-loader 引用
 *   - 只保留 normalizeJson + 类型定义 (被 html-renderer 使用)
 */

// ─── 统一标准化数据结构 ──────────────────────────────────

export interface NormalizedBlock {
  type: 'text' | 'title' | 'list' | 'image' | 'image_body' | 'table' | 'header' | 'footer' | 'discarded' | 'page_header' | 'page_footer' | 'table_caption' | 'table_body' | 'paragraph' | 'doc_title' | 'paragraph_title'
  bbox?: [number, number, number, number]
  content?: string           // 已提取的纯文本
  lines?: NormalizedLine[]   // 用于 layout.json 的细粒度行
  blocks?: NormalizedBlock[] // 嵌套块
  img_path?: string          // 图片/表格图片路径
  html?: string              // 表格 HTML
  level?: number             // v7.5: title level (1/2/3)
}

export interface NormalizedLine {
  bbox?: [number, number, number, number]
  content?: string
  spans?: Array<{ bbox?: [number, number, number, number]; content?: string; type?: string; image_path?: string }>
}

export interface NormalizedPage {
  page_idx: number
  page_size: [number, number]
  preproc_blocks: NormalizedBlock[]   // 正文
  headers: NormalizedBlock[]          // 页眉（独立）
  footers: NormalizedBlock[]          // 页脚（独立）
}

export type ImageCache = Map<string, Buffer>

/**
 * v7.5: Unicode 符号映射 (checkbox 等)
 */
// v9.8: 保留复选框/方框 Unicode 原样（☒☐□■），不再 ASCII 化，
// 以便 HTML 渲染时与原文方框观感一致（配合 CSS 符号字体）。
const SYMBOL_MAP: Record<string, string> = {
  '\u25cf': '*',   '\u25cb': 'o',   '\u2192': '->', '\u2190': '<-',
  '\u2022': '-',   '\u2713': 'V',   '\u2717': 'X',   '\u2605': '*',
  '\u2606': '*',   '\u2013': '-',   '\u2014': '--',
}

function mapSymbols(text: string): string {
  for (const [sym, ascii] of Object.entries(SYMBOL_MAP)) {
    text = text.split(sym).join(ascii)
  }
  return text
}

// ─── 智能 JSON 解析 ────────────────────────────────────

export function normalizeJson(data: any): { pages: NormalizedPage[]; format: string } {
  // 格式 1: layout.json - { pdf_info: [...] }
  if (data && typeof data === 'object' && Array.isArray(data.pdf_info)) {
    return { pages: data.pdf_info.map(normalizeLayoutPage), format: 'layout.json' }
  }

  // 格式 2 & 3: content_list_v2.json / model.json - [[items], [items]]
  if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
    return { pages: data.map((items, idx) => normalizeV2OrModelPage(items, idx, data as any[])), format: 'content_list_v2/model.json' }
  }

  // 格式 4: content_list.json - 扁平数组 [{...}, {...}], 按 page_idx 分组
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0])) {
    return { pages: groupByPageIdx(data), format: 'content_list.json' }
  }

  console.warn('[normalizeJson] 无法识别的 JSON 格式')
  return { pages: [], format: 'unknown' }
}

// ── layout.json 转换 ──

function normalizeLayoutPage(p: any): NormalizedPage {
  const blocks = (p.preproc_blocks ?? []).map(normalizeLayoutBlock)
  // discarded_blocks 分离为 headers 和 footers
  const discarded: NormalizedBlock[] = (p.discarded_blocks ?? []).map(normalizeLayoutBlock)
  const headers = discarded.filter(b => b.type === 'header' || b.type === 'page_header')
  const footers = discarded.filter(b => b.type === 'footer' || b.type === 'page_footer')
  return {
    page_idx: p.page_idx ?? 0,
    page_size: p.page_size ?? [595, 841],
    preproc_blocks: blocks,
    headers,
    footers,
  }
}

function normalizeLayoutBlock(b: any): NormalizedBlock {
  const lines: NormalizedLine[] | undefined = b.lines?.map((l: any) => ({
    bbox: l.bbox,
    spans: l.spans?.map((s: any) => ({
      bbox: s.bbox,
      content: s.content,
      type: s.type,
      image_path: s.image_path,
    })),
  }))

  // 对于 list 类型: 展开每个 item 为独立的 line
  let expandedLines: NormalizedLine[] | undefined = lines
  if (b.type === 'list' && b.blocks) {
    expandedLines = []
    for (const item of b.blocks) {
      if (item.lines) {
        for (const line of item.lines) {
          expandedLines.push({
            bbox: line.bbox,
            spans: line.spans?.map((s: any) => ({
              bbox: s.bbox,
              content: s.content,
              type: s.type,
              image_path: s.image_path,
            })),
          })
        }
      }
    }
  }

  // 递归提取 img_path 和 html（表格的图片路径常在嵌套 spans 里）
  let img_path: string | undefined = b.img_path ?? b.image_path
  let html: string | undefined = b.html
  const scan = (obj: any) => {
    if (!obj || typeof obj !== 'object') return
    if (obj.image_path && !img_path) img_path = obj.image_path
    if (obj.html && !html) html = obj.html
    if (Array.isArray(obj)) obj.forEach(scan)
    else Object.values(obj).forEach(scan)
  }
  if (b.blocks) b.blocks.forEach(scan)
  if (b.lines) b.lines.forEach(scan)

  // v7.4: 提取 content (优先用顶层, 降级从 lines/spans 提取)
  let extractedContent: string | undefined = b.content
  if (!extractedContent && b.lines && Array.isArray(b.lines)) {
    extractedContent = b.lines
      .map((l: any) => {
        if (l.content) return l.content
        if (l.spans && Array.isArray(l.spans)) {
          return l.spans.map((s: any) => s.content || '').join('')
        }
        return ''
      })
      .filter((s: string) => s.length > 0)
      .join(' ')
  }

  // 应用 Unicode 符号映射
  if (extractedContent) {
    extractedContent = mapSymbols(extractedContent)
  }

  return {
    type: (b.type ?? 'text') as NormalizedBlock['type'],
    bbox: b.bbox,
    content: extractedContent,
    lines: expandedLines,
    blocks: b.blocks?.map(normalizeLayoutBlock),
    img_path,
    html,
    level: b.level,
  }
}

// ── content_list_v2.json / model.json 转换 ──

function normalizeV2OrModelPage(items: any[], pageIdx: number, _allData: any[]): NormalizedPage {
  // 判断是否为 model.json（坐标是相对值 0-1）
  const isModel = items.some(it => Array.isArray(it.bbox) && it.bbox[0] > 0 && it.bbox[0] < 1)
  const pageSize: [number, number] = [595, 841]

  const blocks = items.map(item => normalizeV2Block(item, isModel, pageSize))
  // V2 的页眉页脚是 type: page_header / page_footer
  const headers = blocks.filter(b => b.type === 'page_header')
  const footers = blocks.filter(b => b.type === 'page_footer')
  const mainBlocks = blocks.filter(b => b.type !== 'page_header' && b.type !== 'page_footer')
  return { page_idx: pageIdx, page_size: pageSize, preproc_blocks: mainBlocks, headers, footers }
}

function normalizeV2Block(item: any, isModel: boolean, pageSize: [number, number]): NormalizedBlock {
  let bbox = item.bbox
  // model.json 的 bbox 是相对坐标，需要乘以页面尺寸
  if (isModel && Array.isArray(bbox) && bbox.length === 4) {
    bbox = [bbox[0] * pageSize[0], bbox[1] * pageSize[1], bbox[2] * pageSize[0], bbox[3] * pageSize[1]]
  }

  // 提取文本内容
  let content: string | undefined = item.text ?? item.content

  // content_list_v2 的嵌套结构
  if (!content && item.content) {
    const c = item.content
    if (c.paragraph_content) {
      content = c.paragraph_content.map((x: any) => x.content).filter(Boolean).join('')
    } else if (c.title_content) {
      content = c.title_content.map((x: any) => x.content).filter(Boolean).join('')
    } else if (c.page_header_content) {
      content = c.page_header_content.map((x: any) => x.content).filter(Boolean).join('\n')
    } else if (c.page_footer_content) {
      content = c.page_footer_content.map((x: any) => x.content).filter(Boolean).join('\n')
    } else if (c.list_items) {
      content = c.list_items.map((li: any) => {
        if (li.item_content) return li.item_content.map((x: any) => x.content).join('')
        return ''
      }).filter(Boolean).join('\n')
    } else if (c.table_caption) {
      content = c.table_caption.map((x: any) => x.content).filter(Boolean).join('\n')
    }
  }

  // 应用 Unicode 符号映射
  if (content) {
    content = mapSymbols(content)
  }

  // 提取 img_path
  let img_path: string | undefined
  if (item.img_path) {
    img_path = item.img_path
  } else if (item.content?.image_source?.path) {
    img_path = item.content.image_source.path
  } else if (item.image_path) {
    img_path = item.image_path
  }

  // 处理嵌套 blocks
  let blocks: NormalizedBlock[] | undefined
  if (item.blocks) {
    blocks = item.blocks.map((b: any) => normalizeV2Block(b, isModel, pageSize))
  }

  return {
    type: (item.type ?? 'text') as NormalizedBlock['type'],
    bbox,
    content,
    lines: content ? [{ content, bbox }] : undefined,
    blocks,
    img_path,
    html: item.content?.html,
    level: item.level,
  }
}

// ── content_list.json（扁平）转换 ──

function groupByPageIdx(items: any[]): NormalizedPage[] {
  const map = new Map<number, any[]>()
  for (const item of items) {
    const idx = item.page_idx ?? 0
    if (!map.has(idx)) map.set(idx, [])
    map.get(idx)!.push(item)
  }
  const sortedKeys = Array.from(map.keys()).sort((a, b) => a - b)
  return sortedKeys.map(idx => normalizeV2OrModelPage(map.get(idx)!, idx, items))
}
