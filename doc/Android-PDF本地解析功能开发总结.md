# Android 端 PDF 本地解析功能开发总结

## 概述

为 Android 端 App 添加了本地 PDF 解析功能，解决用户无法传递本地 PDF 文件到对话窗口进行解析的问题。

## 问题根源

- **问题**：Android 端选择 PDF 文件后解析失败
- **原因**：移动端 `parseFileLocally()` 方法只支持纯文本文件（.txt/.md），没有实现 PDF 解析
- **影响**：用户选择 PDF 文件 → 显示文件名 → 发送 → 解析失败

## 解决方案

使用项目已有的 `pdfjs-dist` 库（pdf-parse 的底层依赖），在移动端实现 PDF 本地解析。

### 技术选型

| 方案 | 库 | 优点 | 缺点 |
|------|-----|------|------|
| pdf.js (推荐 ✅) | pdfjs-dist | 与桌面端一致，无需新增依赖 | 解析效果略弱于 PDFBox |
| 原生插件 | Android PdfRenderer | 解析效果最好 | 需要写原生代码 |

**最终选择**：pdfjs-dist（方案 A），因为：
1. 项目已经依赖（pdf-parse 的子依赖）
2. 与桌面端解析技术一致
3. 开发工作量小

## 修改的文件

### 1. `src/renderer/platform/mobile_platform.ts`

添加了 `parsePdfWithPdfJs()` 方法：

```typescript
async parsePdfWithPdfJs(file: File): Promise<{ content: string; error?: string }> {
  const pdfjs = await getPdfJsLib()
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise
  
  // 提取每一页的文本
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()
    // ...
  }
  return { content: fullText }
}
```

### 2. `src/renderer/platform/interfaces.ts`

添加方法类型定义：

```typescript
parsePdfWithPdfJs?(file: File): Promise<{ content: string; error?: string }>
```

### 3. `src/renderer/stores/sessionHelpers.ts`

修改 `preprocessFile()` 函数，检测移动端 PDF 文件时使用新的解析方法：

```typescript
case 'local': {
  if (platform.type === 'mobile' && file.name.toLowerCase().endsWith('.pdf') && platform.parsePdfWithPdfJs) {
    // 使用 pdf.js 解析
    const parseResult = await platform.parsePdfWithPdfJs(file)
    // ...
  } else {
    // 桌面端原有逻辑
  }
}
```

## 工作原理

```
用户选择 PDF 文件
        ↓
判断：移动端 + PDF 文件 + local 解析器
        ↓
调用 parsePdfWithPdfJs()
        ↓
使用 pdfjs-dist 提取文本
        ↓
存储到 IndexedDB
        ↓
发送给 AI 模型
```

## 影响范围

| 平台 | 影响 |
|------|------|
| **Android** | ✅ 新增 PDF 本地解析功能 |
| **iOS** | ✅ 同样支持（共享代码） |
| **桌面端** | ✅ 无影响 |
| **Web 端** | ✅ 无影响 |

## 测试验证

1. 在 Android 设备上安装 App
2. 选择"本地"解析器（默认）
3. 选择一个 PDF 文件
4. 发送消息
5. 确认 PDF 内容被正确解析

## 技术细节

- **依赖**：`pdfjs-dist@5.4.296`（已有，通过 pdf-parse 引入）
- **解析方式**：纯 JavaScript，无 Native 代码
- **兼容性**：支持所有现代浏览器和移动端
- **限制**：基于文本提取，无法处理图片中的文字（OCR）

## 后续优化

1. **大文件处理**：添加文件大小限制（如 50MB）
2. **进度显示**：PDF 解析可能较慢，添加加载动画
3. **错误处理**：优化错误提示信息

---

**开发日期**：2026-05-24  
**涉及文件**：3 个文件
</parameter>
<task_progress>
- [x] 分析代码流程，找出问题根源
- [x] 确认问题：移动端未实现 PDF 本地解析
- [x] 分析需要修改的文件及影响
- [x] 在 mobile_platform.ts 添加 PDF 解析方法
- [x] 在 interfaces.ts 添加类型定义
- [x] 在 sessionHelpers.ts 修改解析逻辑
- [x] 生成开发总结文档
</task_progress>
</invoke>
</minimax:tool_call>
