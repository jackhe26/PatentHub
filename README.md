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
  <img alt="Version" src="https://img.shields.io/badge/Version-1.2.6-blue?style=flat-square" />
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
- **审查搭档**：在顶部工具栏可快速切换预设审查搭档（形式缺陷审查、提炼检索要素等），实现一键切换审查模式
- **PDF 双栏预览**：上传 PDF 文件时自动开启 PDF 预览+对话双栏模式，支持 PDF 切换按钮整合进顶栏
- **多模型支持**：支持 OpenAI、Claude、Gemini、Ollama 等多种 AI 模型
- **跨平台**：支持 Windows、macOS、Linux 及 Android 系统

## 下载安装

### 🖥️ Desktop 版本

| 平台 | 安装包 | 说明 |
|------|--------|------|
| <img src="https://img.icons8.com/color/24/windows-10.png" width="20"/> **Windows** | [📥 下载 Setup.exe](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.2.6-Setup.exe) | 安装版，支持自定义安装目录 |
| <img src="https://img.icons8.com/color/24/windows-10.png" width="20"/> **Windows (便携版)** | [📥 下载 Portable.exe](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.2.6-Portable.exe) | 免安装，即开即用 |
| <img src="https://img.icons8.com/mac-os/24/mac-os.png" width="20"/> **macOS (Intel)** | [📥 下载 .dmg](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.2.6.dmg) | 适用于 Intel 芯片 Mac |
| <img src="https://img.icons8.com/mac-os/24/mac-os.png" width="20"/> **macOS (Apple Silicon)** | [📥 下载 .dmg](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.2.6-arm64.dmg) | 适用于 M1/M2/M3/M4 芯片 Mac |
| <img src="https://img.icons8.com/color/24/linux--v1.png" width="20"/> **Linux (AppImage, x64)** | [📥 下载 .AppImage](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.2.6-x64.AppImage) | 通用 Linux 格式 (x64) |
| <img src="https://img.icons8.com/color/24/linux--v1.png" width="20"/> **Linux (AppImage, arm64)** | [📥 下载 .AppImage](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.2.6-arm64.AppImage) | 通用 Linux 格式 (arm64) |
| <img src="https://img.icons8.com/color/24/linux--v1.png" width="20"/> **Linux (deb, x64)** | [📥 下载 .deb](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.2.6-amd64.deb) | Debian/Ubuntu 系 (x64) |
| <img src="https://img.icons8.com/color/24/linux--v1.png" width="20"/> **Linux (deb, arm64)** | [📥 下载 .deb](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.2.6-arm64.deb) | Debian/Ubuntu 系 (arm64) |

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
