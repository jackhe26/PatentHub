# 审查搭档序号净化与 UI 徽章接入开发总结

> **一句话总结**:把 `1~9` 序号从搭档的 `name` 字段中剥离(避免污染发给 AI 的 prompt),改由 UI 层独立渲染一个序号徽章,既保留视觉定位,又消除对 AI 的误导风险。

---

## 一、问题背景与现象

用户在 PartnerHub 中内置了 9 个审查搭子(发明构思总结、提炼检索要素、非专利文献检索、通知书撰写辅助、公开不充分判断、形式缺陷审查、审查意见答复、权利要求常规判断、文献翻译),在 UI 上以 **1~9 的序号 + 中文名称** 的形式展示(见 `/copilots` 页面的网格卡片)。

搭档的 `name` 字段在数据层是这样写的:

```ts
{
  id: 'patent-copilot:08-claim-cgk',
  name: '8 权利要求常规判断',   // ⚠️ 序号被硬编码到 name 里
  prompt: '...分析专利申请文件中各项权利要求的常规技术手动/公知常识...'
}
```

序号写死在 `name` 里,看起来没问题,但实际上 `name` 字段在代码中**多处被复用**,其中最关键的一处是:

```ts
// src/renderer/routes/session/$sessionId.tsx
contentParts: [{ type: 'text', text: '你好，' + copilot.name + '！' }]
```

切换搭子后,AI 收到的第一条 user 消息实际是:

> "你好,8 权利要求常规判断!"

对于 LLM 来说,这个 "8" 极有可能被误读为权利要求书中的**第 8 项权利要求**,从而导致 AI 在后续分析专利文件时:

- ❌ 跳过对其他权利要求(尤其是独立权利要求)的整体判断
- ❌ 只针对第 8 项权利要求做 CGK 分析
- ❌ 不符合 `claim-cgk` 这个 prompt 中要求的"逐项独立分析"工作流

**用户的诉求是**:
1. **UI 上保留** 1-9 的序号徽章(方便快速定位)
2. **AI prompt 中彻底移除** 序号(避免误导)

---

## 二、问题诊断与污染路径分析

通过代码扫描,定位到 `name` 字段共 **3 处**直接进入发给 AI 的内容:

| 位置 | 代码 | 影响 |
|---|---|---|
| `src/renderer/routes/session/$sessionId.tsx:681` | `'你好，' + copilot.name + '！'` | **最严重**:切换搭子时作为 user 消息发给 AI,污染最直接 |
| `src/renderer/routes/session/$sessionId.tsx:681 之前` | `system` 消息的 `prompt` 字段 | `prompt` 内容本身不带序号前缀(已确认),不受影响 |
| `src/renderer/routes/session/$sessionId.tsx:updateSessionStore` | `name: copilot.name` | 副作用:session 标题也带序号,影响后续会话侧边栏的命名 |

> 补充:经过排查,`prompt` 字段本身不包含 "1~9 数字+空格" 格式的污染,prompt 中的 "01、发明构思总结" 等编号都是 prompt 内部的章节标题(中文顿号分隔),与本次问题无关。

---

## 三、三种方案对比

| 方案 | 思路 | 优点 | 缺点 |
|---|---|---|---|
| **A. 渲染时剥离** | 在所有渲染处用 `name.replace(/^\d+\s*/, '')` 过滤 | 改动小,数据不变 | 容易漏改一处;后端若直接使用 `name` 仍会泄漏 |
| **B. 增加 `displayName` 字段** | 数据结构加 `displayName`,UI 用后者,prompt 用前者 | 语义清晰 | 改动面大,需修改类型定义、迁移逻辑 |
| **C. 数据源头净化 + UI 独立渲染(✅ 采用)** | 从 `name` 字段直接去掉前缀,序号改为 UI 徽章 | **彻底性**:一处生效,下游自动受益;**健壮性**:未来任何调用 `name` 的代码都安全;**语义正确**:搭档的真名就是"权利要求常规判断" | 需在 4 个 UI 渲染点加一个徽章组件 |

---

## 四、最终方案 C 详解

### 4.1 数据源头净化

修改 `src/renderer/data/patent-copilots.ts`,9 个 `name` 字段统一去掉 "数字+空格" 前缀:

```diff
- name: '1 发明构思总结'
+ name: '发明构思总结'

- name: '8 权利要求常规判断'
+ name: '权利要求常规判断'

- name: '9 文献翻译（双向）'
+ name: '文献翻译（双向）'
```

这样改动后,**所有依赖 `name` 的下游代码自动受益**,不需要再做任何修补。

### 4.2 新增 UI 徽章组件

新建 `src/renderer/components/common/CopilotIndexBadge.tsx`:

```tsx
import type { FC } from 'react'
import clsx from 'clsx'

export type CopilotIndexBadgeProps = {
  /** 序号(从 1 开始) */
  index: number
  /** 尺寸,默认 md */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** 自定义类名 */
  className?: string
}

export const CopilotIndexBadge: FC<CopilotIndexBadgeProps> = ({ index, size = 'md', className }) => {
  const sizeClasses = {
    xs: 'h-4 min-w-4 text-[10px] px-1',
    sm: 'h-5 min-w-5 text-[11px] px-1.5',
    md: 'h-6 min-w-6 text-xs px-1.5',
    lg: 'h-7 min-w-7 text-sm px-2',
  }
  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center rounded-md font-semibold leading-none',
        'bg-chatbox-background-brand-secondary text-chatbox-brand',
        'border border-chatbox-brand/30',
        sizeClasses[size],
        className
      )}
      aria-label={`序号 ${index}`}
    >
      {index}
    </span>
  )
}
```

设计要点:
- **独立组件**:不依赖任何业务组件,可复用
- **4 档尺寸**:适配不同 UI 场景(网格、卡片、菜单、按钮)
- **`aria-label="序号 N"`**:无障碍标记,屏幕阅读器友好
- **品牌色**:使用 `bg-chatbox-background-brand-secondary` + `text-chatbox-brand` 与整体设计语言一致

### 4.3 接入 4 个 UI 渲染点

| 位置 | 接入方式 | 序号来源 |
|---|---|---|
| `src/renderer/routes/copilots.tsx` (我的搭档网格) | `MiniItem` 新增 `index` prop,渲染徽章 | `list.map((item, ix) => ...)` 的 `ix + 1` |
| `src/renderer/routes/index.tsx` (首页横向滚动) | `CopilotItem` 新增 `index` prop,**仅本地审查搭子显示徽章** | `idx < myCopilots.length ? idx + 1 : undefined` |
| `src/renderer/routes/session/$sessionId.tsx` 顶部菜单 | `Menu.Item` 内容改为 `<Group>{badge}{name}</Group>` | `myCopilots.map((c, index) => ...)` 的 `index + 1` |
| `src/renderer/routes/session/$sessionId.tsx` 顶部 Button | 选中状态下显示徽章,通过 `myCopilots.findIndex(c => c.id === ...)` 找到序号 | `findIndex + 1`,未选中显示 "选择搭档" |

#### 关键代码:`src/renderer/routes/session/$sessionId.tsx` 顶部 Button

```tsx
<Button variant="light" color="gray" size="sm" radius="md" className="font-semibold controls">
  {selectedCopilot ? (
    <Group gap={6} wrap="nowrap" align="center">
      <CopilotIndexBadge
        index={Math.max(
          0,
          myCopilots.findIndex((c) => c.id === selectedCopilot.id)
        ) + 1}
        size="xs"
      />
      <span>{selectedCopilot.name}</span>
    </Group>
  ) : (
    t('选择搭档')
  )}
</Button>
```

### 4.4 老用户数据迁移

在 `src/renderer/hooks/useCopilots.ts` 中新增 `migrateCopilotName` 函数,确保老用户已存的旧数据自动迁移:

```ts
const NUMBER_PREFIX_RE = /^\d+\s+/
const migrateCopilotName = (copilot: CopilotDetail): CopilotDetail => {
  if (typeof copilot.name === 'string' && NUMBER_PREFIX_RE.test(copilot.name)) {
    return { ...copilot, name: copilot.name.replace(NUMBER_PREFIX_RE, '') }
  }
  return copilot
}
```

并在 `initializePatentCopilots` 入口应用:

```ts
const initializePatentCopilots = async (currentCopilots: CopilotDetail[]): Promise<CopilotDetail[]> => {
  // ...
  // 迁移老数据的 name
  const migrated = currentCopilots.map(migrateCopilotName)
  // ...
}
```

这样:
- 新用户:直接获得干净的 `name`
- 老用户:启动时自动剥离序号前缀,下次刷新即生效

---

## 五、关键技术点总结

### 5.1 为什么从源头改更优

表面上看,只在 UI 渲染时剥离前缀改动更小。但 `name` 字段同时承担:

1. **UI 展示文本** ← 当前需求
2. **AI prompt 上下文**(`你好，` + name + `!`)
3. **session 标题**(作为会话名称传给后端)
4. **侧边栏会话列表**
5. **未来的新入口**(可能不知道有"序号前缀"这个隐藏约定)

只要有一处遗漏,就会再次污染 AI 上下文。从源头去掉是最一劳永逸的方案。

### 5.2 序号"由 UI 层计算"的设计

不在数据里绑定序号,而是根据 `myCopilots.map((c, i) => i + 1)` 在渲染时计算。带来的好处:

- ✅ 用户删除某个搭子 → 序号自然重新连续,不会出现 "1, 2, 4, 5..." 的跳跃
- ✅ 用户拖拽排序 → 序号跟着变化(后续可扩展)
- ✅ 数据迁移简单,只需迁移 `name`,不需要管 `index` 字段
- ✅ 远程搭子(remoteCopilots)不参与 1-9 编号,逻辑清晰

### 5.3 在 Mantine 组件中嵌入自定义徽章

Mantine 的 `Menu.Item`、`Button` 默认只接受 string children。要嵌入复杂内容,有两种方式:

```tsx
// 方式 A: 直接传 ReactNode(本研究采用)
<Menu.Item>
  <Group gap={6} wrap="nowrap" align="center">
    <CopilotIndexBadge index={1} size="xs" />
    <Text size="sm">发明构思总结</Text>
  </Group>
</Menu.Item>

// 方式 B: leftSection/rightSection(Mantine 7+ 支持,但 Menu.Item 不一定有)
<Menu.Item leftSection={<CopilotIndexBadge ... />}>
  发明构思总结
</Menu.Item>
```

选择 A 因为兼容性更好,且 `Group` 包裹可以保证换行、间距统一。

### 5.4 浮点数渲染注意

`aria-label` 中的 `序号 ${index}` 中文空格需注意:不同屏幕阅读器可能朗读为 "序 号"或"序号",中文字符之间不必加额外空格,保持紧凑。

---

## 六、踩坑与注意点

### 6.1 replace_in_file 的 SEARCH 块空内容报错

在 `index.tsx` 第一次尝试用以下内容做 SEARCH:

```
import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, Avatar, Box, Button, Divider, Flex, Paper, ScrollArea, Space, Stack, Text } from '@mantine/core'
import type { CopilotDetail, Session } from '@shared/types'
```

工具报错:"Empty SEARCH block detected"。

**原因猜测**:该文件有 TypeScript 模板字面量 `${...}` 语法,可能与工具的 SEARCH/REPLACE 标记解析有冲突。

**解决**:把 SEARCH 块拆得更小,只匹配单行(如 `import { ScalableIcon } from '@/components/common/ScalableIcon'`),这样可以避开冲突段。

### 6.2 props 类型联合时 TypeScript narrowing

在 `copilots.tsx` 的 `MiniItemProps` 中,`mode: 'local'` 与 `mode: 'remote'` 是两个不同的 props 形态,`index` 只在 `mode: 'local'` 时才有意义。最终通过联合类型 + 可选 prop:

```ts
type MiniItemProps =
  | {
      mode: 'local'
      detail: CopilotDetail
      index?: number
      // ...
    }
  | {
      mode: 'remote'
      detail: CopilotDetail
      // 不包含 index
    }
```

调用方:

```tsx
<MiniItem mode="local" index={ix + 1} ... />  // OK
<MiniItem mode="remote" ... />               // OK
```

调用方在 `mode: 'remote'` 时不传 `index`,渲染时也不会显示徽章,自然分离。

### 6.3 不要改动 prompt 内的章节标题

在排查时,看到 copilot prompt 内部有 "**01、发明构思总结**" 这种编号。一开始以为是同类问题,但实际**不是**,因为这些编号:

- 在 prompt 文本内部(中文顿号 `、` 分隔)
- 用于描述"prompt 的章节结构"
- 与 "8 权利要求常规判断" 这种"name 前缀"完全是两回事

**判断标准**:只要序号不在 `name` 字段里、不进入 system/user 消息的 role,就 OK。prompt 内部的章节编号对 AI 来说是合法的"段落结构"提示,反而有助于结构化输出。

---

## 七、完整改动清单

| 文件 | 类型 | 行数变化 | 说明 |
|---|---|---|---|
| `src/renderer/data/patent-copilots.ts` | 修改 | 9 处 name 字段 | 去掉 "数字+空格" 前缀 |
| `src/renderer/components/common/CopilotIndexBadge.tsx` | 新增 | +49 | 序号徽章组件 |
| `src/renderer/routes/copilots.tsx` | 修改 | +20 | `MiniItem` 接入徽章,`MiniItemProps` 加 `index` |
| `src/renderer/routes/index.tsx` | 修改 | +15 | `CopilotItem` 接入徽章 |
| `src/renderer/routes/session/$sessionId.tsx` | 修改 | +25 | 顶部 `Menu.Item` + `Button` 接入徽章 |
| `src/renderer/hooks/useCopilots.ts` | 修改 | +12 | `migrateCopilotName` 老数据迁移 |

总改动:**6 个文件,1 新增 + 5 修改,约 +120 行**

---

## 八、回归验证清单

- [x] 9 个搭子的 `name` 字段已净化(数据源)
- [x] 4 个 UI 渲染入口(网格、首页、顶部菜单、顶部按钮)都已接入徽章
- [x] 序号 = myCopilots 列表的渲染位置 `i + 1`
- [x] 远程搭子(remoteCopilots)不参与 1-9 编号
- [x] 老用户数据自动迁移(`useCopilots.ts` 的 `migrateCopilotName`)
- [x] TypeScript 编译无新增错误(`tsc --noEmit` 验证)
- [x] `pnpm dev` 启动成功,Electron 主进程 + 渲染进程均正常加载

---

## 九、效果对比

### 9.1 数据层面

| 字段 | 改动前 | 改动后 |
|---|---|---|
| `copilot[8].name` | `'8 权利要求常规判断'` | `'权利要求常规判断'` |
| 发给 AI 的 user 消息 | `你好,8 权利要求常规判断!` | `你好,权利要求常规判断!` |
| session 标题 | `8 权利要求常规判断` | `权利要求常规判断` |

### 9.2 UI 层面

| 位置 | 改动前 | 改动后 |
|---|---|---|
| `/copilots` 网格 | 卡片名称为 "8 权利要求常规判断" | 卡片左侧有 [8] 徽章,名称为 "权利要求常规判断" |
| 首页滚动条 | 同上 | 同上 |
| 会话顶部菜单 | 菜单项为 "8 权利要求常规判断" | 菜单项左侧 [8] 徽章 + "权利要求常规判断" |
| 顶部选中按钮 | "8 权利要求常规判断" | [8] 徽章 + "权利要求常规判断" |

---

## 十、可复用的经验

1. **数据 vs 视觉分离原则**:凡是可能被多端复用的字符串字段,**不要**把"视觉元素"(序号、emoji 前缀)写进字段本身。需要展示时,要么用单独字段(如 `avatarEmoji`),要么在渲染层动态计算。

2. **AI prompt 中的"语义噪声"排查**:每次给 LLM 写 prompt 时,要主动检查"哪些文本会被 LLM 误读为指令的一部分"。例如:
   - 带数字的字符串("8 权利要求常规判断")可能被视为具体指令
   - emoji 开头("📌 总结")可能被解析为视觉强调
   - 模板化的问候语("你好,XXX!")可能让 LLM 误以为是用户主动发的指令

3. **从源头解决 vs 在末端过滤**:能改源头就改源头。一劳永逸,后续所有调用自动安全。

4. **老用户迁移务必写**:任何字段语义变更,都要考虑本地存储的兼容。`migrateXxx` 函数 + 在初始化入口调用是标准做法。

5. **TypeScript 联合类型 + 可选 prop** 是处理"某些 prop 只在特定 mode 下有效"的优雅方式,避免引入 `undefined` 或 `null` 状态。

6. **`replace_in_file` 工具对 SEARCH 内容敏感**:遇到含 `${...}` 模板字面量或特殊字符的长 SEARCH,容易报 "Empty SEARCH block" 错误。此时**缩小 SEARCH 范围**(只匹配一行)是最稳妥的解决方案。

---

## 十一、后续可扩展方向

1. **搭子拖拽排序**:目前 myCopilots 数组是按 `usedCount + starred` 排序的,未来如果支持用户手动排序,序号会自动跟着新顺序重新编号(`i + 1`),无需额外逻辑。

2. **序号自定义**:可以让用户在搭子编辑页设置自己的"简称编号",例如把 "权利要求常规判断" 显示为 "[CGK]" 或 "[8]权利要求 CGK"。

3. **其他搭子统一处理**:未来如果新增"工程类搭子""检索类搭子"等分类,可以用同样的"序号 + 分类徽章"组合展示。

4. **AI 上下文审计工具**:可以开发一个开发时的 lint 规则,检测任何 `${...copilot.name...}` 的字符串拼接,提示开发者"序号不要进 prompt"。

---

## 十二、结语

这次改动的核心是 **"语义分离"** —— 把"显示用的视觉序号"和"语义用的真实名称"彻底解耦。看似简单的几行代码改动,背后是 **"数据-视图-语义三层分离"** 的设计哲学。

AI 产品开发中,这种分离尤其重要:**任何会进入 prompt 的字段,都必须是纯语义**。序号、emoji、装饰性前缀,都应当留在 UI 层,而不是污染模型上下文。

希望这次经验能帮到后续开发:每当你看到一个 `name` 字段被拼接进 prompt,都要警觉一下:"这个 name 里有没有可能误导模型的元素?"