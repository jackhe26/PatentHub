# PDF 长按文本选中功能开发总结

## 功能概述

在 Android 移动端的 PDF 阅读面板中，通过长按 PDF 页面某处，自动识别并弹出该位置所属的段落文本，供用户复制。

- 触发方式：长按 PDF 页面 600ms
- 显示内容：目标段落 ± 1，共3段纯文本
- 关闭方式：点击遮罩或右上角"关闭"按钮

---

## 开发历程

### 第一阶段：基础实现

**目标**：长按弹出段落文本，文本可选复制。

**实现方案**：
1. 用 pdf.js 解析 PDF，获取每页文本及 Y 坐标
2. 按 Y 间距阈值切割段落
3. 计算长按位置到各段落的欧几里得距离，定位最近段落
4. 弹窗显示3段纯文本，`userSelect: text`

**初始问题**：
- Y 坐标计算不准（用 canvas 高度归一化，缩放后偏移）
- 长按坐标没有考虑 letterbox 偏移（objectFit:contain 产生的黑边）

**修复**：
- mobile_platform.ts：yRatio 改用 `pageHeight` 归一化（固定高度，非 canvas 动态高度）
- $sessionId.tsx：长按坐标计算加入 letterbox 偏移修正

---

### 第二阶段：段落划分算法

**问题**：段落划分不准确，同一段落被切成多个。

**错误尝试**：

1. **首行缩进 + 行距双峰算法（p75 * 1.5）**
   ```js
   // 条件A: Y间距 > p75 * 1.5
   // 条件B: 当前行 X > 正文左边距 + 阈值（错误：用的是 prev.xPdf）
   ```
   **失败原因**：
   - 用了 `prev.xPdf`（当前行）判断有缩进，应该用 `curr.xPdf`（下一行）
   - 把 "(1)..."、"(2)..."、"(3)..." 这些续行也误判为新段落首行

2. **首行缩进逻辑方向错误**
   ```js
   // 错误：检测当前行有缩进
   const isIndentedParaEnd = (prev?.xPdf || 0) >= indentThreshold && gap > (p75 * 0.3)
   
   // 正确：检测下一行有缩进（新段落首行）
   const isIndentedParaEnd = (curr?.xPdf || 0) >= indentThreshold && gap > (p50 * 0.5)
   ```

**最终方案（两个条件 OR）**：

1. **条件A**：Y 间距 > p50 * 1.5（段落间距明显大于行距）
2. **条件B**：下一行 X > 正文左边距 + 10px 且 Y 间距 > p50 * 0.5（下一行是首行缩进，排除同一行内多个 item）

**关键参数选择**：
- p50（中位数）比 p75（75分位数）更贴近真实行距
- p50 * 1.5 阈值落在行距和段落间距之间，精度更高
- 首行缩进检测的是**下一行**（`curr.xPdf`），不是当前行

---

## 用户反馈记录

| 反馈 | 分析 | 处理 |
|------|------|------|
| "To address this... (1)... (2)... (3)..." 被切成多个段落 | 首行缩进逻辑用错了方向（prev.xPdf 而非 curr.xPdf） | 修正为检测下一行 |
| 段落内部行被切断 | 阈值 p75 * 1.5 太高，p50 * 1.5 更准确 | 改用 p50 * 1.5 |
| 弹窗显示错误段落 | 长按坐标没有考虑 letterbox 偏移 | 加入 letterbox 修正 |
| 弹窗关闭按钮太小 | 移动端触摸区域需要更大 | 改为点击遮罩关闭 |

---

## 技术要点

### 1. Y 坐标归一化

```js
// ✅ 正确：用 PDF 页面固定高度归一化
yRatio = item.y / pageHeight

// ❌ 错误：用 canvas 动态高度归一化（缩放后偏移）
yRatio = item.y / canvas.height
```

### 2. Letterbox 偏移修正

```js
const scaleToFit = Math.min(containerWidth / renderedW, containerHeight / renderedH)
const displayW = renderedW * scaleToFit
const displayH = renderedH * scaleToFit
const offsetX = (containerWidth - displayW) / 2
const offsetY = (containerHeight - displayH) / 2
const imgY = ((rawY - offsetY) / scale) / displayH  // 归一化到 [0,1]
```

### 3. 段落中心点计算

```js
// ✅ 正确：用段落内所有 block 的 Y 坐标均值
const avgY = paraBlocks.reduce((s, b) => s + (b.yRatio || 0), 0) / paraBlocks.length

// ❌ 错误：用段落起止索引的中点（偏离段落中心）
const midpointY = (para.start + para.end) / 2 / pageBlocks.length
```

### 4. 首行缩进检测方向

```js
// ✅ 正确：检测下一行是否是新段落首行（缩进）
isIndentedParaEnd = !isEndOfBlocks && (curr?.xPdf || 0) >= indentThreshold && gap > (p50 * 0.5)

// ❌ 错误：检测当前行是否有缩进（方向反了）
isIndentedParaEnd = (prev?.xPdf || 0) >= indentThreshold && gap > (p75 * 0.3)
```

---

## 文件改动

| 文件 | 改动内容 |
|------|---------|
| src/renderer/platform/mobile_platform.ts | yRatio 改用 pageHeight 归一化 |
| src/renderer/routes/session/$sessionId.tsx | 长按坐标 letterbox 修正；段落中心点用 Y 坐标均值；段落划分算法（p50*1.5 + 下一行首行缩进）；弹窗改为3段纯文本 |

---

## Commit 记录

| Commit | 内容 |
|--------|------|
| 4131818 | yRatio 归一化 + letterbox 偏移修正 |
| 31a5a73 | 段落划分首行缩进+行距双峰算法，弹窗改为3段纯文本 |
| 722ff5e | 修正首行缩进逻辑方向（prev.xPdf → curr.xPdf），阈值 p75→p50 |

---

## 经验总结

1. **PDF 文本不是按段落组织的**：pdf.js 的 text item 是按行甚至按词组织的，没有段落语义标签
2. **首行缩进检测要检测"下一行"**：逻辑是"如果在当前位置和下一行之间切断，下一行是新段落首行"，而不是"当前行有缩进"
3. **p50 比 p75 更准确**：中位数更贴近典型行距，乘以 1.5 后的阈值正好落在行距和段落间距之间
4. **坐标归一化要用固定值**：PDF 页面高度是固定的，不要用 canvas 动态高度
5. **letterbox 修正不可少**：objectFit:contain 会产生黑边，长按坐标必须修正否则定位不准

---

## 待优化方向

1. 尝试 `page.getStructTree()` 获取 PDF 语义结构（有结构标签的学术论文精度更高）
2. 支持更多 PDF 格式（如扫描版图片 PDF 无文本层）
3. 段落划分的容错机制（多段合并建议）