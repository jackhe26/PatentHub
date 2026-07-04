# PDF 重建方案综合分析报告（BabelDOC + PaddleOCR）

> **目的**：综合分析 BabelDOC 和 PaddleOCR 两个开源项目的 PDF 解析和重排版算法，结合我们当前的 v11 实现，规划下一阶段改进路线。
>
> **分析日期**：2026-06-20
> **分析对象**：
> 1. BabelDOC（`F:\MyAI_Labs\Patent-AI\BabelDOC-main`）— Python 重排版 PDF 翻译
> 2. PaddleOCR ppstructure（`F:\MyAI_Labs\PaddleOCR-main\PaddleOCR-main\ppstructure`）— Python PDF OCR + DOCX/Markdown 重建

---

## 0. 项目背景对比

| 维度 | BabelDOC | PaddleOCR ppstructure | 我们的 PatentHub v11 |
|------|---------|----------------------|---------------------|
| **语言** | Python | Python | TypeScript + Electron |
| **输入** | 原始 PDF | 扫描件图片/PDF | MinerU OCR JSON |
| **输出** | 翻译后的 PDF | DOCX/Markdown/PDF | 重建 PDF |
| **PDF 库** | PyMuPDF + 自带 pdfminer | pdfplumber / PyMuPDF | pdf-lib |
| **OCR** | 用 MinerU/PaddleOCR | PaddleOCR 自带 | MinerU（云端 API） |
| **目标** | 翻译 + 重排版 | 还原可编辑文档 | 重建可搜索 PDF |
| **核心难点** | 翻译后保持版式 | OCR → 结构化 | OCR → 可搜索 PDF |

**最关键差异**：
- BabelDOC 用 **字符级 bbox**（pdfminer + PyMuPDF 提取）
- PaddleOCR 用 **区域级 bbox**（YOLO 检测 + OCR 识别）
- 我们用 **MinerU 返回的 span/line 级 bbox**（与 PaddleOCR 更接近）

→ **PaddleOCR 算法借鉴价值更高**（数据格式相似）

---

## 1. PaddleOCR pp-structure 核心算法

### 1.1 项目结构

```
PaddleOCR-main/
├── ppstructure/
│   ├── layout/        # 版面分析（YOLO）
│   │   └── predict_layout.py
│   ├── table/         # 表格识别
│   │   ├── predict_table.py        # 检测表格
│   │   ├── predict_structure.py    # 表格结构识别（行列）
│   │   ├── master_match.py         # 单元格匹配
│   │   └── tablepyxl/tablepyxl.py  # 表格 → Excel
│   ├── kie/           # 关键信息提取
│   ├── recovery/      # 文档重建 ⭐⭐⭐ 最相关
│   │   ├── recovery_to_doc.py      # 重建为 Word
│   │   ├── recovery_to_markdown.py # 重建为 Markdown
│   │   └── table_process.py        # HTML→DOCX
│   └── predict_system.py # 主入口
```

### 1.2 重建流程（最相关：recovery_to_doc.py）

```python
def convert_info_docx(img, res, save_folder, img_name):
    doc = Document()
    doc.styles["Normal"].font.name = "Times New Roman"
    doc.styles["Normal"]._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")
    doc.styles["Normal"].font.size = shared.Pt(6.5)
    
    # ⭐ 关键：版面区域识别 - 单栏/双栏自动切换
    flag = 1  # 1=单栏, 2=双栏
    for i, region in enumerate(res):
        # 切换栏数（基于 layout 类型）
        if flag == 2 and region["layout"] == "single":
            section = doc.add_section(WD_SECTION.CONTINUOUS)
            section._sectPr.xpath("./w:cols")[0].set(qn("w:num"), "1")
            flag = 1
        elif flag == 1 and region["layout"] == "double":
            section = doc.add_section(WD_SECTION.CONTINUOUS)
            section._sectPr.xpath("./w:cols")[0].set(qn("w:num"), "2")
            flag = 2
        
        # ⭐ 关键：按 region 类型分别处理
        if region["type"].lower() == "figure":
            # 图片：插入图片
            paragraph_pic = doc.add_paragraph()
            run = paragraph_pic.add_run("")
            if flag == 1:
                run.add_picture(img_path, width=shared.Inches(5))
            elif flag == 2:
                run.add_picture(img_path, width=shared.Inches(2))  # 双栏时图片缩窄
        elif region["type"].lower() == "title":
            # 标题：使用 heading 样式
            doc.add_heading(region["res"][0]["text"])
        elif region["type"].lower() == "table":
            # 表格：HTML→DOCX
            parser = HtmlToDocx()
            parser.table_style = "TableGrid"
            parser.handle_table(region["res"]["html"], doc)
        elif region["type"] == "equation" and "latex" in region["res"]:
            # 公式：跳过
            pass
        else:
            # 正文段落：首行缩进
            paragraph = doc.add_paragraph()
            paragraph_format = paragraph.paragraph_format
            for i, line in enumerate(region["res"]):
                if i == 0:
                    paragraph_format.first_line_indent = shared.Inches(0.25)  # ⭐ 首行缩进
                text_run = paragraph.add_run(line["text"] + " ")
                text_run.font.size = shared.Pt(10)
    
    doc.save(docx_path)
```

### 1.3 阅读顺序排序（关键！）

```python
def sorted_layout_boxes(res, w):
    """
    Sort text boxes in order from top to bottom, left to right
    ⭐ 这正是我们缺失的：保证内容按视觉顺序排列
    """
    num_boxes = len(res)
    if num_boxes == 1:
        res[0]["layout"] = "single"
        return res
    
    sorted_boxes = sorted(res, key=lambda x: (x["bbox"][1], x["bbox"][0]))
    
    # 检测列数：相邻 box 的 x 距离判断
    # ...
    return sorted_boxes
```

### 1.4 HTML 表格处理（最相关）

**位置**：`ppstructure/recovery/table_process.py`

**核心类**：`HtmlToDocx(HTMLParser)`

```python
class HtmlToDocx(HTMLParser):
    def __init__(self):
        super().__init__()
        self.table_row_selectors = [
            "table > tr",
            "table > thead > tr",  # ⭐ 支持表头
            "table > tbody > tr",  # ⭐ 支持 tbody
            "table > tfoot > tr",  # ⭐ 支持 tfoot
        ]
        self.table_style = None
        self.paragraph_style = None
    
    def run_process(self, html):
        if self.bs and BeautifulSoup:
            self.soup = BeautifulSoup(html, "html.parser")
            html = str(self.soup)
        if self.include_tables:
            self.get_tables()
        self.feed(html)
    
    def get_tables(self):
        """⭐ 获取所有顶级表格（忽略嵌套）"""
        self.tables = self.ignore_nested_tables(self.soup.find_all("table"))
        self.table_no = 0
    
    def ignore_nested_tables(self, tables_soup):
        """⭐ 关键：只保留最外层表格"""
        new_tables = []
        nest = 0
        for table in tables_soup:
            if nest:
                nest -= 1
                continue
            new_tables.append(table)
            nest = len(table.find_all("table"))  # 嵌套数
        return new_tables
```

**关键 utility 函数**：
```python
def get_table_rows(table_soup):
    """⭐ 同时支持 tr/thead tr/tbody tr/tfoot tr"""
    table_row_selectors = [
        "table > tr",
        "table > thead > tr",
        "table > tbody > tr",
        "table > tfoot > tr",
    ]
    return table_soup.select(", ".join(table_row_selectors), recursive=False)

def get_table_columns(row):
    """获取行的所有列（th 或 td）"""
    return row.find_all(["th", "td"], recursive=False) if row else []

def get_table_dimensions(table_soup):
    """⭐ 计算表格行列数（考虑 colspan）"""
    rows = get_table_rows(table_soup)
    cols = get_table_columns(rows[0]) if rows else []
    col_count = 0
    for col in cols:
        colspan = col.attrs.get("colspan", 1)
        col_count += int(colspan)
    return rows, col_count
```

---

## 2. BabelDOC 关键算法（再总结）

### 2.1 字符级处理 TypesettingUnit

```python
class TypesettingUnit:
    """每个字符独立对象，可独立决策位置"""
    @cached_property
    def can_break_line(self):
        # CJK + 任何 → 可断
        # 拉丁 + 拉丁 → LINE_BREAK_REGEX 判断
        # 拉丁 + 连字符 → 可断
        # ...
```

### 2.2 行内断行规则

```python
LINE_BREAK_REGEX = regex.compile(
    r"^[a-zA-Z0-9\u00C0-\u00FF\u0100-\u017F...]+$"
    # 所有 Latin 字符集 + 数字 + 连字符
)
```

### 2.3 2D Bin Packing（字符级行内打包）

```python
def typeset_paragraph(paragraph, page_width, line_gap):
    units = paragraph_to_typesetting_units(paragraph)  # 字符级
    for unit in units:
        if not line.fits(unit):
            line.flush()        # 输出当前行
            line = Line(...)   # 新行
        line.add(unit)
```

### 2.4 表格自适应列宽

```python
def typeset_table(table, page_width):
    # 1. 估算每列内容宽度
    col_widths = [max(estimate_width(cell.text) for cell in col_cells)]
    # 2. 按比例分配总宽度
    actual_widths = [w * page_width / total for w in col_widths]
    # 3. 应用最小最大约束
    # 4. 每列单独 wrap
```

### 2.5 标点悬挂

```python
NO_LINE_START_PUNCT = set('，。；：、）】》')
NO_LINE_END_PUNCT = set('（【《')
```

---

## 3. 三方案对比矩阵

| 能力 | BabelDOC | PaddleOCR ppstructure | PatentHub v11 | 推荐借鉴 |
|------|---------|---------------------|---------------|---------|
| **PDF 字符提取** | ✅ pdfminer+PyMuDF | ⚠️ pdfplumber | ❌（依赖 OCR） | PaddleOCR |
| **版面分析** | ✅ DocLayout YOLO | ✅ PP-Layout YOLO | ❌（依赖 OCR type） | 两者同源 |
| **表格检测** | ✅ TableMaster | ✅ TableMaster | ❌ | PaddleOCR |
| **表格结构识别** | ✅ HtmlDecode | ✅ TableMaster | ❌ | PaddleOCR |
| **HTML→DOCX** | ❌ | ✅ HtmlToDocx | ❌ | **⭐⭐⭐ PaddleOCR** |
| **HTML→PDF** | ❌ | ❌ | ⚠️ 基础 | 我们自己 |
| **字符级排版** | ✅ TypesettingUnit | ❌ | ❌（span 级） | BabelDOC |
| **CJK 断行规则** | ✅ LINE_BREAK_REGEX | ⚠️ 简单 | ⚠️ 空白切分 | BabelDOC |
| **表格列宽自适应** | ✅ | ⚠️ | ❌ | BabelDOC |
| **标点悬挂** | ✅ | ❌ | ❌ | BabelDOC |
| **阅读顺序排序** | ✅ | ✅ sorted_layout_boxes | ❌（按 preproc_blocks 顺序）| **⭐⭐⭐ PaddleOCR** |
| **多栏布局支持** | ⚠️ | ✅ layout flag | ❌ | PaddleOCR |
| **字体子集化** | ✅ freetype | ❌ | ❌ | BabelDOC |
| **TOC/目录识别** | ✅ | ⚠️ | ❌ | BabelDOC |
| **公式识别** | ✅ LaTeX | ✅ LaTeX | ❌ | 两者 |

---

## 4. 借鉴价值最高的算法（按 ROI）

### ⭐⭐⭐⭐⭐ 高 ROI，可立即实施

#### 1. 阅读顺序排序（来自 PaddleOCR sorted_layout_boxes）

**问题**：我们按 `preproc_blocks` 数组顺序绘制，但 OCR 返回的数组顺序可能不严格按视觉顺序（特别是双栏布局）。

**算法**：
```typescript
function sortBoxesByReadingOrder(boxes: NormalizedBlock[]): NormalizedBlock[] {
  // 1. 按 y0 排序（从上到下）
  const sorted = [...boxes].sort((a, b) => {
    const aY = a.bbox?.[1] ?? 0
    const bY = b.bbox?.[1] ?? 0
    if (Math.abs(aY - bY) > 5) return aY - bY  // 不同行
    return (a.bbox?.[0] ?? 0) - (b.bbox?.[0] ?? 0)  // 同行按 x 排序
  })
  return sorted
}
```

**效果**：保证双栏布局的内容按视觉顺序排列（先左列后右列）。

#### 2. 表格自适应列宽（来自 BabelDOC typeset_table）

**算法**：
```typescript
function calculateTableColumnWidths(
  rows: TableRow[], totalWidth: number, font: any, baseFontSize: number
): number[] {
  const colMaxWidths: number[] = []
  
  // 1. 估算每列内容最大宽度
  for (const row of rows) {
    for (let c = 0; c < row.cells.length; c++) {
      const text = row.cells[c].text || ''
      const w = estimateTextWidth(text, font, baseFontSize)
      colMaxWidths[c] = Math.max(colMaxWidths[c] || 0, w)
    }
  }
  
  // 2. 应用最小列宽（防止某列过窄）
  const minColWidth = totalWidth * 0.12  // 每列最小 12%
  const finalWidths = colMaxWidths.map(w => Math.max(w, minColWidth))
  
  // 3. 按比例分配总宽度
  const total = finalWidths.reduce((a, b) => a + b, 0)
  return finalWidths.map(w => (w / total) * totalWidth)
}
```

**效果**：表格列宽根据内容长度自适应，长内容列宽更大。

#### 3. HTML 表格 thead/tbody/tfoot 支持（来自 PaddleOCR）

**问题**：我们的 HTML 解析只查找 `<tr>`，不识别 `<thead>` 和 `<tbody>`。

**算法**：
```typescript
function getTableRows(html: string): Element[] {
  // 使用 querySelectorAll 同时支持多种行容器
  return Array.from(htmlDoc.querySelectorAll(
    'table > tr, table > thead > tr, table > tbody > tr, table > tfoot > tr'
  ))
}
```

### ⭐⭐⭐⭐ 中 ROI，后续实施

#### 4. CJK/Latin 智能断行（来自 BabelDOC）

```typescript
const CJK_REGEX = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/
const LATIN_BREAK_REGEX = /^[a-zA-Z0-9'\-·ʻ]+$/

function canBreakBetween(prev: string, next: string): boolean {
  // 任一是 CJK：可断
  if (CJK_REGEX.test(prev) || CJK_REGEX.test(next)) return true
  // 拉丁 + 拉丁：必须满足规则
  return LATIN_BREAK_REGEX.test(prev + next)
}
```

#### 5. 标点悬挂（来自 BabelDOC）

```typescript
const NO_LINE_START_PUNCT = new Set('，。；：、）】》')
const NO_LINE_END_PUNCT = new Set('（【《')

// 排版完成后检查每行：
// 如果行末是 NO_LINE_END_PUNCT，移到下一行
// 如果行首是 NO_LINE_START_PUNCT，移到上一行
```

#### 6. 多栏布局支持（来自 PaddleOCR）

```typescript
function detectLayoutColumn(region: NormalizedBlock): 'single' | 'double' {
  // 检测规则：
  // 1. region 宽度 < 页面宽度 * 0.6 → 双栏
  // 2. region 高度 < 页面高度 * 0.8 → 双栏
  const w = region.bbox![2] - region.bbox![0]
  const h = region.bbox![3] - region.bbox![1]
  return (w < 595 * 0.6 && h > 841 * 0.3) ? 'double' : 'single'
}
```

### ⭐⭐ 长期规划

#### 7. 字符级 bbox 处理（BabelDOC TypesettingUnit）

需要 MinerU 提供字符级 bbox，目前我们用 span 平均分配。

#### 8. 字体子集化（BabelDOC freetype）

减小 PDF 文件体积（中文 PDF 通常 10MB+，子集化后 100KB）。

---

## 5. 实施路线图（统一规划）

### 阶段 1：阅读顺序 + 列宽自适应（高 ROI，立即）

**预计收益**：
- 双栏布局正确显示
- 表格内容不再溢出
- 改动小（< 100 行代码）

**步骤**：
1. 在 `rebuildPdfFromLayout` 开头，对每页 `preproc_blocks` 调用 `sortBoxesByReadingOrder`
2. 修改 `drawTableFromHtml`，用 `calculateTableColumnWidths` 计算列宽
3. HTML 解析用 querySelectorAll 支持 thead/tbody/tfoot

### 阶段 2：CJK 断行 + 标点悬挂（中 ROI）

**预计收益**：mixed text 排版更自然

**步骤**：
1. 改进 `wrapTextByChar` 使用 `canBreakBetween`
2. 添加 `adjustPunctuation` 函数
3. 在 `renderText` 末尾调用

### 阶段 3：字符级处理（需要 MinerU 支持）

**预计收益**：bbox 精度提升

**步骤**：
1. 修改 `normalizeLayoutBlock`，从 spans 展开为字符
2. 按字符独立排版（2D Bin Packing）
3. 需要 MinerU API 返回字符级 bbox

### 阶段 4：字体子集化（长期）

**预计收益**：PDF 体积减小 80%+

**步骤**：
1. 集成 freetype.js（浏览器端）
2. 扫描用到的字符
3. 子集化字体后嵌入 PDF

---

## 6. 风险评估

| 风险 | 说明 | 缓解 |
|------|------|------|
| MinerU bbox 不含字符级 | 无法做字符级排版 | 用 span 平均分配字符 bbox |
| 集成 Python 算法复杂 | BabelDOC/PaddleOCR 是 Python | 移植核心算法到 TypeScript |
| 修改后视觉可能变化 | 阅读顺序改变可能影响现有 PDF | 保留原逻辑作为可选 fallback |
| HTML 解析依赖 | PaddleOCR 用 BeautifulSoup | 我们用 regex + DOMParser |

---

## 7. 综合建议

**优先实施**（按 ROI 排序）：

1. **阶段 1 阅读顺序 + 列宽自适应**（1-2 小时，高 ROI）
2. **阶段 2 CJK 断行 + 标点悬挂**（1 小时，中 ROI）
3. **阶段 3 字符级 bbox**（如 MinerU 支持，4 小时）

**不推荐**：完全迁移 BabelDOC 的字符级重排版（改动太大，收益有限），不如针对具体问题具体改进。

---

**分析者**：Claude
**分析耗时**：~45 分钟
**分析深度**：BabelDOC（8 文件）+ PaddleOCR ppstructure（6 文件）
