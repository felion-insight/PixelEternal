#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pixel Eternal - 本地开发服务器
用于在本地运行游戏，避免 CORS 问题
"""

import http.server
import socket
import socketserver
import webbrowser
import os
from pathlib import Path

# 本地开发：绑定 127.0.0.1 可避免 Windows 上 "" 双栈绑定触发 WinError 10013
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8000
FALLBACK_PORTS = (8765, 5500, 8081, 3000, 9000)
DIRECTORY = Path(__file__).parent

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)
    
    def end_headers(self):
        # 添加 CORS 头，允许跨域请求
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        # 本地开发：避免浏览器强缓存，确保修改后刷新即可生效
        if self.path.endswith('.html') or self.path.endswith('.js') or self.path.endswith('.json'):
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

def _pick_port(host: str, preferred: int) -> int:
    """若首选端口无法绑定（被保留/占用），依次尝试备用端口。"""
    candidates = [preferred]
    for p in FALLBACK_PORTS:
        if p not in candidates:
            candidates.append(p)
    for p in range(preferred + 1, preferred + 32):
        if p not in candidates:
            candidates.append(p)
    for port in candidates:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((host, port))
            except OSError:
                continue
        return port
    raise RuntimeError(f"无法在 {host} 上找到可用端口（已尝试 {len(candidates)} 个候选）")


def main():
    os.chdir(DIRECTORY)

    host = os.environ.get("PE_SERVER_HOST", DEFAULT_HOST).strip() or DEFAULT_HOST
    preferred = int(os.environ.get("PORT", str(DEFAULT_PORT)))
    port = _pick_port(host, preferred)
    if port != preferred:
        print(f"端口 {preferred} 不可用，已改用 {port}")

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer((host, port), MyHTTPRequestHandler) as httpd:
        url = f"http://{host}:{port}/index.html"
        print(f"服务器已启动在 http://{host}:{port}")
        print(f"游戏地址: {url}")
        print("按 Ctrl+C 停止服务器")
        
        # 自动打开浏览器
        try:
            webbrowser.open(url)
        except:
            print(f"无法自动打开浏览器，请手动访问: {url}")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n服务器已停止")

if __name__ == "__main__":
    main()

