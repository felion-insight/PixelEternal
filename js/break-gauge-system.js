/**
 * Pixel Eternal - 破防值系统（v2.0）
 * 精英/Boss 破防条 → 眩晕窗口 → 强攻爆发
 */
(function () {
    'use strict';

    const BREAK_CONFIG = {
        baseMax: 100,
        breakStunMs: 4000,
        vulnerableBonusPercent: 30,
        vulnerableDurationMs: 15000,
        rechargeLockMs: 15000,
        eliteMultiplier: 1.5,
        bossMultiplier: 2.0
    };

    window.BREAK_GAUGE_CONFIG = BREAK_CONFIG;

    window.initMonsterBreakGauge = function initMonsterBreakGauge(monster) {
        if (!monster) return;
        const isElite = monster.isElite || monster.isBoss;
        if (!isElite) {
            monster.breakGauge = null;
            return;
        }
        const mult = monster.isBoss ? BREAK_CONFIG.bossMultiplier : BREAK_CONFIG.eliteMultiplier;
        monster.breakGauge = {
            current: 0,
            max: Math.floor(BREAK_CONFIG.baseMax * mult),
            broken: false,
            brokenUntil: 0,
            rechargeLockUntil: 0
        };
    };

    window.getPlayerBattleRole = function getPlayerBattleRole(player) {
        if (!player || !window.hasPlayerClass || !window.hasPlayerClass(player.classData)) return null;
        const classId = window.getActiveClassId(player.classData);
        const def = window.getClassDefinition && window.getClassDefinition(classId);
        return (def && def.battleRole) || 'striker';
    };

    window.getBreakDamageMultiplier = function getBreakDamageMultiplier(player) {
        const role = window.getPlayerBattleRole(player);
        if (role === 'breaker') return 2.0;
        return 1.0;
    };

    window.applyBreakDamage = function applyBreakDamage(monster, amount, player, skillDef) {
        if (!monster || !monster.breakGauge || monster.hp <= 0) return;
        const bg = monster.breakGauge;
        const now = Date.now();
        if (bg.broken || now < bg.rechargeLockUntil) return;

        let breakMult = (skillDef && skillDef.breakDamageMultiplier) || 1.0;
        breakMult *= window.getBreakDamageMultiplier(player);

        bg.current = Math.min(bg.max, bg.current + Math.floor(amount * breakMult));
        if (bg.current >= bg.max) {
            bg.broken = true;
            bg.brokenUntil = now + BREAK_CONFIG.breakStunMs;
            bg.rechargeLockUntil = now + BREAK_CONFIG.rechargeLockMs;
            bg.current = 0;
            monster.frozenUntil = Math.max(monster.frozenUntil || 0, bg.brokenUntil);
            monster._breakVulnerable = {
                until: now + BREAK_CONFIG.vulnerableDurationMs,
                bonusPercent: BREAK_CONFIG.vulnerableBonusPercent
            };
            if (player && player.gameInstance && typeof player.gameInstance.addFloatingText === 'function') {
                player.gameInstance.addFloatingText(monster.x, monster.y - 36, '破防!', '#cc66ff');
            } else if (monster.gameInstance && typeof monster.gameInstance.addFloatingText === 'function') {
                monster.gameInstance.addFloatingText(monster.x, monster.y - 36, '破防!', '#cc66ff');
            }
            if (typeof window.onBuildBreak === 'function') {
                window.onBuildBreak(player);
            }
            if (typeof window.onMonsterBreakGaugeBroken === 'function') {
                window.onMonsterBreakGaugeBroken(monster, player, now);
            }
        }
    };

    window.tickMonsterBreakGauge = function tickMonsterBreakGauge(monster) {
        if (!monster || !monster.breakGauge) return;
        const bg = monster.breakGauge;
        const now = Date.now();
        if (bg.broken && now >= bg.brokenUntil) {
            bg.broken = false;
        }
        if (now >= bg.rechargeLockUntil && bg.broken === false) {
            /* 破防冷却结束，可再次积累 */
        }
    };

    window.getStrikerDamageBonus = function getStrikerDamageBonus(player, monster) {
        const role = window.getPlayerBattleRole(player);
        if (role !== 'striker' && role !== 'breaker') return 1;
        if (monster && monster._breakVulnerable && monster._breakVulnerable.until > Date.now()) {
            return 1.5;
        }
        return 1;
    };

    window.getAnomalyStatusBonus = function getAnomalyStatusBonus(player) {
        const role = window.getPlayerBattleRole(player);
        if (role === 'anomaly') return { applyEfficiency: 1.4, damageMult: 1.3 };
        return { applyEfficiency: 1, damageMult: 1 };
    };

})();
