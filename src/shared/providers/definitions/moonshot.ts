import { ModelProviderEnum, ModelProviderType } from '../../types'
import { defineProvider } from '../registry'
import OpenAI from './models/openai'

export const moonshotProvider = defineProvider({
  id: ModelProviderEnum.Moonshot,
  name: 'Moonshot (Kimi)',
  type: ModelProviderType.OpenAI,
  urls: {
    website: 'https://www.moonshot.cn',
    docs: 'https://platform.moonshot.cn/docs',
    apiKey: 'https://platform.moonshot.cn/console/api-keys',
  },
  defaultSettings: {
    apiHost: 'https://api.moonshot.cn',
    models: [
      {
        modelId: 'kimi-k2.6',
        capabilities: ['reasoning', 'tool_use'],
        contextWindow: 256_000,
      },
      {
        modelId: 'kimi-k2.7-code',
        capabilities: ['reasoning', 'tool_use'],
        contextWindow: 256_000,
      },
      {
        modelId: 'kimi-k2.7-code-highspeed',
        capabilities: ['reasoning', 'tool_use'],
        contextWindow: 256_000,
      },
    ],
  },
  createModel: (config) => {
    return new OpenAI(
      {
        apiKey: config.providerSetting.apiKey || '',
        apiHost: config.formattedApiHost,
        model: config.model,
        dalleStyle: config.settings.dalleStyle || 'vivid',
        temperature: config.settings.temperature,
        topP: config.settings.topP,
        maxOutputTokens: config.settings.maxTokens,
        injectDefaultMetadata: config.globalSettings.injectDefaultMetadata,
        useProxy: false,
        stream: config.settings.stream,
      },
      config.dependencies
    )
  },
  getDisplayName: (modelId, providerSettings) => {
    return `Moonshot API (${providerSettings?.models?.find((m) => m.modelId === modelId)?.nickname || modelId})`
  },
})