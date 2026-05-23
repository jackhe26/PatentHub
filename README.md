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
  <img alt="Version" src="https://img.shields.io/badge/Version-1.1.6-blue?style=flat-square" />
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
- **多模型支持**：支持 OpenAI、Claude、Gemini、Ollama 等多种 AI 模型
- **跨平台**：支持 Windows、macOS、Linux 及 Android 系统

## 下载安装

### 🖥️ Desktop 版本

| 平台 | 安装包 | 说明 |
|------|--------|------|
| <img src="https://img.icons8.com/color/24/windows-10.png" width="20"/> **Windows** | [📥 下载 Setup.exe](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.1.6-Setup.exe) | 安装版，支持自定义安装目录 |
| <img src="https://img.icons8.com/color/24/windows-10.png" width="20"/> **Windows (便携版)** | [📥 下载 Portable.exe](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.1.6-Portable.exe) | 免安装，即开即用 |
| <img src="https://img.icons8.com/mac-os/24/mac-os.png" width="20"/> **macOS (Intel)** | [📥 下载 .dmg](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.1.6.dmg) | 适用于 Intel 芯片 Mac |
| <img src="https://img.icons8.com/mac-os/24/mac-os.png" width="20"/> **macOS (Apple Silicon)** | [📥 下载 .dmg](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.1.6-arm64.dmg) | 适用于 M1/M2/M3/M4 芯片 Mac |
| <img src="https://img.icons8.com/color/24/linux--v1.png" width="20"/> **Linux (AppImage, x64)** | [📥 下载 .AppImage](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.1.6-x64.AppImage) | 通用 Linux 格式 (x64) |
| <img src="https://img.icons8.com/color/24/linux--v1.png" width="20"/> **Linux (AppImage, arm64)** | [📥 下载 .AppImage](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.1.6-arm64.AppImage) | 通用 Linux 格式 (arm64) |
| <img src="https://img.icons8.com/color/24/linux--v1.png" width="20"/> **Linux (deb, x64)** | [📥 下载 .deb](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.1.6-amd64.deb) | Debian/Ubuntu 系 (x64) |
| <img src="https://img.icons8.com/color/24/linux--v1.png" width="20"/> **Linux (deb, arm64)** | [📥 下载 .deb](https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-1.1.6-arm64.deb) | Debian/Ubuntu 系 (arm64) |

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

## 许可证

本项目基于 GPLv3 许可证开源。

## 联系方式

**专利审查四川中心**

如有问题或建议，请提交 [GitHub Issue](https://github.com/jackhe26/PatentHub/issues)。
