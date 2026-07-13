/**

 * 基础法师 · 双元素相位 + 元素对冲（Elemental Clash）

 */

(function () {

    'use strict';



    const PHASES = {

        fire: { name: '灼热', color: '#ff6622', next: 'frost' },

        frost: { name: '霜寒', color: '#66bbff', next: 'fire' }

    };



    const CD_REDUCE = { fireball: 800, frost_nova: 1500 };

    const BLINK_MANA_REFUND = 15;



    const CLASH = {

        thermal_shatter: { radius: 120, dmgMult: 2.0, freezeMs: 600, text: '急冷!', shake: 5 },

        thermal_shockwave: { radius: 110, dmgMult: 1.8, knockback: 40, burnMs: 4000, text: '热震!', shake: 4.5 },

        resonance: { radius: 80, dmgMult: 0.5, text: '共鸣', shake: 0 },

        blink_end: { dmgMult: 1.2 },

        blink_start: { dmgMult: 1.0 },

        blink_rift: { durationMs: 1500, width: 38, tickIntervalMs: 1000, tickRatio: 0.3 }

    };



    function classId(player) {

        if (!player || !player.classData) return null;

        return typeof window.getActiveClassId === 'function'

            ? window.getActiveClassId(player.classData) : null;

    }



    function isBaseMage(player) {

        return classId(player) === 'mage';

    }



    window.isBaseMagePhasePlayer = isBaseMage;



    function magicAtk(player) {

        return player.baseMagicAttack || player.baseAttack || 10;

    }



    function ensureRifts(g) {
        if (!g) return null;
        if (!g._skillEntities) {
            g._skillEntities = {
                projectiles: [], summons: [], fields: [], charges: [],
                pendingInstants: [], magePhaseRifts: []
            };
        }
        if (!g._skillEntities.magePhaseRifts) g._skillEntities.magePhaseRifts = [];
        return g._skillEntities.magePhaseRifts;
    }



    function floatText(g, x, y, text, color, size, fixed) {

        if (g && typeof g.addFloatingText === 'function') {

            g.addFloatingText(x, y, text, color || '#ffaa44', size ? 1100 : 900, size || 14, !!fixed);

        }

    }



    function floatGold(g, x, y, text) {

        floatText(g, x, y, text, '#ffdd44', 24, false);

    }



    function screenShake(g, amp, durationMs, bigFrames) {

        if (!g || !g.screenShake) return;

        g.screenShake.amplitude = Math.max(g.screenShake.amplitude, amp);

        g.screenShake.timer = Math.max(g.screenShake.timer, durationMs);

        g.screenShake.duration = Math.max(g.screenShake.duration, durationMs);

        g.screenShake.bigFrames = Math.max(g.screenShake.bigFrames, bigFrames || 2);

    }



    function playSound(g, name) {

        if (g && g.soundManager && typeof g.soundManager.playSound === 'function') {

            try { g.soundManager.playSound(name); } catch (e) { /* ignore */ }

        }

    }



    function pushKnockback(monster, cx, cy, force) {

        if (!monster || !force) return;

        const dx = monster.x - cx;

        const dy = monster.y - cy;

        const dist = Math.hypot(dx, dy) || 1;

        monster.x += (dx / dist) * force;

        monster.y += (dy / dist) * force;

    }



    function distToSegment(px, py, x1, y1, x2, y2) {

        const dx = x2 - x1;

        const dy = y2 - y1;

        const len2 = dx * dx + dy * dy;

        if (len2 === 0) return Math.hypot(px - x1, py - y1);

        let t = ((px - x1) * dx + (py - y1) * dy) / len2;

        t = Math.max(0, Math.min(1, t));

        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));

    }



    function monstersInRadius(player, g, cx, cy, radius) {

        const list = g && g.monsters ? g.monsters : [];

        const out = [];

        list.forEach(m => {

            if (!m || m.hp <= 0) return;

            if (Math.hypot(m.x - cx, m.y - cy) <= radius + (m.size || 16) * 0.4) out.push(m);

        });

        return out;

    }



    function applyClashDamage(player, g, cx, cy, radius, dmgMult, onHit) {

        const dmg = Math.max(1, Math.floor(magicAtk(player) * dmgMult));

        monstersInRadius(player, g, cx, cy, radius).forEach(m => {

            m.takeDamage(dmg);

            if (onHit) onHit(m);

            floatText(g, m.x, m.y - 8, String(dmg), '#ffcc66', 16, true);

        });

        if (g && typeof g.triggerHitImpact === 'function') {

            g.triggerHitImpact(cx, cy, {

                isRanged: true, isCrit: true,

                sourceX: player.x, sourceY: player.y, skipSound: true

            });

        }

    }



    function playClashVfx(g, x, y, type, opts) {

        if (typeof window.playMageElementClashVfx === 'function') {

            window.playMageElementClashVfx(g, x, y, type, opts || {});

        }

    }



    function setPhaseLabel(player, g, phase) {

        if (!PHASES[phase]) return;

        floatText(g, player.x, player.y - 24, PHASES[phase].name + '相位', PHASES[phase].color);

    }



    function triggerThermalShatter(player, g) {

        const cfg = CLASH.thermal_shatter;

        const px = player.x;

        const py = player.y;

        applyClashDamage(player, g, px, py, cfg.radius, cfg.dmgMult, m => {

            if (typeof window.applyMonsterFreeze === 'function') {

                window.applyMonsterFreeze(m, cfg.freezeMs, Date.now());

            }

        });

        floatGold(g, px, py - 40, cfg.text);

        screenShake(g, cfg.shake, 300, 3);

        playClashVfx(g, px, py, 'thermal_shatter', { radius: cfg.radius, fromPhase: 'fire', toPhase: 'frost' });

        playSound(g, 'freeze');

        setTimeout(() => playSound(g, 'explosion'), 80);

    }



    function triggerThermalShockwave(player, g) {

        const cfg = CLASH.thermal_shockwave;

        const px = player.x;

        const py = player.y;

        applyClashDamage(player, g, px, py, cfg.radius, cfg.dmgMult, m => {

            pushKnockback(m, px, py, cfg.knockback);

            if (typeof window.applyCombatStatus === 'function') {

                window.applyCombatStatus(m, 'burn', { durationMs: cfg.burnMs }, player, g);

            }

        });

        floatGold(g, px, py - 40, cfg.text);

        screenShake(g, cfg.shake, 280, 3);

        playClashVfx(g, px, py, 'thermal_shockwave', { radius: cfg.radius, fromPhase: 'frost', toPhase: 'fire' });

        playSound(g, 'freeze');

        setTimeout(() => playSound(g, 'explosion'), 100);

    }



    function triggerPhaseResonance(player, g, phase) {

        const cfg = CLASH.resonance;

        const px = player.x;

        const py = player.y;

        const now = Date.now();

        applyClashDamage(player, g, px, py, cfg.radius, cfg.dmgMult);

        monstersInRadius(player, g, px, py, cfg.radius).forEach(m => {

            const st = m.combatStatuses;

            if (phase === 'fire' && st && st.burn) {

                st.burn.until = now + 4000;

            }

            if (phase === 'frost' && st && st.frostbite) {

                st.frostbite.until = now + 4000;

                if (m.slowEffects && m.slowEffects.length) {

                    m.slowEffects.forEach(se => { se.expireTime = Math.max(se.expireTime, now + 4000); });

                }

            }

        });

        floatText(g, px, py - 32, cfg.text, PHASES[phase].color, 14, false);

        playClashVfx(g, px, py, 'resonance', { radius: cfg.radius, phase });

        playSound(g, 'swing');

    }



    function applyElementBlast(player, g, x, y, radius, dmgMult, phase, label) {

        const dmg = Math.max(1, Math.floor(magicAtk(player) * dmgMult));

        monstersInRadius(player, g, x, y, radius).forEach(m => {

            m.takeDamage(dmg);

            if (phase === 'fire' && typeof window.applyCombatStatus === 'function') {

                window.applyCombatStatus(m, 'burn', { durationMs: 3000 }, player, g);

            } else if (phase === 'frost' && typeof window.applyCombatStatus === 'function') {

                window.applyCombatStatus(m, 'frostbite', { durationMs: 3000 }, player, g);

            }

        });

        if (label) floatText(g, x, y - 16, label, PHASES[phase] && PHASES[phase].color, 14, true);

    }



    function spawnPhaseRift(player, g, ox, oy, tx, ty, fromPhase, toPhase, now) {

        const cfg = CLASH.blink_rift;

        const rifts = ensureRifts(g);

        if (!rifts) return;

        rifts.push({

            ox, oy, tx, ty,

            width: cfg.width,

            expireTime: now + cfg.durationMs,

            tickIntervalMs: cfg.tickIntervalMs,

            lastTick: now,

            dmgPerTick: Math.max(1, Math.floor(magicAtk(player) * cfg.tickRatio)),

            owner: player,

            fromPhase, toPhase

        });

        playClashVfx(g, (ox + tx) * 0.5, (oy + ty) * 0.5, 'blink_rift', {

            ox, oy, targetX: tx, targetY: ty, fromPhase, toPhase,

            radius: Math.hypot(tx - ox, ty - oy) * 0.5,

            durationMs: cfg.durationMs

        });

    }



    window.onBaseMageSkillCastPhase = function onBaseMageSkillCastPhase(player, skillDef, g) {

        if (!isBaseMage(player) || !skillDef) return;

        const ec = skillDef.entityConfig || {};

        if (ec.skipPhaseSwitch) return;



        const prev = player._elementPhase || null;

        const isFire = skillDef.id === 'fireball' || ec.elementTag === 'fire';

        const isFrost = skillDef.id === 'frost_nova' || ec.elementTag === 'frost';

        if (!isFire && !isFrost) return;



        const next = isFire ? 'fire' : 'frost';



        if (prev === 'fire' && isFrost) {
            triggerThermalShatter(player, g);
            player._elementPhase = 'frost';
            setPhaseLabel(player, g, 'frost');
            if (typeof window.onBaseMagePhaseSwitched === 'function') {
                window.onBaseMagePhaseSwitched(player, g, prev, 'frost', { skipPulse: true });
            }
            return;
        }
        if (prev === 'frost' && isFire) {
            triggerThermalShockwave(player, g);
            player._elementPhase = 'fire';
            setPhaseLabel(player, g, 'fire');
            if (typeof window.onBaseMagePhaseSwitched === 'function') {
                window.onBaseMagePhaseSwitched(player, g, prev, 'fire', { skipPulse: true });
            }
            return;
        }
        if (prev === next) {
            triggerPhaseResonance(player, g, next);
            return;
        }

        player._elementPhase = next;
        setPhaseLabel(player, g, next);
        if (typeof window.onBaseMagePhaseSwitched === 'function') {
            window.onBaseMagePhaseSwitched(player, g, prev, next, {});
        }

    };



    window.toggleBaseMagePhaseOnBlink = function toggleBaseMagePhaseOnBlink(player, g) {

        if (!isBaseMage(player)) return;

        const now = Date.now();

        const prev = player._elementPhase || 'fire';

        const next = PHASES[prev] ? PHASES[prev].next : 'frost';



        const ox = player._lastBlinkOriginX != null ? player._lastBlinkOriginX : player.x;

        const oy = player._lastBlinkOriginY != null ? player._lastBlinkOriginY : player.y;

        const tx = player.x;

        const ty = player.y;

        const blastR = 60;



        applyElementBlast(player, g, ox, oy, blastR, CLASH.blink_start.dmgMult, prev);

        applyElementBlast(player, g, tx, ty, blastR, CLASH.blink_end.dmgMult, next);



        if (prev !== next) {

            spawnPhaseRift(player, g, ox, oy, tx, ty, prev, next, now);

        }



        player._elementPhase = next;

        floatText(g, tx, ty - 44, '相位转移!', '#c8aaff', 20, false);

        screenShake(g, 3.5, 240, 2);

        playClashVfx(g, ox, oy, 'blink_start', { radius: blastR, phase: prev, targetX: tx, targetY: ty });

        playClashVfx(g, tx, ty, 'blink_end', {
            radius: blastR, phase: next, fromPhase: prev, toPhase: next
        });

        playSound(g, 'teleport');

        setTimeout(() => playSound(g, 'explosion'), 120);



        if (typeof window.grantSkillResource === 'function') {
            window.grantSkillResource(player, BLINK_MANA_REFUND);
        }
        if (typeof window.onBaseMagePhaseSwitched === 'function') {
            window.onBaseMagePhaseSwitched(player, g, prev, next, { skipPulse: true });
        }
    };



    window.getBaseMagePhaseCooldownAdjust = function getBaseMagePhaseCooldownAdjust(player, skillId, baseCdMs) {

        if (!isBaseMage(player) || !skillId || baseCdMs <= 0) return baseCdMs;

        const phase = player._elementPhase;

        if (phase === 'fire' && skillId === 'fireball') {

            return Math.max(600, baseCdMs - CD_REDUCE.fireball);

        }

        if (phase === 'frost' && skillId === 'frost_nova') {

            return Math.max(600, baseCdMs - CD_REDUCE.frost_nova);

        }

        return baseCdMs;

    };



    window.getBaseMageProjectileColor = function getBaseMageProjectileColor(player) {
        if (!isBaseMage(player)) return null;
        const phase = player._elementPhase;
        if (phase === 'fire') return '#ff4433';
        if (phase === 'frost') return '#4499ff';
        return '#9966ff';
    };

    window.getBaseMagePhaseVfxFamily = function getBaseMagePhaseVfxFamily(player) {
        if (!isBaseMage(player)) return null;
        const phase = player._elementPhase;
        if (phase === 'fire') return 'mage_phase_fire';
        if (phase === 'frost') return 'mage_phase_frost';
        return 'mana';
    };



    window.applyBaseMageBasicPhaseEffect = function applyBaseMageBasicPhaseEffect(player, monster, g) {
        if (!isBaseMage(player) || !monster || monster.hp <= 0) return;
        const phase = player._elementPhase;
        if (!phase) return;
        const now = Date.now();
        if (phase === 'fire' && typeof window.applyCombatStatus === 'function') {
            window.applyCombatStatus(monster, 'burn', { durationMs: 3000 }, player, g);
            const inst = monster.combatStatuses && monster.combatStatuses.burn;
            if (inst) inst.sourceAttack = Math.floor(magicAtk(player) * 1.5);
        } else if (phase === 'frost' && typeof window.applyMonsterSlowPercent === 'function') {
            window.applyMonsterSlowPercent(monster, 25, 2000, now);
        }
    };

    window.applyBaseMageElementalStormConfig = function applyBaseMageElementalStormConfig(player, skillDef, baseCfg) {
        if (!isBaseMage(player) || !skillDef || skillDef.id !== 'elemental_storm' || !baseCfg) return baseCfg;
        const phase = player._elementPhase;
        const cfg = Object.assign({}, baseCfg);
        if (phase === 'fire') {
            cfg.range = 180;
            cfg.knockback = 50;
            cfg.statusOnHit = [{ type: 'burn', durationMs: 4000, stacks: 2 }];
        } else if (phase === 'frost') {
            cfg.range = 130;
            cfg.freezeMs = 3000;
            cfg.debuffSlowPercent = 50;
            cfg.debuffDurationMs = 6000;
            cfg.statusOnHit = [{ type: 'frostbite', durationMs: 4000 }];
        }
        return cfg;
    };

    window.tickBaseMageElementStates = function tickBaseMageElementStates(player, g, now) {
        if (!isBaseMage(player) || !g) return;
        if (typeof window.tickBaseMageSurgeStates === 'function') {
            window.tickBaseMageSurgeStates(player, g, now);
        }

        const rifts = ensureRifts(g);

        if (!rifts || !rifts.length) return;

        const t = now != null ? now : Date.now();

        g._skillEntities.magePhaseRifts = rifts.filter(rift => {

            if (t >= rift.expireTime) return false;

            if (t - rift.lastTick >= rift.tickIntervalMs) {

                rift.lastTick = t;

                (g.monsters || []).forEach(m => {

                    if (!m || m.hp <= 0) return;

                    if (distToSegment(m.x, m.y, rift.ox, rift.oy, rift.tx, rift.ty) > rift.width) return;

                    m.takeDamage(rift.dmgPerTick);

                    floatText(g, m.x, m.y - 6, String(rift.dmgPerTick), '#cc88ff', 14, true);

                });

            }

            return true;

        });

    };

})();


