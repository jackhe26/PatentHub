/**
 * 安全地解析 base64 图片数据
 * 处理多种格式：data URL、纯 base64、URL
 */
export function parseImage(base64Data: string) {
  if (!base64Data) {
    return { type: '', data: '' }
  }

  const trimmed = base64Data.trim()

  // 情况1：空字符串
  if (trimmed === '') {
    return { type: '', data: '' }
  }

  // 情况2：已经是 data URL
  if (trimmed.startsWith('data:')) {
    let working = trimmed.replace(/^data:/, '')
    const markIndex = working.indexOf(';')
    if (markIndex < 0) {
      // 没有分号，可能是纯 base64
      return { type: 'image/png', data: working }
    }
    const type = working.slice(0, markIndex)
    working = working.slice(markIndex + 1)
    working = working.replace(/^base64,/, '')
    return { type, data: working }
  }

  // 情况3：HTTP/HTTPS URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    console.warn('parseImage received a URL instead of base64:', trimmed.substring(0, 50))
    return { type: 'image/png', data: trimmed }
  }

  // 情况4：纯 base64（可能包含空白字符）
  const cleanedData = trimmed.replace(/[\s\n\r]/g, '')
  
  // 根据头部识别格式
  if (cleanedData.startsWith('/9j/')) {
    return { type: 'image/jpeg', data: cleanedData }
  }
  if (cleanedData.startsWith('iVBOR')) {
    return { type: 'image/png', data: cleanedData }
  }
  if (cleanedData.startsWith('UklGR')) {
    return { type: 'image/webp', data: cleanedData }
  }
  if (cleanedData.startsWith('R0lGO')) {
    return { type: 'image/gif', data: cleanedData }
  }

  // 默认作为 PNG 处理
  return { type: 'image/png', data: cleanedData }
}

export function svgCodeToBase64(svgCode: string) {
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgCode)))
}
