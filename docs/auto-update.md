# 自动更新配置（PatentHub）

> 适用版本：v1.4.6 起

## 一、为什么默认关闭

上游 Chatbox 的自动更新源被硬编码在 `src/main/app-updater.ts`：

```ts
'https://chatboxai.app/api/auto_upgrade'
'https://api.chatboxai.app/api/auto_upgrade'
...（共 5 个 Chatbox 域名）
```

PatentHub 打包后仍会访问这些地址，运行日志里会出现：

```
[app-updater] Found version 1.23.5 (url: Chatbox-1.23.5-Setup.exe)
```

即：**PatentHub 会下载并提示安装 Chatbox 的安装包**，存在被覆盖安装的风险。

v1.4.6 起改为「默认关闭 + 显式配置」：

| 状态 | 行为 |
|---|---|
| 未配置 `PATENTHUB_UPDATE_URL`（默认） | 主进程**不发起任何更新检查**，不访问任何 Chatbox 域名；设置页隐藏「自动更新 / Beta 更新」开关 |
| 已配置 | 只访问自家更新源（generic 静态目录）；设置页显示开关，且默认关闭，需用户手动开启 |

## 二、配置自家更新源

### 1. 构建时注入（构建期常量，写入安装包）

```powershell
$env:PATENTHUB_UPDATE_URL = 'https://<单位域名>/patenthub/updates'
pnpm run build
npx electron-builder build --publish never --win
```

> 该变量在 `electron.vite.config.ts` 中通过 `define` 注入主进程与渲染进程，
> **必须在构建前设置**，运行期再设置环境变量无效。

### 2. 更新源目录需要放置的文件

electron-updater 的 generic provider 会按以下形式取文件：

```
https://<单位域名>/patenthub/updates/latest.yml                 # 稳定版清单（必需）
https://<单位域名>/patenthub/updates/PatentHub-1.4.6-Setup.exe  # 安装包（latest.yml 中引用）
https://<单位域名>/patenthub/updates/PatentHub-1.4.6-Setup.exe.blockmap
https://<单位域名>/patenthub/updates/beta.yml                   # 仅启用 Beta 更新时需要
```

> **注意**：当前 `electron-builder.yml` 是 `publish: null`，打包时**不会**生成 `latest.yml`。
> 如需启用自动更新，请把 `publish` 改为自家 generic 源后再打包，electron-builder 才会产出清单：
>
> ```yaml
> publish:
>   provider: generic
>   url: https://<单位域名>/patenthub/updates
> ```
>
> 之后 `release/build/` 下会出现 `latest.yml`（Beta 通道为 `beta.yml`），把它与 exe、blockmap 一起上传即可。
> 同时生成的 `resources/app-update.yml` 与本项目的 `PATENTHUB_UPDATE_URL` 指向同一地址，二者不冲突。

### 3. 链接地址示例

| 场景 | 示例 URL |
|---|---|
| 单位内网/公网静态目录（推荐） | `https://patents.example.com/patenthub/updates` |
| GitHub Releases（静态目录形式） | `https://github.com/jackhe26/PatentHub/releases/latest/download` |
| 本地联调 | `http://127.0.0.1:8080/patenthub/updates` |

> 上面只是格式示例，请替换为单位实际可访问的地址；`<单位域名>` 不能在客户端拼接，必须构建时写死。

### 4. 验证是否生效

1. 构建产物的 `resources/app.asar` 内主进程代码应包含所配置的 URL 字符串；
2. 启动应用后查看 `%APPDATA%\PatentHub\logs\main.log`：
   - 关闭状态：`auto update disabled: PATENTHUB_UPDATE_URL is not configured`
   - 已启用：`Update timer started (feed: https://…), checking every hour`
3. 设置页（桌面端）出现「自动更新 / Beta 更新」开关；
4. 发布新版本后，旧版本应能检测到并下载（`update-downloaded` 后工具栏出现「Update Available」按钮）。

## 三、安全兜底

- `install-update` IPC 增加双重校验：**未配置更新源**或**尚未下载完更新包**时直接忽略，
  不会触发 `autoUpdater.quitAndInstall()`。
- `electron-builder.yml` 仍是 `publish: null`，不生成 `app-update.yml`；
  更新地址完全由 `PATENTHUB_UPDATE_URL` 决定，避免残留配置指向错误源。

## 四、仍存在的其它 Chatbox 网络请求（不涉及安装）

`src/renderer/hooks/useVersion.ts` 会每 2 小时调用一次
`${API_ORIGIN}/chatbox_need_update/<version>`（`src/renderer/packages/remote.ts`），
仅用于 Android 侧边栏的「有新版本」提示，**不会下载或安装任何东西**。
如需彻底去除对该域名的请求，可另行改造 `checkNeedUpdate`。

## 五、相关文件

| 文件 | 说明 |
|---|---|
| `src/main/app-updater.ts` | 更新源与检查逻辑（默认关闭） |
| `src/main/main.ts` | `install-update` IPC 安全校验 |
| `electron.vite.config.ts` | `PATENTHUB_UPDATE_URL` 构建期注入 |
| `src/renderer/variables.ts` | `AUTO_UPDATE_ENABLED` 开关 |
| `src/renderer/routes/settings/general.tsx`、`pages/SettingDialog/AdvancedSettingTab.tsx` | 未配置时隐藏更新开关 |
| `src/shared/defaults.ts`、`src/shared/types/settings.ts` | `autoUpdate` 默认值改为 `false` |
