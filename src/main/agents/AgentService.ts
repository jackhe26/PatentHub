/**
 * AgentService - Agent CRUD 服务（增强版）
 *
 * 支持完整 Agent 字段：
 * - 基础字段：名称、描述、指令、模型、图标
 * - 权限模式（4 种）
 * - Git Bash 自动发现
 * - 工作目录、环境变量
 * - 自主模式、启用的工具列表
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  AgentEntity,
  CreateAgentDto,
  UpdateAgentDto,
  AgentSkillJoin,
  AgentToolName,
} from '../../shared/agents/types'
import { getDatabase } from '../skills/database'

/**
 * 解析 JSON 数组字段，如果失败则返回默认值
 */
function parseJsonArray<T = string>(value: unknown, defaultValue: T[] = []): T[] {
  if (!value) return defaultValue
  if (typeof value !== 'string') return defaultValue
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : defaultValue
  } catch {
    return defaultValue
  }
}

export class AgentService {
  async list(): Promise<AgentEntity[]> {
    const db = getDatabase()
    const result = await db.execute('SELECT * FROM agent_entities ORDER BY created_at DESC')
    return result.rows.map((row) => this.mapRowToEntity(row))
  }

  async getById(id: string): Promise<AgentEntity | null> {
    const db = getDatabase()
    const result = await db.execute({ sql: 'SELECT * FROM agent_entities WHERE id = ?', args: [id] })
    if (result.rows.length === 0) return null
    return this.mapRowToEntity(result.rows[0])
  }

  async create(data: CreateAgentDto): Promise<AgentEntity> {
    const db = getDatabase()
    const id = uuidv4()
    const now = new Date().toISOString()

    await db.execute({
      sql: `INSERT INTO agent_entities (
        id, name, description, instructions, model, icon, permission_mode,
        git_bash_path, auto_detect_git_bash, autonomous_mode,
        working_directories, environment_variables, enabled_tools,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        data.name,
        data.description || '',
        data.instructions || '',
        data.model,
        data.icon || '🤖',
        data.permissionMode || 'default',
        data.gitBashPath || null,
        data.autoDetectGitBash ? 1 : 0,
        data.autonomousMode !== false ? 1 : 0,
        JSON.stringify(data.workingDirectories || []),
        data.environmentVariables || '',
        JSON.stringify(data.enabledTools || []),
        now,
        now,
      ],
    })

    // 如果有关联 Skills，创建关联
    if (data.skillIds && data.skillIds.length > 0) {
      for (const skillId of data.skillIds) {
        await db.execute({
          sql: 'INSERT OR IGNORE INTO agent_skill_joins (agent_id, skill_id, is_enabled) VALUES (?, ?, 1)',
          args: [id, skillId],
        })
      }
    }

    return (await this.getById(id))!
  }

  async update(id: string, data: UpdateAgentDto): Promise<AgentEntity> {
    const db = getDatabase()
    const sets: string[] = []
    const args: any[] = []

    if (data.name !== undefined) { sets.push('name = ?'); args.push(data.name) }
    if (data.description !== undefined) { sets.push('description = ?'); args.push(data.description) }
    if (data.instructions !== undefined) { sets.push('instructions = ?'); args.push(data.instructions) }
    if (data.model !== undefined) { sets.push('model = ?'); args.push(data.model) }
    if (data.icon !== undefined) { sets.push('icon = ?'); args.push(data.icon) }
    if (data.permissionMode !== undefined) { sets.push('permission_mode = ?'); args.push(data.permissionMode) }
    if (data.gitBashPath !== undefined) { sets.push('git_bash_path = ?'); args.push(data.gitBashPath) }
    if (data.autoDetectGitBash !== undefined) { sets.push('auto_detect_git_bash = ?'); args.push(data.autoDetectGitBash ? 1 : 0) }
    if (data.autonomousMode !== undefined) { sets.push('autonomous_mode = ?'); args.push(data.autonomousMode ? 1 : 0) }
    if (data.workingDirectories !== undefined) { sets.push('working_directories = ?'); args.push(JSON.stringify(data.workingDirectories)) }
    if (data.environmentVariables !== undefined) { sets.push('environment_variables = ?'); args.push(data.environmentVariables) }
    if (data.enabledTools !== undefined) { sets.push('enabled_tools = ?'); args.push(JSON.stringify(data.enabledTools)) }

    sets.push('updated_at = ?')
    args.push(new Date().toISOString())
    args.push(id)

    await db.execute({
      sql: `UPDATE agent_entities SET ${sets.join(', ')} WHERE id = ?`,
      args,
    })

    return (await this.getById(id))!
  }

  async delete(id: string): Promise<void> {
    const db = getDatabase()
    await db.execute({ sql: 'DELETE FROM agent_entities WHERE id = ?', args: [id] })
  }

  async getSkills(agentId: string): Promise<AgentSkillJoin[]> {
    const db = getDatabase()
    const result = await db.execute({
      sql: `SELECT j.agent_id, j.skill_id, j.is_enabled, s.name as skill_name, s.description as skill_description
            FROM agent_skill_joins j
            JOIN agent_skills s ON j.skill_id = s.id
            WHERE j.agent_id = ?`,
      args: [agentId],
    })

    return result.rows.map((row) => ({
      agentId: row.agent_id as string,
      skillId: row.skill_id as string,
      skillName: row.skill_name as string,
      skillDescription: row.skill_description as string | null,
      isEnabled: Boolean(row.is_enabled),
    }))
  }

  async toggleSkill(agentId: string, skillId: string, isEnabled: boolean): Promise<void> {
    const db = getDatabase()
    await db.execute({
      sql: `INSERT INTO agent_skill_joins (agent_id, skill_id, is_enabled)
            VALUES (?, ?, ?)
            ON CONFLICT(agent_id, skill_id) DO UPDATE SET is_enabled = excluded.is_enabled`,
      args: [agentId, skillId, isEnabled ? 1 : 0],
    })
  }

  /**
   * 设置 Agent 的自动批准工具列表
   */
  async setAutoApproveTools(agentId: string, toolNames: AgentToolName[]): Promise<void> {
    const db = getDatabase()
    await db.execute({
      sql: 'DELETE FROM agent_auto_approve_tools WHERE agent_id = ?',
      args: [agentId],
    })
    for (const toolName of toolNames) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO agent_auto_approve_tools (agent_id, tool_name) VALUES (?, ?)',
        args: [agentId, toolName],
      })
    }
  }

  /**
   * 获取 Agent 的自动批准工具列表
   */
  async getAutoApproveTools(agentId: string): Promise<AgentToolName[]> {
    const db = getDatabase()
    const result = await db.execute({
      sql: 'SELECT tool_name FROM agent_auto_approve_tools WHERE agent_id = ?',
      args: [agentId],
    })
    return result.rows.map((row) => row.tool_name as AgentToolName)
  }

  private mapRowToEntity(row: any): AgentEntity {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) || null,
      instructions: (row.instructions as string) || null,
      model: row.model as string,
      icon: row.icon as string,
      permissionMode: (row.permission_mode as any) || 'default',
      gitBashPath: (row.git_bash_path as string) || null,
      autoDetectGitBash: Boolean(row.auto_detect_git_bash),
      autonomousMode: Boolean(row.autonomous_mode ?? 1),
      workingDirectories: parseJsonArray(row.working_directories, []),
      environmentVariables: (row.environment_variables as string) || '',
      enabledTools: parseJsonArray<AgentToolName>(row.enabled_tools, []),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }
  }
}

export const agentService = new AgentService()