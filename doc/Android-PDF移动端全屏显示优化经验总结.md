# Android 手机端 PDF 全屏显示优化经验总结

## 需求背景

移动端打开 PDF 文档时，显示区域右侧空白过多，PDF 无法真正占满手机屏幕。

## 问题分析

1. 外层 `div` 有 `padding: '0 8px'`（左右各 8px）
2. `Card` 组件有 `padding="sm"` 和 `withBorder`
3. 两层叠加导致 PDF 损失约 30-40px 显示空间
4. 页面指示文字占用了宝贵的垂直空间

## 解决方案

### 1. 移动端独立渲染路径

在 `PDFPreviewPanel` 组件中，通过 `platform.type === 'mobile'` 判断平台，移动端使用**纯 div 结构**，不再使用 Mantine `Card` 组件：

```tsx
if (isMobile) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      {/* 标题栏：文件名左 + 页码右 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>
        <span>{pdfFile.name}</span>
        <span>{currentPage + 1} / {totalPages}</span>
      </div>
      {/* PDF 内容区：全屏无滚动条 */}
      <div style={{ flex: 1, overflow: 'hidden', touchAction: 'none' }}>
        {/* img with pinch-to-zoom and swipe-to-turn */}
      </div>
    </div>
  )
}
```

### 2. 去掉外层 padding

在双栏布局的外层容器中，移动端 PDF 区域不设置 padding：

```tsx
<div style={{ width: pdfWidth, padding: isMobile ? 0 : '0 8px', display: showPdfPanel ? 'block' : 'none' }}>
  <PDFPreviewPanel pdfFile={singlePdfFile} />
</div>
```

### 3. 双指捏合缩放

使用 `touchAction: 'none'` 防止 WebView 拦截触摸事件，通过 `onTouchStart`/`onTouchMove`/`onTouchEnd` 监听双指距离变化：

```tsx
const touchStartDist = useRef<number>(0)
const [scale, setScale] = useState(1.2) // 默认缩放
const baseScale = useRef(1.2)

onTouchMove={(e) => {
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    const dist = Math.sqrt(dx * dx + dy * dy)
    const ratio = dist / touchStartDist.current
    const newScale = Math.min(4.0, Math.max(0.8, baseScale.current * ratio))
    setScale(newScale)
  }
}}
```

### 4. 左右滑动翻页

单指滑动距离超过 60px 且水平分量大于垂直分量 1.5 倍时触发翻页：

```tsx
onTouchEnd={(e) => {
  if (e.changedTouches.length === 1 && e.touches.length === 0) {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goToPage(1)   // 左滑下一页
      else goToPage(-1)          // 右滑上一页
    }
  }
}}
```

### 5. CSS 缩放实现

`objectFit: 'contain'` 让图片适应容器，CSS `transform: scale()` 实现缩放：

```tsx
<img
  src={pageImage}
  alt={`Page ${currentPage + 1}`}
  style={{
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    transform: `scale(${scale})`,
    transformOrigin: 'top center',
  }}
/>
```

## 最终效果

| 项目 | 旧版 | 新版 |
|------|------|------|
| 渲染方式 | Card 组件（padding + border） | 纯 div（无 padding） |
| 默认缩放 | 1.3 | 1.2 |
| 缩放范围 | 固定 | 0.8x ~ 4.0x |
| 翻页方式 | 顶部按钮 | 左右滑动手势 |
| 页码位置 | 页面内文字（遮挡内容） | 顶部标题栏右侧 |
| 滚动条 | 有 | 无（overflow: hidden） |

## 关键代码位置

- 文件：`src/renderer/routes/session/$sessionId.tsx`
- 组件：`PDFPreviewPanel`
- commits：
  - `015fccd` - PDF mobile full-screen, no padding, swipe to turn page, pinch to zoom, page indicator in title bar
  - `28b9a94` - feat: reduce default PDF scale to 1.2

## 注意事项

1. `touchAction: 'none'` 是必须的，否则 Android WebView 会拦截双指手势，导致无法缩放
2. 滑动翻页和双指缩放互斥：双指操作时不触发翻页，单指滑动时也不触发缩放
3. 外层容器的 padding 要单独处理，移动端设为 0