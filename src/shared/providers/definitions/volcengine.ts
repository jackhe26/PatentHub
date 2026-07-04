import { ModelProviderEnum, ModelProviderType } from '../../types'
import { defineProvider } from '../registry'
import VolcEngine from './models/volcengine'

export const volcEngineProvider = defineProvider({
  id: ModelProviderEnum.VolcEngine,
  name: 'VolcEngine',
  type: ModelProviderType.OpenAI,
  urls: {
    website: 'https://www.volcengine.com/',
  },
  defaultSettings: {
    apiHost: 'https://ark.cn-beijing.volces.com',
    apiPath: '/api/v3/chat/completions',
    models: [
      {
        modelId: 'doubao-seed-evolving',
        contextWindow: 256_000,
        capabilities: ['vision', 'reasoning', 'tool_use'],
      },
      {
        modelId: 'doubao-seed-2-1-pro-260628',
        contextWindow: 256_000,
        capabilities: ['vision', 'reasoning', 'tool_use'],
      },
      {
        modelId: 'doubao-seed-2-1-turbo-260628',
        contextWindow: 256_000,
        capabilities: ['vision', 'reasoning', 'tool_use'],
      },
      {
        modelId: 'doubao-seedream-5-0-260128',
        capabilities: ['image'],
      },
    ],
  },
  createModel: (config) => {
    return new VolcEngine(
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
    return `VolcEngine API (${providerSettings?.models?.find((m) => m.modelId === modelId)?.nickname || modelId})`
  },
})
