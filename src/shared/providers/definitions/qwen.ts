import { ModelProviderEnum, ModelProviderType } from '../../types'
import { defineProvider } from '../registry'
import OpenAI from './models/openai'

export const qwenProvider = defineProvider({
  id: ModelProviderEnum.Qwen,
  name: 'Qwen',
  type: ModelProviderType.OpenAI,
  urls: {
    website: 'https://www.qianwenai.com',
    docs: 'https://platform.qianwenai.com/docs',
    apiKey: 'https://platform.qianwenai.com/home/api-key',
  },
  defaultSettings: {
    apiHost: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      {
        modelId: 'qwen3.7-max',
        capabilities: ['reasoning', 'tool_use'],
        contextWindow: 1_000_000,
      },
      {
        modelId: 'qwen3.7-plus',
        capabilities: ['vision', 'reasoning', 'tool_use'],
        contextWindow: 1_000_000,
      },
      {
        modelId: 'qwen3.6-flash',
        capabilities: ['vision', 'reasoning', 'tool_use'],
        contextWindow: 1_000_000,
      },
      {
        modelId: 'qwen3.5-ocr',
        capabilities: ['vision'],
        contextWindow: 32_000,
      },
      {
        modelId: 'qwen-vl-ocr',
        capabilities: ['vision'],
        contextWindow: 32_000,
      },
      {
        modelId: 'qwen-vl-ocr-latest',
        capabilities: ['vision'],
        contextWindow: 32_000,
      },
      {
        modelId: 'text-embedding-v4',
        type: 'embedding',
        contextWindow: 8_192,
      },
      {
        modelId: 'qwen3-rerank',
        type: 'rerank',
        contextWindow: 4_000,
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
    return `Qwen API (${providerSettings?.models?.find((m) => m.modelId === modelId)?.nickname || modelId})`
  },
})