@echo off
chcp 65001 >nul 2>&1
title PatentHub 防火墙配置

echo.
echo ================================================
echo    PatentHub 防火墙配置
echo ================================================
echo.
echo 此脚本将开放端口 1212 以允许局域网访问
echo.

:: 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [错误] 需要管理员权限！
    echo 请右键点击 "以管理员身份运行"
    echo.
    pause
    exit /b 1
)

echo 正在配置防火墙...
echo.

:: 检查规则是否已存在
netsh advfirewall firewall show rule name="PatentHub Web 1212" >nul 2>&1
if %errorLevel% equ 0 (
    echo [信息] 防火墙规则已存在
    echo.
    echo 要删除旧规则并重新创建吗？(Y/N)
    set /p choice=
    if /i "%choice%"=="Y" (
        echo 删除旧规则...
        netsh advfirewall firewall delete rule name="PatentHub Web 1212"
    ) else (
        echo 跳过配置
        pause
        exit /b 0
    )
)

:: 创建入站规则
echo 创建入站规则...
netsh advfirewall firewall add rule ^
    name="PatentHub Web 1212" ^
    dir=in ^
    action=allow ^
    protocol=TCP ^
    localport=1212 ^
    program="%SystemRoot%\System32\node.exe" ^
    description="PatentHub Web 服务器 - 允许局域网访问"

if %errorLevel% equ 0 (
    echo.
    echo [成功] 防火墙配置完成！
    echo.
    echo 现在可以启动服务器：
    echo   双击运行 start-web.bat
    echo.
    echo 同事访问地址：
    echo   http://你的电脑IP:1212/
    echo.
    echo 查看本机 IP：ipconfig
) else (
    echo.
    echo [错误] 防火墙配置失败！
)

echo.
pause