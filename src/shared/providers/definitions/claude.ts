import { ModelProviderEnum, ModelProviderType } from '../../types'
import { defineProvider } from '../registry'
import Claude from './models/claude'

export const claudeProvider = defineProvider({
  id: ModelProviderEnum.Claude,
  name: 'Claude',
  type: ModelProviderType.Claude,
  urls: {
    website: 'https://www.anthropic.com',
  },
  defaultSettings: {
    apiHost: 'https://api.anthropic.com/v1',
    // https://docs.anthropic.com/en/docs/about-claude/models/overview
    models: [
      {
        modelId: 'claude-fable-5',
        contextWindow: 1_000_000,
        maxOutput: 64_000,
        capabilities: ['vision', 'reasoning', 'tool_use'],
      },
      {
        modelId: 'claude-opus-4-8',
        contextWindow: 1_000_000,
        maxOutput: 64_000,
        capabilities: ['vision', 'reasoning', 'tool_use'],
      },
      {
        modelId: 'claude-sonnet-5',
        contextWindow: 1_000_000,
        maxOutput: 64_000,
        capabilities: ['vision', 'reasoning', 'tool_use'],
      },
      {
        modelId: 'claude-sonnet-latest',
        contextWindow: 1_000_000,
        maxOutput: 64_000,
        capabilities: ['vision', 'reasoning', 'tool_use'],
      },
      {
        modelId: 'claude-haiku-latest',
        capabilities: ['vision', 'tool_use', 'reasoning'],
        contextWindow: 200_000,
        maxOutput: 64_000,
      },
    ],
  },
  createModel: (config) => {
    return new Claude(
      {
        claudeApiKey: config.providerSetting.apiKey || '',
        claudeApiHost: config.formattedApiHost,
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
    return `Claude API (${providerSettings?.models?.find((m) => m.modelId === modelId)?.nickname || modelId})`
  },
})
