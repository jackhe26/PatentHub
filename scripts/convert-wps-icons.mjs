/**
 * WPS 图标转换脚本: .icns → .png
 * 手动解析 ICNS 二进制格式并转换为 PNG
 * 
 * ICNS 文件格式:
 * - 文件头: "icns"(4) + 总大小(4)
 * - 数据块: 类型码(4) + 块大小(4) + 数据
 * - 常见类型: ic07(128), ic08(256), ic09(512)
 * 
 * 使用方法: node scripts/convert-wps-icons.mjs
 */

import * as fs from 'fs'
import * as path from 'path'

const iconsDir = path.join(process.cwd(), 'src/renderer/static/icons')

// ICNS 类型码映射
const ICNS_TYPES = {
  'ic07': { size: 128, desc: '128x128' },
  'ic08': { size: 256, desc: '256x256' },
  'ic09': { size: 512, desc: '512x512' },
  'ic10': { size: 1024, desc: '1024x1024' },
  'ic11': { size: 16, desc: '16x16' },
  'ic12': { size: 32, desc: '32x32' },
  'ic13': { size: 64, desc: '64x64' },
  'ic14': { size: 256, desc: '128x128@2x' },
}

async function convertIcnToPng(icnsPath, outputPath, targetSize = 48) {
  try {
    console.log(`\n🔄 处理: ${path.basename(icnsPath)}`)
    
    const { default: sharp } = await import('sharp')
    
    // 读取 .icns 文件
    const buffer = fs.readFileSync(icnsPath)
    console.log(`  📄 文件大小: ${buffer.length} bytes`)
    
    // 检查文件头 "icns"
    const magic = buffer.slice(0, 4).toString('ascii')
    if (magic !== 'icns') {
      throw new Error(`无效的 ICNS 文件, magic: ${magic}`)
    }
    console.log(`  ✅ 文件头验证: ${magic}`)
    
    // 读取文件总大小
    const totalSize = buffer.readUInt32BE(4)
    console.log(`  📋 声明的总大小: ${totalSize} bytes`)
    
    // 遍历所有数据块
    let offset = 8 // 从偏移 8 开始(跳过文件头)
    let bestBlock = null
    let bestSize = 0
    
    const priorityTypes = ['ic10', 'ic09', 'ic14', 'ic08', 'ic13', 'ic07', 'ic12', 'ic11']
    
    while (offset < buffer.length && offset < totalSize) {
      // 读取类型码 (4 bytes)
      const type = buffer.slice(offset, offset + 4).toString('ascii')
      // 读取块大小 (4 bytes,包含头部)
      const blockSize = buffer.readUInt32BE(offset + 4)
      
      const info = ICNS_TYPES[type]
      const dataSize = blockSize - 8 // 减去类型码+大小本身
      
      console.log(`  📋 数据块: ${type} (${info?.desc || '未知'}), 数据大小: ${dataSize} bytes`)
      
      if (info && dataSize > bestSize) {
        // 提取数据
        const data = buffer.slice(offset + 8, offset + blockSize)
        bestBlock = { type, data, info, dataSize }
        bestSize = dataSize
        
        // 如果找到足够大的就停止
        if (info.size >= 256) break
      }
      
      // 移动到下一个块
      offset += blockSize
    }
    
    if (!bestBlock) {
      throw new Error('未找到有效的图标数据块')
    }
    
    console.log(`  ✅ 选择: ${bestBlock.type} (${bestBlock.info.desc}), 数据: ${bestBlock.dataSize} bytes`)
    
    // 尝试识别数据格式
    const firstByte = bestBlock.data[0]
    const secondByte = bestBlock.data[1]
    
    console.log(`  📋 数据头 bytes: ${firstByte.toString(16)} ${secondByte.toString(16)}`)
    
    let sharpInput
    let detectedFormat = 'unknown'
    
    // PNG magic: 89 50 4E 47
    if (firstByte === 0x89 && secondByte === 0x50) {
      detectedFormat = 'png'
      console.log(`  📋 检测格式: PNG`)
      sharpInput = bestBlock.data
    }
    // JPEG magic: FF D8 FF
    else if (firstByte === 0xFF && secondByte === 0xD8) {
      detectedFormat = 'jpeg'
      console.log(`  📋 检测格式: JPEG`)
      sharpInput = bestBlock.data
    }
    // ICNP (从 macOS 10.10 开始使用)
    // IG01 (HEIF) 等新格式
    else if (firstByte === 0x69 && secondByte === 0x63) {
      // 嵌套的 icns
      detectedFormat = 'icns-nested'
      console.log(`  📋 检测格式: 嵌套 ICNS,尝试重新解析`)
      // 递归解析
      const result = await sharp(bestBlock.data)
        .resize(targetSize, targetSize, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toFile(outputPath)
      const stats = fs.statSync(outputPath)
      console.log(`  ✅ 已保存: ${path.basename(outputPath)} (${stats.size} bytes, ${result.width}x${result.height})`)
      return true
    }
    else {
      // 可能是 raw RGBA
      detectedFormat = 'raw-rgba'
      const bytesPerPixel = 4
      const pixelCount = bestBlock.dataSize / bytesPerPixel
      const dim = Math.sqrt(pixelCount)
      console.log(`  📋 可能是原始 RGBA, 推断尺寸: ${dim}x${dim}`)
      
      // 作为 raw RGBA 处理
      sharpInput = bestBlock.data
    }
    
    // 使用 sharp 处理
    const result = await sharp(sharpInput)
      .resize(targetSize, targetSize, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(outputPath)
    
    const stats = fs.statSync(outputPath)
    console.log(`  ✅ 已保存: ${path.basename(outputPath)} (${stats.size} bytes, ${result.width}x${result.height})`)
    return true
    
  } catch (err) {
    console.error(`  ❌ 转换失败: ${err.message}`)
    if (err.stack) console.error(err.stack)
    return false
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('WPS 图标转换: .icns → .png (手动解析二进制)')
  console.log('='.repeat(60))
  
  const conversions = [
    {
      icns: 'icons8-wps-writer.icns',
      png: 'icons8-wps-writer-48.png',
      label: 'WPS 文字 (.wps)'
    },
    {
      icns: 'icons8-wps-spreadsheets-48.icns',
      png: 'icons8-wps-spreadsheets-48.png',
      label: 'WPS 表格 (.et)'
    },
    {
      icns: 'icons8-wps-presentation-48.icns',
      png: 'icons8-wps-presentation-48.png',
      label: 'WPS 演示 (.dps)'
    },
    {
      icns: 'wpsoffice.icns',
      png: 'wpsoffice.png',
      label: 'WPS Office 通用'
    },
  ]
  
  const results = []
  
  for (const { icns, png, label } of conversions) {
    const icnsPath = path.join(iconsDir, icns)
    const pngPath = path.join(iconsDir, png)
    
    if (!fs.existsSync(icnsPath)) {
      console.log(`\n⚠️  跳过 ${label}: 源文件不存在 ${icns}`)
      results.push({ label, status: 'skipped', reason: '源文件不存在' })
      continue
    }
    
    if (fs.existsSync(pngPath)) {
      console.log(`\n⚠️  跳过 ${label}: 目标文件已存在 ${png}`)
      results.push({ label, status: 'skipped', reason: '已存在' })
      continue
    }
    
    console.log(`\n📦 ${label}`)
    const success = await convertIcnToPng(icnsPath, pngPath)
    results.push({ 
      label, 
      status: success ? 'success' : 'failed',
      output: png
    })
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('转换结果汇总:')
  console.log('='.repeat(60))
  
  for (const r of results) {
    if (r.status === 'success') {
      console.log(`  ✅ ${r.label} → ${r.output}`)
    } else if (r.status === 'skipped') {
      console.log(`  ⏭️  ${r.label} (${r.reason})`)
    } else {
      console.log(`  ❌ ${r.label}`)
    }
  }
  
  const successCount = results.filter(r => r.status === 'success').length
  console.log(`\n总计: ${successCount}/${results.length} 转换成功`)
}

main().catch(console.error)
