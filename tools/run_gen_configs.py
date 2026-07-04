#!/usr/bin/env python3
"""运行 JS 配置生成器（需 Node）；若无 Node 则生成 class-config v2"""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(ROOT, 'config')

def find_node():
    for p in [
        r'C:\Program Files\nodejs\node.exe',
        r'C:\Program Files (x86)\nodejs\node.exe',
        'node'
    ]:
        try:
            r = subprocess.run([p, '--version'], capture_output=True, text=True, timeout=5)
            if r.returncode == 0:
                return p
        except Exception:
            pass
    return None

def run_js(script):
    node = find_node()
    if not node:
        return False
    r = subprocess.run([node, script], cwd=ROOT, capture_output=True, text=True)
    print(r.stdout, end='')
    if r.stderr:
        print(r.stderr, file=sys.stderr)
    return r.returncode == 0

if __name__ == '__main__':
    ok = run_js(os.path.join('tools', 'gen-class-config.js'))
    ok = run_js(os.path.join('tools', 'gen-skill-config.js')) and ok
    if not ok:
        print('Node 不可用，请安装 Node.js 后运行: node tools/gen-class-config.js && node tools/gen-skill-config.js')
        sys.exit(1)
    print('Config generation complete.')
