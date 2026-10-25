/**
 * Agent Tools Definitions - 工具元数据
 *
 * 11+ 工具定义，对应 Cherry-Studio 的预授权工具列表。
 * 每个工具包含：名称、描述、JSON Schema 参数、所需权限、是否默认启用。
 *
 * 参考 Cherry-Studio: src/main/agents/tools/*.ts
 */

import type { AgentToolName } from './types'

// ============================================================================
// JSON Schema 简版（与 OpenAI function calling 兼容）
// ============================================================================

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: string[]
  default?: any
  items?: JSONSchemaProperty
  properties?: Record<string, JSONSchemaProperty>
  required?: string[]
}

export interface JSONSchema {
  type: 'object'
  properties: Record<string, JSONSchemaProperty>
  required?: string[]
}

// ============================================================================
// 工具权限级别
// ============================================================================

export type ToolPermissionLevel = 'read' | 'write' | 'execute' | 'network'

// ============================================================================
// 工具分类
// ============================================================================

export type ToolCategory = 'file' | 'shell' | 'task' | 'skill' | 'integration'

// ============================================================================
// 工具定义接口
// ============================================================================

export interface ToolDefinition {
  name: AgentToolName
  displayName: string
  description: string
  descriptionEn: string
  parameters: JSONSchema
  requiredPermission: ToolPermissionLevel
  defaultInDefaultMode: boolean
  requiresApprovalWhenDisabled: boolean
  category: ToolCategory
  icon: string
}

// ============================================================================
// 15 个核心工具 + 扩展工具定义
// ============================================================================

export const TOOL_DEFINITIONS: Record<AgentToolName, ToolDefinition> = {
  Read: {
    name: 'Read',
    displayName: 'Read',
    description: '读取文件内容',
    descriptionEn: 'Read the contents of a file at the given path. Use offset and limit to read specific portions.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '要读取的文件绝对路径' },
        offset: { type: 'number', description: '起始行号（从 0 开始）' },
        limit: { type: 'number', description: '读取的行数' },
      },
      required: ['file_path'],
    },
    requiredPermission: 'read',
    defaultInDefaultMode: true,
    requiresApprovalWhenDisabled: false,
    category: 'file',
    icon: '📄',
  },

  Write: {
    name: 'Write',
    displayName: 'Write',
    description: '将内容写入文件',
    descriptionEn: 'Write content to a file at the given path. Overwrites existing files.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '目标文件绝对路径' },
        content: { type: 'string', description: '要写入的完整内容' },
      },
      required: ['file_path', 'content'],
    },
    requiredPermission: 'write',
    defaultInDefaultMode: false,
    requiresApprovalWhenDisabled: true,
    category: 'file',
    icon: '✏️',
  },

  Edit: {
    name: 'Edit',
    displayName: 'Edit',
    description: '对特定文件进行精确编辑（基于字符串匹配替换）',
    descriptionEn: 'Perform exact string replacement in a file. The old_string must match exactly.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '目标文件绝对路径' },
        old_string: { type: 'string', description: '要被替换的原文（必须完全匹配）' },
        new_string: { type: 'string', description: '替换后的新内容' },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
    requiredPermission: 'write',
    defaultInDefaultMode: false,
    requiresApprovalWhenDisabled: true,
    category: 'file',
    icon: '🔧',
  },

  MultiEdit: {
    name: 'MultiEdit',
    displayName: 'MultiEdit',
    description: '在单个文件上原子性地执行多次编辑',
    descriptionEn: 'Perform multiple edits on a single file atomically. All edits succeed or none do.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '目标文件绝对路径' },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              old_string: { type: 'string' },
              new_string: { type: 'string' },
            },
            required: ['old_string', 'new_string'],
          },
          description: '编辑操作列表',
        },
      },
      required: ['file_path', 'edits'],
    },
    requiredPermission: 'write',
    defaultInDefaultMode: false,
    requiresApprovalWhenDisabled: true,
    category: 'file',
    icon: '✂️',
  },

  Glob: {
    name: 'Glob',
    displayName: 'Glob',
    description: '根据模式匹配查找文件',
    descriptionEn: 'Find files matching a glob pattern (e.g., **/*.ts, src/**/*.json).',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'glob 模式，如 "**/*.ts"' },
        path: { type: 'string', description: '搜索根目录' },
      },
      required: ['pattern'],
    },
    requiredPermission: 'read',
    defaultInDefaultMode: true,
    requiresApprovalWhenDisabled: false,
    category: 'file',
    icon: '🔍',
  },

  Grep: {
    name: 'Grep',
    displayName: 'Grep',
    description: '在文件内容中搜索模式（正则表达式）',
    descriptionEn: 'Search for a regex pattern in file contents. Supports multiple output modes.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '正则表达式模式' },
        path: { type: 'string', description: '搜索目录' },
        include_glob: { type: 'string', description: '文件过滤' },
        output_mode: { type: 'string', enum: ['content', 'files_with_matches', 'count'] },
        context_lines: { type: 'number', description: '匹配行上下文行数' },
      },
      required: ['pattern'],
    },
    requiredPermission: 'read',
    defaultInDefaultMode: true,
    requiresApprovalWhenDisabled: false,
    category: 'file',
    icon: '🔎',
  },

  Bash: {
    name: 'Bash',
    displayName: 'Bash',
    description: '在你的环境中执行 Shell 命令',
    descriptionEn: 'Execute a shell command via Git Bash (Windows) or /bin/bash (Unix).',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell 命令' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时（毫秒）', default: 30000 },
        run_in_background: { type: 'boolean', description: '是否后台运行' },
        description: { type: 'string', description: '命令目的说明' },
      },
      required: ['command'],
    },
    requiredPermission: 'execute',
    defaultInDefaultMode: false,
    requiresApprovalWhenDisabled: true,
    category: 'shell',
    icon: '💻',
  },

  Task: {
    name: 'Task',
    displayName: 'Task',
    description: '运行子代理来处理复杂的多步骤任务',
    descriptionEn: 'Launch a sub-agent to handle complex multi-step tasks autonomously.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '子任务描述' },
        subagent_type: { type: 'string', enum: ['general-purpose', 'Explore', 'Plan'] },
      },
      required: ['prompt'],
    },
    requiredPermission: 'execute',
    defaultInDefaultMode: false,
    requiresApprovalWhenDisabled: false,
    category: 'task',
    icon: '🤖',
  },

  TodoWrite: {
    name: 'TodoWrite',
    displayName: 'TodoWrite',
    description: '创建并管理结构化任务列表',
    descriptionEn: 'Create and manage a structured task list for tracking progress on complex tasks.',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
              activeform: { type: 'string' },
            },
            required: ['content', 'status'],
          },
        },
      },
      required: ['todos'],
    },
    requiredPermission: 'execute',
    defaultInDefaultMode: true,
    requiresApprovalWhenDisabled: false,
    category: 'task',
    icon: '📋',
  },

  Skill: {
    name: 'Skill',
    displayName: 'Skill',
    description: '获取已启用 Skill 的详细指令（读取 SKILL.md 全文）',
    descriptionEn: 'Get the full content of a SKILL.md for an enabled skill.',
    parameters: {
      type: 'object',
      properties: {
        skillId: { type: 'string', description: 'Skill ID' },
      },
      required: ['skillId'],
    },
    requiredPermission: 'read',
    defaultInDefaultMode: true,
    requiresApprovalWhenDisabled: false,
    category: 'skill',
    icon: '⚡',
  },

  SkillScript: {
    name: 'SkillScript',
    displayName: 'Skill Script',
    description: '执行 Skill 中提供的脚本',
    descriptionEn: 'Execute a helper script bundled with a skill.',
    parameters: {
      type: 'object',
      properties: {
        skillId: { type: 'string' },
        scriptName: { type: 'string' },
        args: { type: 'array', items: { type: 'string' } },
      },
      required: ['skillId', 'scriptName'],
    },
    requiredPermission: 'execute',
    defaultInDefaultMode: false,
    requiresApprovalWhenDisabled: true,
    category: 'skill',
    icon: '📜',
  },

  ImageGen: {
    name: 'ImageGen',
    displayName: '图片生成',
    description: '调用图像模型生成图片',
    descriptionEn: 'Generate an image using PatentHub image generation models.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        model: { type: 'string' },
        size: { type: 'string', enum: ['1024x1024', '1024x1792', '1792x1024'] },
      },
      required: ['prompt'],
    },
    requiredPermission: 'execute',
    defaultInDefaultMode: true,
    requiresApprovalWhenDisabled: false,
    category: 'integration',
    icon: '🖼️',
  },

  KnowledgeBase: {
    name: 'KnowledgeBase',
    displayName: '知识库检索',
    description: '在 PatentHub 知识库中检索相关内容',
    descriptionEn: 'Search the PatentHub knowledge base for relevant documents.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        kbId: { type: 'string' },
        topK: { type: 'number', default: 5 },
      },
      required: ['query'],
    },
    requiredPermission: 'read',
    defaultInDefaultMode: true,
    requiresApprovalWhenDisabled: false,
    category: 'integration',
    icon: '📚',
  },

  WebSearch: {
    name: 'WebSearch',
    displayName: 'Web 搜索',
    description: '在互联网上搜索信息',
    descriptionEn: 'Search the internet for information on a given query.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
    requiredPermission: 'network',
    defaultInDefaultMode: true,
    requiresApprovalWhenDisabled: false,
    category: 'integration',
    icon: '🌐',
  },

  WebFetch: {
    name: 'WebFetch',
    displayName: 'Web 抓取',
    description: '抓取并提取指定 URL 的网页内容',
    descriptionEn: 'Fetch and extract content from a given URL.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        prompt: { type: 'string' },
      },
      required: ['url'],
    },
    requiredPermission: 'network',
    defaultInDefaultMode: true,
    requiresApprovalWhenDisabled: false,
    category: 'integration',
    icon: '🔗',
  },
}

// ============================================================================
// 工具列表（数组形式，便于 UI 遍历）
// ============================================================================

export const ALL_TOOL_NAMES: AgentToolName[] = Object.keys(TOOL_DEFINITIONS) as AgentToolName[]

export const TOOL_CATEGORIES: Record<ToolCategory, { label: string; icon: string; tools: AgentToolName[] }> = {
  file: {
    label: '文件操作',
    icon: '📁',
    tools: ['Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep'],
  },
  shell: {
    label: 'Shell 命令',
    icon: '💻',
    tools: ['Bash'],
  },
  task: {
    label: '任务管理',
    icon: '📋',
    tools: ['Task', 'TodoWrite'],
  },
  skill: {
    label: 'Skills',
    icon: '⚡',
    tools: ['Skill', 'SkillScript'],
  },
  integration: {
    label: '集成能力',
    icon: '🔌',
    tools: ['ImageGen', 'KnowledgeBase', 'WebSearch', 'WebFetch'],
  },
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 根据权限模式获取默认启用的工具列表
 */
export function getDefaultToolsForMode(permissionMode: import('./types').AgentPermissionMode): AgentToolName[] {
  const defaults = new Set<AgentToolName>()
  for (const [name, def] of Object.entries(TOOL_DEFINITIONS)) {
    if (def.defaultInDefaultMode) {
      defaults.add(name as AgentToolName)
    }
  }
  return Array.from(defaults)
}

/**
 * 检查工具在当前权限模式下是否可用
 */
export function isToolAllowedInMode(
  toolName: AgentToolName,
  permissionMode: import('./types').AgentPermissionMode,
  enabledTools: AgentToolName[]
): { allowed: boolean; requiresApproval: boolean } {
  const tool = TOOL_DEFINITIONS[toolName]
  if (!tool) return { allowed: false, requiresApproval: false }

  // 全自动模式：全部允许
  if (permissionMode === 'bypassPermissions') {
    return { allowed: true, requiresApproval: false }
  }

  // 计划模式：仅允许读类工具
  if (permissionMode === 'plan') {
    return {
      allowed: tool.requiredPermission === 'read',
      requiresApproval: false,
    }
  }

  // 检查是否被启用
  if (enabledTools.length > 0 && !enabledTools.includes(toolName)) {
    return {
      allowed: tool.requiresApprovalWhenDisabled,
      requiresApproval: tool.requiresApprovalWhenDisabled,
    }
  }

  // 普通模式：读类允许，写/执行需确认
  if (permissionMode === 'default') {
    if (tool.defaultInDefaultMode) return { allowed: true, requiresApproval: false }
    if (tool.requiredPermission === 'read') return { allowed: true, requiresApproval: false }
    return { allowed: true, requiresApproval: true }
  }

  // 自动编辑模式：读写允许，执行需确认
  if (permissionMode === 'acceptEdits') {
    if (tool.requiredPermission !== 'execute') return { allowed: true, requiresApproval: false }
    return { allowed: true, requiresApproval: true }
  }

  return { allowed: false, requiresApproval: false }
}

/**
 * 将 ToolDefinition 转换为 OpenAI function calling 格式
 */
export function toOpenAITool(tool: ToolDefinition): {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: JSONSchema
  }
} {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.descriptionEn,
      parameters: tool.parameters,
    },
  }
}

/**
 * 将多个 ToolDefinition 转换为 OpenAI tools 数组
 */
export function toOpenAITools(tools: ToolDefinition[]) {
  return tools.map(toOpenAITool)
}