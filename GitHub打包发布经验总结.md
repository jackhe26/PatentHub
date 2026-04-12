# GitHub Actions 打包发布经验总结

## 项目背景

PatentHub 是基于 Electron + React + TypeScript 的桌面应用，使用 electron-vite 构建，electron-builder 打包。

---

## 关键配置文件

### `.github/workflows/release.yml`
GitHub Actions 工作流，手动触发，构建 Windows / macOS / Linux 三个平台安装包，并自动发布 GitHub Release。

### `electron-builder.yml`
打包配置，`directories.app` 指向 `release/app`，这是 electron-builder 的"两包结构"（two-package structure）。

---

## 踩过的坑

### 1. pnpm 版本冲突
**错误**：`Multiple versions of pnpm specified`

**原因**：workflow 里 `pnpm/action-setup@v4` 同时在 `with.version` 和 `package.json` 的 `packageManager` 字段指定了版本。

**解决**：去掉 workflow 里的 `version: 10`，让 `pnpm/action-setup` 自动从 `package.json` 的 `packageManager` 字段读取版本。

```yaml
# 错误
- uses: pnpm/action-setup@v4
  with:
    version: 10

# 正确
- uses: pnpm/action-setup@v4
```

---

### 2. electron-vite 找不到 `release/app/package.json`
**错误**：`Could not resolve "./release/app/package.json"`

**原因**：`electron.vite.config.ts` 第 8 行 `import packageJson from './release/app/package.json'`，但 `.gitignore` 里有 `release/app/`，导致这个文件没有被提交到 GitHub。

**解决**：修改 `.gitignore`，只忽略构建产物，保留 `package.json`：

```gitignore
# 错误
release/app/

# 正确
release/app/dist/
release/app/node_modules/
```

然后把 `release/app/package.json` 和 `release/app/package-lock.json` 提交到 Git。

---

### 3. electron-builder 找不到 `release/app` 目录
**错误**：`Cannot find package.json in the /path/to/release/app`

**原因**：直接运行 `electron-builder` 而没有先运行 `electron-vite build`，导致 `release/app/dist/` 不存在。

**解决**：workflow 里必须先 build 再 package：

```yaml
- name: Build application
  run: pnpm run build          # electron-vite build

- name: Build and Package
  run: pnpm exec electron-builder build --publish never --mac --x64
```

---

### 4. Linux 构建参数错误
**错误**：`Unknown argument: AppImage`

**原因**：electron-builder 的 target 参数不能带 `--` 前缀。

```bash
# 错误
electron-builder build --linux --AppImage --x64

# 正确（让 electron-builder.yml 控制 target）
electron-builder build --linux
```

---

### 5. Mac 每个 job 产出 4 个文件（应该是 2 个）
**原因**：`electron-builder.yml` 里 Mac 配置硬编码了两个架构：

```yaml
# 错误
mac:
  target:
    target: default
    arch:
      - arm64
      - x64
```

即使 workflow 命令行指定了 `--x64`，electron-builder 仍然按 yml 配置构建两个架构。

**解决**：移除 yml 里的 `arch` 配置，让命令行参数控制：

```yaml
# 正确
mac:
  target:
    - target: default
```

---

## 最终 Workflow 结构

```
build-mac (x64)  ─┐
build-mac (arm64) ─┤
build-linux       ─┼─→ create-release（收集所有产物，发布 GitHub Release）
build-win         ─┘
```

---

## GitHub Release 下载链接格式

发布后，安装包可通过固定链接下载（`latest` 自动指向最新版本）：

```
# Windows 安装版
https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-{version}-Setup.exe

# Windows 便携版
https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-{version}-Portable.exe

# macOS Intel
https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-{version}.dmg

# macOS Apple Silicon
https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-{version}-arm64.dmg

# Linux AppImage
https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-{version}-x64.AppImage

# Linux deb
https://github.com/jackhe26/PatentHub/releases/latest/download/PatentHub-{version}-x64.deb
```

---

## 发布新版本流程

1. 修改 `package.json` 和 `release/app/package.json` 里的 `version` 字段
2. 提交并推送到 GitHub
3. 访问 https://github.com/jackhe26/PatentHub/actions
4. 点击 **Release Build** → **Run workflow** → 选择版本类型 → 确认
5. 等待约 15-20 分钟，构建完成后自动创建 GitHub Release
6. 在 https://github.com/jackhe26/PatentHub/releases 查看发布结果

---

## 注意事项

- `release/app/package.json` 必须提交到 Git（不能被 `.gitignore` 忽略）
- `release/app/dist/` 和 `release/app/node_modules/` 不需要提交
- Mac 构建只能在 macOS runner 上进行（跨平台限制）
- Linux arm64 构建在 ubuntu-latest 上通过交叉编译完成
- GitHub Artifacts 保留 5 天，GitHub Release 永久保留
