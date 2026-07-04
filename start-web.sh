#!/bin/bash

# ================================================
#    PatentHub Web 服务器启动脚本
# ================================================

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}   PatentHub Web 服务器启动中...${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""

# 检查是否已构建
if [ ! -f "release/app/dist/renderer/index.html" ]; then
    echo -e "${YELLOW}[警告] 未检测到构建产物${NC}"
    echo -e "${YELLOW}正在构建生产版本...${NC}"
    pnpm run build:web
    if [ $? -ne 0 ]; then
        echo -e "${RED}[错误] 构建失败！${NC}"
        exit 1
    fi
fi

echo -e "局域网访问地址: ${GREEN}http://localhost:1212/${NC}"
echo "或 http://你的电脑IP:1212/"
echo ""
echo "提示：查看本机 IP，运行: ifconfig | grep 'inet '"
echo ""
echo -e "按 ${YELLOW}Ctrl+C${NC} 停止服务器"
echo -e "${GREEN}================================================${NC}"
echo ""

# 启动服务器
npx serve ./release/app/dist/renderer -l tcp://0.0.0.0:1212