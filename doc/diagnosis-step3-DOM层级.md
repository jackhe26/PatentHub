#步骤3：title-bar DOM 结构诊断

## 检查目标

找出嵌套的 title-bar 是否冲突，以及是否有元素阻断 drag事件。

## 检查结果

### title-bar元素分布（共5 处）

| # | 文件:行 | 内容 |包含 WindowControls |
|---|---------|------|---------------------|
|1 | `src/renderer/components/layout/Header.tsx:60` | 主 Header（会话名、菜单、控件） | ✅ 是 |
|2 | `src/renderer/components/layout/Page.tsx:25` |通用 Page头（标题、控件） | ✅ 是 |
|3 | `src/renderer/Sidebar.tsx:155` | macOS专用44px 占位空 div | ❌ 否 |
|4 | `src/renderer/routes/session/$sessionId.tsx:945` |搭档选择器（PDF切换 +搭档菜单） | ❌ 否 |
|5 | `src/renderer/routes/pdf-translate/index.tsx:468` | PDF翻译独立头 | ✅ 是 |
|6 | `src/renderer/modals/Settings.tsx` | Settings模态框头 | ✅ 是 |

### DOM层级结构（关键页面）

**A. 普通会话页（非 PDF 双栏布局）**：

```
<Sidebar> [macOS only: <Box class="title-bar"44px/>]
 <Header class="flex-none title-bar"> ←唯一拖拽区
 <Title>...</Title>
 <Toolbar/>
 <WindowControls/> ← className="controls" (no-drag)
 </Header>
```

**B. 会话页 + PDF 双栏布局**（session/$sessionId.tsx 的 `singlePdfFile` 分支）：

```
<Sidebar>
 <div class="flex flex-col h-full">
 <Box class="title-bar flex items-center..."> ←搭档选择器（拖拽区 #1）
 <ActionIcon class="controls"> PDF切换 </ActionIcon> ← no-drag ✅
 <Menu> ← Mantine Menu组件
 <Menu.Target>
 <Button class="controls"> 我的审查搭档 </Button> ← no-drag ✅
 </Menu.Target>
 <Menu.Dropdown> ← ⚠️浮层，无 controls 类
 <Menu.Item>...</Menu.Item> ← ⚠️ 无 controls 类
 </Menu.Dropdown>
 </Menu>
 </Box>
 <Header class="flex-none title-bar"> ←拖拽区 #2
 <WindowControls/>
 </Header>
 <div> PDF + Chat 双栏 </div>
```

### 🚨 发现的问题

#### 问题3.1：拖拽区纵向堆叠

在 PDF 双栏布局下，**两个 `.title-bar`元素纵向堆叠**：
-搭档选择器（拖拽区 #1）
- Header（拖拽区 #2）

**Electron 的行为**：在多个 drag区域都有效，但**鼠标按下时，事件会从最顶层元素开始**。如果最顶层的搭档选择器 Box 有子元素（包括 Menu浮层）没有设置 `no-drag`，整个区域就会被识别为"非拖拽"。

#### 问题3.2：Menu.Dropdown浮层缺 controls 类

Mantine `<Menu>`组件的浮层（`Menu.Dropdown` → `Menu.Item`）默认不继承父类的 `controls` 类。这会导致：

- 点击 Menu.Item 时，**事件冒泡**到外层 `.title-bar`元素
- 如果外层是 drag 区，按下时会**触发窗口拖拽**而不是菜单点击
- 这是为什么点击"我的审查搭档"按钮可能不灵敏

#### 问题3.3：Mantine组件库的内部 div

Mantine组件（如 `Menu`、`Button`）会渲染多层嵌套 div。每层 div 都可能有自己的事件处理。如果某层 div覆盖了标题栏，且没有显式设置 `-webkit-app-region`，则会**阻断** drag事件向上传播到 `.title-bar`。

### 下一步验证

在 DevTools 中：
1.选中标题栏元素，查看其父链是否全部有 `drag`
2.选中 Menu浮层，查看 Computed样式的 `-webkit-app-region`
3. 测试在搭档选择器上按下并拖动窗口
