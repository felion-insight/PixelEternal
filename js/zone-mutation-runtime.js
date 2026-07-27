/**
 * 区域 mutation 运行时：禁疗、双倍金币、精英密集、强制诅咒、战前换位等
 */
(function () {
    'use strict';

    function mutationCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.ZONE_MUTATIONS_CONFIG) ||
            window.ZONE_MUTATIONS_CONFIG || {};
    }

    function allMutations() {
        const c = mutationCfg();
        return c.mutations || c.ZONE_MUTATIONS_CONFIG?.mutations || {};
    }

    function isEnabled() {
        return window.AscensionHub && window.AscensionHub.isEnabled('runZoneRandomizer');
    }

    function resolveDef(run, zoneId) {
        if (!run || !run.ascension) return null;
        const zid = zoneId || run.ascension.zoneId;
        if (!zid) return null;
        let mutId = run.ascension.zoneMutations && run.ascension.zoneMutations[zid];
        if (!mutId && window.RunZoneGenerator) {
            const m = window.RunZoneGenerator.getZoneMutation(run, zid);
            mutId = m && m.id;
        }
        if (!mutId) return null;
        return allMutations()[mutId] || { id: mutId, name: mutId };
    }

    function onZoneEnter(run, zoneId) {
        if (!isEnabled() || !run || !run.ascension) return;
        const def = resolveDef(run, zoneId);
        run.ascension.activeZoneMutation = def ? def.id : null;
        if (!def) return;
        if (def.forceCurseOnEnter && window.CurseSystem && window.CurseSystem.addCorruption) {
            window.CurseSystem.addCorruption(run, def.curseAmount != null ? def.curseAmount : 15);
        }
    }

    function canRestHeal(run) {
        if (!isEnabled() || !run) return true;
        const def = resolveDef(run);
        return !(def && def.noRestHeal);
    }

    function modifyNodeWeights(weights, run) {
        if (!isEnabled() || !run || !weights) return weights;
        const def = resolveDef(run);
        if (!def) return weights;
        const out = Object.assign({}, weights);
        if (def.eliteWeightMult) out.elite = (out.elite || 0) * def.eliteWeightMult;
        if (def.eventWeightMult) out.event = (out.event || 0) * def.eventWeightMult;
        return out;
    }

    function modifyEnemyScale(scale, run) {
        if (!isEnabled() || !run) return scale;
        const def = resolveDef(run);
        if (def && def.enemyPowerMult) return scale * def.enemyPowerMult;
        return scale;
    }

    function modifyGoldReward(gold, run) {
        if (!isEnabled() || !run) return gold;
        const def = resolveDef(run);
        if (def && def.goldMult) return Math.floor(gold * def.goldMult);
        return gold;
    }

    function preBattleSwap(battle) {
        if (!battle || !battle.allies || battle.allies.length < 2) return;
        const allies = battle.allies.filter((u) => u.alive !== false);
        if (allies.length < 2) return;
        const a = allies[Math.floor(Math.random() * allies.length)];
        let b = allies[Math.floor(Math.random() * allies.length)];
        while (b === a) b = allies[Math.floor(Math.random() * allies.length)];
        const tc = a.boardCol != null ? a.boardCol : a.col;
        const tr = a.boardRow != null ? a.boardRow : a.row;
        a.boardCol = b.boardCol != null ? b.boardCol : b.col;
        a.boardRow = b.boardRow != null ? b.boardRow : b.row;
        a.col = a.boardCol;
        a.row = a.boardRow;
        b.boardCol = tc;
        b.boardRow = tr;
        b.col = tc;
        b.row = tr;
        if (window.AutoBattleSimulator && window.AutoBattleSimulator.reanchorBattle) {
            window.AutoBattleSimulator.reanchorBattle(
                battle, battle._canvasW || 1280, battle._canvasH || 720
            );
        }
        battle.zoneMutationSwap = true;
    }

    function onBattleStart(battle, run) {
        if (!isEnabled() || !battle || !run) return;
        const def = resolveDef(run);
        if (def && def.preBattleSwap) preBattleSwap(battle);
        if (def && def.goldMult) battle.zoneMutationGoldMult = def.goldMult;
    }

    function getDisplay(run) {
        const def = resolveDef(run);
        return def ? { id: def.id, name: def.name || def.id } : null;
    }

    window.ZoneMutationRuntime = {
        isEnabled,
        resolveDef,
        onZoneEnter,
        canRestHeal,
        modifyNodeWeights,
        modifyEnemyScale,
        modifyGoldReward,
        onBattleStart,
        getDisplay
    };
})();
