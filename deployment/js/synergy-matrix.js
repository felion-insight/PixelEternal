/**
 * 遗物协同矩阵
 */
(function () {
    'use strict';

    function matrixCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.SYNERGY_MATRIX_CONFIG) ||
            window.SYNERGY_MATRIX_CONFIG || {};
    }

    function allSynergyDefs() {
        const cfg = matrixCfg();
        const out = {};
        Object.keys(cfg.binary || {}).forEach((k) => { out[k] = cfg.binary[k]; out[k].tier = 'binary'; });
        Object.keys(cfg.ternary || {}).forEach((k) => { out[k] = cfg.ternary[k]; out[k].tier = 'ternary'; });
        Object.keys(cfg.classSynergy || {}).forEach((k) => { out[k] = cfg.classSynergy[k]; out[k].tier = 'class'; });
        Object.keys(cfg.quaternary || {}).forEach((k) => { out[k] = cfg.quaternary[k]; out[k].tier = 'quaternary'; });
        return out;
    }

    function ownedSet(run) {
        return new Set(run && run.relics ? run.relics : []);
    }

    function classCounts(run) {
        const counts = {};
        (run && run.heroes || []).forEach((h) => {
            if ((h.hp || 0) <= 0 && h.hp != null) return;
            const c = h.baseClass || 'generic';
            counts[c] = (counts[c] || 0) + 1;
        });
        return counts;
    }

    function matches(def, owned, classes) {
        if (def.required) {
            return def.required.every((r) => owned.has(r));
        }
        if (def.requiredClasses) {
            return Object.keys(def.requiredClasses).every((cls) => (classes[cls] || 0) >= def.requiredClasses[cls]);
        }
        return false;
    }

    function refreshFromRun(run) {
        if (!run) return [];
        if (!run.ascension) run.ascension = window.AscensionHub.createDefaultRunAscension();
        const owned = ownedSet(run);
        const classes = classCounts(run);
        const active = [];
        const defs = allSynergyDefs();
        const maxActive = (window.AscensionHub && window.AscensionHub.flag('synergyMatrix').maxActiveSynergies) || 5;

        Object.keys(defs).forEach((id) => {
            if (matches(defs[id], owned, classes)) active.push(id);
        });

        const prev = new Set(run.ascension.synergies || []);
        run.ascension.synergies = active.slice(0, maxActive);

        active.forEach((id) => {
            if (!prev.has(id)) {
                const def = defs[id];
                if (run.battle && run.battle.juiceSystem && window.JuiceCore) {
                    window.JuiceCore.trigger(run.battle.juiceSystem, 'synergy_activate', def);
                }
                if (window.SynergyVfx) window.SynergyVfx.onSynergy(run.battle || {}, def && def.uiColor);
            }
        });
        return run.ascension.synergies;
    }

    function onRelicAcquired(run, relicId) {
        if (!window.AscensionHub || !window.AscensionHub.isEnabled('synergyMatrix')) return;
        refreshFromRun(run);
    }

    function applyCombatEffects(run, battle) {
        if (!run || !run.ascension) return;
        const defs = allSynergyDefs();
        battle.synergyFx = battle.synergyFx || {};
        (run.ascension.synergies || []).forEach((id) => {
            const def = defs[id];
            if (!def || !def.effect) return;
            const fx = def.effect;
            if (fx.goldMult) battle.synergyFx.goldMult = (battle.synergyFx.goldMult || 1) * fx.goldMult;
            if (fx.statMult) battle.synergyFx.statMult = (battle.synergyFx.statMult || 1) * fx.statMult;
            if (fx.commanderRegenMult) battle.synergyFx.commanderRegenMult = (battle.synergyFx.commanderRegenMult || 1) * fx.commanderRegenMult;
            if (fx.damageMult) battle.synergyFx.synergyDamageMult = fx.damageMult;
            if (fx.lifesteal) battle.synergyFx.lifesteal = fx.lifesteal;
            if (fx.crit_stun || fx.type === 'crit_stun') battle.synergyFx.critStunMs = fx.durationMs || 500;
            if (fx.type === 'combo_chain') {
                battle.synergyFx.extraAttackChance = Math.max(battle.synergyFx.extraAttackChance || 0, fx.extraAttackChance || 0.5);
                if (fx.infiniteCombo) battle.synergyFx.infiniteCombo = true;
            }
            if (fx.type === 'dot_synergy') {
                battle.synergyFx.dotMult = (battle.synergyFx.dotMult || 1) * (fx.dotMult || 1.5);
                if (fx.freezeOnPoison) battle.synergyFx.freezeOnPoison = true;
            }
            if (fx.type === 'chain_bonus') {
                battle.synergyFx.extraChainJumps = (battle.synergyFx.extraChainJumps || 0) + (fx.extraJumps || 0);
                if (fx.decayMult) battle.synergyFx.chainDecayMult = fx.decayMult;
            }
            if (fx.type === 'dodge_crit') {
                battle.relicFx = battle.relicFx || {};
                battle.relicFx.dodgeIgnoreArmor = !!fx.ignoreArmor;
                battle.relicFx.dodgeCritMult = fx.damageMult || 3;
            }
            if (fx.type === 'double_revive') {
                battle.relicFx = battle.relicFx || {};
                battle.relicFx.cheatDeath = battle.relicFx.cheatDeath || { hp: 1, perBattle: 1 };
                battle.relicFx.cheatDeath.perBattle = fx.maxTriggers || 2;
                if (fx.fullHealOnCheatDeath) battle.relicFx.fullHealOnCheatDeath = true;
            }
            if (fx.type === 'gold_splash') {
                battle.synergyFx.killGoldBonus = (battle.synergyFx.killGoldBonus || 0) + (fx.goldPerKillMult || 0.5);
            }
            if (fx.type === 'battle_start_buff') {
                battle.relicFx = battle.relicFx || {};
                battle.relicFx.battleStartBuff = {
                    attackMult: fx.attackMult || 1.25,
                    durationMs: fx.durationMs || 8000
                };
            }
            if (fx.type === 'thorn_tank' || fx.thornsPct) {
                battle.relicFx = battle.relicFx || {};
                battle.relicFx.maxHpMult = (battle.relicFx.maxHpMult || 1) * (fx.maxHpMult || 1.25);
                battle.relicFx.thornsPct = Math.max(battle.relicFx.thornsPct || 0, fx.thornsPct || 0.25);
            }
            if (fx.type === 'range_snipe') {
                battle.relicFx = battle.relicFx || {};
                battle.relicFx.skillRangeMult = (battle.relicFx.skillRangeMult || 1) * (fx.skillRangeMult || 1.3);
            }
            if (fx.type === 'low_hp_rampage') {
                battle.relicFx = battle.relicFx || {};
                battle.relicFx.lowHpAttackMult = {
                    threshold: fx.threshold || 0.3,
                    mult: fx.attackMult || 1.5
                };
                if (fx.lifesteal) battle.relicFx.lifesteal = fx.lifesteal;
            }
            if (fx.type === 'midas') {
                battle.synergyFx.midasStatueChance = Math.max(battle.synergyFx.midasStatueChance || 0, fx.statueChance || 0.05);
                battle.synergyFx.midasGoldMult = fx.goldMult || 10;
                if (fx.bossGoldBonus) battle.synergyFx.midasBossGoldBonus = fx.bossGoldBonus;
            }
            if (fx.type === 'revive_chain') {
                battle.relicFx = battle.relicFx || {};
                battle.relicFx.reviveChainPriority = fx.priority || ['phoenix', 'cheat_death'];
            }
            if (fx.type === 'revive_loop') {
                battle.relicFx = battle.relicFx || {};
                battle.relicFx.reviveLoopMax = fx.maxCycles || 3;
            }
            if (fx.type === 'thorns_crit') {
                battle.relicFx = battle.relicFx || {};
                battle.relicFx.thornsPct = Math.max(battle.relicFx.thornsPct || 0, fx.thornsPct || 0.5);
                battle.relicFx.thornsCanCrit = !!fx.thornsCanCrit;
            }
            if (fx.type === 'elemental_lord') {
                battle.relicFx = battle.relicFx || {};
                battle.relicFx.elementalLord = fx.elements || ['fire', 'ice', 'lightning'];
                battle.relicFx.elementalReactionMult = fx.reactionMult || 2;
            }
            if (fx.type === 'dodge_timestop') {
                battle.relicFx = battle.relicFx || {};
                battle.relicFx.dodgeTimestopMs = fx.timeStopMs || 1000;
                battle.relicFx.critInTimestop = fx.critInTimestop !== false;
            }
        });
    }

    function getActiveDisplay(run) {
        const defs = allSynergyDefs();
        return (run && run.ascension && run.ascension.synergies || []).map((id) => {
            const d = defs[id];
            return d ? { id: id, name: d.name, description: d.description, color: d.uiColor } : { id: id };
        });
    }

    window.SynergyMatrix = {
        allSynergyDefs,
        refreshFromRun,
        onRelicAcquired,
        applyCombatEffects,
        getActiveDisplay,
        matches
    };
})();
