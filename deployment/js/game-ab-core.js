/**
 * 自走棋核心循环 — 覆盖 game-main.js 中的 update/draw/主城交互（瘦实现）
 */
(function () {
    'use strict';

    function tickFloatingTexts(game) {
        game.floatingTexts = game.floatingTexts.filter((text) => {
            if (text.fixedPosition) return !text.update(null, null);
            const p = game.player;
            const px = (p && p.x != null && !isNaN(p.x)) ? p.x : (text.baseX || CONFIG.CANVAS_WIDTH / 2);
            const py = (p && p.y != null && !isNaN(p.y))
                ? p.y - p.size / 2 - 20
                : (text.baseY || CONFIG.CANVAS_HEIGHT / 2);
            return !text.update(px, py);
        });
    }

    function vfxLabSceneType() {
        return (typeof SCENE_TYPES !== 'undefined' && SCENE_TYPES.AB_SKILL_VFX_LAB)
            ? SCENE_TYPES.AB_SKILL_VFX_LAB
            : 'ab_skill_vfx_lab';
    }

    Object.assign(Game.prototype, {
        update() {
            try {
                if (this.paused) {
                    this.cancelWeaponSkillAim?.();
                    this.lastInteractKeyState = window.KeybindSystem
                        ? window.KeybindSystem.isActionPressed(this, 'interact')
                        : !!this.keys.e;
                    tickFloatingTexts(this);
                    this.updateHUD();
                    this.maybeAutoSyncSaveCodeToLocalStorage(false);
                    return;
                }

                if (this.currentScene === SCENE_TYPES.AUTO_BATTLER && this.autoBattlerController) {
                    const phase = this.autoBattlerController.run && this.autoBattlerController.run.phase;
                    const abEnter = this.autoBattlerController.deployEnter;
                    if (phase === 'combat' || phase === 'transition' || (phase === 'deploy' && abEnter)) {
                        this.autoBattlerController.update(this.fixedTimeStep);
                    }
                    tickFloatingTexts(this);
                    this.updateHUD();
                    this.maybeAutoSyncSaveCodeToLocalStorage(false);
                    return;
                }

                if (this.currentScene === vfxLabSceneType()) {
                    this.updateHUD();
                    return;
                }

                if (this.currentScene === SCENE_TYPES.TOWN) {
                    this.handleInputTownOnly();
                    this.cameraX = this.player.x - CONFIG.CANVAS_WIDTH / 2;
                    this.cameraY = this.player.y - CONFIG.CANVAS_HEIGHT / 2;
                    tickFloatingTexts(this);
                    if (this.particleManager) {
                        const deltaTime = performance.now() - (this.lastFrameTime || performance.now());
                        this.particleManager.update(deltaTime);
                        this.lastFrameTime = performance.now();
                    }
                    this.updateTown();
                    if (this.player) this.player.updateStats();
                }

                this._commitInteractKeyEdge?.();
                this.updateHUD();
                this.maybeAutoSyncSaveCodeToLocalStorage(false);
            } catch (error) {
                console.error('游戏更新循环出错:', error);
                this.updateHUD();
            }
        },

        handleInputTownOnly() {
            if (this.paused || this.currentScene !== SCENE_TYPES.TOWN) return;
            let dx = 0;
            let dy = 0;
            const KB = window.KeybindSystem;
            if (KB) {
                if (KB.isActionPressed(this, 'moveUp')) dy -= 1;
                if (KB.isActionPressed(this, 'moveDown')) dy += 1;
                if (KB.isActionPressed(this, 'moveLeft')) dx -= 1;
                if (KB.isActionPressed(this, 'moveRight')) dx += 1;
            }
            if (this.keys.ArrowUp) dy -= 1;
            if (this.keys.ArrowDown) dy += 1;
            if (this.keys.ArrowLeft) dx -= 1;
            if (this.keys.ArrowRight) dx += 1;
            if (dx !== 0 && dy !== 0) {
                dx *= 0.707;
                dy *= 0.707;
            }
            if (KB && KB.isActionPressed(this, 'dash')
                && !this.player.isDashing && this.player.dashCooldown <= 0) {
                this.player.dash(dx, dy);
            }
            this.player.move(dx, dy);
        },

        draw() {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            if (this.currentScene === SCENE_TYPES.AUTO_BATTLER && this.autoBattlerController) {
                this.ctx.save();
                this.autoBattlerController.render(this.ctx);
                this.ctx.restore();
                return;
            }

            const vfxLab = vfxLabSceneType();
            if (this.currentScene === vfxLab && this.abSkillVfxLabScene) {
                if (!this._abVfxLabBattle && window.AutoBattleSimulator) {
                    this._abVfxLabBattle = window.AutoBattleSimulator.createVfxPreviewBattle(
                        CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT
                    );
                }
                if (this._abVfxLabBattle) {
                    this.ctx.save();
                    this.ctx.scale(2, 2);
                    this.abSkillVfxLabScene.draw(this.ctx, this._abVfxLabBattle);
                    this.ctx.restore();
                }
                return;
            }

            if (this.currentScene === SCENE_TYPES.TOWN) {
                this.ctx.save();
                this.ctx.scale(2, 2);
                this.ctx.translate(-this.cameraX, -this.cameraY);
                this.townScene.draw(this.ctx);
                if (this.player && typeof this.player.draw === 'function') {
                    this.player.draw(this.ctx);
                }
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                (this.floatingTexts || []).forEach((text) => text.draw(this.ctx));
                this.ctx.restore();
            }
        },

        updateTown() {
            const interactions = this.townScene.checkInteraction(this.player);
            const now = Date.now();
            const canInteract = now - this.lastSceneTransitionTime >= 3000;
            const interactPressed = this._isInteractKeyEdge(canInteract);
            if (interactions.length > 0 && interactPressed) {
                const building = interactions[0];
                if (building.type === 'tower_entrance') {
                    this.enterTower();
                    if (typeof window.notifyTutorialEvent === 'function') {
                        window.notifyTutorialEvent(this, 'building_interact', { building: building.type });
                    }
                }
            }
        },

        enterTower() {
            if (this.autoBattlerController
                && typeof window.AutoBattlerController !== 'undefined'
                && window.AutoBattlerController.isEnabled()) {
                this.autoBattlerController.startRun();
                if (typeof window.notifyTutorialEvent === 'function') {
                    window.notifyTutorialEvent(this, 'enter_tower');
                }
            }
        },

        getCurrentSceneTargets() {
            return [];
        },

        initInventory() {},

        toggleInventory() {},
        toggleCodex() {},
        toggleGuide() {},
        updateInventoryUI() {},
        updateInventoryStats() {},
        updateInventoryCapacity() {},
        updateWeaponSkillButton() {},
        updateEquipmentSlotBorders() {},

        updateHUD() {
            const setText = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            };
            if (!this.player) return;
            setText('player-hp', Math.floor(this.player.hp));
            setText('player-max-hp', this.player.maxHp);
            setText('player-level', this.player.level);
            setText('player-exp', this.player.exp);
            setText('player-exp-needed', this.player.expNeeded);
            setText('player-gold-display', this.player.gold);
            const classNameEl = document.getElementById('player-class-name');
            if (classNameEl && typeof window.getClassDisplayName === 'function') {
                classNameEl.textContent = window.getClassDisplayName(this.player.classData);
            }
            const hpFill = document.getElementById('hp-bar-fill');
            if (hpFill && this.player.maxHp > 0) {
                hpFill.style.width = Math.min(100, 100 * this.player.hp / this.player.maxHp) + '%';
            }
            const expFill = document.getElementById('exp-bar-fill');
            if (expFill && this.player.expNeeded > 0) {
                expFill.style.width = Math.min(100, 100 * this.player.exp / this.player.expNeeded) + '%';
            }
            if (typeof this.syncAutoBattlerTownHud === 'function') {
                this.syncAutoBattlerTownHud();
            }
        },

        returnToTown() {
            if (this.autoBattlerController && typeof this.autoBattlerController.returnToTown === 'function') {
                this.autoBattlerController.returnToTown();
            }
            const vfxLab = vfxLabSceneType();
            if (this.currentScene === vfxLab) {
                this.abSkillVfxLabUI?.close();
                this._abVfxLabBattle = null;
                document.body.classList.remove('pe-ab-vfx-lab');
            }
            this.transitionScene(SCENE_TYPES.TOWN);
            this.currentRoom = null;
            this.droppedItems = [];
            this.rewardPickups = [];
            this.portals = [];
            this.paused = false;
            if (!this.townScene) {
                this.townScene = new TownScene(this);
            }
            this.player.x = CONFIG.CANVAS_WIDTH / 2;
            this.player.y = CONFIG.CANVAS_HEIGHT / 2;
            this.updateHUD();
            if (typeof this.syncAutoBattlerTownHud === 'function') {
                this.syncAutoBattlerTownHud();
            } else {
                const roomType = document.getElementById('room-type');
                const floorEl = document.getElementById('floor-number');
                if (roomType) roomType.textContent = '主城';
                if (floorEl) floorEl.textContent = `上次到达: ${this.lastDeathFloor || 1}层`;
            }
        },
    });
})();

