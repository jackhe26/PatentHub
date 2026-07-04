@echo off
chcp 65001 >nul 2>&1
title PatentHub 开机自启动配置

echo.
echo ================================================
echo    PatentHub 开机自启动配置
echo ================================================
echo.

:: 获取脚本所在目录
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

:: 获取管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [错误] 需要管理员权限！
    echo 请右键点击 "以管理员身份运行"
    pause
    exit /b 1
)

echo 选项：
echo   1 - 启用开机自启动
echo   2 - 禁用开机自启动
echo   3 - 查看当前状态
echo.
set /p choice=请选择 (1/2/3):

if "%choice%"=="1" (
    echo.
    echo 正在启用开机自启动...
    
    :: 创建任务计划
    schtasks /create /tn "PatentHub Web Server" /tr "\"%SCRIPT_DIR%\start-web.bat\"" /sc onlogon /rl limited /f
    
    if %errorLevel% equ 0 (
        echo.
        echo [成功] 开机自启动已启用！
        echo.
        echo 每次开机时，PatentHub Web 服务器将自动启动
        echo 同事可以直接访问 http://你的电脑IP:1212/
    ) else (
        echo.
        echo [错误] 配置失败！
    )
) else if "%choice%"=="2" (
    echo.
    echo 正在禁用开机自启动...
    
    schtasks /delete /tn "PatentHub Web Server" /f
    
    if %errorLevel% equ 0 (
        echo.
        echo [成功] 开机自启动已禁用！
    ) else (
        echo.
        echo [信息] 未找到配置的任务计划
    )
) else if "%choice%"=="3" (
    echo.
    echo 查看当前状态...
    schtasks /query /tn "PatentHub Web Server" 2>nul
    if %errorLevel% neq 0 (
        echo.
        echo [信息] 未配置开机自启动
    )
) else (
    echo.
    echo 无效的选择
)

echo.
pause