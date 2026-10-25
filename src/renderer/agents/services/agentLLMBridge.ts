/**
 * AgentLLMBridge - v3 重写版
 *
 * 历史：
 * - v2 通过 renderer 转发 LLM 请求的反模式（已废弃）
 * - v3 main 端直接 fetch LLM，stream 通过 webContents.send 推送给 renderer
 *
 * 当前文件保留仅为向后兼容旧 import。新代码请直接使用：
 *   window.electronAPI.agents.runAgent(...)
 *   window.electronAPI.agents.onAgentChunk(callback)
 *   window.electronAPI.agents.onAgentComplete(callback)
 *   window.electronAPI.agents.onToolStart(callback)
 *   ...
 *
 * @deprecated v3 起不再需要此 bridge。保留 noop 兼容层避免旧代码报错。
 */

export interface LLMRequest {
  eventId: string
  sessionId: string
  agent: {
    id: string
    model: string
    temperature?: number
  }
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string
    tool_calls?: any[]
    tool_call_id?: string
  }>
  tools: Array<{
    type: 'function'
    function: {
      name: string
      description: string
      parameters: any
    }
  }>
}

export interface LLMResponse {
  content: string
  toolCalls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

let initialized = false

/**
 * @deprecated v3 起不再需要初始化此 bridge。
 * 保留为空实现，避免旧代码 import 报错。
 */
export function initAgentLLMBridge(): void {
  if (initialized) return
  initialized = true
  // v3: 不再做任何 LLM 中转，main 端直接 fetch LLM
  // 事件流直接通过 window.electronAPI.agents.onAgentChunk 订阅
  console.log('[AgentLLMBridge] v3: 已弃用，无需初始化。请使用 onAgentChunk + runAgent。')
}
