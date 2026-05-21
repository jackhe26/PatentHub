const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sourceImage = 'assets/icon-1024.png';
const androidResDir = 'android/app/src/main/res';

// Android icon sizes
const sizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192
};

async function generateIcons() {
  console.log('🔄 Reading source image...');
  
  const sourceBuffer = fs.readFileSync(sourceImage);
  
  for (const [dir, size] of Object.entries(sizes)) {
    const targetDir = path.join(androidResDir, dir);
    
    // Create directory if not exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    const targetPath = path.join(targetDir, 'ic_launcher.png');
    
    console.log(`📐 Generating ${dir}/ic_launcher.png (${size}x${size})...`);
    
    await sharp(sourceBuffer)
      .resize(size, size)
      .png()
      .toFile(targetPath);
    
    // Also generate round icon
    const roundPath = path.join(targetDir, 'ic_launcher_round.png');
    await sharp(sourceBuffer)
      .resize(size, size)
      .png()
      .toFile(roundPath);
  }
  
  // Generate adaptive icon foreground
  console.log('📐 Generating adaptive icon foreground...');
  const foregroundDir = path.join(androidResDir, 'mipmap-anydpi-v26');
  if (!fs.existsSync(foregroundDir)) {
    fs.mkdirSync(foregroundDir, { recursive: true });
  }
  
  await sharp(sourceBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(androidResDir, 'mipmap-xxxhdpi', 'ic_launcher_foreground.png'));
  
  await sharp(sourceBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(androidResDir, 'mipmap-hdpi', 'ic_launcher_foreground.png'));
  
  await sharp(sourceBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(androidResDir, 'mipmap-mdpi', 'ic_launcher_foreground.png'));
  
  await sharp(sourceBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(androidResDir, 'mipmap-xhdpi', 'ic_launcher_foreground.png'));
  
  await sharp(sourceBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(androidResDir, 'mipmap-xxhdpi', 'ic_launcher_foreground.png'));
  
  console.log('✅ All Android icons generated successfully!');
}

generateIcons().catch(console.error);
