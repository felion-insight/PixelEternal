/**
 * 术士/死灵法师 · 灵魂碎片 / 痛苦诅咒 / 腐蚀 / 亡灵召唤
 */
(function () {
    'use strict';

    const WARLOCK_TREE = { warlock: true, necromancer: true };
    const AGONY_MAX = 5;
    const AGONY_TICK_MS = 1000;

    function classId(player) {
        if (!player || !player.classData) return null;
        return typeof window.getActiveClassId === 'function'
            ? window.getActiveClassId(player.classData) : null;
    }

    function isWarlockTree(player) {
        const id = classId(player);
        return !!(id && WARLOCK_TREE[id]);
    }

    window.isWarlockTreePlayer = isWarlockTree;

    function floatText(g, x, y, text, color) {
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(x, y, text, color || '#8844cc');
        }
    }

    function magicAtk(player) {
        return player.baseMagicAttack || player.baseAttack || 10;
    }

    function aliveUndead(g, player) {
        if (!g || !g._skillEntities || !player) return [];
        return (g._skillEntities.summons || []).filter(s => s && s.owner === player && s.hp > 0);
    }

    window.getSoulShardMax = function getSoulShardMax(player) {
        if (!isWarlockTree(player)) return 8;
        let max = 8;
        if (classId(player) === 'necromancer') {
            const undead = aliveUndead(player.gameInstance || (player && player.gameInstance), player);
            max = Math.min(15, 8 + undead.length);
        }
        if (player && player.classResource && player.classResource.max) {
            max = Math.max(max, player.classResource.max);
        }
        return max;
    };

    window.grantSoulShards = function grantSoulShards(player, amount) {
        if (!player || !amount || !isWarlockTree(player)) return;
        if (typeof window.grantSkillResource === 'function') {
            window.grantSkillResource(player, amount);
        }
        const max = window.getSoulShardMax(player);
        if (player.classResource) player.classResource.max = max;
    };

    window.onWarlockKill = function onWarlockKill(player) {
        if (!isWarlockTree(player)) return;
        window.grantSoulShards(player, 1);
    };

    window.getAgonyCurseStacks = function getAgonyCurseStacks(monster) {
        if (!monster || !monster._agonyCurse) return 0;
        if (monster._agonyCurse.until <= Date.now()) {
            monster._agonyCurse = null;
            return 0;
        }
        return monster._agonyCurse.stacks || 0;
    };

    window.applyAgonyCurse = function applyAgonyCurse(player, monster, stacks, durationMs, tickRatio) {
        if (!monster || !player) return 0;
        const now = Date.now();
        const dur = durationMs || 8000;
        const ratio = tickRatio || 0.15;
        if (!monster._agonyCurse) {
            monster._agonyCurse = { stacks: 0, until: now + dur, lastTick: now, tickRatio: ratio, owner: player };
        }
        const ac = monster._agonyCurse;
        ac.stacks = Math.min(AGONY_MAX, (ac.stacks || 0) + (stacks || 1));
        ac.until = now + dur;
        ac.lastTick = ac.lastTick || now;
        ac.tickRatio = ratio;
        ac.owner = player;
        floatText(player.gameInstance, monster.x, monster.y - 16, '诅咒×' + ac.stacks, '#8844aa');
        return ac.stacks;
    };

    window.applyCorruption = function applyCorruption(player, monster, durationMs) {
        if (!monster || typeof window.applyCombatStatus !== 'function') return;
        window.applyCombatStatus(monster, 'corruption', { durationMs: durationMs || 6000 }, player, player.gameInstance);
    };

    window.hasCorruption = function hasCorruption(monster) {
        if (!monster || !monster.combatStatuses) return false;
        const c = monster.combatStatuses.corruption;
        return !!(c && c.until > Date.now());
    };

    window.tickAgonyCurse = function tickAgonyCurse(monster, g, now) {
        const ac = monster && monster._agonyCurse;
        if (!ac || ac.until <= now || ac.stacks <= 0) {
            if (monster) monster._agonyCurse = null;
            return;
        }
        if (now - ac.lastTick < AGONY_TICK_MS) return;
        ac.lastTick = now;
        const owner = ac.owner;
        let ratio = ac.tickRatio || 0.15;
        if (owner && typeof window.getWarlockDotDamageMult === 'function') {
            ratio *= window.getWarlockDotDamageMult(owner);
        }
        if (owner && owner._lifeDrainActive && owner._lifeDrainCorruptionMult) {
            ratio *= owner._lifeDrainCorruptionMult;
        }
        const src = owner && typeof window.getPlayerEffectiveAttack === 'function'
            ? window.getPlayerEffectiveAttack(owner) : magicAtk(owner || {});
        let dmg = Math.max(1, Math.floor(src * ratio * ac.stacks));
        monster.takeDamage(dmg);
        if (owner && isWarlockTree(owner)) {
            const chance = ac.stacks >= AGONY_MAX ? 0.15 : 0.08;
            if (Math.random() < chance) window.grantSoulShards(owner, 1);
        }
    };

    window.getWarlockDotDamageMult = function getWarlockDotDamageMult(player) {
        if (!isWarlockTree(player)) return 1;
        let mult = 1;
        const undead = aliveUndead(player.gameInstance, player);
        mult += undead.length * 0.08;
        if (undead.length >= 3) mult += 0.05;
        return mult;
    };

    window.onShadowArrowHit = function onShadowArrowHit(player, monster, ec) {
        if (!isWarlockTree(player) || !monster) return;
        let mult = 1;
        if (window.getAgonyCurseStacks(monster) > 0 && ec.stackAgonyOnHit) {
            window.applyAgonyCurse(player, monster, ec.stackAgonyOnHit, 8000, 0.15);
        }
        if (window.hasCorruption(monster) && ec.corruptionDamageMult) {
            mult = ec.corruptionDamageMult;
        }
        return mult;
    };

    window.onDeathCoilHit = function onDeathCoilHit(player, monster) {
        if (!player || classId(player) !== 'necromancer') return 1;
        if (!player._deathCoilStacks) player._deathCoilStacks = 0;
        if (window.getAgonyCurseStacks(monster) > 0 || window.hasCorruption(monster)) {
            player._deathCoilStacks += 1;
        }
        return 1 + (player._deathCoilStacks || 0) * 0.2;
    };

    window.applyAgonyCurseSkill = function applyAgonyCurseSkill(player, skillDef, g, now, ctx) {
        const monsters = g && g.monsters ? g.monsters : [];
        let target = ctx && ctx.lockTarget;
        if (!target) {
            target = monsters.find(m => m && m.hp > 0 && Math.hypot(m.x - player.x, m.y - player.y) < (skillDef.range || 400));
        }
        if (!target) {
            floatText(g, player.x, player.y, '无目标', '#ff6666');
            return false;
        }
        const se = skillDef.skillEffect || {};
        window.applyAgonyCurse(player, target, 1, se.durationMs, se.tickRatio);
        return true;
    };

    window.startLifeDrain = function startLifeDrain(player, skillDef, g, now) {
        const se = skillDef.skillEffect || {};
        const monsters = g && g.monsters ? g.monsters : [];
        const target = monsters.find(m => m && m.hp > 0 && Math.hypot(m.x - player.x, m.y - player.y) < (skillDef.range || 350));
        if (!target) {
            floatText(g, player.x, player.y, '无目标', '#ff6666');
            return false;
        }
        player._lifeDrainActive = true;
        player._lifeDrainUntil = now + (se.durationMs || 3000);
        player._lifeDrainTarget = target;
        player._lifeDrainCorruptionMult = se.corruptionTickMult || 2;
        player._lifeDrainNextTick = now + (se.tickIntervalMs || 1000);
        player._lifeDrainCfg = se;
        player.isCastingSkill = true;
        player._skillCastBar = { endTime: player._lifeDrainUntil, label: '生命汲取' };
        floatText(g, player.x, player.y - 24, '生命汲取', '#663399');
        return true;
    };

    window.tickLifeDrain = function tickLifeDrain(player, g, now) {
        if (!player._lifeDrainActive || now >= player._lifeDrainUntil) {
            if (player._lifeDrainActive && !player._lifeDrainCompleted) {
                player._lifeDrainCompleted = true;
                const shards = (player._lifeDrainCfg && player._lifeDrainCfg.soulShardsOnComplete) || 2;
                window.grantSoulShards(player, shards);
                floatText(g, player.x, player.y - 32, '+2 灵魂碎片', '#aa66ff');
            }
            player._lifeDrainActive = false;
            player.isCastingSkill = false;
            player._skillCastBar = null;
            return;
        }
        if (now < player._lifeDrainNextTick) return;
        player._lifeDrainNextTick = now + 1000;
        const t = player._lifeDrainTarget;
        const se = player._lifeDrainCfg || {};
        if (t && t.hp > 0) {
            const dmg = Math.max(1, Math.floor(magicAtk(player) * (se.damageRatio || 0.3)));
            t.takeDamage(dmg);
        }
        const heal = Math.floor(player.maxHp * (se.healPercentPerTick || 3) / 100);
        player.hp = Math.min(player.maxHp, player.hp + heal);
    };

    window.applyDarkHarvest = function applyDarkHarvest(player, skillDef, g, now) {
        const se = skillDef.skillEffect || {};
        const shards = player.classResource ? Math.floor(player.classResource.current) : 0;
        if (shards <= 0) {
            floatText(g, player.x, player.y, '无灵魂碎片', '#ff6666');
            return false;
        }
        player.classResource.current = 0;
        const monsters = g && g.monsters ? g.monsters : [];
        monsters.forEach(m => {
            if (!m || m.hp <= 0) return;
            window.settleDotDamage(player, m, se.dotSettleSeconds || 3);
            if (Math.hypot(m.x - player.x, m.y - player.y) <= (se.curseRadius || 100)) {
                window.applyAgonyCurse(player, m, 1, 8000, 0.15);
            }
        });
        floatText(g, player.x, player.y - 28, '暗黑丰收×' + shards, '#442266');
        return true;
    };

    window.settleDotDamage = function settleDotDamage(player, monster, seconds) {
        if (!monster) return;
        const stacks = window.getAgonyCurseStacks(monster);
        if (stacks > 0 && monster._agonyCurse) {
            const src = magicAtk(player);
            const dmg = Math.floor(src * (monster._agonyCurse.tickRatio || 0.15) * stacks * (seconds || 3));
            monster.takeDamage(Math.max(1, dmg));
        }
        if (window.hasCorruption(monster)) {
            const src = magicAtk(player);
            monster.takeDamage(Math.max(1, Math.floor(src * 0.3 * (seconds || 3))));
        }
    };

    window.applySpreadingCurse = function applySpreadingCurse(player, skillDef, g, now, ctx) {
        const monsters = g && g.monsters ? g.monsters : [];
        let target = ctx && ctx.lockTarget;
        if (!target) {
            target = monsters.find(m => m && m.hp > 0 && Math.hypot(m.x - player.x, m.y - player.y) < (skillDef.range || 400));
        }
        if (!target) return false;
        window.applyAgonyCurse(player, target, 1, 8000, 0.15);
        window.applyCorruption(player, target, 6000);
        target._spreadCurseOnDeath = {
            owner: player,
            radius: (skillDef.skillEffect && skillDef.skillEffect.spreadRadius) || 150,
            ratio: (skillDef.skillEffect && skillDef.skillEffect.spreadEffectRatio) || 0.5
        };
        floatText(g, target.x, target.y - 20, '传染诅咒', '#552288');
        return true;
    };

    window.applySoulHarvest = function applySoulHarvest(player, skillDef, g, now, ctx) {
        const monsters = g && g.monsters ? g.monsters : [];
        let target = ctx && ctx.lockTarget;
        if (!target) {
            target = monsters.find(m => m && m.hp > 0 && Math.hypot(m.x - player.x, m.y - player.y) < (skillDef.range || 350));
        }
        if (!target) return false;
        const se = skillDef.skillEffect || {};
        let types = 0;
        const stacks = window.getAgonyCurseStacks(target);
        if (stacks > 0) {
            const burst = Math.floor(magicAtk(player) * (se.agonyBurstMult || 1) * stacks);
            target.takeDamage(Math.max(1, burst));
            target._agonyCurse = null;
            types++;
        }
        if (window.hasCorruption(target)) {
            player.hp = Math.min(player.maxHp, player.hp + Math.floor(player.maxHp * (se.corruptionHealPercent || 5) / 100));
            if (target.combatStatuses) delete target.combatStatuses.corruption;
            types++;
        }
        if (types > 0) {
            window.grantSoulShards(player, types * (se.shardPerDotType || 1));
        }
        floatText(g, target.x, target.y - 24, '灵魂收割!', '#aa44ff');
        return true;
    };

    window.onSpreadCurseDeath = function onSpreadCurseDeath(monster, g) {
        const sc = monster._spreadCurseOnDeath;
        if (!sc || !g || !g.monsters) return;
        const owner = sc.owner;
        (g.monsters || []).forEach(m => {
            if (!m || m === monster || m.hp <= 0) return;
            if (Math.hypot(m.x - monster.x, m.y - monster.y) > sc.radius) return;
            window.applyAgonyCurse(owner, m, 1, 8000, 0.15 * sc.ratio);
            window.applyCorruption(owner, m, 6000 * sc.ratio);
        });
    };

    window.onUndeadDeath = function onUndeadDeath(pet, g) {
        if (!pet || !pet.owner || classId(pet.owner) !== 'necromancer') return;
        const monsters = g && g.monsters ? g.monsters : [];
        monsters.forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - pet.x, m.y - pet.y) > 80) return;
            if (window.getAgonyCurseStacks(m) > 0) {
                window.applyAgonyCurse(pet.owner, m, 1, 6000, 0.15);
            }
        });
        const dmg = Math.floor((pet.attack || 5) * 0.8);
        monsters.forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - pet.x, m.y - pet.y) <= 60) m.takeDamage(dmg);
        });
    };

    window.tickWarlockSoulStates = function tickWarlockSoulStates(player, g, monsters, now) {
        if (!player) return;
        if (player._lifeDrainActive) window.tickLifeDrain(player, g, now);
        (monsters || []).forEach(m => {
            if (m && m._agonyCurse) window.tickAgonyCurse(m, g, now);
        });
        if (isWarlockTree(player) && player.classResource) {
            player.classResource.max = window.getSoulShardMax(player);
        }
    };

    window.applyWarlockSkillPrimary = function applyWarlockSkillPrimary(player, skillDef, g, now, ctx) {
        const se = skillDef.skillEffect || {};
        switch (se.type) {
            case 'agony_curse': return window.applyAgonyCurseSkill(player, skillDef, g, now, ctx);
            case 'life_drain': return window.startLifeDrain(player, skillDef, g, now);
            case 'dark_harvest': return window.applyDarkHarvest(player, skillDef, g, now);
            case 'spreading_curse': return window.applySpreadingCurse(player, skillDef, g, now, ctx);
            case 'soul_harvest': return window.applySoulHarvest(player, skillDef, g, now, ctx);
            default: return false;
        }
    };

    window.spendAllSoulShardsForLegion = function spendAllSoulShardsForLegion(player) {
        if (!player || !player.classResource) return 0;
        const n = Math.floor(player.classResource.current);
        player.classResource.current = 0;
        return n;
    };
})();
