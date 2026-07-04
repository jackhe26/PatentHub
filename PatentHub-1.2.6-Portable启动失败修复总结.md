# PatentHub-1.2.6-Portable 启动失败修复总结

## 开发日期
2026-06-19

## 一、问题描述

PatentHub-1.2.6-Portable 在用户机器上启动时立即崩溃：

```
A JavaScript error occurred in the main process
Uncaught Exception:Error: Cannot find module 'cfb'
Require stack:
C:\Users\...\Temp\3FLTj28E837CkR1vmfTpkro7cN....main.js
at node:internal/modules/cjs/loader:1084:15
...
at Object.<anonymous>(C:\...\Temp\...\main.js:103724)
```

**关键现象**：
- 应用启动瞬间崩溃，连主窗口都未出现
- 错误堆栈指向 main.js 第 103724 行
- 临时目录路径（`...Temp\3FLTj...main.js`）表明是 Electron 在 Portable 解压后运行的入口

## 二、根因分析

### 1. 错误源头

`src/main/file-parser.ts` 顶层有两行模块加载：

```typescript
;(globalThis as any).CFB = require('cfb')
;(globalThis as any).cptable = require('codepage')
```

这两行在 **模块 import 时立即执行**（属于模块顶层代码），与 .ppt 文件是否被上传无关。app 一启动 → main.js 加载 → import file-parser → require('cfb') → 崩溃。

### 2. 现有"防御性配置"为什么没生效

`electron.vite.config.ts` 中曾试图将 cfb/codepage 内联打包（避开 require）：

```typescript
external: [
  ...Object.keys(packageJson.dependencies || {}).filter(
    // Bundle cfb/codepage inline — portable builds can't find them via require()
    (dep) => dep !== 'cfb' && dep !== 'codepage'
  ),
  'electron', ...
]
```

但这条配置 **实际并未生效**，证据：

| 维度 | 现象 | 推论 |
|------|------|------|
| 错误堆栈 | `main.js:103724` 仍有 `require('cfb')` 调用 | 反向 filter 没有真正把 cfb 从 external 列表移除 |
| 文件行数 | 103k+ 行的巨型 main.js | 大量代码被 bundle，但 cfb 的 require 调用未内联 |
| Vite 行为 | 生产模式未使用 `externalizeDepsPlugin()` | Vite 内置默认 externalize 仍把 cfb 当外部模块 |

### 3. asar 加载机制限制

`require('cfb')` 在打包后的解析路径：

```
main.js (在 app.asar 内)
  → Node.js 按 asar 协议解析 require('cfb')
  → 在 app.asar/node_modules 找 → 不存在（Vite 没把 node_modules 完整打进 asar）
  → 找不到 → 抛异常
```

而 `electron-builder.yml` 的 `asarUnpack` 列表里**没有 cfb/codepage**，所以 `app.asar.unpacked/node_modules` 里也没有，无法 fallback。

### 4. 与已有经验的关系

项目已有 `Electron打包模块加载问题修复总结.md`，使用 `requireUnpackedModule()` 模式（多策略 fallback）成功应用于：

- `pdf-parse`
- `pdfjs-dist`
- `officeparser`
- `libsql`
- `@napi-rs/canvas`

`cfb` 和 `codepage` 是新加依赖（用于 v3 的 .ppt 解析方案），**忘记同步应用此模式**。

## 三、修复方案

采用与 `pdf-parse` / `officeparser` 完全一致的 `requireUnpackedModule` 模式。

### 修改 1: `src/main/file-parser.ts`

**a) 把 cfb/codepage 的加载移到 `const log` 定义之后**（避免 TDZ 错误）：

```diff
- // Pre-load cfb/codepage as globals so ppt-parser.js (outside asar) can use them
- // ppt-parser.js checks: if(typeof CFB === 'undefined') CFB = require('cf'+'b')
- ;(globalThis as any).CFB = require('cfb')
- ;(globalThis as any).cptable = require('codepage')
-
- const PPTParser = (() => { ... })()
-
- const log = getLogger('file-parser')
+ const PPTParser = (() => { ... })()
+
+ const log = getLogger('file-parser')
+
+ // Pre-load cfb/codepage as globals so ppt-parser.js (outside asar) can use them
+ // ppt-parser.js checks: if(typeof CFB === 'undefined') CFB = require('cf'+'b')
+ // Use requireUnpackedModule to support both dev and packaged (asar/asar.unpacked) modes
+ // MUST run after `log` and `requireUnpackedModule` are initialized (the function uses `log` internally)
+ ;(globalThis as any).CFB = requireUnpackedModule('cfb')
+ ;(globalThis as any).cptable = requireUnpackedModule('codepage')
```

**b) 改用 `requireUnpackedModule`**：

```typescript
;(globalThis as any).CFB = requireUnpackedModule('cfb')
;(globalThis as any).cptable = requireUnpackedModule('codepage')
```

### 修改 2: `electron-builder.yml`

把 `cfb` 和 `codepage` 加入 `asarUnpack`：

```yaml
asarUnpack:
  - "**/*.{node,dll}"
  - "**/node_modules/libsql/**"
  - "**/node_modules/@napi-rs/canvas*/**"
  - "**/node_modules/pdf-parse/**"
  - "**/node_modules/pdfjs-dist/**"
  - "**/node_modules/officeparser/**"
  - "**/node_modules/cfb/**"          # NEW
  - "**/node_modules/codepage/**"     # NEW
```

### 修改 3: `electron.vite.config.ts`

移除 `cfb`/`codepage` 的反向 filter，让它们与其它依赖一样被 externalize：

```diff
  rollupOptions: {
    external: [
-     ...Object.keys(packageJson.dependencies || {}).filter(
-       // Bundle cfb/codepage inline — portable builds can't find them via require()
-       (dep) => dep !== 'cfb' && dep !== 'codepage'
-     ),
+     ...Object.keys(packageJson.dependencies || {}),
      'electron',
      ...
    ],
```

## 四、为什么这个方案可靠

### 1. 复用已有成功模式
`requireUnpackedModule` 已为 `pdf-parse` 等 5 个模块稳定工作，相同的 3 策略 fallback：

```typescript
function requireUnpackedModule(moduleName: string): any {
  // 方式1: 直接 require（dev 环境）
  // 方式2: 解析 package.json 的 CJS 入口，从 asar.unpacked 真实路径加载
  // 方式3: 尝试 /node 子路径
}
```

### 2. dev / prod 一致
两种模式下 `requireUnpackedModule` 都能工作，不需要额外的条件分支。

### 3. 启动期风险最低
仍然是顶层 require（保持 ppt-parser.js 能立即看到 `globalThis.CFB`），但 fallback 路径能成功，不会再崩。

### 4. 关键：顺序调整
`requireUnpackedModule` 内部访问 `log.error(...)`，所以调用必须放在 `const log = ...` 之后。原代码此处会触发 **Temporal Dead Zone**（TDZ）错误。

## 五、回归验证清单

- [ ] 执行 `pnpm run package` 重新打包 Portable 版本
- [ ] 双击 `PatentHub-1.2.6-...-Portable.exe`
  - [ ] ✅ 应用正常启动，无 cfb 错误弹窗
  - [ ] ✅ 主窗口正常显示
- [ ] 上传 `.ppt` 文件 → 应走 v3 链路（Python 转换 → officeparser）
- [ ] 上传 `.pptx` 文件 → 应走 jszip OOXML 解析链路
- [ ] 上传 `.pdf` 文件 → 应正常解析
- [ ] 上传 `.docx/.xlsx` 文件 → 应正常解析（officeparser）

## 六、关键经验教训

### 1. 新加依赖必须同步打包配置
每当 `package.json` 的 `dependencies` 添加新包，必须确认：

| 检查项 | 适用情况 |
|--------|----------|
| 加入 `electron-builder.yml` 的 `asarUnpack` | 纯 JS 模块在 asar 内 require 失败 |
| 加入 `externalizeDepsPlugin` 的 white/black list | 何时内联 vs 何时 external |
| 用 `requireUnpackedModule` 加载 | 与已有模块一致 |

### 2. "内联打包" 不是万能解
试图在 `rollupOptions.external` 中反向过滤某模块来强制内联，**并不总是有效**：
- Vite lib mode 默认行为与 `externalizeDepsPlugin()` 强耦合
- 生产模式如果不用 `externalizeDepsPlugin()`，行为可能与预期不符

更稳妥的策略：**统一 external + asarUnpack + requireUnpackedModule**。

### 3. TDZ（Temporal Dead Zone）陷阱
`function` 声明会被 hoist，但 `const`/`let` 不会。如果 helper 函数内部访问顶层 `const log` 之类的变量，**调用必须在 const 声明之后**。

原代码之所以没踩这个坑，是因为顶层只有 `require('cfb')`（不访问 log）。改成 `requireUnpackedModule('cfb')` 后立即踩坑。

### 4. Portable 临时目录 ≠ asar 路径
Portable 版启动时，Electron 把 main.js 解压到 `%TEMP%\3xxxxxxx\main.js`。`app.getAppPath()` 返回的临时路径**不包含 `.asar` 后缀**，这就是为什么 `getUnpackedModulePath` 用 `process.resourcesPath` 而非 `app.getAppPath()` 来定位 `app.asar.unpacked`。

## 七、相关文件修改

| 文件 | 修改内容 |
|------|----------|
| `src/main/file-parser.ts` | cfb/codepage 改用 `requireUnpackedModule`，顺序调整到 `const log` 之后 |
| `electron-builder.yml` | `asarUnpack` 新增 `cfb` 和 `codepage` |
| `electron.vite.config.ts` | 移除 `cfb`/`codepage` 的反向 external filter |

## 八、相关参考

- `Electron打包模块加载问题修复总结.md` — 已有 `requireUnpackedModule` 模式
- `WPS与旧版Office文档解析开发经验总结.md` — v3 PPT 解析方案依赖 cfb
- `docs/pdf-parse-electron-asar-fix.md` — 类似的 asar 模块解析问题