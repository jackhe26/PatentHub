# myOCR 本地服务商接入开发总结

## 开发时间
2026年6月21日

## 开发目标
在 PatentHub 中接入 myOCR 本地 PDF 转换服务（基于 OCRmyPDF），实现：
- 100% 离线，数据不出本机
- 无需 API Key，免费无配额限制
- 输出可搜索 PDF（PDF/A-2），保留原版式

---

## 遇到的 Bug 及解决方案

### Bug 1: 环境检测失败 - runCmdSync 返回 Promise 但同步使用
**现象**: `detectEnvironment()` 总是返回 false，检测不到 ocrmypdf

**原因**: `runCmdSync()` 内部使用 `spawn()` 返回 Promise，但调用方以同步方式使用（直接检查 `.exitCode`）

**修复**: 改用 `execFileSync` 实现真正的同步执行：
```typescript
// ❌ 错误：异步 Promise 当同步用
function runCmdSync(cmd: string, args: string[]) {
  return new Promise((resolve) => {
    spawn(cmd, args).on('close', (code) => resolve({ exitCode: code }))
  })
}

// ✅ 正确：真正的同步执行
function runCmdSync(cmd: string, args: string[]) {
  try {
    const stdout = execFileSync(cmd, args, { encoding: 'utf-8' })
    return { stdout, stderr: '', exitCode: 0 }
  } catch (err: any) {
    return { stdout: '', stderr: err.message, exitCode: err.status ?? 1 }
  }
}
```

### Bug 2: hOCR 文件找不到 - OCRmyPDF 版本过低
**现象**: 
```
FileNotFoundError: ...\000003_ocr_hocr.hocr
OCRmyPDF 退出码 15
```

**原因**: 使用 Python 3.10 + OCRmyPDF 16.13.0，版本过低（< 17.0），存在 hOCR 处理 Bug

**修复**: 
1. 卸载旧版 `pip uninstall ocrmypdf`
2. 使用离线虚拟环境：Python 3.11 + OCRmyPDF 17.7.1
3. 将 `F:\MyAI_Labs\OCRmyPDF-main\.venv` 复制到 `resources/myocr/.venv`

### Bug 3: TESSDATA_PREFIX 配置不完整
**现象**:
```
read_params_file: Can't open hocr
TesseractConfigError: Error occurred while parsing a Tesseract configuration file
```

**原因**: `TESSDATA_PREFIX` 指向用户自定义目录时，Tesseract 只在该目录查找 `configs/hocr`，但用户目录缺少 configs 文件夹

**修复**: 将系统 tessdata 的 configs 复制到用户目录：
```powershell
xcopy "C:\Program Files\Tesseract-OCR\tessdata\configs" "C:\Users\...\PatentHub\tessdata\configs\" /E /I /Y
```

### Bug 4: Windows 短路径问题
**现象**: 临时文件路径使用短格式 `C:\Users\JACKHE~1\AppData\Local\Temp`

**修复**: 设置自定义临时目录（长路径格式）：
```typescript
const customTempDir = path.join(app.getPath('userData'), 'temp')
env.TEMP = customTempDir
env.TMP = customTempDir
env.TMPDIR = customTempDir
```

### Bug 5: --rotate-pages 导致 hOCR 错误
**现象**: 某些 PDF 在 `--rotate-pages` 选项下处理失败

**修复**: 禁用 `--rotate-pages` 选项（Windows + Python 3.10 环境下不稳定）

---

## 环境配置最终状态

| 组件 | 路径/版本 | 状态 |
|------|-----------|------|
| Python | `resources\myocr\.venv\Scripts\python.exe` (3.11.14) | ✅ |
| OCRmyPDF | 17.7.1 | ✅ |
| Tesseract | `C:\Program Files\Tesseract-OCR\tesseract.exe` (5.5.0) | ✅ |
| Ghostscript | `D:\Program Files\GPLGhostscript\gs10.05.0\bin\gswin64c.exe` | ✅ |
| 简体中文 | `chi_sim.traineddata` (42.3 MB) | ✅ |
| 繁体中文 | `chi_tra.traineddata` (56.3 MB) | ✅ |
| 英文 | `eng.traineddata` (22.4 MB) | ✅ |
| 方向检测 | `osd.traineddata` (10.1 MB) | ✅ |
| Tesseract configs | `configs/` (hocr, pdf, txt 等) | ✅ |

---

## 代码关键修复点

### 1. 路径探测增强
```typescript
function getMyOcrDir(): string | null {
  // 开发模式多路径探测
  const devPaths = [
    path.join(__dirname, '..', '..', '..', 'resources', 'myocr'),
    path.join(process.cwd(), 'resources', 'myocr'),
    path.join(app.getAppPath(), 'resources', 'myocr'),
  ]
  // ...
}
```

### 2. 进程管理优化
- 使用 `execFile` + `shell: true` 替代 `spawn`，更接近命令行行为
- 通过 `cmd /c set` 获取完整系统环境变量
- 设置 `cwd` 为 PDF 所在目录

### 3. 环境变量配置
```typescript
// 完整环境变量（修复 PATH 不完整问题）
const envOutput = execFileSync('cmd', ['/c', 'set'], { encoding: 'utf-8' })
// TESSDATA_PREFIX 指向用户目录
env.TESSDATA_PREFIX = userTessdata
// 自定义临时目录
env.TEMP = customTempDir
```

---

## 测试验证

| 测试文件 | 语言 | 页数 | 结果 |
|----------|------|------|------|
| WOSA_EP_PCT+Office.pdf | eng | 5 | ✅ 成功 |
| TWI801085B.PDF | chi_tra+eng | 30 | ✅ 成功 |
| PCT+WOSA+BOSSV2.pdf | eng | 多页 | ✅ 成功 |

---

## 经验总结

1. **版本兼容性至关重要**：OCRmyPDF 16.x 在 Windows 上有 hOCR Bug，必须使用 >= 17.0
2. **环境变量完整性**：Electron 的 `process.env` 可能不完整，需要通过 `cmd /c set` 获取
3. **Tesseract 配置完整性**：`TESSDATA_PREFIX` 指向的目录必须包含 `configs/` 子目录
4. **路径问题**：Windows 短路径可能导致文件找不到，使用长路径或自定义目录
5. **离线部署优势**：使用 `.venv` 虚拟环境可以避免网络安装问题，便于跨电脑部署

---

## 相关文件

- `src/main/pdf-convert/myocr-converter.ts` - 主转换器代码
- `resources/myocr/README.md` - 环境安装说明
- `resources/myocr/.venv/` - Python 虚拟环境（Python 3.11 + OCRmyPDF 17.7.1）