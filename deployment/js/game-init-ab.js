/**
 * 自走棋精简初始化与 ESC 菜单（覆盖 game-main.js 中的 init / initDungeonSelection）
 */
(function () {
    'use strict';

    function bindClick(id, handler) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    }

    Object.assign(Game.prototype, {
        init() {
            console.log('init() [AB slim]');
            try {
                bindClick('settings-btn', () => this.showEscMenu());

                this.initVolumeSettingsUI();
                if (window.KeybindSystem) window.KeybindSystem.initSettingsUI(this);

                document.addEventListener('keydown', (e) => {
                    const KB = window.KeybindSystem;
                    if (KB && KB.isCapturing()) {
                        KB.handleCaptureKeydown(e);
                        return;
                    }
                    const action = KB ? KB.getActionForEvent(e) : null;
                    if (action) KB.setActionPressed(this, action, true);

                    if (e.key === 'F1') {
                        e.preventDefault();
                        if (this._localPeDevServer) this.toggleDevMode();
                        return;
                    }

                    if (e.key === 'Escape' || e.key === 'Esc') {
                        e.preventDefault();
                        const vfxLab = (typeof SCENE_TYPES !== 'undefined' && SCENE_TYPES.AB_SKILL_VFX_LAB)
                            ? SCENE_TYPES.AB_SKILL_VFX_LAB : 'ab_skill_vfx_lab';
                        if (this.currentScene === vfxLab) {
                            this.exitAbSkillVfxLab?.();
                            return;
                        }
                        const esc = document.getElementById('esc-menu-modal');
                        const saveModal = document.getElementById('save-code-modal');
                        const importModal = document.getElementById('import-save-modal');
                        const abVfx = document.getElementById('ab-skill-vfx-lab-modal');
                        if (saveModal && saveModal.classList.contains('show')) {
                            this.closeSaveCodeModal();
                            return;
                        }
                        if (importModal && importModal.classList.contains('show')) {
                            this.closeImportSaveModal();
                            return;
                        }
                        if (abVfx && abVfx.classList.contains('show')) {
                            this.exitAbSkillVfxLab?.();
                            return;
                        }
                        if (esc && esc.classList.contains('show')) {
                            this.closeEscMenu();
                            return;
                        }
                        if (this.currentScene === SCENE_TYPES.AUTO_BATTLER && this.autoBattlerController) {
                            this.autoBattlerController.handleEscape?.();
                            return;
                        }
                        this.showEscMenu();
                        return;
                    }

                    const escOpen = document.getElementById('esc-menu-modal');
                    if (escOpen && escOpen.classList.contains('show') && e.key !== 'Escape' && e.key !== 'Esc') {
                        if (!(this._localPeDevServer && e.key === 'F1')) {
                            e.preventDefault();
                            return;
                        }
                    }
                    if (this.paused) return;

                    if (e.key === 'Shift') this.keys.shift = true;
                    else if (e.key.length === 1) this.keys[e.key.toLowerCase()] = true;
                    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                        this.keys[e.key] = true;
                    }
                });

                document.addEventListener('keyup', (e) => {
                    const KB = window.KeybindSystem;
                    const action = KB ? KB.getActionForEvent(e) : null;
                    if (action) KB.setActionPressed(this, action, false);
                    if (e.key === 'Shift') this.keys.shift = false;
                    else if (e.key.length === 1) this.keys[e.key.toLowerCase()] = false;
                    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                        this.keys[e.key] = false;
                    }
                });

                if (this.canvas) {
                    this.canvas.addEventListener('mousemove', (e) => this.updateMouseFromEvent(e));
                }

                this.initSaveSystem();
                this.initEscMenuAb();

                this.player.updateStats();
                this.updateHUD();
                const roomType = document.getElementById('room-type');
                const floorEl = document.getElementById('floor-number');
                if (roomType) roomType.textContent = '主城';
                if (floorEl) floorEl.textContent = '准备中';
                if (typeof this.syncAutoBattlerTownHud === 'function') this.syncAutoBattlerTownHud();

                this.tryAutoLoadBrowserSave();

                if (this.soundManager) {
                    this.soundManager.loadBgm('town').catch(() => {});
                    this.soundManager.loadBgm('battle').catch(() => {});
                }

                this.showStartScreen();
            } catch (error) {
                console.error('init() [AB slim] 失败:', error);
                try { this.startGameLoop(); } catch (_) { /* ignore */ }
                throw error;
            }
        },

        initDungeonSelection() {
            this.initEscMenuAb();
        },

        initEscMenuAb() {
            bindClick('esc-menu-export-btn', () => { this.closeEscMenu(); this.exportSave(); });
            bindClick('esc-menu-save-browser-btn', () => { this.closeEscMenu(); this.saveGameToBrowserStorage(); });
            bindClick('esc-menu-import-btn', () => { this.closeEscMenu(); this.showImportSaveModal(); });
            bindClick('esc-menu-clear-save-btn', () => { this.closeEscMenu(); this.clearSave(); });
            bindClick('esc-menu-close-btn', (e) => { e.stopPropagation(); this.closeEscMenu(); });
            bindClick('esc-menu-exit-tower-btn', () => {
                this.closeEscMenu();
                if (this.currentScene === SCENE_TYPES.AUTO_BATTLER && this.autoBattlerController) {
                    this.autoBattlerController.abortRun?.();
                }
            });
            const guideBtn = document.getElementById('esc-menu-guide-btn');
            if (guideBtn) guideBtn.style.display = 'none';

            if (typeof this.initEscMenuTabs === 'function') this.initEscMenuTabs();

            const escMenuModal = document.getElementById('esc-menu-modal');
            if (escMenuModal) {
                escMenuModal.addEventListener('click', (e) => {
                    if (e.target === escMenuModal) this.closeEscMenu();
                });
            }
        },

        closeSaveCodeModal() {
            const modal = document.getElementById('save-code-modal');
            if (modal) modal.classList.remove('show');
            if (!this.devMode) this.paused = false;
        },

        closeImportSaveModal() {
            const modal = document.getElementById('import-save-modal');
            if (modal) modal.classList.remove('show');
            if (!this.devMode) this.paused = false;
        },
    });
})();
