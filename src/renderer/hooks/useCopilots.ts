import type { CopilotDetail } from '@shared/types'
import { useQuery } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { useEffect } from 'react'
import * as remote from '@/packages/remote'
import storage, { StorageKey } from '@/storage'
import { useLanguage } from '@/stores/settingsStore'
import { patentCopilots } from '@/data/patent-copilots'

const myCopilotsAtom = atomWithStorage<CopilotDetail[]>(StorageKey.MyCopilots, [], storage)

// 初始化默认专利搭子
const initializePatentCopilots = async (currentCopilots: CopilotDetail[]): Promise<CopilotDetail[]> => {
  const patentCopilotIds = patentCopilots.map((p) => p.id)
  const existingIds = currentCopilots.map((c) => c.id)

  // 检查是否已有专利搭子
  const hasPatentCopilots = patentCopilotIds.some((id) => existingIds.includes(id))

  if (!hasPatentCopilots) {
    // 首次初始化，添加所有专利搭子
    return [...currentCopilots, ...patentCopilots]
  }

  return currentCopilots
}

export function useMyCopilots() {
  const [copilots, setCopilots] = useAtom(myCopilotsAtom)

  // 初始化专利搭子
  useEffect(() => {
    const init = async () => {
      setCopilots(async (prev) => {
        const current = await prev
        return initializePatentCopilots(current)
      })
    }
    init()
  }, []) // 仅在组件挂载时执行一次

  const addOrUpdate = (target: CopilotDetail) => {
    setCopilots(async (prev) => {
      const copilots = await prev
      let found = false
      const newCopilots = copilots.map((c) => {
        if (c.id === target.id) {
          found = true
          return target
        }
        return c
      })
      if (!found) {
        newCopilots.push(target)
      }
      return newCopilots
    })
  }

  const remove = (id: string) => {
    setCopilots(async (prev) => {
      const copilots = await prev
      return copilots.filter((c) => c.id !== id)
    })
  }

  return {
    copilots,
    addOrUpdate,
    remove,
  }
}

export function useRemoteCopilots() {
  const language = useLanguage()
  const { data: copilots, ...others } = useQuery({
    queryKey: ['remote-copilots', language],
    queryFn: () => remote.listCopilots(language),
    initialData: [],
    initialDataUpdatedAt: 0,
    staleTime: 0, // 不缓存，每次都获取最新数据
    refetchOnWindowFocus: true,
  })
  return { copilots, ...others }
}
