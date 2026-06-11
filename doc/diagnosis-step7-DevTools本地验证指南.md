#步骤7：DevTools 本地验证指南

##目的

通过在本地 Electron窗口中打开 DevTools，验证两个核心问题：
1.标题栏拖拽失效的**真实 DOM/CSS原因**
2. maximize()事件的**实际渲染进程表现**

##准备工作

###1.启动应用

```bash
pnpm run dev
```

应用窗口打开后，**不要关闭 DevTools相关调试日志**（已经注入到代码中）。

###2.打开 DevTools

在应用窗口中按 **`Ctrl+Shift+I`** 或 **`F12`**

（注意：由于窗口可能被自定义标题栏遮挡，可能需要先最大化窗口再按 F12。如果窗口无法拖动/最大化，请暂时用鼠标右键点击任务栏图标 → "关闭"，然后重启 dev）

---

## 检查1：标题栏拖拽 CSS状态（核心）

###目标

确认 `-webkit-app-region: drag` 是否真的生效到 DOM。

###步骤

1. 在 DevTools 中点击 **`Elements`**标签
2. 点击左上角的**元素选择器**图标（或按 `Ctrl+Shift+C`）
3. **将鼠标悬停在应用顶部的标题栏上**（包含"会话名"的那一行）
4. 点击选中它
5. 在右侧 **`Styles`**面板中查找：
 - 是否能找到一个匹配 `.title-bar` 的规则
 - 该规则下是否包含 `-webkit-app-region: drag`
6.切换到 **`Computed`**标签
 -找到 `-webkit-app-region` 属性
 -记录它的**最终生效值**

###期望结果（如果拖拽应该工作）

```
Computed样式：
 -webkit-app-region: drag
```

###异常结果（如果拖拽不工作）

```
Computed样式：
 -webkit-app-region: no-drag
或
 -webkit-app-region: none
或
 -webkit-app-region 属性未设置
```

### ⚠️关键判断

如果 Computed 显示的不是 `drag`，请同时记录：
- 是哪个元素被选中（`<div class="title-bar...">` 还是其他）
- Styles面板中**有哪些规则**影响了 `-webkit-app-region`（特别是 `!important` 的覆盖）
- 是否能看到有**覆盖层**（`position: absolute/fixed`）在标题栏之上

---

## 检查2：Mantine Menu浮层的影响

###目标

确认 `<Menu>`组件浮层是否覆盖标题栏并阻断 drag事件。

###步骤

1. 在 PDF 双栏布局的会话页面（如果有 PDF）
2. 点击"**我的审查搭档**"按钮，展开 Menu下拉菜单
3. 在 DevTools Elements 中，搜索 `.mantine-Menu-dropdown`
4. 检查这个浮层元素：
 -它的 `position`是什么？
 - 它是否覆盖在标题栏上？
 -它的 Computed `-webkit-app-region`是什么？

###期望结果

如果设置正确，应该看到 `no-drag`。

###异常结果

如果显示 `drag` 或未设置，说明浮层继承了父级的 drag行为，会**错误地让菜单项也被识别为可拖拽区域**。

---

## 检查3：渲染进程 console.log 输出

###目标

查看渲染进程的 atom状态变化。

###步骤

1.切换到 DevTools 的 **`Console`**标签
2. 应用启动后，应能看到以下日志：
 ```
 [ATOM-DBG] windowMaximizedAtom.onMount called
 [ATOM-DBG] initial isMaximized(): false
 [ATOM-DBG] listener registered, unsubscribe type: function
 [ATOM-DBG] useWindowMaximized returns: false
 [WND-DBG] WindowControls render, windowMaximized: false, platformType: win32
 ```
3. 点击最大化按钮
4. **观察是否出现**：
 ```
 [ATOM-DBG] onMaximizedChange fired: true
 ```
 如果**没有出现**这一行，说明 IPC事件未到达渲染进程。

### ⚠️关键判断

- 如果 onMaximizedChange **从未触发** → 问题在主进程或 IPC链路
- 如果 onMaximizedChange **触发了**但 WindowControls 没更新 → 问题在 jotai/state

---

## 检查4：验证 maximize 是否真的最大化

###目标

确认点击最大化按钮后，Electron窗口是否真的最大化。

###步骤

1. 点击应用右上角的**最大化按钮**（方块图标）
2.观察：
 -窗口是否填满整个屏幕？
 - 如果是，继续检查第3步
 - 如果**不是**，说明 maximize()静默失败（与主进程日志一致）
3. 如果窗口确实最大化，观察：
 -按钮图标是否变成**还原图标**（两个方块叠在一起）
 - 如果**没有变化**，说明渲染进程没收到状态变化

### ⚠️关键判断

|现象 |根因 |
|------|------|
|窗口未最大化 +按钮图标未变 | maximize()静默失败（主进程 bug） |
|窗口最大化了 +按钮图标未变 |渲染进程未收到 IPC（IPC链路 bug） |
|窗口最大化了 +按钮图标变了 | ✅正常（按预期工作） |

---

## 检查5：检查覆盖层（关键）

###目标

确认是否有意外覆盖层在标题栏上。

###步骤

1. 在 Elements面板中，按 `Ctrl+F`搜索 `.title-bar`
2. 查看所有匹配的元素
3. 检查这些元素是否有：
 - 子元素设置了 `position: absolute` 或 `fixed`
 - 子元素设置了 `pointer-events: none` 或类似
 -子元素的 z-index 高于标题栏

### ⚠️关键判断

如果有覆盖层（如 PDF弹窗、移动端优化样式），可能错误地**拦截了 drag事件**。

---

##报告给 Cline 的内容

完成以上5个检查后，请告诉我以下信息：

###拖拽问题
1.选中标题栏元素后，**Computed样式的 `-webkit-app-region`**是什么？
 - [] `drag`
 - [] `no-drag`
 - [] `none`
 - [] 未设置

2. 在 Styles面板中，是否能看到其他规则覆盖了 `.title-bar`？
 - [] 否
 - [] 是（请告知覆盖规则的内容）

3. PDF弹窗或 Mantine Menu浮层是否覆盖在标题栏上？
 - [] 否
 - [] 是（请描述浮层位置）

###最大化问题
4. 点击最大化按钮后，窗口是否真的最大化？
 - [] 是
 - [] 否（仍然普通大小）

5. 点击最大化按钮后，按钮图标是否变成"还原"图标？
 - [] 是
 - [] 否

###渲染进程日志
6. console 中是否看到 `[ATOM-DBG] onMaximizedChange fired: true`？
 - [] 是
 - [] 否（说明 IPC 未到达渲染进程）

---

##后续

收到您的检查结果后，我会：
1. 根据具体表现确定**真正的根因**
2.给出**精确的修复方案**（而不是猜测）
3.实施修复并清理调试日志

---

*文档生成时间：2026-06-09*
*等待用户本地验证结果*
