# PatentHub

<p align="center">
  <img src="./assets/icon.png" width="128" />
</p>

<p align="center">
  <strong>基于AI的专利审查助手</strong><br>
  AI-Powered Patent Examination Assistant
</p>

<p align="center">
  <a href="#"><img alt="Platform" src="https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows&logoColor=white" /></a>
  <a href="#"><img alt="Platform" src="https://img.shields.io/badge/Platform-macOS-black?style=flat-square&logo=apple&logoColor=white" /></a>
  <a href="#"><img alt="Platform" src="https://img.shields.io/badge/Platform-Linux-yellow?style=flat-square&logo=linux&logoColor=white" /></a>
  <a href="#"><img alt="License" src="https://img.shields.io/badge/License-GPLv3-green?style=flat-square" /></a>
</p>

---

## 简介

PatentHub 是一款基于 AI 大语言模型的桌面应用程序，专门为专利审查工作设计。它利用先进的 AI 技术辅助专利审查员和代理人进行专利检索、分析和审查工作。

## 主要功能

- **智能专利检索**：利用 AI 进行语义搜索，快速找到相关专利文献
- **专利分析**：自动分析专利技术特征，生成技术要点摘要
- **AI 对话助手**：内置专利领域专业 AI 助手，回答审查相关问题
- **多模型支持**：支持 OpenAI、Claude、Gemini、Ollama 等多种 AI 模型
- **跨平台**：支持 Windows、macOS、Linux 系统

## 下载

### Desktop 版本

| Windows | macOS (Intel) | macOS (Apple Silicon) | Linux |
|---------|---------------|---------------------|-------|
| [下载 .exe](./releases) | [下载 .dmg](./releases) | [下载 .dmg](./releases) | [下载 .AppImage](./releases) |

## 技术栈

- **框架**：Electron + React + TypeScript
- **构建工具**：electron-vite + electron-builder
- **UI 组件**：Mantine UI
- **AI SDK**：Vercel AI SDK

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

### 构建安装包

```bash
# 构建当前平台
pnpm run package

# 构建所有平台
pnpm run package:all
```

## 项目结构

```
PatentHub/
├── src/
│   ├── main/           # 主进程代码
│   ├── preload/        # 预加载脚本
│   └── renderer/      # 渲染进程（React应用）
├── assets/             # 静态资源
├── release/           # 构建输出
└── electron-builder.yml  # 打包配置
```

## 许可证

本项目基于 GPLv3 许可证开源。

## 联系方式

如有问题或建议，请提交 Issue。
