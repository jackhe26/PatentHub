# PDF 渲染问题修复总结

> **日期**：2026-06-20
> **作者**：Claude
> **目标**：修复 MD 重建 PDF 模式的 4 类排版问题

---

## 1. 修复前问题（用户反馈）

| 问题 | 附图 | 原因 |
|------|------|------|
| ① 间隔太大、空格太多 | 附图1 | `lineHeightRatio: 1.55`、标题上下间距过大、字号过大 |
| ② 排版和原文不对应 | 附图1 | box 列表合并成段落 |
| ③ 表格渲染错乱 | 附图2 | 用了伪造 bbox 调用 `drawTableFromHtml`，导致 rowspan 单元格字号塌陷、文字溢出重叠 |
| ④ 小图（logo）占半页 | 附图1 | `drawImageToPage` 强制按 `contentWidth` 拉伸 |

---

## 2. 修复方案（已实施）

### 修复 1：样式紧凑化 ✅

```ts
// src/main/pdf-convert/md-renderer.ts
margin: { top: 45, right: 45, bottom: 45, left: 45 },  // 70/60 → 45/45
fontSize: { h1: 16, h2: 14, body: 9, code: 8.5, table: 8.5 }  // 缩小 14-30%
lineHeightRatio: 1.25,  // 1.55 → 1.25
```

| 调整项 | 旧值 | 新值 |
|--------|------|------|
| Heading topSpace (H1/H2) | 14px | **6px** |
| Heading bottomSpace (H1/H2) | 8px | **3px** |
| `renderParagraph` 段后 | newline(4) | **newline(2)** |
| `renderList` 列表后 | newline(3) | **newline(1.5)** |
| `renderTable` 表后 | newline(6) | **newline(3)** |
| `newline()` 倍率系数 | × 0.3 | **× 0.2** |

### 修复 2：图片尺寸自适应 ✅

```ts
// drawImageToPage 新策略
if (origW <= 180) {
  // 小图（logo/印章）保持原尺寸 ✅
  imgWidth = origW
} else if (origW <= 400) {
  imgWidth = Math.min(origW * 1.1, maxContentWidth)
} else {
  imgWidth = Math.min(origW, maxContentWidth)
}
// 任何情况最大高度 ≤ contentWidth × 0.55（防止占半页）
```

### 修复 3：HTML 表格渲染重写 ✅

**之前问题**：
```ts
// 旧 renderTable 用了伪造 bbox
const fakeBbox = [..., estimatedHeight]  // 估算严重偏低
const ok = await drawTableFromHtml(page, { bbox: fakeBbox, html }, ...)
```

**修复**：重写 `renderHtmlTable()`，直接使用 `parseTableHtml` 解析：
- **动态列宽**：按内容长度加权分配，最小列宽 15px
- **支持 rowspan/colspan**：用 `parseTableHtml` 准确解析
- **字号自适应**：从 8.5pt 降到能装下为止
- **垂直居中**：文字在 cell 内垂直居中

### 修复 4：智能两栏布局 ✅

**新增块类型**：
```ts
| { type: 'twocolGroup'; pairs: Array<{ left, right }> }
```

**检测规则**：连续 ≥4 个短行段落（每行 < 60 字符），自动均分到左右两栏。

**适用场景**：PCT 申请表头（"PATENT COOPERATION TREATY" 左栏 + "PCT" 右栏等）

### 修复 5：Box 列表识别 ✅

**检测规则**：单个段落含 ≥2 个 `[X]`/`[ ]`/`☒`/`☐` 标记 → 拆分成 list。

**之前问题**：8 个 box 选项被合并成 4 行段落（看起来像普通文本）。
**修复后**：每个 box 选项独立一行，带 `•` 标记。

---

## 3. 修复效果（实测数据）

### 3.1 渲染统计

| 指标 | 修复前 | 修复后 | 改善 |
|------|--------|--------|------|
| 页数 | **9 页** | **3 页** | **-67%** |
| 图片嵌入 | 2/3 | 2/3 | — |
| 文件大小 | 24.1 KB | 23.0 KB | -5% |
| 字体来源 | system-windows | system-windows | — |

### 3.2 视觉改进

- ✅ 行间距紧凑，接近原 PDF 密度
- ✅ Logo 保持原尺寸，不再占半页
- ✅ 表格清晰可读（HTML 表格正确处理 rowspan/colspan）
- ✅ Box 列表分行显示
- ✅ PCT 表头识别为两栏布局

---

## 4. 实施文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/main/pdf-convert/md-renderer.ts` | 大改 | 样式紧凑化 + 图片自适应 + 表格重写 + 两栏布局 + box 列表 |
| `src/main/pdf-convert/pdf-rebuilder.ts` | 小改 | export `parseTableHtml` + `TableCell` / `TableRow` |
| `scripts/test-md-rebuild.mjs` | 小改 | 修复 `__dirname` ESM 兼容 |
| `scripts/extract-test-pdf.mjs` | 新增 | 提取 PDF 文本验证内容 |

---

## 5. 已知限制

1. **JSON 重建未优化**：本修复仅针对 MD 重建路径；JSON 重建（`pdf-rebuilder.ts`）走原坐标还原，不需要这些修复。
2. **box 列表识别可能误判**：极少情况下，长段落中含 2 个 box 标记会被误拆（实际数据中未见）。
3. **两栏布局适用场景有限**：只对短行密集区（> 4 行 < 60 字符）有效，长段落不会被分栏。
4. **PDF 文件稍大于 JSON 重建**：因为 MD 重建无 bbox 优化，但比修复前已减小 5%。

---

## 6. 后续优化方向

- [ ] 在 UI 提供"重建模式"切换（auto / json / markdown），让用户选择
- [ ] box 列表识别增加更严格的边界检测（避免误判）
- [ ] 两栏布局增加手动标记语法 `::: columns :::`
- [ ] Markdown 中的 `<table>` 标签样式微调（字号、行高）

---

**修复耗时**：约 1.5 小时
**测试状态**：✅ 独立测试通过（3 页 / 23KB）