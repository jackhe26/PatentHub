import type { FC } from 'react'
import clsx from 'clsx'

export type CopilotIndexBadgeProps = {
  /** 序号(从 1 开始) */
  index: number
  /** 尺寸,默认 md */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** 自定义类名 */
  className?: string
}

/**
 * 审查搭档序号徽章
 *
 * 设计目的:把 "1-9" 的序号从搭档名称中分离出来,只在 UI 层展示。
 * 搭档的 `name` 字段不再携带数字前缀(避免污染发给 AI 的 prompt),
 * 序号改由 UI 层根据"我的搭档"列表的渲染顺序动态计算并显示。
 *
 * 用法:
 * ```tsx
 * {copilots.map((copilot, i) => (
 *   <CopilotItem
 *     key={copilot.id}
 *     name={copilot.name}
 *     index={i + 1}
 *   />
 * ))}
 * ```
 */
export const CopilotIndexBadge: FC<CopilotIndexBadgeProps> = ({ index, size = 'md', className }) => {
  const sizeClasses: Record<NonNullable<CopilotIndexBadgeProps['size']>, string> = {
    xs: 'h-4 min-w-4 text-[10px] px-1',
    sm: 'h-5 min-w-5 text-[11px] px-1.5',
    md: 'h-6 min-w-6 text-xs px-1.5',
    lg: 'h-7 min-w-7 text-sm px-2',
  }
  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center rounded-md font-semibold leading-none',
        'bg-chatbox-background-brand-secondary text-chatbox-brand',
        'border border-chatbox-brand/30',
        sizeClasses[size],
        className
      )}
      aria-label={`序号 ${index}`}
    >
      {index}
    </span>
  )
}