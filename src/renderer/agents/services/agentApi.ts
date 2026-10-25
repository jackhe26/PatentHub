/**
 * Agents API - 前端 IPC 调用封装
 */

import type { AgentEntity, CreateAgentDto, UpdateAgentDto, AgentSkillJoin } from '../../../shared/agents/types'

export const agentApi = {
  list: (): Promise<AgentEntity[]> => window.electronAPI.agents.list(),
  getById: (id: string): Promise<AgentEntity | null> => window.electronAPI.agents.getById(id),
  create: (data: CreateAgentDto): Promise<AgentEntity> => window.electronAPI.agents.create(data),
  update: (id: string, data: UpdateAgentDto): Promise<AgentEntity> => window.electronAPI.agents.update(id, data),
  delete: (id: string): Promise<void> => window.electronAPI.agents.delete(id),
  getSkills: (agentId: string): Promise<AgentSkillJoin[]> => window.electronAPI.agents.getSkills(agentId),
  toggleSkill: (agentId: string, skillId: string, isEnabled: boolean): Promise<void> =>
    window.electronAPI.agents.toggleSkill(agentId, skillId, isEnabled),
}