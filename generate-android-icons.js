const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// 使用用户提供的适配 Android 的 1024 图标
const sourceImage = 'assets/icon-1024 - for Android icons.png';
const androidResDir = 'android/app/src/main/res';

// Android icon sizes (density buckets)
const sizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192
};

// Adaptive Icon 安全区域比例：
// Android 规范：整体 108dp，安全区域 72dp（居中），四周各 18dp（16.67%）会被裁剪
// 所以实际可见内容只占整体尺寸的 66.67%
const SAFE_AREA_RATIO = 2 / 3; // 66.67%

/**
 * 生成带安全边距的图标
 * 将图片缩放到目标尺寸的 SAFE_AREA_RATIO，然后居中放置在透明画布上
 */
async function generateSafeIcon(sourceBuffer, targetSize, outputPath) {
  // 计算安全区域内的实际像素尺寸
  const safeSize = Math.round(targetSize * SAFE_AREA_RATIO);
  
  // 缩放到安全区域尺寸
  const resizedBuffer = await sharp(sourceBuffer)
    .resize(safeSize, safeSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();
  
  // 创建透明背景画布，将缩放后的图片居中合成
  const offset = Math.floor((targetSize - safeSize) / 2);
  
  await sharp({
    create: {
      width: targetSize,
      height: targetSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      {
        input: resizedBuffer,
        top: offset,
        left: offset,
      }
    ])
    .png()
    .toFile(outputPath);
}

async function generateIcons() {
  if (!fs.existsSync(sourceImage)) {
    console.error(`❌ 源文件不存在: ${sourceImage}`);
    console.log('📝 请确认文件路径正确，或修改脚本中的 sourceImage 变量');
    process.exit(1);
  }

  console.log('🔄 读取源图标...');
  console.log(`📂 ${sourceImage}`);
  
  const sourceBuffer = fs.readFileSync(sourceImage);

  // 1. 生成各密度的普通/圆形图标（ic_launcher.png / ic_launcher_round.png）
  for (const [dir, size] of Object.entries(sizes)) {
    const targetDir = path.join(androidResDir, dir);
    
    // 创建目录（如果不存在）
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // 生成 ic_launcher.png
    const targetPath = path.join(targetDir, 'ic_launcher.png');
    console.log(`📐 生成 ${dir}/ic_launcher.png (${size}x${size})...`);
    await generateSafeIcon(sourceBuffer, size, targetPath);
    
    // 生成 ic_launcher_round.png
    const roundPath = path.join(targetDir, 'ic_launcher_round.png');
    console.log(`📐 生成 ${dir}/ic_launcher_round.png (${size}x${size})...`);
    await generateSafeIcon(sourceBuffer, size, roundPath);
  }

  // 2. 生成 Adaptive Icon 前景层（ic_launcher_foreground.png）
  // Adaptive Icon 需要 1024x1024 的前景图
  console.log('📐 生成 Adaptive Icon 前景层 (108dp 设计稿)...');
  
  // Adaptive Icon 设计稿是 108dp 等效于 1024px
  // 安全区域为 72dp = 1024 * 2/3 ≈ 682px
  const adaptiveDesignSize = 1024;
  const foregroundDirs = ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'];
  
  for (const dir of foregroundDirs) {
    const targetDir = path.join(androidResDir, dir);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    const foregroundPath = path.join(targetDir, 'ic_launcher_foreground.png');
    console.log(`   ${dir}/ic_launcher_foreground.png...`);
    await generateSafeIcon(sourceBuffer, adaptiveDesignSize, foregroundPath);
  }

  console.log('✅ 所有 Android 图标生成成功！');
  console.log('');
  console.log('📋 说明：');
  console.log('   - 已将图标缩放到安全区域 (66.67%)，四周预留 16.67% 的裁剪空间');
  console.log('   - 适配 Android Adaptive Icons 规范（圆角、圆形、圆角方形等遮罩）');
  console.log('   - 请重新编译 Android 应用以查看效果');
}

generateIcons().catch(console.error);
