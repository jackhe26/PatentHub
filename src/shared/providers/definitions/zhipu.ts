import { ModelProviderEnum, ModelProviderType } from '../../types'
import { defineProvider } from '../registry'
import OpenAI from './models/openai'

export const zhipuProvider = defineProvider({
  id: ModelProviderEnum.Zhipu,
  name: 'Zhipu',
  type: ModelProviderType.OpenAI,
  urls: {
    website: 'https://www.zhipuai.cn',
    docs: 'https://open.bigmodel.cn/dev/api',
    apiKey: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  defaultSettings: {
    apiHost: 'https://open.bigmodel.cn/api/paas/v4',
    apiPath: '/chat/completions',
    models: [
      {
        modelId: 'GLM-5.2',
        capabilities: ['tool_use', 'reasoning'],
        contextWindow: 1_000_000,
      },
      {
        modelId: 'GLM-5.1',
        capabilities: ['tool_use', 'reasoning'],
        contextWindow: 200_000,
      },
      {
        modelId: 'GLM-5-Turbo',
        capabilities: ['tool_use'],
        contextWindow: 200_000,
      },
      {
        modelId: 'GLM-5V-Turbo',
        capabilities: ['vision', 'tool_use'],
        contextWindow: 200_000,
      },
      {
        modelId: 'GLM-OCR',
        capabilities: ['vision'],
        contextWindow: 200_000,
      },
      {
        modelId: 'Embedding-3',
        type: 'embedding',
        contextWindow: 8_000,
      },
    ],
  },
  createModel: (config) => {
    return new OpenAI(
      {
        apiKey: config.providerSetting.apiKey || '',
        apiHost: config.formattedApiHost,
        apiPath: config.formattedApiPath,
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
    return `Zhipu API (${providerSettings?.models?.find((m) => m.modelId === modelId)?.nickname || modelId})`
  },
})