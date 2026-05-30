import type { SearchResult } from '@shared/types'
import WebSearch from './base'

export class BaiduSearch extends WebSearch {
  async search(query: string, signal?: AbortSignal): Promise<SearchResult> {
    const html = await this.fetchSerp(query, signal)
    const items = this.extractItems(html)
    return { items }
  }

  private async fetchSerp(query: string, signal?: AbortSignal) {
    const html = await this.fetch('https://www.baidu.com/s', {
      method: 'GET',
      query: { wd: query },
      signal,
    })
    return html as string
  }

  private extractItems(html: string) {
    const dom = new DOMParser().parseFromString(html, 'text/html')
    const nodes = dom.querySelectorAll('.result, .c-container')
    return Array.from(nodes)
      .slice(0, 50)
      .map((node) => {
        // 尝试多种选择器获取标题和链接
        const nodeA = node.querySelector('h3>a, .t>a, a[href*="http"]')
        const link = nodeA?.getAttribute('href') || ''
        const title = nodeA?.textContent || ''
        
        // 尝试多种选择器获取摘要
        const nodeAbstract = node.querySelector('.c-abstract, .c-span-text, .c-gap-top-small span, .c-color-text')
        const snippet = nodeAbstract?.textContent || ''
        
        return { title, link, snippet }
      })
      .filter(item => item.link && item.link.includes('http'))
  }
}
