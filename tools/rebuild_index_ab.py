#!/usr/bin/env python3
"""从 git 版 index.html 按行抽取，生成自走棋精简版。"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'index.html')

KEEP_SCRIPTS = [
    'js/lz-string.min.js', 'js/pe-security.js', 'js/config-loader.js',
    'js/pe-env.generated.js', 'js/config.js', 'js/pe-local-dev-server.js',
    'js/config-helpers.js', 'js/trait-id-helpers.js', 'js/class-system.js',
    'js/warrior-passive.js', 'js/class-passive-system.js',
    'js/ranger-pet-system.js', 'js/beastmaster-system.js',
    'js/marksman-precision-system.js', 'js/deadeye-system.js',
    'js/phantom-clone-system.js', 'js/windrunner-system.js',
    'js/mage-element-phase-system.js', 'js/mage-surge-system.js',
    'js/wizard-element-system.js', 'js/wizard-skills-system.js',
    'js/archmage-skills-system.js', 'js/sage-chronos-system.js',
    'js/warlock-soul-system.js', 'js/assassin-shadow-system.js',
    'js/assassin-skills-system.js', 'js/combat-status-system.js',
    'js/skill-entity-system.js', 'js/keybind-system.js', 'js/skill-system.js',
    'js/static-art-paths.js', 'js/static-art-processor.js', 'js/static-art-preloader.js',
    'js/data-classes.js',
    'js/combat-effects-bridge.js', 'js/ascension-hub.js',
    'js/juice-core.js', 'js/juice-vfx.js', 'js/combat-pacing.js',
    'js/commander-mode.js', 'js/commander-abilities.js', 'js/boss-phase-system.js',
    'js/synergy-matrix.js', 'js/synergy-vfx.js', 'js/zone-ecology.js',
    'js/curse-system.js', 'js/demon-pact.js', 'js/pre-combat-intel.js',
    'js/run-analytics.js', 'js/death-narrative.js', 'js/event-chain-system.js',
    'js/mutated-node-system.js', 'js/weather-system.js', 'js/bond-system.js',
    'js/party-meta-system.js', 'js/relic-system.js', 'js/skill-mutation-system.js',
    'js/run-state-system.js', 'js/tower-run-map.js', 'js/enemy-composition-system.js',
    'js/auto-battle-simulator.js', 'js/auto-battler-assets.js', 'js/auto-battler-scene-bg.js',
    'js/auto-battler-events.js', 'js/auto-battler-controller.js', 'js/auto-battler-ui.js',
    'js/auto-battler-skill-vfx-lab.js', 'js/game-entities.js',
    'js/game-utils.js', 'js/sprite-animation.js', 'js/game-assets.js',
    'js/game-particles.js', 'js/game-sounds.js', 'js/game-main.js',
    'js/game-stubs.js', 'js/game-ab-core.js', 'js/game-dev-slim.js',
    'js/game-init-ab.js', 'js/game-save-module.js', 'js/game-vfx-lab.js',
    'js/init.js',
]

DEV_PANEL = '''
        <!-- 开发者模式面板（自走棋） -->
        <div id="dev-panel">
            <h3>开发者模式 (F1)</h3>
            <p id="dev-action-feedback" style="color: #ffaa66; font-size: 11px; margin: 0 0 8px; min-height: 14px; line-height: 1.3;"></p>
            <div class="dev-section">
                <h4 style="color: #8cf; font-size: 14px; margin-bottom: 5px;">自走棋</h4>
                <button type="button" class="pe-btn pe-btn--sm" onclick="game.enterAbSkillVfxLab()">自走棋技能特效场</button>
            </div>
            <div class="dev-section">
                <h4 style="color: #fff; font-size: 14px; margin-bottom: 5px;">调试信息</h4>
                <div id="dev-info" style="color: #aaa; font-size: 11px; line-height: 1.4;">
                    <p>当前层数: <span id="dev-floor">1</span></p>
                    <p>房间类型: <span id="dev-room-type">-</span></p>
                    <p>FPS: <span id="dev-fps">0</span></p>
                    <p>TPS: <span id="dev-tps">0</span></p>
                    <p>mspt: <span id="dev-mspt">0.00</span></p>
                </div>
            </div>
        </div>
'''

LOADING_ERROR = '''
                <div id="loading-error-panel" style="display:none; margin-top:20px; padding:16px; background:rgba(180,40,40,0.25); border:1px solid #ff6666; border-radius:8px; max-width:520px; text-align:left;">
                    <div id="loading-error-title" style="color:#ff8888; font-weight:bold; margin-bottom:8px;">加载失败</div>
                    <div id="loading-error-message" style="color:#ddd; font-size:14px; line-height:1.5; white-space:pre-wrap;"></div>
                    <button id="loading-retry-btn" type="button" class="pe-btn pe-btn--primary" style="margin-top:12px;">重试</button>
                </div>
'''


def slice_lines(lines, start, end):
    """1-based inclusive line range."""
    return lines[start - 1:end]


def main():
    with open(SRC, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    out = []
    # head: add CSP to line 6 area
    head = slice_lines(lines, 1, 9)
    head[4] = '    <meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; media-src \'self\' blob:; connect-src \'self\'; object-src \'none\'; base-uri \'self\'; frame-ancestors \'none\'">\n'
    out.extend(head)
    out.extend(slice_lines(lines, 10, 28))
    # inject loading error panel before closing loading-progress-container
    out.append(LOADING_ERROR)
    out.extend(slice_lines(lines, 29, 151))
    out.extend(slice_lines(lines, 586, 611))
    out.append(DEV_PANEL)
    out.extend(slice_lines(lines, 1227, 1267))
    out.append('    </div>\n')
    out.extend(slice_lines(lines, 1295, 1349))
    out.append('    <!-- 引入JavaScript模块（自走棋） -->\n')
    out.append('    <script>window.__PE_SECRETS__ = window.__PE_SECRETS__ || {};</script>\n')
    for s in KEEP_SCRIPTS:
        out.append(f'    <script src="{s}"></script>\n')
    out.extend(slice_lines(lines, 1548, len(lines)))

    with open(SRC, 'w', encoding='utf-8') as f:
        f.writelines(out)
    print('Rebuilt index.html for auto-battler-only')


if __name__ == '__main__':
    main()
