import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { extractReasoningMiddleware, wrapLanguageModel } from 'ai'
import type { ProviderModelInfo, ToolUseScope } from '../types'
import type { ModelDependencies } from '../types/adapters'
import AbstractAISDKModel from './abstract-ai-sdk'
import { ApiError } from './errors'
import type { ModelInterface } from './types'
import { createFetchWithProxy } from './utils/fetch-proxy'

export interface OpenAICompatibleSettings {
  apiKey: string
  apiHost: string
  model: ProviderModelInfo
  temperature?: number
  topP?: number
  useProxy?: boolean
  maxOutputTokens?: number
  stream?: boolean
}

export default abstract class OpenAICompatible extends AbstractAISDKModel implements ModelInterface {
  public name = 'OpenAI Compatible'

  constructor(
    public options: OpenAICompatibleSettings,
    dependencies: ModelDependencies
  ) {
    super(options, dependencies)
  }

  protected getCallSettings() {
    return {
      temperature: this.options.temperature,
      topP: this.options.topP,
      maxOutputTokens: this.options.maxOutputTokens,
    }
  }

  static isSupportTextEmbedding() {
    return true
  }
  isSupportToolUse(scope?: ToolUseScope) {
    if (
      scope &&
      ['web-browsing', 'read-file'].includes(scope) &&
      /deepseek-(v3|r1)$/.test(this.options.model.modelId.toLowerCase())
    ) {
      return false
    }
    return super.isSupportToolUse()
  }

  protected getProvider() {
    return createOpenAICompatible({
      name: this.name,
      apiKey: this.options.apiKey,
      baseURL: this.options.apiHost,
      fetch: createFetchWithProxy(this.options.useProxy, this.dependencies),
    })
  }

  protected getChatModel() {
    const provider = this.getProvider()
    return wrapLanguageModel({
      model: provider.languageModel(this.options.model.modelId),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    })
  }

  public async listModels(): Promise<ProviderModelInfo[]> {
    return await fetchRemoteModels(
      {
        apiHost: this.options.apiHost,
        apiKey: this.options.apiKey,
        useProxy: this.options.useProxy,
      },
      this.dependencies
    ).catch((err) => {
      console.error(err)
      return []
    })
  }

  /**
   * 重写 paint 方法，直接调用 API 绕过 AI SDK
   * 这样可以正确处理返回 URL 的模型（如 nano-banana）
   */
  public async paint(
    params: {
      prompt: string
      images?: { imageUrl: string }[]
      num: number
      aspectRatio?: string
    },
    signal?: AbortSignal,
    callback?: (picBase64: string) => void
  ): Promise<string[]> {
    const modelId = this.options.model.modelId

    // 构建请求体
    const requestBody: Record<string, unknown> = {
      model: modelId,
      prompt: params.prompt,
      n: params.num,
    }

    // 添加图片比例支持
    if (params.aspectRatio) {
      // 将 aspectRatio 转换为 size 格式，如 "1:1" -> "1024x1024"
      const [width, height] = params.aspectRatio.split(':').map(Number)
      if (width && height) {
        // 计算标准尺寸，保持宽高比
        const baseSize = 1024
        if (width === height) {
          requestBody.size = '1024x1024'
        } else if (width > height) {
          requestBody.size = `${baseSize}x${Math.round(baseSize * (height / width))}`
        } else {
          requestBody.size = `${Math.round(baseSize * (width / height))}x${baseSize}`
        }
      }
    }

    // 直接用 fetch 调用图片生成 API
    const fetchFn = createFetchWithProxy(this.options.useProxy, this.dependencies)
    const url = `${this.options.apiHost}/v1/images/generations`

    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new ApiError(`Image generation failed: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const result = await response.json() as {
      data: Array<{
        b64_json?: string
        url?: string
        revised_prompt?: string
      }>
    }

    if (!result.data || result.data.length === 0) {
      throw new ApiError('No images generated')
    }

    // 处理每张图片
    const dataUrls: string[] = []
    for (const image of result.data) {
      let dataUrl: string

      if (image.b64_json) {
        // 直接返回 base64
        dataUrl = `data:image/png;base64,${image.b64_json}`
      } else if (image.url) {
        // 下载 URL 并转换为 base64
        try {
          const imageResponse = await fetch(image.url)
          if (!imageResponse.ok) {
            throw new Error(`Failed to download image: ${imageResponse.status}`)
          }
          const blob = await imageResponse.blob()
          const arrayBuffer = await blob.arrayBuffer()
          const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce((str, byte) => str + String.fromCharCode(byte), '')
          )
          dataUrl = `data:${blob.type || 'image/png'};base64,${base64}`
        } catch (error) {
          console.error('Failed to download image from URL:', image.url, error)
          throw new ApiError(`Failed to download image from URL: ${image.url}`)
        }
      } else {
        throw new ApiError('No image data (b64_json or url) in response')
      }

      dataUrls.push(dataUrl)
      callback?.(dataUrl)
    }

    return dataUrls
  }
}

// Keywords for detecting image generation capability
const IMAGE_GENERATION_KEYWORDS = [
  'image',
  'banana',
  'flux',
  'seedream',
  'dalle',
  'sd-',
  'sdxl',
  'wan',
  'imagen',
  'ideogram',
  'recraft',
  'kolors',
  'hidream',
  'grok-imagine',
  'midjourney',
  'lucid',
  'phoenix',
  'luma',
  'vidu',
]

/**
 * Check if a model can generate images based on its ID
 */
function canGenerateImage(modelId: string): boolean {
  const lowerModelId = modelId.toLowerCase()
  return IMAGE_GENERATION_KEYWORDS.some(keyword => lowerModelId.includes(keyword))
}

interface ListModelsResponse {
  object: 'list'
  data: {
    id: string
    object: 'model'
    created: number
    owned_by?: string
    // OpenRouter specific fields
    name?: string
    context_length?: number
    architecture?: {
      input_modalities?: string[]
      output_modalities?: string[]
      tokenizer?: string
    }
    pricing?: {
      prompt?: string
      completion?: string
      image?: string
      request?: string
      web_search?: string
      internal_reasoning?: string
    }
    top_provider?: {
      is_moderated?: boolean
    }
    canonical_slug?: string
    hugging_face_id?: string
    per_request_limits?: Record<string, any>
    supported_parameters?: string[]
  }[]
}

export async function fetchRemoteModels(
  params: { apiHost: string; apiKey: string; useProxy?: boolean },
  dependencies: ModelDependencies
) {
  const response = await dependencies.request.apiRequest({
    url: `${params.apiHost}/models`,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
    },
    useProxy: params.useProxy,
  })
  const json: ListModelsResponse = await response.json()
  if (!json.data) {
    throw new ApiError(JSON.stringify(json))
  }
  return json.data.map((item) => {
    const modelInfo: ProviderModelInfo = {
      modelId: item.id,
      type: 'chat',
    }

    // Add nickname from OpenRouter name field
    if (item.name) {
      modelInfo.nickname = item.name
    }

    // Add context window if available
    if (item.context_length) {
      modelInfo.contextWindow = item.context_length
    }

    // Add capabilities based on architecture
    if (item.architecture) {
      const capabilities: ProviderModelInfo['capabilities'] = []

      // Check for vision capability (input - can receive images)
      if (item.architecture.input_modalities?.includes('image')) {
        capabilities.push('vision')
      }

      // Check for image generation capability (output)
      // Priority 1: Check API response
      if (item.architecture.output_modalities?.includes('image')) {
        capabilities.push('image')
      }
      // Priority 2: Fallback to model ID keyword detection
      else if (canGenerateImage(item.id)) {
        capabilities.push('image')
      }

      // Check for web search capability (OpenRouter specific)
      if (item.pricing?.web_search && item.pricing.web_search !== '0') {
        capabilities.push('web_search')
      }

      // Check for reasoning capability (OpenRouter specific)
      if (item.pricing?.internal_reasoning && item.pricing.internal_reasoning !== '0') {
        capabilities.push('reasoning')
      }

      // Note: tool_use capability cannot be determined from OpenRouter response
      // It would need to be added from local defaults

      if (capabilities.length > 0) {
        modelInfo.capabilities = capabilities
      }
    } else {
      // If no architecture info, still try to detect by model ID
      if (canGenerateImage(item.id)) {
        modelInfo.capabilities = ['image']
      }
    }

    return modelInfo
  })
}
