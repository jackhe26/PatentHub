# MinerU 打包版本 Embedding 失败问题修复总结

## 问题描述

- **测试版本**（`pnpm dev`）：MinerU 解析 + Embedding 正常
- **打包版本**（`pnpm package`）：MinerU 解析成功，但 Embedding 失败

错误信息：
```
AI_UnsupportedModelVersionError: Unsupported model version. AI SDK 4 only supports models that implement specification version "v1". Please upgrade to AI SDK 5 to use this model.
```

## 根本原因分析

### 项目架构

本项目使用 Electron 多层架构：

| 层级 | 文件 | AI SDK 版本 | 用途 |
|------|------|-------------|------|
| **开发层** | `package.json` | v6.0.67 | `pnpm dev` 开发模式 |
| **打包层** | `release/app/package.json` | v4.3.19 | `electron-builder` 打包 |

`electron-builder.yml` 配置了：
```yaml
directories:
  app: release/app
```

打包时 `electron-builder` 使用 `release/app` 目录，而不是主项目。

### 版本对比

| 包 | 主项目 (开发) | release/app (打包) |
|---|---|---|
| ai | 6.0.67 ✅ | 4.3.19 ❌ |
| @ai-sdk/openai-compatible | 2.0.26 ✅ | 未安装 ❌ |
| @ai-sdk/provider | 3.0.7 ✅ | 未安装 ❌ |

### 原因

升级主项目 AI SDK 时，没有同步更新 `release/app/package.json`，导致打包版本使用旧版本。

## 修复方案

### 修改文件

`release/app/package.json`：

```diff
  "dependencies": {
+   "@ai-sdk/openai-compatible": "^2.0.26",
+   "@ai-sdk/provider": "^3.0.1",
    "@libsql/client": "^0.15.6",
-   "ai": "^4.3.19",
+   "ai": "^6.0.11",
    "zod": "^3.23.8",
    ...
  }
```

### Git 操作记录

1. **创建回滚点**：
   ```bash
   git commit -m "backup: release/app/package.json before AI SDK sync (v4.3.19)"
   # commit: 0eaa891
   ```

2. **应用修复**：
   ```bash
   git commit -m "fix: sync AI SDK to v6.0.11 in release/app for knowledge base embedding support"
   # commit: b7958cb
   ```

3. **回滚方法**（如需要）：
   ```bash
   git revert 0eaa891
   ```

## 验证结果

打包成功，生成文件：
- `release\build\PatentHub-1.2.0-Setup.exe`
- `release\build\PatentHub-1.2.0-Portable.exe`

## 预防措施

### 方案 1：手动同步（当前方案）
每次升级主项目依赖时，同步更新 `release/app/package.json`

### 方案 2：自动化脚本
创建脚本，在打包前自动同步依赖版本

### 方案 3：使用单一 package.json
修改 `electron-builder.yml`，让它使用主项目的 `package.json`，而不是独立的 `release/app/package.json`

## 相关文件

- `release/app/package.json` - 打包配置文件
- `electron-builder.yml` - 打包配置
- `package.json` - 主项目配置

## 修复时间

2026-06-08