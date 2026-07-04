# PatentHub Web Mac 部署指南

## 📦 需要拷贝到 Mac 的文件

在 Windows 构建完成后，将以下内容拷贝到 Mac 电脑：

### 方式一：拷贝完整项目（推荐）

拷贝整个项目文件夹到 Mac，路径例如：
```
~/Projects/PatentHub/
```

项目结构如下：
```
~/Projects/PatentHub/
├── release/app/dist/renderer/     ← Web 生产版本
├── start-web.sh                   ← 启动脚本
├── setup-autostart.sh             ← 开机自启动脚本
├── package.json                   ← 项目配置
└── ...（其他项目文件）
```

### 方式二：只拷贝必要的文件

如果只想部署 Web 版本，拷贝以下文件：

```
要拷贝的文件/文件夹：
├── release/app/dist/renderer/     （整个文件夹）
├── start-web.sh
├── setup-autostart.sh
├── package.json
└── package-lock.json
```

**建议的文件夹组织结构：**
```
~/PatentHub/
├── app/                           ← 新建此文件夹
│   └── dist/renderer/             ← 从 Windows release/app/dist/renderer 拷贝
├── scripts/                        ← 新建此文件夹
│   ├── start-web.sh               ← 从项目根目录拷贝
│   └── setup-autostart.sh         ← 从项目根目录拷贝
└── package.json                   ← 从项目根目录拷贝
```

## 🔧 Mac 配置步骤

### 第一步：安装 Node.js

Mac 需要先安装 Node.js（如果没有的话）：

```bash
# 使用 Homebrew 安装
brew install node

# 验证安装
node --version
npm --version
```

### 第二步：安装 pnpm

```bash
npm install -g pnpm
```

### 第三步：安装依赖

```bash
cd ~/PatentHub
pnpm install
```

### 第四步：赋予脚本执行权限

```bash
chmod +x ~/PatentHub/scripts/start-web.sh
chmod +x ~/PatentHub/scripts/setup-autostart.sh
```

### 第五步：启动服务器

```bash
cd ~/PatentHub
./scripts/start-web.sh
```

服务器将在 `http://localhost:1212/` 启动

### 第六步：获取本机 IP

```bash
ifconfig | grep "inet " | awk '{print $2}'
```

### 第七步：同事访问

在浏览器打开：`http://192.168.x.x:1212/`

---

## ⚙️ Mac 防火墙配置

Mac 默认可能阻止外部访问，需要配置：

### 方法一：通过系统偏好设置

1. Apple 菜单 → 系统偏好设置 → 安全性与隐私 → 防火墙
2. 点击「打开防火墙」
3. 点击「防火墙选项...」
4. 添加 Node.js 或 Terminal 为例外

### 方法二：通过命令行

```bash
# 允许 Node.js 接受传入连接
/usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/node
/usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /usr/local/bin/node
```

---

## 🔄 版本更新步骤

当 Windows 更新了代码需要重新部署时：

### 方式一：重新构建 Mac 版本

1. 在 Windows 上 `pnpm build:web` 构建
2. 拷贝 `release/app/dist/renderer/` 覆盖 Mac 上的文件
3. 重启服务器即可

### 方式二：在 Mac 上重新构建

```bash
cd ~/PatentHub
git pull                    # 拉取最新代码
pnpm build:web              # 重新构建
./scripts/start-web.sh     # 重启服务器
```

---

## 📁 推荐的 Mac 文件夹组织（完整版）

```
~/PatentHub/
├── src/                              （源代码）
├── release/
│   └── app/dist/renderer/             （构建产物）
├── scripts/
│   ├── start-web.sh                  （启动脚本）
│   └── setup-autostart.sh            （开机自启动）
├── package.json
├── pnpm-lock.yaml
└── node_modules/                     （依赖）
```

---

## 🆘 常见问题

### Q: 提示「无法打开，因为无法验证开发者」？

```bash
# 允许未知开发者
xattr -rd com.apple.quarantine ~/PatentHub/scripts/start-web.sh
```

### Q: 端口被占用？

修改 `scripts/start-web.sh` 中的端口：
```bash
# 将 -l tcp://0.0.0.0:1212 改为其他端口
```

### Q: 如何停止服务器？

在运行脚本的终端按 `Ctrl+C`

### Q: 如何设置开机自启动？

```bash
cd ~/PatentHub/scripts
./setup-autostart.sh
# 选择 1 启用开机自启动
```

---

**创建日期**：2026-06-15