/**
 * 术士/死灵法师 · 灵魂碎片 / 痛苦诅咒 / 灵魂燃烧 / 引爆 / 灵魂链接 / 暗影魔
 */
(function () {
    'use strict';

    const WARLOCK_TREE = { warlock: true, necromancer: true };
    const AGONY_MAX = 5;
    const AGONY_TICK_MS = 1000;
    const SOUL_BURN_MS = 8000;
    const DEATH_RESONANCE_MAX = 5;
    const COIL_SHARD_CHANCE_PER_CURSE_STACK = 0.10;
    const UNDEAD_DOT_ATTACK_SHARD_CHANCE = 0.10;
    const BONE_DRAGON_SHARD_CHANCE_BONUS = 0.05;
    const SPREAD_CURSE_SHARD_MAX = 3;

    function classId(player) {
        if (!player || !player.classData) return null;
        return typeof window.getActiveClassId === 'function'
            ? window.getActiveClassId(player.classData) : null;
    }

    function isWarlockTree(player) {
        const id = classId(player);
        return !!(id && WARLOCK_TREE[id]);
    }

    function isWarlock(player) {
        return classId(player) === 'warlock';
    }

    function isNecromancer(player) {
        return classId(player) === 'necromancer';
    }

    function isMonsterInOwnersNetherGate(monster, owner, g) {
        if (!monster || !owner || !g || !g._skillEntities) return false;
        const fields = g._skillEntities.fields || [];
        const now = Date.now();
        return fields.some(f => {
            const ec = f.entityConfig || {};
            if (!ec.netherGate || f.owner !== owner || now >= f.expireTime) return false;
            return Math.hypot(monster.x - f.x, monster.y - f.y) <= (f.radius || 120);
        });
    }

    window.getDeathResonanceStacks = function getDeathResonanceStacks(player) {
        if (!player || !isNecromancer(player)) return 0;
        return Math.min(DEATH_RESONANCE_MAX, player._deathResonance || 0);
    };

    window.addDeathResonance = function addDeathResonance(player, amount, g) {
        if (!player || !isNecromancer(player) || !amount) return 0;
        const prev = player._deathResonance || 0;
        player._deathResonance = Math.min(DEATH_RESONANCE_MAX, prev + amount);
        if (player._deathResonance >= DEATH_RESONANCE_MAX && player._deathResonance > prev) {
            floatText(g || player.gameInstance, player.x, player.y - 40, '共鸣已满!', '#ff88ff');
        }
        if (typeof window.updateWarlockSoulUI === 'function') window.updateWarlockSoulUI(player);
        return player._deathResonance;
    };

    window.getNecromancerDotShardChanceMult = function getNecromancerDotShardChanceMult(player, monster, g) {
        if (!player || !isNecromancer(player) || !monster) return 1;
        const refG = g || player.gameInstance;
        if (!refG || !isMonsterInOwnersNetherGate(monster, player, refG)) return 1;
        return 2;
    };

    window.getNecromancerSkillResourceCost = function getNecromancerSkillResourceCost(player, skillDef) {
        if (!player || !skillDef || !isNecromancer(player)) return null;
        if (skillDef.id === 'soul_harvest' && window.getDeathResonanceStacks(player) >= DEATH_RESONANCE_MAX) {
            return 0;
        }
        return null;
    };

    window.tryUndeadDotAttackShard = function tryUndeadDotAttackShard(pet, target, g) {
        if (!pet || !pet.isUndead || !pet.owner || !isNecromancer(pet.owner) || !target) return;
        const hasDot = window.getAgonyCurseStacks(target) > 0 || window.hasCorruption(target);
        if (!hasDot) return;
        let chance = UNDEAD_DOT_ATTACK_SHARD_CHANCE;
        if (typeof window.getBoneDragonAuraMult === 'function'
            && window.getBoneDragonAuraMult(pet) > 1) {
            chance += BONE_DRAGON_SHARD_CHANCE_BONUS;
        }
        if (Math.random() < chance) {
            window.grantSoulShards(pet.owner, 1);
            floatText(g || pet.owner.gameInstance, pet.owner.x, pet.owner.y - 32, '亡灵共鸣 +1', '#aa88cc');
        }
    };

    window.isWarlockTreePlayer = isWarlockTree;

    function floatText(g, x, y, text, color) {
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(x, y, text, color || '#8844cc');
        }
    }

    function magicAtk(player) {
        return player.baseMagicAttack || player.baseAttack || 10;
    }

    function resolveMonsters(g) {
        if (!g) return [];
        if (typeof g.getCurrentSceneTargets === 'function') {
            const t = g.getCurrentSceneTargets();
            if (t && t.length) return t;
        }
        if (typeof g._getSkillMonsters === 'function') {
            const t = g._getSkillMonsters();
            if (t && t.length) return t;
        }
        if (g.currentRoom && g.currentRoom.monsters) return g.currentRoom.monsters;
        return g.monsters || [];
    }

    function lockTargetFromCtx(ctx, player, skillDef, g) {
        const monsters = (ctx && ctx.monsters) || resolveMonsters(g);
        let target = (ctx && (ctx.lockTarget || ctx.bondTarget)) || null;
        if (!target) {
            const range = skillDef.range || 400;
            let nd = Infinity;
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0) return;
                const d = Math.hypot(m.x - player.x, m.y - player.y);
                if (d <= range && d < nd) { nd = d; target = m; }
            });
        }
        return { target, monsters };
    }

    function aliveUndead(g, player) {
        if (!g || !g._skillEntities || !player) return [];
        return (g._skillEntities.summons || []).filter(s => s && s.owner === player && s.hp > 0);
    }

    window.isSoulBurning = function isSoulBurning(player) {
        return !!(player && player._soulBurnUntil && Date.now() < player._soulBurnUntil);
    };

    window.triggerSoulBurn = function triggerSoulBurn(player, g) {
        if (!player || !isWarlock(player)) return;
        const now = Date.now();
        if (player._soulBurnUntil && now < player._soulBurnUntil) return;
        player._soulBurnUntil = now + SOUL_BURN_MS;
        const max = window.getSoulShardMax(player);
        if (player.classResource) player.classResource.current = max;
        floatText(g || player.gameInstance, player.x, player.y - 32, '灵魂燃烧!', '#ff44ff');
        if (typeof window.updateWarlockSoulUI === 'function') window.updateWarlockSoulUI(player);
    };

    window.getSoulShardMax = function getSoulShardMax(player) {
        if (!isWarlockTree(player)) return 8;
        let max = 8;
        if (typeof window.getClassPassiveSoulShardMax === 'function') {
            max = window.getClassPassiveSoulShardMax(player, max);
        }
        if (player && player.classResource && player.classResource.max) {
            max = Math.max(max, player.classResource.max);
        }
        return max;
    };

    window.grantSoulShards = function grantSoulShards(player, amount) {
        if (!player || !amount || !isWarlockTree(player)) return;
        const g = player.gameInstance;
        const now = Date.now();
        const max = window.getSoulShardMax(player);
        if (!player.classResource) return;

        if (isWarlock(player) && player._soulBurnUntil && now < player._soulBurnUntil) {
            player.classResource.current = max;
            if (typeof window.updateWarlockSoulUI === 'function') window.updateWarlockSoulUI(player);
            return;
        }

        const next = player.classResource.current + amount;
        if (isWarlock(player) && next >= max) {
            player.classResource.current = max;
            window.triggerSoulBurn(player, g);
        } else {
            player.classResource.current = Math.min(max, next);
        }
        if (typeof window.updateWarlockSoulUI === 'function') window.updateWarlockSoulUI(player);
    };

    window.spendSoulShards = function spendSoulShards(player, count) {
        if (!player || !count || !player.classResource) return false;
        if (isWarlock(player) && window.isSoulBurning(player)) return true;
        if (player.classResource.current < count) return false;
        player.classResource.current -= count;
        if (typeof window.updateWarlockSoulUI === 'function') window.updateWarlockSoulUI(player);
        return true;
    };

    window.hasSoulShards = function hasSoulShards(player, min) {
        if (!player || !player.classResource) return false;
        if (isWarlock(player) && window.isSoulBurning(player)) return true;
        return player.classResource.current >= (min || 1);
    };

    window.updateWarlockSoulUI = function updateWarlockSoulUI(player) {
        if (typeof window._refreshWarlockHud === 'function') window._refreshWarlockHud(player);
    };

    window.onWarlockKill = function onWarlockKill(player, monster) {
        if (!isWarlockTree(player)) return;
        window.grantSoulShards(player, 1);
        if (monster && window.hasCorruption(monster)) {
            window.grantSoulShards(player, 1);
        }
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
            monster._agonyCurse = { stacks: 0, until: now + dur, lastTick: now, tickRatio: ratio, owner: player, durationMs: dur };
        }
        const ac = monster._agonyCurse;
        const stackCap = isNecromancer(player) ? 999 : AGONY_MAX;
        ac.stacks = Math.min(stackCap, (ac.stacks || 0) + (stacks || 1));
        ac.until = now + dur;
        ac.durationMs = dur;
        ac.lastTick = ac.lastTick || now;
        ac.tickRatio = ratio;
        ac.owner = player;
        const g = player.gameInstance;
        floatText(g, monster.x, monster.y - 16, '诅咒×' + ac.stacks, '#8844aa');
        return ac.stacks;
    };

    window.applyCorruption = function applyCorruption(player, monster, durationMs) {
        if (!monster || typeof window.applyCombatStatus !== 'function') return;
        window.applyCombatStatus(monster, 'corruption', { durationMs: durationMs || 6000 }, player, player.gameInstance);
        if (monster.combatStatuses && monster.combatStatuses.corruption) {
            monster.combatStatuses.corruption.owner = player;
        }
    };

    window.hasCorruption = function hasCorruption(monster) {
        if (!monster || !monster.combatStatuses) return false;
        const c = monster.combatStatuses.corruption;
        return !!(c && c.until > Date.now());
    };

    function soulLinkCfg(player) {
        return player && player._soulLinkCfg;
    }

    function isSoulLinked(player, monster) {
        if (!player || !monster || !monster._soulLinkMark) return false;
        const mk = monster._soulLinkMark;
        if (mk.until <= Date.now()) {
            monster._soulLinkMark = null;
            if (monster._classSkillMark && monster._classSkillMark.markId === 'soul_link') {
                monster._classSkillMark = null;
            }
            return false;
        }
        return mk.owner === player;
    }

    window.onWarlockDotDamage = function onWarlockDotDamage(player, monster, dotDmg, g) {
        if (!player || !monster || dotDmg <= 0 || !isWarlock(player)) return;
        if (!isSoulLinked(player, monster)) return;
        const cfg = soulLinkCfg(player) || {};
        const burn = window.isSoulBurning(player);
        const lsPct = burn
            ? (cfg.soulBurnLifestealPercent || 50)
            : (cfg.lifestealPercent || 30);
        const heal = Math.max(1, Math.floor(dotDmg * lsPct / 100));
        player.hp = Math.min(player.maxHp, player.hp + heal);
        if (typeof window.playWarlockSoulLinkPulse === 'function') {
            window.playWarlockSoulLinkPulse(player, monster, g, heal);
        }
        const shardGain = burn
            ? (cfg.soulBurnShardPerTick || 2)
            : (cfg.shardPerDotTick || 1);
        window.grantSoulShards(player, shardGain);
    };

    window.tickAgonyCurse = function tickAgonyCurse(monster, g, now) {
        const ac = monster && monster._agonyCurse;
        if (!ac || ac.until <= now || ac.stacks <= 0) {
            if (monster) monster._agonyCurse = null;
            return;
        }
        const owner = ac.owner;
        const tickMs = (owner && window.isSoulBurning(owner)) ? 500 : AGONY_TICK_MS;
        if (now - ac.lastTick < tickMs) return;
        ac.lastTick = now;
        let ratio = ac.tickRatio || 0.15;
        if (owner && typeof window.getWarlockDotDamageMult === 'function') {
            ratio *= window.getWarlockDotDamageMult(owner);
        }
        const src = owner && typeof window.getPlayerEffectiveAttack === 'function'
            ? window.getPlayerEffectiveAttack(owner) : magicAtk(owner || {});
        let dmg = Math.max(1, Math.floor(src * ratio * ac.stacks));
        monster.takeDamage(dmg);
        ac._tickFlashUntil = now + 380;
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(monster.x, monster.y - 14, '诅' + dmg, '#aa66ff', 620, 13, true);
        }
        if (owner && isWarlockTree(owner)) {
            window.onWarlockDotDamage(owner, monster, dmg, g);
            let chance;
            if (isNecromancer(owner)) {
                chance = Math.min(0.35, 0.08 + ac.stacks * 0.015);
            } else {
                chance = ac.stacks >= AGONY_MAX ? 0.15 : 0.08;
            }
            if (typeof window.rollClassPassiveDotShard === 'function') {
                chance = window.rollClassPassiveDotShard(owner, chance);
            }
            if (isNecromancer(owner) && typeof window.getNecromancerDotShardChanceMult === 'function') {
                chance = Math.min(0.95, chance * window.getNecromancerDotShardChanceMult(owner, monster, g));
            }
            if (Math.random() < chance) window.grantSoulShards(owner, 1);
        }
    };

    window.getWarlockDotDamageMult = function getWarlockDotDamageMult(player) {
        if (!isWarlockTree(player)) return 1;
        let mult = 1;
        if (typeof window.getClassPassiveDotMult === 'function') {
            mult *= window.getClassPassiveDotMult(player);
        }
        if (isWarlock(player) && window.isSoulBurning(player)) mult *= 1.5;
        return mult;
    };

    window.getWarlockProjectileSpeedMult = function getWarlockProjectileSpeedMult(player) {
        if (!isWarlock(player) || !window.isSoulBurning(player)) return 1;
        return 1.3;
    };

    window.onShadowArrowHit = function onShadowArrowHit(player, monster, ec, skillDef) {
        if (!isWarlockTree(player) || !monster) return 1;
        const step = (skillDef && skillDef._comboStep != null)
            ? skillDef._comboStep
            : (ec._comboStep != null ? ec._comboStep : 0);
        const stackAgony = ec.comboStepStackAgony && ec.comboStepStackAgony[step];
        const corruptionMs = ec.comboStepApplyCorruptionMs && ec.comboStepApplyCorruptionMs[step];
        const corrMultArr = ec.comboStepCorruptionMult || [];
        const grantOnCursed = ec.comboStepGrantShardOnCursed && ec.comboStepGrantShardOnCursed[step];

        let mult = 1;
        if (stackAgony > 0 && window.getAgonyCurseStacks(monster) >= 0) {
            window.applyAgonyCurse(player, monster, stackAgony, 8000, 0.15);
        }
        if (corruptionMs > 0) {
            window.applyCorruption(player, monster, corruptionMs);
            const g = player.gameInstance;
            if (typeof window.playWarlockCorruptionHitVfx === 'function') {
                window.playWarlockCorruptionHitVfx(g, monster.x, monster.y);
            }
        }
        const corrMult = corrMultArr[step] || ec.corruptionDamageMult || 1;
        if (window.hasCorruption(monster) && corrMult > 1) mult = corrMult;

        if (window.isSoulBurning(player) && step <= 1) {
            window.applyAgonyCurse(player, monster, 1, 8000, 0.15);
        }
        if (grantOnCursed && window.getAgonyCurseStacks(monster) > 0) {
            window.grantSoulShards(player, 1);
        }
        return mult;
    };

    window.onDeathCoilHit = function onDeathCoilHit(player, monster) {
        if (!player || !isNecromancer(player)) return 1;
        const stacks = player._deathCoilStacks || 0;
        const mult = 1 + stacks * 0.2;
        const curseStacks = window.getAgonyCurseStacks(monster);
        const hasDot = curseStacks > 0 || window.hasCorruption(monster);
        if (hasDot) {
            player._deathCoilStacks = stacks + 1;
        }
        if (curseStacks > 0) {
            const g = player.gameInstance;
            const shardChance = Math.min(0.95, COIL_SHARD_CHANCE_PER_CURSE_STACK * curseStacks);
            if (Math.random() < shardChance) {
                window.grantSoulShards(player, 1);
                floatText(g, monster.x, monster.y - 28, '缠绕 +1魂', '#aa66ff');
            }
            window.addDeathResonance(player, 1, g);
        }
        return mult;
    };

    window.resetDeathCoilStacks = function resetDeathCoilStacks(player) {
        if (player) player._deathCoilStacks = 0;
    };

    function detonateAgonyCurse(player, target, skillDef, g, monsters) {
        const se = skillDef.skillEffect || {};
        const stacks = window.getAgonyCurseStacks(target);
        if (stacks < AGONY_MAX) return false;
        const cost = se.detonateShardCost || 1;
        if (!window.spendSoulShards(player, cost)) {
            floatText(g, player.x, player.y, '需要灵魂碎片', '#ff6666');
            return false;
        }
        const ac = target._agonyCurse;
        const remainSec = ac ? Math.max(0, (ac.until - Date.now()) / 1000) : 0;
        const src = magicAtk(player);
        const dotBurst = Math.max(1, Math.floor(src * (ac.tickRatio || 0.15) * stacks * remainSec));
        const killedByBurst = target.takeDamage(dotBurst);

        const rad = se.detonateExplosionRadius || 80;
        const boomMult = se.detonateExplosionMult || 1.5;
        const boomDmg = Math.max(1, Math.floor(src * boomMult));
        const splashStacks = se.detonateSplashStacks || 2;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - target.x, m.y - target.y) > rad) return;
            if (m !== target) m.takeDamage(boomDmg);
            window.applyAgonyCurse(player, m, splashStacks, 8000, 0.15);
        });

        target._agonyCurse = null;
        const shardRefund = Math.floor(stacks * (se.detonateShardPerStack || 0.2));
        if (shardRefund > 0) window.grantSoulShards(player, shardRefund);
        if (killedByBurst) window.grantSoulShards(player, se.detonateKillRefund || 2);

        if (typeof window.playWarlockDetonateVfx === 'function') {
            window.playWarlockDetonateVfx(g, target.x, target.y, rad);
        } else if (g && typeof g.addEquipmentEffect === 'function') {
            g.addEquipmentEffect('class_skill_vfx', target.x, target.y, {
                duration: 680, variant: 'warlock_curse_detonate',
                radius: rad, color: '#8844cc'
            });
        }
        floatText(g, target.x, target.y - 24, '诅咒引爆!', '#aa44ff');
        return true;
    }

    window.applyAgonyCurseSkill = function applyAgonyCurseSkill(player, skillDef, g, now, ctx) {
        const { target, monsters } = lockTargetFromCtx(ctx, player, skillDef, g);
        if (!target) {
            floatText(g, player.x, player.y, '无目标', '#ff6666');
            return false;
        }
        const stacks = window.getAgonyCurseStacks(target);
        if (stacks >= AGONY_MAX) {
            return detonateAgonyCurse(player, target, skillDef, g, monsters);
        }
        const se = skillDef.skillEffect || {};
        window.applyAgonyCurse(player, target, 1, se.durationMs, se.tickRatio);
        if (typeof window.playWarlockAgonyApplyVfx === 'function') {
            window.playWarlockAgonyApplyVfx(player, target, g);
        }
        return true;
    };

    window.applyLifeDrain = function applyLifeDrain(player, skillDef, g, now, ctx) {
        const { target } = lockTargetFromCtx(ctx, player, skillDef, g);
        if (!target) {
            floatText(g, player.x, player.y, '无目标', '#ff6666');
            return false;
        }
        if (player._lifeDrainChannel) {
            floatText(g, player.x, player.y, '已在引导中', '#ff6666');
            return false;
        }
        const se = skillDef.skillEffect || {};
        const channelMs = se.channelDurationMs || 3000;
        const ticks = se.channelTicks || 3;
        player._lifeDrainChannel = {
            until: now + channelMs,
            nextTick: now,
            tickInterval: channelMs / ticks,
            ticksLeft: ticks,
            target: target,
            skillDef: skillDef,
            se: se,
            gameRef: g,
            completed: false
        };
        player._skillCastBar = {
            endTime: now + channelMs,
            label: skillDef.name || '生命汲取',
            color: '#8844cc'
        };
        floatText(g, target.x, target.y - 20, '生命汲取', '#44aa88');
        return true;
    };

    window.isLifeDraining = function isLifeDraining(player) {
        return !!(player && player._lifeDrainChannel && Date.now() < player._lifeDrainChannel.until);
    };

    window.tickLifeDrainChannel = function tickLifeDrainChannel(player, g, now) {
        const ch = player && player._lifeDrainChannel;
        if (!ch) return;
        const refG = g || ch.gameRef;
        if (now >= ch.until) {
            if (ch.completed) {
                window.grantSoulShards(player, ch.se.completeShardGrant || 2);
                floatText(refG, player.x, player.y - 28, '汲取完成 +2碎片', '#aa44ff');
            }
            delete player._lifeDrainChannel;
            if (player._skillCastBar) player._skillCastBar = null;
            return;
        }
        const target = ch.target;
        if (!target || target.hp <= 0) {
            delete player._lifeDrainChannel;
            if (player._skillCastBar) player._skillCastBar = null;
            return;
        }
        if (now < ch.nextTick) return;
        ch.nextTick = now + ch.tickInterval;
        ch.ticksLeft--;
        const se = ch.se;
        const dmg = Math.max(1, Math.floor(magicAtk(player) * (se.damageMult || 0.3)));
        target.takeDamage(dmg);
        const heal = Math.max(1, Math.floor(player.maxHp * (se.healPercent || 3) / 100));
        player.hp = Math.min(player.maxHp, player.hp + heal);
        floatText(refG, player.x, player.y - 16, '+' + heal, '#44ff88');
        if (ch.ticksLeft <= 0) ch.completed = true;
    };

    window.applySoulLink = function applySoulLink(player, skillDef, g, now, ctx) {
        const { target } = lockTargetFromCtx(ctx, player, skillDef, g);
        if (!target) {
            floatText(g, player.x, player.y, '无目标', '#ff6666');
            return false;
        }
        const se = skillDef.skillEffect || {};
        const dur = se.durationMs || 8000;
        target._soulLinkMark = { owner: player, until: now + dur };
        target._classSkillMark = {
            markId: 'soul_link',
            owner: player,
            expireTime: now + dur,
            label: '链'
        };
        player._soulLinkTarget = target;
        player._soulLinkCfg = se;
        floatText(g, target.x, target.y - 20, '灵魂链接', '#8844cc');
        return true;
    };

    window.onSoulLinkTargetDeath = function onSoulLinkTargetDeath(monster, g, player) {
        if (!monster || !monster._soulLinkMark || !player) return;
        const mk = monster._soulLinkMark;
        if (mk.owner !== player) return;
        const remain = Math.max(0, mk.until - Date.now());
        const cfg = soulLinkCfg(player) || {};
        const deadX = monster.x;
        const deadY = monster.y;
        window.grantSoulShards(player, cfg.deathShardGrant || 3);
        monster._soulLinkMark = null;
        if (monster._classSkillMark && monster._classSkillMark.markId === 'soul_link') {
            monster._classSkillMark = null;
        }
        const monsters = resolveMonsters(g);
        let nearest = null;
        let nd = Infinity;
        (monsters || []).forEach(m => {
            if (!m || m === monster || m.hp <= 0) return;
            const d = Math.hypot(m.x - monster.x, m.y - monster.y);
            if (d < nd) { nd = d; nearest = m; }
        });
        if (nearest && remain > 0) {
            const now = Date.now();
            nearest._soulLinkMark = { owner: player, until: now + remain };
            nearest._classSkillMark = {
                markId: 'soul_link', owner: player, expireTime: now + remain, label: '链'
            };
            player._soulLinkTarget = nearest;
            floatText(g, nearest.x, nearest.y - 20, '链接转移', '#aa66ff');
            if (typeof window.playWarlockLinkTransferVfx === 'function') {
                window.playWarlockLinkTransferVfx(g, deadX, deadY, nearest, player);
            }
        } else {
            player._soulLinkTarget = null;
            if (typeof window.playWarlockLinkTransferVfx === 'function') {
                window.playWarlockLinkTransferVfx(g, deadX, deadY, null, player);
            }
        }
    };

    window.findCursedTargetForOwner = function findCursedTargetForOwner(owner, monsters) {
        if (!owner || !monsters) return null;
        let best = null;
        let bestStacks = 0;
        let bestD = Infinity;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            const st = window.getAgonyCurseStacks(m);
            if (st <= 0) return;
            const d = Math.hypot(m.x - owner.x, m.y - owner.y);
            if (st > bestStacks || (st === bestStacks && d < bestD)) {
                bestStacks = st;
                bestD = d;
                best = m;
            }
        });
        return best;
    };

    function isSkeletonWarrior(pet) {
        if (!pet) return false;
        return pet.unitId === 'skeleton_warrior' || pet.unitId === 'shadow_fiend'
            || !!(pet.skillDef && pet.skillDef.entityConfig && (
                pet.skillDef.entityConfig.isSkeletonWarrior
                || pet.skillDef.entityConfig.isShadowFiend
            ));
    }

    window.onSkeletonWarriorAttack = function onSkeletonWarriorAttack(pet, target, gameInstance, now) {
        if (!pet || !pet.owner || !target || target.hp <= 0) return;
        const owner = pet.owner;
        if (!isWarlock(owner)) return;
        const c = (pet.skillDef && pet.skillDef.entityConfig) || {};
        let stacks = c.agonyStacksOnHit || 1;
        if (window.isSoulBurning(owner)) stacks = c.soulBurnAgonyStacksOnHit || stacks * 2;
        let dmgMult = 1;
        if (window.isSoulBurning(owner)) dmgMult = 1.3;
        if (window.hasCorruption(target)) dmgMult *= 1.3;
        window.applyAgonyCurse(owner, target, stacks, 8000, 0.15);
        if (typeof window.playWarlockShadowSwipe === 'function') {
            window.playWarlockShadowSwipe(gameInstance, pet, target, window.isSoulBurning(owner));
        }
        if (dmgMult > 1 && typeof target.takeDamage === 'function') {
            const bonus = Math.max(1, Math.floor((pet.attack || 1) * (dmgMult - 1)));
            target.takeDamage(bonus);
        }
    };

    window.onShadowFiendAttack = window.onSkeletonWarriorAttack;

    window.onSkeletonWarriorDeath = function onSkeletonWarriorDeath(pet, g) {
        if (!pet || !pet.owner || !isWarlock(pet.owner)) return;
        const owner = pet.owner;
        const c = (pet.skillDef && pet.skillDef.entityConfig) || {};
        const rad = c.deathExplosionRadius || 60;
        const mult = c.deathExplosionMult || 1.0;
        const dmg = Math.max(1, Math.floor(magicAtk(owner) * mult));
        const monsters = resolveMonsters(g);
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - pet.x, m.y - pet.y) > rad) return;
            m.takeDamage(dmg);
            window.applyAgonyCurse(owner, m, c.deathCurseStacks || 1, 8000, 0.15);
            window.applyCorruption(owner, m, c.deathCorruptionMs || 4000);
        });
        window.grantSoulShards(owner, c.deathShardGrant || 1);
        if (typeof window.playWarlockFiendDeathVfx === 'function') {
            window.playWarlockFiendDeathVfx(g, pet.x, pet.y, rad);
        } else if (g && typeof g.addEquipmentEffect === 'function') {
            g.addEquipmentEffect('class_skill_vfx', pet.x, pet.y, {
                duration: 520, variant: 'warlock_fiend_collapse', radius: rad, color: '#442266'
            });
        }
    };

    window.onShadowFiendDeath = window.onSkeletonWarriorDeath;

    window.onUndeadLegionAttack = function onUndeadLegionAttack(pet, target, gameInstance, now) {
        if (!pet || !pet.owner || !target || target.hp <= 0 || !pet.isUndead) return;
        const owner = pet.owner;
        if (pet.unitId === 'skeleton_mage') {
            window.applyAgonyCurse(owner, target, 1, 8000, 0.15);
            window.applyCorruption(owner, target, 4000);
        }
    };

    window.onSpecterDeath = function onSpecterDeath(pet, g) {
        if (!pet || !pet.owner) return;
        const owner = pet.owner;
        const rad = 70;
        const dmg = Math.max(1, Math.floor(magicAtk(owner) * 0.8));
        const monsters = resolveMonsters(g);
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - pet.x, m.y - pet.y) > rad) return;
            m.takeDamage(dmg);
            window.applyAgonyCurse(owner, m, 2, 8000, 0.15);
        });
        floatText(g, pet.x, pet.y - 16, '幽灵自爆', '#6644aa');
    };

    window.settleDotDamage = function settleDotDamage(player, monster, seconds, mult) {
        if (!monster) return;
        const m = mult || 1;
        const stacks = window.getAgonyCurseStacks(monster);
        if (stacks > 0 && monster._agonyCurse) {
            const src = magicAtk(player);
            const dmg = Math.floor(src * (monster._agonyCurse.tickRatio || 0.15) * stacks * (seconds || 3) * m);
            monster.takeDamage(Math.max(1, dmg));
        }
        if (window.hasCorruption(monster)) {
            const src = magicAtk(player);
            monster.takeDamage(Math.max(1, Math.floor(src * 0.3 * (seconds || 3) * m)));
        }
    };

    window.triggerDarkHarvestStrike = function triggerDarkHarvestStrike(field, monsters, g) {
        const owner = field.owner;
        if (!owner || !isWarlock(owner)) return;
        const ec = field.entityConfig || {};
        const se = (field.skillDef && field.skillDef.skillEffect) || {};
        const shards = field._harvestShards || 0;
        if (shards <= 0) return;
        const perShard = ec.dotSettlePerShard || se.dotSettlePerShard || 2;
        let settleMult = 1;
        if (window.isSoulBurning(owner)) settleMult *= (se.harvestSoulBurnMult || 1.5);
        const linkBonus = (se.harvestBonusMult || 1.5);
        const rad = field.radius || 120;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - field.x, m.y - field.y) > rad) return;
            let mMult = settleMult;
            if (isSoulLinked(owner, m)) mMult *= linkBonus;
            window.settleDotDamage(owner, m, shards * perShard, mMult);
            window.applyAgonyCurse(owner, m, 1, 8000, 0.15);
            window.applyCorruption(owner, m, ec.corruptionMs || se.corruptionMs || 8000);
        });
        const minShards = ec.bonusExplosionMinShards || 5;
        if (shards >= minShards) {
            const bonusRad = rad * (ec.bonusExplosionRadiusMult || 0.5);
            const src = magicAtk(owner);
            const boom = Math.max(1, Math.floor(src * 1.2));
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0) return;
                if (Math.hypot(m.x - field.x, m.y - field.y) > bonusRad) return;
                m.takeDamage(boom);
                window.applyAgonyCurse(owner, m, 2, 8000, 0.15);
            });
        }
        floatText(g, field.x, field.y - 28, '暗黑丰收×' + shards, '#442266');
        if (typeof window.playWarlockHarvestStrikeVfx === 'function') {
            window.playWarlockHarvestStrikeVfx(g, field.x, field.y, rad);
        }
        if (shards >= minShards && typeof window.playWarlockHarvestBonusVfx === 'function') {
            window.playWarlockHarvestBonusVfx(g, field.x, field.y, bonusRad);
        }
    };

    window.castWarlockDarkHarvest = function castWarlockDarkHarvest(player, skillDef, g, monsters, now, castOptions) {
        const shards = player.classResource ? Math.floor(player.classResource.current) : 0;
        if (shards <= 0) {
            floatText(g, player.x, player.y, '无灵魂碎片', '#ff6666');
            return false;
        }
        if (player.classResource) player.classResource.current = 0;
        if (typeof window.updateWarlockSoulUI === 'function') window.updateWarlockSoulUI(player);

        const ec = skillDef.entityConfig || {};
        if (!g._skillEntities) {
            g._skillEntities = { projectiles: [], summons: [], fields: [], charges: [], pendingInstants: [] };
        }
        const st = g._skillEntities;
        let fx = player.x;
        let fy = player.y;
        if (castOptions && castOptions.groundPoint) {
            fx = castOptions.groundPoint.x;
            fy = castOptions.groundPoint.y;
        } else if (typeof window.pickBestAoeGroundPoint === 'function') {
            const pick = window.pickBestAoeGroundPoint(
                player, monsters, skillDef.range || 400, ec.fieldRadius || 120
            );
            fx = pick.x; fy = pick.y;
        }
        const delay = ec.delayMs || 400;
        st.fields.push({
            x: fx, y: fy,
            radius: ec.fieldRadius || skillDef.aoeRadius || 120,
            owner: player,
            skillDef,
            entityConfig: ec,
            color: ec.color || '#442266',
            expireTime: now + delay + (ec.fieldDurationMs || 600),
            strikeTime: now + delay,
            triggerType: 'delayed_strike',
            struck: false,
            _harvestShards: shards,
            damage: 0
        });
        if (typeof window.playWarlockHarvestDeployVfx === 'function') {
            window.playWarlockHarvestDeployVfx(g, fx, fy, ec.fieldRadius || 120, delay);
        }
        return true;
    };

    window.applySpreadingCurse = function applySpreadingCurse(player, skillDef, g, now, ctx) {
        const { target } = lockTargetFromCtx(ctx, player, skillDef, g);
        if (!target) return false;
        window.applyAgonyCurse(player, target, 1, 8000, 0.15);
        window.applyCorruption(player, target, 6000);
        target._spreadCurseOnDeath = {
            owner: player,
            radius: (skillDef.skillEffect && skillDef.skillEffect.spreadRadius) || 150,
            ratio: (skillDef.skillEffect && skillDef.skillEffect.spreadEffectRatio) || 0.5
        };
        floatText(g, target.x, target.y - 20, '传染诅咒', '#552288');
        if (typeof window.playWarlockSpreadingCurseVfx === 'function') {
            window.playWarlockSpreadingCurseVfx(player, target, g);
        }
        return true;
    };

    window.applySoulHarvest = function applySoulHarvest(player, skillDef, g, now, ctx) {
        const { target } = lockTargetFromCtx(ctx, player, skillDef, g);
        if (!target) return false;
        const se = skillDef.skillEffect || {};
        const resonanceBurst = isNecromancer(player)
            && window.getDeathResonanceStacks(player) >= DEATH_RESONANCE_MAX;
        const burstMult = resonanceBurst ? 1.5 : 1;
        let types = 0;
        const stacks = window.getAgonyCurseStacks(target);
        if (stacks > 0) {
            const effectiveStacks = stacks <= 15 ? stacks : 15 + (stacks - 15) * 0.3;
            const burst = Math.floor(magicAtk(player) * (se.agonyBurstMult || 1) * effectiveStacks * burstMult);
            target.takeDamage(Math.max(1, burst));
            target._agonyCurse = null;
            types++;
        }
        if (window.hasCorruption(target)) {
            const healPct = (se.corruptionHealPercent || 5) * burstMult;
            player.hp = Math.min(player.maxHp, player.hp + Math.floor(player.maxHp * healPct / 100));
            if (target.combatStatuses) delete target.combatStatuses.corruption;
            types++;
        }
        if (types > 0) window.grantSoulShards(player, types * (se.shardPerDotType || 1));
        if (resonanceBurst) {
            player._deathResonance = 0;
            floatText(g, target.x, target.y - 36, '死者共鸣 ×1.5!', '#ff88ff');
            if (typeof window.updateWarlockSoulUI === 'function') window.updateWarlockSoulUI(player);
        }
        floatText(g, target.x, target.y - 24, resonanceBurst ? '共鸣收割!' : '灵魂收割!', '#aa44ff');
        if (typeof window.playWarlockSoulHarvestVfx === 'function') {
            window.playWarlockSoulHarvestVfx(player, target, g, resonanceBurst);
        }
        return true;
    };

    window.onSpreadCurseDeath = function onSpreadCurseDeath(monster, g) {
        const sc = monster._spreadCurseOnDeath;
        if (!sc || !g) return;
        const owner = sc.owner;
        const monsters = resolveMonsters(g);
        let shardGrants = 0;
        (monsters || []).forEach(m => {
            if (!m || m === monster || m.hp <= 0) return;
            if (Math.hypot(m.x - monster.x, m.y - monster.y) > sc.radius) return;
            const hadCurse = window.getAgonyCurseStacks(m) > 0;
            window.applyAgonyCurse(owner, m, 1, 8000, 0.15 * sc.ratio);
            window.applyCorruption(owner, m, 6000 * sc.ratio);
            if (hadCurse && shardGrants < SPREAD_CURSE_SHARD_MAX) {
                window.grantSoulShards(owner, 1);
                shardGrants++;
            }
        });
        if (typeof window.playWarlockSpreadCurseDeathVfx === 'function') {
            window.playWarlockSpreadCurseDeathVfx(g, monster.x, monster.y, sc.radius);
        } else if (typeof g.addEquipmentEffect === 'function') {
            g.addEquipmentEffect('class_skill_vfx', monster.x, monster.y, {
                duration: 720,
                variant: 'warlock_curse_spread',
                radius: sc.radius,
                family: 'soul_shard_v2',
                color: '#8844cc'
            });
        }
        if (shardGrants > 0) {
            floatText(g, monster.x, monster.y - 36, '扩散回馈 +' + shardGrants, '#cc88ff');
        }
        floatText(g, monster.x, monster.y - 24, '诅咒扩散!', '#aa44ff');
    };

    window.onUndeadDeath = function onUndeadDeath(pet, g) {
        if (!pet || !pet.owner) return;
        if (isSkeletonWarrior(pet)) {
            window.onSkeletonWarriorDeath(pet, g);
            return;
        }
        if (pet.unitId === 'specter') {
            window.onSpecterDeath(pet, g);
        }
        if (classId(pet.owner) !== 'necromancer') return;
        const monsters = resolveMonsters(g);
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
        if (typeof window.tickLifeDrainChannel === 'function') {
            window.tickLifeDrainChannel(player, g, now);
        }
        if (isWarlock(player) && player._soulBurnUntil) {
            if (now >= player._soulBurnUntil) {
                player._soulBurnUntil = 0;
                if (player.classResource) player.classResource.current = 0;
                floatText(g, player.x, player.y - 28, '灵魂燃尽', '#8844aa');
                if (typeof window.updateWarlockSoulUI === 'function') window.updateWarlockSoulUI(player);
            } else if (player.classResource) {
                player.classResource.current = window.getSoulShardMax(player);
            }
        }
        (monsters || []).forEach(m => {
            if (m && m._agonyCurse) window.tickAgonyCurse(m, g, now);
            if (m && m._soulLinkMark && m._soulLinkMark.until <= now) {
                m._soulLinkMark = null;
                if (m._classSkillMark && m._classSkillMark.markId === 'soul_link') m._classSkillMark = null;
            }
        });
        if (isWarlockTree(player) && player.classResource) {
            player.classResource.max = window.getSoulShardMax(player);
        }
    };

    window.applyWarlockSkillPrimary = function applyWarlockSkillPrimary(player, skillDef, g, now, ctx) {
        const se = skillDef.skillEffect || {};
        switch (se.type) {
            case 'agony_curse': return window.applyAgonyCurseSkill(player, skillDef, g, now, ctx);
            case 'life_drain': return window.applyLifeDrain(player, skillDef, g, now, ctx);
            case 'soul_link': return window.applySoulLink(player, skillDef, g, now, ctx);
            case 'dark_harvest': return true;
            case 'spreading_curse': return window.applySpreadingCurse(player, skillDef, g, now, ctx);
            case 'soul_harvest': return window.applySoulHarvest(player, skillDef, g, now, ctx);
            default: return false;
        }
    };

    window.getUndeadPetDamageMult = function getUndeadPetDamageMult(pet, target) {
        if (!pet || !pet.isUndead || !target) return 1;
        let mult = 1;
        if (window.getAgonyCurseStacks(target) > 0) mult += 0.3;
        if (window.hasCorruption(target)) mult += 0.3;
        if (typeof window.getBoneDragonAuraMult === 'function') {
            mult *= window.getBoneDragonAuraMult(pet);
        }
        return mult;
    };

    window.getNetherGateAttackSpeedMult = function getNetherGateAttackSpeedMult(pet) {
        if (!pet || !pet._netherGateBuffUntil) return 1;
        if (Date.now() >= pet._netherGateBuffUntil) return 1;
        return 1 + (pet._netherGateAspd || 50) / 100;
    };

    window.tickNetherGateField = function tickNetherGateField(field, monsters, g, now) {
        const ec = field.entityConfig || {};
        if (!ec.netherGate || !field.owner) return;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - field.x, m.y - field.y) > field.radius) return;
            window.applyCorruption(field.owner, m, 1200);
            if (ec.corruptionPerTick) {
                window.applyAgonyCurse(field.owner, m, ec.corruptionPerTick, 8000, 0.15);
            }
        });
        const st = g && g._skillEntities && g._skillEntities.summons;
        if (st) {
            st.forEach(s => {
                if (!s || s.owner !== field.owner || !s.isUndead || s.hp <= 0) return;
                if (Math.hypot(s.x - field.x, s.y - field.y) > field.radius) return;
                s._netherGateBuffUntil = now + 800;
                s._netherGateAspd = ec.undeadBuffAsPercent || 50;
                s._netherGateInvincibleUntil = now + 800;
            });
        }
    };

    window.closeNetherGate = function closeNetherGate(field, monsters, g) {
        const ec = field.entityConfig || {};
        const owner = field.owner;
        const ratio = ec.closeDotSettleRatio || 2;
        if (!owner) return;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - field.x, m.y - field.y) > field.radius) return;
            window.settleDotDamage(owner, m, 3 * ratio);
        });
        floatText(g, field.x, field.y - 20, '冥界关门!', '#6622aa');
    };

    window.spendAllSoulShardsForLegion = function spendAllSoulShardsForLegion(player) {
        if (!player || !player.classResource) return 0;
        const maxSpend = 3;
        const available = Math.floor(player.classResource.current);
        const spent = Math.min(available, maxSpend);
        if (spent <= 0) return 0;
        player.classResource.current = available - spent;
        if (typeof window.updateWarlockSoulUI === 'function') window.updateWarlockSoulUI(player);
        return spent * 2;
    };

    const origOnPetAttackHit = window.onPetAttackHit;
    window.onPetAttackHit = function onPetAttackHitWrap(pet, target, gameInstance, now) {
        if (origOnPetAttackHit) origOnPetAttackHit(pet, target, gameInstance, now);
        if (isSkeletonWarrior(pet)) {
            window.onSkeletonWarriorAttack(pet, target, gameInstance, now);
        }
        if (pet && pet.isUndead && typeof window.onUndeadLegionAttack === 'function') {
            window.onUndeadLegionAttack(pet, target, gameInstance, now);
        }
        if (pet && pet.isUndead && typeof window.tryUndeadDotAttackShard === 'function') {
            window.tryUndeadDotAttackShard(pet, target, gameInstance);
        }
    };
})();
