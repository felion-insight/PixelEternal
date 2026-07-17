/**
 * Pixel Eternal - Phase 3 装备战斗效果
 * 传奇威能与套装 special 的唯一运行时入口。
 */
(function () {
    'use strict';

    const POWER_IDS = new Set([
        'dragon_breath', 'chain_lightning', 'thorn_aura', 'phoenix', 'phantom_step',
        'frost_nova', 'greed_power', 'blood_rage', 'war_god_fury', 'immortal_shield',
        'titan_body', 'eagle_eye', 'arrow_rain', 'wind_soul', 'arcane_surge',
        'mana_shield', 'element_avatar', 'assassinate', 'shadow_dance', 'death_arrival'
    ]);
    const SET_SPECIALS = new Set([
        'fire_nova', 'frost_touch', 'chain_strike', 'star_stack', 'shadow_counter',
        'dragon_rage', 'valor_shield', 'windchaser_range', 'arcane_combo', 'shadow_strike',
        // 一转 4/6
        'oath_shield', 'oath_shield_apex', 'crimson_scar', 'crimson_scar_apex',
        'bulwark_oath', 'bulwark_oath_apex', 'trail_sigil', 'trail_sigil_apex',
        'hundred_pace', 'hundred_pace_apex', 'swift_plume', 'swift_plume_apex',
        'ember_residue', 'ember_residue_apex', 'star_oracle', 'star_oracle_apex',
        'curse_echo', 'curse_echo_apex', 'night_veil', 'night_veil_apex',
        'mirror_mask', 'mirror_mask_apex', 'venom_censer', 'venom_censer_apex',
        // 二转 4/6
        'holy_balance', 'holy_balance_apex', 'rift_howl', 'rift_howl_apex',
        'temple_covenant', 'temple_covenant_apex', 'beast_pact', 'beast_pact_apex',
        'breathless_hunt', 'breathless_hunt_apex', 'echo_fold', 'echo_fold_apex',
        'torrent_throne', 'torrent_throne_apex', 'fate_web', 'fate_web_apex',
        'grave_throne', 'grave_throne_apex', 'evernight_seal', 'evernight_seal_apex',
        'myriad_mirror', 'myriad_mirror_apex', 'plague_altar', 'plague_altar_apex'
    ]);

    /** 仅视觉/轻量复用；战斗逻辑按 special 本身份处理 */
    const SET_SPECIAL_ALIASES = {};

    function resolveSetSpecial(special) {
        return SET_SPECIAL_ALIASES[special] || special;
    }

    function mod(player, key, fallback) {
        const m = player && player._setModifiers;
        if (!m || m[key] == null) return fallback == null ? 0 : fallback;
        return m[key];
    }

    function countPets(player) {
        const game = player && player.gameInstance;
        if (!game) return 0;
        const list = game.pets || game.summons || game.allies || [];
        if (!Array.isArray(list)) return 0;
        return list.filter(p => p && p.hp > 0 && (p.owner === player || p.summoner === player || p.isPet)).length;
    }

    function skillLooksLike(skillDef, keys) {
        const id = String((skillDef && (skillDef.id || skillDef.name)) || '').toLowerCase();
        return keys.some(k => id.includes(k));
    }

    function now() {
        return Date.now();
    }

    function powerId(power) {
        return typeof power === 'string' ? power : (power && power.id);
    }

    function collect(player) {
        const powers = new Set();
        Object.values((player && player.equipment) || {}).forEach(eq => {
            (eq && Array.isArray(eq.legendaryPowers) ? eq.legendaryPowers : []).forEach(power => {
                const id = powerId(power);
                if (id) powers.add(id);
            });
        });
        const sets = new Set();
        const active = typeof window.getAllActiveSetEffects === 'function'
            ? window.getAllActiveSetEffects(player && player.equipment) : [];
        active.forEach(entry => {
            const special = entry && entry.effect && entry.effect.special;
            if (!special || !SET_SPECIALS.has(special)) return;
            sets.add(special);
            const canon = resolveSetSpecial(special);
            if (canon) sets.add(canon);
        });
        return { powers, sets };
    }

    function state(player) {
        if (!player) return null;
        const active = collect(player);
        const signature = [...active.powers].sort().join(',') + '|' + [...active.sets].sort().join(',');
        let value = player._equipmentEffectState;
        if (!value || value.signature !== signature) {
            if (value && Array.isArray(player.buffs)) {
                player.buffs = player.buffs.filter(buff => !buff.equipmentEffectId);
            }
            value = {
                signature,
                powers: active.powers,
                sets: active.sets,
                cooldowns: Object.create(null),
                counters: Object.create(null),
                flags: Object.create(null),
                differentSkills: [],
                assassinated: new WeakSet(),
                executeMarks: new WeakMap(),
                staticMarks: new WeakMap(),
                lastX: player.x,
                lastY: player.y,
                windEnergy: 0,
                arrowWind: 0,
                lastTick: now()
            };
            player._equipmentEffectState = value;
        }
        return value;
    }

    function has(player, id) {
        const s = state(player);
        return !!s && (s.powers.has(id) || s.sets.has(id));
    }

    function ready(s, id, cooldownMs) {
        const time = now();
        if ((s.cooldowns[id] || 0) > time) return false;
        s.cooldowns[id] = time + cooldownMs;
        return true;
    }

    function targets(player) {
        const game = player && player.gameInstance;
        if (!game) return [];
        let list = null;
        if (typeof game.getCurrentSceneTargets === 'function') list = game.getCurrentSceneTargets();
        else if (typeof game._getSkillMonsters === 'function') list = game._getSkillMonsters();
        return (Array.isArray(list) ? list : []).filter(target => target && target.hp > 0);
    }

    function deal(player, target, amount, label, color) {
        if (!player || !target || amount <= 0) return;
        if (typeof player.damageMonsterFromEnvironment === 'function') {
            player.damageMonsterFromEnvironment(target, Math.max(1, Math.floor(amount)));
        } else if (typeof target.takeDamage === 'function') {
            target.takeDamage(Math.max(1, Math.floor(amount)));
        }
        const game = player.gameInstance;
        if (game && typeof game.addFloatingText === 'function' && label) {
            game.addFloatingText(target.x, target.y, `${label} ${Math.floor(amount)}`, color || '#ffee88', 1200, 15, true);
        }
    }

    function areaDamage(player, x, y, radius, amount, label, color, limit) {
        let count = 0;
        targets(player)
            .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
            .forEach(target => {
                if (limit && count >= limit) return;
                if (Math.hypot(target.x - x, target.y - y) > radius) return;
                deal(player, target, amount, label, color);
                count++;
            });
    }

    /** 碎界怒嚎：朝左前/右前各放一道与毁灭裂波同款样式的地面裂隙 */
    function fireSideRiftWaves(player, amount, opts) {
        if (!player) return false;
        const facing = (opts && opts.angle != null) ? opts.angle : (player.angle || 0);
        const spread = (opts && opts.spread != null) ? opts.spread : (Math.PI * 42 / 180);
        // 比主毁灭裂波略短，视觉权重接近副裂隙
        const range = (opts && opts.range) || 220;
        const halfWidth = (opts && opts.halfWidth) || 40;
        const apex = !!(opts && opts.apex);
        const dmg = (amount != null ? amount : (player.baseAttack || 1) * 0.7) * (apex ? 1.15 : 1);
        const game = player.gameInstance;
        const px = player.x;
        const py = player.y;
        [facing - spread, facing + spread].forEach(waveAngle => {
            targets(player).forEach(target => {
                const dx = target.x - px;
                const dy = target.y - py;
                const dist = Math.hypot(dx, dy);
                if (dist < 6 || dist > range) return;
                const toward = Math.atan2(dy, dx);
                let delta = toward - waveAngle;
                while (delta > Math.PI) delta -= Math.PI * 2;
                while (delta < -Math.PI) delta += Math.PI * 2;
                const along = dist * Math.cos(delta);
                const across = Math.abs(dist * Math.sin(delta));
                if (along > 0 && along <= range && across <= halfWidth) {
                    deal(player, target, dmg, '裂波', '#ff4a3a');
                }
            });
            // 毁灭裂波起手已画三向绽放时跳过，避免与圆环/副裂隙重复叠层
            if ((opts && opts.skipVfx) || !game || typeof game.addEquipmentEffect !== 'function') return;
            game.addEquipmentEffect('class_skill_vfx', px, py, {
                variant: 'devastation_slam',
                duration: 560,
                delayMs: 80,
                radius: range,
                angle: waveAngle,
                family: 'fire',
                halfAngleDeg: 26,
                ox: px,
                oy: py
            });
            game.addEquipmentEffect('class_skill_vfx', px, py, {
                variant: 'aoe_shock',
                duration: 480,
                delayMs: 110,
                radius: range * 0.8,
                angle: waveAngle,
                family: 'fire',
                halfAngleDeg: 22,
                ox: px,
                oy: py
            });
        });
        const metrics = window.EquipmentLabMetrics;
        if (metrics && typeof metrics.recordEffect === 'function') {
            metrics.recordEffect(apex ? 'rift_howl_apex' : 'rift_howl', {
                mode: 'side_waves',
                angle: facing,
                spread: spread,
                radius: range
            });
        }
        return true;
    }

    function scheduleOrFireRiftWaves(player, skillDef, s) {
        if (!player || !skillDef || !s) return;
        if (!ready(s, 'rift_howl_wave', 900)) return;
        const ec = skillDef.entityConfig || {};
        const payload = {
            apex: s.sets.has('rift_howl_apex'),
            angle: player.angle || 0,
            amount: (player.baseAttack || 1) * 0.7,
            skillId: skillDef.id
        };
        // 有前摇/跃击时等命中帧再放，避免被主裂隙盖住或过早消失
        if ((ec.windupMs && ec.windupMs > 0) || ec.leapSlam) {
            player._equipmentRiftWavePending = payload;
            return;
        }
        fireSideRiftWaves(player, payload.amount, payload);
    }

    function releasePendingRiftWaves(player) {
        if (!player || !player._equipmentRiftWavePending) return false;
        const payload = player._equipmentRiftWavePending;
        delete player._equipmentRiftWavePending;
        // 毁灭裂波本体 VFX 已含三向绽放，此处只结算斜向伤害
        if (payload.skillId === 'devastation_rift') {
            payload.skipVfx = true;
        }
        return fireSideRiftWaves(player, payload.amount, payload);
    }

    const BUFF_STATUS = {
        greed_power: { name: '贪婪之力', iconKey: 'potion_effect', durationMs: 4000 },
        blood_rage: { name: '血怒', iconKey: 'attack', durationMs: 2500 },
        war_god_fury: { name: '战神之怒', iconKey: 'damageMultiplier', durationMs: 4000 },
        immortal_shield: { name: '不灭圣盾', iconKey: 'divineProtection', durationMs: 4000 },
        titan_body: { name: '泰坦之体', iconKey: 'defense', durationMs: 2500 },
        arcane_surge: { name: '奥术涌动', iconKey: 'combo', durationMs: 3000 },
        mana_shield: { name: '魔力护盾', iconKey: 'divineProtection', durationMs: 5000 },
        element_avatar: { name: '元素化身', iconKey: 'allStats', durationMs: 2500 },
        phantom_step: { name: '幻影步', iconKey: 'moveSpeed', durationMs: 2000 },
        shadow_dance: { name: '影舞', iconKey: 'dodge', durationMs: 4000 }
    };

    function addBuff(player, id, effects, durationMs, extra) {
        if (!player) return;
        const meta = BUFF_STATUS[id] || {};
        player.buffs = (player.buffs || []).filter(buff => buff.equipmentEffectId !== id && buff.id !== id);
        player.buffs.push(Object.assign({
            id: id,
            equipmentEffectId: id,
            name: meta.name || id,
            iconKey: meta.iconKey || 'duration',
            hudVisible: true,
            hudCategory: 'buff',
            effects: effects || {},
            expireTime: now() + durationMs
        }, extra || {}));
        if (typeof player.updateStats === 'function') player.updateStats();
    }

    function addShield(player, id, amount, durationMs) {
        if (amount <= 0) return;
        const meta = BUFF_STATUS[id] || {};
        addBuff(player, id, {}, durationMs, {
            name: meta.name || id,
            iconKey: meta.iconKey || 'divineProtection',
            hudVisible: true,
            hudCategory: 'defense',
            shieldRemaining: Math.min(amount, Math.floor((player.maxHp || 1) * 0.25))
        });
    }

    function ensureBuffStatus(player, effectId, durationOverride) {
        const meta = BUFF_STATUS[effectId];
        if (!meta || !player) return;
        const existing = (player.buffs || []).find(buff => buff.equipmentEffectId === effectId || buff.id === effectId);
        if (existing && existing.expireTime > now()) {
            existing.name = existing.name || meta.name;
            existing.iconKey = existing.iconKey || meta.iconKey;
            existing.hudVisible = true;
            if (!existing.hudCategory) existing.hudCategory = 'buff';
            return;
        }
        addBuff(player, effectId, {}, durationOverride || meta.durationMs, {
            name: meta.name,
            iconKey: meta.iconKey,
            hudVisible: true
        });
    }

    function float(player, text, color) {
        const game = player && player.gameInstance;
        if (game && typeof game.addFloatingText === 'function') {
            game.addFloatingText(player.x, player.y - 24, text, color || '#ffee88', 1000, 14, true);
        }
    }

    function signal(player, effectId, detail) {
        const metrics = window.EquipmentLabMetrics;
        if (metrics && typeof metrics.recordEffect === 'function') {
            metrics.recordEffect(effectId, detail);
        }
        if (BUFF_STATUS[effectId]) {
            ensureBuffStatus(player, effectId);
        }
        if (window.EquipmentSetVFX && typeof window.EquipmentSetVFX.trigger === 'function') {
            window.EquipmentSetVFX.trigger(player, effectId, detail || {});
        }
        if (POWER_IDS.has(effectId)
            && window.EquipmentPowerVFX
            && typeof window.EquipmentPowerVFX.trigger === 'function') {
            window.EquipmentPowerVFX.trigger(player, effectId, detail || {});
        }
    }

    const api = {
        sync(player) {
            return state(player);
        },

        reset(player) {
            if (!player) return;
            delete player._equipmentEffectState;
            if (Array.isArray(player.buffs)) {
                player.buffs = player.buffs.filter(buff => !buff.equipmentEffectId);
            }
            if (window.WeaponRefinementSystem) window.WeaponRefinementSystem.reset(player);
            if (window.EquipmentSetVFX) window.EquipmentSetVFX.reset(player);
            if (window.EquipmentPowerVFX) window.EquipmentPowerVFX.reset(player);
        },

        has,

        getModifier(player, key, fallback) {
            return mod(player, key, fallback);
        },

        /** 毁灭裂波/狂暴碎击命中帧释放两侧裂波 */
        releasePendingRiftWaves(player) {
            return releasePendingRiftWaves(player);
        },

        fireSideRiftWaves(player, amount, opts) {
            return fireSideRiftWaves(player, amount, opts);
        },

        getSupportedEffectIds() {
            return {
                powers: [...POWER_IDS],
                sets: [...SET_SPECIALS]
            };
        },

        resetEffectCooldown(player, effectId) {
            const s = state(player);
            if (!s || !effectId) return false;
            Object.keys(s.cooldowns).forEach(key => {
                if (key === effectId || key.startsWith(`${effectId}_`)) delete s.cooldowns[key];
            });
            if (effectId === 'assassinate') {
                s.assassinated = new WeakSet();
                s.executeMarks = new WeakMap();
            }
            if (effectId === 'chain_lightning') s.staticMarks = new WeakMap();
            if (effectId === 'dragon_breath') s.counters.dragonFlame = 0;
            if (effectId === 'war_god_fury') {
                s.counters.warIntent = 0;
                s.flags.warGodArmed = false;
            }
            if (effectId === 'eagle_eye') {
                s.counters.eagleFocus = 0;
                s.flags.eagleFocusReady = false;
            }
            if (effectId === 'arrow_rain') {
                s.arrowWind = 0;
                s.flags.arrowRainReady = false;
            }
            if (effectId === 'arcane_surge') {
                s.differentSkills = [];
                s.flags.arcaneSurgeReady = false;
            }
            if (effectId === 'death_arrival') {
                s.counters.deathSouls = 0;
                s.flags.deathArrivalReady = false;
            }
            return true;
        },

        getGoldMultiplier(player) {
            return has(player, 'greed_power') ? 1.5 : 1;
        },

        getPickupRangeMultiplier(player) {
            return has(player, 'greed_power') ? 2 : 1;
        },

        isKnockbackImmune(player) {
            return has(player, 'titan_body');
        },

        tick(player) {
            const s = state(player);
            if (!s) return;
            if (window.WeaponRefinementSystem) window.WeaponRefinementSystem.tick(player);
            if (window.EquipmentSetVFX) window.EquipmentSetVFX.tick(player);
            const time = now();
            const elapsed = Math.min(250, Math.max(0, time - (s.lastTick || time)));
            s.lastTick = time;

            const distance = Math.hypot((player.x || 0) - (s.lastX || player.x || 0), (player.y || 0) - (s.lastY || player.y || 0));
            s.lastX = player.x;
            s.lastY = player.y;
            if (s.powers.has('wind_soul')) {
                s.windEnergy = Math.min(100, s.windEnergy + distance * 0.35);
                if (s.windEnergy >= 100) s.flags.windSoulReady = true;
            }
            if (s.powers.has('arrow_rain') && distance > 0) {
                s.arrowWind = Math.min(100, (s.arrowWind || 0) + distance * 0.55);
                if (s.arrowWind >= 100) s.flags.arrowRainReady = true;
            }

            if (s.powers.has('thorn_aura') && ready(s, 'thorn_aura_tick', 1000)) {
                areaDamage(player, player.x, player.y, 100, (player.baseDefense || 0) * 0.2, '荆棘', '#66dd88');
                signal(player, 'thorn_aura');
            }
            const resource = player.classResource;
            if (s.powers.has('element_avatar') && resource && resource.max > 0 && resource.current >= resource.max * 0.9
                && ready(s, 'element_avatar_tick', 1000)) {
                areaDamage(player, player.x, player.y, 110, (player.baseMagicAttack || player.baseAttack || 1) * 0.3, '元素', '#aa88ff');
                signal(player, 'element_avatar');
            }
            void elapsed;
        },

        modifyBasicAttack(player, target, context) {
            const s = state(player);
            const result = Object.assign({ damage: 0, isCrit: false, critDamageBonus: 0 }, context || {});
            if (!s) return result;
            const hpRatio = player.maxHp > 0 ? player.hp / player.maxHp : 1;
            if (s.powers.has('blood_rage') && hpRatio < 1) {
                result.damage *= 1 + Math.floor((1 - hpRatio) * 10) * 0.05;
                signal(player, 'blood_rage', { hpRatio });
            }
            if (s.powers.has('titan_body') && hpRatio > 0.8) {
                result.damage *= 1.4;
                signal(player, 'titan_body', { mode: 'high_hp_damage' });
            }
            if (s.sets.has('dragon_rage') && hpRatio < 0.5) {
                result.damage *= 1.3;
                signal(player, 'dragon_rage', { mode: 'damage' });
            }
            const lowHp = mod(player, 'lowHpThreshold', 0.5);
            const lowDmg = mod(player, 'lowHpDamage', 0);
            if ((s.sets.has('crimson_scar') || lowDmg > 0) && hpRatio < lowHp) {
                result.damage *= 1 + (lowDmg || 0.12);
                if (s.sets.has('crimson_scar_apex')) {
                    result.damage *= 1 + Math.min(0.35, (1 - hpRatio) * 0.5);
                }
                signal(player, s.sets.has('crimson_scar_apex') ? 'crimson_scar_apex' : 'crimson_scar', { hpRatio });
            }
            if (s.sets.has('trail_sigil') || s.sets.has('beast_pact')) {
                const pets = Math.min(3, countPets(player));
                let bonus = 0;
                if (s.sets.has('trail_sigil')) bonus += pets * 0.04;
                if (s.sets.has('beast_pact')) bonus += 0.12 + pets * 0.05;
                if (s.sets.has('beast_pact_apex')) bonus += 0.2;
                if (bonus > 0) {
                    result.damage *= 1 + bonus;
                    signal(player, s.sets.has('beast_pact') ? 'beast_pact' : 'trail_sigil', { pets });
                }
            }
            if (target && s.sets.has('trail_sigil_apex')
                && target._trailMarkedUntil && target._trailMarkedUntil > now()) {
                result.damage *= 1.15;
                signal(player, 'trail_sigil_apex', { target });
            }
            if (target && (s.sets.has('hundred_pace') || s.sets.has('breathless_hunt')
                || s.powers.has('eagle_eye') || s.sets.has('windchaser_range'))) {
                const distance = Math.hypot(target.x - player.x, target.y - player.y);
                if (s.powers.has('eagle_eye') && distance > 150) {
                    result.damage *= 1.2;
                    s.counters.eagleFocus = Math.min(3, (s.counters.eagleFocus || 0) + 1);
                    if (s.counters.eagleFocus >= 3) s.flags.eagleFocusReady = true;
                    signal(player, 'eagle_eye', { distance, target, stacks: s.counters.eagleFocus });
                }
                if (s.sets.has('windchaser_range') && distance > 100) {
                    result.damage *= 1.2;
                    signal(player, 'windchaser_range', { distance });
                }
                if (s.sets.has('hundred_pace') && distance > 90) {
                    result.damage *= 1.1;
                    result.critDamageBonus += 10;
                }
                if (s.sets.has('breathless_hunt')) {
                    const weak = mod(player, 'weaknessDamage', 0.2);
                    if (target._classSkillMark === 'weakness_mark_de' || target.weaknessMarked
                        || (target._classSkillMark && target._classSkillMark.markId === 'weakness_mark_de')) {
                        result.damage *= 1 + weak;
                        result.critDamageBonus += s.sets.has('breathless_hunt_apex') ? 40 : 20;
                        signal(player, 'breathless_hunt', { target });
                    } else if (distance > 100) {
                        result.damage *= 1.12;
                    }
                    if (s.sets.has('breathless_hunt_apex') && target.maxHp > 0 && target.hp / target.maxHp < 0.35) {
                        result.damage *= 1.25;
                        signal(player, 'breathless_hunt_apex', { target });
                    }
                }
            }
            if (target && (s.sets.has('venom_censer') || s.sets.has('plague_altar') || mod(player, 'poisonDamage', 0) > 0)) {
                const poisoned = target.statusEffects && (
                    target.statusEffects.poison || target.poisonStacks || target._poisonStacks
                );
                if (poisoned) {
                    let amp = 0.12 + mod(player, 'poisonDamage', 0);
                    if (s.sets.has('plague_altar')) amp += 0.1;
                    if (s.sets.has('venom_censer_apex') || s.sets.has('plague_altar_apex')) amp += 0.1;
                    result.damage *= 1 + amp;
                    signal(player, s.sets.has('plague_altar') ? 'plague_altar' : 'venom_censer', { target });
                }
            }
            if (target && (s.sets.has('shadow_strike') || s.sets.has('night_veil') || s.sets.has('evernight_seal'))) {
                if (typeof target.angle === 'number') {
                    const fromTarget = Math.atan2(player.y - target.y, player.x - target.x);
                    let diff = Math.abs(fromTarget - target.angle);
                    while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
                    const angleBonus = mod(player, 'backstabAngleBonus', 0);
                    if (diff > Math.PI * (0.66 - angleBonus * 0.2)) {
                        let mult = s.sets.has('evernight_seal') ? 1.45 : (s.sets.has('night_veil') ? 1.25 : 1.4);
                        if (s.sets.has('evernight_seal_apex') || s.sets.has('night_veil_apex')) mult += 0.15;
                        result.damage *= mult;
                        signal(player, s.sets.has('evernight_seal') ? 'evernight_seal' : 'night_veil', { mode: 'backstab' });
                    }
                }
            }
            if (target && s.powers.has('assassinate')) {
                if (target.hp >= target.maxHp && !s.executeMarks.has(target)) {
                    s.executeMarks.set(target, true);
                    float(player, '处决印', '#ff6688');
                    signal(player, 'assassinate', { target, mode: 'mark' });
                } else if (s.executeMarks.get(target) && target.maxHp > 0 && target.hp / target.maxHp < 0.35) {
                    s.executeMarks.delete(target);
                    result.damage *= 2.2;
                    result.isCrit = true;
                    signal(player, 'assassinate', { target, mode: 'detonate' });
                }
            }
            if (target && s.powers.has('chain_lightning') && s.staticMarks.get(target)) {
                s.staticMarks.delete(target);
                const atk = player.baseAttack || 1;
                targets(player)
                    .filter(t => t !== target && Math.hypot(t.x - target.x, t.y - target.y) <= 180)
                    .slice(0, 2)
                    .forEach(t => deal(player, t, atk * 0.45, '静电弹跳', '#44ddff'));
                signal(player, 'chain_lightning', { target, mode: 'basic_jump' });
            }
            if (s.flags.windSoulReady) {
                result.isCrit = true;
                result.critDamageBonus += 150;
                s.flags.windSoulReady = false;
                s.windEnergy = 0;
                signal(player, 'wind_soul');
            }
            if (s.flags.shadowCounter || s.flags.mirrorArmed) {
                result.isCrit = true;
                result.critDamageBonus += s.flags.mirrorArmed ? 60 : 80;
                if (s.flags.mirrorArmed) {
                    result.damage *= 1.2;
                    s.flags.mirrorArmed = false;
                    signal(player, 'mirror_mask');
                } else {
                    s.flags.shadowCounter = false;
                    signal(player, 'shadow_counter');
                }
            }
            if (s.flags.gazeReady && s.sets.has('hundred_pace_apex')) {
                result.damage *= 1.35;
                result.isCrit = true;
                s.flags.gazeReady = false;
                signal(player, 'hundred_pace_apex', { target });
            }
            // echoDamageBonus 由 phantom-clone-system 接管，不在此对玩家普攻重复乘区
            return window.WeaponRefinementSystem
                ? window.WeaponRefinementSystem.modifyBasicAttack(player, target, result)
                : result;
        },

        afterBasicAttack(player, target, context) {
            const s = state(player);
            if (!s || !target) return;
            if (window.WeaponRefinementSystem) {
                window.WeaponRefinementSystem.afterBasicAttack(player, target, context);
            }
            const isCrit = !!(context && context.isCrit);
            if (isCrit && s.powers.has('dragon_breath')) {
                s.counters.dragonFlame = Math.min(3, (s.counters.dragonFlame || 0) + 1);
                if (s.counters.dragonFlame >= 3 && ready(s, 'dragon_breath', 6000)) {
                    s.counters.dragonFlame = 0;
                    areaDamage(player, target.x, target.y, 110, (player.baseAttack || 1) * 0.9, '龙息', '#ff6633');
                    signal(player, 'dragon_breath', { target, mode: 'full_stack' });
                } else {
                    float(player, `龙焰×${s.counters.dragonFlame}`, '#ff8855');
                }
            }
            if (isCrit && s.powers.has('shadow_dance')) {
                s.counters.shadowDance = (s.counters.shadowDance || 0) + 1;
                if (s.counters.shadowDance >= 3) {
                    s.counters.shadowDance = 0;
                    addBuff(player, 'shadow_dance', { dodge: 40, critDamage: 60 }, 4000);
                    signal(player, 'shadow_dance');
                }
            }
            if (isCrit && s.sets.has('fire_nova') && ready(s, 'fire_nova', 6000)) {
                areaDamage(player, target.x, target.y, 120, (player.baseAttack || 1) * 1.5, '火焰新星', '#ff4400');
                signal(player, 'fire_nova');
            }
            if ((isCrit || s.sets.has('crimson_scar')) && s.sets.has('crimson_scar') && ready(s, 'crimson_scar_heal', 800)) {
                const healPct = s.sets.has('crimson_scar_apex') ? 0.02 : 0.01;
                const heal = Math.max(1, Math.floor((player.maxHp || 1) * healPct));
                player.hp = Math.min(player.maxHp, (player.hp || 0) + heal);
            }
            if (isCrit && (s.sets.has('shadow_strike') || s.sets.has('night_veil') || s.sets.has('evernight_seal'))) {
                addBuff(player, 'shadow_strike', { moveSpeed: 30 }, 2000);
                if (s.sets.has('night_veil') && ready(s, 'night_veil_slash', 1500)) {
                    deal(player, target, (player.baseAttack || 1) * 0.45, '残影斩', '#c044ff');
                    signal(player, 'night_veil', { mode: 'echo' });
                }
                signal(player, 'shadow_strike', { mode: 'crit_speed' });
            }
            if (s.sets.has('chain_strike') || s.sets.has('venom_censer') || s.sets.has('plague_altar')) {
                s.counters.chainStrike = (s.counters.chainStrike || 0) + 1;
                if (s.counters.chainStrike >= 5) {
                    s.counters.chainStrike = 0;
                    if (s.sets.has('venom_censer') || s.sets.has('plague_altar')) {
                        const jumps = s.sets.has('plague_altar_apex') ? 4 : 3;
                        areaDamage(player, target.x, target.y, 160, (player.baseAttack || 1) * 1.6, '毒链', '#7dff62', jumps);
                        signal(player, s.sets.has('plague_altar') ? 'plague_altar' : 'venom_censer');
                    } else {
                        areaDamage(player, target.x, target.y, 160, (player.baseAttack || 1) * 2, '雷链', '#44ddff', 3);
                        signal(player, 'chain_strike');
                    }
                }
            }
            if (s.sets.has('trail_sigil_apex') && target) {
                target._trailMarkedUntil = now() + 3000;
            }
            if (s.sets.has('hundred_pace_apex')) {
                s.counters.precisionFeel = Math.min(5, (s.counters.precisionFeel || 0) + 1);
                if (s.counters.precisionFeel >= 5) {
                    s.counters.precisionFeel = 0;
                    s.flags.gazeReady = true;
                    float(player, '凝视就绪', '#9ad0ff');
                }
            }
        },

        onDodge(player) {
            const s = state(player);
            if (!s) return;
            if (window.WeaponRefinementSystem) window.WeaponRefinementSystem.onDodge(player);
            if (s.powers.has('phantom_step') && ready(s, 'phantom_step', 10000)) {
                addBuff(player, 'phantom_step', { moveSpeed: 50 }, 2000);
                signal(player, 'phantom_step');
            }
            if (s.sets.has('shadow_counter') && ready(s, 'shadow_counter', 5000)) {
                s.flags.shadowCounter = true;
                signal(player, 'shadow_counter', { mode: 'armed' });
            }
            if ((s.sets.has('swift_plume') || s.sets.has('swift_plume_apex')
                || s.sets.has('mirror_mask') || s.sets.has('myriad_mirror') || s.sets.has('echo_fold'))
                && ready(s, 'swift_plume', 4000)) {
                const apexPlume = s.sets.has('swift_plume_apex');
                addBuff(player, apexPlume ? 'swift_plume_apex' : 'swift_plume', {
                    moveSpeed: apexPlume ? 45 : 35,
                    attackSpeed: apexPlume ? 12 : 0
                }, apexPlume ? 2800 : 2000);
                float(player, s.sets.has('echo_fold') ? '叠影' : '疾羽', s.sets.has('echo_fold') ? '#c070ff' : '#8effb1');
                signal(player, s.sets.has('echo_fold') ? 'echo_fold' : (apexPlume ? 'swift_plume_apex' : 'swift_plume'));
            }
            if (s.sets.has('echo_fold_apex') && ready(s, 'echo_fold_apex', 6000)) {
                s.flags.echoFoldExtra = true;
                signal(player, 'echo_fold_apex', { mode: 'armed' });
            }
            if ((s.sets.has('mirror_mask') || s.sets.has('myriad_mirror')) && ready(s, 'mirror_mask', 5000)) {
                s.flags.mirrorArmed = true;
                signal(player, s.sets.has('myriad_mirror') ? 'myriad_mirror' : 'mirror_mask', { mode: 'armed' });
            }
            if (s.sets.has('mirror_mask_apex') && ready(s, 'mirror_burst', 8000)) {
                areaDamage(player, player.x, player.y, 100, (player.baseAttack || 1) * 0.8, '镜碎', '#88e0ff');
                signal(player, 'mirror_mask_apex');
            }
        },

        beforeDamage(player, amount) {
            const s = state(player);
            if (!s) return amount;
            const hpRatio = player.maxHp > 0 ? player.hp / player.maxHp : 1;
            if (s.powers.has('titan_body') && hpRatio < 0.3) {
                amount *= 0.6;
                signal(player, 'titan_body', { mode: 'low_hp_reduction' });
            }
            if (s.sets.has('dragon_rage') && hpRatio < 0.5) {
                amount *= 0.85;
                signal(player, 'dragon_rage', { mode: 'reduction' });
            }
            return amount;
        },

        afterDamage(player, attacker, actualDamage) {
            const s = state(player);
            if (!s || actualDamage <= 0) return;
            if (window.WeaponRefinementSystem) {
                window.WeaponRefinementSystem.afterDamage(player, attacker, actualDamage);
            }
            if (s.powers.has('frost_nova') && Math.random() < 0.2) {
                targets(player).forEach(target => {
                    if (Math.hypot(target.x - player.x, target.y - player.y) <= 110) {
                        target.frozenUntil = Math.max(target.frozenUntil || 0, now() + 2000);
                    }
                });
                float(player, '霜冻新星', '#66eeff');
                signal(player, 'frost_nova');
            }
            if (s.sets.has('frost_touch') && attacker && Math.random() < 0.25) {
                attacker.frozenUntil = Math.max(attacker.frozenUntil || 0, now() + 2000);
                signal(player, 'frost_touch');
            }
            if (s.sets.has('valor_shield') && Math.random() < 0.2 && ready(s, 'valor_shield', 6000)) {
                addShield(player, 'valor_shield', player.maxHp * 0.15, 6000);
                float(player, '无畏护盾', '#ffee88');
                signal(player, 'valor_shield');
            }
            if ((s.sets.has('oath_shield') || s.sets.has('bulwark_oath') || s.sets.has('temple_covenant'))
                && Math.random() < 0.22 && ready(s, 'grad_shield', 6000)) {
                const pct = s.sets.has('temple_covenant') ? 0.18 : 0.12;
                addShield(player, 'valor_shield', player.maxHp * pct, 6000);
                float(player, '誓约护盾', '#ffe08a');
                signal(player, s.sets.has('temple_covenant') ? 'temple_covenant' : 'oath_shield');
            }
            if (s.sets.has('oath_shield_apex') && ready(s, 'oath_apex_dr', 8000)) {
                addBuff(player, 'oath_shield_apex', { damageReduction: 10 }, 3000);
                signal(player, 'oath_shield_apex');
            }
        },

        preventDeath(player) {
            const s = state(player);
            if (!s) return false;
            if (s.powers.has('phoenix') && ready(s, 'phoenix', 300000)) {
                player.hp = Math.max(1, Math.floor(player.maxHp * 0.4));
                player.invincibleUntil = now() + 3000;
                float(player, '不死鸟!', '#ff8844');
                signal(player, 'phoenix');
                return true;
            }
            if (s.sets.has('temple_covenant_apex') && ready(s, 'temple_covenant_apex', 120000)) {
                player.hp = Math.max(1, Math.floor(player.maxHp * 0.2));
                addShield(player, 'temple_covenant_apex', player.maxHp * 0.35, 4000);
                float(player, '圣殿庇护!', '#d0e0ff');
                signal(player, 'temple_covenant_apex');
                return true;
            }
            return false;
        },

        onBlock(player) {
            const s = state(player);
            if (!s) return;
            if (s.powers.has('immortal_shield') && ready(s, 'immortal_shield', 6000)) {
                if (typeof player.heal === 'function') player.heal(Math.floor(player.maxHp * 0.08));
                else player.hp = Math.min(player.maxHp, player.hp + Math.floor(player.maxHp * 0.08));
                signal(player, 'immortal_shield');
            }
            if ((s.sets.has('bulwark_oath') || s.sets.has('bulwark_oath_apex')) && ready(s, 'bulwark_oath', 5000)) {
                addShield(player, 'bulwark_oath', player.maxHp * 0.1, 4000);
                if (s.sets.has('bulwark_oath_apex')) {
                    addBuff(player, 'bulwark_oath_apex', { damageReduction: 8 }, 2500);
                }
                signal(player, 'bulwark_oath');
            }
        },

        beforeSkill(player, skillDef) {
            const s = state(player);
            if (!s || !skillDef) return skillDef;
            const skill = Object.assign({}, skillDef);
            const hpRatio = player.maxHp > 0 ? player.hp / player.maxHp : 1;
            let multiplier = 1;
            if (s.powers.has('blood_rage')) multiplier *= 1 + Math.floor((1 - hpRatio) * 10) * 0.05;
            if (s.powers.has('titan_body') && hpRatio > 0.8) multiplier *= 1.4;
            const resource = player.classResource;
            if (s.powers.has('element_avatar') && resource && resource.max > 0 && resource.current >= resource.max * 0.9) multiplier *= 1.5;
            if (s.sets.has('dragon_rage') && hpRatio < 0.5) multiplier *= 1.3;
            if (s.flags.warGodArmed) {
                multiplier *= 1.45;
                s.flags.warGodArmed = false;
                s.counters.warIntent = 0;
                signal(player, 'war_god_fury', { mode: 'consume' });
            }
            if (s.flags.eagleFocusReady) {
                multiplier *= 1.35;
                skill._equipmentGuaranteedCrit = true;
                skill._equipmentArmorPenPercent = 25;
                s.flags.eagleFocusReady = false;
                s.counters.eagleFocus = 0;
                signal(player, 'eagle_eye', { mode: 'consume' });
            }
            if (s.flags.arcaneSurgeReady) {
                skill._equipmentEchoPulse = true;
                s.flags.arcaneSurgeReady = false;
                signal(player, 'arcane_surge', { mode: 'echo' });
            }
            if (s.flags.deathArrivalReady) {
                multiplier *= 1.55;
                skill._equipmentSoulEcho = true;
                s.flags.deathArrivalReady = false;
                s.counters.deathSouls = 0;
                if (player.skillCooldowns) {
                    ['shadow_step', 'shadowstep', 'wind_step', 'blink', 'phase_shift'].forEach(id => {
                        if (id in player.skillCooldowns) player.skillCooldowns[id] = 0;
                    });
                }
                signal(player, 'death_arrival', { mode: 'consume' });
            }
            if (s.flags.arcaneComboReady) {
                multiplier *= 1.35;
                s.flags.arcaneComboReady = false;
                signal(player, 'arcane_combo');
            }
            if (s.sets.has('ember_residue') || s.sets.has('torrent_throne') || s.sets.has('star_oracle')) {
                if (s.flags.elementArmed) {
                    multiplier *= s.sets.has('torrent_throne_apex') ? 1.4 : 1.28;
                    s.flags.elementArmed = false;
                    signal(player, s.sets.has('torrent_throne') ? 'torrent_throne' : 'ember_residue');
                }
            }
            if (s.sets.has('holy_balance') || s.sets.has('holy_balance_apex')) {
                if (skillLooksLike(skill, ['judgment', 'holy', 'divine'])) {
                    multiplier *= 1 + mod(player, 'judgmentDamage', 0.15);
                    if (s.flags.holyBalanceArmed || s.sets.has('holy_balance_apex')) {
                        multiplier *= 1.25;
                        skill._equipmentJudgmentNova = true;
                        s.flags.holyBalanceArmed = false;
                        signal(player, 'holy_balance_apex');
                    }
                }
            }
            // 碎击 = 狂暴碎击(fury_slam) / 毁灭裂波(devastation_rift)
            if (s.sets.has('rift_howl') && skillLooksLike(skill, ['fury_slam', 'devastation_rift', 'fury', 'devastation', 'rift'])) {
                multiplier *= 1.15;
                skill._equipmentRiftWave = true;
                if (s.sets.has('rift_howl_apex')) {
                    addBuff(player, 'rift_howl_apex', { attackSpeed: 20 }, 3000);
                }
            }
            if (s.sets.has('fate_web') && skillLooksLike(skill, ['fate', 'time', 'chrono', 'oracle'])) {
                multiplier *= 1.12;
                if (s.sets.has('fate_web_apex')) skill._equipmentFateFreeze = true;
            }
            if (s.sets.has('grave_throne') && skillLooksLike(skill, ['undead', 'nether', 'soul', 'death', 'legion'])) {
                multiplier *= 1 + mod(player, 'summonPower', 0.15);
            }
            if (multiplier !== 1) {
                skill.damageMultiplier = (skill.damageMultiplier || 1) * multiplier;
                if (skill.entityConfig) {
                    skill.entityConfig = Object.assign({}, skill.entityConfig);
                    if (typeof skill.entityConfig.damageMultiplier === 'number') {
                        skill.entityConfig.damageMultiplier *= multiplier;
                    }
                }
            }
            return skill;
        },

        onSkillCast(player, skillDef) {
            const s = state(player);
            if (!s || !skillDef) return;
            if (window.WeaponRefinementSystem) {
                window.WeaponRefinementSystem.onSkillCast(player, skillDef);
            }
            if (s.powers.has('war_god_fury')) {
                s.counters.warIntent = Math.min(3, (s.counters.warIntent || 0) + 1);
                if (s.counters.warIntent >= 3) {
                    s.flags.warGodArmed = true;
                    ensureBuffStatus(player, 'war_god_fury', 5000);
                    float(player, '战意满盈', '#ffaa44');
                }
            }
            if (s.powers.has('arrow_rain') && s.flags.arrowRainReady) {
                s.flags.arrowRainReady = false;
                s.arrowWind = 0;
                areaDamage(player, player.x, player.y, 145, (player.baseAttack || 1) * 2.4, '箭雨', '#aadd66');
                signal(player, 'arrow_rain', { mode: 'wind_release' });
            }
            if (s.powers.has('mana_shield')) {
                const cost = Number(skillDef.resourceCost || skillDef.cost || 0);
                addShield(player, 'mana_shield', Math.max(1, cost * 0.3), 5000);
                signal(player, 'mana_shield', { cost });
            }
            if (s.powers.has('arcane_surge')) {
                const id = skillDef.id || skillDef.name;
                s.differentSkills = s.differentSkills.filter(entry => entry !== id);
                s.differentSkills.push(id);
                if (s.differentSkills.length > 3) s.differentSkills.shift();
                if (s.differentSkills.length === 3 && new Set(s.differentSkills).size === 3) {
                    s.flags.arcaneSurgeReady = true;
                    s.differentSkills = [];
                    float(player, '奥术编织完成', '#b56dff');
                }
            }
            if (skillDef._equipmentEchoPulse) {
                areaDamage(player, player.x, player.y, 90, (player.baseMagicAttack || player.baseAttack || 1) * 0.35, '奥术余波', '#b56dff');
            }
            if (skillDef._equipmentSoulEcho) {
                const nearest = targets(player)
                    .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
                if (nearest) deal(player, nearest, (player.baseAttack || 1) * 0.55, '收魂残影', '#8d55ce');
            }
            if (s.sets.has('arcane_combo') || s.sets.has('ember_residue') || s.sets.has('torrent_throne') || s.sets.has('star_oracle')) {
                s.flags.arcaneComboReady = true;
                s.flags.elementArmed = true;
            }
            if (s.sets.has('ember_residue') && ready(s, 'ember_residue', 3500)) {
                areaDamage(player, player.x, player.y, 90, (player.baseMagicAttack || player.baseAttack || 1) * 0.55, '元素余波', '#ff8a4a');
                signal(player, 'ember_residue');
            }
            if (s.sets.has('ember_residue_apex') || s.sets.has('torrent_throne_apex')) {
                if (ready(s, 'element_chain', 5000)) {
                    areaDamage(player, player.x, player.y, 120, (player.baseMagicAttack || player.baseAttack || 1) * 0.4, '元素连锁', '#8a6aff', 3);
                    signal(player, s.sets.has('torrent_throne_apex') ? 'torrent_throne_apex' : 'ember_residue_apex');
                }
            }
            if (s.sets.has('star_oracle') && ready(s, 'star_oracle', 6000)) {
                addShield(player, 'star_oracle', player.maxHp * 0.08, 4000);
                signal(player, 'star_oracle');
            }
            if (s.sets.has('star_oracle_apex') && ready(s, 'star_oracle_apex', 8000)) {
                addBuff(player, 'star_oracle_apex', { skillHaste: 12, attackSpeed: 10 }, 4000);
                signal(player, 'star_oracle_apex');
            }
            if (s.sets.has('oath_shield') && skillLooksLike(skillDef, ['shield', 'holy', 'judgment', 'consecrat'])
                && ready(s, 'oath_shield', 4000)) {
                areaDamage(player, player.x, player.y, 100, (player.baseAttack || 1) * 0.8, '圣光余波', '#ffe08a');
                signal(player, 'oath_shield');
            }
            if (skillDef._equipmentJudgmentNova) {
                areaDamage(player, player.x, player.y, 140, (player.baseAttack || 1) * 1.4, '神罚', '#ffe9a0');
                signal(player, 'holy_balance');
            }
            if (skillDef._equipmentRiftWave) {
                scheduleOrFireRiftWaves(player, skillDef, s);
            }
            if (skillDef._equipmentFateFreeze) {
                targets(player).forEach(t => {
                    if (Math.hypot(t.x - player.x, t.y - player.y) <= 140) {
                        t.frozenUntil = Math.max(t.frozenUntil || 0, now() + 1200);
                    }
                });
                signal(player, 'fate_web_apex');
            }
            if (s.sets.has('curse_echo') && skillLooksLike(skillDef, ['curse', 'agony', 'drain', 'harvest', 'shadow'])
                && ready(s, 'curse_echo', 4000)) {
                areaDamage(player, player.x, player.y, 120, (player.baseMagicAttack || player.baseAttack || 1) * 0.6, '咒缚残响', '#9b6aff', 3);
                signal(player, 'curse_echo');
            }
            if (s.sets.has('curse_echo_apex') && ready(s, 'curse_echo_apex', 7000)) {
                areaDamage(player, player.x, player.y, 110, (player.baseMagicAttack || player.baseAttack || 1) * 0.9, '灵魂爆发', '#d0b0ff');
                signal(player, 'curse_echo_apex');
            }
            if (s.sets.has('myriad_mirror_apex') && skillLooksLike(skillDef, ['mirror', 'illusion', 'phantom', 'decoy'])
                && ready(s, 'myriad_mirror_apex', 8000)) {
                targets(player).forEach(t => {
                    if (Math.hypot(t.x - player.x, t.y - player.y) <= 130) {
                        t.frozenUntil = Math.max(t.frozenUntil || 0, now() + 1000);
                    }
                });
                signal(player, 'myriad_mirror_apex');
            }
            if ((s.sets.has('echo_fold') || s.sets.has('echo_fold_apex'))
                && skillLooksLike(skillDef, ['wind', 'phantom', 'echo', 'blade', 'salvo', 'array'])
                && ready(s, 'echo_fold_extra', s.sets.has('echo_fold_apex') ? 4500 : 6000)) {
                const nearest = targets(player)
                    .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
                const mult = s.sets.has('echo_fold_apex') ? 0.65 : 0.45;
                if (nearest) {
                    deal(player, nearest, (player.baseAttack || 1) * mult, '叠影斩', '#c070ff');
                }
                if (s.flags.echoFoldExtra && typeof window.queuePhantomEchoAction === 'function'
                    && typeof window.isPhantomPlayer === 'function' && window.isPhantomPlayer(player)) {
                    s.flags.echoFoldExtra = false;
                    window.queuePhantomEchoAction(player, {
                        skillDef: skillDef,
                        entityConfig: skillDef.entityConfig || {},
                        speed: 900,
                        maxRange: 420
                    }, player.gameInstance, now(), {
                        replayDelayMs: s.sets.has('echo_fold_apex') ? 180 : 260
                    });
                }
                signal(player, s.sets.has('echo_fold_apex') ? 'echo_fold_apex' : 'echo_fold', { mode: 'skill_echo' });
            }
            if (s.sets.has('holy_balance') && skillLooksLike(skillDef, ['judgment', 'holy'])) {
                s.counters.holyEnergy = Math.min(5, (s.counters.holyEnergy || 0) + 1);
                if (s.counters.holyEnergy >= 5) {
                    s.counters.holyEnergy = 0;
                    s.flags.holyBalanceArmed = true;
                    float(player, '天平就绪', '#ffe9a0');
                }
            }
        },

        onKill(player, monster) {
            const s = state(player);
            if (!s) return;
            if (window.WeaponRefinementSystem) {
                window.WeaponRefinementSystem.onKill(player, monster);
            }
            if (s.powers.has('chain_lightning') && monster) {
                targets(player)
                    .filter(t => t !== monster && Math.hypot(t.x - monster.x, t.y - monster.y) <= 170)
                    .slice(0, 3)
                    .forEach(t => {
                        s.staticMarks.set(t, true);
                        float(player, '静电', '#44ddff');
                    });
                signal(player, 'chain_lightning', { target: monster, mode: 'mark' });
            }
            if (s.powers.has('death_arrival')) {
                s.counters.deathSouls = Math.min(3, (s.counters.deathSouls || 0) + 1);
                if (s.counters.deathSouls >= 3) {
                    s.flags.deathArrivalReady = true;
                    float(player, '死神满魂', '#bb83ff');
                }
            }
            if (s.sets.has('star_stack') || s.sets.has('fate_web')) {
                if ((s.flags.starExpires || 0) <= now()) {
                    s.counters.starStack = 0;
                    s.starBase = null;
                }
                const stacks = Math.min(3, (s.counters.starStack || 0) + 1);
                s.counters.starStack = stacks;
                s.flags.starExpires = now() + 10000;
                if (!s.starBase) {
                    s.starBase = {
                        health: player.maxHp || 0,
                        attack: player.baseAttack || 0,
                        magicAttack: player.baseMagicAttack || 0,
                        defense: player.baseDefense || 0,
                        magicDefense: player.baseMagicDefense || 0,
                        critRate: player.baseCritRate || 0,
                        critDamage: player.baseCritDamage || 0,
                        dodge: player.baseDodge || 0,
                        attackSpeed: player.baseAttackSpeed || 0
                    };
                }
                const frac = stacks * 0.05;
                addBuff(player, 'star_stack', {
                    health: Math.floor(s.starBase.health * frac),
                    attack: Math.floor(s.starBase.attack * frac),
                    magicAttack: Math.floor(s.starBase.magicAttack * frac),
                    defense: Math.floor(s.starBase.defense * frac),
                    magicDefense: Math.floor(s.starBase.magicDefense * frac),
                    critRate: s.starBase.critRate * frac,
                    critDamage: s.starBase.critDamage * frac,
                    dodge: s.starBase.dodge * frac,
                    attackSpeed: s.starBase.attackSpeed * frac
                }, 10000);
                signal(player, s.sets.has('fate_web') ? 'fate_web' : 'star_stack', { stacks });
            }
            if (s.sets.has('grave_throne') || s.sets.has('grave_throne_apex')) {
                areaDamage(player, monster ? monster.x : player.x, monster ? monster.y : player.y,
                    100, (player.baseMagicAttack || player.baseAttack || 1) * (s.sets.has('grave_throne_apex') ? 0.7 : 0.4),
                    '坟火', '#8a9a7a');
                signal(player, 'grave_throne');
            }
            if (s.sets.has('beast_pact_apex') && ready(s, 'beast_pact_apex', 15000)) {
                addBuff(player, 'beast_pact_apex', { attackSpeed: 25, attack: Math.floor((player.baseAttack || 0) * 0.1) }, 5000);
                float(player, '万兽狂暴', '#8bff7a');
                signal(player, 'beast_pact_apex');
            }
        }
    };

    window.EquipmentEffectSystem = api;
    /** 职业系统统一读取套装 2 件 modifiers */
    window.getSetModifier = function getSetModifier(player, key, fallback) {
        return api.getModifier(player, key, fallback == null ? 0 : fallback);
    };
})();
