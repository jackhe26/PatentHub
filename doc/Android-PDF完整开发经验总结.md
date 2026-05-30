# Android 端 PDF 功能完整开发经验总结

## 概述

为 Android 端 App 实现 PDF 文件上传、解析、渲染预览、手势交互的完整功能。整个开发过程分为 4 个阶段，覆盖了从"完全无法使用"到"流畅完整"的全部过程。

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
│  移动端 PDF 原始数据存储（Filesystem）           │
│  → 原始 bytes → storage.setBlob(uniqKey_pdf_raw)│
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

**修复**：`android/app/src/main/java/com/patent/hub/MainActivity.java`

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

## 最终修改文件清单

| 文件 | 修改内容 | 所属阶段 |
|------|---------|---------|
| `src/renderer/stores/settingsStore.ts` | 移动端默认解析器 `'none'` → `'local'` | 第二阶段 |
| `src/renderer/platform/mobile_platform.ts` | 改用动态 script 加载 pdf.js + 返回 textParts 数组 | 第二/四阶段 |
| `src/renderer/public/pdfjs/pdf-bridge.mjs` | **新增** — 桥接脚本 | 第二阶段 |
| `src/renderer/public/pdfjs/pdf.min.mjs` | **新增** — pdf.js 核心库 | 第二阶段 |
| `src/renderer/public/pdfjs/pdf.worker.min.mjs` | **新增** — pdf.js Worker | 第二阶段 |
| `src/renderer/stores/sessionHelpers.ts` | 存 `_pdf_raw`（Filesystem）+ `_pdf_pages` 文本 + 持久化存储 | 第三/四阶段 |
| `src/renderer/storage/StoreStorage.ts` | 添加 `linkUniqKey()` 方法 | 第四阶段 |
| `src/renderer/routes/session/$sessionId.tsx` | Filesystem 读取 + 手势逻辑 + UI 浮层页码 | 第三/四阶段 |
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
- `storageKey_pdf_raw` → 原始 PDF bytes（给预览）
- `storageKey_pdf_pages` → 每页文本（给复制弹窗）

### 4. Android PdfRenderer 渲染到 JPEG 必须填充白色背景
```java
bitmap.eraseColor(android.graphics.Color.WHITE)  // 必须在 render() 之前
```

### 5. Capacitor 自定义插件必须手动注册
```java
registerPlugin(YourPlugin.class);  // 必须在 super.onCreate() 之前
```

### 6. PDF 持久化存储（Filesystem 方案）
- PDF 原始数据存在 IndexedDB 里，容易被 Android 系统清理掉
- 解决方案：使用 Capacitor Filesystem 将 PDF 写入 App 私有目录，IndexedDB 只存路径引用
- 好处：PDF 数据持久化，二次打开不再丢失

### 7. 平台隔离原则
所有移动端特有逻辑都用 `platform.type === 'mobile'` 或 `if (!isMobile) return` 隔离，确保桌面端不受影响。

---

## 注意事项

1. **旧会话兼容性**：Bug 3 修复后，之前上传的 PDF 没有 `_pdf_raw`，需要重新上传才能看到预览
2. **`touchAction: 'none'` 是必须的**，否则 Android WebView 会拦截双指手势
3. 滑动翻页和双指缩放互斥：双指操作时不触发翻页，单指滑动时也不触发缩放
4. 旧会话（纯 base64 格式）仍走旧逻辑，不受影响，下次重新上传时自动使用 Filesystem 格式

---

**开发日期**：2026-05-24 ~ 2026-05-31  
**涉及文件**：12 个  
**修复 Bug 数**：4 个  
**最终状态**：✅ PDF 上传 → 解析 → 渲染 → 手势交互 → 文本复制 完整可用