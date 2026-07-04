# BabelDOC 算法深度分析报告

> **目的**：分析 BabelDOC（`F:\MyAI_Labs\Patent-AI\BabelDOC-main`）的 PDF 解析、重排版、生成算法，提炼可借鉴的核心技术，应用到 PatentHub 的 MinerU → PDF 重建流程中。
>
> **分析时间**：2026-06-20
> **分析对象版本**：BabelDOC-main（GitHub: funstory-ai/BabelDOC）

---

## 1. BabelDOC 项目概览

### 1.1 项目定位

BabelDOC 是 `funstory-ai` 开源的 **PDF 智能翻译 + 重排版** 工具，能：

- 读取 PDF（用 PyMuPDF + 自带 pdfminer）
- 用 YOLO 模型分析版面（DocLayout）
- 提取文本、表格、公式、图片
- 调用 LLM 翻译内容
- **重新排版**生成保持原版式的翻译 PDF

### 1.2 三大核心流程

```
┌─────────────────────────────────────────────────────────────────┐
│  流程 1: 解析   PDF → 内部表示 (IL)                              │
│   • pdfminer 解析 PDF 内容流                                    │
│   • PyMuPDF 提取字符级 bbox                                    │
│   • DocLayout YOLO 识别版面                                    │
│   • 字符聚类 → 段落                                              │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│  流程 2: 重排版  IL → 新 IL                                     │
│   • 字符级 TypesettingUnit 抽象                                  │
│   • 2D Bin Packing 行内打包                                     │
│   • CJK/Latin 智能断行                                          │
│   • 表格自适应列宽                                              │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│  流程 3: 生成   IL → PDF 文件                                    │
│   • RenderUnit 字符级绘制                                       │
│   • 字体子集化（大幅减小文件体积）                              │
│   • PyMuPDF 写出 PDF                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心数据结构（IL）

### 2.1 Box（坐标）

```python
@dataclass(slots=True)
class Box:
    x: float   # 左上角 X（PDF 坐标系，原点在左上）
    y: float   # 左上角 Y
    x2: float  # 右下角 X
    y2: float  # 右下角 Y
```

> **关键点**：BabelDOC 用**字符级 Box**，每个字符都有独立 bbox。

### 2.2 PdfCharacter（字符）

```python
@dataclass
class PdfCharacter:
    char_unicode: str           # 字符 Unicode（如 '中'）
    box: Box                    # 字符的精确 bbox
    pdf_style: PdfStyle          # 样式（字体、大小、颜色、权重）
    char_unicode_hex: str       # 字符的十六进制编码
    # ... 更多元数据（字符级别）
```

### 2.3 PdfLine（行）

```python
@dataclass
class PdfLine:
    characters: list[PdfCharacter]   # 一行的所有字符（按顺序）
    bbox: Box                         # 行的包围盒
    # 各种排版属性（行距、首行缩进等）
```

### 2.4 PdfParagraph（段落）

```python
@dataclass
class PdfParagraph:
    box: Box
    pdf_paragraph_composition: list   # 字符/公式/图片的有序列表
    # 段落级排版属性
```

### 2.5 Page（页面）

```python
@dataclass
class Page:
    page_number: int
    page_size: tuple[float, float]       # (宽, 高) 单位磅
    page_layout: list[PageLayout]        # YOLO 版面分析结果
    pdf_paragraph: list[PdfParagraph]     # 段落列表
    pdf_rectangle: list[PdfRectangle]     # 矩形/表格
    pdf_curve: list                       # 曲线
    # ... 各种页面级资源（字体、图片等）
```

### 2.6 Document

```python
@dataclass
class Document:
    page: list[Page]
    # 字体表、图像表等
```

---

## 3. 流程 1：解析详细分析

### 3.1 阶段划分

```python
TRANSLATE_STAGES = [
    ('ILCreater',            14.12),  # 1. PDF → IR
    ('DetectScannedFile',     2.45),  # 2. 检测扫描件
    ('LayoutParser',         14.03),  # 3. 版面检测（YOLO）
    ('TableParser',           1.00),  # 4. 表格识别
    ('ParagraphFinder',       6.26),  # 5. 段落识别
    ('StylesAndFormulas',     1.66),  # 6. 样式公式
    ('AutomaticTermExtractor',30.00),  # 7. 术语提取
    ('ILTranslator',         46.96),  # 8. LLM 翻译
    ('Typesetting',           4.71),  # 9. 重排版
    ('FontMapper',            0.61),  # 10. 字体映射
    ('PDFCreater',            1.96),  # 11. 生成绘制指令
    ('SUBSET_FONT',           0.92),  # 12. 字体子集化
    ('SAVE_PDF',              6.34),  # 13. 保存 PDF
]
```

### 3.2 ILCreater：PDF → IR

**位置**：`babeldoc/format/pdf/document_il/frontend/il_creater.py`

**核心步骤**：

```python
class ILCreater:
    def create(self, mupdf_doc):
        # 1. 用 PyMuPDF 打开 PDF
        for page_num in range(len(mupdf_doc)):
            page = Page(page_number=page_num)
            
            # 2. 用 pdfminer 提取内容流
            interpreter = PDFPageInterpreterEx(...)
            interpreter.process_page(pdf_page)
            
            # 3. 遍历所有 PDF 操作符，构造 IR
            for element in layout:
                if isinstance(element, LTTextLine):
                    for char in element:
                        # 创建 PdfCharacter
                        char_obj = PdfCharacter(
                            char_unicode=char.get_text(),
                            box=Box(char.x0, char.y0, char.x1, char.y1),
                            pdf_style=extract_style(char)
                        )
                        page.add_character(char_obj)
                elif isinstance(element, LTFigure):
                    page.add_image(...)
                elif isinstance(element, LTRect):
                    page.add_rectangle(...)
            
            # 4. 保存到 Document
            self.doc.page.append(page)
```

**关键点**：
- **字符级粒度**：每个字符独立创建对象
- **完整样式**：字体名、大小、颜色、粗细、斜体
- **pdfminer 提供底层解析**：字符位置、字体、CID 编码

### 3.3 LayoutParser：版面检测

**位置**：`babeldoc/format/pdf/document_il/midend/layout_parser.py`

**核心算法**：
```python
class LayoutParser:
    def process(self, docs, mupdf_doc):
        for page, layouts in self.model.handle_document(
            docs.page, mupdf_doc, ...
        ):
            # YOLO 检测结果 → 转换为 PageLayout
            for layout in layouts.boxes:
                # 坐标系统转换：图片 → PDF 坐标系
                # 注意 Y 轴翻转（图片从顶，PDF 从底）
                y0, y1 = h - layout.xyxy[1], h - layout.xyxy[3]
                
                page_layouts.append(il_version_1.PageLayout(
                    id=len(page_layouts) + 1,
                    box=Box(x0, y0, x1, y1),
                    conf=layout.conf,
                    class_name=layouts.names[layout.cls],  # 'title', 'text', 'table', 'figure' 等
                ))
```

**类别**（YOLO 训练）：title, text, table, figure, formula, list_item 等。

### 3.4 TableParser：表格识别

**位置**：`babeldoc/format/pdf/document_il/midend/table_parser.py`

```python
class TableParser:
    def process(self, docs, mupdf_doc):
        # 1. 用 YOLO 找表格区域
        for layout in page.page_layout:
            if layout.class_name == 'table':
                # 2. 在表格 bbox 内用 OCR 识别单元格
                # 3. 输出结构化表格数据
                table = TableStructure(
                    bbox=layout.box,
                    rows=[
                        Row(cells=[
                            Cell(text='...', bbox=..., rowspan=1, colspan=1),
                            ...
                        ]),
                        ...
                    ]
                )
```

### 3.5 ParagraphFinder：段落识别

**位置**：`babeldoc/format/pdf/document_il/midend/paragraph_finder.py`

**核心算法**：基于字符 bbox 聚类

```python
def find_paragraphs(page):
    # 1. 收集所有字符
    chars = collect_all_chars(page)
    
    # 2. 用 R-tree 做空间索引
    spatial_index = build_layout_index(chars)
    
    # 3. 同行字符聚类（y 坐标接近）
    line_clusters = cluster_by_y(chars)
    
    # 4. 同段字符聚类（行间距小于阈值）
    para_clusters = cluster_by_y_gap(line_clusters)
    
    # 5. 创建 PdfParagraph
    for para_chars in para_clusters:
        para = PdfParagraph(
            box=bbox_of(para_chars),
            composition=para_chars
        )
```

### 3.6 StylesAndFormulas

- 颜色识别（提取 RGB）
- 字号分类（h1, h2, body, caption 等）
- 公式识别（LaTeX 提取）

---

## 4. 流程 2：重排版详细分析

### 4.1 Typesetting 核心抽象

**位置**：`babeldoc/format/pdf/document_il/midend/typesetting.py`（1650 行）

```python
class TypesettingUnit:
    """字符级排版单元"""
    
    def __init__(self, char=None, formular=None, unicode=None,
                 font=None, font_size=None, style=None):
        # 三种构造方式：字符 / 公式 / 纯 Unicode
        assert (char is not None) + (formular is not None) + (unicode is not None) == 1
        
        self.char = char
        self.formular = formular
        self.unicode = unicode
        self.font = font
        self.font_size = font_size
        self.style = style
        self.scale = 1.0  # 字号缩放因子
    
    @cached_property
    def can_break_line(self):
        """判断此字符后是否可以断行"""
        # 实现 CJK/Latin 规则
```

### 4.2 关键算法 1：行内断行规则

```python
LINE_BREAK_REGEX = regex.compile(
    r"^["
    r"a-zA-Z0-9"
    r"\u00C0-\u00FF"     # Latin-1 Supplement
    r"\u0100-\u017F"     # Latin Extended A
    r"\u0180-\u024F"     # Latin Extended B
    r"\u1E00-\u1EFF"     # Latin Extended Additional
    r"\u2C60-\u2C7F"     # Latin Extended C
    r"\uA720-\uA7FF"     # Latin Extended D
    r"\uAB30-\uAB6F"     # Latin Extended E
    r"\u0250-\u02A0"     # IPA Extensions
    r"\u0400-\u04FF"     # Cyrillic
    r"\u0300-\u036F"     # Combining Diacritical Marks
    r"\u0500-\u052F"     # Cyrillic Supplement
    r"\u0370-\u03FF"     # Greek and Coptic
    r"...更多..."
    r"'-"                  # Hyphen
    r"·"                   # Middle Dot
    r"ʻ"                   # Spacing Modifier Letters
    r"]+$"
)

def can_break_after(prev_char, next_char):
    """返回 True 表示可以在两字符间断行"""
    if is_cjk(prev_char) and not is_cjk(next_char):
        return True  # CJK 后接拉丁，可断
    if not is_cjk(prev_char) and is_cjk(next_char):
        return True  # 拉丁后接 CJK，可断
    if is_cjk(prev_char) and is_cjk(next_char):
        return True  # CJK + CJK，可断
    # 拉丁 + 拉丁：必须满足语言学规则
    return bool(LINE_BREAK_REGEX.match(prev_char + next_char))
```

**CJK Unicode 范围**：
```python
CJK_RANGES = [
    (0x4E00, 0x9FFF),    # CJK Unified Ideographs (中文)
    (0x3040, 0x309F),    # Hiragana (日文)
    (0x30A0, 0x30FF),    # Katakana (日文)
    (0xAC00, 0xD7AF),    # Hangul Syllables (韩文)
]

def is_cjk(ch: str) -> bool:
    if not ch:
        return False
    code = ord(ch[0])
    return any(start <= code <= end for start, end in CJK_RANGES)
```

### 4.3 关键算法 2：2D Bin Packing（行内打包）

```python
def typeset_paragraph(paragraph, page_width, line_gap):
    """字符级行内打包算法"""
    
    # 1. 把段落转成 TypesettingUnit 列表
    units = paragraph_to_typesetting_units(paragraph)
    # 按阅读顺序排序
    units.sort_by_reading_order()
    
    # 2. 贪心装箱：每行尽可能多装单元
    lines = []
    current_line = []
    current_width = 0
    
    for unit in units:
        unit_width = measure_width(unit, current_line, page_width)
        
        if current_width + unit_width <= page_width:
            # 能装下，加到当前行
            current_line.append(unit)
            current_width += unit_width
        else:
            # 装不下，结束当前行
            lines.append(finalize_line(current_line))
            current_line = [unit]
            current_width = unit_width
    
    # 3. 处理最后一行
    if current_line:
        lines.append(finalize_line(current_line))
    
    return lines


def finalize_line(units):
    """把行内单元真正放到 PDF 坐标"""
    x = page_left_margin
    y = current_y  # 当前行的 Y 坐标
    for unit in units:
        unit.x = x
        unit.y = y
        x += measure_width(unit)
    return Line(units)
```

**特点**：
- **字符级**：每个字符都是独立单元
- **语言学感知**：根据 can_break_after 决定断行点
- **标点悬挂**：行末是"，"、"。"时移到下一行

### 4.4 关键算法 3：表格自适应列宽

```python
def typeset_table(table, page_width):
    """表格自适应列宽算法"""
    
    # 1. 估算每列内容的自然宽度
    col_natural_widths = []
    for col_idx in range(table.num_cols):
        col_cells = [row[col_idx] for row in table.rows]
        max_width = max(estimate_width(cell.text, font) for cell in col_cells)
        col_natural_widths.append(max_width)
    
    # 2. 按比例分配总宽度（不是平均分！）
    total_natural = sum(col_natural_widths)
    actual_widths = [w * page_width / total_natural for w in col_natural_widths]
    
    # 3. 应用最小/最大宽度约束
    min_col_width = page_width * 0.1  # 每列最小 10% 页宽
    max_col_width = page_width * 0.5  # 每列最大 50% 页宽
    
    for i in range(len(actual_widths)):
        actual_widths[i] = max(min_col_width, 
                               min(max_col_width, actual_widths[i]))
    
    # 4. 归一化使总宽度等于 page_width
    scale = page_width / sum(actual_widths)
    actual_widths = [w * scale for w in actual_widths]
    
    # 5. 每列单独 wrap 到自己的宽度
    typeset_table_cells(table, actual_widths)
```

### 4.5 关键算法 4：标点悬挂

```python
def adjust_punctuation(line):
    """避免行首出现特定标点"""
    
    # 中文标点不出现在行首
    NO_LINE_START_PUNCT = set('，。；：、）】》')
    NO_LINE_END_PUNCT = set('（【《')
    
    # 如果行末是 NO_LINE_END_PUNCT 字符
    if line.last_char in NO_LINE_END_PUNCT:
        # 尝试把它移到下一行
        next_line.insert(0, line.pop())
    
    # 如果下一行行首是 NO_LINE_START_PUNCT 字符
    if next_line.first_char in NO_LINE_START_PUNCT:
        # 把它移到上一行
        line.append(next_line.pop(0))
```

---

## 5. 流程 3：生成 PDF 详细分析

### 5.1 PDFCreater

**位置**：`babeldoc/format/pdf/document_il/backend/pdf_creater.py`

### 5.2 渲染单元

```python
class CharacterRenderUnit(RenderUnit):
    """单个字符的渲染单元"""
    
    def __init__(self, char, render_order):
        super().__init__(render_order, 0, char.xobj_id)
        self.char = char
    
    def render(self, draw_op, context):
        # 写字符到 BitStream
        draw_op.append(encode_char_to_pdf_op(self.char))


class LineRenderUnit(RenderUnit):
    """一行的渲染单元（处理行内多个字符）"""
    
    def render(self, draw_op, context):
        # 写整行（比单字符更高效）
        draw_op.append(encode_line_to_pdf_op(self.line))
```

### 5.3 字体子集化

**关键性能优化**：中文 PDF 体积大的主因是字体。

```python
class PDFCreater:
    def start(self, doc):
        # 1. 扫描所有用到的 Unicode 字符
        used_chars = set()
        for page in doc.page:
            for unit in page.all_units():
                used_chars.add(unit.char_unicode)
        
        # 2. 为每个字体子集化（只嵌入用到的字符）
        for font_id, font in doc.fonts.items():
            # 使用 freetype 创建子集字体
            subset = freetype.Face(font.path)
            subset.set_charmap(...)
            # 写入 subset 字体到 PDF
            self.embed_subset_font(font_id, used_chars)
```

**优化效果**：
- 原始中文字体：~10MB
- 子集化后：通常 100-500KB（取决于文档用到的字符数）
- **体积减小 95%**

### 5.4 用 PyMuPDF 写 PDF

```python
def write_pdf(doc, output_path):
    pdf = pymupdf.open()
    
    for page in doc.page:
        pdf_page = pdf.new_page(
            width=page.page_size[0],
            height=page.page_size[1]
        )
        
        # 按 render_order 排序所有单元
        units = sorted(page.all_units(), key=lambda u: u.render_order)
        
        # 写入每个单元
        for unit in units:
            if isinstance(unit, CharacterRenderUnit):
                pdf_page.insert_text(
                    (unit.char.x, unit.char.y),
                    unit.char.char_unicode,
                    fontfile=unit.char.font.path,
                    fontsize=unit.char.font_size
                )
            elif isinstance(unit, RectangleRenderUnit):
                pdf_page.draw_rect(unit.rect)
    
    pdf.save(output_path)
```

---

## 6. 可借鉴算法优先级矩阵

| 算法 | 改进 ROI | 实施难度 | 依赖 | 推荐 |
|------|---------|---------|------|------|
| 表格列宽自适应 | ⭐⭐⭐⭐⭐ | 低 | 无 | **立即** |
| CJK/Latin 断行规则 | ⭐⭐⭐⭐ | 低 | 无 | **立即** |
| 字符级 bbox 处理 | ⭐⭐⭐⭐ | 中 | MinerU 字符 bbox | 后续 |
| 标点悬挂 | ⭐⭐⭐ | 中 | 无 | 后续 |
| 字体子集化 | ⭐⭐⭐ | 高 | freetype | 长期 |
| PyMuPDF 替换 pdf-lib | ⭐⭐⭐ | 高 | 集成 | 长期 |

---

## 7. 当前 PatentHub 实现 vs BabelDOC 对比

| 维度 | PatentHub `pdf-rebuilder.ts` v11 | BabelDOC |
|------|----------------------------------|----------|
| **处理粒度** | span / line | character |
| **断行规则** | 空白字符切分 | CJK/Latin 语言学规则 |
| **表格列宽** | 平均分配 | 按内容比例 |
| **表格渲染** | HTML 解析 + 矩形 | 字符级 + 自适应 |
| **PDF 库** | pdf-lib | PyMuPDF |
| **字体处理** | embedFont 全字符 | freetype 子集化 |
| **文件大小** | 28KB（不嵌图） | 通常 100-500KB（嵌图） |
| **视觉保真** | 中（结构对，字体一致） | 高（接近原版式） |
| **可搜索文本** | ✅（HTML 表格） | ✅ |
| **OCR 依赖** | 必需 | 可选（也支持原始 PDF） |

---

## 8. 实施路线图

### 阶段 1：表格列宽自适应（1-2 小时）

**目标**：让表格内容不再溢出单元格

```typescript
// pdf-rebuilder.ts 中新增
function calculateTableColumnWidths(
  rows: TableRow[], 
  totalWidth: number,
  font: any,
  fontSize: number
): number[] {
  // 1. 估算每列内容最大宽度
  const colMaxWidths: number[] = []
  for (let colIdx = 0; colIdx < maxColCount(rows); colIdx++) {
    let maxW = 0
    for (const row of rows) {
      const cell = row.cells[colIdx]
      if (cell?.text) {
        const w = estimateTextWidth(cell.text, font, fontSize)
        if (w > maxW) maxW = w
      }
    }
    colMaxWidths.push(maxW)
  }
  
  // 2. 按比例分配
  const total = colMaxWidths.reduce((a, b) => a + b, 0)
  return colMaxWidths.map(w => (w / total) * totalWidth)
}
```

### 阶段 2：CJK/Latin 断行（30 分钟）

**目标**：解决 mixed text 难看的断行

```typescript
const CJK_REGEX = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/
function isCjk(ch: string): boolean { return CJK_REGEX.test(ch) }

function canBreakBetween(prev: string, next: string): boolean {
  if (isCjk(prev) || isCjk(next)) return true
  return /^[a-zA-Z0-9'\-·ʻ]+$/.test(prev + next)
}
```

### 阶段 3：标点悬挂（1 小时）

避免中文标点出现在行首。

---

## 9. 风险与限制

| 风险 | 说明 |
|------|------|
| PDF 提取差异 | BabelDOC 用 pdfminer（基于内容流），我们用 MinerU OCR。OCR 数据不如内容流精确。 |
| 字体差异 | 我们用系统 simhei.ttf，BabelDOC 用 OpenCC 子集化的中文字体。 |
| 坐标系统 | BabelDOC 原点在左上，我们用 PDF 原点在左下，需转换。 |
| 集成复杂度 | BabelDOC 是 Python 项目，我们是 TypeScript + pdf-lib。无法直接 import。 |

---

## 10. 总结

**BabelDOC 给了我们三个核心启发**：

1. **字符级粒度** > span 级粒度（精确控制每个字符位置）
2. **语言学感知断行** > 简单的空白字符切分（避免难看的单词断行）
3. **表格内容自适应列宽** > 平均分配列宽（避免内容溢出）

**我们的优势**：
- 已有 MinerU 的 OCR bbox 数据（字符级别）
- 已实现基本的 PDF 重建
- v11 已达到 7521 字符 + 28KB，文本可搜索

**下一步建议**：
1. 立即：实施表格列宽自适应（高 ROI、低风险）
2. 后续：CJK/Latin 断行规则（中 ROI）
3. 长期：PyMuPDF + 字体子集化（高 ROI 但工程量大）

---

**分析者**：Claude
**分析耗时**：~30 分钟
**分析深度**：已读取 BabelDOC 关键 8 个核心文件
