/**
 * Pixel Eternal - 职业/技能 UI（Phase 2）
 */
(function () {
    'use strict';

    const BASE_CLASS_IDS = ['warrior', 'archer', 'mage', 'assassin'];

    function $(id) { return document.getElementById(id); }

    window.ClassUI = class ClassUI {
        constructor(game) {
            this.game = game;
            this._bound = false;
        }

        init() {
            if (this._bound) return;
            this._bound = true;
            this._statusBuffSig = '';
            const self = this;
            window._refreshWarlockHud = function () {
                if (self.game) self.updateWarlockCounters();
            };
            this._bindClassSelect();
            this._bindCharacterPanel();
            this._bindSkillPanel();
            this._bindSkillBar();
            this._bindStatusBuffBar();
            this._bindPlayerName();
        }

        _bindClassSelect() {
            const modal = $('class-select-modal');
            if (!modal) return;
            modal.querySelectorAll('[data-base-class]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-base-class');
                    this.confirmClassSelection(id);
                });
            });
            const closeBtn = $('class-select-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    if (window.hasPlayerClass(this.game.player.classData)) this.hideClassSelect();
                });
            }
        }

        _bindCharacterPanel() {
            const closeBtn = $('character-panel-close');
            if (closeBtn) closeBtn.addEventListener('click', () => this.hideCharacterPanel());
            const changeBtn = $('character-change-class-btn');
            if (changeBtn) {
                changeBtn.addEventListener('click', () => {
                    const cd = window.normalizeClassData(this.game.player.classData);
                    if (cd.firstAdvancement) {
                        if (typeof this.game.addFloatingText === 'function') {
                            this.game.addFloatingText(this.game.player.x, this.game.player.y, '已转职，无法更换基础职业', '#ff6666');
                        }
                        return;
                    }
                    this.showClassSelect();
                });
            }
            const talentReset = $('talent-reset-btn');
            if (talentReset) {
                talentReset.addEventListener('click', () => {
                    const res = window.resetTalents(this.game.player);
                    const msg = res.ok ? '天赋已重置' : (res.message || '失败');
                    if (typeof this.game.addFloatingText === 'function') {
                        this.game.addFloatingText(this.game.player.x, this.game.player.y, msg, res.ok ? '#88ff88' : '#ff6666');
                    }
                    if (res.ok) {
                        this.game.updateHUD();
                        this._renderCharacterPanel();
                    }
                });
            }
        }

        _bindSkillPanel() {
            const closeBtn = $('skill-panel-close');
            if (closeBtn) closeBtn.addEventListener('click', () => this.hideSkillPanel());
        }

        _bindStatusBuffBar() {
            const wrap = $('player-status-buffs');
            const tip = $('class-skill-tooltip');
            if (!wrap || !tip) return;
            wrap.addEventListener('mouseover', (e) => {
                const slot = e.target.closest('.status-buff-slot');
                if (slot) this._showStatusBuffTooltip(slot, e);
            });
            wrap.addEventListener('mouseout', (e) => {
                if (!e.relatedTarget || !wrap.contains(e.relatedTarget)) {
                    this._hideSkillTooltip();
                }
            });
            wrap.addEventListener('mousemove', (e) => this._moveSkillTooltip(e));
        }

        _showStatusBuffTooltip(slot, e) {
            const tip = $('class-skill-tooltip');
            if (!tip || !slot) return;
            const name = slot.dataset.buffName || '状态增幅';
            const summary = slot.dataset.buffSummary || '';
            const remain = slot.dataset.buffRemain || '';
            tip.innerHTML = `<div class="class-skill-tip-name">${name}</div>`
                + (summary ? `<div class="class-skill-tip-desc">${summary}</div>` : '')
                + (remain ? `<div class="class-skill-tip-meta">剩余 ${remain}</div>` : '');
            tip.style.display = 'block';
            this._moveSkillTooltip(e);
        }

        _bindSkillBar() {
            const tip = $('class-skill-tooltip');
            ['1', '2', '3', '4'].forEach(key => {
                const btn = $('class-skill-btn-' + key);
                if (btn) {
                    btn.addEventListener('click', () => this.game.useClassSkillHotbar(parseInt(key, 10) - 1));
                    if (tip) {
                        btn.addEventListener('mouseenter', (e) => this._showSkillTooltip(parseInt(key, 10) - 1, e));
                        btn.addEventListener('mouseleave', () => this._hideSkillTooltip());
                        btn.addEventListener('mousemove', (e) => this._moveSkillTooltip(e));
                    }
                }
            });
        }

        _showSkillTooltip(slotIndex, e) {
            const tip = $('class-skill-tooltip');
            if (!tip) return;
            const p = this.game.player;
            const sk = typeof window.getHotbarSkillAtSlot === 'function'
                ? window.getHotbarSkillAtSlot(p, slotIndex, {
                    labMode: this.game.currentScene === SCENE_TYPES.SKILL_LAB
                        || this.game.currentScene === SCENE_TYPES.EQUIPMENT_LAB
                })
                : (window.getPlayerHotbarSkills(p)[slotIndex] || null);
            if (!sk) {
                tip.style.display = 'none';
                return;
            }
            const desc = window.getSkillDisplayDescription(sk, p);
            const meta = window.getSkillDetailMeta(sk, p);
            tip.innerHTML = `<div class="class-skill-tip-name">${sk.name}</div>`
                + `<div class="class-skill-tip-desc">${desc}</div>`
                + (meta ? `<div class="class-skill-tip-meta">${meta}</div>` : '')
                + `<div class="class-skill-tip-key">快捷键 ${window.KeybindSystem ? window.KeybindSystem.getHotbarKeyLabel(slotIndex) : (slotIndex + 1)}</div>`;
            tip.style.display = 'block';
            this._moveSkillTooltip(e);
        }

        _hideSkillTooltip() {
            const tip = $('class-skill-tooltip');
            if (tip) tip.style.display = 'none';
        }

        _moveSkillTooltip(e) {
            const tip = $('class-skill-tooltip');
            if (!tip || tip.style.display === 'none') return;
            tip.style.left = (e.clientX + 14) + 'px';
            tip.style.top = (e.clientY - 12) + 'px';
        }

        _bindPlayerName() {
            const confirm = $('player-name-confirm');
            const input = $('player-name-input');
            if (confirm) {
                confirm.addEventListener('click', () => this.confirmPlayerName());
            }
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') this.confirmPlayerName();
                });
            }
        }

        showPlayerNameModal() {
            const modal = $('player-name-modal');
            const input = $('player-name-input');
            if (!modal) return;
            if (input) input.value = this.game.player.displayName || '冒险者';
            modal.classList.add('show');
            this.game.syncGamePausedState();
            if (input) setTimeout(() => input.focus(), 100);
        }

        hidePlayerNameModal() {
            const modal = $('player-name-modal');
            if (modal) modal.classList.remove('show');
            this.game.syncGamePausedState();
        }

        confirmPlayerName() {
            const input = $('player-name-input');
            const raw = input ? String(input.value || '').trim() : '';
            this.game.player.displayName = raw.slice(0, 12) || '冒险者';
            this.game.player.tutorialFlags = this.game.player.tutorialFlags || {};
            this.game.player.tutorialFlags.named = true;
            this.hidePlayerNameModal();
            if (typeof window.completeTutorialStep === 'function') {
                window.completeTutorialStep(this.game.player, 'need_name');
            }
            if (typeof window.notifyTutorialEvent === 'function') {
                window.notifyTutorialEvent(this.game, 'named');
            }
            if (this.game.tutorialUI) {
                this.game.tutorialUI.refresh();
                this.game.tutorialUI.beginOnboarding();
            }
        }

        showClassSelectForced() {
            const closeBtn = $('class-select-close');
            if (closeBtn) closeBtn.style.display = 'none';
            this.showClassSelect();
        }

        showClassSelect() {
            const modal = $('class-select-modal');
            if (!modal) return;
            this._renderClassSelectCards();
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
            this.game.syncGamePausedState();
        }

        hideClassSelect() {
            const modal = $('class-select-modal');
            if (!modal) return;
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
            this.game.syncGamePausedState();
        }

        confirmClassSelection(baseClassId) {
            const p = this.game.player;
            if (!p || typeof window.selectPlayerBaseClass !== 'function') return;
            if (window.selectPlayerBaseClass(p, baseClassId)) {
                this.hideClassSelect();
                this.updateAll();
                if (typeof window.completeTutorialStep === 'function') {
                    window.completeTutorialStep(p, 'need_class');
                }
                if (typeof window.notifyTutorialEvent === 'function') {
                    window.notifyTutorialEvent(this.game, 'class_selected');
                }
                if (typeof this.game.addFloatingText === 'function') {
                    const name = window.getClassDisplayName(p.classData);
                    this.game.addFloatingText(p.x, p.y, `成为${name}`, '#88ff88');
                }
                if (typeof this.game.updateHUD === 'function') this.game.updateHUD();
                p.updateStats();
                p.tutorialFlags = p.tutorialFlags || {};
                if (!p.tutorialFlags.named) {
                    this.showPlayerNameModal();
                } else if (this.game.tutorialUI) {
                    this.game.tutorialUI.beginOnboarding();
                }
            }
        }

        maybeShowClassSelectOnStart() {
            if (this.game.tutorialUI) {
                this.game.tutorialUI.beginOnboarding();
            } else if (!window.hasPlayerClass(this.game.player.classData)) {
                this.showClassSelectForced();
            }
        }

        toggleCharacterPanel() {
            const panel = $('character-panel-modal');
            if (!panel) return;
            if (panel.classList.contains('show')) this.hideCharacterPanel();
            else this.showCharacterPanel();
        }

        showCharacterPanel() {
            const panel = $('character-panel-modal');
            if (!panel) return;
            this._renderCharacterPanel();
            panel.classList.add('show');
            this.game.syncGamePausedState();
        }

        hideCharacterPanel() {
            const panel = $('character-panel-modal');
            if (panel) panel.classList.remove('show');
            this.game.syncGamePausedState();
        }

        toggleSkillPanel() {
            const panel = $('skill-panel-modal');
            if (!panel) return;
            if (panel.classList.contains('show')) this.hideSkillPanel();
            else this.showSkillPanel();
        }

        showSkillPanel() {
            const panel = $('skill-panel-modal');
            if (!panel) return;
            if (!window.hasPlayerClass(this.game.player.classData)) {
                this.showClassSelect();
                return;
            }
            this._renderSkillPanel();
            panel.classList.add('show');
            this.game.syncGamePausedState();
            if (typeof window.notifyTutorialEvent === 'function') {
                window.notifyTutorialEvent(this.game, 'open_skill_panel');
            }
            if (this.game.tutorialUI) this.game.tutorialUI.refresh();
        }

        hideSkillPanel() {
            const panel = $('skill-panel-modal');
            if (panel) panel.classList.remove('show');
            this.game.syncGamePausedState();
        }

        _anyModalOpen() {
            return ['class-select-modal', 'character-panel-modal', 'skill-panel-modal'].some(id => {
                const el = $(id);
                return el && el.classList.contains('show');
            });
        }

        _renderClassSelectCards() {
            const grid = $('class-select-grid');
            if (!grid || !window.CLASS_CONFIG) return;
            grid.innerHTML = '';
            BASE_CLASS_IDS.forEach(id => {
                const def = window.CLASS_CONFIG.baseClasses[id];
                if (!def) return;
                const card = document.createElement('div');
                card.className = 'class-select-card';
                const stats = def.baseStats || {};
                const skills = (def.skills || []).slice(0, 4).map(sid => {
                    const sk = window.getSkillDefinition && window.getSkillDefinition(`${id}_basic`) || null;
                    return sk ? sk.name : sid;
                });
                card.innerHTML = `
                    <h3>${def.name}</h3>
                    <p class="class-select-role">${def.role || ''} · ${def.description || ''}</p>
                    <div class="class-select-stats">
                        <span>HP ${stats.hp}</span><span>ATK ${stats.attack}</span>
                        <span>MATK ${stats.magicAttack}</span><span>SPD ${stats.speed}</span>
                    </div>
                    <button type="button" class="pe-btn pe-btn--primary" data-base-class="${id}">选择 ${def.name}</button>
                `;
                card.querySelector('button').addEventListener('click', () => this.confirmClassSelection(id));
                grid.appendChild(card);
            });
        }

        _renderCharacterPanel() {
            const p = this.game.player;
            if (!p) return;
            const nameEl = $('char-panel-class-name');
            const treeEl = $('char-panel-class-tree');
            const statsEl = $('char-panel-stats');
            if (nameEl) nameEl.textContent = window.getClassDisplayName(p.classData);
            const changeBtn = $('character-change-class-btn');
            const cd = window.normalizeClassData(p.classData);
            if (changeBtn) {
                changeBtn.textContent = cd.baseClass ? '更换基础职业' : '选择职业';
                changeBtn.style.display = cd.firstAdvancement ? 'none' : '';
            }
            if (treeEl) {
                if (!cd.baseClass) {
                    treeEl.innerHTML = '<p style="color:#888;font-size:12px;">尚未选择职业，点击下方按钮选职。</p>';
                } else {
                    const lines = [];
                    const b = window.getClassDefinition(cd.baseClass);
                    lines.push(`<div class="class-tree-node active">${b ? b.name : cd.baseClass} (基础)</div>`);
                    if (cd.firstAdvancement) {
                        const f = window.getClassDefinition(cd.firstAdvancement);
                        const fc = f && f.themeColor ? f.themeColor : '#88ff88';
                        const fl = f && f.themeLabel ? ` · ${f.themeLabel}` : '';
                        lines.push(`<div class="class-tree-node active" style="color:${fc}">→ ${f ? f.name : cd.firstAdvancement} (一转)${fl}</div>`);
                    } else if (p.level >= 20) {
                        lines.push('<div class="class-tree-node locked">→ 一转（待转职）</div>');
                    }
                    if (cd.secondAdvancement) {
                        const s = window.getClassDefinition(cd.secondAdvancement);
                        const sc = s && s.themeColor ? s.themeColor : '#88ff88';
                        lines.push(`<div class="class-tree-node active" style="color:${sc}">→ ${s ? s.name : cd.secondAdvancement} (二转)</div>`);
                    } else if (p.level >= 40 && cd.firstAdvancement) {
                        lines.push('<div class="class-tree-node locked">→ 二转（待觉醒）</div>');
                    }
                    treeEl.innerHTML = lines.join('');
                }
            }
            if (statsEl) {
                statsEl.innerHTML = `
                    <div class="char-stat-row"><span>等级</span><span>${p.level}</span></div>
                    <div class="char-stat-row"><span>生命</span><span>${Math.floor(p.hp)} / ${p.maxHp}</span></div>
                    <div class="char-stat-row"><span>攻击力</span><span>${p.baseAttack != null ? p.baseAttack : '-'}</span></div>
                    <div class="char-stat-row"><span>魔法攻击</span><span>${p.baseMagicAttack != null ? p.baseMagicAttack : '-'}</span></div>
                    <div class="char-stat-row"><span>防御</span><span>${p.baseDefense != null ? p.baseDefense : '-'}</span></div>
                    <div class="char-stat-row"><span>魔法防御</span><span>${p.baseMagicDefense != null ? p.baseMagicDefense : '-'}</span></div>
                    <div class="char-stat-row"><span>暴击率</span><span>${p.baseCritRate}%</span></div>
                    <div class="char-stat-row"><span>闪避</span><span>${p.baseDodge}%</span></div>
                    <div class="char-stat-row"><span>战力</span><span style="color:#ffd700">${p.combatPower || 0}</span></div>
                `;
            }
            this._renderTalentPanel(p);
        }

        _renderTalentPanel(p) {
            const wrap = $('char-panel-talents');
            const ptsEl = $('char-panel-talent-points');
            if (!wrap) return;
            if (!window.hasTalentSystemUnlocked(p)) {
                wrap.innerHTML = '<p style="color:#888;font-size:12px;">完成二转（Lv40）后解锁天赋树</p>';
                if (ptsEl) ptsEl.textContent = '';
                return;
            }
            const avail = window.getAvailableTalentPoints(p);
            const earned = window.getTotalEarnedTalentPoints(p);
            if (ptsEl) ptsEl.textContent = `剩余 ${avail} / ${earned}`;
            const tree = window.getTalentTreeForPlayer(p);
            if (!tree) {
                wrap.innerHTML = '<p style="color:#888;">天赋配置未加载</p>';
                return;
            }
            const alloc = p.talentAllocations || {};
            let html = '';
            (tree.branches || []).forEach(branch => {
                html += `<div class="talent-branch"><h4>${branch.name}</h4><div class="talent-nodes">`;
                (branch.nodes || []).forEach(node => {
                    const on = !!alloc[node.id];
                    const can = window.canAllocateTalent(p, node.id);
                    const locked = !on && !can.ok;
                    html += `<button type="button" class="talent-node${on ? ' active' : ''}${locked ? ' locked' : ''}" data-talent-id="${node.id}" title="${node.name}${node.ultimate ? '（终极）' : ''}">${node.tier}${on ? '✓' : ''}</button>`;
                });
                html += '</div></div>';
            });
            wrap.innerHTML = html;
            wrap.querySelectorAll('[data-talent-id]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.dataset.talentId;
                    const isOn = alloc[id];
                    const res = isOn ? window.deallocateTalent(p, id) : window.allocateTalent(p, id);
                    if (!res.ok && typeof this.game.addFloatingText === 'function') {
                        this.game.addFloatingText(p.x, p.y, res.message || '无法操作', '#ff6666');
                    }
                    if (res.ok) {
                        this.game.updateHUD();
                        this._renderCharacterPanel();
                    }
                });
            });
        }

        _renderSkillPanel() {
            const list = $('skill-panel-list');
            if (!list) return;
            const p = this.game.player;
            window.migratePlayerSkillHotbar(p);
            this._renderSkillHotbarEditor(p);
            const unlocked = window.getUnlockedSkillsForPlayer(p);
            const allProg = window.getPlayerSkillProgression(p.classData);
            const level = p.level;
            const slots = (window.SKILL_CONFIG && window.SKILL_CONFIG.slotUnlockLevels) || [];
            list.innerHTML = '';
            allProg.forEach((skillId, idx) => {
                const def = window.getSkillDefinition(skillId);
                if (!def) return;
                const displayDef = window.getResolvedSkillForPlayer(p, def)
                    || window.resolveEvolvedSkill(def, p.classData, level) || def;
                const reqLv = displayDef.unlockLevel || slots[idx] || 1;
                const isUnlocked = level >= reqLv;
                const enhLv = window.getSkillEnhanceLevel(p, displayDef.id);
                const row = document.createElement('div');
                row.className = 'skill-panel-row' + (isUnlocked ? '' : ' locked');
                const desc = window.getSkillDisplayDescription(displayDef, p);
                const meta = window.getSkillDetailMeta(displayDef, p);
                const hotbar = window.getPlayerHotbarSkills(p);
                const hotIdx = hotbar.findIndex(s => s && s.id === displayDef.id);
                const keyLabel = hotIdx >= 0 && window.KeybindSystem
                    ? window.KeybindSystem.getHotbarKeyLabel(hotIdx)
                    : (hotIdx >= 0 ? String(hotIdx + 1) : '');
                const bindHint = hotIdx >= 0 ? `<span class="skill-panel-bind">快捷键 ${keyLabel}</span>` : '';
                row.innerHTML = `
                    <div class="skill-panel-row-head">
                        <strong>${displayDef.name}</strong>
                        <span>Lv${reqLv} · ${displayDef.type === 'passive' ? '被动' : '主动'}${bindHint}</span>
                    </div>
                    <p class="skill-panel-desc">${desc}</p>
                    <p class="skill-panel-meta">${meta || `CD ${(displayDef.cooldownMs / 1000).toFixed(1)}s · 倍率 ${displayDef.damageMultiplier}x · 强化 +${enhLv}`}</p>
                `;
                const actions = document.createElement('div');
                actions.className = 'skill-panel-actions';
                if (isUnlocked && window.isSkillHotbarEligible(displayDef)) {
                    const bindWrap = document.createElement('div');
                    bindWrap.className = 'skill-panel-bind-row';
                    bindWrap.innerHTML = '<span class="skill-panel-bind-label">装备至</span>';
                    for (let i = 0; i < 4; i++) {
                        const keyLabel = window.KeybindSystem
                            ? window.KeybindSystem.getHotbarKeyLabel(i)
                            : String(i + 1);
                        const b = document.createElement('button');
                        b.type = 'button';
                        b.className = 'skill-panel-bind-btn' + (hotIdx === i ? ' active' : '');
                        b.textContent = keyLabel;
                        b.title = `绑定到快捷键 ${keyLabel}`;
                        b.addEventListener('click', () => {
                            const r = window.assignSkillToHotbar(p, i, displayDef.id);
                            if (r.ok) {
                                this._renderSkillPanel();
                                this.updateSkillBar();
                            } else if (r.msg && typeof this.game.addFloatingText === 'function') {
                                this.game.addFloatingText(p.x, p.y, r.msg, '#ff6666');
                            }
                        });
                        bindWrap.appendChild(b);
                    }
                    actions.appendChild(bindWrap);
                }
                if (isUnlocked && displayDef.type === 'active') {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'pe-btn pe-btn--info pe-btn--sm';
                    btn.textContent = enhLv >= 5 ? '已满强化' : `强化 (+${enhLv})`;
                    btn.disabled = enhLv >= 5;
                    btn.addEventListener('click', () => {
                        const r = window.tryEnhanceSkill(p, displayDef.id);
                        if (r.ok) {
                            this._renderSkillPanel();
                            if (typeof this.game.updateHUD === 'function') this.game.updateHUD();
                        } else if (r.msg && typeof this.game.addFloatingText === 'function') {
                            this.game.addFloatingText(p.x, p.y, r.msg, '#ff6666');
                        }
                    });
                    actions.appendChild(btn);
                }
                if (actions.childElementCount) row.appendChild(actions);
                list.appendChild(row);
            });
        }

        _renderSkillHotbarEditor(p) {
            const wrap = $('skill-panel-hotbar-edit');
            if (!wrap) return;
            const hotbar = window.getPlayerHotbarSkills(p);
            let html = '<div class="skill-hotbar-edit-title">快捷栏装配</div><div class="skill-hotbar-edit-slots">';
            for (let i = 0; i < 4; i++) {
                const sk = hotbar[i];
                const keyLabel = window.KeybindSystem
                    ? window.KeybindSystem.getHotbarKeyLabel(i)
                    : String(i + 1);
                const label = sk ? sk.name : '空';
                html += `<button type="button" class="skill-hotbar-edit-slot${sk ? '' : ' empty'}" data-hotbar-slot="${i}" title="点击清空键位 ${keyLabel}">`
                    + `<span class="skill-hotbar-edit-key">${keyLabel}</span>`
                    + `<span class="skill-hotbar-edit-name">${label}</span>`
                    + `</button>`;
            }
            html += '</div><p class="skill-hotbar-edit-hint">在下方点击键位按钮将技能绑定到对应快捷键</p>';
            wrap.innerHTML = html;
            wrap.querySelectorAll('[data-hotbar-slot]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.hotbarSlot, 10);
                    const r = window.assignSkillToHotbar(p, idx, null);
                    if (r.ok) {
                        this._renderSkillPanel();
                        this.updateSkillBar();
                    }
                });
            });
        }

        updateSkillBar() {
            const p = this.game.player;
            const bar = $('class-skill-bar');
            if (!bar) return;
            if (!window.hasPlayerClass(p.classData)) {
                bar.style.display = 'none';
                return;
            }
            bar.style.display = 'flex';
            const hotbar = window.getPlayerHotbarSkills(p);
            for (let i = 0; i < 4; i++) {
                const btn = $('class-skill-btn-' + (i + 1));
                const cdEl = $('class-skill-cd-' + (i + 1));
                const sk = typeof window.getHotbarSkillAtSlot === 'function'
                    ? window.getHotbarSkillAtSlot(p, i, {
                        labMode: this.game.currentScene === SCENE_TYPES.SKILL_LAB
                            || this.game.currentScene === SCENE_TYPES.EQUIPMENT_LAB
                    })
                    : hotbar[i];
                if (!btn) continue;
                if (sk) {
                    const desc = window.getSkillDisplayDescription(sk, p);
                    const keyLabel = window.KeybindSystem
                        ? window.KeybindSystem.getHotbarKeyLabel(i)
                        : String(i + 1);
                    btn.title = `[${keyLabel}] ${sk.name} — ${desc}`;
                    btn.dataset.skillId = sk.id;
                    if (sk._beastPackDisplayPhase) {
                        btn.dataset.beastPhase = sk._beastPackDisplayPhase;
                    } else {
                        delete btn.dataset.beastPhase;
                    }
                    const keyEl = btn.querySelector('.class-skill-key');
                    if (keyEl) keyEl.textContent = keyLabel;
                    btn.querySelector('.class-skill-label').textContent = sk.name.length > 4 ? sk.name.slice(0, 4) : sk.name;
                    btn.disabled = false;
                    btn.classList.remove('empty');
                    const rem = window.getSkillCooldownRemaining(p, sk.id);
                    const pct = sk.cooldownMs > 0 ? rem / sk.cooldownMs : 0;
                    if (cdEl) {
                        cdEl.style.height = (pct * 100) + '%';
                        cdEl.style.display = rem > 0 ? 'block' : 'none';
                    }
                } else {
                    btn.title = '未解锁';
                    btn.querySelector('.class-skill-label').textContent = '-';
                    btn.classList.add('empty');
                    if (cdEl) cdEl.style.display = 'none';
                }
            }
        }

        updateResourceBar() {
            const fill = $('class-resource-fill');
            const text = $('class-resource-text');
            const wrap = $('class-resource-bar');
            const precRow = $('precision-stack-row');
            const precDots = $('precision-stack-dots');
            if (!fill || !wrap) return;
            const st = window.getPlayerResourceState(this.game.player);
            if (!st.family) {
                wrap.style.display = 'none';
                if (precRow) precRow.style.display = 'none';
                return;
            }
            wrap.style.display = 'flex';
            const pct = st.max > 0 ? (st.current / st.max) * 100 : 0;
            fill.style.width = pct + '%';
            fill.dataset.family = st.family;
            if (text) {
                text.textContent = `${Math.floor(st.current)}/${st.max}`;
                if (typeof window.isAssassinTreePlayer === 'function'
                    && window.isAssassinTreePlayer(this.game.player)) {
                    const sec = typeof window.getAssassinSecondaryResource === 'function'
                        ? window.getAssassinSecondaryResource(this.game.player) : null;
                if (sec && sec.type) {
                    // 骗术师的幻象值暂不显示
                    if (sec.type !== 'illusion') {
                        const labels = { combo_point: '连击', catalyst: '催化' };
                        text.textContent += ` · ${labels[sec.type] || sec.type} ${Math.floor(sec.current || 0)}/${sec.max}`;
                    }
                }
                    const combo = this.game.player._shadowCombo || 0;
                    if (combo > 0) text.title = `影之连击 ${combo}`;
                }
                text.dataset.family = st.family;
                const theme = window.getClassThemeColor && window.getClassThemeColor(this.game.player.classData);
                if (theme) text.style.color = theme;
            }
            const phaseEl = $('element-phase-indicator');
            if (phaseEl && typeof window.getElementPhase === 'function') {
                const phase = window.getElementPhase(this.game.player);
                const showWizard = typeof window.isWizardTreePlayer === 'function'
                    && window.isWizardTreePlayer(this.game.player);
                const showMage = typeof window.isBaseMagePhasePlayer === 'function'
                    && window.isBaseMagePhasePlayer(this.game.player);
                if (phase && (showWizard || showMage)) {
                    phaseEl.style.display = 'block';
                    const isArchmage = showWizard && typeof window.getActiveClassId === 'function'
                        && window.getActiveClassId(this.game.player.classData) === 'archmage';
                    const bridgeActive = isArchmage && typeof window.isInBridgeWindow === 'function'
                        && window.isInBridgeWindow(this.game.player);
                    phaseEl.textContent = phase === 'fire' ? '灼热相位'
                        : phase === 'frost' ? '极寒相位'
                        : phase === 'overload' ? '过载相位'
                        : phase === 'awakening' ? (isArchmage ? '化身相位' : '觉醒相位')
                        : phase === 'arctic' ? '极寒相位' : phase;
                    if (bridgeActive) {
                        const fusion = typeof window.getBridgeFusionType === 'function'
                            ? window.getBridgeFusionType(this.game.player) : null;
                        const fusionLabel = fusion === 'magma' ? '熔岩桥'
                            : fusion === 'tempest' ? '暴风桥' : fusion === 'plasma' ? '等离子桥' : '桥接';
                        phaseEl.textContent += ' · ' + fusionLabel;
                    }
                    phaseEl.dataset.phase = phase;
                } else if (phaseEl) {
                    phaseEl.style.display = 'none';
                }
            }
            const showPrec = typeof window.isMarksmanTreePlayer === 'function'
                && window.isMarksmanTreePlayer(this.game.player);
            if (precRow && precDots) {
                if (showPrec) {
                    precRow.style.display = 'flex';
                    const stacks = typeof window.getPrecisionStacks === 'function'
                        ? window.getPrecisionStacks(this.game.player) : 0;
                    const hold = typeof window.getPrecisionHoldBonuses === 'function'
                        ? window.getPrecisionHoldBonuses(this.game.player) : { attackPercent: 0, critRate: 0 };
                    let dots = '';
                    const maxPrec = typeof window.getMaxPrecisionStacks === 'function'
                        ? window.getMaxPrecisionStacks() : 5;
                    for (let i = 0; i < maxPrec; i++) {
                        dots += `<span class="precision-dot${i < stacks ? ' active' : ''}"></span>`;
                    }
                    if (hold.attackPercent > 0 || hold.critRate > 0) {
                        dots += `<span class="precision-hold-bonus">+${hold.attackPercent}%攻 +${hold.critRate}%暴</span>`;
                    }
                    precDots.innerHTML = dots;
                } else {
                    precRow.style.display = 'none';
                    precDots.innerHTML = '';
                }
            }
            this.updateWarlockCounters();
            this.updateSurgeIndicator();
            this.updateWizardResonanceIndicator();
            this.updateArchmageBridgeIndicator();
        }

        updateArchmageBridgeIndicator() {
            const row = $('archmage-bridge-row');
            const fill = $('archmage-bridge-fill');
            const hint = $('archmage-fusion-hint');
            const player = this.game && this.game.player;
            if (!row || !fill || !hint || !player) return;
            const isArchmage = typeof window.getActiveClassId === 'function'
                && window.getActiveClassId(player.classData) === 'archmage';
            if (!isArchmage) {
                row.style.display = 'none';
                return;
            }
            const bridgeRem = typeof window.getArchmageBridgeRemaining === 'function'
                ? window.getArchmageBridgeRemaining(player) : 0;
            const bridgeMax = typeof window.getArchmageBridgeMaxMs === 'function'
                ? window.getArchmageBridgeMaxMs(player) : 3000;
            const fusionLabel = typeof window.getArchmageFusionLabel === 'function'
                ? window.getArchmageFusionLabel(player) : null;
            const stacks = typeof window.getWizardResonanceStacks === 'function'
                ? window.getWizardResonanceStacks(player) : 0;

            if (bridgeRem <= 0 || !fusionLabel) {
                row.style.display = 'none';
                hint.textContent = '';
                hint.classList.remove('ready');
                return;
            }
            row.style.display = 'flex';
            const pct = bridgeMax > 0 ? (bridgeRem / bridgeMax) * 100 : 0;
            fill.style.width = pct + '%';
            fill.classList.toggle('sanctuary', !!player._triSanctuaryActive);
            hint.textContent = fusionLabel;
            hint.classList.toggle('ready', stacks >= 1);
            hint.title = stacks >= 1
                ? '长按元素熔爆 ≥0.4s 可释放' + fusionLabel
                : '需要至少 1 层共鸣才能熔合';
        }

        updateWizardResonanceIndicator() {
            const row = $('surge-stack-row');
            const dotsEl = $('surge-stack-dots');
            const timerEl = $('surge-awakening-timer');
            const player = this.game && this.game.player;
            const showMage = player && typeof window.isBaseMagePhasePlayer === 'function'
                && window.isBaseMagePhasePlayer(player);
            if (showMage) return;
            const showWizard = player && typeof window.isWizardTreePlayer === 'function'
                && window.isWizardTreePlayer(player)
                && typeof window.getActiveClassId === 'function'
                && (window.getActiveClassId(player.classData) === 'wizard'
                    || window.getActiveClassId(player.classData) === 'archmage');
            if (!row || !dotsEl || !showWizard) return;
            const isArchmage = window.getActiveClassId(player.classData) === 'archmage';
            const labelEl = row.querySelector('.surge-stack-label');
            if (labelEl) labelEl.textContent = '共鸣';
            const stacks = typeof window.getWizardResonanceStacks === 'function'
                ? window.getWizardResonanceStacks(player) : 0;
            const libRem = typeof window.getWizardLiberationRemaining === 'function'
                ? window.getWizardLiberationRemaining(player) : 0;
            const awakenRem = typeof window.getWizardAwakeningRemaining === 'function'
                ? window.getWizardAwakeningRemaining(player) : 0;
            const bridgeRem = isArchmage && typeof window.getArchmageBridgeRemaining === 'function'
                ? window.getArchmageBridgeRemaining(player) : 0;
            const riftRem = isArchmage && typeof window.getArchmageRiftRemaining === 'function'
                ? window.getArchmageRiftRemaining(player) : 0;
            if (stacks <= 0 && libRem <= 0 && awakenRem <= 0 && bridgeRem <= 0 && riftRem <= 0) {
                row.style.display = 'none';
                dotsEl.innerHTML = '';
                if (timerEl) timerEl.textContent = '';
                return;
            }
            row.style.display = 'flex';
            let dots = '';
            if (awakenRem > 0 || libRem > 0) {
                for (let i = 0; i < 4; i++) {
                    dots += '<span class="surge-dot active tier-gold"></span>';
                }
            } else {
                for (let i = 0; i < 4; i++) {
                    const active = i < stacks;
                    const gold = active && stacks >= 4;
                    dots += `<span class="surge-dot${active ? ' active' : ''}${gold ? ' tier-gold' : ''}"></span>`;
                }
            }
            dotsEl.innerHTML = dots;
            if (timerEl) {
                if (awakenRem > 0) {
                    timerEl.textContent = (isArchmage ? '化身 ' : '觉醒 ') + (awakenRem / 1000).toFixed(1) + 's';
                } else if (libRem > 0) {
                    timerEl.textContent = '解放 ' + (libRem / 1000).toFixed(1) + 's';
                } else if (bridgeRem > 0) {
                    const fusionLabel = typeof window.getArchmageFusionLabel === 'function'
                        ? window.getArchmageFusionLabel(player) : null;
                    timerEl.textContent = '桥接 ' + (bridgeRem / 1000).toFixed(1) + 's'
                        + (fusionLabel ? ' · ' + fusionLabel : '');
                } else if (riftRem > 0) {
                    timerEl.textContent = '裂隙 ' + (riftRem / 1000).toFixed(1) + 's · 连按返回';
                } else {
                    timerEl.textContent = stacks >= 3 ? '即将解放' : (stacks > 0 ? '共鸣' : '');
                }
            }
        }

        updateSurgeIndicator() {
            const row = $('surge-stack-row');
            const dotsEl = $('surge-stack-dots');
            const timerEl = $('surge-awakening-timer');
            const player = this.game && this.game.player;
            const show = player && typeof window.isBaseMagePhasePlayer === 'function'
                && window.isBaseMagePhasePlayer(player);
            if (!row || !dotsEl) return;
            if (!show) {
                row.style.display = 'none';
                dotsEl.innerHTML = '';
                if (timerEl) timerEl.textContent = '';
                return;
            }
            const stacks = typeof window.getBaseMageSurgeStacks === 'function'
                ? window.getBaseMageSurgeStacks(player) : 0;
            const awakenRem = typeof window.getBaseMageSurgeAwakeningRemaining === 'function'
                ? window.getBaseMageSurgeAwakeningRemaining(player) : 0;
            if (stacks <= 0 && awakenRem <= 0) {
                row.style.display = 'none';
                dotsEl.innerHTML = '';
                if (timerEl) timerEl.textContent = '';
                return;
            }
            row.style.display = 'flex';
            let dots = '';
            if (awakenRem > 0) {
                for (let i = 0; i < 4; i++) {
                    dots += '<span class="surge-dot active tier-gold"></span>';
                }
            } else {
                for (let i = 0; i < 4; i++) {
                    const active = i < stacks;
                    const gold = active && stacks >= 3;
                    dots += `<span class="surge-dot${active ? ' active' : ''}${gold ? ' tier-gold' : ''}"></span>`;
                }
            }
            dotsEl.innerHTML = dots;
            if (timerEl) {
                if (awakenRem > 0) {
                    timerEl.textContent = '觉醒 ' + (awakenRem / 1000).toFixed(1) + 's';
                } else {
                    timerEl.textContent = stacks >= 2 ? (stacks >= 3 ? '共振' : '回响') : '';
                }
            }
        }

        updateWarlockCounters() {
            const soulRow = $('warlock-soul-row');
            const soulEl = $('soul-shard-counter');
            const undeadRow = $('undead-legion-row');
            const undeadEl = $('undead-legion-counter');
            const player = this.game && this.game.player;
            const isWarlock = player && typeof window.isWarlockTreePlayer === 'function'
                && window.isWarlockTreePlayer(player);
            const st = player && typeof window.getPlayerResourceState === 'function'
                ? window.getPlayerResourceState(player) : null;
            if (soulRow && soulEl) {
                if (isWarlock && st && st.family === 'soul_shard_v2') {
                    soulRow.style.display = 'flex';
                    const burn = typeof window.isSoulBurning === 'function' && window.isSoulBurning(player);
                    const cur = Math.floor(st.current);
                    const max = st.max || 8;
                    soulEl.textContent = burn ? (cur + '🔥/' + max) : (cur + '/' + max);
                    soulEl.title = burn ? '灵魂燃烧中' : ('灵魂碎片 ' + cur + '/' + max);
                } else {
                    soulRow.style.display = 'none';
                }
            }
            if (undeadRow && undeadEl) {
                if (!isWarlock || !player) {
                    undeadRow.style.display = 'none';
                } else {
                    let n = 0;
                    const g = this.game;
                    if (g && g._skillEntities && g._skillEntities.summons) {
                        n = g._skillEntities.summons.filter(
                            s => s && s.owner === player && s.isUndead && s.hp > 0
                        ).length;
                    }
                    undeadRow.style.display = n > 0 ? 'flex' : 'none';
                    undeadEl.textContent = String(n);
                }
            }
            const resonanceRow = $('death-resonance-row');
            const resonanceEl = $('death-resonance-counter');
            if (resonanceRow && resonanceEl) {
                const isNecro = player && typeof window.getDeathResonanceStacks === 'function'
                    && typeof window.getActiveClassId === 'function'
                    && window.getActiveClassId(player.classData) === 'necromancer';
                if (isNecro) {
                    const stacks = window.getDeathResonanceStacks(player);
                    resonanceRow.style.display = 'flex';
                    resonanceEl.textContent = stacks + '/5';
                    resonanceEl.title = stacks >= 5
                        ? '死者共鸣已满：下次灵魂收割免费且×1.5伤害'
                        : ('死者共鸣 ' + stacks + '/5：死亡缠绕命中诅咒目标叠层');
                    resonanceEl.classList.toggle('resonance-full', stacks >= 5);
                } else {
                    resonanceRow.style.display = 'none';
                    resonanceEl.classList.remove('resonance-full');
                }
            }
        }

        updateStatusBuffs() {
            const wrap = $('player-status-buffs');
            if (!wrap || !this.game || !this.game.player) return;
            const now = Date.now();
            const collect = window.collectPlayerHudStatusBuffs;
            const buffs = typeof collect === 'function'
                ? collect(this.game.player, now)
                : [];
            if (!buffs.length) {
                wrap.style.display = 'none';
                wrap.innerHTML = '';
                this._statusBuffSig = '';
                return;
            }
            wrap.style.display = 'flex';
            const sig = buffs.map(b => b.id || b.name).join('|');
            if (sig !== this._statusBuffSig) {
                this._statusBuffSig = sig;
                wrap.innerHTML = '';
                buffs.forEach(buff => {
                    const slot = document.createElement('div');
                    slot.className = 'status-buff-slot';
                    slot.dataset.buffId = buff.id || buff.name;
                    slot.dataset.buffName = buff.name || buff.id || '状态增幅';
                    slot.dataset.buffSummary = typeof window.formatStatusBuffEffectSummary === 'function'
                        ? window.formatStatusBuffEffectSummary(buff)
                        : '';
                    slot.dataset.buffCategory = buff.hudCategory || 'buff';
                    const iconUrl = typeof window.getStatusBuffIconUrl === 'function'
                        ? window.getStatusBuffIconUrl(this.game, buff)
                        : null;
                    if (iconUrl) {
                        slot.style.backgroundImage = `url("${iconUrl}")`;
                    } else {
                        const label = (buff.name || '?').slice(0, 1);
                        slot.innerHTML = `<span class="status-buff-fallback">${label}</span>`;
                    }
                    const cd = document.createElement('span');
                    cd.className = 'status-buff-cd';
                    slot.appendChild(cd);
                    const timer = document.createElement('span');
                    timer.className = 'status-buff-timer';
                    slot.appendChild(timer);
                    wrap.appendChild(slot);
                });
            }
            buffs.forEach((buff, i) => {
                const slot = wrap.children[i];
                if (!slot) return;
                const rem = Math.max(0, buff.expireTime - now);
                let total = parseFloat(slot.dataset.buffDurationMs);
                if (!total || total < rem) {
                    total = rem;
                    slot.dataset.buffDurationMs = String(total);
                }
                const pct = total > 0 ? rem / total : 0;
                const cd = slot.querySelector('.status-buff-cd');
                if (cd) cd.style.height = ((1 - pct) * 100) + '%';
                const timer = slot.querySelector('.status-buff-timer');
                if (timer) {
                    timer.textContent = rem > 3000 ? Math.ceil(rem / 1000) + 's' : (rem / 1000).toFixed(1);
                }
                slot.dataset.buffRemain = rem > 3000
                    ? Math.ceil(rem / 1000) + ' 秒'
                    : (rem / 1000).toFixed(1) + ' 秒';
            });
        }

        updateAll() {
            this.updateResourceBar();
            this.updateWarlockCounters();
            this.updateSkillBar();
            this.updateStatusBuffs();
        }
    };
})();
