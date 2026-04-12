# PatentHub 远程审查搭子服务器部署指南

## 📋 概述

本文档详细介绍如何搭建和配置 PatentHub 的远程专利审查搭子服务器，让团队成员可以共享自定义的 AI 专利助手。

---

## 🏗️ 系统架构

```
┌─────────────────┐      ┌─────────────────┐
│   PatentHub     │─────▶│  本地Node.js    │
│   客户端        │      │  服务器         │
│                 │      │  (端口3000)     │
└─────────────────┘      └─────────────────┘
        │                         │
        │                         │
        │                   ┌─────▼─────┐
        │                   │ JSON数据   │
        │                   │ 文件       │
        │                   │(搭子配置)  │
        │                   └───────────┘
        │
   ┌────▼────┐
   │ 团队成员 │
   │ (局域网) │
   └─────────┘
```

---

## 📁 项目文件结构

```
patent-api/
├── server.js           # Node.js 服务器主程序
├── copilots-data.json  # 搭子数据文件（可自定义修改）
├── package.json        # 项目依赖配置
└── node_modules/      # 依赖包（自动生成）
```

---

## 🚀 快速开始

### 1. 安装依赖

在 `patent-api` 目录下打开终端，运行：

```bash
cd patent-api
npm install express cors
```

### 2. 启动服务器

```bash
node server.js
```

服务器启动后会显示：

```
==================================================
🎉 服务器启动成功！
==================================================
📍 本地访问: http://localhost:3000
📍 局域网访问: http://192.168.101.5:3000

📝 数据文件: copilots-data.json
💡 修改数据后无需重启，刷新页面即可生效！

按 Ctrl+C 停止服务器
==================================================
```

### 3. 修改 PatentHub 客户端配置

打开文件：`src/renderer/packages/remote.ts`

找到 `listCopilots` 函数，修改服务器地址：

```typescript
// 修改前
const res = await ofetch<Response>(`${getAPIOrigin()}/api/copilots/list`, {...})

// 修改后（局域网IP）
const res = await ofetch<Response>('http://192.168.101.5:3000/api/copilots/list', {...})
```

### 4. 启动 PatentHub

```bash
pnpm dev
```

### 5. 使用远程搭子

1. 打开 PatentHub
2. 进入"我的搭子"页面
3. 打开"显示PatentHub精选"开关
4. 即可看到远程服务器上的搭子

---

## 📝 管理搭子数据

### 数据文件位置

```
patent-api/copilots-data.json
```

### 搭子数据格式

```json
{
  "id": "唯一标识符",
  "name": "显示名称",
  "picUrl": "头像URL（可空）",
  "prompt": "系统提示词（AI角色设定）",
  "demoQuestion": "示例问题",
  "demoAnswer": "示例回答（可空）",
  "starred": true或false,
  "usedCount": 0,
  "shared": true
}
```

### 添加新搭子

在 `copilots-data.json` 数组中添加新对象：

```json
{
  "id": "my-copilot-04-xxx",
  "name": "🎯 04 新搭子名称",
  "picUrl": "",
  "prompt": "你的AI角色提示词...",
  "demoQuestion": "示例问题",
  "demoAnswer": "",
  "starred": false,
  "usedCount": 0,
  "shared": true
}
```

**重要**：
- 修改数据文件后**无需重启服务器**
- 刷新 PatentHub 页面即可看到更新

---

## 🔧 常见问题

### Q1: 如何让同事也能使用？

1. 确保大家连接同一个 WiFi（局域网）
2. 告诉同事你的 IP 地址
3. 让他们修改 `remote.ts` 中的地址为你的 IP

### Q2: 如何查看服务器日志？

服务器终端会显示请求日志：

```
收到请求，语言: zh-Hans
返回 3 个搭子
```

### Q3: 端口被占用怎么办？

修改 `server.js` 中的端口号：

```javascript
const PORT = 3001;  // 改成其他端口
```

### Q4: 如何停止服务器？

在服务器终端按 `Ctrl + C`

---

## 🔐 局域网访问说明

### 查看本机 IP 地址

在 CMD 中运行：
```bash
ipconfig
```

找到 "IPv4 地址"，例如：`192.168.101.5`

### 团队成员连接

其他同事需要修改 `remote.ts`：

```typescript
// 假设你的IP是 192.168.101.5
const res = await ofetch<Response>('http://192.168.101.5:3000/api/copilots/list', {...})
```

---

## 📌 现有搭子示例

当前已配置的搭子：

1. **🔍 01 发明构思检索** - 基于发明构思联网检索现有技术
2. **👤 02 申请人信息调研** - 调研申请人/发明人背景信息
3. **🌐 03 专利文献翻译（阿拉伯语）** - 专利文献阿拉伯语翻译

---

## 🛠️ 技术细节

### 服务器端

- **框架**: Express.js
- **端口**: 3000（默认）
- **API**: POST `/api/copilots/list`
- **数据格式**: JSON

### 客户端

- **缓存**: 已设置为每次都获取最新数据（staleTime: 0）
- **请求库**: ofetch

---

## 📞 支持

如有问题，请检查：
1. 服务器是否正在运行
2. IP 地址是否正确
3. 防火墙是否阻止了端口
4. JSON 格式是否正确

---

*文档创建时间：2026年4月*
*作者：PatentHub团队*
