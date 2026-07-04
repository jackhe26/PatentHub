import platform from '@/platform'

export const featureFlags = {
  mcp: platform.type === 'desktop',
  knowledgeBase: platform.type === 'desktop',
  // PDF Translate 依赖桌面端 BabelDOC + Python 环境，移动端（包括 Android / iOS）暂不支持
  pdfTranslate: platform.type === 'desktop',
}
