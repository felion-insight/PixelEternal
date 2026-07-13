/**
 * 风行者 · 加速状态联动（风之步为轴）
 */
(function () {
    'use strict';

    const WINDRUNNER_TREE = { windrunner: true, phantom: true };
    const WIND_STEP_BUFF_PREFIX = 'wind_step_';
    const SPEED_DAMAGE_BONUS = 0.40;
    const SPEED_WIDTH_MULT = 2;
    const STORM_CD_SKILL = 'phantom_storm';
    const WIND_BLADE_MARK_STORM_CD_MS = 5000;
    const WIND_STEP_BLADE_MARK_STORM_CD_MS = 1000;
    const WIND_STEP_BLADE_MARK_STORM_CD_CAP_MS = 3000;

    function hasWindMarkFromPlayer(monster, player, now) {
        if (!monster || !player || !monster._classSkillMark) return false;
        const mk = monster._classSkillMark;
        const t = now != null ? now : Date.now();
        if (mk.expireTime <= t) return false;
        if (mk.markId !== 'wind_mark' && mk.markId !== 'phantom_mark') return false;
        if (mk.owner && mk.owner !== player) return false;
        return true;
    }

    function isWindrunnerTree(player) {
        if (!player || !player.classData) return false;
        const prog = typeof window.getActiveClassProgressionId === 'function'
            ? window.getActiveClassProgressionId(player.classData) : null;
        return !!(prog && WINDRUNNER_TREE[prog]);
    }

    window.isWindrunnerTreePlayer = isWindrunnerTree;

    /** 仅风刃等核心风系输出技能享受印记风系增伤（风之步风刃仅追踪，不叠风系乘区） */
    window.isWindMarkBonusSkill = function isWindMarkBonusSkill(skillDef) {
        if (!skillDef) return false;
        if (skillDef.id === 'wind_blade') return true;
        if (skillDef.id === 'phantom_echo_blade') return true;
        if (skillDef._countsAsWindBlade === true) return true;
        return false;
    };

    /** 查找玩家施加的风之印记目标（优先最近） */
    window.findWindrunnerMarkTarget = function findWindrunnerMarkTarget(player, monsters, now) {
        if (!player) return null;
        const t = now != null ? now : Date.now();
        let best = null;
        let bestD = Infinity;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            const mk = m._classSkillMark;
            if (!mk || mk.expireTime <= t) return;
            if (mk.markId !== 'wind_mark' && mk.markId !== 'phantom_mark') return;
            if (mk.owner && mk.owner !== player) return;
            const d = Math.hypot(m.x - player.x, m.y - player.y);
            if (d < bestD) { bestD = d; best = m; }
        });
        return best;
    };

    window.isPlayerInPhantomStorm = function isPlayerInPhantomStorm(player, now, gameInstance) {
        if (!player || !isWindrunnerTree(player)) return false;
        const t = now != null ? now : Date.now();
        if (player._phantomStormActiveUntil && t < player._phantomStormActiveUntil) return true;
        const st = gameInstance && gameInstance._skillEntities;
        if (st && st.fields) {
            return st.fields.some(f => f.owner === player && f.skillDef
                && f.skillDef.id === 'phantom_storm' && t < f.expireTime);
        }
        return false;
    };

    /** 风暴期间手动风刃免 CD、免消耗 */
    window.isPhantomStormFreeWindBlade = function isPhantomStormFreeWindBlade(player, skillDef, now, gameInstance) {
        if (!skillDef || skillDef.id !== 'wind_blade') return false;
        return window.isPlayerInPhantomStorm(player, now, gameInstance);
    };

    window.hasWindrunnerSpeedBoost = function hasWindrunnerSpeedBoost(player, now) {
        if (!player || !isWindrunnerTree(player)) return false;
        const t = now != null ? now : Date.now();
        const buffs = player.buffs || [];
        return buffs.some(b => b && b.expireTime > t && b.effects && b.effects.moveSpeed
            && (b._windSpeedBoost || (b.id && String(b.id).indexOf(WIND_STEP_BUFF_PREFIX) === 0)));
    };

    window.getWindBladeSynergyMods = function getWindBladeSynergyMods(player, now) {
        if (window.hasWindrunnerSpeedBoost(player, now)) {
            return { damageMult: 1 + SPEED_DAMAGE_BONUS, widthMult: SPEED_WIDTH_MULT };
        }
        return { damageMult: 1, widthMult: 1 };
    };

    window.applyWindBladeProjectileMods = function applyWindBladeProjectileMods(player, c, now) {
        if (!c || !player) return c;
        const mods = window.getWindBladeSynergyMods(player, now);
        if (mods.damageMult <= 1 && mods.widthMult <= 1) return c;
        const baseRadius = c.collisionRadius || c.windBladeWidth ? (c.windBladeWidth / 2) : 30;
        return Object.assign({}, c, {
            damageMultiplier: (c.damageMultiplier || 1) * mods.damageMult,
            collisionRadius: Math.floor(baseRadius * mods.widthMult),
            _windSynergyActive: true
        });
    };

    window.onWindStepCastComplete = function onWindStepCastComplete(player, skillDef, ec, gameInstance, monsters, now) {
        if (!isWindrunnerTree(player) || !ec || !ec.entityConfig) return;
        const c = ec.entityConfig;
        const t = now != null ? now : Date.now();
        player._windStepIFrameUntil = t + (c.invincibleMs || 150);
        player._windStepPerfectDodgeClaimed = false;
        player._windStepStormCdReducedMs = 0;
    };

    /** 风刃 / 风之步风刃命中风之印记目标时，减少风暴之眼冷却 */
    window.onWindrunnerWindBladeMarkHit = function onWindrunnerWindBladeMarkHit(
        player, monster, skillDef, projectile, gameInstance, now
    ) {
        if (!player || !isWindrunnerTree(player)) return;
        if (!hasWindMarkFromPlayer(monster, player, now)) return;
        if (typeof window.reduceSkillCooldownMs !== 'function') return;
        if (typeof window.isPlayerInPhantomStorm === 'function'
            && window.isPlayerInPhantomStorm(player, now, gameInstance)) return;

        if (projectile && projectile._fromWindStepBlade) {
            const used = player._windStepStormCdReducedMs || 0;
            if (used >= WIND_STEP_BLADE_MARK_STORM_CD_CAP_MS) return;
            const reduce = Math.min(
                WIND_STEP_BLADE_MARK_STORM_CD_MS,
                WIND_STEP_BLADE_MARK_STORM_CD_CAP_MS - used
            );
            if (reduce <= 0) return;
            window.reduceSkillCooldownMs(player, STORM_CD_SKILL, reduce);
            player._windStepStormCdReducedMs = used + reduce;
            if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
                gameInstance.addFloatingText(
                    player.x, player.y - 40,
                    '风暴 -' + (reduce / 1000) + 's', '#88eeff', 850, 12
                );
            }
            return;
        }

        if (skillDef && (skillDef.id === 'wind_blade' || skillDef.id === 'phantom_echo_blade')) {
            if (projectile && projectile._stormCdRefundDone) return;
            window.reduceSkillCooldownMs(player, STORM_CD_SKILL, WIND_BLADE_MARK_STORM_CD_MS);
            if (projectile) projectile._stormCdRefundDone = true;
            if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
                gameInstance.addFloatingText(player.x, player.y - 44, '风暴 -5s', '#88eeff', 900, 13);
            }
        }
    };

    window.onWindStepPerfectDodge = function onWindStepPerfectDodge(player, gameInstance) {
        if (!player || !isWindrunnerTree(player) || player._windStepPerfectDodgeClaimed) return;
        if (!player._windStepIFrameUntil || Date.now() > player._windStepIFrameUntil) return;
        player._windStepPerfectDodgeClaimed = true;
        if (typeof window.reduceSkillCooldownByFactor === 'function') {
            window.reduceSkillCooldownByFactor(player, 'backstep_shot', 0.5);
        }
        if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
            gameInstance.addFloatingText(player.x, player.y - 32, '风步冷却减半!', '#88ffee', 900, 14);
        }
    };

    window.onWindMarkVictimKilled = function onWindMarkVictimKilled(player, monster, gameInstance, monsters, now) {
        if (!player || !monster || !monster._classSkillMark) return;
        const mark = monster._classSkillMark;
        const markId = mark.markId || '';
        if (markId !== 'wind_mark' && markId !== 'phantom_mark') return;
        if (mark.owner && mark.owner !== player && gameInstance && gameInstance.player !== player) return;

        const skillDef = typeof window.getSkillDefinition === 'function'
            ? window.getSkillDefinition(markId === 'phantom_mark' ? 'phantom_mark' : 'wind_mark') : null;
        const ec = skillDef && skillDef.entityConfig ? skillDef.entityConfig : {};
        const radius = ec.markExplosionRadius || 90;
        const dmgMult = ec.markExplosionDamage || 1.8;
        const knockback = ec.markExplosionKnockback != null ? ec.markExplosionKnockback : 0;
        const atkOwner = mark.owner || player;

        if (typeof window.resolveWindMarkExplosion === 'function') {
            window.resolveWindMarkExplosion(atkOwner, monster, gameInstance, monsters, {
                radius, dmgMult, knockback, skillDef
            }, now);
        }

        if (ec.onMarkKillReduceCD && typeof window.reduceSkillCooldownMs === 'function') {
            const cd = ec.onMarkKillReduceCD;
            const key = cd.skillId || cd.baseSkillId || 'backstep_shot';
            window.reduceSkillCooldownMs(atkOwner, key, cd.ms || 2000);
            if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
                gameInstance.addFloatingText(atkOwner.x, atkOwner.y - 36, '风之步 -2s', '#66eedd', 900, 13);
            }
        }
        monster._classSkillMark = null;
    };

    window.clearWindrunnerCombatState = function clearWindrunnerCombatState(player) {
        if (!player) return;
        delete player._windStepIFrameUntil;
        delete player._windStepPerfectDodgeClaimed;
        delete player._phantomStormActiveUntil;
        delete player._windStepStormCdReducedMs;
    };
})();
