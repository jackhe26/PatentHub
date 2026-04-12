import { type Session } from '@shared/types'

// 中文默认会话
export const defaultSessionsForCN: Session[] = [
  {
    id: 'default-chat-cn',
    type: 'chat',
    name: '专利问答助手',
    messages: [
      {
        id: 'system-1',
        role: 'system',
        contentParts: [
          {
            type: 'text',
            text: '你是一个专业的专利分析助手，擅长专利检索、分析和解读。',
          },
        ],
        timestamp: Date.now(),
      },
    ],
    starred: false,
    hidden: false,
  },
]

// 英文默认会话
export const defaultSessionsForEN: Session[] = [
  {
    id: 'default-chat-en',
    type: 'chat',
    name: 'Patent Assistant',
    messages: [
      {
        id: 'system-1',
        role: 'system',
        contentParts: [
          {
            type: 'text',
            text: 'You are a professional patent analysis assistant, skilled in patent search, analysis, and interpretation.',
          },
        ],
        timestamp: Date.now(),
      },
    ],
    starred: false,
    hidden: false,
  },
]

// Artifact 会话 - 中文
export const artifactSessionCN: Session = {
  id: 'artifact-cn',
  type: 'picture',
  name: '专利图表生成',
  messages: [],
  starred: false,
  hidden: false,
}

// Artifact 会话 - 英文
export const artifactSessionEN: Session = {
  id: 'artifact-en',
  type: 'picture',
  name: 'Patent Chart Generator',
  messages: [],
  starred: false,
  hidden: false,
}

// 图片创建会话 - 中文
export const imageCreatorSessionForCN: Session = {
  id: 'image-creator-cn',
  type: 'picture',
  name: '专利图像创作',
  messages: [],
  starred: false,
  hidden: false,
}

// 图片创建会话 - 英文
export const imageCreatorSessionForEN: Session = {
  id: 'image-creator-en',
  type: 'picture',
  name: 'Patent Image Creator',
  messages: [],
  starred: false,
  hidden: false,
}

// Mermaid 图表会话 - 中文
export const mermaidSessionCN: Session = {
  id: 'mermaid-cn',
  type: 'chat',
  name: '专利流程图生成',
  messages: [
    {
      id: 'mermaid-system-cn',
      role: 'system',
      contentParts: [
        {
          type: 'text',
          text: '你是一个专业的 Mermaid 图表生成助手，擅长生成各种流程图、时序图等。',
        },
      ],
      timestamp: Date.now(),
    },
  ],
  starred: false,
  hidden: false,
}

// Mermaid 图表会话 - 英文
export const mermaidSessionEN: Session = {
  id: 'mermaid-en',
  type: 'chat',
  name: 'Mermaid Chart Generator',
  messages: [
    {
      id: 'mermaid-system-en',
      role: 'system',
      contentParts: [
        {
          type: 'text',
          text: 'You are a professional Mermaid chart generation assistant, skilled in generating flowcharts, sequence diagrams, and more.',
        },
      ],
      timestamp: Date.now(),
    },
  ],
  starred: false,
  hidden: false,
}
