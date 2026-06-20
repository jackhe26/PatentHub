# PatentHub PDF 格式转换 HTML 渲染打包失败修复经验总结

> 作者：AI 助手
> 日期：2026-06-21
> 版本：v1.2.8

---

## 1. 问题描述

在 `pnpm start`（开发模式）下，PDF 格式转换后的 HTML 渲染功能正常工作。但在打包为 Windows 便携版（`PatentHub-1.2.8-Portable.exe`）后：

1. **右侧 PDF 面板显示 ZIP 文件路径**（`file:///C:/.../mineru_output/xxx.zip`）而非 HTML 预览
2. **白屏**：启动后界面为纯白色，无任何内容渲染

---

## 2. 根本原因分析

### 问题一：PDF 格式转换后 HTML 渲染失败（显示 ZIP 路径）

**症状**：右侧显示 `file:///.../xxx.zip` 路径，而非 HTML 预览页面。

**根因链**：

```
electron-builder 只打包 release/app/package.json 中的 dependencies
    → adm-zip 不在 release/app/package.json 中
        → electron-builder 未将 adm-zip 打包进 app.asar 或 app.asar.unpacked
            → 打包后的 require('adm-zip') 抛出 MODULE_NOT_FOUND 异常
                → ipc-handlers.ts 的 build-html 处理函数崩溃
                    → 返回 { success: false }
                        → 前端 tryRebuildHtml 静默失败
                            → rightMode 保持 'pdf' 不变
                                → 右侧显示 PDF/ZIP 路径而非 HTML 预览
```

**关键发现**：

```text
release/build/win-unpacked/resources/app.asar.unpacked/node_modules/
├── @libsql
├── @napi-rs
├── cfb
├── codepage
├── libsql
├── officeparser      ← 在 electron-builder.yml 的 asarUnpack 中
├── pdf-parse         ← 在 electron-builder.yml 的 asarUnpack 中
├── pdfjs-dist        ← 在 electron-builder.yml 的 asarUnpack 中
└── adm-zip           ← ❌ 缺失！
```

**electron-builder 的打包逻辑**：

```yaml
# electron-builder.yml 片段
asarUnpack:
  - 'node_modules/pdf-parse/**/*'
  - 'node_modules/officeparser/**/*'
  # adm-zip 不在 asarUnpack 中
```

但即使加入 `asarUnpack` 也不够，因为 `electron-builder` 的**首要条件是 `release/app/package.json` 中必须声明该依赖**。如果 `release/app/package.json` 中没有 `adm-zip`，electron-builder 根本不会去找这个模块。

### 问题二：打包后白屏

**症状**：双击 `PatentHub-1.2.8-Portable.exe` 后，窗口为纯白色，无任何内容。

**根因链**：

```
pnpm run build 的 client renderer 构建被中断（Ctrl+C）
    → rendering chunks (27)... 阶段未完成
        → release/app/dist/renderer/index.html 未生成
        → release/app/dist/renderer/js/*.js chunk 文件缺失
            → electron-builder 打包了不完整的 renderer 产物
                → 启动后 renderer 进程无法加载 index.html → 白屏
```

**关键发现**：

- `electron-vite` 的 client 构建（`vite v7.3.1 building client environment for production`）需要 **30-60 秒** 完成 `rendering chunks` 阶段
- 之前的打包产物只有 123MB，正确产物应为 136MB（多出 renderer 资源文件）
- `release/app/dist/renderer/` 目录下只有 `pdfjs/` 子目录，缺少 `index.html`、`js/`、`fonts/`、`images/`、`styles/`

---

## 3. 修复措施

### 3.1 修复 adm-zip 打包问题

#### (1) 在 `release/app/package.json` 中新增 `adm-zip` 依赖

```json
{
  "dependencies": {
    // ... 其他依赖
    "adm-zip": "0.4.16"
  }
}
```

> ⚠️ **版本必须与根目录一致**。根目录 `pnpm-lock.yaml` 中 `adm-zip` 版本为 `0.4.16`，而非 `^0.5.16`。

#### (2) 将 `adm-zip` 复制到 `release/app/node_modules/`

```powershell
cd f:\MyAI_Labs\Patent-AI\PatentHub-main
Copy-Item -Path node_modules\adm-zip -Destination release\app\node_modules\adm-zip -Recurse -Force
```

> 注：`pnpm install` 在 workspace 模式下会将依赖安装到根目录的 `node_modules`，而非 `release/app/node_modules`。直接复制更可靠。

#### (3) 新增 `getAdmZip()` 安全加载函数

**`src/main/pdf-convert/ipc-handlers.ts`**：

```typescript
function getAdmZip() {
  try {
    return require('adm-zip')
  } catch {
    const unpacked = path.join(
      app.getAppPath().replace('app.asar', 'app.asar.unpacked'),
      'node_modules',
      'adm-zip'
    )
    return require(unpacked)
  }
}
```

**`src/main/pdf-convert/mineru-converter.ts`**：同上。

### 3.2 修复 iframe HTML 渲染问题

**`src/renderer/components/pdf-tools/PDFDualViewCard.tsx`**：

```typescript
// 问题代码：srcDoc 在 file:// 协议下无法加载外部资源（如 CSS）
<iframe srcDoc={htmlString} />

// 修复代码：使用 Blob URL
const blob = new Blob([htmlString], { type: 'text/html;charset=utf-8' })
const blobUrl = URL.createObjectURL(blob)
<iframe src={blobUrl} />
```

> `srcDoc` 在 `file://` 协议下是受限的，外部样式表和内联样式可能无法正确渲染。Blob URL 提供独立的同源上下文。

### 3.3 修复白屏问题

**关键步骤**：确保 `pnpm run build` 完整执行。

```powershell
cd f:\MyAI_Labs\Patent-AI\PatentHub-main
pnpm run build
```

**必须等待到**：

```text
vite v7.3.1 building client environment for production...
✓ 17821 modules transformed.
...（warnings）...
rendering chunks (27)...✓ built in 43.44s
```

**验证 renderer 产物完整**：

```powershell
Test-Path release\app\dist\renderer\index.html  # 应为 True
Get-ChildItem release\app\dist\renderer\js       # 应有 20+ 个 JS 文件
```

---

## 4. 完整打包流程（正确的）

```powershell
# 步骤 1：确保 adm-zip 在 release/app/node_modules 中
Copy-Item -Path node_modules\adm-zip -Destination release\app\node_modules\adm-zip -Recurse -Force

# 步骤 2：完整构建（关键：不要中断！）
cd f:\MyAI_Labs\Patent-AI\PatentHub-main
pnpm run build
# 等待直到出现 "✓ built in 43.44s"

# 步骤 3：验证 renderer 产物
Test-Path release\app\dist\renderer\index.html

# 步骤 4：打包
npx electron-builder build --publish never --win

# 步骤 5：验证产物
Get-ChildItem release\build -Filter *.exe
# PatentHub-1.2.8-Portable.exe   (136 MB)
# PatentHub-1.2.8-Setup.exe      (137 MB)
```

---

## 5. 失败案例与教训

### ❌ 失败 1：未检查 `release/app/package.json`

**错误**：只在根目录 `package.json` 中检查 `adm-zip` 是否存在。

**教训**：`electron-builder` 只读取 `release/app/package.json` 的 `dependencies`，根目录的依赖不会自动进入打包产物。

### ❌ 失败 2：`pnpm install` 在 workspace 模式下安装到根目录

**错误**：在 `release/app` 目录下运行 `pnpm install`，期望安装到 `release/app/node_modules`。

**现象**：`pnpm install` 将依赖安装到根目录 `node_modules`，因为这是一个 pnpm workspace。

**教训**：pnpm workspace 的 `pnpm install` 会统一安装到根目录。需要手动复制特定模块到 `release/app/node_modules/`。

### ❌ 失败 3：构建被中断

**错误**：在 `rendering chunks (27)...` 阶段按 `Ctrl+C` 中断构建。

**现象**：`release/app/dist/renderer/` 目录只有 `pdfjs/` 子目录，缺少 `index.html` 和 `js/` 文件。

**教训**：`electron-vite` 的 client renderer 构建需要 30-60 秒完成 chunk 渲染。**绝对不要中断**。白屏的直接原因就是 renderer 产物不完整。

### ❌ 失败 4：使用 `--dir` 参数误以为没产物

**错误**：`npx electron-builder build --publish never --win --dir` 只生成解压目录，不生成 `.exe` 安装包。

**教训**：`--dir` 只生成 `win-unpacked/` 目录，要生成 `.exe` 需要去掉 `--dir` 参数。

### ❌ 失败 5：版本号不匹配

**错误**：在 `release/app/package.json` 中写了 `"adm-zip": "^0.5.16"`，但实际根目录版本是 `0.4.16`。

**教训**：pnpm workspace 中版本必须一致，否则可能出现兼容性问题。

### ❌ 失败 6：PowerShell 语法错误

**错误**：在 PowerShell 中使用 `cd ... && command`。

**教训**：PowerShell 使用 `;` 作为命令分隔符，而非 `&&`。正确写法：`cd path ; command`。

---

## 6. 相关文件修改清单

| 文件 | 修改类型 | 修改内容 |
|------|---------|---------|
| `release/app/package.json` | 新增 | `"adm-zip": "0.4.16"` |
| `src/main/pdf-convert/ipc-handlers.ts` | 新增 | `getAdmZip()` 安全加载函数 |
| `src/main/pdf-convert/mineru-converter.ts` | 新增 | `getAdmZip()` 安全加载函数 |
| `src/renderer/components/pdf-tools/PDFConvertTab.tsx` | 修改 | 完善 `build-html` 错误提示 |
| `src/renderer/components/pdf-tools/PDFDualViewCard.tsx` | 修改 | Blob URL 替代 `srcDoc` |

---

## 7. 排查工具与技巧

### 检查 asar 内容
```powershell
npx asar list release\build\win-unpacked\resources\app.asar | Select-String "index.html"
```

### 检查 unpacked 模块
```powershell
Get-ChildItem release\build\win-unpacked\resources\app.asar.unpacked\node_modules | Select-Object Name
```

### 检查 renderer 产物
```powershell
Get-ChildItem release\app\dist\renderer | Select-Object Name
```

### 检查 main 进程日志
在打包后的应用中按 `Ctrl+Shift+I` 打开 DevTools，查看 Console 和 Network 面板。

---

## 8. 关联文档

- [扫描版PDF解析与HTML渲染功能开发总结.md](扫描版PDF解析与HTML渲染功能开发总结.md)
- [Electron打包模块加载问题修复总结.md](Electron打包模块加载问题修复总结.md)
- [pdf-parse-electron-asar-fix.md](pdf-parse-electron-asar-fix.md)

---

## 9. 核心原则

1. **asarUnpack ≠ 自动打包**：`asarUnpack` 只是控制哪些文件从 `asar` 中解压出来，前提是这些文件已经在打包产物中。
2. **release/app/package.json 是源头**：electron-builder 的依赖来源是 `release/app/package.json`，不是根目录 `package.json`。
3. **构建完整性是关键**：`pnpm run build` 的 client 阶段耗时最长（30-60 秒），绝对不能中断。
4. **开发模式 ≠ 打包后**：开发模式下 `node_modules` 完整可用，打包后环境完全不同，需要专门测试打包产物。
5. **file:// 协议有坑**：iframe `srcDoc`、本地资源加载在 `file://` 协议下行为与 HTTP 不同，优先使用 Blob URL。