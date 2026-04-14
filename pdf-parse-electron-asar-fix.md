# Electron 打包环境下 PDF 解析问题修复经验总结

**日期**：2026-04-14  
**涉及文件**：`src/main/file-parser.ts`  
**问题文件**：`01+多角色语音交互+CN114283820A.PDF`（编码复杂的中文专利 PDF）

---

## 一、要解决的问题

PatentHub 打包发布后，其他用户（Windows 安装版和 Portable 版）上传特定 PDF 文件时报错，无法解析。而开发者本机（开发模式和打包版）一直正常。

**报错信息**：
```
pdf-parse 解析失败: pdf-parse module loaded but PDFParse class not found
```

---

## 二、问题排查过程

### 阶段一：定位"PDFParse class not found"

**现象**：`pdf-parse` 模块加载成功，但 `PDFParse` 为 `undefined`。

**根本原因**：代码使用了错误的子路径 `require('pdf-parse/node')`。

`pdf-parse` 2.x 有两个导出路径：
- `pdf-parse`（主入口）→ `dist/pdf-parse/cjs/index.cjs` → 导出 `PDFParse` ✅
- `pdf-parse/node`（子路径）→ `dist/node/cjs/index.cjs` → 只导出 `getHeader`（HTTP 工具函数）❌

原代码错误地使用了 `pdf-parse/node`，该子路径是为 Node.js HTTP 请求设计的，与 PDF 解析无关。

**为什么开发者本机没问题**：`require('pdf-parse/node')` 在开发者机器上恰好抛出了异常（可能是 Node.js 模块解析的环境差异），触发了 catch 分支，走了备用路径 `requireUnpackedModule('pdf-parse')`，后者正确加载了 `PDFParse`。其他机器上该调用成功返回了错误模块，catch 分支从未触发。

**第一次修复**：将策略1改为 `require('pdf-parse')`。

---

### 阶段二：发现 pdf.worker.mjs 动态 import 失败

打包测试后出现新错误：

```
Setting up fake worker failed: "Cannot find module 
'D:\Program Files\PatentHub2\resources\app.asar\node_modules\pdf-parse\dist\pdf-parse\cjs\pdf.worker.mjs' 
imported from app.asar\node_modules\pdf-parse\dist\pdf-parse\cjs\index.cjs"
```

**根本原因**：Electron asar 打包机制与动态 `import()` 的冲突。

`pdf-parse` 2.x 的 `index.cjs` 内部会执行：
```javascript
import("./pdf.worker.mjs")  // 动态 ESM import
```

问题链：
1. `require('pdf-parse')` 加载模块时，Electron 将 `__filename` 设置为 asar 内部路径：`app.asar\node_modules\pdf-parse\dist\pdf-parse\cjs\index.cjs`
2. 动态 `import("./pdf.worker.mjs")` 相对于 `__filename` 解析，目标路径变为 `app.asar\...\pdf.worker.mjs`
3. 该路径在 asar 内部，**动态 import 不经过 Electron 的 asar 拦截**，无法读取，报错

虽然 `electron-builder.yml` 已配置 `asarUnpack: ["**/node_modules/pdf-parse/**"]`，`pdf.worker.mjs` 物理上存在于 `app.asar.unpacked`，但 `__filename` 仍指向 asar 路径，导致动态 import 解析错误。

**第二次修复**：改变加载策略，优先从 `app.asar.unpacked` 的**真实文件系统路径**加载。

---

## 三、最终解决方案

### 核心思路

用 `require(真实路径)` 代替 `require('pdf-parse')`。当用真实路径加载时，`__filename` 被设置为真实路径（`app.asar.unpacked\...\index.cjs`），动态 import 就能正确解析到 `app.asar.unpacked\...\pdf.worker.mjs`。

### 三层加载策略（`parsePdfWithPdfParse2`）

```
策略1（优先）：从 app.asar.unpacked 真实路径加载
  process.resourcesPath + /app.asar.unpacked/node_modules/pdf-parse/
  读 package.json → 找 exports['.'].require.default → require(真实CJS路径)
  → __filename = 真实路径 → 动态 import 正确解析 ✅

策略2（备用）：require('pdf-parse')
  适用于开发模式（无 asar，直接从 node_modules 加载）

策略3（兜底）：直接拼接已知 CJS 路径
  app.asar.unpacked/node_modules/pdf-parse/dist/pdf-parse/cjs/index.cjs
```

每层都检查 `PDFParse` 是否真实存在，失败时记录详细原因，全部失败时抛出包含所有尝试记录的错误信息。

### 验证结果（日志）

```
[info] [pdf-parse] Strategy 1 success (unpacked real path): 
  D:\Program Files\PatentHub2\resources\app.asar.unpacked\node_modules\pdf-parse\dist\pdf-parse\cjs\index.cjs
[info] Successfully parsed PDF with pdf-parse 2.x: ..., extracted 14643 characters
```

---

## 四、其他发现

### 文件解析缓存机制

`preprocessFile`（`sessionHelpers.ts`）用 `StorageKeyGenerator.fileUniqKey(file)` 生成文件唯一键，若已解析过则直接返回缓存，不调用 `parseFileLocally` IPC。

**影响**：本地测试时上传同一文件不会触发新的解析，需改名或清除 IndexedDB 缓存才能测试新代码。

### 日志路径

- 开发模式：终端输出 + `C:\Users\{用户}\AppData\Roaming\PatentHub\logs\main.log`
- `file-parser` 模块日志：写入 `main.log`，格式为 `[file-parser] ...`（`log.create({ logId })` 创建的 logger 写入同一文件，logId 作为前缀）

---

## 五、经验总结

### 1. Electron asar + 动态 import 的陷阱

`require()` 经过 Electron 的 asar 拦截，能正确重定向到 `app.asar.unpacked`。但动态 `import()` **不经过** asar 拦截，它基于 `__filename` 解析路径。即使文件在 `asarUnpack` 里，`require()` 加载时 `__filename` 仍可能是 asar 路径，导致动态 import 失败。

**解决方法**：用 `require(真实文件系统路径)` 加载，确保 `__filename` 是真实路径。

### 2. npm 包子路径导出要仔细核查

`pdf-parse/node` 和 `pdf-parse` 是完全不同的导出，功能毫无关联。使用第三方包的子路径前，必须查阅 `package.json` 的 `exports` 字段，确认每个子路径的实际用途。

### 3. "只在我机器上正常"的 bug 往往是偶然的异常触发了正确路径

开发者机器上 `require('pdf-parse/node')` 恰好抛出异常，触发了备用路径，掩盖了真正的 bug。这类问题很难在开发阶段发现，需要在干净环境（其他机器或清空数据后）测试。

### 4. 打包后的模块加载要用多层策略 + 详细日志

单一加载方式在不同环境（开发/安装版/Portable 版）下行为不同。应设计多层降级策略，每层记录详细的成功/失败信息，方便快速定位问题。

### 5. asarUnpack 配置正确但仍需注意加载方式

`electron-builder.yml` 中配置 `asarUnpack` 只保证文件物理上存在于 `app.asar.unpacked`，不保证 `require()` 的 `__filename` 是真实路径。对于内部使用动态 import 的模块，必须用真实路径加载。
