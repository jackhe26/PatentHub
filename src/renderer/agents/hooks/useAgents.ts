/**
 * Agents React Hooks - 使用 TanStack Query
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { agentApi } from '../services/agentApi'

const QUERY_KEY = ['agents', 'list']

export function useAgents() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => agentApi.list(),
  })
}

export function useCreateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: agentApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export function useDeleteAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: agentApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export function useAgentSkills(agentId: string) {
  return useQuery({
    queryKey: ['agents', 'skills', agentId],
    queryFn: () => agentApi.getSkills(agentId),
    enabled: !!agentId,
  })
}

export function useToggleAgentSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ agentId, skillId, isEnabled }: { agentId: string; skillId: string; isEnabled: boolean }) =>
      agentApi.toggleSkill(agentId, skillId, isEnabled),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ['agents', 'skills', agentId] })
    },
  })
}