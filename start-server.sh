#!/bin/bash
# Pixel Eternal - 本地开发服务器启动脚本

PORT=8000
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

cd "$DIR"

echo "启动本地服务器在端口 $PORT..."
echo "游戏地址: http://localhost:$PORT/index.html"
echo "按 Ctrl+C 停止服务器"
echo ""

# 检查 Python 是否可用
if command -v python3 &> /dev/null; then
    python3 -m http.server $PORT
elif command -v python &> /dev/null; then
    python -m http.server $PORT
else
    echo "错误: 未找到 Python，请安装 Python 3"
    exit 1
fi

