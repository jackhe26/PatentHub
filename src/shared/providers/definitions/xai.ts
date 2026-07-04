import { ModelProviderEnum, ModelProviderType } from '../../types'
import { defineProvider } from '../registry'
import XAI from './models/xai'

export const xaiProvider = defineProvider({
  id: ModelProviderEnum.XAI,
  name: 'xAI',
  type: ModelProviderType.OpenAI,
  urls: {
    website: 'https://x.ai/',
  },
  defaultSettings: {
    apiHost: 'https://api.x.ai',
    models: [
      {
        modelId: 'grok-4.3',
        contextWindow: 1_000_000,
        capabilities: ['vision', 'tool_use', 'reasoning'],
      },
      {
        modelId: 'grok-build-0.1',
        contextWindow: 1_000_000,
        capabilities: ['vision', 'tool_use'],
      },
      {
        modelId: 'grok-imagine-image',
        capabilities: ['image'],
      },
      {
        modelId: 'grok-imagine-image-pro',
        capabilities: ['image'],
      },
    ],
  },
  createModel: (config) => {
    return new XAI(
      {
        apiKey: config.providerSetting.apiKey || '',
        model: config.model,
        temperature: config.settings.temperature,
        topP: config.settings.topP,
        maxOutputTokens: config.settings.maxTokens,
        stream: config.settings.stream,
      },
      config.dependencies
    )
  },
  getDisplayName: (modelId, providerSettings) => {
    return `xAI API (${providerSettings?.models?.find((m) => m.modelId === modelId)?.nickname || modelId})`
  },
})
