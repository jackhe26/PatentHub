# BabelDOC PDF 翻译模块 — Python 环境安装指南

适用版本：babeldoc 0.5.24  
文件位置：`resources/babeldoc/requirements.txt`

---

## 一、系统与 Python 版本要求

| 平台 | 支持情况 | 推荐 Python |
|------|----------|-------------|
| Windows 10/11 x64 | ✅ 完全支持 | 3.11.x |
| macOS Intel | ✅ 完全支持 | 3.11.x |
| macOS Apple Silicon (M1/M2/M3) | ✅ 支持（部分包需特殊处理） | 3.11.x |
| Linux x64 (Ubuntu 20.04+) | ✅ 完全支持 | 3.11.x |

**Python 版本：3.10 ~ 3.12，推荐 3.11**  
- 3.9 及以下：不支持（使用了 `match` 语句等新语法）
- 3.13：部分包尚未适配，不推荐

---

## 二、安装 Python

### Windows
推荐从华为镜像下载（速度快）：
```
https://mirrors.huaweicloud.com/python/3.11.9/python-3.11.9-amd64.exe
```
安装时勾选 **"Add Python to PATH"**。

### macOS
```bash
brew install python@3.11
```
或从官网下载：`https://www.python.org/downloads/`

### Linux
```bash
sudo apt update && sudo apt install python3.11 python3.11-pip python3.11-venv
```

---

## 三、安装依赖包

### 方式一：一键安装（推荐）

使用国内镜像加速，避免卡住：

```bash
# 清华镜像（推荐）
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 阿里镜像（备选）
pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple

# 华为镜像（备选）
pip install -r requirements.txt -i https://mirrors.huaweicloud.com/repository/pypi/simple
```

### 方式二：逐包安装（网络不稳定时）

如果一键安装中途卡住，可以逐个安装：

```bash
pip install openai httpx tenacity -i https://pypi.tuna.tsinghua.edu.cn/simple
pip install PyMuPDF freetype-py bitstring -i https://pypi.tuna.tsinghua.edu.cn/simple
pip install numpy onnx onnxruntime -i https://pypi.tuna.tsinghua.edu.cn/simple
pip install opencv-python-headless -i https://pypi.tuna.tsinghua.edu.cn/simple
pip install peewee tiktoken orjson msgpack xsdata -i https://pypi.tuna.tsinghua.edu.cn/simple
pip install regex chardet rich tqdm configargparse -i https://pypi.tuna.tsinghua.edu.cn/simple
pip install hyperscan -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 方式三：使用虚拟环境（推荐隔离安装）

```bash
python -m venv babeldoc-env
# Windows
babeldoc-env\Scripts\activate
# macOS / Linux
source babeldoc-env/bin/activate

pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

---

## 四、平台特殊处理

### macOS Apple Silicon (M1/M2/M3)

`onnxruntime` 需要使用 Apple Silicon 专用版本：

```bash
pip uninstall onnxruntime
pip install onnxruntime-silicon -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### Windows — hyperscan 安装问题

`hyperscan` 是 Intel Hyperscan 的 Python 绑定，Windows 上可能没有预编译包。

**方案A**：从 GitHub Releases 下载预编译 wheel：
```
https://github.com/darvid/python-hyperscan/releases
```
下载对应 Python 版本的 `.whl` 文件，然后：
```bash
pip install hyperscan-0.x.x-cpXXX-win_amd64.whl
```

**方案B**：如果无法安装 hyperscan，可以临时跳过（术语表功能会降级）：
```bash
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple --ignore-requires-python
# 单独跳过 hyperscan，其余正常安装
```

### NVIDIA GPU 加速（可选）

如果有 NVIDIA GPU，可以用 GPU 版 onnxruntime 加速文档布局分析：

```bash
pip uninstall onnxruntime
pip install onnxruntime-gpu -i https://pypi.tuna.tsinghua.edu.cn/simple
```
需要 CUDA 11.8 或 12.x。

---

## 五、验证安装

```bash
python -c "
import openai, httpx, tenacity
import pymupdf, numpy, cv2
import onnx, onnxruntime
import peewee, tiktoken, orjson
import rich, tqdm, configargparse
import regex, chardet
print('✅ 所有核心依赖安装成功')
print(f'  onnxruntime: {onnxruntime.__version__}')
print(f'  PyMuPDF: {pymupdf.__version__}')
print(f'  openai: {openai.__version__}')
"
```

---

## 六、运行测试

```bash
# 设置 PYTHONPATH 指向 resources 目录
# Windows
set PYTHONPATH=resources
python -m babeldoc.main --version

# macOS / Linux
PYTHONPATH=resources python -m babeldoc.main --version
```

输出 `babeldoc 0.5.24` 即表示安装成功。

---

## 七、常见问题

### Q: pip install 卡在某个包不动了
**A**: 换镜像源，或单独安装该包：
```bash
pip install <卡住的包名> -i https://mirrors.aliyun.com/pypi/simple --timeout 120
```

### Q: `No module named 'cv2'`
**A**: 安装 opencv：
```bash
pip install opencv-python-headless -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### Q: `No module named 'hyperscan'`
**A**: hyperscan 安装失败时，术语表功能会降级但不影响基本翻译。参考上方 Windows 特殊处理章节。

### Q: macOS 上 `onnxruntime` 报错
**A**: 安装 Apple Silicon 专用版：
```bash
pip install onnxruntime-silicon
```

### Q: `ImportError: libGL.so.1` (Linux)
**A**: 安装系统依赖：
```bash
sudo apt install libgl1-mesa-glx libglib2.0-0
```

### Q: tiktoken 下载 cl100k_base 编码文件很慢
**A**: tiktoken 首次运行会下载编码文件（约 1.7MB）。可以设置代理或提前下载放到缓存目录。

---

## 八、依赖包说明

| 包名 | 用途 | 备注 |
|------|------|------|
| `openai` | OpenAI API 调用 | 支持所有兼容 OpenAI 格式的 API |
| `httpx` | HTTP 客户端 | openai 的底层依赖 |
| `tenacity` | 请求重试 | API 限流时自动重试 |
| `PyMuPDF` | PDF 读写 | 核心 PDF 处理库 |
| `freetype-py` | 字体渲染 | 处理 PDF 字体 |
| `bitstring` | 位操作 | PDF 字体子集化 |
| `numpy` | 数值计算 | 图像处理基础 |
| `onnx` + `onnxruntime` | ONNX 模型推理 | 文档布局分析模型 |
| `opencv-python-headless` | 计算机视觉 | 图像预处理 |
| `peewee` | SQLite ORM | 翻译结果缓存 |
| `tiktoken` | Token 计数 | 估算 API 用量 |
| `orjson` | 高性能 JSON | 内部数据序列化 |
| `msgpack` | 消息序列化 | RPC 通信模式 |
| `xsdata` | XML 数据绑定 | 中间表示格式 |
| `regex` | 高级正则 | 文本处理 |
| `chardet` | 编码检测 | 术语表文件读取 |
| `hyperscan` | 高性能正则匹配 | 术语表匹配加速 |
| `rich` | 终端美化 | 进度显示 |
| `tqdm` | 进度条 | 备用进度显示 |
| `configargparse` | 参数解析 | 支持配置文件 |
| `rapidocr_onnxruntime` | 表格 OCR | 可选，`--translate-table-text` 时需要 |
