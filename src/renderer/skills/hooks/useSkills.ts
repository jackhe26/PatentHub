/**
 * Skills React Hooks - 使用 TanStack Query
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { skillApi } from '../services/skillApi'

const QUERY_KEY = ['skills', 'list']

export function useSkills() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => skillApi.list(),
  })
}

export function useInstallSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (source: string) => skillApi.install(source),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export function useUninstallSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => skillApi.uninstall(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export function useSearchSkills() {
  return useMutation({
    mutationFn: (query: string) => skillApi.search(query),
  })
}