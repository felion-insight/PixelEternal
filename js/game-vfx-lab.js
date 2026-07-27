/**
 * 自走棋技能特效试验场（从 game-main.js 拆分）
 */
(function () {
    'use strict';

    function vfxLabSceneType() {
        return (typeof SCENE_TYPES !== 'undefined' && SCENE_TYPES.AB_SKILL_VFX_LAB)
            ? SCENE_TYPES.AB_SKILL_VFX_LAB
            : 'ab_skill_vfx_lab';
    }

    Object.assign(Game.prototype, {
        enterAbSkillVfxLab() {
            if (!window.AutoBattleSimulator || !this.abSkillVfxLabUI) {
                console.error('[AbSkillVfxLab] 模块未加载');
                return;
            }
            if (typeof AbSkillVfxLabScene !== 'undefined' && !this.abSkillVfxLabScene) {
                this.abSkillVfxLabScene = new AbSkillVfxLabScene(this);
            }
            if (!this.abSkillVfxLabScene) {
                console.error('[AbSkillVfxLab] 场景未初始化');
                return;
            }
            document.getElementById('dev-panel')?.classList.remove('show');
            document.getElementById('dev-codex-panel')?.classList.remove('show');
            this.devMode = false;
            if (this.autoBattlerUI) {
                this.autoBattlerUI.hide();
                this.autoBattlerUI.hideMeta();
                if (this.autoBattlerUI.root) this.autoBattlerUI.root.style.display = 'none';
            }
            document.body.classList.remove('pe-auto-battler-town');
            this.transitionScene(vfxLabSceneType());
            if (typeof this.setAutoBattlerPresentation === 'function') {
                this.setAutoBattlerPresentation(false);
            }
            document.body.classList.add('pe-ab-vfx-lab');
            this.paused = false;
            this.resizeCanvas();
            const cw = CONFIG.CANVAS_WIDTH;
            const ch = CONFIG.CANVAS_HEIGHT;
            this.player.x = 50;
            this.player.y = 50;
            this.cameraX = 0;
            this.cameraY = 0;
            this._abVfxLabBattle = window.AutoBattleSimulator.createVfxPreviewBattle(cw, ch);
            if (window.AutoBattlerAssets && window.AutoBattlerAssets.ensureLoaded) {
                window.AutoBattlerAssets.ensureLoaded();
            }
            this.abSkillVfxLabUI.open();
            this._lastAbVfxLabTick = performance.now();
            this.addFloatingText(cw / 2, ch / 2 - 40, '自走棋技能特效试验场', '#8ec8ff');
        },

        tickAbVfxLabPreview() {
            if (!this._abVfxLabBattle || !window.AutoBattleSimulator) return;
            const now = performance.now();
            const dt = Math.min(50, now - (this._lastAbVfxLabTick || now));
            this._lastAbVfxLabTick = now;
            window.AutoBattleSimulator.tickVfxPreviewBattle(this._abVfxLabBattle, dt);
        },

        exitAbSkillVfxLab() {
            document.body.classList.remove('pe-ab-vfx-lab');
            this.abSkillVfxLabUI?.close();
            this._abVfxLabBattle = null;
            this.returnToTown();
        },

        updateAbSkillVfxLab() {
            const scene = this.abSkillVfxLabScene;
            if (!scene || !this.player || !this._abVfxLabBattle) return;
            const now = Date.now();
            const canInteract = now - this.lastSceneTransitionTime >= 3000;
            const interactions = scene.checkInteraction(this.player);
            if (interactions.length > 0 && this._isInteractKeyEdge(canInteract)) {
                this.exitAbSkillVfxLab();
            }
        },
    });
})();
