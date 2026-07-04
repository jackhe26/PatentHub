# myOCR 本地 OCR 环境

本目录用于存放 OCRmyPDF 本地 OCR 引擎所需的环境依赖。

## 目录结构

```
myocr/
├── .venv/                  ← OCRmyPDF Python 虚拟环境（可选）
│   ├── Scripts/
│   │   └── python.exe      ← Python 解释器（OCRmyPDF 已内置）
│   └── ...
├── README.md               ← 本文件
```

## 安装步骤（换电脑时执行）

### 方式一：从 pip 安装（推荐，需要网络）

在命令行中运行：

```bash
# 安装 Python 3.11+
# Windows: https://mirrors.huaweicloud.com/python/3.11.9/python-3.11.9-amd64.exe
# 安装时勾选 "Add Python to PATH"

# 安装 OCRmyPDF
pip install ocrmypdf -i https://pypi.tuna.tsinghua.edu.cn/simple

# 安装 Tesseract OCR
# Windows: https://github.com/UB-Mannheim/tesseract/releases
# 安装时选择语言包：简体中文(chi_sim)、英语(eng)

# 安装 Ghostscript
# Windows: https://ghostscript.com/download/gsdn.html
```

### 方式二：复制虚拟环境（无需网络，适合离线部署）

从原电脑复制完整的 `.venv` 文件夹到本目录：

```bash
# 原电脑（Windows PowerShell）
Copy-Item -Recurse "F:\MyAI_Labs\OCRmyPDF-main\.venv" "F:\MyAI_Labs\Patent-AI\PatentHub-main\resources\myocr\.venv"
```

## 环境检测

PatentHub 启动时会自动检测以下依赖：

| 依赖项 | 说明 | Windows 路径 |
|--------|------|--------------|
| Python + ocrmypdf | OCR 引擎 | `.venv\Scripts\python.exe -m ocrmypdf` 或 `python -m ocrmypdf` |
| tesseract | 文字识别 | `C:\Program Files\Tesseract-OCR\tesseract.exe` |
| ghostscript | PDF 处理 | `D:\Program Files\GPLGhostscript\...\bin\gswin64c.exe` |

## 常见问题

### Q: 提示 "No module named ocrmypdf"
A: 运行 `pip install ocrmypdf`，或确认 `.venv\Scripts\python.exe` 可用

### Q: 提示 "tesseract not found"
A: 安装 Tesseract 并确保 `tesseract.exe` 在 PATH 中，或在 UI 中点击"检测环境"查看详细路径

### Q: 多语言支持
A: Tesseract 安装时选择所需语言包。OCRmyPDF 语言格式：`eng+chi_sim`（英语+简体中文）

## 版本要求

- Python: 3.10 ~ 3.12（推荐 3.11）
- OCRmyPDF: >= 17.0
- Tesseract: >= 5.0
- Ghostscript: >= 9.0
