/**
 * 技能实验场 UI — 职业预览、技能装配快捷栏、假人管理
 */
(function () {
    'use strict';

    function parseClassOptionValue(value) {
        if (!value) return null;
        const parts = String(value).split('|');
        return {
            baseClass: parts[0] || null,
            firstAdvancement: parts[1] || null,
            secondAdvancement: parts[2] || null
        };
    }

    function encodeClassOptionValue(base, first, second) {
        return [base || '', first || '', second || ''].join('|');
    }

    window.getSkillLabSkillList = function getSkillLabSkillList(classData, level) {
        const prog = window.getPlayerSkillProgression(classData);
        const seen = new Set();
        const result = [];
        const lv = Math.max(1, level | 0);
        prog.forEach(skillId => {
            const def = window.getSkillDefinition(skillId);
            if (!def) return;
            const resolved = window.resolveEvolvedSkill(def, classData, lv);
            if (seen.has(resolved.id)) return;
            seen.add(resolved.id);
            result.push(resolved);
        });
        return result.sort((a, b) => (a.unlockLevel || 0) - (b.unlockLevel || 0));
    };

    window.applySkillLabPlayerConfig = function applySkillLabPlayerConfig(player, classData, level) {
        if (!player || !classData || !classData.baseClass) return false;
        player.classData = window.normalizeClassData(classData);
        player.level = Math.max(1, Math.min(999, level | 0));
        player.skillCooldowns = {};
        window.initPlayerClassResource(player);
        if (player.classResource) {
            player.classResource.current = player.classResource.max;
        }
        if (!player.skillHotbar || player.skillHotbar.length !== 4) {
            window.initPlayerSkillHotbar(player);
        }
        if (typeof player.updateStats === 'function') player.updateStats();
        return true;
    };

    class SkillLabUI {
        constructor(game) {
            this.game = game;
            this._bound = false;
            this._selectedClassValue = '';
            this._selectedLevel = 60;
        }

        bindOnce() {
            if (this._bound) return;
            this._bound = true;

            const closeBtn = document.getElementById('close-skill-lab');
            if (closeBtn) closeBtn.addEventListener('click', () => this.close());

            const classSelect = document.getElementById('skill-lab-class-select');
            if (classSelect) {
                classSelect.addEventListener('change', () => {
                    this._selectedClassValue = classSelect.value;
                    this.applySelectedConfig();
                });
            }

            const levelInput = document.getElementById('skill-lab-level');
            if (levelInput) {
                levelInput.addEventListener('change', () => {
                    this._selectedLevel = parseInt(levelInput.value, 10) || 60;
                    this.applySelectedConfig();
                });
            }

            const applyBtn = document.getElementById('skill-lab-apply-class');
            if (applyBtn) applyBtn.addEventListener('click', () => this.applySelectedConfig());

            const resetCdBtn = document.getElementById('skill-lab-reset-cd');
            if (resetCdBtn) resetCdBtn.addEventListener('click', () => this.resetCooldowns());

            const fillResBtn = document.getElementById('skill-lab-fill-resource');
            if (fillResBtn) fillResBtn.addEventListener('click', () => this.fillResource());

            const spawnBtn = document.getElementById('skill-lab-spawn-dummy');
            if (spawnBtn) spawnBtn.addEventListener('click', () => this.spawnDummyAtPlayer());

            const clearBtn = document.getElementById('skill-lab-clear-dummies');
            if (clearBtn) clearBtn.addEventListener('click', () => this.clearDummies());
        }

        populateClassSelect() {
            const select = document.getElementById('skill-lab-class-select');
            if (!select) return;
            const cfg = window.CLASS_CONFIG;
            if (!cfg) return;

            select.innerHTML = '';
            const bases = cfg.baseClasses || {};
            Object.keys(bases).forEach(baseId => {
                const base = bases[baseId];
                const opt = document.createElement('option');
                opt.value = encodeClassOptionValue(baseId, null, null);
                opt.textContent = `${base.name || baseId}（基础）`;
                select.appendChild(opt);
            });

            const firsts = cfg.firstAdvancements || {};
            Object.keys(firsts).forEach(firstId => {
                const first = firsts[firstId];
                const opt = document.createElement('option');
                opt.value = encodeClassOptionValue(first.baseClass, firstId, null);
                opt.textContent = `${first.name || firstId}（一转 · Lv20+）`;
                select.appendChild(opt);
            });

            const seconds = cfg.secondAdvancements || {};
            Object.keys(seconds).forEach(secondId => {
                const sec = seconds[secondId];
                const first = firsts[sec.firstAdvancement];
                const baseId = first ? first.baseClass : null;
                const opt = document.createElement('option');
                opt.value = encodeClassOptionValue(baseId, sec.firstAdvancement, secondId);
                opt.textContent = `${sec.name || secondId}（二转 · Lv40+）`;
                select.appendChild(opt);
            });
        }

        applyDefaults() {
            this.populateClassSelect();
            const p = this.game.player;
            const select = document.getElementById('skill-lab-class-select');
            const levelInput = document.getElementById('skill-lab-level');

            if (p && window.hasPlayerClass(p.classData)) {
                const cd = window.normalizeClassData(p.classData);
                this._selectedClassValue = encodeClassOptionValue(
                    cd.baseClass,
                    cd.firstAdvancement,
                    cd.secondAdvancement
                );
                this._selectedLevel = p.level || 60;
            } else {
                this._selectedClassValue = encodeClassOptionValue('warrior', null, null);
                this._selectedLevel = 60;
            }

            if (select) select.value = this._selectedClassValue;
            if (levelInput) levelInput.value = String(this._selectedLevel);
            this.applySelectedConfig();
        }

        applySelectedConfig() {
            const select = document.getElementById('skill-lab-class-select');
            const levelInput = document.getElementById('skill-lab-level');
            if (select) this._selectedClassValue = select.value;
            if (levelInput) this._selectedLevel = parseInt(levelInput.value, 10) || 60;

            const parsed = parseClassOptionValue(this._selectedClassValue);
            if (!parsed || !parsed.baseClass) return;

            window.applySkillLabPlayerConfig(this.game.player, parsed, this._selectedLevel);
            this.renderHotbarEditor();
            this.renderSkillList();
            if (typeof this.game.updateHUD === 'function') this.game.updateHUD();
            if (this.game.classUI) this.game.classUI.updateSkillBar();
        }

        renderHotbarEditor() {
            const wrap = document.getElementById('skill-lab-hotbar-edit');
            if (!wrap || !this.game.player) return;
            const p = this.game.player;
            window.migratePlayerSkillHotbar(p);

            let html = '<div class="skill-hotbar-edit-title">当前快捷栏</div><div class="skill-hotbar-edit-slots">';
            for (let i = 0; i < 4; i++) {
                const sk = window.getHotbarSkillAtSlot
                    ? window.getHotbarSkillAtSlot(p, i, { labMode: true })
                    : null;
                const keyLabel = window.KeybindSystem
                    ? window.KeybindSystem.getHotbarKeyLabel(i)
                    : String(i + 1);
                const label = sk ? sk.name : '空';
                html += `<button type="button" class="skill-hotbar-edit-slot${sk ? '' : ' empty'}" data-hotbar-slot="${i}" title="点击清空键位 ${keyLabel}">`
                    + `<span class="skill-hotbar-edit-key">${keyLabel}</span>`
                    + `<span class="skill-hotbar-edit-name">${label}</span>`
                    + `</button>`;
            }
            html += '</div><p class="skill-hotbar-edit-hint">点击下方技能的键位按钮装配到快捷栏 · 关闭面板后用 1–4 释放</p>';
            wrap.innerHTML = html;

            wrap.querySelectorAll('[data-hotbar-slot]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.hotbarSlot, 10);
                    const r = window.assignSkillLabHotbar(p, idx, null);
                    if (r.ok) {
                        this.renderHotbarEditor();
                        this.renderSkillList();
                        if (this.game.classUI) this.game.classUI.updateSkillBar();
                    }
                });
            });
        }

        renderSkillList() {
            const container = document.getElementById('skill-lab-skill-list');
            if (!container || !this.game.player) return;

            const parsed = parseClassOptionValue(this._selectedClassValue);
            if (!parsed) return;

            const skills = window.getSkillLabSkillList(parsed, this._selectedLevel);
            const p = this.game.player;
            container.innerHTML = '';

            if (!skills.length) {
                container.innerHTML = '<p class="skill-lab-empty">该职业暂无技能配置</p>';
                return;
            }

            const listTitle = document.createElement('div');
            listTitle.className = 'skill-lab-list-title';
            listTitle.textContent = '技能列表（选择键位装配）';
            container.appendChild(listTitle);

            skills.forEach(skill => {
                const row = document.createElement('div');
                row.className = 'skill-lab-skill-row';

                const info = document.createElement('div');
                info.className = 'skill-lab-skill-info';

                const nameEl = document.createElement('div');
                nameEl.className = 'skill-lab-skill-name';
                const typeLabel = skill.type === 'passive' ? '[被动]' : (skill.type === 'basic' ? '[普攻]' : '[主动]');
                nameEl.textContent = `${typeLabel} ${skill.name || skill.id}`;

                const metaEl = document.createElement('div');
                metaEl.className = 'skill-lab-skill-meta';
                metaEl.textContent = window.getSkillDetailMeta
                    ? window.getSkillDetailMeta(skill, p)
                    : (skill.slotType || '');

                info.appendChild(nameEl);
                info.appendChild(metaEl);

                const actions = document.createElement('div');
                actions.className = 'skill-lab-skill-actions';

                if (skill.type === 'active' && window.isSkillHotbarEligible && window.isSkillHotbarEligible(skill)) {
                    let hotIdx = -1;
                    if (p.skillHotbar) {
                        for (let i = 0; i < p.skillHotbar.length; i++) {
                            if (p.skillHotbar[i] === skill.id) hotIdx = i;
                        }
                    }
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
                            const r = window.assignSkillLabHotbar(p, i, skill.id);
                            if (r.ok) {
                                this.renderHotbarEditor();
                                this.renderSkillList();
                                if (this.game.classUI) this.game.classUI.updateSkillBar();
                                if (typeof this.game.addFloatingText === 'function') {
                                    this.game.addFloatingText(
                                        p.x, p.y,
                                        `${skill.name} → ${keyLabel}`,
                                        '#88ff88'
                                    );
                                }
                            } else if (r.msg && typeof this.game.addFloatingText === 'function') {
                                this.game.addFloatingText(p.x, p.y, r.msg, '#ff6666');
                            }
                        });
                        bindWrap.appendChild(b);
                    }
                    actions.appendChild(bindWrap);
                } else if (skill.type === 'passive') {
                    const tag = document.createElement('span');
                    tag.className = 'skill-lab-passive-tag';
                    tag.textContent = '被动 · 无需装配';
                    actions.appendChild(tag);
                } else if (skill.type === 'basic') {
                    const tag = document.createElement('span');
                    tag.className = 'skill-lab-passive-tag';
                    tag.textContent = '普攻 · 鼠标左键';
                    actions.appendChild(tag);
                }

                row.appendChild(info);
                row.appendChild(actions);
                container.appendChild(row);
            });

            this.updateDummyCount();
        }

        resetCooldowns() {
            if (this.game.player) {
                this.game.player.skillCooldowns = {};
                if (typeof this.game.addFloatingText === 'function') {
                    this.game.addFloatingText(this.game.player.x, this.game.player.y, '冷却已重置', '#88ff88');
                }
            }
            if (this.game.classUI) this.game.classUI.updateSkillBar();
        }

        fillResource() {
            const p = this.game.player;
            if (!p || !p.classResource) return;
            p.classResource.current = p.classResource.max;
            if (typeof this.game.updateHUD === 'function') this.game.updateHUD();
            if (typeof this.game.addFloatingText === 'function') {
                this.game.addFloatingText(p.x, p.y, '资源已满', '#88ccff');
            }
        }

        spawnDummyAtPlayer() {
            const g = this.game;
            if (!g.skillLabScene || !g.player) return;

            const chaseEl = document.getElementById('skill-lab-dummy-chase');
            const invEl = document.getElementById('skill-lab-dummy-invincible');
            const chasePlayer = chaseEl ? chaseEl.checked : false;
            const invincible = invEl ? invEl.checked : true;

            const angle = Math.random() * Math.PI * 2;
            const dist = 80 + Math.random() * 40;
            g.skillLabScene.addDummy(
                g.player.x + Math.cos(angle) * dist,
                g.player.y + Math.sin(angle) * dist,
                { invincible, chasePlayer }
            );
            this.updateDummyCount();
            if (typeof g.addFloatingText === 'function') {
                const chaseText = chasePlayer ? '会追击' : '不追击';
                g.addFloatingText(g.player.x, g.player.y, `假人已生成（${chaseText}）`, '#4a9eff');
            }
        }

        clearDummies() {
            if (this.game.skillLabScene) {
                this.game.skillLabScene.clearAllDummies();
                this.updateDummyCount();
            }
        }

        updateDummyCount() {
            const el = document.getElementById('skill-lab-dummy-count');
            if (el && this.game.skillLabScene) {
                el.textContent = String(this.game.skillLabScene.dummies.length);
            }
        }

        open() {
            this.bindOnce();
            const modal = document.getElementById('skill-lab-modal');
            if (modal) modal.classList.add('show');
            this.game.syncGamePausedState();
        }

        close() {
            const modal = document.getElementById('skill-lab-modal');
            if (modal) modal.classList.remove('show');
            this.game.syncGamePausedState();
        }

        isOpen() {
            const modal = document.getElementById('skill-lab-modal');
            return !!(modal && modal.classList.contains('show'));
        }
    }

    window.SkillLabUI = SkillLabUI;
})();
