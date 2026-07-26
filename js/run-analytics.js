/**
 * 单局数据分析
 */
(function () {
    'use strict';

    function create(run) {
        return {
            startMs: Date.now(),
            battles: 0,
            victories: 0,
            totalDamageDealt: 0,
            totalDamageTaken: 0,
            kills: 0,
            commandsUsed: {},
            synergiesTriggered: [],
            maxCombo: 0,
            fatalBattle: null,
            layersReached: 0
        };
    }

    function onBattleStart(analytics, battle, node) {
        if (!analytics) return;
        analytics.battles += 1;
        analytics.currentBattle = {
            nodeType: node && node.type,
            layer: node && node.layer,
            startMs: Date.now()
        };
    }

    function recordDamage(analytics, attacker, target, dmg, meta) {
        if (!analytics) return;
        if (attacker && attacker.side === 'ally') analytics.totalDamageDealt += dmg;
        if (target && target.side === 'ally') analytics.totalDamageTaken += dmg;
    }

    function recordKill(analytics, attacker, target) {
        if (!analytics) return;
        if (attacker && attacker.side === 'ally') analytics.kills += 1;
    }

    function recordCommand(analytics, abilityId) {
        if (!analytics) return;
        analytics.commandsUsed[abilityId] = (analytics.commandsUsed[abilityId] || 0) + 1;
    }

    function recordSynergy(analytics, synergyId) {
        if (!analytics) return;
        if (analytics.synergiesTriggered.indexOf(synergyId) < 0) {
            analytics.synergiesTriggered.push(synergyId);
        }
    }

    function onCombatEnd(analytics, battle, victory) {
        if (!analytics) return;
        if (victory) analytics.victories += 1;
        else if (analytics.currentBattle) {
            analytics.fatalBattle = Object.assign({}, analytics.currentBattle, {
                endMs: Date.now(),
                metrics: battle && window.AutoBattleSimulator
                    ? window.AutoBattleSimulator.summarizeBattleMetrics(battle)
                    : null
            });
        }
        analytics.currentBattle = null;
    }

    function finalize(analytics, run) {
        if (!analytics) return null;
        analytics.layersReached = run && run.path ? run.path.length : 0;
        analytics.durationMs = Date.now() - analytics.startMs;
        return analytics;
    }

    window.RunAnalytics = {
        create,
        onBattleStart,
        recordDamage,
        recordKill,
        recordCommand,
        recordSynergy,
        onCombatEnd,
        finalize
    };
})();
