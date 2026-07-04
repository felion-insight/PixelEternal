#!/usr/bin/env python3
"""同步根目录 config/js 到 deployment/"""
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SYNC_FILES = [
    'config/skill-config.json',
    'config/skill-entity-config.json',
    'config/skill-primary-effects.json',
    'config/status-synergy-config.json',
    'config/skill-combo-config.json',
    'config/class-build-equipment.json',
    'config/class-build-passives.json',
    'config/class-config.json',
    'js/skill-entity-system.js',
    'js/combat-status-system.js',
    'js/break-gauge-system.js',
    'js/skill-system.js',
    'js/class-build-system.js',
    'js/class-skill-effects.js',
    'js/config-loader.js',
    'js/game-entities.js',
    'js/game-main.js',
    'index.html',
]

def main():
    copied = 0
    for rel in SYNC_FILES:
        src = os.path.join(ROOT, rel)
        dst = os.path.join(ROOT, 'deployment', rel)
        if not os.path.isfile(src):
            print('SKIP (missing):', rel)
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        copied += 1
        print('OK:', rel)
    print(f'Done: {copied} files synced to deployment/')

if __name__ == '__main__':
    main()
