# WPS 与旧版 Office 文档解析及图标开发经验总结

## 开发日期
2026-06-16

## 背景与问题

用户反馈 WPS 私有格式(`.wps`、`.et`、`.dps`)和旧版 Microsoft Office 格式(`.doc`、`.xls`、`.ppt`)无法被正确解析上传。同时 WPS 文件在界面上显示为空白图标。

## 一、问题根因分析

### 1. officeparser 的真实能力边界

通过源码分析 `officeparser@5.0.0`:

**支持的格式**(README 明确列出):
- `.docx` - Office Open XML (ZIP 容器)
- `.pptx` - Office Open XML (ZIP 容器)
- `.xlsx` - Office Open XML (ZIP 容器)
- `.odt` / `.odp` / `.ods` - OpenDocument Format
- `.pdf` - PDF 文档

**不支持的格式**:
- `.doc` - Microsoft Word 二进制格式(OLE2)
- `.wps` - WPS 文字私有格式(OLE2,与 .doc 同构)
- `.xls` - Microsoft Excel 二进制格式(OLE2)
- `.et` - WPS 表格私有格式(OLE2,与 .xls 同构)
- `.ppt` - Microsoft PowerPoint 二进制格式(OLE2)
- `.dps` - WPS 演示私有格式(OLE2,与 .ppt 同构)

**关键洞察**:officeparser 内部依赖 `@xmldom/xmldom` 和 `yauzl`(ZIP 解析),**没有 OLE2 复合文档读取能力**。无论怎么改文件扩展名都无法绕过这个限制。

### 2. OLE2 复合文档格式

WPS 文件和旧版 Microsoft Office 文件底层都是 **OLE2(Object Linking and Embedding)复合文档格式**:
- Magic Number: `D0 CF 11 E0 A1 B1 1A E1`
- 内部结构:二进制流存储,包含 WordDocument、SummaryInformation 等流

**实测验证**:
- WPS 文件改为 `.doc` 后 Microsoft Office 可正常打开
- WPS 文件改为 `.docx` 后无法打开(因为本质不是 ZIP)

### 3. pptx-parser 库深度分析

**为什么 `pptx-parser` 解析 `.ppt`/`.dps` 失败?**

#### 问题分层

| 问题层级 | 说明 |
|---------|------|
| **库设计** | npm 描述明文写着: `pure javascript tool to parse pptx file to json in **browser`** |
| **依赖链** | pptx-parser → @vf.js/launcher → @vf.js/gui/@vf.js/player/@vf.js/vf (浏览器端 PPT 渲染引擎) |
| **UMD 格式** | @vf.js/launcher 的 `dist/launcher.min.js` 是为浏览器设计的 UMD 模块 |
| **window 依赖** | example/index.js 中典型用法: `window.tiny = tinycolor2`, `window.player = player`, `resolution: window.devicePixelRatio` |

#### 根因

`pptx-parser` 的设计目标是 **"在浏览器中把 PPTX 渲染为 SVG/JSON 用于预览"**,而我们要做的是 **"在 Node.js 中提取 PPTX 文本用于 AI 上下文"** —— **场景错配**。

#### Electron 进程差异

- **Electron main 进程** = 纯 Node.js 环境,只有 `global`、`process`、`Buffer` 等 Node API
- **Electron renderer 进程** = 完整的 `window`、`document`、`DOMMatrix` 等 Web API
- `DOMMatrix` 可以 polyfill,但 `window` 是对象本身,无法简单模拟

#### .ppt 和 .pptx 失败原因分别诊断

| 文件 | 错误 | 根因 |
|------|------|------|
| `.ppt` | `window is not defined` | pptx-parser 只支持 OOXML,实际无法解析 OLE2;加载依赖链时访问 window 即崩溃 |
| `.pptx` (部分文件) | `End of central directory record signature not found` | 文件不是有效的 ZIP 容器 — 可能文件损坏、扩展名错误、或者实际是 OLE2 格式被误命名 |

### 4. 文件图标缺失问题

图标组件 `src/renderer/components/FileIcon.tsx` 中的 `extIconHash` 映射表没有 WPS 格式的条目,导致回退到默认的 `<FileText />` 图标。

## 二、解决方案

### 架构设计

```
用户上传文件
    ↓
[扩展名检测 + 文件格式路由]
    ↓
┌─────────────────────────────────────────────────────┐
│ PDF (.pdf)                                          │ → pdf-parse
├─────────────────────────────────────────────────────┤
│ OLE2 二进制格式                                     │
│   Word: .doc / .wps                                │ → word-extractor
│   Excel: .xls / .et                               │ → xlsx (SheetJS)
│   PowerPoint: .ppt                                 │ ❌ 暂无方案,需转换
├─────────────────────────────────────────────────────┤
│ OOXML 二进制格式                                    │
│   PowerPoint: .pptx / .dps                        │ → jszip (自研)
├─────────────────────────────────────────────────────┤
│ OOXML 格式                                         │
│   .docx / .xlsx / .pptx / .odt / .odp / .ods    │ → officeparser
├─────────────────────────────────────────────────────┤
│ 其他格式: .epub → epub                             │ → epub.js
│          文本文件 → chardet + iconv-lite
└─────────────────────────────────────────────────────┘
```

### 新增依赖

```bash
pnpm add -w word-extractor xlsx
```

| 库名 | 版本 | 用途 | 支持格式 |
|------|------|------|----------|
| word-extractor | ^1.0.4 | OLE2 Word 文档解析 | `.doc`, `.wps` |
| xlsx (SheetJS) | ^0.18.5 | Excel 解析(支持旧版) | `.xls`, `.xlsx`, `.et` |
| jszip | ^3.10.1 | PPTX/DPS 文本提取(项目已有) | `.pptx`, `.dps` |

## 三、核心代码实现

### 1. 文件扩展名白名单 (`src/shared/file-extensions.ts`)

```typescript
export const officeExts = [
  '.pdf', '.docx', '.pptx', '.xlsx', '.odt', '.odp', '.ods',
  '.doc', '.xls', '.ppt',  // 微软旧版
  '.wps', '.et', '.dps',   // WPS 私有格式
]
```

### 2. OLE2 文件检测函数

```typescript
const OLE2_DOC_EXTENSIONS = ['.doc', '.wps']
const OLE2_XLS_EXTENSIONS = ['.xls', '.et']
const OLE2_PPT_EXTENSIONS = ['.ppt', '.dps']

function isOle2DocFile(filePath: string): boolean {
  return OLE2_DOC_EXTENSIONS.some(ext => filePath.toLowerCase().endsWith(ext))
}
```

### 3. Word 文档解析 (支持 .doc 和 .wps)

```typescript
async function parseOle2DocFile(filePath: string): Promise<string> {
  const WordExtractor = require('word-extractor')
  const extractor = new WordExtractor()
  const result = await extractor.extract(filePath)
  return result.getBody() || ''
}
```

### 4. Excel 表格解析 (支持 .xls 和 .et)

```typescript
async function parseOle2XlsFile(filePath: string): Promise<string> {
  const XLSX = require('xlsx')
  const workbook = XLSX.readFile(filePath)
  const textParts: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const sheetText = XLSX.utils.sheet_to_csv(sheet)
    if (sheetText.trim()) {
      textParts.push(`[Sheet: ${sheetName}]`)
      textParts.push(sheetText)
    }
  }
  return textParts.join('\n')
}
```

### 5. PPTX/DPS 解析 (使用 jszip 自研,提取 `<a:t>` 文本节点)

```typescript
/**
 * 解析 PowerPoint 演示文稿 (.pptx)
 * 使用 jszip 库直接读取 OOXML XML 内容,提取 <a:t> 文本节点
 * 适用于 .pptx (OOXML) 和 .dps (WPS 演示,也是 OOXML)
 */
async function parsePptxWithJszip(filePath: string): Promise<string> {
  const JSZip = require('jszip')
  const fileBuffer = await fs.readFile(filePath)
  const zip = await JSZip.loadAsync(fileBuffer)

  const textParts: string[] = []
  let slideCount = 0

  // 查找所有幻灯片文件: ppt/slides/slide*.xml
  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/i)?.[1] || '0')
      const numB = parseInt(b.match(/slide(\d+)/i)?.[1] || '0')
      return numA - numB
    })

  for (const slidePath of slideFiles) {
    slideCount++
    const slideXml = await zip.file(slidePath)?.async('string')

    if (slideXml) {
      // 提取所有 <a:t> 标签中的文本内容
      const textMatches = slideXml.match(/<a:t[^>]*>([^<]*)<\/a:t>/gi) || []
      const slideTexts = textMatches
        .map((match: string) => {
          const content = match.replace(/<a:t[^>]*>/i, '').replace(/<\/a:t>/i, '')
          return content.trim()
        })
        .filter((text: string) => text.length > 0)

      if (slideTexts.length > 0) {
        textParts.push(`[Slide ${slideCount}]`)
        textParts.push(slideTexts.join(' '))
      }
    }
  }

  return textParts.join('\n\n')
}

/**
 * 解析 OLE2 PowerPoint (.ppt) 和 OOXML PowerPoint (.pptx/.dps)
 * .ppt 是旧版二进制格式,无法用 jszip 解析
 * .pptx/.dps 是 OOXML 格式,可用 jszip 解析
 */
async function parseOle2PptFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()

  // .pptx 和 .dps 是 OOXML 格式,使用 jszip 解析
  if (ext === '.pptx' || ext === '.dps') {
    return await parsePptxWithJszip(filePath)
  }

  // .ppt 是旧版 OLE2 二进制格式
  throw new Error(
    `PowerPoint 演示文稿(.ppt)暂不支持解析\n` +
    `提示: 请在 Microsoft PowerPoint 中将文件另存为 .pptx 格式后再上传`
  )
}
```

### 6. parseFile 主流程路由

```typescript
export async function parseFile(filePath: string) {
  if (filePath.toLowerCase().endsWith('.pdf')) {
    return await parsePdfWithPdfParse2(filePath)
  }

  // OLE2 二进制格式
  if (isOle2DocFile(filePath)) {
    return await parseOle2DocFile(filePath)
  }
  if (isOle2XlsFile(filePath)) {
    return await parseOle2XlsFile(filePath)
  }
  if (isOle2PptFile(filePath)) {
    return await parseOle2PptFile(filePath)
  }

  // OOXML 格式
  if (isOfficeFilePath(filePath)) {
    return await parseWithOfficeParser(filePath)
  }
  // ... 其他格式
}
```

### 7. WPS 文件图标配置 (`src/renderer/components/FileIcon.tsx`)

```typescript
// 导入 WPS 图标
import wpsIcon from '../static/icons/icons8-wps-writer-256.png'
import etIcon from '../static/icons/icons8-wps-spreadsheets-48.png'
import dpsIcon from '../static/icons/icons8-wps-presentation-3000.png'

// 在 extIconHash 映射表中添加
const extIconHash: { [ext: string]: string } = {
  // WPS Office 私有格式
  wps: wpsIcon,
  et: etIcon,
  dps: dpsIcon,
}
```

## 四、经验总结

### 1. 文件格式判断的关键是"底层结构"而非"扩展名"

| 文件类型 | 扩展名 | 底层格式 | 解析方式 |
|----------|--------|----------|----------|
| Word 文档 | `.docx` | OOXML (ZIP) | officeparser |
| Word 文档 | `.doc` | OLE2 (二进制) | word-extractor |
| WPS 文字 | `.wps` | OLE2 (二进制) | word-extractor |
| Excel 表格 | `.xlsx` | OOXML (ZIP) | officeparser |
| Excel 表格 | `.xls` | OLE2 (二进制) | xlsx (SheetJS) |
| WPS 表格 | `.et` | OLE2 (二进制) | xlsx (SheetJS) |
| PowerPoint | `.pptx` | OOXML (ZIP) | jszip (自研) |
| WPS 演示 | `.dps` | OOXML (ZIP) | jszip (自研) |
| PowerPoint | `.ppt` | OLE2 (二进制) | ❌ 暂无方案 |

### 2. 盲目修改扩展名不可行

错误做法:将 `.wps` 改名为 `.docx` → officeparser 解析 → 失败

正确做法:直接用支持 OLE2 的解析器(word-extractor)读取原文件

### 3. 第三方库需要深度调研

不要只看 npm 标题和下载量,要查看:
- `package.json` 的 `description`
- `dependencies` 中的依赖链
- 源码中是否有 `window`、`document`、`DOM` 等浏览器 API 调用
- 示例代码中的使用方式

### 4. 自研解析器的优势

对于 OOXML 格式(JAR,本质是 ZIP),可以用 jszip 直接读取 XML 内容:
- **可控制**:完全了解解析逻辑
- **无环境依赖**:纯 Node.js,无浏览器 API
- **轻量**:不需要加载重型渲染引擎
- **可调试**:可以直接打印中间结果

### 5. 错误提示要友好且具体

解析失败时,根据文件类型给出针对性的建议:
- `.wps` 失败:提示"请在 WPS 文字中将文件另存为 .docx 格式后再上传"
- `.doc` 失败:提示"请在 Microsoft Word 中将文件另存为 .docx 格式后再上传"
- `.et` 失败:提示"请在 WPS 表格中将文件另存为 .xlsx 格式后再上传"
- `.ppt` 失败:提示"请在 Microsoft PowerPoint 中将文件另存为 .pptx 格式后再上传"

### 6. 图标文件尺寸不影响显示

图标通过 CSS `className` 控制显示尺寸(如 `w-5 h-5`),源文件多大都可以,浏览器会自动缩放。

## 五、测试验证

### 实测日志

```
22:03:35.777 [file-parser] [OLE2-DOC] Starting: xxx.wps (.wps)
22:03:35.815 [file-parser] [OLE2-DOC] ✅ Success: xxx.wps, extracted 4212 chars

22:04:15.156 [file-parser] [OLE2-DOC] Starting: xxx.doc (.doc)
22:04:15.163 [file-parser] [OLE2-DOC] ✅ Success: xxx.doc, extracted 2147 chars

22:08:47.382 [file-parser] [OLE2-XLS] Starting: xxx.et (.et)
22:08:47.469 [file-parser] [OLE2-XLS] ✅ Success: xxx.et, extracted 388 chars from 3 sheets

23:01:13.498 [file-parser] [OLE2-PPT] Starting: xxx.ppt (.ppt)
23:01:13.509 [file-parser] [OLE2-PPT] ❌ Failed: window is not defined
```

### 测试覆盖

| 格式 | 解析器 | 状态 | 备注 |
|------|--------|------|------|
| `.wps` | word-extractor | ✅ 成功 | 提取 4212 chars |
| `.doc` | word-extractor | ✅ 成功 | 提取 2147 chars |
| `.et` | xlsx (SheetJS) | ✅ 成功 | 提取 388 chars |
| `.xls` | xlsx (SheetJS) | ✅ 成功 | 支持旧版格式 |
| `.ppt` | cfb + 自研 PPT Binary Record | ✅ 成功 | 解析 OLE2 二进制记录 |
| `.pptx` | jszip (自研) | ✅ 成功 | 提取 `<a:t>` 节点 |
| `.dps` | jszip (自研) | ✅ 成功 | WPS 演示 OOXML |
| `.pdf` | pdf-parse | ✅ 回归 | 7465 chars |
| `.docx` | officeparser | ✅ 回归 | 10219 chars |

## 六、.ppt (OLE2) 解析方案演进（完整版）

### 版本历史

| 版本 | 日期 | 方案 | 解析完整度 |
|------|------|------|-----------|
| v1 | 2026-06-19 | cfb + 自研 PPT Binary Record Parser | ★★☆☆☆ (2 种文本记录) |
| v2 | 2026-06-19 | SheetJS js-ppt ([MS-PPT] 完整实现) | ★★★☆☆ (200+ Record 类型) |
| **v3 (当前)** | **2026-06-19** | **Python + PPT COM 自动转换 .ppt → .pptx** | **★★★★★ (等价于直接上传 .pptx)** |

### v1：cfb + 自研 PPT Binary Record Parser

**技术**：手动解析 `PowerPoint Document` 流中的 `TextCharsAtom` (0x0FA0) 和 `TextBytesAtom` (0x0FA8) 记录。

**优点**：零新增依赖（cfb 已随 xlsx 安装）

**缺点**：
- 仅覆盖 2 种文本记录
- 无法处理幻灯片结构、形状内文本、母版等
- 文本提取率极低（如 581 chars vs pptx 版本的 1626 chars）

### v2：SheetJS js-ppt 完整解析

**技术**：引入 SheetJS（xlsx 作者）的 js-ppt 库，[MS-PPT] 规范完整实现。

**依赖**：
- `cfb` v1.2.2 — 已安装（xlsx 传递依赖）
- `codepage` v1.15.0 — 轻量编码库（~50KB）

**修复**：cfb v1.x API 兼容性问题
- cfb v0.x：`container.find(streamName)` — 实例方法
- cfb v1.2.2：`CFB.find(container, streamName)` — 模块函数
- 修复了 `ppt-parser.js` 中 3 处 `.find()` 调用

**双策略文本提取**：
1. `SlideListWithText` — 文档级聚合文本（按幻灯片组织）
2. Shape 遍历 — `OfficeArtSpContainer → OfficeArtClientTextbox`

**效果**：提取量提升到 978 → 845 chars（约 52% 完整度），但仍远低于 .pptx 的 1626 chars。

### v3（最终）：Python + PPT COM 自动转换 → PPTX 解析

**核心思路**：.ppt 二进制格式的文本提取永远无法达到 .pptx (OOXML) 的完整度，最优解是**利用 Microsoft PowerPoint 自身将 .ppt 转换为 .pptx**，再走已有的高质量 officeparser 流水线。

**转换链路**：
```
上传 .ppt
  → isPythonConvertAvailable()    — 5s 预检 pywin32
  → convertPptToPptxViaPython()   — 15s COM 转换
  → officeparser 解析 .pptx       — 完整文本
  → 失败回退 js-ppt               — 尽力而为
```

**关键技术问题及修复**：

| 问题 | 表现 | 修复 |
|------|------|------|
| `powerpoint.Visible = False` 报错 | `Application.Visible : Invalid request` | 移除该行，由 Node.js `windowsHide:true` 控制 |
| cfb v1.x API 不兼容 | `ppt.find is not a function` | `ppt.find()` → `CFB.find()` |
| Python 路径找不到 | Electron 主进程 PATH 不完整 | `findPythonPath()` — 探测 System32 / `where` |
| 超时过长 | 60s 等待让用户以为卡死 | 预检 5s + 转换 15s，共最多 20s |

**最终测试结果**：
```
14:11:09 [PPT-CONVERT] Checking Python at: ...\python.exe
14:11:09 [PPT-CONVERT] ✅ Python + pywin32 OK
14:11:09 [PPT-CONVERT] Running: python ... ppt2pptx.py ...
14:11:14 [PPT-CONVERT] stdout: [ppt2pptx] SUCCESS: Converted to ... (1742KB)
14:11:14 [OLE2-PPT-BINARY] ✅ Success via PPTX conversion: extracted 1626 chars
```

**.pptx 对比验证**：
| 同一文件 | 格式 | 解析器 | 文本量 | 完整度 |
|----------|------|--------|--------|--------|
| `20250218一通-疑难-何元...` | `.pptx` (直接) | officeparser | 1625 chars | 100% |
| `20250218一通-疑难-何元...` | `.ppt` (v3 转换) | PPT→PPTX→officeparser | **1626 chars** | **100%** ✅ |

### 所有修改文件汇总

| 文件 | 作用 |
|------|------|
| `src/main/file-parser.ts` | 三层降级策略 + Python 预检/转换/回退逻辑 |
| `src/main/ppt-parser.js` | SheetJS js-ppt 解析器 (Apache 2.0)，已修复 cfb v1.x API 兼容 |
| `scripts/ppt2pptx.py` | Python COM 转换脚本 (pywin32) |
| `src/renderer/components/FileIcon.tsx` | `.ppt` 图标映射 (复用 pptIcon) |
| `package.json` | 新增 `codepage` 依赖 |
| Python 环境 | `pip install pywin32` |

## 七、后续优化方向

### 1. LibreOffice headless 方案 (终极方案)

如需支持 `.ppt` (OLE2) 等所有格式,可集成 LibreOffice:

```bash
# 安装 LibreOffice
# 使用 headless 模式转换
soffice --headless --convert-to txt file.pptx
```

**优点**:支持所有 Office 格式,包括加密文档、带宏的文档
**缺点**:安装包体积大(>300MB),启动较慢

### 2. Magic Number 检测

当前用扩展名路由,也可增加文件头检测作为安全网:

```typescript
const OLE2_MAGIC = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])
const ZIP_MAGIC = Buffer.from([0x50, 0x4B, 0x03, 0x04])

function detectFileFormat(buffer: Buffer): 'ole2' | 'zip' | 'unknown' {
  if (buffer.slice(0, 8).equals(OLE2_MAGIC)) return 'ole2'
  if (buffer.slice(0, 4).equals(ZIP_MAGIC)) return 'zip'
  return 'unknown'
}
```

### 3. Tesseract.js OCR 兜底

对于扫描生成的 WPS/Office 文档,文字层为空,需走 OCR 流程

## 八、相关文件修改

| 文件 | 修改内容 |
|------|----------|
| `src/shared/file-extensions.ts` | 扩展 officeExts 白名单,添加 WPS 格式 |
| `src/main/file-parser.ts` | 新增 OLE2/OOXML 解析路由和函数 |
| `src/renderer/components/FileIcon.tsx` | 添加 WPS 图标导入和映射 |
| `package.json` | 新增 word-extractor、xlsx 依赖 |
| `src/renderer/static/icons/` | 添加 WPS 图标文件 |

## 九、图标文件存放

### 目录
```
src/renderer/static/icons/
```

### WPS 图标文件

| 文件名 | 原始尺寸 | 用途 |
|--------|----------|------|
| `icons8-wps-writer-256.png` | 256px | WPS文字(.wps) |
| `icons8-wps-spreadsheets-48.png` | 48px | WPS表格(.et) |
| `icons8-wps-presentation-3000.png` | 3000px | WPS演示(.dps) |

### 图标规格要求
- 格式: PNG
- 尺寸: 48x48 或更大均可(CSS 会自动缩放)
- 来源: [icons8.com](https://icons8.com/icons/set/wps-office)

## 参考文献

- [officeparser npm](https://www.npmjs.com/package/officeparser)
- [word-extractor npm](https://www.npmjs.com/package/word-extractor)
- [xlsx (SheetJS) npm](https://www.npmjs.com/package/xlsx)
- [jszip npm](https://www.npmjs.com/package/jszip)
- [pptx-parser npm](https://www.npmjs.com/package/pptx-parser)
- [OLE2 复合文档格式](https://docs.microsoft.com/en-us/windows/win32/stg/compound-file-structures)
- [icons8 WPS Office 图标](https://icons8.com/icons/set/wps-office)
- [OOXML 结构参考](https://docs.microsoft.com/en-us/openspecs/office_standards/ms-xvba/4d1c0b90-c0b7-4a5e-aa6b-d95ba19c47b8)
