#步骤5：运行时日志（基于注入的 console.log 输出）

## 测试环境

-操作系统：Windows11
- Electron 版本：26.6.10
- Node.js：v20.20.1
- pnpm：10.15.1
- React18（StrictMode启用）
- 开发模式：`pnpm run dev`（electron-vite dev）

##注入的调试日志

### 主进程日志（src/main/main.ts）
- `[IPC-DBG] window:maximize called, isMaximized before: <bool>`
- `[IPC-DBG] window:unmaximize called, isMaximized before: <bool>`
- `[IPC-DBG] window:close called`
- `[IPC-DBG] window:is-maximized called, returns: <bool>`
- `[IPC-DBG] mainWindow.on(maximize) -> sending window:maximized-changed: true`
- `[IPC-DBG] mainWindow.on(unmaximize) -> sending window:maximized-changed: false`

###渲染进程日志（src/renderer/hooks/useWindowMaximized.ts）
- `[ATOM-DBG] windowMaximizedAtom.onMount called`
- `[ATOM-DBG] initial isMaximized(): <bool>`
- `[ATOM-DBG] listener registered, unsubscribe type: <type>`
- `[ATOM-DBG] onMaximizedChange fired: <bool>`
- `[ATOM-DBG] useWindowMaximized returns: <bool>`

###渲染进程日志（src/renderer/components/layout/WindowControls.tsx）
- `[WND-DBG] WindowControls render, windowMaximized: <bool>, platformType: <string>`

##实际观察到的日志（主进程输出）

```
21:11:10.226 [store-node] init store, config path: ...
21:11:10.346 [knowledge-base:index] [KB] Initializing knowledge base system...
21:11:10.463 > tray: created
21:11:14.998 > APP_LOG: Global error handlers initialized
21:11:14.999 > APP_LOG: initializeApp
21:11:15.033 > APP_LOG: migrateStorage: current storage config version:14
21:11:15.073 > APP_LOG: migrate done
21:11:15.257 > APP_LOG: Initializing token estimation system
21:11:15.258 > APP_LOG: Token estimation system initialized

[IPC-DBG] window:is-maximized called, returns: false ←启动后第一次检查
21:11:15.490 [knowledge-base:ipc-handlers] ipcMain: kb:list
[IPC-DBG] window:is-maximized called, returns: false ← 又一次检查（可能是组件重挂载）
21:11:29.030 > analystic_tracking_event FetchError: ...

[IPC-DBG] window:maximize called, isMaximized before: false ← 用户第1次点击最大化
[IPC-DBG] window:maximize called, isMaximized before: false ← 用户第2次点击（按钮没切换！）
[IPC-DBG] window:maximize called, isMaximized before: false ← 用户第3次点击（按钮还没切换！）

[IPC-DBG] window:is-maximized called, returns: false ← 检查状态，仍未最大化
21:11:56.138 [knowledge-base:ipc-handlers] ipcMain: kb:list
[IPC-DBG] window:is-maximized called, returns: false ←仍然未最大化
21:12:05.706 > analystic_tracking_event FetchError: ...
[IPC-DBG] window:close called ← 用户关闭应用
21:12:20.318 > tray: destroyed
21:12:20.319 > tray: skip destroy because it does not exist
```

## 🚨关键发现

### 🚨关键发现1：主进程的 `maximize`事件从未触发

**预期**：
```
[IPC-DBG] window:maximize called, isMaximized before: false
[IPC-DBG] mainWindow.on(maximize) -> sending window:maximized-changed: true ← 应该出现！
```

**实际**：
```
[IPC-DBG] window:maximize called, isMaximized before: false
（没有任何 [IPC-DBG] mainWindow.on(maximize) 日志）
```

**结论**：`mainWindow.maximize()` 被调用了，但**`maximize`事件从未触发**。这意味着窗口没有进入最大化状态。

### 🚨关键发现2：用户连续点击3 次都是 `maximize`（不是 `unmaximize`）

**预期行为**：
- 第1次点击 →最大化 →按钮变成 "Restore"（调用 unmaximize）
- 第2次点击 →还原 →按钮变成 "Maximize"（调用 maximize）

**实际观察**：
- 第1次：`window:maximize called` → 没效果
- 第2次：`window:maximize called` → 没效果（按钮还是"Maximize"，所以用户又点了）
- 第3次：`window:maximize called` → 没效果

**结论**：渲染进程的 atom状态**从未变为 true**，所以按钮始终显示"最大化"图标，用户被迫连续点击。

### 🚨关键发现3：`isMaximized()`始终返回 false

`window:is-maximized` 调用4 次，每次都返回 `false`，说明**窗口实际上从未进入最大化状态**。

##渲染进程日志（需要在 DevTools 中查看）

由于 dev server 的输出只包含主进程的 stdout，**渲染进程的 console.log不会出现在这里**。需要在 Electron窗口中按 F12打开 DevTools 查看：
- `[ATOM-DBG] windowMaximizedAtom.onMount called`
- `[ATOM-DBG] initial isMaximized(): false`
- `[WND-DBG] WindowControls render, windowMaximized: false, platformType: win32`

但由于窗口拖拽问题，**用户可能根本无法在 DevTools 中打开调试器**（需要测试）。

## 分析：根因

###根因候选 A：mainWindow.maximize()静默失败

`mainWindow.maximize()` 在 Electron 中理论上应该触发 `maximize`事件。但在此项目中，事件未触发。

**可能原因**：
1. `BrowserWindow` 的 `minWidth=280`, `minHeight=450` 设置
 - 但这是 MIN size，不应该阻止 maximization
2.显示器数量/分辨率问题（window_state.ts 中的 validation逻辑）
3. Electron26.6.10 在 Windows11 上的一个已知 bug
4. `frame: false` 与 `titleBarStyle: 'hidden'` 的特定组合导致的渲染问题

###根因候选 B：窗口状态恢复冲突

window_state.ts 保存了上次的窗口状态。如果上次保存为 "Maximized"，但当前窗口实际并未最大化（由于上面的 bug），则下次启动时：
1. `state.mode === Maximized` 为 true
2. 调用 `mainWindow.maximize()` →失败 →事件不触发
3. 然后调用 `mainWindow.show()` →窗口显示在普通状态

**但是**，用户报告是"最近一次版本出了问题"，说明问题可能是最近才出现的。

###根因候选 C：Electron内部状态异常

日志中显示 `window:is-maximized called, returns: false` 被调用了2 次（启动后约5 秒内）。这表明有两次 `isMaximized()` 调用。可能的原因：
- StrictMode 导致 atom onMount 被双调用 → `check()` 被调用2 次

如果是这样，那么 StrictMode 是问题的源头之一，但仍然不能解释为什么 maximize()失败。

## 下一步验证建议

1. **打开 DevTools**，查看渲染进程的日志，确认：
 - atom状态是否更新
 - listener 是否触发
 - WindowControls 是否重新渲染

2. **尝试不通过 UI，直接在主进程中调用**：
 ```ts
 mainWindow.maximize()
 console.log('after maximize:', mainWindow.isMaximized())
 ```
 如果主进程直接调用都失败，则确认是 Electron/BrowserWindow 的问题。

3. **检查 Electron26.6.10 的 release notes**，看是否有相关 bug。

4. **检查 git log**，确认 `frame: false` 或 `titleBarStyle` 是何时引入的。
