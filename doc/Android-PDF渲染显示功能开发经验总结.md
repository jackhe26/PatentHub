# Android 移动端 PDF 渲染显示功能开发经验总结

## 概述

为 Android 端实现 PDF 本地渲染预览功能，使用 Android 原生 `PdfRenderer` API 将 PDF 页面渲染为图片，在 WebView 中显示。整个开发过程经历了 **4 个独立 Bug**，每个 Bug 都有明确的根本原因和修复方案。

---

## 技术架构

```
PDF 文件上传
    ↓
sessionHelpers.ts (preprocessFile)
    ├── 解析文本内容 → storage.setBlob(uniqKey, text)         [给 AI 用]
    └── 存原始 PDF bytes → storage.setBlob(uniqKey_pdf_raw, base64)  [给预览用]
    ↓
PDFPreviewPanel ($sessionId.tsx)
    └── 读取 storageKey_pdf_raw → 传给 native plugin
    ↓
PdfRendererBridge.ts (TypeScript)
    └── registerPlugin('PdfRenderer') → Capacitor bridge
    ↓
PdfRendererPlugin.java (Android Native)
    └── android.graphics.pdf.PdfRenderer → Bitmap → JPEG base64
    ↓
<img src="data:image/jpeg;base64,..."> 显示
```

---

## Bug 修复历程

### Bug 1：`"PdfRenderer" plugin is not implemented on android`

**错误信息**：
```
"PdfRenderer" plugin is not implemented on android
```

**根本原因**：
`PdfRendererPlugin.java` 写好了，但 `MainActivity.java` 是空的，没有注册插件。Capacitor 自定义插件必须在 `MainActivity.onCreate()` 里调用 `registerPlugin()` 才能被 WebView 识别。

**修复文件**：`android/app/src/main/java/com/patent/hub/MainActivity.java`

```java
// 修复前（空的）
public class MainActivity extends BridgeActivity {}

// 修复后
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PdfRendererPlugin.class);  // ← 关键
        super.onCreate(savedInstanceState);
    }
}
```

**经验教训**：Capacitor 自定义插件必须在 `MainActivity` 里手动注册，`@CapacitorPlugin` 注解本身不够。

---

### Bug 2：`atob` Latin1 range 错误

**错误信息**：
```
Failed to execute 'atob' on 'Window': The string to be decoded contains characters outside of the Latin1 range.
```

**根本原因**：
`safeBase64Decode` 函数直接调用 `atob(base64)`，但 `storage.getBlob()` 返回的字符串可能是 `data:application/pdf;base64,<data>` 格式的 Data URL，`atob()` 遇到冒号、斜杠等非 base64 字符就报错。

**修复文件**：`src/renderer/routes/session/$sessionId.tsx`

```typescript
// 修复前
function safeBase64Decode(base64: string): Uint8Array {
  const binaryString = atob(base64)  // ← 直接调用，没有处理 Data URL 前缀
  ...
}

// 修复后
function safeBase64Decode(base64: string): Uint8Array {
  // 去掉 Data URL 前缀
  const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64
  const normalized = cleanBase64.replace(/\s/g, '')
  try {
    const binaryString = atob(normalized)
    ...
  } catch {
    return new TextEncoder().encode(normalized)
  }
}
```

**经验教训**：`atob()` 只接受纯 base64 字符（A-Z、a-z、0-9、+、/、=），调用前必须去掉 Data URL 前缀和空白字符。

---

### Bug 3：`Failed to open PDF from base64: file not in PDF format or corrupted`

**错误信息**：
```
Failed to open PDF from base64: file not in PDF format or corrupted
```

**根本原因**：
这是最核心的架构问题。`pdfFile.storageKey` 存的是 PDF **解析后的文本内容**（给 AI 用的），不是 PDF 原始二进制数据。把文本内容当 base64 传给 Java 的 `PdfRenderer`，当然报格式错误。

**数据流对比**：
```
❌ 错误理解：storageKey → storage.getBlob() → PDF 二进制数据
✅ 实际情况：storageKey → storage.getBlob() → PDF 解析后的文本（给 AI 用）
```

**修复方案**：在 `preprocessFile` 时额外存一份原始 PDF bytes，用不同的 key 区分。

**修复文件 1**：`src/renderer/stores/sessionHelpers.ts`

```typescript
// 在移动端解析 PDF 时，额外存原始 PDF bytes
try {
  const arrayBuffer = await file.arrayBuffer()
  const uint8 = new Uint8Array(arrayBuffer)
  let bin = ''
  for (let i = 0; i < uint8.length; i++) {
    bin += String.fromCharCode(uint8[i])
  }
  const rawBase64 = btoa(bin)
  await storage.setBlob(`${uniqKey}_pdf_raw`, rawBase64)  // ← 新增
} catch (rawErr) {
  log.error('Failed to store raw PDF bytes for preview:', rawErr)
}
```

**修复文件 2**：`src/renderer/routes/session/$sessionId.tsx`

```typescript
// 读取原始 PDF bytes（不是解析后的文本）
const rawBase64 = await storage.getBlob(`${storageKey}_pdf_raw`)
```

**Key 命名约定**：
| Key | 内容 | 用途 |
|-----|------|------|
| `storageKey` | PDF 解析后的文本 | 发送给 AI 模型 |
| `storageKey_pdf_raw` | PDF 原始 base64 bytes | PDF 预览渲染 |

**经验教训**：文件存储时要明确区分"解析内容"和"原始数据"，用不同的 key 存储，避免混用。

---

### Bug 4：PDF 显示黑色背景，文字不可见

**现象**：PDF 能显示，图片元素可见，但背景是黑色，文字看不到。

**根本原因**：
`Bitmap.createBitmap()` 创建的 bitmap 默认是**透明背景**（ARGB 全零 = `0x00000000`）。JPEG 格式不支持透明通道，压缩时透明区域被填充为黑色。结果：白色背景变黑色，黑色文字在黑色背景上不可见。

```
透明 bitmap → PdfRenderer.render() → 文字是黑色，背景透明
    ↓ JPEG 压缩（不支持透明）
背景变黑色，文字也是黑色 → 文字不可见
```

**修复文件**：`android/app/src/main/java/com/patent/hub/PdfRendererPlugin.java`

```java
// 修复前
Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);

// 修复后
Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
bitmap.eraseColor(android.graphics.Color.WHITE);  // ← 填充白色背景
page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
```

**经验教训**：使用 `PdfRenderer` 渲染到 JPEG 时，必须先用 `bitmap.eraseColor(Color.WHITE)` 填充白色背景，否则透明区域在 JPEG 压缩后变黑。

---

## 完整修改清单

| 序号 | 文件 | 修改内容 | 修复 Bug |
|------|------|---------|---------|
| 1 | `android/app/.../MainActivity.java` | 注册 `PdfRendererPlugin` | Bug 1 |
| 2 | `src/renderer/routes/session/$sessionId.tsx` | `safeBase64Decode` 处理 Data URL 前缀 | Bug 2 |
| 3 | `src/renderer/stores/sessionHelpers.ts` | 存原始 PDF bytes（`_pdf_raw` key） | Bug 3 |
| 4 | `src/renderer/routes/session/$sessionId.tsx` | 读取 `_pdf_raw` key 而非文本 key | Bug 3 |
| 5 | `android/app/.../PdfRendererPlugin.java` | `bitmap.eraseColor(Color.WHITE)` | Bug 4 |

---

## 关键经验总结

### 1. Capacitor 自定义插件必须手动注册
```java
// MainActivity.java
registerPlugin(YourPlugin.class);  // 必须在 super.onCreate() 之前
super.onCreate(savedInstanceState);
```

### 2. `atob()` 调用前必须清洗输入
```typescript
// 去掉 Data URL 前缀，去掉空白字符
const clean = base64.includes(',') ? base64.split(',')[1] : base64
atob(clean.replace(/\s/g, ''))
```

### 3. 存储时区分"解析内容"和"原始数据"
- `storageKey` → 文本内容（给 AI）
- `storageKey_pdf_raw` → 原始 PDF bytes（给预览）

### 4. Android PdfRenderer 渲染到 JPEG 必须填充白色背景
```java
bitmap.eraseColor(android.graphics.Color.WHITE);  // 必须在 render() 之前
```

### 5. 平台隔离原则
所有移动端特有逻辑都用 `platform.type === 'mobile'` 或 `if (!isMobile) return` 隔离，确保桌面端不受影响。

---

## 注意事项

- **旧会话兼容性**：Bug 3 修复后，之前上传的 PDF 没有 `_pdf_raw` 数据，需要重新上传才能看到预览
- **大文件性能**：`btoa()` 对大 PDF 文件（>10MB）可能较慢，可考虑分块处理
- **缓存命中**：`preprocessFile` 有缓存逻辑，如果文件已处理过（`existingContent` 存在），不会重新存 `_pdf_raw`，需注意缓存失效场景

---

**开发日期**：2026-05-30  
**涉及文件**：5 个  
**修复 Bug 数**：4 个  
**最终状态**：✅ PDF 预览正常显示，白色背景，文字清晰可见
