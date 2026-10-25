/**
 * TaskTools - 任务管理工具
 *
 * 包含：Task（子代理）、TodoWrite（任务列表）
 */

import type { ToolResult, TodoItem } from '../../../shared/agents/types'

// ============================================================================
// TodoWrite Tool
// ============================================================================

export interface TodoWriteArgs {
  todos: Array<{
    content: string
    status: 'pending' | 'in_progress' | 'completed'
    activeform?: string
  }>
}

/**
 * TodoWrite 工具：更新任务列表
 *
 * 注意：实际任务列表状态由 AgentExecutor 在内存中管理，
 * 此函数返回任务列表，调用方需要将列表存储起来以便后续 TodoWrite 调用对比。
 */
export async function executeTodoWrite(args: TodoWriteArgs): Promise<ToolResult> {
  const { todos } = args

  if (!Array.isArray(todos)) {
    return { success: false, content: '错误：todos 必须是数组', error: 'INVALID_ARGUMENT' }
  }

  const items: TodoItem[] = todos.map((t) => ({
    content: t.content,
    status: t.status,
    activeForm: t.activeform,
  }))

  const completed = items.filter((t) => t.status === 'completed').length
  const total = items.length

  const summary = items
    .map((t) => {
      const icon = t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : '⏳'
      return `${icon} ${t.content}${t.activeForm ? ` (${t.activeForm})` : ''}`
    })
    .join('\n')

  return {
    success: true,
    content: `任务列表已更新 (${completed}/${total} 已完成):\n\n${summary}`,
    metadata: {
      todos: items,
      completed,
      total,
    },
  }
}

// ============================================================================
// Task Tool（子代理 - MVP 占位实现）
// ============================================================================

export interface TaskArgs {
  prompt: string
  subagent_type?: 'general-purpose' | 'Explore' | 'Plan'
}

/**
 * Task 工具：启动子代理
 *
 * MVP 实现：在主 Agent 上下文中执行子任务，不真正启动独立子进程。
 * 完整实现需要单独的 AgentExecutor 实例和 IPC 通道。
 */
export async function executeTask(args: TaskArgs): Promise<ToolResult> {
  const { prompt, subagent_type } = args

  if (!prompt) {
    return { success: false, content: '错误：必须提供 prompt 参数', error: 'INVALID_ARGUMENT' }
  }

  return {
    success: true,
    content: `子任务已创建（类型: ${subagent_type || 'general-purpose'}）：\n\n${prompt}\n\n注：MVP 阶段，子代理在主 Agent 上下文中串行执行。完整实现将支持并行子代理。`,
    metadata: {
      subagentType: subagent_type,
      prompt,
    },
  }
}