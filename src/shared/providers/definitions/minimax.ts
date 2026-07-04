import { ModelProviderEnum, ModelProviderType } from '../../types'
import { defineProvider } from '../registry'
import OpenAI from './models/openai'

export const minimaxProvider = defineProvider({
  id: ModelProviderEnum.Minimax,
  name: 'MiniMax',
  type: ModelProviderType.OpenAI,
  urls: {
    website: 'https://www.minimaxi.com',
    docs: 'https://platform.minimaxi.com/docs',
    apiKey: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
  },
  defaultSettings: {
    apiHost: 'https://api.minimaxi.com',
    models: [
      {
        modelId: 'MiniMax-M3',
        capabilities: ['vision', 'tool_use', 'reasoning'],
        contextWindow: 1_000_000,
      },
      {
        modelId: 'MiniMax-M2.7',
        capabilities: ['tool_use', 'reasoning'],
        contextWindow: 204_800,
      },
      {
        modelId: 'MiniMax-M2.7-highspeed',
        capabilities: ['tool_use', 'reasoning'],
        contextWindow: 204_800,
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
    return `MiniMax API (${providerSettings?.models?.find((m) => m.modelId === modelId)?.nickname || modelId})`
  },
})