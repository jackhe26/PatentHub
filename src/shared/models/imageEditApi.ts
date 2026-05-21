import { ApiError } from './errors'

/**
 * Result from the /v1/images/edits API response
 */
interface EditAPIResponse {
  data?: Array<{
    b64_json?: string
    url?: string
    revised_prompt?: string
  }>
  usage?: {
    total_tokens?: number
    input_tokens?: number
    output_tokens?: number
  }
}

/**
 * Options for calling the edits API
 */
interface EditWithEditsAPIOptions {
  /** Base URL of the API (e.g. https://api.example.com) */
  baseUrl: string
  /** API key for authentication */
  apiKey: string
  /** Model ID to use (e.g. gpt-image-1, gpt-image-2) */
  model: string
  /** Reference images as data URLs */
  images: string[]
  /** Edit prompt */
  prompt: string
  /** Number of images to generate */
  n: number
  /** Output size (e.g. 2560x1440). If undefined, API decides */
  size?: string
  /** Abort signal */
  signal?: AbortSignal
  /** Callback for each generated image */
  onImage?: (dataUrl: string) => void
}

/**
 * Converts a data URL to a Blob
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches || matches.length !== 3) {
    throw new ApiError(`Invalid data URL format: ${dataUrl.substring(0, 50)}...`)
  }
  const mimeType = matches[1]
  const base64Data = matches[2]
  const byteString = atob(base64Data)
  const ab = new ArrayBuffer(byteString.length)
  const ia = new Uint8Array(ab)
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i)
  }
  return new Blob([ab], { type: mimeType })
}

/**
 * Builds the multipart/form-data request body for POST /v1/images/edits
 * Reference implementation: Comfly_gpt_image_edit.edit_image() and
 * Comfly_gpt_image_2_official._build_official_edits_multipart()
 */
function buildEditsFormData(
  images: string[],
  prompt: string,
  model: string,
  n: number,
  size?: string
): FormData {
  const formData = new FormData()

  // Add image(s) - one or multiple
  if (images.length === 1) {
    const blob = dataUrlToBlob(images[0])
    formData.append('image', blob, 'image.png')
  } else {
    // Multiple images use image[] format
    for (let i = 0; i < images.length; i++) {
      const blob = dataUrlToBlob(images[i])
      formData.append('image[]', blob, `image_${i}.png`)
    }
  }

  // Text fields
  formData.append('prompt', prompt)
  formData.append('model', model)
  formData.append('n', String(n))

  // Optional size
  if (size) {
    formData.append('size', size)
  }

  return formData
}

/**
 * Downloads an image URL and converts it to a base64 data URL.
 * Some APIs return URLs instead of base64 data.
 */
async function downloadUrlAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new ApiError(`Failed to download image from URL: ${url} (HTTP ${response.status})`)
  }
  const blob = await response.blob()
  const arrayBuffer = await blob.arrayBuffer()
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((str, byte) => str + String.fromCharCode(byte), '')
  )
  const mimeType = blob.type || 'image/png'
  return `data:${mimeType};base64,${base64}`
}

/**
 * Reads the Response body as JSON, handling both single and multi-image responses.
 * Returns an array of data URLs (base64).
 */
async function parseEditResponse(response: Response): Promise<string[]> {
  const result: EditAPIResponse = await response.json()

  if (!result.data || result.data.length === 0) {
    throw new ApiError('No image data in /v1/images/edits response')
  }

  const dataUrls: string[] = []

  for (const item of result.data) {
    if (item.b64_json) {
      let b64 = item.b64_json
      // Handle data URL prefix
      if (b64.startsWith('data:image/png;base64,')) {
        b64 = b64.slice('data:image/png;base64,'.length)
      } else if (b64.startsWith('data:')) {
        // Generic data URL - extract the base64 part
        const commaIndex = b64.indexOf(',')
        if (commaIndex !== -1) {
          b64 = b64.slice(commaIndex + 1)
        }
      }
      dataUrls.push(`data:image/png;base64,${b64}`)
    } else if (item.url) {
      // API returned a URL instead of base64 - download and convert it
      console.log('[EditAPI] Downloading image from URL:', item.url)
      const dataUrl = await downloadUrlAsDataUrl(item.url)
      dataUrls.push(dataUrl)
    } else {
      console.warn('[EditAPI] Image item has neither b64_json nor url', item)
    }
  }

  return dataUrls
}

/**
 * Calls POST /v1/images/edits with multipart/form-data to edit an image.
 * 
 * Reference:
 * - Comfly_gpt_image_edit.edit_image() - sync multipart edits
 * - Comfly_gpt_image_2_official._build_official_edits_multipart() - gpt-image-2
 * 
 * @returns Array of data URLs for the edited images
 */
export async function editWithEditsAPI(options: EditWithEditsAPIOptions): Promise<string[]> {
  const { baseUrl, apiKey, model, images, prompt, n, size, signal, onImage } = options

  // Normalize baseUrl - remove trailing slash
  const normalizedBase = baseUrl.replace(/\/$/, '')

  // Build the endpoint URL.
  // Avoid double /v1/v1/ when baseUrl already contains /v1 (e.g. "https://ai.comfly.chat/v1").
  // Providers without /v1 need it appended (e.g. "https://api.openai.com").
  const endpoint = normalizedBase.endsWith('/v1')
    ? `${normalizedBase}/images/edits`
    : `${normalizedBase}/v1/images/edits`

  // Build multipart form data
  const formData = buildEditsFormData(images, prompt, model, n, size)

  // Log the request for debugging
  console.log('[EditAPI] POST', endpoint, {
    model,
    imageCount: images.length,
    prompt: prompt.substring(0, 100),
    size,
  })

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        // Do NOT set Content-Type for multipart; browser sets it with boundary
      },
      body: formData,
      signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      const errorMsg = `Edit API error: ${response.status} ${response.statusText} - ${errorText}`
      console.error('[EditAPI]', errorMsg)
      throw new ApiError(errorMsg)
    }

    const dataUrls = await parseEditResponse(response)

    // Trigger callbacks
    if (onImage) {
      for (const dataUrl of dataUrls) {
        onImage(dataUrl)
      }
    }

    return dataUrls
  } catch (error) {
    // Re-throw ApiError instances as-is
    if (error instanceof ApiError) {
      throw error
    }
    // Wrap other errors
    const message = error instanceof Error ? error.message : String(error)
    throw new ApiError(`Edit API request failed: ${message}`)
  }
}
