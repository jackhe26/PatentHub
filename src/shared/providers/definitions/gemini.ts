import { ModelProviderEnum, ModelProviderType } from '../../types'
import { defineProvider } from '../registry'
import Gemini from './models/gemini'

export const geminiProvider = defineProvider({
  id: ModelProviderEnum.Gemini,
  name: 'Gemini',
  type: ModelProviderType.Gemini,
  urls: {
    website: 'https://gemini.google.com/',
  },
  defaultSettings: {
    apiHost: 'https://generativelanguage.googleapis.com',
    // https://ai.google.dev/models/gemini
    models: [
      {
        modelId: 'gemini-3.1-pro-preview',
        capabilities: ['vision', 'reasoning', 'tool_use'],
        contextWindow: 1_000_000,
        maxOutput: 8_192,
      },
      {
        modelId: 'gemini-3.1-flash-lite-preview',
        capabilities: ['vision', 'reasoning', 'tool_use'],
        contextWindow: 1_000_000,
        maxOutput: 8_192,
      },
      {
        modelId: 'gemini-3.1-flash-lite-image',
        capabilities: ['vision'],
        contextWindow: 32_768,
        maxOutput: 8_192,
      },
      {
        modelId: 'gemini-3.1-flash-image-preview',
        capabilities: ['vision'],
        contextWindow: 32_768,
        maxOutput: 8_192,
      },
      {
        modelId: 'gemini-3.1-flash-image-preview-4k',
        capabilities: ['vision'],
        contextWindow: 32_768,
        maxOutput: 8_192,
      },
      {
        modelId: 'nano-banana-pro-4k',
        capabilities: ['image'],
      },
    ],
  },
  createModel: (config) => {
    return new Gemini(
      {
        geminiAPIKey: config.providerSetting.apiKey || '',
        geminiAPIHost: config.formattedApiHost,
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
    return `Gemini API (${providerSettings?.models?.find((m) => m.modelId === modelId)?.nickname || modelId})`
  },
})
