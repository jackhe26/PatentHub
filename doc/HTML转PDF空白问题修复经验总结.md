# HTML 转 PDF 右侧/下方空白问题修复经验总结

> 模块：PDF 翻译 / PDF 转换 → JSON 重建网页 → HTML 打印为 PDF
> 涉及文件：`src/main/pdf-convert/html-renderer.ts`、`src/main/pdf-convert/ipc-handlers.ts`、`src/main/pdf-convert/pdf-rebuilder.ts`
> 版本演进：v9.5 → v9.6 → v9.7

---

## 一、问题现象

将 OCR 解析得到的 `layout.json` 重建为网页（HTML），再通过 Electron `printToPDF` 打印成 PDF 时：

1. **导出的 PDF 右侧与下方存在大片空白**（内容只占左上角）。
2. 第一页的 **EPO 徽标 Logo 丢失**。
3. 表格内文字 **换行丢失、单词粘连**（如 `PCTWRITTEN OPINION...`、`ApplicantBOSE`），复选框符号 `☒/☐` 显示为空白。

关键迷惑点：**HTML 预览页面看起来完全正常**（内容填满），唯独"HTML → 打印 PDF"这一步出现空白。

---

## 二、根因分析（分三层）

### 根因 1：打印纸张与内容页尺寸不匹配（空白主因）

`ipc-handlers.ts` 中 `printToPDF` 配置：

```ts
const pdfBuffer = await win.webContents.printToPDF({
  pageSize: format,          // 'A4'
  printBackground: true,
  preferCSSPageSize: true,   // ★ 优先使用 CSS @page 尺寸
  margins: { top: 0, bottom: 0, left: 0, right: 0 },
})
```

- `preferCSSPageSize: true` 表示"优先用 CSS 里的 `@page` 规则定义纸张尺寸"。
- **但生成的 HTML/CSS 里根本没有 `@page` 规则**，浏览器只能回退到 A4 纸张。
- 同时此前为"减少空白"做的优化，把 `.page` 裁剪成了"贴合内容"的动态尺寸（如 559px）。
- 结果：**大纸张（A4）+ 小内容页（裁剪后）= 内容贴在左上角，右/下留白**。

> 教训：`preferCSSPageSize: true` 与"没有 `@page` 规则"是致命组合；并且"裁剪页面尺寸"在屏幕预览上有效，在打印纸张上会放大成空白。

### 根因 2：表格 HTML 内的 `<img>` 未做 base64 解析（Logo 丢失）

- Logo 是嵌在表格 HTML 字符串内部的 `<img src="eb2a....jpg"/>`。
- 原 `renderTable` 只对 `block.img_path` 调用 `resolveImageSrc`，**从不扫描表格 HTML 字符串里的 `<img>`**。
- 相对文件名无法映射到 `imageBase64Map` → 图片加载失败。

### 根因 3：OCR 文本粘连 + 缺少换行/符号处理

- OCR 把多行文本拼成一串，单元格内 `\n` 未转 `<br>`。
- 固定短语（标题、申请号、日期、Box No. 等）被粘连。
- 复选框 Unicode 字符在缺字体时渲染为空白。

---

## 三、解决方案（v9.7 最终版）

### 方案 1：注入与页面尺寸匹配的 `@page` 规则（核心修复）

```ts
// 以首页 page_size 作为 @page 纸张尺寸
const firstSize = pages[0]?.page_size ?? [595, 841]
const pageCss = `
@page {
  size: ${firstSize[0]}px ${firstSize[1]}px;
  margin: 0;
}`
if (embedStyles) css += pageCss
```

并**取消动态裁剪**，`.page` 恢复使用完整 `page_size`：

```ts
const pageWidth = page.page_size[0]
const pageHeight = page.page_size[1]
```

效果：`preferCSSPageSize:true` 让打印纸张 = `.page` 尺寸，1:1 对齐 → 无空白。

### 方案 2：解析表格 HTML 内部 `<img>`

```ts
function resolveTableImages(html: string, opts: BlockToHtmlOptions): string {
  if (!html) return html
  return html.replace(/<img([^>]*?)src=["']([^"']+)["']([^>]*)>/gi, (_m, pre, src, post) => {
    const resolved = resolveImageSrc(src, opts)
    return `<img${pre}src="${resolved}"${post}>`
  })
}
// 在 renderTable 中 postProcessTableHtml 之后调用
tableHtml = resolveTableImages(tableHtml, opts)
```

### 方案 3：表格文本换行 + 短语拆分 + 符号统一

```ts
// 0. \n → <br>
processed = processed.replace(/\r?\n/g, '<br>')
// 3. 已知 PCT 短语强制换行（PCT_PHRASE_BREAKS 表逐条 replace）
// 4. 复选框符号统一：\u2612→☒，\u2610/\u25a1→☐
```

---

## 四、关键经验与坑

1. **`printToPDF` + `preferCSSPageSize: true` 必须配套 `@page` 规则**，否则回退 A4 导致尺寸错位。这是本次空白的真凶。
2. **"屏幕预览正常"≠"打印正常"**：屏幕用 CSS 像素自由布局，打印受纸张尺寸约束。涉及打印一定要单独验证导出结果。
3. **页面尺寸裁剪是双刃剑**：屏幕上去白边有效，但打印时反而制造空白。统一坐标系（完整 page_size）+ 匹配纸张（@page）才是正解。
4. **表格内嵌图片要单独处理**：`img_path` 字段与表格 HTML 字符串里的 `<img>` 是两条独立链路，都要覆盖。
5. **px vs 物理单位**：`@page size` 用 px 时浏览器按 96 DPI 渲染，PDF 物理尺寸会比 72pt 的 A4 略小，但比例一致、无空白。若需严格 A4 物理尺寸，应改用 `210mm 297mm` 并对内容做整体 `transform: scale()`。

---

## 五、踩坑：文件写入污染

调试中曾因工具误写，导致源文件混入：
- 模板字符串被错误转义为 `\${...}`（应为 `${...}`）；
- 文件末尾残留 `</write_to_file>` 标签 → esbuild 报 `Unexpected "/"`。

教训：大段替换后务必复查文件尾部与模板字符串，并以一次 `pnpm start` 编译验证为准。

---

## 六、验证结果

- `pnpm start`：主进程、preload 构建成功，应用正常启动。
- HTML 预览：Logo 恢复、文字换行正确。
- HTML → 打印 PDF：右侧/下方空白消失，页面填满纸张。✅

---

## 七、后续可优化方向

- 多页 page_size 不一致时，按页设置 `@page`（当前以首页为准）。
- 短语换行依赖固定 `PCT_PHRASE_BREAKS`，通用性有限；可考虑在 `normalizeLayoutBlock` 标准化阶段基于 OCR span 坐标自动断行，摆脱硬编码。
- 如需标准 A4 物理输出，落地 `mm + transform: scale` 精确方案。

---

## 八、v10.1 声明三元组表格对齐与拓宽（权利要求序号 1-19 错位修复）

### 问题现象
重建 PDF 的"声明"区域（Déclaration / Statement），权利要求序号（如 `1-19`）：
1. 被挤到单独一行、居中显示，与同行 `Oui : Revendications` 不对齐；
2. 表格只占左半页，右侧大片空白未利用。

### 根本原因
1. `renderClaimCell()` 把序号用 `display:block; text-align:center` 渲染成独立居中行，破坏了"Revendications 1-19"应在同一行的视觉关系；
2. `renderDeclarationTable()` 的表格宽度 = 原始 bbox 并集宽度（`x1-x0`），只覆盖左半页，第三列即便 48% 也太窄，导致序号换行。

### 解决方案（src/main/pdf-convert/html-renderer.ts）
1. CSS `decl-claimno` 改为 `display:inline; margin-left:16px; white-space:nowrap`：序号与 `Revendications` 同行、左侧留间距、保留下划线；
2. 列宽调整为 40% / 12% / 48%，并给 `decl-col1` 设 `white-space:normal` 允许 label 换行；
3. `BlockToHtmlOptions` 新增 `pageWidth`，在页面循环里传入；
4. `renderDeclarationTable()` 把右边界 `x1` 拓宽到 `pageWidth - x0`（左右对称留白），充分利用右侧空白，避免第三列换行。

### 注意
- `b.type === 'image'` 的 TS 比较告警为历史遗留（运行时 image 类型来自 MinerU 数据，未列入类型联合），不影响本次修复与运行。

---

## 九、v10.2 标题裁剪 / OCR 粘连换行 / Statement 表格识别修复

> 测试数据：`PCT+WOSA+914V1_OCR_1/layout.json`（英文 PCT WOSA 表单）

### 问题现象（对照原 PDF 左 / 输出右）
1. **附图1 标题缺字**：`PATENT COOPERATION TREATY` 输出成 `PATENT COOPERATION`，末词 `TREATY` 被裁掉。
2. **附图1 "To:see form ..."** 未换行：原文 `To:` 独占一行、`see form PCT/ISA/220` 在下方，输出粘连成一行。
3. **附图1 "Box No. I~VIII"** 未换行未对齐：整段 `Box No. IBasis...Box No. IIPriority...` 连成一片。
4. **附图2 Statement 三列表** 没对齐：整张表渲染成跑版纯文本 `1. StatementNovelty (N)Yes: Claims1-20No: Claims...`。

### 根本原因
1. 标题用 `getAutoFitFontSize` 按 bbox 面积估字号，但 OCR 给的标题 bbox 偏窄（228px），算出的字号下整行 nowrap 文本宽度 > bbox，加上 `.abs-item overflow:hidden` → 末词被裁。
2. `PCT_PHRASE_BREAKS` 没有 `To:see form` 规则；`Box No.` 规则要求罗马数字后有空格，但 OCR 输出是 `Box No. IBasis`（数字与描述词粘连），规则不命中。
3. `detectSpecialLegalTable` 要求每行恰好 3 个 `<td>` 才检测，但 Statement 表用 `rowspan` 让「No: Claims」行只有 2 个 `<td>` → 永远检测不到 → 退化成普通表格 / 跑版文本。

### 解决方案（src/main/pdf-convert/html-renderer.ts）
1. 标题：CSS `.abs-item.title` 改 `overflow:visible; white-space:nowrap; text-align:center`；`renderItemWithText` 对 `title` 以中心为基准、按估算文本宽度把盒子向两侧对称扩展（并限制不超过页宽），整行标题完整居中。
2. 新增换行规则：`To:see form → To:<br>see form`；`Box No. <罗马数字>` 前换行且补空格分隔后续描述词（`[/\s*(Box No\.\s*)([IVXLC]+)\s*(?=[A-Z])/g, '<br>$1$2 ']`）。
3. `detectSpecialLegalTable` 改为「扫描所有单元格」：只要存在 `Yes/No/Oui/Non: Claims/Revendications` 单元格 + 存在纯数字序号单元格即判定，兼容 rowspan 导致的 2 单元格行；从而进入 `ph-legal-table` 三列对齐样式。

### 验证
临时脚本对该 layout.json 跑 `rebuildHtml`，6 项断言全部通过（标题完整 / To 换行 / Box No. I & VIII 换行 / Statement 识别为 ph-legal-table / Yes: Claims 单元格存在）。
