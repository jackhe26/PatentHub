/**
 * SkillService - 技能管理核心服务
 * 参考 Cherry Studio: src/main/ai/skills/SkillService.ts
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import type { InstalledSkill, SkillSearchResult } from '../../shared/skills/types'
import { getDatabase } from './database'

const SKILLS_DIR = path.join(app.getPath('userData'), 'agents-skills', 'skills')

// 确保目录存在
function ensureSkillsDir() {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true })
  }
}

// 解析安装源
function parseInstallSource(source: string): { type: string; identifier: string } {
  const [type, ...rest] = source.split(':')
  return { type, identifier: rest.join(':') }
}

// 从 GitHub 克隆
async function cloneGitHubRepo(repoUrl: string, destDir: string): Promise<void> {
  const { execSync } = require('node:child_process')
  execSync(`git clone --depth 1 \"${repoUrl}\" \"${destDir}\"`, { stdio: 'ignore' })
}

export class SkillService {
  // 列出已安装的技能
  async list(): Promise<InstalledSkill[]> {
    const db = getDatabase()
    const result = await db.execute('SELECT * FROM agent_skills ORDER BY created_at DESC')
    return result.rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | null,
      folderName: row.folder_name as string,
      source: row.source as string,
      sourceUrl: row.source_url as string | null,
      author: row.author as string | null,
      tags: JSON.parse((row.tags as string) || '[]'),
      contentHash: row.content_hash as string,
      isEnabled: true,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }))
  }

  // 根据 ID 获取技能
  async getById(id: string): Promise<InstalledSkill | null> {
    const db = getDatabase()
    const result = await db.execute({
      sql: 'SELECT * FROM agent_skills WHERE id = ?',
      args: [id],
    })
    if (result.rows.length === 0) return null
    const row = result.rows[0]
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | null,
      folderName: row.folder_name as string,
      source: row.source as string,
      sourceUrl: row.source_url as string | null,
      author: row.author as string | null,
      tags: JSON.parse((row.tags as string) || '[]'),
      contentHash: row.content_hash as string,
      isEnabled: true,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }
  }

  // 安装技能
  async install(installSource: string): Promise<InstalledSkill> {
    ensureSkillsDir()
    const { type, identifier } = parseInstallSource(installSource)

    // 创建临时目录
    const tempDir = path.join(app.getPath('temp'), `skill-install-${Date.now()}`)
    fs.mkdirSync(tempDir, { recursive: true })

    try {
      if (type === 'claude-plugins' || type === 'skills.sh') {
        // 从 GitHub 克隆
        const parts = identifier.split('/')
        const repoUrl = `https://github.com/${parts[0]}/${parts[1]}`
        await cloneGitHubRepo(repoUrl, tempDir)
      } else {
        throw new Error(`Unsupported install source: ${type}`)
      }

      // 查找 SKILL.md
      const skillMdPath = await this.findSkillMd(tempDir)
      if (!skillMdPath) {
        throw new Error('SKILL.md not found in the repository')
      }

      // 解析元数据
      const metadata = await this.parseSkillMetadata(skillMdPath)

      // 复制到技能库
      const folderName = this.sanitizeFolderName(metadata.name)
      const destDir = path.join(SKILLS_DIR, folderName)

      if (fs.existsSync(destDir)) {
        // 更新现有技能
        fs.rmSync(destDir, { recursive: true })
      }

      fs.cpSync(tempDir, destDir, { recursive: true })

      // 计算内容哈希
      const contentHash = await this.computeContentHash(skillMdPath)

      // 保存到数据库
      const id = uuidv4()
      const db = getDatabase()
      await db.execute({
        sql: `INSERT INTO agent_skills (id, name, description, folder_name, source, source_url, author, tags, content_hash)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(folder_name) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                source = excluded.source,
                source_url = excluded.source_url,
                author = excluded.author,
                tags = excluded.tags,
                content_hash = excluded.content_hash,
                updated_at = datetime('now')`,
        args: [
          id,
          metadata.name,
          metadata.description || null,
          folderName,
          type,
          `https://github.com/${identifier}`,
          metadata.author || null,
          JSON.stringify(metadata.tags || []),
          contentHash,
        ],
      })

      return (await this.getById(id))!
    } finally {
      // 清理临时目录
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    }
  }

  // 从 ZIP 安装
  async installFromZip(zipPath: string): Promise<InstalledSkill> {
    // TODO: 实现 ZIP 解压安装
    throw new Error('ZIP install not yet implemented')
  }

  // 从本地目录安装
  async installFromDirectory(dirPath: string): Promise<InstalledSkill> {
    ensureSkillsDir()

    const skillMdPath = await this.findSkillMd(dirPath)
    if (!skillMdPath) {
      throw new Error('SKILL.md not found in the directory')
    }

    const metadata = await this.parseSkillMetadata(skillMdPath)
    const folderName = this.sanitizeFolderName(metadata.name)
    const destDir = path.join(SKILLS_DIR, folderName)

    // 复制目录
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true })
    }
    fs.cpSync(dirPath, destDir, { recursive: true })

    // 保存到数据库
    const id = uuidv4()
    const contentHash = await this.computeContentHash(skillMdPath)
    const db = getDatabase()

    await db.execute({
      sql: `INSERT INTO agent_skills (id, name, description, folder_name, source, author, tags, content_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(folder_name) DO UPDATE SET
              name = excluded.name,
              description = excluded.description,
              author = excluded.author,
              tags = excluded.tags,
              content_hash = excluded.content_hash,
              updated_at = datetime('now')`,
      args: [
        id,
        metadata.name,
        metadata.description || null,
        folderName,
        'local',
        metadata.author || null,
        JSON.stringify(metadata.tags || []),
        contentHash,
      ],
    })

    return (await this.getById(id))!
  }

  // 卸载技能
  async uninstall(skillId: string): Promise<void> {
    const db = getDatabase()
    const skill = await this.getById(skillId)
    if (!skill) throw new Error('Skill not found')

    // 删除文件
    const skillDir = path.join(SKILLS_DIR, skill.folderName)
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true })
    }

    // 删除数据库记录
    await db.execute({
      sql: 'DELETE FROM agent_skills WHERE id = ?',
      args: [skillId],
    })
  }

  // 查找 SKILL.md
  private async findSkillMd(dirPath: string): Promise<string | null> {
    const variants = ['SKILL.md', 'skill.md', 'Skill.md']
    for (const variant of variants) {
      const fullPath = path.join(dirPath, variant)
      if (fs.existsSync(fullPath)) {
        return fullPath
      }
    }
    return null
  }

  // 解析 SKILL.md 元数据
  private async parseSkillMetadata(skillMdPath: string): Promise<{
    name: string
    description?: string
    author?: string
    tags?: string[]
  }> {
    const content = fs.readFileSync(skillMdPath, 'utf-8')
    const { parse } = require('gray-matter')
    const { data, content: body } = parse(content)

    return {
      name: data.name || path.basename(path.dirname(skillMdPath)),
      description: data.description || body.slice(0, 200).trim(),
      author: data.author,
      tags: data.tags || [],
    }
  }

  // 计算内容哈希
  private async computeContentHash(skillMdPath: string): Promise<string> {
    const crypto = require('node:crypto')
    const content = fs.readFileSync(skillMdPath, 'utf-8')
    return crypto.createHash('sha256').update(content).digest('hex')
  }

  // 清理文件夹名
  private sanitizeFolderName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50)
  }
}

// 单例实例
export const skillService = new SkillService()