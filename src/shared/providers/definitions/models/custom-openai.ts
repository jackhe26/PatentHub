import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { extractReasoningMiddleware, wrapLanguageModel } from 'ai'
import AbstractAISDKModel from '../../../models/abstract-ai-sdk'
import { fetchRemoteModels } from '../../../models/openai-compatible'
import { ApiError } from '../../../models/errors'
import type { CallChatCompletionOptions } from '../../../models/types'
import { createFetchWithProxy } from '../../../models/utils/fetch-proxy'
import type { ProviderModelInfo } from '../../../types'
import type { ModelDependencies } from '../../../types/adapters'
import { normalizeOpenAIApiHostAndPath } from '../../../utils/llm_utils'

interface Options {
  apiKey: string
  apiHost: string
  apiPath: string
  model: ProviderModelInfo
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  stream?: boolean
  useProxy?: boolean
}

type FetchFunction = typeof globalThis.fetch

export default class CustomOpenAI extends AbstractAISDKModel {
  public name = 'Custom OpenAI'

  constructor(public options: Options, dependencies: ModelDependencies) {
    super(options, dependencies)
    const { apiHost, apiPath } = normalizeOpenAIApiHostAndPath(options)
    this.options = { ...options, apiHost, apiPath }
  }

  protected getCallSettings() {
    return {
      temperature: this.options.temperature,
      topP: this.options.topP,
      maxOutputTokens: this.options.maxOutputTokens,
      stream: this.options.stream,
    }
  }

  static isSupportTextEmbedding() {
    return true
  }

  protected getProvider(_options: CallChatCompletionOptions, fetchFunction?: FetchFunction) {
    return createOpenAICompatible({
      name: this.name,
      apiKey: this.options.apiKey,
      baseURL: this.options.apiHost,
      fetch: fetchFunction,
      headers: this.options.apiHost.includes('openrouter.ai')
        ? {
            'HTTP-Referer': 'https://chatboxai.app',
            'X-Title': 'Chatbox AI',
          }
        : this.options.apiHost.includes('aihubmix.com')
          ? {
              'APP-Code': 'VAFU9221',
            }
          : undefined,
    })
  }

  protected getChatModel(options: CallChatCompletionOptions) {
    const { apiHost, apiPath } = this.options
    const provider = this.getProvider(options, async (_input, init) => {
      return createFetchWithProxy(this.options.useProxy, this.dependencies)(`${apiHost}${apiPath}`, init)
    })
    return wrapLanguageModel({
      model: provider.languageModel(this.options.model.modelId),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    })
  }

  public listModels() {
    return fetchRemoteModels(
      {
        apiHost: this.options.apiHost,
        apiKey: this.options.apiKey,
        useProxy: this.options.useProxy,
      },
      this.dependencies
    )
  }

  protected getImageModel() {
    const provider = this.getProvider({})
    return provider.imageModel?.(this.options.model.modelId) || null
  }

  private buildImageGenerationUrl(): string {
    const baseUrl = this.options.apiHost.replace(/\/$/, '')

    // 所有模型使用标准 OpenAI 路径 /v1/images/generations
    if (baseUrl.includes('/v1')) {
      return `${baseUrl}/images/generations`
    }

    return `${baseUrl}/v1/images/generations`
  }

  // 获取 Seedream 模型的所有可能路径（用于 fallback）
  private getSeedreamImageUrls(): string[] {
    const baseUrl = this.options.apiHost.replace(/\/$/, '')
    return [
      // 标准 OpenAI 路径
      baseUrl.includes('/v1') ? `${baseUrl}/images/generations` : `${baseUrl}/v1/images/generations`,
      // 火山引擎路径
      `${baseUrl}/api/v3/images/generations`,
    ]
  }

  /**
   * Override to provide the base URL for edit mode API calls.
   * Uses the custom provider's API host, but strips any trailing /v1 path
   * to avoid double /v1 when the edit API appends /v1/images/edits.
   * e.g. "https://ai.comfly.chat/v1" → "https://ai.comfly.chat"
   */
  protected getEditModeBaseUrl(): string | undefined {
    return this.options.apiHost.replace(/\/v1\/?$/, '')
  }

  /**
   * Override to provide the API key for edit mode API calls.
   */
  protected getApiKey(): string | undefined {
    return this.options.apiKey
  }

  /**
   * Override to provide the model ID for edit mode.
   */
  protected getEditModeModelId(): string {
    return this.options.model.modelId
  }

  public async paint(
    params: {
      prompt: string
      images?: { imageUrl: string }[]
      num: number
      aspectRatio?: string
      size?: string
    },
    signal?: AbortSignal,
    callback?: (picBase64: string) => void
  ): Promise<string[]> {
    // Edit mode: if reference images are provided, use /v1/images/edits
    if (params.images && params.images.length > 0) {
      return this.paintWithEdits(
        {
          prompt: params.prompt,
          images: params.images,
          num: params.num,
          size: params.size,
        },
        signal,
        callback
      )
    }
    const modelId = this.options.model.modelId
    const isSeedream = modelId.toLowerCase().includes('seedream')

    const requestBody: Record<string, unknown> = {
      model: modelId,
      prompt: params.prompt,
    }

    // Seedream 使用官方火山引擎格式
    if (isSeedream) {
      // Seedream 使用 2K 格式或像素格式
      if (params.aspectRatio) {
        const [width, height] = params.aspectRatio.split(':').map(Number)
        if (width && height) {
          if (width === height) {
            requestBody.size = '2K'
          } else {
            // 使用像素格式
            const baseSize = 2048
            if (width > height) {
              requestBody.size = `${baseSize}x${Math.round(baseSize * (height / width))}`
            } else {
              requestBody.size = `${Math.round(baseSize * (width / height))}x${baseSize}`
            }
          }
        }
      } else {
        requestBody.size = '2K'
      }
      requestBody.output_format = 'png'
      requestBody.watermark = false
    } else {
      // 其他模型使用标准 OpenAI 格式
      requestBody.n = params.num
      if (params.aspectRatio) {
        const [width, height] = params.aspectRatio.split(':').map(Number)
        if (width && height) {
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
    }

    const fetchFn = createFetchWithProxy(this.options.useProxy, this.dependencies)
    const url = this.buildImageGenerationUrl()

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

    const dataUrls: string[] = []
    for (const image of result.data) {
      let dataUrl: string

      if (image.b64_json) {
        dataUrl = `data:image/png;base64,${image.b64_json}`
      } else if (image.url) {
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
