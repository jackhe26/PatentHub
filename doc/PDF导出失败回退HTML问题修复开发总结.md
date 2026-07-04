# PDF 导出失败回退 HTML 问题修复开发总结

> 日期：2026-06-27  
> 问题类型：Electron IPC 调用链缺陷 + 空 catch 静默吞错  
> 影响范围：桌面端（Desktop）聊天导出 PDF 功能

---

## 一、问题现象

用户在桌面端导出 PDF 时，系统没有弹出 PDF 保存对话框，而是直接回退并弹出了 `.html` 文件的保存框，给用户造成了"PDF 导出失败"的错觉。

---

## 二、诊断过程

### 2.1 调用链梳理

```
渲染层: src/renderer/stores/sessionHelpers.ts (627–650)
    ↓ 调用 ipcRenderer.invoke('export:html-to-pdf', { html, format: 'A4' })
主进程: src/main/pdf-convert/ipc-handlers.ts (391–445) 生成 PDF 到临时目录
    ↓ 返回 { success: true, path: '/tmp/.../patenthub-chat-export-xxx.pdf' }
渲染层: await electronAPI.invoke('shell:openPath', res.path)  ★ 故障点
    ↓ throw Error: No handler registered for 'shell:openPath'
    ↓ 被空的 catch {} 捕获
渲染层: platform.exporter.exportTextFile(`${cleanName}.html`, html) ← 回退 HTML
```

### 2.2 根因分析（按确定性排序）

#### 根因 1（确定）：`shell:openPath` IPC 通道未注册

- 全代码库搜索发现 `shell:openPath` **仅在渲染层有一处调用**，**主进程没有任何 `ipcMain.handle('shell:openPath', ...)` 的注册**。
- 主进程实际注册的是 `ipcMain.handle('openLink', ...)`（`src/main/main.ts`），内部使用 `shell.openExternal` 打开外部链接。
- 因此 `invoke('shell:openPath', res.path)` 必然 reject，错误信息为 `Error: No handler registered for 'shell:openPath'`。

> **关键结论**：PDF 本身**已经成功生成**到了临时目录（`os.tmpdir()`），只是"打开它"这一步失败了，用户完全看不到 PDF，反而被误导成"PDF 导出失败"。

#### 根因 2（设计缺陷）：PDF 仅写入临时目录，从不弹"另存为"

- `export:html-to-pdf` 在不传 `outputPath` 时默认输出到 `os.tmpdir()`。
- 这与 HTML 导出体验不一致（HTML 走的是 `platform.exporter.exportTextFile`，会弹出系统保存对话框）。
- 即使用户通过某种方式拿到了临时目录的 PDF，也不符合"导出到指定位置"的预期。

#### 根因 3（隐患）：空 `catch {}` 无日志

```ts
} catch {
  // 没有任何日志，无法诊断
  platform.exporter.exportTextFile(`${cleanName}.html`, html)
}
```

任何真实的渲染失败都会被静默吞掉，开发者无法从日志中区分是"打开失败"还是"渲染失败"。

---

## 三、解决方案

采用**两步走策略**：先修通"能正常导出 PDF"，再优化"导出到用户选择的位置"。

### 3.1 方案设计

放弃原有的「生成到临时目录 + 调用缺失的 shell:openPath」组合，改为：

```
渲染层调用 export:save-pdf
    ↓
主进程渲染 PDF buffer（复用现有逻辑）
    ↓
弹 dialog.showSaveDialog 让用户选位置
    ↓
写入用户选择的路径
    ↓
返回 { success } 或 { canceled } 或 { error }
```

### 3.2 改动详情

#### 改动 1：主进程新增 `export:save-pdf` IPC Handler

**文件**：`src/main/pdf-convert/ipc-handlers.ts`

新增 `ipcMain.handle('export:save-pdf', ...)`，逻辑如下：

1. 接收 `{ html, suggestedName, format }`；
2. 写 HTML 到临时文件（绕过 data URL 2MB 限制，允许 JS 加载 KaTeX CDN）；
3. 创建隐藏 `BrowserWindow`，`loadFile` 后调用 `printToPDF` 生成 buffer；
4. **关闭隐藏窗口**（提前释放资源，避免对话框被遮挡）；
5. 调用 `dialog.showSaveDialog`：
   - `title`: "保存 PDF 文件"
   - `defaultPath`: `${suggestedName}.pdf`
   - `filters`: PDF 文件过滤
6. 用户取消 → 返回 `{ success: false, canceled: true }`；
7. 用户确认 → `fs.promises.writeFile` 写入所选路径 → 返回 `{ success: true, path, size }`；
8. 异常 → 返回 `{ success: false, error: message }` 并 `console.error`。

```ts
// 核心代码片段
const saveResult = await dialog.showSaveDialog({
  title: '保存 PDF 文件',
  defaultPath: suggestedName.endsWith('.pdf') ? suggestedName : `${suggestedName}.pdf`,
  filters: [{ name: 'PDF', extensions: ['pdf'] }],
})

if (saveResult.canceled || !saveResult.filePath) {
  return { success: false, canceled: true }
}

await fs.promises.writeFile(saveResult.filePath, new Uint8Array(pdfBuffer))
```

#### 改动 2：渲染层改用新通道并修复 catch 逻辑

**文件**：`src/renderer/stores/sessionHelpers.ts`

```ts
} else if (format === 'PDF') {
  const html = await formatChatAsPdf(session.name, threads)
  if (platform.type === 'desktop' && (window as any).electronAPI) {
    try {
      const res = await electronAPI.invoke('export:save-pdf', {
        html,
        suggestedName: cleanName,
        format: 'A4',
      })
      if (res?.success) return         // 成功，已保存到用户选择的位置
      if (res?.canceled) return        // 用户取消，不应回退 HTML
      throw new Error(res?.error || 'PDF 导出失败')
    } catch (e) {
      console.error('[ExportChat] PDF 导出失败，回退 HTML:', e)  // ★ 记录日志
      platform.exporter.exportTextFile(`${cleanName}.html`, html)
    }
  } else {
    platform.exporter.exportTextFile(`${cleanName}.html`, html)
  }
}
```

关键修复点：

| 修复点 | 修复前 | 修复后 |
|---|---|---|
| IPC 通道 | `export:html-to-pdf` + 缺失的 `shell:openPath` | `export:save-pdf`（自带保存对话框） |
| 用户取消 | 误弹 HTML | 静默结束，不回退 |
| 异常日志 | 空 `catch {}`，完全无日志 | `console.error` 记录详细错误 |
| 文件位置 | 临时目录（用户找不到） | 用户自己选择的位置 |

---

## 四、关键经验与最佳实践

### 4.1 IPC 通道必须成对出现

**规则**：渲染层每有一个 `invoke('channel-name')`，主进程必须有一个对应的 `ipcMain.handle('channel-name', ...)`。

**验证方法**：
```bash
# 搜索渲染层调用
grep -rn "invoke('shell:openPath'" src/renderer/

# 搜索主进程注册
grep -rn "ipcMain.handle('shell:openPath'" src/main/
```

如果渲染层有调用而主进程无注册，**编译不会报错，运行时才抛错**，极易被 `catch` 吞掉。

### 4.2 绝不用空的 `catch {}`

**反模式**：
```ts
try {
  // 某些操作
} catch {
  // 什么都不做
}
```

**正确做法**：
```ts
try {
  // 某些操作
} catch (e) {
  console.error('[ModuleName] 操作失败:', e)
  // 再执行降级逻辑
}
```

空 `catch` 会让异步错误完全不可见，调试时极其痛苦。

### 4.3 区分"用户取消"和"系统错误"

在涉及对话框的操作中，**取消是用户的主动选择，不是错误**，不应触发降级逻辑。

```ts
if (res?.canceled) return        // 正常结束
if (res?.error) throw new Error(res.error)   // 这才是错误
```

### 4.4 隐藏窗口记得提前释放

在主进程弹 `dialog.showSaveDialog` 前，应先关闭隐藏的 `BrowserWindow`：

```ts
if (win && !win.isDestroyed()) {
  win.close()
  win = null
}
// 再弹对话框
const result = await dialog.showSaveDialog(...)
```

否则在某些操作系统上，对话框可能被隐藏窗口遮挡或层级异常。

### 4.5 文件导出应遵循平台惯例

- **HTML/Markdown/TXT**：直接弹保存对话框（`platform.exporter.exportTextFile` 或 `dialog.showSaveDialog`）。
- **PDF**：同样应弹保存对话框，让用户选择位置；**不应**偷偷写入临时目录再尝试打开。

---

## 五、相关文件变更

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `src/main/pdf-convert/ipc-handlers.ts` | 新增 | 新增 `export:save-pdf` IPC handler，约 67 行 |
| `src/renderer/stores/sessionHelpers.ts` | 修改 | 替换 `export:html-to-pdf` + `shell:openPath` 为 `export:save-pdf`，修复 catch 日志 |

---

## 六、后续可优化项

1. **清理旧的 `export:html-to-pdf` 通道**：如果确认没有其他调用方，可以移除该 IPC handler 以减少冗余。
2. **类型安全**：当前渲染层使用 `(window as any).electronAPI`，建议在 `src/shared/electron-types.ts` 中显式声明 `export:save-pdf` 的类型定义，避免 `any` 绕过编译检查。
3. **统一导出体验**：可考虑让 DOCX 导出也走类似的 `export:save-docx` 通道，保持各格式导出体验一致。

---

## 七、验证清单

- [x] 桌面端导出 PDF 时弹出系统保存对话框
- [x] 默认文件名为 `${session.name}.pdf`
- [x] 用户点击"取消"后不回退 HTML
- [x] 用户选择位置后 PDF 正确保存
- [x] 渲染失败时控制台打印错误日志，再回退 HTML
- [x] 非桌面端仍回退到 HTML 导出