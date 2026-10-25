/**
 * AgentChatPageWrapper - URL 参数包装器
 *
 * 从 URL 中读取 agentId 并传递给 AgentChatPage
 */

import { useParams } from '@tanstack/react-router'
import AgentChatPage from './AgentChatPage'

export default function AgentChatPageWrapper() {
  const params = useParams({ strict: false }) as { agentId?: string }
  const agentId = params.agentId || ''

  if (!agentId) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#999' }}>
        Agent ID 缺失
      </div>
    )
  }

  return <AgentChatPage agentIdOverride={agentId} />
}