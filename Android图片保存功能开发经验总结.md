# Android 图片保存功能开发经验总结

## 背景

PatentHub Android 版本的图片生成模块，用户反馈点击下载/保存按钮完全没有反应，没有任何提示，也无法将生成的图片保存到手机相册。

---

## 问题排查过程（四层递进）

### 第一层：按钮点击事件是否触发了？

**现象**：放大按钮、引用按钮都正常工作，唯独下载按钮点击后毫无反应。

**验证方式**：对比其他有反馈的按钮，确认下载按钮的 `onClick` 事件绑定正确。

**结论**：按钮点击事件本身是触发的，问题出在 `platform.exporter.exportImageFile()` 函数内部执行逻辑。

---

### 第二层（核心问题）：使用了哪个 Platform？—— 环境变量缺失

**关键发现**：查看 `src/renderer/platform/index.ts` 中的 Platform 选择逻辑：

```ts
if (CHATBOX_BUILD_TARGET === 'mobile_app') {
  return new MobilePlatform()  // 💡 使用 Capacitor 原生 API
}
return new WebPlatform()        // ❌ 实际走这里！使用 <a> 标签下载
```

**根本原因**：GitHub Actions CI 构建 Android APK 时，`build:renderer` 命令**没有设置 `CHATBOX_BUILD_TARGET=mobile_app` 环境变量**，导致：
- 打包出来的 APK 使用 `WebPlatform`
- `WebPlatform` 用 `<a>` 标签 + `eleLink.click()` 触发下载
- **在 Android WebView 中，`<a>` 标签的 download 属性无效，点击完全没反应，且没有任何错误提示**

**用户反馈佐证**：用户截图显示 Android 版本号是 `1.0.0` 而不是最新版 `1.1.6`，确认：
1. 用户安装的是旧版 APK（CI 未正确构建）
2. 环境变量缺失导致 Platform 选择错误

**修复方案**：在 `.github/workflows/release.yml` 的 Android 构建步骤中显式设置环境变量：

```yaml
- name: Build renderer for mobile
  run: pnpm run build:renderer
  env:
    CHATBOX_BUILD_TARGET: mobile_app
    CHATBOX_BUILD_PLATFORM: android
```

---

### 第三层：MobileExporter 的 Share API 参数用错了

**现象**：修复环境变量后重新构建，点击下载**弹出了系统分享面板**，但面板里只有微信、QQ、打印等通用应用，**没有"保存到相册"选项**。

**根本原因**：`mobile_exporter.ts` 中使用了：

```ts
// ❌ 错误 —— url 参数在 Android 上表示分享"网页链接"
await Share.share({ url: savedFile.uri })
```

Android 的 `Share.share({ url })` 会把文件路径当成网页链接处理，系统不知道这是一个本地图片文件，所以不会触发文件类型识别，相册 App 自然也不会出现在分享面板中。

**修复方案**：改用 `files` 参数：

```ts
// ✅ 正确 —— files 数组让 Android 识别文件 MIME 类型
await Share.share({ files: [savedFile.uri] })
```

Android 系统收到 `files` 参数后会根据文件扩展名推断 MIME 类型，然后相册、图片编辑等 App 才会出现在分享面板中。

---

### 第四层：用户体验优化 —— 直接保存到相册

**用户需求**：不想要分享面板弹出来，希望点击后**直接保存到手机相册**，并 Toast 提示成功。

**方案对比**（从简单到强大）：

| 方案 | 优点 | 缺点 |
|---|---|---|
| 系统分享面板 | 实现简单，不需要额外权限 | 多一次用户操作，体验不佳 |
| 写入 `Pictures` 目录 + 媒体扫描 | 一键保存到相册，体验最佳 | 需要存储权限处理 |
| 第三方插件 `@capacitor-community/media` | API 最直接 | 版本不兼容，依赖 Capacitor 版本 |

**最终实现**：使用 Capacitor 内置 `Filesystem` 插件，采用多级 fallback 策略：

```
第1级：写入 Directory.ExternalStorage + Pictures/PatentHub → 触发媒体扫描 → Toast "已保存到相册"
第2级：写入 Directory.Documents + PatentHub → Toast "已保存到文件夹"
第3级：写入 Cache 目录 + 系统分享面板（终极 fallback）
```

**核心代码片段**：

```ts
// 1. 直接写入 Pictures 目录
const result = await Filesystem.writeFile({
  path: `Pictures/PatentHub/${fileName}`,
  data: base64Data,
  directory: Directory.ExternalStorage,
})

// 2. 触发 Android 媒体扫描
if (Capacitor.getPlatform() === 'android') {
  await Filesystem.appendFile({
    path: result.uri,
    data: '',  // 空写入触发媒体库刷新
    directory: Directory.ExternalStorage,
  })
}
```

---

## 过程中遇到的次生问题

### 1. AndroidManifest.xml 主题引用错误

**问题**：修复存储权限时，我错误地将 `android:theme="@style/AppTheme"` 改成了 `android:theme="@style.AppTheme"`（点号 vs 斜杠）。

**后果**：AAPT 资源链接失败，CI 构建中断。

**教训**：Android 资源引用的正确格式是 `@style/`（斜杠），而不是 `@style.`（点号）。这是 Android 基础语法，低级但致命的错误。

---

### 2. `requestLegacyExternalStorage` 不兼容

**问题**：我添加了 `android:requestLegacyExternalStorage="true"` 属性，但在 `targetSdkVersion 35` 下这个属性已被废弃。

**后果**：AAPT 编译验证失败。

**教训**：Android 10+ (API 29+) 已经不需要 `requestLegacyExternalStorage`。应该使用 `MediaStore` API 或 Capacitor `Filesystem` 插件来管理文件。

---

### 3. `@capacitor-community/media` 版本不兼容

**尝试**：安装 `@capacitor-community/media` 插件来实现一键保存到相册。

**问题**：
- `v9.1.0` → 要求 `@capacitor/core >= 8.0.0`，项目用的是 `7.4.5`
- `v6.0.0` → 要求 `@capacitor/core ^6.0.0`，也不匹配

**结论**：第三方插件对 Capacitor 主版本号有严格依赖，无法降级或升级时只能放弃，改用原生插件组合实现。

---

## 关键经验总结

### 经验 1：环境变量是移动端构建的命门

Capacitor 项目中，**环境变量是连接 Web 代码和原生能力的桥梁**。CI 构建时必须确保：

```
CHATBOX_BUILD_TARGET=mobile_app  →  告诉 Web 层走 Mobile Platform
CHATBOX_BUILD_PLATFORM=android   →  告诉代码当前是 Android 环境
```

如果缺失，所有原生 API 调用都会静默失效（走 Web 平台 fallback 逻辑），没有任何错误提示，调试难度极高。

---

### 经验 2：Android 分享 API 的 url vs files 区别

| 参数 | 含义 | Android 行为 |
|---|---|---|
| `url: string` | 分享**网页链接** | 系统用浏览器打开，不识别本地文件 |
| `files: string[]` | 分享**本地文件** | 系统根据扩展名识别 MIME 类型，显示匹配 App |

**一句话**：分享本地文件永远用 `files`，不要用 `url`。

---

### 经验 3：调试"按钮点击无反应"的排查顺序

```
Step 1: 确认事件绑定
        → 对比其他正常按钮，确认 onClick 被调用
Step 2: 确认 Platform 选择
        → console.log 打印当前使用的 Platform 实例
Step 3: 确认 Platform 实现代码是否执行
        → 在方法内部加 console.log 追踪
Step 4: 确认原生插件是否可用
        → 检查 Capacitor 插件注册和权限
Step 5: 查看 Android Logcat
        → 原生层面的错误不会传到 Web Console
```

---

### 经验 4：Android 存储权限版本演进

| Android 版本 | API Level | 存储方式 | 权限要求 |
|---|---|---|---|
| 6-9 | 23-28 | 直接写文件 | `WRITE_EXTERNAL_STORAGE` 运行时申请 |
| 10-12 | 29-32 | `MediaStore` API | 无需额外权限 |
| 13+ | 33+ | `MediaStore` API | `READ_MEDIA_IMAGES`（细粒度） |

使用 Capacitor `Filesystem` 插件的 `Directory.ExternalStorage` 可以自动处理大部分版本差异。

---

### 经验 5：版本号同步避免混淆

Android `build.gradle` 的 `versionName` 应从 CI 环境变量读取，与 `package.json` 保持同步：

```groovy
versionName System.getenv("APP_VERSION_NAME") ?: "1.0"
```

这样用户可以通过设置中的版本号确认自己是否安装的是最新版，减少排查问题时的干扰因素。

---

### 经验 6：多级 fallback 是移动端开发的必修课

移动端设备碎片化严重，存储路径、权限、系统版本差异都会导致保存失败。**永远不要只准备一条路径**：

```ts
async function saveImage(base64Data: string, fileName: string): Promise<string> {
  // Level 1: 保存到相册
  try {
    return await saveToAlbum(base64Data, fileName)
  } catch (e1) {
    console.warn('Save to album failed:', e1)
  }

  // Level 2: 保存到文档目录
  try {
    return await saveToDocuments(base64Data, fileName)
  } catch (e2) {
    console.warn('Save to documents failed:', e2)
  }

  // Level 3: 走系统分享
  try {
    return await shareFile(base64Data, fileName)
  } catch (e3) {
    throw new Error('All save methods failed')
  }
}
```

---

## 最终修复文件清单

| 文件 | 修改内容 |
|---|---|
| `.github/workflows/release.yml` | 添加 `CHATBOX_BUILD_TARGET=mobile_app` 环境变量 |
| `android/app/build.gradle` | `versionName` 从环境变量读取 |
| `android/app/src/main/AndroidManifest.xml` | 添加存储权限声明，修复主题引用语法 |
| `android/app/src/main/res/xml/file_paths.xml` | 添加 files-path 路径配置 |
| `android/app/src/main/res/values/styles.xml` | 修复 SplashScreen 主题引用兼容性 |
| `src/renderer/platform/mobile_exporter.ts` | **核心修复**：重写保存逻辑，`url` → `files`，添加相册保存 + 三级 fallback |
| `src/renderer/routes/image-creator/-components/GeneratedImagesGallery.tsx` | `handleDownload` 添加 `await`，确保异步执行完成 |
| `src/renderer/routes/image-creator/index.tsx` | 缩小移动端模型选择按钮宽度，避免工具栏拥挤 |

---

## 写在最后

这次修复暴露了一个系统性问题：**Capacitor 项目的 CI 构建缺少环境变量校验机制**。Web 平台的静默 fallback 让问题在开发阶段无法被发现。后续建议：

1. 在 `platform/index.ts` 中添加运行时的 Platform 检测日志（首次加载时打印当前 Platform 类型）
2. 在 CI 构建脚本中添加环境变量检查（缺失则报错中止）
3. 为移动端下载功能添加 Toast 反馈（无论成功失败都给用户明确提示）
