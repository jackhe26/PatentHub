/**
 * JSON → HTML 渲染器 v7.5
 *
 * v7.5 方案 K: FONT_PRESETS 优先 + 溢出自动缩放
 *  - 80% 场景: 直接用 FONT_PRESETS 字号
 *  - 20% 复杂场景 (长文本): 检测 bbox 溢出, 按比例自动缩小
 *  - 配合 overflow: hidden, 文字不重叠到下方块
 */

import type { NormalizedBlock, NormalizedPage, NormalizedLine } from './pdf-rebuilder'

// ─── 字号预设 (方案 H: 6 级体系) ─────────────────────────────

const FONT_PRESETS: Record<string, number> = {
  doc_title:       16,
  title:           14,
  paragraph_title: 14,
  text:            12,
  paragraph:       12,
  list:            10,
  table_caption:   10,
  table:            9,
  table_body:       9,
  header:           9,
  footer:           9,
  page_header:      9,
  page_footer:      9,
  discarded:        8,
  image:           10,
  image_body:      10,
}

function getBaseFontSize(b: NormalizedBlock, presets: Record<string, number>): number {
  if (b.type === 'title' && (b as any).level !== undefined) {
    const level = (b as any).level as number
    if (level === 1) return 16
    if (level === 2) return 14
    if (level === 3) return 13
    return 12
  }
  return presets[b.type] ?? 12
}

function getAutoFitFontSize(b: NormalizedBlock, baseSize: number): number {
  let fontSize = Math.max(6, Math.min(20, baseSize))
  if (!b.bbox || !b.content) return fontSize
  const [x0, y0, x1, y1] = b.bbox
  const width = Math.max(x1 - x0, 1)
  const height = Math.max(y1 - y0, 1)
  const textLen = b.content.length
  if (textLen === 0) return fontSize
  const optimal = Math.sqrt(
    (width * height * 1.1) / (textLen * 0.55 * 1.35)
  )
  fontSize = Math.min(fontSize, optimal)
  fontSize = Math.max(6, fontSize)
  return Math.round(fontSize * 10) / 10
}

// ─── 样式配置 ─────────────────────────────────────

const DEFAULT_CSS = `
  body {
    font-family: 'Times New Roman', 'SimSun', 'Segoe UI Symbol', 'Arial Unicode MS', serif;
    font-size: 12px;
    line-height: 1.35;
    margin: 0;
    padding: 20px 0;
    background: #e8e8e8;
  }
  .page {
    background: white;
    margin: 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    position: relative;
    overflow: hidden;
    page-break-after: auto;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .page:last-child {
    page-break-after: auto;
    break-after: auto;
  }
  .abs-item {
    position: absolute;
    box-sizing: border-box;
    overflow: hidden;
    margin: 0;
    padding: 0;
  }
  .abs-item.text-block {
    padding: 0 2px;
    word-wrap: break-word;
    white-space: pre-line;
  }
  .abs-item.title {
    font-weight: bold;
    overflow: visible;
    white-space: nowrap;
    text-align: center;
  }
  .pct-title {
    display: block;
    font-size: 32px !important;
    font-weight: 900 !important;
    color: #000;
    letter-spacing: 4px;
    text-align: center;
    line-height: 1.2;
    margin: 8px 0 4px 0;
  }
  .pct-follow {
    font-size: 12px;
    font-weight: bold;
    line-height: 1.3;
  }
  .abs-item.list-item {
    display: flex;
    align-items: flex-start;
  }
  .abs-item.list-item .checkbox {
    flex: 0 0 12px;
    font-size: 10px;
    line-height: 1.2;
  }
  .abs-item.list-item .text {
    flex: 1;
  }
  .abs-item.table-caption {
    font-weight: bold;
    padding: 0 2px;
  }
  .abs-item.decl-table table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .abs-item.decl-table col.decl-c1 { width: 40%; }
  .abs-item.decl-table col.decl-c2 { width: 12%; }
  .abs-item.decl-table col.decl-c3 { width: 48%; }
  .abs-item.decl-table td {
    border: none;
    padding: 0 4px;
    vertical-align: top;
    line-height: 1.35;
    white-space: nowrap;
  }
  .abs-item.decl-table td.decl-col1 { white-space: normal; }
  .abs-item.decl-table .decl-claimno {
    display: inline;
    margin-left: 16px;
    text-decoration: underline;
    white-space: nowrap;
  }
  .abs-item.table-block table {
    width: 100%;
    height: 100%;
    border-collapse: collapse;
    table-layout: auto;
  }
  .abs-item.table-block table td,
  .abs-item.table-block table th {
    border: 1px solid #333;
    padding: 1px 2px;
    vertical-align: top;
    line-height: 1.2;
  }
  .abs-item.table-block.ph-legal-table table {
    border-collapse: collapse;
    table-layout: auto;
    width: 100%;
  }
  .abs-item.table-block.ph-legal-table col.ph-col-1 { width: 30%; }
  .abs-item.table-block.ph-legal-table col.ph-col-2 { width: 20%; }
  .abs-item.table-block.ph-legal-table col.ph-col-3 { width: 50%; }
  .abs-item.table-block.ph-legal-table td.ph-no-border {
    border: none !important;
    background: transparent;
  }
  .abs-item.table-block.ph-legal-table td.ph-bottom-border {
    border: none !important;
    border-bottom: 1.5px solid #333 !important;
    box-shadow: inset 0 -1px 0 #333;
  }
  .abs-item.table-block.ph-legal-table td.ph-col-2 {
    white-space: nowrap;
  }
  .abs-item.table-block.ph-legal-table {
    overflow: visible !important;
  }
  .abs-item.image img {
    width: 100%;
    height: 100%;
    display: block;
  }
  .abs-item.page-header,
  .abs-item.page-footer {
    color: #000;
    font-weight: bold;
    text-align: center;
  }
  .abs-item.header-section,
  .abs-item.footer-section {
    background: rgba(255, 255, 255, 0.9);
  }
  @media print {
    body { background: white; padding: 0 !important; margin: 0 !important; }
    .page { box-shadow: none; margin: 0; }
  }
`

// ─── 特殊表格检测 (v7.7) ─────────────────────────────

function detectSpecialLegalTable(html: string): boolean {
  if (!html) return false
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []
  if (rows.length < 2) return false

  let foundYesOrNo = false
  let foundNumericColumn = false

  // v10.2: 不再要求每行恰好 3 个单元格 —— rowspan 会让部分行只有 2 个 <td>。
  // 改为扫描所有单元格：只要存在「Yes/No: Claims」单元格 + 存在「纯数字序号」单元格即判定。
  for (const row of rows) {
    const cellMatches = row.match(/<td[\s\S]*?<\/td>/gi) ?? []
    for (const cellHtml of cellMatches) {
      const text = cellHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      if (/^(Yes|No|Oui|Non)\s*[:：]\s*(Claims|Revendications)\s*$/i.test(text)) {
        foundYesOrNo = true
      }
      if (/^[\d]+(?:\s*[-,]\s*\d+)*$/.test(text)) {
        foundNumericColumn = true
      }
    }
  }

  return foundYesOrNo && foundNumericColumn
}

function applySpecialLegalTableStyle(html: string): string {
  const rowRegex = /<tr[\s\S]*?<\/tr>/gi
  const rows = html.match(rowRegex) ?? []
  const colOccupiedUntil: number[] = []

  const newRows = rows.map((rowMatch, rowIdx) => {
    const tdRegex = /<td([^>]*)>([\s\S]*?)<\/td>/gi
    const cells: { match: string; attrs: string; content: string; rowspan: number; colspan: number }[] = []
    for (const m of rowMatch.matchAll(tdRegex)) {
      const attrs = m[1] || ''
      const content = m[2] || ''
      const rowspanMatch = attrs.match(/rowspan\s*=\s*["']?(\d+)/i)
      const colspanMatch = attrs.match(/colspan\s*=\s*["']?(\d+)/i)
      const rowspan = rowspanMatch ? parseInt(rowspanMatch[1], 10) : 1
      const colspan = colspanMatch ? parseInt(colspanMatch[1], 10) : 1
      cells.push({ match: m[0], attrs, content, rowspan, colspan })
    }

    let prefix = ''
    if (rowIdx === 0) {
      prefix = '<colgroup><col class="ph-col-1"><col class="ph-col-2"><col class="ph-col-3"></colgroup>'
    }

    const newRowParts: string[] = []
    let col = 0
    for (const cell of cells) {
      while (col < colOccupiedUntil.length && colOccupiedUntil[col] > rowIdx) {
        col++
      }
      let newClass = ''
      if (col === 0) newClass = 'ph-no-border ph-col-1'
      else if (col === 1) newClass = 'ph-no-border ph-col-2'
      else if (col === 2) newClass = 'ph-bottom-border ph-col-3'
      else newClass = 'ph-no-border'

      for (let c = col; c < col + cell.colspan; c++) {
        while (colOccupiedUntil.length <= c) colOccupiedUntil.push(-1)
        if (cell.rowspan > 1) {
          colOccupiedUntil[c] = rowIdx + cell.rowspan
        }
      }

      const classMatch = cell.attrs.match(/class\s*=\s*["']([^"']*)["']/i)
      let newAttrs = cell.attrs
      if (classMatch) {
        newAttrs = cell.attrs.replace(/class\s*=\s*["'][^"']*["']/i, `class="${classMatch[1]} ${newClass}"`)
      } else {
        newAttrs = cell.attrs + ` class="${newClass}"`
      }

      newRowParts.push(`<td${newAttrs}>${cell.content}</td>`)
      col += cell.colspan
    }

    const trOpenMatch = rowMatch.match(/<tr[^>]*>/i)
    const trOpen = trOpenMatch ? trOpenMatch[0] : '<tr>'
    return trOpen + prefix + newRowParts.join('') + '</tr>'
  })

  return newRows.join('')
}

// ─── 声明三元组（Déclaration / Statement）多语种重组 (v10.0) ─────

// 多语种 "Yes" / "No" 关键词
const YES_WORDS = ['Yes', 'Oui', 'Ja', 'Sí', 'Si', 'はい', '예', '是', '有']
const NO_WORDS = ['No', 'Non', 'Nein', 'いいえ', '아니', '否', '无', '無']
const YES_RE = new RegExp(`(?:${YES_WORDS.join('|')})\\s*[:：]`, 'i')
const NO_RE = new RegExp(`(?:${NO_WORDS.join('|')})\\s*[:：]`, 'i')

interface DeclRow {
  label: string
  yesClaims: string
  noClaims: string
}

/**
 * 判断一个文本块是否为"声明三元组"行：含 Yes: 且含 No:（多语种）
 */
function isDeclarationBlock(b: NormalizedBlock): boolean {
  if (b.type !== 'text') return false
  const t = b.content ?? extractContentFromLines(b.lines)
  if (!t) return false
  return YES_RE.test(t) && NO_RE.test(t)
}

/**
 * 把声明块的拼接文本拆成 { label, yesClaims, noClaims }
 * 例: "Nouveauté Oui : Revendications 1-19\nNon : Revendications"
 *  -> label="Nouveauté", yesClaims="Revendications 1-19", noClaims="Revendications"
 */
function parseDeclaration(text: string): DeclRow {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const yesMatch = YES_RE.exec(normalized)
  const noMatch = NO_RE.exec(normalized)
  if (!yesMatch || !noMatch) {
    return { label: normalized, yesClaims: '', noClaims: '' }
  }
  const yesIdx = yesMatch.index
  const noIdx = noMatch.index
  const label = normalized.slice(0, yesIdx).trim()
  const yesWord = yesMatch[0]
  const noWord = noMatch[0]
  // Yes 段：从 Yes: 后到 No: 前
  const yesClaims = normalized.slice(yesIdx + yesWord.length, noIdx).trim()
  // No 段：从 No: 后到结尾
  const noClaims = normalized.slice(noIdx + noWord.length).trim()
  return { label, yesClaims, noClaims, yesWord, noWord } as any
}

/**
 * 渲染声明三元组为 3 列对齐表格（绝对定位，覆盖原三块的 bbox 并集）
 */
function renderDeclarationTable(items: NormalizedBlock[], opts: BlockToHtmlOptions): string {
  // bbox 并集
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const it of items) {
    if (!it.bbox) continue
    x0 = Math.min(x0, it.bbox[0]); y0 = Math.min(y0, it.bbox[1])
    x1 = Math.max(x1, it.bbox[2]); y1 = Math.max(y1, it.bbox[3])
  }
  if (!isFinite(x0)) return items.map(it => blockToHtml(it, opts)).join('')

  // v10.1: 声明表格在原始布局里只占左半页，导致第三列（Revendications 1-19）
  // 被挤到换行、序号错位。用户审核同意：右侧还有大片空白，可把表格拓宽到接近页宽。
  // 这里把右边界 x1 向右扩展到「页宽 - 左边距(x0)」，保持左右对称留白。
  if (opts.pageWidth && opts.pageWidth > x1) {
    const targetX1 = opts.pageWidth - x0
    if (targetX1 > x1) x1 = targetX1
  }

  const fontSize = (opts.presets['text'] ?? 12) * opts.fontScale
  const rows = items.map(it => {
    const raw = it.content ?? extractContentFromLines(it.lines)
    const d = parseDeclaration(raw) as DeclRow & { yesWord?: string; noWord?: string }
    const yesLabel = (d as any).yesWord ?? 'Yes :'
    const noLabel = (d as any).noWord ?? 'No :'
    return `<tr>
      <td class="decl-col1" rowspan="2">${escapeHtml(d.label)}</td>
      <td class="decl-col2">${escapeHtml(yesLabel)}</td>
      <td class="decl-col3">${renderClaimCell(d.yesClaims)}</td>
    </tr>
    <tr>
      <td class="decl-col2">${escapeHtml(noLabel)}</td>
      <td class="decl-col3">${renderClaimCell(d.noClaims)}</td>
    </tr>`
  }).join('')

  const colgroup = '<colgroup><col class="decl-c1"><col class="decl-c2"><col class="decl-c3"></colgroup>'
  const style = `left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px;font-size:${fontSize}px;`
  return `<div class="abs-item decl-table" style="${style}"><table>${colgroup}${rows}</table></div>`
}

/**
 * 第3列单元格：把"Revendications 1-19"拆为
 *   "Revendications"（左侧）+ 居中下划线的权利要求序号"1-19"（单独一行）
 * 若没有序号则只显示词本身。
 */
function renderClaimCell(claims: string): string {
  if (!claims) return ''
  // 末尾的序号范围：数字 + 连字符/逗号/空格（如 "1-19", "1-6, 11-16"）
  const m = claims.match(/^(.*?)([\d]+(?:\s*[-,]\s*\d+)*)\s*$/)
  if (m && m[2]) {
    const word = m[1].trim()
    const num = m[2].trim()
    const wordHtml = word ? `${escapeHtml(word)}` : ''
    return `${wordHtml}<span class="decl-claimno">${escapeHtml(num)}</span>`
  }
  return escapeHtml(claims)
}

// ─── HTML 重建主函数 ─────────────────────────────────────

export interface HtmlRebuildOptions {
  embedStyles?: boolean
  embedImages?: boolean
  imageBase64Map?: Record<string, string>
  pageBg?: string
  fontScale?: number
  fontPresets?: Partial<typeof FONT_PRESETS>
  autoFit?: boolean
}

export function rebuildHtml(pages: NormalizedPage[], options: HtmlRebuildOptions = {}): string {
  const {
    embedStyles = true,
    embedImages = true,
    imageBase64Map = {},
    pageBg = '#e8e8e8',
    fontScale = 1.0,
    fontPresets = {},
    autoFit = true,
  } = options

  const presets: Record<string, number> = { ...FONT_PRESETS }
  for (const k of Object.keys(fontPresets)) {
    const v = (fontPresets as any)[k]
    if (typeof v === 'number') presets[k] = v
  }

  // v9.7: 页面尺寸用 layout.json 的完整 page_size（不裁剪），
  // 并注入与之匹配的 @page 规则，使 printToPDF(preferCSSPageSize) 的纸张
  // 与 .page 完全一致，避免打印 PDF 时右/下出现大片空白。
  let css = embedStyles ? DEFAULT_CSS.replace('#e8e8e8', pageBg) : ''

  // 以首页 page_size 作为 @page 纸张尺寸（同一文档各页通常一致）
  const firstSize = pages[0]?.page_size ?? [595, 841]
  const pageCss = `
  @page {
    size: ${firstSize[0]}px ${firstSize[1]}px;
    margin: 0;
  }`
  if (embedStyles) css += pageCss

  const parts: string[] = []
  parts.push(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">`)
  parts.push(`<meta name="viewport" content="width=device-width, initial-scale=1.0">`)
  if (embedStyles) parts.push(`<style>${css}</style>`)
  parts.push(`</head><body>`)
  
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]

    // v9.7: 使用完整 page_size，让每页恰好填满打印纸张（A4 坐标空间）
    const pageWidth = page.page_size[0]
    const pageHeight = page.page_size[1]
  
    parts.push(
      `<div class="page" data-page-idx="${page.page_idx}" style="width:${pageWidth}px;height:${pageHeight}px;">`
    )

    const blockOpts: BlockToHtmlOptions = { embedImages, imageBase64Map, fontScale, presets, autoFit, pageWidth }

    for (const h of page.headers ?? []) {
      parts.push(blockToHtml(h, blockOpts))
    }
    // v10.0: 扫描连续的"声明三元组"块，合并为 3 列对齐表格
    const blocks = page.preproc_blocks
    let bi = 0
    while (bi < blocks.length) {
      if (isDeclarationBlock(blocks[bi])) {
        const group: NormalizedBlock[] = []
        while (bi < blocks.length && isDeclarationBlock(blocks[bi])) {
          group.push(blocks[bi])
          bi++
        }
        parts.push(renderDeclarationTable(group, blockOpts))
      } else {
        parts.push(blockToHtml(blocks[bi], blockOpts))
        bi++
      }
    }
    for (const f of page.footers ?? {}) {
      parts.push(blockToHtml(f, blockOpts))
    }
    parts.push(`</div>`)
  }

  parts.push(`</body></html>`)
  return parts.join('\n')
}




// ─── 块转 HTML ─────────────────────────────────────

interface BlockToHtmlOptions {
  embedImages: boolean
  imageBase64Map: Record<string, string>
  fontScale: number
  presets: Record<string, number>
  autoFit: boolean
  pageWidth?: number
}

function blockToHtml(b: NormalizedBlock, opts: BlockToHtmlOptions): string {
  if (b.type === 'table' && b.html) {
    return renderTable(b, opts)
  }
  if (b.img_path && (b.type === 'table' || b.type === 'table_body')) {
    return renderItem(b, 'table-fallback', opts, `<img src="${resolveImageSrc(b.img_path, opts)}" alt="table"/>`)
  }
  if ((b.type as string) === 'image') {
    return renderImage(b, opts)
  }
  if (b.img_path && ((b.type as string) === 'image' || b.type === 'image_body')) {
    return renderItem(b, 'image', opts, `<img src="${resolveImageSrc(b.img_path, opts)}" alt="image"/>`)
  }

  if (b.type === 'list' && b.blocks && b.blocks.length > 0) {
    return b.blocks.map(item => {
      const rawText = item.content ?? extractContentFromLines(item.lines)
      const spanText = item.lines?.[0]?.spans?.[0]?.content ?? ''
      const checkSource = spanText || rawText
      const isChecked = /☒/.test(checkSource)
      const isUnchecked = /☐|□/.test(checkSource)
      const cleanedText = rawText.replace(/^[☒□☐✓✗•\-\*\s]+/, '').trim()
      const checkbox = isChecked ? '☒' : (isUnchecked ? '☐' : '')
      const inner = `<span class="checkbox">${checkbox}</span><span class="text">${escapeHtml(cleanedText)}</span>`
      return renderItemWithText(item, 'list-item', opts, inner)
    }).join('')
  }

  if (b.type === 'doc_title' || b.type === 'title' || b.type === 'paragraph_title') {
    return renderItemWithText(b, 'title', opts, escapeHtml(b.content ?? extractContentFromLines(b.lines)))
  }
  if (b.type === 'header' || b.type === 'footer' || b.type === 'page_header' || b.type === 'page_footer') {
    return renderItemWithText(b, 'page-header', opts, escapeHtml(b.content ?? extractContentFromLines(b.lines)))
  }

  const text = b.content ?? extractContentFromLines(b.lines)
  return renderItemWithText(b, 'text-block', opts, escapeHtml(text))
}

function renderTable(b: NormalizedBlock, opts: BlockToHtmlOptions): string {
  if (!b.bbox) {
    return `<div class="table-block">${b.html ?? ''}</div>`
  }
  let [x0, y0, x1, y1] = b.bbox
  const beforeCaptions: NormalizedBlock[] = []
  const afterCaptions: NormalizedBlock[] = []
  for (const c of b.blocks ?? []) {
    if (c.type !== 'table_caption') continue
    if (c.bbox && c.bbox[1] < b.bbox[1]) beforeCaptions.push(c)
    else afterCaptions.push(c)
  }
  const allCaptions = [...beforeCaptions, ...afterCaptions]
  let maxCaptionX1 = x1
  for (const c of allCaptions) {
    if (c.bbox && c.bbox[2] > maxCaptionX1) maxCaptionX1 = c.bbox[2]
  }
  if (maxCaptionX1 > x1) x1 = maxCaptionX1

  const style = `left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px;`

  const beforeHtml = beforeCaptions.map(c => {
    if (!c.bbox) return ''
    const [cx0, cy0, cx1, cy1] = c.bbox
    const captionText = c.content ?? extractContentFromLines(c.lines)
    const fontSize = getFinalFontSize(c, opts, captionText) * opts.fontScale
    return `<div class="abs-item table-caption" style="left:${cx0}px;top:${cy0}px;width:${cx1 - cx0}px;height:${cy1 - cy0}px;font-size:${fontSize}px;line-height:1.2;">${escapeHtml(captionText)}</div>`
  }).join('')

  const afterHtml = afterCaptions.map(c => {
    if (!c.bbox) return ''
    const [cx0, cy0, cx1, cy1] = c.bbox
    const captionText = c.content ?? extractContentFromLines(c.lines)
    const fontSize = getFinalFontSize(c, opts, captionText) * opts.fontScale
    return `<div class="abs-item table-caption" style="left:${cx0}px;top:${cy0}px;width:${cx1 - cx0}px;height:${cy1 - cy0}px;font-size:${fontSize}px;line-height:1.2;">${escapeHtml(captionText)}</div>`
  }).join('')

  let tableHtml = b.html ?? ''
  let tableClass = ''
  if (detectSpecialLegalTable(tableHtml)) {
    tableHtml = applySpecialLegalTableStyle(tableHtml)
    tableClass = ' ph-legal-table'
  }
  tableHtml = postProcessTableHtml(tableHtml)
  // v9.6: 解析表格 HTML 内部 <img> 的 src，映射为 base64（修复 logo 丢失）
  tableHtml = resolveTableImages(tableHtml, opts)

  return beforeHtml +
    `<div class="abs-item table-block${tableClass}" style="${style}">${tableHtml}</div>` +
    afterHtml
}

/**
 * v9.6: 将表格 HTML 内部 <img src="xxx.jpg"> 的相对路径解析为 base64
 */
function resolveTableImages(html: string, opts: BlockToHtmlOptions): string {
  if (!html) return html
  return html.replace(/<img([^>]*?)src=["']([^"']+)["']([^>]*)>/gi, (_m, pre, src, post) => {
    const resolved = resolveImageSrc(src, opts)
    return `<img${pre}src="${resolved}"${post}>`
  })
}

function renderImage(b: NormalizedBlock, opts: BlockToHtmlOptions): string {
  let imgPath = b.img_path
  if (!imgPath && b.blocks && b.blocks[0]) {
    const block = b.blocks[0]
    if (block.lines && block.lines[0]) {
      const line = block.lines[0]
      if (line.spans && line.spans[0] && (line.spans[0] as any).image_path) {
        imgPath = (line.spans[0] as any).image_path
      }
    }
  }
  if (!imgPath) return ''
  const src = resolveImageSrc(imgPath, opts)
  const inner = `<img src="${escapeHtml(src)}" alt="image"/>`
  return renderItem(b, 'image', opts, inner)
}

function getFinalFontSize(b: NormalizedBlock, opts: BlockToHtmlOptions, displayText?: string): number {
  const base = getBaseFontSize(b, opts.presets)
  if (opts.autoFit) {
    const text = displayText ?? b.content
    if (text && b.bbox) return getAutoFitFontSizeWithText(b, base, text)
    return getAutoFitFontSize(b, base)
  }
  return base
}

function getAutoFitFontSizeWithText(b: NormalizedBlock, baseSize: number, text: string): number {
  let fontSize = Math.max(6, Math.min(20, baseSize))
  if (!b.bbox) return fontSize
  const [x0, y0, x1, y1] = b.bbox
  const width = Math.max(x1 - x0, 1)
  const height = Math.max(y1 - y0, 1)
  const textLen = text.length
  if (textLen === 0) return fontSize
  const optimal = Math.sqrt((width * height * 1.1) / (textLen * 0.55 * 1.35))
  fontSize = Math.min(fontSize, optimal)
  fontSize = Math.max(6, fontSize)
  return Math.round(fontSize * 10) / 10
}

function renderItemWithText(b: NormalizedBlock, className: string, opts: BlockToHtmlOptions, text: string): string {
  if (!b.bbox) return `<div class="${className}">${text}</div>`
  const displayText = text.replace(/<[^>]+>/g, '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"').replace(/&#39;/g, "'")
  const fontSize = getFinalFontSize(b, opts, displayText) * opts.fontScale
  let [x0, y0, x1, y1] = b.bbox
  // v10.2: 标题用居中 + nowrap，原 bbox 偏窄会把末尾单词（如 "TREATY"）裁掉。
  // 以中心为基准把盒子向两侧对称扩展，确保整行标题完整居中显示，不被 overflow 裁剪。
  if (className === 'title') {
    const cx = (x0 + x1) / 2
    const estWidth = displayText.length * fontSize * 0.62 + 8
    const halfBox = Math.max((x1 - x0) / 2, estWidth / 2)
    x0 = Math.max(0, cx - halfBox)
    x1 = cx + halfBox
    if (opts.pageWidth && x1 > opts.pageWidth) x1 = opts.pageWidth
  }
  const style = `left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px;font-size:${fontSize}px;line-height:1.2;`
  return `<div class="abs-item ${className}" style="${style}">${text}</div>`
}

function renderItem(b: NormalizedBlock, className: string, opts: BlockToHtmlOptions, inner: string): string {
  if (!b.bbox) return `<div class="${className}">${inner}</div>`
  const [x0, y0, x1, y1] = b.bbox
  const style = `left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px;`
  return `<div class="abs-item ${className}" style="${style}">${inner}</div>`
}

/**
 * v9.2: 图片 src 解析（多 key 变体 + 跨平台兼容）
 */
function resolveImageSrc(imgPath: string, opts: BlockToHtmlOptions): string {
  if (!imgPath || !opts.embedImages) {
    return imgPath.replace(/\\/g, '/')
  }
  const map = opts.imageBase64Map
  const unescaped = imgPath.replace(/\\\//g, '/').replace(/\\/g, '/')
  const fileName = unescaped.split('/').pop() ?? unescaped
  const candidates = [
    unescaped,
    fileName,
    `images/${fileName}`,
    `images\\${fileName}`,
  ]
  for (const key of candidates) {
    if (map[key]) return map[key]
  }
  return unescaped
}

/**
 * v9.6: 已知 PCT 表单中被 OCR 粘连的短语，强制拆分换行
 * 注意：键里不能含空格（已被规则2拆过的情况除外），用粘连原文匹配。
 */
const PCT_PHRASE_BREAKS: Array<[RegExp, string]> = [
  [/WRITTEN OPINION OF THE\s*INTERNATIONAL/gi, 'WRITTEN OPINION OF THE<br>INTERNATIONAL'],
  [/SEARCHING AUTHORITY\s*\(PCT/gi, 'SEARCHING AUTHORITY<br>(PCT'],
  [/file reference\s*see form/gi, 'file reference<br>see form'],
  [/FOR FURTHER ACTION\s*See paragraph/gi, 'FOR FURTHER ACTION<br>See paragraph'],
  [/application No\.\s*PCT\//gi, 'application No.<br>PCT/'],
  [/filing date\s*\(day\/month\/year\)\s*([\d.]+)/gi, 'filing date (day/month/year)<br>$1'],
  [/Priority date\s*\(day\/month\/year\)\s*([\d.]+)/gi, 'Priority date (day/month/year)<br>$1'],
  [/and IPC\s*INV\./gi, 'and IPC<br>INV.'],
  [/Applicant\s*BOSE/gi, 'Applicant<br>BOSE'],
  // v10.2: "To:" 与后面的 "see form ..." 拆成两行（OCR 粘连 "To:see form"）
  [/\bTo\s*:\s*see form/gi, 'To:<br>see form'],
  // v10.2: 每个「Box No. <罗马数字>」条目独占一行，且与紧跟的描述词之间补空格
  //   原文: "...following items:Box No. IBasis...Box No. IIPriority..."
  //   先在每个 Box No. X 前换行（X 后无论是否有空格都匹配），再补空格分隔描述词
  [/\s*(Box No\.\s*)([IVXLC]+)\s*(?=[A-Z])/g, '<br>$1$2 '],
  // 句首多余的前置 <br> 去掉（"items:" 后的第一个 Box 不需要双换行，单换行即可）
  [/following items\s*:\s*<br>/gi, 'following items:<br>'],
  [/Name and mailing address of the ISA:/gi, 'Name and mailing address of the ISA:<br>'],
  [/Date of completion of this opinion\s*see form/gi, 'Date of completion of this opinion<br>see form'],
  [/Authorized Officer\s*([A-Z])/g, 'Authorized Officer<br>$1'],
  [/Telephone No\./gi, '<br>Telephone No.'],
]

/**
 * v9.9: 法语 PCT 表单（OPINION ÉCRITE）被 OCR 粘连的短语，强制换行
 */
const PCT_PHRASE_BREAKS_FR: Array<[RegExp, string]> = [
  // PCT 紧跟 OPINION：拆出独立标题
  [/\bPCTOPINION/g, '<strong class="pct-title">PCT</strong> <span class="pct-follow">OPINION</span>'],
  [/OPINION ÉCRITE DE L['’]ADMINISTRATION\s*CHARGÉE/gi, "OPINION ÉCRITE DE L'ADMINISTRATION<br>CHARGÉE"],
  [/CHARGÉE DE LA RECHERCHE\s*INTERNATIONALE/gi, 'CHARGÉE DE LA RECHERCHE<br>INTERNATIONALE'],
  [/INTERNATIONALE\s*\(règle/gi, 'INTERNATIONALE<br>(règle'],
  [/Date d['’]expédition/gi, '<br>Date d\'expédition'],
  [/du mandataire\s*voir le formulaire/gi, 'du mandataire<br>voir le formulaire'],
  [/POUR SUITE À DONNER\s*Voir le point/gi, 'POUR SUITE À DONNER<br>Voir le point'],
  [/internationale No\.\s*PCT\//gi, 'internationale No.<br>PCT/'],
  [/dépôt international \(jour\/mois\/année\)\s*([\d.]+)/gi, 'dépôt international (jour/mois/année)<br>$1'],
  [/priorité \(jour\/mois\/année\)\s*([\d.]+)/gi, 'priorité (jour/mois/année)<br>$1'],
  [/et CIB\s*INV\./gi, 'et CIB<br>INV.'],
  [/Déposant\s*ORANGE/gi, 'Déposant<br>ORANGE'],
  [/points suivants\s*:/gi, 'points suivants :<br>'],
  // 在每个 ☑/☐/☒ Cadre n° 之前换行
  [/\s*([☑☐☒])\s*(Cadre n°)/g, '<br>$1 $2'],
  // 法语标题/字段粘连
  [/recherche internationale\s*Office européen/gi, 'recherche internationale<br>Office européen'],
  [/présente opinion a été\s*établie/gi, 'présente opinion a été établie<br>'],
  [/Fonctionnaire autorisé\s*([A-Z])/g, 'Fonctionnaire autorisé<br>$1'],
  [/N° de téléphone/gi, '<br>N° de téléphone'],
]

/**
 * v9.6: 表格 HTML 后处理 - PCT 标题校正 + 换行/符号修复
 */
function postProcessTableHtml(html: string): string {
  if (!html) return html
  let processed = html
  // 0. 真实换行符 \n → <br>（OCR 在单元格内保留的换行）
  processed = processed.replace(/\r?\n/g, '<br>')
  // 1. PCT 紧跟大写单词：拆开为独立标题行
  processed = processed.replace(
    /\bPCT([A-ZÉÈÀÂÊÎÔÛÇ]{4,})/g,
    '<strong class="pct-title">PCT</strong> <span class="pct-follow">$1</span>'
  )
  // 2. 单词间缺空格：小写/法语字符后接大写
  processed = processed.replace(
    /([a-zà-ÿùûüîôêéèç])([A-ZÀ-Ÿ])/g,
    '$1 $2'
  )
  // 3. 已知 PCT 短语强制换行（英文 + 法语两套规则，匹配不到自动跳过）
  for (const [re, rep] of PCT_PHRASE_BREAKS) {
    processed = processed.replace(re, rep)
  }
  for (const [re, rep] of PCT_PHRASE_BREAKS_FR) {
    processed = processed.replace(re, rep)
  }
  // 4. 复选框等符号统一为可见字符（避免字体缺失变空白）
  processed = processed
    .replace(/\u2612/g, '☒')
    .replace(/[\u2610\u25a1]/g, '☐')
  return processed
}

function extractContentFromLines(lines: NormalizedLine[] | undefined): string {
  if (!lines || lines.length === 0) return ''
  return lines
    .map(l => {
      if (l.content) return l.content
      if (l.spans) return l.spans.map(s => s.content ?? '').join('')
      return ''
    })
    .filter(Boolean)
    .join(' ')
}

// ─── 工具函数 ─────────────────────────────────────

const AMP = String.fromCharCode(38) + 'amp;'
const LT = String.fromCharCode(38) + 'lt;'
const GT = String.fromCharCode(38) + 'gt;'
const QUOT = String.fromCharCode(38) + 'quot;'
const APOS = String.fromCharCode(38) + '#39;'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, AMP)
    .replace(/</g, LT)
    .replace(/>/g, GT)
    .replace(/"/g, QUOT)
    .replace(/'/g, APOS)
}
