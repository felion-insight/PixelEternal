/**
 * 诅咒遗物与腐化系统
 */
(function () {
    'use strict';

    function curseCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.CURSE_CONFIG) ||
            window.CURSE_CONFIG || {};
    }

    function cursedRelics() {
        return curseCfg().cursedRelics || {};
    }

    function isCursedRelic(id) {
        return !!cursedRelics()[id];
    }

    function onRunStart(run) {
        if (!run || !run.ascension) return;
        run.ascension.corruption = run.ascension.corruption || 0;
        run.ascension.cursedRelicIds = run.ascension.cursedRelicIds || [];
    }

    function onRelicAcquired(run, relicId) {
        if (!window.AscensionHub || !window.AscensionHub.isEnabled('curseSystem')) return;
        const def = cursedRelics()[relicId];
        if (!def) return;
        if (run.ascension.cursedRelicIds.indexOf(relicId) < 0) {
            run.ascension.cursedRelicIds.push(relicId);
        }
        const pos = def.positive || (def.effects && def.effects.positive) || {};
        if (pos.startLegendaryRelics && window.RelicSystem && window.RunStateSystem) {
            const rng = window.RunStateSystem.rngFromRun(run);
            for (let i = 0; i < pos.startLegendaryRelics; i++) {
                const picks = window.RelicSystem.pickRelicChoices(rng, 1, run.relics, 'curse', run);
                const leg = (picks || []).find((r) => r.rarity === 'legendary') || (picks && picks[0]);
                if (leg && leg.id) window.RunStateSystem.addRelic(run, leg.id);
            }
        }
    }

    function addCorruption(run, amount) {
        if (!run || !run.ascension) return;
        const hub = window.AscensionHub;
        if (hub && !hub.flag('curseSystem').corruptionEnabled) return;
        run.ascension.corruption = Math.max(0, (run.ascension.corruption || 0) + amount);
        checkThresholds(run);
    }

    function checkThresholds(run) {
        const thresholds = curseCfg().corruptionThresholds || [];
        run.ascension.triggeredCorruptionThresholds = run.ascension.triggeredCorruptionThresholds || [];
        const triggered = new Set(run.ascension.triggeredCorruptionThresholds);
        thresholds.forEach((t) => {
            if (run.ascension.corruption >= t.at && !triggered.has(t.at)) {
                triggered.add(t.at);
                run.ascension.triggeredCorruptionThresholds.push(t.at);
                if (t.effect && t.effect.corruptionBoss) {
                    run.ascension.pendingCorruptionBoss = true;
                }
            }
        });
    }

    function getCorruptionEffects(run) {
        const thresholds = curseCfg().corruptionThresholds || [];
        const fx = { enemyAttackMult: 1, shopPriceMult: 1, restHealMult: 1, randomElite: false };
        const c = run && run.ascension ? run.ascension.corruption || 0 : 0;
        thresholds.forEach((t) => {
            if (c >= t.at && t.effect) {
                if (t.effect.enemyAttackMult) fx.enemyAttackMult *= t.effect.enemyAttackMult;
                if (t.effect.shopPriceMult) fx.shopPriceMult *= t.effect.shopPriceMult;
                if (t.effect.restHealMult) fx.restHealMult *= t.effect.restHealMult;
                if (t.effect.randomElite) fx.randomElite = true;
            }
        });
        return fx;
    }

    function buildBattleModifiers(run) {
        const out = { relicBoost: {}, disableBasicAttack: false, combatTimeLimitMs: null };
        let effectMult = 1;
        (run.ascension.cursedRelicIds || []).forEach((rid) => {
            const def = cursedRelics()[rid];
            if (!def) return;
            const pos = def.positive || (def.effects && def.effects.positive) || {};
            const neg = def.negative || (def.effects && def.effects.negative) || {};
            if (pos.effectMult) effectMult *= pos.effectMult;
            if (neg.effectMult) effectMult *= neg.effectMult;
        });
        (run.ascension.cursedRelicIds || []).forEach((rid) => {
            const def = cursedRelics()[rid];
            if (!def) return;
            const pos = def.positive || (def.effects && def.effects.positive) || {};
            const neg = def.negative || (def.effects && def.effects.negative) || {};
            const em = effectMult;
            if (pos.defenseMult) out.relicBoost.defenseMult = (out.relicBoost.defenseMult || 1) * Math.pow(pos.defenseMult, em);
            if (pos.critChance) out.relicBoost.critChance = (out.relicBoost.critChance || 0) + pos.critChance * em;
            if (pos.skillDamageMult) out.relicBoost.skillDamageMult = (out.relicBoost.skillDamageMult || 1) * Math.pow(pos.skillDamageMult, em);
            if (pos.attackSpeedMult) out.relicBoost.basicIntervalMult = (out.relicBoost.basicIntervalMult || 1) / Math.pow(pos.attackSpeedMult, em);
            if (pos.randomStatBoost) out._randomStatBoost = pos.randomStatBoost * em;
            if (neg.randomStatPenalty) out._randomStatPenalty = neg.randomStatPenalty * em;
            if (neg.disableBasicAttack) out.disableBasicAttack = true;
            if (neg.combatTimeLimitReduceMs) {
                out.combatTimeLimitMs = (out.combatTimeLimitMs || 120000) - neg.combatTimeLimitReduceMs * em;
            }
            if (neg.type === 'combat_time_limit') out.combatTimeLimitMs = neg.value;
            if (neg.critTakenMult) out.critTakenMult = Math.pow(neg.critTakenMult, em);
            if (neg.hpPerRelicPenalty && run.relics) {
                out.hpPerRelicPenalty = (out.hpPerRelicPenalty || 0) + run.relics.length * neg.hpPerRelicPenalty * em;
            }
        });
        return out;
    }

    function onBattleStart(run, battle) {
        if (!run || !battle) return;
        const fx = getCorruptionEffects(run);
        battle.corruptionFx = fx;
        if (fx.randomElite && Math.random() < 0.25 && window.AutoBattleSimulator) {
            window.AutoBattleSimulator.spawnTraitEnemy(battle, 'ab_elite', 2, 1, 1.2);
        }
        const mods = buildBattleModifiers(run);
        battle.curseBattleFx = mods;
        if (mods.combatTimeLimitMs) {
            battle.combat = battle.combat || {};
            battle.combat.maxDurationMs = mods.combatTimeLimitMs;
        }
        if (mods._randomStatBoost && battle.allies) {
            const stats = ['attack', 'defense', 'maxHp'];
            const pick = stats[Math.floor(Math.random() * stats.length)];
            battle.allies.forEach((u) => {
                if (pick === 'maxHp') { u.maxHp = Math.floor(u.maxHp * (1 + mods._randomStatBoost)); u.hp = u.maxHp; }
                else u[pick] = Math.floor((u[pick] || 10) * (1 + mods._randomStatBoost));
            });
        }
        if (mods._randomStatPenalty && battle.allies) {
            const stats = ['attack', 'defense', 'maxHp'];
            const pick = stats[Math.floor(Math.random() * stats.length)];
            battle.allies.forEach((u) => {
                if (pick === 'maxHp') {
                    u.maxHp = Math.max(1, Math.floor(u.maxHp * (1 - mods._randomStatPenalty)));
                    u.hp = Math.min(u.hp, u.maxHp);
                } else u[pick] = Math.max(1, Math.floor((u[pick] || 10) * (1 - mods._randomStatPenalty)));
            });
        }
        if (mods.hpPerRelicPenalty && battle.allies) {
            battle.allies.forEach((u) => {
                u.maxHp = Math.max(1, Math.floor(u.maxHp * (1 - mods.hpPerRelicPenalty)));
                u.hp = Math.min(u.hp, u.maxHp);
            });
        }
        const src = curseCfg().corruptionSources || {};
        if ((run.ascension.cursedRelicIds || []).length) {
            addCorruption(run, src.curse_relic_per_battle || 5);
        }
    }

    function onCombatEnd(run, battle, victory) {
        if (!run) return;
        (run.ascension.cursedRelicIds || []).forEach((rid) => {
            const def = cursedRelics()[rid];
            if (!def || !def.negative) return;
            const neg = def.negative;
            const loss = neg.value != null ? neg.value : neg.permanentHpLoss;
            const trigger = neg.trigger || neg.type;
            if ((trigger === 'permanent_hp_loss' || trigger === 'after_battle') && loss && victory) {
                const heroes = run.heroes.filter((h) => (h.hp || 0) > 0);
                if (heroes.length) {
                    const victim = heroes[Math.floor(Math.random() * heroes.length)];
                    victim.maxHp = Math.max(1, Math.floor(victim.maxHp * (1 - loss)));
                    victim.hp = Math.min(victim.hp, victim.maxHp);
                }
            }
        });
    }

    function purify(run, amount, costGold) {
        const p = curseCfg().purify || {};
        const cost = costGold != null ? costGold : (p.restCostGold || 50);
        const amt = amount != null ? amount : (p.restAmount || 20);
        if (!run || run.gold < cost) return false;
        run.gold -= cost;
        run.ascension.corruption = Math.max(0, (run.ascension.corruption || 0) - amt);
        return true;
    }

    window.CurseSystem = {
        curseCfg,
        cursedRelics,
        isCursedRelic,
        buildBattleModifiers,
        onRunStart,
        onRelicAcquired,
        addCorruption,
        getCorruptionEffects,
        onBattleStart,
        onCombatEnd,
        purify,
        checkThresholds
    };
})();
