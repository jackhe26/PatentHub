/**
 * AgentExecutor - Agent 核心调度器（重写版 v3）
 *
 * 修复点（基于 Cherry Studio aiSdk runtime 设计思路）：
 * 1. main 端直接 fetch LLM（OpenAI 兼容协议），不再走 ipc:agent-llm-request 反模式
 * 2. 流式响应通过 webContents.send 推送：agent:llm-chunk / agent:tool:* / agent:complete
 * 3. 从 getSettings() 解析 Provider 配置（baseUrl + apiKey + modelId）
 * 4. 支持 AbortController 中途取消
 *
 * 负责：
 * 1. 构建 System Prompt（包含 Skills 列表、可用工具说明、权限模式）
 * 2. 与 LLM 通信（main 端 fetch + stream）
 * 3. 解析 tool_calls 并执行
 * 4. 权限校验
 * 5. 主循环（multi-turn）
 */

import { EventEmitter } from 'node:events'
import { v4 as uuidv4 } from 'uuid'
import { BrowserWindow } from 'electron'
import type {
  AgentEntity,
  AgentAttachment,
  AgentSkillJoin,
  AgentToolName,
  AgentUserContentPart,
  ToolCall,
  ToolResult,
  TodoItem,
} from '../../shared/agents/types'
import { toOpenAITools } from '../../shared/agents/tools'
import {
  buildExecutorContext,
  executeTool,
  getAgentAvailableTools,
  getToolDefinition,
} from './ToolRegistry'
import { permissionManager } from './PermissionManager'
import { agentService } from './AgentService'
import { getSettings } from '../store-node'

export interface AgentRunOptions {
  agent: AgentEntity
  sessionId: string
  userMessage: string | AgentUserContentPart[]
  history?: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string; toolCallId?: string; toolCalls?: any[] }>
  /** 已落盘的附件描述（供注入消息 + 工具访问） */
  attachments?: AgentAttachment[]
  /** 附件落盘基目录（用于告诉模型文件位置） */
  agentBaseDir?: string
  /** 会话 id 透传（与 run 的 sessionId 相同） */
  sessionIdOverride?: string
}

export interface AgentRunResult {
  success: boolean
  finalMessage?: string
  toolCalls: ToolCall[]
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  iterations: number
}

/**
 * 解析 Provider 配置（agent.model 格式 "providerId:modelId"）
 *
 * PatentHub settings 结构（参考 src/shared/types.ts）:
 * settings.providers = { [providerId]: { apiKey, baseUrl, ... } }
 * settings.customProviders = [{ id, apiKey, baseUrl, name, ... }]
 *
 * SystemProviders 的 baseUrl 需要从 @shared/defaults 拿，但为简化起见，
 * 如果用户没有自定义 baseUrl，直接用主流 provider 的官方 endpoint
 */
function resolveProviderConfig(agent: AgentEntity): {
  baseUrl: string
  apiKey: string
  modelId: string
  providerId: string
} | null {
  const [providerId, modelId] = agent.model.split(':')
  if (!providerId || !modelId) return null

  let settings: any = {}
  try {
    settings = getSettings() || {}
  } catch (err) {
    console.error('[AgentExecutor] Failed to get settings:', err)
    return null
  }

  const providerConfig = settings.providers?.[providerId]
  let apiKey = providerConfig?.apiKey
  let baseUrl: string | undefined = providerConfig?.baseUrl || providerConfig?.apiHost

  // 兼容自定义 provider：selectedCustomProviderId 指向 customProviders[]
  if (!apiKey && providerConfig?.selectedCustomProviderId) {
    const customProvider = settings.customProviders?.find((p: any) => p.id === providerConfig.selectedCustomProviderId)
    if (customProvider) {
      apiKey = customProvider.apiKey
      if (!baseUrl) baseUrl = customProvider.baseUrl || customProvider.apiHost
    }
  }

  // 如果自定义 provider 的 baseUrl 不存在，尝试从 customProviders 里找 name 匹配的
  if (!baseUrl && providerConfig?.selectedCustomProviderId) {
    const cp = settings.customProviders?.find((p: any) => p.id === providerConfig.selectedCustomProviderId)
    if (cp?.baseUrl) baseUrl = cp.baseUrl
  }

  if (!apiKey) {
    return null
  }

  // 兜底 baseUrl（如果用户没填，根据 providerId 推断）
  if (!baseUrl) {
    baseUrl = inferDefaultBaseUrl(providerId)
  }

  return { baseUrl, apiKey, modelId, providerId }
}

/**
 * 推断默认 baseUrl（基于已知的 OpenAI 兼容服务商）
 */
function inferDefaultBaseUrl(providerId: string): string {
  const map: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    deepseek: 'https://api.deepseek.com/v1',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    'tongyi-qianwen': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    'dashscope-qwen': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    zhipu: 'https://open.bigmodel.cn/api/paas/v4',
    glm: 'https://open.bigmodel.cn/api/paas/v4',
    moonshot: 'https://api.moonshot.cn/v1',
    kimi: 'https://api.moonshot.cn/v1',
    // MiniMax 官方 OpenAI 兼容端点必须带 /v1（不带会返回 404）。
    // 与对话页面链路保持一致：apiHost 'https://api.minimaxi.com' 经
    // normalizeOpenAIApiHostAndPath() 规范化后即为 'https://api.minimaxi.com/v1'。
    minimax: 'https://api.minimaxi.com/v1',
    'volcengine': 'https://ark.cn-beijing.volces.com/api/v3',
    'volcengine-ark': 'https://ark.cn-beijing.volces.com/api/v3',
    ollama: 'http://localhost:11434/v1',
    lmstudio: 'http://localhost:1234/v1',
  }
  return map[providerId.toLowerCase()] || 'https://api.openai.com/v1'
}

/**
 * Agent 执行器
 */
export class AgentExecutor extends EventEmitter {
  private maxIterations = 30
  private aborted = false

  abort() {
    this.aborted = true
    permissionManager.cancelAllPending()
  }

  /**
   * 主执行入口
   */
  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    this.aborted = false
    const { agent, sessionId, userMessage, history = [], attachments = [], agentBaseDir, sessionIdOverride } = options

    const tools = getAgentAvailableTools(agent)
    const enabledSkillsRaw = await agentService.getSkills(agent.id)
    const context = buildExecutorContext(agent)
    context.enabledSkills = enabledSkillsRaw.map((s) => ({ id: s.skillId, name: s.skillName }))

    // 自动批准工具列表
    const autoApproveTools = new Set<AgentToolName>(
      await agentService.getAutoApproveTools(agent.id)
    )

    // 构建 System Prompt
    const systemPrompt = this.buildSystemPrompt(agent, enabledSkillsRaw, tools)

    // 组装用户消息（多模态数组时透传；同时注入附件清单供模型理解与工具访问）
    const userContent = this.buildUserContent(userMessage, attachments, agentBaseDir, sessionIdOverride || sessionId)

    // 初始化消息历史
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userContent },
    ]

    let iteration = 0
    const allToolCalls: ToolCall[] = []
    let totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

    while (iteration < this.maxIterations) {
      if (this.aborted) {
        this.emit('aborted', { sessionId })
        this.broadcast('agent:aborted', { sessionId })
        break
      }

      iteration++

      // 1. 流式调用 LLM
      const llmResponse = await this.streamLLM(sessionId, agent, messages, tools)

      totalUsage.inputTokens += llmResponse.usage.inputTokens
      totalUsage.outputTokens += llmResponse.usage.outputTokens
      totalUsage.totalTokens += llmResponse.usage.totalTokens

      this.emit('usage', { sessionId, usage: llmResponse.usage })
      this.broadcast('agent:usage', { sessionId, usage: llmResponse.usage })

      // 2. 没有 tool_call → 结束
      if (!llmResponse.toolCalls || llmResponse.toolCalls.length === 0) {
        if (llmResponse.content) {
          this.emit('message', { sessionId, content: llmResponse.content, role: 'assistant' })
          this.broadcast('agent:message', { sessionId, content: llmResponse.content, role: 'assistant' })
        }
        return {
          success: true,
          finalMessage: llmResponse.content,
          toolCalls: allToolCalls,
          usage: totalUsage,
          iterations: iteration,
        }
      }

      // 3. 处理 tool_calls
      const toolCalls: ToolCall[] = llmResponse.toolCalls.map((tc: any) => ({
        id: tc.id || uuidv4(),
        name: tc.function.name as AgentToolName,
        arguments: typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments,
        status: 'pending' as const,
        timestamp: Date.now(),
      }))

      const toolResults: ToolResult[] = []

      for (const toolCall of toolCalls) {
        this.emit('tool:start', { sessionId, toolCall })
        this.broadcast('agent:tool:start', { sessionId, toolCall })
        allToolCalls.push(toolCall)

        const toolDef = getToolDefinition(toolCall.name)
        if (!toolDef) {
          const errResult: ToolResult = {
            success: false,
            content: `未知的工具: ${toolCall.name}`,
            error: 'UNKNOWN_TOOL',
          }
          toolCall.status = 'error'
          toolCall.result = errResult
          toolResults.push(errResult)
          this.emit('tool:complete', { sessionId, toolCall })
          this.broadcast('agent:tool:complete', { sessionId, toolCall })
          continue
        }

        // 权限校验
        const decision = await permissionManager.checkPermission(
          {
            agentId: agent.id,
            mode: agent.permissionMode,
            enabledTools: agent.enabledTools,
            autoApproveTools,
          },
          toolDef
        )

        if (decision === 'deny') {
          const denyResult: ToolResult = {
            success: false,
            content: '用户拒绝了此操作。请尝试其他方式或询问用户。',
            error: 'USER_DENIED',
          }
          toolCall.status = 'denied'
          toolCall.result = denyResult
          toolResults.push(denyResult)
          this.emit('tool:complete', { sessionId, toolCall })
          this.broadcast('agent:tool:complete', { sessionId, toolCall })
          continue
        }

        toolCall.status = 'running'
        try {
          const result = await executeTool(toolCall.name, toolCall.arguments, context)
          toolCall.result = result
          toolCall.status = result.success ? 'success' : 'error'
          toolResults.push(result)

          if (toolCall.name === 'TodoWrite' && result.metadata?.todos) {
            this.emit('todo:update', { sessionId, todos: result.metadata.todos as TodoItem[] })
            this.broadcast('agent:todo:update', { sessionId, todos: result.metadata.todos as TodoItem[] })
          }
        } catch (err: any) {
          const errResult: ToolResult = {
            success: false,
            content: `工具执行异常: ${err.message}`,
            error: err.message,
          }
          toolCall.status = 'error'
          toolCall.result = errResult
          toolResults.push(errResult)
        }
        this.emit('tool:complete', { sessionId, toolCall })
        this.broadcast('agent:tool:complete', { sessionId, toolCall })
      }

      // 4. 将 LLM 响应和工具结果追加到消息
      messages.push({
        role: 'assistant',
        content: llmResponse.content || '',
        tool_calls: llmResponse.toolCalls,
      })

      for (let i = 0; i < toolCalls.length; i++) {
        messages.push({
          role: 'tool',
          tool_call_id: toolCalls[i].id,
          content: toolResults[i].success
            ? toolResults[i].content
            : `Error: ${toolResults[i].error || toolResults[i].content}`,
        })
      }
    }

    return {
      success: false,
      toolCalls: allToolCalls,
      usage: totalUsage,
      iterations: iteration,
    }
  }

  /**
   * 推送事件到所有 BrowserWindow
   */
  private broadcast(event: string, data: any) {
    const windows = BrowserWindow.getAllWindows()
    for (const w of windows) {
      if (!w.isDestroyed()) {
        try {
          w.webContents.send(event, data)
        } catch (err) {
          console.error('[AgentExecutor] broadcast error:', err)
        }
      }
    }
  }

  /**
   * 流式调用 LLM（main 端直连 OpenAI 兼容协议）
   *
   * 关键改进：
   * - 不用 IPC 走 renderer（避免 webContents.send/on 反模式）
   * - 用 fetch + ReadableStream 直接消费 SSE
   * - 流式 chunk 通过 webContents.send('agent:llm-chunk') 推送给 renderer
   * - 支持 AbortSignal 中途取消
   */
  private async streamLLM(
    sessionId: string,
    agent: AgentEntity,
    messages: any[],
    tools: any[]
  ): Promise<{
    content: string
    toolCalls?: any[]
    usage: { inputTokens: number; outputTokens: number; totalTokens: number }
  }> {
    const providerConfig = resolveProviderConfig(agent)
    if (!providerConfig) {
      throw new Error(
        `无法解析 Provider 配置: ${agent.model}。请检查「设置 → 模型服务」中该 Provider 是否已配置 API Key。`
      )
    }

    const url = `${providerConfig.baseUrl.replace(/\/$/, '')}/chat/completions`

    const body: any = {
      model: providerConfig.modelId,
      messages,
      temperature: 0.7,
      stream: true,
      stream_options: { include_usage: true },
    }

    if (tools && tools.length > 0) {
      body.tools = toOpenAITools(tools)
      body.tool_choice = 'auto'
    }

    const controller = new AbortController()
    const { signal } = controller

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${providerConfig.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      })
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('LLM 请求被中止')
      }
      throw new Error(`LLM 请求失败: ${err.message || err}`)
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`LLM API 调用失败 (${response.status} ${response.statusText}): ${errorText}`)
    }

    if (!response.body) {
      throw new Error('LLM 响应为空')
    }

    // 解析 SSE 流
    const reader = (response.body as any).getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let content = ''
    const toolCallsMap = new Map<number, any>()
    let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

    try {
      while (true) {
        if (this.aborted) {
          controller.abort()
          break
        }

        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (!line || !line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload || payload === '[DONE]') continue

          try {
            const data = JSON.parse(payload)
            const choice = data.choices?.[0]

            // 内容增量
            if (choice?.delta?.content) {
              const delta = choice.delta.content
              content += delta
              // 实时推流给 renderer
              this.broadcast('agent:llm-chunk', { sessionId, content: delta })
            }

            // 工具调用增量（流式合并）
            if (choice?.delta?.tool_calls) {
              for (const tc of choice.delta.tool_calls) {
                const idx = tc.index ?? 0
                if (!toolCallsMap.has(idx)) {
                  toolCallsMap.set(idx, {
                    id: tc.id || `call_${uuidv4()}`,
                    type: 'function',
                    function: { name: '', arguments: '' },
                  })
                }
                const existing = toolCallsMap.get(idx)
                if (tc.id) existing.id = tc.id
                if (tc.function?.name) existing.function.name += tc.function.name
                if (tc.function?.arguments) existing.function.arguments += tc.function.arguments
              }
            }

            // usage（一般在最后一个 chunk）
            if (data.usage) {
              usage = {
                inputTokens: data.usage.prompt_tokens || 0,
                outputTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
              }
            }
          } catch {
            // 忽略 SSE 解析错误（不完整 chunk）
          }
        }
      }
    } finally {
      try {
        reader.releaseLock()
      } catch {
        // ignore
      }
    }

    const toolCalls = toolCallsMap.size > 0 ? Array.from(toolCallsMap.values()) : undefined

    return { content, toolCalls, usage }
  }

  /**
   * 组装用户消息内容：
   * - userMessage 为数组（多模态）时透传；为字符串时转成 text part。
   * - 若有附件，则在消息前注入《附件清单 + 正文摘要 + 工作目录说明》，
   *   让模型（尤其非视觉）理解内容，并能通过 Read/Glob/Bash/Skill 访问真实文件。
   */
  private buildUserContent(
    userMessage: string | AgentUserContentPart[],
    attachments: AgentAttachment[],
    agentBaseDir?: string,
    sessionId?: string
  ): string | AgentUserContentPart[] {
    const attachBlock = this.buildAttachmentBlock(attachments, agentBaseDir, sessionId)

    if (attachments.length === 0) {
      return userMessage
    }

    const parts: AgentUserContentPart[] = []
    if (attachBlock) parts.push({ type: 'text', text: attachBlock })

    if (typeof userMessage === 'string') {
      if (userMessage.trim()) parts.push({ type: 'text', text: userMessage })
    } else {
      parts.push(...userMessage)
    }

    // 单一 text part 且用户有文字时，直接返回字符串更兼容
    if (parts.length === 1 && parts[0].type === 'text') return parts[0].text
    return parts
  }

  /**
   * 生成附件清单文本（供模型理解 + 说明文件在工作目录中）
   */
  private buildAttachmentBlock(
    attachments: AgentAttachment[],
    agentBaseDir?: string,
    sessionId?: string
  ): string {
    if (!attachments || attachments.length === 0) return ''

    const lines: string[] = []
    lines.push('## 附件清单')
    lines.push('以下文件已保存到本地工作目录，你可以用 Read / Glob / Bash(SkillScript) 读取、分析、引用它们；若需图片/素材请从原文件中提取。')

    for (const att of attachments) {
      const kb = att.size > 0 ? Math.max(1, Math.round(att.size / 1024)) + ' KB' : '-'
      const ocrNote = att.ocrNeeded ? '（扫描件，无文字层，需 OCR 或视觉模型识别）' : ''
      lines.push(`- [${att.kind}] ${att.name}${ocrNote} (${kb}) 路径: ${att.absPath}`)
      if (att.relPath) lines.push(`  相对路径: ${att.relPath}`)
      if (att.text) {
        const preview = att.text.length > 1500 ? att.text.slice(0, 1500) + '\n...[内容过长已截断]' : att.text
        lines.push(`  内容摘要:`)
        lines.push('  ```')
        lines.push(preview)
        lines.push('  ```')
      }
    }

    if (agentBaseDir && sessionId) {
      lines.push('')
      lines.push(`附件目录: ${agentBaseDir}/attachments/${sessionId}/`)
      lines.push('你可以读取完整文件内容以获取详细信息，并结合已启用的技能处理这些文件。')
    }

    return lines.join('\n')
  }

  /**
   * 构建 System Prompt
   */
  private buildSystemPrompt(
    agent: AgentEntity,
    enabledSkills: AgentSkillJoin[],
    tools: Array<{ name: string; descriptionEn: string; parameters: any; requiredPermission: string }>
  ): string {
    const lines: string[] = []

    lines.push(agent.instructions || 'You are a helpful AI assistant.')
    lines.push('')

    const workDir = agent.workingDirectories[0]
    if (workDir) {
      lines.push(`## Working Directory`)
      lines.push(workDir)
      lines.push('')
    }

    lines.push(`## Permission Mode: ${agent.permissionMode}`)
    switch (agent.permissionMode) {
      case 'default':
        lines.push('You can freely read files. Editing or executing commands requires user approval.')
        break
      case 'acceptEdits':
        lines.push('You can freely read and edit files. Executing commands requires user approval.')
        break
      case 'bypassPermissions':
        lines.push('You can execute any operation without asking. Use with caution.')
        break
      case 'plan':
        lines.push('You can only read files and make plans. Cannot edit files or execute commands.')
        break
    }
    lines.push('')

    if (agent.autonomousMode) {
      lines.push('## Autonomous Mode: ENABLED')
      lines.push('You may execute multi-step tasks autonomously. Use TodoWrite to track progress.')
      lines.push('')
    }

    if (enabledSkills.length > 0) {
      lines.push(`## Available Skills`)
      lines.push('Use the Skill tool to get detailed instructions for an enabled skill:')
      lines.push('')
      for (const skill of enabledSkills) {
        lines.push(`- **${skill.skillName}** (skillId: \`${skill.skillId}\`)${skill.skillDescription ? `: ${skill.skillDescription}` : ''}`)
      }
      lines.push('')
    }

    if (tools.length > 0) {
      lines.push(`## Available Tools`)
      lines.push('You have access to the following tools:')
      lines.push('')
      for (const tool of tools) {
        lines.push(`### ${tool.name}`)
        lines.push(tool.descriptionEn)
        const required = tool.requiredPermission
        if (required && required !== 'read') {
          lines.push(`*Required permission: ${required}*`)
        }
        lines.push('')
      }
    }

    if (agent.environmentVariables) {
      lines.push(`## Environment Variables`)
      lines.push('The following environment variables are available in tool execution:')
      lines.push('```')
      lines.push(agent.environmentVariables)
      lines.push('```')
      lines.push('')
    }

    return lines.join('\n')
  }
}

// ============================================================================
// 全局执行器实例（按 sessionId 管理）
// ============================================================================

/**
 * 正在执行的 Agent 会话集合
 *
 * 供「关闭窗口 / 退出应用前二次确认」等场景查询：
 * - 由 IPC 层在 runAgent 开始时调用 markAgentSessionRunning 标记
 * - 由 removeExecutor 在任务结束（完成/报错/被中止）时自动清除
 */
const runningSessionIds = new Set<string>()

/** 标记某个会话的 Agent 任务已开始执行 */
export function markAgentSessionRunning(sessionId: string) {
  runningSessionIds.add(sessionId)
}

/** 当前正在执行的 Agent 会话（sessionId 列表） */
export function getRunningAgentSessions(): string[] {
  return Array.from(runningSessionIds)
}

/** 是否还有 Agent 任务正在执行 */
export function hasRunningAgentSessions(): boolean {
  return runningSessionIds.size > 0
}

/**
 * 中止所有正在运行的 Agent 任务（用于「停止任务并退出」场景）
 * @returns 被中止的 sessionId 列表
 */
export function abortAllRunningAgents(): string[] {
  const sessionIds = Array.from(runningSessionIds)
  for (const sessionId of sessionIds) {
    activeExecutors.get(sessionId)?.abort()
    activeExecutors.delete(sessionId)
  }
  runningSessionIds.clear()
  return sessionIds
}

const activeExecutors = new Map<string, AgentExecutor>()

export function getOrCreateExecutor(sessionId: string): AgentExecutor {
  let executor = activeExecutors.get(sessionId)
  if (!executor) {
    executor = new AgentExecutor()
    activeExecutors.set(sessionId, executor)
  }
  return executor
}

export function removeExecutor(sessionId: string) {
  // 任务结束（完成 / 报错 / 被中止）后同步清除「运行中」标记
  runningSessionIds.delete(sessionId)
  activeExecutors.delete(sessionId)
}
