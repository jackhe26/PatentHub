# Android 端 PDF 本地解析 — 完整开发经验总结

## 概述

为 Android 端 App 实现 PDF 文件上传并提取文本内容的功能。整个开发过程经历了 3 次失败尝试，最终通过「静态资源注入绕过 Vite 打包」方案成功解决。

---

## 问题背景

| 项目 | 说明 |
|------|------|
| **框架** | Electron + React + TypeScript + Capacitor (Android) |
| **构建工具** | electron-vite (Vite) |
| **PDF 库** | pdfjs-dist v5.4.296 (Mozilla PDF.js) |
| **目标平台** | Android WebView (Capacitor) |
| **需求** | 用户选择本地 PDF 文件 → 提取文本 → 发送给 AI 模型 |

---

## 调用链路

```
用户选择PDF文件 (InputBox)
    ↓
insertFiles() → startFilePreprocessing()
    ↓
sessionHelpers.preprocessFile()
    ↓
getEffectiveDocumentParserConfig() → { type: 'local' }
    ↓
switch (parserConfig.type):
  case 'local':
    if (platform.type === 'mobile' && file.name.endsWith('.pdf'))
      → platform.parsePdfWithPdfJs(file)   ← 核心方法
    else
      → parseFileWithLocalParser(file)
    ↓
提取文本 → 存储到 IndexedDB → 发送给 AI
```

---

## 修复历程（4次尝试）

### 🔴 尝试1：修复解析器默认配置 (settingsStore.ts)

**发现**：排查发现 `getPlatformDefaultDocumentParser()` 为移动端返回 `{ type: 'none' }`，导致 PDF 文件直接走 `case 'none'` 抛出 `document_parser_not_configured`，已有的 `parsePdfWithPdfJs()` 代码从未被执行。

**修改**：
```typescript
// src/renderer/stores/settingsStore.ts
// 修改前:
return platform.type === 'desktop' ? { type: 'local' } : { type: 'none' }
// 修改后:
return platform.type === 'web' ? { type: 'none' } : { type: 'local' }
```

**结果**：❌ 配置对了，但解析仍然失败。错误：`"NO 'GlobalWorkerOptions.workerSrc' specified."`

---

### 🔴 尝试2：设置 workerSrc = ''

**分析**：pdf.js 默认尝试加载 Web Worker，Android WebView 中 Worker 路径可能解析失败。

**修改**：
```typescript
// src/renderer/platform/mobile_platform.ts
const pdfjsLib = await import('pdfjs-dist')
pdfjsLib.GlobalWorkerOptions.workerSrc = ''  // ← 新增
```

**结果**：❌ Vite dev 环境可能有效，但 production build 后失效。`GlobalWorkerOptions` 变成了 Vite 的代理对象，赋值不生效。

---

### 🔴 尝试3：使用 legacy build + disableWorker

**分析**：既然 `workerSrc` 赋值不生效，换个思路 — 用 legacy build 并在 `getDocument()` 时直接传 `disableWorker: true`。

**修改**：
```typescript
// src/renderer/platform/mobile_platform.ts
const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
const loadingTask = pdfjsLib.getDocument({
  data: arrayBuffer,
  disableWorker: true,
  isEvalSupported: false,
} as any)
```

**结果**：❌ 仍然失败。原因是 `import('pdfjs-dist/legacy/build/pdf.mjs')` 这个文件本身也是 webpack 产物，被 Vite 二次打包后内部机制再次被破坏。

---

### 🟢 尝试4（成功）：静态资源注入绕过 Vite

**核心洞察**：**不管怎么改 import，只要经过 Vite 打包，pdfjs-dist 的 ESM bundle 内部机制就会被破坏。** 唯一的解法是让 pdf.js 完全不经过 Vite 处理。

**方案**：把 pdf.js 文件作为「静态资源」放在 `public/` 目录，运行时用 `<script>` 标签动态注入。

**新增文件结构**：
```
src/renderer/public/pdfjs/
├── pdf-bridge.mjs      # 桥接脚本
├── pdf.min.mjs         # pdf.js 核心库
└── pdf.worker.min.mjs  # pdf.js Worker
```

**pdf-bridge.mjs**（关键文件）：
```javascript
// 这个文件作为静态资源，不会被 Vite 处理
// GlobalWorkerOptions 是真实对象，赋值有效
import * as pdfjsLib from './pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
window.pdfjsLib = pdfjsLib;
```

**核心方法重写**：
```typescript
async parsePdfWithPdfJs(file: File) {
  // 不 import pdfjs-dist！
  // 改用动态 script 标签加载 static resource
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
  // pdfjsLib 是真实对象，workerSrc 已正确设置
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  // ...
}
```

**结果**：✅ 成功！Android 端正常解析 PDF 文件。

**原理对比**：
```
❌ 失败路径: import('pdfjs-dist') → Vite 打包 → 代理对象 → workerSrc 赋值无效
✅ 成功路径: <script src='/pdfjs/pdf-bridge.mjs'> → 浏览器原生加载 → 真实对象 → workerSrc 有效
```

---

## 完整修改清单

| 序号 | 文件 | 修改内容 |
|------|------|---------|
| 1 | `src/renderer/stores/settingsStore.ts` | 移动端默认解析器 `'none'` → `'local'` |
| 2 | `src/renderer/platform/mobile_platform.ts` | `parsePdfWithPdfJs()` 改用动态 script 注入加载 pdf.js |
| 3 | `src/renderer/public/pdfjs/pdf-bridge.mjs` | **新增** — 桥接脚本，设置 workerSrc 并暴露到 window |
| 4 | `src/renderer/public/pdfjs/pdf.min.mjs` | **新增** — 从 pdfjs-dist 复制的核心库 |
| 5 | `src/renderer/public/pdfjs/pdf.worker.min.mjs` | **新增** — 从 pdfjs-dist 复制的 Worker |
| 6 | `src/renderer/modals/FileParseError.tsx` | 重写错误弹窗，20+种场景中文提示 |
| 7 | `.github/workflows/release-android.yml` | **新增** — Android 独立构建 & 发布 Workflow |
| 8 | `package.json` | 版本号 1.1.6 → 1.2.0 |
| 9 | `README.md` | 版本号 + 下载链接 + 更新日志 |

---

## 关键经验教训

### 1. Vite + ESM 二次打包的坑
- Vite 对 `node_modules` 中的 ESM 文件会进行二次打包
- 某些依赖库（如 pdfjs-dist）的 ESM bundle 内部使用了特定的模块机制
- 二次打包会破坏这些机制（如 `GlobalWorkerOptions` 变成代理对象）
- **解决方案**：将这类库作为静态资源，不经过 Vite 处理

### 2. 桌面端 vs 移动端的差异
- 桌面端（Electron）可以正常使用 `import('pdf-parse')`，因为它在 Node.js 主进程中运行
- 移动端是 WebView 环境，依赖完全通过 Vite 打包到前端 bundle
- **同样的代码，bundle 后行为可能完全不同**

### 3. `disableWorker` 参数的实际效果
- `pdfjsLib.getDocument({ data, disableWorker: true })` 理论上应该绕过 Worker
- 但在 Vite 打包环境下，`getDocument()` 内部可能仍然检查 workerSrc
- **不要依赖单个参数解决问题，要从根本（模块加载方式）入手**

### 4. pdfjs-dist 的选择
- `import('pdfjs-dist')` — 主入口，受 Vite 影响最大
- `import('pdfjs-dist/legacy/build/pdf.mjs')` — legacy build，但对 Vite 二次打包仍然敏感
- 复制到 public/ 目录的原始文件 — 完全不受影响 ✅

### 5. 调试建议
- 在 `parsePdfWithPdfJs()` 中添加 `console.log` 打印 `typeof pdfjsLib` 和 `pdfjsLib.GlobalWorkerOptions.workerSrc`
- 如果 `workerSrc` 是 `undefined`（而非 `''` 或路径），说明赋值没生效
- 如果从 `window.pdfjsLib` 读取，确保值不是 Vite 代理对象

---

## 对电脑端的影响

❌ 无影响。原因：

1. `parsePdfWithPdfJs()` 仅在 `platform.type === 'mobile'` 时调用
2. `DesktopPlatform` 未实现此方法（接口中为可选 `?`）
3. 桌面端始终使用 Electron 主进程的 `file-parser.ts`（officeparser + pdf-parse）
4. `public/pdfjs/` 文件只是多复制了一份到构建输出，不被桌面端加载

---

## 版本信息

- **开发日期**：2026-05-30
- **版本**：v1.2.0
- **涉及文件**：9 个
- **失败尝试**：3 次
- **最终方案**：静态资源注入绕过 Vite 打包