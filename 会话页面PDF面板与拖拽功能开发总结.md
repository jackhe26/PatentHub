# 会话页面PDF面板与拖拽功能开发总结

## 📅 开发日期
2026/5/21

## 🎯 需求背景
1. **窗口拖拽问题**：在带有PDF预览的双栏布局会话页面中，搭档选择器所在的顶部横条无法拖动软件窗口
2. **小屏幕适配问题**：小屏幕设备上需要能够隐藏PDF预览面板，让聊天区域撑满整个软件界面

---

## 🔧 解决方案

### 功能1：窗口拖拽功能

**问题原因**：
- Header 组件有 `title-bar` 类，支持窗口拖拽
- 搭档选择器区域的 Box 组件没有 `title-bar` 类，导致无法拖拽

**解决方案**：
给搭档选择器的 Box 元素添加 `title-bar` 类，同时给内部按钮添加 `controls` 类保持可点击：

```tsx
// 修改前
<Box px="sm" py="xs" className="flex items-center gap-3 ...">

// 修改后
<Box px="sm" py="xs" className="title-bar flex items-center gap-3 ...">
  <Button className="controls">...</Button>
</Box>
```

**CSS规则**（`src/renderer/static/index.css`）：
```css
.title-bar {
  -webkit-app-region: drag;  /* 可拖拽区域 */
}
.title-bar .controls {
  -webkit-app-region: no-drag;  /* 排除拖拽（保持按钮可点击）*/
}
```

---

### 功能2：PDF显示/隐藏功能

**需求**：
- 默认显示PDF预览面板（45%宽度），聊天区域55%宽度
- 用户可点击切换按钮隐藏PDF，聊天区域撑满100%
- 平滑过渡动画

**实现步骤**：

1. **添加状态管理**
```tsx
const [showPdfPanel, setShowPdfPanel] = useState(true)
```

2. **添加切换按钮**
```tsx
import { IconFileTypePdf, IconFileOff } from '@tabler/icons-react'

<ActionIcon
  variant="subtle"
  color={showPdfPanel ? 'blue' : 'gray'}
  onClick={() => setShowPdfPanel(!showPdfPanel)}
  title={showPdfPanel ? '隐藏PDF预览' : '显示PDF预览'}
  className="controls"
>
  {showPdfPanel ? <IconFileTypePdf size={20} /> : <IconFileOff size={20} />}
</ActionIcon>
```

3. **动态调整宽度**
```tsx
const pdfWidth = showPdfPanel ? '45%' : '0%'
const chatWidth = showPdfPanel ? '55%' : '100%'

<div style={{ width: pdfWidth, display: showPdfPanel ? 'block' : 'none', transition: 'width 0.2s ease' }}>
  <PDFPreviewPanel pdfFile={singlePdfFile} />
</div>

<div style={{ width: chatWidth, transition: 'width 0.2s ease' }}>
  <MessageList ... />
</div>
```

---

## 📁 修改文件

| 文件路径 | 修改内容 |
|----------|----------|
| `src/renderer/routes/session/$sessionId.tsx` | 添加图标导入、状态管理、拖拽类、切换按钮、动态宽度 |

---

## 🎨 预期效果

```
显示PDF时：
┌─────────────────────────────────────────────────────────┐
│ [📄] [搭档选择器]                    当前: xxx          │ ← 可拖拽
├───────────────────────────┬─────────────────────────────┤
│   PDF 预览 (45%)         │      聊天区域 (55%)         │
└───────────────────────────┴─────────────────────────────┘

隐藏PDF时：
┌─────────────────────────────────────────────────────────┐
│ [📄] [搭档选择器]                    当前: xxx          │ ← 可拖拽
├─────────────────────────────────────────────────────────┤
│                    聊天区域 (100%)                     │
└─────────────────────────────────────────────────────────┘
```

---

## ✅ 功能验证

1. ✅ 点击顶部横条可以拖动软件窗口
2. ✅ 搭档选择器按钮可以正常点击
3. ✅ PDF切换按钮可以正常切换显示/隐藏
4. ✅ 隐藏PDF后聊天区域自动撑满整个宽度
5. ✅ 过渡动画平滑

---

## 📝 技术要点

1. **Electron 拖拽机制**：使用 `-webkit-app-region` CSS属性控制
2. **Mantine UI**：使用 ActionIcon 组件实现图标按钮
3. **Tabler Icons**：使用 IconFileTypePdf 和 IconFileOff 图标
4. **React 状态管理**：使用 useState 控制面板显示/隐藏
5. **CSS过渡动画**：使用 transition 属性实现平滑效果
