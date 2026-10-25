# PatentHub

<p align="center">
  <img src="./assets/icon.png" width="128" />
</p>

<p align="center">
  <strong>基于AI的专利审查助手</strong><br>
  AI-Powered Patent Examination Assistant
</p>

<p align="center">
  <strong>专利审查四川中心</strong>
</p>

<p align="center">
  <!-- Platform Badges -->
  <a href="#"><img alt="Windows" src="https://img.shields.io/badge/Windows-0078D6?style=flat-square&logo=windows&logoColor=white" /></a>
  <a href="#"><img alt="macOS" src="https://img.shields.io/badge/macOS-000000?style=flat-square&logo=apple&logoColor=white" /></a>
  <a href="#"><img alt="Linux" src="https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black" /></a>
  <a href="#"><img alt="Android" src="https://img.shields.io/badge/Android-3DDC84?style=flat-square&logo=android&logoColor=white" /></a>
  <a href="#"><img alt="License" src="https://img.shields.io/badge/License-GPLv3-green?style=flat-square" /></a>
  <img alt="Version" src="https://img.shields.io/badge/Version-1.4.6-blue?style=flat-square" />
</p>

<p align="center">
  <img src="./icons/icon-192.webp" width="64" style="margin: 0 8px;" />
  <img src="./icons/icon-256.webp" width="64" style="margin: 0 8px;" />
  <img src="./icons/icon-512.webp" width="64" style="margin: 0 8px;" />
</p>

---

## 简介

PatentHub 是一款基于 AI 大语言模型的桌面/移动应用程序，专门为专利审查工作设计。它利用先进的 AI 技术辅助专利审查员和代理人进行专利检索、分析和审查工作。

## 主要功能

- **智能专利检索**：利用 AI 进行语义搜索，快速找到相关专利文献
- **专利分析**：自动分析专利技术特征，生成技术要点摘要
- **AI 对话助手**：内置专利领域专业 AI 助手，回答审查相关问题
- **审查搭档**：在顶部工具栏可快速切换预设审查搭档（形式缺陷审查、提炼检索要素、科普大白等），实现一键切换审查模式
- **PDF 双栏预览**：上传 PDF 文件时自动开启 PDF 预览+对话双栏模式，支持 PDF 切换按钮整合进顶栏
- **多模型支持**：支持 OpenAI、Claude、Gemini、Ollama 等多种 AI 模型
- **跨平台**：支持 Windows、macOS、Linux 及 Android 系统

## 下载安装

### 🖥️ Desktop 版本

| 平台 | 安装包 | 说明 |
|------|--------|------|
| <img src="https://img.icons8.com/color/24/windows-10.png" width="20"/> **Windows** | [📥 下载 Setup.exe](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.4.6-Setup.exe) | 安装版，支持自定义安装目录 |
| <img src="https://img.icons8.com/color/24/windows-10.png" width="20"/> **Windows (便携版)** | [📥 下载 Portable.exe](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.4.6-Portable.exe) | 免安装，即开即用 |
| <img src="https://img.icons8.com/mac-os/24/mac-os.png" width="20"/> **macOS (Intel)** | [📥 下载 .dmg](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.4.6.dmg) | 适用于 Intel 芯片 Mac |
| <img src="https://img.icons8.com/mac-os/24/mac-os.png" width="20"/> **macOS (Apple Silicon)** | [📥 下载 .dmg](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.4.6-arm64.dmg) | 适用于 M1/M2/M3/M4 芯片 Mac |
| <img src="https://img.icons8.com/color/24/linux--v1.png" width="20"/> **Linux (AppImage, x64)** | [📥 下载 .AppImage](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.4.6-x64.AppImage) | 通用 Linux 格式 (x64) |
| <img src="https://img.icons8.com/color/24/linux--v1.png" width="20"/> **Linux (AppImage, arm64)** | [📥 下载 .AppImage](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.4.6-arm64.AppImage) | 通用 Linux 格式 (arm64) |
| <img src="https://img.icons8.com/color/24/linux--v1.png" width="20"/> **Linux (deb, x64)** | [📥 下载 .deb](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.4.6-amd64.deb) | Debian/Ubuntu 系 (x64) |
| <img src="https://img.icons8.com/color/24/linux--v1.png" width="20"/> **Linux (deb, arm64)** | [📥 下载 .deb](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.4.6-arm64.deb) | Debian/Ubuntu 系 (arm64) |

### 📱 Mobile 版本

| 平台 | 安装包 | 说明 |
|------|--------|------|
| <img src="https://img.icons8.com/color/24/android-os.png" width="20"/> **Android** | [📥 下载 APK](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-android.apk) | 支持 Android 8.0+ |

> **注意**：Android 版本下载后需要打开 `允许安装未知来源应用` 权限进行安装。

## 📸 界面预览

<p align="center">
  <img src="./assets/icon-pro.png" width="200" />
  <img src="./assets/icon_pro2.png" width="200" />
</p>

## 技术栈

- **框架**：Electron + React + TypeScript + Capacitor
- **构建工具**：electron-vite + electron-builder
- **UI 组件**：Mantine UI + Material UI
- **AI SDK**：Vercel AI SDK
- **移动端**：Capacitor (Android)

## 开发

### 环境要求

- Node.js (v20.x - v22.x)
- pnpm (v10.x)

### 可选：myOCR 本地离线 OCR 依赖

> 若要使用 **PDF 转换 → myOCR**（OCRmyPDF 本地版，无需网络，数据完全离线）：
> 运行 `scripts/check-ocrmypdf-env.ps1` 可一键检测依赖是否就绪。

| 依赖 | 下载 | 安装命令 |
|------|------|---------|
| Python ≥ 3.11 | python.org | - |
| OCRmyPDF ≥ 17 | - | `pip install ocrmypdf` |
| Tesseract ≥ 5.0 | [UB-Mannheim/tesseract](https://github.com/UB-Mannheim/tesseract/wiki) | 安装时勾选语言包 |
| Ghostscript ≥ 10 | [ghostscript.com](https://ghostscript.com/download/gsdn.html) | - |

**提示**：若不安装上述依赖，PDF 转换 Tab 仍可使用 MinerU/MinerU-Office 云端服务商（需 API Key）。

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm run dev
```

### 本地打包

```bash
# 构建当前平台
pnpm run package

# 构建所有桌面平台
pnpm run package:all
```

### Android 构建

```bash
# 同步 Capacitor 配置
pnpm run mobile:sync:android

# 在 Android Studio 中打开并构建
pnpm run mobile:android
```

### 版本升级

项目提供一键版本升级脚本 `scripts/bump-version.mjs`：

```bash
# 手动指定版本号
node scripts/bump-version.mjs 1.2.9
pnpm run version:bump 1.2.9

# 自动递增（推荐）
pnpm run version:patch    # 1.2.8 → 1.2.9
pnpm run version:minor    # 1.2.8 → 1.3.0
pnpm run version:major    # 1.2.8 → 2.0.0

# 试运行（不修改文件）
node scripts/bump-version.mjs 1.2.9 --dry-run

# 升级 + 自动重新打包
node scripts/bump-version.mjs 1.2.9 --build

# 只跳过某些文件
node scripts/bump-version.mjs 1.2.9 --skip-lockfile
node scripts/bump-version.mjs 1.2.9 --skip-readme
node scripts/bump-version.mjs 1.2.9 --skip-changelog
```

脚本会自动修改以下文件：
- `package.json` / `release/app/package.json` / `release/app/package-lock.json`
- `README.md`（badge、8 处下载链接、顶部更新日志）
- 3 个 changelog 文件（`src/renderer/i18n/changelogs/changelog_*.ts`）

脚本运行后还需要**手动编辑** README 和 changelog 中的 `TODO` 占位内容，写入真实变更说明。

## 项目结构

```
PatentHub/
├── src/
│   ├── main/           # 主进程代码
│   ├── preload/        # 预加载脚本
│   └── renderer/      # 渲染进程（React应用）
├── assets/             # 静态资源
├── android/           # Android 原生项目
├── icons/             # 应用图标（多尺寸）
├── release/           # 构建输出
├── electron-builder.yml  # 打包配置
└── package.json
```

## 更新日志

### v1.4.6 (2026-10-25)

- ✨ **新增审查搭档「科普大白」**：把权利要求逐条改写成「原文 / 比喻 / 总结」三列表格，并输出 R1–R12 核对报告与一句话总览；作为第 2 个内置搭档，支持 `/2`、`/kpdb`、`/科普` 快捷调用
- 🔧 **内置搭档编号与 ID 重排**：科普大白为 02，原 02–09 顺延为 03–10，展示序号、`/序号` 与 ID 编号保持一致
- 🔧 **新增会话搭档 ID 自动迁移**：读取旧会话时自动把旧编号映射为新编号（含 V1 时期遗留 id），避免顶部显示「选择搭档」、搭档 Chip 缺失及手动移除后提示词残留
- ✅ **新增单测**：覆盖搭档 ID 迁移、斜杠命令序号 / 拼音 / 中文检索
- 🐛 **屏蔽上游 Chatbox 自动更新源**：自动更新默认完全关闭、不再访问 chatboxai.app；未配置自家更新源时隐藏「自动更新 / Beta 更新」开关，`install-update` 增加双重安全校验（详见 `docs/auto-update.md`）

### v1.4.5 (2026-10-24)

- ✨ **优化「文献检索」提示词**（原「非专利文献检索」）：统一覆盖专利与非专利文献；新增检索要素分解、三层检索轮次（专利 → 非专利 → 灰文献）、相关度评分定档、专利族去重与公开日三查、幻觉治理红线；「检索策略与检索式」改为报告末尾附表
- ✨ **优化「审查意见答复」提示词**：默认不检索，直接依据前次通知书引用的对比文件（D1、D2…）与说明书原文进行针对性答复；补充检索须显式判定并经用户确认，新增证据按 D3、D4… 顺延编号，未获同意时按公知常识基于原证据评述
- 🔧 **同步修正**：「提炼检索要素」提示词内部名称、架构文档文案、检索搭档拼音索引（文献检索 → wxjs）
- 🐛 **修复版本升级脚本**：`bump-version.mjs` 中 changelog 插入正则误写为 `\\n`，导致新版本条目未写入 3 个 changelog 文件却提示成功

### v1.4.0 (2026-09-19)

- ✨ **新增 Agent（智能体）模块**：侧边栏新增「🤖 Agents」入口，支持创建与编辑 Agent、多轮工具调用、权限模式、Git Bash 自动发现、工作目录与环境变量配置
- ✨ **新增 Skills（技能）模块**：侧边栏新增「⚡ Skills」入口，Agent 可挂载并调用技能
- ✨ **新增 Agent 工具集**：Bash、文件读写、Glob、Task、Skill 等工具，并支持工具调用气泡与 Todo 进度条
- 🐛 **修复 Agent 选择 MiniMax 模型无法连接大模型的问题**：请求被错误回退到 OpenAI 端点
- 🐛 **修复拖拽 PDF 上传解析失败的问题**
- 🐛 **修复 Agent 页面窗口按钮与附件图标显示问题**

### v1.3.6 (2026-07-04)

- ✨ **新增 3 个国产大模型提供商**：Moonshot (Kimi)、MiniMax、智谱 (ChatGLM)
- ✨ **更新 6 家模型提供商默认模型列表**
  - OpenAI: gpt-5.5-pro, gpt-5.5, gpt-5.4, gpt-5.4-mini, gpt-5.4-nano, gpt-image-2
  - Claude: claude-fable-5, claude-opus-4-8, claude-sonnet-5, claude-sonnet-latest
  - Gemini: gemini-3.1-pro-preview, gemini-3.1-flash-lite-preview 等
  - DeepSeek: 新增 deepseek-v4-pro, deepseek-v4-flash
  - xAI: grok-4.3, grok-build-0.1, grok-imagine-image
  - VolcEngine: doubao-seed-evolving, doubao-seed-2-1-pro, doubao-seed-2-1-turbo
- ✨ **新增图像生成模型支持**：gpt-image-2, grok-imagine-image, nano-banana-pro-4k
- ✨ **新增 Qwen (通义千问) 大模型提供商**
- ✨ **新增 PDF OCR 功能**：myOCR 本地离线 OCR 服务（OCRmyPDF + Tesseract）
- ✨ **新增 MinerU-Office 云端 PDF 解析服务商**
- ✨ **新增 PDF Markdown 重建功能**
- ✨ **新增 PDF HTML 直接渲染功能**
- ✨ **新增 WPS 及旧版 Office 文档解析支持**：.doc/.wps/.xls/.et/.ppt/.dps
- ✨ **新增 Android PDF 本地解析与渲染**
- ✨ **新增图片生成功能**（DALL-E 3）
- ✨ **新增审查搭档功能**：顶部工具栏快速切换预设审查模式
- ✨ **新增百度搜索功能**
- 🐛 **修复 PDF 导出失败回退 HTML 问题**
- 🐛 **修复 HTML 转 PDF 空白问题**
- 🐛 **修复 PDF 渲染问题**
- 🐛 **修复 Electron 打包模块加载问题**
- 🐛 **修复 Android 打包问题**
- 🐛 **修复 Portable 版启动崩溃**

### v1.3.0 (2026-06-22)

- ✨ TODO: 填写本次版本变更说明（手动编辑）
- 🐛 TODO: 列出 bug 修复条目

### v1.2.8 (2026-06-19)

- 🐛 **修复 Portable 版启动崩溃**
  - 根因：打包后的 `main.js` 顶层直接 `require('cfb')` 失败（`Cannot find module 'cfb'`），导致应用启动瞬间崩溃
  - 修复：`cfb` 与 `codepage` 改用 `requireUnpackedModule()` 多策略 fallback，并加入 `electron-builder.yml` 的 `asarUnpack` 列表
- ✨ **.ppt 旧版二进制格式解析质量提升**
  - 新增 Python + PowerPoint COM 自动转换 `.ppt → .pptx` 链路，文本完整度从约 52% 提升到 100%
  - 新增 SheetJS js-ppt 库作为离线兜底方案（无需 Python 也能解析）
- ✨ **新增旧版及 WPS 私有格式文档解析**
  - `.doc` / `.wps` → word-extractor (OLE2)
  - `.xls` / `.et` → xlsx (SheetJS)
  - `.ppt` / `.dps` → cfb + js-ppt + Python 转换三层降级
- ✨ **WPS 私有格式专属图标**
  - `.wps` / `.et` / `.dps` 在文件列表中显示专属图标，不再回退到默认文本图标

### v1.2.6 (2026-06-11)

- 🐛 **修复顶部 Header 区域无法拖拽窗口**
  - 根本原因：`Toolbar.tsx` 的 Flex 容器错误添加了 `className="controls"`，导致整个 Toolbar 区域被标记为 `no-drag`
  - 修复：移除容器的 `controls` 类，内部按钮仍被通用规则正确标记
- ✨ **将"审查搭档"选择器整合进 Header 同一行**
  - 重构 Header 组件，新增 `leftActions`（PDF 切换按钮）和 `copilotSelector`（搭档选择器）两个可选 props
  - 移除 `$sessionId.tsx` 中单独占一行的搭档选择器 Box，让顶部更紧凑
- ✨ **优化搭档选择器位置**
  - 限制 Session Name 最大宽度 35%（小屏 50%），让搭档按钮自然居于 PDF 区域和对话区域之间
  - 右侧 Toolbar 改用 `marginLeft: auto` 推到右侧，避免 `flex: 1` 撑满空白区域干扰拖拽

### v1.2.0 (2026-05-30)

- 🐛 **修复 Android 端 PDF 上传解析失败问题** — 移动端默认解析器改为本机解析，支持 pdf.js 本地提取 PDF 文本
- 🐛 **修复 pdf.js Web Worker 在 Android WebView 中加载失败** — 禁用 Worker 避免跨域/路径解析问题
- ✨ **优化文件解析错误弹窗** — 20+种失败场景显示中文详细提示，并提供一键跳转至文档解析设置的操作按钮

### v1.1.6

- 首个公开发布版本

## 许可证

本项目基于 GPLv3 许可证开源。

## 联系方式

**专利审查四川中心**

如有问题或建议，请提交 [GitHub Issue](https://github.com/jackhe26/PatentHub/issues)。
