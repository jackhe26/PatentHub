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

// 所有专利搭档的ID都以该前缀开头
const PATENT_COPILOT_ID_PREFIX = 'patent-copilot:'

// 迁移老数据: 剥离 name 中遗留的 "数字+空格" 前缀(例如 "8 权利要求常规判断" → "权利要求常规判断")
// 这样序号彻底从搭档名称中分离,只在 UI 层动态展示。
const NUMBER_PREFIX_RE = /^\d+\s+/
const migrateCopilotName = (copilot: CopilotDetail): CopilotDetail => {
  if (typeof copilot.name === 'string' && NUMBER_PREFIX_RE.test(copilot.name)) {
    return { ...copilot, name: copilot.name.replace(NUMBER_PREFIX_RE, '') }
  }
  return copilot
}

// 初始化默认专利搭子
const initializePatentCopilots = async (currentCopilots: CopilotDetail[]): Promise<CopilotDetail[]> => {
  const patentCopilotIds = patentCopilots.map((p) => p.id)

  // 检查是否有任何专利搭子（通过前缀识别）
  const hasPatentCopilots = currentCopilots.some((c) => c.id.startsWith(PATENT_COPILOT_ID_PREFIX))

  // 迁移老数据的 name
  const migrated = currentCopilots.map(migrateCopilotName)

  if (!hasPatentCopilots) {
    // 首次初始化，添加所有专利搭子
    return [...migrated, ...patentCopilots]
  }

  // 过滤掉所有旧的专利搭子（通过前缀），保留用户自定义的其他搭子
  const nonPatentCopilots = migrated.filter((c) => !c.id.startsWith(PATENT_COPILOT_ID_PREFIX))
  // 添加最新的专利搭子
  return [...nonPatentCopilots, ...patentCopilots]
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
