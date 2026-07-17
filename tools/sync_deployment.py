#!/usr/bin/env python3
"""同步根目录 config/js 到 deployment/"""
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SYNC_FILES = [
    'config/game-config.json',
    'config/base-types.json',
    'config/affix-pool.json',
    'config/legendary-powers.json',
    'config/set-config-v2.json',
    'config/weapon-affinity-config.json',
    'config/skill-config.json',
    'config/skill-entity-config.json',
    'config/skill-primary-effects.json',
    'config/status-synergy-config.json',
    'config/skill-combo-config.json',
    'config/class-build-equipment.json',
    'config/class-build-passives.json',
    'config/class-config.json',
    'js/skill-entity-system.js',
    'js/config.js',
    'js/config-helpers.js',
    'js/combat-status-system.js',
    'js/break-gauge-system.js',
    'js/skill-system.js',
    'js/class-build-system.js',
    'js/class-ui.js',
    'js/class-skill-effects.js',
    'js/ranger-pet-system.js',
    'js/marksman-precision-system.js',
    'js/wizard-element-system.js',
    'js/sage-chronos-system.js',
    'js/warlock-soul-system.js',
    'js/assassin-shadow-system.js',
    'js/assassin-skills-system.js',
    'js/destroy-mark-system.js',
    'js/beastmaster-system.js',
    'js/deadeye-system.js',
    'js/phantom-clone-system.js',
    'js/config-loader.js',
    'js/data-classes.js',
    'js/equipment-weapon-skills.js',
    'js/weapon-refinement-system.js',
    'js/weapon-refinement-resonance.js',
    'js/equipment-set-vfx.js',
    'js/equipment-power-vfx.js',
    'js/equipment-generator.js',
    'js/equipment-effect-system.js',
    'js/equipment-codex.js',
    'js/equipment-lab-scene.js',
    'js/equipment-lab-catalog.js',
    'js/equipment-lab-metrics.js',
    'js/equipment-lab-controller.js',
    'js/equipment-lab-ui.js',
    'js/skill-lab-ui.js',
    'js/automated-balance-tester.js',
    'js/game-entities.js',
    'js/game-main.js',
    'js/game-tooltips.js',
    'index.html',
    'styles.css',
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
