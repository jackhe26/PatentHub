# PatentHub myOCR 环境检测脚本
# 用法: 右键 -> 用 PowerShell 运行
# 或: powershell -ExecutionPolicy Bypass -File check-ocrmypdf-env.ps1

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PatentHub myOCR 环境检测" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$allOk = $true

# 检测 Python
Write-Host "[1/4] 检测 Python..." -NoNewline
try {
    $pyVersion = python --version 2>&1 | Select-Object -First 1
    if ($LASTEXITCODE -eq 0 -and $pyVersion) {
        Write-Host " $pyVersion ✅" -ForegroundColor Green
    } else {
        Write-Host " 未找到 ❌" -ForegroundColor Red
        Write-Host "   → 请从 https://python.org 安装 Python 3.11+" -ForegroundColor Yellow
        $allOk = $false
    }
} catch {
    Write-Host " 未找到 ❌" -ForegroundColor Red
    Write-Host "   → 请从 https://python.org 安装 Python 3.11+" -ForegroundColor Yellow
    $allOk = $false
}

# 检测 ocrmypdf
Write-Host "[2/4] 检测 OCRmyPDF..." -NoNewline
try {
    $ocrVersion = ocrmypdf --version 2>&1 | Select-Object -First 1
    if ($LASTEXITCODE -eq 0 -and $ocrVersion) {
        Write-Host " $ocrVersion ✅" -ForegroundColor Green
    } else {
        Write-Host " 未找到 ❌" -ForegroundColor Red
        Write-Host "   → 运行: pip install ocrmypdf" -ForegroundColor Yellow
        Write-Host "   → 参考: https://ocrmypdf.readthedocs.io/en/latest/installation.html" -ForegroundColor Yellow
        $allOk = $false
    }
} catch {
    Write-Host " 未找到 ❌" -ForegroundColor Red
    Write-Host "   → 运行: pip install ocrmypdf" -ForegroundColor Yellow
    Write-Host "   → 参考: https://ocrmypdf.readthedocs.io/en/latest/installation.html" -ForegroundColor Yellow
    $allOk = $false
}

# 检测 tesseract
Write-Host "[3/4] 检测 Tesseract OCR..." -NoNewline
$tessFound = $false
$tessVersion = ""
$tessPaths = @(
    "C:\Program Files\Tesseract-OCR\tesseract.exe",
    "C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    (Get-Command tesseract -ErrorAction SilentlyContinue).Source,
    (Get-Command tesseract.exe -ErrorAction SilentlyContinue).Source
)
foreach ($p in $tessPaths) {
    if ($p -and (Test-Path $p)) {
        $tessVersion = & $p --version 2>&1 | Select-Object -First 1
        if ($LASTEXITCODE -eq 0) {
            $tessFound = $true
            break
        }
    }
}
if ($tessFound) {
    Write-Host " $($tessVersion.Split("`n")[0]) ✅" -ForegroundColor Green
    # 额外：列出可用语言
    try {
        $langs = & $p --list-langs 2>&1 | Select-Object -Skip 1
        $langCount = ($langs | Measure-Object).Count
        Write-Host "   已安装语言: $langCount 个" -ForegroundColor Gray
    } catch {}
} else {
    Write-Host " 未找到 ❌" -ForegroundColor Red
    Write-Host "   → Windows: 从 https://github.com/UB-Mannheim/tesseract/wiki 下载安装" -ForegroundColor Yellow
    Write-Host "   → 安装后确保 tesseract.exe 在 PATH 中" -ForegroundColor Yellow
    Write-Host "   → 中文支持: 安装时勾选 chi_sim（简体中文）或 chi_tra（繁体中文）" -ForegroundColor Yellow
    $allOk = $false
}

# 检测 Ghostscript
Write-Host "[4/4] 检测 Ghostscript..." -NoNewline
$gsFound = $false
$gsVersion = ""
$gsPaths = @(
    "C:\Program Files\gs\gs10.03.0\bin\gswin64c.exe",
    "C:\Program Files\gs\gs10.02.0\bin\gswin64c.exe",
    "C:\Program Files\gs\gs9.56.1\bin\gswin64c.exe",
    "C:\Program Files\gs\bin\gswin64c.exe",
    (Get-Command gswin64c -ErrorAction SilentlyContinue).Source,
    (Get-Command gswin32c -ErrorAction SilentlyContinue).Source,
    (Get-Command gs -ErrorAction SilentlyContinue).Source
)
foreach ($p in $gsPaths) {
    if ($p -and (Test-Path $p)) {
        $gsVersion = & $p --version 2>&1 | Select-Object -First 1
        if ($LASTEXITCODE -eq 0) {
            $gsFound = $true
            break
        }
    }
}
if ($gsFound) {
    Write-Host " $($gsVersion.Split("`n")[0]) ✅" -ForegroundColor Green
} else {
    Write-Host " 未找到 ❌" -ForegroundColor Red
    Write-Host "   → Windows: 从 https://ghostscript.com/download/gsdn.html 下载" -ForegroundColor Yellow
    Write-Host "   → 安装后确保 gswin64c.exe 在 PATH 中" -ForegroundColor Yellow
    $allOk = $false
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($allOk) {
    Write-Host "  所有依赖已就绪，可以开始使用 myOCR！" -ForegroundColor Green
} else {
    Write-Host "  部分依赖缺失，请先安装缺失项后再试" -ForegroundColor Yellow
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "快捷安装命令:" -ForegroundColor White
Write-Host "  pip install ocrmypdf" -ForegroundColor Gray
Write-Host ""
