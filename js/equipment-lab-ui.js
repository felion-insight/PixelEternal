/**
 * 装备试验场 UI。
 */
(function () {
    'use strict';

    class EquipmentLabUI {
        constructor(game) {
            this.game = game;
            this.catalog = [];
            this.filtered = [];
            this.selectedId = null;
            this.bound = false;
        }

        bindOnce() {
            if (this.bound) return;
            const byId = id => document.getElementById(id);
            byId('close-equipment-lab')?.addEventListener('click', () => this.close());
            byId('equipment-lab-category')?.addEventListener('change', () => this.renderList());
            byId('equipment-lab-list')?.addEventListener('click', event => {
                const row = event.target.closest('[data-equipment-lab-id]');
                if (!row) return;
                this.select(row.dataset.equipmentLabId);
            });
            byId('equipment-lab-apply')?.addEventListener('click', () => this.applySelected());
            byId('equipment-lab-start')?.addEventListener('click', () => this.startAuto());
            byId('equipment-lab-pause')?.addEventListener('click', () => this.game.equipmentLabController?.togglePause());
            byId('equipment-lab-prev')?.addEventListener('click', () => this.game.equipmentLabController?.previous());
            byId('equipment-lab-next')?.addEventListener('click', () => this.game.equipmentLabController?.next());
            byId('equipment-lab-stop')?.addEventListener('click', () => this.game.equipmentLabController?.stop(true));
            this.game.equipmentLabController?.setChangeHandler(state => this.renderState(state));
            this.bound = true;
        }

        open() {
            this.bindOnce();
            this.catalog = window.EquipmentLabCatalog ? window.EquipmentLabCatalog.buildCatalog() : [];
            document.getElementById('equipment-lab-modal')?.classList.add('show');
            this.game.syncGamePausedState();
            this.renderList();
            if (!this.selectedId && this.filtered[0]) this.select(this.filtered[0].id);
        }

        close() {
            document.getElementById('equipment-lab-modal')?.classList.remove('show');
            this.game.syncGamePausedState();
        }

        isOpen() {
            return !!document.getElementById('equipment-lab-modal')?.classList.contains('show');
        }

        renderList() {
            const category = document.getElementById('equipment-lab-category')?.value || 'all';
            this.filtered = category === 'all'
                ? this.catalog.slice()
                : this.catalog.filter(entry => entry.category === category);
            const list = document.getElementById('equipment-lab-list');
            if (!list) return;
            list.innerHTML = this.filtered.map(entry => `
                <button type="button" class="equipment-lab-row${entry.id === this.selectedId ? ' selected' : ''}"
                    data-equipment-lab-id="${entry.id}">
                    <span>${entry.name}</span><small>${entry.trigger}</small>
                </button>
            `).join('');
            const count = document.getElementById('equipment-lab-count');
            if (count) count.textContent = String(this.filtered.length);
        }

        select(id) {
            const entry = this.catalog.find(item => item.id === id);
            if (!entry) return;
            this.selectedId = id;
            this.renderList();
            const title = document.getElementById('equipment-lab-selected-name');
            const detail = document.getElementById('equipment-lab-selected-detail');
            if (title) title.textContent = entry.name;
            if (detail) {
                detail.innerHTML = `<p>${entry.description || '无描述'}</p>
                    <p class="equipment-lab-meta">分类: ${entry.category} · 触发脚本: ${entry.trigger} · ID: ${entry.effectId}</p>`;
            }
            this.renderPreview(entry);
        }

        renderPreview(entry) {
            const preview = document.getElementById('equipment-lab-preview');
            if (!preview || !window.EquipmentLabCatalog) return;
            try {
                const loadout = window.EquipmentLabCatalog.buildLoadout(entry, 7);
                const items = Object.values(loadout).filter(Boolean);
                let html = `<div class="equipment-lab-slots">${Object.entries(loadout).map(([slot, item]) =>
                    `<span class="${item ? 'filled' : ''}">${(window.SLOT_NAMES && window.SLOT_NAMES[slot]) || slot}${item ? `: ${item.name}` : ''}</span>`
                ).join('')}</div>`;
                if (items[0] && typeof items[0].getTooltipHTML === 'function') {
                    html += `<div class="equipment-lab-tooltip">${items[0].getTooltipHTML(loadout)}</div>`;
                    if (typeof window.appendBuildEquipmentTooltip === 'function') {
                        html = window.appendBuildEquipmentTooltip(html, items[0]);
                    }
                }
                preview.innerHTML = html;
            } catch (error) {
                preview.textContent = `预览失败: ${error.message}`;
            }
        }

        selectedEntry() {
            return this.catalog.find(entry => entry.id === this.selectedId) || null;
        }

        applySelected() {
            const entry = this.selectedEntry();
            if (!entry || !this.game.equipmentLabController) return;
            this.game.equipmentLabController.applyEntry(entry);
        }

        startAuto() {
            const durationSec = Math.max(2, Number(document.getElementById('equipment-lab-duration')?.value) || 6);
            const loop = !!document.getElementById('equipment-lab-loop')?.checked;
            const queue = this.filtered.length ? this.filtered : this.catalog;
            this.game.equipmentLabController?.start(queue, { durationMs: durationSec * 1000, loop });
        }

        renderShowcase(state) {
            const card = document.getElementById('equipment-lab-showcase-card');
            const entry = state.currentEntry;
            if (!card) return;
            if (!state.isRunning || !entry) {
                card.classList.remove('show');
                return;
            }
            const categories = {
                power: '传奇威能',
                set: '套装效果',
                build: '流派核心',
                weapon: '武器精炼',
                resonance: '武器身份共鸣',
                affix: '装备词缀'
            };
            const triggers = {
                crit: '制造必定暴击',
                death: '承受致命伤害',
                damage: '承受真实攻击',
                dodge: '触发闪避',
                block: '触发格挡',
                kill: '完成击杀',
                low_hp: '进入低生命状态',
                range: '保持远距离攻击',
                move: '移动并积累能量',
                resource: '保持资源充足',
                skill_combo: '连续释放不同技能',
                skill: '释放对应职业技能',
                passive: '持续被动触发',
                weapon: '释放武器技能',
                resonance: '完成蓄势后释放武器技能',
                basic: '连续普通攻击'
            };
            const setText = (id, value) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            };
            setText('equipment-lab-showcase-category', categories[entry.category] || '装备演示');
            setText('equipment-lab-showcase-index', `${state.currentIndex + 1} / ${state.total}`);
            setText('equipment-lab-showcase-name', entry.name || entry.effectId || '当前装备');
            setText('equipment-lab-showcase-description', entry.description || '展示该装备的战斗与属性效果。');
            setText('equipment-lab-showcase-trigger', triggers[entry.trigger] || '自动触发对应机制');
            const current = window.EquipmentLabMetrics && window.EquipmentLabMetrics.current;
            const effectCount = current && window.EquipmentLabMetrics
                ? window.EquipmentLabMetrics.effectTriggerCount(current.effectId) : 0;
            const resonanceStatus = entry.category === 'resonance'
                && window.WeaponRefinementResonance
                ? window.WeaponRefinementResonance.getStatus(this.game.player)
                : null;
            const resonanceStacks = resonanceStatus
                ? Object.values(resonanceStatus.counters || {}).reduce((sum, value) => sum + (Number(value) || 0), 0)
                : 0;
            const resonanceReady = resonanceStatus
                ? Object.values(resonanceStatus.flags || {}).some(Boolean)
                : false;
            const runningState = effectCount > 0
                ? '共鸣已消耗触发 ✓'
                : ((resonanceStacks > 0 || resonanceReady)
                    ? `共鸣蓄势中${resonanceStacks > 0 ? ` · ${resonanceStacks}层` : ' · 已就绪'}`
                    : '等待共鸣条件');
            setText(
                'equipment-lab-showcase-state',
                state.isPaused ? '已暂停' : (entry.category === 'resonance'
                    ? runningState
                    : (effectCount > 0 ? '机制已触发 ✓' : '正在演示'))
            );
            const ratio = state.durationMs > 0 ? Math.min(1, state.elapsedMs / state.durationMs) : 0;
            const progress = document.getElementById('equipment-lab-showcase-progress-fill');
            if (progress) progress.style.width = `${Math.round(ratio * 100)}%`;
            card.classList.add('show');
        }

        renderState(state) {
            this.renderShowcase(state);
            const status = document.getElementById('equipment-lab-status');
            const progress = document.getElementById('equipment-lab-progress-fill');
            const pause = document.getElementById('equipment-lab-pause');
            if (status) {
                if (!state.isRunning && !state.currentEntry) {
                    status.textContent = '待机';
                } else if (!state.isRunning) {
                    status.textContent = `已应用 · ${state.currentEntry?.name || '-'}`;
                } else {
                    status.textContent = `${state.isPaused ? '已暂停' : '展示中'} · ${state.currentEntry?.name || '-'} · ${Math.max(0, state.currentIndex + 1)}/${state.total}`;
                }
            }
            if (progress) {
                const ratio = state.durationMs > 0 ? Math.min(1, state.elapsedMs / state.durationMs) : 0;
                progress.style.width = `${Math.round(ratio * 100)}%`;
            }
            if (pause) pause.textContent = state.isPaused ? '继续' : '暂停';
            if (state.currentEntry && state.currentEntry.id !== this.selectedId) {
                this.selectedId = state.currentEntry.id;
                this.renderList();
                const item = this.catalog.find(entry => entry.id === state.currentEntry.id);
                if (item) this.select(item.id);
            }
            const metrics = document.getElementById('equipment-lab-metrics');
            if (metrics) {
                const current = window.EquipmentLabMetrics && window.EquipmentLabMetrics.current;
                const totalDamage = this.game.equipmentLabController?.totalDamage() || 0;
                const effectCount = current && window.EquipmentLabMetrics
                    ? window.EquipmentLabMetrics.effectTriggerCount(current.effectId) : 0;
                metrics.innerHTML = `<span>伤害 ${Math.floor(totalDamage)}</span>
                    <span>演示事件 ${current ? current.events.length : 0}</span>
                    <span class="${effectCount > 0 ? 'triggered' : 'pending'}">机制触发 ${effectCount > 0 ? '✓' : '等待中'}</span>
                    <span>已完成 ${state.results.length}</span>`;
            }
        }
    }

    window.EquipmentLabUI = EquipmentLabUI;
})();
