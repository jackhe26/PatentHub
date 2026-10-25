/**
 * PermissionManager - 权限管理器
 *
 * 根据 Agent 的权限模式 + 用户启用的工具 + 自动批准列表，
 * 决策工具调用是否允许以及是否需要用户审批。
 *
 * 决策流程：
 * 1. bypassPermissions 模式 → 所有工具允许
 * 2. plan 模式 → 仅允许读类工具
 * 3. 工具未启用 → 检查 requiresApprovalWhenDisabled
 * 4. 用户已「始终允许」 → 允许
 * 5. 根据模式默认启用状态决定
 */

import { v4 as uuidv4 } from 'uuid'
import { BrowserWindow } from 'electron'
import type {
  AgentPermissionMode,
  AgentToolName,
  PermissionRequest,
  PermissionDecision,
} from '../../shared/agents/types'
import type { ToolDefinition } from '../../shared/agents/tools'

export interface PermissionContext {
  agentId: string
  mode: AgentPermissionMode
  enabledTools: AgentToolName[]
  autoApproveTools: Set<AgentToolName>
}

export class PermissionManager {
  /** 待处理的权限请求（用于等待用户响应） */
  private pendingRequests = new Map<string, (decision: PermissionDecision, alwaysAllow?: boolean) => void>()

  /**
   * 检查权限
   */
  async checkPermission(
    context: PermissionContext,
    tool: ToolDefinition
  ): Promise<PermissionDecision> {
    // 1. 全自动模式：所有工具允许
    if (context.mode === 'bypassPermissions') {
      return 'allow'
    }

    // 2. 计划模式：仅允许读类工具
    if (context.mode === 'plan') {
      return tool.requiredPermission === 'read' ? 'allow' : 'deny'
    }

    // 3. 工具被禁用
    if (context.enabledTools.length > 0 && !context.enabledTools.includes(tool.name)) {
      if (!tool.requiresApprovalWhenDisabled) return 'allow'
      return await this.requestUserApproval(context.agentId, tool)
    }

    // 4. 用户已「始终允许」
    if (context.autoApproveTools.has(tool.name)) return 'allow'

    // 5. 模式默认启用 → 允许
    if (tool.defaultInDefaultMode) return 'allow'

    // 6. 普通模式：读允许，写/执行需询问
    if (context.mode === 'default') {
      if (tool.requiredPermission === 'read') return 'allow'
      return await this.requestUserApproval(context.agentId, tool)
    }

    // 7. 自动编辑模式：读写允许，执行需询问
    if (context.mode === 'acceptEdits') {
      if (tool.requiredPermission !== 'execute') return 'allow'
      return await this.requestUserApproval(context.agentId, tool)
    }

    return 'deny'
  }

  /**
   * 请求用户审批
   */
  private async requestUserApproval(
    agentId: string,
    tool: ToolDefinition
  ): Promise<PermissionDecision> {
    const eventId = uuidv4()

    return new Promise((resolve) => {
      this.pendingRequests.set(eventId, (decision, alwaysAllow) => {
        if (alwaysAllow) {
          // 持久化「始终允许」（由调用方处理）
        }
        resolve(decision)
      })

      // 向所有 BrowserWindow 发送权限询问事件
      const request: PermissionRequest = {
        eventId,
        agentId,
        toolName: tool.name,
        toolDisplayName: tool.displayName,
        toolDescription: tool.description,
        arguments: {}, // 由调用方填充
        requiredPermission: tool.requiredPermission,
      }

      const windows = BrowserWindow.getAllWindows()
      for (const w of windows) {
        w.webContents.send('agent:permission:request', request)
      }

      // 60 秒超时
      setTimeout(() => {
        if (this.pendingRequests.has(eventId)) {
          this.pendingRequests.delete(eventId)
          resolve('deny')
        }
      }, 60000)
    })
  }

  /**
   * 响应权限请求（Renderer → Main）
   */
  respondToRequest(
    eventId: string,
    decision: PermissionDecision,
    alwaysAllow?: boolean
  ): boolean {
    const resolver = this.pendingRequests.get(eventId)
    if (resolver) {
      resolver(decision, alwaysAllow)
      this.pendingRequests.delete(eventId)
      return true
    }
    return false
  }

  /**
   * 取消所有待处理请求
   */
  cancelAllPending() {
    for (const resolver of this.pendingRequests.values()) {
      resolver('deny')
    }
    this.pendingRequests.clear()
  }
}

export const permissionManager = new PermissionManager()