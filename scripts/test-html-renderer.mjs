/**
 * 验证 html-renderer.ts v6.2 在 WOSA_PCT 测试数据上能正常工作
 *
 * v6.2 新增: 绝对定位模式 + 图片 base64 内嵌
 *
 * 运行方法:
 *   pnpm exec tsx scripts/test-html-renderer.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')

async function main() {
  // v6.2: 模拟 IPC 的逻辑, 从 ZIP 读 JSON + images
  const { rebuildHtml } = await import('../src/main/pdf-convert/html-renderer.ts')
  const { normalizeJson } = await import('../src/main/pdf-convert/pdf-rebuilder.ts')

  console.log('='.repeat(60))
  console.log('  HTML Renderer v6.2 测试 (WOSA_PCT layout.json)')
  console.log('  模式: absolute + 嵌入图片 (base64)')
  console.log('='.repeat(60))

  // 加载测试数据
  const testDataPath = 'F:/MyAI_Labs/Patent-AI/PDF-Tests-Files/WOSA_PCT_mineru_20260620_021828/layout.json'
  console.log(`\n[1/3] 加载测试数据: ${testDataPath}`)
  const raw = readFileSync(testDataPath, 'utf-8')
  const jsonData = JSON.parse(raw)
  console.log(`      原始大小: ${(raw.length / 1024).toFixed(1)} KB`)

  // 标准化
  console.log(`\n[2/3] 调用 normalizeJson()...`)
  const { pages, format } = normalizeJson(jsonData)
  console.log(`      ✓ 识别格式: ${format}`)
  console.log(`      ✓ 解析页数: ${pages.length}`)

  // v6.2: 模拟从 ZIP 读 images (如果存在)
  let imageBase64Map = {}
  const testImagesDir = 'F:/MyAI_Labs/Patent-AI/PDF-Tests-Files/WOSA_PCT_mineru_20260620_021828/images'
  const fsNode = await import('node:fs')
  if (fsNode.existsSync(testImagesDir)) {
    const imageFiles = fsNode.readdirSync(testImagesDir)
    console.log(`\n[图片加载] 发现 ${imageFiles.length} 张图片:`)
    for (const file of imageFiles) {
      if (/\.(jpg|jpeg|png|gif|webp)$/i.test(file)) {
        const buf = fsNode.readFileSync(`${testImagesDir}/${file}`)
        const ext = file.split('.').pop().toLowerCase()
        const mime = ext === 'jpg' ? 'jpeg' : ext
        const b64 = `data:image/${mime};base64,${buf.toString('base64')}`
        imageBase64Map[file] = b64
        imageBase64Map[`images/${file}`] = b64
        console.log(`      ✓ ${file} (${(buf.length / 1024).toFixed(1)} KB)`)
      }
    }
  } else {
    console.log(`\n[图片加载] 目录不存在: ${testImagesDir}`)
  }

  // 生成 HTML (v6.2 absolute 模式)
  console.log(`\n[3/3] 调用 rebuildHtml(layoutMode='absolute')...`)
  const html = rebuildHtml(pages, {
    embedStyles: true,
    tableAsHtml: true,
    embedImages: true,
    imageBase64Map,
    layoutMode: 'absolute',
  })
  console.log(`      ✓ HTML 大小: ${(html.length / 1024).toFixed(1)} KB`)
  console.log(`      ✓ HTML 行数: ${html.split('\n').length}`)

  // v6.2 检查项: 绝对定位模式
  console.log(`\n[v6.2 验证 - 绝对定位 + 图片内嵌]`)
  const checks = [
    { name: 'page-absolute 模式', regex: /class="page page-absolute"/i },
    { name: 'CSS 包含 .abs-item 样式', regex: /\.page-absolute\s+\.abs-item/i },
    { name: '包含绝对定位 left/top', regex: /style="[^"]*left:\d+px;[^"]*top:\d+px/i },
    { name: '图片 src 包含 base64', regex: /src="data:image\/(jpeg|png|webp);base64,/i },
    { name: '图片 base64 大小合理 (>1KB)', regex: /data:image\/[a-z]+;base64,[A-Za-z0-9+\/=]{1000,}/i },
    { name: '页眉绝对定位', regex: /class="abs-item page-meta"[^>]*left:\d+px/i },
  ]
  for (const { name, regex } of checks) {
    const found = regex.test(html)
    console.log(`      ${found ? '✓' : '✗'} ${name}`)
  }

  // 修复后的 17 项检查(保持兼容)
  console.log(`\n[内容检查 - 17 项]`)
  const contentChecks = [
    { name: 'DOCTYPE', regex: /<!DOCTYPE html>/i },
    { name: '样式块', regex: /<style>/i },
    { name: '页容器', regex: /class="page/ },
    { name: '页眉 - WRITTEN OPINION', regex: /WRITTEN OPINION OF THE/i },
    { name: '页眉 - International application No.', regex: /International application No\./i },
    { name: '页眉 - 多个页眉 (Page 2 有 2 个)', regex: /class="abs-item page-meta"/g, global: true },
    { name: '表格 HTML', regex: /<table>/i },
    { name: '表格 rowspan', regex: /rowspan=/i },
    { name: '表格前的 caption - Box No. V', regex: /Box No\. V\s+Reasoned statement/i },
    { name: '表格前的 caption - 1. Statement', regex: /1\.\s+Statement/i },
    { name: '表格后的 caption - 2. Citations', regex: /2\.\s+Citations and explanations/i },
    { name: '表格后的 caption - see separate sheet', regex: /see separate sheet/i },
    { name: '复选框列表 - Box No. I', regex: /Box No\.\s+I\s+Basis of the opinion/i },
    { name: '复选框列表 - 8 个项', regex: /Box No\.\s+(VIII|VII)/i },
    { name: 'D1 引用', regex: /D1 US 8 838 184/i },
    { name: 'BOSE CORPORATION', regex: /BOSE CORPORATION/i },
    { name: 'PCT/US2021/029073', regex: /PCT\/US2021\/029073/i },
  ]
  let passCount = 0
  let failCount = 0
  for (const check of contentChecks) {
    const { name, regex, global } = check
    const found = global
      ? (html.match(regex) ?? []).length
      : regex.test(html)
    const ok = global ? found >= 2 : found
    console.log(`      ${ok ? '✓' : '✗'} ${name}${global ? ` (出现 ${found} 次)` : ''}`)
    if (ok) passCount++; else failCount++
  }
  console.log(`\n      内容检查总计: ${passCount} 通过 / ${failCount} 失败`)

  // 保存到测试文件
  const outPath = resolve(ROOT, 'scripts/test-html-renderer-output.html')
  writeFileSync(outPath, html, 'utf-8')
  console.log(`\n✅ HTML 已保存到: ${outPath}`)
  console.log(`\n你可以用浏览器打开这个文件, 验证绝对定位 + 图片内嵌效果！`)
  console.log(`注意: 表格和正文是流式布局, 图片和页眉/页脚是绝对定位。`)
}

main().catch((err) => {
  console.error('❌ 测试失败:', err)
  process.exit(1)
})
