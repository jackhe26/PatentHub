# MinerU 服务商 v9.0 整合开发总结

> **版本**：v7.12  
> **日期**：2026-06-20  
> **类型**：PDF 转换服务商扩展  
> **影响范围**：`src/main/pdf-convert/`、`src/shared/`、`src/renderer/components/pdf-tools/PDFConvertTab.tsx`

---

## 一、需求背景

PDF 转换模块已经接入 **MinerU** 服务商，可以将扫描/图片型 PDF 通过 OCR 解析为可复制的文本，并通过 HTML 预览展示。但用户希望 **一次得到 Office 格式的最终产物**（Word 文档 + HTML 文件），而不是仅停留在"预览"层面。

MinerU 官方 API 实际上提供两种**额外格式导出**能力（`extra_formats` 参数）：

| 格式 | 描述 | 适用场景 |
|------|------|---------|
| `docx` | Microsoft Word 文档 | 可编辑、可批注、可发送 |
| `html` | 静态 HTML 网页 | 浏览器查看、邮件分享 |
| `latex` | LaTeX 排版源码 | 学术论文二次排版 |

我们将这种"扫描 PDF → Office 文档"的能力命名为 **MinerU-Office**，作为新的服务商加入。

---

## 二、API 关键发现

通过精读官方 `MinerU Open API 文档.pdf`，发现：

### 2.1 同 API 不同参数

MinerU-Office **不是**新的 API 端点，**仍然是**：
```
POST https://mineru.net/api/v4/file-urls/batch
GET  https://mineru.net/api/v4/extract-results/batch/{batch_id}
```

**唯一差异**：提交任务时增加 `extra_formats` 参数：

```json
{
  "files": [{ "name": "demo.pdf", "data_id": "xxx" }],
  "model_version": "vlm",
  "enable_formula": true,
  "enable_table": true,
  "extra_formats": ["docx", "html"]   // ★ 关键
}
```

### 2.2 ZIP 内容增强

启用 `extra_formats` 后，下载的 ZIP 在原有基础上**额外包含**：

```
{原文件名}.zip
├── {原文件名}.md                  # Markdown
├── {原文件名}_content_list.json  # JSON 布局
├── {原文件名}_content_list_v2.json
├── {原文件名}.docx               # ★ 新增
├── {原文件名}.html               # ★ 新增
└── images/                        # 图片资源
```

### 2.3 ZIP 命名规范

MinerU 返回的 ZIP 内，docx/html 文件名与原 PDF 同名（仅后缀不同），因此在 ZIP 内用 `entryName.toLowerCase().endsWith('.docx')` 即可稳定匹配。

---

## 三、架构设计

### 3.1 注册表架构（零侵入扩展）

项目已有 `src/main/pdf-convert/` 模块采用**注册表（Registry）模式**：

```
Converter 接口（types.ts）
    ├── MineruConverter（已有）    id: 'mineru'
    └── MineruOfficeConverter（新增） id: 'mineru-office'
            ↓
    registry.ts 统一管理
            ↓
    IPC 根据 service id 路由
            ↓
    前端下拉框渲染（PDF_CONVERT_SERVICES）
```

新增服务商**只需 4 处改动**：

| 改动点 | 文件 | 内容 |
|--------|------|------|
| 服务元数据 | `src/shared/pdf-convert-services.ts` | 新增 `mineru-office` 描述项 |
| 类型扩展 | `src/main/pdf-convert/types.ts` | `ConvertResult` 增加 `outputDocxPath?` / `outputHtmlPath?` |
| Converter 实现 | `src/main/pdf-convert/mineru-office-converter.ts` | 复用 MinerU，下载后多一步 ZIP 内 docx/html 提取 |
| 注册 & 设置 | `registry.ts` / `settings.ts` | 数组头部插入 + 配置槽位 |

### 3.2 数据流图

```
[用户] 选择 PDF + 选 MinerU-Office + 填 API Key
                ↓
[前端] window.electronAPI.convertPDF({ service: 'mineru-office', ... })
                ↓
[IPC] pdf-convert:convert → getConverter('mineru-office')
                ↓
[MineruOfficeConverter.convert()]
  ① getUploadUrl (POST /file-urls/batch + extra_formats:["docx","html"])
  ② uploadFile (PUT file)
  ③ pollResult (GET /extract-results/batch/{id}, 10s 一次, 最多 30 次)
  ④ downloadZip (保存到原 PDF 同目录 _mineru-office_{ts}.zip)
  ⑤ extractOfficeFiles (★ 新增: 从 ZIP 提 docx/html/md, 保存为 _office_{ts}.docx/html)
                ↓
[返回] { outputPath, debugZipPath, outputDocxPath, outputHtmlPath, markdown }
                ↓
[前端] 状态更新 + 显示 [打开 Word] [保存 docx] [打开 HTML] [保存 HTML] 4 个按钮
```

---

## 四、关键实现

### 4.1 核心：`extractOfficeFiles()`

```typescript
private async extractOfficeFiles(zipPath, originalPdfPath, onProgress) {
  const zip = new AdmZip(zipPath)
  const entries = zip.getEntries()

  // 1. 找 docx
  const docxEntry = entries.find(e =>
    e.entryName.toLowerCase().endsWith('.docx') && !e.isDirectory
  )
  if (docxEntry) {
    const docxPath = generateOfficePath(originalPdfPath, 'docx')
    await fs.promises.writeFile(docxPath, docxEntry.getData())
    outputDocxPath = docxPath
  }

  // 2. 找 html
  const htmlEntry = entries.find(e =>
    e.entryName.toLowerCase().endsWith('.html') && !e.isDirectory
  )
  if (htmlEntry) {
    const htmlPath = generateOfficePath(originalPdfPath, 'html')
    await fs.promises.writeFile(htmlPath, htmlEntry.getData().toString('utf-8'), 'utf-8')
    outputHtmlPath = htmlPath
  }

  // 3. 读 markdown (沿用 MinerU 逻辑)
  // ...
}
```

**要点**：
- 用 `toLowerCase().endsWith('.docx')` 而非 `endsWith('.docx')`——防止 ZIP 内有 `FILE.DOCX` 大写
- `!e.isDirectory` 过滤目录项（防止有奇怪的 `xxx.docx/` 目录）
- 提取失败不抛错（让主流程继续，至少 ZIP 还在）

### 4.2 文件命名规范

| 文件 | 命名格式 | 示例 |
|------|---------|------|
| ZIP 调试包 | `{baseName}_mineru-office_{ts}.zip` | `WOSA_PCT_mineru-office_20260620_223045.zip` |
| DOCX | `{baseName}_office_{ts}.docx` | `WOSA_PCT_office_20260620_223045.docx` |
| HTML | `{baseName}_office_{ts}.html` | `WOSA_PCT_office_20260620_223045.html` |

时间戳格式 `YYYYMMDD_HHmmss`，避免覆盖。

### 4.3 UI 按钮分组

底部按钮区用**竖线分隔**把 PDF 操作和 Office 输出明确分组：

```
[在新窗口打开] [保存为新文件]   [HTML 预览 (秒开)] [导出为 PDF] [保存 HTML 文件]   |   [打开 Word] [保存 docx] [打开 HTML] [保存 HTML]
 ──────────────── PDF 区 ───────────────────────   ─── 分隔 ───  ─────────────── Office 区 ──────────────
```

颜色编码：
- **PDF 操作**：浅色（light variant）
- **HTML 预览**：紫色填充（grape，f主推）
- **Office 输出**：靛蓝（indigo，docx）+ 蓝绿（teal，html）

### 4.4 默认选项策略

按用户要求，**MinerU-Office 作为默认第一项**，原 MinerU 退居第二：

```typescript
export const PDF_CONVERT_SERVICES = [
  { id: 'mineru-office', displayName: 'MinerU-Office', ... },  // ★ 默认
  { id: 'mineru',        displayName: 'MinerU',        ... },
]
```

UI 初始 `serviceId = 'mineru-office'`，让新用户体验时直接感受到 Office 输出能力。

---

## 五、改动文件清单

| # | 文件 | 改动类型 | 关键行数 |
|---|------|---------|---------|
| 1 | `src/main/pdf-convert/types.ts` | 改 | +10 |
| 2 | `src/shared/pdf-convert-services.ts` | 改 | +5 |
| 3 | `src/main/pdf-convert/mineru-office-converter.ts` | **新建** | ~280 |
| 4 | `src/main/pdf-convert/registry.ts` | 改 | +2 |
| 5 | `src/main/pdf-convert/settings.ts` | 改 | +4 |
| 6 | `src/main/pdf-convert/ipc-handlers.ts` | 改 | +4 |
| 7 | `src/shared/electron-types.ts` | 改 | +10 |
| 8 | `src/renderer/components/pdf-tools/PDFConvertTab.tsx` | 改 | +120 |
| 9 | `doc/MinerU-Office服务商接入开发总结.md` | **新建** | （本文档） |

**总改动**：8 个文件改动 + 2 个新文件，净增约 +440 行代码。

---

## 六、关键设计决策回顾

1. **复用同一 API Key 输入框**——同源 API，用户无需额外配置
2. **默认 MinerU-Office**——按用户要求，提升新功能曝光
3. **HTML 预览沿用 `rebuildHtml()`**——绝对定位 + base64 图片，体验一致
4. **`extra_formats` 不暴露 UI**——避免 UI 复杂度，默认 `["docx","html"]` 覆盖 90% 场景
5. **200MB 文件大小限制**——与 MinerU 精准解析 API 上限对齐

---

## 七、遇到的问题与解决

### 7.1 `tableAsHtml` 预存在 TS 错误

`src/main/pdf-convert/ipc-handlers.ts` 中调用 `rebuildHtml(..., { tableAsHtml: true, layoutMode: 'absolute' })` 报了类型错误，因为 `HtmlRebuildOptions` 接口里没有这俩字段。

**解决**：本次不修复（属于预存在的代码），后续单独 PR。

### 7.2 `@electron/remote` 引入失败

最初想在 `handleSaveDocxAs` 里调 Electron `dialog.showSaveDialog`，但 React 渲染进程不直接持有 `dialog`，需要走 IPC 或 `@electron/remote`。

**解决**：复用现有 `pdf:export` IPC（后端会按后缀名识别），不再引入新依赖。

### 7.3 PDF 后端后缀名识别

`pdf:export` handler 原本只支持 `.pdf`，扩展到任意后缀需要后端配合。实测发现传 `.docx` / `.html` 后端会报错。

**解决**：当前 toast 提示文件已存于原 PDF 同目录，引导用户手动前往。后续可扩展 `pdf:export` 支持任意后缀（独立 PR）。

---

## 八、验证清单

| # | 验证项 | 方式 | 状态 |
|---|--------|------|------|
| 1 | 默认下拉框选中 MinerU-Office | 启动应用观察 | ✅ |
| 2 | 测试连接按钮可用 | 输入合法 Token 点击 | ✅ |
| 3 | 转换后产出 ZIP + docx + html | 选扫描 PDF → 转换 → 检查输出目录 | ✅ |
| 4 | 切换回 MinerU 仍可用 | 下拉切换 → 转换 → 仅产出 ZIP | ✅ |
| 5 | API Key 记忆隔离 | 切服务商，Key 不串 | ✅ |
| 6 | 「打开 Word」调系统 Word/WPS | 点击按钮 | ✅（走 `openLink`） |
| 7 | 「保存 docx」调用 pdf:export | 点击按钮 | ⚠️ 后端暂不支持非 PDF 导出（fallback: 提示文件位置） |
| 8 | HTML 预览仍可用 | 点击「HTML 预览 (秒开)」 | ✅ |

---

## 九、后续可优化项

1. **后端 `pdf:export` 扩展**：支持任意后缀名（docx/html/pptx 等）复制
2. **MinerU-Office 配置项**：`extra_formats` 暴露为多选框（docx/html/latex），按需勾选
3. **HTML 预览源切换**：允许用户在 `rebuildHtml` 输出和 MinerU 原始 HTML 间切换
4. **LaTeX 导出**：用同一机制支持 `extra_formats: ["latex"]`，给学术场景
5. **进度条细分**：OCR 完成 → docx 生成 → html 生成 三个阶段独立进度

---

## 十、参考文档

- **MinerU 官方 API 文档**（已提供 PDF）：
  - 精准解析 API：`/api/v4/extract/task` & `/api/v4/file-urls/batch`
  - 关键参数：`model_version`、`extra_formats`、`is_ocr`、`enable_formula`
  - 限流：每账号每天 1000 页最高优先级
- **相关已有文档**：
  - `doc/扫描版PDF解析与HTML渲染功能开发总结.md`：HTML 预览实现细节
  - `doc/PDF-Markdown重建功能开发总结.md`：Markdown 重建流程
- **代码索引**：
  - `src/main/pdf-convert/types.ts`：Converter 接口
  - `src/main/pdf-convert/registry.ts`：注册表
  - `src/shared/pdf-convert-services.ts`：前端下拉元数据
