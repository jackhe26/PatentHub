#步骤4：WindowControls 实例分布诊断

## 检查目标

评估 WindowControls 多实例是否会导致 atom订阅混乱。

## 检查结果

### WindowControls 实例分布（共3 处）

| # | 文件:行 |父组件 |路由 |
|---|---------|--------|------|
|1 | `src/renderer/components/layout/Header.tsx:98` | Header | `/session/$sessionId`, `/`, `/image-creator` 等 |
|2 | `src/renderer/components/layout/Page.tsx:52` | Page | `/settings/*`, `/copilots`, `/about` 等通用页面 |
|3 | `src/renderer/routes/pdf-translate/index.tsx:486` | PDFTranslatePage | `/pdf-translate` |

### atom订阅分析

#### `windowMaximizedAtom` 的 onMount行为

```ts
export const windowMaximizedAtom = atom(false)
windowMaximizedAtom.onMount = (set) => {
 const check = async () => {
 set(await platform.isMaximized())
 }
 check().catch(() => null)
 const unsubscribe = platform.onMaximizedChange((maximized) => set(maximized))
 return unsubscribe
}
```

**根据 jotai 的行为规范**：
- `onMount` 在 atom **第一个订阅者挂载**时执行一次
- 返回的 `unsubscribe` 在 atom **最后一个订阅者卸载**时执行一次

这意味着：
-多个 WindowControls组件订阅同一个 atom，**listener 只注册一次**
-卸载时 listener 也只注销一次

理论上，**多实例不会导致 listener累积**。

### 🚨 但是！有一个关键隐患

####隐患4.1：React StrictMode 双调用

`src/renderer/index.tsx` 第120、144 行：
```tsx
<StrictMode>
 <ErrorBoundary>
 <InitPage />
 </ErrorBoundary>
</StrictMode>
```

```tsx
<StrictMode>
 <ErrorBoundary>
 <QueryClientProvider client={queryClient}>
 <RouterProvider router={router} />
 </QueryClientProvider>
 </ErrorBoundary>
</StrictMode>
```

**StrictMode 在 dev模式下会双调用 effect**：
- setup → listener A 注册
- cleanup → listener A注销
- setup → listener B 注册

我们的代码使用了闭包：
```ts
const unsubscribe = platform.onMaximizedChange((maximized) => set(maximized))
return unsubscribe
```

每次 `setup` 调用都会创建一个**新的** `unsubscribe`（因为每次调用 `platform.onMaximizedChange` 都创建一个新的 wrapper 函数）。这在 StrictMode 下应该正常工作。

####隐患4.2：桌面端 platform 模块的全局单例

`src/renderer/platform/desktop_platform.ts`：
```ts
export default class DesktopPlatform implements Platform {
 ...
 public onMaximizedChange(callback) {
 const unsubscribe = this.ipc.onWindowMaximizedChanged((_, isMaximized) => {
 callback(isMaximized)
 })
 return unsubscribe
 }
}
```

DesktopPlatform 是单例。每次调用 `onMaximizedChange` 都通过 `this.ipc.onWindowMaximizedChanged` 注册一个新的 wrapper。

`ipcRenderer.on()`允许同一 channel 注册多个 listener。如果 StrictMode 导致 setup/cleanup 的微小时间差，**listener 可能短暂累积**。

####隐患4.3：路由切换时的 unmount/remount

当用户在以下路由间切换：
- `/session/$sessionId` → `/settings` → `/pdf-translate`

每条路由使用不同的 WindowControls 实例（Header vs Page vs PDFTranslatePage）。每次切换：
1. 当前 WindowControls卸载 → WindowControls计数减1
2. 如果卸载到0 → atom卸载 → cleanup → listener注销
3. 新 WindowControls挂载 → WindowControls计数加1 → atom挂载 → onMount → listener 注册

**理论上没问题**。但是如果在第2步和第3步之间，主进程触发了 `maximize`事件（如双击标题栏），那么 listener 此时还未注册，事件**丢失**。

####隐患4.4：jotai 在 React18 并发模式下的行为

React18 的 StrictMode + 并发渲染可能导致 effect 的执行顺序出现 race condition。例如：
- cleanup还没完成，setup 已经触发
- 这会导致 listener A还未注销，listener B 已经注册

### 下一步验证

通过注入 console.log追踪：
- atom onMount何时被调用
- listener何时被注册/注销
- IPC事件何时到达
