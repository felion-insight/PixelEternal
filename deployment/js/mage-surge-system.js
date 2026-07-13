/**
 * 基础法师 · 元素涌动（Elemental Surge）
 * 相位切换累积层数 → 回响 / 共振 / 觉醒
 */
(function () {
    'use strict';

    const MAX_STACKS = 4;
    const AWAKEN_DUR_MS = 4000;
    const AWAKEN_DMG_BONUS = 35;
    const AWAKEN_CD_HASTE = 40;
    const ECHO_MULT = 1.25;
    const PIERCE_RATIO = 0.2;
    const PIERCE_RANGE = 60;
    const PIERCE_WIDTH = 36;
    const PULSE_RADIUS = 80;
    const PULSE_DMG_MULT = 0.8;

    function classId(player) {
        if (!player || !player.classData) return null;
        return typeof window.getActiveClassId === 'function'
            ? window.getActiveClassId(player.classData) : null;
    }

    function isBaseMage(player) {
        return classId(player) === 'mage';
    }

    function magicAtk(player) {
        return player.baseMagicAttack || player.baseAttack || 10;
    }

    function floatText(g, x, y, text, color, size, fixed) {
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(x, y, text, color || '#ffaa44', size ? 1100 : 900, size || 14, !!fixed);
        }
    }

    function floatGold(g, x, y, text) {
        floatText(g, x, y, text, '#ffdd44', 24);
    }

    function screenShake(g, amp, durationMs, bigFrames) {
        if (!g || !g.screenShake) return;
        g.screenShake.amplitude = Math.max(g.screenShake.amplitude, amp);
        g.screenShake.timer = Math.max(g.screenShake.timer, durationMs);
        g.screenShake.duration = Math.max(g.screenShake.duration, durationMs);
        g.screenShake.bigFrames = Math.max(g.screenShake.bigFrames, bigFrames || 2);
    }

    function isAwakening(player) {
        return !!(player && player._surgeAwakeningUntil && Date.now() < player._surgeAwakeningUntil);
    }

    function monstersInRadius(g, cx, cy, radius) {
        const out = [];
        (g && g.monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - cx, m.y - cy) <= radius + (m.size || 16) * 0.4) out.push(m);
        });
        return out;
    }

    function emitSurgePulse(player, g, phase) {
        const px = player.x;
        const py = player.y;
        const dmg = Math.max(1, Math.floor(magicAtk(player) * PULSE_DMG_MULT));
        monstersInRadius(g, px, py, PULSE_RADIUS).forEach(m => {
            m.takeDamage(dmg);
            if (phase === 'fire' && typeof window.applyCombatStatus === 'function') {
                window.applyCombatStatus(m, 'burn', { durationMs: 3000 }, player, g);
            } else if (phase === 'frost') {
                if (typeof window.applyCombatStatus === 'function') {
                    window.applyCombatStatus(m, 'frostbite', { durationMs: 3000 }, player, g);
                }
                if (typeof window.applyMonsterSlowPercent === 'function') {
                    window.applyMonsterSlowPercent(m, 20, 2000, Date.now());
                }
            }
        });
        if (typeof window.playMageElementClashVfx === 'function') {
            window.playMageElementClashVfx(g, px, py, 'resonance', {
                radius: PULSE_RADIUS, phase
            });
        }
        floatText(g, px, py - 28, '相位脉冲', phase === 'fire' ? '#ff8844' : '#88ccff', 12);
    }

    function triggerAwakening(player, g) {
        const now = Date.now();
        player._surgeAwakeningUntil = now + AWAKEN_DUR_MS;
        player._surgePierceActive = true;
        player._surgeStacks = 0;
        floatGold(g, player.x, player.y - 56, '觉醒!');
        screenShake(g, 4, 300, 3);
        if (typeof window.playMageElementClashVfx === 'function') {
            window.playMageElementClashVfx(g, player.x, player.y, 'surge_awakening', {
                radius: 100, fromPhase: 'fire', toPhase: 'frost'
            });
        }
        if (g && g.soundManager && typeof g.soundManager.playSound === 'function') {
            try { g.soundManager.playSound('explosion'); } catch (e) { /* ignore */ }
        }
    }

    function applyStackBonuses(player, g, stacks) {
        if (stacks >= 2 && !player._surgeEchoReady) {
            player._surgeEchoReady = true;
            floatText(g, player.x, player.y - 48, '元素回响!', '#ffaa66', 16);
            if (typeof window.playMageElementClashVfx === 'function') {
                window.playMageElementClashVfx(g, player.x, player.y, 'surge_echo', {
                    radius: 48, fromPhase: 'fire', toPhase: 'frost'
                });
            }
        }
        if (stacks >= 3) {
            player._surgePierceActive = true;
            floatText(g, player.x, player.y - 52, '元素共振!', '#ffdd88', 14);
        }
    }

    window.onBaseMagePhaseSwitched = function onBaseMagePhaseSwitched(player, g, prevPhase, nextPhase, opts) {
        if (!isBaseMage(player) || !nextPhase) return;
        opts = opts || {};
        if (prevPhase === nextPhase) return;

        if (!opts.skipPulse) emitSurgePulse(player, g, nextPhase);

        const newStack = (player._surgeStacks || 0) + 1;
        if (newStack >= MAX_STACKS) {
            triggerAwakening(player, g);
            return;
        }

        player._surgeStacks = newStack;
        applyStackBonuses(player, g, newStack);
    };

    window.getBaseMageSurgeStacks = function getBaseMageSurgeStacks(player) {
        if (!isBaseMage(player)) return 0;
        return player._surgeStacks || 0;
    };

    window.getBaseMageSurgeAwakeningRemaining = function getBaseMageSurgeAwakeningRemaining(player) {
        if (!isBaseMage(player) || !player._surgeAwakeningUntil) return 0;
        return Math.max(0, player._surgeAwakeningUntil - Date.now());
    };

    window.isBaseMageSurgeAwakening = isAwakening;

    window.getBaseMageSurgeCdHastePercent = function getBaseMageSurgeCdHastePercent(player) {
        if (!isBaseMage(player) || !isAwakening(player)) return 0;
        return AWAKEN_CD_HASTE;
    };

    window.getBaseMageSurgeWindupMs = function getBaseMageSurgeWindupMs(player, skillDef, entityConfig) {
        if (!isBaseMage(player) || !isAwakening(player)) return null;
        return 0;
    };

    window.getBaseMageSkillDamageMult = function getBaseMageSkillDamageMult(player, skillDef, monster) {
        if (!isBaseMage(player)) return 1;
        let mult = 1;
        const isBasic = skillDef && (skillDef.type === 'basic' || skillDef.slotType === 'basic'
            || skillDef.id === 'mage_basic');
        if (player._surgeEchoReady && skillDef && !isBasic) {
            mult *= ECHO_MULT;
            player._surgeEchoConsume = true;
        }
        if (isAwakening(player)) mult *= 1 + AWAKEN_DMG_BONUS / 100;
        return mult;
    };

    window.consumeBaseMageSurgeEcho = function consumeBaseMageSurgeEcho(player) {
        if (!player || !player._surgeEchoConsume) return;
        player._surgeEchoReady = false;
        player._surgeEchoConsume = false;
    };

    window.applyBaseMageSurgeBasicPierce = function applyBaseMageSurgeBasicPierce(player, primary, dmg, proj, g) {
        if (!isBaseMage(player) || !primary || !proj || !g) return;
        if (!player._surgePierceActive && !isAwakening(player)) return;
        const pierceDmg = Math.max(1, Math.floor(dmg * PIERCE_RATIO));
        if (pierceDmg <= 0) return;
        const angle = proj.angle;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const ox = primary.x + cos * 18;
        const oy = primary.y + sin * 18;
        (g.monsters || []).forEach(m => {
            if (!m || m.hp <= 0 || m === primary) return;
            const dx = m.x - ox;
            const dy = m.y - oy;
            const along = dx * cos + dy * sin;
            if (along < 0 || along > PIERCE_RANGE) return;
            const perp = Math.abs(-dx * sin + dy * cos);
            if (perp > PIERCE_WIDTH) return;
            m.takeDamage(pierceDmg);
            floatText(g, m.x, m.y - 6, String(pierceDmg), '#cc88ff', 13, true);
        });
    };

    window.tickBaseMageSurgeStates = function tickBaseMageSurgeStates(player, g, now) {
        if (!isBaseMage(player)) return;
        const t = now != null ? now : Date.now();
        if (player._surgeAwakeningUntil && t >= player._surgeAwakeningUntil) {
            player._surgeAwakeningUntil = 0;
            player._surgePierceActive = (player._surgeStacks || 0) >= 3;
        }
    };
})();
