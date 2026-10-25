# Web 端搭档切换无反应 & PDF 预览/解析问题分析开发总结

## 一、任务背景

在将 PatentHub 以 **Web 局域网部署**(`start-web.bat` / `npx serve` 托管 `release/app/dist/renderer`,端口 1212)方式运行时,集中排查并修复了以下问题:

1. **审查搭档(专利搭子)下拉切换「无反应、不执行」** —— 已修复。
2. **PDF 解析「默认是本地还是远端」** 及 **「本机正常、别机失败」** 的根因分析。
3. **PDF 预览在本机也出现「PDF preview data not found」** 的间歇性问题分析。

---

## 二、Web 部署方式(本次操作链路)

### 构建 + 托管

```bash
# 方式一:走官方脚本(结尾的 delete-sourcemaps 会因脚本缺失而失败,不影响产物)
pnpm run build:web

# 方式二:直接构建,避免不可靠的 delete-sourcemaps(推荐,退出码为 0)
pnpm exec cross-env CHATBOX_BUILD_PLATFORM=web electron-vite build

# 托管(监听所有网卡,端口 1212)
npx serve ./release/app/dist/renderer -l tcp://0.0.0.0:1212
```

### 访问地址

| 方式 | 地址 |
|------|------|
| 本机 | `http://localhost:1212/` |
| 局域网其它设备 | `http://192.168.101.5:1212/`(示例) |

### 注意事项

- 构建产物在 `release/app/dist/renderer`,Web 版 `index.html` 含 `<base href="/">`(由 `electron.vite.config.ts` 的 `injectBaseTag` 注入)。
- `build:web` 尾部的 `delete-sourcemaps`(`.erb/scripts/delete-source-maps-runner.js`)文件不存在(实际只有 `delete-source-maps.js`),导致命令以退出码 1 结束,但**不影响产物**,本次已绕过。
- 更换页面时浏览器可能缓存旧 JS,需 **Ctrl+F5** 强刷。

---

## 三、问题一:审查搭档下拉切换「无反应、不执行」—— 已修复 ✅

### 现象

在 Web(尤其局域网 IP 访问)下,点击「我的审查搭档」下拉里的不同搭档(不同提示词),界面无任何反应,不切换提示词、不发消息。

### 根因:`crypto.randomUUID()` 只能在「安全上下文」中使用

定位到 `src/renderer/routes/session/$sessionId.tsx` 的 `handleSelectCopilot` 里,消息 ID 用了浏览器原生 API `crypto.randomUUID()`:

```ts
// 第 668 行
id: systemMsgIndex >= 0 ? newMessages[systemMsgIndex].id : crypto.randomUUID(),
// 第 681 行(创建"你好，xxx！"用户消息,必执行)
id: crypto.randomUUID(),
```

**`crypto.randomUUID()` 是安全上下文专属 API**,仅在以下情况可用:
- HTTPS;
- `http://localhost` / `http://127.0.0.1`(被浏览器视为可信 origin,即使是 HTTP)。

在 **`http://192.168.101.5:1212`(局域网 IP,普通 HTTP)** 下它是 `undefined`,一旦调用即抛 `TypeError: crypto.randomUUID is not a function`。该异常发生在 onClick / setTimeout 异步回调里,被吞掉 → `handleSelectCopilot` 后半段(更新 system prompt、提交用户消息、触发 AI)全部中断 → 界面表现为「无反应」。

### 为什么「正常聊天能发消息、切搭档却不行」

全项目生成消息 ID 的标准方式是用 `uuid` 包的 `uuidv4()`(`src/shared/types.ts:31` 的 `createMessage()`),它纯 JS、任何环境可用;而**只有切搭档这段代码「另类」用了 `crypto.randomUUID()`**,因此唯独在非安全上下文下崩溃。

### 修复(行为等价,不影响 Windows/mac 桌面版)

`uuid` 已是项目运行时依赖(`package.json` → `"uuid": "^9.0.0"`),且 `createMessage()`、`web_platform.ts` 等已在用。改动 `src/renderer/routes/session/$sessionId.tsx`:

| 位置 | 修改前 | 修改后 |
|------|--------|--------|
| 第 6 行(新增导入) | —— | `import { v4 as uuidv4 } from 'uuid'` |
| 第 668 行 | `crypto.randomUUID()` | `uuidv4()` |
| 第 681 行 | `crypto.randomUUID()` | `uuidv4()` |

**结论**:两者都产出 RFC 4122 v4 UUID(小写十六进制、5 段连字符),格式/唯一性完全一致。桌面(Electron)的页面来源为 `file://` 或 `http://localhost`,本来就是安全上下文,所以桌面行为不变;web 版在局域网 IP/HTTP 下得以修复。**零新增依赖、零行为差异、更健壮。**

### 验证

- 构建产物确认:`release/app/dist/renderer/js/_sessionId.*.js` 中已无 `crypto.randomUUID`;剩余 `randomUUID` 命中均为 `uuid` 库内部 `v4()` 实现(优先用 `crypto.randomUUID`、不可用时回退纯 JS,正是期望行为)。
- 在 `http://192.168.101.5:1212` 打开 F12 Console 输入 `typeof crypto.randomUUID` 输出 `"undefined"`,可复现原缺陷。

---

## 四、问题二:PDF 解析「本地 vs 远端」与跨机器失败分析

### 4.1 默认是「本地(local)」,不是远端

`src/renderer/stores/settingsStore.ts:23-26`
```ts
export function getPlatformDefaultDocumentParser(): DocumentParserConfig {
  // All platforms now support local parsing via pdf.js (mobile/web) or pdf-parse (desktop)
  return { type: 'local' }    // ← 默认 local
}
```

- **Web/Mobile 的 `local` = 浏览器内 pdf.js 本地解析**:`sessionHelpers.ts` 在 `case 'local'` 且平台为 web/mobile + PDF 时,调用 `platform.parsePdfWithPdfJs(file)`(`web_platform.ts`),动态加载 `/pdfjs/pdf-bridge.mjs`,用 `getDocument({ data })` 提取文本。
- **PDF 预览(web)**:`$sessionId.tsx` 的 `PDFPreviewPanel` 从 IndexedDB 读 `${storageKey}_pdf_raw` → base64 解码 → `Blob` → `URL.createObjectURL` → iframe 交给浏览器内置 PDF 查看器。**纯本地**。
- **远端是可选**:`chatbox-ai`(Chatbox AI 云解析,需 license/登录)、`mineru`(仅桌面端)。非默认,需在设置中切换。

### 4.2 为什么「本机正常、别人电脑失败」—— 分层的根因

Web 版把所有数据存进**浏览器 IndexedDB(按 origin 隔离)**,且前端把后端地址**硬编码成 `localhost`/`127.0.0.1`**。

| 根因 | 说明 |
|------|------|
| **A. 后端地址硬编码 `localhost`(最主要)** | `remote.ts:96`→`http://localhost:8002`;`:104`→`http://localhost:3002`;`:171` 专利搭子→`http://localhost:3000/api/copilots/list`;模型默认 Ollama `http://127.0.0.1:11434`、LM Studio `http://127.0.0.1:1234`。本机访问 `localhost`=自己 → 可达;同事访问 `192.168.101.5` 时,浏览器里的 `localhost`=同事那台没服务的机器 → 连接被拒 → AI 识别/分析失败。 |
| **B. IndexedDB 按 origin 隔离** | `http://localhost:1212` 与 `http://192.168.101.5:1212` 是两个不同 origin → 两套独立数据库;PDF `_pdf_raw`/文本只存各自浏览器,不跨机器共享(无服务器端存储)。 |
| **C. `npx serve` 是纯静态服务器** | 不代理 `/api/*`,也不设置 CORS;前端跨域调用 `https://api.chatboxai.app` 等真实域名时,若服务端不信任 `192.168.101.5` 这个 origin,预检会被浏览器拦截。 |
| **D. PDF 预览依赖浏览器内置查看器 + pdf.js Worker 的 MIME/环境** | iframe 用 Blob URL;`/pdfjs/pdf.worker.min.mjs` 以 ES Module Worker 加载,若 `serve` 返回 Content-Type 不正确或同事浏览器限制不同,会出现 `PDF解析Worker加载失败`。 |
| **E. 扫描版专利无法本地解析** | pdf.js 只能提取文本层;图片型 PDF 本地解析为空,需走云解析,又回到 A/C 的后端与 CORS 依赖。 |

> **与问题一的关联**:都是「局域网 IP 这个非 localhost origin」带来的差异——一个是「安全上下文(crypto.randomUUID)」,一个是「origin 隔离的 IndexedDB + 硬编码 localhost」。

---

## 五、问题三:PDF 预览「PDF preview data not found」间歇性分析

### 现象

有时能正常显示,有时提示 `PDF preview data not found. Please re-upload the PDF file.`(来自 `$sessionId.tsx:112`)。**时好时坏本身就是最强线索**:它取决于运行时存储状态。

### 报错路径

`$sessionId.tsx` 的 `PDFPreviewPanel`(web 分支):
```ts
const storageKey = pdfFile.storageKey            // :85
const rawBase64 = await storage.getBlob(`${storageKey}_pdf_raw`)   // :102
if (rawBase64) { ...create blob URL... }          // :106
else setError('PDF preview data not found...')    // :112
```
即 `storageKey` 有值,但 IndexedDB 里取不到 `${storageKey}_pdf_raw`。

### 间歇性的三个来源(按概率)

1. **跨 origin**:`localhost` 与 `192.168.101.5` 是两个独立库;在某库上传的 PDF,`_pdf_raw` 只进那个库。换 origin 查看 → 查无此数据。现在「又可以了」,大概率是切回了之前上传过的 origin(通常 `localhost`)或重新上传写入了当前 origin。
2. **缓存命中路径不重写 `_pdf_raw`**:`preprocessFile`(`sessionHelpers.ts:222-252`)命中缓存(文件同名/同大小/同修改时间,`fileUniqKey` 相同)时只复用文本、**不重写 `_pdf_raw`**;且 `writeFileForPreview` 是桌面端专属(web 未实现)。所以「首次上传→写入 raw→正常;再次命中缓存→raw 可能缺失→失败」。
3. **`_pdf_raw` 写入失败被静默吞掉**:`sessionHelpers.ts:289-304` 中 `setBlob(_pdf_raw)` 被 `catch` 仅记日志并继续;若 raw 失败但 pdf.js 解析成功,则**文本有、raw 无** → 预览「not found」,会话/消息却照常创建。

### 存储机制(关键)

`src/renderer/platform/storages.ts:276-278`
```ts
export class IndexedDBStorage implements Storage {
  private store = localforage.createInstance({ name: 'chatboxstore' })
}
```
- **KV(会话、设置、配置)** → `chatboxstore` 实例;
- **Blob(解析文本 `uniqKey`、`_pdf_raw`、`_pdf_pages`、`_pdf_blocks`)** → 全局 localforage(`web_platform.getStoreBlob/setStoreBlob`)。
- 存/取同后端、读写一致;但两者都**按 origin 隔离**。

---

## 六、本次实际改动汇总

| 文件 | 改动 | 状态 |
|------|------|------|
| `src/renderer/routes/session/$sessionId.tsx` | 新增 `import { v4 as uuidv4 } from 'uuid'`(第 6 行);第 668 行、第 681 行 `crypto.randomUUID()` → `uuidv4()` | ✅ 已改并重建 Web、重启服务(端口 1212) |

未改动(仅分析):PDF 解析/预览/跨机器相关代码(`web_platform.ts`、`sessionHelpers.ts`、`remote.ts`、`settingsStore.ts`)。

---

## 七、经验教训 & 后续建议

### 经验教训

1. **跨端公共代码避免用浏览器「安全上下文」专属 API**:如 `crypto.randomUUID`。统一用项目已有的 `uuid` 包(`uuidv4()`),它在 HTTPS / localhost / 局域网 IP 等任何环境下都可用,且已在 `createMessage()`、`web_platform.ts` 中被广泛使用。出现「只在本机/某个地址正常」的 bug,优先怀疑**环境差异**(安全上下文、origin、MIME、CORS)。
2. **Web 版存储是「按 origin 隔离、纯本地」的**:IndexedDB/localStorage 不跨 origin、不跨机器;纯静态 `npx serve` 无服务器存储。任何「数据应在别处可见」的预期都是错的,必须引入后端或明确「各自上传各自存」。
3. **后端地址不要写死 `localhost`**:局域网部署时必须可配置为部署机 IP 或相对路径,否则远端客户端连不上。
4. **写入失败不能被静默吞掉**:PDF raw 写入 `catch` 后仅记日志继续,会造成「文本在、原始字节无」的半成品;应让上传整体报错或单独落库并校验。
5. **缓存命中路径要自洽**:命中缓存时若依赖 `_pdf_raw`,必须保证它也存在(缺失则补写)。

### 后续建议(按性价比)

1. 让后端地址可配置(如基于 `window.location.hostname` 推导,或用配置项),替换硬编码 `localhost`。
2. 为静态服务器加 CORS(或改用带代理的部署/后端),放行局域网 origin。
3. 在 `preprocessFile` 缓存命中分支,若 `_pdf_raw` 缺失则补写;或把 PDF 原始字节内嵌进 message file,避免依赖独立 blob。
4. `setBlob(_pdf_raw)` 失败时要让上传报错,而非静默继续。
5. 若要「同事能看我传的 PDF」,需引入服务器端存储;否则明确每个访问者各自上传、各自浏览器各自存。
6. 顺手修复 `build:web` 结尾缺失的 `.erb/scripts/delete-source-maps-runner.js`(或改指向 `delete-source-maps.js`),消除退出码 1。

---

## 八、涉及文件索引

- `src/renderer/routes/session/$sessionId.tsx`(搭档切换 ID 修复;PDF 预览读取 `_pdf_raw`)
- `src/renderer/stores/settingsStore.ts`(默认解析器 = `local`)
- `src/renderer/stores/sessionHelpers.ts`(PDF 解析/缓存命中/`_pdf_raw` 写入)
- `src/renderer/platform/web_platform.ts`(pdf.js 本地解析/预览 blob 存储)
- `src/renderer/platform/storages.ts`(IndexedDBStorage,`chatboxstore`)
- `src/renderer/packages/remote.ts`(硬编码 `localhost` 后端地址)
- `src/shared/types.ts`(标准 `createMessage()` 用 `uuidv4()`)
- `electron.vite.config.ts`(Web 构建:`injectBaseTag`、端口 1212、`CHATBOX_BUILD_PLATFORM`)
- `start-web.bat` / `start-web.sh` / `doc/PatentHub-Web局域网部署指南.md`(Web 部署)

---

## 九、相关既有文档

- `doc/Web端PDF本地解析与渲染功能开发总结.md`
- `doc/PatentHub-Web局域网部署指南.md`
- `拖拽PDF上传解析失败修复经验总结.md`
- `审查搭档V1提示词替换开发总结.md`
- `搭档选择器位置优化经验总结.md`

---

**归档时间**:本次会话
**涉及平台**:Web(局域网部署);不影响 Windows/mac 桌面版

