# 拖拽 PDF 上传解析失败修复经验总结

## 📅 开发日期
2026/9/5

## 🎯 需求背景

在会话页面（Session）输入框中，用户通过两种方式上传 PDF 文件：
1. **控件上传**（`<input type="file">`）—— ✅ 本地解析正常
2. **拖拽上传**（Drag & Drop）—— ❌ 本地解析失败

用户反馈的目标：让 **拖拽上传** 与 **控件上传** 行为一致，能正常本地解析并在 PDF 预览面板正常显示。

---

## 📋 反馈问题梳理

| 阶段 | 反馈问题 |
|------|----------|
| 首轮 | 拖拽 PDF 到输入框 → 本地解析失败（但控件上传正常） |
| 次轮 | 拖拽一个**之前已上传过**的 PDF（如 `10CN115881145A.PDF`）→ PDF 预览面板显示"未能加载 PDF 文档" |
| 附带 | 文件名含**空格/中文**的 PDF 拖拽后 preview 可能失败 |
| 附加 | 用户关切：升级 Electron 是否影响代码/功能/系统版本兼容 |

> 说明：这是典型的"**同一功能，两种入口行为不一致**"问题。反馈虽简单，但根因藏在 Electron 对两种入口的 File 对象处理差异上。

---

## 🔍 根因分析（深入）

### 根因一：Electron 中 File.path 的注入差异（首轮）

Electron 对 `File` 对象做了非标准扩展，但只对**部分入口**注入 `file.path`：

| 上传方式 | `File.path` 属性 | 说明 |
|---------|-----------------|------|
| `<input type="file">` 控件 | ✅ 有值（真实磁盘路径） | Electron 在 WebKit 层自动注入 |
| `DataTransfer.files` 拖拽 | ❌ `undefined` | 出于安全考虑，不自动注入 |
| 粘贴长文本生成的 File | ❌ `undefined` | 无真实磁盘文件 |

**问题代码**（`src/renderer/platform/desktop_platform.ts`）：

```typescript
async parseFileLocally(file: File) {
  if (!file.path) {
    // 拖拽/粘贴文件走这里：只支持纯文本
    result = await parseTextFileLocally(file)   // ← 对 PDF 二进制会失败
  } else {
    // 控件上传走这里：用真实路径解析
    const resultJSON = await this.ipc.invoke('parseFileLocally', JSON.stringify({ filePath: file.path }))
    ...
  }
}
```

拖拽 PDF 时 `file.path === undefined`，误入只支持文本的 `parseTextFileLocally` 分支，对 PDF 二进制解析失败。

> ⚠️ 项目当前 Electron 版本：`^26.6.10`。**即便在 Electron 26，这种差异也存在**。官方用 `webUtils.getPathForFile()` 取代了 `File.path`（具体引入版本以 Electron 官方文档为准）。

### 根因二：缓存命中（cache hit）分支漏改（次轮）

首轮修复只处理了"拖拽**首次**文件"（走 `parseFileByContent` 生成临时文件），但**漏掉了缓存命中分支**。

`src/renderer/stores/sessionHelpers.ts` 的 `preprocessFile`：

```typescript
const existingContent = await storage.getBlob(uniqKey).catch(() => null)
if (existingContent) {
  return {
    file,
    content: existingContent,
    storageKey: uniqKey,
    filePath,   // ← 问题：这里是 (file as any).path = undefined（拖拽无路径）
    ...
  }
}
```

**触发链路**：
1. 用户之前用控件上传过 `10CN...PDF` → 命中缓存（uniqKey 基于 `name + size + lastModified`）
2. 拖拽**同一文件** → 命中缓存 → 进入 cache hit 分支
3. 返回 `filePath = undefined`、`storageKey = uniqKey`
4. PDF 预览面板 `$sessionId.tsx`：
   - `if (filePath)` → false（undefined，跳过 file://）
   - 走到 `storage.getBlob(storageKey)` → 得到的是**解析后的文本内容**（给 AI 用），**不是 PDF 原始二进制** → 构造 PDF blob 失败
5. 结果：**"未能加载 PDF 文档"** ✓

**日志佐证**：运行日志里 `10CN115881145A.PDF` 无任何 `parseFile` 记录、也未生成临时文件 → 证实命中缓存。

### 根因三：file:// URL 未编码（附带）

临时文件路径 `path.basename(payload.name)` 保留了原始文件名（含空格/中文）。构造 `file:///${filePath.replace(/\\/g, '/')}` 时**未做 URL 编码**，空格/中文会导致 Chromium 截断或解析失败。

---

## 🛠 解决方案

### 首轮修复（临时文件 + IPC）

**思路**：拖拽文件没有真实路径，把其字节写入系统临时目录生成临时文件，再复用现有本地解析（`parseFile`）。

| 文件 | 改动 |
|------|------|
| `src/main/main.ts` | 新增 `parseFileByContent` IPC（写临时文件 → `parseFile` 解析 → 返回 `tempPath`）；新增 `cleanupTempUploads()` 启动时清理 >24h 临时文件 |
| `src/renderer/platform/interfaces.ts` | `parseFileLocally` 返回值增加 `tempPath?: string` |
| `src/renderer/platform/desktop_platform.ts` | `!file.path` 分支改为：读 `file.arrayBuffer()` → IPC `parseFileByContent` → 返回 `tempPath` |
| `src/renderer/stores/sessionHelpers.ts` | `parseFileWithLocalParser` 透传 `tempPath`；成功分支 `filePath: filePath || result.tempPath` |

### 次轮修复（缓存命中分支 + URL 编码）

| 文件 | 改动 |
|------|------|
| `src/main/main.ts` | 新增 `writeFileForPreview` IPC（只写临时文件、不重新解析，返回 `tempPath`） |
| `src/renderer/platform/interfaces.ts` | `Platform` 接口新增 `writeFileForPreview?(file): Promise<string \| undefined>` |
| `src/renderer/platform/desktop_platform.ts` | 新增 `writeFileForPreview(file)` 方法 |
| `src/renderer/stores/sessionHelpers.ts` | **cache hit 分支**：无真实路径时调用 `platform.writeFileForPreview(file)` 生成临时路径作为 `filePath` |
| `src/renderer/routes/session/$sessionId.tsx` | `file://` URL 用 `encodeURI` 编码 |

---

## 📁 修改文件总览

| 文件 | 改动性质 |
|------|---------|
| `src/main/main.ts` | 新增 2 个 IPC handler + 清理函数 + `fs` 导入 |
| `src/renderer/platform/interfaces.ts` | 接口扩展（`tempPath`、`writeFileForPreview`） |
| `src/renderer/platform/desktop_platform.ts` | `parseFileLocally` 改造 + 新增 `writeFileForPreview` |
| `src/renderer/stores/sessionHelpers.ts` | cache hit / 成功分支 `filePath` 兜底 |
| `src/renderer/routes/session/$sessionId.tsx` | `file://` URL `encodeURI` |

> 全程**未升级 Electron**，保持 `^26.6.10`，兼容性无影响。

---

## ✅ 验证结果

- ✅ 拖拽**首次** PDF → 解析成功（临时文件路径）
- ✅ 拖拽**已缓存过**的 PDF（如 `10CN...PDF`）→ **预览正常**（次轮修复目标）
- ✅ 拖拽文件名**含空格/中文**的 PDF → 预览正常（已加 URL 编码）
- ✅ 控件上传 PDF → 保持正常
- ✅ TypeScript 类型检查：本次修改的文件无新增类型错误（`$sessionId.tsx` 仅有的 2 个错误为项目原有 pre-existing）

---

## 🔑 关键知识点 / 经验教训

### 1. Electron 多入口的 File 对象不一致
- 控件、拖拽、粘贴三种方式得到的 `File` 对象，其 `file.path` / 来源不同。
- **教训**：涉及文件上传功能时，必须考虑所有入口，统一抽象"拿到真实路径或字节"的能力，**不要假设 `file.path` 永远存在**。

### 2. catch 分支、失败分支、缓存分支"三漏"
- 修 bug 时**只改了主路径**（成功解析分支），却漏了 **cache hit、catch、边缘分支**。
- **教训**：修复某个判断/分支后，要**穷举同一函数内所有相关 return 路径**（成功、缓存、catch、早退），逐一核对。

### 3. 缓存命中的副作用
- `uniqKey` 基于文件名等元数据。**同文件跨入口上传会命中同一个缓存**。
- **教训**：若缓存的是"解析后的文本"，而某些功能（如 PDF 预览）需要"原始二进制/真实路径"，缓存命中时会丢失原始信息。需要为预览场景单独保留/兜底原始数据。

### 4. file:// URL 编码
- Windows 路径 + `file://` 必须有正确的分隔符转换（`\` → `/`）和 **URL 编码**（`encodeURI`），否则空格/中文/特殊字符导致加载失败。

### 5. 日志是定位"是否命中分支"的关键
- 通过比对运行日志中是否有对应文件的 `parseFile` 记录，能快速判断是"走了解析"还是"命中缓存"。**善用日志验证假设**。

---

## 🔄 Electron 兼容性考量（回应用户关切）

| 维度 | Electron 26（当前） | 升级到 30+ |
|------|---------------------|-----------|
| Windows 最低 | Win10 1809 / Win11 | Win10 1809 / Win11（无影响） |
| macOS 最低 | macOS 10.15 | macOS 11（会排除 10.15 用户） |
| Linux | glibc 2.28+ | glibc 2.28+（无影响） |
| `File.path` | 控件注入 | 官方已改用 `webUtils.getPathForFile` 取代 |
| `webUtils.getPathForFile` | ❌ | ✅ 官方推荐 |

**结论**：
- 本次修复**不升级** Electron，兼容性零风险。
- **长期建议**在独立分支升级到 Electron 30+，并迁移到 `webUtils.getPathForFile()`，届时可移除临时文件机制。升级需注意：原生模块（`libsql`/`@napi-rs/canvas` 等）需 `electron-rebuild`，macOS 10.15 用户需评估。

---

## 🧪 二轮扩展：`.doc` 文件解析失败 与 拖拽 accept 不一致

### 需求背景
在测试 `.doc` 文件上传时发现两个独立问题：
1. **点击上传 `.doc` → 解析失败**（附件卡片显示红色错误）
2. **拖拽 `.doc` → 提示"不支持文件类型"**（被 dropzone 直接拒绝）

### 根因分析

#### 根因 A：拖拽 accept 与点击上传不一致（问题 2）
- **点击上传**（`InputBox.tsx:1031`）用 `accept={getFileAcceptString()}`
- **拖拽上传**（`InputBox.tsx:811`）用 `useDropzone({ accept: getFileAcceptConfig() })`
- 两者来源不同：
  - `getFileAcceptString()` = `[...allSupportedExts, '.numbers']`（完整，**含 `.doc`**）
  - `getFileAcceptConfig()` 为**手工枚举**，office 部分只写了 `.docx/.pptx/.xlsx/.odt/.odp/.ods`，**漏了 `.doc/.xls/.ppt/.wps/.et/.dps`**
- React-Dropzone 对 accept 中 `.ext` 项**按文件后缀硬校验**，`.doc` 不在 accept → 拖拽被拒（"不支持文件类型"）
- **核心**：这两处 accept 配置不一致，导致"**点击能传、拖拽被拒**"。

#### 根因 B：`.doc` 解析失败（问题 1）—— 文件本身是"伪 doc"
- 读取 `03CN...doc` 文件头：`EF BB BF 3C 68 74 6D 6C ...`（UTF-8 BOM + `<html`）
- **结论**：该 `.doc` 实际是 **HTML 网页**（Word"另存为网页"格式），只是扩展名改成了 `.doc`
- `parseFile` 按扩展名 `.doc` → 走 `isOle2DocFile` → `word-extractor`，而 word-extractor 只认 OLE2 复合文档，遇到 HTML 抛 `"Unable to read this type of file"`
- **本质**：解析器按扩展名而非内容分派，无法识别"伪 doc"。

### 解决对策

#### 方案：拖拽 accept 与点击上传自动对齐（修复问题 2）
修改 `src/shared/file-extensions.ts → getFileAcceptConfig()`：
- 保留原有 MIME 分类
- 函数末尾自动补齐 `allSupportedExts + '.numbers'` 中缺失的扩展名到 `application/octet-stream` 兜底
- 使拖拽 accept 覆盖的扩展名集合 == `getFileAcceptString()`，拖拽与点击上传支持格式 100% 一致

```typescript
const existing = new Set<string>()
for (const exts of Object.values(config)) for (const e of exts) existing.add(e)
const allExts = [...allSupportedExts, '.numbers']
const missing = allExts.filter((e) => !existing.has(e))
if (missing.length > 0) {
  config['application/octet-stream'] = [...(config['application/octet-stream'] || []), ...missing]
}
return config
```

#### 问题 1：用户确认不处理
该 `.doc` 是 HTML 伪格式（文件本身问题，非代码 bug）。可选优化：在 `parseOle2DocFile` 前做**内容格式探测**（识别 HTML/RTF/OOXML 改名），但那属于"鲁棒性增强"，非本次范围。

### 修改文件
- `src/shared/file-extensions.ts`（`getFileAcceptConfig` 自动补齐）

### 验证结果
- ✅ 拖拽 `.doc/.xls/.ppt/.wps/.et/.dps` 不再被拒（与点击一致）
- ✅ `.docx/.pptx/.xlsx/.pdf` 等保持正常
- ✅ 拖拽任意 `allSupportedExts + '.numbers'` 格式均被接受

### 新增经验教训
#### 6. accept 配置多入口不一致
- 同一功能的多个入口（点击/拖拽）若用**不同的 accept 来源**（`getFileAcceptString` vs `getFileAcceptConfig`），会导致"点击能传、拖拽被拒"。
- **教训**：文件上传支持格式应**统一收敛**到一个来源（如 `allSupportedExts`），避免手工枚举遗漏。

#### 7. 按扩展名分派 vs 按内容分派
- 解析器按扩展名走对应解析，但实际文件内容可能不符（"伪 doc"实为 HTML）。`word-extractor` 按扩展名被调却读不了 HTML。
- **教训**：对二进制/容器格式（doc/xls/ppt），解析前最好做**文件头魔数探测**，按真实格式分派（OLE2/OOXML/HTML/RTF）。

#### 8. 文件头魔数是判断真实格式的利器
- `D0 CF 11 E0`=OLE2、`PK\x03\x04`=OOXML(zip)、`{\rtf`=RTF、`<html`/`EF BB BF 3C`=HTML(UTF-8)。
- 快速读前 8 字节即可判断，避免被扩展名误导。

### 本项目支持解析的文件类型（支撑）
- **Office**：`.pdf .docx .pptx .xlsx .odt .odp .ods .doc .xls .ppt .wps .et .dps`
- **文本/代码**：90+ 种（`.txt .md .json .py .java` 等）
- **EPUB**：`.epub`；**图片**：`.jpg .jpeg .png`；**Numbers**：`.numbers`
- **知识库**：`LocalParser` 不支持旧版 `.doc/.xls/.ppt`（提示转 OOXML 或切 Chatbox AI）
- **不支持**：iWork(pages/key)、音视频、二进制、压缩包、高级图片(psd/heic 等)

---

## 📌 相关文件

- `src/main/main.ts`
- `src/renderer/platform/interfaces.ts`
- `src/renderer/platform/desktop_platform.ts`
- `src/renderer/stores/sessionHelpers.ts`
- `src/renderer/routes/session/$sessionId.tsx`
- `src/shared/file-extensions.ts`
