/**
 * Run 专属全局机制
 */
(function () {
    'use strict';

    function mechCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.RUN_MECHANICS_CONFIG) ||
            window.RUN_MECHANICS_CONFIG || {};
    }

    function allMechanics() {
        const c = mechCfg();
        return c.mechanics || c.RUN_MECHANICS_CONFIG?.mechanics || {};
    }

    function isEnabled() {
        return window.AscensionHub && window.AscensionHub.isEnabled('runMechanics');
    }

    function onRunStart(run, rng) {
        if (!isEnabled() || !run || !run.ascension) return;
        rng = rng || (window.RunStateSystem && window.RunStateSystem.rngFromRun
            ? window.RunStateSystem.rngFromRun(run) : Math.random);
        const keys = Object.keys(allMechanics());
        if (!keys.length) return;
        const id = keys[Math.floor(rng() * keys.length)];
        run.ascension.runMechanic = id;
        run.ascension.runMechanicLayerAcc = 0;
        if (id === 'element_tide') {
            run.ascension.tideElement = 'fire';
        }
    }

    function getDef(run) {
        if (!run || !run.ascension || !run.ascension.runMechanic) return null;
        return allMechanics()[run.ascension.runMechanic] || null;
    }

    function getDisplay(run) {
        const d = getDef(run);
        return d ? { id: d.id, name: d.name, desc: d.desc } : null;
    }

    function onLayerAdvanced(run, layer) {
        const d = getDef(run);
        if (!d || d.id !== 'element_tide') return;
        const cycle = d.cycleLayers || 5;
        if (layer > 0 && layer % cycle === 0) {
            const els = d.elements || ['fire', 'ice', 'lightning'];
            const idx = els.indexOf(run.ascension.tideElement || 'fire');
            run.ascension.tideElement = els[(idx + 1) % els.length];
        }
    }

    function onBattleStart(run, battle) {
        const d = getDef(run);
        if (!d || !battle) return;
        battle.runMechanicId = d.id;
        if (d.sharedHpPool) {
            const allies = battle.allies || [];
            let total = 0;
            allies.forEach((u) => { total += u.maxHp || u.hp || 0; });
            battle.sharedHpPool = total;
            battle.sharedHpMax = total;
        }
        if (d.skillNoCooldown) battle.skillHunger = true;
        if (d.enemyMirrorPct) battle.enemyMirrorPct = d.enemyMirrorPct;
    }

    function tickBattle(battle, dtMs) {
        const d = battle && battle.runMechanicId ? allMechanics()[battle.runMechanicId] : null;
        if (!d) return;
        if (d.timeStopIntervalMs) {
            battle.timeRiftAcc = (battle.timeRiftAcc || 0) + dtMs;
            if (battle.timeRiftAcc >= d.timeStopIntervalMs) {
                battle.timeRiftAcc = 0;
                battle.timeStopRemaining = Math.max(battle.timeStopRemaining || 0, d.timeStopDurationMs || 2000);
            }
        }
    }

    function modifyGoldReward(gold, run) {
        const d = getDef(run);
        if (d && d.noGoldDrops) return 0;
        return gold;
    }

    function hpCostPerSkillCast(run) {
        const d = getDef(run);
        if (d && d.hpCostPerCast) return d.hpCostPerCast;
        return 0;
    }

    function shopUsesHp(run) {
        const d = getDef(run);
        return !!(d && d.shopUsesHp);
    }

    function tideElement(run) {
        if (!run || !run.ascension) return null;
        return run.ascension.tideElement || null;
    }

    window.RunMechanicSystem = {
        allMechanics,
        isEnabled,
        onRunStart,
        onLayerAdvanced,
        onBattleStart,
        tickBattle,
        modifyGoldReward,
        hpCostPerSkillCast,
        shopUsesHp,
        tideElement,
        getDef,
        getDisplay
    };
})();
