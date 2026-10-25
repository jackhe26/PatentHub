import { Box, Text, UnstyledButton } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { CopilotIndexBadge } from '@/components/common/CopilotIndexBadge'
import type { CopilotCandidate } from './match'

export type SlashCopilotMenuProps = {
  results: CopilotCandidate[]
  activeIndex: number
  selectedId?: string
  onSelect(candidate: CopilotCandidate): void
  onHover(index: number): void
  onClear(): void
}

/**
 * 输入框内 / 唤起的审查搭档选择面板。
 * 纯展示组件：query / activeIndex / results 全部由 useSlashCommand 持有。
 * 宽度按最长标题自适应（max-content），不跟随输入框撑满。
 */
export default function SlashCopilotMenu({
  results,
  activeIndex,
  selectedId,
  onSelect,
  onHover,
  onClear,
}: SlashCopilotMenuProps) {
  const { t } = useTranslation()

  return (
    <Box
      className="rounded-lg overflow-hidden shadow-xl"
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        marginBottom: 8,
        zIndex: 300,
        // 按最长的一条标题自适应宽度，同时不超过输入框宽度
        width: 'max-content',
        minWidth: 168,
        maxWidth: '100%',
        backgroundColor: 'var(--chatbox-background-primary)',
        border: '1px solid var(--chatbox-border-primary)',
      }}
    >
      <Box px="sm" py={6} style={{ borderBottom: '1px solid var(--chatbox-border-primary)' }}>
        <Text size="xs" fw={600} c="chatbox-tertiary" style={{ whiteSpace: 'nowrap' }}>
          {t('Copilot')}
        </Text>
      </Box>

      {results.length === 0 ? (
        <Box px="sm" py="xs">
          <Text size="xs" c="chatbox-tertiary" style={{ whiteSpace: 'nowrap' }}>
            {t('No matching copilot')}
          </Text>
        </Box>
      ) : (
        <Box py={4} style={{ maxHeight: 280, overflowY: 'auto' }}>
          {results.map((candidate, index) => {
            const isActive = index === activeIndex
            const isSelected = candidate.copilot.id === selectedId
            return (
              <UnstyledButton
                key={candidate.copilot.id}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--chatbox-background-tertiary)]"
                style={{
                  whiteSpace: 'nowrap',
                  ...(isActive ? { backgroundColor: 'var(--chatbox-background-tertiary)' } : null),
                }}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => onHover(index)}
                onClick={() => onSelect(candidate)}
              >
                <CopilotIndexBadge index={candidate.index} size="xs" />
                <Text
                  size="sm"
                  c={isSelected ? 'chatbox-brand' : undefined}
                  style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {candidate.copilot.name}
                </Text>
                {/* 始终占位，避免上下移动时面板宽度抖动 */}
                <Text
                  size="xs"
                  c="chatbox-tertiary"
                  style={{ marginLeft: 'auto', visibility: isActive ? 'visible' : 'hidden' }}
                >
                  Enter
                </Text>
              </UnstyledButton>
            )
          })}
        </Box>
      )}

      {selectedId && (
        <UnstyledButton
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--chatbox-background-tertiary)]"
          style={{ borderTop: '1px solid var(--chatbox-border-primary)', whiteSpace: 'nowrap' }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClear}
        >
          <Text size="xs" c="chatbox-tertiary">
            {t('Remove Copilot')}
          </Text>
        </UnstyledButton>
      )}
    </Box>
  )
}
