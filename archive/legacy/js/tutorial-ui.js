/**
 * Pixel Eternal — 新手引导 UI
 */
(function () {
    'use strict';

    function $(id) { return document.getElementById(id); }

    window.TutorialUI = class TutorialUI {
        constructor(game) {
            this.game = game;
            this._bound = false;
        }

        init() {
            if (this._bound) return;
            this._bound = true;
            const next = $('tutorial-next-btn');
            const skip = $('tutorial-skip-btn');
            if (next) next.addEventListener('click', () => this.onNext());
            if (skip) skip.addEventListener('click', () => this.onSkip());
        }

        beginOnboarding() {
            if (!this.game.player) return;
            window.migrateLegacyTutorialFlags(this.game.player);
            const state = window.evaluateTutorialOnStart(this.game);
            if (state === 'need_class') {
                if (this.game.classUI) this.game.classUI.showClassSelectForced();
                return;
            }
            if (state === 'need_name') {
                if (this.game.classUI) this.game.classUI.showPlayerNameModal();
                return;
            }
            if (state === 'in_game' && !window.isTutorialComplete(this.game.player)) {
                this.show();
                this.refresh();
            }
        }

        show() {
            const el = $('tutorial-overlay');
            if (el) el.classList.add('show');
        }

        hide() {
            const el = $('tutorial-overlay');
            if (el) el.classList.remove('show');
        }

        refresh() {
            const player = this.game.player;
            if (!player || window.isTutorialComplete(player)) {
                this.hide();
                return;
            }
            const step = window.getTutorialCurrentStep(player);
            if (!step || SETUP_STEP_IDS.includes(step.id)) {
                this.hide();
                return;
            }
            this.show();
            const prog = window.getTutorialProgress(player);
            const title = $('tutorial-step-title');
            const text = $('tutorial-step-text');
            const hint = $('tutorial-step-hint');
            const progress = $('tutorial-step-progress');
            const nextBtn = $('tutorial-next-btn');
            if (title) title.textContent = step.title || '';
            if (text) text.textContent = step.text || '';
            if (hint) hint.textContent = step.hint || '';
            if (progress) progress.textContent = `步骤 ${prog.done + 1} / ${prog.total}`;
            if (nextBtn) {
                const showBtn = step.completeOn === 'button';
                nextBtn.style.display = showBtn ? '' : 'none';
                nextBtn.textContent = step.id === 'done' ? '开始冒险' : '继续';
            }
        }

        onNext() {
            const step = window.getTutorialCurrentStep(this.game.player);
            if (!step) return;
            window.notifyTutorialEvent(this.game, 'button');
            this.refresh();
            if (window.isTutorialComplete(this.game.player)) {
                this.hide();
                if (typeof this.game.addFloatingText === 'function') {
                    this.game.addFloatingText(this.game.player.x, this.game.player.y, '教程完成！按 G 查看完整手册', '#ffd700', 4000, 15, true);
                }
            }
        }

        onSkip() {
            if (!confirm('确定跳过新手教程？之后可在 ESC 菜单打开「游戏指导」查看说明。')) return;
            window.skipTutorial(this.game.player);
            this.hide();
            if (typeof this.game.addFloatingText === 'function') {
                this.game.addFloatingText(this.game.player.x, this.game.player.y, '已跳过教程', '#aaa');
            }
        }
    };

    const SETUP_STEP_IDS = ['need_class', 'need_name'];
})();
