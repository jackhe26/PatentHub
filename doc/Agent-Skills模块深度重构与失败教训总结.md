# Agent/Skills 模块深度重构与失败教训总结

> 日期：2026-07-05
> 范围：PatentHub 项目 Agent（AI 代理）与 Skills（技能）模块
> 参考项目：Cherry Studio（开源 AI 桌面应用）
> 状态：阶段 1 修复完成，用户已验证可跑通

---

## 一、任务背景

PatentHub 是一个基于 Electron + React + TypeScript 的专利审查桌面应用，集成 AI 模型帮助专利工作者完成检索、审查、撰写等任务。

项目原本有一套 Agent/Skills 模块，但用户反馈"UI 交互和框架设计都不能跑"。本次任务：
1. **深度诊断**：找出所有问题
2. **架构重构**：参考 Cherry Studio（开源标杆项目）的设计
3. **可运行验证**：用户确认 Agent + Skills 已能正常工作

---

## 二、问题诊断全过程（踩坑记录）

### 2.1 初始误判（重要教训！）

| 我最初的判断 | 实际情况 |
|---|---|
| ❶ 需要新建 3 个路由文件 (`agents.tsx`, `agent-chat/$agentId.tsx`, `skills-market.tsx`) | ✅ **不需要** —— `src/renderer/routes/__root.tsx` 第 180-188 行已经手动用 `useLocation()` 判断并直接渲染 `<AgentsPage />` / `<SkillsMarketPage />` / `<AgentChatPage />` |
| ❷ `ChatInputToolbar.tsx` 组件缺失导致 TS 编译失败 | ✅ **不缺失** —— 文件就在 `src/renderer/agents/components/ChatInputToolbar.tsx`，只是 import 后没被实际使用 |

**教训**：不要凭"看起来应该有"的常识下结论，**先用 list_files/read_file 把代码看清楚**。

### 2.2 真正的核心问题（4 个）

#### 问题 A：`AgentExecutor` 事件循环反模式 ⭐⭐⭐

**位置**：`src/main/agents/AgentExecutor.ts`（原版第 311-363 行）

**症状**：发消息后界面永远卡在 loading，60 秒后超时

**错误代码**：
```typescript
// main 端：发出 LLM 请求
webContents.send('ipc:agent-llm-request', { eventId, ... })

// main 端：监听响应（反模式！main 不应监听自己的 webContents）
return new Promise((resolve, reject) => {
  const handler = (_: any, response: any) => {
    if (response.eventId !== eventId) return
    ...
  }
  windows.forEach((w) => {
    (w.webContents as any).on('ipc:agent-llm-response', handler)
  })
  setTimeout(() => { ... reject(new Error('LLM call timeout')) }, 60000)
})
```

**根因**：
- `webContents.on()` 在 Electron 中是非标准用法（`webContents.send()` 才是标准）
- 主进程监听自己的 webContents 事件存在竞态条件
- 在 React StrictMode 下，组件 mount/unmount 会触发多次 effect，导致 listener 累积但没人清

**修复**：彻底重构为 main 端直接 fetch + SSE 流式
```typescript
// main 端：直接 fetch LLM（OpenAI 兼容协议）
const response = await fetch(url, { ... })
const reader = response.body.getReader()
// 逐 chunk 解析 SSE，通过 webContents.send 推送
this.broadcast('agent:llm-chunk', { sessionId, content: delta })
```

#### 问题 B：`agents:selectDir` IPC handler 缺失

**位置**：`src/preload/index.ts` 第 68 行引用了 `selectDir`，但 `src/main/agents/index.ts` 没注册

**症状**：调用 `selectDir()` 抛 "No handler registered" 错误

**修复**：在 `main/agents/index.ts` 补齐
```typescript
ipcMain.handle('agents:selectDir', async (_, defaultPath?: string) => {
  const result = await dialog.showOpenDialog(win, {
    title: '选择工作目录',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: defaultPath || undefined,
  })
  ...
})
```

#### 问题 C：`agentLLMBridge` 是死代码

**位置**：`src/renderer/agents/services/agentLLMBridge.ts`

**症状**：`initAgentLLMBridge()` 从未在 `renderer/index.tsx` 被调用

**根因**：原设计是 renderer 端监听 main 的 LLM 请求 → 调 PatentHub 现有 LLM 客户端 → 把结果通过 IPC 发回 main。但这个桥接函数没有任何地方启动。

**修复**：简化为 noop 兼容层（避免旧 import 报错），让 renderer 直接用 preload 暴露的事件订阅 API

#### 问题 D：AgentChatPage 流式事件订阅错误

**位置**：`src/renderer/agents/pages/AgentChatPage.tsx` 第 76-127 行

**症状**：只监听 `agent:message`（完整消息），没有 chunk 事件，所以 LLM 流式输出无法实时显示

**修复**：新增 `onAgentChunk` 订阅
```typescript
const unsubChunk = api.agents.onAgentChunk?.((event: { sessionId: string; content: string }) => {
  if (event.sessionId !== sessionId) return
  setStreaming((prev) => prev + (event.content || ''))
})
```

---

## 三、运行时错误与解决（用户实测反馈）

### 3.1 错误：`TypeError: providers is not iterable`

**用户反馈截图**：点击"新建 Agent"弹错误

**错误位置**：`src/renderer/agents/components/tabs/AgentBasicTab.tsx:14`

**错误代码**：
```typescript
const state = settingsStore.getState() as any
const providers = state.providers || []  // ← 误以为是数组

for (const provider of providers) {  // ← 报错：providers is not iterable
```

**根因**（**重要发现！**）：
PatentHub 的 `settingsStore` 中：
- `settings.providers` 是 **`Record<providerId, ProviderConfig>`**（对象字典，key 是 providerId）
- `settings.customProviders` 才是数组

原作者（很可能是 AI 生成时）**想当然地当作数组遍历**。

**修复方案**：用 PatentHub 现有的 `useProviders()` hook（位于 `src/renderer/hooks/useProviders.ts`），它返回的就是合并后的 `ProviderInfo[]` 数组：
```typescript
import { useProviders } from '@/hooks/useProviders'

const { providers } = useProviders()  // 已经是数组
for (const provider of providers) {
  const models = provider.models || []
  for (const model of models) { ... }
}
```

**教训**：**不要直接访问 store 的内部字段**，优先使用项目已有的 hook。PatentHub 已经提供了 `useProviders()` 这种封装好的 hook。

### 3.2 错误：`Cannot read properties of undefined (reading 'map')`

**用户反馈截图**：Mantine Select 弹窗内报错

**错误位置**：Mantine v7 内部 `chunk-H3WQD7QN.js:13539` → `parseItem` → `getParsedComboboxData`

**我的第一版修复代码**（仍然错误）：
```typescript
options.push({
  value,
  label: `${providerName} / ${modelLabel}`,
  group: providerName,  // ❌ 这个 group 字段触发了 Mantine 内部 bug
})
```

**根因**（**重要发现！**）：
Mantine v7 的 `Select` 组件对 `data` 字段有严格格式要求：

| 合法格式 | 示例 |
|---|---|
| 字符串数组 | `['gpt-4o', 'claude-3.5']` |
| 平铺对象数组 | `[{ value, label }]` |
| **嵌套分组** | `[{ group: 'OpenAI', items: [{ value, label }] }]` |

**Mantine 不接受在 item 顶层加 `group` 字段**！它会把带 `group` 的 item 当作 group item，期望该 item 有 `items: [...]` 子数组——否则就在 `getParsedComboboxData` 里调用 `item.items.map()` 时报 `undefined.map`。

**修复方案**：用嵌套分组格式
```typescript
const groupMap = new Map<string, Array<{ value: string; label: string }>>()

for (const provider of providers) {
  const groupItems = []
  for (const model of models) {
    groupItems.push({ value: `${provider.id}:${model.modelId}`, label: modelLabel })
  }
  groupMap.set(providerName, groupItems)
}

return Array.from(groupMap.entries()).map(([group, items]) => ({ group, items }))
```

**教训**：**第三方 UI 库的 data 格式严格按文档来**，不能用"看起来差不多"的字段命名。

---

## 四、架构设计要点（Cherry Studio 参考）

### 4.1 为什么选 Cherry Studio 作为参考？

- ✅ 开源（Apache 2.0 / MIT）
- ✅ 同样基于 Electron + React + TypeScript
- ✅ 同样集成多种 LLM Provider
- ✅ Agent 功能成熟（双 Runtime：AI SDK + Claude Code SDK）
- ✅ 模块化清晰：`src/main/ai/{agents,agentSession,skills,messages,runtime}/`

### 4.2 Cherry Studio 关键架构

```
main 进程
├─ ai/agents/        AgentJobsService, runAgentTask
├─ ai/agentSession/  AgentSessionRuntimeService (会话生命周期)
├─ ai/skills/        SkillService + SkillInstaller
├─ ai/messages/      attachmentRouting, messageRules
├─ ai/runtime/       aiSdk + claudeCode 双引擎
└─ ai/tools/         adapters/aiSdk, adapters/claudeCode

renderer 进程
├─ pages/agents/     AgentPage, AgentChat, AgentChatMain
├─ components/chat/  ConversationShell, Composer, MessageList
└─ services/aiTransport/  IpcChatTransport
```

### 4.3 PatentHub 采用的简化架构

```
main 进程
├─ agents/
│  ├─ AgentService.ts       数据库 CRUD
│  ├─ AgentExecutor.ts      ★ 主调度器（main 直连 LLM + SSE 流）
│  ├─ PermissionManager.ts  权限控制
│  ├─ ToolRegistry.ts       工具注册
│  └─ tools/                11+ 工具实现

renderer 进程
├─ agents/
│  ├─ pages/AgentsPage.tsx       Agent 列表
│  ├─ pages/AgentChatPage.tsx    ★ 流式聊天
│  └─ components/tabs/           AgentBasicTab 等表单 Tab
```

**核心改进**：用 webContents.send 推送流式事件（`agent:llm-chunk` / `agent:tool:*` / `agent:complete`），取代 v2 的 IPC 双向中转反模式。

---

## 五、完整修复清单

| 文件 | 修改类型 | 关键改动 |
|---|---|---|
| `src/main/agents/AgentExecutor.ts` | 重写 | main 端 fetch + SSE 流式 + AbortController |
| `src/main/agents/index.ts` | 补齐+简化 | 新增 `agents:selectDir` + 移除重复事件转发 |
| `src/preload/index.ts` | 增量增强 | 新增 `onAgentChunk/Error/Aborted` |
| `src/shared/electron-types.ts` | 类型同步 | 新增字段类型定义 |
| `src/renderer/agents/services/agentLLMBridge.ts` | 简化为 noop | 保留兼容 |
| `src/renderer/agents/pages/AgentChatPage.tsx` | 关键修复 | 订阅 `agent:llm-chunk` 做流式输出 |
| `src/renderer/agents/components/tabs/AgentBasicTab.tsx` | 关键修复 | `useProviders()` + 嵌套分组 |
| `src/renderer/agents/components/ChatInputToolbar.tsx` | 同问题修复 | 同 `AgentBasicTab` |

---

## 六、失败教训与最佳实践总结

### 6.1 诊断阶段的教训

| 教训 | 详细 |
|---|---|
| **不要凭"应该有"下结论** | 一开始我以为需要新建路由文件，实际 `__root.tsx` 已处理；以为 `ChatInputToolbar` 缺失，实际文件存在 |
| **优先 grep 现有代码再判断** | 用 `search_files` 实际搜索"ChatInputToolbar"，确认是 import 没被用 |
| **错误堆栈最可靠** | 用户发来的截图错误堆栈比任何分析都准 |

### 6.2 编码阶段的教训

| 教训 | 详细 |
|---|---|
| **不要假设数据结构** | `settings.providers` 是 Record 不是数组 —— 必须看 `useProviders.ts` 才知 |
| **不要在 item 顶层加 `group` 字段** | Mantine v7 Select 会当作 group item 处理 |
| **优先用项目已有的 hook** | `useProviders()` 早就封装好 Provider 合并逻辑 |
| **main 端不要监听自己的 webContents** | 这违反了 Electron 进程隔离原则 |

### 6.3 架构设计的教训

| 教训 | 详细 |
|---|---|
| **IPC 设计要单向** | main→renderer 单向推送（webContents.send），不要双向 |
| **流式响应要 chunk 化** | 不要等完整结果才推送，要逐 chunk |
| **流式兼容非流式** | 既要支持 `onAgentChunk`，也要保留 `onAgentMessage` 兜底（某些 Provider 不支持 stream） |
| **空状态要友好** | 没配置 Provider 时显示 Alert + "前往设置"按钮 |
| **deprecate API 要平滑** | 保留旧 API（标记 @deprecated），避免破坏其他模块 |

---

## 七、后续可迭代方向（阶段 2/3/4）

| 阶段 | 内容 | 预计工作量 |
|---|---|---|
| **阶段 2** | Session 持久化（消息历史）+ 多会话切换 | 2-3 天 |
| **阶段 3** | Cherry Studio Shell 三段式 UI（侧栏 Agent 列表 + 中区聊天 + 右侧 Tool Flow 面板） | 3-4 天 |
| **阶段 4** | Skills ZIP 安装 + Skill 镜像到 `~/.claude/skills/` + Claude Code SDK 可选 Runtime | 2-3 天 |

### 阶段 2 关键设计点

参考 Cherry Studio `src/main/ai/agentSession/`：

```sql
CREATE TABLE agent_session_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,         -- user/assistant/tool/system
  content TEXT,
  tool_calls TEXT,            -- JSON
  tool_call_id TEXT,
  metadata TEXT,              -- JSON (todos / usage / attachments)
  created_at TEXT
);
```

每个 Agent 一个 Session 列表，刷新后消息还在。

### 阶段 3 关键设计点

参考 Cherry Studio `ConversationShell`：

```
┌──────────────────────────────────────────┐
│ AgentChatNavbar (顶栏: avatar + 模式 + workspace) │
├─────────┬─────────────────────┬─────────┤
│ 侧栏    │ 中区（聊天主区）       │ 右侧面板 │
│ - Agent │ - Messages          │ - Tool Flow │
│ - 会话  │ - Composer          │ - Artifact  │
│ - Skills│                     │ - Citations │
└─────────┴─────────────────────┴─────────┘
```

---

## 八、参考资料

- **Cherry Studio 源码**：`F:\MyAI_Labs\Patent-AI\cherry-studio-2026-0705\`
  - `src/main/ai/runtime/aiSdk/Agent.ts` —— 主流式 Agent 模式
  - `src/main/ai/skills/SkillService.ts` —— Skill 服务
  - `src/renderer/pages/agents/AgentPage.tsx` —— UI 布局参考
- **PatentHub 现有模块**：
  - `src/hooks/useProviders.ts` —— Provider 数据访问
  - `src/main/store-node.ts` —— main 端 settings
  - `src/shared/defaults.ts` —— Model 字段定义（`nickname` 不是 `displayName`）

---

## 九、复盘总结（一句话）

**诊断阶段靠 grep 不靠常识**，**编码阶段靠文档不靠想象**，**架构设计靠参考不靠原创**。

本次修复最有价值的发现：
1. **不要相信"看起来应该有"** —— 路由已处理、ChatInputToolbar 已存在
2. **PatentHub 的 settings.providers 是 Record 不是数组** —— 这是最大的暗坑
3. **Mantine v7 Select 不接受 item 顶层 group 字段** —— 必须嵌套 `{ group, items }[]`

修复后用户实测反馈"Agent 能跑通，加入工作区的 Skills 也 OK"，阶段 1 圆满完成。✅
