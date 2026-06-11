#步骤2：CSS加载链路诊断

## 检查目标

确认 `-webkit-app-region: drag` 是否真的能应用到 DOM。

## 检查结果

### ✅ CSS入口文件路径

- `globals.css` 在 `src/renderer/index.tsx` 第16 行导入
- `index.css` 在 `src/renderer/index.tsx` 第17 行导入
-两者都在主入口被显式导入，**会被 Vite + PostCSS 处理**

### ✅ Tailwind 配置

- `tailwind.config.js` 第4 行：`content: ['./src/renderer/**/*.{js,jsx,ts,tsx}']`
-扫描所有 `.tsx` 文件，能够识别 `.title-bar`、`.controls` 等类名
- 第121 行：`preflight: false`，**Tailwind 的全局 reset不会启用**，不会冲突

### ✅ PostCSS 配置

- `postcss.config.js` 配置了：
 - `tailwindcss/nesting` - 支持 CSS嵌套
 - `tailwindcss` - 处理 Tailwind
 - `autoprefixer` - 自动添加浏览器前缀
 - `postcss-preset-mantine`
 - `postcss-simple-vars`

###结论

CSS加载链路**正常**。`-webkit-app-region: drag`会被 PostCSS 处理并保留（autoprefixer 会为非 webkit 内核添加前缀）。

**⚠️ 但是有一个潜在隐患**：

`.title-bar` 和 `.controls` 是普通的 CSS 类名，没有使用 Tailwind 的 `@layer` 或 `:where()` 等机制。它们是**直接定义在 `index.css` 中的普通类选择器**。

如果某个组件库（如 Mantine）的样式表中**也定义了 `.title-bar` 或 `.controls` 类**，则**样式冲突**。具体需运行时在 DevTools 中查看 Computed样式来确认。

### 下一步验证

在 DevTools 中查看标题栏元素的 Computed样式，确认：
- `-webkit-app-region` 的值是否为 `drag`
- 是否被其他样式覆盖
