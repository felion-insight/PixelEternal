#!/usr/bin/env python3
"""检查 index.html 引用的脚本是否均可通过 HTTP 访问。"""
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8000/'

html = urllib.request.urlopen(BASE + 'index.html').read().decode('utf-8')
scripts = re.findall(r'<script src="([^"]+)"', html)
missing = []
for s in scripts:
    url = BASE + s
    try:
        with urllib.request.urlopen(url) as r:
            if r.status != 200:
                missing.append((s, r.status))
    except Exception as e:
        missing.append((s, str(e)))

print(f'scripts: {len(scripts)}, missing: {len(missing)}')
for item in missing:
    print('MISSING', item)
sys.exit(1 if missing else 0)
