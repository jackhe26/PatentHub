import type { LanguageModelV3 } from '@ai-sdk/provider'
import { editWithEditsAPI } from './imageEditApi'
import {
  APICallError,
  type EmbeddingModel,
  type FinishReason,
  experimental_generateImage as generateImage,
  type ImageModel,
  type JSONValue,
  type LanguageModelUsage,
  type ModelMessage,
  type Provider,
  simulateStreamingMiddleware,
  stepCountIs,
  streamText,
  type TextStreamPart,
  type ToolSet,
  type TypedToolCall,
  type TypedToolError,
  type TypedToolResult,
  wrapLanguageModel,
} from 'ai'
import { createRetryable, isErrorAttempt, type RetryContext } from 'ai-retry'
import type {
  MessageContentParts,
  MessageReasoningPart,
  MessageTextPart,
  MessageToolCallPart,
  ProviderModelInfo,
  StreamTextResult,
} from '../types'
import type { ModelDependencies } from '../types/adapters'
import { ApiError, ChatboxAIAPIError } from './errors'
import type { CallChatCompletionOptions, ModelInterface } from './types'

const RETRY_CONFIG = {
  MAX_ATTEMPTS: 5,
  INITIAL_DELAY_MS: 1000,
  BACKOFF_FACTOR: 2,
} as const

function is5xxError(error: unknown): boolean {
  if (APICallError.isInstance(error)) {
    const statusCode = error.statusCode
    return statusCode !== undefined && statusCode >= 500 && statusCode < 600
  }
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = (error as { statusCode: unknown }).statusCode
    return typeof statusCode === 'number' && statusCode >= 500 && statusCode < 600
  }
  if (error instanceof ApiError && error.message) {
    const match = error.message.match(/Status Code (\d+)/)
    if (match) {
      const statusCode = parseInt(match[1], 10)
      return statusCode >= 500 && statusCode < 600
    }
  }
  return false
}

// ai sdk CallSettings类型的子集
export interface CallSettings {
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  providerOptions?: Record<string, Record<string, JSONValue>>
}

interface ToolExecutionResult {
  toolCallId: string
  result: unknown
  isError?: boolean
}

/**
 * 验证 base64 字符串是否有效
 * 检查是否只包含有效的 base64 字符
 */
function isValidBase64(str: string): boolean {
  // Base64 有效字符：A-Z, a-z, 0-9, +, /, = (padding)
  // 允许末尾有最多2个 = 作为 padding
  if (!str) return false
  
  // 移除 padding 后检查
  const base64WithoutPadding = str.replace(/=+$/, '')
  
  // 检查是否只包含有效的 base64 字符
  const base64Regex = /^[A-Za-z0-9+/]*$/
  return base64Regex.test(base64WithoutPadding)
}

/**
 * 安全地将图片数据转换为 data URL
 * 处理多种情况：base64、data URL、URL、以及包含空白字符的 base64
 */
async function processImageData(image: { base64?: string; mediaType?: string }): Promise<string> {
  if (!image.base64) {
    throw new ApiError('Image generation result does not contain base64 data')
  }

  // 清理字符串：移除前后空白
  let data = image.base64.trim()

  // 情况1：已经是完整的 data URL
  if (data.startsWith('data:')) {
    return data
  }

  // 情况2：检测 http/https URL（某些 API 返回 URL 作为 base64 字段）
  if (data.startsWith('http://') || data.startsWith('https://')) {
    try {
      const response = await fetch(data)
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`)
      }
      const blob = await response.blob()
      const arrayBuffer = await blob.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((str, byte) => str + String.fromCharCode(byte), '')
      )
      const mediaType = image.mediaType || blob.type || 'image/png'
      return `data:${mediaType};base64,${base64}`
    } catch (error) {
      console.error('Failed to download image from URL:', data, error)
      throw new ApiError(`Failed to download image from URL: ${data}`)
    }
  }

  // 情况3：纯 base64 数据 - 清理空白字符
  data = data.replace(/[\s\n\r]/g, '')

  // 验证 base64 是否有效
  if (!isValidBase64(data)) {
    console.error('Invalid base64 data received:', {
      originalLength: image.base64.length,
      cleanedLength: data.length,
      sample: data.substring(0, 100),
    })
    throw new ApiError('Invalid base64 data received from image generation API')
  }

  // 验证并返回
  const mediaType = image.mediaType || 'image/png'
  return `data:${mediaType};base64,${data}`
}

export default abstract class AbstractAISDKModel implements ModelInterface {
  public name = 'AI SDK Model'
  public injectDefaultMetadata = true
  public modelId = ''

  public isSupportToolUse() {
    return this.options.model.capabilities?.includes('tool_use') || false
  }
  public isSupportVision() {
    return this.options.model.capabilities?.includes('vision') || false
  }
  public isSupportReasoning() {
    return this.options.model.capabilities?.includes('reasoning') || false
  }

  static isSupportTextEmbedding() {
    return false
  }

  public constructor(
    public options: { model: ProviderModelInfo; stream?: boolean },
    protected dependencies: ModelDependencies
  ) {
    this.modelId = options.model.modelId
  }

  protected abstract getProvider(
    options: CallChatCompletionOptions
  ): Pick<Provider, 'languageModel'> & Partial<Pick<Provider, 'embeddingModel' | 'imageModel'>>

  protected abstract getChatModel(options: CallChatCompletionOptions): LanguageModelV3

  protected getImageModel(): ImageModel | null {
    return null
  }

  protected getTextEmbeddingModel(options: CallChatCompletionOptions): EmbeddingModel | null {
    const provider = this.getProvider(options)
    if (provider.embeddingModel) {
      return provider.embeddingModel(this.options.model.modelId)
    }
    return null
  }

  public isSupportSystemMessage() {
    return true
  }

  protected getCallSettings(_options: CallChatCompletionOptions): CallSettings {
    return {}
  }

  public async chat(messages: ModelMessage[], options: CallChatCompletionOptions): Promise<StreamTextResult> {
    try {
      return await this._callChatCompletion(messages, options)
    } catch (e) {
      if (e instanceof ChatboxAIAPIError) {
        throw e
      }
      // 如果当前模型不支持图片输入，抛出对应的错误
      if (
        e instanceof ApiError &&
        e.message.includes('Invalid content type. image_url is only supported by certain models.')
      ) {
        // 根据当前 IP，判断是否在错误中推荐 Chatbox AI 4
        const remoteConfig = this.dependencies.getRemoteConfig()
        if (remoteConfig.setting_chatboxai_first) {
          throw ChatboxAIAPIError.fromCodeName('model_not_support_image', 'model_not_support_image')
        } else {
          throw ChatboxAIAPIError.fromCodeName('model_not_support_image', 'model_not_support_image_2')
        }
      }

      // 添加请求信息到 Sentry
      this.dependencies.sentry.withScope((scope) => {
        scope.setTag('provider_name', this.name)
        scope.setExtra('messages', JSON.stringify(messages))
        scope.setExtra('options', JSON.stringify(options))
        this.dependencies.sentry.captureException(e)
      })
      throw e
    }
  }

  /**
   * Try to use the /v1/images/edits API for image editing (when reference images are present).
   * Falls back to the fallback model (gpt-image-2) if the current model fails.
   */
  protected async paintWithEdits(
    params: {
      prompt: string
      images?: { imageUrl: string }[]
      num: number
      size?: string
    },
    signal?: AbortSignal,
    callback?: (picBase64: string) => void
  ): Promise<string[]> {
    if (!params.images || params.images.length === 0) {
      throw new ApiError('No reference images provided for edit mode')
    }

    // Extract base URL and API key from the provider
    // Subclasses should override getEditModeBaseUrl() and getApiKey()
    const baseUrl = this.getEditModeBaseUrl()
    const apiKey = this.getApiKey()
    const modelId = this.getEditModeModelId()
    const imageUrls = params.images.map((img) => img.imageUrl)

    if (!baseUrl || !apiKey) {
      throw new ApiError('Provider does not support edit mode (missing base URL or API key)')
    }

    // Try current model first, fallback to gpt-image-2
    const modelCandidates = [modelId, 'gpt-image-2']

    let lastError: Error | null = null
    for (const model of modelCandidates) {
      try {
        console.log(`[EditMode] Trying model: ${model} via ${baseUrl}/v1/images/edits`)
        const dataUrls = await editWithEditsAPI({
          baseUrl,
          apiKey,
          model,
          images: imageUrls,
          prompt: params.prompt,
          n: params.num,
          size: params.size,
          signal,
          onImage: callback,
        })
        return dataUrls
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(`[EditMode] Model ${model} failed:`, lastError.message)
        // If this was the fallback (gpt-image-2), re-throw
        if (model === 'gpt-image-2') {
          throw lastError
        }
        // Otherwise, continue to try gpt-image-2
      }
    }

    // Should never reach here, but just in case
    throw lastError || new ApiError('Edit mode failed with all model candidates')
  }

  /**
   * Get the base URL for edit mode API calls.
   * Subclasses should override this to provide the correct base URL.
   */
  protected getEditModeBaseUrl(): string | undefined {
    return undefined
  }

  /**
   * Get the API key for edit mode API calls.
   * Subclasses should override this to provide the correct API key.
   */
  protected getApiKey(): string | undefined {
    return undefined
  }

  /**
   * Get the model ID to use for edit mode.
   * Subclasses can override to customize.
   */
  protected getEditModeModelId(): string {
    // Use the current model by default; subclasses should provide their actual model ID
    return this.modelId || 'gpt-image-2'
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

    // Text-to-image mode (no reference images)
    const imageModel = this.getImageModel()
    if (!imageModel) {
      throw new ApiError('Provider doesnt support image generation')
    }
    // 构建 generateImage 参数
    const generateParams: Parameters<typeof generateImage>[0] = {
      model: imageModel,
      prompt: params.prompt,
      n: params.num,
      abortSignal: signal,
    }

    // 如果有 size 参数，传给 API（例如 "1024x1024"、"2560x1440" 等）
    // 参考 gpt-image-2 实现：aspectRatio + resolution → SIZE_MAP → 实际像素尺寸
    if (params.size) {
      generateParams.size = params.size as `${number}x${number}`
    }

    const result = await generateImage(generateParams)

    // 处理图片数据，支持 base64、data URL、URL 等多种格式
    const dataUrls = await Promise.all(
      result.images.map(async (image) => {
        try {
          return await processImageData(image)
        } catch (error) {
          console.error('Failed to process image data:', {
            hasBase64: !!image.base64,
            length: image.base64?.length,
            startsWith: image.base64?.substring(0, 50),
            mediaType: image.mediaType,
            error,
          })
          throw error
        }
      })
    )

    for (const dataUrl of dataUrls) {
      callback?.(dataUrl)
    }
    return dataUrls
  }

  /**
   * Adds a content part to the message and handles timing for reasoning parts
   * @param contentPart - The content part to add
   * @param contentParts - Array of existing content parts
   * @param options - Call options with result change callback
   */
  private addContentPart(
    contentPart: MessageContentParts[number],
    contentParts: MessageContentParts,
    options: CallChatCompletionOptions
  ): void {
    // Handle timing for reasoning parts in non-streaming mode
    if (contentPart.type === 'reasoning') {
      const reasoningPart = contentPart as MessageReasoningPart
      const now = Date.now()
      reasoningPart.startTime = now
      // In non-streaming mode, reasoning content arrives complete, so we set
      // a minimal duration to indicate the thinking process occurred
      reasoningPart.duration = 1
    }
    contentParts.push(contentPart)
    options.onResultChange?.({ contentParts })
  }

  private processToolCalls<T extends ToolSet>(
    toolCalls: TypedToolCall<T>[],
    contentParts: MessageContentParts,
    options: CallChatCompletionOptions
  ): void {
    for (const toolCall of toolCalls) {
      const args = toolCall.input
      this.addContentPart(
        {
          type: 'tool-call',
          state: 'call',
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          args,
        },
        contentParts,
        options
      )
    }
  }

  private processToolResults<T extends ToolSet>(
    toolResults: TypedToolResult<T>[],
    contentParts: MessageContentParts,
    options: CallChatCompletionOptions
  ): void {
    for (const toolResult of toolResults) {
      const result = toolResult.output
      const mappedResult: ToolExecutionResult = {
        toolCallId: toolResult.toolCallId,
        result,
      }
      this.updateToolResultPart(mappedResult, contentParts)
      options.onResultChange?.({ contentParts })
    }
  }

  private processToolErrors<T extends ToolSet>(
    toolErrors: TypedToolError<T>[],
    contentParts: MessageContentParts,
    options: CallChatCompletionOptions
  ): void {
    for (const toolError of toolErrors) {
      const serializedError =
        toolError.error instanceof Error
          ? {
              name: toolError.error.name,
              message: toolError.error.message,
              stack: toolError.error.stack,
            }
          : toolError.error
      const mappedResult: ToolExecutionResult = {
        toolCallId: toolError.toolCallId,
        result: {
          error: serializedError,
          input: toolError.input,
          toolName: toolError.toolName,
        },
        isError: true,
      }
      this.updateToolResultPart(mappedResult, contentParts)
      options.onResultChange?.({ contentParts })
    }
  }

  private updateToolResultPart(toolResult: ToolExecutionResult, contentParts: MessageContentParts): void {
    const toolCallPart = contentParts.find((p) => p.type === 'tool-call' && p.toolCallId === toolResult.toolCallId) as
      | MessageToolCallPart
      | undefined

    if (toolCallPart) {
      const isError = toolResult.isError || (toolResult.result as unknown) instanceof Error
      if (isError) {
        if ((toolResult.result as unknown) instanceof Error) {
          const error = toolResult.result as Error
          console.debug('mcp tool execute error', error)
          toolCallPart.result = {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        } else {
          console.debug('mcp tool execute error', toolResult.result)
          toolCallPart.result = toolResult.result ?? {
            message: 'Unknown tool error',
          }
        }
        toolCallPart.state = 'error'
      } else {
        toolCallPart.state = 'result'
        toolCallPart.result = toolResult.result
      }
    }
  }

  private createOrUpdateContentPart<T extends MessageTextPart | MessageReasoningPart>(
    textDelta: string,
    contentParts: MessageContentParts,
    currentPart: T | undefined,
    type: T['type']
  ): T {
    if (!currentPart) {
      currentPart = { type, text: '' } as T
      contentParts.push(currentPart)
    }
    currentPart.text += textDelta
    return currentPart
  }

  private createOrUpdateTextPart(
    textDelta: string,
    contentParts: MessageContentParts,
    currentTextPart: MessageTextPart | undefined
  ): MessageTextPart {
    return this.createOrUpdateContentPart(textDelta, contentParts, currentTextPart, 'text')
  }

  /**
   * Creates or updates a reasoning part with timing information for streaming responses
   * @param textDelta - New text to append to the reasoning content
   * @param contentParts - Array of message content parts
   * @param currentReasoningPart - Existing reasoning part to update, if any
   * @returns The updated or newly created reasoning part
   */
  private createOrUpdateReasoningPart(
    textDelta: string,
    contentParts: MessageContentParts,
    currentReasoningPart: MessageReasoningPart | undefined
  ): MessageReasoningPart {
    if (!currentReasoningPart) {
      // Create new reasoning part with start time for timer tracking in streaming mode
      currentReasoningPart = {
        type: 'reasoning',
        text: '',
        startTime: Date.now(), // Capture when thinking begins
      }
      contentParts.push(currentReasoningPart)
    }
    currentReasoningPart.text += textDelta
    return currentReasoningPart
  }

  private async processImageFile(
    mimeType: string,
    base64: string,
    contentParts: MessageContentParts,
    responseType: 'response' = 'response'
  ): Promise<void> {
    const storageKey = await this.dependencies.storage.saveImage(responseType, `data:${mimeType};base64,${base64}`)
    contentParts.push({ type: 'image', storageKey })
  }

  private async processStreamChunk<T extends ToolSet>(
    chunk: TextStreamPart<T>,
    contentParts: MessageContentParts,
    currentTextPart: MessageTextPart | undefined,
    currentReasoningPart: MessageReasoningPart | undefined,
    _options: CallChatCompletionOptions
  ): Promise<{
    currentTextPart: MessageTextPart | undefined
    currentReasoningPart: MessageReasoningPart | undefined
  }> {
    // Finalize reasoning duration when transitioning to other content types
    const finalizeReasoningDuration = () => {
      if (currentReasoningPart?.startTime && !currentReasoningPart.duration) {
        currentReasoningPart.duration = Date.now() - currentReasoningPart.startTime
      }
    }

    switch (chunk.type) {
      case 'text-delta':
        finalizeReasoningDuration()
        // clear current reasoning part
        return {
          currentTextPart: this.createOrUpdateTextPart(chunk.text, contentParts, currentTextPart),
          currentReasoningPart: undefined,
        }

      case 'reasoning-delta':
        // 部分提供方会随文本返回空的reasoning，防止分割正常的content
        if (chunk.text.trim()) {
          return {
            currentTextPart: undefined,
            currentReasoningPart: this.createOrUpdateReasoningPart(chunk.text, contentParts, currentReasoningPart),
          }
        }
        break

      case 'tool-call':
        finalizeReasoningDuration()
        this.processToolCalls([chunk], contentParts, _options)
        return {
          currentTextPart: undefined,
          currentReasoningPart: undefined,
        }

      case 'tool-result':
        this.processToolResults([chunk], contentParts, _options)
        break
      case 'tool-error':
        finalizeReasoningDuration()
        this.processToolErrors([chunk], contentParts, _options)
        break

      case 'file':
        if (chunk.file.mediaType?.startsWith('image/') && chunk.file.base64) {
          await this.processImageFile(chunk.file.mediaType, chunk.file.base64, contentParts)
          return {
            currentTextPart: undefined,
            currentReasoningPart: undefined,
          }
        }
        break
      case 'error':
        this.handleError(chunk.error)
        break
      case 'finish':
        break
      default:
        break
    }

    return { currentTextPart, currentReasoningPart }
  }

  private handleError(error: unknown, context: string = ''): never {
    if (APICallError.isInstance(error)) {
      throw new ApiError(`Error from ${this.name}${context}`, error.responseBody)
    }
    if (error instanceof ApiError) {
      throw error
    }
    if (error instanceof ChatboxAIAPIError) {
      throw error
    }
    throw new ApiError(`Error from ${this.name}${context}: ${error}`)
  }

  /**
   * Finalizes the result and ensures all reasoning parts have duration set
   * This is a fallback to ensure timing is captured even if not set during streaming
   * @param contentParts - Array of message content parts
   * @param usage - Token usage information
   * @param options - Call options with result change callback
   * @returns The finalized stream text result
   */
  private finalizeResult(
    contentParts: MessageContentParts,
    result: {
      usage?: LanguageModelUsage
      finishReason?: FinishReason
    },
    options: CallChatCompletionOptions
  ): StreamTextResult {
    // Fallback: Set final duration for any reasoning parts that don't have it yet
    // This should rarely be needed since we capture duration at transition points,
    // but provides safety for edge cases
    const now = Date.now()
    for (const part of contentParts) {
      if (part.type === 'reasoning' && part.startTime && !part.duration) {
        part.duration = now - part.startTime
      }
    }

    options.onResultChange?.({
      contentParts,
      tokenCount: result.usage?.outputTokens,
      tokensUsed: result.usage?.totalTokens,
    })
    return { contentParts, usage: result.usage, finishReason: result.finishReason }
  }

  private async handleStreamingCompletion<T extends ToolSet>(
    model: LanguageModelV3,
    coreMessages: ModelMessage[],
    options: CallChatCompletionOptions<T>,
    callSettings: CallSettings
  ): Promise<StreamTextResult> {
    const result = streamText({
      model,
      messages: coreMessages,
      stopWhen: stepCountIs(options.maxSteps || Number.MAX_SAFE_INTEGER),
      tools: options.tools,
      abortSignal: options.signal,
      ...callSettings,
    })

    const contentParts: MessageContentParts = []
    let currentTextPart: MessageTextPart | undefined
    let currentReasoningPart: MessageReasoningPart | undefined

    try {
      for await (const chunk of result.fullStream) {
        // console.debug('stream chunk', chunk)

        // Handle error chunks
        if (chunk.type === 'error') {
          this.handleError(chunk.error)
        }

        const chunkResult = await this.processStreamChunk(
          chunk,
          contentParts,
          currentTextPart,
          currentReasoningPart,
          options
        )
        currentTextPart = chunkResult.currentTextPart
        currentReasoningPart = chunkResult.currentReasoningPart

        options.onResultChange?.({ contentParts })
      }
    } catch (error) {
      // Ensure reasoning parts get their duration set even if streaming is interrupted
      if (currentReasoningPart?.startTime && !currentReasoningPart.duration) {
        currentReasoningPart.duration = Date.now() - currentReasoningPart.startTime
      }
      throw error
    }

    return this.finalizeResult(
      contentParts,
      {
        usage: await result.totalUsage,
        finishReason: await result.finishReason,
      },
      options
    )
  }

  private async _callChatCompletion<T extends ToolSet>(
    coreMessages: ModelMessage[],
    options: CallChatCompletionOptions<T>
  ): Promise<StreamTextResult> {
    let baseModel = this.getChatModel(options)
    const callSettings = this.getCallSettings(options)

    if (this.options.stream === false) {
      baseModel = wrapLanguageModel({
        model: baseModel,
        middleware: simulateStreamingMiddleware(),
      })
    }

    const retryable5xx = (context: RetryContext<LanguageModelV3>) => {
      if (isErrorAttempt(context.current)) {
        const { error } = context.current
        if (is5xxError(error)) {
          return {
            model: baseModel,
            maxAttempts: RETRY_CONFIG.MAX_ATTEMPTS,
            delay: RETRY_CONFIG.INITIAL_DELAY_MS,
            backoffFactor: RETRY_CONFIG.BACKOFF_FACTOR,
          }
        }
      }
      return undefined
    }

    const model = createRetryable({
      model: baseModel,
      retries: [retryable5xx],
      onError: (context) => {
        if (isErrorAttempt(context.current)) {
          const { error } = context.current
          const errorMessage = error instanceof Error ? error.message : String(error)
          console.debug(`[ai-retry] Error on attempt ${context.attempts.length}:`, errorMessage)
        }
      },
      onRetry: (context) => {
        const attemptNumber = context.attempts.length + 1
        const lastError = context.attempts[context.attempts.length - 1]
        const errorMessage =
          lastError && 'error' in lastError
            ? lastError.error instanceof Error
              ? lastError.error.message
              : String(lastError.error)
            : 'Unknown error'

        console.debug(`[ai-retry] Retrying attempt ${attemptNumber}/${RETRY_CONFIG.MAX_ATTEMPTS}`)

        options.onStatusChange?.({
          type: 'retrying',
          attempt: attemptNumber,
          maxAttempts: RETRY_CONFIG.MAX_ATTEMPTS,
          error: errorMessage,
        })
      },
    })

    try {
      const result = await this.handleStreamingCompletion(model, coreMessages, options, callSettings)
      options.onStatusChange?.(null)
      return result
    } catch (error) {
      options.onStatusChange?.(null)
      throw error
    }
  }
}
