#!/bin/bash

# ================================================
#    PatentHub 开机自启动配置脚本 (Mac/Linux)
# ================================================

PLIST_PATH="$HOME/Library/LaunchAgents/com.patenthub.web.plist"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}   PatentHub 开机自启动配置${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "选项："
echo "  1 - 启用开机自启动"
echo "  2 - 禁用开机自启动"
echo "  3 - 查看当前状态"
echo ""
read -p "请选择 (1/2/3): " choice
echo ""

case $choice in
    1)
        echo -e "${YELLOW}正在启用开机自启动...${NC}"
        
        # 创建 LaunchAgents 目录
        mkdir -p "$HOME/Library/LaunchAgents"
        
        # 创建 plist 文件
        cat > "$PLIST_PATH" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.patenthub.web</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>REPLACE_SCRIPT_DIR/start-web.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>/tmp/patenthub-web.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/patenthub-web-error.log</string>
</dict>
</plist>
EOF
        
        # 替换脚本路径
        sed -i '' "s|REPLACE_SCRIPT_DIR|$SCRIPT_DIR|g" "$PLIST_PATH"
        
        # 加载服务
        launchctl load "$PLIST_PATH"
        
        if [ $? -eq 0 ]; then
            echo ""
            echo -e "${GREEN}[成功] 开机自启动已启用！${NC}"
            echo ""
            echo "每次开机时，PatentHub Web 服务器将自动启动"
            echo "同事可以直接访问 http://你的电脑IP:1212/"
        else
            echo ""
            echo -e "${RED}[错误] 配置失败！${NC}"
        fi
        ;;
    2)
        echo -e "${YELLOW}正在禁用开机自启动...${NC}"
        
        launchctl unload "$PLIST_PATH" 2>/dev/null
        rm -f "$PLIST_PATH"
        
        echo ""
        echo -e "${GREEN}[成功] 开机自启动已禁用！${NC}"
        ;;
    3)
        echo -e "${YELLOW}查看当前状态...${NC}"
        echo ""
        if [ -f "$PLIST_PATH" ]; then
            echo -e "${GREEN}[已配置] 开机自启动已启用${NC}"
            echo ""
            echo "配置文件: $PLIST_PATH"
            echo ""
            echo "服务状态:"
            launchctl list | grep patenthub || echo "  服务未运行"
        else
            echo -e "${YELLOW}[未配置] 开机自启动未启用${NC}"
        fi
        ;;
    *)
        echo ""
        echo -e "${RED}无效的选择${NC}"
        ;;
esac

echo ""