// 端到端测试：模拟 mineru-converter 完整流程
import fs from 'node:fs'
import path from 'node:path'

const TEST_DIR = 'F:/MyAI_Labs/Patent-AI/PDF-Tests-Files/WOSA_PCT_mineru_20260620_021828'

// 1. 列出 ZIP 解压后的所有文件（参考实际 ZIP）
const files = fs.readdirSync(TEST_DIR)
console.log('=== ZIP 解压后文件 ===')
files.forEach(f => console.log(`  ${f}`))

// 2. 分类
const mdFile = files.find(f => f.endsWith('.md'))
const layoutJsonFile = files.find(f => f === 'layout.json')
const originPdfFile = files.find(f => f.endsWith('_origin.pdf'))
const contentListFile = files.find(f => f.endsWith('_content_list.json') && !f.includes('_v2'))
const contentListV2File = files.find(f => f.endsWith('_content_list_v2.json'))
const modelJsonFile = files.find(f => f.endsWith('model.json') && !f.includes('middle'))
const imagesDir = fs.existsSync(path.join(TEST_DIR, 'images')) ? 'images' : null

console.log('\n=== 文件识别 ===')
console.log(`MD 文件: ${mdFile ?? '无'}`)
console.log(`layout.json: ${layoutJsonFile ?? '无'}`)
console.log(`model.json: ${modelJsonFile ?? '无'}`)
console.log(`content_list.json: ${contentListFile ?? '无'}`)
console.log(`content_list_v2.json: ${contentListV2File ?? '无'}`)
console.log(`_origin.pdf: ${originPdfFile ?? '无'}`)
console.log(`_model.pdf: ${files.find(f => f.endsWith('_model.pdf')) ?? '无（实际不存在）'}`)
console.log(`_layout.pdf: ${files.find(f => f.endsWith('_layout.pdf')) ?? '无（实际不存在）'}`)
console.log(`images/: ${imagesDir ?? '无'}`)

// 3. 测试 MD 渲染（用真实数据）
console.log('\n=== 测试 MD 渲染 ===')
const { generatePdfFromMarkdownV2 } = await import('../src/main/pdf-convert/md-renderer.ts')

const imageCache = new Map()
if (imagesDir) {
  for (const f of fs.readdirSync(path.join(TEST_DIR, imagesDir))) {
    if (/\.(jpg|jpeg|png)$/i.test(f)) {
      const buf = fs.readFileSync(path.join(TEST_DIR, imagesDir, f))
      imageCache.set(f, buf)
      imageCache.set(`images/${f}`, buf)
      imageCache.set(path.join(TEST_DIR, imagesDir, f), buf)
    }
  }
}
console.log(`图片缓存: ${imageCache.size} 条`)

const mdContent = fs.readFileSync(path.join(TEST_DIR, mdFile), 'utf-8')
const result = await generatePdfFromMarkdownV2(mdContent, {
  imageCache,
  imageBasePath: TEST_DIR,
})

import { fileURLToPath } from 'node:url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const outputPath = path.join(__dirname, 'test-md-output.pdf')
fs.writeFileSync(outputPath, result.pdfBuffer)
console.log(`\n✅ 输出: ${outputPath}`)
console.log('📊 统计:', {
  pageCount: result.pageCount,
  imagesUsed: result.imagesUsed,
  fontSource: result.fontSource,
  sizeKB: (result.pdfBuffer.length / 1024).toFixed(1),
})