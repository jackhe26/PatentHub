# Electron 打包后模块加载问题修复经验总结

## 问题概述

在打包发布的 Portable 版本中，遇到了两类 PDF 相关功能的问题：
1. **Chat Session 中的 PDF 解析失败**
2. **PDF 翻译功能资源路径问题**

---

## 问题一：Chat Session PDF 解析失败

### 问题描述
通过 Session InputBox 上传 PDF 文件时，本地解析失败。

### 根因分析
asar 包内的代码无法自动访问 `asar.unpacked` 目录中的 Node.js 模块。

#### 打包结构分析
```
release/build/win-unpacked/resources/
├── app.asar              # 主应用代码（打包后）
└── app.asar.unpacked/   # 需要 unpacked 的模块
    └── node_modules/
        ├── pdf-parse/
        ├── officeparser/
        └── pdfjs-dist/
```

**问题**：在 `app.asar` 内使用 `require('pdf-parse')` 时，Node.js 无法自动解析到 `app.asar.unpacked` 中的模块。

### 解决方案

#### 1. electron-builder.yml 配置
确保需要 unpacked 的模块已配置：

```yaml
asarUnpack:
  - "**/*.{node,dll}"
  - "**/node_modules/libsql/**"
  - "**/node_modules/@napi-rs/canvas*/**"
  - "**/node_modules/pdf-parse/**"
  - "**/node_modules/pdfjs-dist/**"
  - "**/node_modules/officeparser/**"
```

#### 2. 代码层面：安全的模块加载函数

```typescript
import { app } from 'electron'
import * as path from 'path'

/**
 * 获取 asar.unpacked 目录中的模块路径
 */
function getUnpackedModulePath(moduleName: string): string {
  const appPath = app.getAppPath()
  
  let unpkgPath: string
  if (appPath.includes('.asar')) {
    // 打包环境：app.asar -> app.asar.unpacked
    unpkgPath = appPath.replace('.asar', '.asar.unpacked')
  } else {
    // 开发环境
    unpkgPath = path.join(appPath, 'node_modules')
  }
  
  return path.join(unpkgPath, moduleName)
}

/**
 * 安全加载 unpacked 模块 - 尝试多种方式
 */
function requireUnpackedModule(moduleName: string): any {
  // 方式1: 直接 require（开发环境可能有效）
  try {
    return require(moduleName)
  } catch (e) {
    console.debug(`Direct require failed, trying unpacked path`)
  }
  
  // 方式2: 使用 unpacked 路径（打包环境）
  try {
    const unpkgPath = getUnpackedModulePath(moduleName)
    return require(unpkgPath)
  } catch (e) {
    console.debug(`Unpacked path require failed`)
  }
  
  // 方式3: 尝试 /node 子路径
  try {
    return require(`${moduleName}/node`)
  } catch (e) {
    console.debug(`/node path require failed`)
  }
  
  throw new Error(`Failed to load module: ${moduleName}`)
}
```

#### 3. 应用到解析函数

```typescript
function parsePdfWithPdfParse2(filePath: string): string {
  ensureDOMMatrix()
  
  const pdfParseModule = requireUnpackedModule('pdf-parse')
  const PDFParse = pdfParseModule.PDFParse
  
  const dataBuffer = fs.readFileSync(filePath)
  const uint8Array = new Uint8Array(dataBuffer)
  const parser = new PDFParse({ data: uint8Array })
  const result = parser.getTextSync()
  parser.destroy()
  return result.text
}
```

### 修改的文件
- `src/main/file-parser.ts`

---

## 问题二：PDF 翻译资源路径问题

### 问题描述
PDF 翻译功能（BabelDOC）找不到 Python 脚本或依赖资源。

### 根因分析
BabelDOC 作为 Python 脚本，通过 `extraResources` 配置放在 `resources` 目录，打包后的路径解析需要特殊处理。

### 解决方案

#### 1. electron-builder.yml 配置
使用 `extraResources` 放置 Python 资源：

```yaml
extraResources:
  - from: resources/babeldoc
    to: resources/babeldoc
    filter:
      - "**/*"
```

#### 2. 代码层面：多路径探测

```typescript
function getBabelDocPath(): string {
  const isDev = !app.isPackaged
  
  if (isDev) {
    return path.join(__dirname, '../../resources/babeldoc')
  } else {
    // 尝试多个可能的路径
    const possiblePaths = [
      path.join(process.resourcesPath, 'resources', 'babeldoc'),
      path.join(process.resourcesPath, 'babeldoc'),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'babeldoc'),
      path.join(path.dirname(process.execPath), 'resources', 'resources', 'babeldoc'),
      path.join(path.dirname(process.execPath), 'resources', 'babeldoc'),
      path.join(path.dirname(process.execPath), 'app', 'resources', 'babeldoc'),
    ]
    
    // 遍历查找存在的路径
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p
      }
    }
    
    return possiblePaths[0] // 返回第一个作为默认值
  }
}
```

### 修改的文件
- `src/main/pdf-translate/index.ts`（已实现正确的路径探测）

---

## 关键知识点总结

### 1. asar vs asar.unpacked
- **asar**：用于存放纯 JavaScript/TypeScript 代码
- **asar.unpacked**：用于存放需要文件系统访问的模块（native addon、包含二进制文件的模块）

### 2. 路径获取方式对比

| 场景 | 开发环境 | 打包环境 |
|------|----------|----------|
| 应用代码 | `app.getAppPath()` → 项目目录 | `app.getAppPath()` → app.asar |
| Node模块 | `node_modules/` | `app.asar.unpacked/node_modules/` |
| 额外资源 | `process.resourcesPath` | `process.resourcesPath` (需注意 extraResources 路径) |

### 3. 模块加载最佳实践

```typescript
// 推荐：兼容开发和打包环境
function safeRequire(moduleName: string) {
  const appPath = app.getAppPath()
  
  // 打包环境
  if (appPath.includes('.asar')) {
    const unpkgPath = appPath.replace('.asar', '.asar.unpacked')
    return require(path.join(unpkgPath, 'node_modules', moduleName))
  }
  
  // 开发环境
  return require(moduleName)
}
```

### 4. 资源文件放置策略

| 资源类型 | 打包配置 | 代码获取方式 |
|----------|----------|--------------|
| Node.js 模块 | `asarUnpack` | `app.getAppPath()` + 替换 |
| Python 脚本 | `extraResources` | `process.resourcesPath` + 多路径探测 |
| 静态资源 | `files` 或 `extraResources` | 相对路径或 `process.resourcesPath` |

---

## 调试技巧

### 查看打包后的目录结构
```bash
# 解压 asar 查看内容
npx asar list release/build/win-unpacked/resources/app.asar

# 查看 unpacked 目录
ls -la release/build/win-unpacked/resources/app.asar.unpacked/node_modules/
```

### 添加日志调试
```typescript
function debugPath(moduleName: string): string {
  const appPath = app.getAppPath()
  console.log(`[Debug] App path: ${appPath}`)
  console.log(`[Debug] Is packaged: ${app.isPackaged}`)
  
  if (appPath.includes('.asar')) {
    const unpkgPath = appPath.replace('.asar', '.asar.unpacked')
    console.log(`[Debug] Unpacked path: ${unpkgPath}`)
  }
  // ...
}
```

---

## 验证结果

✅ Chat Session PDF 解析功能正常工作  
✅ PDF 翻译功能资源路径正确  
✅ 打包生成 `PatentHub-1.0.1-Portable.exe` 成功

---

## 相关文件

- `electron-builder.yml` - 打包配置
- `src/main/file-parser.ts` - PDF 解析模块
- `src/main/pdf-translate/index.ts` - PDF 翻译模块
- `src/main/main.ts` - 主进程入口
