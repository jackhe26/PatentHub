// 独立测试脚本：用真实 MinerU 输出重建 PDF
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_DIR = 'F:/MyAI_Labs/Patent-AI/PDF-Tests-Files/WOSA_PCT_mineru_20260620_021828'

// 动态 import pdf-rebuilder（编译过的 .ts）
const { rebuildPdfFromLayout, normalizeJson } = await import('../src/main/pdf-convert/pdf-rebuilder.ts').catch(async () => {
  // 退路：用 tsx 或 ts-node 运行
  return await import('../src/main/pdf-convert/pdf-rebuilder.ts')
})

async function main() {
  console.log('📂 测试目录:', TEST_DIR)

  // 1. 加载 layout.json
  const layoutPath = path.join(TEST_DIR, 'layout.json')
  const layoutData = JSON.parse(fs.readFileSync(layoutPath, 'utf-8'))
  console.log('📋 加载 layout.json:', layoutData.pdf_info.length, '页')

  // 2. 加载所有图片到 imageCache
  const imagesDir = path.join(TEST_DIR, 'images')
  const imageCache = new Map()
  if (fs.existsSync(imagesDir)) {
    const files = fs.readdirSync(imagesDir)
    for (const f of files) {
      if (/\.(jpg|jpeg|png)$/i.test(f)) {
        const buf = fs.readFileSync(path.join(imagesDir, f))
        imageCache.set(f, buf)
        console.log('  🖼️  ', f, '(', buf.length, 'bytes )')
      }
    }
  }
  console.log('📦 图片缓存:', imageCache.size, '张')

  // 3. 验证 normalizeJson
  const { pages, format } = normalizeJson(layoutData)
  console.log('🔍 识别格式:', format)
  console.log('📄 页面数:', pages.length)
  pages.forEach((p, i) => {
    console.log(`  页 ${i}: preproc=${p.preproc_blocks.length}, headers=${p.headers.length}, footers=${p.footers.length}`)
    const tables = p.preproc_blocks.filter(b => b.type === 'table' || b.type === 'table_body')
    tables.forEach(t => {
      console.log(`    📊 表格: img_path=${t.img_path ? t.img_path.substring(0, 30) + '...' : 'NULL ❌'}, html=${t.html ? '有' : '无'}`)
    })
  })

  // 4. 重建 PDF
  console.log('\n🔨 重建 PDF...')
  const result = await rebuildPdfFromLayout(layoutData, imageCache, (cur, total) => {
    console.log(`  进度: ${cur}/${total}`)
  })

  // 5. 保存输出
  const outputPath = path.join(__dirname, 'test-output.pdf')
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
