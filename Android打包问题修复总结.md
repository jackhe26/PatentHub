# Android 打包问题修复总结

## 📅 日期
2025年5月21日

## 🔧 修复的问题

### 1. Java 版本问题
- **问题**：Android 构建失败，Capacitor 7 需要 Java 21
- **解决**：在 `.github/workflows/release.yml` 中将 Java 版本从 17 升级到 21
```yaml
- name: Setup Java
  uses: actions/setup-java@v4
  with:
    distribution: 'temurin'
    java-version: '21'
```

### 2. Linux maintainer 缺失
- **问题**：Linux 构建警告缺少 maintainer 信息
- **解决**：在 `electron-builder.yml` 中添加 maintainer
```yaml
linux:
  maintainer: heyuan188@126.com
  vendor: PatentHub
```

### 3. release/build 目录不存在
- **问题**：`cp: cannot create regular file 'release/build/PatentHub-android.apk': No such file or directory`
- **解决**：在 workflow 中添加 `mkdir -p release/build`

### 4. APK 未签名导致安装失败
- **问题**：`packageinfo is null` - 使用了未签名的 Release APK (`app-release-unsigned.apk`)
- **解决**：
  - 在 `android/app/build.gradle` 中配置签名
  - 修改 workflow 使用已签名的 `app-release.apk`

### 5. Gradle 配置顺序错误
- **问题**：`Could not get unknown property 'release' for SigningConfig container`
- **原因**：`signingConfigs` 必须在 `buildTypes` 之前定义
- **解决**：调整 `android/app/build.gradle` 中代码顺序

## 📝 修改的文件

| 文件 | 修改内容 |
|------|---------|
| `.github/workflows/release.yml` | Java 17→21, 添加 mkdir, 使用已签名 APK |
| `electron-builder.yml` | 添加 Linux maintainer |
| `android/app/build.gradle` | 添加签名配置，调整代码顺序 |

## 💡 关键经验

1. **APK 签名**：Release APK 必须签名才能安装到手机，使用 `app-release.apk` 而非 `app-release-unsigned.apk`

2. **Gradle 语法**：`signingConfigs` 必须放在 `buildTypes` 之前，否则会报 `unknown property 'release'` 错误

3. **Debug vs Release**：
   - Debug APK：自动签名，可直接安装
   - Release APK：需要手动配置签名

4. **目录创建**：复制文件前确保目标目录存在，使用 `mkdir -p`

## ✅ 最终结果
- Windows ✅
- macOS ✅
- Linux ✅
- Android ✅ (已签名 Release APK)
