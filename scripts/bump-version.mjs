#!/usr/bin/env node
/**
 * PatentHub 一键版本升级脚本
 *
 * 用法:
 *   node scripts/bump-version.mjs <new-version> [options]
 *
 * 示例:
 *   node scripts/bump-version.mjs 1.2.9
 *   node scripts/bump-version.mjs 1.2.9 --build           # 升级 + 重新打包
 *   node scripts/bump-version.mjs 1.2.9 --skip-lockfile    # 跳过 lockfile 修改
 *   node scripts/bump-version.mjs patch                    # 自动 +0.0.1 (1.2.8 → 1.2.9)
 *   node scripts/bump-version.mjs minor                    # 自动 +0.1.0 (1.2.8 → 1.3.0)
 *   node scripts/bump-version.mjs major                    # 自动 +1.0.0 (1.2.8 → 2.0.0)
 *
 * 功能:
 *   1. 修改 package.json 版本号
 *   2. 修改 release/app/package.json 版本号
 *   3. 修改 release/app/package-lock.json 顶层 version
 *   4. 修改 README.md badge + 8 处下载链接
 *   5. 在 3 个 changelog 文件顶部插入新版本占位条目
 *   6. 在 README.md 更新日志添加新版本条目
 *   7. (可选) 执行 pnpm install + pnpm run build + pnpm run package
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

// ===== 颜色输出（自动检测终端是否支持 ANSI）=====
const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR &&
  (process.platform !== 'win32' ||
   process.env.TERM?.includes('xterm') ||
   // Windows 10+ 的 PowerShell/Windows Terminal 支持 ANSI
   Number(process.env.WT_SESSION) > 0 ||
   process.env.COLORTERM)

const c = supportsColor
  ? {
      reset: '\x1b[0m',
      green: '\x1b[32m',
      red: '\x1b[31m',
      yellow: '\x1b[33m',
      cyan: '\x1b[36m',
      gray: '\x1b[90m',
      bold: '\x1b[1m',
    }
  : {
      reset: '',
      green: '',
      red: '',
      yellow: '',
      cyan: '',
      gray: '',
      bold: '',
    }

const ok = (msg) => console.log(`${c.green}\u2713${c.reset} ${msg}`)
const warn = (msg) => console.log(`${c.yellow}\u26a0${c.reset} ${msg}`)
const err = (msg) => console.log(`${c.red}\u2717${c.reset} ${msg}`)
const info = (msg) => console.log(`${c.cyan}\u2139${c.reset} ${msg}`)
const dim = (msg) => console.log(`${c.gray}  ${msg}${c.reset}`)

// ===== 解析参数 =====
const args = process.argv.slice(2)
let newVersion = args.find((a) => !a.startsWith('--'))
const options = {
  build: args.includes('--build'),
  skipLockfile: args.includes('--skip-lockfile'),
  skipChangelog: args.includes('--skip-changelog'),
  skipReadme: args.includes('--skip-readme'),
  dryRun: args.includes('--dry-run'),
  yes: args.includes('--yes') || args.includes('-y'),
}

// ===== 自动递增版本号 =====
function bumpVersion(currentVer, type) {
  const [major, minor, patch] = currentVer.split('.').map(Number)
  if (type === 'major') return `${major + 1}.0.0`
  if (type === 'minor') return `${major}.${minor + 1}.0`
  if (type === 'patch') return `${major}.${minor}.${patch + 1}`
  return null
}

// ===== 校验版本号 =====
function validateVersion(v) {
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/.test(v)
}

// ===== 读取当前版本 =====
function readCurrentVersion() {
  const pkgPath = path.join(ROOT, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  return pkg.version
}

// ===== 修改 package.json =====
function updatePackageJson(newVer) {
  const pkgPath = path.join(ROOT, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const oldVer = pkg.version
  pkg.version = newVer
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  ok(`package.json: ${oldVer} \u2192 ${newVer}`)
  return oldVer
}

// ===== 修改 release/app/package.json =====
function updateReleaseAppPackageJson(newVer) {
  const pkgPath = path.join(ROOT, 'release/app/package.json')
  if (!existsSync(pkgPath)) {
    warn('release/app/package.json 不存在, 跳过')
    return
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const oldVer = pkg.version
  pkg.version = newVer
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  ok(`release/app/package.json: ${oldVer} \u2192 ${newVer}`)
}

// ===== 修改 release/app/package-lock.json 顶层 version =====
function updateLockfile(newVer) {
  if (options.skipLockfile) {
    warn('跳过 lockfile (--skip-lockfile)')
    return
  }
  const lockPath = path.join(ROOT, 'release/app/package-lock.json')
  if (!existsSync(lockPath)) {
    warn('release/app/package-lock.json 不存在, 跳过')
    return
  }

  let content = readFileSync(lockPath, 'utf8')
  let count = 0

  // 仅修改顶层 version（packages[""].version）和第二个顶层 version 字段
  // 不修改嵌套依赖项的 version（如 "minimist": "1.2.6"）
  // 策略：只匹配出现在 "name": "patent-hub" 之后的第一个 version
  content = content.replace(
    /(\{\s*\n\s*"name":\s*"patent-hub",\s*\n\s*"version":\s*)"[\d.]+"/,
    (_, prefix) => `${prefix}"${newVer}"`
  )
  count++

  // packages[""] 块内的 version
  content = content.replace(
    /("":\s*\{\s*\n\s*"name":\s*"patent-hub",\s*\n\s*"version":\s*)"[\d.]+"/,
    (_, prefix) => `${prefix}"${newVer}"`
  )

  writeFileSync(lockPath, content, 'utf8')
  ok(`release/app/package-lock.json: 顶层 version \u2192 ${newVer}`)
  dim('  (只修改项目自身 version，未触碰 minimist 等依赖项)')
}

// ===== 修改 README.md =====
function updateReadme(newVer) {
  if (options.skipReadme) {
    warn('跳过 README.md (--skip-readme)')
    return
  }
  const readmePath = path.join(ROOT, 'README.md')
  if (!existsSync(readmePath)) {
    warn('README.md 不存在, 跳过')
    return
  }

  let content = readFileSync(readmePath, 'utf8')

  // 1. badge: Version-1.2.x
  content = content.replace(
    /Version-\d+\.\d+\.\d+/g,
    `Version-${newVer}`
  )

  // 2. 下载链接: PatentHub-1.2.x-*.exe/dmg/AppImage/deb
  content = content.replace(
    /PatentHub-\d+\.\d+\.\d+/g,
    `PatentHub-${newVer}`
  )

  // 3. 在 "## 更新日志" 区块顶部插入新版本条目
  const today = new Date().toISOString().slice(0, 10)
  const newChangelogEntry = `### v${newVer} (${today})

- \u2728 TODO: 填写本次版本变更说明（手动编辑）
- \ud83d\udc1b TODO: 列出 bug 修复条目

`

  // 检查是否已有 v{newVer} 条目
  if (content.includes(`### v${newVer}`)) {
    warn(`README.md 已存在 v${newVer} 条目, 跳过插入`)
  } else {
    // 在 "## 更新日志" 之后、"### v" 之前插入
    content = content.replace(
      /(## 更新日志\s*\n+)(### v)/,
      `$1${newChangelogEntry}$2`
    )
    ok(`README.md: badge + 8 处下载链接 + 更新日志已更新`)
  }

  writeFileSync(readmePath, content, 'utf8')
}

// ===== 修改 changelog 文件 =====
function updateChangelogs(newVer) {
  if (options.skipChangelog) {
    warn('跳过 changelog 文件 (--skip-changelog)')
    return
  }
  const changelogDir = path.join(ROOT, 'src/renderer/i18n/changelogs')
  if (!existsSync(changelogDir)) {
    warn(`changelog 目录不存在: ${changelogDir}`)
    return
  }

  const files = [
    { name: 'changelog_zh_Hans.ts', template: '1. 修复 xxx\n2. 新增 xxx\n3. 优化 xxx' },
    { name: 'changelog_zh_Hant.ts', template: '1. 修復 xxx\n2. 新增 xxx\n3. 優化 xxx' },
    { name: 'changelog_en.ts', template: '1. Fixed xxx\n2. Added xxx\n3. Improved xxx' },
  ]

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '.')

  files.forEach(({ name, template }) => {
    const filePath = path.join(changelogDir, name)
    if (!existsSync(filePath)) return

    let content = readFileSync(filePath, 'utf8')

    // 检查是否已有该版本。
    // 注意：changelog 文件里保留了上游 Chatbox 的历史条目，其标题格式为三级标题
    // `### vX.Y.Z`（例如 `### v1.4.0 - 2024.08.18`），而本脚本插入的是二级标题
    // `## vX.Y.Z`。因此必须用行首锚定 + `## ` 前缀严格匹配，否则历史同名版本会导致
    // 误判「已存在」而静默跳过插入。
    const verRegex = new RegExp(`^## v${newVer.replace(/\./g, '\\.')}\\b`, 'm')
    if (verRegex.test(content)) {
      warn(`${name} 已存在 v${newVer} 条目, 跳过`)
      return
    }

    const newEntry = `## v${newVer} - ${today}
1. ${template.split('\n')[0]}
2. ${template.split('\n')[1]}
3. ${template.split('\n')[2]}

`

    // 在 const changelog = `\n 后、第一个 ## 之前插入
    content = content.replace(
      /(const changelog = `\n)(## v)/,
      `$1${newEntry}$2`
    )

    writeFileSync(filePath, content, 'utf8')
    ok(`${name}: 已插入 v${newVer} 占位条目`)
  })
}

// ===== 执行 build + package =====
async function runBuildAndPackage() {
  info('开始执行 pnpm install + build + package...')

  try {
    info('[1/3] pnpm install ...')
    execSync('pnpm install --prefer-offline', { stdio: 'inherit', cwd: ROOT })
    ok('pnpm install 完成')

    info('[2/3] pnpm run build ...')
    execSync('pnpm run build', { stdio: 'inherit', cwd: ROOT })
    ok('pnpm run build 完成')

    info('[3/3] pnpm run package ...')
    execSync('pnpm run package', { stdio: 'inherit', cwd: ROOT })
    ok('pnpm run package 完成')
  } catch (e) {
    err('打包失败:')
    console.error(e.message)
    process.exit(1)
  }
}

// ===== 主函数 =====
async function main() {
  console.log('')
  console.log(`${c.bold}\ud83d\ude80 PatentHub 一键版本升级脚本${c.reset}`)
  console.log(`${c.gray}${'='.repeat(40)}${c.reset}`)

  if (!newVersion) {
    err('请提供新版本号或递增类型:')
    console.log('')
    console.log(`  ${c.cyan}node scripts/bump-version.mjs 1.2.9${c.reset}`)
    console.log(`  ${c.cyan}node scripts/bump-version.mjs patch${c.reset}    # 1.2.8 \u2192 1.2.9`)
    console.log(`  ${c.cyan}node scripts/bump-version.mjs minor${c.reset}    # 1.2.8 \u2192 1.3.0`)
    console.log(`  ${c.cyan}node scripts/bump-version.mjs major${c.reset}    # 1.2.8 \u2192 2.0.0`)
    console.log(`  ${c.cyan}node scripts/bump-version.mjs 1.2.9 --build${c.reset}    # 自动 build + package`)
    console.log('')
    process.exit(1)
  }

  const currentVer = readCurrentVersion()

  // 处理 patch/minor/major 关键字
  if (['patch', 'minor', 'major'].includes(newVersion)) {
    const bumped = bumpVersion(currentVer, newVersion)
    if (!bumped) {
      err(`无法识别递增类型: ${newVersion}`)
      process.exit(1)
    }
    info(`自动递增: ${currentVer} \u2192 ${bumped} (${newVersion})`)
    newVersion = bumped
  }

  // 校验版本号格式
  if (!validateVersion(newVersion)) {
    err(`版本号格式无效: "${newVersion}"`)
    console.log(`  正确格式示例: 1.2.9, 1.2.9-beta.1, 2.0.0`)
    process.exit(1)
  }

  if (newVersion === currentVer) {
    warn(`新版本号与当前版本号相同 (${currentVer})`)
    if (!options.yes) {
      const { default: rl } = await import('node:readline')
      const r = rl.createInterface({ input: process.stdin, output: process.stdout })
      const ans = await new Promise((resolve) => r.question('  是否继续? (y/N) ', resolve))
      r.close()
      if (!/^y(es)?$/i.test(ans)) {
        info('已取消')
        process.exit(0)
      }
    }
  }

  console.log('')
  info(`目标版本: ${currentVer} \u2192 ${newVersion}`)
  if (options.dryRun) warn('--dry-run 模式：只打印，不修改')
  console.log('')

  if (options.dryRun) {
    info('将执行以下修改:')
    dim('  - package.json version')
    if (!options.skipLockfile) dim('  - release/app/package.json + package-lock.json')
    if (!options.skipReadme) dim('  - README.md (badge + 下载链接 + 更新日志)')
    if (!options.skipChangelog) dim('  - 3 个 changelog 文件 (顶部插入)')
    if (options.build) dim('  - pnpm install + build + package')
    console.log('')
    ok('完成 (dry run)')
    return
  }

  // 执行修改
  updatePackageJson(newVersion)
  updateReleaseAppPackageJson(newVersion)
  updateLockfile(newVersion)
  updateReadme(newVersion)
  updateChangelogs(newVersion)

  console.log('')
  ok(`${c.bold}所有版本号已同步更新到 ${newVersion}${c.reset}`)
  console.log('')
  info('下一步:')
  dim('  1. 编辑 README.md / changelog_*.ts 中的 TODO 占位条目，写入真实变更内容')
  dim('  2. git diff 检查改动')
  dim('  3. git add -A && git commit -m "chore: Release v' + newVersion + '"')

  // 可选：自动打包
  if (options.build) {
    console.log('')
    await runBuildAndPackage()
    console.log('')
    ok(`${c.bold}打包完成！产物在 release/build/ 目录${c.reset}`)
  } else {
    console.log('')
    dim('  提示: 添加 --build 参数可自动执行 pnpm install + build + package')
    dim(`       node scripts/bump-version.mjs ${newVersion} --build`)
  }
  console.log('')
}

main().catch((e) => {
  err(e.message)
  console.error(e)
  process.exit(1)
})