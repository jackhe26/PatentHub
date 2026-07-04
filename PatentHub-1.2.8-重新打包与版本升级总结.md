# PatentHub 1.2.8 重新打包与版本升级总结

## 开发日期
2026-06-19

## 一、本次升级目标

1. **修复** PatentHub-1.2.6-Portable 启动崩溃问题（`Cannot find module 'cfb'`）
2. **同步** 1.2.6 → 1.2.8 版本号到所有源代码与文档
3. **重新打包** Windows Portable 版本（含 cfb/codepage 修复）

## 二、源代码层修复（1.2.6 已就位，1.2.8 验证继承）

### 已应用的修复（见 `PatentHub-1.2.6-Portable启动失败修复总结.md`）

| 修复点 | 文件 | 说明 |
|--------|------|------|
| cfb/codepage 加载方式 | `src/main/file-parser.ts` | 改用 `requireUnpackedModule` 多策略 fallback |
| asarUnpack 新增 cfb/codepage | `electron-builder.yml` | 让 Electron 能从 asar.unpacked 找到模块 |
| external filter 简化 | `electron.vite.config.ts` | 让 cfb/codepage 与其它依赖一样走外部 require |

### 1.2.8 验证清单

- [x] `src/main/file-parser.ts` 第 21-22 行仍为 `requireUnpackedModule('cfb')` / `requireUnpackedModule('codepage')`
- [x] `electron-builder.yml` 第 11-12 行仍包含 `cfb` 和 `codepage` 的 `asarUnpack` 配置
- [x] `electron.vite.config.ts` 第 158 行 external 已简化，不再单独过滤 cfb/codepage

## 三、版本号同步（1.2.6 → 1.2.8）

### 已修改的 7 处文件

| # | 文件 | 行/位置 | 修改内容 |
|---|------|--------|----------|
| 1 | `package.json` | 第 4 行 | `"version": "1.2.6"` → `"1.2.8"` |
| 2 | `release/app/package.json` | 第 4 行 | `"version": "1.2.6"` → `"1.2.8"` |
| 3 | `release/app/package-lock.json` | 第 3、9 行 | 顶层 version + packages[""].version → `1.2.8`（⚠️ 未触碰 `minimist ^1.2.6` 等 npm 包版本） |
| 4 | `README.md` | 第 23 行 | badge: `Version-1.2.6` → `Version-1.2.8` |
| 5 | `README.md` | 第 54-61 行 | 8 处 `PatentHub-1.2.6-*.exe/dmg/AppImage/deb` → `PatentHub-1.2.8-...` |
| 6 | `README.md` | 第 143 行 | 在 `### v1.2.6` 之上插入 `### v1.2.8 (2026-06-19)` 条目 |
| 7 | `src/renderer/i18n/changelogs/changelog_zh_Hans.ts` | 第 2 行 | 顶部插入 `## v1.2.8 - 2026.06.19` 条目 |
| 8 | `src/renderer/i18n/changelogs/changelog_zh_Hant.ts` | 第 2 行 | 同上（繁体） |
| 9 | `src/renderer/i18n/changelogs/changelog_en.ts` | 第 2 行 | 同上（英文） |

### v1.2.8 changelog 内容

```text
## v1.2.8 - 2026.06.19
1. 修复 Portable 版启动时弹 "Cannot find module 'cfb'" 错误导致崩溃的问题
2. 新增旧版及 WPS 私有格式文档解析：.doc / .wps / .xls / .et / .ppt / .dps
3. .ppt 二进制格式支持 Python + PowerPoint COM 自动转换为 .pptx 后再解析（文本完整度提升到 100%）
4. 文件图标新增 WPS 私有格式（.wps / .et / .dps）专属图标
```

## 四、重新打包工作流（5 步）

### 步骤 1：同步依赖与 lockfile

```bash
pnpm install
```

这一步会：
- 校验根 `package.json` 的依赖完整性
- 在 `release/app/node_modules` 中安装（或校验）所有依赖
- 同步 `release/app/package-lock.json`

⚠️ 如果 lockfile 与代码冲突，pnpm 会提示需要 `--no-frozen-lockfile`。

### 步骤 2：构建应用

```bash
pnpm run build
```

产出：
- `release/app/dist/main/main.js`（含 requireUnpackedModule 修复）
- `release/app/dist/preload/index.js`
- `release/app/dist/renderer/...`

### 步骤 3：打包 Windows

```bash
pnpm run package
```

`package` 脚本会自动：
1. 把 `electron-builder.yml` 的 `artifactName` 临时改成带日期后缀
2. 执行 `electron-builder build --publish never --win`
3. 还原 `electron-builder.yml`

**产出位置**：`release/build/`
- `PatentHub-1.2.8-2026-06-19-Setup.exe`（NSIS 安装版）
- `PatentHub-1.2.8-2026-06-19-Portable.exe`（便携版）

### 步骤 4：验证打包结果

```powershell
# 1. 检查 main.js 不再直接 require cfb（顶层）
Select-String -Path "release/build/win-unpacked/resources/app.asar" `
  -Pattern "require\(['""]cfb['""]\)" -AllMatches

# 期望：无输出或仅 requireUnpackedModule 内部调用
```

```powershell
# 2. 检查 asar.unpacked 是否包含 cfb
Test-Path "release/build/win-unpacked/resources/app.asar.unpacked/node_modules/cfb"
# 期望：True

Test-Path "release/build/win-unpacked/resources/app.asar.unpacked/node_modules/codepage"
# 期望：True
```

### 步骤 5：本地启动验证

1. 双击 `PatentHub-1.2.8-YYYY-MM-DD-Portable.exe`
2. 检查清单：
   - [ ] ✅ 不再弹 "Cannot find module 'cfb'" 错误
   - [ ] ✅ 主窗口正常出现
   - [ ] ✅ 设置 → 关于 显示版本 1.2.8
   - [ ] ✅ 上传 .ppt 文件 → 正常解析（Python 转换 or js-ppt fallback）
   - [ ] ✅ 上传 .pptx 文件 → jszip OOXML 解析正常
   - [ ] ✅ 上传 .pdf 文件 → pdf-parse 正常
   - [ ] ✅ 上传 .docx / .xlsx → officeparser 正常
   - [ ] ✅ 上传 .doc / .wps / .xls / .et → OLE2 解析正常

## 五、发布建议

### Git 提交

```bash
git add -A
git commit -m "chore: Release v1.2.8 - 修复Portable启动崩溃 + 旧版/WPS格式解析"
git tag v1.2.8
git push origin master --tags
```

### 用户分发

1. 上传 `PatentHub-1.2.8-2026-06-19-Portable.exe` 到 GitHub Releases
2. 通知所有 1.2.6 用户升级，**强调替换旧版 .exe**

### README.md 链接

下载链接已是 `PatentHub-1.2.8-...` 路径，指向 `releases/latest/download/`，**只要 GitHub Release 创建后会自动指向最新版本**。

## 六、风险与回滚

### 如果 1.2.8 出现新问题

1. **快速回滚**：让用户暂时继续用 1.2.6 + 临时手动复制 `app.asar.unpacked/node_modules/cfb` 目录
2. **彻底回滚**：`git revert` 这次 commit
3. **不复存在 1.2.7**：直接 1.2.6 → 1.2.8 跳跃，跳过有问题的中间版本

### 不要做的事

- ❌ **不要** 重新启用 `electron-builder.yml` 中的 `cfb/codepage` 内联打包尝试（之前尝试过，效果不稳定）
- ❌ **不要** 改 `package-lock.json` 里依赖项版本（如 `minimist ^1.2.6`）
- ❌ **不要** 跳过 `pnpm install` 直接打包（会导致 release/app/node_modules 不一致）

## 七、相关文件清单

| 类别 | 文件 |
|------|------|
| 源代码修复 | `src/main/file-parser.ts` |
| 打包配置 | `electron-builder.yml`、`electron.vite.config.ts` |
| Python 转换脚本 | `scripts/ppt2pptx.py` |
| JS-PPT 解析器 | `src/main/ppt-parser.js` |
| 版本号（7 处） | `package.json`、`release/app/package.json`、`release/app/package-lock.json`、`README.md`、3 个 changelog 文件 |
| 图标 | `src/renderer/static/icons/icons8-wps-*` |
| 历史文档 | `doc/WPS与旧版Office文档解析开发经验总结.md`、`PatentHub-1.2.6-Portable启动失败修复总结.md` |
| 本次文档 | `PatentHub-1.2.8-重新打包与版本升级总结.md` |