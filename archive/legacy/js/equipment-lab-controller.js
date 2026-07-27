/**
 * 装备试验场自动展示控制器。
 * 由 Game.update 驱动，不创建额外 interval，避免与游戏主循环双重更新。
 */
(function () {
    'use strict';

    class EquipmentLabController {
        constructor(game) {
            this.game = game;
            this.queue = [];
            this.currentIndex = -1;
            this.currentEntry = null;
            this.results = [];
            this.durationMs = 6000;
            this.elapsedMs = 0;
            this.isRunning = false;
            this.isPaused = false;
            this.loop = false;
            this.lastUpdateAt = 0;
            this.lastBasicAt = 0;
            this.lastSkillAt = 0;
            this.lastWeaponAt = 0;
            this.scriptedAt = 0;
            this.triggerScriptCompleted = false;
            this.originalState = null;
            this.onChange = null;
        }

        setChangeHandler(handler) {
            this.onChange = typeof handler === 'function' ? handler : null;
        }

        notify() {
            if (this.onChange) this.onChange(this.getState());
        }

        getState() {
            return {
                isRunning: this.isRunning,
                isPaused: this.isPaused,
                currentIndex: this.currentIndex,
                total: this.queue.length,
                currentEntry: this.currentEntry,
                elapsedMs: this.elapsedMs,
                durationMs: this.durationMs,
                results: this.results.slice()
            };
        }

        start(entries, options) {
            if (!Array.isArray(entries) || !entries.length) return false;
            this.stop(true);
            this.queue = entries.slice();
            this.durationMs = Math.max(2000, Number(options && options.durationMs) || 6000);
            this.loop = !!(options && options.loop);
            this.results = [];
            this.currentIndex = -1;
            this.originalState = typeof window.captureSkillLabPlayerState === 'function'
                ? window.captureSkillLabPlayerState(this.game.player)
                : null;
            this.isRunning = true;
            this.isPaused = false;
            this.next();
            return true;
        }

        stop(restore) {
            const shouldRestore = restore !== false;
            if (this.currentEntry) this.collectCurrent();
            this.isRunning = false;
            this.isPaused = false;
            this.currentEntry = null;
            this.currentIndex = -1;
            if (shouldRestore && this.originalState && typeof window.restoreSkillLabPlayerState === 'function') {
                window.restoreSkillLabPlayerState(this.game.player, this.originalState);
            }
            this.originalState = null;
            if (window.EquipmentLabMetrics) window.EquipmentLabMetrics.active = false;
            this.notify();
        }

        togglePause() {
            if (!this.isRunning) return;
            this.isPaused = !this.isPaused;
            this.lastUpdateAt = Date.now();
            this.notify();
        }

        previous() {
            if (!this.queue.length) return;
            if (this.currentEntry) this.collectCurrent();
            this.currentIndex = (this.currentIndex - 1 + this.queue.length) % this.queue.length;
            this.setupCurrent();
        }

        next() {
            if (!this.queue.length) return;
            if (this.currentEntry) this.collectCurrent();
            const nextIndex = this.currentIndex + 1;
            if (nextIndex >= this.queue.length) {
                if (!this.loop) {
                    this.currentEntry = null;
                    this.stop(true);
                    return;
                }
                this.currentIndex = 0;
            } else {
                this.currentIndex = nextIndex;
            }
            this.setupCurrent();
        }

        applyEntry(entry) {
            if (this.isRunning) this.stop(true);
            this.currentEntry = entry;
            this.setupEntry(entry);
            this.currentEntry = entry;
            this.notify();
        }

        setupCurrent() {
            this.setupEntry(this.queue[this.currentIndex]);
        }

        setupEntry(entry) {
            if (!entry) return;
            const player = this.game.player;
            this.game.resetSkillLabCombatState();
            if (typeof window.applySkillLabPlayerConfig === 'function' && entry.classData) {
                window.applySkillLabPlayerConfig(player, entry.classData, 60);
            }
            const skills = typeof window.getSkillLabSkillList === 'function'
                ? window.getSkillLabSkillList(player.classData, 60).filter(skill => skill.type === 'active')
                : [];
            const preferredIds = entry.buildDef
                ? (entry.buildDef.skillModifiers || []).flatMap(modifier =>
                    [modifier.skillId].concat(modifier.evolvedSkillIds || [])
                ).filter(Boolean)
                : [];
            const preferredSkill = skills.find(skill => preferredIds.includes(skill.id));
            const orderedSkills = preferredSkill
                ? [preferredSkill].concat(skills.filter(skill => skill.id !== preferredSkill.id))
                : skills;
            for (let i = 0; i < 4; i++) {
                if (typeof window.assignSkillLabHotbar === 'function') {
                    window.assignSkillLabHotbar(player, i, orderedSkills[i] ? orderedSkills[i].id : null);
                }
            }
            const loadout = window.EquipmentLabCatalog.buildLoadout(entry, 7);
            window.EquipmentLabCatalog.applyLoadout(player, loadout);
            player.x = CONFIG.CANVAS_WIDTH / 2;
            player.y = CONFIG.CANVAS_HEIGHT / 2;
            this.spawnTargets(entry);
            this.resetTargetStats();
            this.currentEntry = entry;
            this.elapsedMs = 0;
            this.lastUpdateAt = Date.now();
            this.lastBasicAt = 0;
            this.lastSkillAt = 0;
            this.lastWeaponAt = 0;
            this.scriptedAt = 0;
            this.triggerScriptCompleted = false;
            if (window.EquipmentLabMetrics) window.EquipmentLabMetrics.start(entry);
            this.game.addFloatingText(player.x, player.y - 30, entry.name, '#ffbb66', 1800, 16, true);
            this.notify();
        }

        spawnTargets(entry) {
            const scene = this.game.equipmentLabScene;
            const player = this.game.player;
            if (!scene || !player) return;
            scene.clearAllDummies();
            const ranged = entry.trigger === 'range';
            const distance = ranged ? 190 : 58;
            scene.addDummy(player.x + distance, player.y, { invincible: true, chasePlayer: false });
            scene.addDummy(player.x + Math.max(52, distance - 12), player.y + 45, { invincible: true, chasePlayer: false });
            scene.addDummy(player.x + Math.max(54, distance - 8), player.y - 45, { invincible: true, chasePlayer: false });
        }

        resetTargetStats() {
            const scene = this.game.equipmentLabScene;
            (scene && scene.dummies || []).forEach(dummy => {
                dummy._battleStats = { basic: { hits: 0, damage: 0 }, skills: {}, dot: { hits: 0, damage: 0 } };
                dummy.totalDamage = 0;
                dummy.damageHistory = [];
            });
        }

        totalDamage() {
            const scene = this.game.equipmentLabScene;
            return (scene && scene.dummies || []).reduce((sum, dummy) => sum + (dummy.totalDamage || 0), 0);
        }

        collectCurrent() {
            if (!this.currentEntry || !window.EquipmentLabMetrics || !window.EquipmentLabMetrics.current) return;
            const result = window.EquipmentLabMetrics.finish(this.totalDamage(), this.elapsedMs);
            if (result) {
                result.name = this.currentEntry.name;
                result.category = this.currentEntry.category;
                this.results.push(result);
            }
        }

        update() {
            if (!this.isRunning || this.isPaused || !this.currentEntry) return;
            const now = Date.now();
            const delta = this.lastUpdateAt ? Math.min(100, now - this.lastUpdateAt) : 0;
            this.lastUpdateAt = now;
            this.elapsedMs += delta;
            const player = this.game.player;
            const targets = this.game.equipmentLabScene ? this.game.equipmentLabScene.dummies : [];
            const target = targets.find(dummy => dummy && dummy.hp > 0);
            if (!target) return;
            player.angle = Math.atan2(target.y - player.y, target.x - player.x);

            if (now - this.lastBasicAt >= 500) {
                player.nextAttackCrit = true;
                player.attack(targets);
                this.lastBasicAt = now;
                if (window.EquipmentLabMetrics) window.EquipmentLabMetrics.record('basic_attack');
            }
            if (this.currentEntry.category !== 'power' && now - this.lastSkillAt >= 1800) {
                if (player.classResource) player.classResource.current = player.classResource.max;
                player.skillCooldowns = {};
                this.game.useClassSkillHotbar(0, { lockTarget: target, angle: player.angle });
                this.lastSkillAt = now;
                if (window.EquipmentLabMetrics) window.EquipmentLabMetrics.record('skill_cast');
            }
            if (this.currentEntry.category !== 'power'
                && player.equipment && player.equipment.weapon && now - this.lastWeaponAt >= 3000) {
                player.weaponSkillCooldown = 0;
                player.useWeaponSkill(targets);
                this.lastWeaponAt = now;
                if (window.EquipmentLabMetrics) window.EquipmentLabMetrics.record('weapon_skill');
            }
            const repeatPowerShowcase = this.currentEntry.category === 'power'
                && this.triggerScriptCompleted
                && now - this.scriptedAt >= 1050;
            if (this.elapsedMs >= 250 && (!this.triggerScriptCompleted || repeatPowerShowcase)) {
                if (this.currentEntry.category === 'power'
                    && window.EquipmentEffectSystem
                    && typeof window.EquipmentEffectSystem.resetEffectCooldown === 'function') {
                    window.EquipmentEffectSystem.resetEffectCooldown(player, this.currentEntry.effectId);
                }
                this.runTriggerScript(this.currentEntry, target);
                this.scriptedAt = now;
                this.triggerScriptCompleted = true;
            }
            if (this.elapsedMs >= this.durationMs) this.next();
            else this.notify();
        }

        runSetLabScript(entry, target, ctx) {
            const {
                player, effects, profile, effectId,
                simulateBasic, takeRealDamage, recordEffect
            } = ctx;
            const baseId = String(effectId || '').replace(/_apex$/, '');
            const skillMap = {
                oath_shield: ['lab_holy_shield_strike'],
                bulwark_oath: ['lab_guard_charge'],
                temple_covenant: ['lab_temple_bond'],
                crimson_scar: ['lab_fury_slam'],
                rift_howl: ['devastation_rift', 'fury_slam', 'lab_devastation_rift'],
                ember_residue: ['lab_element_phase', 'lab_element_wave'],
                star_oracle: ['lab_chrono_fate', 'lab_chrono_oracle'],
                torrent_throne: ['lab_arcane_chain_a', 'lab_arcane_chain_b', 'lab_arcane_chain_c'],
                curse_echo: ['lab_curse_drain', 'lab_curse_harvest'],
                grave_throne: ['lab_death_legion', 'lab_soul_harvest'],
                fate_web: ['lab_fate_weave_a', 'lab_fate_weave_b', 'lab_chrono_freeze'],
                holy_balance: ['lab_judgment_holy'],
                echo_fold: ['lab_wind_phantom_blade'],
                night_veil: ['lab_shadow_dance'],
                evernight_seal: ['lab_night_blade']
            };
            const castSkills = ids => {
                ids.forEach(id => {
                    const prepared = effects.beforeSkill(player, { id, damageMultiplier: 1 });
                    effects.onSkillCast(player, prepared || { id, resourceCost: 10 });
                });
            };

            switch (profile) {
                case 'damage':
                    player.hp = player.maxHp;
                    takeRealDamage(Math.max(10, player.maxHp * 0.12));
                    if (baseId === 'bulwark_oath' || baseId === 'temple_covenant' || baseId === 'oath_shield') {
                        effects.onBlock(player);
                    }
                    if (skillMap[baseId]) castSkills(skillMap[baseId]);
                    break;
                case 'low_hp':
                    player.hp = Math.max(1, Math.floor(player.maxHp * 0.32));
                    simulateBasic(false);
                    if (skillMap[baseId]) castSkills(skillMap[baseId]);
                    break;
                case 'range':
                    target.x = player.x + 190;
                    if (baseId === 'breathless_hunt') {
                        target._classSkillMark = { markId: 'weakness_mark_de' };
                        target.weaknessMarked = true;
                    }
                    if (baseId === 'beast_pact' || baseId === 'trail_sigil') {
                        this.game.pets = [{ hp: 100, maxHp: 100 }, { hp: 100, maxHp: 100 }];
                    }
                    if (baseId === 'hundred_pace' && typeof window.addPrecisionStacks === 'function') {
                        window.addPrecisionStacks(player, 3, this.game);
                    }
                    for (let i = 0; i < 3; i++) simulateBasic(false);
                    break;
                case 'dodge':
                    effects.onDodge(player);
                    if (baseId === 'mirror_mask' || baseId === 'myriad_mirror') {
                        simulateBasic(true);
                    } else if (baseId === 'echo_fold') {
                        if (typeof window.spawnPhantomEcho === 'function') {
                            window.spawnPhantomEcho(player, this.game, player.x - 28, player.y, {
                                damagePercent: 35
                            });
                        }
                        castSkills(skillMap.echo_fold);
                    } else if (baseId === 'swift_plume') {
                        castSkills(['lab_wind_step']);
                        simulateBasic(false);
                    } else {
                        simulateBasic(false);
                    }
                    break;
                case 'crit':
                    if (baseId === 'night_veil' || baseId === 'evernight_seal') target.angle = 0;
                    player.nextAttackCrit = true;
                    simulateBasic(true);
                    if (skillMap[baseId]) castSkills(skillMap[baseId]);
                    break;
                case 'basic':
                    if (baseId === 'venom_censer' || baseId === 'plague_altar') {
                        target.statusEffects = target.statusEffects || {};
                        target.statusEffects.poison = true;
                        target.poisonStacks = 2;
                    }
                    for (let i = 0; i < (baseId === 'plague_altar' ? 5 : 3); i++) simulateBasic(false);
                    break;
                case 'skill':
                    if (baseId === 'rift_howl') {
                        // 带前摇的真实技能路径：先挂起，再在命中帧释放
                        const riftSkill = {
                            id: 'devastation_rift',
                            damageMultiplier: 1,
                            entityConfig: { shape: 'fissure', windupMs: 0, range: 300, pierceWidth: 40 }
                        };
                        const prepared = effects.beforeSkill(player, riftSkill);
                        effects.onSkillCast(player, prepared || riftSkill);
                        if (effects.releasePendingRiftWaves) effects.releasePendingRiftWaves(player);
                        else if (effects.fireSideRiftWaves) {
                            effects.fireSideRiftWaves(player, (player.baseAttack || 1) * 0.7, {
                                angle: player.angle || 0,
                                apex: !!(player._equipmentEffectState
                                    && player._equipmentEffectState.sets
                                    && player._equipmentEffectState.sets.has('rift_howl_apex'))
                            });
                        }
                    } else {
                        castSkills(skillMap[baseId] || ['lab_set_skill_a', 'lab_set_skill_b']);
                    }
                    break;
                case 'kill':
                    for (let i = 0; i < 3; i++) effects.onKill(player, target);
                    break;
                default:
                    simulateBasic(false);
            }
            recordEffect({ mode: 'set_special', profile, baseId });
        }

        runTriggerScript(entry, target) {
            const player = this.game.player;
            const effects = window.EquipmentEffectSystem;
            if (!effects) return;
            const profile = entry.trigger;
            const effectId = entry.effectId;
            const recordEffect = detail => {
                if (window.EquipmentLabMetrics) window.EquipmentLabMetrics.recordEffect(effectId, detail);
            };
            const simulateBasic = isCrit => {
                const context = effects.modifyBasicAttack(player, target, {
                    damage: player.baseAttack || 1,
                    isCrit: !!isCrit
                });
                if (isCrit) context.isCrit = true;
                effects.afterBasicAttack(player, target, context);
                return context;
            };
            const withGuaranteedProc = callback => {
                const originalRandom = Math.random;
                Math.random = () => 0;
                try {
                    callback();
                } finally {
                    Math.random = originalRandom;
                }
            };
            const takeRealDamage = amount => {
                const originalDodge = player.baseDodge;
                player.baseDodge = 0;
                player.invincibleUntil = 0;
                withGuaranteedProc(() => player.takeDamage(amount, target, false));
                player.baseDodge = originalDodge;
            };

            if (effectId === 'phoenix') {
                player.hp = player.maxHp;
                takeRealDamage(player.maxHp * 20);
            } else if (effectId === 'dragon_breath') {
                for (let i = 0; i < 3; i++) {
                    player.nextAttackCrit = true;
                    simulateBasic(true);
                }
            } else if (effectId === 'fire_nova') {
                player.nextAttackCrit = true;
                simulateBasic(true);
            } else if (effectId === 'shadow_dance') {
                player.nextAttackCrit = true;
                for (let i = 0; i < 3; i++) simulateBasic(true);
            } else if (effectId === 'chain_strike') {
                for (let i = 0; i < 5; i++) simulateBasic(false);
            } else if (effectId === 'frost_nova' || effectId === 'frost_touch' || effectId === 'valor_shield') {
                player.hp = player.maxHp;
                takeRealDamage(Math.max(10, player.maxHp * 0.1));
            } else if (effectId === 'immortal_shield') {
                player.hp = Math.max(1, Math.floor(player.maxHp * 0.5));
                effects.onBlock(player);
            } else if (effectId === 'phantom_step') {
                effects.onDodge(player);
            } else if (effectId === 'shadow_counter') {
                effects.onDodge(player);
                simulateBasic(false);
            } else if (effectId === 'chain_lightning') {
                const others = this.game.equipmentLabScene.dummies.filter(d => d !== target);
                effects.onKill(player, target);
                if (others[0]) {
                    others[0].x = target.x + 40;
                    others[0].y = target.y;
                    simulateBasic(false);
                }
            } else if (effectId === 'death_arrival') {
                for (let i = 0; i < 3; i++) effects.onKill(player, target);
                effects.beforeSkill(player, { id: 'lab_death_arrival_finisher', damageMultiplier: 1 });
                effects.onSkillCast(player, { id: 'lab_death_arrival_finisher', resourceCost: 10 });
            } else if (effectId === 'star_stack') {
                for (let i = 0; i < 3; i++) effects.onKill(player, target);
            } else if (effectId === 'wind_soul') {
                effects.sync(player);
                const originalX = player.x;
                player.x += 320;
                effects.tick(player);
                simulateBasic(false);
                player.x = originalX;
                effects.tick(player);
            } else if (effectId === 'arcane_surge') {
                ['lab_skill_a', 'lab_skill_b', 'lab_skill_c'].forEach(id =>
                    effects.onSkillCast(player, { id, resourceCost: 10 })
                );
                const finisher = effects.beforeSkill(player, { id: 'lab_skill_finisher', damageMultiplier: 1 });
                effects.onSkillCast(player, finisher || { id: 'lab_skill_finisher', resourceCost: 10 });
            } else if (effectId === 'arcane_combo') {
                effects.onSkillCast(player, { id: 'lab_combo_opener', resourceCost: 10 });
                effects.beforeSkill(player, { id: 'lab_combo_finisher', damageMultiplier: 1 });
            } else if (effectId === 'war_god_fury') {
                for (let i = 0; i < 3; i++) {
                    effects.onSkillCast(player, { id: `lab_warrior_skill_${i}`, resourceCost: 10 });
                }
                effects.beforeSkill(player, { id: 'lab_warrior_finisher', damageMultiplier: 1 });
            } else if (effectId === 'mana_shield') {
                effects.onSkillCast(player, { id: 'lab_mana_skill', resourceCost: 100 });
            } else if (effectId === 'arrow_rain') {
                effects.sync(player);
                const originalX = player.x;
                player.x += 220;
                effects.tick(player);
                player.x = originalX;
                effects.tick(player);
                effects.onSkillCast(player, { id: 'lab_archer_skill', resourceCost: 10 });
            } else if (effectId === 'element_avatar') {
                if (player.classResource) player.classResource.current = player.classResource.max;
                effects.tick(player);
                effects.beforeSkill(player, { id: 'lab_element_skill', damageMultiplier: 1 });
            } else if (effectId === 'blood_rage' || effectId === 'dragon_rage') {
                player.hp = Math.max(1, Math.floor(player.maxHp * 0.4));
                simulateBasic(false);
                effects.beforeDamage(player, 100, target);
            } else if (effectId === 'titan_body') {
                player.hp = player.maxHp;
                simulateBasic(false);
                player.hp = Math.max(1, Math.floor(player.maxHp * 0.2));
                effects.beforeDamage(player, 100, target);
            } else if (effectId === 'eagle_eye') {
                target.x = player.x + 190;
                for (let i = 0; i < 3; i++) simulateBasic(false);
                effects.beforeSkill(player, { id: 'lab_eagle_finisher', damageMultiplier: 1 });
            } else if (effectId === 'windchaser_range' || effectId === 'shadow_strike') {
                if (effectId === 'shadow_strike') target.angle = 0;
                simulateBasic(effectId === 'shadow_strike');
            } else if (effectId === 'assassinate') {
                target.hp = target.maxHp;
                simulateBasic(false);
                target.hp = Math.max(1, Math.floor(target.maxHp * 0.3));
                simulateBasic(false);
            } else if (effectId === 'thorn_aura') {
                effects.tick(player);
            } else if (effectId === 'greed_power') {
                if (effects.getGoldMultiplier(player) === 1.5 && effects.getPickupRangeMultiplier(player) === 2) {
                    recordEffect({ mode: 'utility_multipliers' });
                }
            } else if (entry.category === 'build') {
                this.game.useClassSkillHotbar(0, { lockTarget: target, angle: player.angle });
                recordEffect({ mode: 'build_skill' });
            } else if (entry.category === 'resonance') {
                const refinement = window.WeaponRefinementSystem;
                const sourceId = entry.sourceId;
                const famMap = {
                    holy_balance: 'dragonblood', rift_howl: 'fireheart', breathless_hunt: 'stormfury',
                    echo_fold: 'shadow', torrent_throne: 'arcane', grave_throne: 'dragonblood',
                    evernight_seal: 'shadow', plague_altar: 'stormfury'
                };
                const fam = famMap[sourceId] || sourceId;
                if (fam === 'fireheart') {
                    for (let i = 0; i < 3; i++) simulateBasic(true);
                } else if (fam === 'stormfury') {
                    for (let i = 0; i < 5; i++) simulateBasic(false);
                } else if (fam === 'dragonblood') {
                    for (let i = 0; i < 3; i++) effects.afterDamage(player, target, 20);
                } else if (fam === 'arcane') {
                    ['resonance_a', 'resonance_b', 'resonance_c'].forEach(id =>
                        effects.onSkillCast(player, { id, resourceCost: 10 })
                    );
                } else if (fam === 'shadow') {
                    for (let i = 0; i < 3; i++) effects.onDodge(player);
                }
                if (refinement) {
                    refinement.onWeaponSkill(player, player.equipment.weapon, [target].concat(
                        this.game.equipmentLabScene.dummies.filter(dummy => dummy !== target)
                    ));
                }
            } else if (profile === 'weapon') {
                const type = entry.weaponType;
                const level = entry.refineLevel || 0;
                const refinement = window.WeaponRefinementSystem;
                if (level >= 3 && refinement) {
                    if (['sword', 'hammer', 'bow', 'crossbow', 'shortbow', 'claw'].includes(type)) {
                        const hits = { sword: 3, hammer: 4, bow: 3, crossbow: 2, shortbow: 5, claw: 4 }[type];
                        for (let i = 0; i < hits; i++) simulateBasic(false);
                    } else if (type === 'axe') {
                        simulateBasic(false);
                    } else if (type === 'spear' || type === 'longbow') {
                        target.x = player.x + 190;
                        simulateBasic(false);
                    } else if (type === 'dagger') {
                        const towardPlayer = Math.atan2(player.y - target.y, player.x - target.x);
                        target.angle = towardPlayer + Math.PI;
                        simulateBasic(false);
                    } else if (type === 'shortblade') {
                        refinement.onDodge(player);
                        simulateBasic(false);
                    } else if (['staff', 'orb', 'rune'].includes(type)) {
                        for (let i = 0; i < 3; i++) {
                            refinement.onSkillCast(player, { id: `lab_${type}_${i}` });
                        }
                        simulateBasic(false);
                    } else if (type === 'book') {
                        for (let i = 0; i < 3; i++) {
                            refinement.onSkillCast(player, { id: `lab_book_${i}` });
                        }
                    } else if (type === 'chainblade') {
                        refinement.onWeaponSkill(player, player.equipment.weapon, [target]);
                    }
                }
                if (level >= 5 && refinement) {
                    if (type === 'axe') target.hp = Math.floor(target.maxHp * 0.3);
                    if (type === 'dagger') target.hp = Math.floor(target.maxHp * 0.25);
                    if (type === 'longbow') target.hp = target.maxHp;
                    if (type === 'chainblade') {
                        refinement.onWeaponSkill(player, player.equipment.weapon, [target]);
                    }
                    refinement.onWeaponSkill(player, player.equipment.weapon, [target].concat(
                        this.game.equipmentLabScene.dummies.filter(dummy => dummy !== target)
                    ));
                }
                player.weaponSkillCooldown = 0;
                player.useWeaponSkill(this.game.equipmentLabScene.dummies);
                if (level === 0) recordEffect({ mode: 'base_weapon_skill' });
            } else if (entry.category === 'set' && entry.pieceCount >= 4) {
                this.runSetLabScript(entry, target, {
                    player,
                    effects,
                    profile,
                    effectId,
                    simulateBasic,
                    takeRealDamage,
                    withGuaranteedProc,
                    recordEffect
                });
            } else if (entry.category === 'set' && entry.pieceCount === 2) {
                if (entry.setId === 'echo_fold' && typeof window.spawnPhantomEcho === 'function') {
                    window.spawnPhantomEcho(player, this.game, player.x - 24, player.y, {
                        damagePercent: 30
                    });
                    if (typeof player.updateStats === 'function') player.updateStats();
                } else if (entry.setId === 'breathless_hunt' || entry.setId === 'hundred_pace') {
                    target.x = player.x + 190;
                    if (entry.setId === 'breathless_hunt') {
                        target._classSkillMark = { markId: 'weakness_mark_de' };
                        target.weaknessMarked = true;
                    }
                    if (entry.setId === 'hundred_pace' && typeof window.addPrecisionStacks === 'function') {
                        window.addPrecisionStacks(player, 2, this.game);
                    }
                    simulateBasic(false);
                } else if (entry.setId === 'beast_pact' || entry.setId === 'trail_sigil') {
                    this.game.pets = [{ hp: 100, maxHp: 100 }, { hp: 100, maxHp: 100 }];
                    simulateBasic(false);
                } else {
                    simulateBasic(false);
                }
                recordEffect({ mode: 'set_two_piece', setId: entry.setId });
            } else {
                simulateBasic(false);
                recordEffect({ mode: 'static_or_affix' });
            }
            if (entry.category === 'power'
                && window.EquipmentPowerVFX
                && typeof window.EquipmentPowerVFX.trigger === 'function') {
                window.EquipmentPowerVFX.trigger(player, effectId, { target });
            }
            if (window.EquipmentLabMetrics) {
                window.EquipmentLabMetrics.record(`script:${profile}`, { effectId });
            }
        }
    }

    window.EquipmentLabController = EquipmentLabController;
})();
