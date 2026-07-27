/**
 * 区域环境特质 runtime：消费 battle.zoneTrait / zoneHazard
 */
(function () {
    'use strict';

    function living(list) {
        return (list || []).filter((u) => u && u.alive !== false && (u.hp == null || u.hp > 0));
    }

    function pickRandom(list) {
        if (!list || !list.length) return null;
        return list[Math.floor(Math.random() * list.length)];
    }

    function applyStaticMods(battle) {
        const trait = battle.zoneTrait;
        if (!trait || !trait.effect) return;
        const fx = trait.effect;
        if (fx.attackSpeedMult) battle.zoneAttackSpeedMult = fx.attackSpeedMult;
        if (fx.goldDropMult) battle.zoneGoldDropMult = fx.goldDropMult;
        if (fx.enemyAttackMult) battle.zoneEnemyAttackMult = fx.enemyAttackMult;
        if (fx.commanderRegenMult) battle.zoneCommanderRegenMult = fx.commanderRegenMult;
    }

    function markPhantoms(battle) {
        const trait = battle.zoneTrait;
        if (!trait || !trait.effect || !trait.effect.phantomCount) return;
        const enemies = living(battle.enemies);
        const count = Math.min(trait.effect.phantomCount, enemies.length);
        for (let i = 0; i < count; i++) {
            const e = enemies[i];
            if (!e) continue;
            e.isPhantom = true;
            e.phantomDecoy = true;
            e.attack = Math.max(1, Math.floor((e.attack || 1) * 0.15));
        }
    }

    function onBattleStart(battle) {
        if (!battle) return;
        battle.zonePoisonAcc = 0;
        battle.zoneLightningAcc = 0;
        battle.zoneSlipAcc = 0;
        applyStaticMods(battle);
        markPhantoms(battle);
        applySpeedToUnits(battle);
    }

    function applySpeedToUnits(battle) {
        if (!battle.zoneAttackSpeedMult) return;
        const m = battle.zoneAttackSpeedMult;
        living(battle.allies).concat(living(battle.enemies)).forEach((u) => {
            u.basicInterval = Math.max(200, Math.floor((u.basicInterval || 900) / m));
        });
    }

    function applyPoisonTick(battle, effect) {
        const all = living(battle.allies).concat(living(battle.enemies));
        if (!all.length) return;
        const victim = pickRandom(all);
        if (!victim) return;
        const dps = effect.poisonDpsPct || 0.02;
        const dur = effect.durationMs || 5000;
        victim.poisonUntil = (battle.elapsed || 0) + dur;
        victim.poisonDpsPct = dps;
        if (battle.zoneHazard && battle.zoneHazard.effect && battle.zoneHazard.effect.poisonStack &&
            victim.poisonStacks) {
            victim.poisonStacks += 1;
            victim.poisonDpsPct = dps * Math.min(3, victim.poisonStacks);
        } else if (battle.zoneHazard && battle.zoneHazard.effect && battle.zoneHazard.effect.poisonStack) {
            victim.poisonStacks = (victim.poisonStacks || 1) + 1;
            victim.poisonDpsPct = dps * Math.min(3, victim.poisonStacks);
        }
        if (battle.combatLog) {
            battle.combatLog.push({ t: battle.elapsed || 0, text: (victim.name || '单位') + ' 受到区域毒气' });
        }
    }

    function applyLightningTick(battle, effect) {
        const all = living(battle.allies).concat(living(battle.enemies));
        if (!all.length) return;
        const victim = pickRandom(all);
        const dmg = effect.damage || effect.lightningDamage || 100;
        if (!victim) return;
        victim.hp = Math.max(0, victim.hp - dmg);
        if (victim.hp <= 0) victim.alive = false;
        battle.lastLightningFlash = (battle.elapsed || 0) + 200;
        if (battle.combatLog) {
            battle.combatLog.push({ t: battle.elapsed || 0, text: '落雷击中 ' + (victim.name || '单位') + ' (-' + dmg + ')' });
        }
    }

    function applySlipTick(battle, hazard) {
        if (!hazard || !hazard.effect) return;
        const chance = hazard.effect.slipChance || 0.2;
        const stunMs = hazard.effect.stunMs || 500;
        if (Math.random() > chance) return;
        const allies = living(battle.allies);
        const victim = pickRandom(allies);
        if (!victim) return;
        victim.stunnedUntil = (battle.elapsed || 0) + stunMs;
        if (battle.combatLog) {
            battle.combatLog.push({ t: battle.elapsed || 0, text: (victim.name || '友方') + ' 在冰面滑倒' });
        }
    }

    function tickPoisonDots(battle, dtMs) {
        const all = living(battle.allies).concat(living(battle.enemies));
        all.forEach((u) => {
            if (!u.poisonUntil || (battle.elapsed || 0) >= u.poisonUntil) {
                u.poisonDpsPct = 0;
                return;
            }
            if (!u.poisonDpsPct) return;
            u.hp = Math.max(0, u.hp - Math.floor(u.maxHp * u.poisonDpsPct * dtMs / 1000));
            if (u.hp <= 0) u.alive = false;
        });
    }

    function tick(battle, dtMs) {
        if (!battle) return;
        tickPoisonDots(battle, dtMs);

        const trait = battle.zoneTrait;
        const hazard = battle.zoneHazard;
        const effect = trait && trait.effect;

        if (effect && effect.poisonIntervalMs) {
            battle.zonePoisonAcc = (battle.zonePoisonAcc || 0) + dtMs;
            if (battle.zonePoisonAcc >= effect.poisonIntervalMs) {
                battle.zonePoisonAcc = 0;
                applyPoisonTick(battle, effect);
            }
        }

        if (effect && effect.lightningIntervalMs) {
            battle.zoneLightningAcc = (battle.zoneLightningAcc || 0) + dtMs;
            if (battle.zoneLightningAcc >= effect.lightningIntervalMs) {
                battle.zoneLightningAcc = 0;
                applyLightningTick(battle, effect);
            }
        }

        if (hazard && hazard.effect && hazard.effect.slipChance) {
            battle.zoneSlipAcc = (battle.zoneSlipAcc || 0) + dtMs;
            if (battle.zoneSlipAcc >= 2500) {
                battle.zoneSlipAcc = 0;
                applySlipTick(battle, hazard);
            }
        }
    }

    function modifyZoneGoldReward(gold, battle) {
        if (!battle || !battle.zoneGoldDropMult || battle.zoneGoldDropMult === 1) return gold;
        return Math.floor(gold * battle.zoneGoldDropMult);
    }

    window.ZoneTraitRuntime = { onBattleStart, tick, applyStaticMods, modifyZoneGoldReward };
})();
