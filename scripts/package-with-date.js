const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get today's date in YYYYMMDD format
const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
console.log(`Building with date suffix: ${date}`);

// Read electron-builder.yml
const ymlPath = path.join(__dirname, '..', 'electron-builder.yml');
let yml = fs.readFileSync(ymlPath, 'utf8');

// Store original content
const originalYml = yml;

// Replace the artifact names to include date
yml = yml.replace(
  /artifactName: \$\{productName\}-\$\{version\}-Setup\.\{ext\}/,
  `artifactName: \$\{productName\}-\$\{version\}-${date}-Setup.\{ext\}`
);
yml = yml.replace(
  /artifactName: \$\{productName\}-\$\{version\}-Portable\.\{ext\}/,
  `artifactName: \$\{productName\}-\$\{version\}-${date}-Portable.\{ext\}`
);

// Write back
fs.writeFileSync(ymlPath, yml);
console.log('Updated electron-builder.yml with date suffix');

try {
  // Install dependencies in release/app first (to avoid npm peer dep issues)
  console.log('Installing dependencies in release/app...');
  execSync('cd release/app && pnpm install --ignore-scripts', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });

  // Run the build using prepackage approach
  console.log('Building unpacked app...');
  execSync('npx electron-builder --win --publish never --dir', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });

  // Now build the exe with date suffix
  console.log('Building exe with date suffix...');
  execSync('npx electron-builder --win --publish never --prepackaged release/build/win-unpacked', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  
  console.log('Build completed!');
} finally {
  // Restore original electron-builder.yml
  fs.writeFileSync(ymlPath, originalYml);
  console.log('Restored electron-builder.yml');
}
