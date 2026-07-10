/**
 * Phase 4 — NPC 面板 UI
 */
(function () {
    'use strict';

    function $(id) { return document.getElementById(id); }

    window.NpcUI = class NpcUI {
        constructor(game) {
            this.game = game;
            this._bound = false;
            this._selectedEnchanterEq = null;
        }

        init() {
            if (this._bound) return;
            this._bound = true;
            this._bindClassMaster();
            this._bindEnchanter();
            this._bindJeweler();
            this._bindChronicle();
            this._bindAwakening();
        }

        _pause() { this.game.syncGamePausedState(); }
        _unpauseIfNeeded() {
            this.game.syncGamePausedState();
        }

        _anyNpcModalOpen() {
            return ['class-master-modal', 'enchanter-modal', 'jeweler-modal', 'chronicle-modal', 'awakening-modal']
                .some(id => { const el = $(id); return el && el.classList.contains('show'); });
        }

        _toast(text, color) {
            if (typeof this.game.addFloatingText === 'function') {
                this.game.addFloatingText(this.game.player.x, this.game.player.y, text, color || '#ffcc66');
            }
        }

        _closeModal(id) {
            const m = $(id);
            if (m) m.classList.remove('show');
            this._unpauseIfNeeded();
        }

        openClassMaster() {
            const m = $('class-master-modal');
            if (!m) return;
            const p = this.game.player;
            if (p && p.tutorialFlags) {
                p.tutorialFlags.classMasterVisited = true;
                p.tutorialFlags.needClassMaster = false;
            }
            this._renderClassMaster();
            m.classList.add('show');
            this._pause();
        }

        closeClassMaster() { this._closeModal('class-master-modal'); }

        openSkillTrainer() {
            if (this.game.classUI) this.game.classUI.showSkillPanel();
        }

        openEnchanter() {
            const m = $('enchanter-modal');
            if (!m) return;
            this._selectedEnchanterEq = null;
            this._renderEnchanter();
            m.classList.add('show');
            this._pause();
        }

        closeEnchanter() { this._closeModal('enchanter-modal'); }

        openJeweler() {
            const m = $('jeweler-modal');
            if (!m) return;
            this._renderJeweler();
            m.classList.add('show');
            this._pause();
        }

        closeJeweler() { this._closeModal('jeweler-modal'); }

        openChronicle() {
            const m = $('chronicle-modal');
            if (!m) return;
            if (typeof window.syncChronicleFromProgress === 'function') {
                window.syncChronicleFromProgress(this.game.player, this.game);
            }
            this._renderChronicle();
            m.classList.add('show');
            this._pause();
        }

        closeChronicle() { this._closeModal('chronicle-modal'); }

        openAwakeningGate() {
            const m = $('awakening-modal');
            if (!m) return;
            this._renderAwakening();
            m.classList.add('show');
            this._pause();
        }

        closeAwakening() { this._closeModal('awakening-modal'); }

        openMaterialRealm() {
            if (this.game.dungeonUI) {
                this.game.dungeonUI.open();
            } else {
                this._toast('副本系统未加载', '#ff6666');
            }
        }

        closeAll() {
            this.closeClassMaster();
            this.closeEnchanter();
            this.closeJeweler();
            this.closeChronicle();
            this.closeAwakening();
        }

        _bindClassMaster() {
            const close = $('class-master-close');
            if (close) close.addEventListener('click', () => this.closeClassMaster());
            const menu = $('class-master-menu');
            if (menu) {
                menu.querySelectorAll('[data-cm-action]').forEach(btn => {
                    btn.addEventListener('click', () => this._handleClassMasterAction(btn.dataset.cmAction));
                });
            }
        }

        _bindEnchanter() {
            $('enchanter-close') && $('enchanter-close').addEventListener('click', () => this.closeEnchanter());
            $('enchanter-extract-btn') && $('enchanter-extract-btn').addEventListener('click', () => this._doExtractPower());
            $('enchanter-imprint-btn') && $('enchanter-imprint-btn').addEventListener('click', () => this._doImprintPower());
        }

        _bindJeweler() {
            $('jeweler-close') && $('jeweler-close').addEventListener('click', () => this.closeJeweler());
            $('jeweler-synth-btn') && $('jeweler-synth-btn').addEventListener('click', () => this._doSetSynth());
        }

        _bindChronicle() {
            $('chronicle-close') && $('chronicle-close').addEventListener('click', () => this.closeChronicle());
        }

        _bindAwakening() {
            $('awakening-close') && $('awakening-close').addEventListener('click', () => this.closeAwakening());
        }

        _handleClassMasterAction(action) {
            const p = this.game.player;
            const body = $('class-master-body');
            if (!body) return;
            if (action === 'tree') {
                if (this.game.classUI) this.game.classUI.showCharacterPanel();
                return;
            }
            if (action === 'reset_skill') {
                const res = window.resetSkillEnhancements(p);
                this._toast(res.ok ? '技能强化已重置' : (res.message || '失败'), res.ok ? '#88ff88' : '#ff6666');
                if (res.ok && typeof this.game.updateHUD === 'function') this.game.updateHUD();
                return;
            }
            if (action === 'reset_talent') {
                const res = window.resetTalents(p);
                this._toast(res.ok ? '天赋已重置' : (res.message || '失败'), res.ok ? '#88ff88' : '#ff6666');
                if (res.ok) {
                    if (typeof this.game.updateHUD === 'function') this.game.updateHUD();
                    if (this.game.classUI) this.game.classUI.updateAll();
                }
                return;
            }
            if (action === 'first_job') this._renderFirstJobPicker(body);
        }

        _renderClassMaster() {
            const p = this.game.player;
            const body = $('class-master-body');
            const subtitle = $('class-master-subtitle');
            if (!body) return;
            const cd = window.normalizeClassData(p.classData);
            if (subtitle) subtitle.textContent = window.getClassDisplayName(p.classData) + ' · Lv.' + p.level;
            if (!window.hasPlayerClass(cd)) {
                body.innerHTML = '<p style="color:#f88;">请先在 C 键角色面板选择基础职业。</p>';
                return;
            }
            if (cd.secondAdvancement) {
                body.innerHTML = '<p style="color:#8f8;">你已完成全部进阶。</p>';
                return;
            }
            if (cd.firstAdvancement) {
                body.innerHTML = '<p style="color:#aaa;">一转已完成。Lv40 后前往觉醒之门二转。</p>';
                return;
            }
            if (p.level < 20) {
                body.innerHTML = '<p style="color:#aaa;">达到 <strong style="color:#ffd700;">20 级</strong> 后可一转（当前 Lv.' + p.level + '）。</p>';
                return;
            }
            body.innerHTML = '<p style="color:#8cf;">已达到一转条件，请选择「我要转职」。</p>';
        }

        _renderFirstJobPicker(container) {
            const p = this.game.player;
            const options = window.getFirstAdvancementOptions(p.classData);
            if (!options.length) {
                container.innerHTML = '<p style="color:#888;">无可选分支</p>';
                return;
            }
            const cost = window.NpcSystem ? window.NpcSystem.FIRST_JOB_COST : 1000;
            let html = '<p style="color:#aaa;margin:0 0 12px;">免费挑战试炼，或支付 ' + cost + ' 金币跳过</p><div class="npc-option-grid">';
            options.forEach(def => {
                const color = def.themeColor || '#ddaaff';
                const label = def.themeLabel ? `<span class="npc-theme-label" style="color:${color}">${def.themeLabel}</span>` : '';
                html += '<div class="npc-option-card" style="border-color:' + color + '; box-shadow: inset 0 0 0 1px ' + color + '33;">'
                    + '<h4 style="color:' + color + '">' + def.name + ' ' + label + '</h4>'
                    + '<p>' + (def.description || def.role || '') + '</p>'
                    + '<button type="button" class="npc-action-btn npc-trial-btn" data-first-id="' + def.id + '">免费试炼</button>'
                    + '<button type="button" class="npc-action-btn" data-first-paid="' + def.id + '">转职（' + cost + ' 金）</button></div>';
            });
            html += '</div>';
            container.innerHTML = html;
            container.querySelectorAll('[data-first-id]').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.closeClassMaster();
                    if (typeof this.game.enterTrial === 'function') {
                        this.game.enterTrial('first', btn.dataset.firstId);
                    }
                });
            });
            container.querySelectorAll('[data-first-paid]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const res = window.selectFirstAdvancement(p, btn.dataset.firstPaid, { skipTrial: true });
                    this._toast(res.ok ? '一转成功：' + res.name : (res.message || '失败'), res.ok ? '#88ff88' : '#ff6666');
                    if (res.ok) {
                        if (typeof this.game.updateHUD === 'function') this.game.updateHUD();
                        if (this.game.classUI) this.game.classUI.updateAll();
                        this._renderClassMaster();
                    }
                });
            });
        }

        _collectPlayerEquipments() {
            const out = [];
            const p = this.game.player;
            Object.values(p.equipment || {}).forEach(eq => { if (eq) out.push(eq); });
            (p.inventory || []).forEach(item => { if (item && item.type === 'equipment') out.push(item); });
            return out;
        }

        _renderEnchanter() {
            const list = $('enchanter-equipment-list');
            const stored = $('enchanter-stored-list');
            const detail = $('enchanter-detail');
            if (!list) return;
            const p = this.game.player;
            const items = this._collectPlayerEquipments().filter(eq =>
                (eq.legendaryPowers && eq.legendaryPowers.length) || ['epic', 'legendary', 'mythic'].includes(eq.quality));
            list.innerHTML = '';
            if (!items.length) list.innerHTML = '<p style="color:#888;padding:8px;">无可用装备</p>';
            else items.forEach(eq => {
                const div = document.createElement('div');
                div.className = 'npc-eq-item' + (this._selectedEnchanterEq === eq ? ' selected' : '');
                const qc = (window.QUALITY_COLORS && window.QUALITY_COLORS[eq.quality]) || '#fff';
                div.innerHTML = '<span style="color:' + qc + '">' + eq.name + '</span>';
                div.onclick = () => { this._selectedEnchanterEq = eq; this._renderEnchanter(); };
                list.appendChild(div);
            });
            if (stored) {
                const powers = p.storedPowers || [];
                stored.innerHTML = powers.length
                    ? powers.map(pw => '<div class="npc-stored-power">★ ' + pw.name + '</div>').join('')
                    : '<p style="color:#888;">暂无库存威能</p>';
            }
            if (detail) {
                const eq = this._selectedEnchanterEq;
                const pw = eq && (eq.legendaryPowers || [])[0];
                detail.innerHTML = !eq ? '<p style="color:#888;">选择装备</p>'
                    : (pw ? '<p><strong style="color:#fa0;">' + pw.name + '</strong></p><p style="font-size:12px;color:#ccc;">' + (pw.description || '') + '</p>'
                        : '<p style="color:#888;">无可提取威能</p>');
            }
        }

        _doExtractPower() {
            const eq = this._selectedEnchanterEq;
            if (!eq) { this._toast('请先选择装备', '#ff6666'); return; }
            const res = window.extractLegendaryPower(eq, this.game.player);
            this._toast(res.ok ? '已提取：' + res.powerName : (res.message || '失败'), res.ok ? '#fa0' : '#ff6666');
            if (res.ok) {
                if (typeof this.game.updateHUD === 'function') this.game.updateHUD();
                this._renderEnchanter();
            }
        }

        _doImprintPower() {
            const eq = this._selectedEnchanterEq;
            if (!eq) { this._toast('请先选择目标装备', '#ff6666'); return; }
            const stored = this.game.player.storedPowers || [];
            if (!stored.length) { this._toast('没有库存威能', '#ff6666'); return; }
            const res = window.imprintLegendaryPower(eq, this.game.player, stored.length - 1);
            this._toast(res.ok ? '已刻印：' + res.powerName : (res.message || '失败'), res.ok ? '#88ff88' : '#ff6666');
            if (res.ok) {
                if (typeof this.game.updateHUD === 'function') this.game.updateHUD();
                this._renderEnchanter();
            }
        }

        _renderJeweler() {
            const setSel = $('jeweler-set-select');
            const slotSel = $('jeweler-slot-select');
            if (!setSel || !window.SET_DEFINITIONS_V2) return;
            const prev = setSel.value;
            setSel.innerHTML = '<option value="">-- 选择套装 --</option>';
            Object.entries(window.SET_DEFINITIONS_V2.sets || {}).forEach(([id, data]) => {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = data.name || id;
                setSel.appendChild(opt);
            });
            if (prev) setSel.value = prev;
            setSel.onchange = () => this._renderJewelerSlots();
            this._renderJewelerSlots();
        }

        _renderJewelerSlots() {
            const setSel = $('jeweler-set-select');
            const slotSel = $('jeweler-slot-select');
            if (!slotSel || !setSel) return;
            slotSel.innerHTML = '';
            const setId = setSel.value;
            if (!setId || !window.SET_DEFINITIONS_V2.sets[setId]) {
                slotSel.innerHTML = '<option value="">先选套装</option>';
                return;
            }
            (window.SET_DEFINITIONS_V2.sets[setId].slots || []).forEach(slot => {
                const opt = document.createElement('option');
                opt.value = slot;
                opt.textContent = (window.SLOT_NAMES && window.SLOT_NAMES[slot]) || slot;
                slotSel.appendChild(opt);
            });
        }

        _doSetSynth() {
            const setId = $('jeweler-set-select') && $('jeweler-set-select').value;
            const slot = $('jeweler-slot-select') && $('jeweler-slot-select').value;
            if (!setId || !slot) { this._toast('请选择套装与部位', '#ff6666'); return; }
            const res = window.synthesizeSetPiece(this.game.player, setId, slot);
            if (!res.ok) { this._toast(res.message || '合成失败', '#ff6666'); return; }
            const copy = window.EquipmentCodex && window.EquipmentCodex.cloneEquipmentForGrant
                ? window.EquipmentCodex.cloneEquipmentForGrant(res.equipment) : res.equipment;
            if (copy && this.game.addItemToInventory(copy, true)) {
                this._toast('合成成功：' + res.setName, '#88ff88');
                if (typeof this.game.updateHUD === 'function') this.game.updateHUD();
            } else this._toast('背包已满', '#ff6666');
        }

        _renderChronicle() {
            const body = $('chronicle-body');
            if (!body) return;
            const data = window.getChronicleViewData(this.game.player);
            let html = '';
            data.acts.forEach(act => {
                html += '<div class="chronicle-act"><h3>' + act.name + '</h3>';
                act.nodes.forEach(n => {
                    html += n.unlocked
                        ? '<div class="chronicle-node unlocked"><strong>' + n.title + '</strong><p>' + n.summary + '</p></div>'
                        : '<div class="chronicle-node locked"><strong>???</strong></div>';
                });
                html += '</div>';
            });
            body.innerHTML = html || '<p style="color:#888;">暂无记录</p>';
        }

        _renderAwakening() {
            const body = $('awakening-body');
            if (!body) return;
            const p = this.game.player;
            const cd = window.normalizeClassData(p.classData);
            if (!cd.firstAdvancement) {
                body.innerHTML = '<p style="color:#f88;">请先完成一转。</p>';
                return;
            }
            if (cd.secondAdvancement) {
                body.innerHTML = '<p style="color:#8f8;">觉醒已完成。</p>';
                return;
            }
            if (p.level < 40) {
                body.innerHTML = '<p style="color:#aaa;">需要 Lv.40（当前 Lv.' + p.level + '）。</p>';
                return;
            }
            const options = window.getSecondAdvancementOptions(p.classData);
            let html = '<p style="color:#8cf;margin-bottom:12px;">选择二转分支并挑战觉醒试炼</p><div class="npc-option-grid">';
            options.forEach(def => {
                html += '<div class="npc-option-card"><h4>' + def.name + '</h4><p>' + (def.description || def.role || '') + '</p>'
                    + '<button type="button" class="npc-action-btn npc-trial-btn" data-second-id="' + def.id + '">挑战试炼</button></div>';
            });
            html += '</div>';
            body.innerHTML = html;
            body.querySelectorAll('[data-second-id]').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.closeAwakening();
                    if (typeof this.game.enterTrial === 'function') {
                        this.game.enterTrial('second', btn.dataset.secondId);
                    }
                });
            });
        }
    };
})();
