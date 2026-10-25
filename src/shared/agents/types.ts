/**
 * Agents shared types - 跨进程共享的 Agent 类型
 * 参考 Cherry Studio: src/shared/data/types/agent.ts
 *
 * 增强版：支持完整的 Claude Code 风格工具调用能力
 * - 11+ 工具注册
 * - 4 种权限模式
 * - Git Bash / 工作目录 / 环境变量
 * - Skills 作为可调用工具
 */

// ============================================================================
// 权限模式（4 种，对应 Claude Code 风格）
// ============================================================================

export type AgentPermissionMode =
  | 'default'              // 普通模式：可读取，编辑/执行需询问
  | 'acceptEdits'          // 自动编辑模式：可读+编辑，执行需询问
  | 'bypassPermissions'    // 全自动模式：所有操作无需询问
  | 'plan'                 // 计划模式：只能读和制定计划

export const PERMISSION_MODE_INFO: Record<AgentPermissionMode, {
  label: string
  description: string
  dangerous?: boolean
}> = {
  default: {
    label: '普通模式',
    description: '可自由读取文件，编辑或执行命令前会询问',
  },
  acceptEdits: {
    label: '自动编辑模式',
    description: '可自由读取和编辑文件，执行命令前会询问',
  },
  bypassPermissions: {
    label: '全自动模式',
    description: '可执行任何操作，无需询问。请谨慎使用。',
    dangerous: true,
  },
  plan: {
    label: '计划模式',
    description: '只能读取文件和制定计划，不能编辑文件或执行命令',
  },
}

// ============================================================================
// 工具名称（11+ 个核心工具 + 扩展工具）
// ============================================================================

export type AgentToolName =
  // 文件操作
  | 'Read'           // 读取文件
  | 'Write'          // 写入文件
  | 'Edit'           // 精确编辑
  | 'MultiEdit'      // 多次编辑
  | 'Glob'           // 文件匹配
  | 'Grep'           // 内容搜索
  // Shell / 任务
  | 'Bash'           // Shell 命令执行（需 Git Bash）
  | 'Task'           // 子代理任务
  | 'TodoWrite'      // 任务列表管理
  // Skill 工具
  | 'Skill'          // 获取 Skill 详情
  | 'SkillScript'    // 执行 Skill 中的脚本
  // 集成工具
  | 'ImageGen'       // 图片生成（包装 PatentHub 现有功能）
  | 'KnowledgeBase'  // 知识库检索（包装 RAG）
  | 'WebSearch'      // 联网搜索
  | 'WebFetch'       // 网页抓取

// ============================================================================
// Agent 实体（增强版）
// ============================================================================

export interface AgentEntity {
  id: string
  name: string
  description: string | null
  /** System Prompt */
  instructions: string | null
  /** 格式: "provider:modelId"，复用 PatentHub settingsStore */
  model: string
  /** emoji 图标 */
  icon: string
  permissionMode: AgentPermissionMode

  // ====== 新增字段（Cherry-Studio 风格）======

  /** Git Bash 可执行文件路径（Windows 必需） */
  gitBashPath: string | null
  /** 是否自动检测 Git Bash 路径 */
  autoDetectGitBash: boolean
  /** 自主模式（Agent 自主执行多步任务，无需逐步确认） */
  autonomousMode: boolean
  /** 工作目录列表 */
  workingDirectories: string[]
  /** 环境变量（每行一个 KEY=value） */
  environmentVariables: string
  /** 启用的工具列表（空数组表示全部启用） */
  enabledTools: AgentToolName[]

  createdAt: string
  updatedAt: string
}

// ============================================================================
// Agent ↔ Skill 关联
// ============================================================================

export interface AgentSkillJoin {
  agentId: string
  skillId: string
  skillName: string
  skillDescription: string | null
  isEnabled: boolean
}

// ============================================================================
// DTOs
// ============================================================================

export interface CreateAgentDto {
  name: string
  description?: string
  instructions?: string
  model: string
  icon?: string
  permissionMode?: AgentPermissionMode

  // 新增
  gitBashPath?: string | null
  autoDetectGitBash?: boolean
  autonomousMode?: boolean
  workingDirectories?: string[]
  environmentVariables?: string
  enabledTools?: AgentToolName[]
  /** 创建时关联的 Skill IDs */
  skillIds?: string[]
}

export interface UpdateAgentDto {
  name?: string
  description?: string | null
  instructions?: string | null
  model?: string
  icon?: string
  permissionMode?: AgentPermissionMode
  gitBashPath?: string | null
  autoDetectGitBash?: boolean
  autonomousMode?: boolean
  workingDirectories?: string[]
  environmentVariables?: string
  enabledTools?: AgentToolName[]
}

// ============================================================================
// 工具调用相关类型
// ============================================================================

export interface ToolCall {
  id: string
  /** 工具名（如 Bash、Read 等） */
  name: AgentToolName
  /** 工具调用参数 */
  arguments: Record<string, any>
  /** 工具调用状态 */
  status: 'pending' | 'approved' | 'denied' | 'running' | 'success' | 'error'
  /** 执行结果 */
  result?: ToolResult
  /** 时间戳 */
  timestamp: number
}

export interface ToolResult {
  success: boolean
  content: string
  error?: string
  metadata?: Record<string, any>
  /** 输出文件路径列表（用于特殊工具如 Write） */
  outputFiles?: string[]
}

// ============================================================================
// 权限询问
// ============================================================================

export interface PermissionRequest {
  eventId: string
  agentId: string
  toolName: AgentToolName
  toolDisplayName: string
  toolDescription: string
  arguments: Record<string, any>
  requiredPermission: 'read' | 'write' | 'execute' | 'network'
}

export type PermissionDecision = 'allow' | 'deny'

// ============================================================================
// Agent 通用文件上传：附件相关类型
// ============================================================================

/** 用户消息内容 part（OpenAI 兼容多模态，支持纯文本或图文） */
export type AgentUserContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

/** 上传附件的描述（落盘到工作目录后，注入给模型理解的清单项） */
export interface AgentAttachment {
  id: string
  /** 原始文件名 */
  name: string
  /** 在磁盘上的绝对路径（工具可访问） */
  absPath: string
  /** 相对 agent 工作目录的路径 */
  relPath: string
  size: number
  mime: string
  kind: 'text' | 'pdf' | 'doc' | 'image' | 'other'
  /** 抽取的正文（供非视觉模型理解） */
  text?: string
  isImage: boolean
  /** 扫描件（无文字层）标记，提示需要 OCR 或视觉模型 */
  ocrNeeded?: boolean
  /** 文档页数 */
  pages?: number
}

// ============================================================================
// IPC API 类型（扩展）
// ============================================================================

export interface AgentsApi {
  // CRUD
  list: () => Promise<AgentEntity[]>
  getById: (id: string) => Promise<AgentEntity | null>
  create: (data: CreateAgentDto) => Promise<AgentEntity>
  update: (id: string, data: UpdateAgentDto) => Promise<AgentEntity>
  delete: (id: string) => Promise<void>

  // Skills 关联
  getSkills: (agentId: string) => Promise<AgentSkillJoin[]>
  toggleSkill: (agentId: string, skillId: string, isEnabled: boolean) => Promise<void>

  // Git Bash 自动发现
  detectGitBash: () => Promise<{ found: boolean; path?: string }>
  selectGitBashPath: () => Promise<string | null>

  // 权限询问响应（Renderer → Main）
  respondPermission: (eventId: string, decision: PermissionDecision, alwaysAllow?: boolean) => Promise<void>

  // 工具执行（Renderer → Main，用于手动测试）
  testTool: (toolName: AgentToolName, args: Record<string, any>, agentId: string) => Promise<ToolResult>

  // 会话执行 Agent（流式）
  runAgent: (params: {
    agentId: string
    sessionId: string
    userMessage: string | AgentUserContentPart[]
    attachments?: AgentAttachment[]
    /** 会话级权限模式覆盖（不持久化到 agent，仅本次/后续 run 生效） */
    permissionMode?: AgentPermissionMode
  }) => Promise<void>
  stopAgent: (sessionId: string) => Promise<void>

  // 事件订阅
  onPermissionRequest: (callback: (request: PermissionRequest) => void) => () => void
  onToolStart: (callback: (event: { sessionId: string; toolCall: ToolCall }) => void) => () => void
  onToolComplete: (callback: (event: { sessionId: string; toolCall: ToolCall }) => void) => () => void
  onAgentMessage: (callback: (event: { sessionId: string; message: any }) => void) => () => void
  onAgentComplete: (callback: (event: { sessionId: string; usage: { inputTokens: number; outputTokens: number; totalTokens: number } }) => void) => () => void
  onTodoUpdate: (callback: (event: { sessionId: string; todos: TodoItem[] }) => void) => () => void
}

// ============================================================================
// Todo 项（任务列表）
// ============================================================================

export interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}