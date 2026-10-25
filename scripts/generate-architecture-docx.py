# -*- coding: utf-8 -*-
"""
生成《PatentHub 开发架构简介》Word 文档（3 页精简版）。

输入：
  docs/statics/architecture-overview.png
  docs/statics/key-flows.png
输出：
  docs/PatentHub-开发架构简介.docx

特点：
  - 只保留 2 张核心图，删除全部表格；
  - 正文压缩到 3 页，重点突出 10 个审查搭档、知识库、WPS 与 Agent；
  - 图 1 / 图 2 均按 16 cm 版心宽度插入，字号已放大。

依赖：python-docx。
"""

import re
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
STATICS = DOCS / "statics"
OUT = DOCS / "PatentHub-开发架构简介.docx"

BODY_FONT = "宋体"
HEAD_FONT = "微软雅黑"
MONO_FONT = "Consolas"
BODY_SIZE = 10.5

ACCENT = RGBColor(0x1F, 0x4E, 0x79)
ACCENT2 = RGBColor(0x2E, 0x75, 0xB6)
GRAY = RGBColor(0x59, 0x59, 0x59)
CODE_COLOR = RGBColor(0xC7, 0x25, 0x4E)

TOKEN_RE = re.compile(r"(\*\*.+?\*\*|`[^`]+`)")
doc = Document()


def set_run_font(run, name=BODY_FONT, size=BODY_SIZE, bold=None, color=None, italic=None):
    """同时设置西文与东亚字体，避免中文回退到默认字体。"""
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), name)
    run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic
    if color is not None:
        run.font.color.rgb = color


def add_runs(paragraph, text, size=BODY_SIZE, color=None):
    """解析 **加粗** 与 `行内代码` 两种轻量标记。"""
    for part in TOKEN_RE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            run = paragraph.add_run(part[2:-2])
            set_run_font(run, BODY_FONT, size, bold=True, color=color)
        elif part.startswith("`") and part.endswith("`"):
            run = paragraph.add_run(part[1:-1])
            set_run_font(run, MONO_FONT, max(size - 0.8, 8.0), color=CODE_COLOR)
        else:
            run = paragraph.add_run(part)
            set_run_font(run, BODY_FONT, size, color=color)


def para(
    text="",
    indent=True,
    align=WD_ALIGN_PARAGRAPH.JUSTIFY,
    space_after=3.0,
    line=1.26,
    size=BODY_SIZE,
    color=None,
    keep_next=False,
):
    paragraph = doc.add_paragraph()
    pf = paragraph.paragraph_format
    pf.alignment = align
    pf.line_spacing = line
    pf.space_before = Pt(0)
    pf.space_after = Pt(space_after)
    pf.first_line_indent = Pt(size * 2) if indent else Pt(0)
    pf.keep_with_next = keep_next
    add_runs(paragraph, text, size=size, color=color)
    return paragraph


def bullet(text, space_after=2.0, size=BODY_SIZE):
    paragraph = doc.add_paragraph()
    pf = paragraph.paragraph_format
    pf.left_indent = Cm(0.55)
    pf.first_line_indent = Cm(-0.55)
    pf.line_spacing = 1.25
    pf.space_before = Pt(0)
    pf.space_after = Pt(space_after)
    pf.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    pf.tab_stops.add_tab_stop(Cm(0.55))
    run = paragraph.add_run("•\t")
    set_run_font(run, BODY_FONT, size, bold=True, color=ACCENT2)
    add_runs(paragraph, text, size=size)
    return paragraph


def lead(title, text, space_after=3.0):
    """带强调前缀的说明段，用于知识库 / WPS / Agent 等特色能力。"""
    paragraph = doc.add_paragraph()
    pf = paragraph.paragraph_format
    pf.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    pf.line_spacing = 1.24
    pf.space_before = Pt(0)
    pf.space_after = Pt(space_after)
    pf.first_line_indent = Pt(0)
    run = paragraph.add_run(title)
    set_run_font(run, HEAD_FONT, BODY_SIZE, bold=True, color=ACCENT)
    run = paragraph.add_run("｜")
    set_run_font(run, BODY_FONT, BODY_SIZE, color=GRAY)
    add_runs(paragraph, text, size=BODY_SIZE)
    return paragraph


def partner_item(num, name, desc):
    """10 个审查搭档的紧凑条目。"""
    paragraph = doc.add_paragraph()
    pf = paragraph.paragraph_format
    pf.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    pf.line_spacing = 1.14
    pf.space_before = Pt(0)
    pf.space_after = Pt(1.2)
    pf.left_indent = Cm(0.25)
    pf.first_line_indent = Cm(0)
    run = paragraph.add_run(f"{num}  {name}")
    set_run_font(run, HEAD_FONT, 10.2, bold=True, color=ACCENT)
    run = paragraph.add_run("｜")
    set_run_font(run, BODY_FONT, 10.2, color=GRAY)
    add_runs(paragraph, desc, size=10.2)
    return paragraph


def heading1(text):
    paragraph = doc.add_paragraph()
    pf = paragraph.paragraph_format
    pf.space_before = Pt(8)
    pf.space_after = Pt(4)
    pf.line_spacing = 1.0
    pf.keep_with_next = True
    run = paragraph.add_run(text)
    set_run_font(run, HEAD_FONT, 14.0, bold=True, color=ACCENT)

    p_pr = paragraph._p.get_or_add_pPr()
    p_bdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "8")
    bottom.set(qn("w:space"), "2")
    bottom.set(qn("w:color"), "1F4E79")
    p_bdr.append(bottom)
    p_pr.append(p_bdr)
    return paragraph


def heading2(text):
    paragraph = doc.add_paragraph()
    pf = paragraph.paragraph_format
    pf.space_before = Pt(6)
    pf.space_after = Pt(2)
    pf.line_spacing = 1.0
    pf.keep_with_next = True
    run = paragraph.add_run(text)
    set_run_font(run, HEAD_FONT, 11.5, bold=True, color=ACCENT2)
    return paragraph


def caption(text):
    paragraph = doc.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.space_before = Pt(2)
    paragraph.paragraph_format.space_after = Pt(4)
    paragraph.paragraph_format.line_spacing = 1.0
    run = paragraph.add_run(text)
    set_run_font(run, BODY_FONT, 8.8, color=GRAY)
    return paragraph


def add_image(path, width_cm, cap):
    paragraph = doc.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.space_before = Pt(3)
    paragraph.paragraph_format.space_after = Pt(0)
    paragraph.paragraph_format.line_spacing = 1.0
    paragraph.paragraph_format.keep_with_next = True
    paragraph.add_run().add_picture(str(path), width=Cm(width_cm))
    caption(cap)


def page_break():
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(0)
    paragraph.paragraph_format.line_spacing = 1.0
    paragraph.add_run().add_break(WD_BREAK.PAGE)


def rule():
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(7)
    paragraph.paragraph_format.line_spacing = 1.0
    p_pr = paragraph._p.get_or_add_pPr()
    p_bdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "12")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), "1F4E79")
    p_bdr.append(bottom)
    p_pr.append(p_bdr)



def _add_field(paragraph, instruction):
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), instruction)
    run = OxmlElement("w:r")
    r_pr = OxmlElement("w:rPr")
    r_fonts = OxmlElement("w:rFonts")
    r_fonts.set(qn("w:ascii"), BODY_FONT)
    r_fonts.set(qn("w:hAnsi"), BODY_FONT)
    r_fonts.set(qn("w:eastAsia"), BODY_FONT)
    r_pr.append(r_fonts)
    size = OxmlElement("w:sz")
    size.set(qn("w:val"), "16")
    r_pr.append(size)
    color = OxmlElement("w:color")
    color.set(qn("w:val"), "595959")
    r_pr.append(color)
    run.append(r_pr)
    text = OxmlElement("w:t")
    text.text = "1"
    run.append(text)
    fld.append(run)
    paragraph._p.append(fld)


def setup_document():
    section = doc.sections[0]
    section.page_width = Cm(21.0)
    section.page_height = Cm(29.7)
    section.left_margin = Cm(2.2)
    section.right_margin = Cm(2.2)
    section.top_margin = Cm(1.8)
    section.bottom_margin = Cm(1.7)
    section.header_distance = Cm(0.9)
    section.footer_distance = Cm(0.8)

    normal = doc.styles["Normal"]
    normal.font.name = BODY_FONT
    normal.font.size = Pt(BODY_SIZE)
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), BODY_FONT)
    normal.paragraph_format.line_spacing = 1.3
    normal.paragraph_format.space_after = Pt(3)

    settings = doc.settings.element
    update = OxmlElement("w:updateFields")
    update.set(qn("w:val"), "true")
    settings.append(update)

    # 页眉：左侧文档名，右侧单位名，使用右对齐制表位
    header_p = section.header.paragraphs[0]
    header_p.text = ""
    pf = header_p.paragraph_format
    pf.tab_stops.clear_all()
    pf.tab_stops.add_tab_stop(Cm(16.6), WD_TAB_ALIGNMENT.RIGHT)
    pf.left_indent = Cm(0)
    pf.right_indent = Cm(0)
    pf.space_after = Pt(0)
    pf.line_spacing = 1.0
    run = header_p.add_run("PatentHub 开发架构简介")
    set_run_font(run, HEAD_FONT, 8.2, color=GRAY)
    run = header_p.add_run("\t\t")
    set_run_font(run, HEAD_FONT, 8.2, color=GRAY)
    run = header_p.add_run("专利审查四川中心")
    set_run_font(run, HEAD_FONT, 8.2, color=GRAY)
    p_pr = header_p._p.get_or_add_pPr()
    p_bdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "4")
    bottom.set(qn("w:space"), "2")
    bottom.set(qn("w:color"), "BFC9D4")
    p_bdr.append(bottom)
    p_pr.append(p_bdr)

    # 页脚：第 X 页 / 共 Y 页
    footer_p = section.footer.paragraphs[0]
    footer_p.text = ""
    footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = footer_p.add_run("第 ")
    set_run_font(run, BODY_FONT, 8.2, color=GRAY)
    _add_field(footer_p, "PAGE")
    run = footer_p.add_run(" 页 / 共 ")
    set_run_font(run, BODY_FONT, 8.2, color=GRAY)
    _add_field(footer_p, "NUMPAGES")
    run = footer_p.add_run(" 页")
    set_run_font(run, BODY_FONT, 8.2, color=GRAY)



def build_content():
    # ---------------- 标题区 ----------------
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.0
    run = p.add_run("专利审查四川中心 · 技术文档")
    set_run_font(run, HEAD_FONT, 9.5, bold=True, color=ACCENT2)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.0
    run = p.add_run("PatentHub 开发架构简介")
    set_run_font(run, HEAD_FONT, 24.0, bold=True, color=ACCENT)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.0
    run = p.add_run("AI 专利审查助手 · 核心能力、总体架构与关键链路")
    set_run_font(run, HEAD_FONT, 12.0, color=GRAY)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.0
    run = p.add_run("10 个审查搭档 · 21+ 模型 Provider · 15 个 Agent 工具 · 4 种权限模式")
    set_run_font(run, HEAD_FONT, 10.0, bold=True, color=ACCENT2)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.0
    run = p.add_run("v1.4.0　|　2026-10-24　|　内部资料")
    set_run_font(run, BODY_FONT, 9.0, color=GRAY)
    rule()

    # ---------------- 1 项目定位 ----------------
    heading1("1  项目定位")
    para(
        "PatentHub 是面向专利审查员与代理人的 AI 审查助手，基于 Chatbox（GPLv3）演进，"
        "以 Electron + React 交付 Windows / macOS / Linux / Android 四端；把"
        "“审查搭档 + 专利文档理解 + 知识库检索 + Agent 工具执行”组织为一个可本地部署的审查工作台："
        "模型可接 21+ 家 Provider，文档与密钥默认留在本机，审查过程可追踪、可复核。"
    )

    # ---------------- 2 核心能力 ----------------
    heading1("2  核心能力：10 个审查搭档")
    para(
        "审查搭档是产品的主入口。每个搭档由独立提示词与审查规则驱动，可在会话中挂载知识库，覆盖"
        "“理解申请—检索—审查—答复”的完整业务链，可在会话顶部一键切换。",
        indent=False,
        space_after=4,
    )

    partners = [
        ("01", "发明构思总结", "提炼发明构思、要解决的技术问题、创新点与技术效果。"),
        ("02", "科普大白", "把权利要求逐条改写成大白话表格，并自检可读性与忠实性。"),
        ("03", "提炼检索要素", "输出关键词、IPC 分类与可直接执行的检索式。"),
        ("04", "文献检索", "专利与非专利文献统一检索，输出检索策略、对比文件与待核实线索。"),
        ("05", "通知书撰写辅助", "基于对比文件与“三步法”撰写审查意见通知书。"),
        ("06", "公开不充分判断", "按说明书充分公开要求逐项诊断并给出审查意见。"),
        ("07", "形式缺陷审查", "检查权利要求书与说明书的形式、引用和撰写缺陷。"),
        ("08", "审查意见答复", "针对申请人的意见陈述撰写逻辑严密的答复。"),
        ("09", "权利要求常规判断", "逐项判断公知常识与常规技术手段。"),
        ("10", "文献翻译（双向）", "中英专利与技术文献互译，术语识别与校准。"),
    ]
    for num, name, desc in partners:
        partner_item(num, name, desc)

    para(
        "第 11 个搭档可按同一模板扩展：在 `patent-copilots.ts` 追加 id、name、prompt 即可，UI 自动编号。",
        indent=False,
        size=9.2,
        color=GRAY,
        space_after=5,
    )

    heading2("2.1  知识库、WPS 与 Agent（独立模块）")
    lead(
        "知识库（RAG）",
        "支持多库；文件经“解析 → 512/50 分块 → Embedding → LibSQLVector 检索 → Rerank”入库与召回，"
        "向量存于 `chatbox_kb.db`；可选本地 / MinerU / 远端解析器，文档不出机也可用。",
    )
    lead(
        "WPS 与 Office 全格式",
        "除 PDF / DOCX / XLSX / PPTX 外，原生支持 `.wps`、`.et`、`.dps`：OLE2 专用解析，"
        "OOXML 走 officeparser / jszip；上传、拖拽、预览、入库共用同一链路，适配国产办公环境。",
    )
    lead(
        "Agent 与 Skills",
        "AgentExecutor 最多 30 轮工具循环，内置 15 个工具（文件、Shell、任务、Skill、知识库、联网、图片），"
        "提供普通 / 自动编辑 / 全自动 / 计划 4 种权限模式；支持 Skills 挂载与 MCP 外部工具，"
        "关键操作人工确认并留痕。",
        space_after=0,
    )
    page_break()



    # ---------------- 3 总体架构 ----------------
    heading1("3  总体架构")
    para(
        "采用 Electron 经典三层结构，并把跨进程协议收敛到 Shared 层；渲染层只做界面与编排，"
        "文件、数据库、密钥、子进程等敏感能力全部集中在主进程。",
        indent=False,
        space_after=4,
    )
    bullet("**Renderer**：React 18 + TypeScript，承载会话、10 个审查搭档、知识库、Agent / Skills 与 PDF 双栏预览。")
    bullet("**Preload**：contextBridge 暴露受控 IPC 白名单，渲染层不直接接触 Node。")
    bullet("**Main**：Electron 26，统一模型 Provider、文档解析（含 WPS）、RAG、Agent 工具执行与本地存储。")
    bullet("**Shared**：跨进程类型、Provider 注册表与工具协议，保证桌面 / Web / Android 同构。")

    add_image(
        STATICS / "architecture-overview.png",
        16.0,
        "图 1  PatentHub 总体架构（核心能力视角）",
    )
    para(
        "设计取舍：Renderer 不直接访问文件系统与数据库；Preload 只暴露白名单 API；"
        "Main 统一管理密钥、文件、SQLite 与子进程；Shared 保证类型与工具协议一致。",
        indent=False,
        size=10.0,
        space_after=4,
    )
    heading2("3.1  关键设计")
    bullet(
        "**敏感能力集中在 Main**：文件、数据库、密钥、子进程不暴露给 Renderer，"
        "Preload 只放行白名单 IPC。"
    )
    bullet(
        "**Provider 注册表 + AI SDK**：新增模型只增加 definition，会话、Agent 与知识库共用同一套 Provider 配置。"
    )
    bullet(
        "**本地优先**：会话、知识库、Agent 数据分别落在 IndexedDB / `chatbox_kb.db` / `agents_skills.db`，离线可用。"
    )
    para(
        "技术栈：Electron 26 · React 18 · TypeScript · Vercel AI SDK · Mastra RAG · LibSQL · "
        "Mantine / MUI · electron-vite / electron-builder。",
        indent=False,
        size=9.5,
        color=GRAY,
        space_after=0,
    )
    page_break()

    # ---------------- 4 核心业务闭环 ----------------
    heading1("4  核心业务闭环")
    para(
        "9 个搭档共用一条主链路：选择搭档（写入 System Prompt）→ 上传申请文件（PDF / Office / WPS）"
        "→ 解析并准备上下文 → 发送给大模型（Provider API）→ 流式生成审查产出 → 人工复核与归档。"
        "知识库与 WPS 文档作为上下文输入；Agent / Skills 是独立通用模块，不在此主链路中。",
        indent=False,
        space_after=4,
    )
    add_image(
        STATICS / "key-flows.png",
        16.0,
        "图 2  审查搭档业务闭环",
    )
    para(
        "典型场景：先用“发明构思总结 / 提炼检索要素 / 文献检索”完成理解与检索，"
        "再用“通知书撰写辅助 / 公开不充分判断 / 形式缺陷审查 / 权利要求常规判断”形成审查意见，"
        "最后用“审查意见答复 / 文献翻译”完成答复与跨语言阅读。",
        indent=False,
        size=10.0,
        space_after=4,
    )

    # ---------------- 5 工程化与边界 ----------------
    heading1("5  工程化与边界")
    bullet(
        "**多端交付**：electron-vite + electron-builder 产出 Windows / macOS / Linux 安装包；"
        "Capacitor 复用 React 代码交付 Android，Web 构建可局域网访问。"
    )
    bullet(
        "**质量保障**：Biome + ESLint + `tsc --noEmit`；Vitest 覆盖 27 个单测文件与 3 组集成测试；"
        "Sentry 采集主 / 渲染进程异常。"
    )
    bullet(
        "**安全边界**：密钥、文档、向量库默认本地；`webSecurity:false` 与 Main / Renderer 双通道 fetch "
        "是后续加固点。"
    )

    # ---------------- 6 总结 ----------------
    heading1("6  总结")
    para(
        "PatentHub 的差异化不在“通用对话”，而在“10 个审查搭档 + 本地知识库 + WPS 全格式 + 可审计 Agent”"
        "的组合。三层架构保证敏感能力可控，多端复用保证交付效率；下一步重点是安全加固、双通道统一与 E2E 覆盖。"
    )
    # 说明信息已放入文档属性与标题区，正文不再重复，保证第 3 页留白安全。


def save():
    doc.core_properties.title = "PatentHub 开发架构简介"
    doc.core_properties.subject = "AI 专利审查助手核心能力、总体架构与关键链路"
    doc.core_properties.author = "专利审查四川中心"
    doc.core_properties.category = "技术文档"
    doc.core_properties.comments = "基于 PatentHub v1.4.0 源码与构建配置整理（3 页精简版）"
    doc.save(OUT)
    print(f"[OK] {OUT}")


if __name__ == "__main__":
    setup_document()
    build_content()
    save()

