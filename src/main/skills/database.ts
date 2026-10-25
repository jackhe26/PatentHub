/**
 * Skills & Agents Database - 使用 @libsql/client
 * 参考 PatentHub 现有 knowledge-base/db.ts 的模式
 *
 * v2 增强版：支持完整 Agent 配置字段
 * - Git Bash / 工作目录 / 环境变量
 * - 自主模式 / 启用的工具列表
 */

import fs from 'node:fs'
import path from 'node:path'
import { createClient, type Client } from '@libsql/client'
import { app } from 'electron'

let db: Client | null = null

export function getDatabase(): Client {
  if (!db) {
    throw new Error('Skills database not initialized')
  }
  return db
}

export async function initializeDatabase(): Promise<Client> {
  const dbPath = path.join(app.getPath('userData'), 'databases', 'agents_skills.db')
  const dbDir = path.dirname(dbPath)

  // Ensure directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  // Create client
  db = createClient({
    url: `file:${dbPath}`,
  })

  await db.batch([
    // Agent 实体表（增强版）
    `CREATE TABLE IF NOT EXISTS agent_entities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      instructions TEXT DEFAULT '',
      model TEXT NOT NULL,
      icon TEXT DEFAULT '🤖',
      permission_mode TEXT DEFAULT 'default',

      -- 新增字段
      git_bash_path TEXT,
      auto_detect_git_bash INTEGER DEFAULT 0,
      autonomous_mode INTEGER DEFAULT 1,
      working_directories TEXT DEFAULT '[]',
      environment_variables TEXT DEFAULT '',
      enabled_tools TEXT DEFAULT '[]',

      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,

    // Skill 主表
    `CREATE TABLE IF NOT EXISTS agent_skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      folder_name TEXT NOT NULL UNIQUE,
      source TEXT DEFAULT 'marketplace',
      source_url TEXT,
      author TEXT,
      tags TEXT DEFAULT '[]',
      content_hash TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,

    // Agent ↔ Skill 关联表
    `CREATE TABLE IF NOT EXISTS agent_skill_joins (
      agent_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      is_enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (agent_id, skill_id),
      FOREIGN KEY (agent_id) REFERENCES agent_entities(id) ON DELETE CASCADE,
      FOREIGN KEY (skill_id) REFERENCES agent_skills(id) ON DELETE CASCADE
    )`,

    // Agent 会话表（用于跟踪 Agent 运行的会话）
    `CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      session_id TEXT,
      chat_session_id TEXT,
      status TEXT DEFAULT 'idle',
      started_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT,
      FOREIGN KEY (agent_id) REFERENCES agent_entities(id) ON DELETE CASCADE
    )`,

    // Agent 自动批准工具表（用户选择「始终允许」的工具）
    `CREATE TABLE IF NOT EXISTS agent_auto_approve_tools (
      agent_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      approved_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (agent_id, tool_name),
      FOREIGN KEY (agent_id) REFERENCES agent_entities(id) ON DELETE CASCADE
    )`,

    // 索引
    `CREATE INDEX IF NOT EXISTS idx_skills_folder_name ON agent_skills(folder_name)`,
    `CREATE INDEX IF NOT EXISTS idx_joins_agent ON agent_skill_joins(agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_joins_skill ON agent_skill_joins(skill_id)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent ON agent_sessions(agent_id)`,
  ])

  // 数据库迁移（兼容老版本）
  await migrateAgentTable()

  return db
}

/**
 * 迁移：为旧版数据库添加新字段
 */
async function migrateAgentTable() {
  if (!db) return
  const migrations = [
    `ALTER TABLE agent_entities ADD COLUMN git_bash_path TEXT`,
    `ALTER TABLE agent_entities ADD COLUMN auto_detect_git_bash INTEGER DEFAULT 0`,
    `ALTER TABLE agent_entities ADD COLUMN autonomous_mode INTEGER DEFAULT 1`,
    `ALTER TABLE agent_entities ADD COLUMN working_directories TEXT DEFAULT '[]'`,
    `ALTER TABLE agent_entities ADD COLUMN environment_variables TEXT DEFAULT ''`,
    `ALTER TABLE agent_entities ADD COLUMN enabled_tools TEXT DEFAULT '[]'`,
  ]
  for (const sql of migrations) {
    try {
      await db.execute(sql)
    } catch (err) {
      // 列已存在，忽略错误
    }
  }
}