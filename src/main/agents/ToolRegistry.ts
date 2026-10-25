/**
 * ToolRegistry - 工具注册中心
 *
 * 统一管理所有工具的执行入口。
 * 根据 AgentToolName 分发到具体的 executor。
 */

import type {
  AgentEntity,
  AgentToolName,
  ToolCall,
  ToolResult,
} from '../../shared/agents/types'
import { TOOL_DEFINITIONS, type ToolDefinition } from '../../shared/agents/tools'

import { executeBash } from './tools/BashTool'
import {
  executeRead,
  executeWrite,
  executeEdit,
  executeMultiEdit,
  executeGlob,
  executeGrep,
} from './tools/FileTools'
import { executeSkillTool, executeSkillScript } from './tools/SkillTool'
import { executeTask, executeTodoWrite } from './tools/TaskTools'
import {
  executeImageGen,
  executeKnowledgeBase,
  executeWebSearch,
  executeWebFetch,
} from './tools/IntegrationTools'
import { parseEnvVars } from './shellRunner'

export type ToolExecutor = (
  args: any,
  context: ToolExecutorContext
) => Promise<ToolResult>

export interface ToolExecutorContext {
  agent: AgentEntity
  agentId: string
  gitBashPath: string | null
  workingDir: string | null
  env: Record<string, string>
  enabledSkills?: Array<{ id: string; name: string }>
}

// ============================================================================
// 工具执行器映射
// ============================================================================

const TOOL_EXECUTORS: Record<AgentToolName, ToolExecutor> = {
  Read: (args: any) => executeRead(args as any),
  Write: (args: any) => executeWrite(args as any),
  Edit: (args: any) => executeEdit(args as any),
  MultiEdit: (args: any) => executeMultiEdit(args as any),
  Glob: (args: any, ctx: ToolExecutorContext) => executeGlob(args as any, { workingDir: ctx.workingDir }),
  Grep: (args: any, ctx: ToolExecutorContext) => executeGrep(args as any, { workingDir: ctx.workingDir }),

  Bash: (args: any, ctx: ToolExecutorContext) =>
    executeBash(args as any, {
      gitBashPath: ctx.gitBashPath,
      workingDir: ctx.workingDir,
      env: ctx.env,
    }),

  Task: (args: any) => executeTask(args as any),
  TodoWrite: (args: any) => executeTodoWrite(args as any),

  Skill: (args: any, ctx: ToolExecutorContext) => executeSkillTool(args as any, { agentId: ctx.agentId }),
  SkillScript: (args: any, ctx: ToolExecutorContext) =>
    executeSkillScript(args as any, {
      gitBashPath: ctx.gitBashPath,
      workingDir: ctx.workingDir,
      env: ctx.env,
    }),

  ImageGen: (args: any) => executeImageGen(args as any),
  KnowledgeBase: (args: any) => executeKnowledgeBase(args as any),
  WebSearch: (args: any) => executeWebSearch(args as any),
  WebFetch: (args: any) => executeWebFetch(args as any),
}

// ============================================================================
// 获取工具定义
// ============================================================================

export function getToolDefinition(name: AgentToolName): ToolDefinition | null {
  return TOOL_DEFINITIONS[name] || null
}

export function getAllToolDefinitions(): ToolDefinition[] {
  return Object.values(TOOL_DEFINITIONS)
}

/**
 * 获取 Agent 实际可用的工具列表
 */
export function getAgentAvailableTools(agent: AgentEntity): ToolDefinition[] {
  const all = getAllToolDefinitions()
  if (agent.enabledTools.length === 0) {
    return all
  }
  return all.filter((tool) => agent.enabledTools.includes(tool.name))
}

// ============================================================================
// 执行单个工具
// ============================================================================

export async function executeTool(
  toolName: AgentToolName,
  args: Record<string, any>,
  context: ToolExecutorContext
): Promise<ToolResult> {
  const executor = TOOL_EXECUTORS[toolName]
  if (!executor) {
    return {
      success: false,
      content: `未知的工具: ${toolName}`,
      error: 'UNKNOWN_TOOL',
    }
  }

  try {
    return await executor(args, context)
  } catch (err: any) {
    return {
      success: false,
      content: `工具执行异常: ${err.message}`,
      error: err.message,
    }
  }
}

// ============================================================================
// 构建工具执行上下文
// ============================================================================

export function buildExecutorContext(agent: AgentEntity): ToolExecutorContext {
  return {
    agent,
    agentId: agent.id,
    gitBashPath: agent.gitBashPath,
    workingDir: agent.workingDirectories[0] || null,
    env: parseEnvVars(agent.environmentVariables || ''),
  }
}

// ============================================================================
// 将工具调用转换为 ToolCall 记录
// ============================================================================

export function createToolCall(
  id: string,
  name: AgentToolName,
  args: Record<string, any>
): ToolCall {
  return {
    id,
    name,
    arguments: args,
    status: 'pending',
    timestamp: Date.now(),
  }
}