# Web 端 PDF 本地解析与渲染功能开发总结

## 概述

为 Web 端添加了 PDF 本地解析和渲染功能，使 Web 用户也能在浏览器内直接解析和预览 PDF 文件，无需依赖云端服务。

## 问题背景

### 问题 1：PDF 解析失败

用户反馈在 Web 端上传 PDF 文件后解析失败，显示 "Text Only" 错误。错误信息：

> "Only supports basic text files (.txt, .md, .json, code files, etc.). For PDF and Office files, please switch to Chatbox AI."

### 问题 2：PDF 渲染失败

PDF 文本解析成功后，但 PDF 预览面板显示 "无法打开此页面" 或无法加载 PDF 文件。

## 问题根源分析

### 根因 1：Web 平台默认配置为 "none"

📍 `src/renderer/stores/settingsStore.ts:23-26`

```typescript
export function getPlatformDefaultDocumentParser(): DocumentParserConfig {
  // Web still needs cloud service  ← 问题所在！
  return platform.type === 'web' ? { type: 'none' } : { type: 'local' }
}
```

**问题**：Web 平台默认是 `'none'`（只支持文本文件），导致 PDF 文件无法解析。

### 根因 2：UI 上 Local 选项对 Web 不可见

📍 `src/renderer/components/settings/DocumentParserSettings.tsx:9-19`

```typescript
const ALL_PARSER_OPTIONS = [
  { value: 'none', label: 'Text Only', mobileWebOnly: true },
  { value: 'local', label: 'Local', desktopOnly: true }, // ← Web 用户看不到！
  { value: 'chatbox-ai', label: 'Chatbox AI' },
  { value: 'mineru', label: 'MinerU', desktopOnly: true },
]
```

**问题**：`desktopOnly: true` 导致 Web 用户无法选择 Local 解析器。

### 根因 3：Web 端没有 PDF 渲染路径

📍 `src/renderer/routes/session/$sessionId.tsx:87-138`

`PDFPreviewPanel` 组件只有两种渲染路径：

- **Desktop 路径**：使用 `file://` 或 IndexedDB blob
- **Mobile 路径**：使用 Capacitor 原生 `pdfRenderer`

**问题**：Web 端既没有 `filePath`，也走不到 mobile 路径，导致无法渲染 PDF。

## 解决方案

### 方案选型

| 方案 | 库 | 优点 | 缺点 |
|------|-----|------|------|
| **pdf.js (推荐 ✅)** | pdfjs-dist | 项目已有依赖（移动端复用），纯 JS 无需后端 | 扫描版 PDF 无法解析 |
| 后端解析 | pdf-parse + 服务端 | 解析能力强 | 需要额外部署服务 |
| 第三方服务 | pdftron 等 | 功能强大 | 需要付费和 API Key |

**最终选择**：pdfjs-dist，因为项目已在移动端使用，可以直接复用。

## 技术实现

### 修改的文件

| 文件 | 修改内容 |
|------|---------|
| `src/renderer/platform/web_platform.ts` | 添加 `parsePdfWithPdfJs` 方法（约 150 行） |
| `src/renderer/stores/sessionHelpers.ts` | 扩展平台判断，支持 web 使用 pdf.js |
| `src/renderer/stores/settingsStore.ts` | Web 默认配置改为 `'local'` |
| `src/renderer/components/settings/DocumentParserSettings.tsx` | Local 选项对所有平台可见 |
| `src/renderer/routes/session/$sessionId.tsx` | 添加 Web PDF 渲染分支 |

### 1. 添加 Web 端 PDF 解析方法

📍 `src/renderer/platform/web_platform.ts`

```typescript
async parsePdfWithPdfJs(file: File): Promise<{ content: string; error?: string; textParts?: string[]; textBlocks?: any[][] }> {
  // 步骤1：动态加载 pdf.js（静态资源，绕过 Vite 打包）
  let pdfjsLib = (window as any).pdfjsLib
  if (!pdfjsLib) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.type = 'module'
      script.src = '/pdfjs/pdf-bridge.mjs'
      script.onload = () => { pdfjsLib = (window as any).pdfjsLib; resolve() }
      script.onerror = (e) => reject(new Error('PDF解析库加载失败'))
      document.head.appendChild(script)
    })
  }

  // 步骤2：将 File 对象转为 ArrayBuffer
  const arrayBuffer = await file.arrayBuffer()

  // 步骤3：加载 PDF 文档
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  // 步骤4：提取每一页的文本
  const textParts: string[] = []
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()
    // ... 提取文本和坐标信息
  }

  return { content: fullText, textParts, textBlocks }
}
```

### 2. 扩展平台判断

📍 `src/renderer/stores/sessionHelpers.ts`

```typescript
// 修改前
if (platform.type === 'mobile' && file.name.toLowerCase().endsWith('.pdf') && platform.parsePdfWithPdfJs) {

// 修改后
if ((platform.type === 'mobile' || platform.type === 'web') && file.name.toLowerCase().endsWith('.pdf') && platform.parsePdfWithPdfJs) {
```

### 3. 修改默认配置

📍 `src/renderer/stores/settingsStore.ts`

```typescript
// 修改前
export function getPlatformDefaultDocumentParser(): DocumentParserConfig {
  return platform.type === 'web' ? { type: 'none' } : { type: 'local' }
}

// 修改后
export function getPlatformDefaultDocumentParser(): DocumentParserConfig {
  return { type: 'local' } // 所有平台默认支持本地解析
}
```

### 4. 显示 Local 选项

📍 `src/renderer/components/settings/DocumentParserSettings.tsx`

```typescript
// 修改前
const ALL_PARSER_OPTIONS = [
  { value: 'none', label: 'Text Only', mobileWebOnly: true },
  { value: 'local', label: 'Local', desktopOnly: true }, // 桌面端才显示
  // ...
]

// 修改后
const ALL_PARSER_OPTIONS = [
  { value: 'none', label: 'Text Only' },
  { value: 'local', label: 'Local' }, // 所有平台都显示
  // ...
]
```

### 5. 添加 Web PDF 渲染分支

📍 `src/renderer/routes/session/$sessionId.tsx`

```typescript
// 在 PDFPreviewPanel 的 Desktop useEffect 中添加：
if (platform.type === 'web') {
  // 从 IndexedDB 的 _pdf_raw 字段读取 PDF 原始字节
  const rawBase64 = await storage.getBlob(`${storageKey}_pdf_raw`)
  if (rawBase64) {
    const bytes = safeBase64Decode(rawBase64)
    const blob = new Blob([bytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    setLoading(false)
    return
  }
}
```

## 工作原理

### PDF 解析流程

```
用户上传 PDF 文件
        ↓
检查平台类型（mobile 或 web）+ 文件扩展名
        ↓
调用 platform.parsePdfWithPdfJs(file)
        ↓
动态加载 pdf.js 静态资源
        ↓
将 File 对象转为 ArrayBuffer
        ↓
使用 pdfjs-dist 解析 PDF
        ↓
提取文本内容 + 带坐标的文本块
        ↓
存储到 IndexedDB（uniqKey: 文本, uniqKey_pdf_raw: 原始字节）
        ↓
返回给 AI 模型阅读
```

### PDF 渲染流程

```
进入会话页面
        ↓
检查平台类型
        ↓
Desktop/Mobile 原有逻辑
        ↓
Web: 从 IndexedDB 读取 _pdf_raw
        ↓
base64 解码为字节数组
        ↓
创建 Blob 对象
        ↓
URL.createObjectURL 生成 blob URL
        ↓
iframe src 设为 blob URL
        ↓
浏览器内置 PDF 渲染
```

## 技术细节

### 1. pdf.js 静态资源加载

使用动态 script 标签注入，避免 Vite 二次打包破坏 `GlobalWorkerOptions`：

```typescript
// 静态文件位置
/release/app/dist/renderer/pdfjs/
├── pdf-bridge.mjs     (Bridge 脚本)
├── pdf.min.mjs        (主库)
└── pdf.worker.min.mjs (Web Worker)
```

### 2. Blob URL 渲染

Web 端无法使用 `file://` 协议访问本地文件，采用 Blob URL 方案：

```typescript
// 创建 Blob URL
const blob = new Blob([bytes], { type: 'application/pdf' })
const url = URL.createObjectURL(blob)

// 在 iframe 中使用
<iframe src={url} />

// 组件卸载时释放内存
return () => { URL.revokeObjectURL(url) }
```

### 3. 数据存储结构

| 键名 | 内容 | 用途 |
|------|------|------|
| `uniqKey` | PDF 解析后的文本内容 | 给 AI 阅读 |
| `${uniqKey}_pdf_raw` | PDF 原始字节（base64） | 用于 PDF 预览 |
| `${uniqKey}_pdf_pages` | 每页完整文本（JSON） | 长按文本模态框 |
| `${uniqKey}_pdf_blocks` | 带坐标的文本块（JSON） | 段落定位 |

## 影响范围

| 平台 | PDF 解析 | PDF 渲染 | 测试状态 |
|------|---------|---------|---------|
| **Web** | ✅ 新增（pdf.js 本地） | ✅ 新增（Blob URL） | ✅ 已验证 |
| **Mobile** | ✅ 已有（pdf.js） | ✅ 已有（原生） | ✅ 无影响 |
| **Desktop** | ✅ 已有（pdf-parse） | ✅ 已有（file://） | ✅ 无影响 |

## 测试验证

### 测试步骤

1. 启动 Web 开发服务器：`pnpm dev:web`
2. 打开 `http://localhost:1212/`
3. 进入「设置 → 文档解析器」，确认 Parser Type 下拉框中有 "Local" 选项
4. 上传一个 PDF 文件
5. 等待解析完成，确认 AI 能正确阅读 PDF 内容
6. 在会话页面查看 PDF 预览，确认渲染正常

### 测试结果

- ✅ PDF 本地解析成功
- ✅ PDF 渲染显示正常
- ✅ 文本选择和复制功能正常

## 后续优化

1. **文件大小限制**：建议限制 50MB，避免浏览器内存溢出
2. **进度显示**：PDF 解析可能较慢，添加加载动画
3. **错误处理优化**：区分解析失败和渲染失败，给用户更友好的提示
4. **扫描版 PDF 处理**：检测到无文字内容时，提示用户使用云解析或 OCR
5. **多文件支持**：当前只支持单个 PDF 文件，后续可扩展

## 注意事项

1. **扫描版 PDF**：基于文本提取，无法处理图片中的文字（需 OCR）
2. **大文件性能**：超大型 PDF 可能导致浏览器卡顿
3. **跨域限制**：Blob URL 仅在同一页面有效
4. **内存管理**：组件卸载时需调用 `URL.revokeObjectURL()` 释放内存

---

**开发日期**：2026-06-15  
**涉及文件**：5 个文件  
**代码行数**：约 200 行
