#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pixel Eternal - 本地开发服务器
用于在本地运行游戏，避免 CORS 问题
"""

import http.server
import socketserver
import webbrowser
import os
from pathlib import Path

PORT = 8000
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

def main():
    os.chdir(DIRECTORY)
    
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        url = f"http://localhost:{PORT}/index.html"
        print(f"服务器已启动在 http://localhost:{PORT}")
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

