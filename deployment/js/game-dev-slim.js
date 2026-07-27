/**
 * 自走棋精简开发者面板（无图鉴/程序化装备工具）
 */
(function () {
    'use strict';

    Object.assign(Game.prototype, {
        toggleDevMode() {
            if (!this._localPeDevServer) return;
            this.devMode = !this.devMode;
            const panel = document.getElementById('dev-panel');
            if (!panel) return;
            if (this.devMode) {
                this.paused = true;
                panel.classList.add('show');
            } else {
                panel.classList.remove('show');
                this.paused = false;
            }
        },

        updateDevInfo() {
            if (!this.devMode) return;
            const set = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            };
            set('dev-floor', this.floor || 1);
            set('dev-room-type', this.currentScene || '-');
            set('dev-fps', this.fps || 0);
            set('dev-tps', this.tps || 0);
            set('dev-mspt', (this.mspt || 0).toFixed(2));
        },
    });
})();
