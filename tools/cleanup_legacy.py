#!/usr/bin/env python3
"""将旧版 ARPG 模块移入 archive/legacy/js/（不修改 index.html，请用 rebuild_index_ab.py）。"""
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARCHIVE_JS = os.path.join(ROOT, 'archive', 'legacy', 'js')

LEGACY_JS = [
    'skill-lab-scene.js', 'skill-lab-ui.js', 'skill-lab-metrics.js',
    'anim-preview-scene.js', 'anim-preview-ui.js',
    'equipment-lab-scene.js', 'equipment-lab-catalog.js', 'equipment-lab-metrics.js',
    'equipment-lab-controller.js', 'equipment-lab-ui.js',
    'automated-balance-tester.js',
    'npc-system.js', 'npc-ui.js',
    'trial-system.js', 'material-system.js',
    'dungeon-system.js', 'dungeon-scene.js', 'dungeon-ui.js',
    'talent-system.js', 'tutorial-system.js', 'tutorial-ui.js',
    'tower-map-system.js', 'elite-boons.js',
    'equipment-weapon-skills.js', 'weapon-refinement-system.js', 'weapon-refinement-resonance.js',
    'equipment-generator.js', 'equipment-set-vfx.js', 'equipment-power-vfx.js',
    'equipment-effect-system.js', 'equipment-codex.js',
    'class-ui.js', 'monster-codex-mechanics.js',
    'destroy-mark-system.js', 'break-gauge-system.js',
    'class-build-system.js', 'class-skill-effects.js', 'class-skill-vfx.js',
    'assassin-skill-vfx.js', 'warlock-skill-vfx.js', 'mage-skill-vfx.js',
]


def main():
    os.makedirs(ARCHIVE_JS, exist_ok=True)
    moved = 0
    for name in LEGACY_JS:
        src = os.path.join(ROOT, 'js', name)
        if os.path.isfile(src):
            shutil.move(src, os.path.join(ARCHIVE_JS, name))
            moved += 1
    print(f'Moved {moved} files to archive/legacy/js/')


if __name__ == '__main__':
    main()
