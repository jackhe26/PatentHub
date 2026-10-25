# -*- coding: utf-8 -*-
"""
生成《PatentHub 开发架构简介》所需的两张核心配图（精简版）。

输出：
  docs/statics/architecture-overview.png  总体架构图（核心能力视角）
  docs/statics/key-flows.png              审查搭档业务闭环图

设计原则：
  1. 只保留核心层级与核心能力，减少盒子数量；
  2. 字号明显放大，保证 A4 打印和屏幕阅读都清晰。
  3. 两张图均按 16 cm 版心宽度设计。

依赖：matplotlib，中文字体使用 Windows 自带 SimHei。
"""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "statics"
OUT_DIR.mkdir(parents=True, exist_ok=True)

FONT_PATH = "C:/Windows/Fonts/simhei.ttf"
fm.fontManager.addfont(FONT_PATH)
plt.rcParams["font.family"] = "SimHei"
plt.rcParams["axes.unicode_minus"] = False

C = {
    "renderer_fill": "#F2F7FD",
    "renderer_line": "#9DC3E6",
    "preload_fill": "#FFF8EC",
    "preload_line": "#F4B183",
    "main_fill": "#F1F9F3",
    "main_line": "#A9D08E",
    "external_fill": "#F7F7F7",
    "external_line": "#BFBFBF",
    "blue": "#2F6FBA",
    "orange": "#C55A11",
    "green": "#2E7D4F",
    "purple": "#6B4FA0",
    "text": "#1F2937",
    "muted": "#5B6573",
}


def box(
    ax,
    x,
    y,
    w,
    h,
    title,
    lines=None,
    fc="#FFFFFF",
    ec="#2F6FBA",
    lw=1.4,
    title_size=14.0,
    line_size=11.5,
    title_color=None,
    text_color=None,
    dashed=False,
):
    """绘制圆角信息卡；标题下预留固定间距，避免文字贴边。"""
    patch = FancyBboxPatch(
        (x, y),
        w,
        h,
        boxstyle="round,pad=0.35,rounding_size=1.0",
        facecolor=fc,
        edgecolor=ec,
        linewidth=lw,
        linestyle=(0, (4, 2)) if dashed else "solid",
        zorder=2,
    )
    ax.add_patch(patch)
    cx = x + w / 2
    text_color = text_color or C["text"]

    if lines:
        ax.text(
            cx,
            y + h - 2.0,
            title,
            ha="center",
            va="top",
            fontsize=title_size,
            fontweight="bold",
            color=title_color or text_color,
            zorder=3,
        )
        ax.text(
            cx,
            y + h - 6.3,
            "\n".join(lines),
            ha="center",
            va="top",
            fontsize=line_size,
            color=text_color,
            linespacing=1.45,
            zorder=3,
        )
    else:
        ax.text(
            cx,
            y + h / 2,
            title,
            ha="center",
            va="center",
            fontsize=title_size,
            fontweight="bold",
            color=title_color or text_color,
            zorder=3,
        )


def band(ax, x, y, w, h, title, fc, ec, title_color, subtitle=None):
    """绘制分层泳道。"""
    patch = FancyBboxPatch(
        (x, y),
        w,
        h,
        boxstyle="round,pad=0.4,rounding_size=1.4",
        facecolor=fc,
        edgecolor=ec,
        linewidth=1.5,
        zorder=1,
    )
    ax.add_patch(patch)
    ax.text(
        x + 1.8,
        y + h - 1.1,
        title,
        ha="left",
        va="top",
        fontsize=12.5,
        fontweight="bold",
        color=title_color,
        zorder=3,
    )
    if subtitle:
        ax.text(
            x + w - 1.8,
            y + h - 1.2,
            subtitle,
            ha="right",
            va="top",
            fontsize=11.0,
            color=C["muted"],
            zorder=3,
        )


def arrow(ax, p1, p2, color=None, lw=1.8, style="-|>", dashed=False):
    ax.add_patch(
        FancyArrowPatch(
            p1,
            p2,
            arrowstyle=style,
            mutation_scale=15,
            linewidth=lw,
            color=color or C["muted"],
            linestyle=(0, (4, 2)) if dashed else "solid",
            shrinkA=1,
            shrinkB=1,
            zorder=4,
        )
    )


def label(ax, x, y, text, color=None, size=10.5):
    ax.text(
        x,
        y,
        text,
        ha="center",
        va="center",
        fontsize=size,
        color=color or C["muted"],
        zorder=5,
        bbox=dict(boxstyle="round,pad=0.18", facecolor="white", edgecolor="none", alpha=0.92),
    )


# ============================================================================
# 图 1：总体架构（核心能力视角）
# ============================================================================


def draw_architecture():
    fig = plt.figure(figsize=(16 / 2.54, 11.2 / 2.54), dpi=300)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 70)
    ax.axis("off")

    # ---------------- Renderer ----------------
    band(
        ax, 2, 54, 96, 16,
        "Renderer 渲染进程 · React 18 + TypeScript",
        C["renderer_fill"], C["renderer_line"], C["blue"],
    )
    renderer_boxes = [
        ("审查搭档", ["10 个业务搭档"]),
        ("知识库", ["检索与引用"]),
        ("文档 / PDF", ["双栏预览"]),
        ("Agent", ["Skills · 工具"]),
    ]
    for i, (title, lines) in enumerate(renderer_boxes):
        box(
            ax, 3 + i * 24.0, 55.2, 21.5, 8.5,
            title, lines,
            fc="#FFFFFF", ec=C["renderer_line"], title_size=13.0, line_size=11.0,
        )
    arrow(ax, (50, 54), (50, 51.3), color=C["renderer_line"])

    # ---------------- Preload ----------------
    box(
        ax, 8, 45.8, 84, 5.2,
        "Preload · 受控 IPC 白名单（contextBridge）",
        fc=C["preload_fill"], ec=C["preload_line"], title_size=13.5,
        text_color="#7F3F00",
    )
    arrow(ax, (50, 45.8), (50, 43.2), color=C["preload_line"])

    # ---------------- Main ----------------
    band(
        ax, 2, 16, 96, 27,
        "Main 主进程 · Electron 26",
        C["main_fill"], C["main_line"], C["green"],
        subtitle="敏感能力本地闭环",
    )
    main_boxes = [
        ("模型 Provider", ["21+ 家", "OpenAI 兼容", "流式输出"]),
        ("文档解析", ["PDF · WPS", "OLE2 / OOXML", "多层降级"]),
        ("知识库 RAG", ["分块 · Embedding", "向量 + 重排", "本地化"]),
        ("Agent 工具", ["10 个", "15 工具 · 4 权限", "人工确认"]),
    ]
    for i, (title, lines) in enumerate(main_boxes):
        box(
            ax, 3 + i * 24.0, 18.2, 21.5, 18.0,
            title, lines,
            fc="#FFFFFF", ec=C["main_line"], title_size=13.5, line_size=10.5,
        )
    arrow(ax, (25.5, 16), (25.5, 14.0), color=C["main_line"])
    arrow(ax, (74.5, 16), (74.5, 14.0), color=C["main_line"])

    # ---------------- 外部服务与本地资源 ----------------
    box(
        ax, 3, 5.5, 45, 8.5,
        "外部服务",
        ["模型 API · MinerU / BabelDOC"],
        fc=C["external_fill"], ec=C["external_line"], title_size=13.0, line_size=10.5,
    )
    box(
        ax, 52, 5.5, 45, 8.5,
        "本地资源",
        ["SQLite · 文件 / 密钥"],
        fc="#FFFFFF", ec=C["main_line"], title_size=13.0, line_size=10.5,
    )

    ax.text(
        2,
        1.2,
        "Shared 同构层：跨进程类型 · Provider 注册表 · 工具协议",
        ha="left",
        va="bottom",
        fontsize=11.0,
        color=C["muted"],
    )

    out = OUT_DIR / "architecture-overview.png"
    fig.savefig(out, dpi=300, facecolor="white", bbox_inches="tight", pad_inches=0.06)
    plt.close(fig)
    print(f"[OK] {out}")



# ============================================================================
# 图 2：审查搭档业务闭环
# ============================================================================


def draw_key_flows():
    fig = plt.figure(figsize=(16 / 2.54, 8.4 / 2.54), dpi=300)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 55)
    ax.axis("off")

    steps_top = [
        ("① 选择审查搭档", ["写入 System Prompt", "10 个业务搭档"], C["blue"], "#F2F7FD"),
        ("② 上传申请文件", ["PDF · Office · WPS", ".wps / .et / .dps"], C["orange"], "#FDF3EC"),
        ("③ 解析与准备", ["文档解析 · 附件文本", "知识库可选"], C["green"], "#F1F9F3"),
    ]
    steps_bottom = [
        ("④ 发送给大模型", ["System + 文档", "Provider API · 流式"], C["blue"], "#F2F7FD"),
        ("⑤ 生成审查产出", ["知识库按需 · 流式", "审查意见 · 通知书"], C["purple"], "#F7F3FB"),
        ("⑥ 人工复核与归档", ["回写会话 · 本地落盘", "人工复核 · 可追溯"], C["green"], "#F1F9F3"),
    ]

    # 顶部贯穿能力
    ax.text(
        50,
        52.2,
        "知识库 RAG · WPS 全格式 · 21+ Provider · 文档不出域",
        ha="center",
        va="center",
        fontsize=10.8,
        color=C["muted"],
    )

    # 上排：输入与上下文准备（从左到右）
    for i, (title, lines, color, fill) in enumerate(steps_top):
        box(
            ax, 3 + i * 33, 33.5, 28, 15.5,
            title, lines,
            fc=fill, ec=color, title_size=14.0, line_size=11.8,
        )
    for x in (31, 64):
        arrow(ax, (x, 41.25), (x + 5, 41.25), color=C["muted"])

    # 下排：发送、生成与复核（右 → 左，形成回环）
    for i, (title, lines, color, fill) in enumerate(steps_bottom):
        box(
            ax, 69 - i * 33, 12.5, 28, 15.5,
            title, lines,
            fc=fill, ec=color, title_size=14.0, line_size=11.8,
        )
    arrow(ax, (83, 33.5), (83, 28.0), color=C["muted"])
    arrow(ax, (69, 20.25), (64, 20.25), color=C["muted"])
    arrow(ax, (36, 20.25), (31, 20.25), color=C["muted"])

    # 产出落到统一出口
    box(
        ax, 3, 0.6, 94, 9.8,
        "输出：审查意见 / 通知书 / 答复",
        ["结果回写会话 · 本地落盘 · 全过程可追溯"],
        fc="#FFFFFF", ec=C["muted"], title_size=12.5, line_size=10.5,
        text_color=C["text"],
    )
    arrow(ax, (17, 12.5), (17, 10.4), color=C["muted"])

    out = OUT_DIR / "key-flows.png"
    fig.savefig(out, dpi=300, facecolor="white", bbox_inches="tight", pad_inches=0.06)
    plt.close(fig)
    print(f"[OK] {out}")


if __name__ == "__main__":
    draw_architecture()
    draw_key_flows()

