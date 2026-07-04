// 独立测试脚本：用真实 MinerU 输出 (full.md + images/) 通过 MD 渲染器重建 PDF
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_DIR = 'F:/MyAI_Labs/Patent-AI/PDF-Tests-Files/WOSA_PCT_mineru_20260620_021828'

async function main() {
  console.log('📂 测试目录:', TEST_DIR)

  // 1. 读取 Markdown
  const mdPath = path.join(TEST_DIR, 'full.md')
  const mdContent = fs.readFileSync(mdPath, 'utf-8')
  console.log('📄 Markdown 长度:', mdContent.length, '字符')
  console.log('📄 行数:', mdContent.split('\n').length)

  // 2. 构建图片缓存（images/xxx.jpg）
  const imagesDir = path.join(TEST_DIR, 'images')
  const imageCache = new Map()
  if (fs.existsSync(imagesDir)) {
    const files = fs.readdirSync(imagesDir)
    for (const f of files) {
      if (/\.(jpg|jpeg|png)$/i.test(f)) {
        const buf = fs.readFileSync(path.join(imagesDir, f))
        imageCache.set(f, buf)
        imageCache.set(path.join('images', f), buf)  // MD 引用 images/xxx.jpg
        imageCache.set(path.join(imagesDir, f), buf)  // 绝对路径
        console.log('  🖼️  ', f, '(', (buf.length / 1024).toFixed(1), 'KB )')
      }
    }
  }
  console.log('📦 图片缓存:', imageCache.size, '条')

  // 3. 动态 import MD 渲染器
  console.log('\n🔨 调用 MD 渲染器...')
  const { generatePdfFromMarkdownV2 } = await import('../src/main/pdf-convert/md-renderer.ts')

  const result = await generatePdfFromMarkdownV2(mdContent, {
    imageCache,
    imageBasePath: TEST_DIR,
  })

  // 4. 保存输出
  const outputPath = path.join(__dirname, 'test-md-output.pdf')
  fs.writeFileSync(outputPath, result.pdfBuffer)
  console.log('\n✅ 输出 PDF:', outputPath)
  console.log('📊 统计:', {
    pageCount: result.pageCount,
    imagesUsed: result.imagesUsed,
    format: result.format,
    fontSource: result.fontSource,
    fileSize: (result.pdfBuffer.length / 1024).toFixed(1) + 'KB',
  })
}

main().catch(err => {
  console.error('❌ 错误:', err)
  process.exit(1)
})