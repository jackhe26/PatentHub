# Android 端 PDF 功能完整开发经验总结

## 概述

为 Android 端 App 实现 PDF 文件上传、解析、渲染预览、手势交互的完整功能。整个开发过程分为 5 个阶段，覆盖了从"完全无法使用"到"流畅完整"的全部过程。

---

## 技术架构总览

```
用户选择 PDF 文件（InputBox）
        ↓
preprocessFile() (sessionHelpers.ts)
        ↓
┌─────────────────────────────────────────────────┐
│  移动端 PDF 解析（pdfjs-dist 静态资源注入）       │
│  → 文本内容 → storage.setBlob(uniqKey)          │
│                                               │
│  移动端 PDF 原始数据存储（FileReader + IndexedDB）│
│  → 原始 bytes (base64) → storage.setBlob(uniqKey_pdf_raw)
└─────────────────────────────────────────────────┘
        ↓
PDFPreviewPanel ($sessionId.tsx)
        ↓
┌─────────────────────────────────────────────────┐
│  PdfRendererBridge.ts (TypeScript)              │
│  → registerPlugin('PdfRenderer')                │
│                                               │
│  PdfRendererPlugin.java (Android Native)       │
│  → android.graphics.pdf.PdfRenderer            │
│  → Bitmap.eraseColor(WHITE)                     │
│  → JPEG base64 → WebView <img>                 │
└─────────────────────────────────────────────────┘
        ↓
手势交互（双指缩放 / 单指翻页 / 放大后平移）
```

---

## 第一阶段：本地解析（2026-05-24）

### 问题

Android 端选择 PDF 文件后解析失败，提示 `document_parser_not_configured`。

### 根本原因

移动端 `parseFileLocally()` 只支持 .txt/.md，没有实现 PDF 解析。

### 解决：使用 pdfjs-dist

**修改文件**：`src/renderer/platform/mobile_platform.ts`

```typescript
async parsePdfWithPdfJs(file: File): Promise<{ content: string; error?: string }> {
  const pdfjs = await getPdfJsLib()
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()
    // 提取每页文本
  }
  return { content: fullText }
}
```

**影响**：
- Android ✅ 新增 PDF 本地解析
- iOS ✅ 同样支持（共享代码）
- 桌面端 ✅ 无影响

---

## 第二阶段：绕过 Vite 打包（2026-05-30）

### 问题

pdfjs-dist 经过 Vite 打包后，`GlobalWorkerOptions.workerSrc` 变成代理对象，赋值不生效，导致 `NO 'GlobalWorkerOptions.workerSrc' specified` 错误。

### 失败尝试

| 尝试 | 方法 | 结果 |
|------|------|------|
| 1 | 修复 settingsStore.ts 解析器默认配置 | ❌ 配置对了，但 workerSrc 仍然无效 |
| 2 | 设置 `GlobalWorkerOptions.workerSrc = ''` | ❌ Vite 打包后变成代理对象，赋值不生效 |
| 3 | 使用 `legacy/build/pdf.mjs` + `disableWorker: true` | ❌ Vite 二次打包仍然破坏内部机制 |

### 成功方案：静态资源注入

将 pdf.js 文件复制到 `src/renderer/public/pdfjs/` 目录，作为静态资源不经过 Vite 处理。

**新增文件**：
```
src/renderer/public/pdfjs/
├── pdf-bridge.mjs      # 桥接脚本
├── pdf.min.mjs         # pdf.js 核心库
└── pdf.worker.min.mjs  # pdf.js Worker
```

**pdf-bridge.mjs**：
```javascript
import * as pdfjsLib from './pdf.min.mjs'
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs'
window.pdfjsLib = pdfjsLib  // 暴露到全局
```

**核心方法重写**：
```typescript
async parsePdfWithPdfJs(file: File) {
  // 不 import pdfjs-dist！改用动态 script 标签
  let pdfjsLib = (window as any).pdfjsLib
  if (!pdfjsLib) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.type = 'module'
      script.src = '/pdfjs/pdf-bridge.mjs'
      script.onload = () => {
        pdfjsLib = (window as any).pdfjsLib
        resolve()
      }
      script.onerror = reject
      document.head.appendChild(script)
    })
  }
  // 此时 pdfjsLib 是真实对象，workerSrc 已正确设置
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  // ...
}
```

**原理对比**：
```
❌ 失败: import('pdfjs-dist') → Vite 打包 → 代理对象 → workerSrc 无效
✅ 成功: <script src='/pdfjs/...'> → 浏览器原生加载 → 真实对象 → workerSrc 有效
```

### 完整修改清单

| 文件 | 修改内容 |
|------|---------|
| `src/renderer/stores/settingsStore.ts` | 移动端默认解析器 `'none'` → `'local'` |
| `src/renderer/platform/mobile_platform.ts` | 改用动态 script 注入加载 pdf.js |
| `src/renderer/public/pdfjs/pdf-bridge.mjs` | **新增** — 桥接脚本 |
| `src/renderer/public/pdfjs/pdf.min.mjs` | **新增** — pdf.js 核心库 |
| `src/renderer/public/pdfjs/pdf.worker.min.mjs` | **新增** — pdf.js Worker |
| `.github/workflows/release-android.yml` | **新增** — Android 构建 & 发布 Workflow |

---

## 第三阶段：渲染预览与 4 个 Bug（2026-05-30）

### 技术架构

```
sessionHelpers.ts (preprocessFile)
  ├── 解析文本 → storage.setBlob(uniqKey)      [给 AI]
  └── 存原始 PDF bytes → _pdf_raw              [给预览]

$sessionId.tsx (PDFPreviewPanel)
  └── 读取 _pdf_raw → 传给 native plugin

PdfRendererBridge.ts → Capacitor bridge

PdfRendererPlugin.java (Android Native)
  └── PdfRenderer → Bitmap.eraseColor(WHITE) → JPEG base64 → <img>
```

---

### Bug 1：`"PdfRenderer" plugin is not implemented on android`

**根本原因**：`MainActivity.java` 是空的，没有注册插件。Capacitor 自定义插件必须手动注册。

**修复**：`android/app/src/main/java/.../MainActivity.java`

```java
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PdfRendererPlugin.class);  // ← 必须
        super.onCreate(savedInstanceState);
    }
}
```

**经验**：Capacitor 自定义插件的 `@CapacitorPlugin` 注解不够，必须在 `MainActivity.onCreate()` 中手动调用 `registerPlugin()`。

---

### Bug 2：`atob` Latin1 range 错误

**根本原因**：`atob()` 只接受纯 base64 字符，但 `storage.getBlob()` 返回的可能是 `data:application/pdf;base64,<data>` 格式的 Data URL，冒号、斜杠等字符超出 Latin1 范围。

**修复**：`$sessionId.tsx`

```typescript
function safeBase64Decode(base64: string): Uint8Array {
  const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64
  const normalized = cleanBase64.replace(/\s/g, '')
  try {
    const binaryString = atob(normalized)
    // ...
  } catch {
    return new TextEncoder().encode(normalized)
  }
}
```

**经验**：调用 `atob()` 前必须去掉 Data URL 前缀和空白字符。

---

### Bug 3：`file not in PDF format or corrupted`

**根本原因**：`pdfFile.storageKey` 存的是 PDF **解析后的文本内容**（给 AI 用的），不是 PDF 原始二进制。把文本内容当 base64 传给 Java，当然报格式错误。

**数据流理解**：
```
❌ 错误理解: storageKey → PDF 原始二进制数据
✅ 实际情况: storageKey → PDF 解析后的文本（给 AI 用）
```

**修复**：在 `preprocessFile` 时额外存一份原始 PDF bytes。

**修复文件 1**：`src/renderer/stores/sessionHelpers.ts`

```typescript
// 存原始 PDF bytes
const arrayBuffer = await file.arrayBuffer()
const uint8 = new Uint8Array(arrayBuffer)
let bin = ''
for (let i = 0; i < uint8.length; i++) {
  bin += String.fromCharCode(uint8[i])
}
const rawBase64 = btoa(bin)
await storage.setBlob(`${uniqKey}_pdf_raw`, rawBase64)
```

**修复文件 2**：`$sessionId.tsx`

```typescript
const rawBase64 = await storage.getBlob(`${storageKey}_pdf_raw`)
```

**Key 命名约定**：
| Key | 内容 | 用途 |
|-----|------|------|
| `storageKey` | PDF 解析后的文本 | 发送给 AI |
| `storageKey_pdf_raw` | PDF 原始 base64 bytes | PDF 预览 |

---

### Bug 4：PDF 显示黑色背景，文字不可见

**根本原因**：`Bitmap.createBitmap()` 默认透明，JPEG 不支持透明通道，压缩后透明区域变黑，白底黑字变成黑底黑字。

**修复**：`PdfRendererPlugin.java`

```java
Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
bitmap.eraseColor(android.graphics.Color.WHITE)  // ← 必须，填充白色背景
page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
```

**经验**：使用 `PdfRenderer` 渲染到 JPEG 时，必须先用 `bitmap.eraseColor(Color.WHITE)` 填充白色背景。

---

## 第四阶段：全屏显示优化（2026-05-31）

### 问题

- 外层 div 有 `padding: '0 8px'` 损失显示空间
- Card 组件有 padding + border，额外浪费 30-40px
- 顶部标题栏重复显示文件名，与 Header 重复且占空间

### 解决：移动端独立渲染路径

```tsx
if (isMobile) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 内容区：无 padding、无滚动条 */}
      <div style={{ flex: 1, overflow: 'hidden', touchAction: 'none' }}>
        {/* 双指缩放 + 单指翻页 + 平移 */}
      </div>
      {/* 页码改为右下角浮层叠加显示 */}
      <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 11 }}>
        {currentPage + 1} / {totalPages}
      </div>
    </div>
  )
}
```

### 手势交互

| scale 值 | 单指操作 | 双指操作 |
|---------|---------|---------|
| 1.1（默认）| 左右滑动翻页 | 捏合放大 |
| > 1.1（放大）| 任意方向拖动平移 | 继续缩放 |
| 缩小回 ≤ 1.1 | 自动重置 translate，恢复翻页模式 | - |

**双指缩放（以手指为中心）**：
```typescript
pinchOriginX.current = (e.touches[0].clientX + e.touches[1].clientX) / 2
pinchOriginY.current = (e.touches[0].clientY + e.touches[1].clientY) / 2

// 缩放时同步调整 translate，保持捏合中心跟随手指
const scaleFactor = newScale / baseScale.current
const newTransX = pinchOriginX.current - (pinchOriginX.current - startTransX.current) * scaleFactor
const newTransY = pinchOriginY.current - (pinchOriginY.current - startTransY.current) * scaleFactor
```

**UI 优化**：删除重复的 PDF 标题栏，节省约 30px，页码改为半透明浮层叠加在图片右下角。

---

## 第五阶段：PDF 预览数据丢失 Bug（2026-05-31）

### 问题现象

上传 PDF 后点击预览控件，报错 `PDF preview data not found. Please re-upload the PDF file.`。1MB 左右的小 PDF 也同样失败。

### 根本原因：Filesystem getUri 返回 content:// URI

当时的方案是：
1. `sessionHelpers.ts` 用 `Filesystem.writeFile()` 把 PDF 写入 App 私有目录
2. IndexedDB 里存 `"filesystem:pdf_cache/xxx.pdf"` 路径
3. `$sessionId.tsx` 用 `Filesystem.getUri()` 获取 URI
4. 调用 `pdfRenderer.open(uri)` 打开

**问题出在第 4 步**：`Filesystem.getUri()` 在 Android 上返回的是 `content://com.android.externalstorage.documents/...` 格式的 Content URI，而 `PdfRendererPlugin.java` 里的实现是：

```java
// PdfRendererPlugin.java
ParcelFileDescriptor pfd = ParcelFileDescriptor.open(new File(uri), ParcelFileDescriptor.MODE_READ_ONLY);
```

`File` 类只支持 `file://` 格式，不支持 `content://`，导致 `new File(content://...)` 抛出异常，`_pdf_raw` 根本没有被存储。

**数据流失败路径**：
```
preprocessFile() 开始
    ↓
Filesystem.writeFile() 成功 → 存 "filesystem:pdf_cache/xxx.pdf" 到 IndexedDB
    ↓
parsePdfWithPdfJs() 成功 → 文本内容存到 uniqKey
    ↓
session 更新 → PDFPreviewPanel 挂载
    ↓
读取 _pdf_raw → 得到 "filesystem:pdf_cache/xxx.pdf"
    ↓
Filesystem.getUri() → 返回 "content://..."
    ↓
pdfRenderer.open("content://...") → ❌ File 类不认识 content:// → 报错
    ↓
catch 块 → setError('Failed to load PDF...')
```

### 解决：放弃 Filesystem，改用 FileReader.readAsDataURL()

不再用 `Filesystem.writeFile()` 写文件，改用浏览器原生 `FileReader.readAsDataURL()` 直接转 base64 存 IndexedDB。读取时直接用 `pdfRenderer.openWithBase64(base64)`。

**修复文件 1**：`sessionHelpers.ts`

```typescript
// 替换前（有问题）
try {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  // ... Filesystem.writeFile() ...
  await storage.setBlob(`${uniqKey}_pdf_raw`, `filesystem:${cacheFileName}`)
} catch (rawErr) { ... }

// 替换后（稳健）
try {
  const rawBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])  // 去掉 data:...;base64, 前缀
    }
    reader.onerror = () => reject(new Error('FileReader failed'))
    reader.readAsDataURL(file)
  })
  await storage.setBlob(`${uniqKey}_pdf_raw`, rawBase64)
  log.debug('Stored PDF raw bytes to IndexedDB, size:', rawBase64.length)
} catch (rawErr) {
  log.error('Failed to store PDF raw bytes:', rawErr)
}
```

**修复文件 2**：`$sessionId.tsx`

```typescript
// 替换前（有问题）
if (rawRef.startsWith('filesystem:')) {
  const uriResult = await Filesystem.getUri({ path: filePath, directory: Directory.Data })
  const openResult = await pdfRenderer.open(uriResult.uri)  // ← 失败点
  // ...
} else {
  // legacy base64 分支
}

// 替换后（稳健）
let cleanBase64 = rawRef.includes(',') ? rawRef.split(',')[1] : rawRef
cleanBase64 = cleanBase64.replace(/\s/g, '')
const openResult = await pdfRenderer.openWithBase64(cleanBase64)  // ← 直接传 base64
```

### 持久性说明

IndexedDB 数据存在 App 的私有目录里，**不会被系统自动清理**。只有以下情况会丢失：
- 用户手动清除 App 数据
- 卸载 App
- 系统存储空间极度不足时 Android 强制清理

正常使用下，PDF 数据是**永久保存**的。重开 App、关机再开都不会丢失。

---

## 最终修改文件清单

| 文件 | 修改内容 | 所属阶段 |
|------|---------|---------|
| `src/renderer/stores/settingsStore.ts` | 移动端默认解析器 `'none'` → `'local'` | 第二阶段 |
| `src/renderer/platform/mobile_platform.ts` | 改用动态 script 加载 pdf.js + 返回 textParts 数组 | 第二/四阶段 |
| `src/renderer/public/pdfjs/pdf-bridge.mjs` | **新增** — 桥接脚本 | 第二阶段 |
| `src/renderer/public/pdfjs/pdf.min.mjs` | **新增** — pdf.js 核心库 | 第二阶段 |
| `src/renderer/public/pdfjs/pdf.worker.min.mjs` | **新增** — pdf.js Worker | 第二阶段 |
| `src/renderer/stores/sessionHelpers.ts` | 存 `_pdf_raw`（FileReader）+ `_pdf_pages` 文本 | 第三/四/五阶段 |
| `src/renderer/storage/StoreStorage.ts` | 添加 `linkUniqKey()` 方法 | 第四阶段 |
| `src/renderer/routes/session/$sessionId.tsx` | 手势逻辑 + UI 浮层页码 + openWithBase64 | 第三/四/五阶段 |
| `android/app/src/main/java/.../MainActivity.java` | 注册 PdfRendererPlugin | 第三阶段 |
| `android/app/src/main/java/.../PdfRendererPlugin.java` | `bitmap.eraseColor(Color.WHITE)` | 第三阶段 |
| `.github/workflows/release-android.yml` | **新增** — Android 构建 & 发布 | 第二阶段 |
| `src/renderer/modals/FileParseError.tsx` | 重写错误弹窗，20+ 种场景中文提示 | 第二阶段 |

---

## 关键经验总结

### 1. Vite + ESM 二次打包的坑
- Vite 对 `node_modules` 中的 ESM 文件进行二次打包会破坏特定模块机制
- **解决方案**：将这类库（pdfjs-dist）作为静态资源放在 `public/` 目录，完全不经过 Vite

### 2. `atob()` 调用前必须清洗输入
```typescript
const clean = base64.includes(',') ? base64.split(',')[1] : base64
atob(clean.replace(/\s/g, ''))
```

### 3. 存储时区分"解析内容"和"原始数据"
- `storageKey` → 文本内容（给 AI）
- `storageKey_pdf_raw` → 原始 PDF base64 bytes（给预览）
- `storageKey_pdf_pages` → 每页文本（给复制弹窗）

### 4. Android PdfRenderer 渲染到 JPEG 必须填充白色背景
```java
bitmap.eraseColor(android.graphics.Color.WHITE)  // 必须在 render() 之前
```

### 5. Capacitor 自定义插件必须手动注册
```java
registerPlugin(YourPlugin.class);  // 必须在 super.onCreate() 之前
```

### 6. File API URI 格式与 File 类的兼容性
- `Filesystem.getUri()` 在 Android 上返回 `content://` 格式 URI
- `File` 类（Java）只支持 `file://` 格式，不支持 `content://`
- `ParcelFileDescriptor.open(new File(content://...), ...)` 会直接失败
- **解决方案**：不用 Filesystem，直接用 `FileReader.readAsDataURL()` + `pdfRenderer.openWithBase64()`

### 7. IndexedDB 持久性
- IndexedDB 数据存在 App 私有目录，正常情况下永久保存
- 不会被系统自动清理，只有用户手动清除或卸载才会丢失
- 足以替代 Filesystem 方案，且更简单可靠

### 8. 平台隔离原则
所有移动端特有逻辑都用 `platform.type === 'mobile'` 或 `if (!isMobile) return` 隔离，确保桌面端不受影响。

---

## 注意事项

1. **旧会话兼容性**：Bug 3 修复后，之前上传的 PDF 没有 `_pdf_raw`，需要重新上传才能看到预览
2. **`touchAction: 'none'` 是必须的**，否则 Android WebView 会拦截双指手势
3. 滑动翻页和双指缩放互斥：双指操作时不触发翻页，单指滑动时也不触发缩放
4. Bug 5 修复后，之前用 Filesystem 格式存的 PDF（`filesystem:pdf_cache/xxx.pdf`）读取会失败，需要重新上传

---

**开发日期**：2026-05-24 ~ 2026-05-31  
**涉及文件**：13 个  
**修复 Bug 数**：5 个  
**最终状态**：✅ PDF 上传 → 解析 → 渲染 → 手势交互 → 文本复制 完整可用