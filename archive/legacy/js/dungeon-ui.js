/**
 * Phase 6 — 副本入口 UI
 */
(function () {
    'use strict';

    function $(id) { return document.getElementById(id); }

    window.DungeonUI = class DungeonUI {
        constructor(game) {
            this.game = game;
            this._bound = false;
        }

        init() {
            if (this._bound) return;
            this._bound = true;
            const close = $('dungeon-hub-close');
            if (close) close.addEventListener('click', () => this.close());
            const body = $('dungeon-hub-body');
            if (body) {
                body.addEventListener('click', (e) => {
                    const btn = e.target.closest('[data-dungeon-enter]');
                    if (!btn) return;
                    this._enter(btn.dataset.dungeonEnter, btn.dataset.dungeonTier || null);
                });
            }
        }

        open() {
            const m = $('dungeon-hub-modal');
            if (!m) return;
            window.ensurePlayerMaterials(this.game.player);
            window.ensurePlayerDungeonProgress(this.game.player);
            window.refreshRiftWindow(this.game.player);
            this.render();
            m.classList.add('show');
            this.game.syncGamePausedState();
        }

        close() {
            const m = $('dungeon-hub-modal');
            if (m) m.classList.remove('show');
            this.game.syncGamePausedState();
        }

        _enter(dungeonId, tierId) {
            if (typeof this.game.enterDungeon === 'function') {
                this.game.enterDungeon(dungeonId, tierId);
            }
        }

        _tierButtons(def, player) {
            const tiers = def.tiers || [];
            if (tiers.length <= 1) {
                const t = tiers[0];
                const check = window.canEnterDungeon(player, def.id, t && t.id);
                const disabled = !check.ok;
                return `<button type="button" class="dungeon-enter-btn" data-dungeon-enter="${def.id}" data-dungeon-tier="${t ? t.id : ''}" ${disabled ? 'disabled' : ''}>进入${disabled ? ' · ' + check.message : ''}</button>`;
            }
            return tiers.map(t => {
                const check = window.canEnterDungeon(player, def.id, t.id);
                const rem = window.getDungeonAttemptsRemaining(player, def);
                const disabled = !check.ok;
                return `<button type="button" class="dungeon-enter-btn" data-dungeon-enter="${def.id}" data-dungeon-tier="${t.id}" ${disabled ? 'disabled' : ''}>${t.name}${disabled ? ' · ' + check.message : ''}</button>`;
            }).join('');
        }

        _renderDungeonCard(def, player) {
            const rem = window.getDungeonAttemptsRemaining(player, def);
            const limit = def.dailyLimit != null ? def.dailyLimit : (def.weeklyLimit != null ? def.weeklyLimit : null);
            const limitText = limit != null ? `${def.dailyLimit != null ? '日' : '周'} ${rem}/${limit}` : '';
            const locked = player.level < (def.unlockLevel || 1);
            const open = window.isDungeonOpenToday(def);
            return `<div class="dungeon-card${locked ? ' locked' : ''}">
                <div class="dungeon-card-head"><strong>${def.name}</strong><span>Lv.${def.unlockLevel || 1}+</span></div>
                <p class="dungeon-card-desc">${def.description || ''}</p>
                <p class="dungeon-card-meta">${limitText}${!open && def.openDays ? ' · 今日未开放' : ''}</p>
                <div class="dungeon-card-actions">${locked ? '<span style="color:#888;">等级不足</span>' : this._tierButtons(def, player)}</div>
            </div>`;
        }

        render() {
            const body = $('dungeon-hub-body');
            const mats = $('dungeon-hub-materials');
            if (!body) return;
            const p = this.game.player;
            const cats = window.listDungeonsByCategory();
            const labels = {
                daily: '日常副本',
                weekly: '周常副本',
                abyss: '深渊',
                rift: '时空裂隙',
                endgame: '终局',
                raid: '团队 Raid（预留）'
            };

            if (mats) {
                const summary = window.formatMaterialSummary(p, 10);
                mats.innerHTML = summary.length
                    ? summary.map(s => `<span style="color:${s.color}">${s.name} ×${s.count}</span>`).join(' · ')
                    : '<span style="color:#888;">暂无材料（通关副本获得）</span>';
            }

            let html = '';
            ['daily', 'weekly', 'abyss', 'rift', 'endgame', 'raid'].forEach(key => {
                const items = cats[key] || [];
                if (!items.length) return;
                html += `<section class="dungeon-hub-section"><h3>${labels[key] || key}</h3><div class="dungeon-card-grid">`;
                items.forEach(item => {
                    if (item.status === 'coming_soon') {
                        html += `<div class="dungeon-card locked"><strong>${item.name}</strong><p>${item.players || 4}人 · Lv.${item.unlockLevel}+ · 多人联机预留</p></div>`;
                    } else {
                        html += this._renderDungeonCard(item, p);
                    }
                });
                html += '</div></section>';
            });

            if (cats.rift && cats.rift.length) {
                const active = window.isRiftWindowActive(p);
                html = `<p class="dungeon-rift-status" style="color:${active ? '#88ff88' : '#ffaa66'};">裂隙窗口：${active ? '开放中' : '已刷新，请重开面板'}</p>` + html;
            }

            body.innerHTML = html || '<p>暂无副本配置</p>';
        }
    };
})();
