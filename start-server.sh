#!/bin/bash
# Pixel Eternal - 本地开发服务器启动脚本

PORT=8000
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

cd "$DIR"

echo "使用 start-server.py 启动（含开发者模式标志与无强缓存头）..."
echo "游戏地址: http://127.0.0.1:${PORT:-8000}/index.html（端口以实际输出为准）"
echo "按 Ctrl+C 停止服务器"
echo ""

export PORT="${PORT:-8000}"
if command -v python3 &> /dev/null; then
    exec python3 "$DIR/start-server.py"
elif command -v python &> /dev/null; then
    exec python "$DIR/start-server.py"
else
    echo "错误: 未找到 Python，请安装 Python 3"
    exit 1
fi

