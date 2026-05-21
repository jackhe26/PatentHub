export const MAX_REFERENCE_IMAGES = 14

export const HISTORY_PANEL_WIDTH = 280

export const IMAGE_MODEL_FALLBACK_NAMES: Record<string, string> = {
  '': 'GPT Image',
  'gpt-image-1': 'GPT Image 1',
  'gpt-image-1.5': 'GPT Image 1.5',
  'gpt-image-2': 'GPT Image 2',
  'gemini-2.5-flash-image': 'Nano Banana',
  'gemini-3-pro-image-preview': 'Nano Banana Pro',
  'gemini-3-pro-image': 'Nano Banana Pro',
}

export const CHATBOXAI_IMAGE_MODEL_IDS = ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview', 'gemini-3-pro-image']
export const OPENAI_IMAGE_MODEL_IDS = ['gpt-image-1', 'gpt-image-1.5', 'gpt-image-2']
export const GEMINI_IMAGE_MODEL_IDS = ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview', 'gemini-3-pro-image']

// 所有支持的图片比例（通用，不区分模型）
export const ALL_ASPECT_RATIOS = [
  'auto',
  '1:1',
  '3:2',
  '2:3',
  '4:3',
  '3:4',
  '5:4',
  '4:5',
  '16:9',
  '9:16',
  '2:1',
  '1:2',
  '21:9',
  '9:21',
]

// 分辨率选项
export const RESOLUTION_OPTIONS = ['1k', '2k', '4k'] as const
export type ResolutionOption = (typeof RESOLUTION_OPTIONS)[number]

// 比例 × 分辨率 → 实际像素尺寸的映射（参考 gpt-image-2 official 实现）
// 来源：Comfly_gpt_image_2_official._SIZE_MAP
export const SIZE_MAP: Record<string, Record<string, string>> = {
  '1:1':  { '1k': '1024x1024', '2k': '2048x2048',   '4k': '2880x2880' },
  '16:9': { '1k': '1280x720',  '2k': '2560x1440',   '4k': '3840x2160' },
  '9:16': { '1k': '720x1280',  '2k': '1440x2560',   '4k': '2160x3840' },
  '4:3':  { '1k': '1152x864',  '2k': '2304x1728',   '4k': '3264x2448' },
  '3:4':  { '1k': '864x1152',  '2k': '1728x2304',   '4k': '2448x3264' },
  '3:2':  { '1k': '1248x832',  '2k': '2496x1664',   '4k': '3504x2336' },
  '2:3':  { '1k': '832x1248',  '2k': '1664x2496',   '4k': '2336x3504' },
  '5:4':  { '1k': '1120x896',  '2k': '2240x1792',   '4k': '3200x2560' },
  '4:5':  { '1k': '896x1120',  '2k': '1792x2240',   '4k': '2560x3200' },
  '21:9': { '1k': '1456x624',  '2k': '3024x1296',   '4k': '3696x1584' },
  '9:21': { '1k': '624x1456',  '2k': '1296x3024',   '4k': '1584x3696' },
  '2:1':  { '1k': '2048x1024', '2k': '2688x1344',   '4k': '3840x1920' },
  '1:2':  { '1k': '1024x2048', '2k': '1344x2688',   '4k': '1920x3840' },
}

/**
 * 根据比例和分辨率计算实际像素尺寸
 * 当比例为 'auto' 或映射表中找不到时返回 undefined（由 API 决定尺寸）
 */
export function getImageSize(aspectRatio: string, resolution: ResolutionOption): string | undefined {
  if (aspectRatio === 'auto') return undefined
  return SIZE_MAP[aspectRatio]?.[resolution]
}

/**
 * 获取所有可用的比例选项（不再按模型区分）
 */
export function getRatioOptionsForModel(_modelId: string): string[] {
  return ALL_ASPECT_RATIOS
}

/**
 * 安全地将 blob 数据转换为 data URL
 * 处理多种格式：纯 base64、data URL、URL、以及包含空白字符的 base64
 */
export function blobToDataUrl(blob: string): string {
  // 空值检查
  if (!blob) {
    console.warn('blobToDataUrl received empty blob')
    return ''
  }

  const trimmed = blob.trim()

  // 情况1：已经是完整的 data URL
  if (trimmed.startsWith('data:')) {
    return trimmed
  }

  // 情况2：是一个 URL（http/https）
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    console.warn('blobToDataUrl received a URL instead of base64:', trimmed.substring(0, 50))
    // 对于 URL，我们无法直接处理，返回原始值让调用方处理
    return trimmed
  }

  // 情况3：纯 base64 数据（可能包含空白字符）
  // 移除可能的空格和换行
  const cleanedBase64 = trimmed.replace(/[\s\n\r]/g, '')

  // 根据 base64 头部识别图片格式
  if (cleanedBase64.startsWith('/9j/') || cleanedBase64.startsWith('\xff\xd8')) {
    // JPEG 格式
    return `data:image/jpeg;base64,${cleanedBase64}`
  }
  if (cleanedBase64.startsWith('iVBOR')) {
    // PNG 格式
    return `data:image/png;base64,${cleanedBase64}`
  }
  if (cleanedBase64.startsWith('UklGR')) {
    // WebP 格式
    return `data:image/webp;base64,${cleanedBase64}`
  }
  if (cleanedBase64.startsWith('R0lGO')) {
    // GIF 格式
    return `data:image/gif;base64,${cleanedBase64}`
  }

  // 默认作为 PNG 处理
  return `data:image/png;base64,${cleanedBase64}`
}

export function getBase64ImageSize(base64: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      resolve({ width: img.width, height: img.height })
    }
    img.onerror = (err) => {
      reject(err)
    }
    img.src = base64
  })
}
