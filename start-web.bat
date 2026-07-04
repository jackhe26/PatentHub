@echo off
chcp 65001 >nul 2>&1
title PatentHub Web Server

echo.
echo ================================================
echo    PatentHub Web 服务器启动中...
echo ================================================
echo.
echo 局域网访问地址：http://localhost:1212/
echo 或 http://你的电脑IP:1212/
echo.
echo 提示：查看本机 IP，运行 ipconfig
echo.
echo 按 Ctrl+C 停止服务器
echo ================================================
echo.

cd /d "%~dp0"

:: 检查是否已构建
if not exist "release\app\dist\renderer\index.html" (
    echo [警告] 未检测到构建产物
    echo 正在构建生产版本...
    call pnpm run build:web
    if errorlevel 1 (
        echo [错误] 构建失败！
        pause
        exit /b 1
    )
)

:: 启动服务器
npx serve ./release/app/dist/renderer -l tcp://0.0.0.0:1212

pause