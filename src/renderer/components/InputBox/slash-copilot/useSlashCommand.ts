import type { CopilotDetail } from '@shared/types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildCandidates, type CopilotCandidate, matchCopilots } from './match'

/**
 * 只在「行首」或「空白字符之后」触发：/ 之后紧跟的内容即为查询词（不含空白）。
 * 因此 1/2、/api/v1、A/B 这类不会误触发。
 */
const SLASH_QUERY_RE = /(^|[\s\u3000])\/([^\s\u3000]*)$/

export type SlashState = {
  open: boolean
  /** 手动唤起（点击已选搭档的 Chip）时，不要求文本里还有 /query */
  manual: boolean
  query: string
  /** '/' 在文本中的下标，-1 表示未激活 */
  slashStart: number
  activeIndex: number
}

const CLOSED: SlashState = { open: false, manual: false, query: '', slashStart: -1, activeIndex: 0 }

export type SlashRemaining = {
  /** 删掉 /query 片段后应剩余的文本 */
  text: string
  /** 删除后光标应回退到的位置 */
  cursor: number
}

export type UseSlashCommandResult = SlashState & {
  results: CopilotCandidate[]
  sync(text: string, caret: number, composing?: boolean): void
  close(): void
  /** 点击已选搭档的 Chip 时手动唤出面板（显示全部搭档，可直接换一个） */
  openPicker(): void
  moveActive(delta: number): void
  setActiveIndex(index: number): void
  /** 选中后应剩余的文本（删掉 /query 片段） */
  buildRemaining(text: string, caret: number): SlashRemaining
}

/**
 * @param text 受控输入框的当前文本。用于在文本被「程序化改写」（发送后清空、
 * 切换会话恢复草稿、历史记录回填等，这些都不会触发 onChange）时自动收起面板，
 * 避免面板挂在那里继续抢 Enter / 方向键。
 */
export function useSlashCommand(copilots: CopilotDetail[], text = ''): UseSlashCommandResult {
  const candidates = useMemo(() => buildCandidates(copilots), [copilots])
  const [state, setState] = useState<SlashState>(CLOSED)

  const results = useMemo(
    () => (state.open ? matchCopilots(candidates, state.query) : []),
    [state.open, state.query, candidates]
  )

  const sync = useCallback((text: string, caret: number, composing = false) => {
    if (composing) return
    const matched = SLASH_QUERY_RE.exec(text.slice(0, caret))
    if (!matched) {
      setState((prev) => (prev.open ? CLOSED : prev))
      return
    }
    const query = matched[2] ?? ''
    const slashStart = caret - query.length - 1
    setState((prev) => ({
      open: true,
      manual: false,
      query,
      slashStart,
      activeIndex: prev.open && !prev.manual && prev.query === query ? prev.activeIndex : 0,
    }))
  }, [])

  const close = useCallback(() => setState(CLOSED), [])

  const openPicker = useCallback(() => {
    // 再点一次 Chip 视为收起（toggle）
    setState((prev) =>
      prev.open && prev.manual ? CLOSED : { open: true, manual: true, query: '', slashStart: -1, activeIndex: 0 }
    )
  }, [])

  const moveActive = useCallback(
    (delta: number) => {
      setState((prev) => {
        if (!prev.open) return prev
        const count = matchCopilots(candidates, prev.query).length
        if (!count) return prev
        return { ...prev, activeIndex: (prev.activeIndex + delta + count) % count }
      })
    },
    [candidates]
  )

  const setActiveIndex = useCallback((index: number) => {
    setState((prev) => (prev.open ? { ...prev, activeIndex: index } : prev))
  }, [])

  const buildRemaining = useCallback((current: string, caret: number): SlashRemaining => {
    const matched = SLASH_QUERY_RE.exec(current.slice(0, caret))
    // 光标处没有 /query（例如光标被挪走），原样返回，交由调用方兜底
    if (!matched) return { text: current, cursor: caret }
    const start = caret - (matched[2]?.length ?? 0) - 1
    return { text: current.slice(0, start) + current.slice(caret), cursor: start }
  }, [])

  /**
   * 文本被程序化改写时（clearDraft 清空、草稿恢复、历史回填…）不会触发 onChange，
   * 这里以「上次记录的 /query 片段」为锚点校验一次：只要该片段已不存在就收起面板。
   * 手动唤起（点 Chip）时没有 /query 可锚定，跳过此校验。
   */
  const queryEnd = state.open && !state.manual ? state.slashStart + 1 + state.query.length : -1
  useEffect(() => {
    if (!state.open || state.manual || queryEnd < 0) return
    if (!SLASH_QUERY_RE.test(text.slice(0, queryEnd))) setState(CLOSED)
  }, [text, state.open, state.manual, queryEnd])

  return { ...state, results, sync, close, openPicker, moveActive, setActiveIndex, buildRemaining }
}
